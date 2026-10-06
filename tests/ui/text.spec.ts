// Unit tests of the UI's text rules (src/ui/text.ts) and the static scans of docs/workorders/code-ui.md section 6
// ("Strings"): no player-facing literal in src/ui, every ui_* key of story.json used, the courtesy and the oath absent.
import { describe, expect, it } from 'vitest';
import type { Bindings } from '../../src/core/contracts.ts';
import { defaultBindings } from '../../src/core/options.ts';
import { clockTime, format, horizontalFov, keyName, keyStoryKey, roman, splitCard, splitCards, tokenize, uiOr, useStoryUi, wrapSubtitle, SUBTITLE_LINE_CHARS } from '../../src/ui/text.ts';
import story from '../../design/story.json';

interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
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
    expect(splitCards(story.readables.rd_note_lip.body)[0]).toBe('Reeve Ware. Water to you.');
    for (const [key, r] of Object.entries(story.readables)) expect(splitCards(r.body).join('\n\n'), key).toBe(r.body);
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
    // the only capitalised literals left are console diagnostics, which are for developers
    expect(found.filter((f) => !/\[ui\] /.test(f))).toEqual([]);
  });
  it('every ui_* key of story.json is used by src/ui (none is intentionally unused)', () => {
    const all = sources.map((s) => strip(s.text)).join('\n');
    const INTENTIONALLY_UNUSED: string[] = [];
    const unused = Object.keys(story.ui).filter((k) => !new RegExp(`'${k}'`).test(all) && !INTENTIONALLY_UNUSED.includes(k));
    expect(unused).toEqual([]);
    // and every key the code names exists
    const named = new Set(Array.from(all.matchAll(/'(ui_[a-z0-9_]+)'/g), (m) => m[1] as string));
    const CUES = ['ui_move', 'ui_select', 'ui_back'];             // AudioCue names, not strings
    // the allow-list: keys asked of the story owner (docs/requests/code-ui.md 2.1 to 2.3), read through uiOr() with a
    // fallback until they land (the key names, the subtitle size words, the end card's "of"); 'ui_key_' is the prefix
    const PENDING = ['ui_key_', 'ui_key_mouse_left', 'ui_key_mouse_middle', 'ui_key_mouse_right', 'ui_opt_size_s', 'ui_opt_size_m', 'ui_opt_size_l', 'ui_opt_size_xl', 'ui_end_of'];
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
      expect(/getContext\(|new Image\(|fetch\(/.test(text), file).toBe(false);
      for (const m of text.matchAll(/from '([^']+)'/g)) expect(/^\.\/|^\.\.\/core\//.test(m[1] as string), `${file} imports ${m[1]}`).toBe(true);
    }
  });
});
