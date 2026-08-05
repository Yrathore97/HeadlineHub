import { describe, it, expect, vi } from 'vitest';
import { parseWebSearchResults, search } from '../../src/lib/factcheck/search';

describe('parseWebSearchResults', () => {
  it('maps a well-formed Web Search response to hits', () => {
    const raw = {
      items: [
        {
          url: 'https://reuters.com/a',
          title: 'India GDP grows 7.2% in Q1',
          description: 'Official data showed the economy expanded 7.2 percent.',
          lastModifiedDate: '2026-07-30T04:39:48',
        },
        {
          url: 'https://pib.gov.in/b',
          title: 'Government statement on growth',
          description: 'The ministry confirmed the revised figure.',
        },
      ],
      metadata: { query: 'india gdp', requestId: 'abc', latencyMs: 42 },
    };

    const out = parseWebSearchResults(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      title: 'India GDP grows 7.2% in Q1',
      url: 'https://reuters.com/a',
      snippet: 'Official data showed the economy expanded 7.2 percent.',
    });
    expect(out[1].url).toBe('https://pib.gov.in/b');
  });

  it('returns [] for malformed or empty responses', () => {
    expect(parseWebSearchResults({ items: [] })).toEqual([]);
    expect(parseWebSearchResults({})).toEqual([]);
    expect(parseWebSearchResults(null)).toEqual([]);
    expect(parseWebSearchResults(undefined)).toEqual([]);
    expect(parseWebSearchResults('nonsense')).toEqual([]);
    expect(parseWebSearchResults({ items: 'not-an-array' })).toEqual([]);
  });

  it('does not throw when fields are missing, and drops unusable results', () => {
    const raw = {
      items: [
        { url: 'https://ok.com/x', title: 'Has no description' },
        { title: 'No url at all' },
        { url: 'https://nourl-title.com' },
        null,
        'garbage',
      ],
    };

    const out = parseWebSearchResults(raw);
    // Only the entry carrying both a url and a title survives.
    expect(out).toEqual([
      { title: 'Has no description', url: 'https://ok.com/x', snippet: '' },
    ]);
  });

  it('coerces non-string field values rather than leaking them through', () => {
    const out = parseWebSearchResults({
      items: [{ url: 'https://n.com/1', title: 42, description: 7 }],
    });
    expect(out).toEqual([{ title: '42', url: 'https://n.com/1', snippet: '7' }]);
  });
});

describe('search', () => {
  it('passes the query and a result limit to the binding, and parses the reply', async () => {
    const binding = {
      search: vi.fn().mockResolvedValue({
        items: [{ url: 'https://a.com', title: 'A', description: 'snippet a' }],
        metadata: { query: 'q', requestId: 'r', latencyMs: 1 },
      }),
    };

    const out = await search(binding as unknown as WebSearch, 'is the sky blue');

    expect(binding.search).toHaveBeenCalledWith({ query: 'is the sky blue', limit: 5 });
    expect(out).toEqual([{ title: 'A', url: 'https://a.com', snippet: 'snippet a' }]);
  });

  it('returns [] instead of throwing when the binding rejects', async () => {
    const binding = { search: vi.fn().mockRejectedValue(new Error('upstream down')) };
    await expect(search(binding as unknown as WebSearch, 'q')).resolves.toEqual([]);
  });
});
