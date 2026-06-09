import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

const publicPaths = ["/login", "/register", "/forgot-password", "/widget", "/embed"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths + static assets
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/widget") ||
    pathname === "/"
  ) {
    // Still try to get user on the landing page
    if (pathname === "/") {
      const supabase = createServerClient(
        process.env.POWABASE_URL!,
        process.env.POWABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll()
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => {
                request.cookies.set(name, value)
              })
            },
          },
        }
      )

      const { data } = await supabase.auth.getUser()
      // If already logged in, redirect to dashboard
      if (data.user) {
        return NextResponse.redirect(new URL("/dashboard", request.url))
      }
    }
    return NextResponse.next()
  }

  // Check authentication for protected routes
  const supabase = createServerClient(
    process.env.POWABASE_URL!,
    process.env.POWABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
        },
      },
    }
  )

  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    const redirectUrl = new URL("/login", request.url)
    redirectUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
