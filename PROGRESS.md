# PROGRESS.md

This is the handoff log. Read it before starting work, regardless of which
model or agent you are. Update it when you finish a task, hit a stopping
point, or are about to run out of context — so the next agent (possibly a
different model) can continue without the user re-explaining anything.

Full task list and rationale: `docs/superpowers/plans/2026-08-05-newzwale-rebuild.md`

---

## Status

- **Branch:** `rebuild/two-interface`
- **Last commit:** `e364bdf` — "fix: log WEBSEARCH binding failures instead of swallowing them"
- **Deployed:** yes, live at https://newzwale.editall.workers.dev (Version ID `fc1cae01-66c4-4995-a716-2a8b201bfcdd`)
- **Plan progress:** Phases 0–4 done (Tasks 1–20). Task 21 (verification) run — deploy succeeded, code-level checks pass, but **two production evidence sources are dead**. See below. Not fixable from code; needs the user to act.

**Next task:** Get the fact-check pipeline's evidence sources actually
working in production (see "🔴 Blocking" below), then redo the Task 21
checklist claim tests (`COVID vaccines contain microchips` should return
`false`/`misleading` with a real citation — right now it returns
`insufficient_evidence` because there is no evidence to check it against,
not because the pipeline logic is wrong).

### 🔴 Blocking — production fact-check has no evidence sources

`npx wrangler secret list` on the deployed Worker returns `[]` — empty.
Confirmed via `wrangler tail` during a live request:

- **`GOOGLE_FACTCHECK_API_KEY` was never set.** Stage 1 (certified fact-checker
  lookup) is silently skipped for every claim (code already handles a missing
  key gracefully — see `src/pages/api/factcheck.ts`).
- **`NEWSDATA_API_KEY` was never set.** `/api/news` runs entirely on the RSS
  fallback (works, confirmed live — but no NewsData.io content, and RSS
  ignores the `category` param).
- **The `WEBSEARCH` binding throws `account_disabled` on every call**, caught
  and logged (as of `e364bdf`) rather than silently swallowed as before. This
  is a Cloudflare account entitlement issue, not a code bug — the API token
  carries the `websearch.run` scope, but the account itself isn't enrolled.
  This needs checking in the Cloudflare dashboard, or the search provider
  needs to move to Tavily (`src/lib/factcheck/search.ts` docs the earlier
  Task 16 decision to use the native binding instead — that decision may need
  revisiting if Web Search stays unavailable on this account).

**Net effect:** with all three sources down, `/api/factcheck` can only ever
return `insufficient_evidence` right now — not because anything is broken
logically (unit tests all pass, the pipeline correctly reports "nothing to
check against"), but because there is genuinely nothing to check against in
production. This is a config/account problem, not a code problem.

**What the user needs to do (I can't do these — account creation and
dashboard/plan changes are outside what I can act on):**
1. Get a NewsData.io API key, then `npx wrangler secret put NEWSDATA_API_KEY`.
2. Get a Google Fact Check Tools API key (Google Cloud Console), then `npx wrangler secret put GOOGLE_FACTCHECK_API_KEY`.
3. Check the Cloudflare dashboard for why Web Search is `account_disabled` for this account — may need a beta opt-in, or a plan that supports it. If it can't be enabled, fall back to Tavily per the plan's Task 16 alternative (needs a `TAVILY_API_KEY` secret and a small rewrite of `search.ts`).

---

## What's built

- SSR on Cloudflare Workers (`output: 'server'`), KV cache (`NEWZ_CACHE`), Workers AI binding, Google Fact Check + web search secrets.
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

---

## Handoff protocol

1. On starting: read this file, then run `git log --oneline -10` and `git status` to confirm nothing changed since this was last updated.
2. On finishing a task, or before stopping (context limit, model switch, end of session): update **Status** and **Next task** above with the real state — which commit you're at, what's done, what's half-done. If you stopped mid-task rather than at a clean commit, say so explicitly; don't let a stale "Next task" imply the last commit is further along than it is.
3. Keep entries factual and current — this file describes *now*, not history. Delete/replace stale gotchas rather than accumulating them.
