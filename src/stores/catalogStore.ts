import { create } from 'zustand'
import type { CatalogStore, Exam, Book, Chapter } from '@/types'
import { fetchAllExams, fetchBooksByExam, fetchChaptersByBook } from '@/lib/supabase/queries'
import { getCachedExams, getCachedBooks, getCachedChapters, cacheExams, cacheBooks, cacheChapters } from '@/lib/dexie/cache'

export const useCatalogStore = create<CatalogStore>((set) => ({
  exams: [],
  books: [],
  chapters: [],
  isLoading: false,
  error: null,

  loadExams: async () => {
    set({ isLoading: true, error: null })
    try {
      let exams: Exam[] = await getCachedExams()
      if (exams.length === 0) {
        exams = await fetchAllExams()
        if (exams.length > 0) await cacheExams(exams)
      }
      set({ exams, isLoading: false })
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false })
    }
  },

  loadBooks: async (examId: string): Promise<Book[]> => {
    set({ isLoading: true, error: null })
    try {
      let books: Book[] = await getCachedBooks(examId)
      if (books.length === 0) {
        books = await fetchBooksByExam(examId)
        if (books.length > 0) await cacheBooks(books)
      }
      set({ books, isLoading: false })
      return books
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false })
      return []
    }
  },

  loadChapters: async (bookId: string): Promise<Chapter[]> => {
    set({ isLoading: true, error: null })
    try {
      let chapters: Chapter[] = await getCachedChapters(bookId)
      if (chapters.length === 0) {
        chapters = await fetchChaptersByBook(bookId)
        if (chapters.length > 0) await cacheChapters(chapters)
      }
      set({ chapters, isLoading: false })
      return chapters
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false })
      return []
    }
  },

  setExams: (exams) => set({ exams }),
  setBooks: (books) => set({ books }),
  setChapters: (chapters) => set({ chapters }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
