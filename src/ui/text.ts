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

/** A readable body in cards: a blank line starts a new card (story.json meta.rules.readable_cards). */
export function splitCards(body: string): string[] {
  const cards = body.split(/\n[ \t]*\n/).map((c) => c.replace(/^\n+|\n+$/g, '')).filter((c) => c !== '');
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
