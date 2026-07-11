'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCatalogStore } from '@/stores/catalogStore'
import { useSessionStore } from '@/stores/sessionStore'
import { BookCard, BOOK_ACCENT_COUNT } from '@/components/catalog/BookCard'
import { MockSettingsModal, type SelectableItem } from '@/components/catalog/MockSettingsModal'
import { getQuestionIdsForChapters, getCachedChapters, getBookProgress, type BookProgress } from '@/lib/dexie/cache'
import { fetchChaptersByBook, fetchQuestionsByIds } from '@/lib/supabase/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { SessionSettings } from '@/types'

export default function BooksPage() {
  const params = useParams()
  const router = useRouter()
  const examSlug = params.examSlug as string
  const { exams, books, chapters, isLoading, error, loadExams, loadBooks, loadChapters } = useCatalogStore()
  const initSession = useSessionStore((s) => s.initSession)

  const [mockSettingsOpen, setMockSettingsOpen] = useState(false)
  const [mockBookId, setMockBookId] = useState<string | null>(null)
  const [mockLoading, setMockLoading] = useState(false)
  const [mockChapters, setMockChapters] = useState<SelectableItem[]>([])
  const [bookProgressMap, setBookProgressMap] = useState<Record<string, BookProgress>>({})

  const exam = exams.find((e) => e.slug === examSlug)

  useEffect(() => {
    if (exams.length === 0) {
      loadExams()
    }
  }, [exams.length, loadExams])

  useEffect(() => {
    if (exam) {
      loadBooks(exam.id)
    }
  }, [exam?.id, loadBooks])

  useEffect(() => {
    if (books.length === 0) return
    let cancelled = false
    async function loadProgress() {
      const map: Record<string, BookProgress> = {}
      for (const book of books) {
        map[book.id] = await getBookProgress(book.id)
      }
      if (!cancelled) setBookProgressMap(map)
    }
    loadProgress()
    return () => { cancelled = true }
  }, [books])

  const handleBookMockClick = async (bookId: string) => {
    setMockBookId(bookId)
    setMockSettingsOpen(true)

    let bookChapters = await getCachedChapters(bookId)
    if (bookChapters.length === 0) {
      bookChapters = await fetchChaptersByBook(bookId)
    }
    setMockChapters(
      bookChapters.map((ch) => ({
        id: ch.id,
        name: ch.name,
        questionCount: ch.question_count ?? 0,
      }))
    )
  }

  async function handleBookMockStart(settings: SessionSettings, selectedChapterIds: string[]) {
    if (!mockBookId) return
    setMockLoading(true)
    try {
      const allIds = await getQuestionIdsForChapters(selectedChapterIds)

      let selected = [...allIds]
      if (settings.shuffle) {
        for (let i = selected.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[selected[i], selected[j]] = [selected[j], selected[i]]
        }
      }
      selected = selected.slice(0, settings.questionCount)

      const selectedIdSet = new Set(selected.map((q) => q.id))
      const selectedQuestions = await fetchQuestionsByIds(Array.from(selectedIdSet))

      const sessionId = crypto.randomUUID()
      initSession(sessionId, {
        scope: 'book',
        sessionType: 'mock',
        examId: exam?.id ?? '',
        bookId: mockBookId,
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
        questions: selectedQuestions,
        contentVersion: null,
        cachedAt: Date.now(),
      })

      setMockLoading(false)
      setMockSettingsOpen(false)
      setMockBookId(null)
      router.push(`/session/${sessionId}`)
    } catch {
      setMockLoading(false)
      setMockSettingsOpen(false)
      setMockBookId(null)
    }
  }

  const chapterCounts: Record<string, number> = {}
  if (exam) {
    for (const book of books) {
      const bookChapters = chapters.filter((c) => c.book_id === book.id)
      chapterCounts[book.id] = bookChapters.length
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
          <span style={{ color: 'var(--text-primary)' }}>{exam?.name ?? examSlug}</span>
        </nav>

        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
          {exam?.name ?? examSlug}
        </h1>
        <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-secondary)' }}>
          Select a book to view chapters.
        </p>

        {!exam && !isLoading && (
          <div
            className="mt-4 flex items-center gap-2 rounded-lg p-4 text-sm"
            style={{ border: '1px solid var(--danger)', background: 'var(--danger-subtle)', color: 'var(--danger)' }}
          >
            <AlertCircle style={{ width: 16, height: 16 }} />
            Exam not found.
          </div>
        )}

        {isLoading && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
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

        {!isLoading && !error && exam && books.length === 0 && (
          <p className="mt-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No books available for this exam yet.
          </p>
        )}

        {!isLoading && !error && books.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book, i) => {
              const bp = bookProgressMap[book.id]
              return (
                <BookCard
                  key={book.id}
                  book={book}
                  examSlug={examSlug}
                  chapterCount={bp?.chapterCount || chapterCounts[book.id] || undefined}
                  questionCount={bp?.totalQuestions || undefined}
                  progressPercent={bp?.percent || 0}
                  accentIndex={i % BOOK_ACCENT_COUNT}
                  onMockClick={handleBookMockClick}
                />
              )
            })}
          </div>
        )}

        <MockSettingsModal
          open={mockSettingsOpen}
          onOpenChange={(open) => {
            setMockSettingsOpen(open)
            if (!open) setMockBookId(null)
          }}
          scope="book"
          items={mockChapters}
          isLoading={mockLoading}
          onStart={handleBookMockStart}
        />
      </section>
    </main>
  )
}
