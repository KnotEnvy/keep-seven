// The design data as files (release pass p0). In a PRODUCTION BUILD the three design files (layout, manifest, story) are
// not part of the script: vite.config.mts (`designData`) emits each as a hashed .json beside the script, preloads it from
// index.html, and replaces `import x from 'design/x.json'` with `await loadDataFile(url, ...)`. The script was 1.92 MB
// with 0.39 MB of data in it, parsed as JavaScript in the boot's one long task; JSON.parse off a fetch is several times
// cheaper, and the three files download beside the script instead of inside it. The dev server, vitest and node read the
// JSON files directly, as before.
//
// This module is a LEAF (it imports nothing): everything else in core waits on the data it loads.

/** The one plain line a player sees when the game cannot start (also used by debugHook.ts `reportBootFailure`). */
export function showBootLine(line: string): void {
  if (typeof document === 'undefined') return;
  const host = document.getElementById('ui') ?? document.body;
  let el = document.getElementById('boot-failure');
  if (!el) {
    el = document.createElement('div');
    el.id = 'boot-failure';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:8vmin;text-align:center;'
      + 'background:#0b0d12;color:#e8dcc4;font:18px/1.5 Georgia,serif;z-index:1000;-webkit-user-select:text;user-select:text';
    host.appendChild(el);
  }
  el.textContent = line;
}

/** tries per data file, and the wait before try n (ms): 0, 400, 800, 1 200 */
export const DATA_TRIES = 4;
const RETRY_MS = 400;

/**
 * One design file. Four tries (the later ones past the HTTP cache); when none comes, the player gets the same plain
 * line as any other boot failure (`failure` and `title` are story.json's own words, written into the script by the
 * build), the console and `window.__dbg.error` get the cause, and the promise rejects (the script stops there).
 */
export async function loadDataFile<T>(url: string, failure: string, title: string): Promise<T> {
  let last: unknown = null;
  for (let attempt = 0; attempt < DATA_TRIES; attempt++) {
    if (attempt > 0) await new Promise<void>((resolve) => { setTimeout(resolve, RETRY_MS * attempt); });
    try {
      const res = await fetch(url, attempt > 0 ? { cache: 'reload' } : undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json() as T;
    } catch (err) { last = err; }
  }
  const text = `data file ${url} failed to load: ${last instanceof Error ? last.message : String(last)}`;
  console.error('[boot] ' + text);
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __dbg?: unknown };
    if (!w.__dbg) w.__dbg = { version: 2, ready: false, error: text };
    try { if (!document.title) document.title = title; showBootLine(failure); } catch { /* the page itself is unusable */ }
  }
  throw new Error(text);
}
