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
