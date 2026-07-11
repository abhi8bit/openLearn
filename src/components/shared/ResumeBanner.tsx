'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveSession } from '@/lib/dexie/cache'
import type { LocalSession } from '@/types'

export function ResumeBanner() {
  const [session, setSession] = useState<LocalSession | null>(null)

  useEffect(() => {
    getActiveSession().then((s) => setSession(s ?? null))
  }, [])

  if (!session) return null

  const elapsed = session.timeElapsedSecs ?? 0
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60

  return (
    <div className="session-banner">
      <div className="session-banner-dot" />
      <div className="session-banner-content">
        <span className="session-banner-label">Active Session</span>
        <span className="session-banner-meta">
          {session.questionIds.length} questions · {minutes > 0 ? `${minutes}m ` : ''}{seconds}s elapsed
        </span>
      </div>
      <Link href={`/session/${session.id}`} className="btn-accent" style={{ textDecoration: 'none' }}>
        Resume →
      </Link>
    </div>
  )
}
