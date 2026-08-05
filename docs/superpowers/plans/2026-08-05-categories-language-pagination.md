# Categories, Pagination, Language & Fact-Check Repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let readers browse news by category and language, load more than one page of headlines, and get real fact-check verdicts instead of blanket `insufficient_evidence`.

**Architecture:** Pure helper modules under `src/lib/news/` (category allowlist, language list, feed helpers) stay Astro-free and unit-tested. `/api/news` grows `category`/`language`/`page` params and returns a pagination token. Astro components consume that one endpoint — server-rendered for first paint, client-fetched for "Load more". The fact-check fix is a single function-body swap behind an unchanged interface.

**Tech Stack:** Astro 7 (SSR, `output: 'server'`), Cloudflare Workers, Workers KV, Tailwind v4, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-05-categories-language-pagination-design.md`

---

## Critical conventions (read before Task 1)

These are project-specific and will silently break your work if ignored:

1. **`Response.json()` resolves to `unknown`, not `any`.** Cloudflare Workers types override `lib.dom` project-wide. Every parsed response needs an explicit cast (`as { … }`) or `npx astro check` fails — and that is a required CI gate.
2. **No hardcoded hex in `.astro` files.** Use the design tokens from `DESIGN.md` (`bg-surface-elevated`, `text-ink`, `border-hairline`, …). `src/**/*.astro` currently contains zero hex codes; keep it that way.
3. **`primary` (coral) is decorative only** — 2.8:1, fails WCAG AA. Never put text on it or use it as text. Use `primary-strong` for anything textual.
4. **Cards use `surface-elevated`, never `canvas`.** In dark mode `canvas` is the darkest token, so a card on `bg-canvas` looks recessed.
5. **You almost never need a `dark:` variant.** The CSS variables themselves re-point in dark mode.
6. **`rounded-lg` is 32px here, not Tailwind's stock 8px.** `@theme` overrides the radius scale. Cards/buttons/inputs are `rounded-md` (16px).
7. **Do not edit the fact-check system prompt** in `src/pages/api/factcheck.ts`. A terser version was measured against the live model and flipped `false` → `verified` on debunked claims.
8. **Never write an API key value into the repo, a commit, or a test.** Placeholder names only.

Verification commands used throughout:

```bash
npm test
```

```bash
npx astro check
```

---

## File structure

**Create:**
- `src/lib/news/categories.ts` — the 8-category allowlist, slug→label and slug→upstream-param maps, `isValidCategory`
- `src/lib/news/languages.ts` — supported language codes and display names, `isValidLanguage`
- `src/lib/news/feed.ts` — pure feed helpers: URL safety filter, newest-first sort, `formatPublished`, `prepareArticles`
- `src/components/ArticleCard.astro` — one article card, size variants
- `src/components/CategoryRail.astro` — a horizontal 4-card row for one category
- `src/components/LeadStory.astro` — the homepage hero article
- `src/pages/category/[slug].astro` — the category page
- `tests/news/categories.test.ts`
- `tests/news/languages.test.ts`
- `tests/news/feed.test.ts`

**Modify:**
- `src/lib/news/types.ts` — add the `NewsPage` interface
- `src/lib/news/newsdata.ts` — options object, `nextPage` extraction
- `src/lib/cache.ts` — `newsCacheKey` takes category + language + page, bumps to `v2`
- `src/pages/api/news.ts` — three params, validation, `nextPage` in the response
- `src/components/NewsFeed.astro` — props, shared helpers, Load more
- `src/components/Navbar.astro` — 8 category links, functional language selector
- `src/pages/index.astro` — new homepage composition
- `src/lib/factcheck/search.ts` — Tavily instead of the Cloudflare binding
- `src/pages/api/factcheck.ts` — pass the Tavily key instead of the binding
- `wrangler.jsonc` — remove the dead `websearch` binding
- `.dev.vars.example` — add `TAVILY_API_KEY=` placeholder
- `tests/cache.test.ts` — updated for the new key shape
- `tests/factcheck/search.test.ts` — rewritten for Tavily
- `PROGRESS.md` — handoff log updates

---

## Phase 1 — Verify API constraints, then build the data layer

### Task 1: Verify what NewsData.io actually returns

This is a spike, not TDD. Everything downstream depends on its findings, so it runs first and its results get written down.

**Files:**
- Create: `scripts/verify-newsdata.mjs` (temporary; deleted in Step 5)
- Modify: `PROGRESS.md`

- [ ] **Step 1: Confirm a local API key exists**

```bash
test -f .dev.vars && grep -q 'NEWSDATA_API_KEY=.' .dev.vars && echo "key present" || echo "MISSING: copy .dev.vars.example to .dev.vars and fill NEWSDATA_API_KEY"
```

Expected: `key present`. If it prints MISSING, stop and ask the user to populate `.dev.vars` — do not proceed on assumptions, and do not ask them to paste the key into the chat.

- [ ] **Step 2: Write the verification script**

Create `scripts/verify-newsdata.mjs`:

```js
// Temporary spike. Answers four questions the plan depends on:
//   1. How many articles come back per request?
//   2. Is there a usable nextPage token?
//   3. Which of the 8 categories return results?
//   4. Which of the 13 languages return results?
import { readFileSync } from 'node:fs';

const key = readFileSync('.dev.vars', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('NEWSDATA_API_KEY='))
  ?.slice('NEWSDATA_API_KEY='.length)
  .trim();

if (!key) throw new Error('NEWSDATA_API_KEY missing from .dev.vars');

const call = async (params) => {
  const qs = new URLSearchParams({ apikey: key, country: 'in', ...params });
  const res = await fetch(`https://newsdata.io/api/1/latest?${qs}`);
  const body = await res.json();
  return { status: res.status, body };
};

// Q1 + Q2: page size and pagination token
const first = await call({ language: 'en' });
console.log('--- baseline (country=in, language=en) ---');
console.log('http status :', first.status);
console.log('api status  :', first.body.status);
console.log('results     :', first.body.results?.length ?? 0);
console.log('totalResults:', first.body.totalResults);
console.log('nextPage    :', first.body.nextPage ?? '(none)');

if (first.body.nextPage) {
  const second = await call({ language: 'en', page: first.body.nextPage });
  console.log('--- page 2 ---');
  console.log('http status :', second.status);
  console.log('api status  :', second.body.status);
  console.log('results     :', second.body.results?.length ?? 0);
  console.log('nextPage    :', second.body.nextPage ?? '(none)');
  const firstIds = new Set((first.body.results ?? []).map((r) => r.link));
  const overlap = (second.body.results ?? []).filter((r) => firstIds.has(r.link)).length;
  console.log('overlap w/1 :', overlap, '(0 means pagination genuinely advances)');
}

// Q3: categories
console.log('--- categories ---');
for (const c of ['politics', 'world', 'business', 'sports', 'entertainment', 'technology', 'health']) {
  const r = await call({ language: 'en', category: c });
  console.log(String(c).padEnd(14), r.body.status, (r.body.results?.length ?? 0), r.body.results?.[0]?.title?.slice(0, 50) ?? '');
  await new Promise((s) => setTimeout(s, 1200)); // stay under the rate limit
}

// Q4: languages
console.log('--- languages ---');
for (const l of ['en','hi','bn','mr','te','ta','gu','kn','ml','pa','or','as','ur']) {
  const r = await call({ language: l });
  console.log(String(l).padEnd(4), r.body.status, (r.body.results?.length ?? 0), r.body.results?.[0]?.title?.slice(0, 40) ?? '');
  await new Promise((s) => setTimeout(s, 1200));
}
```

- [ ] **Step 3: Run it**

```bash
node scripts/verify-newsdata.mjs
```

Expected: a readable report. Watch for `api status: error` with a message about the plan — that means the feature is paid-only.

- [ ] **Step 4: Record the findings in `PROGRESS.md`**

Add a section under Status. Fill in the **real** numbers — do not copy this template's example values:

```markdown
### NewsData.io free-tier constraints (verified <date>)

| Question | Answer |
| --- | --- |
| Articles per request | <n> |
| `nextPage` token present | yes / no |
| Page 2 works with that token | yes / no / n-a |
| Categories returning results | <list> |
| Categories returning nothing | <list> |
| Languages returning results | <list> |
| Languages returning nothing | <list> |
| Daily request cap on this plan | <n or unknown> |
```

**Decision gate — read the report before continuing:**
- `nextPage` present and page 2 works → build Load more as planned (Task 10).
- `nextPage` absent or page 2 errors → **skip Task 10**, and instead render no Load more button. Note it in `PROGRESS.md`, tell the user, and rely on the category fan-out for homepage volume.
- Any category returning nothing → drop it from the allowlist in Task 2.
- Any language returning nothing → drop it from the list in Task 3.

- [ ] **Step 5: Delete the script and commit the findings**

```bash
rm scripts/verify-newsdata.mjs
git add PROGRESS.md
git commit -m "docs: record verified NewsData.io free-tier constraints"
```

---

### Task 2: Category allowlist

**Files:**
- Create: `src/lib/news/categories.ts`
- Test: `tests/news/categories.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/news/categories.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CATEGORIES, isValidCategory, upstreamCategory, DEFAULT_CATEGORY } from '../../src/lib/news/categories';

describe('CATEGORIES', () => {
  it('exposes eight categories, each with a slug and a label', () => {
    expect(CATEGORIES).toHaveLength(8);
    for (const c of CATEGORIES) {
      expect(c.slug).toMatch(/^[a-z]+$/);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('leads with the default category', () => {
    expect(CATEGORIES[0].slug).toBe(DEFAULT_CATEGORY);
    expect(DEFAULT_CATEGORY).toBe('top');
  });

  it('has no duplicate slugs', () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('isValidCategory', () => {
  it('accepts every declared slug', () => {
    for (const c of CATEGORIES) expect(isValidCategory(c.slug)).toBe(true);
  });

  it('rejects unknown, empty, and injection-shaped values', () => {
    expect(isValidCategory('bogus')).toBe(false);
    expect(isValidCategory('')).toBe(false);
    expect(isValidCategory('top&apikey=leak')).toBe(false);
    expect(isValidCategory('../../etc/passwd')).toBe(false);
    expect(isValidCategory('TOP')).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
    expect(isValidCategory(42)).toBe(false);
  });
});

describe('upstreamCategory', () => {
  it('returns null for top so the API default applies', () => {
    expect(upstreamCategory('top')).toBeNull();
  });

  it('maps a slug to the upstream category name', () => {
    expect(upstreamCategory('business')).toBe('business');
    expect(upstreamCategory('sports')).toBe('sports');
  });

  it('returns null for anything unknown rather than forwarding it', () => {
    expect(upstreamCategory('bogus')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/news/categories.test.ts
```

Expected: FAIL — cannot find module `src/lib/news/categories`.

- [ ] **Step 3: Implement**

Create `src/lib/news/categories.ts`:

```ts
/** The categories the site offers. This list is the security boundary for the
 *  `category` query param: a value that is not in here never reaches the
 *  upstream API. */
export interface Category {
  /** URL slug, used as /category/<slug>. */
  slug: string;
  /** Nav label. */
  label: string;
  /** NewsData.io category name, or null to use the API's default feed. */
  upstream: string | null;
}

export const DEFAULT_CATEGORY = 'top';

export const CATEGORIES: Category[] = [
  { slug: 'top', label: 'Top', upstream: null },
  // The whole feed is already country=in, so an "India" tab needs its own
  // upstream category or it just duplicates Top. Confirmed against the live
  // API in Task 1; change or drop this if `politics` proved a poor fit.
  { slug: 'india', label: 'India', upstream: 'politics' },
  { slug: 'world', label: 'World', upstream: 'world' },
  { slug: 'business', label: 'Business', upstream: 'business' },
  { slug: 'sports', label: 'Sports', upstream: 'sports' },
  { slug: 'entertainment', label: 'Entertainment', upstream: 'entertainment' },
  { slug: 'technology', label: 'Technology', upstream: 'technology' },
  { slug: 'health', label: 'Health', upstream: 'health' },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function isValidCategory(slug: unknown): slug is string {
  return typeof slug === 'string' && BY_SLUG.has(slug);
}

/** The upstream category name for a slug, or null when the API default should
 *  be used. Unknown slugs also yield null - never a pass-through. */
export function upstreamCategory(slug: unknown): string | null {
  return isValidCategory(slug) ? (BY_SLUG.get(slug)?.upstream ?? null) : null;
}
```

If Task 1 found a category returns nothing, remove that entry now and change the `toHaveLength(8)` assertion to match.

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/news/categories.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/news/categories.ts tests/news/categories.test.ts
git commit -m "feat: add validated news category allowlist"
```

---

### Task 3: Language list

**Files:**
- Create: `src/lib/news/languages.ts`
- Test: `tests/news/languages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/news/languages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LANGUAGES, isValidLanguage, DEFAULT_LANGUAGE } from '../../src/lib/news/languages';

describe('LANGUAGES', () => {
  it('lists English first as the default', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(LANGUAGES[0].code).toBe('en');
  });

  it('gives every language a two-letter code and a non-empty name', () => {
    for (const l of LANGUAGES) {
      expect(l.code).toMatch(/^[a-z]{2}$/);
      expect(l.name.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate codes', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('isValidLanguage', () => {
  it('accepts every declared code', () => {
    for (const l of LANGUAGES) expect(isValidLanguage(l.code)).toBe(true);
  });

  it('rejects unknown, empty, and injection-shaped values', () => {
    expect(isValidLanguage('xx')).toBe(false);
    expect(isValidLanguage('')).toBe(false);
    expect(isValidLanguage('en&country=us')).toBe(false);
    expect(isValidLanguage('EN')).toBe(false);
    expect(isValidLanguage(null)).toBe(false);
    expect(isValidLanguage(undefined)).toBe(false);
    expect(isValidLanguage(7)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/news/languages.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/news/languages.ts`:

```ts
/** News-content languages the site offers. This is NOT interface translation -
 *  the UI chrome stays English; only the headlines change language.
 *
 *  Every code here was verified in Task 1 to actually return results from
 *  NewsData.io for country=in. A language that returns nothing must be removed
 *  rather than left in to disappoint. */
export interface Language {
  code: string;
  name: string;
}

export const DEFAULT_LANGUAGE = 'en';

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिंदी (Hindi)' },
  { code: 'bn', name: 'বাংলা (Bengali)' },
  { code: 'mr', name: 'मराठी (Marathi)' },
  { code: 'te', name: 'తెలుగు (Telugu)' },
  { code: 'ta', name: 'தமிழ் (Tamil)' },
  { code: 'gu', name: 'ગુજરાતી (Gujarati)' },
  { code: 'kn', name: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml', name: 'മലയാളം (Malayalam)' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'or', name: 'ଓଡ଼ିଆ (Odia)' },
  { code: 'as', name: 'অসমীয়া (Assamese)' },
  { code: 'ur', name: 'اردو (Urdu)' },
];

const CODES = new Set(LANGUAGES.map((l) => l.code));

export function isValidLanguage(code: unknown): code is string {
  return typeof code === 'string' && CODES.has(code);
}
```

**Remove any language Task 1 showed returns zero results.**

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/news/languages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/news/languages.ts tests/news/languages.test.ts
git commit -m "feat: add verified news language list"
```

---

### Task 4: `NewsPage` type and `nextPage` extraction

**Files:**
- Modify: `src/lib/news/types.ts`
- Modify: `src/lib/news/newsdata.ts`
- Test: `tests/news/newsdata.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `tests/news/newsdata.test.ts` (keep the existing `normalizeNewsData` describe block as-is):

```ts
import { extractNextPage } from '../../src/lib/news/newsdata';

describe('extractNextPage', () => {
  it('returns the token when present', () => {
    expect(extractNextPage({ nextPage: 'abc123token' })).toBe('abc123token');
  });

  it('returns null when absent, empty, or the wrong type', () => {
    expect(extractNextPage({})).toBeNull();
    expect(extractNextPage({ nextPage: '' })).toBeNull();
    expect(extractNextPage({ nextPage: null })).toBeNull();
    expect(extractNextPage({ nextPage: 42 })).toBeNull();
    expect(extractNextPage(null)).toBeNull();
    expect(extractNextPage(undefined)).toBeNull();
    expect(extractNextPage('nonsense')).toBeNull();
  });
});
```

Update the top import line of the file to include it:

```ts
import { normalizeNewsData, extractNextPage } from '../../src/lib/news/newsdata';
```

(and delete the separate `import { extractNextPage }` line shown above — it was only to show which symbol is new).

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/news/newsdata.test.ts
```

Expected: FAIL — `extractNextPage is not a function`.

- [ ] **Step 3: Add the `NewsPage` type**

Append to `src/lib/news/types.ts`:

```ts
/** One page of results plus the token that fetches the next one.
 *  `nextPage` is null when there is no further page. */
export interface NewsPage {
  articles: Article[];
  nextPage: string | null;
}
```

- [ ] **Step 4: Implement in `newsdata.ts`**

Replace the whole of `src/lib/news/newsdata.ts` with:

```ts
import type { Article, NewsPage } from './types';
import { upstreamCategory } from './categories';
import { DEFAULT_LANGUAGE } from './languages';

const ENDPOINT = 'https://newsdata.io/api/1/latest';

export function normalizeNewsData(raw: any): Article[] {
  const results = Array.isArray(raw?.results) ? raw.results : [];
  return results
    .filter((r: any) => r?.title && r?.link)
    .map((r: any) => ({
      id: String(r.article_id ?? r.link),
      title: String(r.title),
      url: String(r.link),
      summary: String(r.description ?? ''),
      imageUrl: r.image_url ? String(r.image_url) : null,
      source: String(r.source_id ?? 'unknown'),
      category: Array.isArray(r.category) ? String(r.category[0] ?? 'top') : 'top',
      publishedAt: String(r.pubDate ?? ''),
    }));
}

/** NewsData paginates with an opaque token. Anything that is not a non-empty
 *  string means "no further page" - never guess a token. */
export function extractNextPage(raw: any): string | null {
  const token = raw?.nextPage;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export interface FetchNewsOptions {
  /** Site category slug (not the upstream name) - mapped internally. */
  category?: string;
  language?: string;
  /** Opaque token from a previous response's nextPage. */
  page?: string;
}

export async function fetchNewsData(
  apiKey: string,
  opts: FetchNewsOptions = {},
): Promise<NewsPage> {
  const params = new URLSearchParams({
    apikey: apiKey,
    country: 'in',
    language: opts.language ?? DEFAULT_LANGUAGE,
  });

  // upstreamCategory returns null for 'top' and for anything unrecognised, so
  // an unvalidated slug can never be forwarded upstream.
  const upstream = upstreamCategory(opts.category);
  if (upstream) params.set('category', upstream);

  if (opts.page) params.set('page', opts.page);

  const res = await fetch(`${ENDPOINT}?${params}`);
  if (!res.ok) throw new Error(`NewsData ${res.status}`);

  const raw = await res.json();
  return { articles: normalizeNewsData(raw), nextPage: extractNextPage(raw) };
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/news/
```

Expected: PASS, including the pre-existing `normalizeNewsData` tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/news/types.ts src/lib/news/newsdata.ts tests/news/newsdata.test.ts
git commit -m "feat: paginate and parameterise NewsData fetching"
```

---

### Task 5: Cache key includes language and page

**Files:**
- Modify: `src/lib/cache.ts`
- Test: `tests/cache.test.ts`

The current key ignores language, so the first Hindi request would be served cached English. This is a correctness fix, not a nicety.

- [ ] **Step 1: Replace the failing test block**

In `tests/cache.test.ts`, replace the entire `describe('newsCacheKey', …)` block with:

```ts
describe('newsCacheKey', () => {
  it('namespaces by category, language, and page', () => {
    expect(newsCacheKey('business', 'en')).toBe('news:v2:business:en:first');
  });

  it('defaults to the top category in English, first page', () => {
    expect(newsCacheKey()).toBe('news:v2:top:en:first');
  });

  it('gives different languages different keys', () => {
    expect(newsCacheKey('top', 'hi')).not.toBe(newsCacheKey('top', 'en'));
  });

  it('gives different pages different keys', () => {
    expect(newsCacheKey('top', 'en', 'tok2')).toBe('news:v2:top:en:tok2');
    expect(newsCacheKey('top', 'en', 'tok2')).not.toBe(newsCacheKey('top', 'en'));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/cache.test.ts
```

Expected: FAIL — receives `news:v1:business`, expected `news:v2:business:en:first`.

- [ ] **Step 3: Implement**

In `src/lib/cache.ts`, replace the `newsCacheKey` function with:

```ts
/** Cache key for one page of one category in one language.
 *
 *  v2 because v1 keyed on category ONLY - it would serve a Hindi reader the
 *  cached English feed. The version bump also avoids reading v1 entries, which
 *  were written under the old value shape (a bare Article[], not a NewsPage). */
export function newsCacheKey(category = 'top', language = 'en', page?: string): string {
  return `news:v2:${category}:${language}:${page ?? 'first'}`;
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/cache.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache.ts tests/cache.test.ts
git commit -m "fix: key the news cache by language and page, not category alone"
```

---

### Task 6: `/api/news` accepts and validates the new params

**Files:**
- Modify: `src/pages/api/news.ts`

No unit test: this file imports `cloudflare:workers`, which does not resolve under Vitest's node environment. Its logic lives in the already-tested helpers; it is verified in the browser in Step 3.

- [ ] **Step 1: Implement**

Replace the whole of `src/pages/api/news.ts` with:

```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { fetchNewsData } from '../../lib/news/newsdata';
import { fetchRssFallback } from '../../lib/news/rss';
import { cached, newsCacheKey } from '../../lib/cache';
import { isValidCategory, DEFAULT_CATEGORY } from '../../lib/news/categories';
import { isValidLanguage, DEFAULT_LANGUAGE } from '../../lib/news/languages';
import type { NewsPage } from '../../lib/news/types';

const TTL = 20 * 60;

export const GET: APIRoute = async ({ url }) => {
  // Unrecognised values fall back to the default rather than being forwarded
  // upstream - the allowlists are the boundary for user-supplied input.
  const rawCategory = url.searchParams.get('category');
  const category = isValidCategory(rawCategory) ? rawCategory : DEFAULT_CATEGORY;

  const rawLanguage = url.searchParams.get('language');
  const language = isValidLanguage(rawLanguage) ? rawLanguage : DEFAULT_LANGUAGE;

  // Opaque upstream token. Passed through as-is, but bounded so it cannot be
  // used to stuff an unbounded string into a cache key.
  const page = url.searchParams.get('page')?.slice(0, 200) || undefined;

  const apiKey = (env as unknown as { NEWSDATA_API_KEY?: string }).NEWSDATA_API_KEY ?? '';

  const result = await cached<NewsPage>(
    env.NEWZ_CACHE,
    newsCacheKey(category, language, page),
    TTL,
    async () => {
      try {
        const fresh = await fetchNewsData(apiKey, { category, language, page });
        if (fresh.articles.length > 0) return fresh;
        throw new Error('empty');
      } catch {
        // RSS is English-only and unpaginated, so it contributes no nextPage.
        // It is a last resort for the first page only - paging into a fallback
        // that cannot page would return the same articles forever.
        if (page) throw new Error('no further pages');
        const articles = await fetchRssFallback();
        // Throw rather than return [] so cached() can serve its stale copy
        // instead of caching an empty feed for the full TTL.
        if (articles.length === 0) throw new Error('no articles');
        return { articles, nextPage: null };
      }
    },
  );

  return new Response(
    JSON.stringify({
      articles: result?.articles ?? [],
      nextPage: result?.nextPage ?? null,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
```

- [ ] **Step 2: Typecheck**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Verify in the browser**

Start the preview (skip if already running):

```bash
echo "use preview_start with name 'newzwale' — never run the dev server via Bash"
```

Then check each of these returns JSON with a non-empty `articles` array:
- `http://localhost:8787/api/news`
- `http://localhost:8787/api/news?category=sports`
- `http://localhost:8787/api/news?category=bogus` — must behave like the default, not error
- `http://localhost:8787/api/news?language=hi` — headlines should be visibly Devanagari
- `http://localhost:8787/api/news?category=top&language=en&page=<token from the first response>` — different articles

Use `read_network_requests` or `javascript_tool` with `fetch(...).then(r => r.json())` to inspect the bodies.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/news.ts
git commit -m "feat: accept category, language and page params on /api/news"
```

---

### Task 7: Extract the pure feed helpers

**Files:**
- Create: `src/lib/news/feed.ts`
- Test: `tests/news/feed.test.ts`

Three surfaces (homepage grid, rails, category pages) are about to render the same list, so the filtering/sorting logic currently inlined in `NewsFeed.astro` moves somewhere testable. This is targeted, not speculative.

- [ ] **Step 1: Write the failing test**

Create `tests/news/feed.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSafeUrl, prepareArticles, formatPublished } from '../../src/lib/news/feed';
import type { Article } from '../../src/lib/news/types';

const article = (over: Partial<Article> = {}): Article => ({
  id: 'id',
  title: 'A headline',
  url: 'https://example.com/a',
  summary: '',
  imageUrl: null,
  source: 'src',
  category: 'top',
  publishedAt: '2026-08-05 09:00:00',
  ...over,
});

describe('isSafeUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeUrl('https://example.com/a')).toBe(true);
    expect(isSafeUrl('http://example.com/a')).toBe(true);
  });

  it('rejects javascript, data, and malformed URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('not a url')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });
});

describe('prepareArticles', () => {
  it('drops entries with an unsafe url, no url, or no title', () => {
    const out = prepareArticles([
      article({ url: 'javascript:alert(1)' }),
      article({ url: '' }),
      article({ title: '' }),
      article({ url: 'https://ok.com/1' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://ok.com/1');
  });

  it('sorts newest first', () => {
    const out = prepareArticles([
      article({ id: 'old', url: 'https://a.com/1', publishedAt: '2026-08-01 09:00:00' }),
      article({ id: 'new', url: 'https://a.com/2', publishedAt: '2026-08-05 09:00:00' }),
      article({ id: 'mid', url: 'https://a.com/3', publishedAt: '2026-08-03 09:00:00' }),
    ]);
    expect(out.map((a) => a.id)).toEqual(['new', 'mid', 'old']);
  });

  it('treats an unparseable date as oldest rather than throwing', () => {
    const out = prepareArticles([
      article({ id: 'bad', url: 'https://a.com/1', publishedAt: 'not a date' }),
      article({ id: 'good', url: 'https://a.com/2', publishedAt: '2026-08-05 09:00:00' }),
    ]);
    expect(out[0].id).toBe('good');
  });

  it('removes duplicates by url, keeping the first', () => {
    const out = prepareArticles([
      article({ id: 'first', url: 'https://dupe.com/x', publishedAt: '2026-08-05 09:00:00' }),
      article({ id: 'second', url: 'https://dupe.com/x', publishedAt: '2026-08-05 08:00:00' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('first');
  });

  it('applies a limit when given one', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      article({ id: String(i), url: `https://a.com/${i}` }),
    );
    expect(prepareArticles(many, 24)).toHaveLength(24);
  });

  it('tolerates a non-array input', () => {
    expect(prepareArticles(undefined as unknown as Article[])).toEqual([]);
    expect(prepareArticles(null as unknown as Article[])).toEqual([]);
  });
});

describe('formatPublished', () => {
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it('reports sub-minute ages as just now', () => {
    at('2026-08-05T09:00:30Z');
    expect(formatPublished('2026-08-05T09:00:00Z')).toBe('just now');
  });

  it('reports minutes and hours', () => {
    at('2026-08-05T09:30:00Z');
    expect(formatPublished('2026-08-05T09:00:00Z')).toBe('30m ago');
    at('2026-08-05T14:00:00Z');
    expect(formatPublished('2026-08-05T09:00:00Z')).toBe('5h ago');
  });

  it('falls back to a date beyond a day', () => {
    at('2026-08-09T09:00:00Z');
    expect(formatPublished('2026-08-05T09:00:00Z')).toMatch(/Aug/);
  });

  it('returns an empty string for an unparseable date', () => {
    expect(formatPublished('not a date')).toBe('');
    expect(formatPublished('')).toBe('');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/news/feed.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/news/feed.ts`:

```ts
import type { Article } from './types';

/** Feed URLs are rendered straight into href, so only http(s) links are kept. */
export function isSafeUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Unparseable dates sort last rather than throwing. */
function time(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/** Filter to renderable articles, drop duplicates, sort newest first so a
 *  single source cannot monopolise the top of the feed, then optionally cap.
 *  Deduplication matters once several categories are merged on the homepage:
 *  the same story often appears in more than one category feed. */
export function prepareArticles(articles: Article[], limit?: number): Article[] {
  if (!Array.isArray(articles)) return [];

  const seen = new Set<string>();
  const out = articles
    .filter((a) => a?.url && a?.title && isSafeUrl(a.url))
    .filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .sort((a, b) => time(b.publishedAt) - time(a.publishedAt));

  return typeof limit === 'number' ? out.slice(0, limit) : out;
}

export function formatPublished(value: string): string {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(t).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
```

Note: dedup runs before the sort, so "keeps the first" means first in input order — which matches the test.

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/news/feed.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/news/feed.ts tests/news/feed.test.ts
git commit -m "feat: extract pure feed helpers for reuse across surfaces"
```

---

## Phase 2 — Category pages and navigation

### Task 8: `ArticleCard` component

**Files:**
- Create: `src/components/ArticleCard.astro`

Extracted verbatim from the card markup currently inside `NewsFeed.astro`, plus a `size` prop. No visual change at `size="default"`.

- [ ] **Step 1: Create the component**

Create `src/components/ArticleCard.astro`:

```astro
---
import type { Article } from '../lib/news/types';
import { formatPublished } from '../lib/news/feed';

interface Props {
  article: Article;
  /** 'lead' renders a taller image and larger headline for the hero slot. */
  size?: 'default' | 'lead';
}

const { article, size = 'default' } = Astro.props;
const isLead = size === 'lead';

const imageHeight = isLead ? 'h-72 sm:h-96' : 'h-44';
const headlineSize = isLead
  ? 'text-xl sm:text-2xl lg:text-3xl tracking-[-0.6px]'
  : 'text-base tracking-[-0.3px]';
const summaryClamp = isLead ? 'line-clamp-3 text-sm' : 'line-clamp-3 text-xs';
---

<article
  data-article-id={article.id}
  class="article-card bg-surface-elevated border border-hairline rounded-md overflow-hidden shadow-stacked-sm hover:shadow-stacked-md hover:border-primary transition-[box-shadow,border-color] flex flex-col group h-full"
>
  {article.imageUrl && (
    <div class={`relative ${imageHeight} w-full overflow-hidden bg-surface-card`}>
      <img
        src={article.imageUrl}
        alt=""
        width={isLead ? 900 : 400}
        height={isLead ? 384 : 176}
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading={isLead ? 'eager' : 'lazy'}
      />
      <div class="absolute top-3 left-3 bg-surface-elevated/90 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize text-ink border border-hairline flex items-center gap-1.5 shadow-stacked-sm">
        <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
        {article.category}
      </div>
    </div>
  )}

  <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
    <div>
      {!article.imageUrl && (
        <div class="inline-flex items-center gap-1.5 mb-2 bg-surface-elevated px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize text-ink border border-hairline shadow-stacked-sm">
          <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
          {article.category}
        </div>
      )}

      <div class="text-[11px] font-mono text-mute mb-1.5">{article.source}</div>

      <h3 class={`article-headline font-semibold text-ink leading-snug mb-2 group-hover:text-primary-strong transition-colors ${headlineSize}`}>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          class="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong rounded-sm"
        >
          {article.title}
        </a>
      </h3>

      {article.summary && (
        <p class={`article-short-news text-body leading-relaxed ${summaryClamp}`}>
          {article.summary}
        </p>
      )}
    </div>

    <div class="pt-3 border-t border-hairline flex items-center justify-between text-xs">
      <span class="font-mono text-mute">{formatPublished(article.publishedAt)}</span>

      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        class="px-3 py-1 bg-ink hover:bg-charcoal text-canvas text-xs font-semibold rounded-md shadow-stacked-sm transition-colors flex items-center gap-1.5"
      >
        <span>Read at source</span>
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
      </a>
    </div>
  </div>
</article>
```

- [ ] **Step 2: Typecheck**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ArticleCard.astro
git commit -m "feat: extract ArticleCard component with a lead size variant"
```

---

### Task 9: `NewsFeed` takes props and uses the shared pieces

**Files:**
- Modify: `src/components/NewsFeed.astro`

- [ ] **Step 1: Rewrite the component**

Replace the whole of `src/components/NewsFeed.astro` with:

```astro
---
import type { Article, NewsPage } from '../lib/news/types';
import { prepareArticles } from '../lib/news/feed';
import { DEFAULT_CATEGORY } from '../lib/news/categories';
import { DEFAULT_LANGUAGE } from '../lib/news/languages';
import ArticleCard from './ArticleCard.astro';

interface Props {
  category?: string;
  language?: string;
  heading?: string;
  /** Articles already rendered elsewhere on the page (lead, rails), so the
   *  grid does not repeat them. */
  excludeUrls?: string[];
}

const {
  category = DEFAULT_CATEGORY,
  language = DEFAULT_LANGUAGE,
  heading = 'Major Headlines',
  excludeUrls = [],
} = Astro.props;

const MAX_CARDS = 24;

let articles: Article[] = [];
let nextPage: string | null = null;

try {
  const res = await fetch(
    new URL(
      `/api/news?category=${encodeURIComponent(category)}&language=${encodeURIComponent(language)}`,
      Astro.url,
    ),
  );
  if (res.ok) {
    const page = (await res.json()) as NewsPage;
    articles = page.articles ?? [];
    nextPage = page.nextPage ?? null;
  }
} catch {
  /* leave empty; the template renders an empty state */
}

const exclude = new Set(excludeUrls);
articles = prepareArticles(articles, MAX_CARDS).filter((a) => !exclude.has(a.url));
---

<section id="news-feed" class="w-full py-12 bg-surface-soft transition-colors duration-200">
  <div class="max-w-[1400px] mx-auto px-4 sm:px-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-hairline pb-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span id="feed-type-badge" class="font-mono-caption text-mute">LIVE HEADLINE STREAM</span>
        </div>
        <h2 class="text-2xl sm:text-3xl font-semibold text-ink tracking-[-0.96px]">{heading}</h2>
      </div>

      {articles.length > 0 && (
        <div class="flex items-center gap-2">
          <span class="px-3 py-1 bg-surface-elevated border border-hairline rounded-full text-xs font-semibold text-primary-strong flex items-center gap-1.5 shadow-stacked-sm">
            <span>Headlines from publisher feeds</span>
          </span>
        </div>
      )}
    </div>

    {articles.length === 0 ? (
      <p class="text-sm opacity-70 text-body">
        Headlines are temporarily unavailable. Please check back shortly.
      </p>
    ) : (
      <>
        <div id="articles-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((article) => <ArticleCard article={article} />)}
        </div>

        <div class="mt-8 flex flex-col items-center gap-3">
          <button
            id="load-more"
            type="button"
            hidden={!nextPage}
            data-next-page={nextPage ?? ''}
            data-category={category}
            data-language={language}
            class="px-6 py-2.5 bg-ink hover:bg-charcoal text-canvas text-sm font-semibold rounded-md shadow-stacked-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Load more headlines
          </button>
          <p id="load-more-status" role="status" aria-live="polite" class="text-xs text-mute"></p>
        </div>
      </>
    )}
  </div>
</section>
```

The Load more script is added in Task 10. If Task 1 found pagination unavailable, `nextPage` is always null, so the button stays hidden — nothing here breaks.

- [ ] **Step 2: Typecheck**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Verify the homepage is unchanged**

Reload `http://localhost:8787/` in the preview and confirm with `read_page` that the article grid still renders cards, and with `read_console_messages` that there are no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/NewsFeed.astro
git commit -m "refactor: NewsFeed takes category and language props and reuses shared helpers"
```

---

### Task 10: Load more

**Files:**
- Modify: `src/components/NewsFeed.astro`

**Skip this task entirely if Task 1 found no usable `nextPage` token.** Record that decision in `PROGRESS.md` and move to Task 11.

- [ ] **Step 1: Append the script to `NewsFeed.astro`**

Add at the end of the file, after the closing `</section>`:

```astro
<script>
  const btn = document.getElementById('load-more') as HTMLButtonElement | null;
  const grid = document.getElementById('articles-grid');
  const status = document.getElementById('load-more-status');

  interface FeedArticle {
    id: string;
    title: string;
    url: string;
    summary: string;
    imageUrl: string | null;
    source: string;
    category: string;
    publishedAt: string;
  }

  function formatPublished(value: string): string {
    const t = Date.parse(value);
    if (Number.isNaN(t)) return '';
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(t).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  }

  function isSafeUrl(value: string): boolean {
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Built with createElement + textContent throughout. Never innerHTML: a
  // headline is third-party text and would otherwise be an injection vector.
  function buildCard(a: FeedArticle): HTMLElement {
    const el = document.createElement('article');
    el.dataset.articleId = a.id;
    el.className =
      'article-card bg-surface-elevated border border-hairline rounded-md overflow-hidden shadow-stacked-sm hover:shadow-stacked-md hover:border-primary transition-[box-shadow,border-color] flex flex-col group h-full';

    if (a.imageUrl && isSafeUrl(a.imageUrl)) {
      const wrap = document.createElement('div');
      wrap.className = 'relative h-44 w-full overflow-hidden bg-surface-card';
      const img = document.createElement('img');
      img.src = a.imageUrl;
      img.alt = '';
      img.width = 400;
      img.height = 176;
      img.loading = 'lazy';
      img.className = 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-300';
      const badge = document.createElement('div');
      badge.className =
        'absolute top-3 left-3 bg-surface-elevated/90 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize text-ink border border-hairline flex items-center gap-1.5 shadow-stacked-sm';
      const dot = document.createElement('span');
      dot.className = 'w-1.5 h-1.5 rounded-full bg-primary';
      badge.append(dot, document.createTextNode(a.category));
      wrap.append(img, badge);
      el.append(wrap);
    }

    const body = document.createElement('div');
    body.className = 'p-4 flex-1 flex flex-col justify-between space-y-3';

    const top = document.createElement('div');

    const src = document.createElement('div');
    src.className = 'text-[11px] font-mono text-mute mb-1.5';
    src.textContent = a.source;

    const h3 = document.createElement('h3');
    h3.className =
      'article-headline text-base font-semibold text-ink leading-snug tracking-[-0.3px] mb-2 group-hover:text-primary-strong transition-colors';
    const link = document.createElement('a');
    link.href = a.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className =
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong rounded-sm';
    link.textContent = a.title;
    h3.append(link);

    top.append(src, h3);

    if (a.summary) {
      const p = document.createElement('p');
      p.className = 'article-short-news text-xs text-body leading-relaxed line-clamp-3';
      p.textContent = a.summary;
      top.append(p);
    }

    const foot = document.createElement('div');
    foot.className = 'pt-3 border-t border-hairline flex items-center justify-between text-xs';
    const when = document.createElement('span');
    when.className = 'font-mono text-mute';
    when.textContent = formatPublished(a.publishedAt);
    const read = document.createElement('a');
    read.href = a.url;
    read.target = '_blank';
    read.rel = 'noopener noreferrer';
    read.className =
      'px-3 py-1 bg-ink hover:bg-charcoal text-canvas text-xs font-semibold rounded-md shadow-stacked-sm transition-colors flex items-center gap-1.5';
    read.textContent = 'Read at source';
    foot.append(when, read);

    body.append(top, foot);
    el.append(body);
    return el;
  }

  btn?.addEventListener('click', async () => {
    const token = btn.dataset.nextPage;
    if (!token || !grid) return;

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Loading…';
    if (status) status.textContent = '';

    const params = new URLSearchParams({
      category: btn.dataset.category ?? 'top',
      language: btn.dataset.language ?? 'en',
      page: token,
    });

    try {
      const res = await fetch(`/api/news?${params}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const page = (await res.json()) as { articles?: FeedArticle[]; nextPage?: string | null };

      const seen = new Set(
        Array.from(grid.querySelectorAll<HTMLElement>('[data-article-id]')).map(
          (n) => n.dataset.articleId ?? '',
        ),
      );

      const fresh = (page.articles ?? []).filter(
        (a) => a?.url && a?.title && isSafeUrl(a.url) && !seen.has(a.id),
      );

      // Appended, so keyboard focus order stays natural.
      for (const a of fresh) grid.append(buildCard(a));

      if (page.nextPage) {
        btn.dataset.nextPage = page.nextPage;
        btn.disabled = false;
        btn.textContent = label;
        if (status && fresh.length === 0) status.textContent = 'No new headlines in that batch.';
      } else {
        btn.remove();
        if (status) status.textContent = "You've reached the end of the feed.";
      }
    } catch {
      btn.disabled = false;
      btn.textContent = label;
      // Existing cards stay on screen - a failed page never clears the feed.
      if (status) status.textContent = 'Could not load more headlines. Tap to try again.';
    }
  });
</script>
```

- [ ] **Step 2: Typecheck**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Verify in the browser**

Reload the homepage. Then:
1. `read_page` and count `[data-article-id]` elements — note the number.
2. Click the "Load more headlines" button (`find` it, then `computer` click).
3. `read_page` again and confirm the count increased.
4. `read_console_messages` — expect no errors.
5. Keep clicking until the button disappears; confirm the end-of-feed message appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/NewsFeed.astro
git commit -m "feat: load more headlines without leaving the page"
```

---

### Task 11: Category pages

**Files:**
- Create: `src/pages/category/[slug].astro`

- [ ] **Step 1: Create the page**

Create `src/pages/category/[slug].astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import Navbar from '../../components/Navbar.astro';
import MastheadInfoStrip from '../../components/MastheadInfoStrip.astro';
import NewsFeed from '../../components/NewsFeed.astro';
import Footer from '../../components/Footer.astro';
import { CATEGORIES, isValidCategory } from '../../lib/news/categories';
import { isValidLanguage, DEFAULT_LANGUAGE } from '../../lib/news/languages';

const { slug } = Astro.params;

// An unknown slug 404s rather than being forwarded upstream.
if (!isValidCategory(slug)) {
  return Astro.rewrite('/404');
}

const category = CATEGORIES.find((c) => c.slug === slug)!;

const rawLanguage = Astro.url.searchParams.get('language');
const language = isValidLanguage(rawLanguage) ? rawLanguage : DEFAULT_LANGUAGE;
---

<Layout
  title={`${category.label} News Today — Latest ${category.label} Headlines | NewzWale`}
  description={`Latest ${category.label.toLowerCase()} news and breaking headlines from Indian and international publishers, updated through the day on NewzWale.`}
>
  <Navbar />
  <MastheadInfoStrip />
  <main id="main" class="flex-1">
    <div class="w-full bg-gradient-start border-b border-hairline">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 py-10">
        <nav aria-label="Breadcrumb" class="mb-3">
          <ol class="flex items-center gap-2 text-xs text-mute font-mono-caption">
            <li><a href="/" class="hover:text-primary-strong">Home</a></li>
            <li aria-hidden="true">/</li>
            <li class="text-ink font-semibold">{category.label}</li>
          </ol>
        </nav>
        <h1 class="text-3xl sm:text-4xl font-semibold text-ink tracking-[-1px]">
          {category.label} News
        </h1>
      </div>
    </div>

    <NewsFeed
      category={category.slug}
      language={language}
      heading={`Latest in ${category.label}`}
    />
  </main>
  <Footer />
</Layout>
```

- [ ] **Step 2: Typecheck**

```bash
npx astro check
```

Expected: 0 errors. If `Astro.rewrite` is unavailable in this Astro version, replace that block with:

```ts
if (!isValidCategory(slug)) {
  return new Response(null, { status: 404 });
}
```

- [ ] **Step 3: Verify in the browser**

- `http://localhost:8787/category/sports` — renders, heading reads "Sports News", cards present
- `http://localhost:8787/category/business` — different articles from sports
- `http://localhost:8787/category/bogus` — 404, and critically **no upstream request is made** (check `read_network_requests`)

- [ ] **Step 4: Commit**

```bash
git add src/pages/category/[slug].astro
git commit -m "feat: add per-category news pages"
```

---

### Task 12: Category links in the navbar

**Files:**
- Modify: `src/components/Navbar.astro`

- [ ] **Step 1: Add the category nav**

In the frontmatter of `src/components/Navbar.astro`, replace the hardcoded `languages` array and the two `is*Active` constants with:

```ts
import LogoIcon from './LogoIcon.astro';
import { CATEGORIES } from '../lib/news/categories';
import { LANGUAGES, isValidLanguage, DEFAULT_LANGUAGE } from '../lib/news/languages';

const currentPath = Astro.url.pathname;
const isNewsActive = currentPath === '/' || currentPath === '';
const isVerifyActive = currentPath.startsWith('/verify');

const activeCategory = currentPath.startsWith('/category/')
  ? currentPath.split('/')[2]
  : null;

const rawLanguage = Astro.url.searchParams.get('language');
const currentLanguage = isValidLanguage(rawLanguage) ? rawLanguage : DEFAULT_LANGUAGE;
```

- [ ] **Step 2: Render the category row**

Immediately after the closing `</div>` of the main navbar row (the one holding brand + nav + controls) and **before** the mobile drawer `<div id="mobile-menu-drawer">`, insert:

```astro
  <!-- Category strip: horizontally scrollable on narrow screens -->
  <div class="w-full border-t border-hairline-soft bg-surface-soft">
    <nav
      aria-label="News categories"
      class="max-w-[1400px] mx-auto px-3 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar h-[42px]"
    >
      {CATEGORIES.map((c) => (
        <a
          href={`/category/${c.slug}`}
          aria-current={activeCategory === c.slug ? 'page' : undefined}
          class={`shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
            activeCategory === c.slug
              ? 'bg-primary-strong text-on-primary font-semibold shadow-stacked-sm'
              : 'text-body hover:text-ink hover:bg-gradient-start'
          }`}
        >
          {c.label}
        </a>
      ))}
    </nav>
  </div>
```

The header is `sticky top-0` with a fixed `h-[64px]`. Adding a second row means the fixed height must go — change the `<header>` class from `h-[64px]` to nothing (remove that one utility) and add `h-[64px]` to the inner row `<div>` that currently relies on `h-full`. Concretely, the header opening tag becomes:

```astro
<header class="sticky top-0 z-50 w-full bg-canvas/95 backdrop-blur-md border-b border-hairline transition-colors duration-200">
```

and the row below it becomes:

```astro
  <div class="max-w-[1400px] mx-auto h-[64px] px-3 sm:px-6 flex items-center justify-between">
```

- [ ] **Step 3: Add categories to the mobile drawer**

Inside `<div id="mobile-menu-drawer">`, after the existing Fact Check link, add:

```astro
    <div class="pt-2 mt-2 border-t border-hairline-soft">
      <p class="px-3.5 pb-1 font-mono-caption text-mute">CATEGORIES</p>
      {CATEGORIES.map((c) => (
        <a
          href={`/category/${c.slug}`}
          aria-current={activeCategory === c.slug ? 'page' : undefined}
          class={`block px-3.5 py-2 rounded-md ${
            activeCategory === c.slug
              ? 'bg-primary-strong text-on-primary font-bold shadow-stacked-sm'
              : 'text-ink hover:bg-surface-card'
          }`}
        >
          {c.label}
        </a>
      ))}
    </div>
```

- [ ] **Step 4: Point the language `<select>` at the shared list**

Replace the `{languages.map(...)}` block inside the `<select>` with:

```astro
          {LANGUAGES.map(lang => (
            <option value={lang.code} selected={lang.code === currentLanguage}>{lang.name}</option>
          ))}
```

- [ ] **Step 5: Typecheck and verify**

```bash
npx astro check
```

Expected: 0 errors.

In the browser: reload the homepage, confirm the 8 category chips appear below the masthead, click "Sports" and land on `/category/sports` with that chip highlighted. Check `resize_window` at the `mobile` preset that the strip scrolls horizontally rather than wrapping or overflowing.

- [ ] **Step 6: Commit**

```bash
git add src/components/Navbar.astro
git commit -m "feat: add category navigation to the navbar and mobile drawer"
```

---

## Phase 3 — Language

### Task 13: Make the language selector functional

**Files:**
- Modify: `src/components/Navbar.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace the selector's change handler**

In the `<script>` at the bottom of `src/components/Navbar.astro`, replace the "Language Selector Sync" block with:

```ts
  // Language selector. Navigating (rather than refetching client-side) keeps
  // the choice in the URL, so it is shareable and survives a reload. The
  // localStorage copy is what the masthead date listens to.
  const langSelect = document.getElementById('language-select') as HTMLSelectElement | null;
  langSelect?.addEventListener('change', () => {
    const code = langSelect.value;
    const name = langSelect.options[langSelect.selectedIndex]?.text ?? code;

    localStorage.setItem('userLanguage', code);
    localStorage.setItem('userLanguageName', name);

    window.dispatchEvent(
      new CustomEvent('language-changed', { detail: { langCode: code, langName: name } }),
    );

    const url = new URL(window.location.href);
    if (code === 'en') url.searchParams.delete('language');
    else url.searchParams.set('language', code);
    window.location.assign(url.toString());
  });
```

- [ ] **Step 2: Remove the now-wrong restore-on-load block**

Delete the entire `document.addEventListener('DOMContentLoaded', ...)` block that sets `langSelect.value` from localStorage. The server now renders the correct `selected` option from the URL, and re-applying localStorage on top of it would show a language the page is not actually displaying.

- [ ] **Step 3: Clarify what the control does**

Change the `<select>`'s `aria-label` from `"Select Language"` to:

```astro
aria-label="Choose the language of news headlines"
```

Add a `title` attribute alongside it so sighted mouse users get the same clarification:

```astro
title="Changes the language of news headlines, not the site interface"
```

- [ ] **Step 4: Pass the language through on the homepage**

Replace the frontmatter of `src/pages/index.astro` with:

```astro
---
import Layout from '../layouts/Layout.astro';
import Navbar from '../components/Navbar.astro';
import MastheadInfoStrip from '../components/MastheadInfoStrip.astro';
import HeroMesh from '../components/HeroMesh.astro';
import NewsFeed from '../components/NewsFeed.astro';
import SeoContentSection from '../components/SeoContentSection.astro';
import Footer from '../components/Footer.astro';
import { isValidLanguage, DEFAULT_LANGUAGE } from '../lib/news/languages';

const rawLanguage = Astro.url.searchParams.get('language');
const language = isValidLanguage(rawLanguage) ? rawLanguage : DEFAULT_LANGUAGE;
---
```

and change the `<NewsFeed />` line to:

```astro
    <NewsFeed language={language} />
```

- [ ] **Step 5: Typecheck and verify**

```bash
npx astro check
```

Expected: 0 errors.

In the browser:
1. Load `http://localhost:8787/`, note a headline.
2. Use `form_input` to set the language `<select>` to `hi`.
3. Confirm the URL becomes `/?language=hi` and headlines render in Devanagari.
4. Confirm the `<select>` still shows हिंदी after the reload.
5. Switch back to English and confirm `?language=` is dropped from the URL.
6. Visit `/category/sports?language=hi` and confirm it also honours the param.

- [ ] **Step 6: Commit**

```bash
git add src/components/Navbar.astro src/pages/index.astro
git commit -m "feat: language selector now fetches headlines in the chosen language"
```

---

## Phase 4 — Homepage layout

### Task 14: `CategoryRail` component

**Files:**
- Create: `src/components/CategoryRail.astro`

- [ ] **Step 1: Create the component**

Create `src/components/CategoryRail.astro`:

```astro
---
import type { Article, NewsPage } from '../lib/news/types';
import { prepareArticles } from '../lib/news/feed';
import { DEFAULT_LANGUAGE } from '../lib/news/languages';
import ArticleCard from './ArticleCard.astro';

interface Props {
  slug: string;
  label: string;
  language?: string;
  excludeUrls?: string[];
}

const { slug, label, language = DEFAULT_LANGUAGE, excludeUrls = [] } = Astro.props;

const RAIL_SIZE = 4;

let articles: Article[] = [];
try {
  const res = await fetch(
    new URL(
      `/api/news?category=${encodeURIComponent(slug)}&language=${encodeURIComponent(language)}`,
      Astro.url,
    ),
  );
  if (res.ok) articles = ((await res.json()) as NewsPage).articles ?? [];
} catch {
  /* an empty rail is not rendered at all - see below */
}

const exclude = new Set(excludeUrls);
articles = prepareArticles(articles).filter((a) => !exclude.has(a.url)).slice(0, RAIL_SIZE);
---

{articles.length > 0 && (
  <section class="w-full py-8 border-b border-hairline-soft last:border-b-0">
    <div class="max-w-[1400px] mx-auto px-4 sm:px-6">
      <div class="flex items-center justify-between gap-4 mb-5">
        <h2 class="text-xl sm:text-2xl font-semibold text-ink tracking-[-0.6px] flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-primary"></span>
          {label}
        </h2>
        <a
          href={`/category/${slug}`}
          class="shrink-0 text-xs font-semibold text-primary-strong hover:text-primary-pressed flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong rounded-sm"
        >
          View all {label}
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </a>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {articles.map((article) => <ArticleCard article={article} />)}
      </div>
    </div>
  </section>
)}
```

An empty rail renders nothing at all — an empty section is worse than an absent one.

- [ ] **Step 2: Typecheck**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CategoryRail.astro
git commit -m "feat: add category rail component for the homepage"
```

---

### Task 15: `LeadStory` component

**Files:**
- Create: `src/components/LeadStory.astro`

- [ ] **Step 1: Create the component**

Create `src/components/LeadStory.astro`:

```astro
---
import type { Article } from '../lib/news/types';
import ArticleCard from './ArticleCard.astro';

interface Props {
  lead: Article;
  secondary: Article[];
}

const { lead, secondary } = Astro.props;
---

<section class="w-full py-10 bg-surface-soft">
  <div class="max-w-[1400px] mx-auto px-4 sm:px-6">
    <div class="flex items-center gap-2 mb-5">
      <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
      <span class="font-mono-caption text-mute">TOP STORY</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="lg:col-span-2">
        <ArticleCard article={lead} size="lead" />
      </div>

      <div class="flex flex-col gap-5">
        {secondary.map((article) => <ArticleCard article={article} />)}
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Typecheck**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LeadStory.astro
git commit -m "feat: add lead story component"
```

---

### Task 16: Compose the new homepage

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Rewrite the page**

Replace the whole of `src/pages/index.astro` with:

```astro
---
import Layout from '../layouts/Layout.astro';
import Navbar from '../components/Navbar.astro';
import MastheadInfoStrip from '../components/MastheadInfoStrip.astro';
import HeroMesh from '../components/HeroMesh.astro';
import LeadStory from '../components/LeadStory.astro';
import CategoryRail from '../components/CategoryRail.astro';
import NewsFeed from '../components/NewsFeed.astro';
import SeoContentSection from '../components/SeoContentSection.astro';
import Footer from '../components/Footer.astro';
import type { Article, NewsPage } from '../lib/news/types';
import { prepareArticles } from '../lib/news/feed';
import { isValidLanguage, DEFAULT_LANGUAGE } from '../lib/news/languages';

const rawLanguage = Astro.url.searchParams.get('language');
const language = isValidLanguage(rawLanguage) ? rawLanguage : DEFAULT_LANGUAGE;

// The four categories that get a rail. Kept short deliberately: each one is a
// separate upstream request, and the plan's rate-limit budget assumes four.
const RAILS = [
  { slug: 'sports', label: 'Sports' },
  { slug: 'business', label: 'Business' },
  { slug: 'technology', label: 'Technology' },
  { slug: 'health', label: 'Health' },
];

let top: Article[] = [];
try {
  const res = await fetch(new URL(`/api/news?language=${encodeURIComponent(language)}`, Astro.url));
  if (res.ok) top = prepareArticles(((await res.json()) as NewsPage).articles ?? []);
} catch {
  /* the lead block is skipped entirely when nothing loads */
}

// Prefer an article with an image for the hero, but fall back to the newest
// without one rather than leaving a hole.
const leadIndex = top.findIndex((a) => a.imageUrl);
const lead = leadIndex >= 0 ? top[leadIndex] : top[0];
const secondary = top.filter((a) => a.url !== lead?.url).slice(0, 3);

// Everything already shown above, so the rails and the main grid do not repeat it.
const shownUrls = [lead?.url, ...secondary.map((a) => a.url)].filter(
  (u): u is string => typeof u === 'string',
);
---

<Layout
  title="Latest News Today, Breaking India News & AI Fact Check Portal | NewzWale"
  description="NewzWale is your 24/7 destination for latest news, breaking news today, tech news, hindi news (news in hindi), and india news with real-time fact check explorer verification."
>
  <Navbar />
  <MastheadInfoStrip />
  <main id="main" class="flex-1">
    <HeroMesh />

    {lead && <LeadStory lead={lead} secondary={secondary} />}

    {RAILS.map((rail) => (
      <CategoryRail
        slug={rail.slug}
        label={rail.label}
        language={language}
        excludeUrls={shownUrls}
      />
    ))}

    <NewsFeed language={language} excludeUrls={shownUrls} />
    <SeoContentSection />
  </main>
  <Footer />
</Layout>
```

- [ ] **Step 2: Typecheck**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Verify in the browser**

Reload `http://localhost:8787/` and confirm with `read_page`:
- A lead story with a large image, plus up to 3 secondary cards.
- Four category rails, each with a "View all" link that resolves to `/category/<slug>`.
- The main grid below, with no article repeated from the lead block (compare `data-article-id` values).
- `read_console_messages` shows no errors.
- `resize_window` to `mobile`, reload, and confirm the layout stacks to one column without horizontal overflow.
- Take a `screenshot` for the user.

- [ ] **Step 4: Check the contrast tests still pass**

```bash
npm test
```

Expected: all pass, including `tests/contrast.test.ts` unchanged — no new colours were introduced.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: rebuild the homepage with a lead story and category rails"
```

---

## Phase 5 — Fact-check repair

### Task 17: Swap the search provider to Tavily

**Files:**
- Modify: `src/lib/factcheck/search.ts`
- Test: `tests/factcheck/search.test.ts`

The `SearchHit` interface does not change, so `src/pages/api/factcheck.ts` needs only its call site updated (Task 18). **Do not touch the system prompt in that file.**

- [ ] **Step 1: Replace the test file**

Replace the whole of `tests/factcheck/search.test.ts` with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseTavilyResults, search } from '../../src/lib/factcheck/search';

describe('parseTavilyResults', () => {
  it('maps a well-formed Tavily response to hits', () => {
    const raw = {
      query: 'india gdp',
      results: [
        {
          title: 'India GDP grows 7.2% in Q1',
          url: 'https://reuters.com/a',
          content: 'Official data showed the economy expanded 7.2 percent.',
          score: 0.98,
        },
        {
          title: 'Government statement on growth',
          url: 'https://pib.gov.in/b',
          content: 'The ministry confirmed the revised figure.',
          score: 0.91,
        },
      ],
    };

    const out = parseTavilyResults(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      title: 'India GDP grows 7.2% in Q1',
      url: 'https://reuters.com/a',
      snippet: 'Official data showed the economy expanded 7.2 percent.',
    });
    expect(out[1].url).toBe('https://pib.gov.in/b');
  });

  it('returns [] for malformed or empty responses', () => {
    expect(parseTavilyResults({ results: [] })).toEqual([]);
    expect(parseTavilyResults({})).toEqual([]);
    expect(parseTavilyResults(null)).toEqual([]);
    expect(parseTavilyResults(undefined)).toEqual([]);
    expect(parseTavilyResults('nonsense')).toEqual([]);
    expect(parseTavilyResults({ results: 'not-an-array' })).toEqual([]);
  });

  it('drops results missing a url or a title', () => {
    const out = parseTavilyResults({
      results: [
        { url: 'https://ok.com/x', title: 'Has no content' },
        { title: 'No url at all' },
        { url: 'https://no-title.com' },
        null,
        'garbage',
      ],
    });
    expect(out).toEqual([{ title: 'Has no content', url: 'https://ok.com/x', snippet: '' }]);
  });

  it('coerces non-string field values rather than leaking them through', () => {
    const out = parseTavilyResults({ results: [{ url: 'https://n.com/1', title: 42, content: 7 }] });
    expect(out).toEqual([{ title: '42', url: 'https://n.com/1', snippet: '7' }]);
  });
});

describe('search', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the query to Tavily and parses the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ title: 'A', url: 'https://a.com', content: 'snippet a' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await search('test-key', 'is the sky blue');

    expect(out).toEqual([{ title: 'A', url: 'https://a.com', snippet: 'snippet a' }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.query).toBe('is the sky blue');
    expect(body.max_results).toBe(5);
  });

  it('sends the key in the Authorization header, never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await search('secret-key', 'q');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('secret-key');
    expect(init.headers.Authorization).toBe('Bearer secret-key');
  });

  it('returns [] without calling out when the key is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(search('', 'q')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns [] instead of throwing when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('upstream down')));
    await expect(search('k', 'q')).resolves.toEqual([]);
  });

  it('returns [] instead of throwing on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(search('k', 'q')).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/factcheck/search.test.ts
```

Expected: FAIL — `parseTavilyResults is not a function`.

- [ ] **Step 3: Implement**

Replace the whole of `src/lib/factcheck/search.ts` with:

```ts
// Web search provider: Tavily.
//
// WHY NOT the Cloudflare Web Search binding: it was the original choice, but
// every call on this account throws `Error: account_disabled` (confirmed via
// `wrangler tail`). That is an account entitlement, not a bug we can fix in
// code - Web Search is absent from Cloudflare's public bindings docs, so it
// appears not to be generally available. The practical effect was that stage 2
// retrieved nothing, stage 3 never ran, and every claim without a published
// fact-check came back `insufficient_evidence`. Do not restore the binding
// without first confirming it works on the account.
//
// Tavily also returns better evidence: `content` is a query-relevant extract,
// whereas Web Search only ever exposed the page-level meta description.
// Grounding on an extract beats grounding on a meta tag.
//
// The API key is injected rather than imported so this module stays pure
// TypeScript with no Worker imports, matching `cached(kv, ...)` in ../cache.ts.

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

const ENDPOINT = 'https://api.tavily.com/search';
const MAX_RESULTS = 5;

export function parseTavilyResults(raw: any): SearchHit[] {
  const results = Array.isArray(raw?.results) ? raw.results : [];
  return results
    .filter((r: any) => r?.url && r?.title)
    .map((r: any) => ({
      title: String(r.title),
      url: String(r.url),
      snippet: String(r.content ?? ''),
    }));
}

export async function search(apiKey: string, query: string): Promise<SearchHit[]> {
  // No key means no search. Returning [] degrades to insufficient_evidence,
  // which is the honest outcome - never a guessed verdict.
  if (!apiKey) {
    console.error('TAVILY_API_KEY is not set; skipping evidence retrieval.');
    return [];
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        // Header, not a query param: a key in the URL leaks into logs.
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        max_results: MAX_RESULTS,
        search_depth: 'basic',
      }),
    });

    if (!res.ok) {
      console.error('Tavily search failed:', res.status);
      return [];
    }

    return parseTavilyResults(await res.json());
  } catch (err) {
    // Evidence retrieval is best-effort: the caller falls back to reporting
    // insufficient evidence rather than failing the whole fact check. Logged
    // because a silent failure here is indistinguishable from "no results".
    console.error('Tavily search failed:', err);
    return [];
  }
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/factcheck/search.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/factcheck/search.ts tests/factcheck/search.test.ts
git commit -m "fix: replace the disabled Cloudflare Web Search binding with Tavily"
```

---

### Task 18: Wire the new provider into the endpoint

**Files:**
- Modify: `src/pages/api/factcheck.ts`
- Modify: `wrangler.jsonc`
- Modify: `.dev.vars.example`

- [ ] **Step 1: Update the call site**

In `src/pages/api/factcheck.ts`, replace the stage 2 comment block and the `search(...)` line:

```ts
  // ---- Stage 2: retrieve evidence. ----------------------------------------
  // Tavily returns a query-relevant extract per result. Page bodies are still
  // better, so each hit's URL is fetched and the extract is used only when the
  // fetch fails.
  const tavilyKey = (env as unknown as { TAVILY_API_KEY?: string }).TAVILY_API_KEY ?? '';
  const hits = (await search(tavilyKey, query)).slice(0, MAX_SOURCES);
```

Everything else in the function — including the `SYSTEM` prompt — stays exactly as it is.

- [ ] **Step 2: Remove the dead binding**

In `wrangler.jsonc`, delete these lines:

```jsonc
	// Cloudflare Web Search: one shared public-web corpus, so the binding is
	// zero-config -- a single object, not an array. Discovery-only: it returns
	// URLs and catalog metadata, never page bodies.
	// `remote: true` because Web Search has no local emulation -- it always hits
	// the real service, so local dev consumes real quota either way.
	"websearch": { "binding": "WEBSEARCH", "remote": true },
```

- [ ] **Step 3: Document the new secret**

Append to `.dev.vars.example`:

```
TAVILY_API_KEY=
```

Placeholder name only — never a value.

- [ ] **Step 4: Regenerate types and typecheck**

```bash
npx wrangler types && npx astro check
```

Expected: 0 errors. `WEBSEARCH` should disappear from the generated `Env` interface.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/factcheck.ts wrangler.jsonc .dev.vars.example worker-configuration.d.ts
git commit -m "feat: wire fact-check evidence retrieval to Tavily and drop the dead binding"
```

---

### Task 19: Verify fact-check end to end

**Files:** none — this is verification.

- [ ] **Step 1: Ask the user to provision the key**

Tell the user, and wait:

> Fact-check needs a Tavily API key. Sign up at https://tavily.com (free tier is about 1,000 searches/month), then set it locally and in production yourself — I will not handle the key value:
>
> Local: add `TAVILY_API_KEY=<your key>` to `.dev.vars`
>
> Production:
> ```bash
> npx wrangler secret put TAVILY_API_KEY
> ```

- [ ] **Step 2: Restart the preview so the new secret is loaded**

Stop and restart the preview server (`preview_stop` then `preview_start`) — `.dev.vars` is read at startup.

- [ ] **Step 3: Test a claim with a published fact-check (stage 1)**

In the browser console via `javascript_tool`:

```js
fetch('/api/factcheck', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ claim: 'COVID vaccines contain microchips' }),
}).then(r => r.json())
```

Expected: `verdict: "false"`, `basis: "certified"`, with a real citation. This path was already working — a regression here means Task 18 broke stage 1.

- [ ] **Step 4: Test a claim with no published fact-check (stages 2+3)**

This is the actual fix. Use a recent, checkable, non-famous claim — for example a specific recent policy or sports result:

```js
fetch('/api/factcheck', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ claim: 'The Reserve Bank of India kept the repo rate unchanged at its most recent policy meeting' }),
}).then(r => r.json())
```

Expected: **not** `insufficient_evidence` with an empty `evidence` array. It should carry `basis: "ai_assessment"` and 1–3 evidence entries with real URLs. If it still returns `insufficient_evidence` with no evidence, stage 2 is still dead — check `preview_logs` for the Tavily error line before changing anything else.

- [ ] **Step 5: Confirm a nonsense claim still refuses to guess**

```js
fetch('/api/factcheck', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ claim: 'Purple goats secretly run the postal service in Belgium' }),
}).then(r => r.json())
```

Expected: `insufficient_evidence`. The pipeline must never invent a verdict — a "false" here would be as wrong as a "verified".

- [ ] **Step 6: Record the outcome in `PROGRESS.md`**

Replace the "⚠️ Fact-check stage 2 (web search) is unavailable" section with the real, current state: which provider, which stages work, and what each of the three test claims returned.

- [ ] **Step 7: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: record fact-check pipeline working end to end on Tavily"
```

---

## Phase 6 — Finish

### Task 20: Full verification sweep

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Run everything**

```bash
npm test
```

Expected: all pass, including `tests/contrast.test.ts` unmodified.

```bash
npx astro check
```

Expected: 0 errors, 0 warnings.

```bash
npm run build
```

Expected: completes, and `dist/server` is non-empty.

- [ ] **Step 2: Walk the site in the browser**

Confirm each, with `read_console_messages` clean after every page:

| Check | Expectation |
| --- | --- |
| `/` | Lead story, 4 rails, main grid, Load more |
| `/category/sports` | Sports headlines, breadcrumb, active chip |
| `/category/bogus` | 404 |
| `/?language=hi` | Devanagari headlines |
| `/verify` | Fact-check widget works, no tick icon in nav |
| Mobile preset | No horizontal overflow on `/` or `/category/sports` |
| Dark mode | Cards readable; use `resize_window` with `colorScheme: 'dark'` |

- [ ] **Step 3: Update the handoff log**

Update `PROGRESS.md`: Status, last commit, what's built, and prune anything now stale — specifically the "Navbar language selector … nothing translates" item under Deferred, which this work resolves.

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update handoff log after categories, language and fact-check work"
```

- [ ] **Step 5: Hand back to the user**

Do **not** deploy. Report what passed and what did not, quoting real command output, and let the user decide about merging and deploying.

---

## Self-review notes

**Spec coverage:** Data layer → Tasks 4–6. Categories → 2, 11, 12. Shared components → 7, 8, 9. Load more → 10 (conditional on Task 1). Language → 3, 13. Homepage layout → 14, 15, 16. Fact-check → 17, 18, 19. Error-handling table → distributed across 6, 9, 10, 14, 17. Testing section → 2, 3, 4, 5, 7, 17, 20.

**Known deviations from the spec, deliberate:**
- `fetchRssFallback` keeps returning `Article[]` rather than a `NewsPage`; `/api/news` wraps it as `{ articles, nextPage: null }`. Same behaviour, no churn in `tests/news/rss.test.ts`.
- `prepareArticles` also deduplicates by URL. Not in the spec, but the homepage merges several category feeds where the same story recurs — without it the grid would show visible duplicates.
- The "falls back to English with a visible note" row in the spec's error table is not implemented as a note. RSS fallback only triggers on total upstream failure, where the honest message is the existing "temporarily unavailable" state. Flagged rather than silently dropped.
