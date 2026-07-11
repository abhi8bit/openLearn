'use client'

import { useState, useEffect } from 'react'
import { ImageIcon } from 'lucide-react'
import { KaTeXRenderer } from '@/components/shared/KaTeXRenderer'
import { createClient } from '@/lib/supabase/client'
import { db } from '@/lib/dexie/db'

// ---------------------------------------------------------------------------
// Image placeholder — compact chip with an image icon that fades in and out,
// shown while an image resolves from cache or loads over the network.
// ---------------------------------------------------------------------------

function ImagePlaceholder() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 36,
        margin: '8px 0',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <ImageIcon
        size={16}
        className="animate-pulse"
        style={{ color: 'var(--text-tertiary)' }}
      />
    </span>
  )
}

// ---------------------------------------------------------------------------
// Inline image — checks Dexie cache first, falls back to network URL
// ---------------------------------------------------------------------------

function InlineImage({ src, alt, cacheKey }: { src: string; alt?: string; cacheKey?: string }) {
  // null = still checking cache — don't render <img> yet
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showPlaceholder, setShowPlaceholder] = useState(true)

  // Cache-first: check IndexedDB before rendering <img>.
  // This prevents the browser from fetching the public Supabase URL.
  // Also resets all state when cacheKey/src changes (different question).
  useEffect(() => {
    setResolvedSrc(null)
    setLoaded(false)
    setFailed(false)
    setShowPlaceholder(true)

    if (!cacheKey) {
      setResolvedSrc(src)
      return
    }

    let blobUrl: string | null = null
    let revoked = false

    db.imageCache.get(cacheKey).then((entry) => {
      if (revoked) return
      if (entry) {
        blobUrl = URL.createObjectURL(entry.blob)
        setResolvedSrc(blobUrl)
      } else {
        // Cache miss — fall back to public URL
        setResolvedSrc(src)
      }
    }).catch(() => {
      if (!revoked) setResolvedSrc(src)
    })

    return () => {
      revoked = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [cacheKey, src])

  // Hide the placeholder after 8s — but keep <img> in the DOM so the browser
  // can finish loading. Without this, a slow fetch would show the placeholder
  // forever. With this, the placeholder goes away and the image pops in later.
  useEffect(() => {
    if (loaded || failed) return
    const timer = setTimeout(() => setShowPlaceholder(false), 8000)
    return () => clearTimeout(timer)
  }, [loaded, failed])

  // Still checking cache — show placeholder only
  if (resolvedSrc === null) {
    return <ImagePlaceholder />
  }

  // Real load failure — image URL returned 404 / network error
  if (failed) return null

  // Keep the <img> mounted (display:none) so it loads in the background, and
  // show the compact placeholder in its place until it's ready.
  return (
    <>
      {showPlaceholder && !loaded && <ImagePlaceholder />}
      <img
        src={resolvedSrc}
        alt={alt || 'Question image'}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{
          display: loaded ? 'block' : 'none',
          maxWidth: '100%',
          margin: '8px 0',
          borderRadius: 'var(--radius-md)',
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// TextWithInlineImages — splits markdown by ![alt](filename) and renders
// KaTeX for text segments and InlineImage for images, preserving position.
// ---------------------------------------------------------------------------

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g

export function TextWithInlineImages({
  text,
  storagePrefix,
  className,
}: {
  text: string
  storagePrefix?: string
  className?: string
}) {
  if (!text) return null

  // No storage prefix — strip image markdown, keep alt text as fallback
  if (!storagePrefix) {
    const stripped = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    return <KaTeXRenderer content={stripped} className={className} />
  }

  const supabase = createClient()
  const parts: Array<
    | { type: 'text'; content: string }
    | { type: 'image'; alt: string; url: string; cacheKey: string }
  > = []

  let lastIndex = 0
  MD_IMAGE_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = MD_IMAGE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    const filename = match[2]
    const storagePath = `${storagePrefix}/${filename}`
    const { data } = supabase.storage
      .from('book-images')
      .getPublicUrl(storagePath)
    parts.push({ type: 'image', alt: match[1], url: data.publicUrl, cacheKey: storagePath })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  // No images found — just render text directly
  if (parts.length === 0 || (parts.length === 1 && parts[0].type === 'text')) {
    return <KaTeXRenderer content={text} className={className} />
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <KaTeXRenderer key={`t-${i}`} content={part.content} />
        ) : (
          <InlineImage key={part.cacheKey} src={part.url} alt={part.alt} cacheKey={part.cacheKey} />
        )
      )}
    </span>
  )
}
