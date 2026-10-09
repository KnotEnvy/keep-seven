// The page's head before any script runs (pass i1, ruling R15): the tab during the load and a link pasted into a chat
// show the game's name, a description and a picture. The words are copies of design/story.json; the picture is a file
// under public/ addressed relative to the page, so it is found under any sub-path.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import story from '../../design/story.json';
import { shareHead, siteBase } from '../../tools/share_head.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const meta = (key: string): string | null => {
  const m = new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)">`).exec(html);
  return m ? (m[1] as string) : null;
};

describe('index.html head', () => {
  it('has the game\'s name as its title before the script runs', () => {
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe(story.ui.ui_title);
    expect(meta('og:title')).toBe(story.ui.ui_title);
    expect(meta('og:site_name')).toBe(story.ui.ui_title);
  });
  it('has the description of story.json, as plain text and as a share description', () => {
    const want = (story.system as Record<string, string>).page_description;
    expect(want && want.length > 40 && want.length <= 200).toBe(true);
    expect(meta('description')).toBe(want);
    expect(meta('og:description')).toBe(want);
    expect(meta('og:image:alt')).toBe((story.system as Record<string, string>).page_image_alt);
  });
  it('names a share picture that exists, by a relative address', () => {
    const img = meta('og:image');
    expect(img).toBe('./share.jpg');
    const file = path.join(ROOT, 'public', (img as string).replace(/^\.\//, ''));
    expect(fs.existsSync(file)).toBe(true);
    const size = fs.statSync(file).size;
    expect(size).toBeGreaterThan(20_000);
    expect(size).toBeLessThan(300_000);            // it counts toward the 20 MB download
    expect(meta('twitter:card')).toBe('summary_large_image');
  });
  // Pass i4 (ruling R20, robustness): what the page says by itself, before or instead of the game, is story.json's text
  it('carries the words of story.json for a visitor without a mouse, a page that did not load and a browser without scripts', () => {
    const system = story.system as Record<string, string>;
    const says = /var SAYS = \{([\s\S]*?)\};/.exec(html)?.[1] ?? '';
    const pairs = Object.fromEntries([...says.matchAll(/(\w+): '((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1] as string, m[2] as string]));
    expect(Object.keys(pairs).sort()).toEqual(['load_anyway', 'needs_input', 'page_failed', 'page_reload', 'page_slow']);
    for (const [key, text] of Object.entries(pairs)) expect(text, key).toBe(system[key]);
    expect(/<noscript><p>([^<]*)<\/p><\/noscript>/.exec(html)?.[1]).toBe(system.needs_script);
    // the notice names both things the game needs, and the UI's copy for the title is the same sentence
    expect(system.needs_input).toMatch(/mouse/);
    expect(system.needs_input).toMatch(/keyboard/);
    expect((story.ui as Record<string, string>).ui_needs_input).toBe(system.needs_input);
    // the game waits on the notice before it asks for its files (src/main.ts), and a release build drops the hook
    const main = fs.readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8');
    expect(main).toMatch(/__keep7Gate/);
    expect(main.indexOf('__keep7Gate')).toBeLessThan(main.indexOf('createContext({'));
    expect(main).toMatch(/if \(HOOK\) installDebugHook/);
  });
  it('asks the host for nothing by an absolute path', () => {
    const urls = [...html.matchAll(/(?:href|src|content)="(\/[^"/][^"]*)"/g)].map((m) => m[1]).filter((u) => u !== '/src/main.ts');
    expect(urls).toEqual([]);
  });

  // Pass i3: a link pasted into a chat shows the picture only if its address is absolute. The Pages workflow gives the
  // build the site's address (SITE_URL); the page built for it is checked here, tag by tag.
  it('gets absolute share tags when the build is told the site address', () => {
    const SITE = 'https://KnotEnvy.github.io/keep-seven';
    const out = shareHead(html, SITE);
    const tag = (key: string): string | null => {
      const m = new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)">`).exec(out);
      return m ? (m[1] as string) : null;
    };
    const base = 'https://knotenvy.github.io/keep-seven/';
    expect(siteBase(SITE)).toBe(base);
    expect(siteBase(SITE + '/')).toBe(base);
    expect(tag('og:url')).toBe(base);
    expect(tag('og:image')).toBe(base + 'share.jpg');
    expect(tag('og:image:secure_url')).toBe(base + 'share.jpg');
    expect(tag('twitter:image')).toBe(base + 'share.jpg');
    expect(tag('twitter:card')).toBe('summary_large_image');
    expect(/<link rel="canonical" href="([^"]*)">/.exec(out)?.[1]).toBe(base);
    expect(out.match(/property="og:image" /g)).toHaveLength(1);
    expect(tag('og:image:width')).toBe('1200');
    // nothing the page itself loads became absolute, and nothing else changed
    const added = /rel="canonical"|og:url|og:image"|og:image:secure_url|og:image:type|twitter:image/;
    expect(out.split('\n').filter((l) => !added.test(l))).toEqual(html.split('\n').filter((l) => !/og:image"/.test(l)));
  });
  it('leaves the page as written without a usable site address', () => {
    for (const site of [undefined, '', '  ', 'keep-seven', '/keep-seven/', 'javascript:alert(1)', 'https://a.b/"><script>']) {
      expect(shareHead(html, site)).toBe(html);
    }
  });
  it('is what the Pages workflow builds with, and the workflow refuses a relative picture', () => {
    const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
    expect(yml).toContain('SITE_URL: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/');
    expect(yml).toContain(`grep -q '<meta property="og:image" content="https://' dist/index.html`);
    expect(fs.readFileSync(path.join(ROOT, 'vite.config.mts'), 'utf8')).toContain('shareHead(html, process.env.SITE_URL)');
  });
});
