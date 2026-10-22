import { db } from '@/lib/dexie/db'
import { getLocalProgressMap, getQuestionIdsForChapters } from '@/lib/dexie/cache'
import type { LocalQuestionProgress, QuestionFilter, SourceStatus } from '@/types'

export function effectiveStatus(
  sourceStatus: SourceStatus | null | undefined,
  progress: LocalQuestionProgress | undefined,
): SourceStatus {
  if (progress) return progress.lastStatus // latest OpenLearn attempt wins
  return sourceStatus ?? 'unknown'
}

export interface SelectArgs {
  chapterIds: string[]
  filter: QuestionFilter
  userId: string | null
  deviceId: string
  /** Scope ids used to find marked answers. Defaults to `chapterIds`. */
  markedScopeIds?: string[]
  limit?: number
  shuffle?: boolean
}

export interface SelectionResult {
  ids: string[]
  counts: {
    all: number
    correct: number
    incorrect: number
    skipped: number
    unknown: number
    unseen: number
  }
}

export async function selectQuestions(args: SelectArgs): Promise<SelectionResult> {
  const { chapterIds, filter, userId, deviceId, limit, shuffle } = args
  const counts = { all: 0, correct: 0, incorrect: 0, skipped: 0, unknown: 0, unseen: 0 }
  if (chapterIds.length === 0) return { ids: [], counts }

  const rows = await getQuestionIdsForChapters(chapterIds)
  const progress = await getLocalProgressMap(userId, deviceId)

  const withStatus = rows.map((row) => {
    const p = progress.get(row.id)
    return {
      id: row.id,
      hasProgress: p !== undefined,
      status: effectiveStatus(row.sourceStatus, p),
    }
  })

  for (const row of withStatus) {
    counts.all++
    counts[row.status]++
    if (!row.hasProgress && row.status === 'unknown') counts.unseen++
  }

  let ids: string[]
  if (filter === 'marked') {
    const scopeIds = args.markedScopeIds ?? chapterIds
    const sessions = await db.sessions.where('scopeId').anyOf(scopeIds).toArray()
    const answers = sessions.length > 0
      ? await db.answers.where('sessionId').anyOf(sessions.map((s) => s.id)).toArray()
      : []
    const marked = new Set(answers.filter((a) => a.isMarked).map((a) => a.questionId))
    ids = withStatus.filter((row) => marked.has(row.id)).map((row) => row.id)
  } else if (filter === 'all') {
    ids = withStatus.map((row) => row.id)
  } else if (filter === 'unseen') {
    ids = withStatus.filter((row) => !row.hasProgress && row.status === 'unknown').map((row) => row.id)
  } else {
    ids = withStatus.filter((row) => row.status === filter).map((row) => row.id)
  }

  if (shuffle) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
  }

  if (limit != null && limit >= 0) ids = ids.slice(0, limit)

  return { ids, counts }
}
