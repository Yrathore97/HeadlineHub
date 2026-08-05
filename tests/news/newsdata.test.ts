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
