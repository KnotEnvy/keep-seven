// src/ui/hud: everything on screen during play (GDD 12.2, ART_BIBLE 10.3). Two layers: the gauges (crosshair, markers,
// damage arc, the six-and-one mark, health, boss pips) and the text (subtitles, captions, prompt, hint, checkpoint,
// title card). Events set classes and texts; update() compares cached values and writes only what differs; timers count
// fixed ticks (they stop with the simulation), and every motion is a CSS transition or keyframe started by a class.
import { FIXED_DT } from '../core/contracts.ts';
import type { BossPhase, GameContext, GameEvents, HitOutcome, Options, SeventhState, Speaker, StoryKey } from '../core/contracts.ts';
import { el, flag, inked, keyed, setText, svg } from './dom.ts';
import { MarkWidget } from './mark.ts';
import { format, roman, splitCard, tokenize, wrapSubtitle } from './text.ts';

/** GDD 6.8: the HUD ring turns one notch between 120 and 300 ms after the shot (0.18 s). */
export const RING_TURN_DELAY = 0.12;
export const RING_TURN_SECONDS = 0.18;
export const RING_KICK_SECONDS = 0.14;
export const SHIVER_SECONDS = 0.3;
export const ARC_SECONDS = 0.6;
export const SEGMENT_FLASH_SECONDS = 0.4;
export const CHECKPOINT_SECONDS = 2;
export const CARD_FADE_OUT = 0.8;
/** GDD 17 "Captions": a caption holds 2 s and the same key is not shown again within 4 s */
export const CAPTION_REPEAT_SECONDS = 4;
/**
 * marker lifetimes in seconds (GDD 6.8); '' = no marker for that outcome. A marker is cleared on the fixed tick NEAREST
 * its lifetime (5 / 7 / 10 ticks = 83 / 117 / 167 ms for 90 / 120 / 160), not the next one after it.
 */
export const MARKER_SECONDS: Readonly<Record<MarkerKind, number>> = { hit: 0.09, weak: 0.12, kill: 0.16, freed: 0.16, deflected: 0.12 };
export type MarkerKind = 'hit' | 'weak' | 'kill' | 'freed' | 'deflected';

const MARKER_OF: Readonly<Record<HitOutcome, MarkerKind | ''>> = {
  impact: '', hit: 'hit', weak: 'weak', kill: 'kill', freed: 'freed', deflected: 'deflected', broke: '', parried: 'deflected', passed: '',
};
export const MARKER_KINDS: readonly MarkerKind[] = ['hit', 'weak', 'kill', 'freed', 'deflected'];
// two class strings per kind, so a marker of the same kind restarts its keyframes
const MARKER_CLASS: Readonly<Record<MarkerKind, readonly [string, string]>> = {
  hit: ['mk m-hit ma', 'mk m-hit mb'], weak: ['mk m-weak ma', 'mk m-weak mb'], kill: ['mk m-kill ma', 'mk m-kill mb'],
  freed: ['mk m-freed ma', 'mk m-freed mb'], deflected: ['mk m-deflected ma', 'mk m-deflected mb'],
};
const SPEAKER_CLASS: Readonly<Record<Speaker, string>> = {
  narrator: 'sub on sp-narrator', station: 'sub on sp-station', reeve: 'sub on sp-reeve', card: 'sub on sp-narrator', caption: 'sub on sp-narrator',
};
/** the prompt of each focus kind (world sends the key; a focus that names only its kind gets this one) */
export const PROMPT_OF: Readonly<Record<'read' | 'take' | 'use' | 'kept', StoryKey>> = { read: 'ui_prompt_read', take: 'ui_prompt_take', use: 'ui_prompt_use', kept: 'ui_prompt_kept' };
/** the lazy key hints world may raise with `ui/hint` (GDD 12.1), one at a time; `ui_prompt_kept` is the persistent one of hint tier 3 */
export const HINT_KEYS: readonly StoryKey[] = ['ui_hint_move', 'ui_hint_fire', 'ui_hint_reload', 'ui_hint_sprint', 'ui_hint_interact', 'ui_hint_line', 'ui_prompt_kept'];
const BOSS_SHOWN: Readonly<Record<BossPhase, boolean>> = { idle: false, parley: true, p1: true, p2: true, p3a: true, hush: true, proven: true, p3b: true, dead: false };
const BOSS_PIPS = 26;
const BOSS_GROUPS: readonly number[] = [10, 10, 6];
/** health per segment (GDD 12.2: 34 / 33 / 33) */
const SEGMENT_TOP: readonly number[] = [34, 67, 100];
const FILL_STEPS = 23;
const ARC_POOL = 3;
const ARC_DIRECTIONS = 32;
const SEG_CLASS: readonly string[] = ['seg', 'seg regen'];
const FLASH: readonly string[] = ['', 'fa', 'fb'];

export class Hud {
  readonly gauges: HTMLDivElement;
  readonly texts: HTMLDivElement;
  readonly mark: MarkWidget;
  // ---- what visibleText() reports
  subtitle = '';
  speaker = '';
  caption = '';
  prompt = '';
  hint = '';
  card = '';
  checkpoint = '';
  // ---- for debugState and tests
  markerKind: MarkerKind | '' = '';
  markerLeft = 0;
  turnLeft = 0;
  arcDeg = -1;

  private readonly cross: SVGElement;
  private readonly markerGroup: SVGElement;
  private readonly arcs: SVGElement[] = [];
  private readonly arcLeft = new Float32Array(ARC_POOL);
  private arcNext = 0;
  private readonly arcTransform: string[] = [];
  private markerPhase = 0;
  private kickLeft = 0;
  private shiverLeft = 0;
  /** the kept round was fired: the next change of the chambers is the close-up, which settles the ring */
  private keptSettle = false;

  private readonly segs: HTMLDivElement[] = [];
  private readonly fills: HTMLElement[] = [];
  private readonly segFill = new Int8Array(3).fill(-1);
  private readonly segRegen = new Uint8Array(3);
  private readonly segRegenShown = new Int8Array(3).fill(-1);
  private readonly segFlash = new Uint8Array(3);
  private readonly segFlashLeft = new Float32Array(3);
  private readonly fillTransform: string[] = [];

  private readonly boss: HTMLDivElement;
  private readonly pips: HTMLElement[] = [];
  private bossShown = false;
  private bossBone = false;
  private bossLit = -1;
  /** lit count from the last `boss/pips` of this phase (-1: read enemies.boss.pips) */
  private bossLitEvent = -1;

  private plumb = false;
  private legal = false;

  private readonly subBox: HTMLDivElement;
  private readonly subWho: HTMLSpanElement;
  private readonly subSay: HTMLSpanElement;
  private subKey: StoryKey = '';
  private subLeft = 0;
  private readonly captionBox: HTMLDivElement;
  private captionLeft = 0;
  /** fixed ticks run (the HUD's own clock: it stops with the simulation) */
  private ticks = 0;
  /** tick at which each caption key was last shown (one entry per cap_* key: 23 at most) */
  private readonly captionShownAt = new Map<StoryKey, number>();
  private readonly promptBox: HTMLDivElement;
  private promptKey: StoryKey = '';
  private readonly hintBox: HTMLDivElement;
  private hintKey: StoryKey = '';
  // the two rows as asked for (key, rendered text) and as drawn: a row can be asked for and not drawn (applyRows)
  private promptText = '';
  private hintText = '';
  private promptOn = false;
  private hintOn = false;
  /** the last `weapon/kept` was `loading`, `chambered` or `fired`, not `unloaded`: the round is out of its slot */
  private keptLoading = false;
  /** the seventh is out of its slot (chambered) or spent: nothing is left to break */
  private keptAway = false;
  private readonly checkpointBox: HTMLDivElement;
  private checkpointLeft = 0;
  private readonly cardBox: HTMLDivElement;
  private readonly cardNumeral: HTMLDivElement;
  private readonly cardTitle: HTMLDivElement;
  private cardHold = 0;
  private cardLeft = 0;

  private gaugesOn = false;
  private gaugesFade = false;
  private riding = false;

  constructor(private readonly ctx: GameContext, root: HTMLElement) {
    const ui = ctx.data.ui.bind(ctx.data);
    for (let i = 0; i <= FILL_STEPS; i++) this.fillTransform.push(`scaleX(${(i / FILL_STEPS).toFixed(4)})`);
    for (let i = 0; i < ARC_DIRECTIONS; i++) this.arcTransform.push(`rotate(${(i * 360) / ARC_DIRECTIONS}deg)`);

    // ---------------------------------------------------------------- gauges
    this.gauges = el('div', 'hud', root);
    const cross = svg('svg', { viewBox: '-100 -100 200 200', 'aria-hidden': 'true' }, this.gauges, 'xh');
    this.cross = cross;
    for (let i = 0; i < ARC_POOL; i++) this.arcs.push(inked('path', { d: arcPath(46, 50) }, cross, 'arc'));
    const x = svg('g', {}, cross, 'x');
    for (const [x1, y1, x2, y2] of [[0, -4, 0, -9], [4, 0, 9, 0], [0, 4, 0, 9], [-4, 0, -9, 0]] as const) inked('line', { x1, y1, x2, y2 }, x, 'tick');
    inked('line', { x1: 0, y1: -4, x2: 0, y2: -12 }, x, 'plumb');
    svg('circle', { r: 1.9 }, x, 'ink dot');
    svg('circle', { r: 1 }, x, 'dot');
    // markers: four diagonal ticks, a ring, a chevron; which of them show is the class on the group
    const mk = svg('g', {}, cross, 'mk');
    this.markerGroup = mk;
    const ticks = svg('g', {}, mk, 'mt');
    for (const [sx, sy] of [[1, -1], [1, 1], [-1, 1], [-1, -1]] as const) inked('line', { x1: 7 * sx, y1: 7 * sy, x2: 13 * sx, y2: 13 * sy }, ticks, 'mtick');
    const ring = svg('g', {}, mk, 'mr');
    inked('circle', { r: 10 }, ring, 'mring');
    inked('polyline', { points: '-7,-13 0,-19 7,-13' }, mk, 'mc');

    const numerals: string[] = [];
    const reserveText = ui('ui_hud_reserve');
    for (let n = 0; n < 100; n++) numerals.push(format(reserveText, ctx.options.value.bindings, { n: String(n) }));
    this.mark = new MarkWidget(this.gauges, 'mark', numerals);

    const health = el('div', 'health', this.gauges);
    for (let i = 0; i < 3; i++) {
      const seg = el('div', SEG_CLASS[0] as string, health);
      this.segs.push(seg);
      this.fills.push(el('i', 'fill', seg));
    }

    this.boss = el('div', 'boss', this.gauges);
    setText(el('div', 'boss-name', this.boss), ui('ui_boss_name'));
    const row = el('div', 'pips', this.boss);
    for (const count of BOSS_GROUPS) {
      const group = el('div', 'pip-group', row);
      for (let i = 0; i < count; i++) this.pips.push(el('i', 'pip', group));
    }

    // ---------------------------------------------------------------- text
    this.texts = el('div', 'txt', root);
    this.checkpointBox = el('div', 'cp', this.texts);
    this.cardBox = el('div', 'card', this.texts);
    this.cardNumeral = el('div', 'card-num', this.cardBox);
    el('div', 'card-rule', this.cardBox);
    this.cardTitle = el('div', 'card-title', this.cardBox);
    this.promptBox = el('div', 'prompt', this.texts);
    this.hintBox = el('div', 'prompt hint', this.texts);
    const talk = el('div', 'talk', this.texts);
    this.captionBox = el('div', 'capt', talk);
    this.subBox = el('div', 'sub', talk);
    this.subWho = el('span', 'who', this.subBox);
    this.subSay = el('span', 'say', this.subBox);

    this.applyOption('crosshairSize');
    this.applyOption('crosshairColour');
    this.applyOption('crosshairOutline');
    this.applyOption('subtitleBackground');
  }

  // =============================================================== visibility
  /** gauges: shown in play and under the pause scrim, fading while dead, hidden on the title, the end card and in a ride's dark */
  setGauges(on: boolean, fade: boolean): void {
    this.gaugesOn = on; this.gaugesFade = fade;
    this.applyGauges();
  }
  private applyGauges(): void {
    flag(this.gauges, 'on', this.gaugesOn && !this.riding);
    flag(this.gauges, 'fade', this.gaugesFade);
  }
  setTexts(on: boolean): void { flag(this.texts, 'on', on); }
  onRide(e: Readonly<GameEvents['ride/state']>): void { this.riding = e.stage === 'started'; this.applyGauges(); }
  /** a run begins or a checkpoint is restored: nothing of the last life stays on screen */
  reset(): void {
    this.riding = false;
    this.keptSettle = false;
    this.keptLoading = false;
    this.captionShownAt.clear();
    this.applyGauges();
    this.clearMarker();
    for (let i = 0; i < ARC_POOL; i++) if ((this.arcLeft[i] as number) > 0) this.arcOff(i);
    this.arcDeg = -1;
    for (let i = 0; i < 3; i++) { this.segRegen[i] = 0; this.flashOff(i); }
    this.bossLitEvent = -1;
    this.endLine();
    this.endCaption();
    this.endCheckpoint();
    this.endCard();
    this.setPrompt('', '');
    this.setHint('', false);
  }

  // =============================================================== options
  applyOption(key: keyof Options): void {
    const o = this.ctx.options.value;
    switch (key) {
      case 'crosshairSize': this.cross.style.setProperty('--xs', String(o.crosshairSize)); break;
      case 'crosshairColour': this.cross.style.setProperty('--xc', o.crosshairColour); break;
      case 'crosshairOutline': flag(this.cross, 'no-outline', !o.crosshairOutline); break;
      case 'subtitleBackground': this.subBox.style.setProperty('--sub-bg', String(o.subtitleBackground)); break;
      case 'bindings': this.refreshKeys(); break;
      default: break;
    }
  }
  private refreshKeys(): void {
    if (this.promptKey !== '') this.renderPrompt(this.promptBox, this.promptKey, false);
    if (this.hintKey !== '') this.renderPrompt(this.hintBox, this.hintKey, true);
  }

  // =============================================================== weapon events
  onFired(e: Readonly<GameEvents['weapon/fired']>): void {
    const mark = this.mark;
    // the fired chamber empties and the next one is under the hammer in the same tick: re-read now, then turn.
    // The kept round is the exception (code-player: no cock after it, the ring does not turn): its chamber empties in
    // place and the rounds close up when the clip ends; the HUD kicks now and settles again when they close up.
    mark.setCylinder(this.ctx.player.weapon.cylinder);
    const kept = e.ammo === 'kept_round';
    this.keptSettle = kept;
    if (!kept) {
      mark.turn();
      this.turnLeft = RING_TURN_DELAY + RING_TURN_SECONDS;
    }
    this.kick();
  }
  /** `weapon/reload`: the chambers are re-read at once (a round seats dot by dot); a pending close-up is moot */
  onReload(): void {
    this.keptSettle = false;
    this.mark.setCylinder(this.ctx.player.weapon.cylinder);
  }
  private kick(): void {
    if (this.ctx.options.value.reduceMotion) return;
    this.mark.kick();
    this.kickLeft = RING_KICK_SECONDS;
  }
  onKept(e: Readonly<GameEvents['weapon/kept']>): void {
    if (e.stage !== 'denied') {
      // the band is being broken: "break the band" comes down at once, prompt and hint alike, and stays down while
      // the round is in the gun; it may come back only when the round is back in its slot (`unloaded`)
      // (`chambered` and `fired` keep it down in the tick they arrive, before a frame has re-read the seventh)
      const out = e.stage !== 'unloaded';
      if (out !== this.keptLoading) { this.keptLoading = out; this.applyRows(); }
      return;
    }
    // restart a shiver that is still running
    if (this.mark.isShivering) this.mark.shiver(false);
    this.mark.shiver(true);
    this.shiverLeft = SHIVER_SECONDS;
  }

  // =============================================================== combat events
  onHit(e: Readonly<GameEvents['combat/hit']>): void {
    const kind = MARKER_OF[e.outcome];
    if (kind === '') return;
    this.markerPhase = this.markerPhase === 0 ? 1 : 0;
    this.markerGroup.setAttribute('class', MARKER_CLASS[kind][this.markerPhase] as string);
    this.markerKind = kind;
    this.markerLeft = MARKER_SECONDS[kind];
  }
  private clearMarker(): void {
    if (this.markerKind === '') return;
    this.markerKind = ''; this.markerLeft = 0;
    this.markerGroup.setAttribute('class', 'mk');
  }
  onDamaged(e: Readonly<GameEvents['player/damaged']>): void {
    const p = this.ctx.player, f = p.forward, pos = p.position;
    // the source against the current view, on the ground plane: 0 = ahead (the arc sits above the crosshair), clockwise
    const rx = e.fromX - pos.x, rz = e.fromZ - pos.z;
    let fx = f.x, fz = f.z;
    const fl = Math.hypot(fx, fz);
    if (fl > 1e-6) { fx /= fl; fz /= fl; } else { fx = -Math.sin(p.yaw); fz = -Math.cos(p.yaw); }
    const ahead = rx * fx + rz * fz, right = rx * -fz + rz * fx;
    let step = 0;
    if (ahead !== 0 || right !== 0) step = Math.round((Math.atan2(right, ahead) / (2 * Math.PI)) * ARC_DIRECTIONS);
    step = ((step % ARC_DIRECTIONS) + ARC_DIRECTIONS) % ARC_DIRECTIONS;
    const i = this.arcNext;
    this.arcNext = (i + 1) % ARC_POOL;
    const arc = this.arcs[i] as SVGElement, under = arc.previousElementSibling as SVGElement;
    const t = this.arcTransform[step] as string;
    arc.style.transform = t; under.style.transform = t;
    arc.setAttribute('class', 'arc on'); under.setAttribute('class', 'ink arc on');
    this.arcLeft[i] = ARC_SECONDS;
    this.arcDeg = (step * 360) / ARC_DIRECTIONS;
    // the segment her health is now in flashes its outline (never the screen)
    const hp = (e.health / (p.maxHealth || 100)) * 100;
    const seg = hp > (SEGMENT_TOP[1] as number) ? 2 : hp > (SEGMENT_TOP[0] as number) ? 1 : 0;
    const phase = this.segFlash[seg] === 1 ? 2 : 1;
    this.segFlash[seg] = phase;
    const bar = this.segs[seg] as HTMLDivElement;
    bar.classList.remove('fa', 'fb');
    bar.classList.add(FLASH[phase] as string);
    this.segFlashLeft[seg] = SEGMENT_FLASH_SECONDS;
  }
  private flashOff(i: number): void {
    this.segFlashLeft[i] = 0;
    if (this.segFlash[i] === 0) return;
    this.segFlash[i] = 0;
    (this.segs[i] as HTMLDivElement).classList.remove('fa', 'fb');
  }
  private arcOff(i: number): void {
    this.arcLeft[i] = 0;
    const arc = this.arcs[i] as SVGElement;
    arc.setAttribute('class', 'arc');
    (arc.previousElementSibling as SVGElement).setAttribute('class', 'ink arc');
  }
  onSegment(e: Readonly<GameEvents['player/health_segment']>): void { this.segRegen[e.segment] = e.regenerating ? 1 : 0; }

  // =============================================================== boss events
  onBossPhase(): void { this.bossLitEvent = -1; }
  onBossPips(e: Readonly<GameEvents['boss/pips']>): void { this.bossLitEvent = e.lit; }

  // =============================================================== story events
  onLine(e: Readonly<GameEvents['story/line']>): void {
    const ui = this.ctx.data;
    this.subKey = e.key;
    this.subtitle = e.text;
    this.speaker = e.speaker;
    const label = e.speaker === 'station' ? ui.ui('ui_speaker_station') : e.speaker === 'reeve' ? ui.ui('ui_speaker_reeve') : '';
    setText(this.subWho, label);
    setText(this.subSay, wrapSubtitle(e.text).join('\n'));
    this.subBox.className = SPEAKER_CLASS[e.speaker] ?? (SPEAKER_CLASS.narrator as string);
    // world ends the line with story/line_end; this only clears a line whose end never arrives
    this.subLeft = e.seconds + 1.5;
  }
  onLineEnd(e: Readonly<GameEvents['story/line_end']>): void {
    if (this.subKey !== '' && e.key !== this.subKey) return;
    this.endLine();
  }
  private endLine(): void {
    if (this.subtitle === '' && this.subKey === '') return;
    this.subKey = ''; this.subtitle = ''; this.speaker = ''; this.subLeft = 0;
    this.subBox.className = 'sub';
  }
  onCaption(e: Readonly<GameEvents['story/caption']>): void {
    // a sound that plays again and again (a room of Biders rattling) does not keep its caption up for ever
    if (e.key !== '') {
      const last = this.captionShownAt.get(e.key);
      if (last !== undefined && this.ticks - last < Math.round(CAPTION_REPEAT_SECONDS / FIXED_DT)) return;
      this.captionShownAt.set(e.key, this.ticks);
    }
    const text = e.text.startsWith('[') ? e.text : `[${e.text}]`;
    this.caption = text;
    setText(this.captionBox, text);
    flag(this.captionBox, 'on', true);
    this.captionLeft = e.seconds > 0 ? e.seconds : 2;
  }
  private endCaption(): void {
    if (this.caption === '') return;
    this.caption = ''; this.captionLeft = 0;
    flag(this.captionBox, 'on', false);
  }
  onCard(e: Readonly<GameEvents['story/card']>): void {
    const parts = splitCard(e.text);
    this.card = e.text;
    setText(this.cardNumeral, parts.numeral === '' ? parts.title : parts.numeral);
    setText(this.cardTitle, parts.numeral === '' ? '' : parts.title);
    flag(this.cardBox, 'single', parts.numeral === '');
    flag(this.cardBox, 'on', true);
    const seconds = e.seconds > 0 ? e.seconds : 3.5;
    this.cardLeft = seconds;
    this.cardHold = Math.max(0, seconds - CARD_FADE_OUT);
  }
  private endCard(): void {
    if (this.card === '') return;
    this.card = ''; this.cardLeft = 0; this.cardHold = 0;
    flag(this.cardBox, 'on', false);
  }
  onCheckpoint(e: Readonly<GameEvents['checkpoint/saved']>): void {
    const text = format(this.ctx.data.ui('ui_checkpoint'), this.ctx.options.value.bindings, { movement: roman(e.movement), n: String(e.section) });
    this.checkpoint = text;
    setText(this.checkpointBox, text);
    flag(this.checkpointBox, 'on', true);
    this.checkpointLeft = CHECKPOINT_SECONDS;
  }
  private endCheckpoint(): void {
    if (this.checkpoint === '') return;
    this.checkpoint = ''; this.checkpointLeft = 0;
    flag(this.checkpointBox, 'on', false);
  }

  // =============================================================== prompt and hint
  private renderPrompt(box: HTMLDivElement, key: StoryKey, isHint: boolean): void {
    const o = this.ctx.options.value;
    const template = this.ctx.data.ui(key);
    keyed(box, tokenize(template, o.bindings));
    const text = format(template, o.bindings);
    if (isHint) this.hintText = text; else this.promptText = text;
    this.applyRows();
  }
  /**
   * Which of the two rows are drawn. The hint row is never a second copy of the prompt (world raises `ui_prompt_kept`
   * as the tier 3 hint AND as the focus prompt of a proving mark), and "break the band" in either row is gone from the
   * press that breaks it until the round is back in its slot. `prompt` / `hint` (visibleText) are what is drawn.
   */
  private applyRows(): void {
    const kept = PROMPT_OF.kept, busy = this.keptLoading || this.keptAway;
    const promptOn = this.promptKey !== '' && !(busy && this.promptKey === kept);
    const hintOn = this.hintKey !== '' && !(busy && this.hintKey === kept) && !(promptOn && this.hintKey === this.promptKey);
    if (promptOn !== this.promptOn) { this.promptOn = promptOn; flag(this.promptBox, 'on', promptOn); }
    if (hintOn !== this.hintOn) { this.hintOn = hintOn; flag(this.hintBox, 'on', hintOn); }
    this.prompt = promptOn ? this.promptText : '';
    this.hint = hintOn ? this.hintText : '';
  }
  onFocus(e: Readonly<GameEvents['interact/focus']>): void {
    this.setPrompt(e.prompt !== '' ? e.prompt : e.id !== '' && e.kind !== '' ? PROMPT_OF[e.kind] : '', e.kind);
  }
  setPrompt(key: StoryKey | '', kind: string): void {
    if (key === this.promptKey) return;
    this.promptKey = key;
    if (key === '') { this.promptText = ''; this.applyRows(); return; }
    flag(this.promptBox, 'aqua', kind === 'kept' || key === PROMPT_OF.kept);
    this.renderPrompt(this.promptBox, key, false);
  }
  setHint(key: StoryKey | '', show: boolean): void {
    if (!show) {
      if (key !== '' && key !== this.hintKey) return;      // a hint that is no longer the one shown
      if (this.hintKey === '') return;
      this.hintKey = ''; this.hintText = '';
      this.applyRows();
      return;
    }
    if (key === this.hintKey) return;
    this.hintKey = key;
    flag(this.hintBox, 'aqua', key === PROMPT_OF.kept);
    this.renderPrompt(this.hintBox, key, true);
  }

  // =============================================================== per tick, per frame
  /** One fixed tick (only while the simulation runs: a paused game freezes its markers, captions and cards). */
  tick(): void {
    const dt = FIXED_DT;
    this.ticks++;
    if (this.markerLeft > 0 && (this.markerLeft -= dt) <= dt * 0.5) this.clearMarker();
    if (this.turnLeft > 0 && (this.turnLeft -= dt) <= 1e-6) { this.turnLeft = 0; this.mark.turnDone(); }
    if (this.kickLeft > 0 && (this.kickLeft -= dt) <= 1e-6) { this.kickLeft = 0; this.mark.kickDone(); }
    if (this.shiverLeft > 0 && (this.shiverLeft -= dt) <= 1e-6) { this.shiverLeft = 0; this.mark.shiver(false); }
    const arcLeft = this.arcLeft;
    for (let i = 0; i < ARC_POOL; i++) {
      const left = arcLeft[i] as number;
      if (left <= 0) continue;
      if ((arcLeft[i] = left - dt) <= 1e-6) this.arcOff(i);
    }
    const flashLeft = this.segFlashLeft;
    for (let i = 0; i < 3; i++) {
      const left = flashLeft[i] as number;
      if (left > 0 && (flashLeft[i] = left - dt) <= 1e-6) this.flashOff(i);
    }
    if (this.subLeft > 0 && (this.subLeft -= dt) <= 1e-6) this.endLine();
    if (this.captionLeft > 0 && (this.captionLeft -= dt) <= 1e-6) this.endCaption();
    if (this.checkpointLeft > 0 && (this.checkpointLeft -= dt) <= 1e-6) this.endCheckpoint();
    if (this.cardLeft > 0) {
      this.cardLeft -= dt; this.cardHold -= dt;
      if (this.cardLeft <= 1e-6) this.endCard();
      else if (this.cardHold <= 1e-6) flag(this.cardBox, 'on', false);
    }
  }

  /** Once per rendered frame: compare what the game says with what is drawn; touch the DOM only where they differ. */
  update(): void {
    const { ctx, mark } = this;
    const player = ctx.player, weapon = player.weapon;
    // ---- the mark
    const cylinder = weapon.cylinder;
    let moved = false;
    for (let i = 0; i < 6; i++) if (mark.setChamber(i, cylinder[i] ?? 'empty')) moved = true;
    // the rounds closing up after the kept shot (no turn: the ring settles where it is)
    if (moved && this.keptSettle) { this.keptSettle = false; this.kick(); }
    mark.setReserve(weapon.reserve);
    mark.setLineRounds(weapon.lineRounds);
    const seventh: SeventhState = weapon.seventh;
    mark.setSeventh(seventh);
    const away = seventh === 'chambered' || seventh === 'spent';
    if (away !== this.keptAway) { this.keptAway = away; this.applyRows(); }
    // ---- crosshair: the plumb glyph while the kept round is chambered; its stroke lengthens while the aim is legal
    const plumb = seventh === 'chambered' || cylinder[0] === 'kept';
    if (plumb !== this.plumb) { this.plumb = plumb; flag(this.cross, 'plumbed', plumb); }
    const legal = plumb && weapon.keptAimLegal;
    if (legal !== this.legal) { this.legal = legal; flag(this.cross, 'legal', legal); }
    // ---- health: three segments, a fill each
    const hp = (player.health / (player.maxHealth || 100)) * 100;
    let floor = 0;
    for (let i = 0; i < 3; i++) {
      const top = SEGMENT_TOP[i] as number;
      const f = hp >= top ? 1 : hp <= floor ? 0 : (hp - floor) / (top - floor);
      const q = Math.ceil(f * FILL_STEPS - 1e-6);
      if (q !== this.segFill[i]) { this.segFill[i] = q; (this.fills[i] as HTMLElement).style.transform = this.fillTransform[q] as string; }
      const regen = q > 0 && q < FILL_STEPS ? (this.segRegen[i] as number) : 0;
      if (regen !== this.segRegenShown[i]) {
        this.segRegenShown[i] = regen;
        const seg = this.segs[i] as HTMLDivElement;
        flag(seg, 'regen', regen === 1);
      }
      floor = top;
    }
    // ---- boss pips
    const boss = ctx.enemies.boss, phase = boss.phase;
    const shown = BOSS_SHOWN[phase];
    if (shown !== this.bossShown) { this.bossShown = shown; flag(this.boss, 'on', shown); }
    if (shown) {
      const bone = phase === 'p3b';
      if (bone !== this.bossBone) { this.bossBone = bone; flag(this.boss, 'bone', bone); }
      let lit = this.bossLitEvent >= 0 ? this.bossLitEvent : boss.pips;
      if (lit > BOSS_PIPS) lit = BOSS_PIPS; else if (lit < 0) lit = 0;
      if (lit !== this.bossLit) {
        // the lit pips are the last `lit` of the 26: the groups go dark from the left as the phases are broken
        for (let i = 0; i < BOSS_PIPS; i++) flag(this.pips[i] as HTMLElement, 'lit', i >= BOSS_PIPS - lit);
        this.bossLit = lit;
      }
    }
  }

  /** JSON-safe, finite numbers only. */
  debug(): Record<string, unknown> {
    const w = this.ctx.player.weapon;
    // integration seam: the pip figures are the LOGICAL ones (what update() will show), not the DOM cache, which is only
    // refreshed on drawn frames: __dbg.hash() must not depend on how many frames a script happened to draw
    const boss = this.ctx.enemies.boss, bossShown = BOSS_SHOWN[boss.phase];
    let bossLit = -1;
    if (bossShown) { bossLit = this.bossLitEvent >= 0 ? this.bossLitEvent : boss.pips; if (bossLit > BOSS_PIPS) bossLit = BOSS_PIPS; else if (bossLit < 0) bossLit = 0; }
    return {
      gauges: this.gaugesOn && !this.riding, ringTurns: this.mark.turns, ringAngleDeg: this.mark.turns * 60, ringTurning: this.turnLeft > 0,
      ringTurnLeft: +this.turnLeft.toFixed(4), marker: this.markerKind, markerLeft: +this.markerLeft.toFixed(4), arcDeg: this.arcDeg,
      shiver: this.mark.isShivering, seventh: w.seventh, plumb: this.plumb, legal: this.legal, bossLit, bossShown,
      segments: [this.segFill[0], this.segFill[1], this.segFill[2]],
    };
  }
}

/** A circular arc centred on "ahead" (up), `span` degrees wide, at radius r. */
function arcPath(r: number, span: number): string {
  const h = ((span / 2) * Math.PI) / 180;
  const x = (r * Math.sin(h)).toFixed(2), y = (-r * Math.cos(h)).toFixed(2);
  return `M-${x} ${y} A${r} ${r} 0 0 1 ${x} ${y}`;
}
