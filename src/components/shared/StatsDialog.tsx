'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getOverallStats, getExamProgress, type OverallStats, type ExamProgress } from '@/lib/dexie/cache'
import { getCachedExams } from '@/lib/dexie/cache'
import { BarChart3 } from 'lucide-react'
import type { Exam } from '@/types'

function formatTime(secs: number): string {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const h = Math.floor(m / 60)
  const mins = m % 60
  if (h > 0) return `${h}h ${mins}m`
  return `${mins}m`
}

interface StatsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StatsDialog({ open, onOpenChange }: StatsDialogProps) {
  const [stats, setStats] = useState<OverallStats | null>(null)
  const [examProgress, setExamProgress] = useState<(ExamProgress & { exam: Exam })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    async function load() {
      const [overall, exams] = await Promise.all([
        getOverallStats(),
        getCachedExams(),
      ])
      setStats(overall)

      const progressList: (ExamProgress & { exam: Exam })[] = []
      for (const exam of exams) {
        // Hide retired exams and any the user hasn't started yet
        if (exam.is_active === false) continue
        const ep = await getExamProgress(exam.id)
        if (ep.attempted === 0) continue
        progressList.push({ ...ep, exam })
      }
      setExamProgress(progressList)
      setLoading(false)
    }
    load()
  }, [open])

  const accuracy = stats && stats.totalAttempted > 0
    ? Math.round((stats.totalCorrect / stats.totalAttempted) * 100)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 style={{ width: 20, height: 20 }} />
            Your Stats
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            Loading stats...
          </div>
        )}

        {!loading && stats && (
          <div className="space-y-5">
            {/* Summary grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div className="score-card">
                <div className="score-num" style={{ color: 'var(--accent-text)', fontSize: 20 }}>{stats.totalSessions}</div>
                <div className="score-lbl">Total sessions</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
                  {stats.practiceSessions} practice · {stats.mockSessions} mock
                </div>
              </div>

              <div className="score-card">
                <div className="score-num correct" style={{ fontSize: 20 }}>{stats.totalAttempted}</div>
                <div className="score-lbl">Questions attempted</div>
                {stats.totalAttempted > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
                    {accuracy}% accuracy
                  </div>
                )}
              </div>

              <div className="score-card">
                <div className="score-num" style={{ fontSize: 20, color: 'var(--success)' }}>{stats.totalCorrect}</div>
                <div className="score-lbl">Correct answers</div>
              </div>

              <div className="score-card">
                <div className="score-num" style={{ fontSize: 20, color: 'var(--accent-text)' }}>{formatTime(stats.totalTimeSecs)}</div>
                <div className="score-lbl">Total study time</div>
              </div>
            </div>

            {/* Per-exam progress */}
            {examProgress.length > 0 && (
              <div className="space-y-2">
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)' }}>Progress by Exam</p>
                <div className="space-y-2" style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 4, marginRight: -4 }}>
                {examProgress.map((ep) => (
                  <div key={ep.exam.id} className="space-y-1">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.exam.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, marginLeft: 8, fontFamily: "'DM Mono', monospace" }}>
                        {ep.attempted}/{ep.totalQuestions} · {ep.percent}%
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${ep.percent}%` }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <span>{ep.bookCount} books</span>
                      <span>{ep.chapterCount} chapters</span>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
