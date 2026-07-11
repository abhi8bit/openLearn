'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { LocalAnswer, Concept, Question, SectionConfig } from '@/types'

interface NavGridProps {
  concepts: Concept[]
  questions: Question[]
  answers: Record<string, LocalAnswer>
  currentIndex: number
  visitedIndices?: Set<number>
  showResults?: boolean
  onNavigate: (index: number) => void
  // When true, don't split questions by category — render one flat grid (mock mode)
  hideCategories?: boolean
  // Section support
  sectionConfigs?: SectionConfig[]
  sectionQuestionRanges?: Array<{ start: number; end: number }>
  currentSectionIndex?: number
  submittedSectionIndices?: Set<number>
}

export function NavGrid({
  concepts,
  questions,
  answers,
  currentIndex,
  visitedIndices,
  showResults = false,
  onNavigate,
  hideCategories = false,
  sectionConfigs = [],
  sectionQuestionRanges = [],
  currentSectionIndex = 0,
  submittedSectionIndices,
}: NavGridProps) {
  const conceptCount = concepts.length
  const hasSections = sectionConfigs.length > 0 && sectionQuestionRanges.length > 0

  const conceptBlocks = useMemo(() => {
    const result: { label: string; index: number; color: string }[] = []
    for (let i = 0; i < conceptCount; i++) {
      const isVisited = visitedIndices?.has(i)
      result.push({
        label: `C${i + 1}`,
        index: i,
        color: isVisited ? 'q-btn active' : 'q-btn',
      })
    }
    return result
  }, [conceptCount, visitedIndices])

  // Section-grouped blocks (for exam mode)
  const sectionGroups = useMemo(() => {
    if (!hasSections) return null

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI']
    const groups: {
      label: string
      sectionIndex: number
      isCurrent: boolean
      isSubmitted: boolean
      isLocked: boolean
      isInaccessible: boolean
      blocks: { label: string; index: number; color: string; icon: string | null }[]
    }[] = []

    for (let si = 0; si < sectionConfigs.length; si++) {
      const range = sectionQuestionRanges[si]
      if (!range) continue

      const isCurrent = si === currentSectionIndex
      const sectionSubmitted = submittedSectionIndices?.has(si) ?? false
      // Inaccessible = submitted but entire mock not yet submitted (no review until final submit)
      const isInaccessible = sectionSubmitted && !showResults
      const isLocked = !isCurrent && !sectionSubmitted && !showResults

      const blocks: { label: string; index: number; color: string; icon: string | null }[] = []

      // Skip rendering blocks for inaccessible sections (submitted, not yet final)
      if (isInaccessible) {
        groups.push({
          label: `Section ${['I', 'II', 'III', 'IV', 'V', 'VI'][si] ?? si + 1}: ${sectionConfigs[si].label}`,
          sectionIndex: si,
          isCurrent: false,
          isSubmitted: true,
          isLocked: false,
          isInaccessible: true,
          blocks: [],
        })
        continue
      }

      for (let qi = range.start; qi < range.end && qi < questions.length; qi++) {
        const q = questions[qi]
        const answer = answers[q.id]
        const idx = conceptCount + qi

        const label = `Q${qi - range.start + 1}`
        let color = 'q-btn'
        let icon: string | null = null

        if (showResults) {
          if (answer?.isCorrect) {
            color = 'q-btn correct'
            icon = '✓'
          } else if (answer?.selectedOption && !answer.isCorrect) {
            color = 'q-btn wrong'
            icon = '✗'
          } else {
            color = 'q-btn skipped'
          }
        } else if (isLocked) {
          color = 'q-btn'
        } else if (answer?.isMarked && answer?.selectedOption) {
          color = 'q-btn active'
        } else if (answer?.isMarked) {
          color = 'q-btn active'
        } else if (answer?.selectedOption) {
          color = 'q-btn correct'
        } else if (visitedIndices?.has(idx)) {
          color = 'q-btn wrong'
        }

        blocks.push({ label, index: idx, color, icon })
      }

      groups.push({
        label: `Section ${romanNumerals[si] ?? si + 1}: ${sectionConfigs[si].label}`,
        sectionIndex: si,
        isCurrent,
        isSubmitted: sectionSubmitted,
        isLocked,
        isInaccessible: false,
        blocks,
      })
    }

    return groups
  }, [sectionConfigs, sectionQuestionRanges, currentSectionIndex, submittedSectionIndices, questions, answers, conceptCount, visitedIndices, showResults, hasSections])

  // Category-grouped blocks (for non-section mode)
  const questionBlockGroups = useMemo(() => {
    if (hasSections) return null

    const groups: { category: string | null; blocks: { label: string; index: number; color: string; icon: string | null }[] }[] = []
    let currentCategory: string | null = null
    let currentGroup: typeof groups[0]['blocks'] = []

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const answer = answers[q.id]
      const idx = conceptCount + i

      const cat = hideCategories ? null : (q.category ?? null)
      if (cat !== currentCategory) {
        if (currentGroup.length > 0) {
          groups.push({ category: currentCategory, blocks: currentGroup })
        }
        currentCategory = cat
        currentGroup = []
      }

      const label = `Q${i + 1}`
      let color = 'q-btn'
      let icon: string | null = null

      if (showResults) {
        if (answer?.isCorrect) {
          color = 'q-btn correct'
          icon = '✓'
        } else if (answer?.selectedOption && !answer.isCorrect) {
          color = 'q-btn wrong'
          icon = '✗'
        } else {
          color = 'q-btn skipped'
        }
      } else if (answer?.isMarked && answer?.selectedOption) {
        color = 'q-btn active'
      } else if (answer?.isMarked) {
        color = 'q-btn active'
      } else if (answer?.selectedOption) {
        color = 'q-btn correct'
      } else if (visitedIndices?.has(idx)) {
        color = 'q-btn wrong'
      }

      currentGroup.push({ label, index: idx, color, icon })
    }
    if (currentGroup.length > 0) {
      groups.push({ category: currentCategory, blocks: currentGroup })
    }
    return groups
  }, [questions, answers, conceptCount, visitedIndices, showResults, hasSections, hideCategories])

  return (
    <div className="space-y-4">
      {conceptBlocks.length > 0 && (
        <div>
          <p style={{ marginBottom: 6, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
            Concepts
          </p>
          <div className="question-nav">
            {conceptBlocks.map((block) => (
              <button
                key={block.index}
                onClick={() => onNavigate(block.index)}
                className={cn(
                  block.color,
                  block.index === currentIndex && 'active'
                )}
                style={{
                  aspectRatio: '1',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                {block.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {conceptBlocks.length > 0 && (sectionGroups || questionBlockGroups) && (
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />
      )}

      {/* Section-grouped view */}
      {sectionGroups && sectionGroups.map((group) => (
        <div key={group.sectionIndex} style={{ opacity: group.isLocked && !showResults ? 0.5 : 1 }}>
          <div className="flex items-center gap-2 mb-1.5">
            <p style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: group.isCurrent ? 'var(--accent-text)' : 'var(--text-tertiary)',
              flex: 1,
            }}>
              {group.label}
            </p>
            {group.isSubmitted && !showResults && (
              <span style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 99,
                background: 'var(--success-subtle)',
                color: 'var(--success)',
                fontWeight: 600,
              }}>
                Submitted
              </span>
            )}
            {group.isCurrent && !showResults && (
              <span style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 99,
                background: 'var(--accent-subtle)',
                color: 'var(--accent-text)',
                fontWeight: 600,
              }}>
                Active
              </span>
            )}
          </div>
          {/* Inaccessible sections: no question grid, just the header */}
          {group.isInaccessible ? (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '4px 0' }}>
              Section submitted — review available after completing all sections
            </p>
          ) : (
          <div className="question-nav">
            {group.blocks.map((block) => (
              <button
                key={block.index}
                onClick={() => {
                  if (!group.isLocked || showResults) onNavigate(block.index)
                }}
                disabled={group.isLocked && !showResults}
                className={cn(
                  block.color,
                  block.index === currentIndex && 'active',
                  group.isLocked && !showResults && 'opacity-40 cursor-not-allowed'
                )}
                style={{
                  aspectRatio: '1',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontFamily: "'DM Mono', monospace",
                  position: 'relative',
                  cursor: group.isLocked && !showResults ? 'not-allowed' : 'pointer',
                }}
              >
                {block.label}
                {block.icon && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: 'var(--bg-primary)',
                      fontSize: 8,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: block.icon === '✓' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {block.icon}
                  </span>
                )}
              </button>
            ))}
          </div>
          )}
        </div>
      ))}

      {/* Category-grouped view (non-section mode) */}
      {questionBlockGroups && questionBlockGroups.length > 0 && (
        <div>
          <p style={{ marginBottom: 6, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
            Questions
          </p>
          {questionBlockGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 12 }}>
              {group.category && (
                <p style={{ marginBottom: 4, fontSize: 9, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                  {group.category.replace(/_/g, ' ')}
                </p>
              )}
              <div className="question-nav">
                {group.blocks.map((block) => (
                  <button
                    key={block.index}
                    onClick={() => onNavigate(block.index)}
                    className={cn(
                      block.color,
                      block.index === currentIndex && 'active'
                    )}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      fontFamily: "'DM Mono', monospace",
                      position: 'relative',
                    }}
                  >
                    {block.label}
                    {block.icon && (
                      <span
                        style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: 'var(--bg-primary)',
                          fontSize: 8,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: block.icon === '✓' ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        {block.icon}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
