/** Cache key for one page of one category (or search query) in one language.
 *
 *  v2 because v1 keyed on category ONLY - it would serve a Hindi reader the
 *  cached English feed. The version bump also avoids reading v1 entries, which
 *  were written under the old value shape (a bare Article[], not a NewsPage).
 *
 *  `q` gets its own slot rather than overloading `category`: a search ignores
 *  category entirely (see /api/news), so folding it into that slot would
 *  collide two conceptually different requests onto one key. */
export function newsCacheKey(category = 'top', language = 'en', page?: string, q?: string): string {
  const querySlot = q ? encodeURIComponent(q.trim().toLowerCase().slice(0, 100)) : 'none';
  return `news:v2:${category}:${language}:${page ?? 'first'}:${querySlot}`;
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
