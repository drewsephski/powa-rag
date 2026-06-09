import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query, withTenant } from "@/lib/db/client"
import {
  uploadSource,
  PowabaseError,
} from "@/lib/powabase/client"
import { processSourcePipeline } from "@/lib/sources/process-source"
import { FirecrawlAppV1 } from "firecrawl"
import crypto from "crypto"

const firecrawl = new FirecrawlAppV1({
  apiKey: process.env.FIRECRAWL_API_KEY || "",
})

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
    const body = await request.json()
    const { url } = body

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    if (!process.env.FIRECRAWL_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Firecrawl API key not configured. Set FIRECRAWL_API_KEY in your environment.",
        },
        { status: 500 }
      )
    }

    // Verify bot ownership
    const bots = await query<{
      id: string
      powabase_kb_id: string | null
      name: string
    }>(
      `SELECT id, powabase_kb_id, name FROM client_bots WHERE id = $1 AND agency_id = $2`,
      [botId, session.agencyId]
    )

    if (bots.length === 0) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 })
    }

    const bot = bots[0]

    // ── Scrape with Firecrawl ──
    const sourceUrl = new URL(url)
    const hostname = sourceUrl.hostname

    const doc = (await firecrawl.scrapeUrl(url, {
      formats: ["markdown"],
    })) as { markdown?: string }
    const markdown = doc?.markdown ?? ""

    if (!markdown.trim()) {
      return NextResponse.json(
        { error: "No content could be scraped from this URL" },
        { status: 400 }
      )
    }

    // ── Upload scraped content as a text source to Powabase ──
    const content = `Source: ${url}\n\n${markdown}`
    const blob = new Blob([content], { type: "text/markdown" })
    const filename = `${hostname}-${crypto.randomBytes(4).toString("hex")}.md`
    const powaSource = await uploadSource(blob, filename)

    // ── Create source record in our DB ──
    const newSource = await withTenant(session.agencyId, async () => {
      const sources = await query(
        `INSERT INTO bot_knowledge_sources
         (bot_id, agency_id, source_type, website_url, filename, file_type,
          powabase_source_id, extraction_status)
         VALUES ($1, $2, 'website', $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING id, website_url, extraction_status`,
        [
          botId,
          session.agencyId,
          url,
          filename,
          "md",
          powaSource.id,
          powaSource.extraction_status,
        ]
      )
      return sources[0]
    })

    // ── Background pipeline: extract → add to KB ──
    if (bot.powabase_kb_id) {
      processSourcePipeline(bot.powabase_kb_id, powaSource.id, newSource?.id)
    }

    return NextResponse.json({
      source: newSource || {
        id: powaSource.id,
        website_url: url,
        extraction_status: powaSource.extraction_status,
      },
      duplicate: powaSource.duplicate,
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
    console.error("Website scrape error:", err)
    return NextResponse.json(
      {
        error:
          "Scraping failed. Check the URL and Firecrawl configuration.",
      },
      { status: 500 }
    )
  }
}
