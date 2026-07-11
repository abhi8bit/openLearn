import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/../database.types'

// Memoized so the whole app shares ONE GoTrueClient. Multiple instances race on
// the one-time OAuth code (via the Web Locks API) and stall auth.getUser(), which
// is what left the login button stuck on its loading skeleton.
let client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  if (client) return client
  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return client
}
