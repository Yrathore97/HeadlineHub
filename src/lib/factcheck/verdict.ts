import type { FactCheckResult, Verdict } from './types';

const FALSE_WORDS = ['false', 'fake', 'pants on fire', 'incorrect', 'debunked', 'hoax', 'no evidence'];
const MISLEADING_WORDS = ['misleading', 'partly', 'partially', 'half', 'mixture', 'exaggerated', 'out of context'];
const TRUE_WORDS = ['true', 'correct', 'accurate', 'confirmed'];

export function normalizeRating(rating: string): Verdict {
  const r = (rating ?? '').trim().toLowerCase();
  if (!r) return 'insufficient_evidence';
  if (MISLEADING_WORDS.some((w) => r.includes(w))) return 'misleading';
  if (FALSE_WORDS.some((w) => r.includes(w))) return 'false';
  if (TRUE_WORDS.some((w) => r.includes(w))) return 'verified';
  return 'insufficient_evidence';
}

const VALID: Verdict[] = ['verified', 'misleading', 'false', 'insufficient_evidence'];

/** Validates a value that is already supposed to BE a Verdict (e.g. model JSON output).
 *  Distinct from normalizeRating, which translates human-readable fact-checker
 *  ratings like "Pants on Fire". Do not substitute one for the other:
 *  normalizeRating('verified') returns insufficient_evidence, because 'verified'
 *  is not a phrase fact-checkers publish. */
export function coerceVerdict(value: unknown): Verdict {
  return VALID.includes(value as Verdict) ? (value as Verdict) : 'insufficient_evidence';
}

export function insufficient(explanation: string): FactCheckResult {
  return { verdict: 'insufficient_evidence', explanation, evidence: [], basis: 'none' };
}
