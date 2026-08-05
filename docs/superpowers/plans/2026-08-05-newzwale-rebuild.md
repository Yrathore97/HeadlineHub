# NewzWale Two-Interface Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn NewzWale into two working interfaces — a News page backed by a live API and a Fact Check page backed by real evidence retrieval — on a Cloudflare Worker that actually runs server code.

**Architecture:** Astro SSR on Cloudflare Workers. `output: 'server'` makes API routes real endpoints; static marketing pages opt back out with `prerender = true`. A KV namespace (`NEWZ_CACHE`) absorbs traffic so free API tiers survive. Pure logic (parsing, verdict selection, cache keys) lives in `src/lib/` as dependency-free functions so it is unit-testable without a Worker runtime.

**Tech Stack:** Astro 7.1.6, `@astrojs/cloudflare` 14.1.7, Tailwind 4, Wrangler 4, Vitest, Cloudflare Workers AI, NewsData.io, Google Fact Check Tools API.

**Spec:** `docs/superpowers/specs/2026-08-05-newzwale-rebuild-design.md`

---

## Ground rules for the implementer

1. **Phase 1 is a hard prerequisite.** Until `output: 'server'` ships, no API route can run and no secret can be stored. Do not start Phase 3 or 4 before Phase 1 is deployed and verified.
2. **Never invent data.** If a fetch fails, the UI shows an empty state or hides the widget. It must never fall back to hardcoded articles, invented numbers, or a `verified` verdict.
3. **Verify external API response shapes against a live call** before trusting the shapes written in this plan. Shapes here are believed correct but were not executed. When one differs, fix the parser and the test together.
4. Commit after every task. Work on branch `rebuild/two-interface`.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `src/lib/news/newsdata.ts` | Call NewsData.io, normalize to `Article[]` |
| `src/lib/news/rss.ts` | Fetch + parse Indian outlet RSS, normalize to `Article[]` |
| `src/lib/news/types.ts` | `Article` type, shared by both sources |
| `src/lib/factcheck/google.ts` | Google Fact Check Tools client |
| `src/lib/factcheck/search.ts` | `search(query)` interface + provider |
| `src/lib/factcheck/extract.ts` | Fetch an article URL, strip markup to prose |
| `src/lib/factcheck/verdict.ts` | Verdict rules, rating normalization, enum coercion |
| `src/lib/factcheck/types.ts` | `Verdict`, `Evidence`, `FactCheckResult` |
| `src/lib/cache.ts` | KV get/set with TTL, cache key builders |
| `src/lib/ratelimit.ts` | Per-IP rate limit over KV |
| `src/pages/api/news.ts` | `GET` — news for the home page |
| `src/pages/api/factcheck.ts` | `POST` — the single fact-check endpoint |
| `src/pages/api/ticker.ts` | `GET` — Sensex/Nifty, or 503 |
| `tests/**` | Vitest unit tests mirroring `src/lib/` |

**Modified:** `astro.config.mjs`, `wrangler.jsonc`, `package.json`, `src/components/NewsFeed.astro`, `src/components/FactCheckWidget.astro`, `src/components/Navbar.astro`, `src/components/Footer.astro`, `src/components/MastheadInfoStrip.astro`, `src/pages/index.astro`, `src/pages/verify.astro`, `src/pages/contact.astro`, `.github/workflows/deploy.yml`

**Deleted:** listed in Task 6 and Task 7.

---

# Phase 0 — Test infrastructure

### Task 1: Add Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add the test script to `package.json`**

Add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test at `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts
git commit -m "test: add vitest harness"
```

---

# Phase 1 — Make the Worker run server code

This phase is the unblocker. Nothing else works until it lands.

### Task 2: Switch Astro to SSR

**Files:**
- Modify: `astro.config.mjs`

- [ ] **Step 1: Replace `astro.config.mjs` entirely**

The dev-only Vite proxy to `http://127.0.0.1:8000` is removed — it pointed at the FastAPI backend being deleted in Task 7, and leaving it would silently swallow `/api` calls in dev.

```js
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://newzwale.editall.workers.dev',
  output: 'server',
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Verify server output now exists**

Run: `ls dist/server`
Expected: **non-empty**. This is the single most important check in the plan. Before this change the directory was empty.

If it is still empty, stop and diagnose before continuing — every later phase depends on it.

- [ ] **Step 4: Commit**

```bash
git add astro.config.mjs
git commit -m "fix: enable SSR output so API routes become real endpoints

Astro defaulted to output:'static', which prerendered every API route
into inert files under dist/client/api/. dist/server/ was empty, so the
deployed Worker held only static assets - POST /api/v1/verify/claim
returned 405 and Cloudflare refused to store secrets."
```

### Task 3: Keep marketing pages static

Marketing pages have no dynamic content. Prerendering them keeps them fast and off the Worker's CPU budget.

**Files:**
- Modify: `src/pages/about.astro`, `src/pages/contact.astro`, `src/pages/privacy.astro`, `src/pages/terms.astro`, `src/pages/404.astro`, `src/pages/500.astro`

- [ ] **Step 1: Add the prerender export to each of the six files**

Add to the frontmatter (the `---` block) at the top of each:

```astro
export const prerender = true;
```

- [ ] **Step 2: Build and confirm both outputs exist**

Run: `npm run build && ls dist/client && ls dist/server`
Expected: `dist/client` contains `about/`, `privacy/`, `terms/`, `404.html`; `dist/server` is non-empty.

- [ ] **Step 3: Commit**

```bash
git add src/pages
git commit -m "perf: prerender static marketing pages"
```

### Task 4: Point Wrangler at the real asset directory and add bindings

`assets.directory` is currently `./dist`, but the build emits client assets to `./dist/client`.

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Create the KV namespace**

```bash
npx wrangler kv namespace create NEWZ_CACHE
```

Copy the `id` value it prints. You will paste it in the next step.

- [ ] **Step 2: Rewrite `wrangler.jsonc`**

Replace `PASTE_ID_FROM_STEP_1` with the id from Step 1.

```jsonc
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"compatibility_date": "2026-08-04",
	"compatibility_flags": ["global_fetch_strictly_public"],
	"name": "newzwale",
	"main": "@astrojs/cloudflare/entrypoints/server",
	"assets": {
		"directory": "./dist/client",
		"binding": "ASSETS"
	},
	"kv_namespaces": [
		{ "binding": "NEWZ_CACHE", "id": "PASTE_ID_FROM_STEP_1" }
	],
	"ai": { "binding": "AI" },
	"observability": {
		"enabled": true
	}
}
```

- [ ] **Step 3: Run locally and confirm the site serves**

Run: `npm run preview`
Open the URL Wrangler prints. Expected: the home page renders — not a directory listing, not a 404.

If it 404s, the asset directory is wrong. Run `ls dist` and set `assets.directory` to whichever directory actually contains `index.html`.

- [ ] **Step 4: Regenerate Worker types**

```bash
npx wrangler types
```

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc worker-configuration.d.ts
git commit -m "fix: correct assets directory and add KV + AI bindings

assets.directory pointed at ./dist, but the build emits client assets
to ./dist/client."
```

### Task 5: Deploy and prove secrets now work

- [ ] **Step 1: Deploy**

```bash
npm run deploy
```

- [ ] **Step 2: Store the two API keys**

Run each and paste the value at the hidden prompt. **The key never appears in the command itself** — the argument is the variable name.

```bash
npx wrangler secret put NEWSDATA_API_KEY
```

```bash
npx wrangler secret put GOOGLE_FACTCHECK_API_KEY
```

- [ ] **Step 3: Verify both landed under the correct names**

Run: `npx wrangler secret list`
Expected exactly:

```json
[
  { "name": "NEWSDATA_API_KEY", "type": "secret_text" },
  { "name": "GOOGLE_FACTCHECK_API_KEY", "type": "secret_text" }
]
```

If a name contains the key value itself, delete it with `npx wrangler secret delete "<name>"` and redo Step 2.

- [ ] **Step 4: Confirm the dashboard error is gone**

Open the Worker in the Cloudflare dashboard → Settings → Variables and Secrets.
Expected: both secrets listed. The message "Variables cannot be added to a Worker that only has static assets" must no longer appear.

---

# Phase 2 — Delete what is broken or fake

### Task 6: Remove auth, admin, and account pages

These are the security holes from the spec: `btoa(email)` sessions, a Google login that never contacts Google, and an unguarded `/admin`.

**Files:**
- Delete: `src/pages/api/v1/auth/` (whole directory), `src/pages/admin.astro`, `src/pages/profile.astro`, `src/pages/settings.astro`, `src/pages/saved.astro`, `src/components/AdminDesk.astro`
- Modify: `src/components/Navbar.astro`

- [ ] **Step 1: Delete the files**

```bash
git rm -r src/pages/api/v1/auth src/pages/admin.astro src/pages/profile.astro src/pages/settings.astro src/pages/saved.astro src/components/AdminDesk.astro
```

- [ ] **Step 2: Strip auth from `src/components/Navbar.astro`**

Remove: the sign-in/sign-up modal markup, its open/close handlers, the logout handler, and every `localStorage` reference to `uncoshub_user`, `uncoshub_access_token`, and any `printnewz_*` key. Remove nav links to `/saved`, `/profile`, `/settings`, `/trending`, `/categories`, `/news`, and the "More" dropdown.

The desktop and mobile nav should each end up with exactly two links:

```astro
<a href="/">News</a>
<a href="/verify">Fact Check</a>
```

- [ ] **Step 3: Verify no references survive**

Run: `grep -rn "uncoshub\|printnewz\|/admin\|/profile\|/settings\|/saved" src/`
Expected: no output.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds with no unresolved-import errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix!: remove mock auth, unguarded admin, and account pages

Sessions were minted with btoa(email) and no password check.
google/login.ts never contacted Google - with the client ID unset it
logged visitors in as google_user@gmail.com. /admin had no authorization
gate. The site needs no accounts, so all of it is removed."
```

### Task 7: Remove the undeployed backend and dead components

**Files:**
- Delete: `backend/`, `database/`, `k8s/`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `src/components/IndianLanguageHub.astro`, `src/components/MultilingualAudioPlayer.astro`, `src/components/SocialStudio.astro`, `src/pages/api/verify.ts`, `src/pages/api/v1/verify/claim.ts`, `src/pages/news.astro`, `src/pages/categories.astro`, `src/pages/trending.astro`, `src/pages/faq.astro`
- Create: `.dev.vars.example`

`faq.astro`'s fact-check FAQ content moves into `/verify` in Task 15 — read it before deleting and keep the copy.

- [ ] **Step 1: Save the FAQ copy**

Open `src/pages/faq.astro` and `src/components/FaqSection.astro`. Copy the question/answer text into a scratch file; Task 15 needs it.

- [ ] **Step 2: Delete**

```bash
git rm -r backend database k8s Dockerfile docker-compose.yml .env.example \
  src/components/IndianLanguageHub.astro \
  src/components/MultilingualAudioPlayer.astro \
  src/components/SocialStudio.astro \
  src/pages/api/verify.ts \
  src/pages/api/v1/verify/claim.ts \
  src/pages/news.astro \
  src/pages/categories.astro \
  src/pages/trending.astro \
  src/pages/faq.astro
```

- [ ] **Step 3: Create `.dev.vars.example`**

```
# Copy to .dev.vars for local development. Never commit .dev.vars.
NEWSDATA_API_KEY=
GOOGLE_FACTCHECK_API_KEY=
```

- [ ] **Step 4: Confirm `.dev.vars` is ignored**

Run: `grep -n "dev.vars" .gitignore`
If absent, append `.dev.vars` to `.gitignore`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds. If a component import breaks, remove the import from the page that referenced it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove undeployed backend and dead code

backend/, database/, k8s/, and the Docker files described a
FastAPI/Postgres deployment that was never what shipped to Cloudflare.
Also removes ~1300 lines of components imported by nothing and both
duplicate fact-check endpoints. All recoverable from git history."
```

---

# Phase 3 — News interface

### Task 8: Article type and NewsData.io client

**Files:**
- Create: `src/lib/news/types.ts`, `src/lib/news/newsdata.ts`
- Test: `tests/news/newsdata.test.ts`

- [ ] **Step 1: Write `src/lib/news/types.ts`**

```ts
export interface Article {
  id: string;
  title: string;
  url: string;
  summary: string;
  imageUrl: string | null;
  source: string;
  category: string;
  publishedAt: string;
}
```

- [ ] **Step 2: Write the failing test at `tests/news/newsdata.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeNewsData } from '../../src/lib/news/newsdata';

describe('normalizeNewsData', () => {
  it('maps a NewsData response to Article[]', () => {
    const raw = {
      status: 'success',
      results: [
        {
          article_id: 'abc123',
          title: 'RBI holds repo rate',
          link: 'https://example.com/rbi',
          description: 'The central bank held rates steady.',
          image_url: 'https://example.com/img.jpg',
          source_id: 'thehindu',
          category: ['business'],
          pubDate: '2026-08-05 09:30:00',
        },
      ],
    };
    const out = normalizeNewsData(raw);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('abc123');
    expect(out[0].source).toBe('thehindu');
    expect(out[0].category).toBe('business');
  });

  it('drops entries with no title or link', () => {
    const raw = { status: 'success', results: [{ article_id: 'x', title: null, link: null }] };
    expect(normalizeNewsData(raw)).toHaveLength(0);
  });

  it('returns an empty array when results is missing', () => {
    expect(normalizeNewsData({ status: 'error' })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/news/newsdata.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/news/newsdata`.

- [ ] **Step 4: Write `src/lib/news/newsdata.ts`**

```ts
import type { Article } from './types';

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

export async function fetchNewsData(apiKey: string, category?: string): Promise<Article[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    country: 'in',
    language: 'en',
  });
  if (category && category !== 'top') params.set('category', category);

  const res = await fetch(`${ENDPOINT}?${params}`);
  if (!res.ok) throw new Error(`NewsData ${res.status}`);
  return normalizeNewsData(await res.json());
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/news/newsdata.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Confirm the real response shape**

Call the API once with your key and compare field names against `normalizeNewsData`. If NewsData returns a different field (for example `pubDate` vs `pub_date`), fix the parser and the test together.

- [ ] **Step 7: Commit**

```bash
git add src/lib/news tests/news
git commit -m "feat: add NewsData.io client and Article normalizer"
```

### Task 9: RSS fallback

**Files:**
- Create: `src/lib/news/rss.ts`
- Test: `tests/news/rss.test.ts`

- [ ] **Step 1: Write the failing test at `tests/news/rss.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseRss } from '../../src/lib/news/rss';

const SAMPLE = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>ISRO launches NavIC satellite</title>
    <link>https://example.com/isro</link>
    <description>A routine launch from Sriharikota.</description>
    <pubDate>Tue, 05 Aug 2026 04:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe('parseRss', () => {
  it('extracts items', () => {
    const out = parseRss(SAMPLE, 'thehindu');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('ISRO launches NavIC satellite');
    expect(out[0].source).toBe('thehindu');
  });

  it('unwraps CDATA titles', () => {
    const xml = `<rss><channel><item><title><![CDATA[Budget 2026]]></title><link>https://e.com/a</link></item></channel></rss>`;
    expect(parseRss(xml, 'mint')[0].title).toBe('Budget 2026');
  });

  it('returns an empty array for malformed input', () => {
    expect(parseRss('not xml', 'x')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/news/rss.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/news/rss.ts`**

Workers have no DOM parser, so this uses regex extraction. That is acceptable for RSS, which is a narrow, well-formed format.

```ts
import type { Article } from './types';

export const FEEDS: Record<string, string> = {
  thehindu: 'https://www.thehindu.com/news/national/feeder/default.rss',
  indianexpress: 'https://indianexpress.com/section/india/feed/',
  ndtv: 'https://feeds.feedburner.com/ndtvnews-india-news',
  mint: 'https://www.livemint.com/rss/news',
};

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function parseRss(xml: string, source: string): Article[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((block) => {
      const title = tag(block, 'title');
      const url = tag(block, 'link');
      if (!title || !url) return null;
      return {
        id: url,
        title,
        url,
        summary: tag(block, 'description').slice(0, 300),
        imageUrl: null,
        source,
        category: 'top',
        publishedAt: tag(block, 'pubDate'),
      } satisfies Article;
    })
    .filter((a): a is Article => a !== null);
}

export async function fetchRssFallback(): Promise<Article[]> {
  const settled = await Promise.allSettled(
    Object.entries(FEEDS).map(async ([source, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${source} ${res.status}`);
      return parseRss(await res.text(), source);
    }),
  );
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/news/rss.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/news/rss.ts tests/news/rss.test.ts
git commit -m "feat: add RSS fallback for when the news API quota is exhausted"
```

### Task 10: KV cache helper

**Files:**
- Create: `src/lib/cache.ts`
- Test: `tests/cache.test.ts`

- [ ] **Step 1: Write the failing test at `tests/cache.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { newsCacheKey, cached } from '../src/lib/cache';

describe('newsCacheKey', () => {
  it('namespaces by category', () => {
    expect(newsCacheKey('business')).toBe('news:v1:business');
  });
  it('defaults to top', () => {
    expect(newsCacheKey()).toBe('news:v1:top');
  });
});

function fakeKV(store: Record<string, string> = {}) {
  return {
    get: vi.fn(async (k: string) => store[k] ?? null),
    put: vi.fn(async (k: string, v: string) => { store[k] = v; }),
  } as any;
}

describe('cached', () => {
  it('returns the cached value without calling the producer', async () => {
    const kv = fakeKV({ 'k': JSON.stringify([{ id: '1' }]) });
    const produce = vi.fn();
    const out = await cached(kv, 'k', 60, produce);
    expect(out).toEqual([{ id: '1' }]);
    expect(produce).not.toHaveBeenCalled();
  });

  it('calls the producer and stores the result on a miss', async () => {
    const kv = fakeKV();
    const out = await cached(kv, 'k', 60, async () => [{ id: '2' }]);
    expect(out).toEqual([{ id: '2' }]);
    expect(kv.put).toHaveBeenCalledWith('k', JSON.stringify([{ id: '2' }]), { expirationTtl: 60 });
  });

  it('returns null when the producer throws and nothing is cached', async () => {
    const kv = fakeKV();
    const out = await cached(kv, 'k', 60, async () => { throw new Error('boom'); });
    expect(out).toBeNull();
  });

  it('serves a stale value when the producer throws', async () => {
    const kv = fakeKV({ 'k:stale': JSON.stringify([{ id: 'old' }]) });
    const out = await cached(kv, 'k', 60, async () => { throw new Error('boom'); });
    expect(out).toEqual([{ id: 'old' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/cache.ts`**

The stale copy is written with a long TTL so an API outage degrades to yesterday's news rather than an empty page.

```ts
export function newsCacheKey(category = 'top'): string {
  return `news:v1:${category}`;
}

export function factCheckCacheKey(claim: string): string {
  const norm = claim.trim().toLowerCase().replace(/\s+/g, ' ');
  return `fc:v1:${norm.slice(0, 200)}`;
}

const STALE_TTL = 60 * 60 * 24;

export async function cached<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T | null> {
  const hit = await kv.get(key);
  if (hit) return JSON.parse(hit) as T;

  try {
    const fresh = await produce();
    await kv.put(key, JSON.stringify(fresh), { expirationTtl: ttlSeconds });
    await kv.put(`${key}:stale`, JSON.stringify(fresh), { expirationTtl: STALE_TTL });
    return fresh;
  } catch {
    const stale = await kv.get(`${key}:stale`);
    return stale ? (JSON.parse(stale) as T) : null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/cache.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache.ts tests/cache.test.ts
git commit -m "feat: add KV cache helper with stale-on-error fallback"
```

### Task 11: The `/api/news` endpoint

**Files:**
- Create: `src/pages/api/news.ts`

- [ ] **Step 1: Write `src/pages/api/news.ts`**

```ts
import type { APIRoute } from 'astro';
import { fetchNewsData } from '../../lib/news/newsdata';
import { fetchRssFallback } from '../../lib/news/rss';
import { cached, newsCacheKey } from '../../lib/cache';
import type { Article } from '../../lib/news/types';

const TTL = 20 * 60;

export const GET: APIRoute = async ({ url, locals }) => {
  const env = (locals as any).runtime.env;
  const category = url.searchParams.get('category') ?? 'top';

  const articles = await cached<Article[]>(env.NEWZ_CACHE, newsCacheKey(category), TTL, async () => {
    try {
      const fresh = await fetchNewsData(env.NEWSDATA_API_KEY, category);
      if (fresh.length > 0) return fresh;
      throw new Error('empty');
    } catch {
      return await fetchRssFallback();
    }
  });

  return new Response(JSON.stringify({ articles: articles ?? [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 2: Run locally**

Run: `npm run preview`
Then in another terminal: `curl "http://localhost:8787/api/news"`
Expected: `200` with a JSON body containing an `articles` array. **Not 405.**

If it returns 405, Phase 1 did not take effect — recheck `output: 'server'` and that `dist/server` is non-empty.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/news.ts
git commit -m "feat: add /api/news with cache and RSS fallback"
```

### Task 12: Render real articles

**Files:**
- Modify: `src/components/NewsFeed.astro`, `src/pages/index.astro`

- [ ] **Step 1: Replace the `mockArticles` array in `NewsFeed.astro`**

Delete the hardcoded array and fetch in the frontmatter:

```astro
---
import type { Article } from '../lib/news/types';
const { category = 'top' } = Astro.props;
const env = (Astro.locals as any).runtime.env;

let articles: Article[] = [];
try {
  const res = await fetch(new URL(`/api/news?category=${category}`, Astro.url));
  if (res.ok) articles = (await res.json()).articles;
} catch { /* leave empty; the template renders an empty state */ }
---
```

- [ ] **Step 2: Render the empty state honestly**

```astro
{articles.length === 0 ? (
  <p class="text-sm opacity-70">
    Headlines are temporarily unavailable. Please check back shortly.
  </p>
) : (
  articles.map((a) => (
    <article>
      <a href={a.url} rel="noopener noreferrer" target="_blank">{a.title}</a>
      <p>{a.summary}</p>
      <span>{a.source}</span>
    </article>
  ))
)}
```

- [ ] **Step 3: Remove every false verification claim**

Delete the `AI Verified` badge, the `SARVAM AI VERIFIED WIRE STREAM` heading, and the `Listen` button (it called `/api/v1/tts`, which does not exist). Nothing in this feed has been verified by anything.

Run: `grep -rn "AI Verified\|SARVAM\|api/v1/tts\|factcheck/.*chat" src/`
Expected: no output.

- [ ] **Step 4: Build and view**

Run: `npm run preview`
Expected: real headlines. Reload after 20 minutes, or change `category`, and the list changes.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewsFeed.astro src/pages/index.astro
git commit -m "feat!: render live articles and drop unearned verification badges

The feed rendered six hardcoded articles labelled AI Verified under a
SARVAM AI VERIFIED WIRE STREAM heading. Nothing had been verified."
```

### Task 13: Honest ticker

**Files:**
- Create: `src/pages/api/ticker.ts`
- Modify: `src/components/MastheadInfoStrip.astro`

- [ ] **Step 1: Write `src/pages/api/ticker.ts`**

```ts
import type { APIRoute } from 'astro';

const SYMBOLS = { sensex: '%5EBSESN', nifty: '%5ENSEI' };

async function quote(symbol: string) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const meta = (await res.json())?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('no price');
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  return {
    price: meta.regularMarketPrice,
    changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : null,
  };
}

export const GET: APIRoute = async () => {
  try {
    const [sensex, nifty] = await Promise.all([quote(SYMBOLS.sensex), quote(SYMBOLS.nifty)]);
    return new Response(JSON.stringify({ sensex, nifty }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Replace the hardcoded ticker in `MastheadInfoStrip.astro`**

Remove the literal `81,450 ▲ (+0.35%)` text. Add a container that starts hidden and a client script that reveals it only on success:

```astro
<span id="ticker" hidden></span>
<script>
  fetch('/api/ticker')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d) => {
      const el = document.getElementById('ticker');
      if (!el) return;
      const fmt = (n, label) =>
        `${label} ${n.price.toFixed(2)}${n.changePct === null ? '' : ` (${n.changePct >= 0 ? '+' : ''}${n.changePct.toFixed(2)}%)`}`;
      el.textContent = `${fmt(d.sensex, 'SENSEX')} · ${fmt(d.nifty, 'NIFTY')}`;
      el.hidden = false;
    })
    .catch(() => { /* stays hidden - never show invented numbers */ });
</script>
```

- [ ] **Step 3: Verify the failure path**

Temporarily change the fetch URL to `/api/ticker-nope`, reload, and confirm the ticker area is empty rather than showing stale numbers. Restore the URL.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/ticker.ts src/components/MastheadInfoStrip.astro
git commit -m "fix: wire market ticker to live quotes, hide it on failure

The strip showed a hardcoded 81,450 (+0.35%) inside a live masthead."
```

---

# Phase 4 — Fact Check interface

### Task 14: Verdict types and rating normalization

**Files:**
- Create: `src/lib/factcheck/types.ts`, `src/lib/factcheck/verdict.ts`
- Test: `tests/factcheck/verdict.test.ts`

- [ ] **Step 1: Write `src/lib/factcheck/types.ts`**

```ts
export type Verdict = 'verified' | 'misleading' | 'false' | 'insufficient_evidence';

export interface Evidence {
  title: string;
  url: string;
  publisher: string;
  rating?: string;
}

export interface FactCheckResult {
  verdict: Verdict;
  explanation: string;
  evidence: Evidence[];
  /** 'certified' = a published fact-checker reviewed this claim.
   *  'ai_assessment' = generated by a model over retrieved snippets. */
  basis: 'certified' | 'ai_assessment' | 'none';
}
```

- [ ] **Step 2: Write the failing test at `tests/factcheck/verdict.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeRating, coerceVerdict, insufficient } from '../../src/lib/factcheck/verdict';

describe('normalizeRating', () => {
  it('maps false-ish ratings', () => {
    expect(normalizeRating('False')).toBe('false');
    expect(normalizeRating('Pants on Fire')).toBe('false');
    expect(normalizeRating('FAKE')).toBe('false');
  });
  it('maps misleading ratings', () => {
    expect(normalizeRating('Misleading')).toBe('misleading');
    expect(normalizeRating('Partly false')).toBe('misleading');
  });
  it('maps true ratings', () => {
    expect(normalizeRating('True')).toBe('verified');
    expect(normalizeRating('Correct')).toBe('verified');
  });
  it('never guesses on an unknown rating', () => {
    expect(normalizeRating('Mostly cromulent')).toBe('insufficient_evidence');
    expect(normalizeRating('')).toBe('insufficient_evidence');
  });
});

describe('coerceVerdict', () => {
  it('accepts the four valid enum values verbatim', () => {
    expect(coerceVerdict('verified')).toBe('verified');
    expect(coerceVerdict('misleading')).toBe('misleading');
    expect(coerceVerdict('false')).toBe('false');
    expect(coerceVerdict('insufficient_evidence')).toBe('insufficient_evidence');
  });
  it('rejects anything else', () => {
    expect(coerceVerdict('mostly true')).toBe('insufficient_evidence');
    expect(coerceVerdict(undefined)).toBe('insufficient_evidence');
  });
});

describe('insufficient', () => {
  it('carries no evidence and no basis', () => {
    const r = insufficient('nothing found');
    expect(r.verdict).toBe('insufficient_evidence');
    expect(r.evidence).toEqual([]);
    expect(r.basis).toBe('none');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/factcheck/verdict.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `src/lib/factcheck/verdict.ts`**

```ts
import type { FactCheckResult, Verdict } from './types';

const FALSE_WORDS = ['false', 'fake', 'pants on fire', 'incorrect', 'debunked', 'hoax', 'no evidence'];
const MISLEADING_WORDS = ['misleading', 'partly', 'partially', 'half', 'mixture', 'exaggerated', 'out of context'];
const TRUE_WORDS = ['true', 'correct', 'accurate', 'confirmed'];

export function normalizeRating(rating: string): Verdict {
  const r = (rating ?? '').trim().toLowerCase();
  if (!r) return 'insufficient_evidence';
  if (MISLEADING_WORDS.some((w) => r.includes(w))) return 'misleading';
  if (FALSE_WORDS.some((w) => r.includes(w))) return 'false';
  if (TRUE_WORDS.some((w) => r.includes(w))) return 'verified';
  return 'insufficient_evidence';
}

const VALID: Verdict[] = ['verified', 'misleading', 'false', 'insufficient_evidence'];

/** Validates a value that is already supposed to BE a Verdict (e.g. model JSON output).
 *  Distinct from normalizeRating, which translates human-readable fact-checker
 *  ratings like "Pants on Fire". Do not substitute one for the other:
 *  normalizeRating('verified') returns insufficient_evidence, because 'verified'
 *  is not a phrase fact-checkers publish. */
export function coerceVerdict(value: unknown): Verdict {
  return VALID.includes(value as Verdict) ? (value as Verdict) : 'insufficient_evidence';
}

export function insufficient(explanation: string): FactCheckResult {
  return { verdict: 'insufficient_evidence', explanation, evidence: [], basis: 'none' };
}
```

Note the ordering in `normalizeRating`: misleading is tested before false, because "partly false" contains "false" and must not be classified as outright false.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/factcheck/verdict.test.ts`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/factcheck tests/factcheck
git commit -m "feat: add verdict types and rating normalization

Unknown ratings map to insufficient_evidence, never to verified."
```

### Task 15: Google Fact Check Tools client

**Files:**
- Create: `src/lib/factcheck/google.ts`
- Test: `tests/factcheck/google.test.ts`

- [ ] **Step 1: Write the failing test at `tests/factcheck/google.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseGoogleClaims } from '../../src/lib/factcheck/google';

describe('parseGoogleClaims', () => {
  it('builds a certified result from a claim review', () => {
    const raw = {
      claims: [
        {
          text: 'COVID vaccines contain microchips',
          claimReview: [
            {
              publisher: { name: 'Boom Live', site: 'boomlive.in' },
              url: 'https://boomlive.in/x',
              title: 'No, vaccines do not contain microchips',
              textualRating: 'False',
            },
          ],
        },
      ],
    };
    const out = parseGoogleClaims(raw)!;
    expect(out.verdict).toBe('false');
    expect(out.basis).toBe('certified');
    expect(out.evidence[0].publisher).toBe('Boom Live');
    expect(out.evidence[0].url).toBe('https://boomlive.in/x');
  });

  it('returns null when there are no claims', () => {
    expect(parseGoogleClaims({ claims: [] })).toBeNull();
    expect(parseGoogleClaims({})).toBeNull();
  });

  it('returns null when the rating is unrecognized, rather than guessing', () => {
    const raw = {
      claims: [{ claimReview: [{ publisher: { name: 'X' }, url: 'https://x.com', textualRating: 'Spicy' }] }],
    };
    expect(parseGoogleClaims(raw)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/factcheck/google.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/factcheck/google.ts`**

```ts
import type { FactCheckResult } from './types';
import { normalizeRating } from './verdict';

const ENDPOINT = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';

export function parseGoogleClaims(raw: any): FactCheckResult | null {
  const claims = Array.isArray(raw?.claims) ? raw.claims : [];
  for (const claim of claims) {
    const review = claim?.claimReview?.[0];
    if (!review?.url) continue;

    const verdict = normalizeRating(review.textualRating ?? '');
    if (verdict === 'insufficient_evidence') continue;

    return {
      verdict,
      explanation: review.title ?? claim.text ?? 'Reviewed by a published fact-checker.',
      basis: 'certified',
      evidence: [
        {
          title: review.title ?? claim.text ?? 'Fact check',
          url: review.url,
          publisher: review.publisher?.name ?? review.publisher?.site ?? 'Unknown',
          rating: review.textualRating,
        },
      ],
    };
  }
  return null;
}

export async function searchGoogleFactCheck(apiKey: string, claim: string): Promise<FactCheckResult | null> {
  const params = new URLSearchParams({ key: apiKey, query: claim, languageCode: 'en' });
  const res = await fetch(`${ENDPOINT}?${params}`);
  if (!res.ok) return null;
  return parseGoogleClaims(await res.json());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/factcheck/google.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/factcheck/google.ts tests/factcheck/google.test.ts
git commit -m "feat: add Google Fact Check Tools client"
```

### Task 16: Resolve the search provider, then implement it

The spec leaves this open. Resolve it here.

**Files:**
- Create: `src/lib/factcheck/search.ts`

- [ ] **Step 1: Check whether Cloudflare offers a native web-search binding**

The account token carries a `websearch.run` scope. Consult current Cloudflare docs (use the `cloudflare` skill, which retrieves live docs rather than relying on memory).

- If a native binding exists: implement `search()` against it and add the binding to `wrangler.jsonc`.
- If not: sign up at tavily.com, add `TAVILY_API_KEY` via `npx wrangler secret put TAVILY_API_KEY`, and implement against Tavily.

Record which you chose in a comment at the top of the file.

- [ ] **Step 2: Write `src/lib/factcheck/search.ts` against this interface**

Callers depend only on this signature, so the provider stays swappable.

```ts
export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

// Tavily implementation. Swap the body if moving to a native Cloudflare binding.
export async function search(apiKey: string, query: string): Promise<SearchHit[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: 'basic' }),
  });
  if (!res.ok) return [];
  const data: any = await res.json();
  return (data?.results ?? []).map((r: any) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    snippet: String(r.content ?? ''),
  }));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/factcheck/search.ts wrangler.jsonc
git commit -m "feat: add web search provider for fact-check grounding"
```

### Task 17: Rate limiting

**Files:**
- Create: `src/lib/ratelimit.ts`
- Test: `tests/ratelimit.test.ts`

- [ ] **Step 1: Write the failing test at `tests/ratelimit.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { checkRateLimit } from '../src/lib/ratelimit';

function fakeKV(store: Record<string, string> = {}) {
  return {
    get: vi.fn(async (k: string) => store[k] ?? null),
    put: vi.fn(async (k: string, v: string) => { store[k] = v; }),
  } as any;
}

describe('checkRateLimit', () => {
  it('allows the first request', async () => {
    expect(await checkRateLimit(fakeKV(), '1.2.3.4', 5)).toBe(true);
  });

  it('blocks once the limit is reached', async () => {
    const kv = fakeKV({ 'rl:1.2.3.4': '5' });
    expect(await checkRateLimit(kv, '1.2.3.4', 5)).toBe(false);
  });

  it('allows when under the limit', async () => {
    const kv = fakeKV({ 'rl:1.2.3.4': '2' });
    expect(await checkRateLimit(kv, '1.2.3.4', 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ratelimit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/ratelimit.ts`**

```ts
const WINDOW_SECONDS = 60 * 60;

export async function checkRateLimit(kv: KVNamespace, ip: string, limit: number): Promise<boolean> {
  const key = `rl:${ip}`;
  const current = Number((await kv.get(key)) ?? '0');
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS });
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ratelimit.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ratelimit.ts tests/ratelimit.test.ts
git commit -m "feat: add KV-backed per-IP rate limit"
```

### Task 17b: Article URL text extraction

The Article URL tab must turn a link into checkable text. Workers have no DOM parser, so this strips markup with regex — adequate for extracting prose from an article page.

**Files:**
- Create: `src/lib/factcheck/extract.ts`
- Test: `tests/factcheck/extract.test.ts`

- [ ] **Step 1: Write the failing test at `tests/factcheck/extract.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { extractReadableText } from '../../src/lib/factcheck/extract';

describe('extractReadableText', () => {
  it('strips tags and returns prose', () => {
    const html = `<html><body><h1>Repo rate held</h1><p>The RBI kept rates at 6.5 percent.</p></body></html>`;
    const out = extractReadableText(html);
    expect(out).toContain('Repo rate held');
    expect(out).toContain('The RBI kept rates at 6.5 percent.');
    expect(out).not.toContain('<p>');
  });

  it('drops script and style contents', () => {
    const html = `<body><script>var x = "danger";</script><style>.a{color:red}</style><p>Real text.</p></body>`;
    const out = extractReadableText(html);
    expect(out).toBe('Real text.');
  });

  it('decodes common entities', () => {
    expect(extractReadableText('<p>Tata &amp; Sons said &quot;yes&quot;</p>')).toBe('Tata & Sons said "yes"');
  });

  it('truncates very long documents', () => {
    const html = `<p>${'word '.repeat(5000)}</p>`;
    expect(extractReadableText(html).length).toBeLessThanOrEqual(4000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/factcheck/extract.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/factcheck/extract.ts`**

```ts
const MAX_CHARS = 4000;

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

export function extractReadableText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}

export async function fetchArticleText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http and https URLs are supported.');
  }
  const res = await fetch(parsed.toString(), {
    headers: { 'user-agent': 'NewzWale-FactCheck/1.0' },
  });
  if (!res.ok) throw new Error(`Could not fetch the article (${res.status}).`);
  return extractReadableText(await res.text());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/factcheck/extract.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/factcheck/extract.ts tests/factcheck/extract.test.ts
git commit -m "feat: add article URL text extraction for the URL fact-check tab"
```

### Task 18: The `/api/factcheck` endpoint

**Files:**
- Create: `src/pages/api/factcheck.ts`

- [ ] **Step 1: Write `src/pages/api/factcheck.ts`**

```ts
import type { APIRoute } from 'astro';
import { searchGoogleFactCheck } from '../../lib/factcheck/google';
import { search } from '../../lib/factcheck/search';
import { insufficient, coerceVerdict } from '../../lib/factcheck/verdict';
import { fetchArticleText } from '../../lib/factcheck/extract';
import { factCheckCacheKey } from '../../lib/cache';
import { checkRateLimit } from '../../lib/ratelimit';
import type { FactCheckResult } from '../../lib/factcheck/types';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const RATE_LIMIT = 20;
const CACHE_TTL = 60 * 60 * 24;

const SYSTEM = `You assess claims against supplied evidence snippets.
Reply with JSON only: {"verdict":"verified"|"misleading"|"false"|"insufficient_evidence","explanation":"<2 sentences>"}
Base your answer ONLY on the snippets. If they do not clearly address the claim, answer insufficient_evidence.
Never guess. Never use outside knowledge.`;

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = (locals as any).runtime.env;
  const kv = env.NEWZ_CACHE;

  if (!(await checkRateLimit(kv, clientAddress ?? 'unknown', RATE_LIMIT))) {
    return json({ error: 'Rate limit reached. Try again later.' }, 429);
  }

  // Body is either { claim } from the Text tab or { url } from the Article URL tab.
  let claim = '';
  try {
    const body = (await request.json()) as any;
    if (body?.url) {
      claim = await fetchArticleText(String(body.url));
    } else {
      claim = String(body?.claim ?? '').trim();
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Invalid request body.' }, 400);
  }
  if (claim.length < 10) return json({ error: 'Claim is too short to check.' }, 400);

  const cacheKey = factCheckCacheKey(claim);
  const hit = await kv.get(cacheKey);
  if (hit) return json(JSON.parse(hit), 200);

  const result = await runPipeline(env, claim);
  await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL });
  return json(result, 200);
};

async function runPipeline(env: any, claim: string): Promise<FactCheckResult> {
  // Stage 1 - a published fact-checker already reviewed this claim.
  try {
    const certified = await searchGoogleFactCheck(env.GOOGLE_FACTCHECK_API_KEY, claim);
    if (certified) return certified;
  } catch { /* fall through to stage 2 */ }

  // Stage 2 - retrieve current evidence.
  let hits: Awaited<ReturnType<typeof search>> = [];
  try {
    hits = await search(env.TAVILY_API_KEY, claim);
  } catch { /* fall through */ }

  if (hits.length === 0) {
    return insufficient('No published fact-check and no supporting sources were found for this claim.');
  }

  // Stage 3 - reason over the retrieved snippets only.
  try {
    const context = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.snippet}`).join('\n\n');
    const ai = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `CLAIM: ${claim}\n\nEVIDENCE:\n${context}` },
      ],
    });

    const parsed = JSON.parse(String(ai.response).match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const verdict = coerceVerdict(parsed.verdict);
    if (verdict === 'insufficient_evidence') {
      return { ...insufficient(parsed.explanation ?? 'The retrieved sources do not clearly address this claim.'), evidence: hits.map(toEvidence) };
    }

    return {
      verdict,
      explanation: String(parsed.explanation ?? ''),
      basis: 'ai_assessment',
      evidence: hits.map(toEvidence),
    };
  } catch {
    return { ...insufficient('Sources were found but could not be assessed.'), evidence: hits.map(toEvidence) };
  }
}

function toEvidence(h: { title: string; url: string }) {
  return { title: h.title, url: h.url, publisher: new URL(h.url).hostname };
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
```

- [ ] **Step 2: Test a known-false claim**

Run: `npm run preview`, then:

```bash
curl -X POST http://localhost:8787/api/factcheck -H "Content-Type: application/json" -d '{"claim":"COVID vaccines contain microchips"}'
```

Expected: `200`, `verdict` is `false` or `misleading`, `evidence[0].url` is a real URL that resolves in a browser.

- [ ] **Step 3: Test an unverifiable claim**

```bash
curl -X POST http://localhost:8787/api/factcheck -H "Content-Type: application/json" -d '{"claim":"My neighbour Ramesh bought seventeen goats on Tuesday"}'
```

Expected: `verdict` is `insufficient_evidence`. **If this returns `verified`, the pipeline is wrong — stop and fix it.** This is the exact failure mode of the old endpoint.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/factcheck.ts
git commit -m "feat: add grounded fact-check endpoint

Three stages: Google Fact Check Tools, then web search, then Workers AI
over retrieved snippets. Unmatched claims return insufficient_evidence
rather than defaulting to verified, and every citation corresponds to a
document fetched during the request."
```

### Task 19: Rewire the fact-check widget

**Files:**
- Modify: `src/components/FactCheckWidget.astro`, `src/pages/verify.astro`

- [ ] **Step 1: Reduce the tabs to three**

Delete the PDF and Voice tab buttons and panels. Keep Text/Claim, Article URL, Image/Screenshot.

- [ ] **Step 2: Add the missing tab-switching script**

None of the tabs ever had a click handler — only the text panel worked.

```html
<script>
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      panels.forEach((p) => { p.hidden = p.id !== `panel-${target}`; });
    });
  });
</script>
```

Ensure each button has `data-tab="text|url|image"` and each panel has a matching `id="panel-text|panel-url|panel-image"`.

- [ ] **Step 3: Point submission at the new endpoint**

Replace the call to `/api/v1/verify/claim` with `/api/factcheck`.

The Text tab posts `{ claim: "<textarea value>" }`. The Article URL tab posts `{ url: "<input value>" }` to the same endpoint — Task 17b handles fetching and extracting it server-side.

- [ ] **Step 4: Render the four verdicts with distinct treatment**

`insufficient_evidence` must read as an honest non-answer, not a soft pass:

```js
const LABELS = {
  verified: 'Verified',
  misleading: 'Misleading',
  false: 'False',
  insufficient_evidence: 'Not enough evidence to judge',
};
```

When `basis === 'ai_assessment'`, show the notice: *"AI assessment based on the sources below — not a certified fact-check."*
When `basis === 'certified'`, show: *"Reviewed by {publisher}."*

- [ ] **Step 5: Delete the fake confidence score and the grounded-chat UI**

Remove the `confidence_score` display (the old endpoint hardcoded 0.95) and the chat block that called `/api/v1/factcheck/{id}/chat`, which never existed.

- [ ] **Step 6: Render evidence as real links**

```html
<ul>
  {result.evidence.map((e) => `<li><a href="${e.url}" target="_blank" rel="noopener noreferrer">${e.title}</a> — ${e.publisher}</li>`)}
</ul>
```

- [ ] **Step 7: Fold the FAQ copy into `verify.astro`**

Add the question/answer text saved in Task 7 as a section below the widget. Delete the "Verification Methodology" section describing NER and multi-source cross-referencing — that was never implemented. Replace it with an accurate description of the three-stage pipeline.

- [ ] **Step 8: Verify in the browser**

Submit "COVID vaccines contain microchips". Expected: a `False` or `Misleading` verdict with clickable sources.
Submit the goats claim. Expected: "Not enough evidence to judge".
Click all three tabs. Expected: each switches panels.

- [ ] **Step 9: Commit**

```bash
git add src/components/FactCheckWidget.astro src/pages/verify.astro
git commit -m "feat!: rewire fact-check widget to the real pipeline

Adds the tab-switching script that never existed - four of five tabs
were inert. Drops the hardcoded 0.95 confidence score and the chat UI
that called a route which was never deployed."
```

---

# Phase 5 — Finish

### Task 20: Contact form, CI, branding

**Files:**
- Modify: `src/pages/contact.astro`, `.github/workflows/deploy.yml`, `src/components/Footer.astro`

- [ ] **Step 1: Replace the decorative contact form**

It calls `preventDefault()` and shows an `alert()`, silently discarding the message. No mail provider is configured. Replace the form with a mailto link:

```astro
<p>Questions or corrections? Email <a href="mailto:yrathore.97.dhn@gmail.com">yrathore.97.dhn@gmail.com</a>.</p>
```

- [ ] **Step 2: Fix `.github/workflows/deploy.yml`**

Remove `|| true` from the check step so failures fail the build, delete the Python/pytest job, rename the workflow to `NewzWale CI`, and add a test step:

```yaml
      - run: npm ci
      - run: npm test
      - run: npx astro check
      - run: npm run build
```

- [ ] **Step 3: Purge stale branding**

Run: `grep -rniI "headlinehub\|uncoshub\|printnewz" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist`
Fix every hit. Expected afterwards: no output.

- [ ] **Step 4: Fix footer stub links**

Most footer links point at `/`. Repoint them to `/`, `/verify`, `/about`, `/contact`, `/privacy`, `/terms`, and delete any link with no destination.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: fix contact form, CI, and stale branding

The CI ran astro check || true and pytest || true, so no failure ever
failed the build, and it had no deploy step."
```

### Task 21: Full verification against production

Run every check from the spec. Do not mark the work complete until all pass.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 2: Deploy**

Run: `npm run deploy`

- [ ] **Step 3: Work through the spec checklist**

Against `https://newzwale.editall.workers.dev`:

| # | Check | Expected |
| --- | --- | --- |
| 1 | `ls dist/server` | non-empty |
| 2 | `POST /api/factcheck` | `200` with JSON, not `405` |
| 3 | `npx wrangler secret list` | correct names only |
| 4 | Claim "COVID vaccines contain microchips" | `false`/`misleading` + a resolving citation URL |
| 5 | The goats claim | `insufficient_evidence` |
| 6 | Home page headlines | change between cache windows |
| 7 | `/admin`, `/profile`, `/settings`, `/saved` | `404` |
| 8 | `grep -rn "api/v1/tts\|factcheck/.*chat" src/` | no output |

- [ ] **Step 4: Report results honestly**

Record the actual output of each check. If any fails, fix it before claiming completion — do not report partial success as success.

---

## Deferred

- **Custom domain.** `newzwale.com` is not owned yet. Once purchased: add it to Cloudflare, bind it to the Worker, and change `site` in `astro.config.mjs`. One line plus a dashboard binding.
- **Image OCR tab.** Task 19 keeps the Image tab in the UI. Wiring Workers AI vision to extract text and feed the pipeline is a follow-up; until then the tab should be disabled with a "coming soon" state rather than silently failing. If that is unacceptable, remove the tab in Task 19 Step 1 alongside PDF and Voice.
