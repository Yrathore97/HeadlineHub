import { describe, it, expect } from 'vitest';
import { LANGUAGES, isValidLanguage, DEFAULT_LANGUAGE } from '../../src/lib/news/languages';

describe('LANGUAGES', () => {
  it('lists English first as the default', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(LANGUAGES[0].code).toBe('en');
  });

  it('gives every language a two-letter code and a non-empty name', () => {
    for (const l of LANGUAGES) {
      expect(l.code).toMatch(/^[a-z]{2}$/);
      expect(l.name.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate codes', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('isValidLanguage', () => {
  it('accepts every declared code', () => {
    for (const l of LANGUAGES) expect(isValidLanguage(l.code)).toBe(true);
  });

  it('rejects unknown, empty, and injection-shaped values', () => {
    expect(isValidLanguage('xx')).toBe(false);
    expect(isValidLanguage('')).toBe(false);
    expect(isValidLanguage('en&country=us')).toBe(false);
    expect(isValidLanguage('EN')).toBe(false);
    expect(isValidLanguage(null)).toBe(false);
    expect(isValidLanguage(undefined)).toBe(false);
    expect(isValidLanguage(7)).toBe(false);
  });
});
