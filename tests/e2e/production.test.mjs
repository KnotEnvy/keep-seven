// The production bundle (npm run build), served and booted as a player gets it: no URL parameter, no debug hook, every
// asset from its file. Records the load sequence and the download size to shots/integrate-code/production.json.
//   node --test tests/e2e/production.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer } from '../harness.mjs';
import { launchBrowser } from '../../tools/browser.mjs';

const PIECE = 'integrate-code';
const MiB = 1024 * 1024;
let prod, browser;
before(async () => { prod = await startServer({ mode: 'build', pieces: 'all' }); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await prod?.close(); });

/** every file under a directory: [relative path, bytes] */
function filesOf(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filesOf(p, base, out); else out.push([path.relative(base, p), fs.statSync(p).size]);
  }
  return out;
}

test('the production bundle boots with no debug hook and no synthesised asset; the whole download is inside 20 MiB', async () => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  page.on('response', async (res) => {
    const url = new URL(res.url());
    let bytes = 0;
    try { bytes = (await res.body()).length; } catch { /* a redirect or an aborted request */ }
    requests.push({ at: Date.now() - t0, path: url.pathname, status: res.status(), bytes, type: res.request().resourceType() });
  });
  await page.goto(prod.url);                                   // the page a player gets: no parameter at all
  await page.waitForFunction(() => document.title !== '' && document.querySelector('[data-item="play"]') !== null, null, { timeout: 120000 });
  const titleAt = Date.now() - t0;
  assert.equal(await page.evaluate(() => typeof window.__dbg), 'undefined', 'no debug hook in the production page');
  assert.equal(await page.evaluate(() => document.getElementById('boot-failure')), null);
  const beforePlay = requests.length;
  await page.click('[data-item="play"]');
  await page.waitForFunction(() => document.pointerLockElement === document.getElementById('game'), null, { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('[data-item="play"]')?.offsetParent === null, null, { timeout: 120000 });   // the title menu is gone: she has control
  const playAt = Date.now() - t0;
  await page.waitForTimeout(1500);                             // a second and a half of the real loop
  await page.screenshot({ path: path.join(ROOT, 'shots', PIECE, 'production_first_seconds.png') });
  assert.deepEqual(errors, [], 'no console error');
  assert.ok(requests.every((r) => r.status < 400), requests.filter((r) => r.status >= 400).map((r) => `${r.status} ${r.path}`).join(', '));
  await page.close();

  // ---- the same bundle with ?debug=1: the asset store's own account of where everything came from
  const dbgPage = await browser.newPage({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
  await dbgPage.goto(prod.url + '?debug=1');
  await dbgPage.waitForFunction(() => window.__dbg && window.__dbg.ready, null, { timeout: 120000 });
  const report = await dbgPage.evaluate(() => window.__dbg.ext.assets.report());
  const stubs = await dbgPage.evaluate(() => (window.__dbg.ext.core.stubs ? window.__dbg.ext.core.stubs() : null));
  // and through the same click a player makes: the run begins looking where the start marker looks (the browser's own
  // mouse event as the pointer lock engages is not a look)
  await dbgPage.setViewportSize({ width: 960, height: 540 });
  await dbgPage.click('[data-item="play"]');
  await dbgPage.waitForFunction(() => document.pointerLockElement !== null && window.__dbg.state().game === 'playing', null, { timeout: 120000 });
  await dbgPage.waitForTimeout(1000);
  const view = await dbgPage.evaluate(() => { const p = window.__dbg.player(); return { yaw: p.yawDeg, pitch: p.pitchDeg, zone: p.zone, alive: p.alive }; });
  assert.ok(Math.abs(view.pitch) < 1 && Math.abs(view.yaw) < 1, `the first frames look where the start marker looks (${JSON.stringify(view)})`);
  await dbgPage.close();
  assert.equal(report.assetsSynthesised + report.texturesSynthesised, 0, 'nothing synthesised: ' + JSON.stringify(report));
  assert.ok(report.assetsFromFiles > 30 && report.texturesFromFiles >= 10, JSON.stringify(report));

  // ---- sizes: what is on disk in the build, and what the page really fetched
  const dist = filesOf(prod.outDir);
  const sum = (list) => list.reduce((n, [, b]) => n + b, 0);
  const js = dist.filter(([f]) => f.endsWith('.js')), css = dist.filter(([f]) => f.endsWith('.css')), html = dist.filter(([f]) => f.endsWith('.html'));
  const assets = dist.filter(([f]) => f.startsWith('assets' + path.sep));
  const total = sum(dist);
  const fetched = requests.reduce((n, r) => n + r.bytes, 0);
  const out = {
    builtFiles: dist.length, totalBytes: total, totalMiB: +(total / MiB).toFixed(2),
    jsBytes: sum(js), cssBytes: sum(css), htmlBytes: sum(html), assetBytes: sum(assets), assetFiles: assets.length,
    toTitle: { requests: beforePlay, bytes: requests.slice(0, beforePlay).reduce((n, r) => n + r.bytes, 0), wallMsUnderSwiftShader: titleAt },
    toControl: { requests: requests.length, bytes: fetched, wallMsUnderSwiftShader: playAt },
    assets: report, stubsInDebugBuild: stubs,
    sequence: requests.map((r) => `${String(r.at).padStart(6)} ms  ${String(r.bytes).padStart(8)} B  ${r.path}`),
  };
  fs.writeFileSync(path.join(ROOT, 'shots', PIECE, 'production.json'), JSON.stringify(out, null, 1));
  console.log(`production: ${dist.length} files, ${(total / MiB).toFixed(2)} MiB in all (JS ${(out.jsBytes / MiB).toFixed(2)}, CSS ${(out.cssBytes / 1024).toFixed(1)} KiB, assets ${(out.assetBytes / MiB).toFixed(2)} MiB in ${assets.length} files); `
    + `to the title ${beforePlay} requests / ${(out.toTitle.bytes / MiB).toFixed(2)} MiB, to control ${requests.length} requests / ${(fetched / MiB).toFixed(2)} MiB; assets from files ${report.assetsFromFiles} + textures ${report.texturesFromFiles}, synthesised 0`);
  assert.ok(total <= 20 * MiB, `the build is ${(total / MiB).toFixed(2)} MiB (cap 20)`);
  assert.equal(js.length, 1, 'one script file');
});

// ---- polish round 2 (robustness): the public page -------------------------------------------------------------------
const menuItem = (page, item, timeout = 120000) => page.waitForFunction((i) => { const el = document.querySelector(`[data-item="${i}"]`); return el !== null && el.offsetParent !== null; }, item, { timeout });

test('the public page ignores ?cp= and ?autostart=1: the title, not a run at the boss', async () => {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  try {
    await page.goto(prod.url + '?cp=cp_boss_p2&autostart=1');
    await menuItem(page, 'play');
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => typeof window.__dbg), 'undefined');
    assert.ok(await page.evaluate(() => document.querySelector('[data-item="play"]').offsetParent !== null), 'still on the title menu');
  } finally { await page.close(); }
});

test('a set file that will not come: asked four times, then the title with one plain line and the save kept; "Go on" works when it is back', async () => {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  try {
    // a save in the gallery, made by the game itself (the hook, on a debug page of the same build)
    const maker = await context.newPage();
    await maker.goto(prod.url + '?debug=1&test=1&persist=1');
    await maker.waitForFunction(() => window.__dbg && window.__dbg.ready, null, { timeout: 120000 });
    const save = await maker.evaluate(async () => {
      await window.__dbg.start({ checkpoint: 'cp_gallery_bay' });
      await window.__dbg.ext.core.stepAsync(10, false);
      return JSON.stringify(window.__dbg.ext.core.ctx().save.current);
    });
    assert.equal(JSON.parse(save).checkpoint, 'cp_gallery_bay');
    await maker.close();

    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    let seen = 0, down = true;
    await page.route('**/lm_gallery.webp', (route) => { seen++; return down ? route.abort('failed') : route.continue(); });
    await page.goto(prod.url);
    await menuItem(page, 'play');
    await page.evaluate((text) => localStorage.setItem('keepseven.save.v1', text), save);
    await page.reload();
    await menuItem(page, 'continue');
    await page.click('[data-item="continue"]');
    await page.waitForFunction(() => { const n = document.getElementById('flow-notice'); return n !== null && n.style.display !== 'none'; }, null, { timeout: 90000 });
    await menuItem(page, 'continue');                          // the title again, "Go on" still offered
    assert.equal(seen, 4, 'one request and three retries');
    assert.ok((await page.evaluate(() => document.getElementById('flow-notice').textContent)).length > 10);
    assert.ok(await page.evaluate(() => localStorage.getItem('keepseven.save.v1') !== null), 'the save is kept');
    assert.ok(errors.some((e) => e.includes('[flow]') && e.includes('failed to load')), errors.join(' | '));
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, 'the title has its cursor back');
    await page.screenshot({ path: path.join(ROOT, 'shots', PIECE, 'production_load_failed.png') });
    // the network is back: the same click loads the gallery
    down = false;
    await page.click('[data-item="continue"]');
    await page.waitForFunction(() => document.querySelector('[data-item="continue"]')?.offsetParent === null && document.querySelector('[data-item="play"]')?.offsetParent === null, null, { timeout: 90000 });
    assert.equal(seen, 5, 'asked again: a failed load is not remembered');
    assert.equal(await page.evaluate(() => document.getElementById('flow-notice').style.display), 'none');
    await page.evaluate(() => localStorage.clear());
  } finally { await context.close(); }
});
