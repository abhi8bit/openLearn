'use client'

import { KaTeXRenderer } from '@/components/shared/KaTeXRenderer'
import { TextWithInlineImages } from '@/components/shared/TextWithInlineImages'
import type { Concept, Question, Option, LocalAnswer } from '@/types'

interface QuestionCardProps {
  isConcept: boolean
  concept?: Concept
  question?: Question
  answer?: LocalAnswer
  storagePrefix?: string | null
  showSolution: boolean
  onSelectOption: (optionId: string, isCorrect: boolean) => void
}

export function QuestionCard({
  isConcept,
  concept,
  question,
  answer,
  storagePrefix,
  showSolution,
  onSelectOption,
}: QuestionCardProps) {
  if (isConcept && concept) {
    return (
      <div className="space-y-4">
        <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          {concept.title || 'Concept'}
        </h3>
        {concept.content && (
          <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
            <KaTeXRenderer content={concept.content} />
          </div>
        )}
      </div>
    )
  }

  if (!question) return null

  const questionNum = question.question_number ?? ''
  const selectedOptionId = answer?.selectedOption ?? null
  const isAnswerCorrect = answer?.isCorrect ?? null
  const hasAnswered = selectedOptionId != null

  // Pad options to 4 if fewer exist
  const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']
  const displayOptions = [...question.options]
  while (displayOptions.length < 4) {
    const nextLabel = LABELS[displayOptions.length] ?? '?'
    displayOptions.push({
      id: `_pad_${displayOptions.length}`,
      question_id: question.id,
      option_label: nextLabel,
      option_text: 'None of the above',
      is_correct: false,
      display_order: displayOptions.length + 1,
      created_at: null,
    } as Option)
  }

  return (
    <div className="space-y-4">
      {/* Question header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace" }}>
          Q{questionNum}
        </span>
      </div>

      {/* Question text — images rendered inline where markdown appears */}
      {question.question_text && (
        <div style={{ marginTop: 4, fontSize: 16, color: 'var(--text-primary)' }}>
          <TextWithInlineImages
            text={question.question_text}
            storagePrefix={storagePrefix ?? undefined}
          />
        </div>
      )}

      {/* Options — each option text may also contain images */}
      <div className="space-y-2">
        {displayOptions.map((opt) => {
          const isSynthetic = opt.id.startsWith('_pad_')
          const isSelected = selectedOptionId === opt.id
          const isCorrectOption = opt.is_correct === true
          const showResult = showSolution

          let optionClass = 'option'
          if (showResult && isCorrectOption) {
            optionClass = 'option correct'
          } else if (showResult && isSelected && !isCorrectOption) {
            optionClass = 'option wrong'
          } else if (isSelected) {
            optionClass = 'option'
          } else if (isSynthetic) {
            optionClass = 'option'
          }

          let badgeExtraStyle: React.CSSProperties = {}
          if (isSelected && !showResult) {
            badgeExtraStyle = { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
          }

          return (
            <button
              key={opt.id}
              onClick={() => {
                if (!isSynthetic) onSelectOption(opt.id, isCorrectOption)
              }}
              disabled={showResult || isSynthetic}
              className={optionClass}
              style={{
                cursor: showResult || isSynthetic ? 'default' : 'pointer',
                borderStyle: isSynthetic ? 'dashed' : 'solid',
                opacity: isSynthetic ? 0.5 : 1,
                ...(isSelected && !showResult ? { borderColor: 'var(--accent)', background: 'var(--accent-subtle)' } : {}),
              }}
            >
              <span className="option-badge" style={badgeExtraStyle}>
                {opt.option_label}
              </span>
              <div style={{ flex: 1 }}>
                <TextWithInlineImages
                  text={opt.option_text ?? ''}
                  storagePrefix={storagePrefix ?? undefined}
                />
              </div>
            </button>
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
          {question.question_source && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Source: {question.question_source}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
