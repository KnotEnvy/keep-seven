// The game clock (ARCHITECTURE 3.3): fixed ticks, sim time, slow motion.
import { FIXED_DT } from './contracts.ts';
import type { EventBus, GameClock, GameEvents } from './contracts.ts';

type SlowReason = GameEvents['time/scale']['reason'];
const MAX_REQUESTS = 8;

export class GameClockImpl implements GameClock {
  tick = 0;
  simTime = 0;
  unscaledTime = 0;
  timeScale = 1;
  frame = 0;
  alpha = 0;
  // active slow-motion requests (flat arrays: no allocation per request)
  private readonly reqScale = new Float32Array(MAX_REQUESTS);
  /** remaining unscaled ticks of each request */
  private readonly reqLeft = new Int32Array(MAX_REQUESTS);
  private reqCount = 0;
  private readonly payload: GameEvents['time/scale'] = { scale: 1, realSeconds: 0, reason: 'debug' };
  constructor(private readonly events: EventBus, private readonly reduceMotion: () => boolean) {}

  slowMotion(scale: number, realSeconds: number, reason: SlowReason): void {
    if (this.reduceMotion()) return;
    if (!(scale > 0) || !(realSeconds > 0)) return;
    const ticks = Math.max(1, Math.round(realSeconds / FIXED_DT));
    if (this.reqCount >= MAX_REQUESTS) {
      // replace the request that ends first
      let k = 0;
      for (let i = 1; i < this.reqCount; i++) if ((this.reqLeft[i] as number) < (this.reqLeft[k] as number)) k = i;
      this.reqScale[k] = scale; this.reqLeft[k] = ticks;
    } else {
      this.reqScale[this.reqCount] = scale; this.reqLeft[this.reqCount] = ticks; this.reqCount++;
    }
    this.payload.scale = scale; this.payload.realSeconds = realSeconds; this.payload.reason = reason;
    this.events.emit('time/scale', this.payload);
  }

  /**
   * One fixed tick: tick++, resolves slow-motion requests and returns the dt to hand to fixedUpdate
   * (FIXED_DT * timeScale). Sim time and the slow-motion timers advance only while the sim runs.
   */
  advance(simRunning: boolean): number {
    this.tick++;
    let scale = 1;
    if (simRunning) {
      for (let i = this.reqCount - 1; i >= 0; i--) {
        if ((this.reqLeft[i] as number) <= 0) {
          const last = --this.reqCount;
          this.reqScale[i] = this.reqScale[last] as number; this.reqLeft[i] = this.reqLeft[last] as number;
          continue;
        }
        if ((this.reqScale[i] as number) < scale) scale = this.reqScale[i] as number;
        this.reqLeft[i] = (this.reqLeft[i] as number) - 1;
      }
    }
    this.timeScale = scale;
    const dt = FIXED_DT * scale;
    if (simRunning) { this.simTime += dt; this.unscaledTime += FIXED_DT; }
    return dt;
  }
  /** Called by the loop once per rendered frame. */
  beginFrame(alpha: number): void { this.frame++; this.alpha = alpha; }
  /** Drop every slow-motion request (respawn, quit to title). */
  clearSlowMotion(): void { this.reqCount = 0; this.timeScale = 1; }
}
