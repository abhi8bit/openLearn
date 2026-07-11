'use client'

import { useEffect } from 'react'
import { revalidateCatalog } from '@/lib/catalog/sync'
import { useCatalogStore } from '@/stores/catalogStore'
import { getCachedExams, getCachedBooks, getCachedChapters } from '@/lib/dexie/cache'

export function CatalogSyncProvider() {
  useEffect(() => {
    // Fire-and-forget; never blocks first paint.
    revalidateCatalog(async (changed) => {
      // Live-refresh the store so an open page updates without a manual reload.
      // Additive only — never clear a list first (avoids an empty flash).
      const s = useCatalogStore.getState()

      if (changed.exams) {
        getCachedExams().then(s.setExams).catch(() => {})
      }

      // Books/chapters: re-derive the currently-viewed slice from Dexie.
      // If nothing is loaded yet, the next navigation reads fresh Dexie anyway.
      if (changed.books && s.books.length > 0) {
        const examId = s.books[0].exam_id
        getCachedBooks(examId).then(s.setBooks).catch(() => {})
      }
      if (changed.chapters && s.chapters.length > 0) {
        const bookId = s.chapters[0].book_id
        getCachedChapters(bookId).then(s.setChapters).catch(() => {})
      }
    }).catch(console.error)
  }, [])

  return null
}
