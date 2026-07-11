---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TypeScript Rules

## Types — Single Source of Truth

All shared types live in `src/types/index.ts`. Never duplicate a type definition. When adding a new type, check `types/index.ts` first.

Key type groups:
- DB types: `Exam`, `Book`, `Chapter`, `Concept`, `Question`, `Option`, `Solution`
- User data: `UserSession`, `SessionAnswer`, `SavedQuestion`
- Local (Dexie): `LocalSession`, `LocalAnswer`  
- Config: `SessionConfig`, `SessionSettings`
- Store slices: `CatalogStore`, `SessionStore`, `SavedStore`, `UIStore`

## No `any`

Never use `any`. If the type is genuinely unknown, use `unknown` and narrow it. If it's a Supabase response, type it against the DB types — don't leave it untyped.

## Null Safety

- Supabase queries return `data | null` — always check before using
- Dexie `.get()` returns `T | undefined` — always handle undefined
- `sessionStore.chapterId` can be null (cross-chapter mocks) — check before using as a chapter lookup key
- Never use `!` non-null assertion except for refs that are guaranteed by React lifecycle

## Zustand Store Typing

```typescript
// Correct pattern
import { create } from 'zustand'

interface SessionStore {
  questions: Question[]
  currentIndex: number
  navigateTo: (index: number) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  questions: [],
  currentIndex: 0,
  navigateTo: (index) => set({ currentIndex: index }),
}))
```

Always type the store interface separately from the `create()` call so it can be imported for prop types.

## Async Functions

All async functions must have explicit return type annotations:

```typescript
async function getCachedOrFetchChapter(chapterId: string): Promise<ChapterData> { ... }
```

Avoid floating promises. Always `await` or explicitly handle with `.catch()`.

## Enums → Union Types

Prefer union types over enums:

```typescript
// Preferred
type SessionType = 'practice' | 'mock'
type Scope = 'chapter' | 'book' | 'exam' | 'custom'

// Avoid
enum SessionType { Practice = 'practice', Mock = 'mock' }
```
