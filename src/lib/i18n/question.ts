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
  o: { option_text: string | null; option_text_hi?: string | null },
  lang: QuestionLanguage,
): string {
  if (lang === 'hi') return o.option_text_hi || o.option_text || ''
  return o.option_text || o.option_text_hi || ''
}

export function solutionText(q: Question, lang: QuestionLanguage): string {
  if (lang === 'hi') return q.solution?.solution_text_hi || q.solution?.solution_text || ''
  return q.solution?.solution_text || q.solution?.solution_text_hi || ''
}
