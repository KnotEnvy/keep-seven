// The Assize six as a state machine (GDD 6.2 to 6.6): the cylinder model, cadence and the fire buffer, the per-round
// interruptible reload, the line round under the hammer, and the kept round that cannot be wasted or lost.
// Pure logic: no three.js, no DOM, no collision. The shot itself (rays, receivers, flash, kick) is the host's.
// Every timer is advanced with the dt handed to tick(): gameplay never reads a clip's duration or the wall clock.
import type { ChamberState, EventBus, GameEvents, KeptContext, PickupKind, PlayerSave, SeventhState, WeaponPhase, WeaponView } from '../core/contracts.ts';
import {
  DRY_BEAT, PHASE_SECONDS, PICKUP_ROUNDS, RELOAD_SEAT_AT, RESPAWN_MIN_RESERVE, TIME_EPS, WEAPON,
} from './defs.ts';
import { copyKeptContext, emptyKeptContext } from './kept.ts';

export type ClipName =
  | 'idle' | 'sprint' | 'draw' | 'fire' | 'dry_fire' | 'reload_open' | 'reload_round' | 'reload_close' | 'reload_fast_close'
  | 'load_line' | 'unload_line' | 'load_kept' | 'unload_kept' | 'fire_kept' | 'take_round';

export interface WeaponHost {
  readonly events: EventBus;
  /** A lead or line round leaves the barrel on this tick: rays, receivers, `weapon/fired`, `combat/hit`, flash, kick. */
  shoot(ammo: 'lead_round' | 'line_round', shotId: number, chambersLeft: number, bloomDeg: number): void;
  /** The kept round: `weapon/fired` with the end where the aim ray meets the bore cylinder, flash, kick. */
  shootKept(shotId: number, chambersLeft: number, context: Readonly<KeptContext>): void;
  /** Does the aim ray enter the bore target volume of this context right now? */
  aimEntersBore(context: Readonly<KeptContext>): boolean;
  /** Are her feet farther than leaveRadius from the mark of this context? */
  leftMark(context: Readonly<KeptContext>): boolean;
}
/** What the trigger hand asked for on this tick. A reused scratch struct. */
export interface WeaponInput {
  /** false: movement and weapon input are off (rides, death, the title) */
  enabled: boolean;
  firePressed: boolean; fireHeld: boolean;
  /** options.fireMode === 'hold' */
  holdToFire: boolean;
  reloadPressed: boolean; linePressed: boolean; keptPressed: boolean;
}

const DRY_CLIP_SECONDS = 0.15;                         // GDD 6.9 `dry_fire`

export class Weapon implements WeaponView {
  phase: WeaponPhase = 'ready';
  /** seconds into the current phase, and its length (0 while `ready`) */
  t = 0;
  duration = 0;
  readonly cylinder: ChamberState[] = ['lead', 'lead', 'lead', 'lead', 'lead', 'lead'];
  reserve = WEAPON.startReserve;
  /** carried outside the cylinder (the one under the hammer is not counted here; a save counts both) */
  lineRounds = 0;
  seventh: SeventhState = 'sealed';
  shotsFired = 0;
  keptAimLegal = false;
  /** degrees of bloom left from earlier shots: 0 at the normal cadence */
  bloom = 0;
  /** the clip the view-model should be playing, and a counter that moves every time it (re)starts */
  clip: ClipName = 'idle';
  clipSerial = 0;
  /** notches the logical cylinder has turned (one per lead or line shot): the view-model keeps the bones in step */
  ringTurns = 0;
  /** true on the tick a round was fired (sprint is cancelled, the camera kicks) */
  firedThisTick = false;
  /** rounds lost: always 0 (a displaced lead round that finds the reserve at its cap is kept in hand: `spare`) */
  readonly discarded = 0;
  /**
   * Lead rounds thumbed out of the cylinder while the reserve was at its cap of 36: kept in hand, never thrown away.
   * They go back into the reserve as soon as it has room, or under the hammer when the line round is unloaded.
   */
  spare = 0;

  private fireQueued = false;
  private reloadQueued = false;
  private keptQueued = false;
  /** a reload in progress must end at the next chance (fire or the kept key was pressed) */
  private interrupt = false;
  private seated = false;
  /** hold-to-fire: the held trigger has given its one dry click on the empty cylinder (cleared by a release or a shot) */
  private heldDry = false;
  /** the line round under the hammer took the place of a lead round: unloading it puts a lead round back (Q, Q is a no-op) */
  private lineOverLead = false;
  /** the draw began since the last tick: a fire edge on that tick is the click that gave control (play, resume), not a pull */
  private drawFresh = false;
  private dryClip = 0;
  /** the hammer fell on an empty chamber and there are rounds to seat: the reload opens when the beat (DRY_BEAT) is over */
  private dryReload = false;
  private hasContext = false;
  private readonly context: KeptContext = emptyKeptContext();
  /** the context the round under the hammer was loaded with: it stays until the round is fired or unloaded */
  private hasLoaded = false;
  private readonly loaded: KeptContext = emptyKeptContext();

  private readonly dryPayload: GameEvents['weapon/dry_fire'] = { reason: 'empty' };
  private readonly reloadPayload: GameEvents['weapon/reload'] = { stage: 'open', chambered: 0, reserve: 0 };
  private readonly linePayload: GameEvents['weapon/line'] = { stage: 'loaded', held: 0 };
  private readonly keptPayload: GameEvents['weapon/kept'] = { stage: 'denied', mark: '' };
  private readonly ammoPayload: GameEvents['weapon/ammo'] = { chambered: 0, reserve: 0, lineRounds: 0 };
  private readonly seventhPayload: GameEvents['weapon/seventh'] = { state: 'sealed' };
  private readonly cuePayload: GameEvents['audio/cue'] = { x: 0, y: 0, z: 0, cue: 'listen_tick', positional: false, gain: 0.5, pitch: 1 };

  constructor(private readonly host: WeaponHost) {}

  // ---- views ----------------------------------------------------------------------------------------
  get chambered(): number {
    const c = this.cylinder;
    let n = 0;
    for (let i = 0; i < 6; i++) if (c[i] !== 'empty') n++;
    return n;
  }
  /** seconds until the current phase ends (0 while ready) */
  get remaining(): number { return this.phase === 'ready' ? 0 : Math.max(0, this.duration - this.t); }
  get keptChambered(): boolean { return this.cylinder[0] === 'kept'; }
  /** the mark of the context the kept round is being loaded or was loaded with, '' otherwise */
  get keptMark(): string { return this.hasLoaded ? this.loaded.mark : ''; }
  get hasKeptContext(): boolean { return this.hasContext; }
  private lineInCylinder(): number {
    const c = this.cylinder;
    let n = 0;
    for (let i = 0; i < 6; i++) if (c[i] === 'line') n++;
    return n;
  }

  // ---- events ---------------------------------------------------------------------------------------
  private emitAmmo(): void {
    const p = this.ammoPayload;
    p.chambered = this.chambered; p.reserve = this.reserve; p.lineRounds = this.lineRounds;
    this.host.events.emit('weapon/ammo', p);
  }
  private emitReload(stage: GameEvents['weapon/reload']['stage']): void {
    const p = this.reloadPayload;
    p.stage = stage; p.chambered = this.chambered; p.reserve = this.reserve;
    this.host.events.emit('weapon/reload', p);
  }
  private emitKept(stage: GameEvents['weapon/kept']['stage'], mark: string): void {
    this.keptPayload.stage = stage; this.keptPayload.mark = mark;
    this.host.events.emit('weapon/kept', this.keptPayload);
  }
  private setSeventh(state: SeventhState): void {
    if (this.seventh === state) return;
    this.seventh = state;
    this.seventhPayload.state = state;
    this.host.events.emit('weapon/seventh', this.seventhPayload);
  }

  // ---- the cylinder ---------------------------------------------------------------------------------
  /** Loaded chambers first, in order, so an empty chamber is never under the hammer while another is loaded. */
  private compact(): void {
    const c = this.cylinder;
    let w = 0;
    for (let i = 0; i < 6; i++) { const s = c[i] as ChamberState; if (s !== 'empty') { c[i] = 'empty'; c[w++] = s; } }
  }
  /** A round thumbed out of its chamber goes back where it came from. */
  private returnRound(kind: ChamberState): void {
    if (kind === 'lead') { if (this.reserve < WEAPON.reserveCap) this.reserve++; else this.spare++; }
    else if (kind === 'line') this.lineRounds++;
  }
  /** the rounds in hand go into the reserve as soon as it has room */
  private settleSpare(): void {
    while (this.spare > 0 && this.reserve < WEAPON.reserveCap) { this.spare--; this.reserve++; }
  }

  // ---- phases ---------------------------------------------------------------------------------------
  private begin(phase: WeaponPhase, seconds: number, clip: ClipName): void {
    this.phase = phase; this.t = 0; this.duration = seconds;
    this.clip = clip; this.clipSerial++;
    this.dryClip = 0; this.dryReload = false;
  }
  private toReady(): void {
    this.phase = 'ready'; this.t = 0; this.duration = 0;
    this.clip = 'idle'; this.clipSerial++;
    this.dryClip = 0; this.dryReload = false;
  }
  private canSeat(): boolean { return this.chambered < 6 && this.reserve > 0; }
  private startReload(): void {
    this.interrupt = false; this.reloadQueued = false;
    this.begin('reload_open', WEAPON.reloadOpen, 'reload_open');
    this.emitReload('open');
  }
  private beginRound(): void {
    this.seated = false;
    this.begin('reload_round', WEAPON.reloadPerRound, 'reload_round');
  }
  private seat(): void {
    const c = this.cylinder;
    this.seated = true;
    for (let i = 0; i < 6; i++) {
      if (c[i] !== 'empty') continue;
      c[i] = 'lead'; this.reserve--;
      this.settleSpare();
      this.emitReload('round');
      this.emitAmmo();
      return;
    }
  }
  private beginClose(fast: boolean): void {
    this.begin('reload_close', fast ? WEAPON.reloadFastClose : WEAPON.reloadClose, fast ? 'reload_fast_close' : 'reload_close');
    this.emitReload(fast ? 'fast_close' : 'close');
  }
  /** an interrupted reload of an EMPTY cylinder still has to seat one round before a shot can be had */
  private mustSeatFirst(): boolean { return this.fireQueued && this.chambered === 0 && this.reserve > 0; }

  private complete(): void {
    switch (this.phase) {
      case 'reload_open':
        if (this.canSeat() && (!this.interrupt || this.mustSeatFirst())) this.beginRound();
        else this.beginClose(this.interrupt);
        break;
      case 'reload_round':
        if (!this.seated && this.canSeat()) this.seat();
        if (!this.interrupt && this.canSeat()) this.beginRound();
        else this.beginClose(this.interrupt);
        break;
      case 'reload_close':
        this.interrupt = false;
        this.toReady();
        break;
      case 'loading_line': {
        const displaced = this.cylinder[0] as ChamberState;
        if (this.lineRounds > 0 && displaced !== 'line' && displaced !== 'kept') {
          this.cylinder[0] = 'line'; this.lineRounds--;
          this.lineOverLead = displaced === 'lead';
          this.returnRound(displaced);
          this.linePayload.stage = 'loaded'; this.linePayload.held = this.lineRounds;
          this.host.events.emit('weapon/line', this.linePayload);
          this.emitAmmo();
        }
        this.toReady();
        break;
      }
      case 'unloading_line':
        if (this.cylinder[0] === 'line') {
          this.cylinder[0] = 'empty'; this.lineRounds++;
          // GDD 6.4 rule 2: the lead round it displaced goes back under the hammer, so Q, Q changes nothing
          if (this.lineOverLead && this.spare > 0) { this.cylinder[0] = 'lead'; this.spare--; }
          else if (this.lineOverLead && this.reserve > 0) { this.cylinder[0] = 'lead'; this.reserve--; }
          else this.compact();
          this.lineOverLead = false;
          this.linePayload.stage = 'unloaded'; this.linePayload.held = this.lineRounds;
          this.host.events.emit('weapon/line', this.linePayload);
          this.emitAmmo();
        }
        this.toReady();
        break;
      case 'loading_kept': {
        const displaced = this.cylinder[0] as ChamberState;
        this.cylinder[0] = 'kept';
        this.lineOverLead = false;
        this.returnRound(displaced);
        this.setSeventh('chambered');
        this.emitKept('chambered', this.loaded.mark);
        this.emitAmmo();
        this.toReady();
        break;
      }
      case 'unloading_kept': {
        const mark = this.loaded.mark;
        this.unchamberKept();
        this.setSeventh('band_broken');
        this.emitKept('unloaded', mark);
        this.emitAmmo();
        this.toReady();
        break;
      }
      case 'firing_kept':
        this.compact();
        this.toReady();
        break;
      default:                                             // firing, drawing, taking_round
        this.toReady();
    }
  }
  private unchamberKept(): void {
    if (this.cylinder[0] === 'kept') { this.cylinder[0] = 'empty'; this.compact(); }
    this.hasLoaded = false;
    this.keptAimLegal = false;
  }

  // ---- the tick -------------------------------------------------------------------------------------
  tick(dt: number, input: Readonly<WeaponInput>): void {
    this.firedThisTick = false;
    if (dt <= 0) return;
    if (this.bloom > 0) {
      const b = this.bloom - (WEAPON.bloomPerShotDeg / WEAPON.bloomDecaySeconds) * dt;
      this.bloom = b > 1e-9 ? b : 0;
    }
    if (this.phase !== 'ready') {
      this.t += dt;
      if (this.phase === 'reload_round' && !this.seated && this.t >= RELOAD_SEAT_AT - TIME_EPS && this.canSeat()) this.seat();
      // a phase ends on the tick its time is up; the next one starts with a clean clock (0.35 s is 21 ticks, never 22)
      for (let guard = 0; guard < 4 && (this.phase as WeaponPhase) !== 'ready' && this.t >= this.duration - TIME_EPS; guard++) this.complete();
    } else if (this.clip !== 'idle') {
      // a one-shot clip played while ready (the dry click with nothing to reload): back to idle when it is over
      this.dryClip += dt;
      if (this.dryReload && this.dryClip >= DRY_BEAT - TIME_EPS) {
        // the beat of the empty gun is over: the reload opens by itself (if a pickup or a box has not changed the case)
        this.dryReload = false;
        if (this.canReload()) {
          this.startReload();
          // a pull inside the beat is not lost: it is a pull on the opening gun (one round is seated, then it fires)
          if (this.fireQueued) this.interrupt = true;
        }
      }
      if ((this.phase as WeaponPhase) === 'ready' && this.dryClip >= DRY_CLIP_SECONDS - TIME_EPS) { this.clip = 'idle'; this.clipSerial++; this.dryClip = 0; }
    }
    this.senseKept();
    if (!input.fireHeld) this.heldDry = false;
    if (input.enabled) this.handleInput(input);
    else { this.fireQueued = false; this.reloadQueued = false; this.keptQueued = false; }
    if (this.phase === 'ready') this.act(input);
    this.drawFresh = false;
  }

  private senseKept(): void {
    if (this.phase === 'ready' && this.hasLoaded && this.cylinder[0] === 'kept') {
      const legal = this.host.aimEntersBore(this.loaded);
      // GDD 6.6 rule 4: the crosshair and a soft tick tell her before the trigger does
      if (legal && !this.keptAimLegal) this.host.events.emit('audio/cue', this.cuePayload);
      this.keptAimLegal = legal;
    } else this.keptAimLegal = false;
  }

  private handleInput(input: Readonly<WeaponInput>): void {
    if (this.phase === 'loading_kept') {
      // GDD 6.6: input other than look is ignored during the load, except the fire buffer (GDD 6.2: "same" for the
      // kept round): a click in its last 0.15 s is a pull on the first ready tick, legal aim or dead trigger
      if (input.firePressed && this.duration - this.t <= WEAPON.fireBuffer + TIME_EPS) this.fireQueued = true;
      return;
    }
    if (input.firePressed) this.onFire();
    if (input.reloadPressed) this.onReload();
    if (input.linePressed) this.onLine();
    if (input.keptPressed) this.onKept();
  }
  private onFire(): void {
    switch (this.phase) {
      case 'ready': this.fireQueued = true; break;
      case 'reload_open':
        this.fireQueued = true; this.interrupt = true;
        if (!this.mustSeatFirst()) this.beginClose(true);  // nothing in hand yet: straight to the fast close
        break;
      case 'reload_round': this.fireQueued = true; this.interrupt = true; break;
      case 'reload_close': this.fireQueued = true; break;
      // a click while the gun comes up is never lost: it fires on the first ready tick
      case 'drawing': if (!this.drawFresh) this.fireQueued = true; break;
      default:
        // the fire buffer: a click in the last 0.15 s of the cycle fires on the first legal tick
        if (this.duration - this.t <= WEAPON.fireBuffer + TIME_EPS) this.fireQueued = true;
    }
  }
  private onReload(): void {
    if (this.phase === 'firing') { this.reloadQueued = true; return; }
    if (this.phase === 'ready' && this.canReload()) this.startReload();
  }
  private canReload(): boolean { return this.cylinder[0] !== 'kept' && this.canSeat(); }
  private onLine(): void {
    if (this.phase !== 'ready' || this.cylinder[0] === 'kept') return;
    if (this.cylinder[0] === 'line') this.begin('unloading_line', WEAPON.unloadLine, 'unload_line');
    else if (this.lineRounds > 0) this.begin('loading_line', WEAPON.loadLine, 'load_line');
  }
  private canLoadKept(): boolean {
    return this.hasContext && (this.seventh === 'sealed' || this.seventh === 'pulse' || this.seventh === 'band_broken');
  }
  private onKept(): void {
    if (this.seventh === 'chambered') return;              // it is under the hammer already
    if (!this.canLoadKept()) { this.emitKept('denied', ''); return; }   // no mark, or spent: a shiver and a dead click
    if (this.phase === 'ready') { this.startLoadKept(); return; }
    this.keptQueued = true;
    if (this.phase === 'reload_open') { this.interrupt = true; if (!this.mustSeatFirst()) this.beginClose(true); }
    else if (this.phase === 'reload_round') this.interrupt = true;
  }
  private startLoadKept(): void {
    copyKeptContext(this.context, this.loaded);
    this.hasLoaded = true;
    this.keptQueued = false; this.fireQueued = false; this.reloadQueued = false;
    this.begin('loading_kept', WEAPON.loadKept, 'load_kept');
    this.emitKept('loading', this.loaded.mark);
  }

  /** What a ready gun does on this tick. */
  private act(input: Readonly<WeaponInput>): void {
    const c0 = this.cylinder[0] as ChamberState;
    if (c0 === 'kept' && this.hasLoaded && this.host.leftMark(this.loaded)) {
      // GDD 6.6 rule 5: leaving the mark before firing returns it to the seventh slot, band broken
      this.fireQueued = false;
      this.begin('unloading_kept', WEAPON.unloadKept, 'unload_kept');
      return;
    }
    if (this.keptQueued) {
      this.keptQueued = false;
      if (this.canLoadKept() && this.seventh !== 'chambered') { this.startLoadKept(); return; }
    }
    // the hammer is still down on the empty chamber: a second pull inside the beat is not a second click and cannot
    // hold the reload off (it is kept for the opening gun: see tick()); R, Q and the kept key act at once
    if (this.dryReload) return;
    if (this.fireQueued) { this.fireQueued = false; this.reloadQueued = false; this.pull(); return; }
    if (this.reloadQueued) { this.reloadQueued = false; if (this.canReload()) { this.startReload(); return; } }
    if (input.enabled && input.holdToFire && input.fireHeld) {
      if (c0 === 'lead' || c0 === 'line') this.fire(c0);
      // GDD 6.3 with the trigger held: ONE dry click on the empty cylinder, and the reload starts on it. The trigger
      // still held does not interrupt that reload (only a fresh press does); when it ends the gun fires again.
      else if (c0 === 'empty' && !this.heldDry) { this.heldDry = true; this.pull(); }
    }
  }

  /** One trigger pull with the gun ready. */
  private pull(): void {
    const c0 = this.cylinder[0] as ChamberState;
    if (c0 === 'kept') {
      if (this.keptAimLegal && this.hasLoaded) this.fireKept();
      else { this.dryPayload.reason = 'kept_not_in_bore'; this.host.events.emit('weapon/dry_fire', this.dryPayload); }   // the hammer does not move
      return;
    }
    if (c0 === 'empty') {
      this.dryPayload.reason = 'empty';
      this.heldDry = true;                                 // this pull was the held trigger's one dry click
      this.host.events.emit('weapon/dry_fire', this.dryPayload);
      // the hammer falls and the gun is held so for DRY_BEAT; then the reload opens by itself (GDD 6.3, polish round 4)
      this.clip = 'dry_fire'; this.clipSerial++; this.dryClip = 0;
      this.dryReload = this.canSeat();
      return;
    }
    this.fire(c0);
  }
  private fire(c0: 'lead' | 'line'): void {
    const c = this.cylinder;
    const shotId = ++this.shotsFired;
    for (let i = 0; i < 5; i++) c[i] = c[i + 1] as ChamberState;   // chamber 0 is spent and the ring turns one notch
    c[5] = 'empty';
    this.ringTurns++;
    this.heldDry = false; this.lineOverLead = false;
    const spread = this.bloom;
    this.bloom += WEAPON.bloomPerShotDeg;
    this.begin('firing', PHASE_SECONDS.firing, 'fire');
    this.firedThisTick = true;
    this.host.shoot(c0 === 'line' ? 'line_round' : 'lead_round', shotId, this.chambered, spread);
    this.emitAmmo();
  }
  private fireKept(): void {
    const shotId = ++this.shotsFired;
    const mark = this.loaded.mark;
    this.emitKept('fired', mark);
    this.cylinder[0] = 'empty';                            // no cock afterward: the ring does not turn (compacted when the clip ends)
    this.begin('firing_kept', PHASE_SECONDS.firing_kept, 'fire_kept');
    this.firedThisTick = true;
    this.keptAimLegal = false;
    this.host.shootKept(shotId, this.chambered, this.loaded);
    this.hasLoaded = false;
    this.setSeventh('spent');
    this.emitAmmo();
  }

  // ---- what the world gives and asks ------------------------------------------------------------------
  setKeptContext(context: Readonly<KeptContext> | null): void {
    if (context === null) { this.hasContext = false; return; }
    copyKeptContext(context, this.context);                // a copy: the world's object is its own
    this.hasContext = true;
  }
  /** `boss/charge_required`: the sealed round starts to pulse on the HUD. */
  chargeRequired(): void { if (this.seventh === 'sealed') this.setSeventh('pulse'); }
  takeStoneRound(): void {
    if (this.cylinder[0] === 'kept') this.unchamberKept();
    this.setSeventh('violet');
    if (this.phase === 'ready') this.begin('taking_round', PHASE_SECONDS.taking_round, 'take_round');
  }
  /** The draw clip: on spawn and when control comes back after a ride. Only from a ready gun. */
  draw(): void { if (this.phase === 'ready') { this.begin('drawing', PHASE_SECONDS.drawing, 'draw'); this.drawFresh = true; } }

  givePickup(kind: PickupKind): boolean {
    if (this.reserve >= WEAPON.reserveCap) return false;
    this.reserve = Math.min(WEAPON.reserveCap, this.reserve + PICKUP_ROUNDS[kind]);
    this.settleSpare();
    this.emitAmmo();
    return true;
  }
  giveLead(amount: number, floor: number): number {
    const before = this.reserve;
    const want = floor > 0 ? Math.max(before, floor) : before + Math.max(0, amount);
    this.reserve = Math.min(WEAPON.reserveCap, Math.floor(want));
    if (this.reserve !== before) this.emitAmmo();
    return this.reserve - before;
  }
  giveLineRounds(amount: number): number {
    const room = WEAPON.lineRoundCap - this.lineRounds - this.lineInCylinder();
    const taken = Math.max(0, Math.min(Math.floor(amount), room));
    if (taken > 0) { this.lineRounds += taken; this.emitAmmo(); }
    return taken;
  }

  // ---- save, debug ------------------------------------------------------------------------------------
  capture(health: number): PlayerSave {
    return { health, cylinder: this.cylinder.slice(), reserve: this.reserve, lineRounds: this.lineRounds + this.lineInCylinder(), seventh: this.seventh };
  }
  /** A restore or a new run (GDD 5 "Respawn"): a full cylinder of lead, the floors, the gun ready, every queue cleared. */
  restore(data: Readonly<PlayerSave>): void {
    for (let i = 0; i < 6; i++) this.cylinder[i] = 'lead';
    const reserve = Number.isFinite(data.reserve) ? data.reserve : 0;
    this.reserve = Math.min(WEAPON.reserveCap, Math.max(Math.floor(reserve), RESPAWN_MIN_RESERVE));
    const line = Number.isFinite(data.lineRounds) ? data.lineRounds : 0;
    this.lineRounds = Math.max(0, Math.min(WEAPON.lineRoundCap, Math.floor(line)));
    this.resetTransient();
    // a save made with the round under the hammer gives it back with its band broken: it is never lost
    this.setSeventh(data.seventh === 'chambered' ? 'band_broken' : data.seventh ?? 'sealed');
    this.emitAmmo();
  }
  private resetTransient(): void {
    this.fireQueued = false; this.reloadQueued = false; this.keptQueued = false; this.interrupt = false; this.seated = false;
    this.hasContext = false; this.hasLoaded = false; this.keptAimLegal = false;
    this.heldDry = false; this.lineOverLead = false; this.spare = 0;
    this.bloom = 0;
    this.toReady();
  }
  debugSetAmmo(chambered: number, reserve: number, lineRounds: number): void {
    const n = Math.max(0, Math.min(6, Math.floor(chambered)));
    const hadKept = this.cylinder[0] === 'kept';
    for (let i = 0; i < 6; i++) this.cylinder[i] = i < n ? 'lead' : 'empty';
    this.reserve = Math.max(0, Math.min(WEAPON.reserveCap, Math.floor(reserve)));
    this.lineRounds = Math.max(0, Math.min(WEAPON.lineRoundCap, Math.floor(lineRounds)));
    this.fireQueued = false; this.reloadQueued = false; this.keptQueued = false; this.interrupt = false;
    this.hasLoaded = false; this.keptAimLegal = false;
    this.heldDry = false; this.lineOverLead = false; this.spare = 0;
    this.toReady();
    if (hadKept || this.seventh === 'chambered') this.setSeventh('band_broken');
    this.emitAmmo();
  }
  debugSetSeventh(state: SeventhState): void {
    if (state === 'chambered') {
      if (this.cylinder[0] !== 'kept') { const d = this.cylinder[0] as ChamberState; this.cylinder[0] = 'kept'; this.returnRound(d); }
      if (this.hasContext) { copyKeptContext(this.context, this.loaded); this.hasLoaded = true; }
      if (this.phase !== 'ready') this.toReady();
    } else if (this.cylinder[0] === 'kept') this.unchamberKept();
    this.setSeventh(state);
    this.emitAmmo();
  }
}
