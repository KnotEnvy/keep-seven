// src/enemies/vignettes.ts: the five vignettes and their actors (work order 4.6). Each emits vignette/state
// started / ended / skipped; none replays (world tracks vignettesSeen).
import * as THREE from 'three';
import type { AssetInstance, FxHandle, GameEvents, LayoutMarker, SpawnRequest, VignetteId } from '../core/contracts.ts';
import { DEG2RAD } from '../core/math.ts';
import { TAMPER } from './defs.ts';
import type { Actor, Shared } from './internals.ts';
import { MAX_ACTORS, findNamed, ownSkinnedMaterials, restoreMaterials } from './internals.ts';
import type { Anim } from './pool.ts';

const DOWSER_COS = Math.cos(5 * DEG2RAD);
const WATCHER_CLAMP = 60 * DEG2RAD;
const WATCHER_TURN = 2.0;         // rad/s
const GLINT_EVERY = 1.5, GLINT_ON = 0.2;

export class Vignettes {
  private readonly started: VignetteId[] = [];
  // vig_tamper
  private tamper: Actor | null = null;
  private tamperClock = 0;
  private tamperBider = false;
  // vig_dowser
  private card: AssetInstance | null = null;
  private glint: FxHandle | null = null;
  private glintNode: THREE.Object3D | null = null;
  private glintClock = 0;
  private glintLit = false;
  private readonly cardPos = new THREE.Vector3();
  private cardW = 0.9;
  private cardH = 2.0;
  // vig_watcher
  private watcher: AssetInstance | null = null;
  private watcherAnim: Anim | null = null;
  private watcherHead: THREE.Object3D | null = null;
  private readonly watcherRest = new THREE.Quaternion();
  private readonly qYaw = new THREE.Quaternion();
  private readonly qParent = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private watcherYaw = 0;
  private watcherBody = 0;
  private watching = false;
  private watcherClock = -1;
  private watcherShown = true;
  private readonly request: SpawnRequest = { kind: 'bider', spawn: '', encounter: '', wave: '', dormantClip: '', entrance: '', lane: '', order: 0, counted: false };

  constructor(private readonly S: Shared) {}

  private byMarker(id: string): Actor | null {
    for (let i = 0; i < MAX_ACTORS; i++) { const e = this.S.actors[i] as Actor; if (e.used && e.marker === id) return e; }
    return null;
  }
  private spawn(kind: SpawnRequest['kind'], marker: string, encounter: SpawnRequest['encounter'], wave: string, dormantClip: string, entrance: string, counted: boolean): Actor | null {
    const r = this.request;
    r.kind = kind; r.spawn = marker; r.encounter = encounter; r.wave = wave; r.dormantClip = dormantClip; r.entrance = entrance; r.lane = ''; r.order = 0; r.counted = counted;
    return this.S.hooks.spawn(r);
  }
  seen(id: VignetteId): boolean { return this.started.includes(id); }

  play(id: VignetteId): void {
    const { S } = this;
    if (this.started.includes(id)) return;                 // none replays
    this.started.push(id);
    const data = S.ctx.data;
    switch (id) {
      case 'vig_kneeler': {
        const e = this.byMarker('sp_street_kneeler') ?? this.spawn('bider', 'sp_street_kneeler', 'enc_street', 'A', 'scoop_kneel', 'rise', true);
        if (!e || !e.alive || e.state !== 'dormant') { S.vignetteState(id, 'skipped'); return; }
        e.vignette = id;
        S.vignetteState(id, 'started');
        return;
      }
      case 'vig_yard_bell': {
        const had = this.byMarker('sp_yard_t1');
        const bell = data.marker('ia_yard_bell');
        const e = had ?? this.spawn('transit', 'sp_yard_t1', 'enc_yard', 'A', '', 'emerge', true);
        if (!e || !e.alive || !bell || (had !== null && e.state !== 'emerge')) { S.vignetteState(id, 'skipped'); return; }
        e.vignette = id;
        e.bell = true;
        e.aimX = bell.pos[0]; e.aimY = bell.pos[1]; e.aimZ = bell.pos[2];
        S.vignetteState(id, 'started');
        return;
      }
      case 'vig_tamper': {
        const t = this.byMarker('sp_hall_tamper') ?? this.spawn('tamper', 'sp_hall_tamper', 'enc_matador', 'A', 'pound_bulkhead', '', true);
        if (!t || !t.alive || t.state !== 'vignette') { S.vignetteState(id, 'skipped'); return; }
        t.vignette = id;
        this.tamper = t;
        this.tamperClock = 0;
        this.tamperBider = false;
        S.vignetteState(id, 'started');
        return;
      }
      case 'vig_dowser': {
        if (!this.showCard()) { S.vignetteState(id, 'skipped'); return; }
        S.vignetteState(id, 'started');                     // world runs the 12 s clock and emits 'ended'
        return;
      }
      case 'vig_watcher': {
        if (!this.watcher) { S.vignetteState(id, 'skipped'); return; }
        this.watching = true;
        this.watcherClock = 0;
        S.vignetteState(id, 'started');
        return;
      }
      default: return;
    }
  }

  /** A vignette actor left its scene (woke, died, was freed, flinched, finished). */
  actorGone(e: Actor): void {
    const id = e.vignette;
    if (id === '') return;
    e.vignette = '';
    if (id === 'vig_tamper') {
      if (e.kind !== 'tamper') return;                      // the knocked-flat Bider is part of the scene, not its end
      if (this.tamper !== e) return;
      this.tamper = null;
    }
    this.S.vignetteState(id, 'ended');
  }

  /** The Tamper's ram came down: the Bider that climbed out inside its ring is knocked flat (not counted). */
  slamLanded(x: number, _y: number, z: number, radius: number): void {
    const { S } = this;
    for (let i = 0; i < MAX_ACTORS; i++) {
      const e = S.actors[i] as Actor;
      if (!e.used || !e.alive || e.kind !== 'bider' || e.vignette !== 'vig_tamper') continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz > radius * radius) continue;
      e.vignette = '';
      S.hooks.fellBider(e, dx, dz);
    }
  }

  tick(dt: number): void {
    const { S } = this;
    // ---- vig_tamper: one Bider climbs out so that it stands in the ring when the ram lands; 8 s
    const t = this.tamper;
    if (t) {
      this.tamperClock += dt;
      if (!this.tamperBider && this.tamperClock > 1.0) {
        const phase = t.t % TAMPER.poundLoop;
        const due = (TAMPER.poundStrikeAt - 1.2 - 0.3 + TAMPER.poundLoop) % TAMPER.poundLoop;
        const d = (phase - due + TAMPER.poundLoop) % TAMPER.poundLoop;
        if (d < 0.1) {
          this.tamperBider = true;
          const b = this.spawn('bider', 'sp_hall_vig_bider', '', '', '', 'climb_out', false);     // GDD 20.1 row 5 fallback: it pounds alone
          if (b) b.vignette = 'vig_tamper';
        }
      }
      const seconds = 8;
      if (this.tamperClock >= seconds) { this.tamper = null; t.vignette = ''; S.vignetteState('vig_tamper', 'ended'); }
    }
    // ---- vig_dowser: the glint off his rod every 1.5 s
    if (this.card && this.glint) {
      this.glintClock += dt;
      if (this.glintClock >= GLINT_EVERY) this.glintClock -= GLINT_EVERY;
      const lit = this.glintClock < GLINT_ON;
      if (lit !== this.glintLit) { this.glintLit = lit; this.glint.setLevel(lit ? 1 : 0); }
    }
    // ---- vig_watcher: breathes; from the trigger on its head follows her, clamped to +-60 degrees
    const w = this.watcher;
    if (w && this.watcherShown) {
      const head = this.watcherHead;
      if (head) head.quaternion.copy(this.watcherRest);
      if (this.watcherAnim) { this.watcherAnim.advance(dt); this.watcherAnim.apply(); }
      if (head) {
        if (this.watching) {
          const p = w.root.position;
          let want = Math.atan2(-(S.px - p.x), -(S.pz - p.z)) - this.watcherBody;
          want = want % (Math.PI * 2);
          if (want > Math.PI) want -= Math.PI * 2; else if (want < -Math.PI) want += Math.PI * 2;
          if (want > WATCHER_CLAMP) want = WATCHER_CLAMP; else if (want < -WATCHER_CLAMP) want = -WATCHER_CLAMP;
          const step = WATCHER_TURN * dt;
          const d = want - this.watcherYaw;
          this.watcherYaw += d > step ? step : d < -step ? -step : d;
        }
        if (this.watcherYaw !== 0 && head.parent) {
          // a turn about the world's up axis, whatever the bone's own frame: local = P^-1 * Ry * P * local
          head.parent.updateWorldMatrix(true, false);
          this.qParent.setFromRotationMatrix(head.parent.matrixWorld);
          this.qYaw.setFromAxisAngle(this.up, this.watcherYaw).multiply(this.qParent);
          this.qParent.invert().multiply(this.qYaw);
          head.quaternion.premultiply(this.qParent);
        }
      }
      if (this.watcherClock >= 0) {
        this.watcherClock += dt;
        if (this.watcherClock >= 6) { this.watcherClock = -1; S.vignetteState('vig_watcher', 'ended'); }
      }
    }
  }

  /** Per rendered frame: the Dowser card turns to the camera about Y and keeps its minimum size on screen. */
  present(): void {
    const card = this.card;
    if (!card) return;
    const cam = this.S.ctx.scene.camera;
    const dx = cam.position.x - this.cardPos.x, dz = cam.position.z - this.cardPos.z;
    card.root.rotation.y = Math.atan2(dx, dz);
    // never under 3 x 8 px at 720p (GDD 16): pixels per metre at his distance
    const dist = Math.sqrt(dx * dx + dz * dz + (cam.position.y - this.cardPos.y) * (cam.position.y - this.cardPos.y)) || 1;
    const perMetre = 720 / (2 * dist * Math.tan(cam.fov * DEG2RAD / 2));
    const s = Math.max(1, 8 / (this.cardH * perMetre), 3 / (this.cardW * perMetre));
    if (Math.abs(card.root.scale.x - s) > 1e-3) card.root.scale.setScalar(s);
    if (this.glint && this.glintNode) {
      this.glintNode.updateWorldMatrix(true, false);
      const m = this.glintNode.matrixWorld.elements;
      this.glint.setPosition(m[12] as number, m[13] as number, m[14] as number);
    }
  }

  private showCard(): boolean {
    const { S } = this;
    if (this.card) return true;
    const vista = S.ctx.data.marker('vista_dowser');
    const target = vista ? vista.params.target : undefined;
    if (!Array.isArray(target) || !S.ctx.assets.isActive('card_dowser')) return false;
    const inst = S.ctx.assets.instantiate('card_dowser');
    this.cardPos.set(target[0] as number, target[1] as number, target[2] as number);
    inst.root.position.copy(this.cardPos);
    const size = S.ctx.data.manifest.assets.card_dowser?.placeholder.size;
    if (size) { this.cardW = size[0]; this.cardH = size[1]; }
    S.ctx.scene.dynamic.add(inst.root);
    this.card = inst;
    this.glintNode = inst.node('glint');
    this.glint = S.ctx.render.vfx.acquireCard('dowser_glint');
    this.glintClock = 0; this.glintLit = false;
    if (this.glint) this.glint.setLevel(0);
    this.present();
    return true;
  }
  private hideCard(): void {
    if (this.glint) { this.glint.release(); this.glint = null; }
    this.glintNode = null;
    if (this.card) { this.dropInstance(this.card, 'card_dowser'); this.card = null; }
  }
  private dropInstance(inst: AssetInstance, asset: string): void {
    if (this.S.ctx.assets.isActive(asset)) inst.release();
    else inst.root.removeFromParent();
  }

  /** World's end of the Dowser beat. */
  onVignetteState(e: Readonly<GameEvents['vignette/state']>): void {
    if (e.id === 'vig_dowser' && e.stage === 'ended') this.hideCard();
  }

  /** A shot toward him while the card is up (within 5 degrees): a puff of dust far short (GDD 6.7). */
  onFired(e: Readonly<GameEvents['weapon/fired']>): void {
    if (!this.card) return;
    const dx = this.cardPos.x - e.ox, dy = this.cardPos.y + this.cardH / 2 - e.oy, dz = this.cardPos.z - e.oz;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    if ((dx * e.dx + dy * e.dy + dz * e.dz) / l < DOWSER_COS) return;
    const p = this.S.ev.shootable;
    p.id = 'vista_dowser'; p.kind = 'dowser'; p.scaleDegree = 0; p.ammo = e.ammo;
    p.x = e.ox + e.dx * 60; p.y = e.oy + e.dy * 60; p.z = e.oz + e.dz * 60;
    this.S.ctx.events.emit('shootable/hit', p);
  }

  // ---- the watcher exists while the gallery is built --------------------------------------------------------
  onBuilt(): void {
    const { S } = this;
    const want = S.ctx.world.builtZones.includes('the_gallery') && S.ctx.assets.isActive('enemy_bider');
    if (!want) { this.dropWatcher(); return; }
    if (this.watcher) return;
    const m: LayoutMarker | undefined = S.ctx.data.marker('prop_watcher');
    if (!m) return;
    const inst = S.ctx.assets.instantiate('enemy_bider');
    this.watcherBody = (m.rotY ?? 0) * DEG2RAD;
    inst.root.position.set(m.pos[0], m.pos[1], m.pos[2]);
    inst.root.rotation.set(0, this.watcherBody + Math.PI, 0);
    S.ctx.scene.dynamic.add(inst.root);
    ownSkinnedMaterials(inst.root);
    const clip = typeof m.params.clip === 'string' ? m.params.clip : 'sit_breathe';
    this.watcherAnim = S.pool.createAnim('enemy_bider', inst.root);
    const c = this.watcherAnim.set ? this.watcherAnim.set.clips.get(clip) : undefined;
    if (c) this.watcherAnim.play(c, 0, 1);
    S.ctx.render.setEmissive(inst.root, 0);                 // it is one of the freed: no pulse
    this.watcher = inst;
    this.watcherHead = inst.node('head');
    const rest = findNamed(S.ctx.assets.get('enemy_bider').scene, 'head');
    this.watcherRest.copy((rest ?? this.watcherHead).quaternion);
    this.watcherYaw = 0;
    this.watching = this.started.includes('vig_watcher');
    this.watcherClock = -1;
    this.onCell();
  }
  private dropWatcher(): void {
    if (!this.watcher) return;
    restoreMaterials(this.watcher.root);
    this.dropInstance(this.watcher, 'enemy_bider');
    this.watcher = null; this.watcherHead = null; this.watcherAnim = null;
  }
  /** The asset set was released under us: forget instances of assets that are gone. */
  onReleased(): void {
    const assets = this.S.ctx.assets;
    if (this.watcher && !assets.isActive('enemy_bider')) this.dropWatcher();
    if (this.card && !assets.isActive('card_dowser')) this.hideCard();
  }
  /** Vignette actors of zones that are not drawn are hidden and stop animating. */
  onCell(): void {
    if (!this.watcher) return;
    this.watcherShown = this.S.ctx.render.zoneVisible('the_gallery');
    this.watcher.root.visible = this.watcherShown;
  }

  /** A new run, or a restore: nothing of any vignette stays (the watcher is rebuilt with its zone). */
  clear(forget: boolean): void {
    this.tamper = null;
    this.hideCard();
    this.watching = false; this.watcherYaw = 0; this.watcherClock = -1;
    if (forget) this.started.length = 0;
  }

  debugState(): Record<string, unknown> {
    return {
      started: this.started.slice(), card: this.card !== null, cardScale: this.card ? Math.round(this.card.root.scale.x * 1e4) / 1e4 : 0,
      watcher: this.watcher !== null, watching: this.watching, watcherYawDeg: Math.round(this.watcherYaw * 180 / Math.PI * 1e4) / 1e4, watcherShown: this.watcherShown,
      tamper: this.tamper ? this.tamper.id : '',
    };
  }
}
