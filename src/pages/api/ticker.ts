import type { APIRoute } from 'astro';

const SYMBOLS = { sensex: '%5EBSESN', nifty: '%5ENSEI' };

// Yahoo answers 429 to requests without a browser-style User-Agent.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function quote(symbol: string) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const meta = ((await res.json()) as any)?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('no price');
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  return {
    price: meta.regularMarketPrice,
    changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : null,
  };
}

export const GET: APIRoute = async () => {
  try {
    const [sensex, nifty] = await Promise.all([quote(SYMBOLS.sensex), quote(SYMBOLS.nifty)]);
    return new Response(JSON.stringify({ sensex, nifty }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
};
