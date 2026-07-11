# Go-Live Data Layer Plan

Implementation plan for three changes agreed after the pre-launch data-layer review:

1. **Catalog stale-while-revalidate** — show local catalog instantly, refresh from Supabase in the background using `updated_at`, never block the user.
2. **Wire up Supabase sync** — currently `syncSession` / `syncAnswers` / `syncSavedQuestion` / `syncPending*` are dead code. Make cloud sync actually work (login-gated).
3. **Perf + cleanup** — use Dexie indexes instead of full-table scans, batch progress math, strip debug logs, gate image listing, resolve `is_active`.

> Scope rule: guests stay **Dexie-only**. Sync activates on login. This avoids needing anonymous write access to Supabase (safer RLS) and matches the existing "migrate guest data on login" design.

---

## Current state (why these changes are needed)

- **Catalog never refreshes.** `catalogStore.loadExams/loadBooks/loadChapters` only fetch when the Dexie cache is empty (`catalogStore.ts:17,31,47`). Once cached, exams/books/chapters are frozen per device.
- **`content_version` invalidation is dead.** `getCachedOrFetchChapter` (`lib/dexie/cache.ts:85`) compares `cached.contentVersion` against `db.chapters` metadata — but that metadata is part of the never-refreshed catalog, so the versions always match and chapter content never refetches. Fixing Part 1 also fixes this (refreshed chapter rows carry new `content_version` → lazy content refetch fires correctly).
- **Sync layer is never invoked.** Nothing calls `syncSession` / `syncAnswers` / `syncPendingSessions` / `syncPendingAnswers` / `syncSavedQuestion`. `migrateGuestData` (`lib/supabase/queries.ts:286`) runs `UPDATE ... WHERE device_id`, but guest rows were never inserted, so it updates nothing. There is no pull-down on login.

---

## Prerequisites — Supabase migrations (run first)

### A. `updated_at` on catalog tables (drives Part 1)

```sql
-- Enable auto-updating timestamps
create extension if not exists moddatetime schema extensions;

-- Repeat for: exams, books, chapters
alter table exams add column if not exists updated_at timestamptz not null default now();
create trigger exams_set_updated_at
  before update on exams
  for each row execute procedure extensions.moddatetime(updated_at);

alter table books add column if not exists updated_at timestamptz not null default now();
create trigger books_set_updated_at
  before update on books
  for each row execute procedure extensions.moddatetime(updated_at);

alter table chapters add column if not exists updated_at timestamptz not null default now();
create trigger chapters_set_updated_at
  before update on chapters
  for each row execute procedure extensions.moddatetime(updated_at);
```

Also confirm `chapters.content_version` is bumped whenever question/concept content changes (manually, or via trigger on `questions` / `chapter_concepts`).

### B. User-data tables: add missing columns + unique constraints (drives Part 2)

The current `syncSession` upsert is **lossy** — it omits `completed_at`, `answered_count`, `correct_count`, and section fields. Add them so history/results survive a round-trip:

```sql
alter table user_sessions
  add column if not exists completed_at timestamptz,
  add column if not exists answered_count int,
  add column if not exists correct_count int,
  add column if not exists current_section_index int,
  add column if not exists section_time_elapsed_secs int[];

-- saved_questions needs a stable conflict target for upserts
alter table saved_questions
  add constraint saved_questions_user_question_uniq unique (user_id, question_id);
```

### C. RLS policies (users read/write only their own rows)

```sql
alter table user_sessions   enable row level security;
alter table session_answers enable row level security;
alter table saved_questions enable row level security;

-- Example for user_sessions; mirror for the others.
create policy "own sessions" on user_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

`session_answers` has no `user_id` — gate it through its parent session:

```sql
create policy "own answers" on session_answers
  for all using (
    exists (select 1 from user_sessions s where s.id = session_answers.session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from user_sessions s where s.id = session_answers.session_id and s.user_id = auth.uid())
  );
```

Catalog tables stay public read-only (anon key). No anon writes needed anywhere.

---

## Part 1 — Catalog stale-while-revalidate

**Principle:** every catalog read returns Dexie immediately (unchanged UX). A background revalidation compares `updated_at` (+ row count) and, only if something changed, refetches that table's metadata and reconciles Dexie. UI updates live where cheap; otherwise it's correct on next navigation/refresh.

### New query functions — `lib/supabase/queries.ts`

```ts
// One tiny probe per table: latest change + row count (no row bodies).
export async function fetchCatalogSignature(): Promise<{
  exams:    { maxUpdatedAt: string | null; count: number }
  books:    { maxUpdatedAt: string | null; count: number }
  chapters: { maxUpdatedAt: string | null; count: number }
}>
// impl: for each table run
//   .select('updated_at', { count: 'exact' }).order('updated_at', { desc: true }).limit(1)
// → data[0]?.updated_at is the max; `count` is the exact table count.

// Full metadata refetch (no question content) for reconcile:
export async function fetchAllBooks(): Promise<Book[]>       // select * from books order by display_order
export async function fetchAllChapters(): Promise<Chapter[]> // select * from chapters order by display_order
// fetchAllExams already exists.
```

### New sync module — `lib/catalog/sync.ts`

```ts
// Signature persisted between boots. Use localStorage (sync, no Dexie migration):
//   key: 'catalog_signature' -> JSON of the last-seen signature.
export async function revalidateCatalog(
  onChange?: (changed: { exams: boolean; books: boolean; chapters: boolean }) => void
): Promise<void>
```

Logic:
1. `const remote = await fetchCatalogSignature()`.
2. `const local = readStoredSignature()` (localStorage; `null` on first run).
3. For each table, `changed = local == null || remote.maxUpdatedAt !== local.maxUpdatedAt || remote.count !== local.count`.
4. For each changed table: refetch full metadata (`fetchAllExams` / `fetchAllBooks` / `fetchAllChapters`) and **reconcile** into Dexie:
   - `await db.<table>.bulkPut(freshRows)` (updates + inserts).
   - Delete removed rows: `const freshIds = new Set(fresh.map(r => r.id)); const staleIds = (await db.<table>.toCollection().primaryKeys()).filter(id => !freshIds.has(id)); await db.<table>.bulkDelete(staleIds)`.
5. `writeStoredSignature(remote)`.
6. If anything changed, call `onChange({...})`.

Notes:
- Count catches deletions; `maxUpdatedAt` catches edits/inserts. The rare delete-then-insert (same count, advanced timestamp) is still caught by the timestamp.
- Refetching **all** chapters metadata is acceptable (metadata only, no questions/options/solutions). Revisit to per-book scoping only if the row count becomes large.
- Reconciling chapters refreshes `content_version` on each Dexie chapter row → next `getCachedOrFetchChapter` correctly detects a bump and lazily refetches that chapter's content. **This is what revives the dead invalidation path — no separate change needed.**

### Trigger point — new `CatalogSyncProvider`

Mirror `AuthProvider` (`components/shared/AuthProvider.tsx`). Mount once in the root layout:

```tsx
'use client'
import { useEffect } from 'react'
import { revalidateCatalog } from '@/lib/catalog/sync'
import { useCatalogStore } from '@/stores/catalogStore'

export function CatalogSyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Fire-and-forget; never blocks first paint.
    revalidateCatalog((changed) => {
      // Live-refresh the store so an open page updates without a manual reload.
      const s = useCatalogStore.getState()
      if (changed.exams) getCachedExams().then(s.setExams)
      // books/chapters: re-run the current view's loader, or leave for next nav.
    }).catch(console.error)
  }, [])
  return <>{children}</>
}
```

- **Baseline (must-have):** Dexie is updated in the background; changes appear on the next navigation or refresh. Zero UX disruption.
- **Live refresh (nice-to-have):** in `onChange`, update `catalogStore` for the currently-viewed data (exams list on home; re-run `loadBooks`/`loadChapters` for the open exam/book). Keep it additive — don't clear the list first (no flrecker/empty flash).

### `catalogStore.ts` — leave read path as-is

`loadExams/loadBooks/loadChapters` keep serving Dexie-first. Revalidation happens out-of-band via the provider. Optionally add `setExams/setBooks/setChapters` calls from `onChange` (setters already exist, `catalogStore.ts:59-61`).

---

## Part 2 — Wire up Supabase sync (login-gated)

**Model:** guests write Dexie only. On login: migrate guest rows → push all pending → pull remote. On every subsequent write while logged in: fire-and-forget push. All pushes are non-blocking; failures log only (never surface to user).

### 2.1 Fix the lossy session mapper — `lib/supabase/queries.ts:215` `syncSession`

Add the columns from migration B to the upsert (`completed_at`, `answered_count`, `correct_count`, `current_section_index`, `section_time_elapsed_secs`). Convert numbers → ISO for `completed_at` like the existing `started_at` handling.

### 2.2 Add pull + saved-sync query functions — `lib/supabase/queries.ts`

```ts
export async function fetchUserSessions(userId: string): Promise<UserSessionRow[]>
export async function fetchSessionAnswers(sessionIds: string[]): Promise<SessionAnswerRow[]> // batch .in() by 50
export async function fetchSavedQuestions(userId: string): Promise<SavedQuestionRow[]>
```

Fix `syncSavedQuestion` (`queries.ts:259`) to upsert with `onConflict: 'user_id,question_id'` (needs constraint from migration B).

### 2.3 Mappers (DB row ⇄ Local type)

Local types use epoch numbers; Supabase uses ISO strings and snake_case. Add pure mappers (put in `lib/supabase/mappers.ts`):

```ts
export function rowToLocalSession(r: UserSessionRow): LocalSession   // ISO→Date.parse(); syncedAt = Date.now()
export function rowToLocalAnswer(r: SessionAnswerRow): LocalAnswer
export function rowToLocalSaved(r: SavedQuestionRow): LocalSavedQuestion
```

### 2.4 Push on write (fire-and-forget when logged in)

Add a tiny helper (e.g. `lib/session/sync.ts`):

```ts
async function currentUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getUser()
  return data.user?.id ?? null
}
```

Wire pushes **after** the existing Dexie writes (never before, never awaited in the UI path):

| Event | File / location | Action |
|---|---|---|
| Session created | `sessionStore.ts` `initSession` (after `saveSession`, ~line 172) | if logged in → `syncSession(session, userId)` then mark `syncedAt` |
| Session progress / complete | `SessionLayout.tsx` `saveProgress` / `handleComplete` | after Dexie write → `syncSession` + `syncPendingAnswers(userId)` |
| Answer changed | `sessionStore.ts` `setAnswer` / `toggleMarkForReview` | Dexie write stays synchronous; **do not** push per-keystroke. Let `saveProgress` (nav/pause/submit) flush answers via `syncPendingAnswers`. |
| Saved toggled | `savedStore.ts` `toggleSaved` (after `saveQuestion`/`removeSavedQuestion`, ~line 16/26) | if logged in → `syncSavedQuestion` / `unsyncSavedQuestion`, then set `syncedAt` |

Batching answers through `saveProgress` avoids a network call on every option tap. `syncPendingAnswers` already exists (`lib/session/sync.ts:72`) and marks `syncedAt` after push — just start calling it.

### 2.5 Add `syncPendingSaved` — `lib/session/sync.ts`

Mirror `syncPendingSessions` (`sync.ts:59`): find `savedQuestions` where `syncedAt === null` for the user, push via `syncSavedQuestion`, set `syncedAt`.

### 2.6 Pull on login / boot — `lib/session/sync.ts`

```ts
export async function pullUserData(userId: string): Promise<void> {
  // 1. sessions
  const remoteSessions = await fetchUserSessions(userId)
  // Merge: skip remote row if a local row with same id has syncedAt === null (local unsynced wins)
  // else bulkPut mapped rows.
  // 2. answers for those session ids → same merge rule
  // 3. saved questions → merge by questionId
}
```

Conflict rule (simple, safe, last-writer-wins biased to local): **local record with `syncedAt === null` is never overwritten by a pull** (it has un-pushed changes); everything else takes the remote copy. Push runs before pull in the login flow, so by pull time most local changes are already up.

### 2.7 Auth flow — extend `setupAuthListener` (`lib/session/sync.ts:8`)

On `SIGNED_IN` (and once on boot if `getUser()` already returns a user):
1. `await migrateGuestData(userId)` — existing (`sync.ts:22`); sets `userId` + `syncedAt=null` on guest Dexie rows.
2. `await syncPendingSessions(userId)` — push migrated + any unsynced sessions.
3. `await syncPendingAnswers(userId)`.
4. `await syncPendingSaved(userId)`.
5. `await pullUserData(userId)` — bring down anything created on other devices.

Wrap each step in try/catch; log failures, don't block. Note: `migrateGuestData` currently ends by calling the Supabase-side `migrateGuestData` (UPDATE-by-device_id) — that becomes redundant once we push guest rows in step 2. Remove the `supabaseMigrate` call (`sync.ts:56`) or keep it harmless; pushing (upsert by `id`) is the real migration.

### 2.8 History / results read path

History (`app/history/page.tsx`) and results already read from Dexie, so once pull populates Dexie they "just work." No page changes needed beyond ensuring pull completes before/at first render (it's eventually-consistent; fine to let the list update when pull resolves).

---

## Part 3 — Perf + cleanup

### 3.1 Use Dexie indexes instead of `toArray().filter()`

Bump the Dexie schema (`lib/dexie/db.ts`, currently `version(4)`), add `version(5)`:

```ts
this.version(5).stores({
  answers: 'id, sessionId, [sessionId+questionId]',
  savedQuestions: 'id, questionId',
  sessions: 'id, [scopeId+sessionType], completedAt, isActive',
})
```

Then replace scans in `lib/dexie/cache.ts`:
- `getPracticeSession` (line 220), `getPreviousPracticeSessions` (240) → `db.sessions.where('[scopeId+sessionType]').equals([chapterId, 'practice'])`.
- `getActiveSession` (308) → `where('isActive').equals(1)` (store booleans as 0/1 for indexing, or keep a filtered scan — small table).
- `getAnswersForSession` (320), `getAnswer` (325) → `where('sessionId').equals(...)` / `where('[sessionId+questionId]')`.
- `isQuestionSaved` (349), `getSavedQuestionIds` (344) → `where('questionId')`.
- `deleteChapterCache` answer loop (449) → `where('sessionId').anyOf(sessionIds)`.

### 3.2 Batch progress computation (home screen)

`getExamProgress` → `getBookProgress` → `getChaptersStatus` each call `db.sessions.toArray()` + `db.answers.toArray()`, and the home page loops every exam. That's ~O(exams×books) full scans of both tables.

Refactor: load `sessions` and `answers` **once**, build `Map<scopeId, session[]>` and `Map<sessionId, answer[]>`, and pass them into the progress helpers (add optional preloaded-map params, or a new `getAllProgress()` that computes every exam/book in a single pass). Home calls it once.

### 3.3 Strip debug logging

Remove the `console.log`s in `cache.ts` (`getChaptersStatus` 163-200, `getPracticeSession` 221-228, `getPreviousPracticeSessions` 237-246, `saveSession` 298-300) and `sessionStore.ts` (173-185). Keep genuine `console.error` in catch blocks.

### 3.4 Gate image listing

`cacheChapterImages` runs a storage `.list()` on **every** cache hit (`cache.ts:86-90`). Only run it after an actual content fetch, or record listed prefixes (localStorage set) and skip the `.list()` if already done for that prefix + `content_version`.

### 3.5 Resolve `is_active`

Catalog queries have `is_active` filters commented out (`queries.ts:11,23,35`). Either: default the column to `true` + backfill, then re-enable the filters; or drop the column and the commented lines. Don't ship a soft-delete that doesn't filter.

---

## Dexie schema changes summary

- `lib/dexie/db.ts`: add `version(5)` with new indexes (§3.1). No table renames — additive, safe.
- Catalog sync signature stored in **localStorage** (`catalog_signature`), not Dexie — no migration needed.

---

## Suggested implementation order

1. **Migrations A–C** in Supabase (nothing works without `updated_at` + user-table columns + RLS).
2. **Part 1** (catalog revalidate) — smallest, highest value, unblocks content updates. Ship + verify independently.
3. **Part 3.1 / 3.3 / 3.4 / 3.5** cleanups — low risk, do alongside Part 1.
4. **Part 2** (sync) — largest; do after catalog is stable. Order within: mappers → push-on-write → pending-push → pull → auth flow.
5. **Part 3.2** (batch progress) — after sync, since sync changes how much session/answer data exists locally.

---

## Testing checklist

**Catalog revalidate (Part 1)**
- [ ] First load with empty Dexie: catalog fetched and rendered.
- [ ] Second load, no server change: no full refetch (only the small signature probe), instant render from Dexie.
- [ ] Edit a book name / add a chapter in Supabase → within one boot the change appears (next nav or live), no blank flash.
- [ ] Delete a chapter in Supabase → it disappears locally after revalidate (count-based reconcile).
- [ ] Bump `chapters.content_version` → next open of that chapter refetches content; other chapters untouched.
- [ ] Offline: app still loads from Dexie; revalidate fails silently.

**Sync (Part 2)**
- [ ] Guest does practice + mock + saves questions → all in Dexie, nothing in Supabase.
- [ ] Guest logs in → guest rows appear in `user_sessions` / `session_answers` / `saved_questions` with `user_id`.
- [ ] Log in on a second device → history + saved questions pull down into Dexie and render.
- [ ] Answer a question while logged in → appears in `session_answers` after nav/submit (not per tap).
- [ ] Local unsynced edit is not clobbered by a concurrent pull.
- [ ] Sync failure (kill network) never blocks the UI; only logs.
- [ ] `completed_at` / `answered_count` / `correct_count` survive a push→pull round-trip (results page intact on device 2).

**Perf / cleanup (Part 3)**
- [ ] Home screen progress renders without visible lag with a few hundred answers.
- [ ] No `console.log` noise in production build.
- [ ] No storage `.list()` on a warm chapter open (check Network tab).
- [ ] Inactive exam/book hidden (if `is_active` re-enabled).

---

## Files touched (quick index)

- `lib/supabase/queries.ts` — `fetchCatalogSignature`, `fetchAllBooks`, `fetchAllChapters`, `fetchUserSessions`, `fetchSessionAnswers`, `fetchSavedQuestions`; fix `syncSession` (lossy) + `syncSavedQuestion` (onConflict).
- `lib/catalog/sync.ts` *(new)* — `revalidateCatalog` + signature persistence.
- `lib/supabase/mappers.ts` *(new)* — row→Local mappers.
- `lib/session/sync.ts` — `syncPendingSaved`, `pullUserData`, extend `setupAuthListener`, push helper.
- `components/shared/CatalogSyncProvider.tsx` *(new)* — mount in root layout.
- `stores/sessionStore.ts` — push session on `initSession`.
- `stores/savedStore.ts` — push on `toggleSaved`.
- `components/session/SessionLayout.tsx` — push in `saveProgress` / `handleComplete`.
- `lib/dexie/db.ts` — `version(5)` indexes.
- `lib/dexie/cache.ts` — index-based queries, batched progress, remove logs, gate image listing.
</content>
</invoke>
