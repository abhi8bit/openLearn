import { create } from 'zustand'
import type { SessionStore, SessionConfig, ChapterData, LocalSession, LocalAnswer, SectionConfig } from '@/types'
import { getDeviceId } from '@/lib/device'
import { db } from '@/lib/dexie/db'
import { saveSession, saveAnswer, markSessionInactive } from '@/lib/dexie/cache'
import { currentUserId } from '@/lib/session/sync'
import { syncSession } from '@/lib/supabase/queries'

// Fire-and-forget push of a session to Supabase, only when logged in.
// Guests stay Dexie-only. Failures log and are swallowed (never surface).
async function pushSessionIfLoggedIn(session: LocalSession): Promise<void> {
  try {
    const userId = await currentUserId()
    if (!userId) return
    await syncSession(session, userId)
    await db.sessions.update(session.id, { syncedAt: Date.now() })
  } catch (e) {
    console.error('[sessionStore] session push failed:', e)
  }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  chapterId: null,
  scopeId: null,
  questions: [],
  concepts: [],
  currentIndex: 0,
  answers: {},
  sessionId: null,
  sessionType: 'practice',
  scope: 'chapter',
  timeRemainingSecs: null,
  initialElapsedSecs: 0,
  isSubmitted: false,
  visitedIndices: new Set<number>(),
  // Section tracking
  sectionConfigs: [],
  currentSectionIndex: 0,
  sectionQuestionRanges: [],
  submittedSectionIndices: new Set<number>(),

  navigateTo: (index: number) => {
    const { sectionConfigs, sectionQuestionRanges, currentSectionIndex, submittedSectionIndices, concepts, questions } = get()
    const conceptCount = concepts.length
    const max = conceptCount + questions.length
    if (index < 0 || index >= max) return

    // Section enforcement: if sections are active, block navigation to other sections
    // Only allow access to submitted sections after the entire mock is submitted (isSubmitted)
    if (sectionConfigs.length > 0 && sectionQuestionRanges.length > 0 && !get().isSubmitted) {
      const questionIndex = index - conceptCount
      if (questionIndex >= 0) {
        // Find which section this question belongs to
        let targetSection = -1
        for (let i = 0; i < sectionQuestionRanges.length; i++) {
          const r = sectionQuestionRanges[i]
          if (questionIndex >= r.start && questionIndex < r.end) {
            targetSection = i
            break
          }
        }
        // Block if: not in current section (submitted sections are inaccessible until final submit)
        if (targetSection >= 0 && targetSection !== currentSectionIndex) {
          return
        }
      }
    }

    const next = new Set(get().visitedIndices)
    next.add(index)
    set({ currentIndex: index, visitedIndices: next })
  },

  setAnswer: (questionId: string, optionId: string, isCorrect: boolean) => {
    const { sessionId, answers } = get()
    if (!sessionId) return

    const existing = answers[questionId]
    const answer: LocalAnswer = {
      id: existing?.id ?? crypto.randomUUID(),
      sessionId,
      questionId,
      selectedOption: optionId,
      isCorrect,
      isMarked: existing?.isMarked ?? false,
      timeSpentSecs: existing?.timeSpentSecs ?? 0,
      syncedAt: null,
    }

    saveAnswer(answer).catch((e) => {
      console.error('Failed to save answer to Dexie:', e)
    })

    set({
      answers: { ...answers, [questionId]: answer },
    })
  },

  toggleMarkForReview: (questionId: string) => {
    const { sessionId, answers } = get()
    if (!sessionId) return

    const existing = answers[questionId]
    const answer: LocalAnswer = existing
      ? { ...existing, isMarked: !existing.isMarked }
      : {
          id: crypto.randomUUID(),
          sessionId,
          questionId,
          selectedOption: null,
          isCorrect: null,
          isMarked: true,
          timeSpentSecs: 0,
          syncedAt: null,
        }

    saveAnswer(answer).catch((e) => {
      console.error('Failed to save mark to Dexie:', e)
    })

    set({
      answers: { ...answers, [questionId]: answer },
    })
  },

  initSession: async (sessionId: string, config: SessionConfig, data: ChapterData) => {
    const { scope, sessionType, chapterId, questionIds, timeLimitMinutes, shuffle, initialTimeElapsedSecs, initialTimeRemainingSecs } = config

    const scopeId =
      scope === 'chapter' ? (chapterId ?? null) :
      scope === 'book' ? (config.bookId ?? null) :
      config.examId

    let orderedQuestionIds = questionIds ?? data.questions.map((q) => q.id)

    if (shuffle && sessionType === 'mock' && (!config.sections || config.sections.length === 0)) {
      // Only shuffle globally if not using sections (sections shuffle per-section)
      orderedQuestionIds = [...orderedQuestionIds]
      for (let i = orderedQuestionIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[orderedQuestionIds[i], orderedQuestionIds[j]] = [orderedQuestionIds[j], orderedQuestionIds[i]]
      }
    }

    // For sectioned exams, shuffle within each section
    if (shuffle && config.sections && config.sections.length > 0 && config.sectionQuestionRanges) {
      const shuffled = [...orderedQuestionIds]
      for (const range of config.sectionQuestionRanges) {
        const sectionIds = shuffled.slice(range.start, range.end)
        for (let i = sectionIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[sectionIds[i], sectionIds[j]] = [sectionIds[j], sectionIds[i]]
        }
        shuffled.splice(range.start, sectionIds.length, ...sectionIds)
      }
      orderedQuestionIds = shuffled
    }

    const timeElapsedSecs = initialTimeElapsedSecs ?? 0
    const totalLimitSecs = timeLimitMinutes ? timeLimitMinutes * 60 : null

    // Only persist a fresh record for genuinely NEW sessions. Review/Resume from
    // History reloads an existing session through initSession too, and there the
    // stored Dexie record is the source of truth for lifecycle state. Overwriting
    // it would reset a completed mock back to isActive / !isSubmitted — flipping
    // History's "Review" back to "Resume" and reopening the test in-progress with
    // the timer running. Every new-session caller uses a fresh crypto.randomUUID(),
    // so an id that already exists here always means a reload, never a creation.
    const existing = await db.sessions.get(sessionId)
    if (!existing) {
      const session: LocalSession = {
        id: sessionId,
        userId: null,
        deviceId: getDeviceId(),
        scope,
        scopeId,
        sessionType,
        questionIds: orderedQuestionIds,
        currentIndex: 0,
        isActive: true,
        isSubmitted: sessionType === 'practice',
        startedAt: Date.now() - (timeElapsedSecs * 1000),
        submittedAt: null,
        timeElapsedSecs,
        timeLimitSecs: totalLimitSecs,
        settings: config.settings ?? null,
        syncedAt: null,
        completedAt: null,
        answeredCount: null,
        correctCount: null,
        currentSectionIndex: 0,
        sectionTimeElapsedSecs: config.sections ? new Array(config.sections.length).fill(0) : undefined,
      }

      try {
        await saveSession(session)
      } catch (e) {
        console.error('[sessionStore] Failed to save session to Dexie:', e)
      }

      // Push to Supabase when logged in (fire-and-forget; guests stay Dexie-only).
      void pushSessionIfLoggedIn(session)
    }

    // Filter questions to only include those in orderedQuestionIds
    const questionIdSet = new Set(orderedQuestionIds)
    const filteredQuestions = data.questions.filter((q) => questionIdSet.has(q.id))

    // For mock: remaining time = limit - elapsed; for practice: null
    const timeRemaining = initialTimeRemainingSecs !== undefined
      ? initialTimeRemainingSecs
      : totalLimitSecs !== null
        ? Math.max(0, totalLimitSecs - timeElapsedSecs)
        : null

    set({
      sessionId,
      chapterId: chapterId ?? null,
      scopeId,
      questions: filteredQuestions,
      concepts: sessionType === 'mock' ? [] : data.concepts,
      currentIndex: 0,
      answers: {},
      visitedIndices: new Set([0]),
      sessionType,
      scope,
      timeRemainingSecs: timeRemaining,
      initialElapsedSecs: timeElapsedSecs,
      isSubmitted: config.isSubmitted ?? (sessionType === 'practice'),
      // Section tracking
      sectionConfigs: config.sections ?? [],
      currentSectionIndex: 0,
      sectionQuestionRanges: config.sectionQuestionRanges ?? [],
      submittedSectionIndices: new Set<number>(),
    })
  },

  submitSection: async () => {
    const { currentSectionIndex, sectionConfigs, sectionQuestionRanges, submittedSectionIndices, concepts, questions } = get()

    if (sectionConfigs.length === 0) return

    const newSubmitted = new Set(submittedSectionIndices)
    newSubmitted.add(currentSectionIndex)

    const nextSectionIndex = currentSectionIndex + 1

    if (nextSectionIndex < sectionConfigs.length) {
      // Move to next section
      const nextRange = sectionQuestionRanges[nextSectionIndex]
      const conceptCount = concepts.length
      const nextQuestionIndex = nextRange ? nextRange.start : 0
      const nextIndex = conceptCount + nextQuestionIndex

      set({
        submittedSectionIndices: newSubmitted,
        currentSectionIndex: nextSectionIndex,
        currentIndex: nextIndex,
        visitedIndices: new Set([...get().visitedIndices, nextIndex]),
      })
    } else {
      // All sections submitted — submit the entire mock
      set({
        submittedSectionIndices: newSubmitted,
      })
      await get().submit()
    }
  },

  submit: async () => {
    const { sessionId } = get()
    if (!sessionId) return

    try {
      await markSessionInactive(sessionId)
    } catch (e) {
      console.error('[sessionStore] Failed to mark session inactive:', e)
    }

    set({ isSubmitted: true })
  },

  persistTimeElapsed: (elapsedSecs: number) => {
    const { sessionId } = get()
    if (!sessionId) return
    db.sessions.update(sessionId, { timeElapsedSecs: elapsedSecs }).catch((e) => {
      console.error('[sessionStore] Failed to persist time elapsed:', e)
    })
  },

  reset: () => {
    set({
      chapterId: null,
      scopeId: null,
      questions: [],
      concepts: [],
      currentIndex: 0,
      answers: {},
      visitedIndices: new Set(),
      sessionId: null,
      sessionType: 'practice',
      scope: 'chapter',
      timeRemainingSecs: null,
      initialElapsedSecs: 0,
      isSubmitted: false,
      sectionConfigs: [],
      currentSectionIndex: 0,
      sectionQuestionRanges: [],
      submittedSectionIndices: new Set(),
    })
  },
}))
