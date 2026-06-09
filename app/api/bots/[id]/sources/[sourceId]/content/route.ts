import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db/client"
import {
  getSourceContent,
  getSourceStatus,
  downloadSourceFile,
  reextractSource,
  waitForExtraction,
} from "@/lib/powabase/client"
import { extractPdfText } from "@/lib/sources/pdf-fallback"

/**
 * GET the extracted text content of a knowledge source.
 *
 * Strategy:
 *   1. Check Powabase extraction status
 *   2. If still extracting → return 202 (polling)
 *   3. Try Powabase's extracted content (page-texts / derivatives)
 *   4. If that yields no text and the source is a PDF:
 *      a. Try re-extracting with OCR (mistral)
 *      b. If still no text, fall back to local pdfjs-dist extraction
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: botId, sourceId } = await params

  // Verify the source belongs to this bot + agency
  const sources = await query<{
    id: string
    powabase_source_id: string | null
    filename: string | null
  }>(
    `SELECT id, powabase_source_id, filename
     FROM bot_knowledge_sources
     WHERE id = $1 AND bot_id = $2 AND agency_id = $3`,
    [sourceId, botId, session.agencyId]
  )

  if (sources.length === 0) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 })
  }

  const source = sources[0]

  if (!source.powabase_source_id) {
    return NextResponse.json({ error: "Source has no content yet" }, { status: 400 })
  }

  try {
    const powaId = source.powabase_source_id
    const isPdf = source.filename?.toLowerCase().endsWith(".pdf") ?? false

    // ── Check Powabase status ──
    const powaStatus = await getSourceStatus(powaId)
    const currentStatus = powaStatus.extraction_status

    if (currentStatus === "pending" || currentStatus === "extracting") {
      return NextResponse.json(
        { status: currentStatus, message: "Extracting content from this file — please wait" },
        { status: 202 }
      )
    }

    // ── Try Powabase's extracted content ──
    let content = await getSourceContent(powaId, { skipWait: true })
    const hasContent = content && content !== "(no text content)"

    if (hasContent) {
      return NextResponse.json({ content, status: "extracted", method: "powabase" })
    }

    // ── If no content from Powabase and it's a PDF, try fallbacks ──
    if (isPdf) {
      // Attempt 1: re-extract with OCR model
      console.warn(`Source ${powaId}: no text from Powabase, trying OCR re-extract...`)
      await reextractSource(powaId, "mistral")
      const ocrStatus = await waitForExtraction(powaId, 60)

      if (ocrStatus === "extracted") {
        content = await getSourceContent(powaId, { skipWait: true })
        if (content && content !== "(no text content)") {
          return NextResponse.json({ content, status: "extracted", method: "powabase-ocr" })
        }
      }

      // Attempt 2: local PDF extraction with pdfjs-dist
      console.warn(`Source ${powaId}: OCR failed, trying local pdfjs-dist fallback...`)
      const pdfBuffer = await downloadSourceFile(powaId)

      if (pdfBuffer) {
        const localText = await extractPdfText(pdfBuffer)
        if (localText) {
          return NextResponse.json({ content: localText, status: "extracted", method: "pdfjs-local" })
        }
      }

      return NextResponse.json(
        { error: "Could not extract text from this PDF. It may be a scanned document requiring OCR." },
        { status: 422 }
      )
    }

    // Not a PDF and no content from Powabase
    return NextResponse.json({ content: "(no text content)", status: "extracted" })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch source content"
    console.error("Source content fetch error:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
