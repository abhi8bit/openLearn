import { createClient } from '@/lib/supabase/client'
import { getDeviceId } from '@/lib/device'
import { db } from '@/lib/dexie/db'
import {
  syncSession,
  syncAnswers,
  syncSavedQuestion,
  fetchUserSessions,
  fetchSessionAnswers,
  fetchSavedQuestions,
  fetchQuestionProgress,
  recordQuestionProgress,
} from '@/lib/supabase/queries'
import { rowToLocalSession, rowToLocalAnswer, rowToLocalSaved, rowToLocalProgress } from '@/lib/supabase/mappers'

let listenerSetup = false

/** Resolve the currently logged-in user id, or null for guests. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getUser()
  return data.user?.id ?? null
}

export function setupAuthListener(): void {
  if (typeof window === 'undefined') return
  if (listenerSetup) return
  listenerSetup = true

  const supabase = createClient()

  // Run the full sync flow on explicit sign-in…
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await runSyncFlow(session.user.id)
    }
  })

  // …and once on boot if a session already exists (returning logged-in user).
  currentUserId()
    .then((userId) => {
      if (userId) return runSyncFlow(userId)
    })
    .catch((e) => console.error('[sync] boot sync failed:', e))
}

/**
 * Full login sync: migrate guest rows → push all pending → pull remote.
 * Each step is isolated so one failure never blocks the rest.
 */
async function runSyncFlow(userId: string): Promise<void> {
  try {
    await migrateGuestData(userId)
  } catch (e) {
    console.error('[sync] migrateGuestData failed:', e)
  }
  try {
    await syncPendingSessions(userId)
  } catch (e) {
    console.error('[sync] syncPendingSessions failed:', e)
  }
  try {
    await syncPendingAnswers(userId)
  } catch (e) {
    console.error('[sync] syncPendingAnswers failed:', e)
  }
  try {
    await syncPendingSaved(userId)
  } catch (e) {
    console.error('[sync] syncPendingSaved failed:', e)
  }
  try {
    await syncPendingProgress(userId)
  } catch (e) {
    console.error('[sync] syncPendingProgress failed:', e)
  }
  try {
    await pullUserData(userId)
  } catch (e) {
    console.error('[sync] pullUserData failed:', e)
  }
  try {
    await pullQuestionProgress(userId)
  } catch (e) {
    console.error('[sync] pullQuestionProgress failed:', e)
  }
}

/**
 * Claim guest Dexie rows for the now-logged-in user by stamping `userId` and
 * clearing `syncedAt` so the pending-push steps upload them (upsert by `id` is
 * the real migration — no Supabase-side UPDATE-by-device_id needed).
 */
async function migrateGuestData(userId: string): Promise<void> {
  const deviceId = getDeviceId()
  if (!deviceId) return

  const guestSessions = await db.sessions
    .filter((s) => s.deviceId === deviceId && s.userId === null)
    .toArray()

  for (const session of guestSessions) {
    await db.sessions.update(session.id, { userId, syncedAt: null })
  }

  const sessionIds = guestSessions.map((s) => s.id)
  if (sessionIds.length > 0) {
    const guestAnswers = await db.answers
      .where('sessionId')
      .anyOf(sessionIds)
      .toArray()
    for (const answer of guestAnswers) {
      await db.answers.update(answer.id, { syncedAt: null })
    }
  }

  const guestSaved = await db.savedQuestions
    .filter((r) => r.deviceId === deviceId && r.userId === null)
    .toArray()
  for (const record of guestSaved) {
    await db.savedQuestions.update(record.id, { userId, syncedAt: null })
  }

  // Claim guest progress rows. Re-key because the id embeds the owner;
  // leaving the device-keyed id would create a duplicate row on the next write.
  const guestProgress = await db.questionProgress
    .filter((r) => r.deviceId === deviceId && r.userId === null)
    .toArray()
  for (const row of guestProgress) {
    const nextId = `${userId}:${row.questionId}`
    if (nextId !== row.id) await db.questionProgress.delete(row.id)
    await db.questionProgress.put({ ...row, id: nextId, userId, syncedAt: null })
  }
}

export async function syncPendingProgress(userId: string): Promise<void> {
  const unsynced = await db.questionProgress
    .filter((r) => r.userId === userId && r.syncedAt === null)
    .toArray()
  const bySession = new Map<string, typeof unsynced>()
  for (const r of unsynced) {
    if (!r.sessionId) continue // nothing to anchor the idempotency key to
    const list = bySession.get(r.sessionId) ?? []
    list.push(r)
    bySession.set(r.sessionId, list)
  }
  for (const [sessionId, rows] of bySession) {
    await recordQuestionProgress(
      sessionId,
      rows.map((r) => ({
        question_id: r.questionId,
        status: r.lastStatus,
        device_id: r.deviceId,
      })),
    )
    await db.questionProgress.bulkPut(
      rows.map((r) => ({ ...r, syncedAt: Date.now() })),
    )
  }
}

/**
 * Pull remote progress into Dexie. A local row with `syncedAt === null` has
 * un-pushed changes and wins; everything else takes the remote copy.
 */
export async function pullQuestionProgress(userId: string): Promise<void> {
  const remote = await fetchQuestionProgress(userId)
  if (remote.length === 0) return
  const now = Date.now()
  const local = await db.questionProgress.bulkGet(remote.map((r) => `${r.user_id}:${r.question_id}`))
  const localById = new Map(
    local.filter((r) => r !== undefined).map((r) => [r!.id, r!]),
  )
  const toPut = remote
    .filter((r) => {
      const existing = localById.get(`${r.user_id}:${r.question_id}`)
      return !existing || existing.syncedAt !== null
    })
    .map((r) => rowToLocalProgress(r, now))
  if (toPut.length > 0) {
    await db.questionProgress.bulkPut(toPut)
  }
}

export async function syncPendingSessions(userId: string): Promise<void> {
  const unsynced = await db.sessions
    .filter((s) => s.userId === userId && s.syncedAt === null)
    .toArray()

  for (const session of unsynced) {
    await syncSession(session, userId)
    await db.sessions.update(session.id, { syncedAt: Date.now() })
  }
}

export async function syncPendingAnswers(userId: string): Promise<void> {
  const userSessions = await db.sessions
    .filter((s) => s.userId === userId)
    .toArray()
  const sessionIds = new Set(userSessions.map((s) => s.id))
  if (sessionIds.size === 0) return

  const unsyncedAnswers = await db.answers
    .filter((a) => sessionIds.has(a.sessionId) && a.syncedAt === null)
    .toArray()

  if (unsyncedAnswers.length > 0) {
    await syncAnswers(unsyncedAnswers)
    for (const answer of unsyncedAnswers) {
      await db.answers.update(answer.id, { syncedAt: Date.now() })
    }
  }
}

export async function syncPendingSaved(userId: string): Promise<void> {
  const deviceId = getDeviceId()
  const unsynced = await db.savedQuestions
    .filter((r) => r.userId === userId && r.syncedAt === null)
    .toArray()

  for (const record of unsynced) {
    await syncSavedQuestion(record.questionId, userId, deviceId)
    await db.savedQuestions.update(record.id, { syncedAt: Date.now() })
  }
}

/**
 * Pull remote user data into Dexie. Conflict rule: a local row with
 * `syncedAt === null` has un-pushed changes and is never overwritten by a
 * pull; everything else takes the remote copy.
 */
export async function pullUserData(userId: string): Promise<void> {
  const now = Date.now()

  // 1. Sessions
  const remoteSessions = await fetchUserSessions(userId)
  const localSessions = await db.sessions.bulkGet(remoteSessions.map((r) => r.id))
  const localSessionById = new Map(
    localSessions.filter((s) => s !== undefined).map((s) => [s!.id, s!])
  )
  const sessionsToPut = remoteSessions
    .filter((r) => {
      const local = localSessionById.get(r.id)
      return !local || local.syncedAt !== null
    })
    .map((r) => rowToLocalSession(r, now))
  if (sessionsToPut.length > 0) {
    await db.sessions.bulkPut(sessionsToPut)
  }

  // 2. Answers for the remote sessions
  const remoteAnswers = await fetchSessionAnswers(remoteSessions.map((r) => r.id))
  if (remoteAnswers.length > 0) {
    const localAnswers = await db.answers.bulkGet(remoteAnswers.map((r) => r.id))
    const localAnswerById = new Map(
      localAnswers.filter((a) => a !== undefined).map((a) => [a!.id, a!])
    )
    const answersToPut = remoteAnswers
      .filter((r) => {
        const local = localAnswerById.get(r.id)
        return !local || local.syncedAt !== null
      })
      .map((r) => rowToLocalAnswer(r, now))
    if (answersToPut.length > 0) {
      await db.answers.bulkPut(answersToPut)
    }
  }

  // 3. Saved questions — merge by questionId (avoid duplicate rows per question)
  const remoteSaved = await fetchSavedQuestions(userId)
  if (remoteSaved.length > 0) {
    const localSaved = await db.savedQuestions.toArray()
    const localByQuestion = new Map(localSaved.map((s) => [s.questionId, s]))
    const savedToPut: ReturnType<typeof rowToLocalSaved>[] = []
    for (const r of remoteSaved) {
      const local = localByQuestion.get(r.question_id)
      // Local unsynced record wins; otherwise adopt the remote row.
      if (local && local.syncedAt === null) continue
      savedToPut.push(rowToLocalSaved({ ...r, id: local?.id ?? r.id }, now))
    }
    if (savedToPut.length > 0) {
      await db.savedQuestions.bulkPut(savedToPut)
    }
  }
}
