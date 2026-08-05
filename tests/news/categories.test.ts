import { describe, it, expect } from 'vitest';
import { CATEGORIES, isValidCategory, upstreamCategory, DEFAULT_CATEGORY } from '../../src/lib/news/categories';

describe('CATEGORIES', () => {
  it('exposes eight categories, each with a slug and a label', () => {
    expect(CATEGORIES).toHaveLength(8);
    for (const c of CATEGORIES) {
      expect(c.slug).toMatch(/^[a-z]+$/);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('leads with the default category', () => {
    expect(CATEGORIES[0].slug).toBe(DEFAULT_CATEGORY);
    expect(DEFAULT_CATEGORY).toBe('top');
  });

  it('has no duplicate slugs', () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('isValidCategory', () => {
  it('accepts every declared slug', () => {
    for (const c of CATEGORIES) expect(isValidCategory(c.slug)).toBe(true);
  });

  it('rejects unknown, empty, and injection-shaped values', () => {
    expect(isValidCategory('bogus')).toBe(false);
    expect(isValidCategory('')).toBe(false);
    expect(isValidCategory('top&apikey=leak')).toBe(false);
    expect(isValidCategory('../../etc/passwd')).toBe(false);
    expect(isValidCategory('TOP')).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
    expect(isValidCategory(42)).toBe(false);
  });
});

describe('upstreamCategory', () => {
  it('returns null for top so the API default applies', () => {
    expect(upstreamCategory('top')).toBeNull();
  });

  it('maps a slug to the upstream category name', () => {
    expect(upstreamCategory('business')).toBe('business');
    expect(upstreamCategory('sports')).toBe('sports');
  });

  it('returns null for anything unknown rather than forwarding it', () => {
    expect(upstreamCategory('bogus')).toBeNull();
  });
});
