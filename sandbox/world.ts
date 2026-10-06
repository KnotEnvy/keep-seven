// sandbox/world: the real world system beside the core stubs (capsule enemies that fall to one shot, the dummy player
// with its click-to-shoot ray). ARCHITECTURE 12: every door, pickup, locker, readable, puzzle (with a hint-clock
// fast-forward), trigger, encounter wave, checkpoint, ride and the set swap; a panel listing the story as it would play.
//   ?scene=surface (default) | seam | underground | coda      ?test=1: no real-time loop, drive it through window.__dbg
import type { BossPhase, CheckpointId, EncounterId, EventName, GameContext, GameEvents, PuzzleId } from '../src/core/contracts.ts';
import { createSandbox } from '../src/core/sandbox.ts';
import type { Sandbox } from '../src/core/sandbox.ts';
import { createWorldSystem } from '../src/world/index.ts';

const PUZZLES: PuzzleId[] = ['seven_jugs', 'daylight', 'proving_line', 'the_asking'];
const ENCOUNTERS: EncounterId[] = ['enc_street', 'enc_yard', 'enc_tally', 'enc_file', 'enc_matador', 'enc_windlass'];
const PANEL_LINES = 22;

/** What the panel prints for each event: the story as it would play, and what the world did. */
function describe(ctx: GameContext, name: EventName, p: Record<string, unknown>): string | null {
  switch (name) {
    case 'story/line': return `${String(p.speaker).toUpperCase().padEnd(8)} ${String(p.text)}  (${String(p.key)}, ${String(p.seconds)} s)`;
    case 'story/card': return `CARD     ${String(p.text)}`;
    case 'story/caption': return `CAPTION  ${String(p.text)}`;
    case 'objective/changed': return `OBJECT.  ${String(p.text)}  (${String(p.key)})`;
    case 'ui/hint': return p.show ? `HINT     ${ctx.data.story.ui[String(p.key)] ?? String(p.key)}` : null;
    case 'checkpoint/saved': return `SAVED    ${String(p.id)}`;
    case 'puzzle/solved': case 'puzzle/entered': return `${name.slice(7).toUpperCase().padEnd(8)} ${String(p.puzzle)}`;
    case 'puzzle/hint': return `HINT T${String(p.tier)}  ${String(p.puzzle)}`;
    case 'encounter/started': case 'encounter/cleared': case 'encounter/reset': return `${name.slice(10).toUpperCase().padEnd(8)} ${String(p.id)}`;
    case 'encounter/wave': return `WAVE     ${String(p.id)} ${String(p.wave)}`;
    case 'door/state': return `DOOR     ${String(p.id)} ${String(p.state)}${p.locked ? ' (locked)' : ''}`;
    case 'pickup/collected': return `PICKUP   ${String(p.kind)} (${String(p.id)})`;
    case 'ride/state': return `RIDE     ${String(p.id)} ${String(p.stage)}`;
    case 'secret/found': return `SECRET   ${String(p.id)}`;
    case 'readable/opened': return `READ     ${ctx.data.story.readables[String(p.key)]?.title ?? String(p.key)}`;
    case 'ending/stone': return `ENDING   the stone: ${p.taken ? 'taken' : 'left'}`;
    case 'ending/card': return 'ENDING   the end card';
    default: return null;
  }
}

function panel(sb: Sandbox): void {
  const ctx = sb.ctx;
  const el = document.getElementById('panel') ?? Object.assign(document.createElement('pre'), { id: 'panel' });
  if (!el.parentElement) document.body.appendChild(el);
  // the left half: the core UI stub prints its own log at the bottom right
  el.style.cssText = 'left:8px;right:auto;top:8px;max-width:52vw;max-height:58vh';
  const lines: string[] = [];
  let dirty = false;
  const names: EventName[] = ['story/line', 'story/card', 'story/caption', 'objective/changed', 'ui/hint', 'checkpoint/saved', 'puzzle/solved', 'puzzle/entered', 'puzzle/hint',
    'encounter/started', 'encounter/cleared', 'encounter/reset', 'encounter/wave', 'door/state', 'pickup/collected', 'ride/state', 'secret/found', 'readable/opened', 'ending/stone', 'ending/card'];
  for (const name of names) {
    ctx.events.on(name, (p) => {
      const text = describe(ctx, name, p as unknown as Record<string, unknown>);
      if (text === null) return;
      lines.push(text);
      if (lines.length > PANEL_LINES) lines.shift();
      dirty = true;
    });
  }
  // newest first: what is playing now is at the top
  sb.onFrame(() => { if (dirty) { el.textContent = lines.slice().reverse().join('\n'); dirty = false; } });
}

function buttons(sb: Sandbox): void {
  const ctx = sb.ctx;
  const world = ctx.world;
  const ext = (): Record<string, (...args: never[]) => unknown> => (window.__dbg?.ext.world ?? {}) as Record<string, (...args: never[]) => unknown>;
  const emit = <K extends EventName>(name: K, payload: GameEvents[K]): void => ctx.events.emit(name, payload);
  sb.button('line round', () => { (ext().shoot as (a: string) => unknown)?.('line_round'); }, 'fire a line round from the eye (the dummy fires lead on a click)');
  sb.button('hints +60 s', () => { (ext().hintClock as (n: number) => unknown)?.(60); }, 'fast-forward every hint clock');
  sb.separator();
  for (const id of PUZZLES) sb.button('solve ' + id, () => world.debug.solvePuzzle(id), 'WorldDebug.solvePuzzle');
  sb.separator();
  for (const id of ENCOUNTERS) sb.button('clear ' + id.slice(4), () => world.debug.clearEncounter(id), 'WorldDebug.clearEncounter');
  sb.separator();
  for (const phase of ['p1', 'p2', 'p3a', 'proven', 'p3b', 'dead'] as BossPhase[]) sb.button('boss ' + phase, () => ctx.enemies.debug.setBossPhase(phase), 'boss/phase (the stub boss)');
  sb.button('guard set', () => emit('boss/guard', { state: 'set' }));
  sb.button('charge req.', () => emit('boss/charge_required', {}));
  for (const stage of ['denied', 'loading', 'fired'] as const) sb.button('kept ' + stage, () => emit('weapon/kept', { stage, mark: '' }));
  sb.button('defeated', () => emit('boss/defeated', { cleanSix: false }));
  sb.separator();
  const cps = ctx.data.markersOfType('checkpoint').map((m) => m.id as CheckpointId);
  for (const cp of cps) sb.button(cp.replace('cp_', ''), () => { void window.__dbg?.checkpoint(cp); }, 'warp');
  const readout = sb.readout('');
  sb.onFrame(() => readout(`${world.zone} ${world.cell} ${world.residentSet} ${world.checkpoint} lamps ${world.lamps}`));
}

void createSandbox({
  piece: 'world',
  systems: { world: createWorldSystem },
  scene: {
    surface: async (sb) => { await sb.start('cp_lip_start'); panel(sb); buttons(sb); },
    seam: async (sb) => { await sb.start('cp_tally_hatch'); panel(sb); buttons(sb); },
    underground: async (sb) => { await sb.start('cp_gallery_bay'); panel(sb); buttons(sb); },
    coda: async (sb) => { await sb.start('cp_rim'); panel(sb); buttons(sb); },
  },
});
