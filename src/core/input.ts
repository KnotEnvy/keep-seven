// Keyboard, mouse and pointer lock (ARCHITECTURE 10.2). Everything the real handlers do goes through
// handleCode / handleLook, and so do the inject* functions the debug hook uses: gameplay has one input path.
import { ACTIONS } from './contracts.ts';
import type { Action, EventBus, GameEvents, Input, OptionsStore, Vec2 } from './contracts.ts';

const MAX_DELTA = 400;                 // counts per event; larger values are the Chromium pointer-lock spike
/** mouse movement is ignored for this long after the pointer lock arrives (the browser's own settling event) */
const LOCK_SETTLE_MS = 100;
const PREVENT_WHILE_LOCKED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const ACTION_INDEX: Record<Action, number> = {
  forward: 0, back: 1, left: 2, right: 3, fire: 4, reload: 5, line: 6, kept: 7, interact: 8, sprint: 9, jump: 10, pause: 11,
};
const PAUSE = ACTION_INDEX.pause;
const N = ACTIONS.length;

export interface InputEnvironment {
  /** window-like target for key, blur and mouseup events (null in unit tests) */
  window: Window | null;
  document: Document | null;
  /** the canvas: mouse buttons, context menu, pointer lock */
  element: HTMLElement | null;
}

export class InputImpl implements Input {
  pointerLocked = false;
  /**
   * The pointer lock has been asked for (or held) at least once on this page: from then on a game that is 'playing'
   * without it is a game with a dead mouse (the loop's watchdog pauses it). False on a page nobody has clicked
   * (`?autostart=1` on the dev server), where play without a lock is what was asked for.
   */
  lockAsked = false;
  private readonly codes = new Set<string>();
  private readonly injected = new Uint8Array(N);
  private readonly level = new Uint8Array(N);
  private readonly pendingPress = new Uint8Array(N);
  private readonly pendingRelease = new Uint8Array(N);
  private readonly tickPress = new Uint8Array(N);
  private readonly tickRelease = new Uint8Array(N);
  /** performance.now() when the pointer lock last arrived (see the mousemove listener) */
  private lockedAt = -1e9;
  private lookX = 0;
  private lookY = 0;
  private gameplay = true;
  private capture: ((code: string) => void) | null = null;
  private triedRaw = false;
  /** the plain request is out on a browser that reports its failure only through pointerlockerror */
  private plainPending = false;
  private readonly lockPayload: GameEvents['input/pointer_lock'] = { locked: false };
  private readonly disposers: (() => void)[] = [];

  constructor(private readonly events: EventBus, private readonly options: OptionsStore, private readonly env: InputEnvironment) {
    const { window: win, document: doc, element: el } = env;
    // The click or key that drives the UI (begin the run, resume, take the pointer back) is latched like any other
    // press; without this it would reach gameplay on the first tick of 'playing' and fire the gun. Entering 'playing'
    // drops the edges gathered before it; the held levels stay, so a key that is still down keeps working. Out of
    // 'paused' the pause edge goes too (the Esc that resumed must not pause again); otherwise a pause press survives.
    events.on('game/state', (e) => { if (e.to === 'playing') this.dropEdges(e.from === 'paused'); });
    if (win) {
      this.listen(win, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
      this.listen(win, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
      this.listen(win, 'blur', () => this.releaseAll());
      this.listen(win, 'mouseup', (e) => this.onMouseButton(e as MouseEvent, false));
    }
    if (doc) {
      this.listen(doc, 'visibilitychange', () => { if (doc.hidden) this.releaseAll(); });
      this.listen(doc, 'mousemove', (e) => {
        if (!this.pointerLocked) return;
        // Chromium sends one mousemove as the lock engages whose movement is the cursor's last jump undone (measured:
        // -96, -399 after the click on the title's first item), sometimes before `pointerlockchange`, sometimes after:
        // the run then began with her looking at the roof. Movement in the first tenth of a second of a lock is dropped.
        if (e.timeStamp - this.lockedAt < LOCK_SETTLE_MS) return;
        this.handleLook((e as MouseEvent).movementX, (e as MouseEvent).movementY);
      });
      this.listen(doc, 'pointerlockchange', () => this.onLockChange(doc.pointerLockElement === el && el !== null));
      this.listen(doc, 'pointerlockerror', () => this.onLockError());
    }
    if (el) {
      this.listen(el, 'mousedown', (e) => this.onMouseButton(e as MouseEvent, true));
      this.listen(el, 'contextmenu', (e) => e.preventDefault());
    }
  }
  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.disposers.push(() => target.removeEventListener(type, fn));
  }
  dispose(): void { for (const d of this.disposers) d(); this.disposers.length = 0; }

  // ---- DOM handlers -------------------------------------------------------------------
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.pointerLocked && PREVENT_WHILE_LOCKED.has(e.code)) e.preventDefault();
    if (down && e.repeat) return;
    this.handleCode(e.code, down);
  }
  private onMouseButton(e: MouseEvent, down: boolean): void {
    const code = 'Mouse' + e.button;
    if (down && e.button === 2) e.preventDefault();
    this.handleCode(code, down);
  }
  private onLockChange(locked: boolean): void {
    if (locked === this.pointerLocked) return;
    this.pointerLocked = locked;
    if (locked) this.lockAsked = true;
    if (locked) this.lockedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    this.triedRaw = false; this.plainPending = false;
    if (!locked) this.releaseAll();
    // the click that takes the pointer (back) is never a shot: its edge is dropped when the lock arrives, whatever the
    // game state was when it was made (entering 'playing' drops edges too, but a click made IN play to regain a lost
    // or refused lock would otherwise fire)
    else this.dropEdges(false);
    this.lockPayload.locked = locked;
    this.events.emit('input/pointer_lock', this.lockPayload);
  }
  private onLockError(): void {
    // the raw request can fail and fire this before the plain request succeeds: try the fallback once
    if (this.triedRaw) { this.triedRaw = false; this.plainLock(); }
    else if (this.plainPending) { this.plainPending = false; this.lockRefused(); }
  }
  private plainLock(): void {
    const el = this.env.element;
    if (!el) return;
    try {
      const p = el.requestPointerLock() as Promise<void> | undefined;
      // a browser that returns a promise reports the refusal there (a late pointerlockerror of the RAW request must not
      // be read as the plain one failing); one that does not reports it through pointerlockerror
      if (p && typeof p.catch === 'function') p.catch(() => this.lockRefused());
      else this.plainPending = true;
    } catch { this.lockRefused(); }                          // not allowed right now (no gesture, or the 1.25 s cooldown after Esc)
  }
  /**
   * Both requests were refused (Chrome refuses a re-lock for about 1.25 s after Esc): say so on the bus. The loop's
   * handler of `input/pointer_lock { locked: false }` pauses a game that is `playing`, so the click-to-resume plate
   * comes back instead of a game that plays with a dead mouse.
   */
  private lockRefused(): void {
    if (this.pointerLocked) return;
    this.lockPayload.locked = false;
    this.events.emit('input/pointer_lock', this.lockPayload);
  }

  // ---- the single path ------------------------------------------------------------------
  private handleCode(code: string, down: boolean): void {
    if (this.capture && down) {
      if (code.startsWith('Control')) return;          // never bindable
      const cb = this.capture;
      this.capture = null;
      cb(code === 'Escape' ? '' : code);
      return;
    }
    if (down) this.codes.add(code); else this.codes.delete(code);
    this.refresh();
  }
  private handleLook(dx: number, dy: number): void {
    if (dx > MAX_DELTA || dx < -MAX_DELTA || dy > MAX_DELTA || dy < -MAX_DELTA) return;
    if (!this.gameplay) return;
    this.lookX += dx; this.lookY += dy;
  }
  /** Recompute every action's level from the held codes and injected actions; latch the edges. */
  private refresh(): void {
    const bindings = this.options.value.bindings;
    for (let i = 0; i < N; i++) {
      let on = this.injected[i] as number;
      if (!on) {
        const list = bindings[ACTIONS[i] as Action];
        for (let k = 0; k < list.length; k++) if (this.codes.has(list[k] as string)) { on = 1; break; }
      }
      if (on !== this.level[i]) {
        this.level[i] = on;
        if (on) this.pendingPress[i] = 1; else this.pendingRelease[i] = 1;
      }
    }
  }
  private releaseAll(): void {
    this.codes.clear();
    this.lookX = 0; this.lookY = 0;
    this.refresh();
  }

  /** Called by the loop at the start of every tick: the edges gathered since the last tick belong to this one. */
  beginTick(): void {
    for (let i = 0; i < N; i++) {
      this.tickPress[i] = this.pendingPress[i] as number; this.pendingPress[i] = 0;
      this.tickRelease[i] = this.pendingRelease[i] as number; this.pendingRelease[i] = 0;
    }
  }
  /** Forget every press and release edge not yet consumed (this tick's and the latched ones); levels are kept. */
  dropEdges(pauseToo: boolean): void {
    for (let i = 0; i < N; i++) {
      if (i === PAUSE && !pauseToo) continue;
      this.pendingPress[i] = 0; this.pendingRelease[i] = 0; this.tickPress[i] = 0; this.tickRelease[i] = 0;
    }
  }
  /** Bindings changed: re-evaluate levels without inventing edges for keys that stay down. */
  rebind(): void { this.refresh(); }

  // ---- Input ----------------------------------------------------------------------------
  held(action: Action): boolean {
    const i = ACTION_INDEX[action];
    return (this.gameplay || i === PAUSE) && this.level[i] === 1;
  }
  pressed(action: Action): boolean {
    const i = ACTION_INDEX[action];
    return (this.gameplay || i === PAUSE) && this.tickPress[i] === 1;
  }
  released(action: Action): boolean {
    const i = ACTION_INDEX[action];
    return (this.gameplay || i === PAUSE) && this.tickRelease[i] === 1;
  }
  consumeLook(out: Vec2): void {
    out.x = this.lookX; out.y = this.lookY;
    this.lookX = 0; this.lookY = 0;
  }
  requestPointerLock(): void {
    this.lockAsked = true;
    const el = this.env.element;
    if (!el || this.pointerLocked) return;
    this.triedRaw = true;
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => { if (this.triedRaw) { this.triedRaw = false; this.plainLock(); } });
    } catch {
      this.triedRaw = false;
      this.plainLock();
    }
  }
  exitPointerLock(): void {
    const doc = this.env.document;
    if (doc && doc.pointerLockElement) doc.exitPointerLock();
  }
  setGameplayEnabled(enabled: boolean): void {
    const was = this.gameplay;
    this.gameplay = enabled;
    if (!enabled) { this.lookX = 0; this.lookY = 0; }
    else if (!was) this.dropEdges(false);                    // what was pressed while a menu had the input is not gameplay
  }
  injectCode(code: string, down: boolean): void { this.handleCode(code, down); }
  injectAction(action: Action, down: boolean): void {
    this.injected[ACTION_INDEX[action]] = down ? 1 : 0;
    this.refresh();
  }
  injectLook(dx: number, dy: number): void { this.handleLook(dx, dy); }
  captureNextCode(callback: (code: string) => void): void { this.capture = callback; }

  // ---- debug hook helpers (core only) -----------------------------------------------------
  /** Codes currently down (a copy). */
  heldCodes(): string[] { return Array.from(this.codes); }
  isInjected(action: Action): boolean { return this.injected[ACTION_INDEX[action]] === 1; }
}
