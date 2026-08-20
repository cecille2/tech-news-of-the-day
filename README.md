# Daily Briefing

A personal trend-intelligence app: it automatically discovers what's happening in tech, AI, startups, and business, groups related coverage into persistent **Topics**, writes a sourced briefing for each one, and pushes today's new topics to your phone every morning — all for **$0/month**.

Built to replace a manual routine of scrolling TechCrunch, Bloomberg, YouTube, and social media to figure out what's worth talking about, why it matters, and what's already been said about it.

## Why $0 is a real constraint, not a slogan

The daily pipeline never calls a paid LLM API. Ranking, clustering, entity resolution, and briefing generation are all deterministic code plus a small open-source embedding model that runs locally in the pipeline job — nothing metered, nothing that requires a payment method on file. See [§ Architecture](#architecture) for how, and [§ Cost & safety](#cost--safety) for exactly which free tiers this relies on and what protects against ever being billed by accident.

Paid AI (Claude, OpenAI, Gemini, Kimi/Moonshot, or a local Ollama model) is fully wired in behind a `SynthesisProvider` interface and can be turned on later by setting one environment variable — but the app is a complete, useful product without it.

## The loop

```
Source catalog (pre-populated)  ──┐
Your custom RSS/Substack feeds  ──┴─▶ Ingest ─▶ Extract entities ─▶ Cluster into Topics
Your followed creators          ──┘                                        │
                                                                             ▼
Phone push (once, at your local time)  ◀── Rank ◀── Write structured briefing
        │
        ▼
Read · Follow · Remind later · Save  ──▶  Today / Following / Saved / Archive
```

`Topic` is a persistent object with an update timeline — a story developing over several days becomes updates to one Topic, not duplicate entries. Read, Follow, Remind, and Save are four independent, separately-tracked actions (see `prisma/schema.prisma`), because they mean different things: read = seen it, follow = keep tracking this subject, remind = resurface this later, save = put it in my library.

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind | Server components read straight from Postgres; server actions handle every mutation (read/follow/remind/save, settings) with no separate API layer needed. |
| Database | Postgres + `pgvector`, e.g. Supabase free tier | Relational data + vector similarity search in one free service. |
| Pipeline runner | GitHub Actions, scheduled workflow | Free compute with no serverless bundle-size ceiling — needed for the local embedding model. |
| Embeddings | `all-MiniLM-L6-v2` via `@huggingface/transformers`, run inside the Action | Real semantic similarity for clustering, computed locally — zero external API calls. |
| Ranking | Weighted formula over ~12 deterministic signals, configurable per user | No LLM judgment call required; tunable from Settings, not hard-coded. |
| Clustering | 3-tier confidence (title/entity/semantic signals combined) | High confidence auto-merges into an existing Topic; uncertain matches are flagged for one-tap manual review instead of guessed. |
| Briefing synthesis | `ExtractiveSynthesisProvider` (required, default) — a structured 7-section template filled by scoring real sentences from real sources | Every claim traces back to a specific `Source` row. Optional `SynthesisProvider`s (Ollama, Kimi, Anthropic, OpenAI, Gemini) can generate more fluent prose later, gated behind their own API keys, with silent fallback to the free provider on any failure. |
| Notifications | Web Push (VAPID), one push per morning at each user's stored local time | No quota, no billing surface — a W3C standard, not a paid API. |

Full design rationale — source catalog tiers, the discovery-vs-verification workflow, canonical entity resolution, the sentence-scoring formula, and every tradeoff considered — lives in the architecture discussion this repo was built from; the code below is the executable version of it.

## Cost & safety

| Service | Free ceiling | What happens past it | Payment method attached? |
|---|---|---|---|
| Vercel Hobby (optional, for deploying the UI) | Generous bandwidth/function quota | Throttles, does not bill | None |
| Supabase Free | 500MB DB, 5GB bandwidth | Restricts writes, does not bill | None |
| GitHub Actions | 2,000 min/mo (private repo); this pipeline uses ~150–300/mo | Workflow stops running | **Set your account spending limit to $0** in GitHub → Settings → Billing |
| YouTube Data API | 10,000 units/day | 403 quota error | **Do not enable billing** on the Google Cloud project — then exceeding quota is structurally incapable of costing money |
| Web Push | None — not a billed API | N/A | N/A |
| Optional synthesis providers | N/A | N/A | No key present = provider never loads |

Runaway-job guardrails baked into `runDailyPipeline.ts`: a hard 15-minute job timeout, a cap on stories processed and new topics created per run, and auto-disabling a source after 5 consecutive failures. Nothing in the pipeline ever falls back from a free path to a paid one automatically — only the reverse (a configured paid/local provider failing falls back to the free extractive one).

## Getting started

1. **Database** — create a free Postgres project (Supabase recommended: bundles `pgvector` + free tier). Enable the `vector` extension once in its dashboard.
2. **Copy env**: `cp .env.example .env` and fill in `DATABASE_URL`.
3. **Install & migrate**:
   ```
   npm install
   npm run db:migrate
   npm run seed        # health-checks and inserts the default source catalog
   ```
4. **Push keys**: `npx web-push generate-vapid-keys`, put the values in `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and the same public key again as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
5. **Run the app**: `npm run dev`, visit `/settings` to add your own sources/creators and enable push.
6. **Run the pipeline once manually**: `npm run pipeline` — ingests everything, clusters, ranks, writes briefings, sends push to whoever's local time matches their briefing hour.
7. **Automate it**: push this repo to GitHub, add the same env vars as repository secrets, and the included workflow (`.github/workflows/daily-pipeline.yml`) runs it every 30 minutes on its own — cheap enough to check every user's local time without hard-coding a timezone.

Optional AI upgrade, later: set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MOONSHOT_API_KEY`, or `OLLAMA_HOST` for a local model) as a repo secret. Nothing else changes — the pipeline picks it up automatically and still falls back to the free extractive provider if that call ever fails.

## Project structure

```
prisma/schema.prisma        the whole data model — Topic as the shared, persistent object
src/lib/ingestion/          RSS + YouTube polling, conditional GET, the default source catalog
src/lib/nlp/                entity extraction + canonical resolution, local embeddings, text normalization
src/lib/clustering/         3-tier confidence topic-matching
src/lib/ranking/            configurable weighted scoring + the feedback loop
src/lib/synthesis/          ExtractiveSynthesisProvider (required) + optional paid/local providers
src/lib/pipeline/           orchestrates the whole daily run end to end
src/lib/push/               Web Push sending + per-user local-time + snooze scheduling
src/app/                    Today / Following / Saved / Archive / Settings, server actions for every mutation
.github/workflows/          the scheduled pipeline job
```

## What's deliberately deferred

Automated TikTok/Instagram/X monitoring (no compliant public API exists for arbitrary creators — manual link-attach fills the same data model until one does), multi-user accounts, public follower counts, and the creator-analytics dashboard. The schema is already shaped for all of it — see the `Creator`, `VideoCoverageRequest`, and `TopicMetricSnapshot` models — so adding them later is additive, not a rewrite.
