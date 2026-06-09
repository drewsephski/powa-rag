---
sessionID: ses_15750ba23ffe051w0e6gl1S5dd
baseMessageCount: 3
updatedAt: 2026-06-08T19:35:03.486Z
---

# lets go with 3

## Current spec

Fully defined: White-label AI chatbot platform for agencies. Shared Powabase project proxied through backend. Script embed widget with KB ingestion (docs + web scraping). Lead capture stored in dashboard. Flat platform fee to agencies, they resell to clients. MVP = agency dashboard + one end-to-end client bot. Next.js frontend, GoTrue auth.

## Q&A history

Q: Who's the primary customer? This affects everything — pricing, sales channel, widget complexity.
A: Agencies that build for their clients — $200+/mo, white-label everything, API access

Q: Why would a business choose this over ChatGPT/Intercom/Zendesk AI — what's the wedge?
A: 3 + 2 combined (Customization + Simplicity)

The strongest wedge isn't AI quality. Most customers can't tell the difference between RAG pipelines. They can tell the difference between setup time and branding control. Fully white-label AI chatbot platform that agencies can deploy for clients in minutes, with custom branding, domains, widgets, and knowledge bases—without the complexity or pricing of Intercom or Zendesk.

Q: How do you want to handle multi-tenancy? One Powabase project for the whole platform vs one per end-client? The ai.* RLS is project-wide, so a shared project means all agents/KBs are visible to all authenticated users — you'd need to proxy everything through your backend with the Service Role key and build isolation yourself. One project per client is clean but requires creating a new Powabase project per client manually.
A: Shared project, proxy all calls through my backend (more dev work, one operational surface)

Q: How do agencies primarily set up the knowledge base for each client's bot? This drives the upload UX and which Powabase features you lead with.
A: Both — let the agency choose per client

Q: How does the agency charge their client for each chatbot? This shapes your own pricing and what '$200+/mo' means in practice.
A: Agency resells their own price — we give them a flat platform fee, they charge whatever they want to clients

Q: Beyond question-answering, which feature would make this a no-brainer for agencies to sell to clients?
A: Lead capture — if the chatbot can't answer, grab the visitor's email/conversation (converts support into pipeline)

Q: How do agencies manage their clients' bots? This is the product they actually interact with daily.
A: Agency dashboard with a list of client bots — create, monitor, edit KB, view lead captures (they manage everything themselves)

Q: When the bot can't answer — what happens to the captured lead? This is the monetization feature, so the flow matters.
A: Captures email + conversation history, stores in a table accessible via the dashboard (moderate — agency views and exports)

Q: How does the chatbot appear on the client's website? This changes deployment complexity and the customization surface.
A: Script tag embed — paste one <script> on the site, widget appears. Works everywhere, least friction (recommended)

Q: For your agency users signing into the dashboard — are you using Powabase's built-in GoTrue auth for this?
A: Yes, GoTrue handles agency auth out of the box — email+password, Google OAuth, magic links. One less thing to build.

Q: What's the first version you want to build? The product is multi-sided (agency dashboard + client widget + ingestion pipeline + lead capture). Where do you start?
A: Build both simultaneously — dashboard + one working client bot with doc ingestion — get a complete end-to-end working prototype to show agencies

Q: What frontend stack for the agency dashboard and the chat widget?
A: Next.js (React) — build everything in one framework, SSR for dashboard pages, widget as a React component bundled into a script (recommended)
