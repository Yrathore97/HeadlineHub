import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { searchGoogleFactCheck } from '../../lib/factcheck/google';
import { search, type SearchHit } from '../../lib/factcheck/search';
import { fetchArticleText } from '../../lib/factcheck/extract';
import { coerceVerdict, insufficient } from '../../lib/factcheck/verdict';
import type { Evidence, FactCheckResult } from '../../lib/factcheck/types';
import { factCheckCacheKey } from '../../lib/cache';
import { checkRateLimit } from '../../lib/ratelimit';

// The task specified '@cf/meta/llama-3.1-8b-instruct', but Workers AI now
// answers that id with `AiError: 5028: This model was deprecated on
// 2026-05-30` (verified against the live binding via wrangler dev). Using it
// would make stage 3 throw on every request, so every claim would come back
// insufficient_evidence no matter how good the evidence was. This is the same
// model, same family and same size, on the id that is still served.
const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const RATE_LIMIT = 20; // per IP per hour
const CACHE_TTL = 60 * 60 * 24;

const MIN_CLAIM_CHARS = 10;
const MAX_SOURCES = 3;
const PASSAGE_CHARS = 1500;
/** Search APIs take a query, not a document. When the input came from an
 *  article URL the claim can be thousands of characters, so only its opening
 *  is used to retrieve; the full text still goes to the model. */
const QUERY_CHARS = 300;

// The verdict labels are spelled out because the shorter phrasing is ambiguous
// about WHAT is being judged. Measured against the live model: given the claim
// "COVID vaccines contain microchips" plus two passages debunking it, the
// terser prompt returned {"verdict":"verified"} - the model had graded the
// passages rather than the claim, which is the single worst output this
// endpoint could produce. Naming the subject and stating that a debunk means
// "false" turns that case into {"verdict":"false"} while leaving the
// insufficient_evidence behaviour intact. Re-test these cases before editing.
const SYSTEM = `You assess a CLAIM against supplied evidence passages.
Reply with JSON only: {"verdict":"verified"|"misleading"|"false"|"insufficient_evidence","explanation":"<2 sentences>"}

The verdict describes the CLAIM itself - never the quality, credibility or usefulness of the passages.
Choose exactly one:
- "verified": the passages state that the claim is true.
- "false": the passages contradict, refute, debunk or deny the claim.
- "misleading": the passages show the claim is partly true but distorted, exaggerated or missing context.
- "insufficient_evidence": the passages do not clearly address the claim either way.

A passage that debunks the claim means the verdict is "false", NOT "verified".
Base your answer ONLY on the passages. Never guess. Never use outside knowledge.`;

const NO_EVIDENCE =
  'No published fact-check and no supporting sources could be retrieved for this claim, so it cannot be assessed. That is not a judgement that the claim is false - only that there is nothing to check it against.';

const UNREADABLE =
  'Sources were found but could not be read closely enough to assess the claim. The retrieved links are listed below so you can judge them yourself.';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function publisherOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}

type ModelPayload = { verdict?: unknown; explanation?: unknown };

/** Pulls the first JSON object out of a model reply that may be wrapped in prose
 *  or a fenced code block. Returns null rather than guessing at a verdict. */
function parseModelJson(text: string): ModelPayload | null {
  // Non-greedy first (stops at the first closing brace, which is the common
  // shape here), then greedy as a fallback for nested objects.
  for (const re of [/\{[\s\S]*?\}/, /\{[\s\S]*\}/]) {
    const match = text.match(re);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object') return parsed as ModelPayload;
    } catch {
      // try the next shape
    }
  }
  return null;
}

/** Workers AI is not consistent about response shape across models: the older
 *  text-generation models return `{ response: "<text>" }`, while the
 *  OpenAI-compatible ones return `choices[].message.content` and sometimes a
 *  pre-parsed `response` object. Handle all three so swapping MODEL later does
 *  not silently degrade every answer to insufficient_evidence. */
function payloadFromAi(raw: unknown): ModelPayload | null {
  if (typeof raw === 'string') return parseModelJson(raw);
  if (!raw || typeof raw !== 'object') return null;

  const r = raw as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
  };

  if (typeof r.response === 'string') return parseModelJson(r.response);
  // Already-parsed object form.
  if (r.response && typeof r.response === 'object') return r.response as ModelPayload;

  const content = r.choices?.[0]?.message?.content;
  if (typeof content === 'string') return parseModelJson(content);

  return null;
}

/** Resolves the request body into the text to be checked. */
async function resolveClaim(body: unknown): Promise<string> {
  const { claim, url } = (body ?? {}) as { claim?: unknown; url?: unknown };

  if (typeof url === 'string' && url.trim()) {
    // fetchArticleText validates the scheme and rejects private/loopback hosts.
    return (await fetchArticleText(url.trim())).trim();
  }
  if (typeof claim === 'string') return claim.trim();
  return '';
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Invalid JSON body.' }, 400);
  }

  // Rate limit before any outbound work, so the article fetch below cannot be
  // used as an unmetered proxy.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!(await checkRateLimit(env.NEWZ_CACHE, ip, RATE_LIMIT))) {
    return json({ error: 'Too many checks from this address. Try again in an hour.' }, 429);
  }

  let claim: string;
  try {
    claim = await resolveClaim(body);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Could not read that URL.' }, 400);
  }

  if (claim.length < MIN_CLAIM_CHARS) {
    return json({ error: `Give at least ${MIN_CLAIM_CHARS} characters to check.` }, 400);
  }

  const cacheKey = factCheckCacheKey(claim);
  const hit = await env.NEWZ_CACHE.get(cacheKey);
  if (hit) {
    try {
      return json(JSON.parse(hit) as FactCheckResult);
    } catch {
      // Corrupt cache entry - fall through and recompute.
    }
  }

  const result = await runPipeline(claim);
  await env.NEWZ_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL });
  return json(result);
};

async function runPipeline(claim: string): Promise<FactCheckResult> {
  const query = claim.slice(0, QUERY_CHARS);

  // ---- Stage 1: a real fact-checker already reviewed this claim. -----------
  const googleKey =
    (env as unknown as { GOOGLE_FACTCHECK_API_KEY?: string }).GOOGLE_FACTCHECK_API_KEY ?? '';
  if (googleKey) {
    try {
      const certified = await searchGoogleFactCheck(googleKey, query);
      if (certified) return certified;
    } catch {
      // Certified review is an optimisation, not a requirement - fall through.
    }
  }

  // ---- Stage 2: retrieve evidence. ----------------------------------------
  // Web Search is discovery-only: it never returns page bodies, and `snippet`
  // is just the page-level meta description. Reasoning over meta descriptions
  // is not grounding, so fetch the actual pages and fall back to the snippet
  // only when a fetch fails.
  const hits = (await search(env.WEBSEARCH, query)).slice(0, MAX_SOURCES);
  const fetched = await Promise.allSettled(hits.map((h) => fetchArticleText(h.url)));

  const passages: { hit: SearchHit; text: string }[] = [];
  hits.forEach((hit, i) => {
    const outcome = fetched[i];
    const page = outcome.status === 'fulfilled' ? outcome.value.trim() : '';
    const text = page || hit.snippet.trim();
    if (text) passages.push({ hit, text: text.slice(0, PASSAGE_CHARS) });
  });

  if (passages.length === 0) return insufficient(NO_EVIDENCE);

  const evidence: Evidence[] = passages.map(({ hit }) => ({
    title: hit.title,
    url: hit.url,
    publisher: publisherOf(hit.url),
  }));

  // ---- Stage 3: reason over the retrieved text only. -----------------------
  const sources = passages
    .map((p, i) => `[Source ${i + 1} - ${evidence[i].publisher}]\n${p.text}`)
    .join('\n\n');

  try {
    const raw = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Claim to assess:\n${claim}\n\nEvidence passages:\n\n${sources}` },
      ],
      // Deterministic: the same claim and the same sources should not produce
      // different verdicts on different days.
      temperature: 0,
      max_tokens: 300,
    });

    const parsed = payloadFromAi(raw);
    if (!parsed) return { ...insufficient(UNREADABLE), evidence };

    // coerceVerdict, NOT normalizeRating: this value is already meant to be a
    // Verdict. normalizeRating translates human phrasing like "Pants on Fire"
    // and would map the literal 'verified' to insufficient_evidence.
    const verdict = coerceVerdict(parsed.verdict);
    const explanation =
      typeof parsed.explanation === 'string' && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : UNREADABLE;

    // Surface the sources either way, so an inconclusive answer still shows
    // the user what was actually read.
    if (verdict === 'insufficient_evidence') {
      return { verdict, explanation, evidence, basis: 'none' };
    }
    return { verdict, explanation, evidence, basis: 'ai_assessment' };
  } catch {
    // A model or binding failure is never grounds for a verdict.
    return { ...insufficient(UNREADABLE), evidence };
  }
}
