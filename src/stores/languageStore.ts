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
