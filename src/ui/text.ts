// src/ui/text: the pure text rules of the UI (no DOM): key names, placeholders, subtitle wrapping, readable cards,
// title-card splitting, the FOV shown in the options and the end card's numbers. Unit-tested in tests/ui/text.spec.ts.
import type { Action, Bindings } from '../core/contracts.ts';

/** GDD 12.2: at most 2 lines of 42 characters. */
export const SUBTITLE_LINE_CHARS = 42;

const ROMAN: readonly (readonly [number, string])[] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
/** 1 .. 39 as a roman numeral (movements are 1 .. 7); anything else as digits. */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 39) return String(n);
  let out = '', left = n;
  for (const [value, glyph] of ROMAN) while (left >= value) { out += glyph; left -= value; }
  return out;
}

/**
 * story.json's `ui` table, for the strings the UI has asked the story owner for and does not have yet
 * (docs/requests/code-ui.md 2.1 to 2.3: key names, subtitle size words, the end card's "of"). Each is used the moment it
 * exists; until then the UI shows the fallback named where it is asked for. Set once by the UI system's init.
 */
let storyUi: Readonly<Record<string, string>> = {};
export function useStoryUi(table: Readonly<Record<string, string>>): void { storyUi = table; }
/** `story.ui[key]` when the key exists, otherwise `fallback` (never throws: the key may not have landed yet). */
export function uiOr(key: string, fallback: string): string {
  const s = storyUi[key];
  return s === undefined ? fallback : s;
}
/** The mouse buttons by their story keys (request 2.1). */
export const MOUSE_KEYS: readonly string[] = ['ui_key_mouse_left', 'ui_key_mouse_middle', 'ui_key_mouse_right'];
const KEY_PREFIX = 'ui_key_';
/**
 * The story key that would name a code (request 2.1): '' for the codes whose name is their own glyph (letters, digits,
 * arrows). Mouse0..2 -> ui_key_mouse_left / _middle / _right; ShiftLeft -> ui_key_shift, ShiftRight -> ui_key_shift_right;
 * anything else in snake case: Space -> ui_key_space, Escape -> ui_key_escape, BracketLeft -> ui_key_bracket_left.
 */
export function keyStoryKey(code: string): string {
  if (code === '' || /^(Key[A-Z]|Digit\d|Arrow(Up|Down|Left|Right))$/.test(code)) return '';
  const mouse = /^Mouse(\d)$/.exec(code);
  if (mouse) { const n = Number(mouse[1]); return MOUSE_KEYS[n] ?? KEY_PREFIX + 'mouse_' + (n + 1); }
  const mod = /^(Shift|Alt|Meta|Control)(Left|Right)$/.exec(code);
  if (mod) return KEY_PREFIX + (mod[1] as string).toLowerCase() + (mod[2] === 'Right' ? '_right' : '');
  return KEY_PREFIX + code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Za-z])(\d)/g, '$1_$2').toLowerCase();
}

const ARROWS: Readonly<Record<string, string>> = { Up: '↑', Down: '↓', Left: '←', Right: '→' };
/**
 * The name shown for a KeyboardEvent.code or 'Mouse<n>': story.json's name for it when the key exists (keyStoryKey),
 * otherwise derived from the code itself (request 2.1; story.json has no key names yet): KeyW -> W, Digit3 -> 3, ArrowUp -> an arrow glyph, ShiftLeft -> Shift, ShiftRight -> Shift Right,
 * Escape -> Esc, Mouse0 -> Mouse 1, BracketLeft -> Bracket Left. '' (nothing bound) is a dash.
 */
export function keyName(code: string): string {
  if (code === '') return '—';
  const story = keyStoryKey(code);
  if (story !== '') { const s = storyUi[story]; if (s !== undefined) return s; }
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1] as string;
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1] as string;
  m = /^Arrow(Up|Down|Left|Right)$/.exec(code);
  if (m) return ARROWS[m[1] as string] as string;
  m = /^(Mouse)(\d)$/.exec(code);
  if (m) return `${m[1]} ${Number(m[2]) + 1}`;
  m = /^(Numpad)(.+)$/.exec(code);
  if (m) return `${(m[1] as string).slice(0, 3)} ${m[2]}`;
  m = /^(Shift|Alt|Meta|Control)(Left|Right)$/.exec(code);
  if (m) return (m[2] as string).length === 4 ? (m[1] as string) : `${m[1]} ${m[2]}`;      // the left one is the plain name
  if (code.startsWith('Esc')) return code.slice(0, 3);
  return code.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/** The key a placeholder names: the first code bound to the action ('' when none is). */
export function boundCode(bindings: Readonly<Bindings>, action: Action): string {
  const list = bindings[action];
  return list && list.length > 0 ? (list[0] as string) : '';
}

const KEY_ACTIONS: readonly Action[] = ['forward', 'left', 'back', 'right', 'fire', 'reload', 'sprint', 'interact', 'line', 'kept'];
function isKeyAction(name: string): name is Action { return (KEY_ACTIONS as readonly string[]).includes(name); }

export interface TextToken { text: string; key: boolean; code: string }
/**
 * A story.json template as tokens: plain text, and one `key` token per {forward} {left} {back} {right} {fire} {reload}
 * {sprint} {interact} {line} {kept} with the name of the key bound right now. {n} and {movement} come from `values`.
 */
export function tokenize(template: string, bindings: Readonly<Bindings>, values: Readonly<Record<string, string>> = {}): TextToken[] {
  const out: TextToken[] = [];
  const re = /\{([a-z_]+)\}/g;
  let last = 0;
  const push = (text: string): void => {
    if (text === '') return;
    const prev = out[out.length - 1];
    if (prev && !prev.key) prev.text += text; else out.push({ text, key: false, code: '' });
  };
  for (let m = re.exec(template); m; m = re.exec(template)) {
    push(template.slice(last, m.index));
    const name = m[1] as string;
    if (isKeyAction(name)) { const code = boundCode(bindings, name); out.push({ text: keyName(code), key: true, code }); }
    else push(values[name] ?? m[0]);
    last = m.index + m[0].length;
  }
  push(template.slice(last));
  return out;
}
/** The same as one string (what `visibleText()` reports). */
export function format(template: string, bindings: Readonly<Bindings>, values: Readonly<Record<string, string>> = {}): string {
  let out = '';
  for (const t of tokenize(template, bindings, values)) out += t.text;
  return out;
}

/**
 * Wrap by words into lines of at most `max` characters. A text that fits two lines is split at the space nearest its
 * middle (two even lines read better than a full one and an orphan); a longer one is wrapped greedily and shown whole.
 */
export function wrapSubtitle(text: string, max: number = SUBTITLE_LINE_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return [clean];
  const mid = clean.length / 2;
  let best = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] !== ' ') continue;
    if (i > max || clean.length - i - 1 > max) continue;
    if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  }
  if (best >= 0) return [clean.slice(0, best), clean.slice(best + 1)];
  const lines: string[] = [];
  let line = '';
  for (const word of clean.split(' ')) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= max) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * A card this short, on one line, is a salutation or a signature ("Reeve Ware. ..." / a name): it shares a card with the
 * paragraph beside it instead of standing alone in a sheet built for a paragraph (pass i1: the first note took three
 * presses for four sentences).
 */
export const SHORT_CARD_CHARS = 40;
/**
 * A readable body in cards: a blank line starts a new card (story.json meta.rules.readable_cards). A one-line card of
 * at most SHORT_CARD_CHARS joins the card after it (the last one joins the card before it), a blank line between them.
 */
export function splitCards(body: string): string[] {
  const parts = body.split(/\n[ \t]*\n/).map((c) => c.replace(/^\n+|\n+$/g, '')).filter((c) => c !== '');
  const short = (c: string): boolean => c.length <= SHORT_CARD_CHARS && !c.includes('\n');
  const cards: string[] = [];
  let carry = '';
  for (const part of parts) {
    const text = carry === '' ? part : carry + '\n\n' + part;
    if (short(part)) { carry = text; continue; }
    cards.push(text);
    carry = '';
  }
  if (carry !== '') { if (cards.length > 0) cards[cards.length - 1] += '\n\n' + carry; else cards.push(carry); }
  return cards.length > 0 ? cards : [''];
}

/**
 * Pass i2 (story reviewer: the first note was two thin cards, the ledger three of one short paragraph each, on a sheet
 * with room for all of it). A readable found in the world is laid out by what the sheet holds, not one paragraph a
 * card: paragraphs are packed onto a card while its estimated height stays within CARD_MAX_LINES lines of
 * CARD_LINE_CHARS characters (the sheet is 60 ch wide: ui.css `.sheet-body`; a blank line between paragraphs counts as
 * a line). Every note in story.json is one card by this rule (the longest, the ledger, is 9 lines). A paragraph is
 * never split; one longer than the budget has a card to itself. "The story so far" and the credits keep their authored
 * cards (splitCards: a blank line starts a new card, story.json meta.rules.readable_cards): their pace is deliberate.
 */
export const CARD_MAX_LINES = 12;
export const CARD_LINE_CHARS = 58;
/** Estimated lines a text takes on the sheet: each of its lines wrapped at `chars`, a blank line counted as one. */
export function sheetLines(text: string, chars: number = CARD_LINE_CHARS): number {
  let n = 0;
  for (const line of text.split('\n')) n += Math.max(1, Math.ceil(line.trim().length / chars));
  return n;
}
export function packCards(body: string, maxLines: number = CARD_MAX_LINES, chars: number = CARD_LINE_CHARS): string[] {
  const parts = body.split(/\n[ \t]*\n/).map((c) => c.replace(/^\n+|\n+$/g, '')).filter((c) => c !== '');
  const cards: string[] = [];
  let card = '', lines = 0;
  for (const part of parts) {
    const n = sheetLines(part, chars);
    if (card !== '' && lines + 1 + n <= maxLines) { card += '\n\n' + part; lines += 1 + n; continue; }
    if (card !== '') cards.push(card);
    card = part; lines = n;
  }
  if (card !== '') cards.push(card);
  // a last card that is only a signature or a closing line never stands alone
  const last = cards[cards.length - 1];
  if (cards.length > 1 && last !== undefined && last.length <= SHORT_CARD_CHARS && !last.includes('\n')) { cards.pop(); cards[cards.length - 1] += '\n\n' + last; }
  return cards.length > 0 ? cards : [''];
}

/** A movement card is "numeral and title" ('IV. The Line'); `card_title` and `card_end` are one line (numeral ''). */
export function splitCard(text: string): { numeral: string; title: string } {
  const m = /^([IVXLC]+)\s*[.:·—-]\s*(.+)$/.exec(text.trim());
  return m ? { numeral: m[1] as string, title: m[2] as string } : { numeral: '', title: text.trim() };
}

/** Vertical FOV in degrees -> the horizontal FOV of a 16:9 frame (GDD 15: 50 .. 80 is shown as 79 .. 112). */
export function horizontalFov(verticalDeg: number): number {
  const half = Math.tan((verticalDeg * Math.PI) / 360) * (16 / 9);
  return Math.round((Math.atan(half) * 360) / Math.PI);
}

/** Seconds as m:ss (or h:mm:ss). */
export function clockTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60, m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600);
  const two = (n: number): string => (n < 10 ? '0' + n : String(n));
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/**
 * Pass i2: the line under the name while the game loads, in the narrator's voice: `ui_loading_line` when story.json has
 * it (requested: docs/requests/ui.md), until then the last two sentences of the second card of "The story so far"
 * (the court and the Rule). index.html's pre-boot page carries the same words: tests/ui/i2.test.mjs holds them equal.
 */
export function loadingLine(backstory: string): string {
  const card = backstory.split(/\n[ \t]*\n/)[1] ?? '';
  const sentences = card.split(/(?<=[.!?])\s+/).filter((t) => t !== '');
  return uiOr('ui_loading_line', sentences.slice(-2).join(' '));
}

// ---------------------------------------------------------------- the credits sheet (pass i3)
/** The release's version (package.json's, by hand: src/ui may not import outside src; tests/ui/text.spec.ts holds them equal). */
export const VERSION = '1.0.0';
/** Where the source lives when the page is not on a github.io address that says so itself. */
export const REPOSITORY = 'https://github.com/KnotEnvy/keep-seven';
/**
 * The repository of a page served by GitHub Pages is in its own address (`<owner>.github.io/<repo>/`): a fork's copy
 * links to the fork. Anywhere else (a local build, a custom domain) it is REPOSITORY.
 */
export function repositoryUrl(hostname: string, pathname: string): string {
  const owner = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.github\.io$/i.exec(hostname)?.[1];
  const repo = /^\/([A-Za-z0-9._-]+)(?:\/|$)/.exec(pathname)?.[1];
  return owner && repo && !/\.html?$/i.test(repo) ? `https://github.com/${owner}/${repo}` : REPOSITORY;
}
/** `document.lastModified` ("10/07/2026 14:03:22": the day the host was given this copy) as 2026-10-07; '' when it is no date. */
export function publishedDate(lastModified: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(lastModified);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
}
/**
 * The credits' four strings story.json does not have yet (asked for in docs/requests/ui.md, pass i3; design/*.json was
 * frozen for the UI team in that pass). Each is read with creditsText(): story.json's the moment the key exists. These
 * are the ONLY player-facing words written in src/ui (tests/ui/text.spec.ts holds the list to exactly these).
 */
export const CREDITS_FALLBACK: Readonly<Record<string, string>> = {
  ui_credits_made: 'Made with three.js and Blender.',
  ui_credits_version: 'Version',
  ui_credits_source: 'Source',
  ui_credits_report: 'Report a problem',
};
export function creditsText(key: string): string { return uiOr(key, CREDITS_FALLBACK[key] ?? ''); }
/** The credits' words with what the game is made with on a line of its own (story.json's `ui_credits_made` when it has one). */
export function creditsBody(body: string): string {
  const made = creditsText('ui_credits_made');
  return made === '' || body.includes(made) ? body : `${body}\n${made}`;
}
