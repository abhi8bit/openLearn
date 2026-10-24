'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { QuestionCard } from './QuestionCard'
import { RightPanel } from './RightPanel'
import { ReportProblemModal } from './ReportProblemModal'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { LanguageToggle } from '@/components/ui/LanguageToggle'
import { hasHindiText } from '@/lib/i18n/question'
import { useSessionStore } from '@/stores/sessionStore'
import { useSavedStore } from '@/stores/savedStore'
import { useUIStore } from '@/stores/uiStore'
import { saveAnswer, saveSession, getSession, markSessionInactive, getCachedOrFetchChapter, getPracticeSession, getPreviousPracticeSessions, getStoragePrefix, recordSessionOutcomes } from '@/lib/dexie/cache'
import { getDeviceId } from '@/lib/device'
import { createTimerWorker } from '@/lib/session/createTimerWorker'
import { db } from '@/lib/dexie/db'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { LocalAnswer, LocalSession } from '@/types'
import { currentUserId, syncPendingAnswers } from '@/lib/session/sync'
import { syncSession } from '@/lib/supabase/queries'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Flag,
  CheckCircle,
  Pause,
  Play,
  ExternalLink,
  MessageSquareWarning,
} from 'lucide-react'

// Fire-and-forget push of session progress + pending answers, only when
// logged in. Guests stay Dexie-only; failures log and are swallowed.
async function pushSessionProgressIfLoggedIn(session: LocalSession): Promise<void> {
  try {
    const userId = await currentUserId()
    if (!userId) return
    await syncSession(session, userId)
    await db.sessions.update(session.id, { syncedAt: Date.now() })
    await syncPendingAnswers(userId)
  } catch (e) {
    console.error('[SessionLayout] progress push failed:', e)
  }
}

export function SessionLayout() {
  const router = useRouter()
  const workerRef = useRef<Worker | null>(null)
  const questionEnteredAt = useRef<number>(Date.now())
  const elapsedRef = useRef<number>(0)
  const totalElapsedRef = useRef<number>(0)
  const isPausedRef = useRef<boolean>(false)
  const sessionStartedAtRef = useRef<number>(Date.now())
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [showPauseDialog, setShowPauseDialog] = useState(false)
  const [showStatsDialog, setShowStatsDialog] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [isPracticeCompleted, setIsPracticeCompleted] = useState(false)

  // Section timer tracking
  const sectionElapsedRef = useRef<number>(0)
  const [sectionElapsedSecs, setSectionElapsedSecs] = useState(0)

  // Swipe state
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const [swipeOffset, setSwipeOffset] = useState(0)

  // Category info for the current question
  const [currentChapterName, setCurrentChapterName] = useState<string | null>(null)
  const [currentBookName, setCurrentBookName] = useState<string | null>(null)
  const [currentStoragePrefix, setCurrentStoragePrefix] = useState<string | null>(null)

  const {
    sessionId,
    concepts,
    questions,
    currentIndex,
    answers,
    sessionType,
    isSubmitted,
    timeRemainingSecs,
    initialElapsedSecs,
    visitedIndices,
    navigateTo,
    setAnswer,
    toggleMarkForReview,
    submit,
    submitSection,
    persistTimeElapsed,
    scopeId,
    scope,
    sectionConfigs,
    currentSectionIndex,
    sectionQuestionRanges,
    submittedSectionIndices,
  } = useSessionStore()

  const { toggleSaved, isSaved } = useSavedStore()
  const isRightPanelOpen = useUIStore((s) => s.isRightPanelOpen)
  const setRightPanel = useUIStore((s) => s.setRightPanel)

  const hasSections = sectionConfigs.length > 0 && sectionQuestionRanges.length > 0
  const conceptCount = concepts.length
  const totalItems = conceptCount + questions.length
  const isConcept = currentIndex < conceptCount
  const currentQuestion = isConcept ? null : questions[currentIndex - conceptCount]
  const currentConcept = isConcept ? concepts[currentIndex] : null

  // Current section boundaries
  const currentSectionRange = hasSections ? sectionQuestionRanges[currentSectionIndex] : null
  const sectionStartIndex = currentSectionRange ? conceptCount + currentSectionRange.start : 0
  const sectionEndIndex = currentSectionRange ? conceptCount + currentSectionRange.end - 1 : totalItems - 1

  // Current section config
  const currentSectionConfig = hasSections ? sectionConfigs[currentSectionIndex] : null
  const currentSectionTimeLimit = currentSectionConfig ? currentSectionConfig.timeLimitMinutes * 60 : null

  const currentQId = currentQuestion?.id
  const currentAnswer = currentQId ? answers[currentQId] : undefined
  const hasAnsweredCurrent = currentAnswer?.selectedOption != null

  const showSolution =
    (sessionType === 'practice' && hasAnsweredCurrent) ||
    (sessionType === 'mock' && isSubmitted)

  // Load category info when current question changes
  useEffect(() => {
    if (!currentQuestion) {
      setCurrentChapterName(null)
      setCurrentBookName(null)
      setCurrentStoragePrefix(null)
      return
    }

    const chapterId = currentQuestion.chapter_id
    if (!chapterId) return

    let cancelled = false
    async function loadCategory() {
      const chapter = await db.chapters.get(chapterId)
      if (!chapter || cancelled) return
      setCurrentChapterName(chapter.name)
      const book = await db.books.get(chapter.book_id)
      if (!cancelled && book) setCurrentBookName(book.name)
      // Resolve storage prefix (uses fallback from book/chapter slugs if storage_prefix is null)
      const prefix = await getStoragePrefix(chapterId)
      if (!cancelled) setCurrentStoragePrefix(prefix)
    }
    loadCategory()
    return () => { cancelled = true }
  }, [currentQuestion?.id])

  // Load existing session data on mount
  useEffect(() => {
    if (!sessionId) return
    getSession(sessionId).then((s) => {
      if (s) {
        sessionStartedAtRef.current = s.startedAt
        if (sessionType === 'practice' && s.isActive === false) {
          setIsPracticeCompleted(true)
        }
      }
    })
  }, [sessionId, sessionType])

  // Timer: Web Worker for mock countdown
  // For sectioned exams: per-section timer
  // For non-sectioned: overall timer
  useEffect(() => {
    if (sessionType === 'mock' && isSubmitted) return

    if (sessionType === 'mock') {
      const worker = createTimerWorker()
      workerRef.current = worker
      totalElapsedRef.current = initialElapsedSecs
      sectionElapsedRef.current = 0

      worker.onmessage = async (e) => {
        if (e.data.type === 'TICK') {
          setElapsedSecs(e.data.elapsedSecs)
          totalElapsedRef.current = initialElapsedSecs + e.data.elapsedSecs

          // Track section elapsed time
          if (hasSections) {
            sectionElapsedRef.current = e.data.elapsedSecs
            setSectionElapsedSecs(e.data.elapsedSecs)
          }

          if (e.data.elapsedSecs % 15 === 0) {
            persistTimeElapsed(totalElapsedRef.current)
          }
        }
        if (e.data.type === 'EXPIRED') {
          if (hasSections) {
            const state = useSessionStore.getState()
            const isLastSection = state.currentSectionIndex >= state.sectionConfigs.length - 1
            if (isLastSection) {
              await saveProgress(false, true)
            }
            await submitSection()
          } else {
            await submit()
          }
        }
      }

      if (hasSections && currentSectionTimeLimit != null) {
        // Sectioned mode: start with section time limit
        worker.postMessage({ type: 'START', payload: { limitSecs: currentSectionTimeLimit } })
      } else if (timeRemainingSecs != null) {
        worker.postMessage({ type: 'START', payload: { limitSecs: timeRemainingSecs } })
      } else {
        worker.postMessage({ type: 'START' })
      }

      return () => {
        worker.postMessage({ type: 'STOP' })
        worker.terminate()
      }
    } else {
      elapsedRef.current = initialElapsedSecs
      totalElapsedRef.current = initialElapsedSecs
      setElapsedSecs(initialElapsedSecs)

      const interval = setInterval(() => {
        elapsedRef.current++
        totalElapsedRef.current = elapsedRef.current
        setElapsedSecs(elapsedRef.current)
      }, 1000)
      workerRef.current = null

      return () => clearInterval(interval)
    }
  }, []) // Only run once on mount

  // Restart section timer when currentSectionIndex changes
  useEffect(() => {
    if (!hasSections || sessionType !== 'mock' || isSubmitted) return
    if (!workerRef.current) return

    const sectionConfig = sectionConfigs[currentSectionIndex]
    if (!sectionConfig) return

    const sectionTimeLimit = sectionConfig.timeLimitMinutes * 60

    // Stop current timer, reset, and start with new section time
    workerRef.current.postMessage({ type: 'STOP' })
    sectionElapsedRef.current = 0
    setSectionElapsedSecs(0)
    workerRef.current.postMessage({ type: 'START', payload: { limitSecs: sectionTimeLimit } })
  }, [currentSectionIndex, hasSections, sessionType, isSubmitted])

  // Save progress to Dexie on beforeunload
  useEffect(() => {
    const save = () => {
      if (!sessionId) return
      const state = useSessionStore.getState()
      const isActive = sessionType === 'practice' ? true : (!state.isSubmitted ? isPausedRef.current || !state.isSubmitted : false)
      saveSession({
        id: sessionId,
        userId: null,
        deviceId: '',
        scope: state.scope,
        scopeId: state.scopeId ?? null,
        sessionType,
        questionIds: questions.map((q) => q.id),
        currentIndex: state.currentIndex,
        isActive,
        isSubmitted: state.isSubmitted,
        startedAt: sessionStartedAtRef.current,
        submittedAt: state.isSubmitted ? Date.now() : null,
        timeElapsedSecs: totalElapsedRef.current,
        timeLimitSecs: timeRemainingSecs,
        settings: null,
        syncedAt: null,
        completedAt: null,
        answeredCount: null,
        correctCount: null,
      })
    }

    window.addEventListener('beforeunload', save)
    return () => window.removeEventListener('beforeunload', save)
  }, [sessionId, isSubmitted, sessionType, elapsedSecs, timeRemainingSecs, questions])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (isConcept) return

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNavigate(currentIndex + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleNavigate(currentIndex - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, isConcept, isSubmitted, totalItems])

  // Track per-question time on navigation
  useEffect(() => {
    questionEnteredAt.current = Date.now()
  }, [currentIndex])

  const saveProgress = useCallback(async (keepActive = false, explicitIsSubmitted?: boolean) => {
    if (!sessionId) return
    const state = useSessionStore.getState()
    const existing = await getSession(sessionId)
    const answeredCount = Object.values(state.answers).filter((a) => a.selectedOption).length
    const correctCount = Object.values(state.answers).filter((a) => a.isCorrect).length
    const submitted = explicitIsSubmitted ?? state.isSubmitted
    const session: LocalSession = {
      id: sessionId,
      userId: existing?.userId ?? null,
      deviceId: existing?.deviceId ?? '',
      scope: state.scope,
      scopeId: state.scopeId ?? existing?.scopeId ?? null,
      sessionType,
      questionIds: questions.map((q) => q.id),
      currentIndex: state.currentIndex,
      isActive: keepActive,
      isSubmitted: submitted,
      startedAt: existing?.startedAt ?? Date.now(),
      submittedAt: submitted ? (existing?.submittedAt ?? Date.now()) : null,
      timeElapsedSecs: totalElapsedRef.current,
      timeLimitSecs: timeRemainingSecs,
      settings: existing?.settings ?? null,
      syncedAt: existing?.syncedAt ?? null,
      completedAt: !keepActive ? Date.now() : (existing?.completedAt ?? null),
      answeredCount,
      correctCount,
    }
    await saveSession(session)

    // Push to Supabase when logged in (fire-and-forget; guests stay Dexie-only).
    // Flushes both the session row and any pending answers in one shot.
    void pushSessionProgressIfLoggedIn(session)
  }, [sessionId, sessionType, questions, elapsedSecs, timeRemainingSecs])

  const handlePause = useCallback(() => {
    if (isPausedRef.current) {
      handleResume()
      return
    }
    setShowPauseDialog(true)
  }, [saveProgress])

  const confirmPause = useCallback(async () => {
    setShowPauseDialog(false)
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'PAUSE' })
    }
    isPausedRef.current = true
    setIsPaused(true)
    await saveProgress(true)
    router.back()
  }, [saveProgress, router])

  const handleResume = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'RESUME' })
    }
    isPausedRef.current = false
    setIsPaused(false)
  }, [])

  const handleNavigate = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalItems) return

      // Section boundary enforcement — submitted sections are inaccessible until final submit
      if (hasSections && !isConcept && !isSubmitted) {
        const questionIndex = index - conceptCount
        if (questionIndex >= 0) {
          let targetSection = -1
          for (let i = 0; i < sectionQuestionRanges.length; i++) {
            const r = sectionQuestionRanges[i]
            if (questionIndex >= r.start && questionIndex < r.end) {
              targetSection = i
              break
            }
          }
          if (targetSection >= 0 && targetSection !== currentSectionIndex) {
            return // Block — submitted sections are locked until final submit
          }
        }
      }

      if (!isConcept && currentQuestion) {
        const currentAnswer = answers[currentQuestion.id]
        const spent = Math.floor((Date.now() - questionEnteredAt.current) / 1000)
        const updated: LocalAnswer = {
          id: currentAnswer?.id ?? crypto.randomUUID(),
          sessionId: sessionId!,
          questionId: currentQuestion.id,
          selectedOption: currentAnswer?.selectedOption ?? null,
          isCorrect: currentAnswer?.isCorrect ?? null,
          isMarked: currentAnswer?.isMarked ?? false,
          timeSpentSecs: (currentAnswer?.timeSpentSecs ?? 0) + spent,
          syncedAt: null,
        }
        saveAnswer(updated)
      }

      navigateTo(index)
      setSwipeOffset(0)
    },
    [isConcept, currentQuestion, answers, sessionId, navigateTo, totalItems, hasSections, isSubmitted, conceptCount, currentSectionRange, sectionQuestionRanges, currentSectionIndex, submittedSectionIndices]
  )

  const handleSelectOption = useCallback(
    (optionId: string, isCorrect: boolean) => {
      if (!currentQuestion) return
      setAnswer(currentQuestion.id, optionId, isCorrect)
    },
    [currentQuestion, setAnswer]
  )

  const handleSubmit = useCallback(async () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'STOP' })
    }
    await saveProgress(false, true)
    await submit()
  }, [submit, saveProgress])

  const handleSubmitSection = useCallback(async () => {
    const state = useSessionStore.getState()
    const isLastSection = state.currentSectionIndex >= state.sectionConfigs.length - 1

    if (isLastSection) {
      // Stop the timer before final submit
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' })
      }
      // Save progress first
      await saveProgress(false, true)
    }

    await submitSection()
  }, [submitSection, saveProgress])

  const handleComplete = useCallback(async () => {
    if (!sessionId) return
    const state = useSessionStore.getState()
    const existing = await getSession(sessionId)
    const answeredCount = Object.values(state.answers).filter((a) => a.selectedOption).length
    const correctCount = Object.values(state.answers).filter((a) => a.isCorrect).length
    await saveSession({
      id: sessionId,
      userId: existing?.userId ?? null,
      deviceId: existing?.deviceId ?? '',
      scope: state.scope,
      scopeId: state.scopeId ?? existing?.scopeId ?? null,
      sessionType,
      questionIds: questions.map((q) => q.id),
      currentIndex: state.currentIndex,
      isActive: false,
      isSubmitted: true,
      startedAt: existing?.startedAt ?? Date.now(),
      submittedAt: Date.now(),
      timeElapsedSecs: totalElapsedRef.current,
      timeLimitSecs: timeRemainingSecs,
      settings: existing?.settings ?? null,
      syncedAt: existing?.syncedAt ?? null,
      completedAt: Date.now(),
      answeredCount,
      correctCount,
    })
    await recordSessionOutcomes({
      sessionId,
      userId: await currentUserId(),
      deviceId: getDeviceId(),
      questions,
      answers: useSessionStore.getState().answers,
    })
    setIsPracticeCompleted(true)
    router.back()
  }, [sessionId, sessionType, questions, timeRemainingSecs, router])

  const handleBack = useCallback(async () => {
    if (sessionType === 'practice') {
      await saveProgress(true)
    } else if (sessionType === 'mock' && !isSubmitted) {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'PAUSE' })
      }
      isPausedRef.current = true
      await saveProgress(true)
    } else {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' })
      }
      await saveProgress(false)
    }
    router.back()
  }, [router, saveProgress, sessionType, isSubmitted])

  const handleGoToChapter = useCallback(async () => {
    if (!currentQuestion) return

    const chapterId = currentQuestion.chapter_id
    if (!chapterId) return

    const existing = await getPracticeSession(chapterId)
    if (existing) {
      const data = await getCachedOrFetchChapter(chapterId)
      const questionIndex = data.questions.findIndex((q) => q.id === currentQuestion.id)
      const targetIndex = data.concepts.length + (questionIndex >= 0 ? questionIndex : 0)
      router.push(`/session/${existing.id}?q=${targetIndex}`)
      return
    }

    const data = await getCachedOrFetchChapter(chapterId)
    const questionIndex = data.questions.findIndex((q) => q.id === currentQuestion.id)
    const newSessionId = crypto.randomUUID()

    const { initSession } = useSessionStore.getState()
    await initSession(newSessionId, {
      scope: 'chapter',
      sessionType: 'practice',
      examId: '',
      bookId: null,
      chapterId,
      questionIds: data.questions.map((q) => q.id),
    }, data)

    const targetIndex = data.concepts.length + (questionIndex >= 0 ? questionIndex : 0)
    router.push(`/session/${newSessionId}?q=${targetIndex}`)
  }, [currentQuestion, router])

  // Swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isConcept) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [isConcept])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isConcept) return
    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setSwipeOffset(deltaX * 0.6)
    }
  }, [isConcept])

  const handleTouchEnd = useCallback(() => {
    if (isConcept) return
    if (swipeOffset > 50) {
      handleNavigate(currentIndex - 1)
    } else if (swipeOffset < -50) {
      handleNavigate(currentIndex + 1)
    }
    setSwipeOffset(0)
  }, [isConcept, swipeOffset, handleNavigate, currentIndex])

  // Show the language toggle only when this question set has real Hindi text
  const showLanguageToggle = useMemo(() => questions.some(hasHindiText), [questions])

  // Stats for stats dialog
  const stats = useMemo(() => {
    const total = questions.length
    const answered = Object.values(answers).filter((a) => a.selectedOption).length
    const correct = Object.values(answers).filter((a) => a.isCorrect).length
    const notAnswered = total - answered
    return { total, answered, correct, notAnswered, totalTime: elapsedRef.current }
  }, [questions.length, answers, elapsedSecs])

  // Previous practice sessions for this chapter
  const [previousSessions, setPreviousSessions] = useState<Array<{ id: string; startedAt: number; completedAt: number | null; timeElapsedSecs: number; questionCount: number; answeredCount: number | null; correctCount: number | null }>>([])

  const handleTimerClick = useCallback(async () => {
    setShowStatsDialog(true)

    if (scopeId && sessionType === 'practice') {
      try {
        const prev = await getPreviousPracticeSessions(scopeId, sessionId ?? undefined)
        setPreviousSessions(prev.map((s) => ({
          id: s.id,
          startedAt: s.startedAt,
          completedAt: s.completedAt ?? null,
          timeElapsedSecs: s.timeElapsedSecs,
          questionCount: s.questionIds.length,
          answeredCount: s.answeredCount ?? null,
          correctCount: s.correctCount ?? null,
        })))
      } catch (e) {
        console.error('[timer] Error fetching previous sessions:', e)
      }
    }
  }, [scopeId, sessionType, sessionId])

  // Bottom nav shown for questions only, not submitted
  const showBottomNav = !isConcept && currentQuestion

  // Timer urgency
  const isTimerUrgent = sessionType === 'mock' && (
    hasSections
      ? (currentSectionTimeLimit != null && (currentSectionTimeLimit - sectionElapsedSecs) < 30)
      : (timeRemainingSecs != null && (timeRemainingSecs - elapsedSecs) < 30)
  )

  // Display time: section time for sectioned exams, overall time otherwise
  const displayTimeRemaining = hasSections && currentSectionTimeLimit != null
    ? Math.max(0, currentSectionTimeLimit - sectionElapsedSecs)
    : timeRemainingSecs != null
      ? Math.max(0, timeRemainingSecs - elapsedSecs)
      : null

  // Is this the last question in the current section?
  const isLastInSection = hasSections && currentSectionRange
    ? (currentIndex - conceptCount) === currentSectionRange.end - 1
    : currentIndex === totalItems - 1

  // Check if current section is submitted
  const isCurrentSectionSubmitted = submittedSectionIndices.has(currentSectionIndex)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '8px 16px',
          background: 'var(--bg-primary)',
        }}
      >
        <button
          onClick={handleBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              padding: '2px 10px',
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 500,
              background: 'var(--accent-subtle)',
              color: 'var(--accent-text)',
            }}
          >
            {sessionType === 'mock' ? 'Mock Test' : 'Practice'}
          </span>
          {isSubmitted && sessionType === 'mock' && (
            <span
              style={{
                padding: '2px 10px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 500,
                background: 'var(--success-subtle)',
                color: 'var(--success)',
              }}
            >
              Completed
            </span>
          )}
          {sessionType === 'practice' && isPracticeCompleted && (
            <span
              style={{
                padding: '2px 10px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 500,
                background: 'var(--success-subtle)',
                color: 'var(--success)',
              }}
            >
              Completed
            </span>
          )}
          {sessionType === 'mock' && !isSubmitted && (
            <button
              onClick={isPaused ? handleResume : handlePause}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {isPaused ? (
                <>
                  <Play style={{ width: 14, height: 14 }} />
                  Resume
                </>
              ) : (
                <>
                  <Pause style={{ width: 14, height: 14 }} />
                  Pause
                </>
              )}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showLanguageToggle && <LanguageToggle />}

          <button
            onClick={() => setShowReportDialog(true)}
            title="Report a problem"
            aria-label="Report a problem"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <MessageSquareWarning style={{ width: 16, height: 16 }} />
          </button>

          <button
            onClick={handleTimerClick}
            className={`timer ${isTimerUrgent ? 'urgent' : ''}`}
          >
            {sessionType === 'mock' && displayTimeRemaining !== null
              ? formatTime(displayTimeRemaining)
              : formatTime(elapsedSecs)}
          </button>
        </div>
      </div>

      {/* Section Indicator Bar */}
      {hasSections && !isSubmitted && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            overflowX: 'auto',
          }}
        >
          {sectionConfigs.map((config, i) => {
            const isActive = i === currentSectionIndex
            const isDone = submittedSectionIndices.has(i)
            const romanNumeral = ['I', 'II', 'III', 'IV', 'V', 'VI'][i] ?? i + 1

            return (
              <div
                key={config.slug}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: isDone ? 'var(--success-subtle)' : isActive ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                  color: isDone ? 'var(--success)' : isActive ? 'var(--accent-text)' : 'var(--text-tertiary)',
                  border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                }}
              >
                {isDone && <CheckCircle style={{ width: 10, height: 10 }} />}
                Section {romanNumeral}
              </div>
            )
          })}
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Content */}
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
          <div
            style={{ flex: 1, overflowY: 'auto', padding: 24 }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              style={{ transition: 'transform 200ms ease-out', transform: `translateX(${swipeOffset}px)` }}
            >
              {/* Section header for sectioned exams */}
              {hasSections && currentSectionConfig && !isConcept && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      padding: '2px 10px',
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 600,
                      background: 'var(--accent-subtle)',
                      color: 'var(--accent-text)',
                    }}>
                      Section {['I', 'II', 'III', 'IV', 'V', 'VI'][currentSectionIndex] ?? currentSectionIndex + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {currentSectionConfig.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'DM Mono', monospace" }}>
                    {currentSectionConfig.totalMarks} marks · +{currentSectionConfig.marksPerCorrect} / {currentSectionConfig.marksPerWrong}
                  </div>
                </div>
              )}

              <QuestionCard
                isConcept={isConcept}
                concept={currentConcept ?? undefined}
                question={currentQuestion ?? undefined}
                answer={currentAnswer}
                storagePrefix={currentStoragePrefix}
                showSolution={showSolution}
                onSelectOption={handleSelectOption}
              />

              {/* Concept navigation */}
              {isConcept && conceptCount > 0 && (
                <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
                  <button
                    className="btn-nav btn-nav-ghost"
                    disabled={currentIndex === 0}
                    onClick={() => handleNavigate(currentIndex - 1)}
                  >
                    <ChevronLeft style={{ width: 16, height: 16 }} />
                    Prev Concept
                  </button>
                  {currentIndex < conceptCount - 1 ? (
                    <button
                      className="btn-nav btn-nav-ghost"
                      onClick={() => handleNavigate(currentIndex + 1)}
                    >
                      Next Concept
                      <ChevronRight style={{ width: 16, height: 16 }} />
                    </button>
                  ) : (
                    <button
                      className="btn-nav btn-nav-solid"
                      onClick={() => handleNavigate(conceptCount)}
                    >
                      Go to Questions
                      <ChevronRight style={{ width: 16, height: 16 }} />
                    </button>
                  )}
                </div>
              )}

              {/* Go to Chapter button — mock test mode only */}
              {sessionType === 'mock' && isSubmitted && currentQuestion && (
                <div style={{ marginTop: 16 }}>
                  <button
                    className="btn-nav btn-nav-ghost"
                    onClick={handleGoToChapter}
                  >
                    <ExternalLink style={{ width: 14, height: 14 }} />
                    Go to Chapter
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Navigation — sticky */}
          {showBottomNav && (
            <div className="action-bar">
              <button
                className="btn-nav btn-nav-ghost"
                disabled={hasSections ? currentIndex <= sectionStartIndex : currentIndex === 0}
                onClick={() => handleNavigate(currentIndex - 1)}
              >
                <ChevronLeft style={{ width: 16, height: 16 }} />
                Prev
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                {currentQId && (
                  <button
                    className={`btn-nav ${answers[currentQId]?.isMarked ? 'btn-nav-solid' : 'btn-nav-ghost'}`}
                    onClick={() => toggleMarkForReview(currentQId)}
                  >
                    <Flag style={{ width: 14, height: 14 }} />
                    {answers[currentQId]?.isMarked ? 'Marked' : 'Mark'}
                  </button>
                )}
                {currentQId && (
                  <button
                    className={`btn-nav ${isSaved(currentQId) ? 'btn-nav-solid' : 'btn-nav-ghost'}`}
                    onClick={() => toggleSaved(currentQId)}
                  >
                    <Bookmark style={{ width: 14, height: 14 }} />
                    {isSaved(currentQId) ? 'Saved' : 'Save'}
                  </button>
                )}
              </div>

              {/* Next / Submit Section / Submit Mock */}
              {sessionType === 'mock' && isLastInSection && hasSections && !isSubmitted ? (
                <button
                  className="btn-nav btn-nav-solid"
                  onClick={handleSubmitSection}
                >
                  <CheckCircle style={{ width: 14, height: 14 }} />
                  Submit Section
                </button>
              ) : sessionType === 'mock' && !isSubmitted && currentIndex === totalItems - 1 ? (
                <button
                  className="btn-nav btn-nav-solid"
                  onClick={handleSubmit}
                >
                  <CheckCircle style={{ width: 14, height: 14 }} />
                  Submit
                </button>
              ) : sessionType === 'practice' && currentIndex === totalItems - 1 && !isPracticeCompleted ? (
                <button
                  className="btn-nav btn-nav-solid"
                  onClick={handleComplete}
                >
                  <CheckCircle style={{ width: 14, height: 14 }} />
                  Complete
                </button>
              ) : (
                <button
                  className="btn-nav btn-nav-ghost"
                  disabled={hasSections ? currentIndex >= sectionEndIndex : currentIndex === totalItems - 1}
                  onClick={() => handleNavigate(currentIndex + 1)}
                >
                  Next
                  <ChevronRight style={{ width: 16, height: 16 }} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Panel — Desktop */}
        <div
          className="hidden lg:block"
          style={{ width: 288, borderLeft: '1px solid var(--border-subtle)' }}
        >
          <RightPanel
            concepts={concepts}
            questions={questions}
            answers={answers}
            currentIndex={currentIndex}
            visitedIndices={visitedIndices}
            sessionType={sessionType}
            isSubmitted={isSubmitted}
            bookName={currentBookName}
            chapterName={currentChapterName}
            onNavigate={handleNavigate}
            onSubmit={handleSubmit}
            onSubmitSection={hasSections ? handleSubmitSection : undefined}
            sectionConfigs={sectionConfigs}
            sectionQuestionRanges={sectionQuestionRanges}
            currentSectionIndex={currentSectionIndex}
            submittedSectionIndices={submittedSectionIndices}
          />
        </div>
      </div>

      {/* Right Panel — Mobile Sheet */}
      <Sheet open={isRightPanelOpen} onOpenChange={setRightPanel}>
        <SheetContent side="right" style={{ width: 288, padding: 0 }}>
          <RightPanel
            concepts={concepts}
            questions={questions}
            answers={answers}
            currentIndex={currentIndex}
            visitedIndices={visitedIndices}
            sessionType={sessionType}
            isSubmitted={isSubmitted}
            bookName={currentBookName}
            chapterName={currentChapterName}
            onNavigate={(i) => {
              handleNavigate(i)
              setRightPanel(false)
            }}
            onSubmit={handleSubmit}
            onSubmitSection={hasSections ? handleSubmitSection : undefined}
            sectionConfigs={sectionConfigs}
            sectionQuestionRanges={sectionQuestionRanges}
            currentSectionIndex={currentSectionIndex}
            submittedSectionIndices={submittedSectionIndices}
          />
        </SheetContent>
      </Sheet>

      {/* Mobile: floating button to open right panel */}
      {!isRightPanelOpen && (
        <button
          onClick={() => setRightPanel(true)}
          className="flex lg:hidden items-center justify-center"
          style={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            zIndex: 50,
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "'DM Mono', monospace",
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {Object.values(answers).filter((a) => a.selectedOption).length}/{questions.length}
        </button>
      )}

      {/* Pause Confirmation Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Mock Test?</DialogTitle>
          </DialogHeader>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Are you sure you want to pause and exit the test? Your progress will
            be saved and you can resume later from History.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPauseDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmPause}>
              <Pause style={{ width: 14, height: 14, marginRight: 4 }} />
              Pause & Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Dialog */}
      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session Stats</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div className="score-card">
                <div className="score-num" style={{ color: 'var(--accent-text)' }}>{stats.total}</div>
                <div className="score-lbl">Total Questions</div>
              </div>
              <div className="score-card">
                <div className="score-num correct">{stats.answered}</div>
                <div className="score-lbl">Answered</div>
              </div>
              <div className="score-card">
                <div className="score-num correct">{stats.correct}</div>
                <div className="score-lbl">Correct</div>
              </div>
              <div className="score-card">
                <div className="score-num" style={{ color: 'var(--accent-text)' }}>{formatTime(stats.totalTime)}</div>
                <div className="score-lbl">Time Spent</div>
              </div>
            </div>
            {stats.answered > 0 && (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
                Accuracy: {Math.round((stats.correct / stats.answered) * 100)}%
                ({stats.correct}/{stats.answered})
              </p>
            )}
            {stats.notAnswered > 0 && (
              <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--accent-text)' }}>
                {stats.notAnswered} question{stats.notAnswered > 1 ? 's' : ''} not answered
              </p>
            )}

            {/* Previous practice sessions */}
            {sessionType === 'practice' && previousSessions.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 8 }}>Previous Sessions</p>
                <div className="space-y-1.5">
                  {previousSessions.map((s) => {
                    const displayDate = s.completedAt ?? s.startedAt
                    return (
                      <div
                        key={s.id}
                        className="rounded-md px-3 py-2 text-xs"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            {new Date(displayDate).toLocaleDateString()} {new Date(displayDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                            {formatTime(s.timeElapsedSecs)}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-tertiary)' }}>
                          <span>{s.questionCount} questions</span>
                          {s.answeredCount != null && (
                            <span>{s.answeredCount} answered</span>
                          )}
                          {s.correctCount != null && s.answeredCount != null && s.answeredCount > 0 && (
                            <span style={{ color: 'var(--success)' }}>
                              {Math.round((s.correctCount / s.answeredCount) * 100)}% accuracy
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowStatsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report a Problem Dialog */}
      <ReportProblemModal
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        question={currentQuestion ?? null}
        sessionId={sessionId}
      />
    </div>
  )
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
