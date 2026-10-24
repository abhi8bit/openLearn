'use client'

import { cn } from '@/lib/utils'
import { useLanguageStore } from '@/stores/languageStore'

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguageStore()

  return (
    <div
      role="group"
      aria-label="Question language"
      className={cn(
        'inline-flex overflow-hidden rounded-full border border-border bg-card',
        className,
      )}
    >
      {([['en', 'EN'], ['hi', 'हिं']] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={language === value}
          onClick={() => setLanguage(value)}
          className={cn(
            'px-3 py-1 text-xs font-bold',
            language === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
