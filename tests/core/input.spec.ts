import { describe, expect, it } from 'vitest';
import { EventBusImpl } from '../../src/core/events.ts';
import { InputImpl } from '../../src/core/input.ts';
import { MemoryStorage, OptionsStoreImpl } from '../../src/core/options.ts';
import { GameStateMachineImpl } from '../../src/core/state.ts';

function make(): { input: InputImpl; options: OptionsStoreImpl; state: GameStateMachineImpl } {
  const events = new EventBusImpl();
  const state = new GameStateMachineImpl(events);
  const options = new OptionsStoreImpl(new MemoryStorage(), events);
  const input = new InputImpl(events, options, { window: null, document: null, element: null });
  events.on('options/changed', (e) => { if (e.key === 'bindings') input.rebind(); });
  return { input, options, state };
}

describe('Input: the press that drives a menu is not a gameplay press', () => {
  const toPaused = (state: GameStateMachineImpl): void => {
    for (const s of ['title', 'loading', 'playing'] as const) state.request(s);
    state.request('paused', 'pause', 'menu');
  };
  it('fire pressed while paused is not pressed on the first tick of playing; the held level survives', () => {
    const { input, state } = make();
    toPaused(state);
    input.beginTick();
    input.injectCode('Mouse0', true);                              // the click on "resume"
    input.injectCode('KeyW', true);
    expect(state.request('playing', 'resume')).toBe(true);
    input.beginTick();
    expect(input.pressed('fire')).toBe(false);
    expect(input.pressed('forward')).toBe(false);
    expect(input.held('fire')).toBe(true);
    expect(input.held('forward')).toBe(true);
    input.injectCode('Mouse0', false);
    input.beginTick();
    expect(input.released('fire')).toBe(true);
    input.injectCode('Mouse0', true);                              // a click made in play is a shot
    input.beginTick();
    expect(input.pressed('fire')).toBe(true);
  });
  it('the click that begins the run (title, then loading) and its release are dropped', () => {
    const { input, state } = make();
    state.request('title');
    input.injectCode('Mouse0', true);
    state.request('loading', 'play');
    input.beginTick();                                             // a tick while loading takes the press ...
    input.injectCode('Mouse0', false);
    input.injectCode('Mouse0', true);                              // ... and an impatient second click is latched
    state.request('playing', 'run_started');
    input.beginTick();
    expect(input.pressed('fire')).toBe(false);
    expect(input.released('fire')).toBe(false);
  });
  it('the Esc that resumes does not pause again; a pause pressed during loading or death still does', () => {
    const { input, state } = make();
    toPaused(state);
    input.injectCode('Escape', true);
    state.request('playing', 'resume');
    input.beginTick();
    expect(input.pressed('pause')).toBe(false);
    state.request('dead', 'player_died');
    input.injectCode('Escape', false);
    input.injectCode('Escape', true);
    state.request('playing', 'respawned');
    input.beginTick();
    expect(input.pressed('pause')).toBe(true);
  });
  it('an edge of the current tick is dropped too when the state turns to playing inside the tick', () => {
    const { input, state } = make();
    toPaused(state);
    input.injectCode('Mouse0', true);
    input.beginTick();
    expect(input.pressed('fire')).toBe(true);
    state.request('playing', 'resume');
    expect(input.pressed('fire')).toBe(false);
  });
  it('setGameplayEnabled(true) drops what was pressed while gameplay input was off', () => {
    const { input } = make();
    input.setGameplayEnabled(false);
    input.injectCode('Mouse0', true);
    input.setGameplayEnabled(true);
    input.beginTick();
    expect(input.pressed('fire')).toBe(false);
    expect(input.held('fire')).toBe(true);
  });
});

describe('Input', () => {
  it('maps the default codes of ARCHITECTURE 10.2 (arrows mirror WASD, two pause keys)', () => {
    const { input } = make();
    const cases: [string, Parameters<InputImpl['held']>[0]][] = [
      ['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'], ['KeyA', 'left'], ['ArrowLeft', 'left'],
      ['KeyD', 'right'], ['ArrowRight', 'right'], ['Mouse0', 'fire'], ['KeyR', 'reload'], ['KeyQ', 'line'], ['KeyF', 'kept'],
      ['KeyE', 'interact'], ['ShiftLeft', 'sprint'], ['Space', 'jump'], ['Escape', 'pause'], ['KeyP', 'pause'],
    ];
    for (const [code, action] of cases) {
      input.injectCode(code, true);
      expect(input.held(action), `${code} -> ${action}`).toBe(true);
      input.injectCode(code, false);
      expect(input.held(action), `${code} released`).toBe(false);
    }
    input.injectCode('Mouse2', true);
    for (const a of ['fire', 'reload', 'interact'] as const) expect(input.held(a)).toBe(false);   // Mouse2 is unbound
  });
  it('pressed and released are true for exactly one tick', () => {
    const { input } = make();
    input.injectCode('KeyE', true);
    expect(input.pressed('interact')).toBe(false);                // latched until a tick takes it
    input.beginTick();
    expect(input.pressed('interact')).toBe(true);
    expect(input.held('interact')).toBe(true);
    input.beginTick();
    expect(input.pressed('interact')).toBe(false);
    expect(input.held('interact')).toBe(true);
    input.injectCode('KeyE', false);
    input.beginTick();
    expect(input.released('interact')).toBe(true);
    input.beginTick();
    expect(input.released('interact')).toBe(false);
  });
  it('a click between two ticks is never lost and never seen twice', () => {
    const { input } = make();
    input.beginTick();
    input.injectCode('Mouse0', true);
    input.injectCode('Mouse0', false);
    input.beginTick();
    expect(input.pressed('fire')).toBe(true);
    expect(input.released('fire')).toBe(true);
    expect(input.held('fire')).toBe(false);
    input.beginTick();
    expect(input.pressed('fire')).toBe(false);
  });
  it('two codes of one action: the action stays down until both are up, with one press edge', () => {
    const { input } = make();
    input.injectCode('KeyW', true); input.beginTick();
    expect(input.pressed('forward')).toBe(true);
    input.injectCode('ArrowUp', true); input.beginTick();
    expect(input.pressed('forward')).toBe(false);
    input.injectCode('KeyW', false); input.beginTick();
    expect(input.held('forward')).toBe(true);
    expect(input.released('forward')).toBe(false);
    input.injectCode('ArrowUp', false); input.beginTick();
    expect(input.released('forward')).toBe(true);
  });
  it('injectAction is independent of the bindings', () => {
    const { input, options } = make();
    options.set('bindings', { ...options.value.bindings, forward: ['KeyI'] });
    input.injectCode('KeyW', true);
    expect(input.held('forward')).toBe(false);
    input.injectCode('KeyI', true);
    expect(input.held('forward')).toBe(true);
    input.injectCode('KeyI', false);
    input.injectAction('forward', true);
    expect(input.held('forward')).toBe(true);
    input.injectAction('forward', false);
    expect(input.held('forward')).toBe(false);
  });
  it('look accumulates until consumed; deltas above 400 counts are dropped', () => {
    const { input } = make();
    const out = { x: 0, y: 0 };
    input.injectLook(10, -4); input.injectLook(5, 1);
    input.injectLook(401, 0); input.injectLook(0, -900);
    input.consumeLook(out);
    expect(out).toEqual({ x: 15, y: -3 });
    input.consumeLook(out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
  it('setGameplayEnabled(false): actions read as up and look is discarded; pause still reads', () => {
    const { input } = make();
    const out = { x: 0, y: 0 };
    input.injectCode('KeyW', true);
    input.setGameplayEnabled(false);
    input.injectLook(20, 20);
    input.injectCode('Escape', true);
    input.beginTick();
    expect(input.held('forward')).toBe(false);
    expect(input.pressed('forward')).toBe(false);
    expect(input.pressed('pause')).toBe(true);
    input.consumeLook(out);
    expect(out).toEqual({ x: 0, y: 0 });
    input.setGameplayEnabled(true);
    expect(input.held('forward')).toBe(true);
  });
  it('captureNextCode takes the next code (Escape cancels with \'\', Ctrl is never bindable) without it reaching the game', () => {
    const { input } = make();
    const got: string[] = [];
    input.captureNextCode((c) => got.push(c));
    input.injectCode('ControlLeft', true);
    expect(got).toEqual([]);
    input.injectCode('KeyR', true);
    expect(got).toEqual(['KeyR']);
    expect(input.held('reload')).toBe(false);
    input.captureNextCode((c) => got.push(c));
    input.injectCode('Escape', true);
    expect(got).toEqual(['KeyR', '']);
    expect(input.held('pause')).toBe(false);
    input.injectCode('Mouse0', true);                             // capture is over: this one is a normal press
    expect(input.held('fire')).toBe(true);
  });
  it('no pointer lock outside a browser', () => {
    const { input } = make();
    expect(input.pointerLocked).toBe(false);
    input.requestPointerLock(); input.exitPointerLock();
    expect(input.pointerLocked).toBe(false);
  });
});

// A canvas, a document and a window that are just event targets, with a pointer-lock request the test decides the fate of.
function fakeDom(lock: (options?: unknown) => Promise<void> | undefined): { env: { window: Window; document: Document; element: HTMLElement }; fire: (target: 'window' | 'document' | 'element', type: string, event?: object) => void; doc: { pointerLockElement: unknown }; requests: unknown[] } {
  const make = (): { listeners: Map<string, ((e: unknown) => void)[]>; addEventListener: (t: string, f: (e: unknown) => void) => void; removeEventListener: () => void } => {
    const listeners = new Map<string, ((e: unknown) => void)[]>();
    return { listeners, addEventListener: (t, f) => { listeners.set(t, [...(listeners.get(t) ?? []), f]); }, removeEventListener: () => { /* not needed */ } };
  };
  const requests: unknown[] = [];
  const win = make(), element = { ...make(), requestPointerLock: (options?: unknown) => { requests.push(options ?? 'plain'); return lock(options); } };
  const doc = { ...make(), pointerLockElement: null as unknown, hidden: false, exitPointerLock: () => { /* not used */ } };
  const targets = { window: win, document: doc, element };
  return {
    env: { window: win as unknown as Window, document: doc as unknown as Document, element: element as unknown as HTMLElement },
    fire: (target, type, event = {}) => { for (const f of targets[target].listeners.get(type) ?? []) f({ preventDefault: () => { /* */ }, ...event }); },
    doc, requests,
  };
}
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('Input: pointer lock that is refused or regained (10.2)', () => {
  const setup = (lock: (options?: unknown) => Promise<void> | undefined) => {
    const events = new EventBusImpl();
    const state = new GameStateMachineImpl(events);
    const options = new OptionsStoreImpl(new MemoryStorage(), events);
    const dom = fakeDom(lock);
    const input = new InputImpl(events, options, dom.env);
    const locks: boolean[] = [];
    events.on('input/pointer_lock', (e) => locks.push(e.locked));
    return { input, state, dom, locks };
  };
  it('both requests refused (the cooldown after Esc): input/pointer_lock { locked: false } is emitted once, so the loop can pause', async () => {
    const { input, dom, locks } = setup(() => Promise.reject(new Error('refused')));
    input.requestPointerLock();
    await settle();
    expect(dom.requests).toEqual([{ unadjustedMovement: true }, 'plain']);
    expect(locks).toEqual([false]);
    expect(input.pointerLocked).toBe(false);
    // the late pointerlockerror events of the two requests add nothing
    dom.fire('document', 'pointerlockerror'); dom.fire('document', 'pointerlockerror');
    expect(locks).toEqual([false]);
  });
  it('a browser without promises reports the plain refusal through pointerlockerror; a raw failure alone is not a refusal', () => {
    const { input, dom, locks } = setup(() => undefined);
    input.requestPointerLock();
    dom.fire('document', 'pointerlockerror');                      // the raw request failed: the plain one is tried
    expect(dom.requests).toEqual([{ unadjustedMovement: true }, 'plain']);
    expect(locks).toEqual([]);
    dom.fire('document', 'pointerlockerror');                      // the plain one failed too
    expect(locks).toEqual([false]);
    dom.fire('document', 'pointerlockerror');
    expect(locks).toEqual([false]);
  });
  it('the raw request refused and the plain one granted is not reported as a refusal', async () => {
    const { input, dom, locks } = setup((options) => (options ? Promise.reject(new Error('no raw input')) : Promise.resolve()));
    input.requestPointerLock();
    await settle();
    dom.fire('document', 'pointerlockerror');                      // the raw request's own error event, arriving late
    dom.doc.pointerLockElement = dom.env.element;
    dom.fire('document', 'pointerlockchange');
    expect(locks).toEqual([true]);
    expect(input.pointerLocked).toBe(true);
  });
  it('the click that takes the pointer back while playing is not a shot; the next click is', () => {
    const { input, state, dom } = setup(() => Promise.resolve());
    for (const s of ['title', 'loading', 'playing'] as const) state.request(s);
    input.beginTick();
    dom.fire('element', 'mousedown', { button: 0 });               // a click in play without the lock (it was refused before)
    dom.doc.pointerLockElement = dom.env.element;
    dom.fire('document', 'pointerlockchange');                     // ... which takes the pointer
    input.beginTick();
    expect(input.pressed('fire')).toBe(false);
    expect(input.held('fire')).toBe(true);
    dom.fire('window', 'mouseup', { button: 0 });
    input.beginTick();
    dom.fire('element', 'mousedown', { button: 0 });
    input.beginTick();
    expect(input.pressed('fire')).toBe(true);
  });
});

