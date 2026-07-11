import type { SessionConfig, ChapterData, LocalSession } from '@/types'
import { getDeviceId } from '@/lib/device'

interface BuildSessionResult {
  sessionId: string
  session: LocalSession
  data: ChapterData
}

export async function buildSession(
  config: SessionConfig,
  data: ChapterData
): Promise<BuildSessionResult> {
  const sessionId = crypto.randomUUID()
  const deviceId = getDeviceId()

  const questionIds = config.questionIds ?? data.questions.map((q) => q.id)
  const timeLimitSecs = config.timeLimitMinutes ? config.timeLimitMinutes * 60 : null

  const scopeId =
    config.scope === 'chapter' ? (config.chapterId ?? null) :
    config.scope === 'book' ? (config.bookId ?? null) :
    config.examId

  const session: LocalSession = {
    id: sessionId,
    userId: null,
    deviceId,
    scope: config.scope,
    scopeId,
    sessionType: config.sessionType,
    questionIds,
    currentIndex: 0,
    isActive: true,
    isSubmitted: false,
    startedAt: Date.now(),
    submittedAt: null,
    timeElapsedSecs: 0,
    timeLimitSecs,
    settings: null,
    syncedAt: null,
    completedAt: null,
    answeredCount: null,
    correctCount: null,
  }

  return { sessionId, session, data }
}
