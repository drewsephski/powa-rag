import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"
import { getSourceStatus } from "@/lib/powabase/client"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId } = await params

  const sources = await query<{
    id: string
    source_type: string
    filename: string | null
    website_url: string | null
    extraction_status: string
    powabase_source_id: string | null
    created_at: string
  }>(
    `SELECT id, source_type, filename, website_url, extraction_status, powabase_source_id, created_at
     FROM bot_knowledge_sources
     WHERE bot_id = $1 AND agency_id = $2
     ORDER BY created_at DESC`,
    [botId, session.agencyId]
  )

  // Check live Powabase status for sources that might still be processing
  const enriched = await Promise.all(
    sources.map(async (source) => {
      if (
        source.powabase_source_id &&
        (source.extraction_status === "pending" ||
          source.extraction_status === "extracting")
      ) {
        try {
          const live = await getSourceStatus(source.powabase_source_id)
          return { ...source, extraction_status: live.extraction_status }
        } catch {
          // Fall back to DB status
        }
      }
      return source
    })
  )

  return NextResponse.json({ sources: enriched })
}
