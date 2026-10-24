'use client'

import { useEffect } from 'react'
import { useLanguageStore } from '@/stores/languageStore'

export function LanguageProvider() {
  useEffect(() => {
    void useLanguageStore.persist.rehydrate()
  }, [])

  return null
}
