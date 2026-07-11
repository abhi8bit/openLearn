# SSC CGL Study Platform

Next.js full-stack study platform for SSC CGL exam prep. Students browse exams → books → chapters, practice questions, and take mock tests. All session state is client-side first (Dexie/IndexedDB), optionally synced to Supabase when logged in.

## Stack

- **Framework**: Next.js (App Router, TypeScript)
- **Database**: Supabase (Postgres + Storage bucket `book-images`)
- **State**: Zustand (4 stores: catalog, session, saved, ui)
- **Cache**: Dexie.js (IndexedDB) — primary data layer for offline-first
- **UI**: shadcn/ui + Tailwind CSS
- **Math**: KaTeX (inline `$...$` and block `$$...$$`)
- **Auth**: Supabase Auth (optional — guest mode fully supported)

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Home: exam list + resume banner
│   ├── [examSlug]/page.tsx       # Books grid
│   ├── [examSlug]/[bookSlug]/    # Chapters grid
│   ├── session/[sessionId]/      # Practice / Mock (full-screen, client-only)
│   ├── history/                  # Past sessions
│   └── saved/                   # Saved questions
├── components/
│   ├── catalog/                  # ExamCard, BookCard, ChapterCard, MockSettingsModal
│   ├── session/                  # SessionLayout, QuestionCard, RightPanel, NavGrid
│   ├── results/                  # ResultsSummary, QuestionReview
│   └── shared/                  # KaTeXRenderer, QuestionImage, ResumeBanner, AuthButton
├── stores/                       # catalogStore, sessionStore, savedStore, uiStore
├── lib/
│   ├── supabase/                 # client.ts, queries.ts
│   ├── dexie/                    # db.ts, cache.ts
│   └── session/                 # builder.ts, timer.worker.ts, sync.ts
└── types/index.ts                # All TS types — single source of truth
```

## Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # tsc --noEmit
```

## Key Architecture Decisions

**Data flow**: Supabase → Dexie (on first load / cache miss) → Zustand (in-memory UI). Always read from Dexie, never directly from Supabase at component level.

**Catalog loading**: On app boot, fetch all exams + books + chapter metadata (not question content). Store in Dexie + `catalogStore`. Chapters have 10–25 per book.

**Chapter content**: Loaded lazily on first Practice/Mock click. `getCachedOrFetchChapter()` in `lib/dexie/cache.ts` checks `content_version` before deciding to refetch. Full chapter = concepts + questions + options + solutions.

**Session navigation index**: `currentIndex` in `sessionStore` is unified — 0..N-1 are concepts, N.. are questions. Both render in the same left panel. Right panel grid shows C1..Cn then Q1..Qn blocks.

**Timer**: Web worker only (`lib/session/timer.worker.ts`). Never store countdown in Zustand state — causes re-renders. Worker sends `TICK` messages; component subscribes via `useEffect`.

**Auth**: Guest users get a `device_id` (UUID in localStorage). Supabase tables have both `user_id` (nullable) and `device_id` columns. On login, `migrateGuestData()` upserts all Dexie records to Supabase.

## Database Tables

Existing: `exams`, `books`, `chapters`, `chapter_concepts`, `questions`, `question_options`, `question_solutions`

New (add these): `user_sessions`, `session_answers`, `saved_questions`

See `.claude/rules/database.md` for full schema details and query patterns.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Never use the service role key client-side. Catalog data is public read-only (anon key is fine).

## Definition of Done

A feature is complete when:
1. It works correctly in both guest and logged-in modes
2. All Zustand store mutations also write to Dexie
3. The component handles loading, error, and empty states
4. TypeScript compiles with no errors (`npm run type-check` passes)
5. It works on mobile viewport (375px+) — right panel collapses to bottom sheet
