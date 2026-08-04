import { describe, it, expect } from 'vitest';
import { parseRss } from '../../src/lib/news/rss';

const SAMPLE = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>ISRO launches NavIC satellite</title>
    <link>https://example.com/isro</link>
    <description>A routine launch from Sriharikota.</description>
    <pubDate>Tue, 05 Aug 2026 04:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe('parseRss', () => {
  it('extracts items', () => {
    const out = parseRss(SAMPLE, 'thehindu');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('ISRO launches NavIC satellite');
    expect(out[0].source).toBe('thehindu');
  });

  it('unwraps CDATA titles', () => {
    const xml = `<rss><channel><item><title><![CDATA[Budget 2026]]></title><link>https://e.com/a</link></item></channel></rss>`;
    expect(parseRss(xml, 'mint')[0].title).toBe('Budget 2026');
  });

  it('returns an empty array for malformed input', () => {
    expect(parseRss('not xml', 'x')).toEqual([]);
  });
});
