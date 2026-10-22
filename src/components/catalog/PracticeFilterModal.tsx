'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { selectQuestions } from '@/lib/session/selection'
import { currentUserId } from '@/lib/session/sync'
import { getDeviceId } from '@/lib/device'
import type { QuestionFilter } from '@/types'

type MistakeMode = 'all' | 'incorrect' | 'skipped' | 'incorrect_skipped' | 'correct' | 'unseen'

const MAX_COUNT = 200
const DEFAULT_COUNT = 25

interface PracticeFilterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: 'chapter' | 'book' | 'exam'
  title: string
  chapterIds: string[]
  examId: string
  bookId: string | null
  chapterId: string | null
  counts: { incorrect: number; skipped: number; correct: number; unseen: number; all: number }
  onStart: (filter: QuestionFilter, ids: string[], filters?: QuestionFilter[]) => void | Promise<void>
}

export function PracticeFilterModal({
  open,
  onOpenChange,
  scope,
  title,
  chapterIds,
  examId,
  bookId,
  chapterId,
  counts,
  onStart,
}: PracticeFilterModalProps) {
  const [mode, setMode] = useState<MistakeMode>('incorrect')
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [shuffle, setShuffle] = useState(false)
  const [starting, setStarting] = useState(false)

  const availableFor = (m: MistakeMode): number => {
    switch (m) {
      case 'all': return counts.all
      case 'incorrect': return counts.incorrect
      case 'skipped': return counts.skipped
      case 'incorrect_skipped': return counts.incorrect + counts.skipped
      case 'correct': return counts.correct
      case 'unseen': return counts.unseen
    }
  }

  const available = availableFor(mode)
  const resolvedCount = Math.min(Math.max(count || DEFAULT_COUNT, 0), available, MAX_COUNT)

  useEffect(() => {
    if (!open) return
    // Default to the first non-empty mistake bucket.
    const next: MistakeMode =
      counts.incorrect > 0 ? 'incorrect'
      : counts.skipped > 0 ? 'skipped'
      : counts.all > 0 ? 'all'
      : 'unseen'
    setMode(next)
    setCount(Math.min(availableFor(next) || DEFAULT_COUNT, DEFAULT_COUNT))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, counts.all, counts.incorrect, counts.skipped, counts.correct, counts.unseen])

  useEffect(() => {
    if (!open) return
    setCount(Math.min(availableFor(mode) || DEFAULT_COUNT, DEFAULT_COUNT))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open])

  async function handleStart() {
    if (available === 0 || starting) return
    setStarting(true)
    try {
      const userId = await currentUserId()
      const deviceId = getDeviceId()
      const markedScopeIds = [chapterId ?? bookId ?? examId].filter(Boolean) as string[]

      if (mode === 'incorrect_skipped') {
        const [wrong, skipped] = await Promise.all([
          selectQuestions({ chapterIds, filter: 'incorrect', userId, deviceId, markedScopeIds }),
          selectQuestions({ chapterIds, filter: 'skipped', userId, deviceId, markedScopeIds }),
        ])
        let ids = Array.from(new Set([...wrong.ids, ...skipped.ids]))
        if (shuffle) {
          for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[ids[i], ids[j]] = [ids[j], ids[i]]
          }
        }
        ids = ids.slice(0, resolvedCount)
        await onStart('incorrect', ids, ['incorrect', 'skipped'])
        onOpenChange(false)
        return
      }

      const filter: QuestionFilter = mode
      const result = await selectQuestions({
        chapterIds,
        filter,
        userId,
        deviceId,
        markedScopeIds,
        limit: resolvedCount,
        shuffle,
      })
      await onStart(filter, result.ids)
      onOpenChange(false)
    } finally {
      setStarting(false)
    }
  }

  const pills: Array<{ key: MistakeMode; label: string }> = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'incorrect', label: `Wrong (${counts.incorrect})` },
    { key: 'skipped', label: `Skipped (${counts.skipped})` },
    { key: 'incorrect_skipped', label: `Wrong + Skipped (${counts.incorrect + counts.skipped})` },
    { key: 'correct', label: `Correct (${counts.correct})` },
    { key: 'unseen', label: `Unseen (${counts.unseen})` },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Practice mistakes</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <p className="modal-section-label">Scope</p>
            <p style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              {title}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: "'DM Mono', monospace" }}>
                {scope}
              </span>
            </p>
          </div>

          <div>
            <p className="modal-section-label">Questions</p>
            <div className="pill-group">
              {pills.map((p) => (
                <button
                  key={p.key}
                  className={`pill ${mode === p.key ? 'active' : ''}`}
                  disabled={availableFor(p.key) === 0}
                  onClick={() => setMode(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-divider" />

          <div>
            <p className="modal-section-label">How many</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={Math.min(available, MAX_COUNT)}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)}
                className="rounded-md px-2 py-1 text-sm"
                style={{
                  width: 96,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                of {available} available (max {MAX_COUNT})
              </span>
            </div>
          </div>

          <div className="toggle-row">
            <div>
              <p className="toggle-label">Shuffle Questions</p>
              <p className="toggle-sublabel">Randomize question order</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shuffle}
              onClick={() => setShuffle(!shuffle)}
              className="relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
              style={{ height: 24, width: 44, background: shuffle ? 'var(--accent)' : 'var(--bg-input)' }}
            >
              <span
                className="inline-block rounded-full bg-white shadow transition-transform"
                style={{ height: 20, width: 20, transform: shuffle ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Wrong/skipped status comes from your original attempt; your latest OpenLearn
            attempt overrides it.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={starting}>
              Cancel
            </Button>
            <Button disabled={starting || available === 0 || resolvedCount === 0} onClick={handleStart}>
              {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {starting ? 'Creating Session...' : `Start (${resolvedCount})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
