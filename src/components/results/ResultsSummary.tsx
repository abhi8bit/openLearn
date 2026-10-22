'use client'

import type { Question, LocalAnswer, SessionType } from '@/types'

interface ResultsSummaryProps {
  questions: Question[]
  answers: Record<string, LocalAnswer>
  sessionType: SessionType
  elapsedSecs: number
  onPracticeMistakes?: (ids: string[]) => void
}

export function ResultsSummary({
  questions,
  answers,
  sessionType,
  elapsedSecs,
  onPracticeMistakes,
}: ResultsSummaryProps) {
  const total = questions.length
  const correct = questions.filter((q) => answers[q.id]?.isCorrect).length
  const wrong = questions.filter(
    (q) => answers[q.id]?.selectedOption && !answers[q.id]?.isCorrect
  ).length
  const unanswered = total - correct - wrong
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

  const minutes = Math.floor(elapsedSecs / 60)
  const seconds = elapsedSecs % 60

  // Wrong + unanswered in this attempt are the mistakes to re-practice.
  const mistakeIds = questions
    .filter((q) => {
      const a = answers[q.id]
      return !a?.selectedOption || !a.isCorrect
    })
    .map((q) => q.id)

  return (
    <div className="space-y-6">
      <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
        {sessionType === 'mock' ? 'Mock Test Results' : 'Practice Summary'}
      </h2>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="score-card">
          <div className="score-lbl">Score</div>
          <div className="score-num" style={{ color: 'var(--accent-text)' }}>
            {correct}/{total}
          </div>
        </div>

        <div className="score-card">
          <div className="score-lbl">Accuracy</div>
          <div className="score-num" style={{ color: 'var(--accent-text)' }}>{accuracy}%</div>
        </div>

        <div className="score-card">
          <div className="score-lbl">Time Taken</div>
          <div className="score-num" style={{ color: 'var(--accent-text)' }}>
            {minutes > 0 ? `${minutes}m ` : ''}{seconds}s
          </div>
        </div>

        <div className="score-card">
          <div className="score-lbl">Breakdown</div>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, marginTop: 4 }}>
            <span style={{ color: 'var(--success)' }}>{correct} correct</span>
            <span style={{ color: 'var(--danger)' }}>{wrong} wrong</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{unanswered} skipped</span>
          </div>
        </div>
      </div>

      {onPracticeMistakes && mistakeIds.length > 0 && (
        <div>
          <button className="btn-secondary" onClick={() => onPracticeMistakes(mistakeIds)}>
            Practice this test&apos;s mistakes ({mistakeIds.length})
          </button>
        </div>
      )}
    </div>
  )
}
