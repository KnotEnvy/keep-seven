// src/ui/hud: everything on screen during play (GDD 12.2, ART_BIBLE 10.3). Two layers: the gauges (crosshair, markers,
// damage arc, the six-and-one mark, health, boss pips) and the text (subtitles, captions, prompt, hint, checkpoint,
// title card). Events set classes and texts; update() compares cached values and writes only what differs; timers count
// fixed ticks (they stop with the simulation), and every motion is a CSS transition or keyframe started by a class.
import { FIXED_DT } from '../core/contracts.ts';
import type { BossPhase, GameContext, GameEvents, HitOutcome, LayoutMarker, Options, SeventhState, Speaker, StoryKey } from '../core/contracts.ts';
import { el, flag, inked, keyed, setText, svg } from './dom.ts';
import { MarkWidget } from './mark.ts';
import { format, roman, splitCard, tokenize, uiOr, wrapSubtitle } from './text.ts';

/** GDD 6.8: the HUD ring turns one notch between 120 and 300 ms after the shot (0.18 s). */
export const RING_TURN_DELAY = 0.12;
export const RING_TURN_SECONDS = 0.18;
export const RING_KICK_SECONDS = 0.14;
export const SHIVER_SECONDS = 0.3;
export const ARC_SECONDS = 0.6;
export const SEGMENT_FLASH_SECONDS = 0.4;
export const CHECKPOINT_SECONDS = 2;
export const CARD_FADE_OUT = 0.8;
/**
 * Release pass p0: the card's opacity is counted in fixed ticks like its timers, not left to a CSS transition on the wall
 * clock: a card whose time was up still stood, fading, over whatever the game had reached meanwhile whenever the game ran
 * faster or slower than the wall clock (a hitch, a stepped capture), and a paused game went on fading it. It comes up in
 * CARD_FADE_IN, holds, and goes in CARD_FADE_OUT (or CARD_FADE_QUICK); `CARD_STEPS` opacity steps, written when changed.
 */
export const CARD_FADE_IN = 0.6;
export const CARD_STEPS = 20;
/**
 * Polish round 5: a movement card never stands over a fight. Once a threat shows (a telegraph, an encounter or a wave
 * starting, a boss phase, a hit on her, her own shot) a card that is up has CARD_MIN_SECONDS on screen in all and then
 * goes in CARD_FADE_QUICK (ui.css `.card.quick`), and one that arrives within CARD_THREAT_SECONDS after a threat is
 * shown that briefly from the start. A card is shown once a run: the restore of a checkpoint does not show it again.
 */
export const CARD_MIN_SECONDS = 1;
export const CARD_FADE_QUICK = 0.3;
export const CARD_THREAT_SECONDS = 6;
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
/**
 * Release pass p0: the hints that teach a key of walking about (not of the fight) are not drawn while a fight is on: an
 * encounter is live or the Windlass is fighting. "Hold SHIFT to run" stood 17 s under the crosshair, on the Biders, in
 * the first fight. World still raises and lowers them as before (it is told nothing); the row comes up once the fight is
 * over if the hint is still asked for. Fire, reload, the line round and "break the band" are the fight's own and are
 * never held back.
 */
export const HINTS_HELD_IN_A_FIGHT: readonly StoryKey[] = ['ui_hint_move', 'ui_hint_sprint', 'ui_hint_interact'];
/**
 * Pass i1 (R12; story reviewers): a lazy hint is a reminder, not a fixture. "Hold SHIFT to run" stood from the gully to
 * the street (56 s) under the crosshair, and "W A S D to walk" came up over the narrator's first line. Each of the
 * walking-about hints is DRAWN for HINT_STAND_SECONDS, then taken away although world still asks for it; still asked for
 * HINT_RETURN_SECONDS later it is drawn once more, and after HINT_SHOWS stands never again in this run. The clocks count
 * drawn time on the fixed tick (a fight or a pause does not use the stand up). The walk hint also waits for the
 * narrator: it is not drawn while a line is on screen (HINTS_HELD_UNDER_A_LINE). All hints stand in the lower third,
 * above the subtitle (ui.css `.prompt.hint`), not under the crosshair.
 */
export const LAZY_HINTS: readonly StoryKey[] = HINTS_HELD_IN_A_FIGHT;
export const HINT_STAND_SECONDS = 8;
export const HINT_RETURN_SECONDS = 40;
export const HINT_SHOWS = 2;
export const HINTS_HELD_UNDER_A_LINE: readonly StoryKey[] = ['ui_hint_move'];
/** ... nor in the breath between two lines: the narrator has been quiet this long before it is drawn (the opening's two lines are half a second apart) */
export const HINT_QUIET_SECONDS = 1.5;
/**
 * Pass i1: under this share of her health (the last segment is all she has) the bars breathe and the frame's edge is
 * inked in, for as long as it lasts (ui.css `.hud.low`). Reduce flashes / reduce motion: a steady outline, no pulse.
 */
export const LOW_HEALTH = 35;
/**
 * Pass i2 (story reviewer, major; R5 / R12): the work at hand was drawn on the pause screen alone, so a player who never
 * paused was never told the goal, and the line that names the last choice was not on screen at the stone. Each new
 * objective (`objective/changed`: a trigger, a cleared fight, a restored checkpoint) is now drawn in play under the
 * checkpoint numeral for OBJECTIVE_SECONDS of simulated time and then fades. It waits for a movement card to be gone
 * (both arrive on entering a zone) and is not drawn under a sheet or a menu. It is NOT held back by a fight: the
 * objectives that change in one name that fight ("Lead will not hold it. The bore wants proving."), and held to its end
 * they would never be read; it stands top left, out of the fight's part of the frame.
 * An objective of OBJECTIVE_STANDS stays up for as long as she is inside the volume it names (the stone's: the choice).
 */
export const OBJECTIVE_SECONDS = 5;
export const OBJECTIVE_STANDS: Readonly<Record<StoryKey, string>> = { obj_rim_choice: 'trg_stone' };
/**
 * Pass i2: the dot beside the reserve numeral is named ("Line") beside it for LINE_LABEL_SECONDS when the first line
 * round is taken (the count goes from none to some), and for as long as the seat-a-line-round hint is drawn.
 */
export const LINE_LABEL_SECONDS = 6;
export const LINE_HINT: StoryKey = 'ui_hint_line';
/**
 * Pass i2 (story reviewer): close to the asking's dial the subtitle box lay on numeral 5 and the port under it. While
 * she is inside the puzzle's volume and it is unsolved, the talk column drops to the frame's bottom margin and the
 * box's backing thins (ui.css `.k7.dial`): the numerals and the ports read through and above it.
 */
export const DIAL_VOLUME = 'trg_pz_asking';
export const DIAL_PUZZLE = 'the_asking';
/**
 * Pass i3 (story reviewer b): the bore door's question was a 2.5 s subtitle and then nowhere: a player who looked at
 * the embers or the cradle first came back to a dial with nothing on screen saying what was being asked. World tells
 * which question is up (`asking/question`); its words are the station's own line (the volume's `lines.q1 .. q3`), drawn
 * under the work at hand with its count ("IDENTIFY STATION.  1 of 3") for as long as she is inside the puzzle's volume
 * and it is unsolved, and for OBJECTIVE_SECONDS more when she leaves. The pause screen shows the same line.
 */
export const ASK_QUESTIONS = 3;
/** boss phases in which she is being fought (the parley and the proof are talk and a puzzle) */
const BOSS_FIGHTING: Readonly<Record<BossPhase, boolean>> = { idle: false, parley: false, p1: true, p2: true, p3a: true, hush: false, proven: false, p3b: true, dead: false };
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
  /** index of the asked-for hint in LAZY_HINTS (-1: not one of them) */
  private hintLazy = -1;
  /** per lazy hint: seconds drawn in its current stand, stands completed in this run, seconds waited since the last one */
  private readonly lazyDrawn = new Float32Array(LAZY_HINTS.length);
  private readonly lazyShows = new Uint8Array(LAZY_HINTS.length);
  private readonly lazyRest = new Float32Array(LAZY_HINTS.length);
  private low = false;
  /** seconds since the last line ended (HINT_QUIET_SECONDS and more: quiet) */
  private quiet = HINT_QUIET_SECONDS;
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
  /** seconds the fade-out of the card on screen takes (CARD_FADE_OUT, or CARD_FADE_QUICK once it was cut) */
  private cardFade = CARD_FADE_OUT;
  /** the opacity step as last written (0 .. CARD_STEPS) */
  private cardStep = 0;
  private readonly cardOpacity: string[] = [];
  /** encounters started and not yet cleared or reset (ids are layout strings: no allocation after the first of each) */
  private readonly liveEncounters = new Set<string>();
  /** a fight is on, as last looked at in tick() */
  private fight = false;
  /** seconds the card on screen has been up */
  private cardAge = 0;
  /** tick of the last threat (-1: none in this life) */
  private threatAt = -1;
  /** keys of the cards shown in this run (seven movements, the title, the end: nine at most) */
  private readonly cardsShown = new Set<StoryKey>();

  private gaugesOn = false;
  private gaugesFade = false;
  private riding = false;
  // ---- the objective in play (pass i2)
  objective = '';
  private readonly objBox: HTMLDivElement;
  private readonly objText: HTMLDivElement;
  private objKey: StoryKey = '';
  /** an objective that has changed and has not been drawn yet (it waits for the card) */
  private objPending = false;
  private objLeft = 0;
  private objOn = false;
  private objStandIn: LayoutMarker | null = null;
  private lineLabelLeft = 0;
  private lineLabelOn = false;
  private lineLabelWant = false;
  /** tick before which a count that appears is a restored one (a checkpoint, Go on), not a first line round taken */
  private lineQuietUntil = 0;
  private lineRoundsSeen = -1;
  private readonly dialVolume: LayoutMarker | null;
  private dial = false;
  // ---- the asking's live question (pass i3). Not in debug(): the playthrough's hash is of the state's keys as they were
  /** the question that is up (0: none), and its line as drawn under the work at hand ('' when none) */
  askQuestion = 0;
  question = '';
  private readonly objAsk: HTMLDivElement;
  private readonly objAskSay: HTMLSpanElement;
  private readonly objAskCount: HTMLSpanElement;
  private readonly askText: string[] = [''];
  private readonly askCount: string[] = [''];
  private askShown = 0;
  private readonly lowFrame: HTMLDivElement;

  constructor(private readonly ctx: GameContext, root: HTMLElement) {
    const ui = ctx.data.ui.bind(ctx.data);
    for (let i = 0; i <= FILL_STEPS; i++) this.fillTransform.push(`scaleX(${(i / FILL_STEPS).toFixed(4)})`);
    for (let i = 0; i < ARC_DIRECTIONS; i++) this.arcTransform.push(`rotate(${(i * 360) / ARC_DIRECTIONS}deg)`);
    for (let i = 0; i <= CARD_STEPS; i++) this.cardOpacity.push((i / CARD_STEPS).toFixed(2));

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
    this.mark = new MarkWidget(this.gauges, 'mark', numerals, ui('ui_hud_line_rounds'));

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

    // pass i3: low health is also four pale brackets and a hairline just inside the frame (ui.css `.lowf`): the ink edge
    // alone was invisible where the frame's edges are already dark (the Tally House, the bore)
    this.lowFrame = el('div', 'lowf', this.gauges);
    for (const corner of ['tl', 'tr', 'bl', 'br']) el('i', corner, this.lowFrame);

    // ---------------------------------------------------------------- text
    this.texts = el('div', 'txt', root);
    this.checkpointBox = el('div', 'cp', this.texts);
    this.objBox = el('div', 'obj', this.texts);
    setText(el('div', 'obj-label', this.objBox), ui('ui_pause_objective'));
    this.objText = el('div', 'obj-line', this.objBox);
    this.objAsk = el('div', 'obj-ask', this.objBox);
    this.objAskSay = el('span', 'ask-say', this.objAsk);
    this.objAskCount = el('span', 'ask-n', this.objAsk);
    this.dialVolume = ctx.data.marker(DIAL_VOLUME) ?? null;
    // the station's own words for each question (the volume's `lines`), and "1 of 3" in the end card's word
    const askLines = (this.dialVolume?.params as { lines?: Record<string, unknown> } | undefined)?.lines;
    const of = uiOr('ui_end_of', '/');
    for (let q = 1; q <= ASK_QUESTIONS; q++) {
      const key = askLines ? askLines['q' + q] : undefined;
      this.askText.push(typeof key === 'string' ? ctx.data.story.lines[key]?.text ?? '' : '');
      this.askCount.push(`${q} ${of} ${ASK_QUESTIONS}`);
    }
    this.cardBox = el('div', 'card', this.texts);
    this.cardNumeral = el('div', 'card-num', this.cardBox);
    el('div', 'card-rule', this.cardBox);
    this.cardTitle = el('div', 'card-title', this.cardBox);
    // pass i1: the hint is the top of the talk column (above the caption and the subtitle, whatever their size), not a
    // row under the crosshair.
    // pass i3 (story reviewer a): so is the interact prompt, above the hint. It stood 60 px under the crosshair: on the
    // proving plate's pictogram, on the stone's cases, against the muzzle. It takes no room in the column when it is
    // not drawn, so the hint under it never moves.
    const talk = el('div', 'talk', this.texts);
    this.promptBox = el('div', 'prompt row', talk);
    this.hintBox = el('div', 'prompt hint', talk);
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
  /** a new run (Begin, Go on, Walk it again, the title): every card may be shown once more */
  newRun(): void {
    this.cardsShown.clear();
    this.lineRoundsSeen = -1;
    this.lazyDrawn.fill(0); this.lazyShows.fill(0); this.lazyRest.fill(0);
    this.applyRows();
  }
  /** a run begins or a checkpoint is restored: nothing of the last life stays on screen */
  reset(): void {
    this.riding = false;
    this.quiet = HINT_QUIET_SECONDS;
    this.threatAt = -1;
    this.liveEncounters.clear();
    this.fight = false;
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
    this.endObjective();
    this.objPending = false;
    this.lineLabelLeft = 0;
    this.lineLabelWant = false;
    this.lineRoundsSeen = -1;               // a restored count is not a first line round
    this.lineQuietUntil = this.ticks + 90;
    this.setDial(false);
    this.setQuestion(0);
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
    this.cutCard();                      // she is shooting: the card is not what she is looking at
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
    this.onThreat();
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
  onBossPhase(): void { this.bossLitEvent = -1; this.onThreat(); }
  /** `encounter/started` and `encounter/wave` (live: true), `encounter/cleared` and `encounter/reset` (false) */
  onEncounter(id: string, live: boolean): void {
    if (live) { this.liveEncounters.add(id); this.onThreat(); } else this.liveEncounters.delete(id);
  }
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
    this.quiet = 0;
    this.applyRows();                                    // the walk hint waits for the line to be over
  }
  onLineEnd(e: Readonly<GameEvents['story/line_end']>): void {
    if (this.subKey !== '' && e.key !== this.subKey) return;
    this.endLine();
  }
  private endLine(): void {
    if (this.subtitle === '' && this.subKey === '') return;
    this.subKey = ''; this.subtitle = ''; this.speaker = ''; this.subLeft = 0;
    this.subBox.className = 'sub';
    this.applyRows();
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
    // once a run: a death or "back to the last count" restores a checkpoint whose card she has already been shown
    if (e.key !== '') {
      if (this.cardsShown.has(e.key)) return;
      this.cardsShown.add(e.key);
    }
    const parts = splitCard(e.text);
    this.card = e.text;
    setText(this.cardNumeral, parts.numeral === '' ? parts.title : parts.numeral);
    setText(this.cardTitle, parts.numeral === '' ? '' : parts.title);
    flag(this.cardBox, 'single', parts.numeral === '');
    flag(this.cardBox, 'on', true);
    flag(this.cardBox, 'quick', false);
    const seconds = e.seconds > 0 ? e.seconds : 3.5;
    this.cardLeft = seconds;
    this.cardHold = Math.max(0, seconds - CARD_FADE_OUT);
    this.cardFade = CARD_FADE_OUT;
    this.cardAge = 0;
    this.drawCard();
    // a fight is already on (she came back into it): the card is brief from the start
    if (this.threatAt >= 0 && this.ticks - this.threatAt < Math.round(CARD_THREAT_SECONDS / FIXED_DT)) this.cutCard();
  }
  private endCard(): void {
    if (this.card === '') return;
    this.card = ''; this.cardLeft = 0; this.cardHold = 0; this.cardAge = 0;
    flag(this.cardBox, 'on', false);
    this.drawCard();
  }
  /**
   * The card's opacity from its own clock: up in CARD_FADE_IN, down over the last `cardFade` seconds, never a jump when
   * it is cut short while still coming up. Reduce motion: whole while it is held, then gone.
   */
  private drawCard(): void {
    let o = 0;
    if (this.card !== '' && this.cardLeft > 0) {
      if (this.ctx.options.value.reduceMotion) o = this.cardHold > 1e-6 ? 1 : 0;
      else {
        const up = this.cardAge / CARD_FADE_IN, down = this.cardLeft / this.cardFade;
        o = up < down ? up : down;
        if (o > 1) o = 1;
        if (o < 1 / CARD_STEPS) o = 1 / CARD_STEPS;        // a card that is up is never invisible (its first tick)
      }
    }
    const step = Math.round(o * CARD_STEPS);
    if (step === this.cardStep) return;
    this.cardStep = step;
    this.cardBox.style.opacity = this.cardOpacity[step] as string;
  }
  /** A threat has shown itself (system.ts wires the enemy and encounter events here). */
  onThreat(): void {
    this.threatAt = this.ticks;
    this.cutCard();
  }
  /** The card that is up gives way: CARD_MIN_SECONDS on screen in all, then the quick fade. Never lengthens one. */
  private cutCard(): void {
    if (this.card === '' || this.cardLeft <= 0) return;
    const hold = Math.max(0, CARD_MIN_SECONDS - this.cardAge);
    if (hold >= this.cardHold) return;
    this.cardHold = hold;
    this.cardLeft = hold + CARD_FADE_QUICK;
    this.cardFade = CARD_FADE_QUICK;
    flag(this.cardBox, 'quick', true);
    if (hold <= 1e-6) flag(this.cardBox, 'on', false);
    this.drawCard();
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

  // =============================================================== the objective in play
  /** `objective/changed`: drawn at once, or when the card that is up has gone (tick). */
  onObjective(e: Readonly<GameEvents['objective/changed']>): void {
    if (e.key === '' || e.text === '') { this.objPending = false; this.endObjective(); return; }
    this.objKey = e.key;
    setText(this.objText, e.text);
    const volume = OBJECTIVE_STANDS[e.key];
    this.objStandIn = volume !== undefined ? this.ctx.data.marker(volume) ?? null : null;
    this.objPending = true;
    if (this.objOn) { this.objOn = false; this.objective = ''; this.objLeft = 0; flag(this.objBox, 'on', false); }
    this.showObjective();
  }
  private showObjective(): void {
    if (!this.objPending || this.card !== '') return;
    this.objPending = false;
    this.objOn = true;
    this.objLeft = OBJECTIVE_SECONDS;
    this.objective = this.objText.textContent ?? '';
    flag(this.objBox, 'on', true);
  }
  private endObjective(): void {
    this.objLeft = 0;
    if (!this.objOn) return;
    this.objOn = false;
    this.objective = '';
    flag(this.objBox, 'on', false);
  }
  /** the choice stands while she is at the stone and has not made it (the round taken, or the ending begun) */
  private objectiveStands(): boolean {
    const m = this.objStandIn;
    if (m === null) return false;
    const { ctx } = this;
    if (ctx.world.objective !== this.objKey || ctx.world.stats.tookStoneRound || ctx.state.current === 'ending') return false;
    const p = ctx.player.position;
    return inVolume(m, p.x, p.y, p.z);
  }
  /** `asking/question`: the question that is up (0 takes it away). Drawn by drawQuestion when the objective is its own. */
  setQuestion(q: number): void {
    const n = q >= 1 && q <= ASK_QUESTIONS && (this.askText[q] as string) !== '' ? q : 0;
    if (n === this.askQuestion) return;
    this.askQuestion = n;
    this.drawQuestion();
    // a new question is news: the work at hand comes up with it, wherever she stands
    if (n > 0 && this.question !== '' && this.objKey !== '' && !this.objOn) { this.objPending = true; this.showObjective(); }
    else if (n > 0 && this.objOn && this.objLeft < OBJECTIVE_SECONDS) this.objLeft = OBJECTIVE_SECONDS;
  }
  /** the question as the pause screen shows it ("IDENTIFY STATION.", "1 of 3"); null when none is up */
  questionParts(): readonly [string, string] | null {
    const q = this.askShown;
    return q > 0 ? [this.askText[q] as string, this.askCount[q] as string] : null;
  }
  /** the line under the objective: only while the asking is the work at hand and is unsolved */
  private drawQuestion(): void {
    const { ctx } = this;
    const q = this.askQuestion > 0 && ctx.world.zone === this.dialVolume?.zone && !ctx.world.puzzle(DIAL_PUZZLE).solved ? this.askQuestion : 0;
    if (q === this.askShown) return;
    this.askShown = q;
    this.question = q > 0 ? `${this.askText[q] as string} ${this.askCount[q] as string}` : '';
    setText(this.objAskSay, q > 0 ? this.askText[q] as string : '');
    setText(this.objAskCount, q > 0 ? this.askCount[q] as string : '');
    flag(this.objAsk, 'on', q > 0);
  }
  private setDial(on: boolean): void {
    if (on === this.dial) return;
    this.dial = on;
    flag(this.texts, 'dial', on);
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
    const lazy = this.hintLazy;
    // a lazy hint has stood its time (it may come back once, HINT_RETURN_SECONDS later), or waits for the narrator
    const stood = lazy >= 0 && ((this.lazyShows[lazy] as number) >= HINT_SHOWS || ((this.lazyShows[lazy] as number) > 0 && (this.lazyRest[lazy] as number) < HINT_RETURN_SECONDS));
    const spoken = (this.subKey !== '' || this.quiet < HINT_QUIET_SECONDS) && HINTS_HELD_UNDER_A_LINE.includes(this.hintKey);
    const hintOn = this.hintKey !== '' && !(busy && this.hintKey === kept) && !(promptOn && this.hintKey === this.promptKey)
      && !(this.fight && HINTS_HELD_IN_A_FIGHT.includes(this.hintKey)) && !stood && !spoken;
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
      // a stand that world cut short is not a stand: the hint may be shown its whole time when it is asked for again
      if (this.hintLazy >= 0) this.lazyDrawn[this.hintLazy] = 0;
      this.hintKey = ''; this.hintText = ''; this.hintLazy = -1;
      this.applyRows();
      return;
    }
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hintLazy = LAZY_HINTS.indexOf(key);
    flag(this.hintBox, 'aqua', key === PROMPT_OF.kept);
    this.renderPrompt(this.hintBox, key, true);
  }

  // =============================================================== per tick, per frame
  /** One fixed tick (only while the simulation runs: a paused game freezes its markers, captions and cards). */
  tick(): void {
    const dt = FIXED_DT;
    this.ticks++;
    // a fight is on: the walking-about hints wait for it to be over (HINTS_HELD_IN_A_FIGHT). Looked at on the fixed tick,
    // not the drawn frame: what visibleText() reports must not depend on how many frames were drawn
    const fight = this.liveEncounters.size > 0 || BOSS_FIGHTING[this.ctx.enemies.boss.phase] === true;
    if (fight !== this.fight) { this.fight = fight; this.applyRows(); }
    if (this.subKey === '' && this.quiet < HINT_QUIET_SECONDS && (this.quiet += dt) >= HINT_QUIET_SECONDS - 1e-6) { this.quiet = HINT_QUIET_SECONDS; this.applyRows(); }
    // the lazy hint's stand (HINT_STAND_SECONDS drawn) and its one return (HINT_RETURN_SECONDS asked for and not drawn)
    const lazy = this.hintLazy;
    if (lazy >= 0) {
      if (this.hintOn) {
        if ((this.lazyDrawn[lazy] = (this.lazyDrawn[lazy] as number) + dt) >= HINT_STAND_SECONDS - 1e-6) {
          this.lazyDrawn[lazy] = 0; this.lazyRest[lazy] = 0; this.lazyShows[lazy] = (this.lazyShows[lazy] as number) + 1;
          this.applyRows();
        }
      } else if ((this.lazyShows[lazy] as number) > 0 && (this.lazyShows[lazy] as number) < HINT_SHOWS && (this.lazyRest[lazy] as number) < HINT_RETURN_SECONDS) {
        if ((this.lazyRest[lazy] = (this.lazyRest[lazy] as number) + dt) >= HINT_RETURN_SECONDS) this.applyRows();
      }
    }
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
    // ---- the objective: its five seconds, or for as long as she stands in the volume it names
    if (this.objPending) this.showObjective();
    if (this.objStandIn !== null && !this.objPending) {
      const stands = this.objectiveStands();
      if (stands) { if (!this.objOn) { this.objPending = true; this.showObjective(); } this.objLeft = OBJECTIVE_SECONDS; }
      else if (this.objOn && this.objLeft > 1 && (this.ctx.world.stats.tookStoneRound || this.ctx.state.current === 'ending')) this.objLeft = 1;
    }
    if (this.objLeft > 0 && (this.objLeft -= dt) <= 1e-6) this.endObjective();
    // ---- the line dot's name: looked at on the fixed tick (what debugState reports must not depend on drawn frames)
    const lines = this.ctx.player.weapon.lineRounds;
    if (lines !== this.lineRoundsSeen) {
      if (this.lineRoundsSeen === 0 && lines > 0 && this.ticks >= this.lineQuietUntil) this.lineLabelLeft = LINE_LABEL_SECONDS;
      this.lineRoundsSeen = lines;
    }
    if (this.lineLabelLeft > 0 && (this.lineLabelLeft -= dt) <= 1e-6) this.lineLabelLeft = 0;
    this.lineLabelWant = lines > 0 && (this.lineLabelLeft > 0 || (this.hintOn && this.hintKey === LINE_HINT));
    // ---- at the asking's dial the talk column stands low and thin
    const dv = this.dialVolume;
    if (dv !== null) {
      const p = this.ctx.player.position;
      const inside = inVolume(dv, p.x, p.y, p.z) && !this.ctx.world.puzzle(DIAL_PUZZLE).solved;
      this.setDial(inside);
      if (this.askQuestion > 0 || this.askShown > 0) this.drawQuestion();
      // the question stands with the work at hand while she is at the door (and comes back when she comes back)
      if (inside && this.askShown > 0 && this.objKey !== '' && this.card === '') {
        if (!this.objOn) { this.objPending = true; this.showObjective(); }
        this.objLeft = OBJECTIVE_SECONDS;
      }
    }
    if (this.cardLeft > 0) {
      this.cardLeft -= dt; this.cardHold -= dt; this.cardAge += dt;
      if (this.cardLeft <= 1e-6) this.endCard();
      else { if (this.cardHold <= 1e-6) flag(this.cardBox, 'on', false); this.drawCard(); }
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
    // the dot is named when the first line round is taken, and while the hint that teaches its key is drawn (tick)
    const label = this.lineLabelWant;
    if (label !== this.lineLabelOn) { this.lineLabelOn = label; mark.setLineLabel(label); }
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
    const low = hp > 0 && hp < LOW_HEALTH;
    if (low !== this.low) { this.low = low; flag(this.gauges, 'low', low); }
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
      cardLeft: +this.cardLeft.toFixed(4), cardOpacity: this.cardStep / CARD_STEPS, fight: this.fight,
      segments: [this.segFill[0], this.segFill[1], this.segFill[2]],
      hintStands: [this.lazyShows[0], this.lazyShows[1], this.lazyShows[2]],
      objective: this.objective, objectiveLeft: +this.objLeft.toFixed(4), objectivePending: this.objPending, lineLabel: this.lineLabelWant, dial: this.dial,
    };
  }
}

/** A circular arc centred on "ahead" (up), `span` degrees wide, at radius r. */
function arcPath(r: number, span: number): string {
  const h = ((span / 2) * Math.PI) / 180;
  const x = (r * Math.sin(h)).toFixed(2), y = (-r * Math.cos(h)).toFixed(2);
  return `M-${x} ${y} A${r} ${r} 0 0 1 ${x} ${y}`;
}

/** Is a point inside a marker's volume (pos is the centre of its bottom face, size is before rotY)? As src/world reads it. */
export function inVolume(m: Readonly<LayoutMarker>, x: number, y: number, z: number): boolean {
  const size = m.size;
  if (!size) return false;
  const dy = y - m.pos[1];
  if (dy < -0.01 || dy > size[1]) return false;
  const dx = x - m.pos[0], dz = z - m.pos[2];
  if (m.rotY === 0) return Math.abs(dx) <= size[0] / 2 && Math.abs(dz) <= size[2] / 2;
  const r = (m.rotY * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  return Math.abs(lx) <= size[0] / 2 && Math.abs(lz) <= size[2] / 2;
}
