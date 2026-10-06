// The F3 overlay (ARCHITECTURE 8.6): PerfStats, per-system ms, the current cell and its computed bound, the tier caps,
// and a 120-frame bar of frameMs. Red when over. DOM writes happen only while it is visible, every 6th frame.
import { SYSTEM_ORDER } from './contracts.ts';
import type { GameContext, VisibilityCell } from './contracts.ts';
import type { CoreInternals } from './context.ts';
import { PERF_HISTORY } from './perf.ts';

const MB = 1024 * 1024;
const FRAME_BUDGET_MS = 4;

export class PerfOverlay {
  visible = false;
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly bar: HTMLCanvasElement;
  private readonly bar2d: CanvasRenderingContext2D | null;
  private counter = 0;
  private readonly cells = new Map<string, VisibilityCell>();

  constructor(private readonly ctx: GameContext, private readonly core: CoreInternals, show: boolean) {
    this.root = document.createElement('div');
    this.root.id = 'perf-overlay';
    this.root.style.cssText = 'position:fixed;left:8px;top:8px;z-index:1000;padding:6px 8px;background:rgba(0,0,0,0.72);color:#d8f3ee;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;white-space:pre;display:none;border:1px solid rgba(255,255,255,0.15)';
    this.text = document.createElement('pre');
    this.text.style.cssText = 'margin:0;font:inherit';
    this.bar = document.createElement('canvas');
    this.bar.width = PERF_HISTORY * 2; this.bar.height = 40;
    this.bar.style.cssText = 'display:block;margin-top:4px;width:240px;height:40px;background:rgba(255,255,255,0.06)';
    this.bar2d = this.bar.getContext('2d');
    this.root.append(this.text, this.bar);
    (core.canvas.parentElement ?? document.body).appendChild(this.root);
    for (const c of ctx.data.manifest.visibility.cells) this.cells.set(c.id, c);
    window.addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); this.setVisible(!this.visible); } });
    if (show) this.setVisible(true);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.style.display = on ? 'block' : 'none';
    if (on) this.draw();
  }

  /** Called by the loop after perf.endFrame(). */
  update(): void {
    if (!this.visible) return;
    if (++this.counter % 6 !== 0) return;
    this.draw();
  }

  private draw(): void {
    const p = this.core.perf.last, q = this.core.quality, m = this.ctx.data.manifest;
    const tier = m.tiers[p.tier];
    const cell = this.cells.get(p.cell);
    const mem = (p.textureBytes + p.renderTargetBytes) / MB;
    const flag = (bad: boolean): string => (bad ? '  << OVER' : '');
    const lines: string[] = [];
    lines.push(`KEEP SEVEN  tier ${p.tier}${q.starved ? ' (starved: nowhere to demote)' : ''}  ratio ${p.pixelRatio.toFixed(2)}  ${p.width}x${p.height}  target ${q.targetMs.toFixed(1)} ms  state ${this.ctx.state.current}`);
    lines.push(`frame ${p.frameMs.toFixed(2)} ms  sim ${p.simMs.toFixed(2)}  update ${p.updateMs.toFixed(2)}  render ${p.renderMs.toFixed(2)}  raf ${p.rafMs.toFixed(1)}${flag(p.frameMs > FRAME_BUDGET_MS)}`);
    let sys = '';
    for (let i = 0; i < SYSTEM_ORDER.length; i++) sys += `${SYSTEM_ORDER[i]} ${(this.core.perf.systemMs[i] as number).toFixed(2)}  `;
    lines.push(sys);
    lines.push(`draw calls ${p.drawCalls} / tier ${tier.drawCalls.typical}-${tier.drawCalls.worst}${flag(p.drawCalls > tier.drawCalls.worst)}`);
    lines.push(`triangles  ${p.triangles} / tier ${tier.triangles}${flag(p.triangles > tier.triangles)}`);
    lines.push(`memory     ${mem.toFixed(1)} MiB (tex ${(p.textureBytes / MB).toFixed(1)} + rt ${(p.renderTargetBytes / MB).toFixed(1)}) / ${tier.textureBudgetMB}${flag(mem > tier.textureBudgetMB)}`);
    if (cell) {
      const b = cell.budget;
      lines.push(`cell ${cell.id}  bound: ${b.drawCalls.typical}-${b.drawCalls.worst} calls, ${b.triangles} tris${flag(p.drawCalls > b.drawCalls.worst || p.triangles > b.triangles)}`);
    } else lines.push(`cell ${p.cell === '' ? '(none)' : p.cell}`);
    lines.push(`programs ${p.programs}  geometries ${p.geometries}  textures ${p.textures}  zones ${p.visibleZones}  instances ${p.instances}`);
    lines.push(`enemies ${p.enemiesAlive}  particles ${p.particles}  decals ${p.decals}  voices ${p.audioVoices}  rays ${p.rays}  heap ${(p.heapBytes / MB).toFixed(1)} MiB`);
    const over = p.frameMs > FRAME_BUDGET_MS || p.drawCalls > tier.drawCalls.worst || p.triangles > tier.triangles || mem > tier.textureBudgetMB;
    this.root.style.color = over ? '#ff7a6b' : '#d8f3ee';
    this.text.textContent = lines.join('\n');
    const g = this.bar2d;
    if (!g) return;
    const hist = this.core.perf.history, head = this.core.perf.historyHead;
    g.clearRect(0, 0, this.bar.width, this.bar.height);
    for (let i = 0; i < PERF_HISTORY; i++) {
      const v = hist[(head + i) % PERF_HISTORY] as number;
      const h = Math.min(this.bar.height, (v / (FRAME_BUDGET_MS * 2)) * this.bar.height);
      g.fillStyle = v > FRAME_BUDGET_MS ? '#ff5a4a' : '#7cf2e2';
      g.fillRect(i * 2, this.bar.height - h, 2, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, this.bar.height / 2, this.bar.width, 1);        // the 4 ms line
  }
}
