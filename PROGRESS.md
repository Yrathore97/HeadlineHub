# PROGRESS.md

This is the handoff log. Read it before starting work, regardless of which
model or agent you are. Update it when you finish a task, hit a stopping
point, or are about to run out of context — so the next agent (possibly a
different model) can continue without the user re-explaining anything.

Full task list and rationale: `docs/superpowers/plans/2026-08-05-newzwale-rebuild.md`

---

## Status

- **Branch:** `claude/news-website-redesign-c3de89` (worktree at `.claude/worktrees/news-website-redesign-c3de89`)
- **Plan:** `docs/superpowers/plans/2026-08-05-categories-language-pagination.md`
- **Spec:** `docs/superpowers/specs/2026-08-05-categories-language-pagination-design.md`
- **Deployed:** NOT deployed. All work below is local and uncommitted to `main`.
- **Local verification:** `npm test` 131/131 pass, `npx astro check` 0 errors, `npm run build` completes.

**Progress on the categories/language/pagination plan: 16 of 20 tasks done.**

Done: category allowlist, language list, paginated data layer, cache key v2,
feed helpers, `/api/news` params, ArticleCard, NewsFeed props, category pages,
navbar category strip, functional language selector, CategoryRail, LeadStory,
new homepage composition, Tavily fact-check swap.

### ⛔ Blocked — needs the user, not an agent

| Task | Blocker |
| --- | --- |
| Task 1 (API verification spike) | `.dev.vars` exists but `NEWSDATA_API_KEY=` is EMPTY. Needs the real key. |
| Task 10 (Load more button) | Gated on Task 1 — we do not yet know whether the free tier returns a usable `nextPage` token. The button markup exists and stays hidden while `nextPage` is null, so nothing is broken; the click handler is simply not written yet. |
| Task 19 (fact-check end-to-end test) | Needs `TAVILY_API_KEY`. Sign up at tavily.com, then `npx wrangler secret put TAVILY_API_KEY` for prod and add it to `.dev.vars` for local. |

### ⚠️ What could NOT be verified locally, and why

The local `.dev.vars` has an empty `NEWSDATA_API_KEY`, so `/api/news` served the
English RSS fallback for every request during development. RSS has no category
support, no images, and no pagination. Consequently these remain **unverified
against real data**:

- Whether each category actually returns distinct articles.
- Whether the lead story renders correctly with an image (RSS gives none, so the
  imageless fallback path is what was exercised).
- Whether `?language=hi` returns genuinely Hindi headlines. The plumbing is
  verified — URL, param validation, server-rendered `selected` option, and the
  masthead date correctly re-localising to `बुध, 5 अग॰ 2026` — but the headline
  text itself stayed English because the upstream call never had a key.
- Pagination end to end.

On the homepage with RSS data, all four category rails select the same trailing
articles (40 card nodes, 26 unique ids). That is the RSS artifact, not a dedup
bug — lead-vs-rest dedup was verified to have zero overlap. Re-check this once a
real key is in place.

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

### Fact-check stage 2: switched from Cloudflare Web Search to Tavily

**Resolved in code, not yet proven live.** The old `WEBSEARCH` binding threw
`Error: account_disabled` on every call — an account entitlement problem, not a
code bug. Stage 2 returned `[]` every time, stage 3 never ran, and any claim
without a published fact-check came back `insufficient_evidence`.

`search()` in `src/lib/factcheck/search.ts` now posts to Tavily instead. The
`SearchHit` interface is unchanged, so stages 1 and 3 were untouched — the diff
to `src/pages/api/factcheck.ts` is 5 lines, all inside stage 2. The `websearch`
binding is removed from `wrangler.jsonc`.

Tavily is also better evidence: its `content` field is a query-relevant extract,
whereas Web Search only ever returned the page-level meta description.

**Still to do (Task 19):** set `TAVILY_API_KEY` and confirm against the live
model that (a) a claim with a published fact-check still returns `false` with a
citation, (b) a claim WITHOUT one now returns a real verdict plus evidence
instead of `insufficient_evidence`, and (c) a nonsense claim still refuses to
guess. Until that runs, the fix is unproven in production.

**Do not restore the Cloudflare binding** without first confirming it works on
the account — that history is recorded in the comment at the top of `search.ts`
so it does not get re-litigated.

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
- Site UI translation. The language selector now fetches news content in the
  chosen language (real, not cosmetic), but the interface chrome — nav labels,
  buttons, "Read at source" — stays English by design. The control's `title`
  says so explicitly rather than over-promising.
- In-site article reading. Headlines still link out to the publisher; hosting
  article bodies is a licensing question, not an engineering one.
- Keyboard arrow-key navigation between fact-check tabs (roving tabindex) is not implemented; tabs are reachable by Tab and activate on Enter/Space, which is workable but not the full ARIA tabs pattern.

---

## Handoff protocol

1. On starting: read this file, then run `git log --oneline -10` and `git status` to confirm nothing changed since this was last updated.
2. On finishing a task, or before stopping (context limit, model switch, end of session): update **Status** and **Next task** above with the real state — which commit you're at, what's done, what's half-done. If you stopped mid-task rather than at a clean commit, say so explicitly; don't let a stale "Next task" imply the last commit is further along than it is.
3. Keep entries factual and current — this file describes *now*, not history. Delete/replace stale gotchas rather than accumulating them.
