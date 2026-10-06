// src/ui/optionsScreen: the whole GDD 15 table in five tabs. Every change goes straight to ctx.options.set (no apply
// button, no restart); every row redraws from ctx.options.value on `options/changed`, so the screen never holds a copy.
// Sliders are a hairline with a brass disc, toggles and choices are chambers: a ring (off) or a filled disc (on).
import { ACTIONS } from '../core/contracts.ts';
import { defaultBindings } from '../core/options.ts';
import type { Action, Bindings, GameContext, Options, StoryKey } from '../core/contracts.ts';
import { el, flag, pointerMoved, setText } from './dom.ts';
import { MenuList } from './menu.ts';
import { horizontalFov, keyName, uiOr } from './text.ts';

type NumberKey = 'sensitivity' | 'fov' | 'headBob' | 'screenShake' | 'subtitleBackground' | 'crosshairSize' | 'resolutionScale' | 'volumeMaster' | 'volumeEffects' | 'volumeMusic';
type BoolKey = 'invertY' | 'reduceMotion' | 'reduceFlashes' | 'subtitles' | 'captions' | 'crosshairOutline';
type ChoiceKey = 'subtitleSize' | 'difficulty' | 'sprintMode' | 'fireMode' | 'hints' | 'graphics' | 'crosshairColour';

export const ACTION_LABEL: Readonly<Record<Action, StoryKey>> = {
  forward: 'ui_action_forward', back: 'ui_action_back', left: 'ui_action_left', right: 'ui_action_right', fire: 'ui_action_fire',
  reload: 'ui_action_reload', line: 'ui_action_line', kept: 'ui_action_kept', interact: 'ui_action_interact', sprint: 'ui_action_sprint',
  jump: 'ui_action_jump', pause: 'ui_action_pause',
};
/** crosshair colours offered: white, bone, aqua, brass, ink (for the glare). No red. */
export const CROSSHAIR_COLOURS: readonly string[] = ['#ffffff', '#e9e2d0', '#7cf2e2', '#c9a14a', '#14110f'];

const percent = (v: number): string => `${Math.round(v * 100)} %`;
const times = (v: number): string => `×${v.toFixed(1)}`;
const degrees = (v: number): string => `${horizontalFov(v)}°`;

interface Row {
  node: HTMLElement;
  /** the option it edits ('' for buttons and headers) */
  key: keyof Options | '';
  refresh(): void;
  step(delta: number): void;
  enter(): void;
}
interface Tab { id: string; node: HTMLDivElement; pane: HTMLDivElement; rows: Row[] }
const TAB_LABEL: readonly (readonly [string, StoryKey])[] = [
  ['controls', 'ui_opt_tab_controls'], ['comfort', 'ui_opt_tab_comfort'], ['text', 'ui_opt_tab_text'], ['sound', 'ui_opt_tab_sound'], ['picture', 'ui_opt_tab_picture'],
];

export interface OptionsHost {
  cueMove(): void;
  cueSelect(): void;
  back(): void;
}

export class OptionsScreen {
  readonly node: HTMLDivElement;
  private readonly tabsNode: HTMLDivElement;
  private readonly tabs: Tab[] = [];
  private readonly foot: MenuList;
  private tab = 0;
  /** -1 = the tab row, 0 .. rows-1 = a row of the tab, rows = the foot */
  private row = -1;
  capturing = false;
  /** performance.now() when the last capture ended: the event that ended it is not also a menu key */
  captureEndedAt = -1;
  private captureSlot: HTMLElement | null = null;
  private readonly bindSlots: { action: Action; slot: number; node: HTMLDivElement }[] = [];
  private bindSlot = 0;

  constructor(private readonly ctx: GameContext, parent: Element, private readonly host: OptionsHost) {
    const ui = (key: StoryKey): string => ctx.data.ui(key);
    this.node = el('div', 'scr scrim options', parent);
    const box = el('div', 'opt', this.node);
    setText(el('h2', 'h', box), ui('ui_opt_title'));
    this.tabsNode = el('div', 'tabs', box);
    for (const [id, label] of TAB_LABEL) {
      const node = el('div', 'tab', this.tabsNode);
      node.setAttribute('data-tab', id);
      setText(node, ui(label));
      const tab: Tab = { id, node, pane: el('div', 'pane', box), rows: [] };
      tab.pane.setAttribute('data-pane', id);
      const index = this.tabs.length;
      node.addEventListener('click', (e) => { e.stopPropagation(); this.showTab(index); this.focusRow(-1); host.cueSelect(); });
      this.tabs.push(tab);
    }
    const [controls, comfort, text, sound, picture] = this.tabs as [Tab, Tab, Tab, Tab, Tab];

    // ---- controls: sensitivity and FOV first (GDD 15)
    this.slider(controls, 'sensitivity', 'ui_opt_sensitivity', 0.2, 4, 0.1, times);
    this.toggle(controls, 'invertY', 'ui_opt_invert_y');
    this.slider(controls, 'fov', 'ui_opt_fov', 50, 80, 1, degrees);
    this.choice(controls, 'sprintMode', 'ui_opt_sprint_mode', [['hold', 'ui_opt_hold'], ['toggle', 'ui_opt_toggle']]);
    this.choice(controls, 'fireMode', 'ui_opt_fire_mode', [['click', 'ui_opt_fire_click'], ['hold', 'ui_opt_fire_hold']]);
    const head = el('div', 'row head', controls.pane);
    setText(el('span', 'lab', head), ui('ui_opt_bindings'));
    const binds = el('div', 'binds', controls.pane);
    for (const action of ACTIONS) this.binding(controls, binds, action);
    // ---- comfort
    this.slider(comfort, 'headBob', 'ui_opt_bob', 0, 1.5, 0.05, percent);
    this.slider(comfort, 'screenShake', 'ui_opt_shake', 0, 1, 0.05, percent);
    this.toggle(comfort, 'reduceMotion', 'ui_opt_reduce_motion');
    this.toggle(comfort, 'reduceFlashes', 'ui_opt_reduce_flashes');
    this.choice(comfort, 'difficulty', 'ui_opt_difficulty', [['easy', 'ui_opt_diff_easy'], ['normal', 'ui_opt_diff_normal'], ['hard', 'ui_opt_diff_hard']],
      { easy: 'ui_opt_diff_easy_desc', normal: 'ui_opt_diff_normal_desc', hard: 'ui_opt_diff_hard_desc' });
    this.choice(comfort, 'hints', 'ui_opt_hints', [['off', 'ui_opt_hints_off'], ['normal', 'ui_opt_hints_normal'], ['fast', 'ui_opt_hints_fast']]);
    this.slider(comfort, 'crosshairSize', 'ui_opt_crosshair_size', 0.5, 2, 0.1, times);
    this.choice(comfort, 'crosshairColour', 'ui_opt_crosshair_colour', CROSSHAIR_COLOURS.map((c) => [c, ''] as const));
    this.toggle(comfort, 'crosshairOutline', 'ui_opt_crosshair_outline');
    // ---- text
    this.toggle(text, 'subtitles', 'ui_opt_subtitles');
    // the size words are requested (docs/requests/code-ui.md 2.2): until they exist the sizes read as the contract's S M L XL
    this.choice(text, 'subtitleSize', 'ui_opt_subtitle_size', [['S', 'ui_opt_size_s'], ['M', 'ui_opt_size_m'], ['L', 'ui_opt_size_l'], ['XL', 'ui_opt_size_xl']]);
    this.slider(text, 'subtitleBackground', 'ui_opt_subtitle_bg', 0, 1, 0.05, percent);
    this.toggle(text, 'captions', 'ui_opt_captions');
    // ---- sound
    this.slider(sound, 'volumeMaster', 'ui_opt_vol_master', 0, 1, 0.05, percent);
    this.slider(sound, 'volumeEffects', 'ui_opt_vol_effects', 0, 1, 0.05, percent);
    this.slider(sound, 'volumeMusic', 'ui_opt_vol_music', 0, 1, 0.05, percent);
    // ---- picture
    this.choice(picture, 'graphics', 'ui_opt_graphics', [['auto', 'ui_opt_gfx_auto'], ['low', 'ui_opt_gfx_low'], ['high', 'ui_opt_gfx_high']]);
    this.slider(picture, 'resolutionScale', 'ui_opt_resolution', 0.5, 1, 0.05, percent);

    const foot = el('div', 'opt-foot', box);
    this.foot = new MenuList(foot, () => host.cueMove(), () => host.cueSelect());
    this.foot.node.style.flexDirection = 'row';
    this.foot.add('reset', ui('ui_opt_reset'), () => { ctx.options.reset(); });
    this.foot.add('back', ui('ui_opt_back'), () => host.back());
    this.foot.node.addEventListener('mousemove', () => { if (this.row !== this.current().rows.length) this.focusRow(this.current().rows.length); }, true);
    this.showTab(0);
    this.focusRow(-1);
  }

  // =============================================================== rows
  private addRow(tab: Tab, parent: Element, cls: string, key: keyof Options | '', label: string): { node: HTMLDivElement; ctl: HTMLDivElement } {
    const node = el('div', cls, parent);
    if (key !== '') node.setAttribute('data-opt', key);
    setText(el('span', 'lab', node), label);
    const ctl = el('div', 'ctl', node);
    const index = tab.rows.length;
    node.addEventListener('mousemove', (e) => { if (pointerMoved(e) && !this.capturing && this.row !== index) this.focusRow(index); });
    return { node, ctl };
  }

  private slider(tab: Tab, key: NumberKey, label: StoryKey, min: number, max: number, step: number, text: (v: number) => string): void {
    const { ctx } = this;
    const { node, ctl } = this.addRow(tab, tab.pane, 'row', key, ctx.data.ui(label));
    const track = el('div', 'sl', ctl);
    track.setAttribute('data-slider', key);
    const knob = el('i', 'sl-knob', track);
    const value = el('span', 'val', ctl);
    const snap = (v: number): number => Math.min(max, Math.max(min, +(Math.round(v / step) * step).toFixed(4)));
    const set = (v: number): void => { const next = snap(v); if (next !== ctx.options.value[key]) ctx.options.set(key, next); };
    const at = (clientX: number): void => {
      const r = track.getBoundingClientRect();
      set(min + ((clientX - r.left) / (r.width || 1)) * (max - min));
    };
    track.addEventListener('pointerdown', (e) => { e.preventDefault(); track.setPointerCapture(e.pointerId); at(e.clientX); });
    track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) at(e.clientX); });
    tab.rows.push({
      node, key,
      refresh: () => {
        const v = ctx.options.value[key];
        knob.style.left = `${(((v - min) / (max - min)) * 100).toFixed(2)}%`;
        setText(value, text(v));
      },
      step: (delta) => set(ctx.options.value[key] + delta * step),
      enter: () => undefined,
    });
  }

  private toggle(tab: Tab, key: BoolKey, label: StoryKey): void {
    const { ctx } = this;
    const { node, ctl } = this.addRow(tab, tab.pane, 'row', key, ctx.data.ui(label));
    const cho = el('div', 'cho', ctl);
    cho.setAttribute('data-toggle', key);
    el('i', 'cb', cho);
    const word = el('span', '', cho);
    const flip = (): void => ctx.options.set(key, !ctx.options.value[key]);
    cho.addEventListener('click', (e) => { e.stopPropagation(); this.host.cueSelect(); flip(); });
    tab.rows.push({
      node, key,
      refresh: () => { const on = ctx.options.value[key]; flag(cho, 'on', on); setText(word, ctx.data.ui(on ? 'ui_opt_on' : 'ui_opt_off')); },
      step: (delta) => { if ((delta > 0) !== ctx.options.value[key]) flip(); },
      enter: flip,
    });
  }

  private choice<K extends ChoiceKey>(tab: Tab, key: K, label: StoryKey, values: readonly (readonly [Options[K], StoryKey])[], descriptions?: Readonly<Record<string, StoryKey>>): void {
    const { ctx } = this;
    const { node, ctl } = this.addRow(tab, tab.pane, 'row', key, ctx.data.ui(label));
    const nodes: HTMLDivElement[] = [];
    const set = (v: Options[K]): void => { if (v !== ctx.options.value[key]) ctx.options.set(key, v); };
    for (const [value, name] of values) {
      const cho = el('div', 'cho', ctl);
      cho.setAttribute('data-value', String(value));
      if (key === 'crosshairColour') { const sw = el('i', 'sw', cho); sw.style.setProperty('--c', String(value)); }
      else { el('i', 'cb', cho); setText(el('span', '', cho), uiOr(name, String(value))); }
      cho.addEventListener('click', (e) => { e.stopPropagation(); this.host.cueSelect(); set(value); });
      nodes.push(cho);
    }
    const desc = descriptions ? el('div', 'desc', node) : null;
    /** what is shown as selected: the option, except that the hidden `min` tier reads as Low (GDD 15) */
    const shown = (): Options[K] => (key === 'graphics' && ctx.quality.tier === 'min' ? ('low' as Options[K]) : ctx.options.value[key]);
    const indexOf = (): number => values.findIndex(([v]) => v === shown());
    tab.rows.push({
      node, key,
      refresh: () => {
        const cur = shown();
        for (let i = 0; i < nodes.length; i++) flag(nodes[i] as HTMLDivElement, 'on', (values[i] as readonly [Options[K], StoryKey])[0] === cur);
        if (desc && descriptions) { const d = descriptions[String(cur)]; setText(desc, d ? ctx.data.ui(d) : ''); }
      },
      step: (delta) => {
        const i = indexOf(), n = values.length;
        const next = values[Math.min(n - 1, Math.max(0, (i < 0 ? 0 : i) + delta))];
        if (next) set(next[0]);
      },
      enter: () => { const next = values[(indexOf() + 1) % values.length]; if (next) set(next[0]); },
    });
  }

  private binding(tab: Tab, parent: Element, action: Action): void {
    const { ctx } = this;
    const { node, ctl } = this.addRow(tab, parent, 'row bind', '', ctx.data.ui(ACTION_LABEL[action]));
    node.setAttribute('data-opt', 'bindings');
    node.setAttribute('data-action', action);
    const slots: HTMLDivElement[] = [];
    const rowIndex = tab.rows.length;
    for (let slot = 0; slot < 2; slot++) {
      const s = el('div', 'slot', ctl);
      s.setAttribute('data-slot', String(slot));
      s.addEventListener('click', (e) => { e.stopPropagation(); if (this.capturing) return; this.focusRow(rowIndex); this.bindSlot = slot; this.markSlot(); this.capture(action, slot, s); });
      slots.push(s);
      this.bindSlots.push({ action, slot, node: s });
    }
    tab.rows.push({
      node, key: 'bindings',
      refresh: () => {
        const list = ctx.options.value.bindings[action];
        for (let i = 0; i < 2; i++) if (slots[i] !== this.captureSlot) setText(slots[i] as HTMLDivElement, keyName(list[i] ?? ''));
      },
      step: (delta) => { this.bindSlot = delta > 0 ? 1 : 0; this.markSlot(); },
      enter: () => this.capture(action, this.bindSlot, slots[this.bindSlot] as HTMLDivElement),
    });
  }
  private markSlot(): void {
    const row = this.current().rows[this.row];
    for (const s of this.bindSlots) flag(s.node, 'cur', row !== undefined && s.node.parentElement?.parentElement === row.node && s.slot === this.bindSlot);
  }

  // =============================================================== rebinding
  /** The next key or mouse button becomes the binding; Escape cancels; Ctrl is never taken (core ignores it). */
  private capture(action: Action, slot: number, node: HTMLElement): void {
    if (this.capturing) return;
    this.clearMoved();
    this.capturing = true;
    this.captureSlot = node;
    flag(node, 'capturing', true);
    setText(node, this.ctx.data.ui('ui_opt_bind_press'));
    this.host.cueSelect();
    this.ctx.input.captureNextCode((code) => {
      this.capturing = false;
      this.captureEndedAt = performance.now();
      this.captureSlot = null;
      flag(node, 'capturing', false);
      if (code !== '') {
        this.rebind(action, slot, code);
        // the selection follows the key (a swap can leave it in the action's other slot)
        const at = this.ctx.options.value.bindings[action].indexOf(code);
        if (at >= 0 && at !== this.bindSlot) { this.bindSlot = at; this.markSlot(); }
      }
      this.refresh();
    });
  }
  /**
   * `code` goes to (action, slot); if another slot held it, that slot takes what this one had (a swap). No action is
   * ever left without a key: when the slot was empty and the code was its holder's only one, the holder takes this
   * action's other code instead (still a swap, nothing lost), and failing that its own defaults. Every slot other
   * than the target whose content changed is marked (`moved`) so the player sees what went where.
   */
  rebind(action: Action, slot: number, code: string): void {
    if (code === '' || code.startsWith('Control')) return;
    const now = this.ctx.options.value.bindings;
    const before = {} as Bindings, next = {} as Bindings;
    for (const a of ACTIONS) { before[a] = now[a].slice(); next[a] = now[a].slice(); }
    const mine = next[action];
    const old = mine[slot] ?? '';
    if (old === code) return;
    let holder: Action | '' = '', holderSlot = -1;
    for (const a of ACTIONS) {
      const list = next[a];
      for (let i = 0; i < list.length; i++) if (list[i] === code && !(a === action && i === slot)) { holder = a; holderSlot = i; }
    }
    if (slot < mine.length) mine[slot] = code; else mine.push(code);
    if (holder !== '') {
      const list = next[holder];
      if (old !== '' || holder === action || list.length > 1) list[holderSlot] = old;
      else {
        // its only key went into an empty slot: it takes the other key of the action that took it
        const other = mine.find((c) => c !== code && c !== '') ?? '';
        if (other !== '') mine.splice(mine.indexOf(other), 1);
        list[holderSlot] = other;
      }
    }
    for (const a of ACTIONS) next[a] = next[a].filter((c) => c !== '');
    const healed = repairBindings(next) ?? next;
    this.ctx.options.set('bindings', healed);
    this.markMoved(before, this.ctx.options.value.bindings, action, code);
  }
  /** Mark the slots (other than the one that now holds `code`) that do not show what they showed before. */
  private markMoved(before: Readonly<Bindings>, after: Readonly<Bindings>, action: Action, code: string): void {
    for (const s of this.bindSlots) {
      const was = before[s.action][s.slot] ?? '', is = after[s.action][s.slot] ?? '';
      flag(s.node, 'moved', was !== is && !(s.action === action && is === code));
    }
  }
  private clearMoved(): void { for (const s of this.bindSlots) flag(s.node, 'moved', false); }

  // =============================================================== focus and keys
  private current(): Tab { return this.tabs[this.tab] as Tab; }
  showTab(index: number): void {
    this.tab = (index + this.tabs.length) % this.tabs.length;
    for (let i = 0; i < this.tabs.length; i++) {
      const t = this.tabs[i] as Tab;
      flag(t.node, 'on', i === this.tab);
      flag(t.pane, 'on', i === this.tab);
    }
    this.refresh();
  }
  private focusRow(row: number): void {
    const tab = this.current();
    this.row = Math.max(-1, Math.min(tab.rows.length, row));
    flag(this.tabsNode, 'rowsel', this.row === -1);
    for (const t of this.tabs) for (let i = 0; i < t.rows.length; i++) flag((t.rows[i] as Row).node, 'sel', t === tab && i === this.row);
    if (this.row === tab.rows.length) this.foot.select(this.foot.selected); else for (const it of this.foot.items) flag(it.node, 'sel', false);
    this.markSlot();
  }
  /** Called when the screen opens. */
  open(): void { this.clearMoved(); this.showTab(0); this.focusRow(-1); }
  /** One row (after `options/changed`), or all of them. */
  refresh(key?: keyof Options): void {
    for (const t of this.tabs) for (const r of t.rows) if (key === undefined || r.key === key) r.refresh();
  }
  /** Arrow keys, W / S, Enter and Space; Escape is the caller's. Returns true when the key was used. */
  key(code: string): boolean {
    if (this.capturing) return true;
    const tab = this.current(), n = tab.rows.length;
    switch (code) {
      case 'ArrowUp': case 'KeyW': this.focusRow(this.row <= -1 ? n : this.row - 1); this.host.cueMove(); return true;
      case 'ArrowDown': case 'KeyS': this.focusRow(this.row >= n ? -1 : this.row + 1); this.host.cueMove(); return true;
      case 'ArrowLeft': case 'KeyA': case 'ArrowRight': case 'KeyD': {
        const delta = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
        if (this.row === -1) { this.showTab(this.tab + delta); this.focusRow(-1); }
        else if (this.row === n) this.foot.move(delta);
        else (tab.rows[this.row] as Row).step(delta);
        this.host.cueMove();
        return true;
      }
      case 'Enter': case 'NumpadEnter': case 'Space':
        if (this.row === n) this.foot.activate();
        else if (this.row >= 0) { this.host.cueSelect(); (tab.rows[this.row] as Row).enter(); }
        return true;
      default: return false;
    }
  }
}

/**
 * Bindings in which no action is without a key, or null when `b` already is so. An action with no key takes its
 * default keys back, and those keys leave whatever else held them; an action emptied by that takes its own defaults in
 * turn (the defaults of two actions never share a key, so this ends).
 */
export function repairBindings(b: Readonly<Bindings>): Bindings | null {
  let empty = false;
  for (const a of ACTIONS) if (b[a].length === 0) { empty = true; break; }
  if (!empty) return null;
  const defaults = defaultBindings();
  const out = {} as Bindings;
  for (const a of ACTIONS) out[a] = b[a].slice();
  for (let pass = 0; pass < ACTIONS.length; pass++) {
    let changed = false;
    for (const a of ACTIONS) {
      if (out[a].length > 0) continue;
      const mine = defaults[a];
      for (const other of ACTIONS) if (other !== a) out[other] = out[other].filter((c) => !mine.includes(c));
      out[a] = mine.slice();
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}
