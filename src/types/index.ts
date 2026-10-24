import type { Database } from '@/../database.types'

// ── DB Row Types (derived from Supabase schema) ──
export type Exam = Database['public']['Tables']['exams']['Row']
export type Book = Database['public']['Tables']['books']['Row']
export type Chapter = Database['public']['Tables']['chapters']['Row']
export type Concept = Database['public']['Tables']['chapter_concepts']['Row']
export type QuestionRow = Database['public']['Tables']['questions']['Row']
export type Option = Database['public']['Tables']['question_options']['Row']
export type Solution = Database['public']['Tables']['question_solutions']['Row']

// User-data table rows (used by the sync pull path)
export type UserSessionRow = Database['public']['Tables']['user_sessions']['Row']
export type SessionAnswerRow = Database['public']['Tables']['session_answers']['Row']
export type SavedQuestionRow = Database['public']['Tables']['saved_questions']['Row']

// Per-user question progress (Supabase mirrors + app-level filters)
export type QuestionProgressRow = Database['public']['Tables']['question_progress']['Row']
export type QuestionProgressEventRow = Database['public']['Tables']['question_progress_events']['Row']

export type QuestionLanguage = 'en' | 'hi'

export type SourceStatus = 'correct' | 'incorrect' | 'skipped' | 'unknown'
export type ProgressStatus = 'correct' | 'incorrect' | 'skipped'

export type QuestionFilter =
  | 'all'
  | 'incorrect'
  | 'skipped'
  | 'correct'
  | 'unseen'
  | 'marked'

// ── Problem Reports (public feedback channel) ──
export type ProblemReportRow = Database['public']['Tables']['problem_reports']['Row']

export type ProblemReportType =
  | 'question'
  | 'answer'
  | 'solution'
  | 'image'
  | 'ui_ux'
  | 'other'

// Client-side abuse safeguards — kept in sync with the DB CHECK constraints
// in supabase/migrations/20260706000001_problem_reports.sql.
export const REPORT_DESCRIPTION_MAX_LENGTH = 1000
export const REPORT_CUSTOM_TYPE_MAX_LENGTH = 80

export interface ProblemReportInsert {
  question_id: string | null
  chapter_id: string | null
  book_id: string | null
  exam_id: string | null
  session_id: string | null
  problem_type: ProblemReportType
  custom_type: string | null
  description: string
  user_id: string | null
  device_id: string | null
}

// ── Enriched Types (joined data) ──
export interface Question extends QuestionRow {
  options: Option[]
  solution: Solution | null
}

export interface ChapterData {
  chapterId: string
  concepts: Concept[]
  questions: Question[]
  contentVersion: number | null
  cachedAt: number
}

// ── Session Types ──
export type SessionType = 'practice' | 'mock'
export type Scope = 'chapter' | 'book' | 'exam' | 'custom'

export interface SectionConfig {
  slug: string
  label: string
  questionCount: number
  timeLimitMinutes: number
  marksPerCorrect: number
  marksPerWrong: number
  totalMarks: number
}

export interface SessionSettings {
  questionCount: number
  timeLimitMinutes: number | null
  shuffle: boolean
  sectionalTiming: boolean
  bookTimeLimits?: Record<string, number>
  sections?: SectionConfig[]
  sectionQuestionRanges?: Array<{ start: number; end: number }>
  currentSectionIndex?: number
  sectionTimeLimits?: number[]       // per-section time in seconds
  filter?: QuestionFilter
  filters?: QuestionFilter[]         // combined mistake filters (wrong + skipped)
  kind?: 'mistakes'
}

export interface SessionConfig {
  scope: Scope
  sessionType: SessionType
  examId: string
  bookId: string | null
  chapterId: string | null
  questionIds?: string[]
  questionCount?: number
  timeLimitMinutes?: number
  shuffle?: boolean
  sectionalTiming?: boolean
  settings?: SessionSettings
  initialTimeElapsedSecs?: number
  initialTimeRemainingSecs?: number | null
  isSubmitted?: boolean
  sections?: SectionConfig[]
  sectionQuestionRanges?: Array<{ start: number; end: number }>
}

// ── User Data (Supabase table mirrors — snake_case matches DB) ──
export interface UserSession {
  id: string
  user_id: string | null
  device_id: string | null
  scope: string
  scope_id: string | null
  session_type: string
  question_ids: string[] | null
  current_index: number | null
  is_active: boolean | null
  is_submitted: boolean | null
  started_at: string | null
  submitted_at: string | null
  time_elapsed_secs: number | null
  time_limit_secs: number | null
  settings: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
}

export interface SessionAnswer {
  id: string
  session_id: string
  question_id: string
  selected_option: string | null
  is_correct: boolean | null
  is_marked: boolean | null
  time_spent_secs: number | null
  answered_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SavedQuestion {
  id: string
  user_id: string | null
  device_id: string | null
  question_id: string
  saved_at: string | null
}

// ── Local Dexie Types (camelCase for app use) ──
export interface LocalSession {
  id: string
  userId: string | null
  deviceId: string | null
  scope: Scope
  scopeId: string | null
  sessionType: SessionType
  questionIds: string[]
  currentIndex: number
  isActive: boolean
  isSubmitted: boolean
  startedAt: number
  submittedAt: number | null
  timeElapsedSecs: number
  timeLimitSecs: number | null
  settings: SessionSettings | null
  syncedAt: number | null
  completedAt: number | null
  answeredCount: number | null
  correctCount: number | null
  currentSectionIndex?: number
  sectionTimeElapsedSecs?: number[]
}

export interface LocalAnswer {
  id: string
  sessionId: string
  questionId: string
  selectedOption: string | null
  isCorrect: boolean | null
  isMarked: boolean
  timeSpentSecs: number
  syncedAt: number | null
}

export interface LocalSavedQuestion {
  id: string
  userId: string | null
  deviceId: string | null
  questionId: string
  syncedAt: number | null
}

export interface LocalQuestionProgress {
  id: string                    // `${userId ?? deviceId}:${questionId}`
  userId: string | null
  deviceId: string | null
  sessionId?: string | null     // last session that produced this row (guest backfill)
  questionId: string
  attempts: number
  correctCount: number
  incorrectCount: number
  skippedCount: number
  lastStatus: ProgressStatus
  lastSeenAt: number
  syncedAt: number | null
}

export interface LocalQuestionProgressEvent {
  id: string                    // `${sessionId}:${questionId}`
  sessionId: string
  questionId: string
  status: ProgressStatus
  createdAt: number
}

// ── Chapter Stats ──
export interface ChapterStats {
  practiceSessions: number
  mockSessions: number
  questionsAttempted: number
  totalPracticeTimeSecs: number
  totalMockTimeSecs: number
  practiceSessionId?: string
}

// ── Store Type Interfaces ──
export interface CatalogStore {
  exams: Exam[]
  books: Book[]
  chapters: Chapter[]
  isLoading: boolean
  error: string | null
  loadExams: () => Promise<void>
  loadBooks: (examId: string) => Promise<Book[]>
  loadChapters: (bookId: string) => Promise<Chapter[]>
  setExams: (exams: Exam[]) => void
  setBooks: (books: Book[]) => void
  setChapters: (chapters: Chapter[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export interface SessionStore {
  chapterId: string | null
  scopeId: string | null
  questions: Question[]
  concepts: Concept[]
  currentIndex: number
  answers: Record<string, LocalAnswer>
  sessionId: string | null
  sessionType: SessionType
  scope: Scope
  timeRemainingSecs: number | null
  initialElapsedSecs: number
  isSubmitted: boolean
  visitedIndices: Set<number>
  // Section tracking
  sectionConfigs: SectionConfig[]
  currentSectionIndex: number
  sectionQuestionRanges: Array<{ start: number; end: number }>
  submittedSectionIndices: Set<number>
  navigateTo: (index: number) => void
  setAnswer: (questionId: string, optionId: string, isCorrect: boolean) => void
  toggleMarkForReview: (questionId: string) => void
  initSession: (sessionId: string, config: SessionConfig, data: ChapterData) => Promise<void>
  submit: () => Promise<void>
  submitSection: () => Promise<void>
  persistTimeElapsed: (elapsedSecs: number) => void
  reset: () => void
}

export interface SavedStore {
  savedIds: Set<string>
  toggleSaved: (questionId: string) => void
  isSaved: (questionId: string) => boolean
  setSavedIds: (ids: string[]) => void
  loadSavedIds: () => Promise<void>
}

export interface UIStore {
  isRightPanelOpen: boolean
  isMockSettingsOpen: boolean
  toggleRightPanel: () => void
  setRightPanel: (open: boolean) => void
  setMockSettingsOpen: (open: boolean) => void
}
