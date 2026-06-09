import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query, withTenant } from "@/lib/db/client"
import { uploadSource, renameSource, PowabaseError } from "@/lib/powabase/client"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId, sourceId } = await params

  await query(
    `DELETE FROM bot_knowledge_sources
     WHERE id = $1 AND bot_id = $2 AND agency_id = $3`,
    [sourceId, botId, session.agencyId]
  )

  return NextResponse.json({ success: true })
}

/**
 * PATCH — update the name and/or content of a knowledge source.
 *
 * Accepts `{ name?: string, content?: string }`.
 * - name: updates the source filename in our DB + renames the Powabase source
 * - content: re-uploads the text as a new Powabase source and updates the reference
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId, sourceId } = await params

  try {
    const body = await request.json()
    const { name, content } = body

    if (!name && !content) {
      return NextResponse.json(
        { error: "Provide name, content, or both" },
        { status: 400 }
      )
    }

    // Verify the source belongs to this bot + agency
    const sources = await query<{
      id: string
      powabase_source_id: string | null
      filename: string | null
      source_type: string
    }>(
      `SELECT id, powabase_source_id, filename, source_type
       FROM bot_knowledge_sources
       WHERE id = $1 AND bot_id = $2 AND agency_id = $3`,
      [sourceId, botId, session.agencyId]
    )

    if (sources.length === 0) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 })
    }

    const src = sources[0]

    // ── Update name ──
    if (name && name.trim()) {
      // Update our DB
      await withTenant(session.agencyId, async () => {
        await query(
          `UPDATE bot_knowledge_sources SET filename = $1
           WHERE id = $2 AND bot_id = $3 AND agency_id = $4`,
          [name.trim(), sourceId, botId, session.agencyId]
        )
      })

      // Update the Powabase source name (best-effort)
      if (src.powabase_source_id) {
        renameSource(src.powabase_source_id, name.trim()).catch(() => {})
      }
    }

    // ── Update content ──
    if (content && typeof content === "string") {
      const filename = src.filename ?? `source-${sourceId.slice(0, 8)}.md`
      const blob = new Blob([content], { type: "text/markdown" })
      const powaResult = await uploadSource(blob, filename)

      await withTenant(session.agencyId, async () => {
        await query(
          `UPDATE bot_knowledge_sources
           SET powabase_source_id = $1, extraction_status = $2
           WHERE id = $3 AND bot_id = $4 AND agency_id = $5`,
          [powaResult.id, powaResult.extraction_status, sourceId, botId, session.agencyId]
        )
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof PowabaseError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error("Source update error:", err)
    return NextResponse.json({ error: "Failed to update source" }, { status: 500 })
  }
}
