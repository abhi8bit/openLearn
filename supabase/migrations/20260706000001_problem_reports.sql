-- Problem Reports
-- A public feedback channel: any visitor (guest or logged-in) can report an
-- issue with a question, its answer/options, the solution, an image, the UI/UX,
-- or something else. Writes are UNAUTHENTICATED, so abuse safeguards are layered:
--   1. Column CHECK constraints bound the free-text length + restrict the type.
--   2. RLS grants INSERT only (no SELECT/UPDATE/DELETE for anon/authenticated) —
--      reports are readable only via the service role (admin/back office).
--   3. A SECURITY DEFINER trigger rate-limits inserts per device_id.
-- Safe to run more than once (guards with IF NOT EXISTS / drop-before-create).

create extension if not exists pgcrypto schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────

create table if not exists public.problem_reports (
  id           uuid primary key default gen_random_uuid(),

  -- Related catalog context (all nullable — a UI/UX report may target none).
  question_id  uuid references public.questions(id) on delete set null,
  chapter_id   uuid references public.chapters(id)  on delete set null,
  book_id      uuid references public.books(id)     on delete set null,
  exam_id      uuid references public.exams(id)     on delete set null,
  session_id   uuid,

  -- What is being reported.
  problem_type text not null,
  custom_type  text,
  description  text not null,

  -- Who reported (both nullable — guests supply only device_id).
  user_id      uuid,
  device_id    text,

  status       text not null default 'open',
  created_at   timestamptz not null default now(),

  -- Abuse safeguards enforced at the table level:
  constraint problem_reports_description_len
    check (char_length(description) between 1 and 1000),
  constraint problem_reports_custom_type_len
    check (custom_type is null or char_length(custom_type) <= 80),
  constraint problem_reports_type_allowed
    check (problem_type in ('question', 'answer', 'solution', 'image', 'ui_ux', 'other')),
  constraint problem_reports_status_allowed
    check (status in ('open', 'reviewing', 'resolved', 'dismissed'))
);

-- Triage / rate-limit lookup indexes.
create index if not exists problem_reports_created_at_idx
  on public.problem_reports (created_at desc);
create index if not exists problem_reports_device_recent_idx
  on public.problem_reports (device_id, created_at desc);
create index if not exists problem_reports_question_idx
  on public.problem_reports (question_id);

-- ─────────────────────────────────────────────────────────────
-- Rate limit — no more than 10 reports per device_id per hour.
-- SECURITY DEFINER so the count sees all rows despite the SELECT-blocking RLS.
-- ─────────────────────────────────────────────────────────────

create or replace function public.enforce_problem_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  if new.device_id is not null then
    select count(*) into recent
      from public.problem_reports
      where device_id = new.device_id
        and created_at > now() - interval '1 hour';
    if recent >= 10 then
      raise exception 'Rate limit exceeded: too many reports from this device. Please try again later.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists problem_reports_rate_limit on public.problem_reports;
create trigger problem_reports_rate_limit
  before insert on public.problem_reports
  for each row execute procedure public.enforce_problem_report_rate_limit();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security — insert-only for the public; reads are admin-only
-- (service role bypasses RLS).
-- ─────────────────────────────────────────────────────────────

alter table public.problem_reports enable row level security;

drop policy if exists "public can submit reports" on public.problem_reports;
create policy "public can submit reports" on public.problem_reports
  for insert
  to anon, authenticated
  with check (
    char_length(description) between 1 and 1000
    and (custom_type is null or char_length(custom_type) <= 80)
    and problem_type in ('question', 'answer', 'solution', 'image', 'ui_ux', 'other')
    and status = 'open'
    -- A logged-in submitter may only stamp their own id; guests leave it null.
    and (user_id is null or user_id = auth.uid())
  );

-- No SELECT / UPDATE / DELETE policies: anon & authenticated cannot read or
-- mutate existing reports. Only the service role (back office) can.
