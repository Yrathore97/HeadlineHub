import { describe, it, expect } from 'vitest';
import { normalizeGuardian } from '../../src/lib/news/guardian';

describe('normalizeGuardian', () => {
  it('maps a Guardian response to Article[]', () => {
    const raw = {
      response: {
        status: 'ok',
        results: [
          {
            id: 'world/2026/aug/07/some-story',
            sectionId: 'world',
            webTitle: 'Some headline',
            webUrl: 'https://www.theguardian.com/world/2026/aug/07/some-story',
            webPublicationDate: '2026-08-07T09:00:00Z',
            fields: { thumbnail: 'https://example.com/img.jpg', trailText: 'A short summary.' },
          },
        ],
      },
    };
    const out = normalizeGuardian(raw);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('world/2026/aug/07/some-story');
    expect(out[0].source).toBe('theguardian');
    expect(out[0].category).toBe('world');
    expect(out[0].imageUrl).toBe('https://example.com/img.jpg');
  });

  it('drops entries with no title or url', () => {
    const raw = { response: { results: [{ id: 'x', webTitle: null, webUrl: null }] } };
    expect(normalizeGuardian(raw)).toHaveLength(0);
  });

  it('returns an empty array when results is missing', () => {
    expect(normalizeGuardian({ response: { status: 'error' } })).toEqual([]);
  });
});
