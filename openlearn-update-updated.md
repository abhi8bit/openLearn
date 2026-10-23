# OpenLearn update — question status, mistakes practice, and the imported exams

> **What this file is.** A self-contained implementation prompt for the OpenLearn
> repo (`github.com/abhi8bit/openLearn`). Everything below is already decided;
> implement it in order, then run the acceptance tests at the end. The data
> upload (exams/books/chapters/questions) is already done by the sibling
> `mock-pool` project — this document covers the schema and app changes that
> make “attempt wrong questions only / skipped questions only” work.
>
> **Live data already in the OpenLearn Supabase project**
>
> | exam | slug | questions | books | chapters |
> |---|---|---:|---:|---:|
> | SSC CGL pre 2026 Attempted mock tests | `ssc-cgl-pre-2026-attempted-mock-tests` | 13,207 | 4 | 66 |
> | Banking (SBI/IBPS/RBI) pre 2026 Attempted mock tests | `banking-pre-2026-attempted-mock-tests` | 1,177 | 4 | 40 |
> | UP Lekhpal pre 2026 Attempted mock tests | `up-lekhpal-pre-2026-attempted-mock-tests` | 942 | 4 | 29 |
> | UPSSSC PET / UPPSC RO-ARO pre 2026 Attempted mock tests | `up-state-pre-2026-attempted-mock-tests` | 240 | 4 | 27 |
> | **total** | | **15,566** | 16 | 162 |
>
> Options **64,738** · solutions **14,592** · original outcomes across the four
> exams **9,879 correct · 1,983 incorrect · 2,504 skipped · 1,200 unknown**.
>
> The source tests were split by title: SSC CGL/CHSL, Parmar and TestRanking SSC
> tests plus the SSC CT chapter tests stay in the SSC exam; SBI/IBPS/RBI tests
> form the Banking exam; Lekhpal forms its own exam; UPSSSC PET, UPPSC RO/ARO
> and the one UP GK test form the UP State exam. The SSC exam is verified clean
> (0 SBI/IBPS/RBI/Lekhpal/PET/RO-ARO/UP-GK questions).
>
> The live DB already has the catalog status columns **and** `question_progress`,
> `question_progress_events`, and `record_question_progress` (verified). Commit
> the migration file from step 1 to the repo anyway so fresh environments match;
> the app changes in steps 2–9 are the remaining work. The source statuses are
> already filled (`provenance: uploaded`).

---

## 0. Architecture recap (read before editing)

- Next.js App Router, TypeScript, Supabase (catalog + optional user data),
  Dexie/IndexedDB (primary local data layer), Zustand stores.
- Catalog chain: `exams → books → chapters → questions → question_options +
  question_solutions`.
- The four imported exams are separate `exams` rows; a question belongs to
  exactly one exam through its `chapter_id`. Reclassifying a question moves it
  by updating `chapter_id` — the question/options/solution ids stay the same.
- User chain: `user_sessions → session_answers`, plus `saved_questions`.
- Read path: Supabase → Dexie → Zustand. Components must not call
  `fetchFullChapter()` directly; use `getCachedOrFetchChapter()`.
- Write path: Dexie first, then a fire-and-forget Supabase upsert when logged in.
  Guests are Dexie-only.
- A `Question` is `QuestionRow` + `options: Option[]` + `solution: Solution | null`.
- Rendering is markdown + KaTeX (`KaTeXRenderer` via `marked`). Raw HTML in
  `question_text` / `solution_text` is passed through, so the imported HTML is
  rendered as-is. Images are absolute `<img>` URLs on the source CDNs.
- `questions (chapter_id, question_number)` is **UNIQUE**. Never renumber
  existing questions in bulk; the importer already preserves numbers.

---

## 1. Database migration

Create `supabase/migrations/20261022000000_question_status.sql` with the
following SQL and run it in the Supabase SQL editor (or `supabase db push`).
It is safe to run more than once.

### 1.1 Provenance columns on `questions`

Stores the original outcome from the platform the question was imported from.
This is catalog metadata (public read), not per-user data. The imported exam is
the owner’s personal pool, so the outcome is intentionally shared by the exam.

```sql
alter table public.questions
  add column if not exists source_platform text,
  add column if not exists source_test_id text,
  add column if not exists source_test_title text,
  add column if not exists source_status text,
  add column if not exists source_time_secs numeric,
  add column if not exists source_qid text;

alter table public.questions drop constraint if exists questions_source_status_check;
alter table public.questions
  add constraint questions_source_status_check
  check (source_status is null or source_status in ('correct', 'incorrect', 'skipped', 'unknown'));

create index if not exists questions_chapter_source_status_idx
  on public.questions (chapter_id, source_status);
```

`source_status = 'unknown'` means the platform never exposed the per-question
outcome (RBE does this). Treat it as “no known outcome”.

### 1.2 Per-chapter outcome counters

Lets chapter cards show `✓ 120 · ✗ 87 · — 215` without fetching 15k questions.
The importer fills these; they are catalog metadata, not live user stats.

```sql
alter table public.chapters
  add column if not exists source_correct_count int not null default 0,
  add column if not exists source_incorrect_count int not null default 0,
  add column if not exists source_skipped_count int not null default 0,
  add column if not exists source_unknown_count int not null default 0;
```

### 1.3 Per-user progress (`question_progress`)

One aggregate row per `(user, question)`. This is the “right/wrong questions”
table. Guests use the Dexie mirror only; logged-in users also write here.

```sql
create table if not exists public.question_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text,
  question_id uuid not null references public.questions(id) on delete cascade,
  attempts int not null default 0,
  correct_count int not null default 0,
  incorrect_count int not null default 0,
  skipped_count int not null default 0,
  last_status text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_progress_last_status_check
    check (last_status in ('correct', 'incorrect', 'skipped'))
);

create unique index if not exists question_progress_user_question_uniq
  on public.question_progress (user_id, question_id);

create index if not exists question_progress_question_idx
  on public.question_progress (question_id);

create index if not exists question_progress_user_seen_idx
  on public.question_progress (user_id, last_seen_at desc);

drop trigger if exists question_progress_set_updated_at on public.question_progress;
create trigger question_progress_set_updated_at
  before update on public.question_progress
  for each row execute procedure extensions.moddatetime(updated_at);
```

### 1.4 Idempotency ledger (`question_progress_events`)

A session can be submitted twice (double-click, retry after a network drop).
Aggregating directly from a client call would double-count. Record one row per
`(session_id, question_id)` and increment the aggregate only when that row is
new. No FK on `session_id` so the call cannot fail if the session row has not
reached the server yet.

```sql
create table if not exists public.question_progress_events (
  session_id uuid not null,
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (session_id, question_id),
  constraint question_progress_events_status_check
    check (status in ('correct', 'incorrect', 'skipped'))
);

create index if not exists question_progress_events_user_idx
  on public.question_progress_events (user_id, created_at desc);
```

### 1.5 RPC that records a submitted session

Called after a session is submitted/completed. `p_rows` is a JSON array of
`{ question_id, status, device_id }` objects, one per question in the session
(including skipped ones). `FOUND` after `insert … on conflict do nothing` tells
us whether the event was new, so retries are harmless.

```sql
create or replace function public.record_question_progress(
  p_session_id uuid,
  p_rows jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  uid uuid := auth.uid();
  st text;
begin
  if uid is null then
    raise exception 'record_question_progress requires an authenticated user';
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    st := r->>'status';
    if st is null or st not in ('correct', 'incorrect', 'skipped') then
      raise exception 'invalid status % for question %', st, r->>'question_id';
    end if;

    insert into public.question_progress_events (session_id, question_id, user_id, status)
    values (p_session_id, (r->>'question_id')::uuid, uid, st)
    on conflict (session_id, question_id) do nothing;

    if found then
      insert into public.question_progress as qp (
        user_id, device_id, question_id,
        attempts, correct_count, incorrect_count, skipped_count,
        last_status, last_seen_at, updated_at
      ) values (
        uid,
        nullif(r->>'device_id', ''),
        (r->>'question_id')::uuid,
        1,
        case when st = 'correct' then 1 else 0 end,
        case when st = 'incorrect' then 1 else 0 end,
        case when st = 'skipped' then 1 else 0 end,
        st, now(), now()
      )
      on conflict (user_id, question_id) do update set
        attempts        = qp.attempts + 1,
        correct_count   = qp.correct_count + excluded.correct_count,
        incorrect_count = qp.incorrect_count + excluded.incorrect_count,
        skipped_count   = qp.skipped_count + excluded.skipped_count,
        last_status     = excluded.last_status,
        last_seen_at    = now(),
        updated_at      = now();
    end if;
  end loop;
end;
$$;

grant execute on function public.record_question_progress(uuid, jsonb) to authenticated;
```

### 1.6 RLS

```sql
alter table public.question_progress enable row level security;
alter table public.question_progress_events enable row level security;

drop policy if exists "own question progress" on public.question_progress;
create policy "own question progress" on public.question_progress
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own question progress events" on public.question_progress_events;
create policy "own question progress events" on public.question_progress_events
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

Catalog tables (`exams/books/chapters/questions/...`) already allow public read
for the anon key; the new columns inherit those policies. Do **not** enable
writes for anon.

### 1.7 After the migration

From the `mock-pool` project, re-run:

```bash
npm run sync-openlearn
```

The sync probes for `questions.source_status` and
`chapters.source_*_count`; now that they exist it fills them for all 15,566
questions across the four exams (the sync is what split the pool by source
test). It is idempotent (deterministic IDs, slug lookups, preserved
`question_number`s). Re-running it also removes chapters/books that became
empty after a question moved to another exam and bumps `content_version` on
every touched chapter so clients drop stale caches.

---

## 2. Types

### 2.1 Regenerate or hand-edit `database.types.ts`

Preferred: `npx supabase gen types typescript --project-id <id> > database.types.ts`.

If hand-editing, add to `questions.Row/Insert/Update`:

```ts
source_platform: string | null
source_test_id: string | null
source_test_title: string | null
source_status: 'correct' | 'incorrect' | 'skipped' | 'unknown' | null
source_time_secs: number | null
source_qid: string | null
```

Add to `chapters.Row/Insert/Update`:

```ts
source_correct_count: number
source_incorrect_count: number
source_skipped_count: number
source_unknown_count: number
```

Add the two new tables (`question_progress`, `question_progress_events`) and
the function:

```ts
Functions: {
  record_question_progress: {
    Args: { p_session_id: string; p_rows: Json }
    Returns: undefined
  }
}
```

### 2.2 `src/types/index.ts`

```ts
export type SourceStatus = 'correct' | 'incorrect' | 'skipped' | 'unknown'
export type ProgressStatus = 'correct' | 'incorrect' | 'skipped'

export type QuestionFilter =
  | 'all'
  | 'incorrect'
  | 'skipped'
  | 'correct'
  | 'unseen'
  | 'marked'

export type QuestionProgressRow =
  Database['public']['Tables']['question_progress']['Row']
export type QuestionProgressEventRow =
  Database['public']['Tables']['question_progress_events']['Row']

export interface LocalQuestionProgress {
  id: string              // `${userId ?? deviceId}:${questionId}`
  userId: string | null
  deviceId: string | null
  sessionId?: string | null // last session that produced this row (guest backfill)
  questionId: string
  attempts: number
  correctCount: number
  incorrectCount: number
  skippedCount: number
  lastStatus: ProgressStatus
  lastSeenAt: number
  syncedAt: number | null
}

export interface LocalQuestionProgressEvent {
  id: string          // `${sessionId}:${questionId}`
  sessionId: string
  questionId: string
  status: ProgressStatus
  createdAt: number
}
```

`Question` automatically inherits the new `questions` columns through
`QuestionRow`. Do not redeclare them.

Extend `SessionSettings`:

```ts
export interface SessionSettings {
  // …existing fields…
  filter?: QuestionFilter
  kind?: 'mistakes'
}
```

---

## 3. Supabase query layer (`src/lib/supabase/queries.ts`)

### 3.1 Paginate question-id queries

`fetchQuestionIdsByChapters` currently returns at most the project’s PostgREST
row cap (often 1,000). The SSC exam alone has 13,207 questions (15,566 across
all four exams), so exam-level selections would silently truncate. Add
pagination and the source status:

```ts
export interface QuestionIdResult {
  id: string
  chapter_id: string
  source_status: SourceStatus | null
}

export async function fetchQuestionIdsByChapters(
  chapterIds: string[],
  opts: { statuses?: SourceStatus[] } = {},
): Promise<QuestionIdResult[]> {
  if (chapterIds.length === 0) return []
  const supabase = createClient()
  const PAGE = 1000
  const BATCH = 50
  const out: QuestionIdResult[] = []

  for (let i = 0; i < chapterIds.length; i += BATCH) {
    const batch = chapterIds.slice(i, i + BATCH)
    let from = 0
    for (;;) {
      let query = supabase
        .from('questions')
        .select('id, chapter_id, source_status')
        .in('chapter_id', batch)
        .order('id')
        .range(from, from + PAGE - 1)
      if (opts.statuses?.length) query = query.in('source_status', opts.statuses)
      const { data, error } = await query
      if (error) throw error
      out.push(...((data ?? []) as QuestionIdResult[]))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }
  return out
}
```

`fetchFullChapter` already uses `select('*')`, so the new columns flow through.
`fetchQuestionsByIds` also uses `select('*')`; no change beyond pagination
(batches of 50 ids are fine; a chapter is ≤ 761 questions).

### 3.2 Progress queries

```ts
export async function fetchQuestionProgress(userId: string): Promise<QuestionProgressRow[]> {
  const supabase = createClient()
  const PAGE = 1000
  const out: QuestionProgressRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('question_progress')
      .select('*')
      .eq('user_id', userId)
      .order('question_id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as QuestionProgressRow[]))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return out
}

export async function recordQuestionProgress(
  sessionId: string,
  rows: Array<{ question_id: string; status: ProgressStatus; device_id?: string | null }>,
): Promise<void> {
  if (rows.length === 0) return
  const supabase = createClient()
  const { error } = await supabase.rpc('record_question_progress', {
    p_session_id: sessionId,
    p_rows: rows,
  })
  if (error) throw error
}
```

Do not pass `user_id` from the client; the RPC uses `auth.uid()`.

### 3.3 Mappers (`src/lib/supabase/mappers.ts`)

```ts
export function rowToLocalProgress(
  r: QuestionProgressRow,
  syncedAt: number,
): LocalQuestionProgress {
  return {
    id: `${r.user_id}:${r.question_id}`,
    userId: r.user_id,
    deviceId: r.device_id,
    questionId: r.question_id,
    attempts: r.attempts,
    correctCount: r.correct_count,
    incorrectCount: r.incorrect_count,
    skippedCount: r.skipped_count,
    lastStatus: r.last_status as ProgressStatus,
    lastSeenAt: Date.parse(r.last_seen_at),
    syncedAt,
  }
}
```

---

## 4. Dexie (IndexedDB)

### 4.1 Schema v6

In `src/lib/dexie/db.ts`:

```ts
questionProgress!: EntityTable<LocalQuestionProgress, 'id'>
questionProgressEvents!: EntityTable<LocalQuestionProgressEvent, 'id'>

this.version(6).stores({
  questionProgress: 'id, questionId, lastStatus, lastSeenAt',
  questionProgressEvents: 'id, sessionId',
})
```

Keep all prior versions. `id` is `${userId ?? deviceId}:${questionId}` so guest
and logged-in rows do not collide on a shared browser.

### 4.2 Helpers in `src/lib/dexie/cache.ts`

```ts
export async function getLocalProgressMap(
  userId: string | null,
  deviceId: string,
): Promise<Map<string, LocalQuestionProgress>> {
  const rows = await db.questionProgress.toArray()
  const map = new Map<string, LocalQuestionProgress>()
  for (const r of rows) {
    const mine = userId ? r.userId === userId : r.userId === null && r.deviceId === deviceId
    if (mine) map.set(r.questionId, r)
  }
  return map
}
```

Recording a completed session is a read-modify-write in Dexie, then one RPC
call when logged in:

```ts
export async function recordSessionOutcomes(args: {
  sessionId: string
  userId: string | null
  deviceId: string
  questions: Array<{ id: string }>
  answers: Record<string, LocalAnswer>
}): Promise<void> {
  const { sessionId, userId, deviceId, questions, answers } = args
  const ids = questions.map((q) => q.id)
  const existing = await db.questionProgress.bulkGet(ids.map((qid) => `${userId ?? deviceId}:${qid}`))
  const byId = new Map(existing.filter(Boolean).map((r) => [r!.questionId, r!]))
  const eventIds = ids.map((qid) => `${sessionId}:${qid}`)
  const events = await db.questionProgressEvents.bulkGet(eventIds)
  const alreadyRecorded = new Set(events.filter(Boolean).map((e) => e!.questionId))
  const now = Date.now()
  const puts: LocalQuestionProgress[] = []
  const newEvents: LocalQuestionProgressEvent[] = []
  const rpcRows: Array<{ question_id: string; status: ProgressStatus; device_id: string }> = []

  for (const qid of ids) {
    // Re-submitting the same session must not double-count locally either.
    if (alreadyRecorded.has(qid)) continue
    const a = answers[qid]
    const status: ProgressStatus =
      a?.selectedOption != null ? (a.isCorrect ? 'correct' : 'incorrect') : 'skipped'
    const key = `${userId ?? deviceId}:${qid}`
    const prev = byId.get(qid)
    const row: LocalQuestionProgress = {
      id: key,
      userId,
      deviceId,
      sessionId,
      questionId: qid,
      attempts: (prev?.attempts ?? 0) + 1,
      correctCount: (prev?.correctCount ?? 0) + (status === 'correct' ? 1 : 0),
      incorrectCount: (prev?.incorrectCount ?? 0) + (status === 'incorrect' ? 1 : 0),
      skippedCount: (prev?.skippedCount ?? 0) + (status === 'skipped' ? 1 : 0),
      lastStatus: status,
      lastSeenAt: now,
      syncedAt: userId ? null : now,
    }
    puts.push(row)
    newEvents.push({
      id: `${sessionId}:${qid}`,
      sessionId,
      questionId: qid,
      status,
      createdAt: now,
    })
    rpcRows.push({ question_id: qid, status, device_id: deviceId })
  }

  await db.questionProgressEvents.bulkPut(newEvents)
  await db.questionProgress.bulkPut(puts)

  if (userId) {
    recordQuestionProgress(sessionId, rpcRows)
      .then(() => db.questionProgress.bulkPut(puts.map((r) => ({ ...r, syncedAt: Date.now() }))))
      .catch((e) => console.error('[progress] push failed:', e))
  }
}
```

### 4.3 Sync flow (`src/lib/session/sync.ts`)

- `runSyncFlow` adds `syncPendingProgress(userId)` and
  `pullQuestionProgress(userId)`.
- **Push** — group unsynced rows by `sessionId` and call the RPC once per
  session, then stamp `syncedAt` (the RPC is idempotent per
  `(session_id, question_id)`, so replaying a session is safe):

  ```ts
  export async function syncPendingProgress(userId: string): Promise<void> {
    const unsynced = await db.questionProgress
      .filter((r) => r.userId === userId && r.syncedAt === null)
      .toArray()
    const bySession = new Map<string, LocalQuestionProgress[]>()
    for (const r of unsynced) {
      if (!r.sessionId) continue // nothing to anchor the idempotency key to
      const list = bySession.get(r.sessionId) ?? []
      list.push(r)
      bySession.set(r.sessionId, list)
    }
    for (const [sessionId, rows] of bySession) {
      await recordQuestionProgress(
        sessionId,
        rows.map((r) => ({
          question_id: r.questionId,
          status: r.lastStatus,
          device_id: r.deviceId,
        })),
      )
      await db.questionProgress.bulkPut(
        rows.map((r) => ({ ...r, syncedAt: Date.now() })),
      )
    }
  }
  ```

  A guest session that is never replayed has no `sessionId` only if it was
  written by an older app version; ignore those rows (they remain local).
- **Pull** — `fetchQuestionProgress(userId)` → `rowToLocalProgress` →
  `db.questionProgress.bulkPut`. Conflict rule: a local row with
  `syncedAt === null` has un-pushed changes and wins; everything else takes the
  remote copy.
- `migrateGuestData` claims guest progress rows:
  `db.questionProgress.filter(r => r.deviceId === deviceId && r.userId === null)`
  → set `userId`, `syncedAt: null`. The next `syncPendingProgress` groups them
  by their stored `sessionId` and uploads them.

---

## 5. Record outcomes when a session completes

### 5.1 Mock submit (`src/stores/sessionStore.ts`)

`submit()` already marks the session inactive. Add the progress write after it:

```ts
const { sessionId, questions, answers, scopeId } = get()
const userId = await currentUserId()
const deviceId = getDeviceId()
if (sessionId) {
  await recordSessionOutcomes({ sessionId, userId, deviceId, questions, answers })
}
```

`submitSection()` calls `submit()` for the final section, so it is covered.
Sectional submits before the last one should **not** record progress (the user
has not finished the test and can still change answers).

Re-submitting the same session is treated as a retry, not as a new attempt:
the local event ledger and the server-side event ledger both key on
`(session_id, question_id)`, so counters increment once. If you want editing a
submitted session to count again, start a new session id instead.

### 5.2 Practice complete (`src/components/session/SessionLayout.tsx`)

Practice sessions are created with `isSubmitted: true`, so `submit()` never
runs. In `handleComplete`, after saving the session:

```ts
await recordSessionOutcomes({
  sessionId,
  userId: await currentUserId(),
  deviceId: getDeviceId(),
  questions,
  answers: useSessionStore.getState().answers,
})
```

Also record on `beforeunload`? No — only on explicit Complete/Submit. Recording
on every answer would inflate attempts and make “wrong only” noisy.

### 5.3 Skipped detection

A question is **skipped** when there is no `LocalAnswer` for it, or
`selectedOption == null` (marked-for-review but not answered). Do not rely on
`session_answers` rows: the current app only writes a row when an option is
selected or a question is marked.

---

## 6. Effective status + selection

### 6.1 Rule

```ts
export function effectiveStatus(
  sourceStatus: SourceStatus | null | undefined,
  progress: LocalQuestionProgress | undefined,
): SourceStatus {
  if (progress) return progress.lastStatus           // latest OpenLearn attempt wins
  return sourceStatus ?? 'unknown'
}
```

- `incorrect` → wrong only
- `skipped` → skipped only
- `correct` → correct only
- `unseen` → no progress row **and** (`source_status == null` or `'unknown'`)
- `all` → everything
- `marked` → question is marked in any local session for the scope

### 6.2 `src/lib/session/selection.ts` (new)

```ts
export interface SelectArgs {
  chapterIds: string[]
  filter: QuestionFilter
  userId: string | null
  deviceId: string
  limit?: number
  shuffle?: boolean
}

export interface SelectionResult {
  ids: string[]
  counts: { all: number; correct: number; incorrect: number; skipped: number; unknown: number; unseen: number }
}
```

Implementation:

1. `const rows = await getQuestionIdsForChapters(chapterIds)` (now includes
   `sourceStatus`, paginated). Update the cached branch in `cache.ts` too:
   for a cache hit, push
   `{ id: q.id, chapterId, sourceStatus: q.source_status ?? null }` from
   `cached.questions`; for a miss, the fetched rows already carry it.
2. `const progress = await getLocalProgressMap(userId, deviceId)`.
3. Compute `effectiveStatus` per row and the counts.
4. Filter by mode. For `marked`, build the marked set:
   ```ts
   const sessions = await db.sessions.where('scopeId').anyOf(chapterIds).toArray()
   const answers = await db.answers.where('sessionId').anyOf(sessions.map(s => s.id)).toArray()
   const marked = new Set(answers.filter(a => a.isMarked).map(a => a.questionId))
   ```
   Note: for exam scope, `scopeId` is the exam id, not a chapter id; for the
   marked filter at exam/book scope, resolve chapter ids first and use those.
5. Shuffle (Fisher-Yates) and slice to `limit` if provided.
6. Return `{ ids, counts }`.

For a 15k-question exam this is one paginated catalog query plus a local Dexie
read — no per-question requests.

---

## 7. UI: practice mistakes

### 7.1 New component `src/components/catalog/PracticeFilterModal.tsx`

Props:

```ts
interface PracticeFilterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: 'chapter' | 'book' | 'exam'
  title: string
  chapterIds: string[]
  examId: string
  bookId: string | null
  chapterId: string | null
  counts: { incorrect: number; skipped: number; correct: number; unseen: number; all: number }
  onStart: (filter: QuestionFilter, ids: string[]) => void
}
```

Behaviour:

- Pills: `All (n)` · `Wrong (n)` · `Skipped (n)` · `Wrong + Skipped (n)` ·
  `Correct (n)` · `Unseen (n)`.
  “Wrong + Skipped” is a UI convenience that filters
  `status === 'incorrect' || status === 'skipped'` in one pass (do not add a
  seventh DB mode; implement it in the component by unioning the two id sets).
- Count input (default min(all available, 25 after filtering), max 200).
- Shuffle toggle.
- Start button disabled when 0 questions.
- Show a tiny explanation: “Wrong/skipped status comes from your original
  attempt; your latest OpenLearn attempt overrides it.”

### 7.2 Chapter card (`src/components/catalog/ChapterCard.tsx`)

- Accept `sourceCounts?: Pick<Chapter, 'source_correct_count' | ...>` and
  `onMistakesClick?: (chapterId: string) => void`.
- Under the existing stats line, render:
  `✓ {correct} · ✗ {incorrect} · — {skipped}` (use the em dash for skipped and
  `?` for unknown). Hide zeros.
- Action row: keep `Practice` and `Mock Test`; add a full-width secondary
  button `Practice mistakes (✗ + —)` shown when `incorrect + skipped > 0`.
- Clicking it opens `PracticeFilterModal` for that chapter.

### 7.3 Book page (`src/app/[examSlug]/[bookSlug]/page.tsx`)

- Add a header button `Practice mistakes` next to the three-dot menu.
- `chapterIds` = all chapters of the book.
- Title = book name.
- Counts = sum of the chapters’ `source_*_count` columns (already on the
  `chapters` rows; no extra fetch).
- Starting creates a practice session with the selected ids (see 7.6).

### 7.4 Exam page (`src/app/[examSlug]/page.tsx`)

- Add a `Practice mistakes` button near the exam title. It must first resolve
  the exam’s books → chapters (`getCachedChapters` / `fetchChaptersByBook`) and
  then open the modal with all chapter ids.
- This is the exam-level “only my wrong/skipped questions” entry point.

### 7.5 Home exam card (optional but useful)

`ExamCard` already takes `onMockClick`. Add `onMistakesClick` and render a small
`Mistakes` link. Same flow as 7.4.

### 7.6 Building the practice session

Add a helper (in the page or a small `lib/session/practice.ts`):

```ts
async function startMistakesPractice(args: {
  scope: 'chapter' | 'book' | 'exam'
  examId: string
  bookId: string | null
  chapterId: string | null
  ids: string[]
  filter: QuestionFilter
  router: ReturnType<typeof useRouter>
  initSession: SessionStore['initSession']
}) {
  const questions = await fetchQuestionsByIds(args.ids)
  const sessionId = crypto.randomUUID()
  await args.initSession(sessionId, {
    scope: args.scope,
    sessionType: 'practice',
    examId: args.examId,
    bookId: args.bookId,
    chapterId: args.chapterId,
    questionIds: args.ids,
    shuffle: false,
    settings: {
      questionCount: args.ids.length,
      timeLimitMinutes: null,
      shuffle: false,
      sectionalTiming: false,
      filter: args.filter,
      kind: 'mistakes',
    },
  }, {
    chapterId: args.chapterId ?? '',
    concepts: [],
    questions,
    contentVersion: null,
    cachedAt: Date.now(),
  })
  args.router.push(`/session/${sessionId}`)
}
```

Practice mode gives instant solutions after each answer, which is what you
want for mistakes. The session is saved in Dexie and shown in History.

### 7.7 History badge

In `src/app/history/page.tsx`, if `s.settings?.kind === 'mistakes'`, show a
badge like `Mistakes: Wrong` or `Mistakes: Skipped` using
`s.settings.filter`. This makes the sessions distinguishable from normal
practice.

---

## 8. Review surfaces

### 8.1 `QuestionReview` / `QuestionCard`

- If `question.source_status` exists, render a small badge:
  `Originally: Correct | Wrong | Skipped | Unknown`.
- If `question.question_source` exists, render it under the badge:
  `The Pundits · ProMocks LIVE Mock 22`.
- Add the same on the results page. This explains why a question appears in the
  mistakes set.
- Do not show the original answer/option; only the outcome.

### 8.2 `ResultsSummary`

Add a footer action: `Practice this test’s mistakes (N)`, where N = questions
in the current session with `effectiveStatus === 'incorrect' | 'skipped'`.
- Compute from the session’s `questions` + `answers` (and source status for
  unanswered questions).
- On click, call `startMistakesPractice` with the current session’s
  `scope/scopeId` and the selected ids.
- This mirrors the “Re-attempt wrong/skipped” buttons in the sibling
  `mock-pool` project.

---

## 9. Exam config

`src/lib/exam-configs.ts` is a static registry. Add the SSC and Banking entries.
(The UP Lekhpal / UP State exams can use the **Custom** tab; if you add configs
for them, keep each section’s `questionCount` no larger than the smallest book —
UP Lekhpal Reasoning has only 4 questions.)

```ts
[
  {
    examSlug: 'ssc-cgl-pre-2026-attempted-mock-tests',
    label: 'SSC CGL Pre 2026 — Attempted Mocks',
    shuffle: true,
    sections: [
      { slug: 'quant',     label: 'Quantitative Aptitude',                 bookSlugs: ['cgl-pre2026-attempted-quant'],     questionCount: 25, timeLimitMinutes: 15, marksPerCorrect: 2, marksPerWrong: -0.5, totalMarks: 50 },
      { slug: 'reasoning', label: 'Reasoning & General Intelligence',      bookSlugs: ['cgl-pre2026-attempted-reasoning'], questionCount: 25, timeLimitMinutes: 15, marksPerCorrect: 2, marksPerWrong: -0.5, totalMarks: 50 },
      { slug: 'english',   label: 'English Language & Comprehension',      bookSlugs: ['cgl-pre2026-attempted-english'],   questionCount: 25, timeLimitMinutes: 15, marksPerCorrect: 2, marksPerWrong: -0.5, totalMarks: 50 },
      { slug: 'ga',        label: 'General Awareness',                      bookSlugs: ['cgl-pre2026-attempted-ga'],        questionCount: 25, timeLimitMinutes: 15, marksPerCorrect: 2, marksPerWrong: -0.5, totalMarks: 50 },
    ],
  },
  {
    examSlug: 'banking-pre-2026-attempted-mock-tests',
    label: 'Banking Pre 2026 — Attempted Mocks',
    shuffle: true,
    sections: [
      { slug: 'english',   label: 'English Language',   bookSlugs: ['banking-pre2026-attempted-english'],   questionCount: 30, timeLimitMinutes: 20, marksPerCorrect: 1, marksPerWrong: -0.25, totalMarks: 30 },
      { slug: 'reasoning', label: 'Reasoning Ability',  bookSlugs: ['banking-pre2026-attempted-reasoning'], questionCount: 35, timeLimitMinutes: 20, marksPerCorrect: 1, marksPerWrong: -0.25, totalMarks: 35 },
      { slug: 'quant',     label: 'Quantitative Aptitude', bookSlugs: ['banking-pre2026-attempted-quant'], questionCount: 35, timeLimitMinutes: 20, marksPerCorrect: 1, marksPerWrong: -0.25, totalMarks: 35 },
    ],
  },
]
```

The Banking books hold English 263, Reasoning 582 and Quant 319 questions — all
large enough for the 30/35/35 prelims pattern. The `banking-pre2026-attempted-ga`
book exists (13 questions) but is not a prelims section.

Without these entries the exam pages still work through the **Custom** tab
(`MockSettingsModal` with no configs), but adding them gives the one-click
full-length exam.

---

## 10. Optional: seed progress from the original outcomes

The “wrong only” filter already works from `questions.source_status` with no
seeding. If you want `question_progress` to start pre-populated for the owner’s
account (so the dashboard shows historical counts), do a one-time backfill for
the logged-in owner **after** the migration and a sync:

```sql
-- Replace :user_id with the owner's auth user id.
insert into public.question_progress
  (user_id, question_id, attempts, correct_count, incorrect_count, skipped_count,
   last_status, last_seen_at)
select
  :user_id,
  q.id,
  1,
  (q.source_status = 'correct')::int,
  (q.source_status = 'incorrect')::int,
  (q.source_status = 'skipped')::int,
  case q.source_status
    when 'correct' then 'correct'
    when 'incorrect' then 'incorrect'
    when 'skipped' then 'skipped'
    else 'skipped'
  end,
  now()
from public.questions q
join public.chapters c on c.id = q.chapter_id
join public.books b on b.id = c.book_id
join public.exams e on e.id = b.exam_id
where e.slug in (
  'ssc-cgl-pre-2026-attempted-mock-tests',
  'banking-pre-2026-attempted-mock-tests',
  'up-lekhpal-pre-2026-attempted-mock-tests',
  'up-state-pre-2026-attempted-mock-tests'
)
  and q.source_status in ('correct', 'incorrect', 'skipped')
on conflict (user_id, question_id) do nothing;
```

Skip this if you prefer the filter to fall back to `source_status` and only
learn from new OpenLearn attempts.

---

## 11. Acceptance tests

### 11.1 SQL (run in the Supabase SQL editor)

```sql
-- 1. per-exam totals
select e.slug, e.total_questions, count(q.id) as actual
from exams e
join books b on b.exam_id = e.id
join chapters c on c.book_id = b.id
join questions q on q.chapter_id = c.id
where e.slug like '%pre-2026-attempted-mock-tests'
group by e.slug, e.total_questions
order by e.slug;
-- expect ssc 13207, banking 1177, up-lekhpal 942, up-state 240

-- 2. provenance per exam
select e.slug, q.source_status, count(*)
from questions q
join chapters c on c.id = q.chapter_id
join books b on b.id = c.book_id
join exams e on e.id = b.exam_id
where e.slug like '%pre-2026-attempted-mock-tests'
group by 1, 2
order by 1, 2;
-- SSC: 8824 correct / 1538 incorrect / 1785 skipped / 1060 unknown
-- Banking: 638 / 121 / 278 / 140
-- UP Lekhpal: 349 / 267 / 326 / 0
-- UP State: 68 / 57 / 115 / 0

-- 3. SSC contamination check (must be 0)
select count(*)
from questions q
join chapters c on c.id = q.chapter_id
join books b on b.id = c.book_id
join exams e on e.id = b.exam_id
where e.slug = 'ssc-cgl-pre-2026-attempted-mock-tests'
  and (
    q.question_source ilike '%SBI%' or q.question_source ilike '%IBPS%'
    or q.question_source ilike '%RBI%' or q.question_source ilike '%Lekhpal%'
    or q.question_source ilike '%UPSSSC%' or q.question_source ilike '%UPPSC%'
    or q.question_source ilike '%UP GK%'
  );

-- 4. every question has exactly one correct option
select count(*) from (
  select q.id
  from questions q
  join chapters c on c.id = q.chapter_id
  join books b on b.id = c.book_id
  join exams e on e.id = b.exam_id
  join question_options o on o.question_id = q.id
  where e.slug like '%pre-2026-attempted-mock-tests'
  group by q.id
  having count(*) filter (where o.is_correct) <> 1
) bad;
-- expect 0

-- 5. chapter counters sum to each exam total
select e.slug, sum(source_correct_count + source_incorrect_count +
                   source_skipped_count + source_unknown_count) as total
from chapters c
join books b on b.id = c.book_id
join exams e on e.id = b.exam_id
where e.slug like '%pre-2026-attempted-mock-tests'
group by e.slug
order by e.slug;
-- expect 13207 / 1177 / 942 / 240
```

### 11.2 Build

```bash
npm run type-check
npm run lint
npm run build
```

### 11.3 Manual flows

1. **Catalog**: the four imported exam cards show the right counts:
   SSC 13,207 (66 chapters, `ssc`), Banking 1,177 (40, `banking`),
   UP Lekhpal 942 (29, `state`), UP State 240 (27, `state`).
   The SSC card must show **no** SBI/IBPS/RBI/Lekhpal/PET/RO-ARO test labels
   when you open its questions.
2. **Chapter practice**: open SSC `Quantitative Aptitude → Percentage`; the card
   shows `✓ · ✗ · —` counts; Practice loads 251 questions; Mock Test works.
   The Banking exam has its own `Percentage` chapter with 29 questions.
3. **Mistakes — chapter**: click `Practice mistakes`; the modal shows counts
   that match the chapter card; Wrong starts a session containing only
   `effectiveStatus === 'incorrect'` questions; Skipped only skipped ones.
4. **Mistakes — book/exam**: the book page and exam page buttons open the modal
   with the combined counts; “Wrong + Skipped” returns the union.
5. **Guest recording**: in guest mode, answer some questions in a practice
   session, click Complete, close and reopen the browser; the mistakes counts
   change (Dexie persisted). No network writes.
6. **Logged-in recording**: log in, submit a mock; `question_progress` gets one
   row per question in the session (including skipped); `last_status` matches
   the result; `attempts` increments. Submit the same session again (retry):
   counters do **not** increase (event ledger).
7. **RLS**: with a second account, `select * from question_progress` returns
   only that account’s rows.
8. **Exam config**: the SSC **Exam** tab starts a 4-section mock (25 Q / 15 min
   each); the Banking tab starts the 30/35/35 prelims pattern.
9. **History**: mistakes sessions show the `Mistakes` badge and the filter used.
10. **Review**: imported questions show `Originally: Wrong/Skipped/Correct` and
    the source test title.
11. **Idempotent sync**: re-run `npm run sync-openlearn` from `mock-pool`;
    per-exam counts stay 13,207 / 1,177 / 942 / 240 (15,566 total), no empty
    chapters reappear, and no errors occur.

### 11.4 Edge cases

- Questions with 5 or 6 options (labels `a`–`f`) render and score correctly.
- Questions with `source_status = 'unknown'` appear under `Unseen`, not
  `Wrong` or `Skipped`.
- Questions with empty option text but an image option render the image.
- A session with zero answered questions records every question as `skipped`.
- Marked-but-unanswered questions count as `skipped`, not `incorrect`.
- A practice session that is abandoned without Complete records nothing.

---

## 12. Rollout order

1. Run the migration (section 1) in Supabase. The catalog-side columns are
   already live; this is idempotent and creates `question_progress` + the RPC if
   they are still missing.
2. Regenerate types and deploy the app changes (sections 2–9).
3. From `mock-pool`, run `npm run sync-openlearn` after any source-classification
   change; it fills provenance, chapter counters, and the four exam totals.
4. (Optional) backfill owner progress for all four exams (section 10).
5. Run the acceptance tests (section 11).

---

## 13. Pitfalls

- **Never** renumber existing `question_number` values in bulk; the unique
  constraint will reject the update. The importer already preserves them.
- **Do not** call `record_question_progress` for guest sessions; `auth.uid()`
  is null and the RPC raises. Guests are Dexie-only.
- **Do not** pass `user_id` from the client. The RPC uses `auth.uid()`.
- **Do not** filter by progress in SQL before the progress rows are fetched;
  the override rule is client-side. Fetch ids + source statuses, then overlay
  Dexie progress.
- **Paginate** `.select()` queries. Supabase’s PostgREST row cap (commonly
  1,000) silently truncates exam-level selections (SSC alone has 13,207).
- **One exam per question**: `questions.chapter_id` is a single FK, so a
  question cannot be in two exams. Reclassifying moves it. The DB trigger bumps
  only the **new** chapter’s `content_version`; the importer explicitly bumps
  every chapter it touches during cleanup so the exam it left does not serve a
  stale cached copy.
- **Source classification** lives in `scripts/sync-openlearn.mjs`
  (`sourceGroup`). It is title-based because the catalog categories are not
  reliable (Parmar mocks are labelled `other`, testbook has none). If a new
  platform uses different test names, extend that function before syncing.
- **Targeted syncs**: `npm run sync-openlearn -- --exam=banking` only refreshes
  Banking. The exam a question left keeps its old totals until a full run
  (which always performs the cleanup pass). Prefer a full run after a
  reclassification.
- **Keep the write order**: Dexie first, Supabase second (fire-and-forget).
  Never block the UI on the RPC.
- **HTML**: `KaTeXRenderer` passes raw HTML through `marked`. The importer has
  already stripped scripts/styles/iframes/event handlers and `javascript:`
  URLs. Do not add a second markdown transform that escapes the HTML.
- **Images** stay on the original CDNs. If a host starts blocking hotlinks,
  mirror the files into the `book-images` bucket and rewrite the `<img src>` to
  a storage path; no schema change is needed.
- **`FOUND` semantics**: in the RPC, `FOUND` after `insert … on conflict do
  nothing` is true only when a new event row was inserted; that is what makes
  retries idempotent.
- **`question_progress.last_status`** never stores `unknown`; only the three
  real outcomes. `unknown` exists only on the catalog `source_status`.
- **Book/exam mistake counts** use the static `chapters.source_*_count`
  columns. After the user practices, the live per-question state can differ;
  the filter itself is always live (progress overrides source status), so the
  displayed counts are a baseline, not a promise. Label them “original
  outcomes” in the tooltip.
