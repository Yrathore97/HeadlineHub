import { describe, it, expect } from 'vitest';
import { contrastRatio, AA_NORMAL_TEXT, AA_LARGE_TEXT } from '../src/lib/contrast';

/** The Subtle Gradient palette, mirroring the @theme block in src/styles/global.css.
 *  If a colour changes there, change it here — these tests are the gate that
 *  stops an unreadable palette from shipping. */
const LIGHT = {
  canvas: '#ffffff',
  surfaceSoft: '#faf9f7',
  surfaceCard: '#f4f3ef',
  ink: '#111111',
  body: '#3a3a35',
  mute: '#686860',
  primary: '#ff6b57',
  primaryStrong: '#cc4430',
  onPrimary: '#ffffff',
};

const DARK = {
  canvas: '#1a1a18',
  surfaceSoft: '#232320',
  surfaceCard: '#2d2d29',
  ink: '#f5f4f1',
  body: '#c9c8c2',
  mute: '#9a9a94',
  primary: '#ff8b7a',
  onPrimary: '#1a1a18',
};

describe('sanity checks against known values', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  it('is order independent', () => {
    expect(contrastRatio('#111111', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#111111'), 5);
  });
});

describe('the raw coral is NOT safe for white text', () => {
  // This is why primaryStrong exists. Documented as a test so nobody
  // "simplifies" it back to the raw brand coral later.
  it('fails AA for normal text, which is the whole reason we darken it', () => {
    expect(contrastRatio(LIGHT.primary, '#ffffff')).toBeLessThan(AA_NORMAL_TEXT);
  });
});

describe('light mode text passes WCAG AA', () => {
  const surfaces = [LIGHT.canvas, LIGHT.surfaceSoft, LIGHT.surfaceCard];

  it('ink on every surface', () => {
    for (const s of surfaces) {
      expect(contrastRatio(LIGHT.ink, s)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('body text on every surface', () => {
    for (const s of surfaces) {
      expect(contrastRatio(LIGHT.body, s)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('muted text on every surface', () => {
    for (const s of surfaces) {
      expect(contrastRatio(LIGHT.mute, s)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('white label on the darkened coral button', () => {
    expect(contrastRatio(LIGHT.onPrimary, LIGHT.primaryStrong)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('coral link text on canvas', () => {
    expect(contrastRatio(LIGHT.primaryStrong, LIGHT.canvas)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('the raw coral is still usable for large decorative shapes', () => {
    expect(contrastRatio(LIGHT.primary, LIGHT.canvas)).toBeGreaterThanOrEqual(2.5);
  });
});

describe('dark mode text passes WCAG AA', () => {
  const surfaces = [DARK.canvas, DARK.surfaceSoft, DARK.surfaceCard];

  it('ink on every surface', () => {
    for (const s of surfaces) {
      expect(contrastRatio(DARK.ink, s)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('body text on every surface', () => {
    for (const s of surfaces) {
      expect(contrastRatio(DARK.body, s)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('muted text on canvas and soft surfaces', () => {
    expect(contrastRatio(DARK.mute, DARK.canvas)).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
    expect(contrastRatio(DARK.mute, DARK.surfaceSoft)).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });

  it('lifted coral reads as link text on dark surfaces', () => {
    for (const s of surfaces) {
      expect(contrastRatio(DARK.primary, s)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('dark ink label on the lifted coral button', () => {
    expect(contrastRatio(DARK.onPrimary, DARK.primary)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
