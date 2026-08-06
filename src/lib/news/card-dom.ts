// Browser-only. Builds one article card as a DOM element, for client scripts
// that append cards without a full page navigation (Load more, homepage
// search). Never call this during SSR - it uses `document`.
//
// Kept separate from feed.ts so that module stays pure/SSR-safe. Shares the
// same markup and classes as ArticleCard.astro's server-rendered output, so
// a client-appended card is visually identical to one the server rendered.

export interface CardArticle {
  id: string;
  title: string;
  url: string;
  summary: string;
  imageUrl: string | null;
  source: string;
  category: string;
  publishedAt: string;
}

export function formatPublishedClient(value: string): string {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return '';
  // floor, not round: matches src/lib/news/feed.ts's formatPublished, which
  // never reports an elapsed time as MORE than it actually is.
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(t).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export function isSafeUrlClient(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

// Built with createElement + textContent throughout. Never innerHTML: a
// headline is third-party text and would otherwise be an injection vector.
export function buildArticleCardElement(a: CardArticle): HTMLElement {
  const el = document.createElement('article');
  el.dataset.articleId = a.id;
  el.className =
    'article-card bg-surface-elevated border border-hairline rounded-md overflow-hidden shadow-stacked-sm hover:shadow-stacked-md hover:border-primary transition-[box-shadow,border-color] flex flex-col group';

  if (a.imageUrl && isSafeUrlClient(a.imageUrl)) {
    const wrap = document.createElement('div');
    wrap.className = 'relative h-44 w-full overflow-hidden bg-surface-card';
    const img = document.createElement('img');
    img.src = a.imageUrl;
    img.alt = '';
    img.width = 400;
    img.height = 176;
    img.loading = 'lazy';
    img.className = 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-300';
    const badge = document.createElement('div');
    badge.className =
      'absolute top-3 left-3 bg-surface-elevated/90 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize text-ink border border-hairline flex items-center gap-1.5 shadow-stacked-sm';
    const dot = document.createElement('span');
    dot.className = 'w-1.5 h-1.5 rounded-full bg-primary';
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(a.category));
    wrap.appendChild(img);
    wrap.appendChild(badge);
    el.appendChild(wrap);
  }

  const body = document.createElement('div');
  body.className = 'p-4 flex-1 flex flex-col justify-between space-y-3';

  const top = document.createElement('div');

  const src = document.createElement('div');
  src.className = 'text-[11px] font-mono text-mute mb-1.5';
  src.textContent = a.source;

  const h3 = document.createElement('h3');
  h3.className =
    'article-headline text-base font-semibold text-ink leading-snug tracking-[-0.3px] mb-2 group-hover:text-primary-strong transition-colors';
  const link = document.createElement('a');
  link.href = a.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong rounded-sm';
  link.textContent = a.title;
  h3.appendChild(link);

  top.appendChild(src);
  top.appendChild(h3);

  if (a.summary) {
    const p = document.createElement('p');
    p.className = 'article-short-news text-xs text-body leading-relaxed line-clamp-3';
    p.textContent = a.summary;
    top.appendChild(p);
  }

  const foot = document.createElement('div');
  foot.className = 'pt-3 border-t border-hairline flex items-center justify-between text-xs';
  const when = document.createElement('span');
  when.className = 'font-mono text-mute';
  when.textContent = formatPublishedClient(a.publishedAt);
  const read = document.createElement('a');
  read.href = a.url;
  read.target = '_blank';
  read.rel = 'noopener noreferrer';
  read.className =
    'px-3 py-1 bg-ink hover:bg-charcoal text-canvas text-xs font-semibold rounded-md shadow-stacked-sm transition-colors flex items-center gap-1.5';
  read.textContent = 'Read at source';
  foot.appendChild(when);
  foot.appendChild(read);

  body.appendChild(top);
  body.appendChild(foot);
  el.appendChild(body);
  return el;
}
