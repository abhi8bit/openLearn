import type {
  UserSessionRow,
  SessionAnswerRow,
  SavedQuestionRow,
  LocalSession,
  LocalAnswer,
  LocalSavedQuestion,
  Scope,
  SessionType,
  SessionSettings,
} from '@/types'

// Supabase rows use ISO strings + snake_case; Local (Dexie) types use epoch
// numbers + camelCase. These pure mappers convert a pulled remote row into the
// local shape. `syncedAt` is stamped to "now" because a freshly-pulled row is,
// by definition, in sync with the server.

function isoToEpoch(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function rowToLocalSession(r: UserSessionRow, syncedAt: number): LocalSession {
  return {
    id: r.id,
    userId: r.user_id,
    deviceId: r.device_id,
    scope: (r.scope as Scope),
    scopeId: r.scope_id,
    sessionType: (r.session_type as SessionType),
    questionIds: r.question_ids ?? [],
    currentIndex: r.current_index ?? 0,
    isActive: r.is_active ?? false,
    isSubmitted: r.is_submitted ?? false,
    startedAt: isoToEpoch(r.started_at) ?? 0,
    submittedAt: isoToEpoch(r.submitted_at),
    timeElapsedSecs: r.time_elapsed_secs ?? 0,
    timeLimitSecs: r.time_limit_secs,
    settings: (r.settings as SessionSettings | null) ?? null,
    syncedAt,
    completedAt: isoToEpoch(r.completed_at),
    answeredCount: r.answered_count,
    correctCount: r.correct_count,
    currentSectionIndex: r.current_section_index ?? undefined,
    sectionTimeElapsedSecs: r.section_time_elapsed_secs ?? undefined,
  }
}

export function rowToLocalAnswer(r: SessionAnswerRow, syncedAt: number): LocalAnswer {
  return {
    id: r.id,
    sessionId: r.session_id,
    questionId: r.question_id,
    selectedOption: r.selected_option,
    isCorrect: r.is_correct,
    isMarked: r.is_marked ?? false,
    timeSpentSecs: r.time_spent_secs ?? 0,
    syncedAt,
  }
}

export function rowToLocalSaved(r: SavedQuestionRow, syncedAt: number): LocalSavedQuestion {
  return {
    id: r.id,
    userId: r.user_id,
    deviceId: r.device_id,
    questionId: r.question_id,
    syncedAt,
  }
}
