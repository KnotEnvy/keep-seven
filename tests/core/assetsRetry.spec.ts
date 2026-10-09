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
/** pass i4: a store whose requests carry a build version and give a silent connection up after `stallMs` */
function versioned(stallMs: number): AssetStoreImpl {
  return new AssetStoreImpl({
    manifest: data.manifest, layout: data.layout, events: new EventBusImpl(), baseUrl: './', allowSynthesis: true, test: true,
    spreadUploads: () => false, renderer: () => null, retryDelays: [0, 0, 0], version: '?v=1a2b3c4d', stallMs,
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

  // ---- pass i4 ---------------------------------------------------------------------------------------------------------
  it('a request from which no byte comes is given up after the stall time and asked again: four tries, then missing', async () => {
    const calls = new Map<string, number>();
    let aborted = 0, quietSeen = 0;
    let s: AssetStoreImpl | null = null;
    // a connection that is accepted and then says nothing; it ends only when the store aborts it
    vi.stubGlobal('fetch', (url: string, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      calls.set(url, (calls.get(url) ?? 0) + 1);
      setTimeout(() => { if (s) quietSeen = Math.max(quietSeen, s.quietFor()); }, 20);
      init?.signal?.addEventListener('abort', () => { aborted++; reject(new DOMException('aborted', 'AbortError')); });
    }));
    s = versioned(40);
    expect(s.quietFor()).toBe(0);                                 // nothing is being fetched
    await s.prefetch('coda');
    const n = (data.manifest.sets.coda?.assets?.length ?? 0) + (data.manifest.sets.coda?.textures.length ?? 0);
    // (textures are synthesised in node without a request: only what was asked for is counted)
    expect(calls.size).toBeGreaterThan(0);
    expect(calls.size).toBeLessThanOrEqual(n);
    expect([...calls.values()].every((c) => c === 4)).toBe(true);
    expect(aborted).toBe(calls.size * 4);
    expect(quietSeen).toBeGreaterThan(0);                         // while it waited, the store knew nothing was arriving
    expect(s.quietFor()).toBe(0);
    expect(s.busy).toBe(false);
  });
  it('a file that arrives in pieces is read whole, and every request of a build carries its version', async () => {
    const urls: string[] = [];
    const glb = new Uint8Array(64);
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(glb.slice(0, 10)); controller.enqueue(glb.slice(10, 40)); controller.enqueue(glb.slice(40)); controller.close(); },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/octet-stream' } }));
    });
    const s = versioned(1000);
    await s.prefetch('coda');
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^\.\/assets\/[a-z]+\/[\w.]+\?v=1a2b3c4d$/);
    expect(s.report.retries).toBe(0);
    // 64 zero bytes are not a GLB: each file was read to its end and judged (a stand-in), not left hanging
    expect(s.report.assetsSynthesised).toBe(data.manifest.sets.coda?.assets?.length ?? 0);
  });
});
