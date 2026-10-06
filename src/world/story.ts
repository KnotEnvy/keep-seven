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
  /^nar_(seven|plate_\d|cradle(_2)?|seal|office|kept|one_left|first_fell|first_seat|ask|lamps(_count)?|stone_\d|take_\d|leave|fire|last|not_for_firing|down_the_bore)$/,
  /^rv_/, /^stn_proven$/,
];
/**
 * Lines that may come late but are not load-bearing (polish round 3): the rim's own scenery lines. When she walks
 * straight to the stone its lines go ahead of them, and the line that says how far the Rule leans was lost to the 20 s
 * rule while she stood there with nothing being said. They are not `neverStale` (the ending spares only those when a
 * branch begins): a player who takes the round at once still loses them.
 */
export const LATE_OK: readonly RegExp[] = [/^nar_rim_\d$/];
export function lateOk(key: StoryKey): boolean {
  for (let i = 0; i < LATE_OK.length; i++) if ((LATE_OK[i] as RegExp).test(key)) return true;
  return false;
}
export function neverStale(key: StoryKey): boolean {
  for (let i = 0; i < NEVER_STALE.length; i++) if ((NEVER_STALE[i] as RegExp).test(key)) return true;
  return false;
}

interface Entry { key: StoryKey; at: number; lead: number; scope: string }
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
    for (let i = 0; i < MAX_WAITING + BACKLOG; i++) this.items.push({ key: '', at: 0, lead: 0, scope: '' });
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
  holds(key: StoryKey): boolean {
    if (this.current === key) return true;
    for (let i = 0; i < this.n; i++) if ((this.items[i] as Entry).key === key) return true;
    return false;
  }
  private refuse(key: StoryKey): boolean { return lineClass(key) === 'nar' && (this.played(key) || this.holds(key)); }
  private ticksOf(key: StoryKey): number { return Math.max(1, Math.round(this.seconds(key) * TICKS_PER_SECOND)); }
  /** insert at index i (the entries from i on move back one); false when the list is full */
  private insert(i: number, key: StoryKey, lead: number, scope: string): boolean {
    if (this.n >= this.items.length) return false;
    const spare = this.items[this.n] as Entry;
    for (let k = this.n; k > i; k--) this.items[k] = this.items[k - 1] as Entry;
    spare.key = key; spare.at = this.now_; spare.lead = lead; spare.scope = scope;
    this.items[i] = spare;
    this.n++;
    const c = this.count;
    if (c > this.peak) this.peak = c;
    return true;
  }
  private removeAt(i: number): void {
    const e = this.items[i] as Entry;
    if (i < this.fronts) this.fronts--;
    for (let k = i; k < this.n - 1; k++) this.items[k] = this.items[k + 1] as Entry;
    this.n--;
    this.items[this.n] = e;
    e.key = '';
  }

  /** `scope`: the place the line is about (default: where she is) */
  say(key: StoryKey, scope: string = this.scope): SayResult {
    if (this.refuse(key)) return 'dropped';
    const cls = lineClass(key);
    if (cls === 'hint' && !this.idle) return 'dropped';
    const full = this.n >= MAX_WAITING;
    if (full && cls !== 'nar' && !key.startsWith('rv_')) return 'dropped';
    // lines said on one tick are one batch: each may wait, beside its own allowance, for the ones said before it
    if (this.batchAt !== this.now_) { this.batchAt = this.now_; this.batchLead = 0; }
    const lead = this.batchLead;
    if (!this.insert(this.n, key, lead, scope)) return 'dropped';
    this.batchLead += this.ticksOf(key) + GAP_TICKS;
    return full ? 'backlog' : 'queued';
  }
  /**
   * Next in line: ahead of everything that is only waiting, behind the lines front() put there before it (two moments
   * one after the other are told in their order). What it pushes out of the four stands at the head of the backlog.
   */
  front(key: StoryKey, scope: string = this.scope): SayResult {
    if (this.refuse(key)) return 'dropped';
    if (!this.insert(this.fronts, key, 0, scope)) return 'dropped';
    this.fronts++;
    return 'queued';
  }
  /** On screen at once when the screen holds nothing a player must not lose (nothing, a station line, a hint); else next. */
  now(key: StoryKey): SayResult {
    if (this.refuse(key)) return 'dropped';
    if (this.current !== '' && lineClass(this.current) === 'nar') return this.front(key);
    if (this.current !== '') { const was = this.current; this.current = ''; this.onEnd(was); }
    this.gap = 0;
    this.begin(key);
    return 'queued';
  }
  private begin(key: StoryKey): void {
    this.current = key;
    this.left = this.ticksOf(key);
    this.onStart(key);
  }
  private isStale(e: Entry): boolean {
    if (this.keep(e.key)) return false;
    const waited = this.now_ - e.at - e.lead;
    return waited > (e.scope === this.scope ? this.staleTicks : this.staleTicksLeft);
  }
  tick(): void {
    this.now_++;
    if (this.current !== '') {
      if (--this.left > 0) return;
      const was = this.current;
      this.current = '';
      this.gap = GAP_TICKS;
      this.onEnd(was);
      return;
    }
    if (this.gap > 0) { this.gap--; return; }
    let i = 0;
    while (i < this.n) {
      const e = this.items[i] as Entry;
      const key = e.key;
      // a line that waits for its subject to be in view keeps its place; the next one goes ahead
      if (this.wait(key)) { i++; continue; }
      const stale = this.isStale(e) || this.moot(key);
      this.removeAt(i);
      if (stale) { this.stale++; this.onDrop(key); continue; }
      this.begin(key);
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
    this.n = 0; this.fronts = 0;
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
      (key) => lines[key]?.seconds ?? 2,
      (key) => s.flags.has(key) || this.heardKeys.has(key),
      (key) => this.start(key),
      (key) => this.end(key),
      {
        keep: (key) => (named ? named.has(key) : neverStale(key)) || lateOk(key), onDrop: (key) => this.dropped(key), moot: (key) => this.isMoot(key),
        wait: (key) => this.isWaiting(key),
      },
    );
    this.captions = new CaptionGuard(Object.keys(lines).filter((k) => lines[k]?.speaker === 'caption'));
    // (a line the world has taken says nothing when another system asks for it: the world says it at its own moment)
    s.ctx.events.on('story/say', (e) => { if (!this.taken.has(e.key)) this.say(e.key); });
  }
  private readonly taken = new Set<StoryKey>();
  take(key: StoryKey): void { if (key !== '') this.taken.add(key); }
  /** lines that wait while their subject is out of her view (waitWhile) */
  private readonly waitWhen = new Map<StoryKey, () => boolean>();
  waitWhile(key: StoryKey, away: () => boolean): void { if (key !== '') this.waitWhen.set(key, away); }
  private isWaiting(key: StoryKey): boolean { const away = this.waitWhen.get(key); return away !== undefined && away(); }
  sayOver(key: StoryKey): void { if (this.known(key)) { this.queue.scope = this.s.zone; this.queue.over(key); } }
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
  keeps(key: StoryKey): boolean { return this.named ? this.named.has(key) : neverStale(key); }
  heard(key: StoryKey): boolean { return this.heardKeys.has(key) || this.s.flags.has(key); }
  holds(key: StoryKey): boolean { return this.queue.holds(key); }
  get current(): StoryKey { return this.queue.current; }
  get idle(): boolean { return this.queue.idle; }
  played(key: StoryKey): boolean { return this.s.flags.has(key); }
  finished(key: StoryKey): boolean { return this.finishedKeys.has(key) || (this.s.flags.has(key) && !this.queue.holds(key)); }

  private known(key: StoryKey): boolean {
    if (this.s.ctx.data.story.lines[key]) return true;
    if (!this.unknown.has(key)) { this.unknown.add(key); console.error(`[world] story: '${key}' is not a key of design/story.json`); }
    return false;
  }
  private readonly unknown = new Set<string>();

  /** `zone`: the place the line is about, when its marker knows (a trigger's own zone); else where she is now */
  say(key: StoryKey, zone?: string): void {
    if (!this.known(key)) return;
    const line = this.s.ctx.data.story.lines[key];
    if (!line) return;
    if (line.speaker === 'card') { this.card(key); return; }
    if (line.speaker === 'caption') { this.caption(key); return; }
    this.queue.scope = this.s.zone;                     // (the zone is brought up to date before anything speaks in a tick)
    if (this.queue.say(key, zone ?? this.s.zone) === 'dropped' && lineClass(key) === 'hint') this.heldHint = key;
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
  forget(): void { this.heardKeys.clear(); this.finishedKeys.clear(); this.resay = ''; }
  sayFront(key: StoryKey): void { if (this.known(key)) { this.queue.scope = this.s.zone; this.queue.front(key); } }
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
    if (key.startsWith('nar_')) { this.s.flags.add(key); this.heardKeys.add(key); }
    this.finishedKeys.add(key);
    this.lastDropped = key;
  }
  private lastDropped: StoryKey = '';
  sayNow(key: StoryKey): void { if (this.known(key)) { this.queue.scope = this.s.zone; this.queue.now(key); } }

  private start(key: StoryKey): void {
    const { s } = this;
    const line = s.ctx.data.line(key);
    if (key.startsWith('nar_')) s.flags.add(key);          // once per run, saved (not a visibility flag: no visDirty)
    this.heardKeys.add(key);
    const p = this.linePayload;
    p.key = key; p.speaker = line.speaker; p.seconds = line.seconds;
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
    if (this.heldHint !== '' && this.queue.idle) { const key = this.heldHint; this.heldHint = ''; this.queue.say(key); }
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
    s.ctx.events.emit('story/card', p);
  }

  reset(): void {
    this.clear();
    this.finishedKeys.clear();
    this.heardKeys.clear();
    this.captions.reset();
    this.queue.peak = 0; this.queue.stale = 0; this.lastDropped = '';
    this.resay = '';
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
