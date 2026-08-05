import { describe, it, expect, vi } from 'vitest';
import { checkRateLimit } from '../src/lib/ratelimit';

function fakeKV(store: Record<string, string> = {}) {
  return {
    get: vi.fn(async (k: string) => store[k] ?? null),
    put: vi.fn(async (k: string, v: string) => { store[k] = v; }),
  } as any;
}

describe('checkRateLimit', () => {
  it('allows the first request', async () => {
    expect(await checkRateLimit(fakeKV(), '1.2.3.4', 5)).toBe(true);
  });

  it('blocks once the limit is reached', async () => {
    const kv = fakeKV({ 'rl:1.2.3.4': '5' });
    expect(await checkRateLimit(kv, '1.2.3.4', 5)).toBe(false);
  });

  it('allows when under the limit', async () => {
    const kv = fakeKV({ 'rl:1.2.3.4': '2' });
    expect(await checkRateLimit(kv, '1.2.3.4', 5)).toBe(true);
  });
});
