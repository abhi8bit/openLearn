'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { AuthButton } from './AuthButton'
import { StatsDialog } from './StatsDialog'
import { BookOpen, History, Bookmark, BarChart3, Menu, X, Sun, Moon } from 'lucide-react'

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function AppHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setTheme(getInitialTheme())
    setMounted(true)
  }, [])

  // Lock page scroll while the mobile drawer is open
  useEffect(() => {
    if (!mobileMenuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileMenuOpen])

  // Hide header on session pages
  if (pathname.startsWith('/session/')) return null

  const navLinks = [
    { href: '/', label: 'Home', icon: BookOpen },
    { href: '/history', label: 'History', icon: History },
    { href: '/saved', label: 'Saved', icon: Bookmark },
  ]

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        height: 52,
        background: 'color-mix(in srgb, var(--bg-primary) 85%, transparent)',
        backdropFilter: 'blur(12px)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between px-6" style={{ height: 52, maxWidth: '100%' }}>
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <div
            className="flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: '#000',
              flexShrink: 0,
            }}
          >
            <Image src="/logo.png" alt="openLearn" width={24} height={24} priority />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            open<span style={{ color: '#00b991' }}>Learn</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors no-underline"
                style={{
                  fontSize: 14,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <link.icon style={{ width: 14, height: 14 }} />
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatsOpen(true)}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{ width: 32, height: 32, color: 'var(--text-secondary)' }}
            aria-label="View stats"
          >
            <BarChart3 style={{ width: 16, height: 16 }} />
          </button>

          <button
            onClick={toggleTheme}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{ width: 32, height: 32, color: 'var(--text-secondary)' }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun style={{ width: 16, height: 16 }} />
            ) : (
              <Moon style={{ width: 16, height: 16 }} />
            )}
          </button>

          <div className="hidden sm:block">
            <AuthButton />
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden flex items-center justify-center rounded-md"
            style={{ width: 32, height: 32, color: 'var(--text-secondary)' }}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X style={{ width: 20, height: 20 }} /> : <Menu style={{ width: 20, height: 20 }} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav — portaled to body so the fixed overlay escapes the
          header's backdrop-filter containing block and covers the whole page */}
      {mounted && mobileMenuOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] md:hidden">
            {/* Full-page backdrop; click anywhere outside to close */}
            <div
              className="absolute inset-0"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Floating card anchored to the top-right, below the header */}
            <div
              className="absolute flex flex-col rounded-xl border p-2"
              style={{
                top: 52 + 8,
                right: 12,
                width: 'min(72vw, 240px)',
                borderColor: 'var(--border-subtle)',
                background: 'var(--bg-primary)',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.3)',
              }}
              onClick={() => setMobileMenuOpen(false)}
            >
              <nav className="flex flex-col gap-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors no-underline"
                    style={{
                      fontSize: 14,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: isActive ? 'var(--bg-elevated)' : 'transparent',
                    }}
                  >
                    <link.icon style={{ width: 16, height: 16 }} />
                    {link.label}
                  </Link>
                )
              })}
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  setStatsOpen(true)
                }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <BarChart3 style={{ width: 16, height: 16 }} />
                Stats
              </button>
              <button
                onClick={() => {
                  toggleTheme()
                  setMobileMenuOpen(false)
                }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                {theme === 'dark' ? (
                  <Sun style={{ width: 16, height: 16 }} />
                ) : (
                  <Moon style={{ width: 16, height: 16 }} />
                )}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              <div className="pt-2 sm:hidden">
                <AuthButton variant="menu" />
              </div>
              </nav>
            </div>
          </div>,
          document.body
        )}

      <StatsDialog open={statsOpen} onOpenChange={setStatsOpen} />
    </header>
  )
}
