'use client'

import { KaTeXRenderer } from '@/components/shared/KaTeXRenderer'
import { TextWithInlineImages } from '@/components/shared/TextWithInlineImages'
import type { Question, LocalAnswer, SourceStatus } from '@/types'

function sourceStatusLabel(status: SourceStatus): string {
  switch (status) {
    case 'correct': return 'Correct'
    case 'incorrect': return 'Wrong'
    case 'skipped': return 'Skipped'
    case 'unknown': return 'Unknown'
  }
}

interface QuestionReviewProps {
  question: Question
  answer?: LocalAnswer
  storagePrefix?: string | null
  showSolution?: boolean
}

export function QuestionReview({
  question,
  answer,
  storagePrefix,
  showSolution = true,
}: QuestionReviewProps) {
  const selectedOptionId = answer?.selectedOption ?? null
  const isCorrect = answer?.isCorrect ?? null

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace" }}>
          Q{question.question_number ?? ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {answer?.isMarked && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--border-medium)', color: 'var(--accent-text)' }}>
              Marked
            </span>
          )}
          {isCorrect === true && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--success-subtle)', color: 'var(--success)' }}>
              Correct
            </span>
          )}
          {isCorrect === false && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
              Incorrect
            </span>
          )}
          {!selectedOptionId && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--border-medium)', color: 'var(--text-tertiary)' }}>
              Unanswered
            </span>
          )}
        </div>
      </div>

      {(question.source_status || question.question_source) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {question.source_status && (
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 99,
                border: '1px solid var(--border-medium)',
                color: question.source_status === 'correct'
                  ? 'var(--success)'
                  : question.source_status === 'incorrect'
                    ? 'var(--danger)'
                    : 'var(--text-tertiary)',
              }}
            >
              Originally: {sourceStatusLabel(question.source_status)}
            </span>
          )}
          {question.question_source && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {question.question_source}
            </span>
          )}
        </div>
      )}

      {/* Question text — images rendered inline */}
      {question.question_text && (
        <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          <TextWithInlineImages
            text={question.question_text}
            storagePrefix={storagePrefix ?? undefined}
          />
        </div>
      )}

      {/* Options — each may contain images */}
      <div className="space-y-1.5">
        {question.options.map((opt) => {
          const isSelected = selectedOptionId === opt.id
          const isCorrectOption = opt.is_correct === true

          let optionClass = 'option'
          if (isCorrectOption) {
            optionClass = 'option correct'
          } else if (isSelected && !isCorrectOption) {
            optionClass = 'option wrong'
          }

          return (
            <div
              key={opt.id}
              className={optionClass}
              style={{ cursor: 'default', marginBottom: 4 }}
            >
              <span className="option-badge" style={
                isCorrectOption
                  ? { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' }
                  : isSelected && !isCorrectOption
                    ? { background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }
                    : {}
              }>
                {opt.option_label}
              </span>
              <div style={{ flex: 1 }}>
                <TextWithInlineImages
                  text={opt.option_text ?? ''}
                  storagePrefix={storagePrefix ?? undefined}
                />
              </div>
              {isSelected && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>Your answer</span>}
            </div>
          )
        })}
      </div>

      {/* Solution — images rendered inline */}
      {showSolution && question.solution && (
        <div className="solution-box">
          <h4>Solution</h4>
          {question.solution.solution_text && (
            <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              <TextWithInlineImages
                text={question.solution.solution_text}
                storagePrefix={storagePrefix ?? undefined}
              />
            </div>
          )}
          {question.solution.answer_source && (
            <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Source: {question.solution.answer_source}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
