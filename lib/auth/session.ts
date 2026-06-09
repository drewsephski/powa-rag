import { createClient } from "./gotrue"

export interface SessionUser {
  id: string
  email: string
  name?: string
  gotrueId: string
  agencyId: string
  agencyName: string
  agencySlug: string
}

/**
 * Get the current user session. Returns null if not authenticated.
 * This is the primary auth check for API routes and server components.
 */
export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  if (!data.user) return null

  // Load agency context from our DB
  const { query } = await import("@/lib/db/client")
  const users = await query<{
    id: string
    agency_id: string
    name: string
  }>(
    `SELECT u.id, u.agency_id, u.name
     FROM agency_users u
     WHERE u.gotrue_id = $1`,
    [data.user.id]
  )

  if (users.length === 0) return null

  const user = users[0]

  const agencies = await query<{
    id: string
    name: string
    slug: string
  }>(`SELECT id, name, slug FROM agencies WHERE id = $1`, [user.agency_id])

  if (agencies.length === 0) return null

  const agency = agencies[0]

  return {
    id: user.id,
    email: data.user.email ?? "",
    name: user.name ?? data.user.email ?? "",
    gotrueId: data.user.id,
    agencyId: agency.id,
    agencyName: agency.name,
    agencySlug: agency.slug,
  }
}
