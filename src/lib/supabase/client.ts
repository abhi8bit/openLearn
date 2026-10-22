import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/../database.types'

// Memoized so the whole app shares ONE GoTrueClient. Multiple instances race on
// the one-time OAuth code (via the Web Locks API) and stall auth.getUser(), which
// is what left the login button stuck on its loading skeleton.
let client: SupabaseClient<Database> | undefined

export function createClient(): SupabaseClient<Database> {
  if (client) return client
  // @supabase/ssr's generic return type loses the schema's Functions map
  // (rpc args infer as undefined), so pin it back to SupabaseClient<Database>.
  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as unknown as SupabaseClient<Database>
  return client
}
