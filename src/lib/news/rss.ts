import type { Article } from './types';

export const FEEDS: Record<string, string> = {
  thehindu: 'https://www.thehindu.com/news/national/feeder/default.rss',
  indianexpress: 'https://indianexpress.com/section/india/feed/',
  ndtv: 'https://feeds.feedburner.com/ndtvnews-india-news',
  mint: 'https://www.livemint.com/rss/news',
};

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function parseRss(xml: string, source: string): Article[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((block): Article | null => {
      const title = tag(block, 'title');
      const url = tag(block, 'link');
      if (!title || !url) return null;
      return {
        id: url,
        title,
        url,
        summary: tag(block, 'description').slice(0, 300),
        imageUrl: null,
        source,
        category: 'top',
        publishedAt: tag(block, 'pubDate'),
      } satisfies Article;
    })
    .filter((a): a is Article => a !== null);
}

export async function fetchRssFallback(): Promise<Article[]> {
  const settled = await Promise.allSettled(
    Object.entries(FEEDS).map(async ([source, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${source} ${res.status}`);
      return parseRss(await res.text(), source);
    }),
  );
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
