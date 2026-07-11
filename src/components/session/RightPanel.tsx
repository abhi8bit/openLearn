'use client'

import { useState, useMemo } from 'react'
import { NavGrid } from './NavGrid'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CheckCircle2, Flag, XCircle, MinusCircle, Lock } from 'lucide-react'
import type { Concept, Question, LocalAnswer, SessionType, SectionConfig } from '@/types'

interface RightPanelProps {
  concepts: Concept[]
  questions: Question[]
  answers: Record<string, LocalAnswer>
  currentIndex: number
  visitedIndices?: Set<number>
  sessionType: SessionType
  isSubmitted: boolean
  bookName?: string | null
  chapterName?: string | null
  onNavigate: (index: number) => void
  onSubmit: () => void
  onSubmitSection?: () => void
  // Section support
  sectionConfigs?: SectionConfig[]
  sectionQuestionRanges?: Array<{ start: number; end: number }>
  currentSectionIndex?: number
  submittedSectionIndices?: Set<number>
}

type ResultFilter = 'all' | 'correct' | 'wrong' | 'skipped'

export function RightPanel({
  concepts,
  questions,
  answers,
  currentIndex,
  visitedIndices,
  sessionType,
  isSubmitted,
  bookName,
  chapterName,
  onNavigate,
  onSubmit,
  onSubmitSection,
  sectionConfigs = [],
  sectionQuestionRanges = [],
  currentSectionIndex = 0,
  submittedSectionIndices,
}: RightPanelProps) {
  const conceptCount = concepts.length
  const totalQuestions = questions.length
  const hasSections = sectionConfigs.length > 0 && sectionQuestionRanges.length > 0

  const answeredCount = Object.values(answers).filter((a) => a.selectedOption).length
  const markedCount = Object.values(answers).filter((a) => a.isMarked).length
  const correctCount = questions.filter((q) => answers[q.id]?.isCorrect).length
  const wrongCount = questions.filter(
    (q) => answers[q.id]?.selectedOption && !answers[q.id]?.isCorrect
  ).length
  const skippedCount = totalQuestions - answeredCount

  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')

  const filteredQuestions = questions.filter((q) => {
    const a = answers[q.id]
    if (resultFilter === 'correct') return a?.isCorrect === true
    if (resultFilter === 'wrong') return a?.selectedOption && !a?.isCorrect
    if (resultFilter === 'skipped') return !a?.selectedOption
    return true
  })

  // Per-section stats for sectioned exams
  const sectionStats = useMemo(() => {
    if (!hasSections) return null
    return sectionConfigs.map((config, i) => {
      const range = sectionQuestionRanges[i]
      if (!range) return { answered: 0, total: 0, correct: 0, wrong: 0 }

      const sectionQuestions = questions.slice(range.start, range.end)
      const answered = sectionQuestions.filter((q) => answers[q.id]?.selectedOption).length
      const correct = sectionQuestions.filter((q) => answers[q.id]?.isCorrect).length
      const wrong = sectionQuestions.filter((q) => answers[q.id]?.selectedOption && !answers[q.id]?.isCorrect).length

      return { answered, total: sectionQuestions.length, correct, wrong }
    })
  }, [sectionConfigs, sectionQuestionRanges, questions, answers, hasSections])

  // Current section info
  const currentSection = hasSections ? sectionConfigs[currentSectionIndex] : null
  const currentRange = hasSections ? sectionQuestionRanges[currentSectionIndex] : null
  const currentSectionAnswered = currentRange
    ? questions.slice(currentRange.start, currentRange.end).filter((q) => answers[q.id]?.selectedOption).length
    : 0
  const currentSectionTotal = currentRange ? currentRange.end - currentRange.start : 0

  // Check if current section is fully submitted
  const isCurrentSectionSubmitted = submittedSectionIndices?.has(currentSectionIndex) ?? false

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg-surface)' }}>
      {/* Stats — fixed at top */}
      <div style={{ padding: 16 }}>
        {/* Section info banner (sectioned exam, not submitted) */}
        {hasSections && !isSubmitted && currentSection && (
          <div
            className="rounded-lg p-2.5 mb-3"
            style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent)' }}
          >
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-text)' }}>
                Section {['I', 'II', 'III', 'IV', 'V', 'VI'][currentSectionIndex] ?? currentSectionIndex + 1}
              </span>
              <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--accent-text)' }}>
                {currentSectionAnswered}/{currentSectionTotal}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {currentSection.label}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {currentSection.timeLimitMinutes} min · {currentSection.totalMarks} marks
            </p>
          </div>
        )}

        {/* Post-submission summary */}
        {isSubmitted && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            <button
              onClick={() => setResultFilter('correct')}
              className="score-card"
              style={{
                cursor: 'pointer',
                border: resultFilter === 'correct' ? '1px solid var(--success)' : '1px solid transparent',
              }}
            >
              <div className="score-num correct">{correctCount}</div>
              <div className="score-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <CheckCircle2 style={{ width: 10, height: 10 }} />
                Correct
              </div>
            </button>
            <button
              onClick={() => setResultFilter('wrong')}
              className="score-card"
              style={{
                cursor: 'pointer',
                border: resultFilter === 'wrong' ? '1px solid var(--danger)' : '1px solid transparent',
              }}
            >
              <div className="score-num wrong">{wrongCount}</div>
              <div className="score-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <XCircle style={{ width: 10, height: 10 }} />
                Wrong
              </div>
            </button>
            <button
              onClick={() => setResultFilter('skipped')}
              className="score-card"
              style={{
                cursor: 'pointer',
                border: resultFilter === 'skipped' ? '1px solid var(--border-medium)' : '1px solid transparent',
              }}
            >
              <div className="score-num" style={{ color: 'var(--text-tertiary)' }}>{skippedCount}</div>
              <div className="score-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <MinusCircle style={{ width: 10, height: 10 }} />
                Skipped
              </div>
            </button>
            {resultFilter !== 'all' && (
              <button
                onClick={() => setResultFilter('all')}
                className="col-span-3 text-xs mt-1"
                style={{ color: 'var(--accent-text)' }}
              >
                Show all questions
              </button>
            )}
          </div>
        )}

        {/* Pre-submission stats */}
        {!isSubmitted && !hasSections && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
            <div className="score-card">
              <div className="score-num correct">{answeredCount}/{totalQuestions}</div>
              <div className="score-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <CheckCircle2 style={{ width: 10, height: 10 }} />
                Answered
              </div>
            </div>
            <div className="score-card">
              <div className="score-num" style={{ color: 'var(--accent-text)' }}>{markedCount}</div>
              <div className="score-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Flag style={{ width: 10, height: 10 }} />
                Marked
              </div>
            </div>
            <div className="score-card">
              <div className="score-num" style={{ color: 'var(--text-tertiary)' }}>{totalQuestions - answeredCount}</div>
              <div className="score-lbl">Left</div>
            </div>
          </div>
        )}
      </div>

      {/* Current question category */}
      {(bookName || chapterName) && !hasSections && sessionType !== 'mock' && (
        <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {bookName && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
              {bookName}
            </span>
          )}
          {chapterName && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              {chapterName}
            </span>
          )}
        </div>
      )}

      <div style={{ height: 1, background: 'var(--border-subtle)' }} />

      {/* Nav Grid — scrollable middle section */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full p-4">
          <NavGrid
            concepts={concepts}
            questions={isSubmitted ? filteredQuestions : questions}
            answers={answers}
            currentIndex={currentIndex}
            visitedIndices={visitedIndices}
            showResults={isSubmitted}
            onNavigate={onNavigate}
            hideCategories={sessionType === 'mock'}
            sectionConfigs={sectionConfigs}
            sectionQuestionRanges={sectionQuestionRanges}
            currentSectionIndex={currentSectionIndex}
            submittedSectionIndices={submittedSectionIndices}
          />
        </ScrollArea>
      </div>

      <div style={{ height: 1, background: 'var(--border-subtle)' }} />

      {/* Bottom actions */}
      {sessionType === 'mock' && !isSubmitted && (
        <div style={{ padding: 16 }}>
          {hasSections && onSubmitSection ? (
            <button
              className="btn-accent"
              onClick={onSubmitSection}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isCurrentSectionSubmitted ? 'Submit Mock Test' : `Submit Section ${['I', 'II', 'III', 'IV', 'V', 'VI'][currentSectionIndex] ?? currentSectionIndex + 1}`}
            </button>
          ) : (
            <button
              className="btn-accent"
              onClick={onSubmit}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Submit Mock Test
            </button>
          )}
        </div>
      )}
    </div>
  )
}
