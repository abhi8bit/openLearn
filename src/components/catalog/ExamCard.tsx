'use client'

import Link from 'next/link'
import type { Exam } from '@/types'

interface ExamCardProps {
  exam: Exam
  bookCount?: number
  chapterCount?: number
  questionCount?: number
  progressPercent?: number
  onMockClick?: (examId: string) => void
  onMistakesClick?: (examId: string) => void
}

export function ExamCard({ exam, bookCount, chapterCount, questionCount, progressPercent = 0, onMockClick, onMistakesClick }: ExamCardProps) {
  const comingSoon = exam.is_active === false

  return (
    <div
      className="exam-card"
      style={{ animation: 'fadeIn 180ms ease-out', position: 'relative', overflow: 'hidden' }}
      aria-disabled={comingSoon}
    >
      {comingSoon && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(13,13,15,0.2)',
            backdropFilter: 'blur(1px)',
            borderRadius: 'inherit',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-primary)',
              padding: '6px 14px',
              borderRadius: 99,
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-elevated)',
            }}
          >
            Coming soon
          </span>
        </div>
      )}

      <div style={{ opacity: comingSoon ? 0.5 : 1 }}>
        {comingSoon ? (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{exam.name}</h3>

            <div className="exam-card-stats">
              {bookCount != null && <span>{bookCount} {bookCount === 1 ? 'book' : 'books'}</span>}
              {chapterCount != null && <span>{chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}</span>}
              {questionCount != null && <span>{questionCount} questions</span>}
            </div>
          </div>
        ) : (
          <Link href={`/${exam.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{exam.name}</h3>

            <div className="exam-card-stats">
              {bookCount != null && <span>{bookCount} {bookCount === 1 ? 'book' : 'books'}</span>}
              {chapterCount != null && <span>{chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}</span>}
              {questionCount != null && <span>{questionCount} questions</span>}
            </div>
          </Link>
        )}

        {/* Progress bar */}
        <div className="progress-bar">
          {progressPercent > 0 && (
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {comingSoon ? (
            <>
              <span className="btn-secondary" aria-disabled style={{ pointerEvents: 'none', opacity: 0.6, textAlign: 'center' }}>
                Browse
              </span>
              {onMockClick && (
                <button className="btn-primary" disabled style={{ cursor: 'not-allowed', opacity: 0.6 }}>
                  Mock Test
                </button>
              )}
            </>
          ) : (
            <>
              <Link href={`/${exam.slug}`} className="btn-secondary" style={{ textDecoration: 'none' }}>
                Browse
              </Link>
              {onMockClick && (
                <button
                  className="btn-primary"
                  onClick={(e) => {
                    e.preventDefault()
                    onMockClick(exam.id)
                  }}
                >
                  Mock Test
                </button>
              )}
              {onMistakesClick && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '0 12px' }}
                  onClick={(e) => {
                    e.preventDefault()
                    onMistakesClick(exam.id)
                  }}
                  title="Practice only your wrong and skipped questions"
                >
                  Mistakes
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
