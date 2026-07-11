'use client'

import { useState, createContext, useContext } from 'react'
import { cn } from '@/lib/utils'

// ── Tabs Context ──

interface TabsContextValue {
  activeTab: string
  setActiveTab: (value: string) => void
}

const TabsContext = createContext<TabsContextValue>({
  activeTab: '',
  setActiveTab: () => {},
})

// ── Tabs Root ──

interface TabsProps {
  defaultValue: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue)
  const activeTab = value ?? internal
  const setActiveTab = (v: string) => {
    if (!value) setInternal(v)
    onValueChange?.(v)
  }

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

// ── Tabs List ──

interface TabsListProps {
  children: React.ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 rounded-lg p-1', className)}
      style={{ background: 'var(--bg-elevated)' }}
    >
      {children}
    </div>
  )
}

// ── Tabs Trigger ──

interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useContext(TabsContext)
  const isActive = activeTab === value

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveTab(value)}
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        className
      )}
      style={{
        background: isActive ? 'var(--bg-primary)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// ── Tabs Content ──

interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab } = useContext(TabsContext)
  if (activeTab !== value) return null
  return <div className={className}>{children}</div>
}
