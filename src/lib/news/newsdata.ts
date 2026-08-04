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
