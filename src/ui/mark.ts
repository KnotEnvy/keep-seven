// src/ui/mark: the six-and-one glyph. MarkWidget is the HUD's cylinder ring with the seventh round beside it (GDD 12.2,
// ART_BIBLE 10.3); the pause screen shows a second, enlarged instance. pellamMark() is the maker's mark exactly as
// ART_BIBLE 5.6 constructs it (the title screen's brass glyph).
//
// LOAD-BEARING (story.json meta.load_bearing `hud_seventh`): the seventh is its own group, outside the ring, joined to
// the ring's centre by the hairline. It is never hidden, never selectable and never drawn as a seventh chamber.
import type { ChamberState, SeventhState } from '../core/contracts.ts';
import { inked, svg } from './dom.ts';

/** Units are pixels at 1080p. The ring is 64 across: disc centres on r = 27, discs r = 5. */
export const RING_RADIUS = 27;
export const DISC_RADIUS = 5;
/**
 * How much larger than ART_BIBLE 10.3's 9 x 22 the seventh is drawn (polish round 2: at 720p the load-bearing glyph was
 * 8 x 19 px, the smallest thing on screen). Everything inside the cartridge scales with it; the ring does not.
 */
export const SEVENTH_SCALE = 2;
/**
 * the seventh: 18 x 44 (polish round 5: it was 13.5 x 33, 15 x 36 px at 720p, and the one mark the game is named for
 * was the smallest thing on screen), its nearest corner 19 px from the ring's edge, lower right; the hairline ends on
 * its nose
 */
export const SEVENTH_BOX = { x: 25, y: 45, w: 9 * SEVENTH_SCALE, h: 22 * SEVENTH_SCALE } as const;
/** the ring's part of the box is unchanged (88 x 116); the taller cartridge adds MARK_DROP under it (ui.css `.mark`) */
export const MARK_DROP = 23;
/** the reserve numeral: its size in mark units (12 until polish round 5: 13 px at 720p) and its baseline */
export const RESERVE_SIZE = 15, RESERVE_BASELINE = 51;
export const MARK_VIEW = { x: -44, y: -44, w: 88, h: 116 + MARK_DROP } as const;
/**
 * The legibility floor: on a small screen the HUD mark stops shrinking with the viewport (ui.css `--mk`). 1.08 keeps it
 * at 95 x 150 px, the chamber dots at 10.8 px, the seventh at 19.4 x 47.5 px and the reserve numeral at 16 px on a
 * 1280 x 720 frame (polish round 3: at 0.864 it was 76 x 111 with 8.6 px dots and was lost over the sleeve in the street).
 */
export const MARK_MIN_SCALE = 1.08;
/**
 * Pass i1: the floor is for a frame of 720p and up. In a window under MARK_FLOOR_HEIGHT tall it took a third of the
 * height (150 px of 450), so there the floor comes down with the height, to MARK_SMALL_SCALE at the least (the reserve
 * numeral is then 11 px). ui.css `--mk` is the same rule; markScale() is it in numbers (the kick and the tests use it).
 */
export const MARK_FLOOR_HEIGHT = 600, MARK_SMALL_SCALE = 0.72;
export function markScale(width: number, height: number): number {
  const u = Math.min(height / 1080, width / 1440);
  return Math.max(u, Math.min(MARK_MIN_SCALE, Math.max(MARK_SMALL_SCALE, (height * MARK_MIN_SCALE) / MARK_FLOOR_HEIGHT)));
}
/** the pause screen's enlarged mark: this many viewport units per mark unit, and the floor of that (ui.css `.mark.big`) */
export const MARK_BIG_SCALE = 3, MARK_BIG_MIN_SCALE = 0.864 * 3;
/** the broken band: its halves' tops below the shoulder (the whole band sits at 3), and the width of each half */
const K = SEVENTH_SCALE, BAND = 3.5 * K, BROKEN_UP = 0.5 * K, BROKEN_DOWN = 6 * K, BROKEN_HALF = 3.2 * K;

const CHAMBER_INDEX: Readonly<Record<ChamberState, number>> = { empty: 0, lead: 1, line: 2, kept: 3 };
const CHAMBER_CLASS: readonly string[] = ['ch empty', 'ch lead', 'ch line', 'ch kept'];
const SEVENTH_INDEX: Readonly<Record<SeventhState, number>> = { sealed: 0, pulse: 1, band_broken: 2, chambered: 3, spent: 4, violet: 5 };
const SEVENTH_CLASS: readonly string[] = ['sv sealed', 'sv pulse', 'sv band_broken', 'sv chambered', 'sv spent', 'sv violet'];
const TURN_CLASS: readonly string[] = ['turn', 'turn ta', 'turn tb'];
const KICK_CLASS: readonly string[] = ['rk', 'rk ka', 'rk kb'];
const SHIVER_CLASS: readonly string[] = ['svw', 'svw shiver'];
const PIP_CLASS: readonly string[] = ['lp', 'lp on'];
const LABEL_CLASS: readonly string[] = ['ll', 'll on'];
/**
 * The backing (polish round 4, when the HUD mark stood on the revolver's frame and grip; since round 5 it stands lower
 * left, over whatever the world is there: glare sand at worst). Two soft ink discs lie under it, one under the ring and the numeral, one under the seventh: ink at BACKING_ALPHA out to
 * BACKING_CORE of the radius, then fading to nothing, so there is no panel edge. The enlarged mark of the pause screen
 * stands on the scrim and has none (ui.css `.mark.big .bk`).
 */
export const BACKING_ALPHA = 0.5, BACKING_CORE = 0.6;
export const BACKING_RING = { cx: 0, cy: 6, r: 54 } as const;
export const BACKING_SEVENTH = { cx: SEVENTH_BOX.x + SEVENTH_BOX.w / 2, cy: SEVENTH_BOX.y + SEVENTH_BOX.h / 2, rx: 23, ry: 36 } as const;
let backingSeq = 0;

export class MarkWidget {
  readonly root: SVGElement;
  /** the six chambers and the notch (what "the ring" means in tests) */
  readonly ring: SVGElement;
  readonly hairline: SVGElement;
  readonly seventh: SVGElement;
  readonly reserve: SVGElement;
  private readonly turnGroup: SVGElement;
  private readonly shiverGroup: SVGElement;
  private readonly chambers: SVGElement[] = [];
  private readonly pips: SVGElement[] = [];
  private readonly lineLabel: SVGElement;
  private lineLabelOn = false;
  private readonly chamberState = new Int8Array(6).fill(-1);
  private seventhState = -1;
  private reserveShown = -1;
  private lineShown = -1;
  private turnPhase = 0;
  private kickPhase = 0;
  private shivering = false;
  /** how many notches the ring has turned (its rotation target is 60 degrees times this) */
  turns = 0;

  /** `numerals[n]` is the reserve text for n (preformatted from `ui_hud_reserve`, so a change allocates nothing). */
  constructor(parent: Element, cls: string, private readonly numerals: readonly string[], lineName = '') {
    const v = MARK_VIEW;
    const root = svg('svg', { viewBox: `${v.x} ${v.y} ${v.w} ${v.h}`, 'aria-hidden': 'true' }, parent, cls);
    this.root = root;
    const s = SEVENTH_BOX;
    const noseX = s.x + s.w / 2;
    // the backing first, under everything: built once, never touched again
    const gradId = 'k7-mark-bk-' + backingSeq++;
    const grad = svg('radialGradient', { id: gradId }, svg('defs', {}, root));
    svg('stop', { offset: 0, 'stop-color': '#14110F', 'stop-opacity': BACKING_ALPHA }, grad);
    svg('stop', { offset: BACKING_CORE, 'stop-color': '#14110F', 'stop-opacity': BACKING_ALPHA }, grad);
    svg('stop', { offset: 1, 'stop-color': '#14110F', 'stop-opacity': 0 }, grad);
    svg('circle', { ...BACKING_RING, fill: `url(#${gradId})`, 'data-part': 'backing' }, root, 'bk');
    svg('ellipse', { ...BACKING_SEVENTH, fill: `url(#${gradId})` }, root, 'bk');
    // the hairline: ring centre to the nose of the seventh, between the chambers at 120 and 180 degrees
    this.hairline = inked('line', { x1: 0, y1: 0, x2: noseX, y2: s.y }, root, 'hair');
    this.hairline.setAttribute('data-part', 'hairline');

    const ring = svg('g', { 'data-part': 'ring' }, root, KICK_CLASS[0] as string);
    this.ring = ring;
    inked('line', { x1: 0, y1: -RING_RADIUS - DISC_RADIUS - 2.5, x2: 0, y2: -RING_RADIUS - DISC_RADIUS - 7 }, ring, 'notch');
    this.turnGroup = svg('g', {}, ring, TURN_CLASS[0] as string);
    for (let i = 0; i < 6; i++) {
      // chamber 0 is under the hammer (top); the cylinder turns clockwise, so chamber 1 waits on the left of it
      const a = (-60 * i * Math.PI) / 180;
      const x = +(RING_RADIUS * Math.sin(a)).toFixed(3), y = +(-RING_RADIUS * Math.cos(a)).toFixed(3);
      const g = svg('g', { transform: `translate(${x} ${y})` }, this.turnGroup, 'ch');
      svg('circle', { r: DISC_RADIUS - 0.75 }, g, 'eu');
      svg('circle', { r: DISC_RADIUS - 0.75 }, g, 'e');
      svg('circle', { r: DISC_RADIUS }, g, 'd');
      svg('circle', { r: 2.2 }, g, 'kd');
      this.chambers.push(g);
    }

    // line rounds: 0 to 2 pips under the ring, left of the reserve numeral
    for (let i = 0; i < 2; i++) this.pips.push(svg('circle', { cx: -23 + i * 7, cy: 45.5, r: 2.5 }, root, PIP_CLASS[0] as string));
    // pass i2: the dots' name, under them; pass i4: for as long as a line round is held (hud.ts LINE_LABEL_ALWAYS)
    this.lineLabel = svg('text', { x: -26.5, y: 63, 'font-size': 9.5 }, root, LABEL_CLASS[0] as string);
    this.lineLabel.textContent = lineName;
    this.reserve = svg('text', { x: 0, y: RESERVE_BASELINE, 'text-anchor': 'middle', 'font-size': RESERVE_SIZE }, root, 'rs');

    // the seventh: a cartridge side-on, upright; nose up, rim down, its band a filled bar
    this.shiverGroup = svg('g', {}, root, SHIVER_CLASS[0] as string);
    const sv = svg('g', { 'data-part': 'seventh' }, this.shiverGroup, 'sv');
    this.seventh = sv;
    const x0 = s.x, x1 = s.x + s.w, top = s.y, bottom = s.y + s.h, shoulder = s.y + 7 * K;
    const body = `M${x0} ${bottom} V${shoulder} C${x0} ${top + 3 * K} ${noseX - 2 * K} ${top} ${noseX} ${top} C${noseX + 2 * K} ${top} ${x1} ${top + 3 * K} ${x1} ${shoulder} V${bottom} Z`;
    inked('path', { d: body }, sv, 'so');
    svg('line', { x1: x0, y1: bottom - 2.5 * K, x2: x1, y2: bottom - 2.5 * K }, sv, 'sr');
    svg('rect', { x: x0 + 0.5, y: shoulder + 3 * K, width: s.w - 1, height: BAND }, sv, 'sb');
    // band_broken: the two halves of the band, slipped a whole band's height and more apart (left up, right down) with
    // clear case between them, so the break reads at a glance on the smallest HUD (at 720p the step is 7 px)
    svg('rect', { x: x0 + 0.5, y: shoulder + BROKEN_UP, width: BROKEN_HALF, height: BAND }, sv, 'sh');
    svg('rect', { x: x1 - 0.5 - BROKEN_HALF, y: shoulder + BROKEN_DOWN, width: BROKEN_HALF, height: BAND }, sv, 'sh');
  }

  /** true when the chamber changed (and was redrawn) */
  setChamber(i: number, state: ChamberState): boolean {
    const n = CHAMBER_INDEX[state];
    if (this.chamberState[i] === n) return false;
    this.chamberState[i] = n;
    (this.chambers[i] as SVGElement).setAttribute('class', CHAMBER_CLASS[n] as string);
    return true;
  }
  setCylinder(cylinder: readonly ChamberState[]): void {
    for (let i = 0; i < 6; i++) this.setChamber(i, cylinder[i] ?? 'empty');
  }
  setReserve(n: number): void {
    if (n === this.reserveShown) return;
    this.reserveShown = n;
    const text = this.numerals[n < 0 ? 0 : n >= this.numerals.length ? this.numerals.length - 1 : n] as string;
    this.reserve.textContent = text;
  }
  setLineRounds(n: number): void {
    if (n === this.lineShown) return;
    this.lineShown = n;
    for (let i = 0; i < this.pips.length; i++) (this.pips[i] as SVGElement).setAttribute('class', PIP_CLASS[i < n ? 1 : 0] as string);
  }
  setLineLabel(on: boolean): void {
    if (on === this.lineLabelOn) return;
    this.lineLabelOn = on;
    this.lineLabel.setAttribute('class', LABEL_CLASS[on ? 1 : 0] as string);
  }
  setSeventh(state: SeventhState): void {
    const n = SEVENTH_INDEX[state];
    if (n === this.seventhState) return;
    this.seventhState = n;
    this.seventh.setAttribute('class', SEVENTH_CLASS[n] as string);
  }
  /** One notch: the chambers have already been re-read, so the turn plays from 60 degrees back to rest. */
  turn(): void {
    this.turns++;
    this.turnPhase = this.turnPhase === 1 ? 2 : 1;
    this.turnGroup.setAttribute('class', TURN_CLASS[this.turnPhase] as string);
  }
  turnDone(): void {
    if (this.turnPhase === 0) return;
    this.turnPhase = 0;
    this.turnGroup.setAttribute('class', TURN_CLASS[0] as string);
  }
  /** The ring kick: 2 px up and settle. */
  kick(): void {
    this.kickPhase = this.kickPhase === 1 ? 2 : 1;
    this.ring.setAttribute('class', KICK_CLASS[this.kickPhase] as string);
  }
  kickDone(): void {
    if (this.kickPhase === 0) return;
    this.kickPhase = 0;
    this.ring.setAttribute('class', KICK_CLASS[0] as string);
  }
  shiver(on: boolean): void {
    if (on === this.shivering) return;
    this.shivering = on;
    this.shiverGroup.setAttribute('class', SHIVER_CLASS[on ? 1 : 0] as string);
  }
  get isShivering(): boolean { return this.shivering; }
}

/**
 * The Pellam mark (ART_BIBLE 5.6), U = the radius from the ring's centre to each disc centre: six open discs of radius
 * 0.22 U at 30 + 60 n degrees, a stroke 0.08 U wide from the centre straight down 2.10 U, a solid seventh disc of
 * radius 0.28 U at 2.38 U. Box 2.44 U x 3.75 U, always upright. `wall` is the annulus wall of the cast and stencilled
 * versions (0.07 U); 0 draws the six as plain discs (GDD 2: "a ring of six small discs"), which is what holds at 28 px.
 */
export function pellamMark(parent: Element, cls: string, wall = 0.07): SVGElement {
  const U = 10;
  const top = -(Math.cos(Math.PI / 6) + 0.22) * U;
  const root = svg('svg', { viewBox: `${-1.22 * U} ${top.toFixed(3)} ${2.44 * U} ${3.75 * U}`, 'aria-hidden': 'true' }, parent, cls);
  svg('line', { x1: 0, y1: 0, x2: 0, y2: 2.1 * U, 'stroke-width': 0.08 * U }, root, 'pm-stroke');
  for (let i = 0; i < 6; i++) {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    const at = { cx: (U * Math.sin(a)).toFixed(3), cy: (-U * Math.cos(a)).toFixed(3) };
    if (wall > 0) svg('circle', { ...at, r: (0.22 - wall / 2) * U, 'stroke-width': wall * U }, root, 'pm-disc');
    else svg('circle', { ...at, r: 0.22 * U }, root, 'pm-disc solid');
  }
  svg('circle', { cx: 0, cy: 2.38 * U, r: 0.28 * U }, root, 'pm-seventh');
  return root;
}
