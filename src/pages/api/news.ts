import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { fetchNewsData } from '../../lib/news/newsdata';
import { fetchRssFallback } from '../../lib/news/rss';
import { cached, newsCacheKey } from '../../lib/cache';
import type { Article } from '../../lib/news/types';

const TTL = 20 * 60;

export const GET: APIRoute = async ({ url }) => {
  const category = url.searchParams.get('category') ?? 'top';
  const apiKey = (env as unknown as { NEWSDATA_API_KEY?: string }).NEWSDATA_API_KEY ?? '';

  const articles = await cached<Article[]>(env.NEWZ_CACHE, newsCacheKey(category), TTL, async () => {
    try {
      const fresh = await fetchNewsData(apiKey, { category });
      if (fresh.articles.length > 0) return fresh.articles;
      throw new Error('empty');
    } catch {
      const fallback = await fetchRssFallback();
      // Throw rather than return [] so cached() can serve its stale copy
      // instead of caching an empty feed for the full TTL.
      if (fallback.length === 0) throw new Error('no articles');
      return fallback;
    }
  });

  return new Response(JSON.stringify({ articles: articles ?? [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
