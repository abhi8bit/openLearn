---
paths:
  - "src/lib/session/sync*"
  - "src/components/shared/AuthButton*"
  - "src/app/api/auth/**"
  - "src/lib/auth*"
---

# Auth & Sync Rules

## Auth Is Optional

Guest mode is a first-class experience. Never gate core features (practice, mock, saving questions) behind auth. Auth only enables cloud sync.

## device_id — Guest Identity

Every browser gets a UUID on first load, stored in localStorage under `device_id`. This identifies anonymous users across sessions on the same device.

```typescript
// lib/device.ts — import this everywhere, never generate inline
import { getDeviceId } from '@/lib/device'
```

All user data writes include either `user_id` (logged in) or `device_id` (guest) — never both, never neither.

## Supabase Auth

Use `createBrowserClient` from `@supabase/ssr` (not the deprecated `createClient` from `@supabase/auth-helpers-nextjs`).

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

Listen for auth state changes to trigger sync:
```typescript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    migrateGuestData(getDeviceId(), session.user.id)
  }
})
```

## Guest → Login Migration

`migrateGuestData(deviceId, userId)` in `lib/session/sync.ts`:
1. Read all `sessions`, `answers`, `savedQuestions` from Dexie where `userId` is not set
2. Upsert each to Supabase with `user_id = userId` set
3. Update Dexie records to set `userId` field (so they don't migrate again)
4. Use `onConflict('id')` for upserts — `id` is UUID so no collisions

This runs once at login. It is idempotent — safe to run multiple times.

## Background Sync Pattern

```typescript
// After every Dexie write, also sync to Supabase if logged in:
async function syncIfLoggedIn(record: LocalSession) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return  // guest — Dexie only
  try {
    await supabase.from('user_sessions').upsert(toSupabaseSession(record))
  } catch (err) {
    console.error('Sync failed (non-blocking):', err)
    // Never surface sync failures to the user
  }
}
```

## What NOT to Sync

- `catalogStore` data (exams, books, chapters) — this is public Supabase data, never stored as user data
- `device_id` itself — it stays in localStorage only
- Timer state — non-persistent, recomputed on resume from `time_elapsed_secs`
