import Link from "next/link"
import { createClient } from "@/lib/auth/gotrue"
import { redirect } from "next/navigation"
import { Bot, Gauge, Zap, Users, ArrowRight, CheckCircle } from "lucide-react"

export default async function LandingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  if (data?.user) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-svh flex-col">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            squidex
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-8 items-center justify-center rounded-lg bg-foreground px-4 text-xs font-medium text-background transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b">
        {/* Background pattern */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-b from-primary/5 to-transparent blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Bot className="h-3 w-3" />
              Built for agencies
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              White-label AI chatbots
              <br />
              <span className="text-primary">for every client</span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-muted-foreground md:text-xl">
              Generate recurring revenue for your agency by selling AI chatbots
              to your clients — deployed in minutes, branded as your own, and
              designed to capture qualified leads.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-6 text-sm font-medium text-background transition-all hover:opacity-90 sm:w-auto"
              >
                Build your agency
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border px-6 text-sm font-medium transition-colors hover:bg-accent sm:w-auto"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Logo Cloud / Social Proof ── */}
      <section className="border-b py-12">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Trusted by agencies serving
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm font-medium text-muted-foreground/60">
            <span>SMBs</span>
            <span className="text-foreground/20">/</span>
            <span>SaaS Companies</span>
            <span className="text-foreground/20">/</span>
            <span>E-commerce</span>
            <span className="text-foreground/20">/</span>
            <span>Professional Services</span>
            <span className="text-foreground/20">/</span>
            <span>Healthcare</span>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="border-b py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              From setup to revenue in{" "}
              <span className="text-primary">15 minutes</span>
            </h2>
            <p className="mt-3 text-muted-foreground">
              No AI expertise needed. No enterprise sales cycle. Just a clean
              workflow that turns client content into a revenue-generating chatbot.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Create a bot",
                desc: "Name it, upload your client's docs or website URL. The knowledge base builds instantly.",
              },
              {
                step: "02",
                title: "Embed on their site",
                desc: "Copy one script tag. Paste on any website. The branded widget appears in seconds.",
              },
              {
                step: "03",
                title: "Capture qualified leads",
                desc: "The bot answers questions and proactively captures sales-intent leads. You get the revenue.",
              },
            ].map((item) => (
              <div key={item.step} className="group relative rounded-2xl border p-6 transition-colors hover:bg-muted/30">
                <div className="mb-3 text-4xl font-bold tracking-tighter text-primary/20">
                  {item.step}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-b py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything an agency needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              One platform to build, manage, and grow a profitable chatbot
              service line.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Bot,
                title: "White-label branding",
                desc: "Your logo, your colors, your domain. Clients see your brand, not ours.",
              },
              {
                icon: Zap,
                title: "Lead qualification engine",
                desc: "Bot detects buying intent, captures emails, and books consultations — automatically.",
              },
              {
                icon: Gauge,
                title: "Smart knowledge base",
                desc: "Upload PDFs, DOCX, or scrape websites. Hybrid search finds the right answer every time.",
              },
              {
                icon: Users,
                title: "Agency dashboard",
                desc: "Manage all client bots from one place. Monitor leads and conversations at a glance.",
              },
              {
                icon: CheckCircle,
                title: "Simple embed",
                desc: "One script tag. Works on Shopify, WordPress, Webflow — any website.",
              },
              {
                icon: Zap,
                title: "Client-ready analytics",
                desc: "Show clients how many leads their chatbot is generating. Prove ROI monthly.",
              },
            ].map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border p-5 transition-colors hover:bg-muted/30"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="mb-1.5 font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── For Agencies Section ── */}
      <section className="border-b py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Built for how agencies <span className="text-primary">actually work</span>
              </h2>
            </div>

            <div className="space-y-6">
              {[
                {
                  q: "I don't know anything about AI.",
                  a: "You don't need to. Upload your client's documentation, and the bot trains itself. Set it up in the time it takes to drink your coffee.",
                },
                {
                  q: "How do I price this to clients?",
                  a: "You set the price. We charge your agency a flat monthly fee. You can charge clients $99/mo or $999/mo — entirely up to you. Our average agency resells for 3-5x their cost.",
                },
                {
                  q: "What if the bot doesn't know something?",
                  a: "It captures the lead instead of leaving the visitor stuck. That email goes straight to your dashboard — a revenue opportunity, not a dead end.",
                },
                {
                  q: "Can I switch an existing Intercom/Zendesk client?",
                  a: "Yes — and they'll save 80%. Our widget matches their branding, answers from their docs, and captures leads they're currently paying enterprise prices for.",
                },
              ].map((faq) => (
                <div key={faq.q} className="rounded-xl border p-5">
                  <p className="mb-1.5 font-semibold">{faq.q}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-b py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Start your agency practice
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Flat $199/mo. Unlimited leads. Deploy your first client bot today.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-6 text-sm font-medium text-background transition-all hover:opacity-90 sm:w-auto"
              >
                Create your agency account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border px-6 text-sm font-medium transition-colors hover:bg-accent sm:w-auto"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card required. Free trial includes one active bot.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm font-semibold tracking-tight">squidex</p>
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Squidex. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
