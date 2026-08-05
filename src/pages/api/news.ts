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
