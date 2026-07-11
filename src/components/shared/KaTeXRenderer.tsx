'use client'

import { memo, useMemo } from 'react'
import { marked } from 'marked'
import katex from 'katex'

interface KaTeXRendererProps {
  content: string
  className?: string
}

export const KaTeXRenderer = memo(function KaTeXRenderer({
  content,
  className,
}: KaTeXRendererProps) {
  const html = useMemo(() => renderMarkdownWithMath(content), [content])

  if (!html) return null

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

export { KaTeXRenderer as MarkdownRenderer }

// Safe placeholder format (no null bytes, no markdown-significant chars)
const PH = '￿MATH￿'

function renderMarkdownWithMath(text: string): string {
  if (!text) return ''

  const mathBlocks: string[] = []
  const protected_ = protectMath(text, mathBlocks)

  // Parse markdown, preserving our placeholders
  const html = marked.parse(protected_, { async: false }) as string

  // Restore math HTML
  return restoreMath(html, mathBlocks)
}

function protectMath(text: string, blocks: string[]): string {
  // First pass: handle $$ ... $$ blocks
  // Second pass: handle $ ... $ inline
  let result = ''
  let i = 0

  while (i < text.length) {
    // Check for $$ first (before $ to avoid false match)
    if (text.slice(i, i + 2) === '$$') {
      const end = text.indexOf('$$', i + 2)
      if (end !== -1) {
        const math = text.slice(i + 2, end).trim()
        if (math.length > 0) {
          blocks.push(renderMath(math, true))
          result += `${PH}${blocks.length - 1}${PH}`
        }
        i = end + 2
        continue
      }
    }

    // Check for $ (inline)
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1)
      if (end !== -1) {
        const math = text.slice(i + 1, end).trim()
        if (math.length > 0) {
          blocks.push(renderMath(math, false))
          result += `${PH}${blocks.length - 1}${PH}`
          i = end + 1
          continue
        }
      }
    }

    result += text[i]
    i++
  }

  return result
}

function renderMath(math: string, display: boolean): string {
  // Only use true display mode for structural/large blocks
  const shouldDisplay = display && (
    math.includes('\\begin') ||
    math.includes('\\end') ||
    math.includes('\\\\') ||
    math.includes('\\hline') ||
    math.length > 150
  )

  try {
    return katex.renderToString(math, {
      displayMode: shouldDisplay,
      throwOnError: false,
      strict: false,
      trust: true,
      output: 'html',
    })
  } catch {
    return `<code>${escapeHtml(math)}</code>`
  }
}

function restoreMath(html: string, blocks: string[]): string {
  // Replace placeholders with rendered math HTML
  const regex = new RegExp(`￿MATH￿(\\d+)￿MATH￿`, 'g')
  return html.replace(regex, (_, idx) => {
    const i = parseInt(idx, 10)
    return blocks[i] ?? ''
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
