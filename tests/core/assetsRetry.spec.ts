// The asset store and the network (polish round 2, robustness): a request that fails on the network is asked again,
// a file that is not there is not, and a load that failed for good is forgotten so that the next request tries again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetStoreImpl } from '../../src/core/assets.ts';
import { createGameData } from '../../src/core/data.ts';
import { EventBusImpl } from '../../src/core/events.ts';

const data = createGameData({ strict: true });
function store(allowSynthesis: boolean): AssetStoreImpl {
  return new AssetStoreImpl({
    manifest: data.manifest, layout: data.layout, events: new EventBusImpl(), baseUrl: './', allowSynthesis, test: true,
    spreadUploads: () => false, renderer: () => null, retryDelays: [0, 0, 0],
  });
}
const response = (status: number): Response => new Response(status === 200 ? new Uint8Array(64) : null, { status, headers: { 'content-type': 'application/octet-stream' } });
afterEach(() => { vi.unstubAllGlobals(); });

describe('AssetStore: a failed request', () => {
  it('a network error is retried three times (four requests a file), then the file counts as missing', async () => {
    const calls = new Map<string, number>();
    vi.stubGlobal('fetch', (url: string) => { calls.set(url, (calls.get(url) ?? 0) + 1); return Promise.reject(new TypeError('net::ERR_FAILED')); });
    const s = store(true);
    await s.prefetch('coda');
    const n = data.manifest.sets.coda?.assets?.length ?? 0;
    expect(n).toBeGreaterThan(0);
    expect([...calls.values()].every((c) => c === 4)).toBe(true);
    expect(s.report.retries).toBe(n * 3);
    expect(s.report.assetsSynthesised).toBe(n);                    // dev / test: a stand-in, as before
  });
  it('a request that fails once and then answers costs one retry and nothing else', async () => {
    const calls = new Map<string, number>();
    vi.stubGlobal('fetch', (url: string) => {
      const c = (calls.get(url) ?? 0) + 1; calls.set(url, c);
      return c === 1 ? Promise.reject(new TypeError('net::ERR_ABORTED')) : Promise.resolve(response(200));
    });
    const s = store(true);
    await s.prefetch('coda');
    expect([...calls.values()].every((c) => c === 2)).toBe(true);
    expect(s.report.retries).toBe(calls.size);
  });
  it('a 503 is retried; a 404 is an answer and is asked once', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', () => { calls++; return Promise.resolve(response(404)); });
    let s = store(true);
    await s.prefetch('coda');
    const n = data.manifest.sets.coda?.assets?.length ?? 0;
    expect([calls, s.report.retries]).toEqual([n, 0]);
    calls = 0;
    vi.stubGlobal('fetch', () => { calls++; return Promise.resolve(response(503)); });
    s = store(true);
    await s.prefetch('coda');
    expect([calls, s.report.retries]).toEqual([n * 4, n * 3]);
  });
  it('production (no stand-ins): the load rejects, is forgotten, and the next prefetch asks for the file again', async () => {
    let calls = 0, down = true;
    vi.stubGlobal('fetch', () => { calls++; return down ? Promise.reject(new TypeError('offline')) : Promise.resolve(response(404)); });
    const s = store(false);
    await expect(s.prefetch('coda')).rejects.toThrow(/failed to load/);
    await s.idle();
    const after = calls;
    expect(after).toBeGreaterThan(0);
    // before: the rejected promise stayed in the entry and answered every later request without a single fetch
    down = false;
    await expect(s.prefetch('coda')).rejects.toThrow(/failed to load/);     // still missing (404), but it was ASKED
    expect(calls).toBeGreaterThan(after);
    expect(s.busy).toBe(false);
  });
});
