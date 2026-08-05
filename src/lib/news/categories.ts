/** The categories the site offers. This list is the security boundary for the
 *  `category` query param: a value that is not in here never reaches the
 *  upstream API. */
export interface Category {
  /** URL slug, used as /category/<slug>. */
  slug: string;
  /** Nav label. */
  label: string;
  /** NewsData.io category name, or null to use the API's default feed. */
  upstream: string | null;
}

export const DEFAULT_CATEGORY = 'top';

export const CATEGORIES: Category[] = [
  { slug: 'top', label: 'Top', upstream: null },
  // The whole feed is already country=in, so an "India" tab needs its own
  // upstream category or it just duplicates Top. Confirmed against the live
  // API in Task 1; change or drop this if `politics` proved a poor fit.
  { slug: 'india', label: 'India', upstream: 'politics' },
  { slug: 'world', label: 'World', upstream: 'world' },
  { slug: 'business', label: 'Business', upstream: 'business' },
  { slug: 'sports', label: 'Sports', upstream: 'sports' },
  { slug: 'entertainment', label: 'Entertainment', upstream: 'entertainment' },
  { slug: 'technology', label: 'Technology', upstream: 'technology' },
  { slug: 'health', label: 'Health', upstream: 'health' },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function isValidCategory(slug: unknown): slug is string {
  return typeof slug === 'string' && BY_SLUG.has(slug);
}

/** The upstream category name for a slug, or null when the API default should
 *  be used. Unknown slugs also yield null - never a pass-through. */
export function upstreamCategory(slug: unknown): string | null {
  return isValidCategory(slug) ? (BY_SLUG.get(slug)?.upstream ?? null) : null;
}
