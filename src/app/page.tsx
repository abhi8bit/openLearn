'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCatalogStore } from '@/stores/catalogStore'
import { ExamCard } from '@/components/catalog/ExamCard'
import { MockSettingsModal, type SelectableItem } from '@/components/catalog/MockSettingsModal'
import { PracticeFilterModal } from '@/components/catalog/PracticeFilterModal'
import { ResumeBanner } from '@/components/shared/ResumeBanner'
import { useSessionStore } from '@/stores/sessionStore'
import { getQuestionIdsForChapters, getCachedBooks, getCachedChapters, getAllExamProgress, type ExamProgress } from '@/lib/dexie/cache'
import { fetchBooksByExam, fetchChaptersByBook, fetchQuestionsByIds } from '@/lib/supabase/queries'
import { startMistakesPractice } from '@/lib/session/practice'
import { getExamConfigs, type ExamConfig } from '@/lib/exam-configs'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, ArrowDown, Check, Github, Heart } from 'lucide-react'
import type { QuestionFilter, SessionSettings, SectionConfig } from '@/types'

export default function HomePage() {
  const router = useRouter()
  const { exams, isLoading, error, loadExams } = useCatalogStore()
  const initSession = useSessionStore((s) => s.initSession)
  const [mockExamId, setMockExamId] = useState<string | null>(null)
  const [mockSettingsOpen, setMockSettingsOpen] = useState(false)
  const [mockLoading, setMockLoading] = useState(false)
  const [mockBooks, setMockBooks] = useState<SelectableItem[]>([])
  const [mockExamConfigs, setMockExamConfigs] = useState<ExamConfig[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [examProgressMap, setExamProgressMap] = useState<Record<string, ExamProgress>>({})
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [mistakesExamId, setMistakesExamId] = useState<string | null>(null)
  const [mistakesOpen, setMistakesOpen] = useState(false)
  const [mistakeChapterIds, setMistakeChapterIds] = useState<string[]>([])
  const [mistakeCounts, setMistakeCounts] = useState({ correct: 0, incorrect: 0, skipped: 0, unseen: 0, all: 0 })
  const examsRef = useRef<HTMLDivElement>(null)

  const scrollToExams = () => {
    examsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    loadExams().finally(() => setHasLoaded(true))
  }, [loadExams])

  useEffect(() => {
    if (exams.length === 0) return
    let cancelled = false
    async function loadProgress() {
      const map = await getAllExamProgress()
      if (!cancelled) setExamProgressMap(map)
    }
    loadProgress()
    return () => { cancelled = true }
  }, [exams])

  const showSkeleton = !hasLoaded || isLoading
  const showEmpty = hasLoaded && !isLoading && !error && exams.length === 0

  const UNCATEGORIZED = 'Other'
  // Available exams first, coming-soon last; stable sort keeps display_order within each group
  const orderedExams = [...exams].sort(
    (a, b) => Number(a.is_active === false) - Number(b.is_active === false)
  )
  // Unique category names in display order (exams already ordered by display_order)
  const categories = Array.from(
    new Set(orderedExams.map((e) => e.category_name?.trim() || UNCATEGORIZED))
  )
  const visibleCategories =
    activeCategory === 'All' ? categories : categories.filter((c) => c === activeCategory)

  const handleExamMockClick = async (examId: string) => {
    const exam = exams.find((e) => e.id === examId)
    setMockExamId(examId)
    setMockSettingsOpen(true)

    // Load books for the custom tab
    let examBooks = await getCachedBooks(examId)
    if (examBooks.length === 0) {
      examBooks = await fetchBooksByExam(examId)
    }

    const items: SelectableItem[] = examBooks.map((book) => ({
      id: book.id,
      name: book.name,
      questionCount: book.total_questions ?? 0,
    }))
    setMockBooks(items)

    // Load exam configs for the exam tab
    if (exam) {
      setMockExamConfigs(getExamConfigs(exam.slug))
    }
  }

  async function handleExamMistakesClick(examId: string) {
    setMistakesExamId(examId)
    try {
      let examBooks = await getCachedBooks(examId)
      if (examBooks.length === 0) examBooks = await fetchBooksByExam(examId)

      const chapterIds: string[] = []
      const counts = { correct: 0, incorrect: 0, skipped: 0, unseen: 0, all: 0 }
      for (const b of examBooks) {
        let bookChapters = await getCachedChapters(b.id)
        if (bookChapters.length === 0) bookChapters = await fetchChaptersByBook(b.id)
        for (const c of bookChapters) {
          chapterIds.push(c.id)
          counts.correct += c.source_correct_count ?? 0
          counts.incorrect += c.source_incorrect_count ?? 0
          counts.skipped += c.source_skipped_count ?? 0
          counts.unseen += c.source_unknown_count ?? 0
          counts.all += c.question_count ?? 0
        }
      }
      setMistakeChapterIds(chapterIds)
      setMistakeCounts(counts)
      setMistakesOpen(true)
    } catch (e) {
      console.error('[home] failed to load mistake counts:', e)
      setMistakesExamId(null)
    }
  }

  async function handleMistakesStart(filter: QuestionFilter, ids: string[], filters?: QuestionFilter[]) {
    if (!mistakesExamId) return
    await startMistakesPractice({
      scope: 'exam',
      examId: mistakesExamId,
      bookId: null,
      chapterId: null,
      ids,
      filter,
      filters,
      router,
      initSession,
    })
  }

  async function handleExamMockStart(settings: SessionSettings, selectedBookIds: string[], examConfig?: ExamConfig) {
    if (!mockExamId) return
    setMockLoading(true)
    try {
      let questionIds: string[] = []
      let selectedQuestions: Awaited<ReturnType<typeof fetchQuestionsByIds>> = []

      if (examConfig && settings.sections) {
        // ── Exam mode: resolve sections by book slugs ──
        const exam = exams.find((e) => e.id === mockExamId)
        if (!exam) throw new Error('Exam not found')

        // Fetch books with fallback (same as handleExamMockClick)
        let examBooks = await getCachedBooks(mockExamId)
        if (examBooks.length === 0) {
          examBooks = await fetchBooksByExam(mockExamId)
        }
        // Build slug lookup maps (exact + normalized)
        const booksBySlug = new Map(examBooks.map((b) => [b.slug, b]))
        const booksBySlugNormalized = new Map(examBooks.map((b) => [b.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-'), b]))

        function findBookBySlug(slug: string): typeof examBooks[0] | undefined {
          // Try exact match first
          const exact = booksBySlug.get(slug)
          if (exact) return exact
          // Try normalized match (e.g. "quantitative-aptitude" matches "quantitative_aptitude")
          const normalized = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          return booksBySlugNormalized.get(normalized)
        }

        const allQuestionIdsBySection: string[][] = []

        for (const section of examConfig.sections) {
          const sectionChapterIds: string[] = []

          for (const bookSlug of section.bookSlugs) {
            const book = findBookBySlug(bookSlug)
            if (!book) {
              continue
            }

            let bookChapters = await getCachedChapters(book.id)
            if (bookChapters.length === 0) {
              bookChapters = await fetchChaptersByBook(book.id)
            }
            for (const ch of bookChapters) {
              sectionChapterIds.push(ch.id)
            }
          }

          const allIds = await getQuestionIdsForChapters(sectionChapterIds)
          let selected = [...allIds]

          if (examConfig.shuffle) {
            for (let i = selected.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              ;[selected[i], selected[j]] = [selected[j], selected[i]]
            }
          }

          selected = selected.slice(0, section.questionCount)
          allQuestionIdsBySection.push(selected.map((q) => q.id))
        }

        // Flatten all section question IDs
        questionIds = allQuestionIdsBySection.flat()
        selectedQuestions = await fetchQuestionsByIds(questionIds)

        // Build section question ranges (index ranges within the flat array)
        const sectionQuestionRanges: Array<{ start: number; end: number }> = []
        let offset = 0
        for (const sectionIds of allQuestionIdsBySection) {
          sectionQuestionRanges.push({ start: offset, end: offset + sectionIds.length })
          offset += sectionIds.length
        }

        const sessionId = crypto.randomUUID()
        initSession(sessionId, {
          scope: 'exam',
          sessionType: 'mock',
          examId: mockExamId,
          bookId: null,
          chapterId: null,
          questionIds,
          questionCount: settings.questionCount,
          timeLimitMinutes: settings.timeLimitMinutes ?? undefined,
          shuffle: examConfig.shuffle,
          sectionalTiming: true,
          settings,
          sections: settings.sections,
          sectionQuestionRanges,
        }, {
          chapterId: '',
          concepts: [],
          questions: selectedQuestions,
          contentVersion: null,
          cachedAt: Date.now(),
        })

        setMockLoading(false)
        setMockSettingsOpen(false)
        setMockExamId(null)
        router.push(`/session/${sessionId}`)
      } else {
        // ── Custom mode: existing behavior ──
        const chapterIds: string[] = []
        for (const bookId of selectedBookIds) {
          let bookChapters = await getCachedChapters(bookId)
          if (bookChapters.length === 0) {
            bookChapters = await fetchChaptersByBook(bookId)
          }
          for (const ch of bookChapters) {
            chapterIds.push(ch.id)
          }
        }

        const allIds = await getQuestionIdsForChapters(chapterIds)

        let selected = [...allIds]
        if (settings.shuffle) {
          for (let i = selected.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[selected[i], selected[j]] = [selected[j], selected[i]]
          }
        }
        selected = selected.slice(0, settings.questionCount)

        const selectedIdSet = new Set(selected.map((q) => q.id))
        const fetchedQuestions = await fetchQuestionsByIds(Array.from(selectedIdSet))

        const sessionId = crypto.randomUUID()
        initSession(sessionId, {
          scope: 'exam',
          sessionType: 'mock',
          examId: mockExamId,
          bookId: null,
          chapterId: null,
          questionIds: selected.map((q) => q.id),
          questionCount: settings.questionCount,
          timeLimitMinutes: settings.timeLimitMinutes ?? undefined,
          shuffle: settings.shuffle,
          sectionalTiming: settings.sectionalTiming,
          settings,
        }, {
          chapterId: '',
          concepts: [],
          questions: fetchedQuestions,
          contentVersion: null,
          cachedAt: Date.now(),
        })

        setMockLoading(false)
        setMockSettingsOpen(false)
        setMockExamId(null)
        router.push(`/session/${sessionId}`)
      }
    } catch {
      setMockLoading(false)
      setMockSettingsOpen(false)
      setMockExamId(null)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', overflowX: 'clip' }}>
      <section
        className="mx-auto w-full max-w-6xl px-4"
        style={{ flex: 1, paddingTop: 64, paddingBottom: 32, animation: 'fadeIn 180ms ease-out' }}
      >
        {/* ─── Hero ─── */}
        <div className="hero-wrap">
          {/* Decorative background layers */}
          <div className="hero-bg" aria-hidden>
            <div className="hero-bg-grid" />
          </div>

          <div
            className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]"
            style={{ zIndex: 1 }}
          >
            {/* Left — copy & actions */}
            <div>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center"
                  style={{ width: 44, height: 44, borderRadius: 12, background: '#000', flexShrink: 0 }}
                >
                  <Image src="/logo.png" alt="openLearn" width={36} height={36} priority />
                </div>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
                  open<span style={{ color: '#00b991' }}>Learn</span>
                </span>
              </div>

              <div className="hero-eyebrow" style={{ marginTop: 28 }}>
                <span className="hero-eyebrow-dot" />
                Free forever · Open source
              </div>

              <h1 className="hero-title">
                Practice smarter.<br />
                <span className="hero-accent-text">Ace every mock.</span>
              </h1>

              <p className="hero-sub">
                Chapter-wise practice and full-length mock tests for competitive exam prep —
                no sign-up, no paywall. Your prep, at your pace.
              </p>

              <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button type="button" className="hero-cta" onClick={scrollToExams}>
                  Explore exams
                  <ArrowDown style={{ width: 17, height: 17 }} aria-hidden />
                </button>
                <a
                  href="https://github.com/abhi8bit/openLearn.git"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hero-cta-ghost"
                >
                  <Github style={{ width: 16, height: 16 }} aria-hidden />
                  View on GitHub
                </a>
              </div>

              <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Chapter-wise practice', 'Full-length mocks', 'Detailed solutions', 'Works offline'].map((label) => (
                  <span
                    key={label}
                    style={{
                      fontSize: 12,
                      fontFamily: "'DM Mono', monospace",
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-surface)',
                      borderRadius: 99,
                      padding: '5px 12px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — decorative mock preview (desktop only) */}
            <div className="hidden lg:block" aria-hidden>
              <div className="hero-preview">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--success)',
                        boxShadow: '0 0 0 3px var(--success-subtle)',
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      Quantitative Aptitude
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    09:24
                  </span>
                </div>

                <div
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    letterSpacing: '0.05em',
                    color: 'var(--accent-text)',
                    marginBottom: 6,
                  }}
                >
                  Q3 / 25
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.45, color: 'var(--text-primary)', marginBottom: 16 }}>
                  The average of five consecutive integers is 30. What is the largest of them?
                </div>

                {[
                  { k: 'A', t: '28' },
                  { k: 'B', t: '30' },
                  { k: 'C', t: '32', correct: true },
                  { k: 'D', t: '34' },
                ].map((o) => (
                  <div key={o.k} className={`hero-preview-opt${o.correct ? ' correct' : ''}`}>
                    <span className="hero-preview-badge">{o.k}</span>
                    <span>{o.t}</span>
                    {o.correct && (
                      <Check style={{ width: 14, height: 14, marginLeft: 'auto', color: 'var(--success)' }} aria-hidden />
                    )}
                  </div>
                ))}

                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="hero-preview-grid">
                    {(['correct', 'correct', 'wrong', 'correct', 'active', 'default', 'skipped', 'correct', 'default', 'correct', 'skipped', 'wrong', 'correct', 'default', 'correct', 'default'] as const).map((s, i) => {
                      const background =
                        s === 'correct' ? 'var(--success-subtle)' :
                        s === 'wrong' ? 'var(--danger-subtle)' :
                        s === 'active' ? 'var(--accent-subtle)' :
                        s === 'skipped' ? 'var(--bg-elevated)' : 'transparent'
                      const borderColor =
                        s === 'correct' ? 'var(--success)' :
                        s === 'wrong' ? 'var(--danger)' :
                        s === 'active' ? 'var(--accent)' : 'var(--border-subtle)'
                      return <div key={i} className="hero-preview-cell" style={{ background, borderColor }} />
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 40 }}>
          <ResumeBanner />
        </div>

        <div ref={examsRef} id="exams" style={{ marginTop: 40, scrollMarginTop: 24 }}>
          <h2 className="section-heading">Exams</h2>

          {showSkeleton && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          )}

          {error && (
            <div
              className="mt-4 flex items-center gap-2 rounded-lg p-4 text-sm"
              style={{
                border: '1px solid var(--danger)',
                background: 'var(--danger-subtle)',
                color: 'var(--danger)',
              }}
            >
              <AlertCircle style={{ width: 16, height: 16 }} />
              {error}
            </div>
          )}

          {showEmpty && (
            <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              No exams available yet.
            </p>
          )}

          {hasLoaded && !isLoading && !error && exams.length > 0 && (
            <>
              {/* Category filter pills */}
              {categories.length > 1 && (
                <div className="pill-group mt-4" role="tablist" aria-label="Filter exams by category">
                  <button
                    className={`pill${activeCategory === 'All' ? ' active' : ''}`}
                    role="tab"
                    aria-selected={activeCategory === 'All'}
                    onClick={() => setActiveCategory('All')}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`pill${activeCategory === cat ? ' active' : ''}`}
                      role="tab"
                      aria-selected={activeCategory === cat}
                      onClick={() => setActiveCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Categorized exam sections */}
              {visibleCategories.map((cat) => {
                const catExams = orderedExams.filter(
                  (e) => (e.category_name?.trim() || UNCATEGORIZED) === cat
                )
                if (catExams.length === 0) return null
                return (
                  <div key={cat} style={{ marginTop: 24 }}>
                    <h3
                      className="section-heading"
                      style={{ marginBottom: 12 }}
                    >
                      {cat}
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {catExams.map((exam) => {
                        const ep = examProgressMap[exam.id]
                        return (
                          <ExamCard
                            key={exam.id}
                            exam={exam}
                            bookCount={ep?.bookCount}
                            chapterCount={ep?.chapterCount}
                            questionCount={ep?.totalQuestions}
                            progressPercent={ep?.percent || 0}
                            onMockClick={handleExamMockClick}
                            onMistakesClick={handleExamMistakesClick}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        <PracticeFilterModal
          open={mistakesOpen}
          onOpenChange={(open) => {
            setMistakesOpen(open)
            if (!open) setMistakesExamId(null)
          }}
          scope="exam"
          title={exams.find((e) => e.id === mistakesExamId)?.name ?? 'Exam'}
          chapterIds={mistakeChapterIds}
          examId={mistakesExamId ?? ''}
          bookId={null}
          chapterId={null}
          counts={mistakeCounts}
          onStart={handleMistakesStart}
        />

        <MockSettingsModal
          open={mockSettingsOpen}
          onOpenChange={(open) => {
            setMockSettingsOpen(open)
            if (!open) setMockExamId(null)
          }}
          scope="exam"
          items={mockBooks}
          examConfigs={mockExamConfigs}
          isLoading={mockLoading}
          onStart={handleExamMockStart}
        />
      </section>

      <footer style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div
          className="mx-auto max-w-6xl px-4"
          style={{
            paddingTop: 20,
            paddingBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          <span>Made with</span>
          <Heart style={{ width: 14, height: 14, color: 'var(--danger)', fill: 'var(--danger)' }} aria-hidden />
          <span>by Mriglabs</span>
        </div>
      </footer>
    </main>
  )
}
