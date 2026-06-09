import { NextResponse } from "next/server"
import { createClient } from "@/lib/auth/gotrue"
import { query } from "@/lib/db/client"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  agency_name: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { email, password, agency_name, name } = parsed.data

    // 1. Create GoTrue user
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    })

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      )
    }

    // 2. Create agency
    const slug = agency_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    const agencies = await query<{ id: string }>(
      `INSERT INTO agencies (name, slug, owner_name, owner_email)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [agency_name, slug, name, email]
    )

    const agencyId = agencies[0].id

    // 3. Create agency user
    await query(
      `INSERT INTO agency_users (agency_id, email, name, gotrue_id)
       VALUES ($1, $2, $3, $4)`,
      [agencyId, email, name, authData.user.id]
    )

    return NextResponse.json({
      user: { id: authData.user.id, email },
      agency: { id: agencyId, name: agency_name, slug },
    })
  } catch (err) {
    console.error("Registration error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
