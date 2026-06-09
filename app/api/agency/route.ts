import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const agencies = await query(
    `SELECT id, name, slug, subscription_status, subscription_plan,
            bot_count, response_count, trial_ends_at, created_at
     FROM agencies WHERE id = $1`,
    [session.agencyId]
  )

  if (agencies.length === 0) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 })
  }

  return NextResponse.json({ agency: agencies[0] })
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (body.name !== undefined) {
    updates.push(`name = $${idx++}`)
    values.push(body.name)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  values.push(session.agencyId)

  const result = await query(
    `UPDATE agencies SET ${updates.join(", ")}, updated_at = now()
     WHERE id = $${idx} RETURNING id, name, slug`,
    values
  )

  return NextResponse.json({ agency: result[0] })
}
