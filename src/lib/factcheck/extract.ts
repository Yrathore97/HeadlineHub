const MAX_CHARS = 4000;

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

export function extractReadableText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  // Anything that is not four clean octets is not a real address; refuse it
  // rather than letting an ambiguous form through.
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8, including 0.0.0.0 itself
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  return false;
}

/**
 * True when a URL hostname points at a private, loopback, or internal target.
 *
 * `fetchArticleText` runs inside the Worker on a URL the caller supplies, so
 * without this an attacker could aim it at internal infrastructure (SSRF).
 * `global_fetch_strictly_public` in wrangler.jsonc blocks this at the platform
 * level too; this is defence in depth plus a legible error message.
 *
 * This is a literal check only. It cannot stop a public hostname whose DNS
 * record resolves to a private address (DNS rebinding) -- the compatibility
 * flag is what covers that case.
 */
export function isPrivateHost(hostname: string): boolean {
  // Strip IPv6 brackets and any trailing root dot, then compare lowercased.
  const host = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
  if (!host) return true;

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true; // loopback, unspecified
    // IPv4-mapped / -compatible forms such as ::ffff:127.0.0.1
    const mapped = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    if (/^f[cd]/.test(host)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(host)) return true; // fe80::/10 link-local
    return false;
  }

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return isPrivateIPv4(host);
  return false;
}

export async function fetchArticleText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http and https URLs are supported.');
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`Refusing to fetch a private or internal address (${parsed.hostname}).`);
  }
  const res = await fetch(parsed.toString(), {
    headers: { 'user-agent': 'NewzWale-FactCheck/1.0' },
  });
  if (!res.ok) throw new Error(`Could not fetch the article (${res.status}).`);
  return extractReadableText(await res.text());
}
