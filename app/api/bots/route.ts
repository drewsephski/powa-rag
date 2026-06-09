import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { query, withTenant } from "@/lib/db/client"
import {
  createKnowledgeBase,
  createAgent,
  linkKnowledgeBaseToAgent,
} from "@/lib/powabase/client"
import { z } from "zod"

// ── List Bots ──

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const bots = await query(
    `SELECT id, name, slug, status, widget_config,
            total_conversations, total_leads, created_at, updated_at
     FROM client_bots
     WHERE agency_id = $1
     ORDER BY created_at DESC`,
    [session.agencyId]
  )

  return NextResponse.json({ bots })
}

// ── Create Bot ──

const createSchema = z.object({
  name: z.string().min(1).max(100),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const { name } = parsed.data

    // Generate slug
    const slug = `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${Math.random().toString(36).substring(2, 6)}`

    // 1. Create Powabase Knowledge Base
    let kbId: string
    let agentId: string

    try {
      const kbName = `squidex-${slug}`
      const kb = await createKnowledgeBase(kbName)
      kbId = kb.id

      // 2. Create Powabase Agent
      const agentName = `squidex-${slug}`
      const agent = await createAgent({
        name: agentName,
        model: "gpt-4o-mini",
        system_prompt: `You are a helpful sales-qualified assistant for a business. You answer questions based on the knowledge base provided.

Your primary goal is to generate qualified leads. Follow this flow:

1. Answer questions helpfully and accurately using the knowledge base.
2. When a visitor asks about pricing, services, demos, consultations, or shows buying intent, answer naturally then offer to connect them with the team.
3. When they agree, gently capture their information (name, email, phone, company).
4. If you don't know something, be honest — don't make things up.

Signal buying intent by including [LEAD_INTENT] followed by the reason (pricing_inquiry, service_inquiry, or consultation_request) in your response metadata.`,
        settings: {
          temperature: 0.7,
          max_tokens: 1024,
        },
      })
      agentId = agent.id
    } catch (err) {
      console.error("Failed to create Powabase resources:", err)
      return NextResponse.json(
        { error: "Failed to create bot resources. Check Powabase limits." },
        { status: 500 }
      )
    }

    // 3. Create bot in our DB
    const newBot = await withTenant(session.agencyId, async () => {
      const bots = await query(
        `INSERT INTO client_bots (agency_id, name, slug, powabase_kb_id, powabase_agent_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, slug, embed_token, widget_config, created_at`,
        [session.agencyId, name, slug, kbId, agentId]
      )
      return bots[0]
    })

    // 4. Link KB to agent (Powabase)
    try {
      await linkKnowledgeBaseToAgent(agentId, kbId)
    } catch (err) {
      console.error("Failed to link KB to agent:", err)
      // Non-fatal — the agent can still be used, just without KB search
    }

    // 5. Update agency bot counter
    await query(
      `UPDATE agencies SET bot_count = bot_count + 1 WHERE id = $1`,
      [session.agencyId]
    )

    return NextResponse.json({ bot: newBot })
  } catch (err) {
    console.error("Create bot error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
