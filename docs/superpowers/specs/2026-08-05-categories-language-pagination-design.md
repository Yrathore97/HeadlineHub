# NewzWale: Categories, Pagination, Language, and Fact-Check Repair

**Date:** 2026-08-05
**Status:** Approved, ready for planning
**Supersedes nothing.** Builds on `2026-08-05-newzwale-rebuild-design.md`.

## Problem

The site works but reads like a demo:

1. **No category browsing.** Every visitor sees the same undifferentiated feed. There
   is no way to say "show me sports" and no page to land on for a topic.
2. **A fixed, small number of headlines.** `NewsFeed.astro` caps at 24 cards and
   `/api/news` requests exactly one upstream page. NewsData.io's free tier returns
   10 articles per request, so the real ceiling is likely ~10 — the cap is not the
   binding constraint, the missing pagination is.
3. **A language selector that does nothing.** The navbar offers 13 Indian languages,
   writes the choice to `localStorage`, fires a `language-changed` event, and nothing
   listens except the masthead date. The control promises multilingual news the site
   does not deliver.
4. **Fact-check returns `insufficient_evidence` for almost everything.** Root cause is
   known and confirmed: the Cloudflare `WEBSEARCH` binding throws `account_disabled`
   on every call, so stage 2 retrieves nothing and stage 3 never runs.

## Goals

- A reader can pick a topic and browse a full page of headlines for it.
- A reader can keep loading more headlines instead of hitting a wall.
- The language selector returns real in-language headlines.
- Fact-check produces real verdicts for claims no published fact-checker has covered.
- The homepage reads like a news front page, not a uniform grid.

## Non-goals

- **In-site article reading.** Headlines continue to link out to the publisher.
  Republishing article bodies is a licensing question, not an engineering one.
- **UI translation.** Site chrome (nav, buttons, labels) stays English. Only the
  *news content* changes language. Translating the interface is a separate project.
- **Changing the design system.** Colours, typography, spacing, and radii in
  `DESIGN.md` / `global.css` are unchanged. `tests/contrast.test.ts` must keep passing
  without modification.
- **A custom domain, image OCR, or user accounts.** Still deferred.

## Key constraint: NewsData.io free tier

The free plan returns **10 articles per request** and paginates with an opaque
`nextPage` token, passed back as `&page=<token>`. Historically some NewsData plans
have restricted pagination to paid tiers.

**Phase 1 must verify, against the live key, before anything is built on it:**

- How many articles come back per request.
- Whether the response carries a usable `nextPage` token.
- Which of the 13 advertised languages actually return results for India.
- Which of the 8 chosen categories actually return results.

**If `nextPage` is unavailable on the current plan**, the fallback is to build the
homepage by fanning out across categories in parallel (one request per category,
deduplicated by URL) rather than paginating a single feed. Category pages would then
show one page of results with no "Load more" button, and the button is not rendered
rather than rendered-and-broken. Record the finding in `PROGRESS.md` either way.

## Architecture

### Data layer

`fetchNewsData` gains options and returns a pagination token:

```ts
interface NewsPage {
  articles: Article[];
  nextPage: string | null;
}

fetchNewsData(
  apiKey: string,
  opts: { category?: string; language?: string; page?: string },
): Promise<NewsPage>
```

`normalizeNewsData` keeps its current signature and returns `Article[]`; the caller
reads `nextPage` off the raw response. Existing tests for `normalizeNewsData` are
unaffected.

`fetchRssFallback` returns `{ articles, nextPage: null }` — the RSS feeds are
English-only and unpaginated. When a non-English language is requested and NewsData
fails, RSS still serves English rather than nothing; the UI does not claim the
results are in the requested language.

### API route

`/api/news` accepts three query params:

| Param | Values | Default |
|---|---|---|
| `category` | one of the 8 allowed slugs | `top` |
| `language` | one of the verified language codes | `en` |
| `page` | opaque NewsData token | none |

Unrecognised `category` or `language` values fall back to the default rather than
being forwarded upstream. `page` is passed through as an opaque string.

Response shape becomes `{ articles: Article[], nextPage: string | null }`.

**Cache key changes from `news:v1:{category}` to `news:v2:{category}:{language}:{page}`.**
This is not optional: the current key ignores language, so the first Hindi request
would be served cached English. The version bump to `v2` avoids reading stale
`v1` entries written under the old shape.

TTL stays 20 minutes; `cached()` and its stale-on-error behaviour are unchanged.

### Categories

Eight categories, fixed in one exported allowlist:

| Slug | Label | NewsData category |
|---|---|---|
| `top` | Top | *(omitted — the API's default)* |
| `india` | India | `politics` + `country=in` |
| `world` | World | `world` |
| `business` | Business | `business` |
| `sports` | Sports | `sports` |
| `entertainment` | Entertainment | `entertainment` |
| `technology` | Technology | `technology` |
| `health` | Health | `health` |

The `india` mapping is a guess to be confirmed in Phase 1 — NewsData has no `india`
category, and the whole feed is already `country=in`. If `politics` proves a poor fit,
either remap it or drop the tab; do not ship a tab that duplicates `top`.

Route: `src/pages/category/[slug].astro`. The slug is validated against the allowlist
and an unknown slug returns a 404, so a user-supplied value never reaches the upstream
API. Nav renders the 8 links on desktop and in the mobile drawer, with `aria-current="page"`
on the active one.

### Shared feed component

`NewsFeed.astro` is currently doing three jobs: fetching, filtering/sorting, and
rendering. Split it so the homepage and category pages share behaviour:

- `src/lib/news/feed.ts` — the URL-safety filter, the newest-first sort, and
  `formatPublished`. Pure functions, unit-testable, no Astro import.
- `src/components/ArticleCard.astro` — one card. Used by the grid, the rails, and
  (at a larger size, via a prop) the lead story.
- `src/components/NewsFeed.astro` — the grid plus the Load more button. Takes
  `category` and `language` props.

This is targeted: it exists because three surfaces now render the same card, not as
speculative refactoring.

### Load more

The button sits below the grid and holds the current `nextPage` token in a data
attribute. On click it fetches `/api/news?category=…&language=…&page=<token>`,
appends the new cards, and updates the token. When `nextPage` comes back `null`,
the button is removed and replaced with an end-of-feed note.

The button is a real `<button>`, disabled with visible "Loading…" text while a request
is in flight. New cards are appended to the existing grid so keyboard focus order stays
natural. A failed fetch shows an inline retry message and does not clear what is already
on screen.

Card markup is built client-side from the JSON response. It must produce the same
structure as the server-rendered card, and must set text via `textContent` (never
`innerHTML`) so a hostile headline cannot inject markup.

### Homepage layout

```
[ Masthead / ticker            ]  unchanged
[ Hero: lead story, large      ]  first article with an image
[ 3 secondary stories          ]
[ Category rail: Sports    → ] }
[ Category rail: Business  → ] }  4 rails, 4 cards each,
[ Category rail: Technology→ ] }  each linking to its category page
[ Category rail: Health    → ] }
[ Main grid + Load more        ]
[ SEO content section          ]  unchanged
```

Rails fetch in parallel. A rail whose category returns nothing is not rendered — an
empty rail is worse than an absent one. If the lead story slot has no article with an
image, it falls back to the newest article without one rather than leaving a hole.

All of this uses existing tokens: `surface-elevated` cards, `hairline` borders,
`primary` decorative accents, `primary-strong` for anything textual. No new colours,
so no new contrast assertions.

### Language

The navbar `<select>` keeps its markup and its `localStorage` persistence. What
changes is that something now listens: choosing a language navigates to the current
path with `?language=<code>` so the server re-renders with in-language content.
Server-side rendering (rather than a client refetch) keeps the choice in the URL,
which makes it shareable and survives a reload.

The advertised language list narrows to codes verified to return results in Phase 1.
A language that returns nothing is removed from the dropdown, not left in to disappoint.

The selector gets a short label clarifying it switches *news* language, not interface
language — the current control implies more than it will deliver.

### Fact-check

Only the body of `search()` in `src/lib/factcheck/search.ts` changes. The `SearchHit`
interface, and therefore every caller in `src/pages/api/factcheck.ts`, stays as-is —
this is exactly the provider swap the module was designed for.

```ts
// POST https://api.tavily.com/search
// { api_key, query, max_results: 5, search_depth: "basic" }
// → { results: [{ title, url, content }] }
export async function search(apiKey: string, query: string): Promise<SearchHit[]>
```

Notable improvement: Tavily's `content` is a query-relevant extract, whereas
Cloudflare Web Search only ever returned the page-level meta description. That is
strictly better grounding for stage 3, and it means the `fetchArticleText` fallback
in `factcheck.ts` matters less (it stays, since a full page still beats an extract).

The signature changes from `search(binding, query)` to `search(apiKey, query)`. The
`websearch` binding is removed from `wrangler.jsonc` and the long comment block in
`search.ts` explaining the Cloudflare choice is replaced with a short note on why
Tavily, including the `account_disabled` history so nobody re-litigates it.

Stages 1 and 3 are untouched. **The system prompt in `factcheck.ts` must not be
edited** — `PROGRESS.md` records that a terser version flipped `false` to `verified`
on debunked claims when measured against the live model.

**Secret handling:** `TAVILY_API_KEY` is set by the user via
`npx wrangler secret put TAVILY_API_KEY`, and added to `.dev.vars.example` as a
placeholder name only. No key value is ever written into the repo, into a commit,
or into an agent transcript.

If the key is absent, `search()` returns `[]` and logs once — the same graceful
degradation as today, producing `insufficient_evidence` rather than a crash.

## Error handling

| Failure | Behaviour |
|---|---|
| NewsData fails | RSS fallback, then KV stale copy, then empty state |
| A category returns nothing | Category page shows an empty state; homepage rail is omitted |
| A language returns nothing | Falls back to English with a visible note |
| Load more fetch fails | Inline retry message; existing cards stay |
| `nextPage` is null | Button replaced with an end-of-feed note |
| Tavily fails or key missing | `search()` returns `[]`; fact-check reports `insufficient_evidence` |
| Unknown category slug | 404 |

The through-line: never invent content, never silently show stale data as fresh, and
never let a fact-check failure masquerade as a verdict.

## Testing

New unit tests (Vitest, matching the existing style in `tests/news` and
`tests/factcheck`):

- `normalizeNewsData` extracts `nextPage`, and tolerates its absence.
- The category allowlist rejects unknown and injection-shaped slugs.
- `/api/news` param validation falls back correctly on bad `category` / `language`.
- Cache key includes category, language, and page, and differs across each.
- The feed helpers (URL safety filter, sort, `formatPublished`) — moved, so their
  existing coverage moves with them.
- `parseTavilyResults` maps `results[]` to `SearchHit[]`, and returns `[]` for a
  malformed or empty response.

Unchanged and must still pass: `tests/contrast.test.ts` in full, and the fact-check
verdict tests. `npx astro check` must stay at 0 errors — note that `Response.json()`
resolves to `unknown` in this project, so every parsed response needs an explicit cast.

Manual verification per phase, in the browser preview: category nav works and 404s on
a bad slug; Load more appends and terminates; language switch returns visibly
in-language headlines; a claim with no published fact-check now returns a real verdict
with citations instead of `insufficient_evidence`.

## Phases

| # | Phase | Ships |
|---|---|---|
| 1 | Data layer + API verification | Verified API constraints recorded in `PROGRESS.md`; `fetchNewsData` with category/language/page; `/api/news` params; cache key v2; tests |
| 2 | Categories + nav | `/category/[slug]`, allowlist, 8 nav links, shared feed component split |
| 3 | Pagination | Load more on homepage and category pages |
| 4 | Language | Selector wired to real in-language fetching; list narrowed to verified codes |
| 5 | Homepage layout | Lead story, secondaries, category rails |
| 6 | Fact-check | Tavily swap, binding removal, tests |

Phase 1 gates 2–5 because its findings can change their shape. Phase 6 is independent
and can move earlier on request.

## Risks

- **NewsData free-tier pagination may not exist.** Mitigated by verifying in Phase 1
  and having the category fan-out fallback ready.
- **Rate limits.** The homepage will make several upstream requests per render where
  it made one. KV caching absorbs most of this, but Phase 1 should note the plan's
  daily request cap and confirm the cache TTL keeps usage under it.
- **Some Indian-language feeds may be thin.** Verified in Phase 1; thin languages are
  removed from the dropdown.
- **Tavily free tier is ~1,000 searches/month.** The existing 24h fact-check cache and
  20/IP/hour rate limit already bound this; no new control needed, but usage is worth
  watching.
