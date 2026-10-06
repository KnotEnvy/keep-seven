// The synchronous event bus (ARCHITECTURE 3.5). emit() allocates nothing; in dev / test mode every event is
// also cloned into a ring of 4096 for window.__dbg.events().
import type { EventBus, EventName, GameEvents, LoggedEvent, Unsubscribe } from './contracts.ts';

type Handler = (payload: never) => void;
interface Slot { fn: Handler | null; once: boolean }

export const EVENT_RING = 4096;

export class EventBusImpl implements EventBus {
  private readonly slots = new Map<string, Slot[]>();
  private readonly reported = new WeakSet<Handler>();
  private depth = 0;
  private dirty = false;
  /** debug ring (null = recording off) */
  private ring: (LoggedEvent | null)[] | null = null;
  private recordingOn = true;
  private seq = 0;
  private tickOf: () => number = () => 0;

  /** Turn on the debug ring. `tickOf` supplies the sim tick stored with each event. */
  enableRecording(tickOf: () => number): void {
    if (!this.ring) { this.ring = []; for (let i = 0; i < EVENT_RING; i++) this.ring.push(null); }
    this.tickOf = tickOf;
  }

  /**
   * Pause or resume the debug ring (`__dbg.ext.core.recordEvents(on)`). The ring clones every payload, a cost a
   * production build does not have: an allocation test switches it off for its measured span. While it is off,
   * events() and stepUntil({ event }) see nothing new.
   */
  setRecording(on: boolean): void { this.recordingOn = on; }

  on<K extends EventName>(name: K, handler: (payload: Readonly<GameEvents[K]>) => void): Unsubscribe {
    return this.add(name, handler as unknown as Handler, false);
  }
  once<K extends EventName>(name: K, handler: (payload: Readonly<GameEvents[K]>) => void): Unsubscribe {
    return this.add(name, handler as unknown as Handler, true);
  }
  private add(name: string, fn: Handler, once: boolean): Unsubscribe {
    let list = this.slots.get(name);
    if (!list) { list = []; this.slots.set(name, list); }
    const slot: Slot = { fn, once };
    list.push(slot);
    return () => { slot.fn = null; this.dirty = true; if (this.depth === 0) this.compact(); };
  }

  emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
    if (this.ring && this.recordingOn) this.record(name, payload as unknown as Record<string, unknown>);
    const list = this.slots.get(name);
    if (!list) return;
    this.depth++;
    // handlers added during this emit are not called for it
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const slot = list[i] as Slot;
      const fn = slot.fn;
      if (!fn) continue;
      if (slot.once) { slot.fn = null; this.dirty = true; }
      try {
        (fn as (p: unknown) => void)(payload);
      } catch (err) {
        this.report(name, fn, err);
      }
    }
    this.depth--;
    if (this.dirty && this.depth === 0) this.compact();
  }

  private report(name: string, fn: Handler, err: unknown): void {
    if (this.reported.has(fn)) return;
    this.reported.add(fn);
    console.error(`[events] handler for '${name}' threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }

  private compact(): void {
    this.dirty = false;
    for (const list of this.slots.values()) {
      let w = 0;
      for (let r = 0; r < list.length; r++) { const s = list[r] as Slot; if (s.fn) list[w++] = s; }
      list.length = w;
    }
  }

  private record(name: EventName, payload: Record<string, unknown>): void {
    const ring = this.ring as (LoggedEvent | null)[];
    const seq = ++this.seq;
    ring[seq % EVENT_RING] = { seq, tick: this.tickOf(), name, payload: { ...payload } };
  }

  /** Events with seq > sinceSeq, oldest first, optionally one name only. Returns clones. */
  events(sinceSeq = 0, nameFilter?: string): LoggedEvent[] {
    const out: LoggedEvent[] = [];
    if (!this.ring) return out;
    const first = Math.max(sinceSeq + 1, this.seq - EVENT_RING + 1, 1);
    for (let s = first; s <= this.seq; s++) {
      const e = this.ring[s % EVENT_RING];
      if (!e || e.seq !== s) continue;
      if (nameFilter !== undefined && e.name !== nameFilter) continue;
      out.push({ seq: e.seq, tick: e.tick, name: e.name, payload: { ...e.payload } });
    }
    return out;
  }
  /** Raw access for stepUntil (no clone). Null when the entry has been overwritten or never existed. */
  eventAt(seq: number): LoggedEvent | null {
    if (!this.ring) return null;
    const e = this.ring[seq % EVENT_RING];
    return e && e.seq === seq ? e : null;
  }
  get lastSeq(): number { return this.seq; }
  clearEvents(): void {
    if (!this.ring) return;
    for (let i = 0; i < EVENT_RING; i++) this.ring[i] = null;
  }
}
