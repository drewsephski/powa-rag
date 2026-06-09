import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query, withTenant } from "@/lib/db/client"
import {
  uploadSource,
  PowabaseError,
} from "@/lib/powabase/client"
import { processSourcePipeline } from "@/lib/sources/process-source"

/**
 * Upload a document → Powabase source → (async) extract → (async) add to KB.
 *
 * Powabase RAG pipeline:
 *   1. POST /api/sources/upload → returns { id, extraction_status: "pending" }
 *   2. Poll GET /api/sources/{id} until extraction_status === "extracted"
 *      ⚠️ Adding to KB before "extracted" returns 400
 *   3. POST /api/knowledge-bases/{kb_id}/sources { source_id } → triggers indexing
 *   4. The indexed source is polled until status === "indexed" (background)
 *
 * The upload route returns immediately. Steps 2-4 run asynchronously.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId } = await params

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Verify bot ownership
    const bots = await query<{ id: string; powabase_kb_id: string | null; name: string }>(
      `SELECT id, powabase_kb_id, name FROM client_bots WHERE id = $1 AND agency_id = $2`,
      [botId, session.agencyId]
    )

    if (bots.length === 0) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 })
    }

    const bot = bots[0]

    // Step 1: Upload to Powabase (handles 409 duplicate_source → returns existing)
    const buffer = Buffer.from(await file.arrayBuffer())
    const isPdf = file.name.toLowerCase().endsWith(".pdf")
    const powaSource = await uploadSource(buffer, file.name, {
      contentType: isPdf ? "application/pdf" : undefined,
    })

    // Create source record in our DB
    const newSource = await withTenant(session.agencyId, async () => {
      const sources = await query(
        `INSERT INTO bot_knowledge_sources
         (bot_id, agency_id, source_type, filename, file_type, file_size_bytes,
          powabase_source_id, extraction_status)
         VALUES ($1, $2, 'upload', $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING id, filename, extraction_status`,
        [
          botId,
          session.agencyId,
          file.name,
          file.name.split(".").pop()?.toLowerCase() || "unknown",
          file.size,
          powaSource.id,
          powaSource.extraction_status,
        ]
      )
      return sources[0]
    })

    // If this was a duplicate, we still return success — the source already exists
    // Step 2-4: Pipeline — extract then index (awaited so status is accurate on response)
    if (bot.powabase_kb_id) {
      await processSourcePipeline(bot.powabase_kb_id, powaSource.id, newSource?.id)
    }

    return NextResponse.json({
      source: newSource || { id: powaSource.id, extraction_status: powaSource.extraction_status },
      duplicate: powaSource.duplicate,
    })
  } catch (err) {
    if (err instanceof PowabaseError) {
      if (err.isInsufficientCredits) {
        return NextResponse.json(
          {
            error: "insufficient_credits",
            message: "Your account has insufficient credits. Credits renew on " + err.renewsAt,
            renews_at: err.renewsAt,
          },
          { status: 402 }
        )
      }
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      )
    }
    console.error("Upload error:", err)
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    )
  }
}


