'use client'

import Link from 'next/link'
import type { Book } from '@/types'

interface BookCardProps {
  book: Book
  examSlug: string
  chapterCount?: number
  questionCount?: number
  progressPercent?: number
  accentIndex?: number
  onMockClick?: (bookId: string) => void
}

const BOOK_ACCENTS = ['#5b6af5', '#34c27a', '#f59e3a', '#e5534b']
export const BOOK_ACCENT_COUNT = BOOK_ACCENTS.length

export function BookCard({ book, examSlug, chapterCount, questionCount, progressPercent = 0, accentIndex, onMockClick }: BookCardProps) {
  // Use explicit accentIndex if provided (guarantees even cycling), otherwise fall back to UUID hash
  const index = accentIndex ?? (book.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % BOOK_ACCENTS.length)
  const accentColor = BOOK_ACCENTS[index]

  return (
    <div
      className="book-card"
      style={{ '--book-accent': accentColor, animation: 'fadeIn 180ms ease-out' } as React.CSSProperties}
    >
      <Link href={`/${examSlug}/${book.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{book.name}</h3>

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>
          {chapterCount != null && <span>{chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}</span>}
          {questionCount != null && <span>{questionCount} questions</span>}
        </div>
      </Link>

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
        <Link href={`/${examSlug}/${book.slug}`} className="btn-secondary" style={{ textDecoration: 'none' }}>
          Browse
        </Link>
        {onMockClick && (
          <button
            className="btn-primary"
            onClick={(e) => {
              e.preventDefault()
              onMockClick(book.id)
            }}
          >
            Mock Test
          </button>
        )}
      </div>
    </div>
  )
}
