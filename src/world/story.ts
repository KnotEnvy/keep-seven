// src/world/story.ts: the sequencer (ARCHITECTURE 3.6 "Story text"), objectives and title cards. Any system asks for
// a line with `story/say`; this file applies the once-only rule (every nar_* key at most once per run), queues (one
// line at a time, at most four waiting, hints dropped when busy, a line that waited too long for its turn dropped as
// stale unless the story stands on it) and emits story/line, story/card, story/caption.
// StoryQueue is the pure part (unit-tested in tests/world/story.spec.ts); time is counted in this file's own ticks,
// so a readable (a `paused` state) holds a line where it is.
import type { GameEvents, StoryKey } from '../core/contracts.ts';
import { lampCount } from './internals.ts';
import type { State, StoryApi } from './internals.ts';

export const MAX_WAITING = 4;
const BACKLOG = 48;
/** prefix of the save flags that hold what was waiting to be said: `q:<nn>:<key>` */
export const QUEUED = 'q:';
const TICKS_PER_SECOND = 60;
/** a breath between two lines */
const GAP_TICKS = 15;
/** a caption holds 2 s; the same key is not shown again within 4 s (GDD 17) */
export const CAPTION_HOLD = 2;
export const CAPTION_REPEAT = 4;

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/**
 * A count the narrator says, in words (0 to 99; the lamps are 9 to 48): "Nine", "Thirty-seven". A number has no key of
 * its own in story.json; the words are English like the rest of the text (meta.language).
 */
export function countWord(n: number, capital = true): string {
  const v = Math.max(0, Math.floor(n));
  if (v > 99) return String(v);
  const w = v < 20 ? (ONES[v] as string) : (TENS[Math.floor(v / 10)] as string) + (v % 10 ? '-' + (ONES[v % 10] as string) : '');
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

export type LineClass = 'nar' | 'hint' | 'other';
export function lineClass(key: StoryKey): LineClass {
  return key.startsWith('nar_') ? 'nar' : key.startsWith('hint_') ? 'hint' : 'other';
}
export type SayResult = 'queued' | 'backlog' | 'dropped';

/**
 * How long a line may wait for its turn before it is stale (polish round 2: a brisk player heard each room described
 * one or two rooms late). Counted in the queue's own ticks, past the time the lines said with it (the same batch) take:
 * in the place it was said about, and once she has left that place.
 */
export const STALE_SECONDS = 20;
export const STALE_SECONDS_LEFT = 4;
/**
 * Lines that are never dropped for being late: the story does not stand without them (the seventh, the proving plate,
 * the cradle, the kept round, the first Bider freed and felled, what she means to ask, the lamps, the stone and the last
 * lines). `story.json` `meta.rules.never_stale` wins when level design adds it (docs/requests/code-world.md).
 */
export const NEVER_STALE: readonly RegExp[] = [
  /^nar_(seven|plate_\d|cradle(_2)?|seal|office|kept|one_left|first_fell|first_seat|ask|lamps(_count|_hers)?|stone_\d|take_\d|leave|fire|last|not_for_firing|down_the_bore)$/,
  /^rv_/, /^stn_proven$/,
];
/**
 * Lines that may come late but are not load-bearing (polish round 3): the rim's own scenery lines. When she walks
 * straight to the stone its lines go ahead of them, and the line that says how far the Rule leans was lost to the 20 s
 * rule while she stood there with nothing being said. They are not `neverStale` (the ending spares only those when a
 * branch begins): a player who takes the round at once still loses them.
 */
export const LATE_OK: readonly RegExp[] = [/^nar_rim_\d$/, /^nar_stone_wait$/];   // (p0: the warning before the leave branch is never lost to the clock: ending.ts)
export function lateOk(key: StoryKey): boolean {
  for (let i = 0; i < LATE_OK.length; i++) if ((LATE_OK[i] as RegExp).test(key)) return true;
  return false;
}
export function neverStale(key: StoryKey): boolean {
  for (let i = 0; i < NEVER_STALE.length; i++) if ((NEVER_STALE[i] as RegExp).test(key)) return true;
  return false;
}

/**
 * Release pass p0 (the playthrough critic: the file's three warnings were on screen 8 s after the waves they name, and
 * "Four more, from the far door" a second before the fight was over; the story critic: "One round, one line" was not
 * said at the line shot). An URGENT line is about something happening this second: it stands ahead of everything that
 * waits (the lines `front` put there too), and it cuts the line on screen unless that line is one the story stands on
 * (`keep`), is itself urgent, or has less than `URGENT_SPARE` seconds left. A line cut this way counts as said.
 */
export const URGENT_SPARE = 1;
/** an urgent line that is not one the story stands on makes way for the next urgent line once it has been up this long */
export const URGENT_HOLD = 3;
/**
 * Pass i1 (story reviewer: "DAYLIGHT. HEADWORKS WAKING." came 5 s after the light hit the cell because a room line was
 * on screen; cutting that line at once would lose it, and the same reviewer counts the room's lines lost). A line said
 * with `read` (a share, 0 to 1) is urgent, but it cuts the line on screen only once that line has had that share of its
 * own time (a line's hold is 1.5 s and 0.06 s a character: at two thirds of it, it has been read): the wait is two
 * thirds of a line at most, 4 s for the longest, and nothing unread is lost.
 */
export const URGENT_READ = 0.65;
/**
 * Pass i2 (both story reviewers: the station's wake line cut "A chair at the head..." after 3.9 of its 6 seconds and
 * the chair's second line came 9 s later behind two station lines; the watcher's pair was said between "Coats on pegs"
 * and "The low pegs were bare"; "IDENTIFY STATION." between the cradle's two lines). Two rules:
 *  - a line said with `read` (a polite urgent line) never takes a NARRATOR's or the Reeve's line down: it is the very
 *    next line. Over a station line or a hint it still cuts once that line has had its share.
 *  - a line and its continuation are one thing. The continuation of a key is the key with the same stem and another
 *    number (`nar_pegs_1` / `nar_pegs_2`, `nar_tally_chair` / `nar_tally_chair_2`, `nar_cradle` / `nar_cradle_2`).
 *    Nothing that is put "next in line" (front, now, a polite urgent line) goes between the line on screen and the
 *    `PAIR_KEEP` continuation(s) that wait behind it: they are moved to the head first. Only a line about this second
 *    (plain urgent: a wave) or her own act (over) still comes between them.
 */
export const PAIR_KEEP = 1;
export function stemOf(key: StoryKey): string { return key.replace(/_\d+$/, ''); }
/**
 * Lines that are not dropped for waiting beside story.json's `never_stale` list (the design data is frozen for the
 * world; docs/requests/world.md asks for the list to follow). Pass i2 held `nar_tally_cloth` here; pass i3 takes it out
 * again (UNKEPT below) and holds `nar_rule`, which waits for a look at the Rule.
 */
export const KEEP_ALSO: readonly StoryKey[] = ['nar_rule'];
/**
 * Pass i3 (both story reviewers: lines whose whole point is what is on screen were said many seconds later, somewhere
 * else; "The share-cloth hung in the light's way" 34 s after its cord had been shot, two rooms on at the line locker).
 *  - A PRESENT line (`StoryQueue.present`) is about the thing she is looking at this second (the watcher in its niche,
 *    the Windlass through the gantry's grille, the embers, the kneeler at the trough, the Rule against the thread): it
 *    is the very next line, ahead of everything that only waits, the continuation of the line on screen included
 *    (`part`), and it takes a station line or a hint that has been read off the screen. Its owner gives it an `unless`
 *    rule, so it is dropped unheard when its subject is behind her by the time its turn comes.
 *  - `UNKEPT`: lines story.json's `never_stale` names that are bound to a place after all: they go stale like any
 *    other (the design data is frozen for the world in this pass; docs/requests/world.md asks for the list to follow).
 *    The cloth's line is said while the light lies on the cloth, or not at all.
 *  - `nar_rule` joins `KEEP_ALSO`: it waits for a look at the Rule (director.ts RULE_COS) instead of going stale behind
 *    the camp's lines, and is dropped when she leaves the gully without one.
 */
export const UNKEPT: readonly StoryKey[] = ['nar_tally_cloth'];
/**
 * Pass i3 (ruling R2; story reviewer b): a hint line the world has just said itself (`StoryApi.mute`) is not said again
 * by another system for `HINT_ECHO` seconds: the Windlass repeats `hint_boss_haul` at its first haul of the same try.
 */
export const HINT_ECHO = 40;
/**
 * Pass i4 (GDD 23.18; the regression review's major and both story reviewers).
 *  - A hint line is never lost behind a line that only waits (`wait`: the Rule's line waits for a look north, and for
 *    as long as it did every worded hint of the jug gate was dropped as "the queue is busy"). For a hint the queue is
 *    free when nothing is on screen and everything in line is waiting on its subject (`hintFree`).
 *  - A PRESENT line also takes a NARRATOR's line down once that line has had `PRESENT_READ` of its hold (the watcher was
 *    named 2.3 s after the look and its line was still up at the proving plate): never a line the story stands on, never
 *    a line that was itself said of what she looked at, never its own first half.
 *  - `open` (the first line of a scene another system runs: the Windlass's asking) may take ANY narrator's line down
 *    at that share, one the story stands on too, unless that line's continuation is still to come (a pair is one unit).
 *  - Paired lines are one unit (`Story.orphan`): when a narrator's line is dropped unheard, the continuation(s) of it
 *    that the story does not stand on are dropped with it, waiting or asked for later ("He had not turned them on
 *    her..." was said 78 s in, its first half having gone stale).
 *  - A line whose subject is gone (`unless`) is dropped although it also waits (`waitWhile`): the Rule's line sat in the
 *    queue for the rest of the run of a player who left the gully without looking north.
 *  - A station line of `REPEAT_REST` is not said again within its seconds, whoever asks (the Windlass said two refill
 *    lines sixteen times in eighty seconds of phase 3a, and no worded hint could be said under them).
 */
export const PRESENT_READ = 0.6;
export const REPEAT_REST: Readonly<Record<StoryKey, number>> = { stn_boss_refilled: 20, stn_boss_head_dry_refilling: 20 };
interface Entry { key: StoryKey; at: number; lead: number; scope: string; alt: string; urgent: boolean; read: number; present: boolean; force: boolean }
export interface QueueOptions {
  /** a line that is never dropped for waiting (default: none is) */
  keep?: (key: StoryKey) => boolean;
  /** a line was dropped because it had gone stale, or was flushed: it will not be said */
  onDrop?: (key: StoryKey) => void;
  staleSeconds?: number;
  staleSecondsLeft?: number;
  /**
   * asked when a line reaches the head of the queue: true = what it is about is over (the fight it announces is
   * cleared), and it is dropped unheard like a stale one, whatever `keep` says
   */
  moot?: (key: StoryKey) => boolean;
  /**
   * asked when a line's turn comes: true = not now (what it is about is not in her view); it keeps its place and the
   * lines behind it go ahead (polish round 4: the rim's scenery lines were said while she was bent over the stone)
   */
  wait?: (key: StoryKey) => boolean;
}

/**
 * The line queue. One line on screen, at most MAX_WAITING waiting behind it. A hint is dropped when anything is on
 * screen or waiting; a station line is dropped when four are waiting (it may repeat); a narrator or Reeve line plays
 * once and is story: when four are waiting it stands in a backlog that feeds the queue. A line that has waited too
 * long for its turn is stale and is dropped unheard (never the load-bearing ones): `scope` is where she is, and a line
 * said somewhere she has left goes stale sooner.
 */
export class StoryQueue {
  current: StoryKey = '';
  /** ticks the current line still holds */
  left = 0;
  private gap = 0;
  /** waiting, then backlog: one list, oldest first (pooled entries) */
  private readonly items: Entry[] = [];
  private n = 0;
  /** how many of the lines at the head were put there by front(): the next front line stands behind them, in order */
  private fronts = 0;
  /** how many of those were put there by urgent(): they stand first, in their order */
  private urgents = 0;
  /** the line on screen was said by urgent(): another urgent line waits for it (URGENT_HOLD) instead of cutting it */
  private urgentNow = false;
  /** the line on screen was said by present() or open(): another present line waits for it instead of cutting it */
  private presentNow = false;
  /** ticks the current line was given when it started */
  private total = 0;
  /** the line that was on screen last (its continuation is still its pair during the breath after it) */
  private last: StoryKey = '';
  /** the most the queue has ever held waiting (tests) */
  peak = 0;
  /** where she is now (the zone): the caller keeps it current */
  scope = '';
  /** lines dropped stale since the last reset (tests) */
  stale = 0;
  private now_ = 0;
  private batchAt = -1;
  private batchLead = 0;
  private readonly keep: (key: StoryKey) => boolean;
  private readonly onDrop: (key: StoryKey) => void;
  private readonly moot: (key: StoryKey) => boolean;
  private readonly wait: (key: StoryKey) => boolean;
  private readonly staleTicks: number;
  private readonly staleTicksLeft: number;

  constructor(
    private readonly seconds: (key: StoryKey) => number,
    private readonly played: (key: StoryKey) => boolean,
    private readonly onStart: (key: StoryKey) => void,
    private readonly onEnd: (key: StoryKey) => void,
    options: QueueOptions = {},
  ) {
    for (let i = 0; i < MAX_WAITING + BACKLOG; i++) this.items.push({ key: '', at: 0, lead: 0, scope: '', alt: '', urgent: false, read: 0, present: false, force: false });
    this.keep = options.keep ?? (() => false);
    this.onDrop = options.onDrop ?? (() => {});
    this.moot = options.moot ?? (() => false);
    this.wait = options.wait ?? (() => false);
    this.staleTicks = Math.round((options.staleSeconds ?? STALE_SECONDS) * TICKS_PER_SECOND);
    this.staleTicksLeft = Math.round((options.staleSecondsLeft ?? STALE_SECONDS_LEFT) * TICKS_PER_SECOND);
  }

  /** lines waiting to be next (at most MAX_WAITING) and standing behind them */
  get count(): number { return this.n < MAX_WAITING ? this.n : MAX_WAITING; }
  get backlogCount(): number { return this.n > MAX_WAITING ? this.n - MAX_WAITING : 0; }
  /** the i-th key in line (0 = next), waiting and backlog alike */
  keyAt(i: number): StoryKey { return i >= 0 && i < this.n ? (this.items[i] as Entry).key : ''; }
  get length(): number { return this.n; }
  /** the waiting keys, next first (a copy: tests and debug) */
  get waiting(): StoryKey[] { const out: StoryKey[] = []; for (let i = 0; i < this.count; i++) out.push((this.items[i] as Entry).key); return out; }

  get idle(): boolean { return this.current === '' && this.n === 0; }
  /** pass i4: free for a hint: nothing on screen, and everything in line is waiting for its subject to come into view */
  get hintFree(): boolean {
    if (this.current !== '') return false;
    for (let i = 0; i < this.n; i++) if (!this.wait((this.items[i] as Entry).key)) return false;
    return true;
  }
  holds(key: StoryKey): boolean {
    if (this.current === key) return true;
    for (let i = 0; i < this.n; i++) if ((this.items[i] as Entry).key === key) return true;
    return false;
  }
  private refuse(key: StoryKey): boolean { return lineClass(key) === 'nar' && (this.played(key) || this.holds(key)); }
  private ticksOf(key: StoryKey): number { return Math.max(1, Math.round(this.seconds(key) * TICKS_PER_SECOND)); }
  /** insert at index i (the entries from i on move back one); false when the list is full */
  private insert(i: number, key: StoryKey, lead: number, scope: string, urgent = false): boolean {
    if (this.n >= this.items.length) return false;
    const spare = this.items[this.n] as Entry;
    for (let k = this.n; k > i; k--) this.items[k] = this.items[k - 1] as Entry;
    spare.key = key; spare.at = this.now_; spare.lead = lead; spare.scope = scope; spare.urgent = urgent; spare.read = 0; spare.alt = ''; spare.present = false; spare.force = false;
    this.items[i] = spare;
    this.n++;
    const c = this.count;
    if (c > this.peak) this.peak = c;
    return true;
  }
  private removeAt(i: number): void {
    const e = this.items[i] as Entry;
    if (i < this.fronts) this.fronts--;
    if (i < this.urgents) this.urgents--;
    for (let k = i; k < this.n - 1; k++) this.items[k] = this.items[k + 1] as Entry;
    this.n--;
    this.items[this.n] = e;
    e.key = '';
  }

  /**
   * `scope`: the place the line is about (default: where she is). `alt`: a second place it is as much about (pass i1:
   * a trigger on the seam between two sets is said in the zone she stands in and is about the one she is walking into;
   * the peg stair's lines went stale four seconds after the zone changed under her)
   */
  say(key: StoryKey, scope: string = this.scope, alt = ''): SayResult {
    if (this.refuse(key)) return 'dropped';
    const cls = lineClass(key);
    if (cls === 'hint' && !this.hintFree) return 'dropped';
    const full = this.n >= MAX_WAITING;
    // (p0: a station line the story stands on, `keep`, stands in the backlog like a narrator's: "SURFACE STAFF: ELEVEN,
    // SEATED." was lost to a brisk player because four room lines were waiting when the day-cell woke)
    if (full && cls !== 'nar' && !key.startsWith('rv_') && !this.keep(key)) return 'dropped';
    // lines said on one tick are one batch: each may wait, beside its own allowance, for the ones said before it
    if (this.batchAt !== this.now_) { this.batchAt = this.now_; this.batchLead = 0; }
    const lead = this.batchLead;
    if (!this.insert(this.n, key, lead, scope)) return 'dropped';
    (this.items[this.n - 1] as Entry).alt = alt;
    this.batchLead += this.ticksOf(key) + GAP_TICKS;
    return full ? 'backlog' : 'queued';
  }
  /**
   * Next in line: ahead of everything that is only waiting, behind the lines front() put there before it (two moments
   * one after the other are told in their order). What it pushes out of the four stands at the head of the backlog.
   */
  front(key: StoryKey, scope: string = this.scope): SayResult {
    if (this.refuse(key)) return 'dropped';
    this.promotePair();
    if (!this.insert(this.fronts, key, 0, scope)) return 'dropped';
    this.fronts++;
    return 'queued';
  }
  /**
   * Pass i3, a PRESENT line (UNKEPT above): about what she is looking at now. On screen at once when nothing is, or over
   * a station line or a hint that has had URGENT_READ of its time; else the very next line, behind the urgent and the
   * present lines asked for before it and ahead of everything else. `part` (the default): ahead of the continuation of
   * the line on screen too (the watcher is said between "Coats on pegs" and "The low pegs were bare", while she looks
   * at it); false: behind that continuation (a pair is heard out first).
   */
  present(key: StoryKey, scope: string = this.scope, part = true, alt = ''): SayResult {
    if (this.refuse(key)) return 'dropped';
    const cur = this.current;
    if (cur === '' ? this.n === 0 || (this.gap === 0 && (part || !this.pairWaiting) && !this.headUrgent()) : (part || !this.pairWaiting) && this.presentCut(key, false)) {
      if (cur !== '') { this.current = ''; this.onEnd(cur); }
      this.gap = 0;
      this.begin(key, false, true);
      return 'queued';
    }
    if (!part) this.promotePair();
    const head = !part ? this.pairHead() : '';
    const stem = head !== '' ? stemOf(head) : null;
    let i = 0, kept = 0;
    while (i < this.n) {
      const e = this.items[i] as Entry;
      if (e.urgent || e.present) i++;
      else if (stem !== null && kept < PAIR_KEEP && stemOf(e.key) === stem) { i++; kept++; }
      else break;
    }
    if (!this.insert(i, key, 0, scope)) return 'dropped';
    (this.items[i] as Entry).present = true; (this.items[i] as Entry).alt = alt;
    if (i <= this.fronts) this.fronts++;
    if (i < this.urgents) this.urgents++;
    // what it stands in front of is not made stale by it: the time it takes is added to their allowance
    const took = this.ticksOf(key) + GAP_TICKS;
    for (let k = i + 1; k < this.n; k++) (this.items[k] as Entry).lead += took;
    return 'queued';
  }
  /**
   * Pass i4, the first line of a scene another system runs (the asking). Nothing on screen, or a station line or a hint:
   * at once, as `now`. A narrator's line: over it once it has had PRESENT_READ of its hold, whatever line it is; while
   * its continuation is still to come, behind that pair as `front` puts it.
   */
  open(key: StoryKey, scope: string = this.scope): SayResult {
    if (this.refuse(key)) return 'dropped';
    const cur = this.current;
    if (cur === '' || lineClass(cur) !== 'nar') return this.now(key);
    if (this.pairWaiting) return this.front(key, scope);
    if (this.presentCut(key, true)) {
      this.current = ''; this.onEnd(cur);
      this.gap = 0;
      this.begin(key, false, true);
      return 'queued';
    }
    if (!this.insert(0, key, 0, scope)) return 'dropped';
    const e = this.items[0] as Entry;
    e.present = true; e.force = true;
    this.fronts++;
    if (this.urgents > 0) this.urgents++;
    return 'queued';
  }
  /**
   * A line about what she is looking at (or, with `force`, the opening of a scene) takes the line on screen down: a
   * station line or a hint as a polite urgent line does; a narrator's once it has had PRESENT_READ of its hold, unless
   * the story stands on it (`force`: even then), it was itself said of something looked at, or it is this line's own
   * first half. Never the Reeve's line, and never a line in its last second.
   */
  private presentCut(key: StoryKey, force: boolean): boolean {
    const cur = this.current;
    if (cur === '' || cur.startsWith('rv_')) return false;
    if (lineClass(cur) !== 'nar') return this.politeCut(URGENT_READ);
    if (this.presentNow || stemOf(cur) === stemOf(key)) return false;
    if (this.left <= URGENT_SPARE * TICKS_PER_SECOND) return false;
    if (!force && this.keep(cur)) return false;
    const had = this.total - this.left;
    if (this.urgentNow && had < URGENT_HOLD * TICKS_PER_SECOND) return false;
    return had >= PRESENT_READ * this.total;
  }
  /** an urgent or a present line is already waiting to be next */
  private headUrgent(): boolean { const e = this.items[0] as Entry; return this.n > 0 && (e.urgent || e.present); }
  /** the line whose continuation must not be parted from it: the one on screen, or the one just over (the breath) */
  private pairHead(): StoryKey { return this.current !== '' ? this.current : this.gap > 0 ? this.last : ''; }
  /** a continuation of the line on screen (or just over) is waiting */
  get pairWaiting(): boolean {
    const head = this.pairHead();
    if (head === '') return false;
    const stem = stemOf(head);
    for (let i = 0; i < this.n; i++) if (stemOf((this.items[i] as Entry).key) === stem) return true;
    return false;
  }
  /**
   * PAIR_KEEP: the continuation(s) of the line on screen stand at the very head of the line, ahead of the urgent and
   * the front lines that wait (they count as both from here, so what is put next goes behind them).
   */
  private promotePair(): void {
    const head = this.pairHead();
    if (head === '' || lineClass(head) === 'hint') return;
    const stem = stemOf(head);
    let c = 0;
    for (let i = 0; i < this.n && c < PAIR_KEEP; i++) {
      const e = this.items[i] as Entry;
      if (stemOf(e.key) !== stem) continue;
      for (let k = i; k > c; k--) this.items[k] = this.items[k - 1] as Entry;
      this.items[c] = e;
      if (i >= this.fronts) this.fronts++;
      if (i >= this.urgents) this.urgents++;
      c++;
    }
  }
  /**
   * About this second (URGENT_SPARE above): on screen at once when nothing is, or over a line that may be cut; else the
   * very next line, ahead of everything waiting and behind the urgent lines asked for before it.
   */
  urgent(key: StoryKey, scope: string = this.scope, read = 0): SayResult {
    if (this.refuse(key)) return 'dropped';
    const cur = this.current;
    const polite = read > 0;
    // (pass i2) a polite line never parts a pair, and never takes a narrator's line down
    const free = cur === '' ? !(polite && this.pairWaiting) : polite ? this.politeCut(read) : this.mayCut();
    if (free) {
      if (cur !== '') { this.current = ''; this.onEnd(cur); }
      this.gap = 0;
      this.begin(key, true);
      return 'queued';
    }
    if (polite) this.promotePair();
    if (!this.insert(this.urgents, key, 0, scope, true)) return 'dropped';
    (this.items[this.urgents] as Entry).read = read;
    this.urgents++; this.fronts++;
    return 'queued';
  }
  /** the line on screen makes way for an urgent one: not one the story stands on, not in its last second, and an urgent one only once it has had URGENT_HOLD */
  private mayCut(): boolean {
    if (this.keep(this.current) || this.left <= URGENT_SPARE * TICKS_PER_SECOND) return false;
    return !this.urgentNow || this.total - this.left >= URGENT_HOLD * TICKS_PER_SECOND;
  }
  /** a polite urgent line (`read`) may take the line on screen down: a station line or a hint that has had its share */
  private politeCut(read: number): boolean {
    const cur = this.current;
    if (lineClass(cur) === 'nar' || cur.startsWith('rv_')) return false;
    return this.mayCut() && this.total - this.left >= read * this.total;
  }
  /** On screen at once when the screen holds nothing a player must not lose (nothing, a station line, a hint); else next. */
  now(key: StoryKey): SayResult {
    if (this.refuse(key)) return 'dropped';
    if (this.current !== '' && lineClass(this.current) === 'nar') return this.front(key);
    if (this.current === '' && this.pairWaiting) return this.front(key);      // (pass i2: not in the breath between a pair)
    if (this.current !== '') { const was = this.current; this.current = ''; this.onEnd(was); }
    this.gap = 0;
    this.begin(key);
    return 'queued';
  }
  private begin(key: StoryKey, urgent = false, present = false): void {
    this.urgentNow = urgent;
    this.presentNow = present;
    this.current = key;
    this.left = this.total = this.ticksOf(key);
    this.onStart(key);
  }
  private isStale(e: Entry): boolean {
    if (this.keep(e.key)) return false;
    const waited = this.now_ - e.at - e.lead;
    return waited > (e.scope === this.scope || e.alt === this.scope ? this.staleTicks : this.staleTicksLeft);
  }
  tick(): void {
    this.now_++;
    if (this.current !== '') {
      // an urgent line is waiting behind an urgent line that has had its time
      // (pass i1: or behind a line that has been up as long as the urgent one said it would wait, URGENT_READ)
      // (pass i2: a continuation moved to the head, PAIR_KEEP, is not urgent itself: it waits its turn, and what is
      // urgent behind it waits with it; a polite line waits a narrator's line out)
      const head = this.urgents > 0 ? this.items[0] as Entry : null;
      if (head && head.urgent && this.left > 1 && this.mayCut() && (this.urgentNow || (head.read > 0 && this.politeCut(head.read))) && !this.wait(head.key)) {
        const e = this.items[0] as Entry, key = e.key, was = this.current;
        const stale = this.moot(key);
        this.removeAt(0);
        if (stale) { this.stale++; this.onDrop(key); return; }
        this.current = ''; this.onEnd(was);
        this.begin(key, true);
        return;
      }
      // (pass i4) a present line is waiting to be next behind a narrator's line that has had its share (PRESENT_READ)
      const ph = this.n > 0 ? this.items[0] as Entry : null;
      if (ph && ph.present && !ph.urgent && this.left > 1 && !(ph.force && this.pairWaiting) && this.presentCut(ph.key, ph.force) && !this.wait(ph.key)) {
        const key = ph.key, was = this.current;
        const stale = this.moot(key);
        this.removeAt(0);
        if (stale) { this.stale++; this.onDrop(key); return; }
        this.current = ''; this.onEnd(was);
        this.begin(key, false, true);
        return;
      }
      if (--this.left > 0) return;
      const was = this.current;
      this.current = '';
      this.gap = GAP_TICKS;
      this.last = was;
      this.onEnd(was);
      return;
    }
    if (this.gap > 0) { this.gap--; return; }
    let i = 0;
    while (i < this.n) {
      const e = this.items[i] as Entry;
      const key = e.key;
      // a line that waits for its subject to be in view keeps its place; the next one goes ahead
      // (pass i4: unless what it is about is gone for good: then it is dropped, waiting or not)
      // (and it does not grow stale while it waits: its time to be said counts from when its subject comes into view)
      const away = this.wait(key);
      if (away && !this.moot(key)) { e.at = this.now_; e.lead = 0; i++; continue; }
      const stale = away || this.isStale(e) || this.moot(key);
      const urgent = e.urgent, present = e.present;
      this.removeAt(i);
      // (the scan starts over: a drop may take the line's continuation out of the list with it)
      if (stale) { this.stale++; this.onDrop(key); i = 0; continue; }
      this.begin(key, urgent, present);
      return;
    }
  }
  /**
   * On screen at once, whatever the screen holds: the line that answers her own act (the band broken with her thumb)
   * cuts the line that was asking for it. The line cut counts as said.
   */
  over(key: StoryKey): SayResult {
    if (this.refuse(key)) return 'dropped';
    if (this.current !== '') { const was = this.current; this.current = ''; this.onEnd(was); }
    this.gap = 0;
    this.begin(key);
    return 'queued';
  }
  /** `key` is not said (waiting: dropped unheard) or no longer (on screen: cut): what it is about is behind her */
  drop(key: StoryKey): void {
    for (let i = this.n - 1; i >= 0; i--) if ((this.items[i] as Entry).key === key) { this.removeAt(i); this.onDrop(key); }
    if (this.current === key) { this.current = ''; this.gap = GAP_TICKS; this.onEnd(key); }
  }
  /**
   * Pass i4: behind the last waiting line of `set` (a readable's lines that are being heard out), ahead of whatever
   * else waits; with none of them waiting it is `front`.
   */
  behind(key: StoryKey, set: readonly StoryKey[], scope: string = this.scope): SayResult {
    if (this.refuse(key)) return 'dropped';
    let at = -1;
    for (let i = 0; i < this.n; i++) if (set.includes((this.items[i] as Entry).key)) at = i;
    if (at < 0) return this.front(key, scope);
    if (!this.insert(at + 1, key, 0, scope)) return 'dropped';
    if (at + 1 <= this.fronts) this.fronts++;
    if (at + 1 < this.urgents) this.urgents++;
    return 'queued';
  }
  /** `key` is dropped unheard if it is waiting; a line on screen is left alone */
  dropWaiting(key: StoryKey): void {
    for (let i = this.n - 1; i >= 0; i--) if ((this.items[i] as Entry).key === key) { this.removeAt(i); this.onDrop(key); }
  }
  /** `key` leaves the line if it is waiting, as if it had never been asked for: it can be said again at a better moment */
  defer(key: StoryKey): void {
    for (let i = this.n - 1; i >= 0; i--) if ((this.items[i] as Entry).key === key) this.removeAt(i);
  }
  /** Drop everything that has not started, except what `spare` keeps (the ending: only the stone's lines go on). */
  flush(spare: (key: StoryKey) => boolean): void {
    for (let i = this.n - 1; i >= 0; i--) {
      const key = (this.items[i] as Entry).key;
      if (spare(key)) continue;
      this.removeAt(i);
      this.onDrop(key);
    }
  }
  /** the backlog, oldest first (a save) */
  eachBacklog(out: string[]): void { for (let i = MAX_WAITING; i < this.n; i++) out.push((this.items[i] as Entry).key); }
  clear(): void {
    const was = this.current;
    this.current = ''; this.left = 0; this.gap = 0;
    for (let i = 0; i < this.n; i++) (this.items[i] as Entry).key = '';
    this.n = 0; this.fronts = 0; this.urgents = 0; this.urgentNow = false; this.presentNow = false; this.last = '';
    this.batchAt = -1;
    if (was !== '') this.onEnd(was);
  }
}

/** Captions: 2 s, the same key not again within 4 s, never behind a line. `allow` returns whether to show it at `now` seconds. */
export class CaptionGuard {
  private readonly last = new Map<StoryKey, number>();
  constructor(keys: readonly StoryKey[]) { for (const k of keys) this.last.set(k, -1e9); }
  allow(key: StoryKey, now: number): boolean {
    const t = this.last.get(key);
    if (t === undefined) return false;
    if (now - t < CAPTION_REPEAT) return false;
    this.last.set(key, now);
    return true;
  }
  reset(): void { for (const k of this.last.keys()) this.last.set(k, -1e9); }
}

class Story implements StoryApi {
  private readonly queue: StoryQueue;
  private readonly captions: CaptionGuard;
  private readonly finishedKeys = new Set<StoryKey>();
  /**
   * Every line and card that has started in this run. Run-scoped: a restore rolls the saved flags back to the
   * checkpoint, but what she has heard she has heard ("every nar_* key at most once per run" survives a death).
   */
  private readonly heardKeys = new Set<StoryKey>();
  /** a hint line that found the queue busy: said as soon as it is idle (a tier is reached once and must not be lost) */
  private heldHint: StoryKey = '';
  // cards: one at a time, each once per run
  private readonly cards: StoryKey[] = [];
  private cardLeft = 0;
  private ticks = 0;
  private readonly linePayload: GameEvents['story/line'] = { key: '', speaker: 'narrator', text: '', seconds: 0 };
  private readonly endPayload: GameEvents['story/line_end'] = { key: '' };
  private readonly cardPayload: GameEvents['story/card'] = { key: '', text: '', seconds: 0 };
  private readonly captionPayload: GameEvents['story/caption'] = { key: '', text: '', seconds: CAPTION_HOLD };
  private readonly objectivePayload: GameEvents['objective/changed'] = { key: '', text: '' };

  constructor(private readonly s: State) {
    const lines = s.ctx.data.story.lines;
    const rules = s.ctx.data.story.meta.rules as unknown as { never_stale?: string[] };
    const named = Array.isArray(rules.never_stale) ? new Set(rules.never_stale) : null;
    this.named = named;
    this.queue = new StoryQueue(
      (key) => this.holdOf.get(key) ?? lines[key]?.seconds ?? 2,
      (key) => s.flags.has(key) || this.heardKeys.has(key) || this.orphan(key),
      (key) => this.start(key),
      (key) => this.end(key),
      {
        keep: (key) => !UNKEPT.includes(key) && ((named ? named.has(key) : neverStale(key)) || lateOk(key) || KEEP_ALSO.includes(key)), onDrop: (key) => this.dropped(key), moot: (key) => this.isMoot(key),
        wait: (key) => this.isWaiting(key),
      },
    );
    this.captions = new CaptionGuard(Object.keys(lines).filter((k) => lines[k]?.speaker === 'caption'));
    // (a line the world has taken says nothing when another system asks for it: the world says it at its own moment)
    s.ctx.events.on('story/say', (e) => {
      if (this.taken.has(e.key)) return;
      const muted = this.mutedUntil.get(e.key);
      if (muted !== undefined && this.ticks < muted) return;
      if (!this.opens.has(e.key)) { this.say(e.key); return; }
      // (pass i2, `opening`) the first line of a scene another system runs: what was only waiting and is not story is let go
      this.queue.flush((key) => this.keeps(key) || key.startsWith('rv_'));
      this.heldHint = '';
      // (pass i4, GDD 23.18) ... and it takes a narrator's line about the room behind her down once that has been read
      if (this.known(e.key)) { this.queue.scope = this.s.zone; this.queue.open(e.key); }
    });
  }
  /** pass i2: seconds a line is held on screen when not story.json's (`hold`) */
  private readonly holdOf = new Map<StoryKey, number>();
  hold(key: StoryKey, seconds: number): void { if (key !== '' && seconds > 0) this.holdOf.set(key, seconds); }
  private readonly opens = new Set<StoryKey>();
  opening(key: StoryKey): void { if (key !== '') this.opens.add(key); }
  private readonly taken = new Set<StoryKey>();
  take(key: StoryKey): void { if (key !== '') this.taken.add(key); }
  /** pass i3: hint lines the world has said itself, and the tick until which another system's asking for them is ignored */
  private readonly mutedUntil = new Map<StoryKey, number>();
  mute(key: StoryKey, seconds: number): void { if (key !== '') this.mutedUntil.set(key, this.ticks + Math.round(seconds * TICKS_PER_SECOND)); }
  sayPresent(key: StoryKey, part = true, alsoZone = ''): void { if (key !== '' && this.known(key)) { this.queue.scope = this.s.zone; this.queue.present(key, this.s.zone, part, alsoZone); } }
  /** lines that wait while their subject is out of her view (waitWhile) */
  private readonly waitWhen = new Map<StoryKey, () => boolean>();
  waitWhile(key: StoryKey, away: () => boolean): void { if (key !== '') this.waitWhen.set(key, away); }
  private isWaiting(key: StoryKey): boolean { const away = this.waitWhen.get(key); return away !== undefined && away(); }
  sayOver(key: StoryKey): void { if (this.known(key)) { this.queue.scope = this.s.zone; this.queue.over(key); } }
  sayBehind(key: StoryKey, set: readonly StoryKey[]): void { if (key !== '' && this.known(key)) { this.queue.scope = this.s.zone; this.queue.behind(key, set); } }
  /**
   * Pass i4: a hint line that must not be lost under another system's talk (the kept round's ladder under the
   * Windlass's refill lines). Said at once when the queue is free for a hint; else it is the very next line, and takes a
   * station line or another hint down once that has been read (URGENT_READ). Never a narrator's line.
   */
  sayHint(key: StoryKey): void {
    if (key === '' || !this.known(key)) return;
    this.queue.scope = this.s.zone;
    if (this.queue.holds(key)) return;
    if (this.queue.hintFree) { this.queue.say(key); return; }
    this.queue.urgent(key, this.s.zone, URGENT_READ);
  }
  /**
   * Pass i4, paired lines are one unit: the narrator's lines dropped unheard in this run, and whether `key` is the
   * continuation of one of them (the key with the same stem and the next number: `nar_tally_chair_2` after
   * `nar_tally_chair`, `nar_tally_3` after `nar_tally_2`). Such a line counts as told and is not said. Never a line the
   * story stands on, and never one that may come late (`lateOk`: the rim's).
   */
  private readonly unheard = new Set<StoryKey>();
  private before(key: StoryKey): StoryKey {
    const m = /^(nar_.*)_(\d+)$/.exec(key);
    if (!m) return '';
    const n = Number(m[2]), lines = this.s.ctx.data.story.lines;
    if (n < 2) return '';
    const prev = (m[1] as string) + '_' + (n - 1);
    if (lines[prev] !== undefined) return prev;
    return n === 2 && lines[m[1] as string] !== undefined ? (m[1] as string) : '';
  }
  private orphan(key: StoryKey): boolean {
    if (this.unheard.size === 0) return false;
    const prev = this.before(key);
    if (prev === '' || !this.unheard.has(prev) || this.keeps(key) || lateOk(key)) return false;
    if (!this.unheard.has(key)) this.dropped(key);
    return true;
  }
  drop(key: StoryKey): void { if (key !== '') this.queue.drop(key); }
  defer(key: StoryKey): void { if (key !== '') this.queue.defer(key); }
  flushWhere(spare: (key: StoryKey) => boolean): void { this.heldHint = ''; this.queue.flush(spare); }

  private readonly named: Set<string> | null;
  /** lines that are dropped when their turn comes if what they are about is over (unless) */
  private readonly mootWhen = new Map<StoryKey, () => boolean>();
  unless(key: StoryKey, over: () => boolean): void { if (key !== '') this.mootWhen.set(key, over); }
  private isMoot(key: StoryKey): boolean { const over = this.mootWhen.get(key); return over !== undefined && over(); }
  /** a hint line a restore cut off before it had been said to its end: said again after the restore */
  private resay: StoryKey = '';
  keeps(key: StoryKey): boolean { return !UNKEPT.includes(key) && ((this.named ? this.named.has(key) : neverStale(key)) || KEEP_ALSO.includes(key)); }
  heard(key: StoryKey): boolean { return this.heardKeys.has(key) || this.s.flags.has(key); }
  holds(key: StoryKey): boolean { return this.queue.holds(key); }
  get current(): StoryKey { return this.queue.current; }
  get idle(): boolean { return this.queue.idle; }
  get cardUp(): boolean { return this.cardLeft > 0 || this.cards.length > 0; }
  /** pass i4: the card on screen ('' when none), and how many wait behind it */
  private cardNow: StoryKey = '';
  get cardKey(): StoryKey { return this.cardLeft > 0 ? this.cardNow : ''; }
  get cardsWaiting(): number { return this.cards.length; }
  /** pass i4: a card that has been shown is shown once more (a run taken up again from the title: its movement's card) */
  recard(key: StoryKey): void {
    if (key === '' || !this.known(key) || this.s.ctx.data.story.lines[key]?.speaker !== 'card' || this.cards.includes(key)) return;
    this.s.flags.delete(key); this.heardKeys.delete(key);
    this.cards.push(key);
  }
  played(key: StoryKey): boolean { return this.s.flags.has(key); }
  finished(key: StoryKey): boolean { return this.finishedKeys.has(key) || (this.s.flags.has(key) && !this.queue.holds(key)); }

  private known(key: StoryKey): boolean {
    if (this.s.ctx.data.story.lines[key]) return true;
    if (!this.unknown.has(key)) { this.unknown.add(key); console.error(`[world] story: '${key}' is not a key of design/story.json`); }
    return false;
  }
  private readonly unknown = new Set<string>();

  /** `zone`: the place the line is about, when its marker knows (a trigger's own zone); else where she is now */
  say(key: StoryKey, zone?: string, alsoZone?: string): void {
    if (!this.known(key)) return;
    const line = this.s.ctx.data.story.lines[key];
    if (!line) return;
    if (line.speaker === 'card') { this.card(key); return; }
    if (line.speaker === 'caption') { this.caption(key); return; }
    this.queue.scope = this.s.zone;                     // (the zone is brought up to date before anything speaks in a tick)
    if (this.queue.say(key, zone ?? this.s.zone, alsoZone ?? '') === 'dropped' && lineClass(key) === 'hint') this.heldHint = key;
  }
  cancelHint(): void { this.heldHint = ''; this.resay = ''; }
  /** what is waiting but has not started (lines, then cards): a save keeps it so a restore can say it again */
  queued(out: string[]): void {
    const q = this.queue;
    for (let i = 0; i < q.length; i++) out.push(q.keyAt(i));
    for (const c of this.cards) out.push(c);
  }
  /**
   * After a restore has put the saved flags back: what was heard in this run stays heard, and what the save held
   * waiting (flags `q:<nn>:<key>`, in order) is queued again unless it has been heard since.
   */
  restored(): void {
    const { s } = this;
    const again: string[] = [];
    for (const f of s.flags) if (f.startsWith(QUEUED)) again.push(f);
    again.sort();
    for (const f of again) {
      s.flags.delete(f);
      const key = f.slice(f.indexOf(':', QUEUED.length) + 1);
      if (!this.heardKeys.has(key) && !s.flags.has(key)) this.say(key);
    }
    for (const key of this.heardKeys) if (key.startsWith('nar_') || s.ctx.data.story.lines[key]?.speaker === 'card') s.flags.add(key);
    // a hint tier is reached once: the line a death cut off (or that was still waiting for a quiet moment) is said again
    if (this.resay !== '') { const key = this.resay; this.resay = ''; this.say(key); }
  }
  /** a debug warp is another timeline: nothing has been heard */
  forget(): void { this.heardKeys.clear(); this.finishedKeys.clear(); this.unheard.clear(); this.resay = ''; }
  sayFront(key: StoryKey): void { if (this.known(key)) { this.queue.scope = this.s.zone; this.queue.front(key); } }
  sayUrgent(key: StoryKey, read = 0): void { if (key !== '' && this.known(key)) { this.queue.scope = this.s.zone; this.queue.urgent(key, this.s.zone, read); } }
  /** several lines tied to one moment, next in line and in their order */
  sayFrontAll(keys: readonly StoryKey[]): void { for (let i = 0; i < keys.length; i++) this.sayFront(keys[i] as string); }
  flush(spare: readonly StoryKey[]): void { this.heldHint = ''; this.queue.flush((key) => spare.includes(key)); }
  /** nothing more is said: the end card is up (lines only; a card still to show stays) */
  silence(): void { this.heldHint = ''; this.queue.flush(() => false); }
  /**
   * A line that went stale waiting (or was flushed) is not said. A narrator line is story told once: it counts as told
   * (its flag is saved, so no other marker says it later somewhere stranger) and as finished (nothing waits on it).
   */
  private dropped(key: StoryKey): void {
    if (key.startsWith('nar_')) { this.s.flags.add(key); this.heardKeys.add(key); this.unheard.add(key); }
    this.finishedKeys.add(key);
    this.lastDropped = key;
    // (pass i4) its continuation that is waiting goes with it
    if (!key.startsWith('nar_')) return;
    const q = this.queue;
    for (let i = q.length - 1; i >= 0; i--) {
      const k = q.keyAt(i);
      if (k !== '' && k !== key && this.before(k) === key && !this.keeps(k) && !lateOk(k)) { q.dropWaiting(k); i = Math.min(i, q.length); }
    }
  }
  private lastDropped: StoryKey = '';
  sayNow(key: StoryKey): void { if (this.known(key)) { this.queue.scope = this.s.zone; this.queue.now(key); } }

  private start(key: StoryKey): void {
    const { s } = this;
    const line = s.ctx.data.line(key);
    if (key.startsWith('nar_')) s.flags.add(key);          // once per run, saved (not a visibility flag: no visDirty)
    this.heardKeys.add(key);
    this.unheard.delete(key);
    // (pass i4, REPEAT_REST) a station line that repeats is not said again for a while, whoever asks
    const rest = REPEAT_REST[key];
    if (rest !== undefined) this.mutedUntil.set(key, this.ticks + Math.round(rest * TICKS_PER_SECOND));
    const p = this.linePayload;
    p.key = key; p.speaker = line.speaker; p.seconds = this.holdOf.get(key) ?? line.seconds;
    // {n}: the one number the narrator counts, the lamps (GDD 4.4)
    p.text = line.text.includes('{n}') ? line.text.replace('{n}', countWord(lampCount(s.stats.freed), line.text.startsWith('{n}'))) : line.text;
    s.ctx.events.emit('story/line', p);
  }
  private end(key: StoryKey): void {
    this.finishedKeys.add(key);
    this.endPayload.key = key;
    this.s.ctx.events.emit('story/line_end', this.endPayload);
  }

  private card(key: StoryKey): void {
    const { s } = this;
    if (s.flags.has(key) || this.heardKeys.has(key) || this.cards.includes(key)) return;      // once per run
    this.cards.push(key);
  }
  private caption(key: StoryKey): void {
    const { s } = this;
    if (!s.ctx.options.value.captions) return;
    if (!this.captions.allow(key, this.ticks / TICKS_PER_SECOND)) return;
    const p = this.captionPayload;
    p.key = key; p.text = s.ctx.data.line(key).text; p.seconds = CAPTION_HOLD;
    s.ctx.events.emit('story/caption', p);
  }

  setObjective(key: StoryKey, announce = true): void {
    const { s } = this;
    // each objective is set by exactly one event, once per run (GDD 12.2): walking back through a trigger changes nothing
    if (key === '' || key === s.objective || s.flags.has('obj:' + key)) return;
    s.flags.add('obj:' + key);
    s.objective = key;
    if (!announce) return;
    const p = this.objectivePayload;
    p.key = key; p.text = s.ctx.data.story.objectives[key] ?? '';
    s.ctx.events.emit('objective/changed', p);
  }

  tick(): void {
    this.ticks++;
    this.queue.scope = this.s.zone;
    this.queue.tick();
    if (this.heldHint !== '' && this.queue.hintFree) { const key = this.heldHint; this.heldHint = ''; this.queue.say(key); }
    if (this.cardLeft > 0) { this.cardLeft--; return; }
    if (this.cards.length === 0) return;
    const key = this.cards.shift() as string;
    const { s } = this;
    const line = s.ctx.data.line(key);
    s.flags.add(key);
    this.heardKeys.add(key);
    const p = this.cardPayload;
    p.key = key; p.text = line.text; p.seconds = line.seconds;
    this.cardLeft = Math.round(line.seconds * TICKS_PER_SECOND);
    this.cardNow = key;
    s.ctx.events.emit('story/card', p);
  }

  reset(): void {
    this.clear();
    this.finishedKeys.clear();
    this.heardKeys.clear();
    this.captions.reset();
    this.queue.peak = 0; this.queue.stale = 0; this.lastDropped = '';
    this.resay = ''; this.mutedUntil.clear(); this.unheard.clear();
  }
  clear(): void {
    // (a restore: the hint on screen, waiting in line or held for a quiet moment has not been heard to its end)
    const q = this.queue;
    let cut = q.current !== '' && lineClass(q.current) === 'hint' ? q.current : '';
    for (let i = 0; i < q.length && cut === ''; i++) if (lineClass(q.keyAt(i)) === 'hint') cut = q.keyAt(i);
    if (cut === '') cut = this.heldHint;
    if (cut !== '') this.resay = cut;
    this.queue.clear();
    this.heldHint = '';
    this.cards.length = 0;
    this.cardLeft = 0;
  }
  debug(): Record<string, unknown> {
    return { current: this.queue.current, waiting: this.queue.waiting, backlog: this.queue.backlogCount, peak: this.queue.peak, cards: this.cards.slice(), stale: this.queue.stale, lastDropped: this.lastDropped };
  }
}

export function createStory(s: State): StoryApi { return new Story(s); }
