-- Question status, provenance, and per-user progress.
-- Safe to run more than once.

-- ─────────────────────────────────────────────────────────────
-- 1. Provenance columns on questions
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- 2. Per-chapter outcome counters
-- ─────────────────────────────────────────────────────────────

alter table public.chapters
  add column if not exists source_correct_count int not null default 0,
  add column if not exists source_incorrect_count int not null default 0,
  add column if not exists source_skipped_count int not null default 0,
  add column if not exists source_unknown_count int not null default 0;

-- ─────────────────────────────────────────────────────────────
-- 3. Per-user progress (one aggregate row per user + question)
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- 4. Idempotency ledger (one row per session + question)
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- 5. RPC that records a submitted session
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────

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
