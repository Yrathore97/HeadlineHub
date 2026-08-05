// Web search provider: Cloudflare Web Search (native binding), NOT Tavily.
//
// WHY: Cloudflare ships a first-party Web Search binding over one shared
// public-web corpus. It needs no third-party account, no extra secret, no
// 1,000/month cap, and bills on the account already running this Worker.
// The account token already carries the `websearch.run` scope, so access is
// live. Declared in wrangler.jsonc as `"websearch": { "binding": "WEBSEARCH" }`
// -- zero-config, a single object rather than an array, because there is
// exactly one corpus and so no namespace or instance to name.
//
// SOURCES CONSULTED (this feature is NOT yet in the public developer docs at
// developers.cloudflare.com -- the bindings index omits it -- so the
// authoritative references are the shipped tooling and runtime types):
//   - node_modules/wrangler/config-schema.json
//     -> definitions.RawConfig.properties.websearch (wrangler 4.118.0):
//        "Cloudflare Web Search binding. There is exactly one shared web
//         corpus, so the binding is zero-config."
//   - worker-configuration.d.ts (workerd@1.20260730.1), `declare abstract
//     class WebSearch`: search(options) -> Promise<{ items, metadata }>.
//   - Verified empirically: `npx wrangler types` accepts the `websearch` key
//     and emits `WEBSEARCH: WebSearch` into the Env interface.
//   - https://developers.cloudflare.com/ai-gateway/usage/web-search/ -- rejected:
//     that proxies OpenAI/Anthropic/Perplexity search and needs their API keys.
//   - https://developers.cloudflare.com/ai-search/ -- rejected: AI Search
//     (formerly AutoRAG) indexes YOUR OWN content, not the live public web.
//
// IMPORTANT CAVEAT: Web Search is discovery-only. It returns URLs and catalog
// metadata but never page bodies or query-matched excerpts. The richest text
// available per result is the page-level `description` (typically the meta
// or og:description), which is what we surface as `snippet`. That is weaker
// grounding than a query-relevant extract, so if stage 3 needs real passages,
// fetch the hit's `url` and run it through `extractReadableText` in
// ./extract.ts. Publisher access controls (including Pay-per-Crawl) apply at
// fetch time, not at search time.
//
// The binding is injected rather than imported so this module stays pure
// TypeScript with no Worker imports, matching `cached(kv, ...)` in ../cache.ts.
// `WebSearch` is an ambient global type from worker-configuration.d.ts.

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

const MAX_RESULTS = 5;

export function parseWebSearchResults(raw: any): SearchHit[] {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items
    .filter((r: any) => r?.url && r?.title)
    .map((r: any) => ({
      title: String(r.title),
      url: String(r.url),
      snippet: String(r.description ?? ''),
    }));
}

export async function search(binding: WebSearch, query: string): Promise<SearchHit[]> {
  try {
    const res = await binding.search({ query, limit: MAX_RESULTS });
    return parseWebSearchResults(res);
  } catch {
    // Evidence retrieval is best-effort: the caller falls back to reporting
    // insufficient evidence rather than failing the whole fact check.
    return [];
  }
}
