import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { fetchNewsData } from '../../lib/news/newsdata';
import { fetchRssFallback } from '../../lib/news/rss';
import { cached, newsCacheKey } from '../../lib/cache';
import { isValidCategory, DEFAULT_CATEGORY } from '../../lib/news/categories';
import { isValidLanguage, DEFAULT_LANGUAGE } from '../../lib/news/languages';
import type { NewsPage } from '../../lib/news/types';

const TTL = 20 * 60;
// NewsData occasionally fails when the call originates from Cloudflare's
// shared Worker egress IPs, even though the identical request succeeds
// reliably from a normal client (observed: ~40% success rate from the Worker
// vs 100% from a plain script, against the same key at the same time). RSS
// fallback content is real content, not an error, so caching it for the full
// 20 minutes would leave a transient failure looking permanent to a reader.
// ponytail: short TTL + a few retries is a mitigation for shared-IP flakiness,
// not a fix for it - if NewsData is hard-blocking the range outright rather
// than probabilistically throttling it, revisit with a different egress path.
const FALLBACK_TTL = 2 * 60;
const NEWSDATA_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  // Free-text search. Bounded for the same reason as page. Trimmed so
  // "cricket" and " cricket " share a cache entry instead of two.
  const q = url.searchParams.get('q')?.trim().slice(0, 200) || undefined;

  const apiKey = (env as unknown as { NEWSDATA_API_KEY?: string }).NEWSDATA_API_KEY ?? '';

  let usedFallback = false;
  const cacheKey = newsCacheKey(category, language, page, q);

  const result = await cached<NewsPage>(env.NEWZ_CACHE, cacheKey, TTL, async () => {
    for (let attempt = 1; attempt <= NEWSDATA_ATTEMPTS; attempt++) {
      try {
        const fresh = await fetchNewsData(apiKey, { category, language, page, q });
        if (fresh.articles.length > 0) return fresh;
      } catch {
        // try again, or fall through below on the last attempt
      }
      if (attempt < NEWSDATA_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }

    // RSS is a fixed set of national feeds with no keyword filtering - it
    // cannot answer a search query. Showing it under a search would show
    // stories unrelated to what the reader typed, which is worse than
    // honestly reporting no results. Category browsing still falls back to
    // it, since RSS at least matches "top" (unfiltered) reasonably well.
    if (q) {
      usedFallback = true;
      throw new Error('search unavailable');
    }

    usedFallback = true;
    // RSS is English-only and unpaginated, so it contributes no nextPage.
    // It is a last resort for the first page only - paging into a fallback
    // that cannot page would return the same articles forever.
    if (page) throw new Error('no further pages');
    const articles = await fetchRssFallback();
    // Throw rather than return [] so cached() can serve its stale copy
    // instead of caching an empty feed for the full TTL.
    if (articles.length === 0) throw new Error('no articles');
    return { articles, nextPage: null };
  });

  if (usedFallback && result) {
    // cached() already wrote this at the full 20-minute TTL above - overwrite
    // it with the short one so the next request retries NewsData soon instead
    // of serving English fallback content for the rest of that window.
    await env.NEWZ_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: FALLBACK_TTL });
  }

  return new Response(
    JSON.stringify({
      articles: result?.articles ?? [],
      nextPage: result?.nextPage ?? null,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
