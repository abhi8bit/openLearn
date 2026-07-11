import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Google (and any OAuth provider) redirects here with a one-time PKCE `code`.
 * Exchanging it establishes the session and writes the auth cookies onto the
 * redirect response — this is the step that actually completes login. Without it
 * the `?code=` just sits in the URL and no session is ever created.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Only allow relative, single-slash paths back — never an absolute/external URL.
  const nextParam = searchParams.get('next')
  const next =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  // No code, or the exchange failed (e.g. expired/replayed code, user cancelled).
  return NextResponse.redirect(`${origin}/?auth_error=1`)
}
