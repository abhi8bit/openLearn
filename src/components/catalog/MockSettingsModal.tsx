'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronDown, ChevronRight, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import type { SessionSettings } from '@/types'
import type { ExamConfig, ExamSection } from '@/lib/exam-configs'

export interface SelectableItem {
  id: string
  name: string
  questionCount: number
}

interface MockSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: 'chapter' | 'book' | 'exam'
  totalQuestions?: number
  items?: SelectableItem[]
  isLoading?: boolean
  examConfigs?: ExamConfig[]
  onStart: (settings: SessionSettings, selectedItemIds: string[], examConfig?: ExamConfig) => void
}

export function MockSettingsModal({
  open,
  onOpenChange,
  scope,
  totalQuestions = 0,
  items,
  isLoading = false,
  examConfigs = [],
  onStart,
}: MockSettingsModalProps) {
  // ── Custom tab state ──
  const [questionCount, setQuestionCount] = useState(25)
  const [timeLimit, setTimeLimit] = useState<number | null>(15)
  const [shuffle, setShuffle] = useState(true)
  const [sectionalTiming, setSectionalTiming] = useState(false)
  const [bookTimeLimits, setBookTimeLimits] = useState<Record<string, number>>({})
  const [customCount, setCustomCount] = useState('')
  const [customTime, setCustomTime] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // ── Exam tab state ──
  const [selectedExamConfig, setSelectedExamConfig] = useState<ExamConfig | null>(null)

  const hasItems = scope !== 'chapter' && items && items.length > 0
  const isExam = scope === 'exam'
  const showTabs = isExam && examConfigs.length > 0

  // Stable primitive signatures so referentially-new `items` / `examConfigs`
  // arrays (e.g. the default `[]` param, or inline arrays from the parent)
  // don't retrigger the reset effect on every render.
  const itemsKey = items ? items.map((it) => it.id).join(',') : ''
  const examConfigsKey = examConfigs.map((c) => c.label).join(',')

  // Reset on open (and when the underlying items/configs actually change)
  useEffect(() => {
    if (open) {
      setSelectedExamConfig(examConfigs.length > 0 ? examConfigs[0] : null)
      if (items && items.length > 0) {
        setSelectedIds(new Set(items.map((it) => it.id)))
        setAdvancedOpen(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemsKey, examConfigsKey])

  useEffect(() => {
    if (open && hasItems) {
      const defaults: Record<string, number> = {}
      items!.forEach((it) => {
        defaults[it.id] = timeLimit ?? 15
      })
      setBookTimeLimits(defaults)
    }
  }, [open, hasItems, timeLimit])

  // ── Custom tab computed values ──
  const totalAvailable = hasItems
    ? items!
        .filter((it) => selectedIds.has(it.id))
        .reduce((sum, it) => sum + it.questionCount, 0)
    : totalQuestions

  const resolvedCount = Math.min(
    customCount ? parseInt(customCount, 10) || questionCount : questionCount,
    totalAvailable
  )

  const qPresets = [25, 35, 50, 75, 100]
  const timePresets = [10, 15, 25, 30, 60]
  const effectiveTime = customTime ? parseInt(customTime, 10) || null : timeLimit
  const allSelected = hasItems ? selectedIds.size === items!.length : false

  function toggleItem(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function toggleAll() {
    if (allSelected && items) {
      setSelectedIds(new Set())
    } else if (items) {
      setSelectedIds(new Set(items.map((it) => it.id)))
    }
  }

  function setBookTime(bookId: string, minutes: number) {
    setBookTimeLimits((prev) => ({ ...prev, [bookId]: minutes }))
  }

  // ── Exam tab totals ──
  const examTotalQuestions = selectedExamConfig
    ? selectedExamConfig.sections.reduce((sum, s) => sum + s.questionCount, 0)
    : 0
  const examTotalTime = selectedExamConfig
    ? selectedExamConfig.sections.reduce((sum, s) => sum + s.timeLimitMinutes, 0)
    : 0
  const examTotalMarks = selectedExamConfig
    ? selectedExamConfig.sections.reduce((sum, s) => sum + s.totalMarks, 0)
    : 0

  const scopeLabel = isExam ? 'Books' : 'Chapters'

  // ── Start handlers ──
  function handleExamStart() {
    if (!selectedExamConfig) return
    const settings: SessionSettings = {
      questionCount: examTotalQuestions,
      timeLimitMinutes: examTotalTime,
      shuffle: selectedExamConfig.shuffle,
      sectionalTiming: true,
      sections: selectedExamConfig.sections.map((s) => ({
        slug: s.slug,
        label: s.label,
        questionCount: s.questionCount,
        timeLimitMinutes: s.timeLimitMinutes,
        marksPerCorrect: s.marksPerCorrect,
        marksPerWrong: s.marksPerWrong,
        totalMarks: s.totalMarks,
      })),
    }
    onStart(settings, [], selectedExamConfig)
  }

  function handleCustomStart() {
    onStart(
      {
        questionCount: resolvedCount,
        timeLimitMinutes: effectiveTime,
        shuffle,
        sectionalTiming,
        bookTimeLimits: isExam && sectionalTiming ? { ...bookTimeLimits } : undefined,
      },
      hasItems ? Array.from(selectedIds) : []
    )
  }

  const scopeLabel2 = isExam ? 'Books' : 'Chapters'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mock Test Settings</DialogTitle>
        </DialogHeader>

        {showTabs ? (
          <Tabs defaultValue="exam">
            <TabsList>
              <TabsTrigger value="exam">Exam</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>

            {/* ── Exam Tab ── */}
            <TabsContent value="exam" className="mt-4">
              <div className="space-y-4">
                {/* Exam config selector */}
                {examConfigs.length > 1 && (
                  <div>
                    <p className="modal-section-label">Select Exam</p>
                    <div className="pill-group">
                      {examConfigs.map((config) => (
                        <button
                          key={config.label}
                          className={`pill ${selectedExamConfig?.label === config.label ? 'active' : ''}`}
                          onClick={() => setSelectedExamConfig(config)}
                        >
                          {config.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {examConfigs.length === 1 && (
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {examConfigs[0].label}
                  </p>
                )}

                {/* Section breakdown */}
                {selectedExamConfig && (
                  <div className="space-y-3">
                    <p className="modal-section-label">Sections</p>
                    {selectedExamConfig.sections.map((section, i) => (
                      <SectionCard key={section.slug} section={section} index={i} />
                    ))}
                  </div>
                )}

                {/* Summary */}
                {selectedExamConfig && (
                  <>
                    <div className="modal-divider" />
                    <div
                      className="rounded-lg p-3 space-y-2"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span style={{ color: 'var(--text-secondary)' }}>Total Questions</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--text-primary)' }}>
                          {examTotalQuestions}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span style={{ color: 'var(--text-secondary)' }}>Total Time</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--text-primary)' }}>
                          {examTotalTime} min
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span style={{ color: 'var(--text-secondary)' }}>Total Marks</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: 'var(--text-primary)' }}>
                          {examTotalMarks}
                        </span>
                      </div>
                    </div>

                    {/* Info note */}
                    <div
                      className="flex items-start gap-2 rounded-lg p-3 text-xs"
                      style={{
                        background: 'var(--accent-subtle)',
                        border: '1px solid var(--accent)',
                        color: 'var(--accent-text)',
                      }}
                    >
                      <AlertCircle style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                      <span>
                        Each section has its own time limit. You must complete a section before
                        moving to the next. Questions are shuffled within each section.
                      </span>
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                    Cancel
                  </Button>
                  <Button
                    disabled={isLoading || !selectedExamConfig || examTotalQuestions === 0}
                    onClick={handleExamStart}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isLoading ? 'Creating Test...' : 'Start Exam'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ── Custom Tab ── */}
            <TabsContent value="custom" className="mt-4">
              <div className="space-y-5">
                {/* Question Count */}
                <QuestionCountSection
                  totalAvailable={totalAvailable}
                  questionCount={questionCount}
                  setQuestionCount={setQuestionCount}
                  customCount={customCount}
                  setCustomCount={setCustomCount}
                  qPresets={qPresets}
                />

                <div className="modal-divider" />

                {/* Time Limit */}
                <TimeLimitSection
                  timeLimit={timeLimit}
                  setTimeLimit={setTimeLimit}
                  customTime={customTime}
                  setCustomTime={setCustomTime}
                  timePresets={timePresets}
                />

                <div className="modal-divider" />

                {/* Shuffle */}
                <ToggleRow
                  label="Shuffle Questions"
                  sublabel="Randomize question order"
                  checked={shuffle}
                  onChange={() => setShuffle(!shuffle)}
                />

                {/* Sectional Timing (exam level only) */}
                {isExam && (
                  <>
                    <div className="modal-divider" />
                    <ToggleRow
                      label="Sectional Timing"
                      sublabel="Allocate separate time for each book section"
                      checked={sectionalTiming}
                      onChange={() => setSectionalTiming(!sectionalTiming)}
                    />
                  </>
                )}

                {/* Advanced: Book / Chapter Selection */}
                {hasItems && (
                  <>
                    <div className="modal-divider" />
                    <AdvancedSelection
                      items={items!}
                      selectedIds={selectedIds}
                      toggleItem={toggleItem}
                      toggleAll={toggleAll}
                      allSelected={allSelected}
                      advancedOpen={advancedOpen}
                      setAdvancedOpen={setAdvancedOpen}
                      scopeLabel={scopeLabel2}
                      isExam={isExam}
                      sectionalTiming={sectionalTiming}
                      bookTimeLimits={bookTimeLimits}
                      setBookTime={setBookTime}
                      timePresets={timePresets}
                    />
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                    Cancel
                  </Button>
                  <Button
                    disabled={isLoading || totalAvailable === 0}
                    onClick={handleCustomStart}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isLoading ? 'Creating Test...' : 'Start Mock'}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          /* ── Non-exam scope: direct custom content (no tabs) ── */
          <div className="space-y-5">
            <QuestionCountSection
              totalAvailable={totalAvailable}
              questionCount={questionCount}
              setQuestionCount={setQuestionCount}
              customCount={customCount}
              setCustomCount={setCustomCount}
              qPresets={qPresets}
            />

            <div className="modal-divider" />

            <TimeLimitSection
              timeLimit={timeLimit}
              setTimeLimit={setTimeLimit}
              customTime={customTime}
              setCustomTime={setCustomTime}
              timePresets={timePresets}
            />

            <div className="modal-divider" />

            <ToggleRow
              label="Shuffle Questions"
              sublabel="Randomize question order"
              checked={shuffle}
              onChange={() => setShuffle(!shuffle)}
            />

            {hasItems && (
              <>
                <div className="modal-divider" />
                <AdvancedSelection
                  items={items!}
                  selectedIds={selectedIds}
                  toggleItem={toggleItem}
                  toggleAll={toggleAll}
                  allSelected={allSelected}
                  advancedOpen={advancedOpen}
                  setAdvancedOpen={setAdvancedOpen}
                  scopeLabel={scopeLabel}
                  isExam={false}
                  sectionalTiming={false}
                  bookTimeLimits={bookTimeLimits}
                  setBookTime={setBookTime}
                  timePresets={timePresets}
                />
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                disabled={isLoading || totalAvailable === 0}
                onClick={handleCustomStart}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Creating Test...' : 'Start Mock'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Sub-components ──

function SectionCard({ section, index }: { section: ExamSection; index: number }) {
  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI']

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center rounded-full text-xs font-bold"
            style={{
              width: 22,
              height: 22,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 11,
            }}
          >
            {romanNumerals[index] ?? index + 1}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {section.label}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1">
          <CheckCircle style={{ width: 11, height: 11 }} />
          {section.questionCount} questions
        </span>
        <span className="flex items-center gap-1">
          <Clock style={{ width: 11, height: 11 }} />
          {section.timeLimitMinutes} min
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace" }}>
          {section.totalMarks} marks
        </span>
      </div>

      <div className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        +{section.marksPerCorrect} correct / {section.marksPerWrong} wrong
      </div>
    </div>
  )
}

function QuestionCountSection({
  totalAvailable, questionCount, setQuestionCount, customCount, setCustomCount, qPresets,
}: {
  totalAvailable: number
  questionCount: number
  setQuestionCount: (n: number) => void
  customCount: string
  setCustomCount: (s: string) => void
  qPresets: number[]
}) {
  return (
    <div>
      <p className="modal-section-label">Number of Questions</p>
      <div className="pill-group">
        {qPresets.map((n) => (
          <button
            key={n}
            className={`pill ${questionCount === n && !customCount ? 'active' : ''}`}
            disabled={n > totalAvailable}
            onClick={() => { setQuestionCount(n); setCustomCount('') }}
          >
            {n}
          </button>
        ))}
        <button
          className={`pill ${totalAvailable === questionCount && !customCount ? 'active' : ''}`}
          onClick={() => { setQuestionCount(totalAvailable); setCustomCount('') }}
        >
          All ({totalAvailable})
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Custom:</span>
        <input
          type="number"
          min={1}
          max={totalAvailable}
          value={customCount}
          onChange={(e) => setCustomCount(e.target.value)}
          placeholder={`1-${totalAvailable}`}
          className="rounded-md px-2 py-1 text-sm"
          style={{
            width: 80,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
      </div>
      {totalAvailable === 0 && (
        <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
          No questions available with current selection.
        </p>
      )}
    </div>
  )
}

function TimeLimitSection({
  timeLimit, setTimeLimit, customTime, setCustomTime, timePresets,
}: {
  timeLimit: number | null
  setTimeLimit: (t: number | null) => void
  customTime: string
  setCustomTime: (s: string) => void
  timePresets: number[]
}) {
  return (
    <div>
      <p className="modal-section-label">Time Limit</p>
      <div className="pill-group">
        <button
          className={`pill ${timeLimit === null && !customTime ? 'active' : ''}`}
          onClick={() => { setTimeLimit(null); setCustomTime('') }}
        >
          None
        </button>
        {timePresets.map((t) => (
          <button
            key={t}
            className={`pill ${timeLimit === t && !customTime ? 'active' : ''}`}
            onClick={() => { setTimeLimit(t); setCustomTime('') }}
          >
            {t}m
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Custom (min):</span>
        <input
          type="number"
          min={1}
          value={customTime}
          onChange={(e) => setCustomTime(e.target.value)}
          placeholder="e.g. 45"
          className="rounded-md px-2 py-1 text-sm"
          style={{
            width: 80,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
      </div>
    </div>
  )
}

function ToggleRow({ label, sublabel, checked, onChange }: {
  label: string
  sublabel: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="toggle-row">
      <div>
        <p className="toggle-label">{label}</p>
        <p className="toggle-sublabel">{sublabel}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className="relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
        style={{
          height: 24,
          width: 44,
          background: checked ? 'var(--accent)' : 'var(--bg-input)',
        }}
      >
        <span
          className="inline-block rounded-full bg-white shadow transition-transform"
          style={{
            height: 20,
            width: 20,
            transform: checked ? 'translateX(20px)' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  )
}

function AdvancedSelection({
  items, selectedIds, toggleItem, toggleAll, allSelected,
  advancedOpen, setAdvancedOpen, scopeLabel, isExam,
  sectionalTiming, bookTimeLimits, setBookTime, timePresets,
}: {
  items: SelectableItem[]
  selectedIds: Set<string>
  toggleItem: (id: string) => void
  toggleAll: () => void
  allSelected: boolean
  advancedOpen: boolean
  setAdvancedOpen: (b: boolean) => void
  scopeLabel: string
  isExam: boolean
  sectionalTiming: boolean
  bookTimeLimits: Record<string, number>
  setBookTime: (bookId: string, minutes: number) => void
  timePresets: number[]
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="flex items-center gap-1 text-sm font-medium transition-colors"
        style={{ color: 'var(--text-primary)' }}
      >
        {advancedOpen ? (
          <ChevronDown style={{ width: 16, height: 16 }} />
        ) : (
          <ChevronRight style={{ width: 16, height: 16 }} />
        )}
        Advanced: {scopeLabel}
      </button>

      {advancedOpen && (
        <div className="mt-2 space-y-1">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs"
            style={{ color: 'var(--accent-text)' }}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <div
            className="max-h-40 overflow-y-auto space-y-0.5 rounded-md p-2"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 py-0.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleItem(item.id)}
                  className="h-4 w-4 shrink-0 rounded"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                {isExam && sectionalTiming && selectedIds.has(item.id) && (
                  <select
                    value={bookTimeLimits[item.id] ?? 15}
                    onChange={(e) => setBookTime(item.id, parseInt(e.target.value, 10))}
                    className="h-7 w-16 rounded px-1 text-xs shrink-0"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {timePresets.map((t) => (
                      <option key={t} value={t}>{t}m</option>
                    ))}
                  </select>
                )}
                <span className="text-xs shrink-0 text-right" style={{ color: 'var(--text-tertiary)', minWidth: '2rem', fontFamily: "'DM Mono', monospace" }}>
                  {item.questionCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
