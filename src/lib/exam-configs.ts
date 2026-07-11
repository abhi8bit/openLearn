// ── Exam Configuration Registry ──
// Defines section structure, timing, and marking schemes for each exam.
// Map subjects to DB books by slug. Add new exams by adding a new ExamConfig entry.

export interface ExamSection {
  slug: string
  label: string
  bookSlugs: string[]           // maps to DB books.slug
  questionCount: number         // questions to pick from this section
  timeLimitMinutes: number      // sectional time limit
  marksPerCorrect: number       // e.g. 2 or 3
  marksPerWrong: number         // negative value, e.g. -0.5 or -1
  totalMarks: number            // display total for this section
}

export interface ExamConfig {
  examSlug: string              // matches DB exams.slug
  label: string                 // display name
  sections: ExamSection[]
  shuffle: boolean              // default shuffle
}

// ── Registry ──

const examConfigs: ExamConfig[] = [
  {
    examSlug: 'ssc-cgl',
    label: 'SSC CGL Tier 1',
    shuffle: true,
    sections: [
      {
        slug: 'quant',
        label: 'Quantitative Aptitude',
        bookSlugs: ['cgl-math-hindi-mcq'],
        questionCount: 25,
        timeLimitMinutes: 15,
        marksPerCorrect: 2,
        marksPerWrong: -0.5,
        totalMarks: 50,
      },
      {
        slug: 'reasoning',
        label: 'Reasoning & General Intelligence',
        bookSlugs: ['cgl-reas-hindi-mcq'],
        questionCount: 25,
        timeLimitMinutes: 15,
        marksPerCorrect: 2,
        marksPerWrong: -0.5,
        totalMarks: 50,
      },
      {
        slug: 'english',
        label: 'English Language & Comprehension',
        bookSlugs: ['cgl-eng-hindi-mcq'],
        questionCount: 25,
        timeLimitMinutes: 15,
        marksPerCorrect: 2,
        marksPerWrong: -0.5,
        totalMarks: 50,
      },
      {
        slug: 'ga',
        label: 'General Awareness',
        bookSlugs: ['cgl-gs-hindi-mcq'],
        questionCount: 25,
        timeLimitMinutes: 15,
        marksPerCorrect: 2,
        marksPerWrong: -0.5,
        totalMarks: 50,
      },
    ],
  },
  {
    examSlug: 'ssc-cgl',
    label: 'SSC CGL Tier 2',
    shuffle: true,
    sections: [
      {
        slug: 'tier2-section1',
        label: 'Section I — Mathematical Abilities & Reasoning',
        bookSlugs: ['cgl-math-hindi-mcq', 'cgl-reas-hindi-mcq'],
        questionCount: 60,  // 30 math + 30 reasoning
        timeLimitMinutes: 60,
        marksPerCorrect: 3,
        marksPerWrong: -1,
        totalMarks: 180,
      },
      {
        slug: 'tier2-section2',
        label: 'Section II — English & General Awareness',
        bookSlugs: ['cgl-eng-hindi-mcq', 'general-cgl-gs-hindi-mcq'],
        questionCount: 70,  // 45 english + 25 GA
        timeLimitMinutes: 60,
        marksPerCorrect: 3,
        marksPerWrong: -1,
        totalMarks: 210,
      },
    ],
  },
]

// ── Public API ──

/**
 * Get all exam configs for a given exam slug.
 * An exam can have multiple configs (e.g., Tier 1 and Tier 2 for ssc-cgl).
 */
export function getExamConfigs(examSlug: string): ExamConfig[] {
  return examConfigs.filter((c) => c.examSlug === examSlug)
}

/**
 * Get a specific exam config by exam slug and config label.
 */
export function getExamConfig(examSlug: string, label: string): ExamConfig | undefined {
  return examConfigs.find((c) => c.examSlug === examSlug && c.label === label)
}

/**
 * Get all unique exam slugs that have configs.
 */
export function getConfiguredExamSlugs(): string[] {
  return [...new Set(examConfigs.map((c) => c.examSlug))]
}

/**
 * Calculate score for a set of answers given a section's marking scheme.
 */
export function calculateSectionScore(
  correctCount: number,
  wrongCount: number,
  marksPerCorrect: number,
  marksPerWrong: number
): number {
  return correctCount * marksPerCorrect + wrongCount * marksPerWrong
}

/**
 * Calculate total score across all sections.
 */
export function calculateTotalScore(
  sections: Array<{ correct: number; wrong: number; marksPerCorrect: number; marksPerWrong: number }>
): number {
  return sections.reduce(
    (total, s) => total + calculateSectionScore(s.correct, s.wrong, s.marksPerCorrect, s.marksPerWrong),
    0
  )
}
