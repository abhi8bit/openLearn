import { db } from './db'
import { fetchFullChapter, fetchQuestionIdsByChapters, recordQuestionProgress } from '@/lib/supabase/queries'
import { createClient } from '@/lib/supabase/client'
import type {
  Exam,
  Book,
  Chapter,
  ChapterData,
  ChapterStats,
  LocalSession,
  LocalAnswer,
  LocalSavedQuestion,
  LocalQuestionProgress,
  LocalQuestionProgressEvent,
  ProgressStatus,
  SourceStatus,
} from '@/types'

// ── Image Cache ──

// localStorage key marking a storage prefix as fully image-cached, so we can
// skip the network `.list()` on subsequent chapter opens (the common path).
const IMAGES_DONE_PREFIX = 'images_cached:'

function imagesCachedKey(storagePrefix: string): string {
  return `${IMAGES_DONE_PREFIX}${storagePrefix}`
}

/**
 * List all images in a chapter's storage folder and cache them in Dexie.
 * Uses the storage prefix to list the folder — no text scanning needed.
 *
 * Skips the network `.list()` entirely once a prefix has been fully cached
 * (tracked in localStorage). Pass `force` to bypass the gate (e.g. after a
 * content_version bump invalidated the chapter).
 */
export async function cacheChapterImages(
  storagePrefix: string,
  force = false,
): Promise<void> {
  if (!force && typeof window !== 'undefined') {
    try {
      if (localStorage.getItem(imagesCachedKey(storagePrefix))) return
    } catch {
      // localStorage unavailable — fall through and list.
    }
  }

  const supabase = createClient()

  // List all files in the chapter's image folder
  const { data: files, error } = await supabase.storage
    .from('book-images')
    .list(storagePrefix, { limit: 1000 })
  if (error || !files || files.length === 0) return

  // Filter to actual files (skip folders) and check which are already cached
  const imageFiles = files.filter((f) => f.name && !f.id?.endsWith('/'))
  const cacheKeys = imageFiles.map((f) => `${storagePrefix}/${f.name}`)
  const cached = await db.imageCache.bulkGet(cacheKeys)

  const uncached: typeof imageFiles = []
  for (let i = 0; i < imageFiles.length; i++) {
    if (!cached[i]) uncached.push(imageFiles[i])
  }
  if (uncached.length === 0) {
    markImagesCached(storagePrefix)
    return
  }

  // Download in batches of 5
  const BATCH = 5
  for (let i = 0; i < uncached.length; i += BATCH) {
    const chunk = uncached.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      chunk.map(async (file) => {
        const filePath = `${storagePrefix}/${file.name}`
        const { data } = supabase.storage
          .from('book-images')
          .getPublicUrl(filePath)
        const res = await fetch(data.publicUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        return { id: filePath, storagePrefix, blob, fetchedAt: Date.now() }
      }),
    )
    const entries = results
      .filter((r): r is PromiseFulfilledResult<{ id: string; storagePrefix: string; blob: Blob; fetchedAt: number }> => r.status === 'fulfilled')
      .map((r) => r.value)
    if (entries.length > 0) {
      await db.imageCache.bulkPut(entries)
    }
  }

  // Everything that could be fetched now lives in Dexie — mark the prefix done
  // so future opens skip the `.list()` round-trip.
  markImagesCached(storagePrefix)
}

function markImagesCached(storagePrefix: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(imagesCachedKey(storagePrefix), '1')
  } catch {
    // Non-fatal — we just lose the optimization for this prefix.
  }
}

// ── Storage Prefix Resolution ──

/**
 * Resolve the Supabase Storage prefix for a chapter.
 * Uses the `storage_prefix` column if set, otherwise derives it
 * from book slug + chapter slug: `books/${bookSlug}/${chapterSlug}`.
 */
export async function getStoragePrefix(chapterId: string): Promise<string | null> {
  const chapter = await db.chapters.get(chapterId)
  if (!chapter) return null
  if (chapter.storage_prefix) return chapter.storage_prefix
  // Fallback: derive from book slug + chapter slug
  const book = await db.books.get(chapter.book_id)
  if (book?.slug && chapter.slug) {
    return `books/${book.slug}/${chapter.slug}`
  }
  return null
}

// ── Chapter Content Cache ──

export async function getCachedOrFetchChapter(chapterId: string): Promise<ChapterData> {
  const cached = await db.chapterData.get(chapterId)
  const meta = await db.chapters.get(chapterId)

  if (cached && cached.contentVersion === (meta?.content_version ?? null)) {
    // Still ensure images are cached (handles upgrades from before image caching existed)
    const prefix = await getStoragePrefix(chapterId)
    if (prefix) {
      cacheChapterImages(prefix).catch(console.error)
    }
    return cached
  }

  const fresh = await fetchFullChapter(chapterId)
  const chapterData: ChapterData = {
    chapterId,
    concepts: fresh.concepts,
    questions: fresh.questions,
    contentVersion: meta?.content_version ?? null,
    cachedAt: Date.now(),
  }
  await db.chapterData.put(chapterData)

  // Cache images in the background — don't block chapter data return.
  // Force a fresh `.list()`: this is the content-changed path, so new or
  // renamed images may exist that the cached-prefix gate would skip.
  const prefix = await getStoragePrefix(chapterId)
  if (prefix) {
    cacheChapterImages(prefix, true).catch(console.error)
  }

  return chapterData
}

interface QuestionIdResult {
  id: string
  chapterId: string
  sourceStatus: SourceStatus | null
}

export async function getQuestionIdsForChapters(
  chapterIds: string[]
): Promise<QuestionIdResult[]> {
  if (chapterIds.length === 0) return []

  const chapterMetas = await db.chapters.bulkGet(chapterIds)
  const chapterMetaMap = new Map(
    chapterMetas.filter((c): c is Chapter => c !== undefined).map((c) => [c.id, c])
  )
  const uncachedChapterIds: string[] = []
  const results: QuestionIdResult[] = []

  for (const chapterId of chapterIds) {
    const cached = await db.chapterData.get(chapterId)
    const meta = chapterMetaMap.get(chapterId)
    if (cached && cached.contentVersion === (meta?.content_version ?? null)) {
      for (const q of cached.questions) {
        results.push({ id: q.id, chapterId, sourceStatus: q.source_status ?? null })
      }
    } else {
      uncachedChapterIds.push(chapterId)
    }
  }

  if (uncachedChapterIds.length > 0) {
    const fetched = await fetchQuestionIdsByChapters(uncachedChapterIds)
    for (const row of fetched) {
      results.push({ id: row.id, chapterId: row.chapter_id, sourceStatus: row.source_status ?? null })
    }
  }

  return results
}

// ── Question Progress (right/wrong tracking) ──

export async function getLocalProgressMap(
  userId: string | null,
  deviceId: string,
): Promise<Map<string, LocalQuestionProgress>> {
  const rows = await db.questionProgress.toArray()
  const map = new Map<string, LocalQuestionProgress>()
  for (const r of rows) {
    const mine = userId ? r.userId === userId : r.userId === null && r.deviceId === deviceId
    if (mine) map.set(r.questionId, r)
  }
  return map
}

/**
 * Record the outcomes of a completed session: Dexie first, then a
 * fire-and-forget RPC when logged in. Idempotent per (session, question) both
 * locally (event ledger) and server-side, so re-submitting is a no-op.
 */
export async function recordSessionOutcomes(args: {
  sessionId: string
  userId: string | null
  deviceId: string
  questions: Array<{ id: string }>
  answers: Record<string, LocalAnswer>
}): Promise<void> {
  const { sessionId, userId, deviceId, questions, answers } = args
  const ids = questions.map((q) => q.id)
  if (ids.length === 0) return

  const now = Date.now()
  let puts: LocalQuestionProgress[] = []
  const rpcRows: Array<{ question_id: string; status: ProgressStatus; device_id: string }> = []

  // One atomic read-modify-write so concurrent submissions (double-click,
  // retry) cannot both observe an empty event ledger and double-count.
  await db.transaction('rw', db.questionProgress, db.questionProgressEvents, async () => {
    const existing = await db.questionProgress.bulkGet(ids.map((qid) => `${userId ?? deviceId}:${qid}`))
    const byId = new Map(existing.filter((r) => r !== undefined).map((r) => [r!.questionId, r!]))
    const eventIds = ids.map((qid) => `${sessionId}:${qid}`)
    const events = await db.questionProgressEvents.bulkGet(eventIds)
    const alreadyRecorded = new Set(events.filter((e) => e !== undefined).map((e) => e!.questionId))
    const newEvents: LocalQuestionProgressEvent[] = []
    const updated: LocalQuestionProgress[] = []

    for (const qid of ids) {
      // Re-submitting the same session must not double-count locally either.
      if (alreadyRecorded.has(qid)) continue
      const a = answers[qid]
      const status: ProgressStatus =
        a?.selectedOption != null ? (a.isCorrect ? 'correct' : 'incorrect') : 'skipped'
      const prev = byId.get(qid)
      const row: LocalQuestionProgress = {
        id: `${userId ?? deviceId}:${qid}`,
        userId,
        deviceId,
        sessionId,
        questionId: qid,
        attempts: (prev?.attempts ?? 0) + 1,
        correctCount: (prev?.correctCount ?? 0) + (status === 'correct' ? 1 : 0),
        incorrectCount: (prev?.incorrectCount ?? 0) + (status === 'incorrect' ? 1 : 0),
        skippedCount: (prev?.skippedCount ?? 0) + (status === 'skipped' ? 1 : 0),
        lastStatus: status,
        lastSeenAt: now,
        syncedAt: userId ? null : now,
      }
      updated.push(row)
      newEvents.push({
        id: `${sessionId}:${qid}`,
        sessionId,
        questionId: qid,
        status,
        createdAt: now,
      })
      rpcRows.push({ question_id: qid, status, device_id: deviceId })
    }

    if (newEvents.length > 0) {
      await db.questionProgressEvents.bulkPut(newEvents)
      await db.questionProgress.bulkPut(updated)
    }
    puts = updated
  })

  if (puts.length === 0) return

  if (userId) {
    recordQuestionProgress(sessionId, rpcRows)
      .then(() => db.questionProgress.bulkPut(puts.map((r) => ({ ...r, syncedAt: Date.now() }))))
      .catch((e) => console.error('[progress] push failed:', e))
  }
}

export interface ChapterStatus {
  chapterId: string
  isCached: boolean
  stats: ChapterStats
}

export async function getChaptersStatus(chapterIds: string[]): Promise<Map<string, ChapterStatus>> {
  const result = new Map<string, ChapterStatus>()

  const cachedEntries = await db.chapterData.bulkGet(chapterIds)
  const allSessions = await db.sessions.toArray()
  const allAnswers = await db.answers.toArray()

  for (let i = 0; i < chapterIds.length; i++) {
    const chapterId = chapterIds[i]
    const isCached = cachedEntries[i] !== undefined

    const chapterSessions = allSessions.filter(
      (s) => s.scopeId === chapterId
    )

    const practiceSession = chapterSessions.find(
      (s) => s.sessionType === 'practice'
    )
    const mockSessions = chapterSessions.filter(
      (s) => s.sessionType === 'mock' && !s.isActive
    )

    const sessionIds = chapterSessions.map((s) => s.id)
    const questionsAttempted = allAnswers.filter(
      (a) => sessionIds.includes(a.sessionId) && a.selectedOption !== null
    ).length

    const totalPracticeTimeSecs = practiceSession?.timeElapsedSecs ?? 0
    const totalMockTimeSecs = mockSessions.reduce((sum, s) => sum + (s.timeElapsedSecs ?? 0), 0)

    result.set(chapterId, {
      chapterId,
      isCached,
      stats: {
        practiceSessions: practiceSession ? 1 : 0,
        mockSessions: mockSessions.length,
        questionsAttempted,
        totalPracticeTimeSecs,
        totalMockTimeSecs,
        practiceSessionId: practiceSession?.id,
      },
    })
  }

  return result
}

export async function getPracticeSession(chapterId: string): Promise<LocalSession | undefined> {
  const matches = await db.sessions
    .where('[scopeId+sessionType]')
    .equals([chapterId, 'practice'])
    .toArray()
  return matches.sort((a, b) => b.startedAt - a.startedAt)[0]
}

export async function getPreviousPracticeSessions(
  scopeId: string,
  excludeSessionId?: string,
  limit = 10
): Promise<Pick<LocalSession, 'id' | 'startedAt' | 'timeElapsedSecs' | 'questionIds' | 'completedAt' | 'answeredCount' | 'correctCount'>[]> {
  const matches = await db.sessions
    .where('[scopeId+sessionType]')
    .equals([scopeId, 'practice'])
    .toArray()

  const sessions = matches.filter((s) => s.id !== excludeSessionId)

  return sessions
    .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      timeElapsedSecs: s.timeElapsedSecs,
      questionIds: s.questionIds,
      completedAt: s.completedAt ?? null,
      answeredCount: s.answeredCount ?? null,
      correctCount: s.correctCount ?? null,
    }))
}

// ── Catalog Cache ──

export async function cacheExams(exams: Exam[]): Promise<void> {
  await db.exams.bulkPut(exams)
}

export async function cacheBooks(books: Book[]): Promise<void> {
  await db.books.bulkPut(books)
}

export async function cacheChapters(chapters: Chapter[]): Promise<void> {
  await db.chapters.bulkPut(chapters)
}

export async function getCachedExams(): Promise<Exam[]> {
  const exams = await db.exams.toArray()
  return exams.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
}

export async function getCachedBooks(examId: string): Promise<Book[]> {
  const books = await db.books.where('exam_id').equals(examId).toArray()
  return books.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
}

export async function getCachedChapters(bookId: string): Promise<Chapter[]> {
  const chapters = await db.chapters.where('book_id').equals(bookId).toArray()
  return chapters.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
}

// ── Session Persistence ──

export async function saveSession(session: LocalSession): Promise<void> {
  await db.sessions.put(session)
}

export async function getSession(sessionId: string): Promise<LocalSession | undefined> {
  return db.sessions.get(sessionId)
}

export async function getActiveSession(): Promise<LocalSession | undefined> {
  const sessions = await db.sessions.toArray()
  // `isActive` alone is the resumable predicate: it's flipped to false on mock
  // submit (markSessionInactive) and on practice completion (handleComplete),
  // and stays true while a session is in progress or paused. Do NOT also filter
  // on `!isSubmitted` — practice sessions are created with isSubmitted: true, so
  // that clause would wrongly hide every in-progress practice session.
  return sessions
    .filter((s) => s.isActive === true)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
}

export async function markSessionInactive(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, { isActive: false, syncedAt: null })
}

export async function saveAnswer(answer: LocalAnswer): Promise<void> {
  await db.answers.put(answer)
}

export async function getAnswersForSession(sessionId: string): Promise<LocalAnswer[]> {
  return db.answers.where('sessionId').equals(sessionId).toArray()
}

export async function getAnswer(sessionId: string, questionId: string): Promise<LocalAnswer | undefined> {
  return db.answers.where('[sessionId+questionId]').equals([sessionId, questionId]).first()
}

// ── Saved Questions Persistence ──

export async function saveQuestion(record: LocalSavedQuestion): Promise<void> {
  await db.savedQuestions.put(record)
}

export async function removeSavedQuestion(questionId: string): Promise<void> {
  await db.savedQuestions.where('questionId').equals(questionId).delete()
}

export async function getSavedQuestionIds(): Promise<string[]> {
  const records = await db.savedQuestions.toArray()
  return records.map((r) => r.questionId)
}

export async function isQuestionSaved(questionId: string): Promise<boolean> {
  const count = await db.savedQuestions.where('questionId').equals(questionId).count()
  return count > 0
}

// ── Progress & Stats ──

export interface BookProgress {
  percent: number
  totalQuestions: number
  attempted: number
  chapterCount: number
}

export async function getBookProgress(bookId: string): Promise<BookProgress> {
  // Counts come straight from the denormalized columns on the book row.
  const book = await db.books.get(bookId)
  const totalQuestions = book?.total_questions ?? 0
  const chapterCount = book?.total_chapters ?? 0

  // Attempted count is genuine user progress — still derived from local sessions.
  const chapters = await db.chapters.toArray()
  const bookChapters = chapters.filter((c) => c.book_id === bookId)

  let attempted = 0
  if (bookChapters.length > 0) {
    const statusMap = await getChaptersStatus(bookChapters.map((c) => c.id))
    for (const status of statusMap.values()) {
      attempted += status.stats.questionsAttempted
    }
  }

  return {
    percent: totalQuestions > 0 ? Math.round((attempted / totalQuestions) * 100) : 0,
    totalQuestions,
    attempted,
    chapterCount,
  }
}

export interface ExamProgress {
  percent: number
  totalQuestions: number
  attempted: number
  bookCount: number
  chapterCount: number
}

export async function getExamProgress(examId: string): Promise<ExamProgress> {
  // Counts come straight from the denormalized columns on the exam row.
  const exam = await db.exams.get(examId)
  const totalQuestions = exam?.total_questions ?? 0
  const bookCount = exam?.total_books ?? 0
  const chapterCount = exam?.total_chapters ?? 0

  // Attempted count is genuine user progress — sum it across the exam's books.
  const books = await db.books.toArray()
  const examBooks = books.filter((b) => b.exam_id === examId)

  let attempted = 0
  for (const book of examBooks) {
    const bp = await getBookProgress(book.id)
    attempted += bp.attempted
  }

  return {
    percent: totalQuestions > 0 ? Math.round((attempted / totalQuestions) * 100) : 0,
    totalQuestions,
    attempted,
    bookCount,
    chapterCount,
  }
}

/**
 * Compute progress for every exam in a single pass.
 *
 * The per-exam helpers each re-scan `sessions` + `answers` and are called in a
 * loop by the home screen — O(exams × books) full scans. This loads sessions,
 * answers, chapters, and books ONCE, builds the chapter→book→exam mapping and
 * an attempted-count-per-chapter index, then aggregates. Home calls this once.
 */
export async function getAllExamProgress(): Promise<Record<string, ExamProgress>> {
  const [exams, books, chapters, sessions, answers] = await Promise.all([
    db.exams.toArray(),
    db.books.toArray(),
    db.chapters.toArray(),
    db.sessions.toArray(),
    db.answers.toArray(),
  ])

  // sessionId → scopeId (chapter), for attributing answers to a chapter.
  const sessionScope = new Map<string, string | null>()
  for (const s of sessions) sessionScope.set(s.id, s.scopeId)

  // chapterId → attempted answer count (selectedOption !== null).
  const attemptedByChapter = new Map<string, number>()
  for (const a of answers) {
    if (a.selectedOption === null) continue
    const scopeId = sessionScope.get(a.sessionId)
    if (!scopeId) continue
    attemptedByChapter.set(scopeId, (attemptedByChapter.get(scopeId) ?? 0) + 1)
  }

  // chapter → book, book → exam.
  const bookToExam = new Map<string, string>()
  for (const b of books) bookToExam.set(b.id, b.exam_id)

  // examId → attempted total, summed across its chapters.
  const attemptedByExam = new Map<string, number>()
  for (const c of chapters) {
    const attempted = attemptedByChapter.get(c.id)
    if (!attempted) continue
    const examId = bookToExam.get(c.book_id)
    if (!examId) continue
    attemptedByExam.set(examId, (attemptedByExam.get(examId) ?? 0) + attempted)
  }

  const result: Record<string, ExamProgress> = {}
  for (const exam of exams) {
    const totalQuestions = exam.total_questions ?? 0
    const attempted = attemptedByExam.get(exam.id) ?? 0
    result[exam.id] = {
      percent: totalQuestions > 0 ? Math.round((attempted / totalQuestions) * 100) : 0,
      totalQuestions,
      attempted,
      bookCount: exam.total_books ?? 0,
      chapterCount: exam.total_chapters ?? 0,
    }
  }
  return result
}

export interface OverallStats {
  totalSessions: number
  practiceSessions: number
  mockSessions: number
  totalAttempted: number
  totalCorrect: number
  totalTimeSecs: number
}

// ── Delete Chapter Cache ──

export async function deleteChapterCache(chapterId: string): Promise<void> {
  // Delete cached images for this chapter
  const prefix = await getStoragePrefix(chapterId)
  if (prefix) {
    await db.imageCache.where('storagePrefix').equals(prefix).delete()
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(imagesCachedKey(prefix))
      } catch {
        // Non-fatal.
      }
    }
  }

  // Grab chapterData before deleting (needed for saved questions cleanup)
  const chapterData = await db.chapterData.get(chapterId)

  // Delete chapter data (concepts + questions)
  await db.chapterData.delete(chapterId)

  // Find and delete related sessions and their answers
  const sessions = await db.sessions.where('scopeId').equals(chapterId).toArray()
  for (const s of sessions) {
    await db.answers.where('sessionId').equals(s.id).delete()
    await db.sessions.delete(s.id)
  }

  // Delete saved questions belonging to this chapter's questions
  if (chapterData) {
    const questionIds = chapterData.questions.map((q) => q.id)
    await db.savedQuestions.where('questionId').anyOf(questionIds).delete()
  }
}

export async function deleteAllChaptersCache(chapterIds: string[]): Promise<void> {
  for (const id of chapterIds) {
    await deleteChapterCache(id)
  }
}

// ── Overall Stats ──

export async function getOverallStats(): Promise<OverallStats> {
  const sessions = await db.sessions.toArray()
  const answers = await db.answers.toArray()

  const practiceSessions = sessions.filter((s) => s.sessionType === 'practice').length
  const mockSessions = sessions.filter((s) => s.sessionType === 'mock').length

  const totalAttempted = answers.filter((a) => a.selectedOption !== null).length
  const totalCorrect = answers.filter((a) => a.isCorrect === true).length
  const totalTimeSecs = sessions.reduce((sum, s) => sum + (s.timeElapsedSecs ?? 0), 0)

  return {
    totalSessions: sessions.length,
    practiceSessions,
    mockSessions,
    totalAttempted,
    totalCorrect,
    totalTimeSecs,
  }
}
