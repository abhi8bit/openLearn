'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCatalogStore } from '@/stores/catalogStore'
import { ChapterCard } from '@/components/catalog/ChapterCard'
import { MockSettingsModal } from '@/components/catalog/MockSettingsModal'
import { PracticeFilterModal } from '@/components/catalog/PracticeFilterModal'
import { useUIStore } from '@/stores/uiStore'
import { useSessionStore } from '@/stores/sessionStore'
import { getCachedOrFetchChapter, getChaptersStatus, deleteChapterCache, deleteAllChaptersCache } from '@/lib/dexie/cache'
import { startMistakesPractice } from '@/lib/session/practice'
import type { ChapterStats, QuestionFilter } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Search, MoreHorizontal } from 'lucide-react'

export default function ChaptersPage() {
  const params = useParams()
  const router = useRouter()
  const examSlug = params.examSlug as string
  const bookSlug = params.bookSlug as string

  const { exams, books, chapters, isLoading, error, loadExams, loadBooks, loadChapters } = useCatalogStore()
  const isMockSettingsOpen = useUIStore((s) => s.isMockSettingsOpen)
  const setMockSettingsOpen = useUIStore((s) => s.setMockSettingsOpen)
  const initSession = useSessionStore((s) => s.initSession)

  const [pendingChapter, setPendingChapter] = useState<string | null>(null)
  const [mockLoading, setMockLoading] = useState(false)
  const [loadedChapterIds, setLoadedChapterIds] = useState<Set<string>>(new Set())
  const [chapterStats, setChapterStats] = useState<Record<string, ChapterStats>>({})
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [loadAllActive, setLoadAllActive] = useState(false)
  const [loadAllProgress, setLoadAllProgress] = useState({ loaded: 0, total: 0 })
  const [deleteAllActive, setDeleteAllActive] = useState(false)
  const [mistakesOpen, setMistakesOpen] = useState(false)
  const [mistakeChapterId, setMistakeChapterId] = useState<string | null>(null)

  const exam = exams.find((e) => e.slug === examSlug)
  const book = books.find((b) => b.slug === bookSlug)

  useEffect(() => {
    if (exams.length === 0) {
      loadExams()
    }
  }, [exams.length, loadExams])

  useEffect(() => {
    if (exam && books.length === 0) {
      loadBooks(exam.id)
    }
  }, [exam?.id, books.length, loadBooks])

  useEffect(() => {
    if (book) {
      loadChapters(book.id)
    }
  }, [book?.id, loadChapters])

  const refreshStats = useCallback(() => {
    if (chapters.length === 0) return
    const chapterIds = chapters.map((c) => c.id)
    getChaptersStatus(chapterIds)
      .then((statusMap) => {
        const loaded = new Set<string>()
        const stats: Record<string, ChapterStats> = {}
        statusMap.forEach((s) => {
          if (s.isCached) loaded.add(s.chapterId)
          stats[s.chapterId] = s.stats
        })
        setLoadedChapterIds(loaded)
        setChapterStats(stats)
      })
      .catch((e) => {
        console.error('[page] Failed to refresh chapter stats:', e)
      })
  }, [chapters])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshStats()
    }
    window.addEventListener('focus', refreshStats)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refreshStats)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshStats])

  const handleLoadChapter = useCallback(async (chapterId: string) => {
    await getCachedOrFetchChapter(chapterId)
    setLoadedChapterIds((prev) => new Set(prev).add(chapterId))
  }, [])

  const handleLoadAll = useCallback(async () => {
    if (chapters.length === 0) return
    setLoadAllActive(true)
    setLoadAllProgress({ loaded: 0, total: chapters.length })
    setMenuOpen(false)
    for (let i = 0; i < chapters.length; i++) {
      try {
        await getCachedOrFetchChapter(chapters[i].id)
        setLoadedChapterIds((prev) => new Set(prev).add(chapters[i].id))
      } catch {
        // continue to next chapter on error
      }
      setLoadAllProgress({ loaded: i + 1, total: chapters.length })
    }
    setLoadAllActive(false)
    refreshStats()
  }, [chapters, refreshStats])

  const handleDeleteAll = useCallback(async () => {
    if (chapters.length === 0) return
    setDeleteAllActive(true)
    setMenuOpen(false)
    try {
      await deleteAllChaptersCache(chapters.map((c) => c.id))
      setLoadedChapterIds(new Set())
      refreshStats()
    } finally {
      setDeleteAllActive(false)
    }
  }, [chapters, refreshStats])

  const handleDeleteChapter = useCallback(async (chapterId: string) => {
    await deleteChapterCache(chapterId)
    setLoadedChapterIds((prev) => {
      const next = new Set(prev)
      next.delete(chapterId)
      return next
    })
    refreshStats()
  }, [refreshStats])

  const filteredChapters = chapters.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.slug && c.slug.toLowerCase().includes(q))
    )
  })

  const mistakeCounts = chapters.reduce(
    (acc, c) => ({
      correct: acc.correct + (c.source_correct_count ?? 0),
      incorrect: acc.incorrect + (c.source_incorrect_count ?? 0),
      skipped: acc.skipped + (c.source_skipped_count ?? 0),
      unseen: acc.unseen + (c.source_unknown_count ?? 0),
      all: acc.all + (c.question_count ?? 0),
    }),
    { correct: 0, incorrect: 0, skipped: 0, unseen: 0, all: 0 },
  )

  const mistakeChapter = mistakeChapterId ? chapters.find((c) => c.id === mistakeChapterId) ?? null : null
  const mistakeChapterCounts = mistakeChapter
    ? {
        correct: mistakeChapter.source_correct_count ?? 0,
        incorrect: mistakeChapter.source_incorrect_count ?? 0,
        skipped: mistakeChapter.source_skipped_count ?? 0,
        unseen: mistakeChapter.source_unknown_count ?? 0,
        all: mistakeChapter.question_count ?? 0,
      }
    : { correct: 0, incorrect: 0, skipped: 0, unseen: 0, all: 0 }

  async function handleChapterMistakesStart(filter: QuestionFilter, ids: string[], filters?: QuestionFilter[]) {
    await startMistakesPractice({
      scope: 'chapter',
      examId: exam?.id ?? '',
      bookId: book?.id ?? null,
      chapterId: mistakeChapterId,
      ids,
      filter,
      filters,
      router,
      initSession,
    })
  }

  async function handleMistakesStart(filter: QuestionFilter, ids: string[], filters?: QuestionFilter[]) {
    await startMistakesPractice({
      scope: 'book',
      examId: exam?.id ?? '',
      bookId: book?.id ?? null,
      chapterId: null,
      ids,
      filter,
      filters,
      router,
      initSession,
    })
  }

  async function handleMockStart(settings: import('@/types').SessionSettings, _selectedItemIds: string[]) {
    if (!pendingChapter) return
    const chapter = chapters.find((c) => c.id === pendingChapter)
    if (!chapter) return

    setMockLoading(true)
    try {
      const data = await getCachedOrFetchChapter(chapter.id)
      let questionIds = data.questions.map((q) => q.id)
      if (settings.shuffle) {
        for (let i = questionIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]]
        }
      }
      questionIds = questionIds.slice(0, settings.questionCount)
      const sessionId = crypto.randomUUID()
      await initSession(sessionId, {
        scope: 'chapter',
        sessionType: 'mock',
        examId: exam?.id ?? '',
        bookId: book?.id ?? null,
        chapterId: chapter.id,
        questionIds,
        questionCount: settings.questionCount,
        timeLimitMinutes: settings.timeLimitMinutes ?? undefined,
        shuffle: settings.shuffle,
        sectionalTiming: settings.sectionalTiming,
        settings,
      }, data)
      setMockLoading(false)
      setMockSettingsOpen(false)
      setPendingChapter(null)
      router.push(`/session/${sessionId}`)
    } catch {
      setMockLoading(false)
      setMockSettingsOpen(false)
      setPendingChapter(null)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <section
        className="mx-auto max-w-6xl px-4"
        style={{ paddingTop: 32, paddingBottom: 32, animation: 'fadeIn 180ms ease-out' }}
      >
        {/* Breadcrumb */}
        <nav className="breadcrumb">
          <Link href="/">Home</Link>
          <span>›</span>
          <Link href={`/${examSlug}`}>{exam?.name ?? examSlug}</Link>
          <span>›</span>
          <span style={{ color: 'var(--text-primary)' }}>{book?.name ?? bookSlug}</span>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
            {book?.name ?? bookSlug}
          </h1>

          {!isLoading && chapters.length > 0 && mistakeCounts.incorrect + mistakeCounts.skipped > 0 && (
            <button
              className="btn-secondary"
              style={{ marginLeft: 'auto', fontSize: 13 }}
              onClick={() => setMistakesOpen(true)}
            >
              Practice mistakes
            </button>
          )}

          {/* Three-dot menu */}
          {!isLoading && chapters.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center justify-center rounded-md transition-colors"
                style={{
                  width: 32,
                  height: 32,
                  color: 'var(--text-secondary)',
                  background: menuOpen ? 'var(--bg-elevated)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                title="More actions"
              >
                <MoreHorizontal style={{ width: 18, height: 18 }} />
              </button>

              {menuOpen && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    onClick={() => setMenuOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 4,
                      zIndex: 10,
                      minWidth: 180,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      padding: 4,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}
                  >
                    <button
                      disabled={loadAllActive}
                      onClick={handleLoadAll}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: loadAllActive ? 'not-allowed' : 'pointer',
                      }}
                      className="menu-item-hover"
                    >
                      Load All Chapters
                    </button>
                    <button
                      disabled={deleteAllActive}
                      onClick={handleDeleteAll}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        fontSize: 13,
                        color: 'var(--danger)',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: deleteAllActive ? 'not-allowed' : 'pointer',
                      }}
                      className="menu-item-hover"
                    >
                      {deleteAllActive ? 'Deleting...' : 'Delete All Data'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Load All progress bar */}
        {loadAllActive && (
          <div style={{ marginTop: 8 }}>
            <div className="progress-bar" style={{ maxWidth: 400 }}>
              <div
                className="progress-bar-fill"
                style={{
                  width: `${loadAllProgress.total > 0 ? Math.round((loadAllProgress.loaded / loadAllProgress.total) * 100) : 0}%`,
                }}
              />
            </div>
            <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace" }}>
              {loadAllProgress.loaded} / {loadAllProgress.total} chapters loaded
            </p>
          </div>
        )}

        <p style={{ marginTop: loadAllActive ? 8 : 4, fontSize: 14, color: 'var(--text-secondary)' }}>
          Choose a chapter to practice or take a mock test.
        </p>

        {!book && !isLoading && (
          <div
            className="mt-4 flex items-center gap-2 rounded-lg p-4 text-sm"
            style={{ border: '1px solid var(--danger)', background: 'var(--danger-subtle)', color: 'var(--danger)' }}
          >
            <AlertCircle style={{ width: 16, height: 16 }} />
            Book not found.
          </div>
        )}

        {isLoading && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        )}

        {error && (
          <div
            className="mt-6 flex items-center gap-2 rounded-lg p-4 text-sm"
            style={{ border: '1px solid var(--danger)', background: 'var(--danger-subtle)', color: 'var(--danger)' }}
          >
            <AlertCircle style={{ width: 16, height: 16 }} />
            {error}
          </div>
        )}

        {!isLoading && !error && book && chapters.length === 0 && (
          <p className="mt-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No chapters available for this book yet.
          </p>
        )}

        {!isLoading && !error && chapters.length > 0 && (
          <>
            <div className="mt-6 relative" style={{ maxWidth: 320 }}>
              <Search
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-tertiary)' }}
              />
              <input
                type="text"
                placeholder="Search chapters..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
            </div>

            {filteredChapters.length === 0 ? (
              <p className="mt-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
                No chapters match your search.
              </p>
            ) : (
              <div className="mt-6 chapters-grid">
                {filteredChapters.map((chapter) => {
                  const stats = chapterStats[chapter.id] ?? null
                  const totalQ = chapter.question_count ?? 0
                  const attempted = stats?.questionsAttempted ?? 0
                  const progress = totalQ > 0 ? Math.round((attempted / totalQ) * 100) : 0
                  return (
                    <ChapterCard
                      key={chapter.id}
                      chapter={chapter}
                      loaded={loadedChapterIds.has(chapter.id)}
                      onLoad={handleLoadChapter}
                      stats={stats}
                      progressPercent={progress}
                      onDelete={handleDeleteChapter}
                      onMockClick={(id) => {
                        setPendingChapter(id)
                        setMockSettingsOpen(true)
                      }}
                      onMistakesClick={setMistakeChapterId}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}

        <PracticeFilterModal
          open={mistakeChapterId !== null}
          onOpenChange={(open) => { if (!open) setMistakeChapterId(null) }}
          scope="chapter"
          title={mistakeChapter?.name ?? 'Chapter'}
          chapterIds={mistakeChapterId ? [mistakeChapterId] : []}
          examId={exam?.id ?? ''}
          bookId={book?.id ?? null}
          chapterId={mistakeChapterId}
          counts={mistakeChapterCounts}
          onStart={handleChapterMistakesStart}
        />

        <PracticeFilterModal
          open={mistakesOpen}
          onOpenChange={setMistakesOpen}
          scope="book"
          title={book?.name ?? bookSlug}
          chapterIds={chapters.map((c) => c.id)}
          examId={exam?.id ?? ''}
          bookId={book?.id ?? null}
          chapterId={null}
          counts={mistakeCounts}
          onStart={handleMistakesStart}
        />

        <MockSettingsModal
          open={isMockSettingsOpen}
          onOpenChange={(open) => {
            setMockSettingsOpen(open)
            if (!open) setPendingChapter(null)
          }}
          scope="chapter"
          totalQuestions={
            pendingChapter
              ? chapters.find((c) => c.id === pendingChapter)?.question_count ?? 30
              : 30
          }
          isLoading={mockLoading}
          onStart={handleMockStart}
        />
      </section>
    </main>
  )
}
