// src/world/kept.ts: the kept round, world side (GDD 6.6, 8.2; ARCHITECTURE 3.6 "The kept round"). From the first tick
// of boss phase 3a the six proving marks are lit and `F` is live on them: while she stands on one, the player is given
// the KeptContext (the mark and the bore's target cylinder, from the layout). The narration around the seventh, the
// kept hint ladder, and what a restore after the proof has to put back.
import { FIXED_DT } from '../core/contracts.ts';
import type { CheckpointId, EncounterId, GameEvents, KeptContext, LayoutMarker, SaveData, ZoneId } from '../core/contracts.ts';
import type * as THREE from 'three';
import { lampNode, namedLine, paramNumber } from './internals.ts';
import type { KeptApi, State } from './internals.ts';
import { HINT_KEPT, HintClock } from './puzzles/hints.ts';

/** GDD 6.6: after the shot, four seconds of true silence before the narrator speaks */
const SILENCE = 4;
const FLARE_SECONDS = 0.4;
/** deaths in phase 3a after which the tier-2 line is said on the respawn, whatever the clock holds */
const SAY_AFTER_DEATHS = 2;
/**
 * Polish round 4 (the story critic's major: "the station only asks for the charge 12 s into phase 3a"): the station asks
 * this long after phase 3a begins, unless she has already broken the band. The Windlass's own first ask (12 s, or the
 * first relight) still starts the hint ladder and the HUD pulse, and repeats the line (docs/requests/world.md).
 */
const ASK_AFTER = 1.5;
/**
 * Pass i3 (story reviewer a: in phase 3 a player who remembers the key from the opening and presses it away from the
 * brass mark got no answer at all, and the key's prompt for a player off the mark came 59 s in). A press off the mark
 * in phase 3a is answered at once with the ladder's plainest line (`hint_kept_2`: "The brass mark at the kerb. The
 * seventh round. Down the bore."), the nearest mark is outlined, and the line is not said again for `DENIED_AGAIN`
 * seconds however often she presses. The key's prompt comes with the ladder's second tier (30 s after the station
 * first asks; it was the third, 45 s).
 */
export const DENIED_AGAIN = 12;
/** the two lines of the ask (the enemies module says them by these keys: src/enemies/boss/attacks.ts tickUnproven) */
const LINE_ASK = 'stn_boss_charge_required', LINE_ONE_LEFT = 'nar_one_left';
/** the station's line for the dry head (said by the Windlass as phase 3b begins; the world takes it: see `dry`) */
const LINE_DRY = 'stn_dry';

interface Mark { marker: LayoutMarker; context: KeptContext; radius: number; leave: number }

class Kept implements KeptApi {
  private readonly marks: Mark[] = [];
  private readonly zone: ZoneId;
  /** phase 3a has begun and the round is not spent: the marks are lit and `F` is live */
  private active = false;
  private phase3a = false;
  private current: Mark | null = null;
  private readonly clock = new HintClock(HINT_KEPT);
  private laddering = false;
  /**
   * The ladder has begun in this run. A death in phase 3a comes back to cp_boss_p3 and the Windlass asks for the charge
   * again: the clock is NOT started over (a player who dies every twenty seconds would hear the first tier for ever);
   * what she has waited, she has waited. Only a new run or a debug warp starts it from nothing.
   */
  private ladderBegun = false;
  private hintShown = false;
  private outlined = false;
  private silence = -1;
  private waterAfter = '';
  /** seconds until the station asks for the charge (phase 3a has just begun); -1: not waiting */
  private askIn = -1;
  /** the lines that follow the proof (HEAD DRY, the narrator's two) have been put in line for this proof */
  private drySaid = true;
  private flare = 0;
  /** seconds until a press off the mark is answered in words again (DENIED_AGAIN) */
  private deniedRest = 0;
  private readonly hintPayload: GameEvents['ui/hint'] = { key: 'ui_prompt_kept', show: false };
  private readonly lineDown: string; private readonly lineDenied: string; private readonly lineSeal: string; private readonly lineOffice: string;
  private readonly lineKept: string; private readonly lineProven: string; private readonly lineHint1: string; private readonly lineHint2: string;
  private readonly encounter: EncounterId;
  private readonly provenCheckpoint: CheckpointId;

  constructor(private readonly s: State) {
    const { data, events } = s.ctx;
    const bore = data.markersOfType('puzzle_element').find((m) => m.params.keptRoundTarget === true);
    const vol = (bore?.params.volume ?? { radius: 3, top: 0, bottom: 0, axis: [0, 0, 0] }) as { radius: number; top: number; bottom: number; axis: [number, number, number] };
    for (const m of data.markersOfType('interactable')) {
      if (m.params.kind !== 'floor_mark') continue;
      // one context per mark, made once: setKeptContext never allocates
      this.marks.push({
        marker: m, radius: paramNumber(m, 'radius', 0.5), leave: paramNumber(m, 'leaveRadius', 2.5),
        context: {
          mark: m.id, markX: m.pos[0], markY: m.pos[1], markZ: m.pos[2], leaveRadius: paramNumber(m, 'leaveRadius', 2.5),
          boreX: vol.axis[0], boreZ: vol.axis[2], boreTopY: vol.top, boreBottomY: vol.bottom, boreRadius: vol.radius,
        },
      });
    }
    this.zone = this.marks[0] ? (this.marks[0] as Mark).marker.zone : 'the_bore';
    events.on('boss/phase', (e) => {
      if (e.phase === 'p3a') this.begin();
      else if (e.phase !== 'hush') this.phase3a = false;
      // the phase after the hush is the proof itself, whoever announces it first
      if (e.phase === 'proven' || e.phase === 'p3b') this.fired();
      if (e.phase === 'p3b') this.dry();
    });
    // "HEAD DRY." is the world's to say, on the phase itself and ahead of the narrator (polish round 4: said at the back
    // of a full queue it was never shown, and the objective "The head is dry" stood on no voice)
    s.story.take(LINE_DRY);
    // she has broken the band: the two lines that asked her to are over when their turn comes
    const loaded = (): boolean => s.flags.has('kept_loaded') || s.flags.has('proven');
    s.story.unless(LINE_ASK, loaded);
    s.story.unless(LINE_ONE_LEFT, loaded);
    events.on('boss/charge_required', () => {
      if (!this.active) return;
      this.laddering = true;
      if (!this.ladderBegun) { this.ladderBegun = true; this.clock.reset(); }
      this.applyFloor();
    });
    events.on('weapon/kept', (e) => this.onKept(e.stage));
    // the lines of the kept round: the bore marker's `params.lines` when level design names them there, else these keys
    // (docs/requests/code-world.md asks for the fields)
    const named = (name: string, fallback: string): string => namedLine(bore, 'lines', name) || fallback;
    this.lineDown = named('notInBore', 'nar_down_the_bore');
    this.lineDenied = named('denied', 'nar_not_for_firing');
    this.lineSeal = named('seal', 'nar_seal');
    this.lineOffice = named('office', 'nar_office');
    this.lineKept = named('kept', 'nar_kept');
    this.lineProven = named('proven', 'stn_proven');
    this.lineHint1 = named('hint1', 'hint_kept_1');
    this.lineHint2 = named('hint2', 'hint_kept_2');
    this.encounter = data.layout.encounters.find((e) => e.zone === this.zone && Object.keys(e.composition).includes('windlass'))?.id ?? 'enc_windlass';
    this.provenCheckpoint = (data.markersOfType('checkpoint').find((m) => m.zone === this.zone && /kept round/.test(String(m.params.when)))?.id ?? 'cp_boss_proven') as CheckpointId;
    events.on('weapon/dry_fire', (e) => { if (e.reason === 'kept_not_in_bore') s.story.say(this.lineDown); });
    events.on('boss/proven', () => this.fired());
    events.on('story/line_end', (e) => { if (this.waterAfter !== '' && e.key === this.waterAfter) { this.waterAfter = ''; this.water(); } });
  }
  private water(): void { const m = this.marks[0]; if (m) this.s.cue('water_below', m.context.boreX, m.context.boreBottomY, m.context.boreZ); }

  private glows(): THREE.Object3D | null {
    const m = this.marks[0];
    return m ? this.s.build.node(m.marker.id, 'mark_glows') : null;
  }
  private light(): void {
    const { s } = this;
    const node = this.glows();
    if (node) s.ctx.render.lamps.setMask(node, this.active ? (1 << this.marks.length) - 1 : 0);
    const cradle = this.cradleMarks();
    // six in a ring, one apart: the seventh disc lights when the bore is proven
    if (cradle) s.ctx.render.lamps.setMask(cradle, s.flags.has('proven') ? 0x7f : 0x3f);
  }
  private cradleMarks(): THREE.Object3D | null {
    const { s } = this;
    const m = s.ctx.data.markersInZone(this.zone).find((x) => x.params.kind === 'look_target');
    return m ? lampNode(s, m.id, 'mark_lamps') : null;
  }
  /** the first tick of phase 3a: the marks are lit and `F` is live on them, with no delay and no hidden condition */
  private begin(): void {
    const { s } = this;
    this.phase3a = true;
    if (s.flags.has('proven') || !s.build.isBuilt(this.zone)) return;
    this.active = true;
    this.askIn = ASK_AFTER;
    this.light();
    if (this.marks[0]) s.lamp((this.marks[0] as Mark).marker.id, this.marks.length, this.marks.length);
  }
  private setContext(m: Mark | null): void {
    if (m === this.current) return;
    this.current = m;
    this.s.ctx.player.setKeptContext(m ? m.context : null);
    this.s.interact.setKeptFocus(m && this.s.ctx.player.weapon.seventh !== 'chambered' ? m.marker.id : '');
  }
  private nearest(): Mark | null {
    const p = this.s.ctx.player.position;
    let best: Mark | null = null, bestD = Infinity;
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i] as Mark;
      const dx = p.x - m.marker.pos[0], dz = p.z - m.marker.pos[2];
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  private onKept(stage: GameEvents['weapon/kept']['stage']): void {
    const { s } = this;
    if (stage === 'denied') {
      if (s.flags.has('proven')) return;                         // spent: nothing but the shiver
      if (this.phase3a || this.active) {
        // during phase 3a the game never tells her that her correct idea is wrong: the nearest mark's halo flares, no line
        const node = this.glows();
        if (node) { s.ctx.render.lamps.setBoost(node, 2.5); this.flare = FLARE_SECONDS; }
        // (pass i3, DENIED_AGAIN) and it is told where: her idea is right, the place is not
        if (this.active && this.deniedRest <= 0 && s.ctx.data.story.lines[this.lineHint2] !== undefined) {
          this.deniedRest = DENIED_AGAIN;
          s.story.drop(this.lineHint1);
          s.story.sayNow(this.lineHint2);
          const m = this.nearest();
          if (m) { s.ctx.render.setOutline(s.build.anchor(m.marker.id)); this.outlined = true; }
        }
        return;
      }
      s.story.say(this.lineDenied);                         // once, by the nar_* rule
    } else if (stage === 'loading') {
      // the first successful press only: what her thumb is doing, then the office if the ladder has not said it
      if (s.flags.has('kept_loaded')) return;
      s.flags.add('kept_loaded');
      this.askIn = -1;
      // Polish round 4: on the press itself, over whatever is on screen (it waited behind `nar_one_left`, 5 s after
      // her thumb had moved). The office follows the proof now (`dry`), or the ladder's first tier if she waits.
      s.story.drop(LINE_ASK);
      s.story.sayOver(this.lineSeal);
    } else if (stage === 'fired') this.fired();
  }
  /** the kept round went down the bore: the proof */
  private fired(): void {
    const { s } = this;
    if (s.flags.has('proven')) return;
    s.setFlag('proven', true);
    this.active = false; this.laddering = false;
    this.setContext(null);
    if (this.hintShown) { this.hintShown = false; this.hintPayload.show = false; s.ctx.events.emit('ui/hint', this.hintPayload); }
    if (this.outlined) { this.outlined = false; s.ctx.render.setOutline(null); }
    this.light();
    this.silence = SILENCE; this.drySaid = false; this.askIn = -1;
    // Polish round 4 (the story critic's major: "BORE PROVEN." trailed the shot by 10 to 15 s, behind the narrator and
    // the Windlass's own talk). What was waiting to be said about a fight that is over is dropped (never a line the
    // story stands on), and the station answers the shot at once: on screen now, or next if the narrator is speaking.
    // Polish round 5 (R12: the lines that pay off the seventh shot land with the shot). "BORE PROVEN." is on screen on
    // the shot's own tick, OVER whatever is there (fired promptly, it waited 3 s behind the 5.5 s band line), and
    // `nar_kept` is next, straight after it (it was queued behind HEAD DRY at the end of the 4 s silence and came 9 s
    // after the shot). HEAD DRY and the office follow from `dry`, behind it.
    s.story.flushWhere((key) => s.story.keeps(key) && key !== LINE_ONE_LEFT && key !== this.lineKept);
    s.story.defer(this.lineOffice);                        // (it follows `nar_kept`: `dry`)
    s.story.sayOver(this.lineProven);
    s.story.sayFront(this.lineKept);
    s.director.commitTallies(this.encounter);
    s.checkpoints.reach(this.provenCheckpoint, true);
  }

  /**
   * Phase 3b begins (four seconds after the shot): "HEAD DRY.", then the office. Next in line and in this order, behind
   * `nar_kept`, which `fired` put straight after "BORE PROVEN." (round 5; it is asked for again here for a proof that
   * came without it: the once-only rule refuses it when it is on screen, waiting or heard).
   */
  private dry(): void {
    const { s } = this;
    if (this.drySaid) { if (s.flags.has('proven') && !s.story.holds(LINE_DRY)) s.story.sayFront(LINE_DRY); return; }
    this.drySaid = true;
    s.story.sayFront(this.lineKept);
    s.story.sayFront(LINE_DRY);
    s.story.sayFront(this.lineOffice);
  }

  tick(_dt: number): void {
    const { s } = this;
    if (this.askIn >= 0 && this.active) {
      this.askIn -= FIXED_DT;
      if (this.askIn < 0 && !s.flags.has('kept_loaded')) {
        if (!s.story.holds(LINE_ASK)) s.story.sayFront(LINE_ASK);
        s.story.sayFront(LINE_ONE_LEFT);
      }
    }
    if (this.deniedRest > 0) this.deniedRest -= FIXED_DT;
    if (this.flare > 0) { this.flare -= FIXED_DT; if (this.flare <= 0) { const node = this.glows(); if (node) s.ctx.render.lamps.setBoost(node, 1); } }
    if (this.silence >= 0) {
      this.silence -= FIXED_DT;
      if (this.silence < 0) {
        // the four seconds of true silence are over: the narrator (if the Windlass has not announced the dry phase on
        // this tick already), and water far below once "BORE PROVEN." has been read
        this.dry();
        if (s.story.finished(this.lineProven)) this.water(); else this.waterAfter = this.lineProven;
      }
    }
    if (!this.active) { if (this.current) this.setContext(null); return; }
    // ---- which mark she stands on (the context also holds while the round is chambered inside the leave radius)
    const p = s.ctx.player.position;
    let on: Mark | null = null;
    const cur = this.current;
    if (cur) {
      const dx = p.x - cur.marker.pos[0], dz = p.z - cur.marker.pos[2];
      const d2 = dx * dx + dz * dz;
      const chambered = s.ctx.player.weapon.seventh === 'chambered';
      if (d2 <= cur.radius * cur.radius || (chambered && d2 <= cur.leave * cur.leave)) on = cur;
    }
    if (!on) {
      for (let i = 0; i < this.marks.length; i++) {
        const m = this.marks[i] as Mark;
        const dx = p.x - m.marker.pos[0], dz = p.z - m.marker.pos[2];
        if (dx * dx + dz * dz <= m.radius * m.radius && Math.abs(p.y - m.marker.pos[1]) < 1) { on = m; break; }
      }
    }
    if (on !== this.current) this.setContext(on);
    else if (on) s.interact.setKeptFocus(s.ctx.player.weapon.seventh === 'chambered' ? '' : on.marker.id);
    // ---- the kept hint ladder, counted from boss/charge_required: 15 / 30 / 45 / 75 s
    if (!this.laddering) return;
    const tier = this.clock.tick(FIXED_DT, true, s.ctx.options.value.hints);
    // a restore inside the ladder: what tier 3 put on screen is put back (a restore took it down)
    if (tier === 0) { if (this.clock.tier >= 2 && !this.hintShown && s.hintsOn()) this.showPrompt(); return; }
    s.hint('kept', tier);
    // (round 5: tier 1 has a line of its own, `hint_kept_1`; it said `nar_office`, the line that pays off the shot)
    // (pass i4, the playthrough review: under the Windlass's refill lines neither line was ever said in 200 s; a hint
    // was dropped whenever anything was on screen. `sayHint`: next in line, over a station line that has been read)
    if (tier === 1) s.story.sayHint(this.lineHint1);
    // (the plainer line replaces the first; pass i3: and the key's prompt comes with it, not a tier later)
    else if (tier === 2) { s.story.drop(this.lineHint1); s.story.sayHint(this.lineHint2); this.showPrompt(); }
    else if (tier === 3 && !this.hintShown) this.showPrompt();
  }
  private floor = 0;
  /** the tier-2 line is due at once (two deaths in the phase): the clock is put on its threshold */
  private applyFloor(): void {
    if (this.floor > 0 && this.clock.tier < 2 && this.clock.seconds < this.floor) this.clock.seconds = this.floor;
    this.floor = 0;
  }
  /** tier 3: the outline pulse on the nearest mark and the `F` prompt, shown until the proof */
  private showPrompt(): void {
    const { s } = this;
    const m = this.nearest();
    if (m) { s.ctx.render.setOutline(s.build.anchor(m.marker.id)); this.outlined = true; }
    this.hintShown = true; this.hintPayload.show = true;
    s.ctx.events.emit('ui/hint', this.hintPayload);
  }

  attach(zone: ZoneId): void { if (zone === this.zone) this.light(); }
  detach(zone: ZoneId): void { if (zone === this.zone && this.current) this.setContext(null); }
  reset(): void {
    this.ladderBegun = false;
    this.clock.reset();
    this.clear();
  }
  /** everything but the ladder's clock (a restore keeps what she has waited) */
  private clear(): void {
    this.active = false; this.phase3a = false; this.laddering = false; this.silence = -1; this.waterAfter = ''; this.flare = 0;
    this.askIn = -1; this.drySaid = true; this.deniedRest = 0;
    if (this.hintShown) { this.hintShown = false; this.hintPayload.show = false; this.s.ctx.events.emit('ui/hint', this.hintPayload); }
    this.outlined = false;
    if (this.current) this.setContext(null);
    this.light();
  }
  apply(full: SaveData | null, warp = false): void {
    const { s } = this;
    const phase = full ? full.enemies.bossPhase : 'idle';
    const in3a = phase === 'p3a' || phase === 'hush';
    // the ladder goes on through a death in phase 3a; anywhere else, and in a debug warp's new timeline, it starts over
    if (warp || !in3a || !this.ladderBegun) this.reset(); else this.clear();
    // the second death in the phase: the line that names the mark, the seventh round and the bore is said at once
    const died3a = s.bossDeathPhase === 'p3a' || s.bossDeathPhase === 'hush';
    this.floor = in3a && !warp && died3a && s.bossDeaths >= SAY_AFTER_DEATHS ? (HINT_KEPT[1] as number) : 0;
    // (the tier-1 line a death cut off is not said again in front of it: `hint_kept_1` is a hint line, round 5)
    if (this.floor > 0) s.story.cancelHint();
    this.phase3a = in3a;
    this.active = this.phase3a && !s.flags.has('proven') && s.build.isBuilt(this.zone);
    this.light();
    // the ladder that had begun goes on from the respawn, whether or not the Windlass asks again
    if (this.active && this.ladderBegun) { this.laddering = true; this.applyFloor(); }
    if (this.active) this.askIn = ASK_AFTER;               // the station asks again after a respawn in the phase
    // after the proof render's ring is not there to drive the fade: a restore puts it back
    if (s.flags.has('proven')) { s.ctx.render.setWrongFade(1); if (s.zone === this.zone) s.ctx.render.setMood('L5p', 0); } else s.ctx.render.setWrongFade(0);
  }
  addHintSeconds(seconds: number): void { this.clock.seconds += seconds; }
  debug(): Record<string, unknown> {
    return { active: this.active, mark: this.current ? this.current.marker.id : '', ladder: this.laddering ? this.clock.tier : -1, ladderSeconds: Math.round(this.clock.seconds * 100) / 100 };
  }
}

export function createKept(s: State): KeptApi { return new Kept(s); }
