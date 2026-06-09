import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId } = await params

  const leads = await query(
    `SELECT l.id, l.visitor_email, l.visitor_name, l.visitor_phone,
            l.company_name, l.lead_reason, l.notes, l.status,
            l.created_at, l.updated_at
     FROM bot_leads l
     WHERE l.bot_id = $1 AND l.agency_id = $2
     ORDER BY l.created_at DESC`,
    [botId, session.agencyId]
  )

  return NextResponse.json({ leads })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId } = await params
  const body = await request.json()

  if (body.lead_id && body.status) {
    await query(
      `UPDATE bot_leads SET status = $1, updated_at = now()
       WHERE id = $2 AND bot_id = $3 AND agency_id = $4`,
      [body.status, body.lead_id, botId, session.agencyId]
    )
  }

  return NextResponse.json({ success: true })
}
