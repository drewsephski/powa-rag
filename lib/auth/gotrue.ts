import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Create a Supabase client for the server component context.
 * This uses GoTrue for auth against Powabase's auth endpoint.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.POWABASE_URL!,
    process.env.POWABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Next.js 16 restricts cookies().set() to Server Actions / Route Handlers.
          // During server component rendering we can only read cookies, not write them.
          // Token refresh that needs to persist a new cookie will silently degrade —
          // the user re-authenticates on next visit.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Gracefully degrade — cookie write not available in this context.
          }
        },
      },
    }
  )
}
