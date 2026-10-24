# OpenLearn — bilingual questions (English + हिंदी) implementation prompt

> **What this file is.** A self-contained implementation prompt for the OpenLearn
> repo (`github.com/abhi8bit/openLearn`). It adds a display-only language toggle
> (English / हिंदी) to questions, options and solutions, backed by three new
> catalog columns. Implement Part A in OpenLearn; Part B is the companion data
> upload that lives in the sibling `mock-pool` repo.
>
> **Status verified 2026-10-24 — the Hindi data is NOT uploaded yet.**
>
> - The live OpenLearn Supabase DB has **no** `*_hi` columns on `questions`,
>   `question_options` or `question_solutions` (verified against the live schema).
> - `mock-pool/data/mocks/_practice/pool_*.jsonl` (the publisher input) has **no**
>   `text_hi` field — the pool was last built before bilingual extraction.
> - `mock-pool/scripts/sync-openlearn.mjs` has no Hindi handling at all.
>
> Therefore: Part A can be implemented and deployed safely today — the toggle
> simply stays hidden while every Hindi column is `null`. Part B must run before
> the feature becomes visible.
>
> **Read before editing:** `OPENLEARN-CONTEXT.md` §2 (architecture, data model,
> key files) and this file. Do not re-read `openlearn-update.md` for this task;
> it covers a different feature (wrong/skipped practice).

---

## 0. Scope and product rules

- A **global** language preference (not per question, not per session): `en` or
  `hi`, persisted in `localStorage` under `openlearn-language`, default `en`.
- The toggle is shown only when the currently rendered question set contains at
  least one genuine Hindi translation. English-only chapters/exams show no
  toggle at all.
- Hindi is **display-only**. Answers, correctness, scoring, timing, progress,
  sessions and saved questions are unchanged. The same option index/label is
  used in both languages.
- Fallback is **per field**, not per language: if a Hindi question text exists
  but the Hindi solution does not, show the Hindi question with the English
  solution.
- `question_text` is never overwritten. Hindi lives in separate columns.
- No runtime translation, no LLM calls, no on-the-fly transliteration.

---

## 1. Data contract

The publisher writes these nullable columns:

| table | column | meaning |
|---|---|---|
| `questions` | `question_text_hi` | Hindi question / passage text (HTML, sanitized exactly like `question_text`) |
| `question_options` | `option_text_hi` | Hindi option text (HTML), row-aligned by the existing `option_label` |
| `question_solutions` | `solution_text_hi` | Hindi solution text (HTML) |

Rules the publisher follows (Part B):

- Empty Hindi → `null` (never an empty string, never the English copy).
- Hindi identical to English (numbers, formulas) → `null` per field; a Hindi
  option may still differ even when the question text is identical.
- If the English field is empty and the Hindi field exists, keep the Hindi in
  the `_hi` column; the renderer falls back to it in both languages.
- Question / option / solution **ids are unchanged**. Only content columns are
  added.

Current Hindi availability in the 15,592 published pool rows (measured from the
stored source tests, before the pool rebuild):

| source platform | pool rows | with Hindi | distinct Hindi (≠ English) |
|---|---:|---:|---:|
| pundits | 374 | 374 | 314 |
| rbe | 1,085 | 473 | 373 |
| testranking | 1,977 | 1,977 | 1,841 |
| parmar | 6,492 | 0 | 0 |
| testbook | 5,664 | 0 | 0 |
| **total** | **15,592** | **2,824** | **2,528** |

Expected after Part B: **≈2,500–2,528 questions** with a distinct Hindi question
text across the four exams (the publisher collapses 26 cross-platform pool
duplicates). Parmar/Testbook stay English-only; Parmar has a second bank URL but
the extractor does not fetch it yet — see §6.3.

---

## 2. Database migration

Create `supabase/migrations/20261024000000_question_bilingual.sql` and run it in
the Supabase SQL editor (or `supabase db push`). Idempotent.

```sql
alter table public.questions
  add column if not exists question_text_hi text;

alter table public.question_options
  add column if not exists option_text_hi text;

alter table public.question_solutions
  add column if not exists solution_text_hi text;
```

Notes:

- No new tables, no RLS change. Catalog tables already allow public read; the new
  columns inherit those policies. Do **not** grant anon writes.
- Cache invalidation does not depend on the new columns: the publisher’s
  `cleanupExam()` bumps `chapters.content_version` for every synced chapter on a
  normal run. Do not assume the existing triggers fire for these new columns.
- Do not add indexes: the columns are only read with the question row.
- No backfill in SQL — the publisher is the only writer.

---

## 3. Types

### 3.1 `database.types.ts`

Regenerate (`npx supabase gen types typescript --project-id <id>`) or hand-add to
`questions.Row/Insert/Update`, `question_options.Row/Insert/Update` and
`question_solutions.Row/Insert/Update`:

```ts
question_text_hi: string | null        // questions
option_text_hi: string | null          // question_options
solution_text_hi: string | null        // question_solutions
```

### 3.2 `src/types/index.ts`

```ts
export type QuestionLanguage = 'en' | 'hi'
```

Add Hindi-aware helpers to `src/lib/i18n/question.ts` (new file):

```ts
import type { Question, QuestionLanguage } from '@/types'

export const DEVANAGARI = /[\u0900-\u097f]/

export const isDevanagari = (s: string | null | undefined) =>
  DEVANAGARI.test(s ?? '')

export function hasHindiText(q: Question): boolean {
  if (q.question_text_hi && q.question_text_hi !== q.question_text) return true
  if (q.options.some((o) => o.option_text_hi)) return true
  if (q.solution?.solution_text_hi) return true
  return false
}

export function questionText(q: Question, lang: QuestionLanguage): string {
  if (lang === 'hi') return q.question_text_hi || q.question_text || ''
  return q.question_text || q.question_text_hi || ''
}

export function optionText(
  o: { option_text: string; option_text_hi: string | null },
  lang: QuestionLanguage,
): string {
  if (lang === 'hi') return o.option_text_hi || o.option_text || ''
  return o.option_text || o.option_text_hi || ''
}

export function solutionText(
  q: Question,
  lang: QuestionLanguage,
): string {
  if (lang === 'hi') return q.solution?.solution_text_hi || q.solution?.solution_text || ''
  return q.solution?.solution_text || q.solution?.solution_text_hi || ''
}
```

`hasHindiText` deliberately ignores Hindi that is byte-identical to English
(common for arithmetic questions) so the toggle never appears for a fake
translation.

---

## 4. Language store

Create `src/stores/languageStore.ts`. Follow the existing Zustand store style in
the repo (same version/imports). If other stores use `persist`, reuse that
pattern; otherwise (snippet requires Zustand ≥ 4.4 for `skipHydration`):

```ts
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QuestionLanguage } from '@/types'

interface LanguageState {
  language: QuestionLanguage
  setLanguage: (l: QuestionLanguage) => void
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'openlearn-language',
      // hydrate after mount so SSR markup and the first client render match
      skipHydration: true,
    },
  ),
)
```

`skipHydration` requires one client-side `useEffect(() =>
useLanguageStore.persist.rehydrate())` in the root client shell (or the nearest
common provider). If the repo has an existing theme provider, add the call
there. Do not read `localStorage` during render.

---

## 5. UI

### 5.1 Toggle component

`src/components/ui/LanguageToggle.tsx`:

```tsx
'use client'

import { cn } from '@/lib/utils'
import { useLanguageStore } from '@/stores/languageStore'

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguageStore()
  return (
    <div
      role="group"
      aria-label="Question language"
      className={cn(
        'inline-flex overflow-hidden rounded-full border border-border bg-card',
        className,
      )}
    >
      {([['en', 'EN'], ['hi', 'हिं']] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={language === value}
          onClick={() => setLanguage(value)}
          className={cn(
            'px-3 py-1 text-xs font-bold',
            language === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

### 5.2 Where to render

Find the component(s) that actually print a question (search the repo for
`question_text`, `KaTeXRenderer`, `dangerouslySetInnerHTML`). Typically that is
`src/components/session/SessionLayout.tsx` plus a question card used by both the
runner and results/review. If the markup is duplicated, extract a shared
`QuestionBody` first — do not implement the translation twice.

Add the toggle:

1. **Session runner** — in the header/actions row (next to the timer/settings),
   rendered only when `questions.some(hasHindiText)`.
2. **Results / question review** — in the review header, same condition.
3. **Practice mode** — the instant-solution panel uses the same card, so it is
   covered automatically.
4. Do **not** add it to catalog pages (no question text is rendered there).

Render content with the helpers:

```tsx
const { language } = useLanguageStore()
const showToggle = questions.some(hasHindiText)

// header
{showToggle && <LanguageToggle />}

// question
<div className="prose ..." dangerouslySetInnerHTML={{ __html: questionText(q, language) }} />

// option
<span dangerouslySetInnerHTML={{ __html: optionText(o, language) }} />

// solution
{solutionText(q, language) && (
  <div dangerouslySetInnerHTML={{ __html: solutionText(q, language) }} />
)}
```

Keep option labels (`a..f`), option images, `is_correct` highlighting, marked
state and the answer inputs exactly as they are. Only the text source changes.

### 5.3 Cache display state

- The chapter cache stores whole `Question` objects, so the new fields come back
  automatically from `select('*')`. No Dexie version bump is needed.
- Cached questions from before the upload will not have Hindi until the chapter
  is refetched. The publisher bumps `chapters.content_version`; verify the app’s
  `getCachedOrFetchChapter()` invalidates on that value. If a chapter is not
  refetched in the acceptance test, clear IndexedDB for the site once.
- Do not add a separate Hindi cache or a second fetch.

---

## 6. Companion change: upload the Hindi data (mock-pool repo)

**This is a different repository. Do not implement it inside OpenLearn.** It is
listed here because the OpenLearn feature is invisible until the data exists.

The sibling project already has the Hindi text:

- RBE tests are now extracted with both banks (`text_hi` per question,
  `text_hi` per option, `solution_hi`).
- Pundits and TestRanking banks are natively bilingual (`question_hi`,
  `option_hi_*`); the pool builder now carries them through.
- Parmar and Testbook have no Hindi bank.

### 6.1 Rebuild the pool

`mock-pool/scripts/build-practice-pool.mjs` was updated on 2026-10-24 to write
`text_hi` and `solution_hi` into each pool row. From the mock-pool root:

```powershell
npm run practice-pool
```

### 6.2 Extend `scripts/sync-openlearn.mjs`

1. **Probe the columns** once at startup with the existing `hasColumn()` helper
   (same place as the `source_status` probe, which builds `caps`):

   ```js
   const caps = { provenance: false, chapterCounts: false, hindi: false }
   // ...
   caps.hindi =
     (await hasColumn('questions', 'question_text_hi')) &&
     (await hasColumn('question_options', 'option_text_hi')) &&
     (await hasColumn('question_solutions', 'solution_text_hi'))
   if (!caps.hindi) {
     console.warn('! question_*_hi columns are missing — Hindi will NOT be uploaded.')
     console.warn('  Apply new-prompt.md → supabase/migrations/20261024000000_question_bilingual.sql, then re-run.')
   }
   ```

   If a column is missing, log one warning and omit all three fields — the sync
   must keep working against an unmigrated DB.

2. **Questions upsert** — add:

   ```js
   // spread so an unmigrated DB is never sent unknown columns
   ...(caps.hindi ? { question_text_hi: hiOrNull(row.text_hi, row.text) } : {}),
   ```

3. **Options upsert** — add:

   ```js
   ...(caps.hindi ? { option_text_hi: hiOrNull(o.text_hi, o.text) } : {}),
   ```

4. **Solutions upsert** — add:

   ```js
   ...(caps.hindi ? { solution_text_hi: hiOrNull(row.solution_hi, row.solution) } : {}),
   ```

5. **Helper** — reuse the file’s sanitizer so Hindi HTML gets the same treatment
   as English (scripts/styles/iframes/event handlers/`javascript:` stripped,
   protocol-relative images → `https://`, `max-width:100%`):

   ```js
   const hiOrNull = (hi, en) => {
     const h = sanitizeHtml(hi);
     if (!h.trim()) return null;
     const e = sanitizeHtml(en);
     return h === e ? null : h;   // identical copy adds no value
   };
   ```

   Keep the deterministic UUIDs untouched. Hindi is content, not identity.

6. **Cache invalidation** — `cleanupExam()` already PATCHes every chapter of
   every synced exam with `content_version + 1` (it runs for full and `--exam=`
   runs). So a normal sync after the Hindi upload invalidates client caches. Do
   **not** use a `--limit` run for production: limited runs skip cleanup, so
   caches and totals would be stale.

7. **Run**

   ```powershell
   npm run sync-openlearn -- --dry-run
   npm run sync-openlearn
   ```

8. **Expected result** — ≈2,528 questions with a distinct Hindi question text
   (2,824 non-null Hindi strings before the identical-to-English filter),
   concentrated in the SSC exam (Pundits / TestRanking / RBE sources). Parmar
   and Testbook remain `null`.

### 6.3 Optional follow-up (not required for this feature)

Parmar’s catalog exposes `test_questions_url_2` exactly like RBE. Extending
`scripts/extract.mjs` (Parmar) with the same `pickAppxBanks` /
`normalizeAppxQuestions(..., hiBank)` flow used for RBE would add Hindi to the
6,492 Parmar pool rows — by far the largest coverage win. Treat it as a separate
mock-pool task and re-run the pool + publisher afterwards.

---

## 7. Explicit non-goals

- Do not add a language column to `user_sessions`, `session_answers`,
  `question_progress` or `saved_questions`.
- Do not store the selected language per session; it is a device preference.
- Do not change the answer/scoring model.
- Do not edit `question_text`, `option_text` or `solution_text` to hold Hindi.
- Do not translate with an LLM at read time.
- Do not expose the service key client-side (unchanged).

---

## 8. Acceptance tests

### 8.1 SQL (after Part B)

```sql
-- 1. columns exist
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and column_name in ('question_text_hi', 'option_text_hi', 'solution_text_hi')
order by 1, 2;
-- expect 3 rows

-- 2. coverage per exam
select e.slug,
       count(*) as questions,
       count(*) filter (where q.question_text_hi is not null) as with_hindi
from questions q
join chapters c on c.id = q.chapter_id
join books b on b.id = c.book_id
join exams e on e.id = b.exam_id
where e.slug like '%pre-2026-attempted-mock-tests'
group by e.slug
order by e.slug;
-- expect ≈2500–2528 total with_hindi; the SSC exam carries almost all of it
-- (Pundits/TestRanking/RBE sources), Banking gets the small SBI/IBPS/RBI part

-- 3. options / solutions
select
  (select count(*) from question_options where option_text_hi is not null) as hi_options,
  (select count(*) from question_solutions where solution_text_hi is not null) as hi_solutions;
-- both > 0 after the sync

-- 4. no English duplication stored as Hindi
select count(*) from questions
where question_text_hi is not null and question_text_hi = question_text;
-- expect 0

-- 5. chapter totals still intact
select e.slug, e.total_questions, count(q.id)
from exams e
join books b on b.exam_id = e.id
join chapters c on c.book_id = b.id
join questions q on q.chapter_id = c.id
where e.slug like '%pre-2026-attempted-mock-tests'
group by 1, 2 order by 1;
-- expect 13207 / 1177 / 942 / 240
```

### 8.2 Build

```bash
npm run type-check
npm run lint
npm run build
```

### 8.3 Manual flows

1. **Toggle appears** — open an SSC chapter that contains Pundits/TestRanking/RBE
   questions (find one with SQL: group `question_text_hi is not null` by
   `chapters.name`). The session header shows `EN | हिं`.
2. **Switches all three surfaces** — clicking हिं changes the question, every
   option and the solution. Option labels and the correct-answer highlight stay
   on the same options.
3. **Scoring is unchanged** — answer in Hindi, submit; score, correctness,
   per-question outcome, timer and progress rows are identical to an English run.
4. **Per-field fallback** — a question with Hindi text but no Hindi solution
   shows the Hindi question + English solution; no blank panels.
5. **No fake toggle** — a Parmar/Testbook-only chapter shows no toggle; neither
   does a chapter whose Hindi strings are identical to English.
6. **Persistence** — choose हिं, reload and start a new session: the preference
   survives. Guests and logged-in users behave the same (no network write).
7. **Results/review** — the same toggle works on the results page and question
   review; previously answered sessions show Hindi without changing stored
   answers.
8. **Cache** — after the publisher sync (content_version bump), a chapter that
   was cached before the upload refetches once and then shows the toggle.
9. **English-only environments** — with an unmigrated DB (no `_hi` columns), the
   sync warns, the app builds, and no toggle appears. No crashes on `null`.

### 8.4 Edge cases

- Hindi option text present while the Hindi question text is `null`.
- Image-only options (empty text, `option_text_hi = null`) still render.
- 5–6 option questions (`a..f`) in Hindi.
- A question whose `question_text` is already Devanagari (Hindi-medium source)
  and `question_text_hi` is null: render it in both modes, no toggle flip needed.
- Very long Hindi passages scroll exactly like English (same renderer).
- MathJax/KaTeX and remote `<img>` URLs inside Hindi HTML render normally.

---

## 9. Rollout order

1. **Part B first (recommended)**: run the migration in §2, then the publisher
   changes in §6 and a full sync. Verify §8.1.
2. **Part A**: types → language store → helpers → toggle → render swaps
   (§3–§5). Because everything falls back to English, Part A can also ship
   before the data.
3. Run §8.2–§8.4.
4. Re-run `npm run sync-openlearn` from mock-pool whenever new bilingual tests
   are extracted; it is idempotent.

---

## 10. Pitfalls

- **Do not** put Hindi in the existing text columns and do **not** overwrite
  `question_text`; the provenance/import pipeline assumes the original.
- **Do not** gate scoring or session creation on language. The option indexes are
  identical across banks; only the rendered strings differ.
- **Do not** null the Hindi when the English is empty — that is exactly the
  Hindi-only case.
- **Do not** store Hindi that is byte-identical to English; it creates a
  meaningless toggle.
- **Do not** build a second `fetchFullChapter` call. `select('*')` already
  includes the new columns; the existing cache path handles them.
- **Hydration**: a persisted language read during render causes a mismatch; use
  `skipHydration` + rehydrate in an effect.
- **Content version**: a Hindi-only publisher run must bump
  `chapters.content_version`, or existing Dexie caches will keep showing English.
- **Sanitization**: Hindi HTML is third-party HTML — sanitize it with the same
  function as the English fields, not with a second weaker path.
- **Coupling**: the publisher is in `mock-pool`; OpenLearn must not import from
  it. The only contract is the three nullable columns.
- **Coverage expectations**: ~2,500–2,528 published questions have Hindi today.
  Do not present the whole catalog as bilingual; the toggle’s per-scope
  availability check is what keeps the UX honest.
- **Memoize** the per-scope availability check (`useMemo` on the question list);
  do not rescan every question on each keystroke/answer.
