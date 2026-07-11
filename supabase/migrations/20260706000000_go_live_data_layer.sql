-- Go-Live Data Layer migration
-- Covers: (A) catalog updated_at + triggers, (B) user-data columns + constraints,
-- (C) RLS policies, and is_active resolution.
-- Safe to run more than once (guards with IF NOT EXISTS / drop-before-create).

-- ─────────────────────────────────────────────────────────────
-- A. updated_at on catalog tables (drives Part 1 revalidation)
-- ─────────────────────────────────────────────────────────────

create extension if not exists moddatetime schema extensions;

-- exams
alter table public.exams
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists exams_set_updated_at on public.exams;
create trigger exams_set_updated_at
  before update on public.exams
  for each row execute procedure extensions.moddatetime(updated_at);

-- books
alter table public.books
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
  before update on public.books
  for each row execute procedure extensions.moddatetime(updated_at);

-- chapters
alter table public.chapters
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists chapters_set_updated_at on public.chapters;
create trigger chapters_set_updated_at
  before update on public.chapters
  for each row execute procedure extensions.moddatetime(updated_at);

-- content_version invalidation: bump chapters.content_version whenever a
-- chapter's questions or concepts change, so lazy content refetch fires.
create or replace function public.bump_chapter_content_version()
returns trigger
language plpgsql
as $$
declare
  target_chapter uuid;
begin
  if (tg_table_name = 'questions') then
    target_chapter := coalesce(new.chapter_id, old.chapter_id);
  elsif (tg_table_name = 'chapter_concepts') then
    target_chapter := coalesce(new.chapter_id, old.chapter_id);
  elsif (tg_table_name = 'question_options') then
    select q.chapter_id into target_chapter
      from public.questions q
      where q.id = coalesce(new.question_id, old.question_id);
  elsif (tg_table_name = 'question_solutions') then
    select q.chapter_id into target_chapter
      from public.questions q
      where q.id = coalesce(new.question_id, old.question_id);
  end if;

  if target_chapter is not null then
    update public.chapters
      set content_version = coalesce(content_version, 0) + 1
      where id = target_chapter;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists questions_bump_version on public.questions;
create trigger questions_bump_version
  after insert or update or delete on public.questions
  for each row execute procedure public.bump_chapter_content_version();

drop trigger if exists concepts_bump_version on public.chapter_concepts;
create trigger concepts_bump_version
  after insert or update or delete on public.chapter_concepts
  for each row execute procedure public.bump_chapter_content_version();

drop trigger if exists options_bump_version on public.question_options;
create trigger options_bump_version
  after insert or update or delete on public.question_options
  for each row execute procedure public.bump_chapter_content_version();

drop trigger if exists solutions_bump_version on public.question_solutions;
create trigger solutions_bump_version
  after insert or update or delete on public.question_solutions
  for each row execute procedure public.bump_chapter_content_version();

-- ─────────────────────────────────────────────────────────────
-- B. User-data tables: missing columns + unique constraint
-- ─────────────────────────────────────────────────────────────

alter table public.user_sessions
  add column if not exists completed_at timestamptz,
  add column if not exists answered_count int,
  add column if not exists correct_count int,
  add column if not exists current_section_index int,
  add column if not exists section_time_elapsed_secs int[];

-- saved_questions needs a stable conflict target for upserts.
-- Partial unique index (not a table constraint) so it tolerates guest rows
-- where user_id is null without collapsing them all together.
create unique index if not exists saved_questions_user_question_uniq
  on public.saved_questions (user_id, question_id)
  where user_id is not null;

-- ─────────────────────────────────────────────────────────────
-- C. Row Level Security — users read/write only their own rows
-- ─────────────────────────────────────────────────────────────

alter table public.user_sessions   enable row level security;
alter table public.session_answers enable row level security;
alter table public.saved_questions enable row level security;

drop policy if exists "own sessions" on public.user_sessions;
create policy "own sessions" on public.user_sessions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own answers" on public.session_answers;
create policy "own answers" on public.session_answers
  for all
  using (
    exists (
      select 1 from public.user_sessions s
      where s.id = session_answers.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_sessions s
      where s.id = session_answers.session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "own saved" on public.saved_questions;
create policy "own saved" on public.saved_questions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- is_active resolution — default true + backfill so catalog
-- queries can safely re-enable the .eq('is_active', true) filter.
-- ─────────────────────────────────────────────────────────────

alter table public.exams    alter column is_active set default true;
alter table public.books    alter column is_active set default true;
alter table public.chapters alter column is_active set default true;

update public.exams    set is_active = true where is_active is null;
update public.books    set is_active = true where is_active is null;
update public.chapters set is_active = true where is_active is null;
