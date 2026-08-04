# NewzWale Rebuild — Design

Date: 2026-08-05
Status: Approved

## Problem

NewzWale is deployed at `https://newzwale.editall.workers.dev/` and renders, but neither of its two product features works. The site presents static demo content as live, AI-verified news, and its fact-checker cannot be reached at all.

### Verified evidence

| Check | Result |
| --- | --- |
| `POST /api/v1/verify/claim` (production) | `405 Method Not Allowed`, empty body |
| `POST /api/v1/tts` (production) | `404 Not Found` |
| `dist/server/` after build | empty |
| `grep -r prerender src/` | zero matches |
| `nslookup newzwale.com` | `Non-existent domain` |
| Cloudflare dashboard → Variables | "Variables cannot be added to a Worker that only has static assets" |

### Root cause

`astro.config.mjs` registers the Cloudflare adapter but never sets `output`. Astro therefore defaults to `static`, and because no route exports `prerender = false`, every page *and every API route* is prerendered at build time. API routes became inert files under `dist/client/api/…`; `dist/server/` is empty; the deployed Worker contains only static assets.

This single misconfiguration explains the 405, the 404, and the dashboard's refusal to accept secrets. The Worker has no server code to receive them.

Two further defects compound it:

- `wrangler.jsonc` sets `assets.directory` to `./dist`, but the build emits client assets to `./dist/client`.
- `astro.config.mjs` sets `site: 'https://newzwale.com'`, a domain that does not resolve. This poisons the sitemap and canonical URLs.

### Product-integrity defects

- `src/pages/api/v1/verify/claim.ts` matches ~7 hardcoded keywords. Every other claim returns `verified` with a fabricated `0.95` confidence score and PTI/ANI/PIB citations that were never fetched. For a fact-checking product this is worse than having no fact-checker.
- `src/pages/api/v1/auth/*` mint sessions via `btoa(email)` with no password verification. `google/login.ts` never contacts Google; when the client ID is unset — which it is — it redirects the visitor into a logged-in session as `google_user@gmail.com`.
- `src/pages/admin.astro` has no authorization gate.
- `src/components/NewsFeed.astro` renders 6 hardcoded articles labelled "SARVAM AI VERIFIED WIRE STREAM".
- Trending, Categories, and the Sensex/Nifty ticker present hardcoded numbers as live data.

## Goals

1. Two working interfaces: News (`/`) and Fact Check (`/verify`).
2. Real news from a live API, with a fallback that keeps the page populated when quota is exhausted.
3. A fact-checker that returns honest verdicts backed by citations that were actually retrieved.
4. No security holes. No fabricated data presented as real.

## Non-goals

- User accounts, saved articles, profiles, admin tooling.
- Text-to-speech via a paid provider.
- PDF and voice input for fact-checking.
- Reviving the FastAPI backend, Docker, or Kubernetes deployment paths.

## Architecture

Astro SSR on Cloudflare Workers. One codebase, one deploy target.

```
astro.config.mjs     output: 'server', site: <workers.dev URL>
wrangler.jsonc       assets.directory: ./dist/client
                     kv_namespaces: NEWZ_CACHE
                     ai: { binding: "AI" }
```

`NEWZ_CACHE` (Cloudflare KV) serves three purposes: caching news responses so free-tier quota survives real traffic, caching fact-check verdicts so repeated claims cost nothing, and backing a simple per-IP rate limit on `/api/factcheck`.

Static marketing pages (`about`, `contact`, `privacy`, `terms`, `404`, `500`) keep `export const prerender = true`. Everything else renders per request.

### Interface 1 — News (`/`)

The home page is the news interface. Categories and Trending become a filter tab bar and a sidebar section on that page rather than separate routes.

Sourcing is layered so the page is never empty:

1. **NewsData.io** — primary. 200 credits/day free, real India coverage, category and language support.
2. **RSS fallback** — no key, no quota. The Hindu, Indian Express, NDTV, Mint. Used when the API errors or returns 429.
3. **KV cache** — 20-minute TTL on top headlines, keeping daily API usage near 70–100 calls regardless of traffic.

The Sensex/Nifty ticker is wired to Yahoo Finance's public quote endpoint (`^BSESN`, `^NSEI`, no key). **If the fetch fails, the ticker hides itself.** It must never show stale or invented numbers.

Existing weather and reverse-geocoding in `MastheadInfoStrip.astro` (Open-Meteo, BigDataCloud) already work against real APIs and are kept as-is.

Every "AI Verified" badge is removed from articles the system has not actually verified.

### Interface 2 — Fact Check (`/verify`)

A single endpoint, `POST /api/factcheck`, replacing both `api/verify.ts` and `api/v1/verify/claim.ts`.

Three stages, short-circuiting on the first confident result:

1. **Google Fact Check Tools API** (`GOOGLE_FACTCHECK_API_KEY`). Searches claims already reviewed by certified fact-checkers — Boom Live, Alt News, Factly, PolitiFact, Snopes. A hit yields a real verdict attributable to a named publisher with a link to the review. This is the highest-value stage and covers the viral-misinformation case the site targets.
2. **Web grounding** when stage 1 has no match. Retrieves current article snippets. Provider decision below.
3. **Cloudflare Workers AI** (`AI` binding, free tier) reasons over the retrieved snippets to produce a verdict.

#### Verdict contract

Verdicts are constrained to exactly four values:

- `verified`
- `misleading`
- `false`
- `insufficient_evidence`

Rules that are not negotiable:

- Every citation in a response must correspond to a document actually fetched during that request. No static citation strings.
- No confidence score is emitted unless it is derived from retrieved evidence. The hardcoded `0.95` is deleted.
- When stages 1 and 2 return nothing usable, the verdict is `insufficient_evidence`. The system never falls back to `verified`.
- Stage-3 results are labelled in the UI as an AI assessment, visually distinct from a stage-1 certified fact-check.

#### Input modes

The widget currently shows five tabs, four of which have no click handlers at all.

- **Text/Claim** — works today, kept.
- **Article URL** — implemented: fetch the URL, extract readable text, run the pipeline against it.
- **Image/Screenshot** — implemented via Workers AI vision to extract text, then the standard pipeline.
- **PDF** — removed.
- **Voice** — removed; duplicates the text box.

Tab switching JS is written for the three surviving tabs.

## Deletions

Routes and components:
`admin.astro`, `profile.astro`, `settings.astro`, `saved.astro`, `news.astro` (merged into `/`), `categories.astro`, `trending.astro`, `faq.astro`, all of `src/pages/api/v1/auth/`, `src/pages/api/verify.ts`, `src/pages/api/v1/verify/claim.ts`, the auth modal in `Navbar.astro`, and the orphaned `IndianLanguageHub.astro`, `MultilingualAudioPlayer.astro`, `SocialStudio.astro` (~1300 lines, imported by nothing).

Directories: `backend/`, `database/`, `k8s/`, `Dockerfile`, `docker-compose.yml`. Recoverable from git history.

Kept in footer: About, Contact, Privacy, Terms — required for AdSense and legal compliance.

Nav becomes: **News** · **Fact Check**.

## Other fixes

- `contact.astro` currently calls `preventDefault()` and shows an `alert()`, discarding the message. Either wire it to a real handler or remove the form. Decision: remove the form, show a mailto link. No mail provider is configured and adding one is out of scope.
- `.github/workflows/deploy.yml` runs `astro check || true` and `pytest || true`, so failures never fail the build, and it contains no deploy step. Fix: drop `|| true`, drop the Python job, add `wrangler deploy`.
- Purge stale branding: `HeadlineHub` (workflow name, k8s manifests, admin title), `UncosHub` (`.env.example` header, `uncoshub_*` localStorage keys), `printnewz_*` localStorage fallbacks.
- Replace root `.env.example` (which describes the deleted Python backend) with `.dev.vars.example` listing the Worker's actual variables.

## Secrets

Set via `wrangler secret put <NAME>` or the dashboard. Never committed.

| Name | Source | Free tier |
| --- | --- | --- |
| `NEWSDATA_API_KEY` | newsdata.io | 200 credits/day |
| `GOOGLE_FACTCHECK_API_KEY` | Google Cloud → Fact Check Tools API | free, no billing account required |

Workers AI requires no key, only the `AI` binding in `wrangler.jsonc`.

Note: secrets cannot be added until `output: 'server'` ships. That fix is a prerequisite, not a parallel task.

## Open decision

**Stage-2 search provider.** The Cloudflare account token carries a `websearch.run` scope, suggesting a native Workers web-search binding is available. If confirmed workable, it replaces Tavily entirely — no third-party signup, no 1,000/month cap, same platform. Otherwise fall back to Tavily (1,000 searches/month, no credit card). To be resolved during implementation against current Cloudflare docs; the pipeline is written against a thin `search(query)` interface so the provider is swappable.

## Error handling

- News API failure or 429 → RSS fallback → last cached KV payload → empty state with an honest message. Never a fabricated article.
- Fact-check stage failures degrade down the chain; total failure returns `insufficient_evidence` with an explanation, never a guess.
- Ticker fetch failure → ticker hidden.
- Rate limit on `/api/factcheck` via KV, keyed by IP, to protect the free API quotas.

## Verification

Work is not complete until all of the following are observed against the deployed Worker:

1. `dist/server/` is non-empty after `astro build`.
2. `POST /api/factcheck` returns `200` with a JSON body — not `405`.
3. `wrangler secret put` succeeds and the dashboard accepts variables.
4. A known-false claim ("COVID vaccines contain microchips") returns `false` or `misleading` with a citation URL that resolves.
5. An obscure unverifiable claim returns `insufficient_evidence`, not `verified`.
6. The home page shows articles whose headlines change between builds, proving they are fetched rather than hardcoded.
7. `/admin`, `/profile`, `/settings`, `/saved` return 404.
8. Dead endpoints `/api/v1/tts` and `/api/v1/factcheck/*/chat` are no longer referenced by any client script.

## Domain

`newzwale.com` is not owned yet; the user plans to buy it once the site works. Until then `site` in `astro.config.mjs` points at `https://newzwale.editall.workers.dev`. Switching later is a one-line change plus a Cloudflare custom-domain binding.
