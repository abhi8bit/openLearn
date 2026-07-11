'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

// Resolved auth state, shared across every AuthButton mount. Without this, the
// copy inside the mobile drawer (which mounts fresh each time the drawer opens)
// re-runs getUser() and flashes its loading skeleton on every open for a
// logged-in user. The desktop copy resolves this on page load, so by the time
// the drawer opens the state is already known.
let cachedUser: User | null = null
let authResolved = false

interface AuthButtonProps {
  /** `header` = compact avatar trigger with a popover; `menu` = full-width row / inline panel for the mobile drawer. */
  variant?: 'header' | 'menu'
}

export function AuthButton({ variant = 'header' }: AuthButtonProps) {
  const [user, setUser] = useState<User | null>(cachedUser)
  const [loading, setLoading] = useState(!authResolved)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      cachedUser = user ?? null
      authResolved = true
      setUser(cachedUser)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      cachedUser = session?.user ?? null
      authResolved = true
      setUser(cachedUser)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Keep the popover pinned to its trigger: close it on scroll/resize/Escape
  // rather than letting it drift away from the avatar.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function signIn() {
    // Return to /auth/callback so the PKCE code gets exchanged server-side; carry
    // the current path in `next` so the user lands back where they started.
    const next = encodeURIComponent(window.location.pathname + window.location.search)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    cachedUser = null
    setUser(null)
    setOpen(false)
  }

  if (loading) {
    return (
      <div
        className="animate-pulse rounded-md"
        style={{ height: 32, width: variant === 'menu' ? '100%' : 80, background: 'var(--bg-elevated)' }}
      />
    )
  }

  // ─── Logged out ───
  if (!user) {
    if (variant === 'menu') {
      return (
        <button
          onClick={signIn}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <GoogleIcon />
          Sign in with Google
        </button>
      )
    }
    return (
      <button onClick={signIn} className="btn-ghost inline-flex items-center gap-2">
        <GoogleIcon />
        Sign In
      </button>
    )
  }

  // ─── Logged in: mobile drawer renders the panel inline (no nested popover) ───
  if (variant === 'menu') {
    return (
      // Stop clicks bubbling to the drawer's click-to-close handler so the
      // sign-out confirmation stays open while the user interacts with it.
      <div onClick={(e) => e.stopPropagation()} className="rounded-lg p-1.5" style={{ background: 'var(--bg-elevated)' }}>
        <AccountPanel user={user} onSignOut={signOut} />
      </div>
    )
  }

  // ─── Logged in: header shows the avatar + a popover ───
  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation()
          const rect = triggerRef.current?.getBoundingClientRect()
          if (rect) setCoords({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) })
          setOpen((v) => !v)
        }}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center rounded-full transition-opacity hover:opacity-90"
        style={{
          width: 32,
          height: 32,
          padding: 0,
          overflow: 'hidden',
          background: 'transparent',
          boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
        }}
      >
        <Avatar user={user} size={32} />
      </button>

      {open && coords &&
        createPortal(
          <div className="fixed inset-0 z-[110]" onClick={() => setOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute flex flex-col rounded-xl border p-2"
              style={{
                top: coords.top,
                right: coords.right,
                width: 240,
                maxWidth: 'calc(100vw - 24px)',
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-primary)',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.3)',
              }}
            >
              <AccountPanel user={user} onSignOut={signOut} />
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

/** Identity row + two-step "Sign out" confirmation. Shared by both variants. */
function AccountPanel({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const { name, email } = readMeta(user)

  return (
    <>
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <Avatar user={user} size={36} />
        <div className="min-w-0">
          {name && (
            <div className="truncate text-sm" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {name}
            </div>
          )}
          {email && (
            <div className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
              {email}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors"
          style={{ color: 'var(--danger)' }}
        >
          <LogOut style={{ width: 15, height: 15 }} />
          Sign out
        </button>
      ) : (
        <div className="flex flex-col gap-2 p-1">
          <span className="px-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Sign out of this account?
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ border: '1px solid var(--border-medium)', background: 'transparent', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={onSignOut}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ border: '1px solid var(--danger)', background: 'var(--danger-subtle)', color: 'var(--danger)' }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Google profile picture, falling back to an initial-in-a-circle if it is missing or fails to load. */
function Avatar({ user, size }: { user: User; size: number }) {
  const [error, setError] = useState(false)
  const { avatarUrl, name, email, initial } = readMeta(user)

  if (avatarUrl && !error) {
    return (
      <Image
        src={avatarUrl}
        alt={name ?? email ?? 'Account'}
        width={size}
        height={size}
        onError={() => setError(true)}
        referrerPolicy="no-referrer"
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: '#fff',
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  )
}

/** Pull display fields out of Supabase's (loosely typed) user_metadata without leaking `any`. */
function readMeta(user: User): { avatarUrl?: string; name?: string; email?: string; initial: string } {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)
  const avatarUrl = str(meta.avatar_url) ?? str(meta.picture)
  const name = str(meta.full_name) ?? str(meta.name)
  const email = user.email ?? undefined
  const initial = (name ?? email ?? '?').trim().charAt(0).toUpperCase()
  return { avatarUrl, name, email, initial }
}

/** Google "G" mark used on the sign-in affordance. */
function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
