import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query, withTenant } from "@/lib/db/client"

// ── Get Bot Detail ──

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const bots = await query(
    `SELECT id, name, slug, status, widget_config,
            indexing_strategy, retrieval_method, retrieval_config,
            lead_capture_enabled, lead_capture_keywords,
            embed_token, powabase_kb_id, powabase_agent_id,
            total_conversations, total_leads, created_at, updated_at
     FROM client_bots
     WHERE id = $1 AND agency_id = $2`,
    [id, session.agencyId]
  )

  if (bots.length === 0) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 })
  }

  return NextResponse.json({ bot: bots[0] })
}

// ── Update Bot ──

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  // Build dynamic update
  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (body.name !== undefined) {
    updates.push(`name = $${idx++}`)
    values.push(body.name)
  }
  if (body.status !== undefined) {
    updates.push(`status = $${idx++}`)
    values.push(body.status)
  }
  if (body.widget_config !== undefined) {
    updates.push(`widget_config = $${idx++}`)
    values.push(JSON.stringify(body.widget_config))
  }
  if (body.lead_capture_enabled !== undefined) {
    updates.push(`lead_capture_enabled = $${idx++}`)
    values.push(body.lead_capture_enabled)
  }
  if (body.lead_capture_keywords !== undefined) {
    updates.push(`lead_capture_keywords = $${idx++}`)
    values.push(body.lead_capture_keywords)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  values.push(id)
  values.push(session.agencyId)

  try {
    const updated = await withTenant(session.agencyId, async () => {
      const bots = await query(
        `UPDATE client_bots
         SET ${updates.join(", ")}, updated_at = now()
         WHERE id = $${idx++} AND agency_id = $${idx}
         RETURNING id, name, slug, status, widget_config, updated_at`,
        values
      )
      return bots
    })

    if (updated.length === 0) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 })
    }

    return NextResponse.json({ bot: updated[0] })
  } catch (err) {
    console.error("Update bot error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// ── Delete (Archive) Bot ──

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  await query(
    `UPDATE client_bots SET status = 'archived', updated_at = now()
     WHERE id = $1 AND agency_id = $2`,
    [id, session.agencyId]
  )

  return NextResponse.json({ success: true })
}
