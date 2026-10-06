// sandbox/enemies: the real enemies system beside the core stubs, in the real layout zones (colliders and nav through
// core/greybox, built by the stub world). Scenes: street, yard, file, hall, bore.
//   ?scene=street|yard|file|hall|bore     ?test=1  no real-time loop: drive it through window.__dbg     F3 / ?perf=1
// Buttons stand in for world's director: spawn at any spawn marker, wake, kill, free, mock rounds, the encounter's
// waves, the vignettes, the boss phases, F-on-mark and the kept round. Overlays: states, token holders, telegraph
// timers, nav paths, hit volumes, lanes; the boss's pips and gauge.
import * as THREE from 'three';
import type { BossPhase, CheckpointId, EnemyKind, EnemySystem, GameContext, LayoutMarker, SpawnRequest } from '../src/core/contracts.ts';
import { createSandbox } from '../src/core/sandbox.ts';
import type { Sandbox } from '../src/core/sandbox.ts';
import { ENEMIES } from '../src/enemies/defs.ts';
import { createEnemySystem } from '../src/enemies/index.ts';

type Ext = Record<string, (...args: unknown[]) => unknown>;
interface SceneDef { checkpoint: CheckpointId; at: [number, number, number]; yawDeg: number; waves: [string, () => void][] }

let system: EnemySystem | null = null;
let ctxRef: GameContext | null = null;
const ext = (): Ext => (ctxRef as unknown as { debug: { ext: Record<string, Ext> } }).debug.ext.enemies as Ext;

function request(kind: EnemyKind, spawn: string, more: Partial<SpawnRequest> = {}): string {
  const m = (ctxRef as GameContext).data.layout.markers.find((x) => x.id === spawn);
  const p = m ? m.params : {};
  return (system as EnemySystem).spawn({
    kind, spawn, encounter: '', wave: '', lane: '', order: typeof p.order === 'number' ? p.order : 0, counted: true,
    dormantClip: typeof p.dormant === 'string' ? p.dormant : '', entrance: typeof p.entrance === 'string' ? p.entrance : (typeof p.rise === 'string' ? 'rise' : ''),
    ...more,
  });
}
const wave = (encounter: SpawnRequest['encounter'], id: string, spawns: string[], kind: EnemyKind, lane = ''): void => {
  for (const s of spawns) request(kind, s, { encounter, wave: id, lane });
};

const SCENES: Record<string, SceneDef> = {
  street: {
    checkpoint: 'cp_lip_gate', at: [-6, 0, 0], yawDeg: 90,
    waves: [
      ['A kneeler', () => (system as EnemySystem).playVignette('vig_kneeler')],
      ['B alleys', () => wave('enc_street', 'B', ['sp_street_alley_n', 'sp_street_alley_s'], 'bider')],
      ['C file', () => wave('enc_street', 'C', ['sp_street_saddlery_1', 'sp_street_saddlery_2', 'sp_street_saddlery_3'], 'bider', 'lane_street')],
      ['D gate', () => wave('enc_street', 'D', ['sp_street_gate'], 'bider')],
    ],
  },
  yard: {
    checkpoint: 'cp_yard_clear', at: [-83, 0, 0], yawDeg: 90,
    waves: [
      ['T1 bell', () => (system as EnemySystem).playVignette('vig_yard_bell')],
      ['B transits', () => wave('enc_yard', 'B', ['sp_yard_t2', 'sp_yard_t3'], 'transit')],
      ['B2 grate', () => wave('enc_yard', 'B2', ['sp_yard_grate_1', 'sp_yard_grate_2'], 'bider')],
      ['B3 alley', () => wave('enc_yard', 'B3', ['sp_yard_alley_1', 'sp_yard_alley_2'], 'bider')],
      ['dowser', () => (system as EnemySystem).playVignette('vig_dowser')],
    ],
  },
  file: {
    checkpoint: 'cp_gallery_baffle', at: [-62, -12, -14], yawDeg: -90,
    waves: [
      ['A queue', () => wave('enc_file', 'A', ['sp_file_1', 'sp_file_2', 'sp_file_3', 'sp_file_4', 'sp_file_5', 'sp_file_6'], 'bider', 'lane_gallery')],
      ['turn', () => (system as EnemySystem).wakeEncounter('enc_file')],
      ['B three', () => wave('enc_file', 'B', ['sp_file_7', 'sp_file_8', 'sp_file_9'], 'bider')],
      ['watcher', () => (system as EnemySystem).playVignette('vig_watcher')],
    ],
  },
  hall: {
    checkpoint: 'cp_hall_gantry', at: [-16.5, -12, -14], yawDeg: -45,
    waves: [
      ['tamper vignette', () => (system as EnemySystem).playVignette('vig_tamper')],
      ['wake', () => (system as EnemySystem).wakeEncounter('enc_matador')],
      ['B grates', () => wave('enc_matador', 'B', ['sp_hall_grate_1', 'sp_hall_grate_2'], 'bider')],
      ['C grates', () => wave('enc_matador', 'C', ['sp_hall_grate_3', 'sp_hall_grate_4'], 'bider')],
    ],
  },
  bore: {
    checkpoint: 'cp_boss_p1', at: [14, -44, 84.5], yawDeg: 180,
    waves: [
      ['parley', () => (system as EnemySystem).startBoss('parley', false)],
    ],
  },
};

const BOSS_PHASES: BossPhase[] = ['idle', 'p1', 'p2', 'p3a', 'hush', 'proven', 'p3b', 'dead'];

/** Wireframes of the overlay: hit volumes, nav paths, lanes. Rebuilt every frame (sandbox only: it allocates). */
class Overlay {
  readonly group = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly positions = new Float32Array(6 * 6000);
  private readonly colors = new Float32Array(6 * 6000);
  private n = 0;
  on = true;
  constructor(private readonly ctx: GameContext) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.group.name = 'sandbox_enemies_overlay';
    this.group.add(this.lines);
    ctx.scene.dynamic.add(this.group);
  }
  private seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, g: number, b: number): void {
    if (this.n >= 6000) return;
    const o = this.n * 6;
    this.positions[o] = ax; this.positions[o + 1] = ay; this.positions[o + 2] = az; this.positions[o + 3] = bx; this.positions[o + 4] = by; this.positions[o + 5] = bz;
    this.colors[o] = r; this.colors[o + 1] = g; this.colors[o + 2] = b; this.colors[o + 3] = r; this.colors[o + 4] = g; this.colors[o + 5] = b;
    this.n++;
  }
  private ring(x: number, y: number, z: number, radius: number, plane: 'xz' | 'xy' | 'zy', r: number, g: number, b: number): void {
    const k = 14;
    for (let i = 0; i < k; i++) {
      const a0 = (i / k) * Math.PI * 2, a1 = ((i + 1) / k) * Math.PI * 2;
      const c0 = Math.cos(a0) * radius, s0 = Math.sin(a0) * radius, c1 = Math.cos(a1) * radius, s1 = Math.sin(a1) * radius;
      if (plane === 'xz') this.seg(x + c0, y, z + s0, x + c1, y, z + s1, r, g, b);
      else if (plane === 'xy') this.seg(x + c0, y + s0, z, x + c1, y + s1, z, r, g, b);
      else this.seg(x, y + s0, z + c0, x, y + s1, z + c1, r, g, b);
    }
  }
  sphere(x: number, y: number, z: number, radius: number, r: number, g: number, b: number): void {
    this.ring(x, y, z, radius, 'xz', r, g, b); this.ring(x, y, z, radius, 'xy', r, g, b); this.ring(x, y, z, radius, 'zy', r, g, b);
  }
  update(): void {
    this.n = 0;
    this.group.visible = this.on;
    if (!this.on || !system) { this.flush(); return; }
    const ctx = this.ctx;
    const e = ext();
    const centre = (id: string, part: string | null): number[] | null => e.volumeCentre?.(id, part) as number[] | null;
    const actors = e.actors?.() as { id: string; kind: EnemyKind; state: string; alive: boolean; x: number; y: number; z: number; yawDeg: number; token: string; aim: number[]; ventChest: boolean; ventBack: boolean }[];
    for (const a of actors) {
      if (!a.alive) continue;
      for (const v of ENEMIES[a.kind].volumes) {
        const c = centre(a.id, v.part);
        if (!c) continue;
        const open = v.part === 'vent_chest' ? a.ventChest : v.part === 'vent_back' ? a.ventBack : true;
        const weak = v.priority > 0;
        if (v.shape === 'sphere') this.sphere(c[0] as number, c[1] as number, c[2] as number, v.radius, weak ? (open ? 1 : 0.35) : 0.3, weak ? 0.3 : 0.9, weak ? (open ? 1 : 0.35) : 0.9);
        else {
          const top = v.height ?? 1;
          this.ring(a.x, a.y + 0.05, a.z, v.radius, 'xz', 0.3, 0.9, 0.9);
          this.ring(a.x, a.y + top, a.z, v.radius, 'xz', 0.3, 0.9, 0.9);
          this.seg(a.x + v.radius, a.y, a.z, a.x + v.radius, a.y + top, a.z, 0.3, 0.9, 0.9);
          this.seg(a.x - v.radius, a.y, a.z, a.x - v.radius, a.y + top, a.z, 0.3, 0.9, 0.9);
        }
      }
      // facing, and a token holder gets a flame-coloured ring at its feet
      const yaw = a.yawDeg * Math.PI / 180;
      this.seg(a.x, a.y + 1, a.z, a.x - Math.sin(yaw) * 1.2, a.y + 1, a.z - Math.cos(yaw) * 1.2, 1, 1, 0.2);
      if (a.token !== '') this.ring(a.x, a.y + 0.08, a.z, 0.7, 'xz', 1, 0.58, 0.2);
      if (a.kind === 'transit' && a.state === 'aim') this.seg(a.x, a.y + 1.62, a.z, a.aim[0] as number, a.aim[1] as number, a.aim[2] as number, 1, 0.58, 0.2);
    }
    // the boss's volumes
    for (const part of ['mouth', 'pawl'] as const) {
      const c = centre('windlass', part);
      if (c) this.sphere(c[0] as number, c[1] as number, c[2] as number, part === 'mouth' ? 0.45 : 0.3, 1, 0.3, 1);
    }
    // lanes
    for (const m of ctx.data.layout.markers) {
      if (m.params.kind !== 'lane' || !ctx.world.builtZones.includes(m.zone)) continue;
      const s = m.size ?? [1, 1, 1];
      const x0 = m.pos[0] - s[0] / 2, x1 = m.pos[0] + s[0] / 2, z0 = m.pos[2] - s[2] / 2, z1 = m.pos[2] + s[2] / 2, y = m.pos[1] + 0.05;
      this.seg(x0, y, z0, x1, y, z0, 0.4, 1, 0.5); this.seg(x1, y, z0, x1, y, z1, 0.4, 1, 0.5); this.seg(x1, y, z1, x0, y, z1, 0.4, 1, 0.5); this.seg(x0, y, z1, x0, y, z0, 0.4, 1, 0.5);
    }
    // nav path of each living body to the player
    const nodes = ctx.data.layout.nav.nodes;
    const p = ctx.player.position;
    for (const a of actors) {
      if (!a.alive) continue;
      const ids = e.navPath?.(a.x, a.y, a.z, p.x, p.y, p.z) as string[];
      let px = a.x, py = a.y + 0.1, pz = a.z;
      for (const id of ids) {
        const n = nodes.find((x) => x.id === id);
        if (!n) continue;
        this.seg(px, py, pz, n.pos[0], n.pos[1] + 0.1, n.pos[2], 0.5, 0.6, 1);
        px = n.pos[0]; py = n.pos[1] + 0.1; pz = n.pos[2];
      }
    }
    this.flush();
  }
  private flush(): void {
    const g = this.lines.geometry;
    g.setDrawRange(0, this.n * 2);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

async function scene(sb: Sandbox, name: string): Promise<void> {
  const def = SCENES[name] as SceneDef;
  const ctx = sb.ctx;
  ctxRef = ctx;
  await sb.start(def.checkpoint);
  ctx.player.teleport(def.at[0], def.at[1], def.at[2], def.yawDeg, 0);
  ctx.player.setGodMode(true);
  // the stub world draws by visibility cell; a sandbox shows the whole zone (a stub-only helper: absent beside a real world)
  const stubWorld = (ctx as unknown as { debug: { ext: Record<string, Ext | undefined> } }).debug.ext.world;
  if (stubWorld && stubWorld.showAll) stubWorld.showAll(true);
  const sys = system as EnemySystem;
  const e = ext();
  const eye = (): [number, number, number] => [ctx.player.position.x, ctx.player.position.y + 1.65, ctx.player.position.z];
  const fwd = (): [number, number, number] => [ctx.player.forward.x, ctx.player.forward.y, ctx.player.forward.z];

  // ---- the director's stand-ins
  for (const [label, run] of def.waves) sb.button(label, run, 'wave / vignette');
  sb.separator();
  const spawns: LayoutMarker[] = ctx.data.layout.markers.filter((m) => m.type === 'enemy_spawn' && ctx.world.builtZones.includes(m.zone) && m.params.enemy !== 'windlass');
  const select = document.createElement('select');
  for (const m of spawns) { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.id} (${String(m.params.enemy)})`; select.appendChild(o); }
  (document.getElementById('bar') as HTMLElement).appendChild(select);
  sb.button('spawn', () => { const m = spawns.find((x) => x.id === select.value); if (m) request(m.params.enemy as EnemyKind, m.id); }, 'spawn the marker\'s kind on it (dormant if the marker says so)');
  for (const kind of ['bider', 'transit', 'tamper'] as EnemyKind[]) {
    sb.button('+' + kind, () => {
      const p = ctx.player.position, f = ctx.player.forward;
      sys.debug.spawnAt(kind, p.x + f.x * 14, p.y, p.z + f.z * 14, 0);
    }, 'spawn 14 m in front of her, active');
  }
  sb.button('wake', () => { for (const a of e.actors?.() as { id: string }[]) sys.wake(a.id); });
  sb.button('kill', () => sys.debug.killAll(false));
  sb.button('free', () => sys.debug.killAll(true));
  sb.button('clear', () => sys.clearAll());
  sb.button('lead', () => { const o = eye(), d = fwd(); e.leadRound?.(o[0], o[1], o[2], d[0], d[1], d[2]); }, 'a mock lead round down her aim');
  sb.button('line', () => { const o = eye(), d = fwd(); e.lineRound?.(o[0], o[1], o[2], d[0], d[1], d[2]); }, 'a mock line round down her aim');
  let ai = true;
  sb.button('AI', () => { ai = !ai; sys.setAiEnabled(ai); });
  let god = true;
  sb.button('god', () => { god = !god; ctx.player.setGodMode(god); });
  // the scripted walker: she paces a 10 m line across her starting view, so aims, fans and charges have a moving target
  let walker = false, walkT = 0;
  sb.button('walker', () => { walker = !walker; walkT = 0; }, 'target = a scripted walker instead of the standing player');
  for (const d of ['easy', 'normal', 'hard'] as const) sb.button(d, () => ctx.options.set('difficulty', d));
  const overlay = new Overlay(ctx);
  sb.button('overlay', () => { overlay.on = !overlay.on; });

  if (name === 'bore') {
    sb.separator();
    for (const ph of BOSS_PHASES) sb.button(ph, () => sys.debug.setBossPhase(ph), 'boss phase');
    const nearestMark = (): string => {
      const p = ctx.player.position;
      let best = '', d = Infinity;
      for (const m of ctx.data.layout.markers) {
        if (!m.id.startsWith('ia_proving_mark_')) continue;
        const k = Math.hypot(m.pos[0] - p.x, m.pos[2] - p.z);
        if (k < d) { d = k; best = m.id; }
      }
      return best;
    };
    sb.button('F on mark', () => {
      const id = nearestMark();
      const m = ctx.data.layout.markers.find((x) => x.id === id);
      if (m) ctx.player.teleport(m.pos[0], m.pos[1], m.pos[2], ctx.player.yaw * 180 / Math.PI, -20);
      ctx.events.emit('weapon/kept', { stage: 'loading', mark: id });
    }, 'stand on the nearest proving mark and press F (mock)');
    sb.button('unload', () => ctx.events.emit('weapon/kept', { stage: 'unloaded', mark: '' }));
    sb.button('kept fired', () => ctx.events.emit('weapon/kept', { stage: 'fired', mark: nearestMark() }));
    sb.button('T3', () => ctx.events.emit('puzzle/hint', { puzzle: 'kept', tier: 3 }));
    sb.button('T4', () => ctx.events.emit('puzzle/hint', { puzzle: 'kept', tier: 4 }));
  }

  // ---- the readout: states, token holders, telegraph timers, the boss's pips and gauge
  const panel = document.createElement('pre');
  panel.id = 'enemies-panel';
  panel.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;background:rgba(11,13,18,0.72);color:#e8dcc4;font:11px/1.35 monospace;pointer-events:none;z-index:5;white-space:pre';
  document.body.appendChild(panel);
  let shown = '';
  const start = { x: def.at[0], y: def.at[1], z: def.at[2] };
  sb.onFrame((frameDt) => {
    if (walker) {
      walkT += frameDt;
      const yaw = def.yawDeg * Math.PI / 180;
      const side = Math.sin(walkT * 0.9) * 5;
      ctx.player.teleport(start.x + Math.cos(yaw) * side, ctx.player.position.y, start.z - Math.sin(yaw) * side, ctx.player.yaw * 180 / Math.PI, ctx.player.pitch * 180 / Math.PI);
    }
    overlay.update();
    const actors = e.actors?.() as { id: string; state: string; t: number; hp: number; token: string; alive: boolean; clip: string }[];
    const t = sys.debug.tokens();
    const b = sys.boss;
    const boss = e.boss?.() as { sub: string; t: number; heading: number; rings: number; lance: string; fan: string; mouths: number[]; dark: number[] };
    const stats = e.stats?.() as { dealt: number; maxHit: number; flying: number; stuck: number; sightPeak: number };
    const lines = [
      `scene ${name}   alive ${sys.aliveCount('')}   threat ${sys.threat}   ${ctx.options.value.difficulty}   hp ${ctx.player.health.toFixed(0)}`,
      `tokens  melee [${t.melee.join(' ')}]  ranged [${t.ranged.join(' ')}]  heavy [${t.heavy.join(' ')}]`,
      `stakes ${stats.flying} flying / ${stats.stuck} stuck   dealt ${stats.dealt} (max hit ${stats.maxHit})   sight rays peak ${stats.sightPeak}`,
      ...actors.map((a) => `${a.id.padEnd(10)} ${a.state.padEnd(13)} ${a.t.toFixed(2).padStart(6)} s  hp ${String(a.hp).padStart(3)}  ${a.token ? '[' + a.token + ']' : ''}  ${a.clip}`),
    ];
    if (name === 'bore') {
      lines.push(`boss ${b.phase}/${boss.sub} ${boss.t.toFixed(2)} s   pips ${b.pips}/${b.pipsTotal}  ${'#'.repeat(b.pips)}${'.'.repeat(b.pipsTotal - b.pips)}`);
      lines.push(`arm bay ${b.armBay} heading ${boss.heading.toFixed(1)}   guard ${b.guard}   mouths ${boss.mouths.join('')} dark ${boss.dark.join('')}   marks ${b.marksLit ? 'lit' : 'dark'}   hush ${b.hush}`);
      lines.push(`rings ${boss.rings}  lance ${boss.lance}  fan ${boss.fan}`);
    }
    const text = lines.join('\n');
    if (text !== shown) { shown = text; panel.textContent = text; }
  });
}

void createSandbox({
  piece: 'enemies',
  systems: { enemies: (ctx) => { system = createEnemySystem(ctx); ctxRef = ctx; return system; } },
  scene: {
    street: (sb) => scene(sb, 'street'),
    yard: (sb) => scene(sb, 'yard'),
    file: (sb) => scene(sb, 'file'),
    hall: (sb) => scene(sb, 'hall'),
    bore: (sb) => scene(sb, 'bore'),
    // the scaffold's two scenes stay (core's page checks open them)
    layout: async (sb) => { ctxRef = sb.ctx; await sb.start('cp_lip_start'); },
    room: async (sb) => { ctxRef = sb.ctx; await sb.boxRoom(); },
  },
});
