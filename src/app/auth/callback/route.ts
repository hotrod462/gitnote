import { NextResponse, type NextRequest } from 'next/server'

// This handler might be redundant now if Supabase redirects directly after its own callback
// and the middleware handles the session.
// We keep it minimal for now as a potential redirect target.
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)

  // Simply redirect to the notes page.
  // Session should already be handled by the middleware reading cookies/URL fragment set by Supabase redirect.
  return NextResponse.redirect(`${origin}/notes`)
} 