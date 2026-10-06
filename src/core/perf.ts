// PerfMonitor (ARCHITECTURE 8.6): the loop times the phases, systems write counters into `scratch`, endFrame() publishes.
import { SYSTEM_ORDER } from './contracts.ts';
import type { PerfMonitor, PerfStats } from './contracts.ts';

export function emptyPerfStats(): PerfStats {
  return {
    tier: 'low', cell: '', pixelRatio: 1, width: 0, height: 0,
    drawCalls: 0, triangles: 0, points: 0, lines: 0, programs: 0, geometries: 0, textures: 0,
    textureBytes: 0, renderTargetBytes: 0, simMs: 0, updateMs: 0, renderMs: 0, frameMs: 0, rafMs: 0,
    visibleZones: 0, enemiesAlive: 0, particles: 0, decals: 0, instances: 0, audioVoices: 0, rays: 0, heapBytes: 0,
  };
}
const NUMERIC: readonly (keyof PerfStats)[] = [
  'pixelRatio', 'width', 'height', 'drawCalls', 'triangles', 'points', 'lines', 'programs', 'geometries', 'textures',
  'textureBytes', 'renderTargetBytes', 'simMs', 'updateMs', 'renderMs', 'frameMs', 'rafMs',
  'visibleZones', 'enemiesAlive', 'particles', 'decals', 'instances', 'audioVoices', 'rays', 'heapBytes',
];
export const PERF_HISTORY = 120;

export class PerfMonitorImpl implements PerfMonitor {
  readonly last: PerfStats = emptyPerfStats();
  readonly peak: PerfStats = emptyPerfStats();
  readonly scratch: PerfStats = emptyPerfStats();
  /** JS ms per system for the last frame (fixedUpdate + update + lateUpdate), in SYSTEM_ORDER */
  readonly systemMs = new Float32Array(SYSTEM_ORDER.length);
  /** accumulates during a frame; copied to systemMs by endFrame */
  readonly systemAcc = new Float32Array(SYSTEM_ORDER.length);
  /** ring of the last 120 frameMs values (the overlay's bar) */
  readonly history = new Float32Array(PERF_HISTORY);
  historyHead = 0;
  frames = 0;

  resetPeak(): void {
    const p = this.peak as unknown as Record<string, number | string>;
    for (const k of NUMERIC) p[k] = 0;
    this.peak.tier = this.last.tier; this.peak.cell = this.last.cell;
  }
  /** Publish the frame: scratch -> last, maxima -> peak, clear the per-frame accumulators. */
  endFrame(): void {
    const s = this.scratch as unknown as Record<string, number | string>;
    const l = this.last as unknown as Record<string, number | string>;
    const p = this.peak as unknown as Record<string, number | string>;
    this.scratch.frameMs = this.scratch.simMs + this.scratch.updateMs + this.scratch.renderMs;
    for (let i = 0; i < NUMERIC.length; i++) {
      const k = NUMERIC[i] as string;
      const v = s[k] as number;
      l[k] = v;
      if (v > (p[k] as number)) p[k] = v;
    }
    this.last.tier = this.scratch.tier; this.last.cell = this.scratch.cell;
    this.peak.tier = this.scratch.tier; this.peak.cell = this.scratch.cell;
    for (let i = 0; i < this.systemMs.length; i++) { this.systemMs[i] = this.systemAcc[i] as number; this.systemAcc[i] = 0; }
    this.history[this.historyHead] = this.scratch.frameMs;
    this.historyHead = (this.historyHead + 1) % PERF_HISTORY;
    this.frames++;
    // per-frame accumulators start again; counters that systems rewrite every frame are left for them
    this.scratch.simMs = 0; this.scratch.updateMs = 0; this.scratch.renderMs = 0;
  }
}
