const WINDOW_SECONDS = 60 * 60;

export async function checkRateLimit(kv: KVNamespace, ip: string, limit: number): Promise<boolean> {
  const key = `rl:${ip}`;
  const current = Number((await kv.get(key)) ?? '0');
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS });
  return true;
}
