'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/dexie/db'
import { useSessionStore } from '@/stores/sessionStore'
import { useSavedStore } from '@/stores/savedStore'
import { getCachedOrFetchChapter, getPracticeSession } from '@/lib/dexie/cache'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight, Trash2, BookOpen, Layers, FileText } from 'lucide-react'
import type { Exam, Book, Chapter, Question } from '@/types'

interface GroupedQuestion {
  question: Question
  chapterId: string
  chapterName: string
  bookId: string
  bookName: string
  examId: string
  examName: string
}

export default function SavedPage() {
  const router = useRouter()
  const initSession = useSessionStore((s) => s.initSession)
  const { toggleSaved, savedIds } = useSavedStore()
  const [items, setItems] = useState<GroupedQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const savedRecords = await db.savedQuestions.toArray()
      const questionIds = savedRecords.map((r) => r.questionId)

      if (questionIds.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const allChapterData = await db.chapterData.toArray()
      const questionToChapter = new Map<string, string>()
      for (const cd of allChapterData) {
        for (const q of cd.questions) {
          if (questionIds.includes(q.id)) {
            questionToChapter.set(q.id, cd.chapterId)
          }
        }
      }

      const [chapters, books, exams] = await Promise.all([
        db.chapters.toArray(),
        db.books.toArray(),
        db.exams.toArray(),
      ])
      const chapterMap = new Map(chapters.map((c) => [c.id, c]))
      const bookMap = new Map(books.map((b) => [b.id, b]))
      const examMap = new Map(exams.map((e) => [e.id, e]))

      const result: GroupedQuestion[] = []
      for (const qId of questionIds) {
        const chId = questionToChapter.get(qId)
        if (!chId) continue

        const chapter = chapterMap.get(chId)
        if (!chapter) continue

        const book = bookMap.get(chapter.book_id)
        const exam = book ? examMap.get(book.exam_id) : undefined

        const cd = allChapterData.find((c) => c.chapterId === chId)
        const question = cd?.questions.find((q) => q.id === qId)
        if (!question) continue

        result.push({
          question,
          chapterId: chId,
          chapterName: chapter.name,
          bookId: chapter.book_id,
          bookName: book?.name ?? 'Unknown Book',
          examId: book?.exam_id ?? '',
          examName: exam?.name ?? 'Unknown Exam',
        })
      }

      setItems(result)
      setLoading(false)
    }
    load()
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, GroupedQuestion[]>>>()
    for (const item of items) {
      if (!map.has(item.examId)) map.set(item.examId, new Map())
      const examGroup = map.get(item.examId)!
      if (!examGroup.has(item.bookId)) examGroup.set(item.bookId, new Map())
      const bookGroup = examGroup.get(item.bookId)!
      if (!bookGroup.has(item.chapterId)) bookGroup.set(item.chapterId, [])
      bookGroup.get(item.chapterId)!.push(item)
    }
    return map
  }, [items])

  async function handleQuestionClick(item: GroupedQuestion) {
    const existing = await getPracticeSession(item.chapterId)
    if (existing) {
      const data = await getCachedOrFetchChapter(item.chapterId)
      const questionIndex = data.questions.findIndex((q) => q.id === item.question.id)
      const conceptCount = data.concepts.length
      const targetIndex = conceptCount + (questionIndex >= 0 ? questionIndex : 0)
      router.push(`/session/${existing.id}?q=${targetIndex}`)
      return
    }

    const data = await getCachedOrFetchChapter(item.chapterId)
    const questionIndex = data.questions.findIndex((q) => q.id === item.question.id)
    const sessionId = crypto.randomUUID()

    await initSession(sessionId, {
      scope: 'chapter',
      sessionType: 'practice',
      examId: item.examId,
      bookId: item.bookId,
      chapterId: item.chapterId,
      questionIds: data.questions.map((q) => q.id),
    }, data)

    const conceptCount = data.concepts.length
    const targetIndex = conceptCount + (questionIndex >= 0 ? questionIndex : 0)
    router.push(`/session/${sessionId}?q=${targetIndex}`)
  }

  async function handleDelete(questionId: string) {
    setDeleting(questionId)
    toggleSaved(questionId)
    setItems((prev) => prev.filter((i) => i.question.id !== questionId))
    setDeleting(null)
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function truncate(text: string | null, maxLen: number): string {
    if (!text) return ''
    const stripped = text.replace(/\$+/g, '').trim()
    if (stripped.length <= maxLen) return stripped
    return stripped.slice(0, maxLen).trim() + '...'
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <section
        className="mx-auto max-w-3xl px-4"
        style={{ paddingTop: 32, paddingBottom: 32, animation: 'fadeIn 180ms ease-out' }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>Saved Questions</h1>
        <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-secondary)' }}>
          Questions you have bookmarked for review.
        </p>

        {loading && (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <p className="mt-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            No saved questions yet. Bookmark questions during practice to review them here.
          </p>
        )}

        {!loading && items.length > 0 && (
          <div className="mt-6 space-y-4">
            {Array.from(groups.entries()).map(([examId, bookGroups]) => {
              const firstBookGroup = Array.from(bookGroups.values())[0]
              const firstChapterGroup = firstBookGroup ? Array.from(firstBookGroup.values())[0] : undefined
              const examName = firstChapterGroup?.[0]?.examName ?? 'Exam'

              return (
                <div key={examId}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <BookOpen style={{ width: 16, height: 16, color: 'var(--accent-text)' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{examName}</span>
                  </div>

                  {Array.from(bookGroups.entries()).map(([bookId, chapterGroups]) => {
                    const firstGroup = Array.from(chapterGroups.values())[0]
                    const bookName = firstGroup?.[0]?.bookName ?? 'Book'

                    return (
                      <div key={bookId} style={{ marginLeft: 8, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Layers style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                            {bookName}
                          </span>
                        </div>

                        {Array.from(chapterGroups.entries()).map(([chapterId, qItems]) => {
                          const chapterName = qItems[0]?.chapterName ?? 'Chapter'
                          const groupKey = `${examId}-${bookId}-${chapterId}`
                          const isExpanded = expandedGroups.has(groupKey)

                          return (
                            <div key={chapterId} style={{ marginLeft: 16, marginBottom: 4 }}>
                              <button
                                onClick={() => toggleGroup(groupKey)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: 'var(--text-tertiary)',
                                  padding: '4px 0',
                                  width: '100%',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                <ChevronRight
                                  style={{ width: 12, height: 12, transition: 'transform 150ms', transform: isExpanded ? 'rotate(90deg)' : 'none' }}
                                />
                                <FileText style={{ width: 12, height: 12 }} />
                                {chapterName}
                                <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 6px', borderRadius: 99, border: '1px solid var(--border-medium)', color: 'var(--text-tertiary)' }}>
                                  {qItems.length}
                                </span>
                              </button>

                              {isExpanded && (
                                <div style={{ marginLeft: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {qItems.map((item) => (
                                    <div
                                      key={item.question.id}
                                      className="chapter-card"
                                      style={{ cursor: 'pointer', padding: '12px 14px' }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                        <button
                                          onClick={() => handleQuestionClick(item)}
                                          style={{ textAlign: 'left', flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
                                        >
                                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'DM Mono', monospace" }}>
                                            Q{item.question.question_number ?? ''}
                                          </span>
                                          <p style={{ marginTop: 2, fontSize: 13, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {truncate(item.question.question_text, 100)}
                                          </p>
                                        </button>
                                        <button
                                          className="flex items-center justify-center rounded-md transition-colors"
                                          style={{ width: 28, height: 28, flexShrink: 0, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                                          disabled={deleting === item.question.id}
                                          onClick={() => handleDelete(item.question.id)}
                                        >
                                          <Trash2 style={{ width: 14, height: 14 }} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
