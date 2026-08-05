import { describe, it, expect, vi } from 'vitest';
import { newsCacheKey, cached } from '../src/lib/cache';

describe('newsCacheKey', () => {
  it('namespaces by category, language, and page', () => {
    expect(newsCacheKey('business', 'en')).toBe('news:v2:business:en:first:none');
  });

  it('defaults to the top category in English, first page, no query', () => {
    expect(newsCacheKey()).toBe('news:v2:top:en:first:none');
  });

  it('gives different languages different keys', () => {
    expect(newsCacheKey('top', 'hi')).not.toBe(newsCacheKey('top', 'en'));
  });

  it('gives different pages different keys', () => {
    expect(newsCacheKey('top', 'en', 'tok2')).toBe('news:v2:top:en:tok2:none');
    expect(newsCacheKey('top', 'en', 'tok2')).not.toBe(newsCacheKey('top', 'en'));
  });

  it('gives different search queries different keys', () => {
    expect(newsCacheKey('top', 'en', undefined, 'cricket')).toBe('news:v2:top:en:first:cricket');
    expect(newsCacheKey('top', 'en', undefined, 'cricket')).not.toBe(
      newsCacheKey('top', 'en', undefined, 'football'),
    );
    expect(newsCacheKey('top', 'en', undefined, 'cricket')).not.toBe(newsCacheKey('top', 'en'));
  });

  it('normalises query case and whitespace so equivalent searches share a cache entry', () => {
    expect(newsCacheKey('top', 'en', undefined, '  Cricket  ')).toBe(
      newsCacheKey('top', 'en', undefined, 'cricket'),
    );
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
