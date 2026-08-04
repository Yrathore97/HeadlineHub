import type { FactCheckResult } from './types';
import { normalizeRating } from './verdict';

const ENDPOINT = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';

export function parseGoogleClaims(raw: any): FactCheckResult | null {
  const claims = Array.isArray(raw?.claims) ? raw.claims : [];
  for (const claim of claims) {
    const review = claim?.claimReview?.[0];
    if (!review?.url) continue;

    const verdict = normalizeRating(review.textualRating ?? '');
    if (verdict === 'insufficient_evidence') continue;

    return {
      verdict,
      explanation: review.title ?? claim.text ?? 'Reviewed by a published fact-checker.',
      basis: 'certified',
      evidence: [
        {
          title: review.title ?? claim.text ?? 'Fact check',
          url: review.url,
          publisher: review.publisher?.name ?? review.publisher?.site ?? 'Unknown',
          rating: review.textualRating,
        },
      ],
    };
  }
  return null;
}

export async function searchGoogleFactCheck(apiKey: string, claim: string): Promise<FactCheckResult | null> {
  const params = new URLSearchParams({ key: apiKey, query: claim, languageCode: 'en' });
  const res = await fetch(`${ENDPOINT}?${params}`);
  if (!res.ok) return null;
  return parseGoogleClaims(await res.json());
}
