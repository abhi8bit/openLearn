import Dexie, { type EntityTable } from 'dexie'
import type { Exam, Book, Chapter, ChapterData, LocalSession, LocalAnswer, LocalSavedQuestion } from '@/types'

export interface CachedImage {
  id: string            // full storage path: ${storagePrefix}/${filename}
  storagePrefix: string // chapter folder prefix — used for cleanup
  blob: Blob
  fetchedAt: number
}

class StudyDatabase extends Dexie {
  exams!: EntityTable<Exam, 'id'>
  books!: EntityTable<Book, 'id'>
  chapters!: EntityTable<Chapter, 'id'>
  chapterData!: EntityTable<ChapterData, 'chapterId'>
  sessions!: EntityTable<LocalSession, 'id'>
  answers!: EntityTable<LocalAnswer, 'id'>
  savedQuestions!: EntityTable<LocalSavedQuestion, 'id'>
  imageCache!: EntityTable<CachedImage, 'id'>

  constructor() {
    super('SSCStudyDB_v3')
    this.version(1).stores({
      exams: 'id',
      books: 'id',
      chapters: 'id',
      chapterData: 'chapterId',
      sessions: 'id',
      answers: 'id',
      savedQuestions: 'id',
    })
    this.version(2).stores({
      sessions: 'id, [scopeId+sessionType]',
    })
    this.version(3).stores({
      sessions: 'id, [scopeId+sessionType], completedAt',
    })
    this.version(4).stores({
      imageCache: 'id, storagePrefix',
    })
    // v5 — index the fields we filter/sort on, so lookups stop doing full
    // table scans (toArray().filter). Catalog gets foreign-key + order
    // indexes; sessions/answers/saved get the keys used by cache queries.
    this.version(5).stores({
      exams: 'id, display_order',
      books: 'id, exam_id, display_order',
      chapters: 'id, book_id, display_order',
      sessions: 'id, [scopeId+sessionType], completedAt, scopeId',
      answers: 'id, sessionId, questionId, [sessionId+questionId]',
      savedQuestions: 'id, questionId',
    })
  }
}

export const db = new StudyDatabase()

db.on('blocked', () => {
  console.warn('[Dexie] Database blocked — another connection is preventing upgrade')
})

db.on('versionchange', () => {
  // Another tab upgraded the schema — close so it isn't blocked.
  db.close()
})
