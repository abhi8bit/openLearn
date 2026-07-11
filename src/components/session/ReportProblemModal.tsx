'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { db } from '@/lib/dexie/db'
import { getDeviceId } from '@/lib/device'
import { currentUserId } from '@/lib/session/sync'
import { submitProblemReport } from '@/lib/supabase/queries'
import {
  REPORT_DESCRIPTION_MAX_LENGTH,
  REPORT_CUSTOM_TYPE_MAX_LENGTH,
} from '@/types'
import type { ProblemReportType, Question } from '@/types'

interface ReportProblemModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  question: Question | null
  sessionId: string | null
}

const PROBLEM_TYPES: { value: ProblemReportType; label: string }[] = [
  { value: 'question', label: 'Question' },
  { value: 'answer', label: 'Answer / Options' },
  { value: 'solution', label: 'Solution' },
  { value: 'image', label: 'Image' },
  { value: 'ui_ux', label: 'UI / UX' },
  { value: 'other', label: 'Other' },
]

// Client-side rate limit (a first line of defence; the DB trigger is the real
// enforcement). No more than 5 reports per rolling hour from this browser.
const CLIENT_RATE_LIMIT = 5
const CLIENT_RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_KEY = 'problem_report_times'

function recentReportCount(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    const times: number[] = raw ? JSON.parse(raw) : []
    const cutoff = Date.now() - CLIENT_RATE_WINDOW_MS
    return times.filter((t) => t > cutoff).length
  } catch {
    return 0
  }
}

function recordReportTime(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    const times: number[] = raw ? JSON.parse(raw) : []
    const cutoff = Date.now() - CLIENT_RATE_WINDOW_MS
    const next = times.filter((t) => t > cutoff)
    next.push(Date.now())
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function ReportProblemModal({
  open,
  onOpenChange,
  question,
  sessionId,
}: ReportProblemModalProps) {
  const [problemType, setProblemType] = useState<ProblemReportType>('question')
  const [customType, setCustomType] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Resolve book/exam ids from the current question's chapter (via Dexie).
  const [bookId, setBookId] = useState<string | null>(null)
  const [examId, setExamId] = useState<string | null>(null)
  const chapterId = question?.chapter_id ?? null

  // Reset form each time the modal opens.
  useEffect(() => {
    if (open) {
      setProblemType('question')
      setCustomType('')
      setDescription('')
      setStatus('idle')
      setErrorMsg(null)
    }
  }, [open])

  // Resolve related ids whenever the target chapter changes while open.
  useEffect(() => {
    if (!open || !chapterId) {
      setBookId(null)
      setExamId(null)
      return
    }
    let cancelled = false
    async function resolveIds() {
      const chapter = await db.chapters.get(chapterId!)
      if (cancelled || !chapter) return
      setBookId(chapter.book_id)
      const book = await db.books.get(chapter.book_id)
      if (!cancelled && book) setExamId(book.exam_id)
    }
    resolveIds()
    return () => { cancelled = true }
  }, [open, chapterId])

  const trimmedDescription = description.trim()
  const trimmedCustomType = customType.trim()
  const needsCustomType = problemType === 'other'
  const canSubmit =
    status !== 'submitting' &&
    trimmedDescription.length > 0 &&
    (!needsCustomType || trimmedCustomType.length > 0)

  async function handleSubmit() {
    if (!canSubmit) return

    if (recentReportCount() >= CLIENT_RATE_LIMIT) {
      setStatus('error')
      setErrorMsg("You've submitted several reports recently. Please try again later.")
      return
    }

    setStatus('submitting')
    setErrorMsg(null)

    try {
      const userId = await currentUserId()
      await submitProblemReport({
        question_id: question?.id ?? null,
        chapter_id: chapterId,
        book_id: bookId,
        exam_id: examId,
        session_id: sessionId,
        problem_type: problemType,
        custom_type: needsCustomType ? trimmedCustomType : null,
        description: trimmedDescription.slice(0, REPORT_DESCRIPTION_MAX_LENGTH),
        user_id: userId,
        device_id: userId ? null : getDeviceId(),
      })
      recordReportTime()
      setStatus('success')
      // Auto-close shortly after success.
      setTimeout(() => onOpenChange(false), 1400)
    } catch (e) {
      setStatus('error')
      setErrorMsg((e as Error).message || 'Something went wrong. Please try again.')
    }
  }

  const remaining = REPORT_DESCRIPTION_MAX_LENGTH - description.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a Problem</DialogTitle>
          <DialogDescription>
            Spotted something wrong with a question, its answer, the solution, or
            the app itself? Let us know.
          </DialogDescription>
        </DialogHeader>

        {status === 'success' ? (
          <div
            className="flex flex-col items-center gap-2 py-6 text-center"
            style={{ animation: 'fadeIn 180ms ease-out' }}
          >
            <CheckCircle2 style={{ width: 32, height: 32, color: 'var(--success)' }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              Thanks — your report was submitted.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Problem type */}
            <div>
              <p className="modal-section-label">What is the problem with?</p>
              <div className="pill-group">
                {PROBLEM_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`pill ${problemType === t.value ? 'active' : ''}`}
                    onClick={() => setProblemType(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom type (only for "Other") */}
            {needsCustomType && (
              <div>
                <p className="modal-section-label">Type of problem</p>
                <input
                  type="text"
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  maxLength={REPORT_CUSTOM_TYPE_MAX_LENGTH}
                  placeholder="e.g. Typo, wrong category, slow loading…"
                  className="w-full rounded-md px-3 py-2 text-sm"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            )}

            {/* Description */}
            <div>
              <p className="modal-section-label">Describe the problem</p>
              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value.slice(0, REPORT_DESCRIPTION_MAX_LENGTH))
                }
                maxLength={REPORT_DESCRIPTION_MAX_LENGTH}
                rows={4}
                placeholder="Tell us what looks wrong and, if you can, how it should be…"
                className="w-full rounded-md px-3 py-2 text-sm resize-none"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              <div
                className="mt-1 text-right text-xs"
                style={{ color: remaining < 50 ? 'var(--danger)' : 'var(--text-tertiary)', fontFamily: "'DM Mono', monospace" }}
              >
                {remaining}
              </div>
            </div>

            {status === 'error' && errorMsg && (
              <div
                className="flex items-start gap-2 rounded-lg p-3 text-xs"
                style={{
                  background: 'var(--danger-subtle)',
                  border: '1px solid var(--danger)',
                  color: 'var(--danger)',
                }}
              >
                <AlertCircle style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={status === 'submitting'}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {status === 'submitting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {status === 'submitting' ? 'Submitting…' : 'Submit Report'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
