import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query, withTenant } from "@/lib/db/client"
import {
  uploadSource,
  waitForExtraction,
  reextractSource,
  getSourceContent,
  PowabaseError,
} from "@/lib/powabase/client"
import { processSourcePipeline } from "@/lib/sources/process-source"

/**
 * Parse a PDF file and optionally add it to a bot's knowledge base.
 *
 * Uses Powabase's native extraction pipeline instead of a local PDF parser.
 * This means: upload raw PDF → Powabase extracts text → we fetch the result.
 *
 * POST /api/parse-data
 * FormData:
 *   - file: PDF file (required)
 *   - botId: Bot ID to add parsed content to knowledge base (optional)
 *
 * Returns:
 *   { text, pageCount, source? }
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const botId = formData.get("botId") as string | null

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF files are supported" },
      { status: 400 }
    )
  }

  try {
    // ── Upload the raw PDF to Powabase ──
    // Powabase handles extraction natively (fitz/pdfplumber/mistral chain)
    const buffer = Buffer.from(await file.arrayBuffer())
    const powaSource = await uploadSource(buffer, file.name)

    // ── Wait for extraction (up to 3 min), auto-retry with OCR if needed ──
    let extractionStatus = await waitForExtraction(powaSource.id, 90)

    if (extractionStatus === "attention_required") {
      // Re-extract with OCR model
      await reextractSource(powaSource.id, "mistral")
      extractionStatus = await waitForExtraction(powaSource.id, 90)
    }

    if (extractionStatus !== "extracted") {
      return NextResponse.json(
        {
          error: `PDF extraction failed with status: ${extractionStatus}`,
        },
        { status: 422 }
      )
    }

    // ── Fetch the extracted text ──
    const parsedText = await getSourceContent(powaSource.id)

    if (!parsedText.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted from this PDF" },
        { status: 422 }
      )
    }

    // ── If botId provided, add to knowledge base ──
    let sourceResult: Record<string, unknown> | null = null

    if (botId) {
      const session = await getSession()
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // Verify bot ownership
      const bots = await query<{
        id: string
        powabase_kb_id: string | null
      }>(
        `SELECT id, powabase_kb_id FROM client_bots WHERE id = $1 AND agency_id = $2`,
        [botId, session.agencyId]
      )

      if (bots.length === 0) {
        return NextResponse.json({ error: "Bot not found" }, { status: 404 })
      }

      const bot = bots[0]

      // Create source record in our DB
      const newSource = await withTenant(session.agencyId, async () => {
        const sources = await query(
          `INSERT INTO bot_knowledge_sources
           (bot_id, agency_id, source_type, filename, file_type,
            powabase_source_id, extraction_status)
           VALUES ($1, $2, 'upload', $3, $4, $5, $6)
           ON CONFLICT DO NOTHING
           RETURNING id, filename, extraction_status`,
          [
            botId,
            session.agencyId,
            file.name,
            file.name.split(".").pop()?.toLowerCase() || "pdf",
            powaSource.id,
            extractionStatus,
          ]
        )
        return sources[0]
      })

      // Background pipeline: add to KB
      if (bot.powabase_kb_id) {
        processSourcePipeline(
          bot.powabase_kb_id,
          powaSource.id,
          newSource?.id
        )
      }

      sourceResult = {
        id: newSource?.id || powaSource.id,
        extraction_status: extractionStatus,
      }
    }

    return NextResponse.json({
      text: parsedText,
      pageCount: null, // Powabase doesn't expose page count via derivatives API
      ...(sourceResult ? { source: sourceResult } : {}),
    })
  } catch (err) {
    if (err instanceof PowabaseError) {
      if (err.isInsufficientCredits) {
        return NextResponse.json(
          {
            error: "insufficient_credits",
            message:
              "Your account has insufficient credits. Credits renew on " +
              err.renewsAt,
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
    console.error("PDF parse error:", err)
    return NextResponse.json(
      { error: "Failed to parse PDF" },
      { status: 500 }
    )
  }
}
