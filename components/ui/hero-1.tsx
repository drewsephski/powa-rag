import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Rocket, ArrowRight, PhoneCall, BotIcon, VideoIcon } from "lucide-react";
import { LogoCloud } from "@/components/ui/logo-cloud-3";

export function HeroSection() {
  return (
    <section className="relative mx-auto w-full max-w-5xl">
      {/* Top radial shade */}
      <div
        aria-hidden="true"
        className="absolute inset-0 isolate hidden overflow-hidden contain-strict lg:block"
      >
        <div className="absolute inset-0 -top-14 isolate -z-10 bg-[radial-gradient(35%_80%_at_49%_0%,--theme(--color-foreground/.08),transparent)] contain-strict" />
      </div>

      {/* X Bold Faded Borders — visible only from 80% down */}
      <div
        aria-hidden="true"
        className="absolute inset-0 mx-auto hidden min-h-screen w-full max-w-5xl lg:block"
      >
        <div className="absolute inset-y-0 left-0 z-10 h-full w-px bg-linear-to-b from-transparent from-80% to-foreground/15" />
        <div className="absolute inset-y-0 right-0 z-10 h-full w-px bg-linear-to-b from-transparent from-80% to-foreground/15" />
      </div>

      {/* Main content */}
      <div className="relative flex flex-col items-center justify-center gap-5 pt-32 pb-30">
        {/* Inner faded vertical borders */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-1 size-full overflow-hidden"
        >
          <div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-border to-border md:left-8" />
          <div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-border to-border md:right-8" />
          <div className="absolute inset-y-0 left-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:left-12" />
          <div className="absolute inset-y-0 right-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:right-12" />
        </div>

        {/* Badge */}
        <a
          className={cn(
            "group mx-auto flex w-fit items-center gap-3 rounded-full border bg-card px-3 py-1 shadow",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out",
          )}
          href="#features"
        >
          <Rocket className="size-3 text-muted-foreground" />
          <span className="text-xs">New — analytics dashboard</span>
          <span className="block h-5 border-l" />
          <ArrowRight className="size-3 duration-150 ease-out group-hover:translate-x-1" />
        </a>

        {/* Heading */}
        <h1
          className={cn(
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards text-balance text-center text-4xl tracking-tight delay-100 duration-500 ease-out md:text-5xl lg:text-6xl",
            "text-shadow-[0_0px_50px_theme(--color-foreground/.2)]",
          )}
        >
          White-label AI chatbots
          <br />
          for every agency
        </h1>

        {/* Subheading */}
        <p
          className={cn(
            "fade-in slide-in-from-bottom-10 mx-auto max-w-md animate-in fill-mode-backwards text-center text-base text-foreground/80 tracking-wider delay-200 duration-500 ease-out sm:text-lg md:text-xl",
          )}
        >
          Sell AI chatbots to your clients, branded as your own, deployed in
          minutes, and designed to capture qualified leads.
        </p>

        {/* CTAs */}
        <div
          className={cn(
            "fade-in slide-in-from-bottom-10 flex animate-in flex-row flex-wrap items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out",
          )}
        >
          <Button className="rounded-full" size="lg" variant="secondary">
            <VideoIcon className="size-4" />
            See Demo
          </Button>
          <Link href="/register">
            <Button className="rounded-full group" size="lg">
              Get started
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform duration-200" data-icon="inline-end" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LogosSection() {
  return (
    <section className="relative space-y-4 border-t pt-6 pb-10">
      <h2 className="text-center font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
        Built with <span className="text-foreground">innovative technology</span>
      </h2>
      <div className="relative z-10 mx-auto max-w-4xl">
        <LogoCloud logos={logos} />
      </div>
    </section>
  );
}

const logos = [
  {
    src: "https://storage.efferd.com/logo/nvidia-wordmark.svg",
    alt: "Nvidia Logo",
  },
  {
    src: "https://storage.efferd.com/logo/supabase-wordmark.svg",
    alt: "Supabase Logo",
  },
  {
    src: "https://storage.efferd.com/logo/openai-wordmark.svg",
    alt: "OpenAI Logo",
  },
  {
    src: "https://storage.efferd.com/logo/turso-wordmark.svg",
    alt: "Turso Logo",
  },
  {
    src: "https://storage.efferd.com/logo/vercel-wordmark.svg",
    alt: "Vercel Logo",
  },
  {
    src: "https://storage.efferd.com/logo/github-wordmark.svg",
    alt: "GitHub Logo",
  },
  {
    src: "https://storage.efferd.com/logo/claude-wordmark.svg",
    alt: "Claude AI Logo",
  },
  {
    src: "https://storage.efferd.com/logo/clerk-wordmark.svg",
    alt: "Clerk Logo",
  },
];
