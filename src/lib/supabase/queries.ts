import { createClient } from './client'
import type { Exam, Book, Chapter, Concept, QuestionRow, Option, Solution, LocalSession, LocalAnswer, UserSessionRow, SessionAnswerRow, SavedQuestionRow, ProblemReportInsert } from '@/types'

// ── Catalog Queries ──

export async function fetchAllExams(): Promise<Exam[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('exams')
    .select('*')
    // No is_active filter: inactive exams flow through to render as
    // "Coming soon" in ExamCard. Books/chapters stay active-only below.
    .order('display_order')
  if (error) throw error
  return data ?? []
}

export async function fetchBooksByExam(examId: string): Promise<Book[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('exam_id', examId)
    .eq('is_active', true)
    .order('display_order')
  if (error) throw error
  return data ?? []
}

export async function fetchChaptersByBook(bookId: string): Promise<Chapter[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('book_id', bookId)
    .eq('is_active', true)
    .order('display_order')
  if (error) throw error
  return data ?? []
}

// ── Catalog Revalidation (stale-while-revalidate) ──

export interface TableSignature {
  maxUpdatedAt: string | null
  count: number
}

export interface CatalogSignature {
  exams: TableSignature
  books: TableSignature
  chapters: TableSignature
}

async function fetchTableSignature(
  table: 'exams' | 'books' | 'chapters'
): Promise<TableSignature> {
  const supabase = createClient()
  let query = supabase
    .from(table)
    .select('updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(1)
  // Exams include inactive ("coming soon") rows so the signature count matches
  // fetchAllExams; books/chapters stay active-only.
  if (table !== 'exams') query = query.eq('is_active', true)
  const { data, error, count } = await query
  if (error) throw error
  return {
    maxUpdatedAt: (data?.[0] as { updated_at: string | null } | undefined)?.updated_at ?? null,
    count: count ?? 0,
  }
}

/**
 * One tiny probe per catalog table: latest change timestamp + exact row count.
 * No row bodies fetched — used to decide whether a full refetch is needed.
 */
export async function fetchCatalogSignature(): Promise<CatalogSignature> {
  const [exams, books, chapters] = await Promise.all([
    fetchTableSignature('exams'),
    fetchTableSignature('books'),
    fetchTableSignature('chapters'),
  ])
  return { exams, books, chapters }
}

export async function fetchAllBooks(): Promise<Book[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
  if (error) throw error
  return data ?? []
}

export async function fetchAllChapters(): Promise<Chapter[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
  if (error) throw error
  return data ?? []
}

// ── Chapter Content Query ──

export interface RawChapterData {
  concepts: Concept[]
  questions: (QuestionRow & { options: Option[]; solution: Solution | null })[]
}

export async function fetchFullChapter(chapterId: string): Promise<RawChapterData> {
  const supabase = createClient()

  const conceptsRes = await supabase
    .from('chapter_concepts')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('display_order')

  if (conceptsRes.error) throw conceptsRes.error

  const questionsRes = await supabase
    .from('questions')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('question_number')

  if (questionsRes.error) throw questionsRes.error

  const questions: QuestionRow[] = questionsRes.data ?? []
  if (questions.length === 0) {
    return { concepts: (conceptsRes.data ?? []) as Concept[], questions: [] }
  }

  const questionIds = questions.map((q) => q.id)

  // Batch the options query to avoid URL length limits (max ~50 UUIDs per request)
  const BATCH_SIZE = 50
  const optionsBatches: Option[][] = []
  for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
    const batch = questionIds.slice(i, i + BATCH_SIZE)
    const res = await supabase
      .from('question_options')
      .select('*')
      .in('question_id', batch)
      .order('display_order')
    if (res.error) throw res.error
    optionsBatches.push((res.data ?? []) as Option[])
  }
  const allOptions = optionsBatches.flat()

  const solutionsBatches: Solution[][] = []
  for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
    const batch = questionIds.slice(i, i + BATCH_SIZE)
    const res = await supabase
      .from('question_solutions')
      .select('*')
      .in('question_id', batch)
    if (res.error) throw res.error
    solutionsBatches.push((res.data ?? []) as Solution[])
  }
  const allSolutions = solutionsBatches.flat()

  const optionsByQuestion = new Map<string, Option[]>()
  for (const opt of allOptions) {
    const list = optionsByQuestion.get(opt.question_id)
    if (list) list.push(opt)
    else optionsByQuestion.set(opt.question_id, [opt])
  }

  const solutionByQuestion = new Map<string, Solution>()
  for (const sol of allSolutions) {
    solutionByQuestion.set(sol.question_id, sol)
  }

  const enrichedQuestions = questions.map((q) => ({
    ...q,
    options: optionsByQuestion.get(q.id) ?? [],
    solution: solutionByQuestion.get(q.id) ?? null,
  }))

  return { concepts: (conceptsRes.data ?? []) as Concept[], questions: enrichedQuestions }
}

// ── Cross-Chapter Question Selection (book/exam level mocks) ──

export interface QuestionIdResult {
  id: string
  chapter_id: string
}

export async function fetchQuestionIdsByChapters(
  chapterIds: string[]
): Promise<QuestionIdResult[]> {
  if (chapterIds.length === 0) return []
  const supabase = createClient()

  const BATCH_SIZE = 50
  const batches: QuestionIdResult[][] = []
  for (let i = 0; i < chapterIds.length; i += BATCH_SIZE) {
    const batch = chapterIds.slice(i, i + BATCH_SIZE)
    const res = await supabase
      .from('questions')
      .select('id, chapter_id')
      .in('chapter_id', batch)
      .order('question_number')
    if (res.error) throw res.error
    batches.push((res.data ?? []) as QuestionIdResult[])
  }
  return batches.flat()
}

export async function fetchQuestionsByIds(
  questionIds: string[]
): Promise<(QuestionRow & { options: Option[]; solution: Solution | null })[]> {
  if (questionIds.length === 0) return []
  const supabase = createClient()

  const BATCH_SIZE = 50
  const questionBatches: QuestionRow[][] = []
  for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
    const batch = questionIds.slice(i, i + BATCH_SIZE)
    const res = await supabase
      .from('questions')
      .select('*')
      .in('id', batch)
    if (res.error) throw res.error
    questionBatches.push((res.data ?? []) as QuestionRow[])
  }
  const allQuestions = questionBatches.flat()

  const optionsBatches: Option[][] = []
  for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
    const batch = questionIds.slice(i, i + BATCH_SIZE)
    const res = await supabase
      .from('question_options')
      .select('*')
      .in('question_id', batch)
      .order('display_order')
    if (res.error) throw res.error
    optionsBatches.push((res.data ?? []) as Option[])
  }
  const allOptions = optionsBatches.flat()

  const solutionsBatches: Solution[][] = []
  for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
    const batch = questionIds.slice(i, i + BATCH_SIZE)
    const res = await supabase
      .from('question_solutions')
      .select('*')
      .in('question_id', batch)
    if (res.error) throw res.error
    solutionsBatches.push((res.data ?? []) as Solution[])
  }
  const allSolutions = solutionsBatches.flat()

  const optionsByQuestion = new Map<string, Option[]>()
  for (const opt of allOptions) {
    const list = optionsByQuestion.get(opt.question_id)
    if (list) list.push(opt)
    else optionsByQuestion.set(opt.question_id, [opt])
  }

  const solutionByQuestion = new Map<string, Solution>()
  for (const sol of allSolutions) {
    solutionByQuestion.set(sol.question_id, sol)
  }

  return allQuestions.map((q) => ({
    ...q,
    options: optionsByQuestion.get(q.id) ?? [],
    solution: solutionByQuestion.get(q.id) ?? null,
  }))
}

// ── Session Sync ──

export async function syncSession(session: LocalSession, userId: string | null): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('user_sessions').upsert({
    id: session.id,
    user_id: userId,
    device_id: session.deviceId,
    scope: session.scope,
    scope_id: session.scopeId,
    session_type: session.sessionType,
    question_ids: session.questionIds,
    current_index: session.currentIndex,
    is_active: session.isActive,
    is_submitted: session.isSubmitted,
    started_at: new Date(session.startedAt).toISOString(),
    submitted_at: session.submittedAt ? new Date(session.submittedAt).toISOString() : null,
    time_elapsed_secs: session.timeElapsedSecs,
    time_limit_secs: session.timeLimitSecs,
    settings: session.settings,
    completed_at: session.completedAt ? new Date(session.completedAt).toISOString() : null,
    answered_count: session.answeredCount,
    correct_count: session.correctCount,
    current_section_index: session.currentSectionIndex ?? null,
    section_time_elapsed_secs: session.sectionTimeElapsedSecs ?? null,
  } as never)
  if (error) console.error('syncSession failed:', error)
}

export async function syncAnswers(answers: LocalAnswer[]): Promise<void> {
  if (answers.length === 0) return
  const supabase = createClient()
  const rows = answers.map((a) => ({
    id: a.id,
    session_id: a.sessionId,
    question_id: a.questionId,
    selected_option: a.selectedOption,
    is_correct: a.isCorrect,
    is_marked: a.isMarked,
    time_spent_secs: a.timeSpentSecs,
  }))
  const { error } = await supabase.from('session_answers').upsert(rows as never)
  if (error) console.error('syncAnswers failed:', error)
}

export async function syncSavedQuestion(
  questionId: string,
  userId: string | null,
  deviceId: string | null
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('saved_questions').upsert(
    {
      question_id: questionId,
      user_id: userId,
      device_id: deviceId,
      saved_at: new Date().toISOString(),
    } as never,
    { onConflict: 'user_id,question_id' }
  )
  if (error) console.error('syncSavedQuestion failed:', error)
}

export async function unsyncSavedQuestion(
  questionId: string,
  userId: string | null,
  deviceId: string | null
): Promise<void> {
  const supabase = createClient()
  let query = supabase.from('saved_questions').delete().eq('question_id', questionId)
  if (userId) {
    query = query.eq('user_id', userId)
  } else if (deviceId) {
    query = query.eq('device_id', deviceId)
  }
  const { error } = await query
  if (error) console.error('unsyncSavedQuestion failed:', error)
}

// ── Guest Migration ──

export async function migrateGuestData(deviceId: string, userId: string): Promise<void> {
  const supabase = createClient()

  // Update saved questions
  const { error: savedError } = await supabase
    .from('saved_questions')
    .update({ user_id: userId } as never)
    .eq('device_id', deviceId)
    .is('user_id', null)

  if (savedError) console.error('migrateGuestData saved_questions failed:', savedError)

  // Update sessions
  const { error: sessionsError } = await supabase
    .from('user_sessions')
    .update({ user_id: userId } as never)
    .eq('device_id', deviceId)
    .is('user_id', null)

  if (sessionsError) console.error('migrateGuestData user_sessions failed:', sessionsError)
}

// ── User-Data Pull Queries (login-gated) ──

export async function fetchUserSessions(userId: string): Promise<UserSessionRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as UserSessionRow[]
}

export async function fetchSessionAnswers(sessionIds: string[]): Promise<SessionAnswerRow[]> {
  if (sessionIds.length === 0) return []
  const supabase = createClient()

  const BATCH_SIZE = 50
  const batches: SessionAnswerRow[][] = []
  for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
    const batch = sessionIds.slice(i, i + BATCH_SIZE)
    const res = await supabase
      .from('session_answers')
      .select('*')
      .in('session_id', batch)
    if (res.error) throw res.error
    batches.push((res.data ?? []) as SessionAnswerRow[])
  }
  return batches.flat()
}

export async function fetchSavedQuestions(userId: string): Promise<SavedQuestionRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('saved_questions')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as SavedQuestionRow[]
}

// ── Problem Reports (public, insert-only) ──

/**
 * Submit a problem report. Writes directly to Supabase (no Dexie mirror — this
 * is an outbound submission, never read back on the client). Server-side CHECK
 * constraints, RLS, and a per-device rate-limit trigger enforce abuse limits;
 * a rejection (e.g. rate limit hit) surfaces here as a thrown error.
 */
export async function submitProblemReport(report: ProblemReportInsert): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('problem_reports').insert(report as never)
  if (error) throw error
}
