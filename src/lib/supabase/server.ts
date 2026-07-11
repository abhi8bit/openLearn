import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/../database.types'

/**
 * Server-side Supabase client bound to Next 15's async cookie store. Used by the
 * OAuth callback route to exchange the PKCE code and persist the session cookies.
 */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Invoked from a Server Component render, where cookies are read-only.
            // Safe to ignore in this app — only the callback route writes cookies.
          }
        },
      },
    }
  )
}
