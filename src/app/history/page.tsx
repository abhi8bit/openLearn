'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '@/lib/dexie/db'
import { Skeleton } from '@/components/ui/skeleton'
import { Play, Trash2 } from 'lucide-react'
import type { LocalSession } from '@/types'

type FilterTab = 'practice' | 'mock'

interface EnrichedSession extends LocalSession {
  displayName: string
}

function mistakeFilterLabel(filters: string[]): string {
  const labels: Record<string, string> = {
    incorrect: 'Wrong',
    skipped: 'Skipped',
    correct: 'Correct',
    unseen: 'Unseen',
    all: 'All',
    marked: 'Marked',
  }
  const names = filters.map((f) => labels[f] ?? f)
  return names.length > 0 ? names.join(' + ') : 'Mistakes'
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<EnrichedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<FilterTab>('practice')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const all = await db.sessions.toArray()
      all.sort((a, b) => b.startedAt - a.startedAt)

      const enriched = await Promise.all(
        all.map(async (s) => {
          let displayName = s.scopeId ?? 'Session'

          if (s.scopeId && s.scope === 'chapter') {
            const chapter = await db.chapters.get(s.scopeId)
            if (chapter) displayName = chapter.name
          } else if (s.scopeId && s.scope === 'book') {
            const book = await db.books.get(s.scopeId)
            if (book) displayName = book.name
          } else if (s.scopeId && s.scope === 'exam') {
            const exams = await db.exams.toArray()
            const exam = exams.find((e) => e.id === s.scopeId)
            if (exam) displayName = exam.name
          }

          return { ...s, displayName }
        })
      )

      setSessions(enriched)
      setLoading(false)
    }
    load()
  }, [])

  async function handleDelete(sessionId: string) {
    setDeleting(sessionId)
    await db.sessions.delete(sessionId)
    const answers = await db.answers.toArray()
    const sessionAnswers = answers.filter((a) => a.sessionId === sessionId)
    for (const a of sessionAnswers) {
      await db.answers.delete(a.id)
    }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    setDeleting(null)
  }

  const filtered = sessions.filter((s) => s.sessionType === tab)

  const practiceCount = sessions.filter((s) => s.sessionType === 'practice').length
  const mockCount = sessions.filter((s) => s.sessionType === 'mock').length

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <section
        className="mx-auto max-w-3xl px-4"
        style={{ paddingTop: 32, paddingBottom: 32, animation: 'fadeIn 180ms ease-out' }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>History</h1>
        <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-secondary)' }}>
          Past practice and mock test sessions.
        </p>

        {/* Tabs */}
        <div
          className="mt-6 flex gap-1 rounded-lg p-1"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <button
            onClick={() => setTab('practice')}
            className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: tab === 'practice' ? 'var(--bg-surface)' : 'transparent',
              color: tab === 'practice' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: tab === 'practice' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            Practice ({practiceCount})
          </button>
          <button
            onClick={() => setTab('mock')}
            className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: tab === 'mock' ? 'var(--bg-surface)' : 'transparent',
              color: tab === 'mock' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: tab === 'mock' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            Mock Tests ({mockCount})
          </button>
        </div>

        {loading && (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="mt-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No {tab === 'practice' ? 'practice' : 'mock test'} sessions yet.
          </p>
        )}

        {!loading && filtered.length > 0 && (
          <div className="mt-6 space-y-3">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="exam-card"
                style={{ cursor: 'default' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.displayName}
                      </h3>
                      {s.sessionType === 'mock' && s.isActive && !s.isSubmitted && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-subtle)', color: 'var(--accent-text)', fontWeight: 500 }}>
                          In Progress
                        </span>
                      )}
                      {s.sessionType === 'mock' && s.isSubmitted && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--success-subtle)', color: 'var(--success)', fontWeight: 500 }}>
                          Completed
                        </span>
                      )}
                      {s.settings?.kind === 'mistakes' && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--danger-subtle)', color: 'var(--danger)', fontWeight: 500 }}>
                          Mistakes: {mistakeFilterLabel(s.settings.filters ?? (s.settings.filter ? [s.settings.filter] : []))}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace" }}>
                      <span>{timeAgo(s.startedAt)}</span>
                      <span>{s.questionIds.length} questions</span>
                      {s.timeLimitSecs && (
                        <span>{Math.floor(s.timeLimitSecs / 60)}m limit</span>
                      )}
                      {s.timeElapsedSecs > 0 && (
                        <span>
                          {Math.floor(s.timeElapsedSecs / 60)}m {s.timeElapsedSecs % 60}s spent
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {s.sessionType === 'practice' || (s.isActive && !s.isSubmitted) ? (
                      <Link href={`/session/${s.id}`} className="btn-accent" style={{ textDecoration: 'none', fontSize: 12 }}>
                        <Play style={{ width: 14, height: 14 }} />
                        Resume
                      </Link>
                    ) : (
                      <Link href={`/session/${s.id}`} className="btn-secondary" style={{ textDecoration: 'none', fontSize: 12, padding: '0 16px' }}>
                        Review
                      </Link>
                    )}
                    <button
                      className="flex items-center justify-center rounded-md transition-colors"
                      style={{
                        width: 32,
                        height: 32,
                        color: 'var(--text-tertiary)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      disabled={deleting === s.id}
                      onClick={() => handleDelete(s.id)}
                    >
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
