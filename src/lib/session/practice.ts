import { fetchQuestionsByIds } from '@/lib/supabase/queries'
import type { QuestionFilter, Scope, SessionStore } from '@/types'

export async function startMistakesPractice(args: {
  scope: Scope
  examId: string
  bookId: string | null
  chapterId: string | null
  ids: string[]
  filter: QuestionFilter
  filters?: QuestionFilter[]
  router: { push: (href: string) => void }
  initSession: SessionStore['initSession']
}): Promise<void> {
  const questions = await fetchQuestionsByIds(args.ids)
  const sessionId = crypto.randomUUID()
  await args.initSession(sessionId, {
    scope: args.scope,
    sessionType: 'practice',
    examId: args.examId,
    bookId: args.bookId,
    chapterId: args.chapterId,
    questionIds: args.ids,
    shuffle: false,
    settings: {
      questionCount: args.ids.length,
      timeLimitMinutes: null,
      shuffle: false,
      sectionalTiming: false,
      filter: args.filter,
      filters: args.filters,
      kind: 'mistakes',
    },
  }, {
    chapterId: args.chapterId ?? '',
    concepts: [],
    questions,
    contentVersion: null,
    cachedAt: Date.now(),
  })
  args.router.push(`/session/${sessionId}`)
}
