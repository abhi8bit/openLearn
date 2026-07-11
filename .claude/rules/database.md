---
paths:
  - "src/lib/supabase/**"
  - "src/lib/dexie/**"
  - "src/stores/**"
---

# Database & Data Layer Rules

## Supabase Schema — Key Tables

### Catalog (read-only, public)
- `exams` → `books` → `chapters` → `chapter_concepts`
- `chapters` → `questions` → `question_options` + `question_solutions`
- `chapters.content_version` — bump this to invalidate Dexie cache for that chapter
- `chapters.storage_prefix` — e.g. `books/cgl-english/work-and-time-pg0339-0371`

**Denormalized count columns** (populated server-side — read directly, never recompute by iterating):
- `exams.total_books`, `exams.total_chapters`, `exams.total_questions`
- `books.total_chapters`, `books.total_questions`
- `chapters.question_count`, `chapters.concept_count`

`getExamProgress()` / `getBookProgress()` in `lib/dexie/cache.ts` read these columns for the displayed stats; only the per-user `attempted` count (for the progress bar) is still derived from local sessions.

### User Data (requires auth or device_id)
- `user_sessions` — one record per practice/mock session
  - `scope`: `'chapter' | 'book' | 'exam' | 'custom'`
  - `session_type`: `'practice' | 'mock'`
  - `question_ids`: UUID[] — ordered list, recreates session exactly on resume
  - `is_active`: false = historical, not resumable
- `session_answers` — one row per question per session
  - `is_correct` is computed and stored at answer time (don't recompute at review time)
  - `time_spent_secs` — per-question elapsed time
- `saved_questions` — global bookmarks

## Dexie (IndexedDB) Tables

```typescript
exams, books, chapters           // catalog metadata
chapterData                      // full chapter: concepts + questions (cached by chapterId)
sessions, answers, savedQuestions // mirrors of Supabase user tables
```

## Cache Pattern — Always Use This

```typescript
// lib/dexie/cache.ts
async function getCachedOrFetchChapter(chapterId: string): Promise<ChapterData> {
  const [cached, meta] = await Promise.all([
    db.chapterData.get(chapterId),
    db.chapters.get(chapterId),
  ])
  if (cached && cached.contentVersion === meta?.contentVersion) {
    return cached  // cache hit
  }
  const fresh = await supabase.fetchFullChapter(chapterId)
  await db.chapterData.put({ chapterId, contentVersion: meta.contentVersion, cachedAt: Date.now(), ...fresh })
  return fresh
}
```

Never call `supabase.fetchFullChapter()` directly from a component or store. Always go through `getCachedOrFetchChapter()`.

## Query Function Signatures (lib/supabase/queries.ts)

```typescript
fetchAllExams(): Promise<Exam[]>
fetchBooksByExam(examId: string): Promise<Book[]>
fetchChaptersByBook(bookId: string): Promise<Chapter[]>
fetchFullChapter(chapterId: string): Promise<{ concepts: Concept[], questions: Question[] }>
// questions include options[] and solution embedded
syncSession(session: LocalSession): Promise<void>
syncAnswers(answers: LocalAnswer[]): Promise<void>
migrateGuestData(deviceId: string, userId: string): Promise<void>
```

## Write Order: Dexie First, Supabase Second

Every user data mutation must:
1. Write to Dexie immediately (synchronous from user perspective)
2. Fire Supabase upsert asynchronously if user is logged in (fire-and-forget, log errors only)

Never block UI on Supabase write. Never skip Dexie write.

## Image URL Construction

Images are embedded as **markdown** in `question_text` and `solution_text`:
```
![alt text](b7eddffe955769a9d8ed0446178c1b35_img.jpg)
```

The filename is a hash-based name like `{hash}_img.jpg` (NOT `page-{number}.webp`).

To construct the public URL:
```typescript
// Extract filename from markdown: ![alt](filename)
const match = question_text.match(/!\[[^\]]*\]\(([^)]+)\)/)
const filename = match?.[1] // e.g. "b7eddffe955769a9d8ed0446178c1b35_img.jpg"

const { data } = supabase.storage
  .from('book-images')
  .getPublicUrl(`${chapter.storage_prefix}/${filename}`)
const imageUrl = data.publicUrl
```

Bucket name: `book-images`. File format: `{hash}_img.jpg`. Multiple images per question/solution are possible.

`question_page` is a page reference number (for book indexing), NOT the image filename.

## device_id

Generated once on first app load:
```typescript
// lib/device.ts
export function getDeviceId(): string {
  let id = localStorage.getItem('device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('device_id', id)
  }
  return id
}
```

Pass `device_id` to all user data reads/writes when `user_id` is null (guest mode).
