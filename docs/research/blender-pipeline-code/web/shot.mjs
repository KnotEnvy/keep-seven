// node docs/research/blender-pipeline-code/web/shot.mjs "<page path relative to project root>?<query>" [out.png]
// Prints window.__result as JSON and screenshots the canvas. Pages: inspect.html?glb=/path.glb[&clip=Name&t=0.5], lightmap.html?glb=/path.glb&lmdir=/dir
import { launchBrowser } from '../../../../tools/browser.mjs';
import { serve } from './serve.mjs';
const [page, out] = process.argv.slice(2);
const { srv, url } = await serve();
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const p = await ctx.newPage();
p.on('console', m => console.log('[page]', m.type(), m.text()));
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(url + '/' + page);
await p.waitForFunction('window.__done === true', null, { timeout: 60000 });
console.log(JSON.stringify(await p.evaluate('window.__result')));
if (out) await p.locator('canvas').screenshot({ path: out });
await browser.close(); srv.close();
