// Unit tests of the UI's text rules (src/ui/text.ts) and the static scans of docs/workorders/code-ui.md section 6
// ("Strings"): no player-facing literal in src/ui, every ui_* key of story.json used, the courtesy and the oath absent.
import { describe, expect, it } from 'vitest';
import type { Bindings } from '../../src/core/contracts.ts';
import { defaultBindings } from '../../src/core/options.ts';
import { CREDITS_FALLBACK, REPOSITORY, VERSION, clockTime, creditsBody, creditsText, publishedDate, repositoryUrl, format, horizontalFov, keyName, keyStoryKey, loadingLine, packCards, roman, sheetLines, splitCard, splitCards, tokenize, uiOr, useStoryUi, wrapSubtitle, CARD_LINE_CHARS, CARD_MAX_LINES, SHORT_CARD_CHARS, SUBTITLE_LINE_CHARS } from '../../src/ui/text.ts';
import { BOOT_FILE_BYTES, DECODE_SHARE, FILES_SHARE, LOAD_SHARE, loadShare } from '../../src/ui/loadMeter.ts';
import { MARK_MIN_SCALE, MARK_SMALL_SCALE, markScale } from '../../src/ui/mark.ts';
import story from '../../design/story.json';

interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
  existsSync(path: string): boolean;
  statSync(path: string): { size: number };
}
const fs = (await import('node:fs' as string)) as Fs;
const ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname).replace(/\/$/, '');
const UI_DIR = ROOT + '/src/ui';
const sources = fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.ts')).map((f) => ({ file: f, text: fs.readFileSync(`${UI_DIR}/${f}`, 'utf8') }));
const css = fs.readFileSync(UI_DIR + '/ui.css', 'utf8');
/** code without comments */
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

describe('roman, keyName, placeholders', () => {
  it('roman numerals for the seven movements and beyond', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9, 14, 39].map(roman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'IX', 'XIV', 'XXXIX']);
    expect(roman(0)).toBe('0');
  });
  it('key names come from the code itself', () => {
    expect(keyName('KeyW')).toBe('W');
    expect(keyName('Digit3')).toBe('3');
    expect(keyName('ArrowUp')).toBe('↑');
    expect(keyName('Mouse0')).toBe('Mouse 1');
    expect(keyName('ShiftLeft')).toBe('Shift');
    expect(keyName('ShiftRight')).toBe('Shift Right');
    expect(keyName('Escape')).toBe('Esc');
    expect(keyName('Space')).toBe('Space');
    expect(keyName('BracketLeft')).toBe('Bracket Left');
    expect(keyName('Numpad4')).toBe('Num 4');
    expect(keyName('')).toBe('—');
  });
  it('a key name story.json gives (requested, docs/requests/code-ui.md 2.1) wins over the derived one, the moment it exists', () => {
    expect(['Mouse0', 'Mouse1', 'Mouse2', 'Mouse4', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'Space', 'Escape', 'BracketLeft', 'Numpad4', 'NumpadEnter', 'F1'].map(keyStoryKey)).toEqual([
      'ui_key_mouse_left', 'ui_key_mouse_middle', 'ui_key_mouse_right', 'ui_key_mouse_5', 'ui_key_shift', 'ui_key_shift_right', 'ui_key_control', 'ui_key_space', 'ui_key_escape',
      'ui_key_bracket_left', 'ui_key_numpad_4', 'ui_key_numpad_enter', 'ui_key_f_1',
    ]);
    expect(['KeyW', 'Digit3', 'ArrowUp', ''].map(keyStoryKey)).toEqual(['', '', '', '']);
    try {
      useStoryUi({ ui_key_mouse_left: 'Left click', ui_key_shift: 'Shift key', ui_end_of: 'of', ui_key_w: 'never' });
      expect(keyName('Mouse0')).toBe('Left click');
      expect(keyName('ShiftLeft')).toBe('Shift key');
      expect(keyName('ShiftRight')).toBe('Shift Right');
      expect(keyName('KeyW')).toBe('W');
      expect(format(story.ui.ui_hint_fire, defaultBindings())).toBe('Left click to fire');
      expect(uiOr('ui_end_of', '/')).toBe('of');
      expect(uiOr('ui_opt_size_s', 'S')).toBe('S');
    } finally { useStoryUi({}); }
    expect(keyName('Mouse0')).toBe('Mouse 1');
  });
  it('placeholders are replaced with the keys bound right now', () => {
    const b: Bindings = defaultBindings();
    expect(format(story.ui.ui_hint_move, b)).toBe('W A S D to walk');
    expect(format(story.ui.ui_prompt_kept, b)).toBe('F  Break the band');
    expect(format(story.ui.ui_hint_sprint, b)).toBe('Hold Shift to run');
    b.kept = ['KeyG']; b.forward = ['ArrowUp', 'KeyW']; b.sprint = [];
    expect(format(story.ui.ui_prompt_kept, b)).toBe('G  Break the band');
    expect(format(story.ui.ui_hint_move, b)).toBe('↑ A S D to walk');
    expect(format(story.ui.ui_hint_sprint, b)).toBe('Hold — to run');
    expect(format(story.ui.ui_checkpoint, b, { movement: roman(3), n: '2' })).toBe('III · 2');
    const tokens = tokenize(story.ui.ui_prompt_read, defaultBindings());
    expect(tokens).toEqual([{ text: 'E', key: true, code: 'KeyE' }, { text: '  Read', key: false, code: '' }]);
  });
  it('every placeholder of every ui string is one the UI replaces', () => {
    const known = new Set(['n', 'movement', 'forward', 'left', 'back', 'right', 'fire', 'reload', 'sprint', 'interact', 'line', 'kept']);
    for (const [key, text] of Object.entries(story.ui)) for (const m of text.matchAll(/\{([a-z_]+)\}/g)) expect(known.has(m[1] as string), `${key}: {${m[1]}}`).toBe(true);
  });
});

describe('subtitles, cards, numbers', () => {
  it('every spoken line of story.json fits 2 lines of 42 characters, word-wrapped, nothing lost', () => {
    let longest = 0;
    for (const [key, line] of Object.entries(story.lines)) {
      if (line.speaker !== 'narrator' && line.speaker !== 'station' && line.speaker !== 'reeve') continue;
      const lines = wrapSubtitle(line.text);
      expect(lines.length, key).toBeLessThanOrEqual(story.meta.rules.subtitle_lines);
      for (const l of lines) { expect(l.length, `${key}: "${l}"`).toBeLessThanOrEqual(SUBTITLE_LINE_CHARS); longest = Math.max(longest, l.length); }
      expect(lines.join(' '), key).toBe(line.text.replace(/\s+/g, ' ').trim());
      expect(line.text.length, key).toBeLessThanOrEqual(story.meta.rules.subtitle_max_chars);
    }
    expect(longest).toBeGreaterThan(30);
  });
  it('wraps evenly, and never drops a word of a text that is too long for two lines', () => {
    expect(wrapSubtitle('Short.')).toEqual(['Short.']);
    expect(wrapSubtitle('aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj')).toEqual(['aaaa bbbb cccc dddd eeee', 'ffff gggg hhhh iiii jjjj']);
    const long = Array.from({ length: 30 }, (_, i) => 'word' + i).join(' ');
    const lines = wrapSubtitle(long);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join(' ')).toBe(long);
  });
  it('a blank line in a readable body starts a new card', () => {
    expect(splitCards(story.readables.rd_ledger.body)).toHaveLength(3);
    expect(splitCards(story.readables.rd_backstory.body)).toHaveLength(4);
    expect(splitCards(story.readables.rd_plate_proving.body)).toEqual([story.readables.rd_plate_proving.body]);
    for (const [key, r] of Object.entries(story.readables)) expect(splitCards(r.body).join('\n\n'), key).toBe(r.body);
  });
  it('pass i1: a salutation or a signature shares a card with the paragraph beside it; no card of a note is one short line', () => {
    // the first note was three presses for four sentences, its first card the one line of the salutation
    const lip = splitCards(story.readables.rd_note_lip.body);
    expect(lip).toHaveLength(2);
    expect(lip[0]).toBe('Reeve Ware. Water to you.\n\nYou are two days behind and walking well. I have hung the gate below for you. Count what I hung.');
    expect(splitCards(story.readables.rd_note_hearth.body)).toHaveLength(2);
    // the rule itself: a short single line joins the next card, a short last line the one before; a long one stands
    expect(splitCards('Hello.\n\nA paragraph that is long enough to stand on a card by itself.\n\n— D.')).toEqual(['Hello.\n\nA paragraph that is long enough to stand on a card by itself.\n\n— D.']);
    expect(splitCards('One.\n\nTwo.\n\nA paragraph that is long enough to stand on a card by itself.')).toEqual(['One.\n\nTwo.\n\nA paragraph that is long enough to stand on a card by itself.']);
    expect(splitCards('A short line\nand another')).toEqual(['A short line\nand another']);
    expect(splitCards('Alone.')).toEqual(['Alone.']);
    const long = 'x'.repeat(SHORT_CARD_CHARS + 1);
    expect(splitCards(`${long}\n\n${long}`)).toEqual([long, long]);
    for (const [key, r] of Object.entries(story.readables)) {
      const cards = splitCards(r.body);
      if (cards.length > 1) for (const c of cards) expect(c.length > SHORT_CARD_CHARS || c.includes('\n'), `${key}: "${c}"`).toBe(true);
    }
  });
  it('pass i2: a note found in the world is laid out by what the sheet holds; every note and plate of story.json is one card', () => {
    for (const [key, r] of Object.entries(story.readables)) {
      if (key === 'rd_backstory') continue;
      expect(packCards(r.body), key).toEqual([r.body]);
      expect(sheetLines(r.body), key).toBeLessThanOrEqual(CARD_MAX_LINES);
    }
    // the reviewer's two: the first note (36 words) and the ledger (75 words, three paragraphs)
    expect(story.readables.rd_note_lip.body.split(/\s+/).length).toBeLessThan(60);
    expect(packCards(story.readables.rd_ledger.body)).toHaveLength(1);
    // more than a sheet holds is broken between paragraphs, never inside one, and nothing is lost
    const back = story.readables.rd_backstory.body, paras = back.split('\n\n');
    expect(packCards(back)).toEqual([paras[0] + '\n\n' + paras[1], paras[2] + '\n\n' + paras[3]]);
    expect(packCards(back).join('\n\n')).toBe(back);
    const para = 'x'.repeat(CARD_LINE_CHARS * 5);
    expect(sheetLines(para)).toBe(5);
    expect(sheetLines('a\n\nb')).toBe(3);
    expect(packCards([para, para, para].join('\n\n'))).toEqual([para + '\n\n' + para, para]);
    expect(packCards('x'.repeat(CARD_LINE_CHARS * 20))).toHaveLength(1);
    // a closing line or a signature never stands on a card of its own
    expect(packCards([para, para, '— D.'].join('\n\n'))).toEqual([para + '\n\n' + para + '\n\n— D.']);
    expect(packCards([para, para, 'x'.repeat(CARD_LINE_CHARS), '— D.'].join('\n\n'))).toEqual([para + '\n\n' + para, 'x'.repeat(CARD_LINE_CHARS) + '\n\n— D.']);
    expect(packCards('')).toEqual(['']);
    // the story so far keeps its four authored cards (splitCards)
    expect(splitCards(back)).toHaveLength(4);
  });
  it('pass i2: the loading line is story.json\'s, and index.html\'s pre-boot page says the same words', () => {
    useStoryUi(story.ui);
    const line = loadingLine(story.readables.rd_backstory.body);
    const own = (story.ui as Record<string, string>).ui_loading_line;
    if (own !== undefined) expect(line).toBe(own);
    else { expect(story.readables.rd_backstory.body).toContain(line); expect(line).toMatch(/^[A-Z].+\. [A-Z].+\.$/); }
    expect(line.length).toBeGreaterThan(12);
    expect(line.length).toBeLessThanOrEqual(60);
    const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
    expect(/<div class="says">([^<]*)<\/div>/.exec(html)?.[1]).toBe(line);
    // the courtesy is never a stock greeting (story.json meta.rules.courtesy_cap)
    expect(line).not.toMatch(/Water to you|And shade/);
  });
  it('pass i2: the loading line follows bytes in, then the decodes; with no byte seen it is the count\'s, as before', () => {
    // no byte seen: pass i1's shares exactly
    expect(loadShare(0, 'always', 2, 4)).toBeCloseTo(0.07, 5);
    expect(loadShare(0, 'surface', 4, 8)).toBeCloseTo(0.57, 5);
    expect(loadShare(0, 'surface', 8, 8)).toBe(1);
    expect(LOAD_SHARE.always?.[1]).toBe(LOAD_SHARE.surface?.[0]);
    // bytes: half the bytes in and nothing decoded is 40 % of the line; all in and all decoded leaves the tail
    expect(loadShare(BOOT_FILE_BYTES / 2, 'always', 0, 13)).toBeCloseTo(FILES_SHARE / 2, 5);
    expect(loadShare(BOOT_FILE_BYTES, 'surface', 40, 40)).toBeCloseTo(FILES_SHARE + DECODE_SHARE, 5);
    expect(FILES_SHARE + DECODE_SHARE).toBeLessThan(1);
    // more bytes than the figure (a stale figure, the later sets under ?test=1) never pass the files' share
    expect(loadShare(BOOT_FILE_BYTES * 3, 'surface', 0, 40)).toBeCloseTo(FILES_SHARE + DECODE_SHARE * 0.14, 5);
    // monotonic in both
    let last = -1;
    for (let b = 0; b <= 10; b++) { const at = loadShare((BOOT_FILE_BYTES * b) / 10 + 1, 'surface', b * 4, 40); expect(at).toBeGreaterThan(last); last = at; }
  });
  it('pass i2: BOOT_FILE_BYTES is the size of the boot sets\' files (within a wide margin: a stale figure only bends the line)', () => {
    const manifest = JSON.parse(fs.readFileSync(ROOT + '/design/assets.json', 'utf8')) as { sets: Record<string, { assets?: string[]; textures: string[] }>; assets: Record<string, { path: string }>; textures: Record<string, { path: string }> };
    let bytes = 0, files = 0;
    for (const set of ['always', 'surface']) {
      const s = manifest.sets[set]!;
      for (const p of [...s.textures.map((id) => manifest.textures[id]!.path), ...(s.assets ?? []).map((id) => manifest.assets[id]!.path)]) {
        const f = ROOT + '/public/' + p;
        if (fs.existsSync(f)) { bytes += fs.statSync(f).size; files++; }
      }
    }
    expect(files).toBeGreaterThan(40);
    // to bring it up to date: put the number this prints into src/ui/loadMeter.ts BOOT_FILE_BYTES
    expect(Math.abs(bytes - BOOT_FILE_BYTES) / bytes, `public/assets boot sets are ${bytes} bytes; BOOT_FILE_BYTES is ${BOOT_FILE_BYTES}`).toBeLessThan(0.3);
  });
  it('pass i1: the HUD mark holds its floor at 720p and comes down with the height under 600 px', () => {
    expect(markScale(1920, 1080)).toBe(MARK_MIN_SCALE);          // the floor holds to 1166 px of height, as before
    expect(markScale(1280, 720)).toBe(MARK_MIN_SCALE);
    expect(markScale(1067, 600)).toBe(MARK_MIN_SCALE);
    expect(markScale(800, 450)).toBeCloseTo(0.81, 5);
    expect(markScale(480, 270)).toBe(MARK_SMALL_SCALE);
    expect(markScale(2560, 1440)).toBeCloseTo(1.3333, 3);
    // its share of the frame's height: no more in a 450 px window than the quarter it has at 600 px
    expect((139 * markScale(800, 450)) / 450).toBeLessThanOrEqual((139 * markScale(1067, 600)) / 600 + 1e-9);
  });
  it('movement cards split into numeral and title; card_title and card_end are single lines', () => {
    expect(splitCard(story.lines.card_iv.text)).toEqual({ numeral: 'IV', title: 'The Line' });
    expect(splitCard(story.lines.card_vii.text)).toEqual({ numeral: 'VII', title: 'Seven' });
    expect(splitCard(story.lines.card_title.text)).toEqual({ numeral: '', title: 'KEEP SEVEN' });
    expect(splitCard(story.lines.card_end.text)).toEqual({ numeral: '', title: 'FIRST TALLY ENDS' });
    for (const key of ['card_i', 'card_ii', 'card_iii', 'card_iv', 'card_v', 'card_vi', 'card_vii'] as const) expect(splitCard(story.lines[key].text).numeral, key).not.toBe('');
  });
  it('FOV 50 .. 80 vertical is shown as 79 .. 112 horizontal at 16:9 (GDD 15)', () => {
    expect(horizontalFov(50)).toBe(79);
    expect(horizontalFov(80)).toBe(112);
    expect(horizontalFov(62)).toBe(94);
  });
  it('the end card clock', () => {
    expect(clockTime(0)).toBe('0:00');
    expect(clockTime(1187.6)).toBe('19:47');
    expect(clockTime(3725)).toBe('1:02:05');
  });
});

describe('strings (static scan of src/ui)', () => {
  // identifiers of the platform, not words shown to the player
  const TECHNICAL = /^(Key|Digit|Arrow|Mouse|Numpad|Enter|NumpadEnter|Space|Escape|Esc|Control|Shift|Alt|Meta|Left|Right|Up|Down|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Key[A-Z]|[SMLX]|XL|[IVX]{1,2})$/;
  it('no text reaches the DOM from a literal', () => {
    for (const { file, text } of sources) {
      const code = strip(text);
      expect(code.match(/\.textContent\s*=\s*(['"`])(?!\1)/g) ?? [], `${file}: textContent = '<literal>'`).toEqual([]);
      expect(code.match(/createTextNode\(\s*['"`]/g) ?? [], `${file}: createTextNode('<literal>')`).toEqual([]);
      expect(code.match(/setText\([^,()]+(\([^()]*\))?,\s*(['"`])(?!\2)[^)]*\)/g) ?? [], `${file}: setText(node, '<literal>')`).toEqual([]);
      expect(code.match(/\.(innerHTML|innerText|outerHTML)\b/g) ?? [], `${file}: innerHTML`).toEqual([]);
    }
  });
  it('no string literal in src/ui reads like a sentence or a label', () => {
    const found: string[] = [];
    for (const { file, text } of sources) {
      const code = strip(text).replace(/^import .*$/gm, '');
      for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
        const s = (m[1] ?? m[2] ?? '').trim();
        if (!/[A-Za-z]{2,}/.test(s)) continue;
        // capitalised words (a label), or lower-case words ending a sentence
        const words = s.split(/[^A-Za-z]+/).filter((w) => w.length > 0);
        const capitalised = words.filter((w) => /^[A-Z]/.test(w) && !TECHNICAL.test(w));
        if (capitalised.length > 0 || /[a-z]{2,}[.!?]$/.test(s)) {
          if (s.startsWith('http://www.w3.org/')) continue;
          if (/^[MLCVAZ][-\d.\s MLCVAZHhvlcz]*$/.test(s)) continue;         // SVG path data
          found.push(`${file}: '${s}'`);
        }
      }
    }
    // the only capitalised literals left are console diagnostics, which are for developers, and (pass i3) the credits'
    // four fallbacks and the repository's address, all in text.ts and nowhere else (docs/requests/ui.md asks for the keys)
    const credits = [...Object.values(CREDITS_FALLBACK), REPOSITORY].map((v) => `text.ts: '${v}'`);
    expect(found.filter((f) => !/\[ui\] /.test(f) && !credits.includes(f))).toEqual([]);
    expect(Object.keys(CREDITS_FALLBACK).sort()).toEqual(['ui_credits_made', 'ui_credits_report', 'ui_credits_source', 'ui_credits_version']);
  });
  it('every ui_* key of story.json is used by src/ui (none is intentionally unused)', () => {
    const all = sources.map((s) => strip(s.text)).join('\n');
    // pass i1: the end card shows a feat only when it was done ("... No" told nobody what it measured), so its "No" has
    // no place left; asked to be taken out of story.json (docs/requests/ui.md, pass i1)
    // closer, pass i1: ui_end_no is out of story.json
    // fixer, pass i4: three keys written for this pass's UI team before it starts (the design data is frozen for the
    // teams): the title's line for a visitor without a mouse, the line of a refused pointer lock, the pause legend's
    // line for a held line round. THE UI TEAM TAKES EACH OUT OF THIS LIST AS IT USES IT.
    const INTENTIONALLY_UNUSED: string[] = [];
    const unused = Object.keys(story.ui).filter((k) => !new RegExp(`'${k}'`).test(all) && !INTENTIONALLY_UNUSED.includes(k));
    expect(unused).toEqual([]);
    // and every key the code names exists
    const named = new Set(Array.from(all.matchAll(/'(ui_[a-z0-9_]+)'/g), (m) => m[1] as string));
    const CUES = ['ui_move', 'ui_select', 'ui_back'];             // AudioCue names, not strings
    // the allow-list: keys asked of the story owner (docs/requests/code-ui.md 2.1 to 2.3), read through uiOr() with a
    // fallback until they land (the key names, the subtitle size words, the end card's "of"); 'ui_key_' is the prefix
    const PENDING = ['ui_key_', 'ui_key_mouse_left', 'ui_key_mouse_middle', 'ui_key_mouse_right', 'ui_opt_size_s', 'ui_opt_size_m', 'ui_opt_size_l', 'ui_opt_size_xl', 'ui_end_of', 'ui_loading_line', ...Object.keys(CREDITS_FALLBACK)];
    const missing = [...named].filter((k) => !(k in story.ui) && !CUES.includes(k) && !PENDING.includes(k));
    expect(missing).toEqual([]);
    // every pending key is read through uiOr / the key-name table (never through ctx.data.ui, which throws on a missing key)
    for (const k of PENDING) expect(new RegExp(`data\\.ui\\('${k}'`).test(all), k).toBe(false);
    for (const k of ['rd_backstory']) expect(k in story.readables).toBe(true);
    expect('card_end' in story.lines).toBe(true);
  });
  it('the courtesy and the oath are in no string the UI composes', () => {
    const oath = story.lines.rv_ask.text;
    for (const { file, text } of [...sources, { file: 'ui.css', text: css }]) {
      expect(/water to you/i.test(text), file).toBe(false);
      expect(/and shade/i.test(text), file).toBe(false);
      expect(text.includes(oath), file).toBe(false);
    }
    for (const [key, value] of Object.entries(story.ui)) {
      expect(/water to you|and shade/i.test(value), key).toBe(false);
    }
  });
  it('the stylesheet has the eight tokens and the two stacks, and no web font or image', () => {
    for (const hex of ['#E9E2D0', '#14110F', '#C9A14A', '#6E5A2E', '#7CF2E2', '#B24BFF', '#F3E6CF', '#FF9433']) expect(css.includes(hex), hex).toBe(true);
    expect(css).toContain('"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif');
    expect(css).toContain('"Avenir Next", "Segoe UI", "Helvetica Neue", "DejaVu Sans", Arial, sans-serif');
    expect(/@font-face|@import|url\(/.test(css)).toBe(false);
    expect(/gradient/.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))).toBe(false);
    // violet is used once: the band of the seventh in state `violet`
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/var\(--violet\)/g)).toHaveLength(1);
    for (const { file, text } of sources) {
      expect(/from '(three|postprocessing)/.test(text), file).toBe(false);
      // pass i3 (R15): one picture, the share picture behind the loading screen, asked for once in system.ts
      expect(/getContext\(|fetch\(/.test(text), file).toBe(false);
      expect((text.match(/new Image\(/g) ?? []).length, file).toBe(file === 'system.ts' ? 1 : 0);
      if (file !== 'loadMeter.ts') expect(strip(text).match(/\.(jpe?g|png|webp|gif|svg)\b/g) ?? [], file).toEqual(file === 'system.ts' ? ['.jpg'] : []);
      for (const m of text.matchAll(/from '([^']+)'/g)) expect(/^\.\/|^\.\.\/core\//.test(m[1] as string), `${file} imports ${m[1]}`).toBe(true);
    }
  });
});

describe('pass i3: the credits sheet', () => {
  it('the version is package.json\'s, and the repository is the one the Pages workflow publishes from', () => {
    const pkg = JSON.parse(fs.readFileSync(ROOT + '/package.json', 'utf8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
    expect(REPOSITORY).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
  });
  it('a page on github.io names its own repository; any other address names REPOSITORY', () => {
    expect(repositoryUrl('knotenvy.github.io', '/keep-seven/')).toBe('https://github.com/knotenvy/keep-seven');
    expect(repositoryUrl('someone-else.github.io', '/a.fork_1/index.html')).toBe('https://github.com/someone-else/a.fork_1');
    expect(repositoryUrl('knotenvy.github.io', '/')).toBe(REPOSITORY);
    expect(repositoryUrl('knotenvy.github.io', '/index.html')).toBe(REPOSITORY);
    expect(repositoryUrl('127.0.0.1', '/keep-seven/')).toBe(REPOSITORY);
    expect(repositoryUrl('evil.github.io.example.com', '/x/')).toBe(REPOSITORY);
    expect(repositoryUrl('a.github.io', '/"><script>/')).toBe(REPOSITORY);
  });
  it('the day the copy was published, from document.lastModified; nothing when it is no date', () => {
    expect(publishedDate('10/07/2026 14:03:22')).toBe('2026-10-07');
    expect(publishedDate('')).toBe('');
    expect(publishedDate('Invalid Date')).toBe('');
  });
  it('the credits keep story.json\'s words and add what the game is made with, once; a key in story.json wins over the fallback', () => {
    useStoryUi(story.ui);
    const body = creditsBody(story.ui.ui_credits_body);
    expect(body.startsWith(story.ui.ui_credits_body)).toBe(true);
    expect(body).toMatch(/three\.js/);
    expect(creditsBody(body)).toBe(body);
    expect(body.includes('\n\n')).toBe(false);                    // one card
    useStoryUi({ ...story.ui, ui_credits_version: 'Count' });
    expect(creditsText('ui_credits_version')).toBe('Count');
    useStoryUi(story.ui);
    expect(creditsText('ui_credits_version')).toBe(CREDITS_FALLBACK.ui_credits_version);
  });
});
