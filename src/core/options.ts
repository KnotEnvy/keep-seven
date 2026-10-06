// Options store (ARCHITECTURE 10.3, GDD 15): defaults, clamping, persistence, 'options/changed'.
import { ACTIONS } from './contracts.ts';
import type { Action, Bindings, EventBus, GameEvents, Options, OptionsStore } from './contracts.ts';

export const OPTIONS_KEY = 'keepseven.options.v1';

/** The subset of Storage the stores use (localStorage, or an in-memory object in test mode). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
}
/** localStorage when it works (it throws in some privacy modes), else memory. */
export function browserStorage(): KeyValueStorage {
  try {
    const ls = globalThis.localStorage;
    const probe = '__keepseven_probe__';
    ls.setItem(probe, '1'); ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryStorage();
  }
}

export function defaultBindings(): Bindings {
  return {
    forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    fire: ['Mouse0'], reload: ['KeyR'], line: ['KeyQ'], kept: ['KeyF'], interact: ['KeyE'],
    sprint: ['ShiftLeft'], jump: ['Space'], pause: ['Escape', 'KeyP'],
  };
}
export function defaultOptions(): Options {
  return {
    sensitivity: 1, invertY: false, fov: 62, headBob: 1, screenShake: 1,
    reduceMotion: false, reduceFlashes: false,
    subtitles: true, subtitleSize: 'M', subtitleBackground: 0.6, captions: true,
    difficulty: 'normal', sprintMode: 'hold', fireMode: 'click',
    bindings: defaultBindings(),
    crosshairSize: 1, crosshairColour: '#ffffff', crosshairOutline: true,
    hints: 'normal', graphics: 'auto', resolutionScale: 1,
    volumeMaster: 0.8, volumeEffects: 1.0, volumeMusic: 0.7,
  };
}

const RANGES: Partial<Record<keyof Options, readonly [number, number]>> = {
  sensitivity: [0.2, 4], fov: [50, 80], headBob: [0, 1.5], screenShake: [0, 1], subtitleBackground: [0, 1],
  crosshairSize: [0.5, 2], resolutionScale: [0.5, 1], volumeMaster: [0, 1], volumeEffects: [0, 1], volumeMusic: [0, 1],
};
const ENUMS: Partial<Record<keyof Options, readonly string[]>> = {
  subtitleSize: ['S', 'M', 'L', 'XL'], difficulty: ['easy', 'normal', 'hard'], sprintMode: ['hold', 'toggle'],
  fireMode: ['click', 'hold'], hints: ['off', 'normal', 'fast'], graphics: ['auto', 'low', 'high'],
};
const BOOLS: readonly (keyof Options)[] = ['invertY', 'reduceMotion', 'reduceFlashes', 'subtitles', 'captions', 'crosshairOutline'];

function isBindableCode(code: unknown): code is string {
  return typeof code === 'string' && code.length > 0 && code.length < 32 && !code.startsWith('Control');
}
function sanitizeBindings(value: unknown, fallback: Bindings): Bindings {
  const out = defaultBindings();
  for (const a of ACTIONS) out[a] = fallback[a].slice();
  if (value === null || typeof value !== 'object') return out;
  const src = value as Record<string, unknown>;
  for (const a of ACTIONS) {
    const list = src[a];
    if (!Array.isArray(list)) continue;
    const codes: string[] = [];
    for (const c of list) if (isBindableCode(c) && !codes.includes(c) && codes.length < 2) codes.push(c);
    out[a] = codes;
  }
  // an action left with no key takes its default codes back, from whoever holds them; an action emptied by that takes
  // its own in turn (the defaults of two actions never share a key, so this ends). The same rule as the UI's
  // repairBindings (docs/requests/code-ui.md 8.2a), so a page without the real UI is covered too
  let defaults: Bindings | null = null;
  for (let pass = 0; pass < ACTIONS.length; pass++) {
    let changed = false;
    for (const a of ACTIONS) {
      if (out[a].length > 0) continue;
      defaults ??= defaultBindings();
      const mine = defaults[a];
      for (const other of ACTIONS) if (other !== a) out[other] = out[other].filter((c) => !mine.includes(c));
      out[a] = mine.slice();
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}
/** Returns the sanitized value for a key, or undefined when the input cannot be used at all. */
export function sanitizeOption<K extends keyof Options>(key: K, value: unknown, current: Options): Options[K] | undefined {
  const range = RANGES[key];
  if (range) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.min(range[1], Math.max(range[0], value)) as Options[K];
  }
  const en = ENUMS[key];
  if (en) return (typeof value === 'string' && en.includes(value) ? value : undefined) as Options[K] | undefined;
  if (BOOLS.includes(key)) return (typeof value === 'boolean' ? value : undefined) as Options[K] | undefined;
  if (key === 'crosshairColour') return (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : undefined) as Options[K] | undefined;
  if (key === 'bindings') return sanitizeBindings(value, current.bindings) as Options[K];
  return undefined;
}

export class OptionsStoreImpl implements OptionsStore {
  private readonly data: Options;
  private readonly payload: GameEvents['options/changed'] = { key: 'sensitivity' };
  constructor(private readonly storage: KeyValueStorage, private readonly events: EventBus) {
    this.data = defaultOptions();
    this.load();
  }
  get value(): Readonly<Options> { return this.data; }

  private load(): void {
    let raw: string | null = null;
    try { raw = this.storage.getItem(OPTIONS_KEY); } catch { raw = null; }
    if (!raw) return;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return; }
    if (parsed === null || typeof parsed !== 'object') return;
    const src = parsed as Record<string, unknown>;
    const d = this.data as unknown as Record<string, unknown>;
    for (const key of Object.keys(this.data) as (keyof Options)[]) {     // unknown stored keys are dropped
      if (!(key in src)) continue;
      const v = sanitizeOption(key, src[key], this.data);
      if (v !== undefined) d[key] = v;
    }
  }
  private persist(): void {
    try { this.storage.setItem(OPTIONS_KEY, JSON.stringify(this.data)); } catch { /* storage full or blocked: options stay in memory */ }
  }

  set<K extends keyof Options>(key: K, value: Options[K]): void {
    if (!(key in this.data)) return;
    const v = sanitizeOption(key, value, this.data);
    if (v === undefined) return;
    this.data[key] = v;
    this.persist();
    this.payload.key = key;
    this.events.emit('options/changed', this.payload);
  }
  reset(): void {
    const d = defaultOptions();
    const keys = Object.keys(d) as (keyof Options)[];
    Object.assign(this.data, d);
    this.persist();
    for (const key of keys) { this.payload.key = key; this.events.emit('options/changed', this.payload); }
  }
}

/** Codes bound to an action, in a stable order (used by the input mapper). */
export function codesFor(bindings: Bindings, action: Action): readonly string[] { return bindings[action] ?? []; }
