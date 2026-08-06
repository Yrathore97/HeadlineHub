// Browser-only. Saved/bookmarked articles, persisted to localStorage so they
// survive a reload. Never call during SSR - it uses localStorage/window.

export interface SavedArticle {
  href: string;
  headline: string;
}

const SAVED_KEY = 'nz_saved';

export function getSaved(): SavedArticle[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isSaved(href: string): boolean {
  return getSaved().some((a) => a.href === href);
}

/** Adds the article if it isn't saved, removes it if it is. Returns the new
 *  saved state (true = now saved) so the caller can update its own button
 *  without a second lookup. Dispatches `saved-changed` so the header count
 *  and the panel (open or not) stay in sync without polling. */
export function toggleSaved(article: SavedArticle): boolean {
  const current = getSaved();
  const alreadySaved = current.some((a) => a.href === article.href);
  const next = alreadySaved
    ? current.filter((a) => a.href !== article.href)
    : [...current, article];

  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('saved-changed', { detail: { saved: next } }));
  return !alreadySaved;
}
