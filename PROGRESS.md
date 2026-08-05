# PROGRESS.md

This is the handoff log. Read it before starting work, regardless of which
model or agent you are. Update it when you finish a task, hit a stopping
point, or are about to run out of context — so the next agent (possibly a
different model) can continue without the user re-explaining anything.

Full task list and rationale: `docs/superpowers/plans/2026-08-05-newzwale-rebuild.md`

---

## Status

- **Branch:** `rebuild/two-interface` (PR #3 merged to `main`; PR #4 open with the CI token fix, CI green, awaiting merge)
- **Last commit:** `9d3ccbe` — "fix: recolor favicons to brand coral and fix accessibility gaps"
- **Deployed:** yes, live at https://newzwale.editall.workers.dev (Version ID `d4aad4b6-1f74-4ec8-ab33-2315467ca38e`)
- **Plan progress:** Phases 0–5 done (Tasks 1–21). Task 21 checklist run against production — **7 of 8 checks pass**. One partial: fact-check stage 2 (see below).

**Next task:** Nothing blocking. Optional follow-ups listed under "Deferred".
The one open item needing a decision is fact-check stage 2 (web search) — see
below. Everything else is working in production.

### Task 21 checklist results (run 2026-08-05 against production)

| # | Check | Result |
| --- | --- | --- |
| 1 | `ls dist/server` non-empty | pass |
| 2 | `POST /api/factcheck` returns 200 not 405 | pass |
| 3 | `wrangler secret list` correct names only | pass — `NEWSDATA_API_KEY`, `GOOGLE_FACTCHECK_API_KEY` |
| 4 | "COVID vaccines contain microchips" | pass — `false`, `basis: certified`, cites FactCheck.org, URL resolves 200 |
| 5 | The goats claim | pass — `insufficient_evidence` |
| 6 | Home page headlines live | pass — NewsData.io serving (hash IDs, images, `category` respected) |
| 7 | `/admin`, `/profile`, `/settings`, `/saved` | pass — all 404 |
| 8 | grep for `api/v1/tts` / `factcheck/*/chat` | pass — no output |

Local: `npm test` 99/99 pass, `npx astro check` 0 errors, CI green on PR #4.

### ⚠️ Fact-check stage 2 (web search) is unavailable on this Cloudflare account

The `WEBSEARCH` binding throws `Error: account_disabled` on every call
(confirmed via `wrangler tail`; logged rather than swallowed as of `e364bdf`).
This is an **account entitlement** issue, not a code bug or a missing secret —
the API token carries the `websearch.run` scope and wrangler's config schema
accepts the binding, but Cloudflare Web Search does not appear in the public
bindings documentation, so it looks not-generally-available on this account.

**Practical effect on the pipeline:**
- Stage 1 (Google Fact Check Tools) — **working**. Claims that a published
  fact-checker has reviewed get a real verdict with a real citation.
- Stage 2 (web search retrieval) — **dead**, returns `[]` every time.
- Stage 3 (Workers AI over retrieved passages) — **never reached**, because
  stage 2 supplies no passages.

So a claim with no published fact-check always returns `insufficient_evidence`.
That is honest behaviour (it never guesses), but it means the AI-assessment
path is effectively unexercised in production.

**To close this, pick one:**
1. Enable Web Search on the Cloudflare account (dashboard — may need a beta
   opt-in or a plan change). Nothing in the code needs to change if this works.
2. Switch the provider to Tavily per the plan's Task 16 alternative: sign up at
   tavily.com, `npx wrangler secret put TAVILY_API_KEY`, and rewrite the body of
   `search()` in `src/lib/factcheck/search.ts` (the interface is deliberately
   provider-agnostic, so only that one function body and its test change).

---

## What's built

- SSR on Cloudflare Workers (`output: 'server'`), KV cache (`NEWZ_CACHE`), Workers AI binding, Google Fact Check + NewsData secrets set in production.
- `/api/news` — NewsData.io with RSS fallback, KV-cached with stale-on-error.
- `/api/factcheck` — 3-stage pipeline: Google Fact Check Tools → web search → Workers AI reasoning over fetched article text. Never guesses; unmatched or unclear claims return `insufficient_evidence`, not a soft "verified".
- `/api/ticker` — live Sensex/Nifty; the masthead strip hides itself on failure instead of showing stale/invented numbers.
- `/verify` (fact-check widget) — 3 tabs (Text, URL, Image disabled/"coming soon"), all wired to `/api/factcheck`. Renders all 4 verdicts distinctly plus a certified/AI-assessment basis notice. No fake confidence score, no dead chat UI.
- Homepage ticker and SEO copy now describe only real features (live NewsData.io headlines, the 3-stage fact-check pipeline) — no more Sarvam AI, 10-language, or "grounded chat" claims.
- CI (`.github/workflows/deploy.yml`) actually gates on `npm test`, `npx astro check`, `npm run build` — no more `|| true`, no dead pytest job.
- Auth (`btoa(email)` sessions), the unguarded `/admin`, and the undeployed FastAPI backend are deleted.

## Known gotchas (read before touching these areas)

- Workers AI model id `@cf/meta/llama-3.1-8b-instruct` is deprecated on the live binding; the endpoint uses `-fp8` instead. Comment explaining this is in `src/pages/api/factcheck.ts`.
- The fact-check system prompt is deliberately verbose about grading the CLAIM, not the evidence passages — a terser version was verified (against the live model) to flip verdicts on debunked claims (`false` → `verified`). Re-test both directions before editing that prompt.
- `Response.json()` resolves to `unknown` project-wide (Cloudflare Workers types override `lib.dom`), not `any`. Cast it explicitly (`as { ... }`) or `astro check` fails — this is now a required CI gate.
- `DECISIONS.md` at the repo root is **stale** — it describes the pre-rebuild architecture (Sarvam AI voice, `/admin`, grounded chat, FastAPI/Postgres). None of that reflects the current codebase. Don't use it as a source of truth; it needs a rewrite or deletion (not yet done).
- `normalizeRating()` vs `coerceVerdict()` in `src/lib/factcheck/verdict.ts` are not interchangeable — the first parses human ratings like "Pants on Fire", the second validates an already-typed `Verdict` enum value. Mixing them up silently breaks unknown-claim handling.

## Deferred / not built

- Custom domain (`newzwale.com` not yet owned).
- Image/screenshot OCR tab — UI exists, disabled with "coming soon"; no backend wiring.
- `DECISIONS.md` still needs its rewrite or deletion (see gotchas).
- Navbar language selector writes `userLanguage` to localStorage and fires a `language-changed` event, but nothing translates — only the masthead date listens. The control implies multilingual support the site does not have. Either wire real i18n or drop the selector.
- Keyboard arrow-key navigation between fact-check tabs (roving tabindex) is not implemented; tabs are reachable by Tab and activate on Enter/Space, which is workable but not the full ARIA tabs pattern.

---

## Handoff protocol

1. On starting: read this file, then run `git log --oneline -10` and `git status` to confirm nothing changed since this was last updated.
2. On finishing a task, or before stopping (context limit, model switch, end of session): update **Status** and **Next task** above with the real state — which commit you're at, what's done, what's half-done. If you stopped mid-task rather than at a clean commit, say so explicitly; don't let a stale "Next task" imply the last commit is further along than it is.
3. Keep entries factual and current — this file describes *now*, not history. Delete/replace stale gotchas rather than accumulating them.
