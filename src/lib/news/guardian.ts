import type { Article } from './types';

const ENDPOINT = 'https://content.guardianapis.com/search';

// Guardian's section slugs don't line up 1:1 with ours (e.g. "sport" not
// "sports"); categories with no good match fall through to an unfiltered
// newest-first feed rather than a wrong one.
const SECTION_BY_CATEGORY: Record<string, string> = {
  world: 'world',
  business: 'business',
  sports: 'sport',
  entertainment: 'culture',
  technology: 'technology',
  health: 'society',
};

export function normalizeGuardian(raw: any): Article[] {
  const results = Array.isArray(raw?.response?.results) ? raw.response.results : [];
  return results
    .filter((r: any) => r?.webTitle && r?.webUrl)
    .map((r: any) => ({
      id: String(r.id ?? r.webUrl),
      title: String(r.webTitle),
      url: String(r.webUrl),
      summary: String(r.fields?.trailText ?? ''),
      imageUrl: r.fields?.thumbnail ? String(r.fields.thumbnail) : null,
      source: 'theguardian',
      category: String(r.sectionId ?? 'top'),
      publishedAt: String(r.webPublicationDate ?? ''),
    }));
}

/** Second-tier fallback behind NewsData, ahead of RSS. No pagination -
 *  same "first page only" scope as the RSS fallback, since this only runs
 *  when the primary source is down or empty. */
export async function fetchGuardianFallback(apiKey: string, category?: string): Promise<Article[]> {
  const params = new URLSearchParams({
    'api-key': apiKey,
    'order-by': 'newest',
    'page-size': '20',
    'show-fields': 'thumbnail,trailText',
  });
  const section = category ? SECTION_BY_CATEGORY[category] : undefined;
  if (section) params.set('section', section);

  const res = await fetch(`${ENDPOINT}?${params}`);
  if (!res.ok) throw new Error(`Guardian ${res.status}`);

  return normalizeGuardian(await res.json());
}
