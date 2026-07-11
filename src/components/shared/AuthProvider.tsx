'use client'

import { useEffect } from 'react'
import { setupAuthListener } from '@/lib/session/sync'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setupAuthListener()
  }, [])

  return <>{children}</>
}
