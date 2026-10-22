'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSessionStore } from '@/stores/sessionStore'
import { getCachedOrFetchChapter, getPracticeSession } from '@/lib/dexie/cache'
import { Info, CheckCircle2, Clock, FileText, Trash2 } from 'lucide-react'
import type { Chapter, ChapterStats } from '@/types'

function formatTime(secs: number): string {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

interface ChapterCardProps {
  chapter: Chapter
  loaded: boolean
  onLoad: (chapterId: string) => Promise<void>
  stats: ChapterStats | null
  onMockClick?: (chapterId: string) => void
  onMistakesClick?: (chapterId: string) => void
  onDelete?: (chapterId: string) => Promise<void>
  progressPercent?: number
  sourceCounts?: Pick<Chapter, 'source_correct_count' | 'source_incorrect_count' | 'source_skipped_count' | 'source_unknown_count'>
}

export function ChapterCard({ chapter, loaded, onLoad, stats, onMockClick, onMistakesClick, onDelete, progressPercent = 0, sourceCounts }: ChapterCardProps) {
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const router = useRouter()
  const initSession = useSessionStore((s) => s.initSession)

  const outcomes = {
    correct: sourceCounts?.source_correct_count ?? chapter.source_correct_count ?? 0,
    incorrect: sourceCounts?.source_incorrect_count ?? chapter.source_incorrect_count ?? 0,
    skipped: sourceCounts?.source_skipped_count ?? chapter.source_skipped_count ?? 0,
    unknown: sourceCounts?.source_unknown_count ?? chapter.source_unknown_count ?? 0,
  }
  const hasMistakes = outcomes.incorrect + outcomes.skipped > 0

  // Animate progress bar from 0 on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setAnimatedProgress(progressPercent)
    })
    return () => cancelAnimationFrame(timer)
  }, [progressPercent])

  async function startPractice() {
    setLoading(true)
    try {
      const existing = await getPracticeSession(chapter.id)
      if (existing) {
        router.push(`/session/${existing.id}`)
        setLoading(false)
        return
      }

      const data = await getCachedOrFetchChapter(chapter.id)
      const sessionId = crypto.randomUUID()
      await initSession(sessionId, {
        scope: 'chapter',
        sessionType: 'practice',
        examId: '',
        bookId: chapter.book_id,
        chapterId: chapter.id,
        questionIds: data.questions.map((q) => q.id),
      }, data)
      router.push(`/session/${sessionId}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleLoad() {
    setLoading(true)
    try {
      await onLoad(chapter.id)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete(chapter.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div
        className="chapter-card"
        style={{
          opacity: loaded ? 1 : 0.8,
          animation: 'fadeIn 180ms ease-out',
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={startPractice}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              startPractice()
            }
          }}
          aria-disabled={loading}
          style={{ cursor: loading ? 'default' : 'pointer' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {chapter.display_order != null && (
                <div className="chapter-number flex items-center gap-2">
                  <span>{String(chapter.display_order).padStart(2, '0')}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 400,
                      fontFamily: "'DM Mono', monospace",
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {chapter.slug}
                  </span>
                </div>
              )}
              <div className="chapter-name">{chapter.name}</div>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setInfoOpen(true)
              }}
              className="flex items-center justify-center rounded-md transition-colors"
              style={{ width: 28, height: 28, color: 'var(--text-tertiary)', flexShrink: 0 }}
            >
              <Info style={{ width: 14, height: 14 }} />
            </button>
          </div>

          <div className="chapter-stats">
            {chapter.concept_count != null && <span>{chapter.concept_count} concepts</span>}
            {chapter.concept_count != null && chapter.question_count != null && <span> · </span>}
            {chapter.question_count != null && <span>{chapter.question_count} questions</span>}
            {(outcomes.correct > 0 || outcomes.incorrect > 0 || outcomes.skipped > 0 || outcomes.unknown > 0) && (
              <span
                title="Original outcomes from the source test"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                {outcomes.correct > 0 && <span style={{ color: 'var(--success)' }}>✓ {outcomes.correct}</span>}
                {outcomes.incorrect > 0 && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>✗ {outcomes.incorrect}</span>}
                {outcomes.skipped > 0 && <span style={{ marginLeft: 6 }}>— {outcomes.skipped}</span>}
                {outcomes.unknown > 0 && <span style={{ marginLeft: 6 }}>? {outcomes.unknown}</span>}
              </span>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center justify-center rounded-md transition-colors"
                style={{ width: 28, height: 28, color: 'var(--text-tertiary)', flexShrink: 0, marginLeft: 'auto' }}
                title="Delete chapter data"
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.min(animatedProgress, 100)}%` }}
          />
        </div>

        <div className="chapter-actions">
          {!loaded ? (
            <button
              className="btn-secondary"
              disabled={loading}
              onClick={handleLoad}
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
                ...(loading
                  ? { borderColor: 'var(--success)', color: 'var(--success)' }
                  : {}),
              }}
            >
              {/* Green progress fill that sweeps left-to-right during load */}
              {loading && (
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--success-subtle)',
                    animation: 'loadFill 1.6s ease-in-out infinite',
                    zIndex: 0,
                  }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>
                {loading ? 'Loading...' : 'Load Chapter'}
              </span>
            </button>
          ) : (
            <>
              {stats?.practiceSessionId ? (
                <button
                  className="btn-secondary"
                  disabled={loading}
                  onClick={() => router.push(`/session/${stats.practiceSessionId}`)}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Loading...' : 'Resume'}
                </button>
              ) : (
                <button
                  className="btn-primary"
                  disabled={loading}
                  onClick={startPractice}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Loading...' : 'Practice'}
                </button>
              )}
              <button
                className="btn-primary"
                disabled={loading}
                onClick={() => onMockClick?.(chapter.id)}
                style={{ flex: 1 }}
              >
                Mock Test
              </button>
            </>
          )}
        </div>

        {hasMistakes && onMistakesClick && (
          <button
            className="btn-secondary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => onMistakesClick(chapter.id)}
          >
            Practice mistakes (✗ + —)
          </button>
        )}
      </div>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{chapter.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {chapter.concept_count != null && (
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{chapter.concept_count}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Concepts</div>
                </div>
              )}
              {chapter.question_count != null && (
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{chapter.question_count}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Questions</div>
                </div>
              )}
            </div>

            {stats && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Your Activity</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3" style={{ background: 'var(--success-subtle)' }}>
                    <div className="flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                      <CheckCircle2 style={{ width: 14, height: 14 }} />
                      <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{stats.questionsAttempted}</span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Q&apos;s attempted</div>
                    {stats.totalPracticeTimeSecs > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <Clock style={{ width: 12, height: 12 }} />
                        {formatTime(stats.totalPracticeTimeSecs)}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg p-3" style={{ background: 'var(--accent-subtle)' }}>
                    <div className="flex items-center gap-1.5" style={{ color: 'var(--accent-text)' }}>
                      <FileText style={{ width: 14, height: 14 }} />
                      <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{stats.mockSessions}</span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Mock tests</div>
                    {stats.totalMockTimeSecs > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <Clock style={{ width: 12, height: 12 }} />
                        {formatTime(stats.totalMockTimeSecs)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
