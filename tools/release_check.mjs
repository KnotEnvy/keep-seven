// RELEASE CHECK (pass i4; it was a scratch script of each closing pass). The built site, exactly as the Pages workflow
// makes it, served from a sub-path by a plain static file server (as GitHub Pages serves it), booted cold in the headless
// browser and played by real input for a moment. It FAILS (exit 1) when the page a visitor would get is not right:
//
//   node tools/release_check.mjs [--dist dist] [--sub /keep-seven/] [--out file.json] [--shots dir]
//
// Checked: the pre-boot page is seen before the script; the title is reached; no console error; no request outside the
// sub-path, none failed, none answered other than 200; no absolute "/" address in the built text files; the debug hook
// is neither on the page (`window.__dbg`) nor in the script (its driver's names); every model and texture is asked for
// with the build's `?v=` version; "Begin", the story sheet, Enter and W walk her; a reload offers "Go on" and costs one
// request. The pointer lock is granted by a shim (tools/browser.mjs `grantPointerLock`): a REAL lock in headless Chromium
// floods the page with synthetic mouse events and the browser grows to gigabytes (the performance reviewer of pass i4).
// Wall-clock times are reported, never asserted (no GPU here: WebGL runs on SwiftShader).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { grantPointerLock, launchBrowser } from './browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const DIST = path.resolve(ROOT, arg('dist', 'dist'));
const SUB = arg('sub', '/keep-seven/');
const OUT = arg('out', '');
const SHOTS = arg('shots', '');
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`release check: no ${path.relative(ROOT, DIST)}/index.html (run "npm run build" first)`); process.exit(2); }
if (SHOTS) fs.mkdirSync(path.resolve(ROOT, SHOTS), { recursive: true });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(path.resolve(ROOT, SHOTS), name + '.png') }); };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };
const served = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const rec = { path: p, query: url.search, status: 200, bytes: 0, gz: 0 };
  served.push(rec);
  if (!p.startsWith(SUB)) { rec.status = 404; res.writeHead(404); res.end('outside the sub-path'); return; }
  let f = path.join(DIST, p.slice(SUB.length));
  if (p.endsWith('/')) f = path.join(f, 'index.html');
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rec.status = 404; res.writeHead(404); res.end('not found'); return; }
  const body = fs.readFileSync(f);
  rec.bytes = body.length; rec.gz = /\.(js|css|html|json|svg)$/.test(f) ? zlib.gzipSync(body).length : body.length;
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'max-age=600' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}${SUB}`;
const out = { base, dist: path.relative(ROOT, DIST) };
const problems = [];
const need = (ok, what) => { if (!ok) problems.push(what); };
const total = () => ({ requests: served.length, bytes: served.reduce((n, r) => n + r.bytes, 0), gzipBytes: served.reduce((n, r) => n + r.gz, 0) });

// ---- the built files themselves
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); } };
walk(DIST);
out.absoluteUrls = [];
out.hookNames = {};
for (const f of files.filter((x) => /\.(html|js|css)$/.test(x))) {
  const t = fs.readFileSync(f, 'utf8');
  const re = /(?:src|href)=["']\/[^/"'][^"']*["']|url\(\s*["']?\/[^/)"'][^)"']*\)|(?:fetch|import)\(\s*["'`]\/[^/"'`][^"'`]*["'`]|["'`]\/(?:assets|js|design|src)\/[^"'`]*["'`]/g;
  for (const m of t.matchAll(re)) out.absoluteUrls.push(path.relative(DIST, f) + ': ' + m[0].slice(0, 120));
  // names only the debug hook's driver has (src/core/debugHook.ts): a release build must not carry it
  if (f.endsWith('.js')) for (const name of ['followPath', 'stepUntil', 'aimAtEntity', 'perfRun']) out.hookNames[name] = (out.hookNames[name] ?? 0) + (t.split(name).length - 1);
}
need(out.absoluteUrls.length === 0, `absolute "/" addresses in the built files: ${out.absoluteUrls.slice(0, 3).join('; ')}`);
need(Object.values(out.hookNames).every((n) => n === 0), `the debug hook's driver is in the script (${JSON.stringify(out.hookNames)}): build without KEEP7_HOOK`);
out.dist = {
  files: files.length, bytes: files.reduce((n, f) => n + fs.statSync(f).size, 0),
  js: files.filter((f) => f.endsWith('.js')).map((f) => [path.relative(DIST, f), fs.statSync(f).size, zlib.gzipSync(fs.readFileSync(f)).length]),
  css: files.filter((f) => f.endsWith('.css')).map((f) => [path.relative(DIST, f), fs.statSync(f).size]),
  json: files.filter((f) => f.endsWith('.json')).map((f) => [path.relative(DIST, f), fs.statSync(f).size]),
};
need(out.dist.bytes <= 20 * 1024 * 1024, `the site is ${(out.dist.bytes / 1048576).toFixed(2)} MiB: over the 20 MiB download budget`);

const TITLE = () => document.title !== '' && document.querySelector('.scr.on [data-item="play"]') !== null;
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await grantPointerLock(ctx);
  const page = await ctx.newPage();
  const errors = [], outside = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && !(u.host === new URL(base).host && u.pathname.startsWith(SUB))) outside.push(r.url()); });
  page.on('requestfailed', (r) => failed.push(r.url() + ' ' + r.failure()?.errorText));
  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'commit' });
  try {
    await page.waitForSelector('#preload', { timeout: 10000 });
    out.preload = await page.evaluate(() => document.getElementById('preload')?.innerText.replace(/\s+/g, ' ').slice(0, 60) ?? null);
    await shot(page, 'release_preload');
  } catch { out.preload = null; }
  need(typeof out.preload === 'string' && out.preload.length > 0, 'the pre-boot page (the name and the line) was not seen before the script');
  await page.waitForFunction(TITLE, null, { timeout: 180000 });
  out.title = { ms: Date.now() - t0, ...total(), docTitle: await page.title() };
  out.debugHook = await page.evaluate(() => typeof window.__dbg);
  need(out.debugHook === 'undefined', 'window.__dbg exists on the release page');
  need(!(await page.evaluate(() => document.getElementById('boot-failure') !== null || document.getElementById('pre-note') !== null)), 'the page shows a failure line or a notice');
  await page.waitForTimeout(2000);
  out.title.settled = total();
  await shot(page, 'release_title');
  out.titleText = await page.evaluate(() => document.querySelector('.scr.on')?.innerText.replace(/\s+/g, ' ').slice(0, 200));
  // every model and texture carries the build's version
  const assetRequests = served.filter((r) => /\/assets\//.test(r.path));
  out.assetVersion = [...new Set(assetRequests.map((r) => r.query))];
  need(assetRequests.length > 0 && out.assetVersion.length === 1 && /^\?v=[0-9a-f]{8}$/.test(out.assetVersion[0]), `asset requests do not all carry one "?v=" version (${out.assetVersion.join(' ')})`);
  // Begin: the story sheet over the first frame, Enter, control, a few steps by real input
  await page.click('.scr.on [data-item="play"]');
  await page.waitForFunction(() => document.querySelector('.k7 .reader.on') !== null, null, { timeout: 180000 });
  out.storySheet = { ms: Date.now() - t0, ...total() };
  await page.waitForTimeout(800);
  await shot(page, 'release_story_sheet');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.k7 .reader.on') === null, null, { timeout: 180000 });
  out.control = { ms: Date.now() - t0, ...total() };
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  await shot(page, 'release_walked');
  out.afterWalk = total();
  // she is in play with the pointer held: not on the click-to-resume plate, not on a menu
  out.inPlay = await page.evaluate(() => ({ locked: document.pointerLockElement === document.getElementById('game'), screen: [...document.querySelectorAll('.scr.on')].map((n) => n.className).join(' | ') }));
  need(out.inPlay.locked && out.inPlay.screen === '', `after Begin, Enter and W she is not in play (${JSON.stringify(out.inPlay)})`);
  need(out.afterWalk.requests === out.title.settled.requests, `requests after the title: ${out.afterWalk.requests - out.title.settled.requests} (the first minute must need none)`);
  out.byType = {};
  for (const r of served) { const e = path.extname(r.path) || '.html'; (out.byType[e] ??= { n: 0, bytes: 0 }); out.byType[e].n++; out.byType[e].bytes += r.bytes; }
  // a reload: the browser's cache answers everything but the page
  const n0 = served.length;
  await page.reload();
  await page.waitForFunction(TITLE, null, { timeout: 180000 });
  out.reload = { requests: served.length - n0, heading: await page.evaluate(() => document.querySelector('.scr.on')?.innerText.replace(/\s+/g, ' ').slice(0, 120)) };
  out.errors = errors; out.outside = outside; out.failed = failed;
  out.non200 = served.filter((r) => r.status !== 200).map((r) => `${r.status} ${r.path}`);
  need(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`);
  need(outside.length === 0, `requests outside ${SUB}: ${outside.slice(0, 3).join(' ')}`);
  need(failed.length === 0, `failed requests: ${failed.slice(0, 3).join(' ')}`);
  need(out.non200.length === 0, `answers other than 200: ${out.non200.slice(0, 3).join(' ')}`);
  await ctx.close();
} catch (err) {
  problems.push(`the check did not run to its end: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
} finally { await browser.close(); server.close(); }
out.problems = problems;
if (OUT) fs.writeFileSync(path.resolve(ROOT, OUT), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
if (problems.length > 0) { console.error('\nRELEASE CHECK FAILED\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('\nrelease check: pass');
