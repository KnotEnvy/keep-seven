// sandbox/ui: the UI beside five core stubs, with NO 3D on show: an image-free gradient (bright "glare", dark, or mid)
// covers the canvas, and a panel of buttons drives every HUD state and every screen (docs/workorders/code-ui.md 5).
//   ?scene=hud      (default) a run in play: the HUD over the backdrop       ?scene=title   the title screen
//   ?scene=seventh  the six states of the seventh, enlarged, side by side    ?scene=mark    the HUD glyph beside the Pellam mark
//   ?bg=glare|dark|mid   the backdrop            ?panel=0|1   the button panel (default: on, off under ?test=1)
//   ?test=1         no real-time loop: drive it through window.__dbg; every button is also `__dbg.ext.uisb.run(label)`
// The panel's labels are developer text, not player-facing strings.
import { createSandbox } from '../src/core/sandbox.ts';
import type { Sandbox } from '../src/core/sandbox.ts';
import type { BossPhase, ChamberState, HitOutcome, RunStats, SeventhState, StoryKey } from '../src/core/contracts.ts';
import { createUiSystem } from '../src/ui/index.ts';
import { HINT_KEYS, PROMPT_OF } from '../src/ui/hud.ts';
import { MarkWidget, pellamMark } from '../src/ui/mark.ts';

type Run = () => void | Promise<void>;
interface Entry { group: string; label: string; run: Run }

const SEVENTH_STATES: readonly SeventhState[] = ['sealed', 'pulse', 'band_broken', 'chambered', 'spent', 'violet'];
const OUTCOMES: readonly HitOutcome[] = ['hit', 'weak', 'kill', 'freed', 'deflected'];
const PROMPT_KINDS = ['read', 'take', 'use', 'kept'] as const;
const CARDS: readonly StoryKey[] = ['card_title', 'card_i', 'card_ii', 'card_iii', 'card_iv', 'card_v', 'card_vi', 'card_vii', 'card_end'];

function build(sb: Sandbox): void {
  const { ctx } = sb;
  const ev = ctx.events;
  const params = sb.params;
  const backdrop = document.getElementById('backdrop') as HTMLElement;
  const setBackdrop = (name: string): void => { backdrop.className = name; };
  setBackdrop(params.get('bg') ?? 'mid');

  // ---- the stub player's weapon, driven directly (its cylinder array is the one the HUD reads)
  const cyl = (): ChamberState[] => ctx.player.weapon.cylinder as ChamberState[];
  let legal = false;
  Object.defineProperty(ctx.player.weapon, 'keptAimLegal', { configurable: true, get: () => legal });
  const setWeapon = (chambers: readonly ChamberState[], reserve: number, line: number): void => {
    ctx.player.debug.setAmmo(0, reserve, line);
    const c = cyl();
    for (let i = 0; i < 6; i++) c[i] = chambers[i] ?? 'empty';
    ev.emit('weapon/ammo', { chambered: ctx.player.weapon.chambered, reserve, lineRounds: line });
  };
  let shot = 1000;
  /** code-player's rule for the kept round: no cock after it, so the ring does not turn; the rounds close up when the
   *  1.2 s fire_kept clip ends (FIRE_KEPT_SECONDS). The tick at which this sandbox closes them up, -1 when none is due. */
  let compactAt = -1;
  const compact = (): void => {
    const c = cyl(), loaded = c.filter((s) => s !== 'empty');
    for (let i = 0; i < 6; i++) c[i] = loaded[i] ?? 'empty';
    ev.emit('weapon/ammo', { chambered: ctx.player.weapon.chambered, reserve: ctx.player.weapon.reserve, lineRounds: ctx.player.weapon.lineRounds });
  };
  const fire = (): void => {
    const c = cyl(), head = c[0] ?? 'empty';
    if (head === 'empty') { ev.emit('weapon/dry_fire', { reason: 'empty' }); return; }
    if (head === 'kept') { c[0] = 'empty'; ctx.player.debug.setSeventh('spent'); compactAt = ctx.clock.tick + 72; }
    else { c.shift(); c.push('empty'); }                         // chamber 0 is under the hammer: the next one comes round
    const p = ctx.player.eye, f = ctx.player.forward;
    ev.emit('weapon/fired', {
      shotId: ++shot, ammo: head === 'line' ? 'line_round' : head === 'kept' ? 'kept_round' : 'lead_round', chambersLeft: ctx.player.weapon.chambered,
      ox: p.x, oy: p.y, oz: p.z, dx: f.x, dy: f.y, dz: f.z, mx: p.x, my: p.y, mz: p.z, endX: p.x + f.x * 40, endY: p.y + f.y * 40, endZ: p.z + f.z * 40,
    });
  };
  const reloadRound = (): void => {
    const c = cyl(), w = ctx.player.weapon;
    const at = c.indexOf('empty');
    if (at < 0 || w.reserve <= 0) return;
    const next = c.slice(); next[at] = 'lead';
    setWeapon(next, w.reserve - 1, w.lineRounds);
    ev.emit('weapon/reload', { stage: 'round', chambered: w.chambered, reserve: w.reserve });
  };
  const hit = (outcome: HitOutcome, order = 0): void => {
    ev.emit('combat/hit', {
      x: 0, y: 0, z: 0, shotId: shot, order, ammo: 'lead_round', outcome, entityId: 'bider#1', entityKind: 'bider', part: 'body', surface: 'cloth',
      nx: 0, ny: 1, nz: 0, damage: 50, ricochetX: 0, ricochetY: 0, ricochetZ: 0,
    });
  };
  /** damage from a compass direction relative to the view: 0 = ahead, 90 = her right */
  const arc = (deg: number): void => {
    const p = ctx.player.position, f = ctx.player.forward;
    const a = (deg * Math.PI) / 180;
    const fl = Math.hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl;
    const rx = -fz, rz = fx;
    const dx = fx * Math.cos(a) + rx * Math.sin(a), dz = fz * Math.cos(a) + rz * Math.sin(a);
    ev.emit('player/damaged', { amount: 8, health: ctx.player.health, kind: 'lunge', source: 'bider', fromX: p.x + dx * 5, fromY: p.y + 1, fromZ: p.z + dz * 5, graceUsed: false });
  };
  const say = (key: StoryKey): void => {
    const l = ctx.data.line(key);
    ev.emit('story/line', { key, speaker: l.speaker, text: l.text, seconds: l.seconds });
  };
  // a card is shown once a run (polish round 5): the button starts the count of shown cards again, so it always shows
  const card = (key: StoryKey): void => { const l = ctx.data.line(key); ev.emit('game/new_run', { difficulty: ctx.options.value.difficulty }); ev.emit('story/card', { key, text: l.text, seconds: l.seconds }); };
  const caption = (key: StoryKey): void => { const l = ctx.data.line(key); ev.emit('story/caption', { key, text: l.text, seconds: l.seconds }); };
  const lines = ctx.data.story.lines;
  const firstOf = (speaker: string): StoryKey => Object.keys(lines).find((k) => lines[k]?.speaker === speaker) ?? '';
  const longest = (speaker: string): StoryKey => Object.keys(lines).filter((k) => lines[k]?.speaker === speaker).sort((a, b) => (lines[b]?.text.length ?? 0) - (lines[a]?.text.length ?? 0))[0] ?? '';
  const boss = (phase: BossPhase): void => { ctx.enemies.debug.setBossPhase(phase); };
  const setBoss = (fields: Record<string, unknown>): void => {
    const ext = sb.hook?.ext.enemies as Record<string, (f: Record<string, unknown>) => void> | undefined;
    ext?.setBoss?.(fields);
  };
  const flowIdle = async (): Promise<void> => {
    const core = sb.hook?.ext.core as { idle?: () => Promise<void> } | undefined;
    if (core?.idle) await core.idle();
  };
  /** back to a run in play, from wherever the page is */
  const toPlay = async (): Promise<void> => {
    await flowIdle();
    const s = ctx.state.current;
    if (s === 'title') await sb.start();
    else if (s === 'paused') ctx.state.request('playing', 'sandbox');
    else if (s === 'loading') ctx.state.request('playing', 'sandbox');
    else if (s === 'ending') { ev.emit('ui/action', { action: 'again' }); await flowIdle(); }
    else if (s === 'dead') { ctx.player.debug.setHealth(100); }
    await flowIdle();
  };
  const toTitle = async (withSave: boolean): Promise<void> => {
    await toPlay();
    ctx.state.request('paused', 'sandbox', 'menu');
    ev.emit('ui/action', { action: 'quit_to_title' });
    await flowIdle();
    if (!withSave) { ctx.save.clear(); click('story'); key('Escape'); }       // reopening the title re-reads the save
  };
  const click = (item: string): void => { (document.querySelector(`.k7 .scr.on [data-item="${item}"]`) as HTMLElement | null)?.click(); };
  const key = (code: string): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  };
  const readable = async (id: StoryKey): Promise<void> => {
    await toPlay();
    ev.emit('readable/opened', { key: id });
    ctx.state.request('paused', 'readable', 'readable');
  };
  const end = async (freed: number, his: boolean): Promise<void> => {
    await toPlay();
    for (let i = ctx.world.stats.freed; i < freed; i++) ev.emit('enemy/freed', { x: 0, y: 0, z: 0, id: 'bider#' + i, encounter: '', cause: 'crown', counted: true });
    const stats: RunStats = { ...ctx.world.stats, playSeconds: 1187, roundsFired: 96, roundsHit: 71, knotsBurst: 23, linesOfThree: 2, cleanSix: !his, secrets: his ? ['sec_loft_bell'] : ['sec_loft_bell', 'sec_cold_bay'], felled: 31, tookStoneRound: his };
    ctx.state.request('ending', 'sandbox');
    ev.emit('ending/card', { stats });
  };

  // ---- the buttons
  const entries: Entry[] = [];
  const add = (group: string, label: string, run: Run): void => { entries.push({ group, label, run }); };
  add('state', 'play', toPlay);
  add('state', 'full cylinder', () => setWeapon(['lead', 'lead', 'lead', 'lead', 'lead', 'lead'], 18, 0));
  add('ring', 'fire', fire);
  add('ring', 'reload round', reloadRound);
  add('ring', 'empty', () => setWeapon([], 24, ctx.player.weapon.lineRounds));
  add('ring', 'line round', () => { const c = cyl().slice(); c[0] = 'line'; setWeapon(c, ctx.player.weapon.reserve, 1); ev.emit('weapon/line', { stage: 'loaded', held: 1 }); });
  add('ring', 'line pips 2', () => setWeapon(cyl().slice(), ctx.player.weapon.reserve, 2));
  add('ring', 'kept chambered', () => { const c = cyl().slice(); c[0] = 'kept'; setWeapon(c, ctx.player.weapon.reserve, ctx.player.weapon.lineRounds); ctx.player.debug.setSeventh('chambered'); ev.emit('weapon/kept', { stage: 'chambered', mark: '' }); });
  add('ring', 'aim legal', () => { legal = !legal; });
  for (const s of SEVENTH_STATES) add('seventh', s, () => { ctx.player.debug.setSeventh(s); ev.emit('weapon/seventh', { state: s }); });
  add('seventh', 'denied (shiver)', () => ev.emit('weapon/kept', { stage: 'denied', mark: '' }));
  for (const o of OUTCOMES) add('marker', o, () => hit(o));
  for (let d = 0; d < 360; d += 45) add('damage arc', String(d), () => arc(d));
  for (const hp of [100, 80, 50, 30, 20, 8]) add('health', 'hp ' + hp, () => ctx.player.debug.setHealth(hp));
  add('health', 'regen on', () => { const hp = ctx.player.health; ev.emit('player/health_segment', { segment: hp > 67 ? 2 : hp > 34 ? 1 : 0, regenerating: true }); });
  add('health', 'regen off', () => { for (const segment of [0, 1, 2] as const) ev.emit('player/health_segment', { segment, regenerating: false }); });
  for (const p of ['idle', 'parley', 'p1', 'p2', 'p3a', 'p3b', 'dead'] as const) add('boss', p, () => boss(p));
  add('boss', 'pip -1', () => setBoss({ pips: Math.max(0, ctx.enemies.boss.pips - 1) }));
  add('boss', 'pip +1 (relight)', () => setBoss({ pips: Math.min(26, ctx.enemies.boss.pips + 1) }));
  add('boss', 'pips 0', () => setBoss({ pips: 0 }));
  add('subtitle', 'narrator', () => say(firstOf('narrator')));
  add('subtitle', 'narrator long', () => say(longest('narrator')));
  add('subtitle', 'station', () => say(firstOf('station')));
  add('subtitle', 'station long', () => say(longest('station')));
  add('subtitle', 'reeve', () => say(firstOf('reeve')));
  add('subtitle', 'end', () => ev.emit('story/line_end', { key: '' }));
  for (const size of ['S', 'M', 'L', 'XL'] as const) add('subtitle', 'size ' + size, () => ctx.options.set('subtitleSize', size));
  for (const bg of [0, 0.6, 1]) add('subtitle', 'backing ' + bg * 100, () => ctx.options.set('subtitleBackground', bg));
  add('caption', 'caption', () => caption('cap_bider_rattle'));
  add('caption', 'caption 2', () => caption('cap_station_chime'));
  for (const kind of PROMPT_KINDS) add('prompt', kind, () => ev.emit('interact/focus', { id: 'ia_sandbox', prompt: PROMPT_OF[kind], kind }));
  add('prompt', 'clear', () => ev.emit('interact/focus', { id: '', prompt: '', kind: '' }));
  for (const k of HINT_KEYS) add('hint', k.replace('ui_hint_', '').replace('ui_prompt_', 't3 '), () => ev.emit('ui/hint', { key: k, show: true }));
  add('hint', 'clear', () => ev.emit('ui/hint', { key: '', show: false }));
  add('checkpoint', 'saved', () => ev.emit('checkpoint/saved', { id: 'cp_tally_hatch', movement: 3, section: 2 }));
  for (const k of CARDS) add('card', k.replace('card_', ''), () => card(k));
  // pass i2: the work at hand, in play (five seconds under the checkpoint numeral), and the name of the line dot
  for (const k of Object.keys(ctx.data.story.objectives)) add('objective', k.replace('obj_', ''), () => ev.emit('objective/changed', { key: k, text: ctx.data.story.objectives[k] ?? '' }));
  add('ring', 'first line round (the dot is named)', () => { setWeapon(cyl(), ctx.player.weapon.reserve, 0); (ctx.ui as unknown as { update(): void }).update(); setWeapon(cyl(), ctx.player.weapon.reserve, 1); });
  add('screen', 'title (save)', () => toTitle(true));
  add('screen', 'title (no save)', () => toTitle(false));
  add('screen', 'title (Begin over a save)', async () => { await toTitle(true); click('play'); });
  // pass i1: a first Begin shows the story cards (under ?test=1 only when this key holds '0': src/ui/system.ts)
  // (they open on the run's first tick: the page's own loop, or one stepped tick)
  add('screen', 'first Begin (story cards)', async () => { await toTitle(false); window.localStorage.setItem('keepseven.ui.story_seen.v1', '0'); click('play'); await flowIdle(); });
  add('card', 'a fight starts (the card gives way)', () => ev.emit('enemy/telegraph', { x: 0, y: 0, z: -6, id: 'sandbox#1', kind: 'tamper', attack: 'charge', seconds: 0.9 }));
  add('screen', 'story', async () => { await toTitle(true); click('story'); });
  add('screen', 'credits', async () => { await toTitle(true); click('credits'); });
  add('screen', 'options (title)', async () => { await toTitle(true); click('options'); });
  add('screen', 'pause', async () => { await toPlay(); ctx.state.request('paused', 'pause', 'menu'); });
  add('screen', 'options (pause)', async () => { await toPlay(); ctx.state.request('paused', 'pause', 'menu'); click('options'); });
  add('screen', 'click to resume', async () => { await toPlay(); ctx.state.request('paused', 'focus_lost', 'focus_lost'); });
  for (const id of Object.keys(ctx.data.story.readables)) add('readable', id.replace('rd_', ''), () => readable(id));
  add('screen', 'death', async () => { await toPlay(); ctx.player.debug.setHealth(0); });
  add('screen', 'loading', async () => { await toPlay(); ctx.state.request('paused', 'sandbox', 'menu'); ctx.state.request('loading', 'sandbox'); ev.emit('load/progress', { loaded: 5, total: 8, label: 'sandbox' }); });
  // pass i1: the boot's own two sets, one after the other (the line never goes back)
  add('screen', 'loading (boot: always, then surface 3 of 8)', async () => { await toPlay(); ctx.state.request('paused', 'sandbox', 'menu'); ctx.state.request('loading', 'sandbox'); ev.emit('load/progress', { loaded: 4, total: 4, label: 'always' }); ev.emit('load/progress', { loaded: 3, total: 8, label: 'surface' }); });
  add('screen', 'end (9 lamps)', () => end(0, false));
  add('screen', 'end (48 lamps, his)', () => end(39, true));
  add('variant', 'reduce motion', () => ctx.options.set('reduceMotion', !ctx.options.value.reduceMotion));
  add('variant', 'reduce flashes', () => ctx.options.set('reduceFlashes', !ctx.options.value.reduceFlashes));
  add('variant', 'subtitles', () => ctx.options.set('subtitles', !ctx.options.value.subtitles));
  add('variant', 'captions', () => ctx.options.set('captions', !ctx.options.value.captions));
  for (const bg of ['glare', 'dark', 'mid']) add('variant', 'bg ' + bg, () => setBackdrop(bg));
  add('variant', 'ride dark', () => ev.emit('ride/state', { id: 'ride_lift_hall', stage: 'started', seconds: 25 }));
  add('variant', 'ride end', () => ev.emit('ride/state', { id: 'ride_lift_hall', stage: 'ended', seconds: 25 }));

  // ---- the scripted timeline: one of everything, on the fixed tick (so it replays the same under __dbg.step)
  const timeline: (readonly [number, Run])[] = [];
  let t = 30;
  const at = (gap: number, run: Run): void => { t += gap; timeline.push([t, run]); };
  at(0, () => { setWeapon(['lead', 'lead', 'lead', 'lead', 'lead', 'lead'], 18, 0); card('card_i'); });
  at(240, () => say(firstOf('narrator')));
  for (let i = 0; i < 6; i++) at(i === 0 ? 150 : 32, () => { fire(); hit(OUTCOMES[i % OUTCOMES.length] as HitOutcome); });
  at(40, () => ev.emit('story/line_end', { key: '' }));
  for (let i = 0; i < 6; i++) at(18, reloadRound);
  at(30, () => { const c = cyl().slice(); c[0] = 'line'; setWeapon(c, ctx.player.weapon.reserve, 1); caption('cap_locker_chime'); });
  at(40, () => { fire(); hit('kill', 0); });
  at(3, () => hit('freed', 1));
  at(3, () => hit('kill', 2));
  for (let d = 0; d < 360; d += 45) at(24, () => arc(d));
  at(30, () => { ev.emit('checkpoint/saved', { id: 'cp_tally_hatch', movement: 3, section: 2 }); say(firstOf('station')); });
  at(120, () => { ev.emit('interact/focus', { id: 'ia_sandbox', prompt: 'ui_prompt_read', kind: 'read' }); ev.emit('ui/hint', { key: 'ui_hint_reload', show: true }); });
  at(120, () => { ev.emit('interact/focus', { id: '', prompt: '', kind: '' }); ev.emit('ui/hint', { key: '', show: false }); ev.emit('story/line_end', { key: '' }); boss('p1'); });
  for (let i = 25; i >= 0; i--) at(6, () => setBoss({ pips: i }));
  at(20, () => { boss('p3a'); setBoss({ pips: 2 }); ctx.player.debug.setSeventh('pulse'); });
  at(40, () => setBoss({ pips: 6 }));
  at(60, () => ev.emit('weapon/kept', { stage: 'denied', mark: '' }));
  at(60, () => { const c = cyl().slice(); c[0] = 'kept'; setWeapon(c, ctx.player.weapon.reserve, 0); ctx.player.debug.setSeventh('chambered'); });
  at(60, () => { legal = true; });
  at(60, () => { fire(); legal = false; boss('p3b'); });
  at(120, () => boss('dead'));
  let started = -1, cursor = 0, lastTick = -1;
  sb.onFrame(() => {
    if (compactAt >= 0 && ctx.clock.tick >= compactAt) { compactAt = -1; compact(); }
    if (started < 0) return;
    const tick = ctx.clock.tick;
    if (tick === lastTick || ctx.state.current !== 'playing') return;
    lastTick = tick;
    while (cursor < timeline.length && (timeline[cursor] as readonly [number, Run])[0] <= tick - started) void (timeline[cursor++] as readonly [number, Run])[1]();
    if (cursor >= timeline.length) started = -1;
  });
  add('state', 'timeline', async () => { await toPlay(); started = ctx.clock.tick; cursor = 0; });

  // ---- the panel
  const panel = document.createElement('div');
  panel.id = 'uisb';
  const handle = document.createElement('button');
  handle.id = 'uisb-handle'; handle.type = 'button'; handle.textContent = 'panel (`)';
  const hidden = params.get('panel') === '0' || (ctx.flags.test && params.get('panel') !== '1');
  if (hidden) { panel.classList.add('hidden'); handle.classList.add('hidden'); }
  handle.addEventListener('click', () => panel.classList.toggle('hidden'));
  window.addEventListener('keydown', (e) => { if (e.code === 'Backquote') panel.classList.toggle('hidden'); });
  let group = '';
  for (const entry of entries) {
    if (entry.group !== group) { group = entry.group; const h = document.createElement('h4'); h.textContent = group; panel.appendChild(h); }
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = entry.label;
    b.addEventListener('click', (e) => { e.stopPropagation(); void entry.run(); });
    panel.appendChild(b);
  }
  document.body.appendChild(panel);
  document.body.appendChild(handle);

  ctx.debug.register('uisb', {
    /** the labels, as 'group/label' */
    list: (() => entries.map((e) => e.group + '/' + e.label)) as (...args: never[]) => unknown,
    /** press a button by 'group/label' (or by label when it is unique); resolves when its flow jobs have settled */
    run: (async (name: string) => {
      const entry = entries.find((e) => e.group + '/' + e.label === name) ?? entries.find((e) => e.label === name);
      if (!entry) throw new Error(`uisb.run: no button '${name}'`);
      await entry.run();
      await flowIdle();
    }) as (...args: never[]) => unknown,
    backdrop: ((name: string) => setBackdrop(name)) as (...args: never[]) => unknown,
    weapon: ((chambers: ChamberState[], reserve: number, line: number) => setWeapon(chambers, reserve, line)) as (...args: never[]) => unknown,
    fire: (() => fire()) as (...args: never[]) => unknown,
    /** close up the chambers now (what the end of the fire_kept clip does) */
    compact: (() => { compactAt = -1; compact(); }) as (...args: never[]) => unknown,
    reloadRound: (() => reloadRound()) as (...args: never[]) => unknown,
    arc: ((deg: number) => arc(deg)) as (...args: never[]) => unknown,
    legal: ((on: boolean) => { legal = on; }) as (...args: never[]) => unknown,
  });
  // the hook copied `ext` before this ran when it was installed first: put the helpers on it directly as well
  if (sb.hook && !sb.hook.ext.uisb) (sb.hook.ext as Record<string, unknown>).uisb = (ctx.debug as unknown as { ext: Record<string, unknown> }).ext.uisb;
}

/** ?scene=seventh / ?scene=mark: evidence sheets drawn with the UI's own glyph code, enlarged. */
function sheet(kind: 'seventh' | 'mark'): void {
  const host = document.getElementById('sheet') as HTMLElement;
  host.classList.add('on');
  const numerals: string[] = [];
  for (let n = 0; n < 100; n++) numerals.push(String(n));
  const figure = (caption: string): HTMLElement => {
    const f = document.createElement('figure');
    const frame = document.createElement('div');
    frame.className = 'k7';
    f.appendChild(frame);
    const c = document.createElement('figcaption');
    c.textContent = caption;
    f.appendChild(c);
    host.appendChild(f);
    return frame;
  };
  const widget = (frame: HTMLElement, scale: number, state: SeventhState, chambers: readonly ChamberState[]): MarkWidget => {
    const w = new MarkWidget(frame, 'mark', numerals);
    (w.root as unknown as HTMLElement).style.cssText = `--mk:${scale}px;--mki:1;width:${88 * scale}px;height:${128 * scale}px`;
    w.setCylinder(chambers); w.setReserve(18); w.setLineRounds(0); w.setSeventh(state);
    return w;
  };
  if (kind === 'seventh') {
    for (const s of SEVENTH_STATES) widget(figure(s), 2.2, s, s === 'chambered' ? ['kept', 'lead', 'lead', 'lead', 'lead', 'lead'] : ['lead', 'lead', 'lead', 'lead', 'empty', 'empty']);
    return;
  }
  widget(figure('HUD: six chambers at 0 + 60n (chamber 0 under the notch), hairline to the seventh, lower right'), 4, 'sealed', ['lead', 'lead', 'lead', 'lead', 'lead', 'lead']);
  const frame = figure('Pellam mark, ART_BIBLE 5.6: six open discs at 30 + 60n, a plumb stroke, a solid seventh');
  const mark = pellamMark(frame, 'pm', 0.07);
  (mark as unknown as HTMLElement).style.cssText = 'height:420px;width:273px;margin:0';
  const small = figure('the title glyph at 28 px (1080p)');
  const glyph = pellamMark(small, 'pm', 0);
  (glyph as unknown as HTMLElement).style.cssText = 'height:28px;width:18.2px;margin:0';
}

const sandbox = await createSandbox({
  piece: 'ui',
  systems: { ui: createUiSystem },
  scene: {
    hud: async (sb) => { await sb.start('cp_lip_start'); },
    title: () => undefined,
    seventh: () => sheet('seventh'),
    mark: () => sheet('mark'),
  },
});
build(sandbox);
