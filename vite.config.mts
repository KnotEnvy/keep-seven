import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { shareHead } from './tools/share_head.mjs';

const ROOT = import.meta.dirname;
const DESIGN = path.join(ROOT, 'design');
const DATA_FILES = ['layout.json', 'assets.json', 'story.json'];
const VIRTUAL = '\0keep7-design-data:';

/**
 * Release pass p0. In a build, the three design files leave the script: each is emitted minified as a hashed .json
 * beside it, preloaded from index.html, and read with fetch + JSON.parse (src/core/dataFile.ts) before anything else in
 * the script runs (a top-level await: the importers see the same default export as before). The script was 1.92 MB of
 * which 0.39 MB was this data, parsed as JavaScript in the one long task of the boot; the work orders' share for
 * JS + CSS is 1.5 MiB. Dev server, vitest and node are untouched: they import the JSON files.
 */
function designData(): Plugin {
  const emitted = new Map<string, string>();
  return {
    name: 'keep7-design-data', apply: 'build', enforce: 'pre',
    buildStart() { emitted.clear(); },
    async resolveId(source, importer, options) {
      if (!source.endsWith('.json') || !importer) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const file = resolved.id.split('?')[0] as string;
      if (path.dirname(file) !== DESIGN || !DATA_FILES.includes(path.basename(file))) return null;
      return VIRTUAL + path.basename(file) + '.js';
    },
    load(id) {
      if (!id.startsWith(VIRTUAL)) return null;
      const name = id.slice(VIRTUAL.length, -3);
      const file = path.join(DESIGN, name);
      this.addWatchFile(file);
      const story = JSON.parse(fs.readFileSync(path.join(DESIGN, 'story.json'), 'utf8')) as { ui: Record<string, string>; system?: Record<string, string> };
      const system = story.system ?? {};
      const line = [system.boot_failed, system.boot_connection, system.boot_retry].filter(Boolean).join(' ');
      let ref = emitted.get(name);
      if (!ref) {
        ref = this.emitFile({ type: 'asset', name, source: JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))) });
        emitted.set(name, ref);
      }
      return `import { loadDataFile } from ${JSON.stringify(path.join(ROOT, 'src/core/dataFile.ts'))};\n`
        + `export default await loadDataFile(import.meta.ROLLUP_FILE_URL_${ref}, ${JSON.stringify(line)}, ${JSON.stringify(story.ui.ui_title ?? '')});\n`;
    },
    // the three files start downloading with the script, not after it has been parsed
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const tags = [];
        for (const f of Object.values(ctx.bundle ?? {})) {
          if (f.type !== 'asset' || !/\.json$/.test(f.fileName)) continue;
          if (!DATA_FILES.some((n) => path.basename(f.fileName).startsWith(n.replace(/\.json$/, '') + '-'))) continue;
          tags.push({ tag: 'link', attrs: { rel: 'preload', as: 'fetch', href: './' + f.fileName, crossorigin: 'anonymous' }, injectTo: 'head' as const });
        }
        return tags;
      },
    },
  };
}

/**
 * Passes i1 and i3 (ruling R15). index.html names its share picture by a relative address so the page works under any
 * sub-path; link previews only follow an absolute one. When the build is told where the site will live (SITE_URL, set by
 * .github/workflows/pages.yml from the repository's Pages address) the share tags are made absolute: og:url, og:image,
 * og:image:secure_url, twitter:image and a canonical link (tools/share_head.mjs; tests/core/pageHead.spec.ts). Without
 * SITE_URL the page is left as written.
 */
function sharePage(): Plugin {
  return {
    name: 'keep7-share-page', apply: 'build',
    transformIndexHtml: { order: 'pre', handler: (html) => shareHead(html, process.env.SITE_URL) },
  };
}

/**
 * Pass i4 (performance): the script, the style and the design data carry content hashes, the models and textures did
 * not, and GitHub Pages caches every file for ten minutes: for that long after a second release a returning player could
 * run the new script against cached old models. A build names every asset request `<path>?v=<this>`: eight hex digits
 * over the manifest and every file under public/assets (names and bytes). The files stay where they are. Dev server
 * and tests of the dev server: '' (no query).
 */
function assetsVersion(): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(path.join(DESIGN, 'assets.json')));
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else { hash.update(path.relative(ROOT, file)); hash.update(fs.readFileSync(file)); }
    }
  };
  const assets = path.join(ROOT, 'public', 'assets');
  if (fs.existsSync(assets)) walk(assets);
  return hash.digest('hex').slice(0, 8);
}

/**
 * Pass i4 (robustness, ruling R20). The words of the page BEFORE the game (index.html: the notice for a visitor without
 * a mouse and keyboard, the line of a script or a style that did not come, the <noscript> line) are copies of
 * design/story.json `system`; tests/core/pageHead.spec.ts holds them equal. Nothing is rewritten here.
 *
 * Two build-time constants:
 *   __KEEP7_HOOK__    false in a release build: the debug hook (src/core/debugHook.ts `installDebugHook`, the e2e driver's
 *                     entry points) is not in the script and `?test=1` / `?debug=1` / `?cp=` / `?stubs=` do nothing.
 *                     true in the dev server, and in a build made with KEEP7_HOOK=1 (tests/harness.mjs
 *                     `startServer({ mode: 'build' })` sets it unless `hook: false`).
 *   __KEEP7_ASSETS__  the asset version above ('' outside a build).
 */
// One input (index.html); sandbox pages are served by the dev server only. The dependency optimiser is off: two copies of
// three break `instanceof` and shader-chunk patches (docs/research/tech-web.md 10).
export default defineConfig(({ command }) => ({
  define: {
    __KEEP7_HOOK__: JSON.stringify(command !== 'build' || process.env.KEEP7_HOOK === '1'),
    __KEEP7_ASSETS__: JSON.stringify(command === 'build' ? assetsVersion() : ''),
  },
  root: ROOT,
  base: './',
  publicDir: 'public',
  server: { host: '127.0.0.1', port: 0, strictPort: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [designData(), sharePage()],
  build: {
    target: 'es2022', outDir: 'dist', assetsDir: 'js', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500,
    // one script file: src/main.ts imports the six pieces dynamically (so `?stubs=` can leave one out), and the bundle
    // must not turn that into six round trips
    rollupOptions: { input: 'index.html', output: { codeSplitting: false } },
  },
}));
