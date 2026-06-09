import Link from "next/link"
import { createClient } from "@/lib/auth/gotrue"
import { redirect } from "next/navigation"
import {
  Bot,
  Zap,
  Gauge,
  Users,
  CheckCircle,
  ArrowRight,
  Layers,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Header } from "@/components/ui/header-1"
import { HeroSection, LogosSection } from "@/components/ui/hero-1"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"

export default async function LandingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  if (data?.user) {
    redirect("/dashboard")
  }

  return (
    <div className="flex w-full flex-col">
      <Header />

      <main className="grow">
        <HeroSection />
        <LogosSection />

        {/* ── How It Works ── */}
        <Section id="how-it-works">
          <SectionContent>
            <SectionHeader
              label="How it works"
              title={
                <>
                  From setup to revenue in{" "}
                  <span className="text-primary">15 minutes</span>
                </>
              }
              description="No AI expertise needed. No enterprise sales cycle. Just a clean workflow that turns client content into a revenue-generating chatbot."
            />

            <div className="relative grid gap-4 md:grid-cols-3">
              {/* Column divider lines */}
              <div
                aria-hidden="true"
                className="absolute inset-0 hidden overflow-hidden md:block"
              >
                <div className="absolute inset-y-0 left-1/3 w-px bg-linear-to-b from-transparent via-border/20 to-transparent" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-linear-to-b from-transparent via-border/20 to-transparent" />
              </div>

              {[
                {
                  step: "01",
                  title: "Create a bot",
                  desc: "Name it, upload your client's docs or website URL. The knowledge base builds instantly and the bot trains itself.",
                },
                {
                  step: "02",
                  title: "Embed on their site",
                  desc: "Copy one script tag. Paste on any website. The branded widget appears in seconds — matching your client's brand perfectly.",
                },
                {
                  step: "03",
                  title: "Capture qualified leads",
                  desc: "The bot answers questions and proactively captures sales-intent leads. You get the revenue, your clients get results.",
                },
              ].map((item, i) => (
                <div
                  key={item.step}
                  className={cn(
                    "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards relative rounded-xl border p-4 transition-colors hover:bg-muted/30",
                  )}
                  style={{ animationDelay: `${(i + 1) * 150}ms` }}
                >
                  <div className="mb-2 font-mono text-3xl font-bold tracking-tighter text-muted-foreground/20">
                    {item.step}
                  </div>
                  <h3 className="mb-1.5 text-base font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </SectionContent>
        </Section>

        {/* ── Features ── */}
        <Section id="features">
          <SectionContent>
            <SectionHeader
              label="Features"
              title="Everything an agency needs"
              description="One platform to build, manage, and grow a profitable chatbot service line."
            />

            <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Column divider lines */}
              <div
                aria-hidden="true"
                className="absolute inset-0 hidden overflow-hidden lg:block"
              >
                <div className="absolute inset-y-0 left-1/3 w-px bg-linear-to-b from-transparent via-border/20 to-transparent" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-linear-to-b from-transparent via-border/20 to-transparent" />
              </div>

              {[
                {
                  icon: Bot,
                  title: "White-label branding",
                  desc: "Your logo, your colors, your domain and custom CSS. Clients see your brand, not ours.",
                },
                {
                  icon: Zap,
                  title: "Lead qualification engine",
                  desc: "Bot detects buying intent, captures emails, and books consultations — automatically, 24/7.",
                },
                {
                  icon: Gauge,
                  title: "Smart knowledge base",
                  desc: "Upload PDFs, DOCX, or scrape websites. Hybrid search finds the right answer every time.",
                },
                {
                  icon: Users,
                  title: "Agency dashboard",
                  desc: "Manage all client bots from one place. Monitor leads, conversations, and analytics at a glance.",
                },
                {
                  icon: CheckCircle,
                  title: "Simple embed",
                  desc: "One script tag. Works on Shopify, WordPress, Webflow, and any custom website.",
                },
                {
                  icon: Layers,
                  title: "Client-ready analytics",
                  desc: "Show clients how many leads their chatbot is generating. Prove ROI every month.",
                },
              ].map((feature, i) => {
                const Icon = feature.icon
                return (
                  <div
                    key={feature.title}
                    className={cn(
                      "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards rounded-lg border p-4 transition-colors hover:bg-muted/30",
                    )}
                    style={{ animationDelay: `${(i + 1) * 100}ms` }}
                  >
                    <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-md bg-foreground/5 text-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="mb-1 text-sm font-semibold">{feature.title}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {feature.desc}
                    </p>
                  </div>
                )
              })}
            </div>
          </SectionContent>
        </Section>

        {/* ── FAQ ── */}
        <Section id="faq">
          <SectionContent>
            <SectionHeader
              label="FAQ"
              title="Built for how agencies <span class='text-primary'>actually work</span>"
              description="Honest answers to the questions we hear most."
            />

            <div className="relative mx-auto max-w-3xl">
              <Accordion type="single" collapsible className="space-y-3">
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
                    q: "Can I switch an existing Intercom or Zendesk client?",
                    a: "Yes — and they'll save 80%. Our widget matches their branding, answers from their docs, and captures leads they're currently paying enterprise prices for.",
                  },
                  {
                    q: "Is there a free trial?",
                    a: "Yes. No credit card required. You get one active bot to test everything — including the embed, lead capture, and analytics dashboard.",
                  },
                ].map((faq, i) => (
                  <AccordionItem
                    key={faq.q}
                    value={`faq-${i}`}
                    className={cn(
                      "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards",
                    )}
                    style={{ animationDelay: `${(i + 1) * 100}ms` }}
                  >
                    <AccordionTrigger>{faq.q}</AccordionTrigger>
                    <AccordionContent>{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </SectionContent>
        </Section>

        {/* ── CTA ── */}
        <Section>
          <SectionContent>
            <div
              className={cn(
                "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards mx-auto max-w-2xl text-center",
              )}
            >
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Start your agency practice
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                Flat $199/mo. Unlimited leads. Deploy your first client bot
                today.
              </p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Link href="/register">
                    <Button className="rounded-full group p-3" size="lg">
                      Create your agency account
                      <ArrowRight className="size-4 group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                  <a href="/login">
                    <Button className="rounded-full" size="lg" variant="outline">
                      Sign in
                    </Button>
                  </a>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                No credit card required. Free trial includes one active bot.
              </p>
            </div>
          </SectionContent>
        </Section>
      </main>

      {/* ── Footer ── */}
      <footer className="relative border-t">
        {/* Faded border lines */}
        <div
          aria-hidden="true"
          className="absolute inset-0 mx-auto hidden w-full max-w-5xl md:block"
        >
          <div className="absolute inset-y-0 left-0 h-full w-px bg-linear-to-b from-transparent from-20% to-foreground/10" />
          <div className="absolute inset-y-0 right-0 h-full w-px bg-linear-to-b from-transparent from-20% to-foreground/10" />
        </div>

        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <p className="text-sm font-semibold tracking-tight">squidex</p>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Squidex. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

// ── Reusable section primitives ──

function Section({
  children,
  id,
}: {
  children: React.ReactNode
  id?: string
}) {
  return (
    <section
      id={id}
      className="relative overflow-hidden border-t py-20 md:py-28"
    >
      {/* Top radial shade — peaks at the section's top, fills padding */}
      <div
        aria-hidden="true"
        className="absolute inset-0 isolate hidden overflow-hidden contain-strict lg:block"
      >
        <div className="absolute inset-0 isolate -z-10 bg-[radial-gradient(35%_80%_at_49%_0%,--theme(--color-foreground/.04),transparent)]" />
      </div>
      {children}
    </section>
  )
}

function SectionContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto max-w-5xl px-4">
      {/* Framing vertical borders — at the very edge and at the content edge */}
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden overflow-hidden md:block"
      >
        <div className="absolute inset-y-0 left-0 w-px bg-linear-to-b from-transparent via-border to-border" />
        <div className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-border to-border" />
        <div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-border/50 to-border/50" />
        <div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-border/50 to-border/50" />
      </div>

      {children}
    </div>
  )
}

function SectionHeader({
  label,
  title,
  description,
}: {
  label?: string
  title: React.ReactNode
  description?: string
}) {
  return (
    <div className="mx-auto mb-16 max-w-2xl text-center">
      {label && (
        <div
          className={cn(
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards mb-4 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground",
          )}
        >
          {label}
        </div>
      )}
      <h2
        className={cn(
          "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards text-3xl font-bold tracking-tight delay-100 md:text-4xl",
        )}
        dangerouslySetInnerHTML={
          typeof title === "string" ? { __html: title } : undefined
        }
      >
        {typeof title !== "string" ? title : undefined}
      </h2>
      {description && (
        <p
          className={cn(
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards mt-3 text-muted-foreground delay-200",
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
}
