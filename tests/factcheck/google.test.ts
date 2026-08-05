import { describe, it, expect } from 'vitest';
import { parseGoogleClaims } from '../../src/lib/factcheck/google';

describe('parseGoogleClaims', () => {
  it('builds a certified result from a claim review', () => {
    const raw = {
      claims: [
        {
          text: 'COVID vaccines contain microchips',
          claimReview: [
            {
              publisher: { name: 'Boom Live', site: 'boomlive.in' },
              url: 'https://boomlive.in/x',
              title: 'No, vaccines do not contain microchips',
              textualRating: 'False',
            },
          ],
        },
      ],
    };
    const out = parseGoogleClaims(raw)!;
    expect(out.verdict).toBe('false');
    expect(out.basis).toBe('certified');
    expect(out.evidence[0].publisher).toBe('Boom Live');
    expect(out.evidence[0].url).toBe('https://boomlive.in/x');
  });

  it('returns null when there are no claims', () => {
    expect(parseGoogleClaims({ claims: [] })).toBeNull();
    expect(parseGoogleClaims({})).toBeNull();
  });

  it('returns null when the rating is unrecognized, rather than guessing', () => {
    const raw = {
      claims: [{ claimReview: [{ publisher: { name: 'X' }, url: 'https://x.com', textualRating: 'Spicy' }] }],
    };
    expect(parseGoogleClaims(raw)).toBeNull();
  });
});
