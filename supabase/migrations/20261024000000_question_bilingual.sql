-- Bilingual question content (English + Hindi).
-- Display-only columns; the English text columns remain the source of truth.
-- Safe to run more than once.

alter table public.questions
  add column if not exists question_text_hi text;

alter table public.question_options
  add column if not exists option_text_hi text;

alter table public.question_solutions
  add column if not exists solution_text_hi text;
