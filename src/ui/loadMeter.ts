// src/ui/loadMeter: how far the first load is, 0 .. 1, for the loading screen's line (pass i2, R15).
//
// Core reports files DECODED of files asked for, one set after the other. On a cold load that count stood still for most
// of the wait and then ran: the big files arrive first and the decodes come in a burst at the end (story reviewers: the
// line at a quarter after two thirds of the wait). What a player is waiting for is bytes, so the line follows the bytes
// of the game's asset files as the browser reports each one in (the Resource Timing entries of this page: nothing is
// fetched or hooked here), over the size of the boot's two sets. The decodes then take it on, and the last stretch (the
// level build, the shader warm-up, the first frame: no event tells of them) is a slow ease in the stylesheet
// (ui.css `.load-line.tail`), so the line is never full and still.
//
// The manifest carries no file sizes (docs/requests/ui.md): BOOT_FILE_BYTES is the size on disk of the `always` and
// `surface` sets' files, checked against public/assets within a wide margin by tests/ui/i2.test.mjs. A stale figure
// only bends the line: it never goes back, never passes FILES_SHARE on bytes alone, and the sets' own reports end it.
// With no byte seen (a browser without Resource Timing, a sandbox that loads no file) the line is the count's, as before.

/** bytes of public/assets files in design/assets.json sets `always` + `surface`: closer, pass i5 (it was 7 367 836 in pass i4, 6 791 954 before) */
export const BOOT_FILE_BYTES = 7_642_948;
/** the line's share for bytes in, for files decoded, and where the stylesheet's ease ends */
export const FILES_SHARE = 0.8;
export const DECODE_SHARE = 0.12;
export const TAIL_END = 0.985;
/** the count's share of each stage of the boot when no byte was seen (pass i1): `always`, then `surface` */
export const LOAD_SHARE: Readonly<Record<string, readonly [number, number]>> = { always: [0, 0.14], surface: [0.14, 1], underground: [1, 1], coda: [1, 1] };
/** a resource of the game's own asset tree (public/assets/**, under any base path) */
const ASSET_URL = /\/assets\/[^?#]+\.(?:glb|webp|png|jpg|ktx2|bin)(?:[?#]|$)/;

/** The share of the line for `bytes` in and a set's count (pure: tests/ui/text.spec.ts). */
export function loadShare(bytes: number, label: string, loaded: number, total: number, totalBytes: number = BOOT_FILE_BYTES): number {
  const span = LOAD_SHARE[label];
  const done = total > 0 ? Math.min(1, Math.max(0, loaded / total)) : 0;
  const count = span ? span[0] + (span[1] - span[0]) * done : done;
  if (!(bytes > 0) || !(totalBytes > 0)) return count;
  return FILES_SHARE * Math.min(1, bytes / totalBytes) + DECODE_SHARE * count;
}

export class LoadMeter {
  /** bytes of asset files the browser has reported in since the page was opened */
  bytes = 0;
  private observer: PerformanceObserver | null = null;
  private readonly seen = new Set<string>();

  constructor(private readonly onBytes: () => void) {}

  start(): void {
    if (this.observer !== null || typeof PerformanceObserver !== 'function') return;
    try {
      this.observer = new PerformanceObserver((list) => {
        let changed = false;
        for (const entry of list.getEntries()) {
          const r = entry as PerformanceResourceTiming;
          if (!ASSET_URL.test(r.name) || this.seen.has(r.name)) continue;
          const size = r.encodedBodySize > 0 ? r.encodedBodySize : r.decodedBodySize > 0 ? r.decodedBodySize : r.transferSize;
          if (!(size > 0)) continue;
          this.seen.add(r.name);
          this.bytes += size;
          changed = true;
        }
        if (changed) this.onBytes();
      });
      this.observer.observe({ type: 'resource', buffered: true });
    } catch { this.observer = null; }
  }
  /** the first load is over: nothing is watched after it, and a later loading screen that is reported is the count's */
  stop(): void {
    this.bytes = 0;
    if (this.observer !== null) { try { this.observer.disconnect(); } catch { /* gone already */ } }
    this.observer = null;
  }
}
