import { describe, it, expect } from 'vitest';
import { normalizeRating, coerceVerdict, insufficient } from '../../src/lib/factcheck/verdict';

describe('normalizeRating', () => {
  it('maps false-ish ratings', () => {
    expect(normalizeRating('False')).toBe('false');
    expect(normalizeRating('Pants on Fire')).toBe('false');
    expect(normalizeRating('FAKE')).toBe('false');
  });
  it('maps misleading ratings', () => {
    expect(normalizeRating('Misleading')).toBe('misleading');
    expect(normalizeRating('Partly false')).toBe('misleading');
  });
  it('maps true ratings', () => {
    expect(normalizeRating('True')).toBe('verified');
    expect(normalizeRating('Correct')).toBe('verified');
  });
  it('never guesses on an unknown rating', () => {
    expect(normalizeRating('Mostly cromulent')).toBe('insufficient_evidence');
    expect(normalizeRating('')).toBe('insufficient_evidence');
  });
});

describe('coerceVerdict', () => {
  it('accepts the four valid enum values verbatim', () => {
    expect(coerceVerdict('verified')).toBe('verified');
    expect(coerceVerdict('misleading')).toBe('misleading');
    expect(coerceVerdict('false')).toBe('false');
    expect(coerceVerdict('insufficient_evidence')).toBe('insufficient_evidence');
  });
  it('rejects anything else', () => {
    expect(coerceVerdict('mostly true')).toBe('insufficient_evidence');
    expect(coerceVerdict(undefined)).toBe('insufficient_evidence');
  });
});

describe('insufficient', () => {
  it('carries no evidence and no basis', () => {
    const r = insufficient('nothing found');
    expect(r.verdict).toBe('insufficient_evidence');
    expect(r.evidence).toEqual([]);
    expect(r.basis).toBe('none');
  });
});
