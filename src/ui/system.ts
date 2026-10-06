// src/ui/system: the UI system (ARCHITECTURE 3.5: event-driven; nobody calls it). It owns which screen is up, turns
// `game/state` and the story events into screens and HUD states, and emits only `ui/screen`, `ui/action` and the three
// `audio/cue`s of a menu. It holds nothing that must survive a reload: everything comes from `ctx` and events.
//
// The run flow is core's: a menu item emits `ui/action` and, inside the same click or key press, calls audio.unlock()
// and input.requestPointerLock() when the action leads to play. The click that drives a menu is never a gameplay press
// (core drops the edges), so there is no code for that here.
import './ui.css';
import { FIXED_DT } from '../core/contracts.ts';
import type {
  DebugSnapshot, GameContext, GameEvents, Options, RunStats, SeventhState, StoryKey, UiScreen, UiSystem,
} from '../core/contracts.ts';
import { el, flag, setText } from './dom.ts';
import { Hud } from './hud.ts';
import { MARK_MIN_SCALE, MarkWidget, pellamMark } from './mark.ts';
import { MenuList, Reader } from './menu.ts';
import { OptionsScreen, repairBindings } from './optionsScreen.ts';
import { clockTime, format, roman, uiOr, useStoryUi } from './text.ts';

type UiAction = GameEvents['ui/action']['action'];
type Cue = 'ui_move' | 'ui_select' | 'ui_back';
type VisibleText = ReturnType<UiSystem['visibleText']>;

/** screens that own the keyboard (gameplay input is off while one is up) */
const MODAL: Readonly<Record<UiScreen | '', boolean>> = {
  '': false, title: true, story: true, options: true, credits: true, loading: false, pause: true, readable: true, death: false, end: true, click_to_resume: true,
};
/** actions that end in play: the gesture that asks for them also unlocks audio and takes the pointer */
const LEADS_TO_PLAY: Readonly<Record<UiAction, boolean>> = { play: true, continue: true, resume: true, restart_checkpoint: true, again: true, quit_to_title: false };
/** GDD 12.3: `pulse` reads as sealed, `chambered` as broken (the band is broken and the round is in the gun) */
const SEVENTH_LABEL: Readonly<Record<SeventhState, StoryKey>> = {
  sealed: 'ui_seventh_sealed', pulse: 'ui_seventh_sealed', band_broken: 'ui_seventh_broken', chambered: 'ui_seventh_broken', spent: 'ui_seventh_spent', violet: 'ui_seventh_violet',
};
const SIZE_CLASS: Readonly<Record<Options['subtitleSize'], string>> = { S: 'sub-S', M: 'sub-M', L: 'sub-L', XL: 'sub-XL' };
/** screens drawn as a full page over the game: the frozen subtitle, caption and crosshair do not show through them */
const FULL_PAGE: Readonly<Record<UiScreen | '', boolean>> = {
  '': false, title: false, story: true, options: true, credits: true, loading: false, pause: false, readable: false, death: false, end: false, click_to_resume: false,
};
/** the paper sheets: a key that was already down when one opened (the E that opened a note) never turns its cards */
const SHEET: Readonly<Record<UiScreen | '', boolean>> = {
  '': false, title: false, story: true, options: false, credits: true, loading: false, pause: false, readable: true, death: false, end: false, click_to_resume: false,
};
/**
 * The end card's reveal (ui.css `.lrow` / `.end .menu`): rows light from 0.9 s, one every 0.38 s; the menu's fade starts
 * at row 9.6 and lasts 0.5 s. Its items answer only once they are half faded in, so a key pressed while the rows are
 * still lighting cannot start a run nobody was shown the choice of. Counted in fixed ticks (the ending runs the sim).
 */
export const END_ROW_DELAY = 0.9;
export const END_ROW_STEP = 0.38;
export const END_MENU_ROW = 9.6;
export const END_MENU_FADE = 0.5;
export const END_MENU_READY_SECONDS = END_ROW_DELAY + END_MENU_ROW * END_ROW_STEP + END_MENU_FADE / 2;
/** mouse buttons as input codes (the names core's Input uses), so a press allocates nothing */
const MOUSE_CODE: readonly string[] = ['Mouse0', 'Mouse1', 'Mouse2', 'Mouse3', 'Mouse4'];
const LAMP_GLYPHS = 48;
const SECRETS_TOTAL = 2;
const LEDGER: readonly (readonly [string, StoryKey])[] = [
  ['time', 'ui_end_time'], ['rounds', 'ui_end_rounds'], ['accuracy', 'ui_end_accuracy'], ['knots', 'ui_end_knots'],
  ['lines', 'ui_end_lines'], ['clean_six', 'ui_end_clean_six'], ['secrets', 'ui_end_secrets'],
];

class UiSystemImpl implements UiSystem {
  readonly id = 'ui' as const;
  modalOpen = false;
  screen: UiScreen | '' = '';

  private built = false;
  private frame!: HTMLDivElement;
  private hud!: Hud;
  private readonly nodes = {} as Record<UiScreen, HTMLElement>;
  private titleMenu!: MenuList;
  /** Begin over a stored save asks first (polish round 5): its own column, in place of the title's */
  private askMenu!: MenuList;
  private askBox!: HTMLDivElement;
  /** the stored count beside "Go on", on the title and in the question ("V · 1") */
  private readonly storedCount: HTMLSpanElement[] = [];
  private asking = false;
  private pauseMenu!: MenuList;
  private endMenu!: MenuList;
  private reader!: Reader;
  private options!: OptionsScreen;
  private loadBar!: HTMLElement;
  private pauseMark!: MarkWidget;
  private objectiveText!: HTMLDivElement;
  private seventhLabel!: HTMLDivElement;
  private lineLegend!: HTMLDivElement;
  private readonly ledgerValues: Record<string, HTMLElement> = {};
  private readonly lamps: HTMLElement[] = [];
  private lampCount!: HTMLElement;

  /** where Back on the options screen returns to */
  private optionsFrom: 'title' | 'pause' = 'title';
  /** key of the readable the world opened ('' when none is up) */
  private readableKey: StoryKey = '';
  private endShown = false;
  /** the pointer lock arrived during this stretch of play: losing it is the player's Esc (the menu), not a refusal */
  private lockSeen = false;
  private swallowClick = false;
  /** key codes down right now (keydown / keyup on the window; cleared when the window loses focus) */
  private readonly held = new Set<string>();
  /** codes that were down when a sheet opened: their keydowns are ignored until their keyup */
  private readonly heldAtOpen = new Set<string>();
  /** seconds left before the end card's menu answers (fixed ticks) */
  private endLockLeft = 0;
  /** `--mki` as last written (ui.css: the mark's units per screen pixel, when that is more than one) */
  private markInverse = '';

  private readonly off: (() => void)[] = [];
  private readonly screenPayload: GameEvents['ui/screen'] = { screen: 'title', open: false };
  private readonly actionPayload: GameEvents['ui/action'] = { action: 'play' };
  private readonly cuePayload: GameEvents['audio/cue'] = { x: 0, y: 0, z: 0, cue: 'ui_move', positional: false, gain: 1, pitch: 1 };
  private readonly visible: VisibleText = { subtitle: '', speaker: '', caption: '', prompt: '', hint: '', card: '', checkpoint: '' };

  constructor(private readonly ctx: GameContext, private readonly root: HTMLElement) {}

  // =============================================================== lifecycle
  init(): void {
    if (typeof document === 'undefined') return;
    this.build();
    this.subscribe();
    this.fitMark();
    for (const key of ['reduceMotion', 'reduceFlashes', 'subtitles', 'subtitleSize', 'captions'] as const) this.applyOption(key);
    this.healBindings();
    this.sync();
  }

  fixedUpdate(): void {
    if (!this.built) return;
    this.hud.tick();
    if (this.endLockLeft > 0 && (this.endLockLeft -= FIXED_DT) <= 1e-6) { this.endLockLeft = 0; this.endMenu.locked = false; }
  }

  update(): void {
    if (this.built) this.hud.update();
  }

  visibleText(): VisibleText {
    const v = this.visible;
    if (!this.built) return v;
    const hud = this.hud, o = this.ctx.options.value;
    v.subtitle = o.subtitles ? hud.subtitle : '';
    v.speaker = o.subtitles ? hud.speaker : '';
    v.caption = o.captions ? hud.caption : '';
    v.prompt = hud.prompt; v.hint = hud.hint; v.card = hud.card; v.checkpoint = hud.checkpoint;
    return v;
  }

  debugState(): DebugSnapshot {
    if (!this.built) return { screen: this.screen, modal: this.modalOpen };
    return {
      screen: this.screen, modal: this.modalOpen, ...this.visibleText(), hud: this.hud.debug(),
      reader: { key: this.reader.key, card: this.reader.index, cards: this.reader.count },
      lockSeen: this.lockSeen, capturing: this.options.capturing, endLocked: this.endMenu.locked, endLockLeft: +this.endLockLeft.toFixed(4),
      asking: this.asking,
    };
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    if (this.built) this.frame.remove();
    this.built = false;
  }

  // =============================================================== DOM
  private build(): void {
    const { ctx } = this;
    useStoryUi(ctx.data.story.ui);
    const ui = (key: StoryKey): string => ctx.data.ui(key);
    const frame = el('div', 'k7', this.root);
    frame.setAttribute('data-ui', 'keep7');
    this.frame = frame;
    this.hud = new Hud(ctx, frame);
    const screens = el('div', 'screens', frame);
    const move = (): void => this.cue('ui_move');
    const select = (): void => this.cue('ui_select');

    // ---- loading: the word and a brass hairline
    const loading = el('div', 'scr loading', screens);
    setText(el('div', 'load-text', loading), ui('ui_loading'));
    this.loadBar = el('i', '', el('div', 'load-line', loading));
    this.nodes.loading = loading;

    // ---- title: the name and the mark in the dark upper left, the column in the dark lower left
    const title = el('div', 'scr title', screens);
    const head = el('div', 'title-head', title);
    setText(el('h1', 'title-name', head), ui('ui_title'));
    pellamMark(head, 'pm', 0);
    setText(el('div', 'title-sub', head), ui('ui_subtitle'));
    this.titleMenu = new MenuList(title, move, select);
    this.titleMenu.add('play', ui('ui_menu_play'), () => this.begin());
    this.storedCount.push(el('span', 'mi-count', this.titleMenu.add('continue', ui('ui_menu_continue'), () => this.act('continue')).node));
    this.titleMenu.add('story', ui('ui_menu_story'), () => this.openSheet('story'));
    this.titleMenu.add('options', ui('ui_menu_options'), () => this.openOptions('title'));
    this.titleMenu.add('credits', ui('ui_menu_credits'), () => this.openSheet('credits'));
    // Begin over a stored save: the question, then the count she would lose (chosen), Begin, Back. One habitual press
    // of Enter on the title, or two, never throws a run away. Every word is one story.json already had.
    this.askBox = el('div', 'title-ask', title);
    setText(el('div', 'ask-head', this.askBox), ui('ui_menu_play') + '?');
    this.askMenu = new MenuList(this.askBox, move, select);
    this.storedCount.push(el('span', 'mi-count', this.askMenu.add('ask_continue', ui('ui_menu_continue'), () => this.act('continue')).node));
    this.askMenu.add('ask_play', ui('ui_menu_play'), () => this.act('play'));
    this.askMenu.add('ask_back', ui('ui_opt_back'), () => { this.cue('ui_back'); this.ask(false); this.titleMenu.selectId('play'); });
    this.nodes.title = title;

    // ---- pause: the column, the work at hand, the mark three times its size with the seventh named
    const pause = el('div', 'scr scrim pause', screens);
    const col = el('div', 'pause-col', pause);
    setText(el('h2', 'h', col), ui('ui_pause_title'));
    this.pauseMenu = new MenuList(col, move, select);
    this.pauseMenu.add('resume', ui('ui_pause_resume'), () => this.act('resume'));
    this.pauseMenu.add('options', ui('ui_pause_options'), () => this.openOptions('pause'));
    this.pauseMenu.add('restart', ui('ui_pause_restart_cp'), () => this.act('restart_checkpoint'));
    this.pauseMenu.add('quit', ui('ui_pause_quit'), () => this.act('quit_to_title'));
    const side = el('div', 'pause-side', pause);
    setText(el('div', 'side-label', side), ui('ui_pause_objective'));
    this.objectiveText = el('div', 'obj-text', side);
    const numerals: string[] = [];
    for (let n = 0; n < 100; n++) numerals.push(format(ui('ui_hud_reserve'), ctx.options.value.bindings, { n: String(n) }));
    this.pauseMark = new MarkWidget(side, 'mark big', numerals);
    this.seventhLabel = el('div', 'sv-label', side);
    this.lineLegend = el('div', 'line-legend', side);
    el('i', '', this.lineLegend);
    setText(el('span', '', this.lineLegend), ui('ui_hud_line_rounds'));
    this.nodes.pause = pause;

    // ---- click to resume: the pointer was refused or lost without the menu
    const ctr = el('div', 'scr scrim ctr', screens);
    setText(el('div', 'ctr-text', ctr), ui('ui_click_to_start'));
    ctr.addEventListener('click', () => { this.cue('ui_select'); this.act('resume'); });
    this.nodes.click_to_resume = ctr;

    // ---- options
    this.options = new OptionsScreen(ctx, screens, { cueMove: move, cueSelect: select, back: () => this.closeOptions() });
    this.nodes.options = this.options.node;

    // ---- the readable viewer; the story so far and the credits are sheets of the same paper
    this.reader = new Reader(screens, { next: ui('ui_read_next'), close: ui('ui_read_close') }, move, select, () => this.closeSheet());
    this.nodes.readable = this.reader.node;
    this.nodes.story = this.reader.node;
    this.nodes.credits = this.reader.node;

    // ---- death
    const death = el('div', 'scr death', screens);
    setText(el('div', 'death-text', death), ui('ui_death'));
    this.nodes.death = death;

    // ---- end card: a ledger; the lamps set apart; never a count of the felled
    // (the ledger stands on its own panel beside the fire, not over it: ui.css `.end`)
    const end = el('div', 'scr end', screens);
    const panel = el('div', 'end-panel', end);
    setText(el('div', 'end-card', panel), ctx.data.line('card_end').text);
    el('div', 'end-rule', panel);
    const ledger = el('div', 'ledger', panel);
    let i = 0;
    const row = (id: string, label: StoryKey, cls: string): HTMLDivElement => {
      const r = el('div', cls, ledger);
      r.setAttribute('data-row', id);
      r.style.setProperty('--i', String(i++));
      const headRow = cls === 'lrow lamps' ? el('div', 'lamps-head', r) : r;
      setText(el('span', 'lab', headRow), ui(label));
      this.ledgerValues[id] = el('span', 'v', headRow);
      return r;
    };
    for (const [id, label] of LEDGER) row(id, label, 'lrow');
    const lampRow = row('lamps', 'ui_end_lamps', 'lrow lamps');
    this.lampCount = this.ledgerValues.lamps as HTMLElement;
    const grid = el('div', 'lamp-grid', lampRow);
    for (let n = 0; n < LAMP_GLYPHS; n++) this.lamps.push(el('i', 'lamp', grid));
    row('carries', 'ui_end_carries', 'lrow');
    this.endMenu = new MenuList(panel, move, select);
    this.endMenu.add('again', ui('ui_end_again'), () => this.act('again'));
    this.endMenu.add('menu', ui('ui_end_menu'), () => this.act('quit_to_title'));
    this.nodes.end = end;

    this.built = true;
  }

  // =============================================================== events
  private subscribe(): void {
    const { ctx, hud } = this;
    const e = ctx.events;
    const on = this.off;
    on.push(e.on('game/state', (p) => this.onGameState(p)));
    on.push(e.on('load/progress', (p) => { this.loadBar.style.transform = `scaleX(${(p.total > 0 ? Math.min(1, p.loaded / p.total) : 0).toFixed(3)})`; }));
    on.push(e.on('story/line', (p) => hud.onLine(p)));
    on.push(e.on('story/line_end', (p) => hud.onLineEnd(p)));
    on.push(e.on('story/card', (p) => hud.onCard(p)));
    on.push(e.on('story/caption', (p) => hud.onCaption(p)));
    on.push(e.on('objective/changed', () => { if (this.screen === 'pause') this.fillPause(); }));
    on.push(e.on('checkpoint/saved', (p) => hud.onCheckpoint(p)));
    on.push(e.on('interact/focus', (p) => hud.onFocus(p)));
    on.push(e.on('readable/opened', (p) => this.openReadable(p.key)));
    on.push(e.on('ui/hint', (p) => hud.setHint(p.key, p.show)));
    on.push(e.on('combat/hit', (p) => hud.onHit(p)));
    on.push(e.on('player/damaged', (p) => hud.onDamaged(p)));
    on.push(e.on('player/health_segment', (p) => hud.onSegment(p)));
    on.push(e.on('player/respawned', () => { hud.reset(); this.sync(); }));
    on.push(e.on('weapon/fired', (p) => hud.onFired(p)));
    on.push(e.on('weapon/reload', () => hud.onReload()));
    on.push(e.on('weapon/kept', (p) => hud.onKept(p)));
    on.push(e.on('boss/phase', () => hud.onBossPhase()));
    // a new timeline (Begin, Walk it again, Go on: `player/spawned` is the placing of a run, never a respawn)
    on.push(e.on('game/new_run', () => hud.newRun()));
    on.push(e.on('player/spawned', () => hud.newRun()));
    // a movement card gives way to a fight (hud.ts CARD_MIN_SECONDS)
    const threat = (): void => hud.onThreat();
    on.push(e.on('enemy/telegraph', threat));
    on.push(e.on('enemy/attack', threat));
    on.push(e.on('encounter/started', threat));
    on.push(e.on('encounter/wave', threat));
    on.push(e.on('boss/pips', (p) => hud.onBossPips(p)));
    on.push(e.on('ride/state', (p) => hud.onRide(p)));
    on.push(e.on('ending/card', (p) => this.openEnd(p.stats)));
    on.push(e.on('options/changed', (p) => this.applyOption(p.key)));
    on.push(e.on('quality/changed', () => this.options.refresh('graphics')));
    on.push(e.on('input/pointer_lock', (p) => { if (p.locked) this.lockSeen = true; }));

    const key = (ev: KeyboardEvent): void => this.onKey(ev);
    const up = (ev: KeyboardEvent): void => { this.held.delete(ev.code); this.heldAtOpen.delete(ev.code); };
    const blur = (): void => { this.held.clear(); this.heldAtOpen.clear(); };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    on.push(() => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); });
    // while a binding is being captured, a mouse button on the menu is the answer, not a click on what is under it
    const down = (ev: MouseEvent): void => {
      if (!this.options.capturing) { this.swallowClick = false; return; }
      ev.preventDefault(); ev.stopPropagation();
      this.swallowClick = ev.button === 0;                         // only the main button is followed by a click
      ctx.input.injectCode('Mouse' + ev.button, true);
      ctx.input.injectCode('Mouse' + ev.button, false);
    };
    const click = (ev: MouseEvent): void => {
      if (!this.swallowClick) return;
      this.swallowClick = false;
      ev.preventDefault(); ev.stopPropagation();
    };
    // A readable opens with the pointer still locked (taking the cursor out would cost a re-lock, which Chrome refuses
    // for 1.25 s): its Next and Close cannot be clicked then, so the fire button itself turns the card, like E. The
    // button that was down when the sheet opened turns nothing until it has been let go (the same rule as the keys).
    const press = (ev: MouseEvent): void => {
      const code = MOUSE_CODE[ev.button];
      if (code === undefined) return;
      this.held.add(code);
      if (this.screen !== 'readable' || !ctx.input.pointerLocked || this.heldAtOpen.has(code)) return;
      if (ev.button !== 0 && !ctx.options.value.bindings.fire.includes(code)) return;
      // the press is the sheet's and stops here (document, capture phase): were it to go on to core's listener on the
      // canvas, the press that closes the note would arrive after `playing` was entered and be her next shot
      ev.preventDefault(); ev.stopPropagation();
      this.cue('ui_select');
      this.reader.advance();
    };
    const release = (ev: MouseEvent): void => {
      const code = MOUSE_CODE[ev.button];
      if (code !== undefined) { this.held.delete(code); this.heldAtOpen.delete(code); }
    };
    const resize = (): void => this.fitMark();
    document.addEventListener('mousedown', press, true);
    document.addEventListener('mouseup', release, true);
    window.addEventListener('resize', resize);
    on.push(() => { document.removeEventListener('mousedown', press, true); document.removeEventListener('mouseup', release, true); window.removeEventListener('resize', resize); });
    this.frame.addEventListener('mousedown', down, true);
    this.frame.addEventListener('contextmenu', (ev) => ev.preventDefault());
    this.frame.addEventListener('click', click, true);
  }

  private onGameState(e: Readonly<GameEvents['game/state']>): void {
    if (e.to === 'playing') this.lockSeen = this.ctx.input.pointerLocked;
    if (e.to === 'loading' || e.to === 'title') this.hud.reset();
    if (e.to === 'title') this.hud.newRun();
    if (e.to !== 'ending') this.endShown = false;
    if (e.to !== 'paused') this.readableKey = '';
    this.sync();
  }

  /**
   * The ring kick (2 px) and the shiver are screen pixels (GDD 12.2), but they move parts inside the mark's SVG, whose
   * unit is smaller than a pixel under 1080p. `--mki` is the factor that undoes it; it changes only when the window does.
   */
  private fitMark(): void {
    const scale = Math.max(Math.min(window.innerHeight / 1080, window.innerWidth / 1440), MARK_MIN_SCALE);
    const inverse = scale < 1 ? (1 / scale).toFixed(4) : '1';
    if (inverse === this.markInverse) return;
    this.markInverse = inverse;
    this.frame.style.setProperty('--mki', inverse);
  }

  /** The screen and the HUD layers the game state calls for. Sub-screens (options, story, credits) sit on top until Back. */
  private sync(): void {
    if (!this.built) return;
    const state = this.ctx.state;
    let screen: UiScreen | '' = '';
    let gauges = false, fade = false, texts = false;
    switch (state.current) {
      case 'boot': case 'loading': screen = 'loading'; break;
      case 'title': screen = 'title'; break;
      case 'playing': gauges = true; texts = true; if (this.readableKey !== '') screen = 'readable'; break;
      case 'paused':
        gauges = true; texts = true;
        if (state.pauseReason === 'readable' && this.readableKey !== '') screen = 'readable';
        else if (state.pauseReason === 'focus_lost' && !this.lockSeen) screen = 'click_to_resume';
        else screen = 'pause';
        break;
      case 'dead': gauges = true; fade = true; texts = true; screen = 'death'; break;
      case 'ending': texts = true; if (this.endShown) screen = 'end'; break;
      default: break;
    }
    if (gauges) this.hud.update();          // the gauges never show a stale frame: the seventh is right on the first one
    this.hud.setGauges(gauges, fade);
    this.hud.setTexts(texts);
    this.setScreen(screen);
  }

  private setScreen(next: UiScreen | ''): void {
    const prev = this.screen;
    if (prev === next) return;
    const { ctx } = this;
    const sameNode = prev !== '' && next !== '' && this.nodes[prev] === this.nodes[next];
    if (prev === 'title') this.ask(false);                       // the question never outlives the title it was asked on
    if (prev !== '') {
      if (!sameNode) {
        const node = this.nodes[prev];
        flag(node, 'on', false);
        // the ink fades off the respawned game and the line stays a moment longer (ui.css `.death.out`); over any other
        // screen the card is simply gone
        if (prev === 'death') flag(node, 'out', next === '');
      }
      this.screenPayload.screen = prev; this.screenPayload.open = false;
      ctx.events.emit('ui/screen', this.screenPayload);
    }
    this.screen = next;
    if (SHEET[next] && !SHEET[prev]) {
      // a key already down when a sheet opens (the interact press that opened the note, the Enter that chose the story)
      // belongs to what opened it: it turns no card until it has been let go
      this.heldAtOpen.clear();
      for (const code of this.held) this.heldAtOpen.add(code);
    }
    if (next !== '') {
      this.prepare(next);
      const node = this.nodes[next];
      // the line held over the respawned game (`.death.out`) is taken away by any screen that opens meanwhile (a quick
      // pause and quit after a respawn left "She went down" standing on the title)
      flag(this.nodes.death, 'out', false);
      if (next === 'loading') flag(node, 'soft', prev === 'title');      // no hard cut from the live title shot to ink
      flag(node, 'on', true);
      this.screenPayload.screen = next; this.screenPayload.open = true;
      ctx.events.emit('ui/screen', this.screenPayload);
    }
    flag(this.frame, 'full', FULL_PAGE[next]);                  // the options page does not lie over a frozen subtitle
    flag(this.frame, 'veil', next === 'pause' || next === 'click_to_resume');   // nor the pause column and its mark's label
    const modal = MODAL[next];
    if (modal !== this.modalOpen) {
      this.modalOpen = modal;
      flag(this.frame, 'modal', modal);                        // prompts and hints do not show through a menu
      ctx.input.setGameplayEnabled(!modal);
    }
  }

  /** What a screen shows is read when it opens. */
  private prepare(screen: UiScreen): void {
    const { ctx } = this;
    switch (screen) {
      case 'title': {
        // with a save, "Go on" is the item under the player's hand and says where it goes on from
        const stored = ctx.save.readStored();
        this.titleMenu.show('continue', stored !== null);
        if (stored !== null) {
          const count = this.countOf(stored.checkpoint);
          for (const node of this.storedCount) setText(node, count);
          this.titleMenu.selectId('continue');
        } else this.titleMenu.first();
        this.ask(false);
        break;
      }
      case 'pause':
        this.fillPause();
        this.pauseMenu.first();
        if (ctx.input.pointerLocked) ctx.input.exitPointerLock();      // the menu needs the cursor
        break;
      case 'end': {
        this.endMenu.first();
        const reveal = ctx.options.value.reduceMotion ? 0 : END_MENU_READY_SECONDS;   // reduced motion cuts the reveal
        this.endLockLeft = reveal;
        this.endMenu.locked = reveal > 0;
        if (ctx.input.pointerLocked) ctx.input.exitPointerLock();
        break;
      }
      case 'options': this.options.open(); break;
      default: break;
    }
  }

  private fillPause(): void {
    const { ctx } = this;
    const w = ctx.player.weapon;
    setText(this.objectiveText, ctx.data.story.objectives[ctx.world.objective] ?? '');
    this.pauseMark.setCylinder(w.cylinder);
    this.pauseMark.setReserve(w.reserve);
    this.pauseMark.setLineRounds(w.lineRounds);
    this.pauseMark.setSeventh(w.seventh);
    setText(this.seventhLabel, ctx.data.ui(SEVENTH_LABEL[w.seventh]));
    flag(this.lineLegend, 'on', w.lineRounds > 0);
  }

  // =============================================================== the title's question
  /** "Begin": at once on a fresh page; over a stored save it asks first, and only the question's own Begin starts. */
  private begin(): void {
    if (!this.ctx.save.hasStoredSave()) { this.act('play'); return; }
    this.ask(true);
  }
  private ask(on: boolean): void {
    if (on === this.asking) return;
    this.asking = on;
    flag(this.nodes.title, 'asking', on);
    if (on) this.askMenu.selectId('ask_continue');
  }
  /** a checkpoint as the HUD names it when it is saved ("V · 1"): the movement is its zone, the section its place there (as core's flow numbers them) */
  private countOf(id: string): string {
    const data = this.ctx.data, marker = data.marker(id);
    let movement = 1, section = 0;
    if (marker) {
      movement = Math.max(1, data.layout.zones.findIndex((z) => z.id === marker.zone) + 1);
      for (const m of data.layout.markers) {
        if (m.type !== 'checkpoint' || m.zone !== marker.zone) continue;
        section++;
        if (m.id === id) break;
      }
    }
    return format(data.ui('ui_checkpoint'), this.ctx.options.value.bindings, { movement: roman(movement), n: String(Math.max(1, section)) });
  }

  // =============================================================== actions and cues
  private act(action: UiAction): void {
    const { ctx } = this;
    if (LEADS_TO_PLAY[action]) { ctx.audio.unlock(); ctx.input.requestPointerLock(); }
    this.actionPayload.action = action;
    ctx.events.emit('ui/action', this.actionPayload);
  }
  private cue(cue: Cue): void {
    this.cuePayload.cue = cue;
    this.ctx.events.emit('audio/cue', this.cuePayload);
  }

  // =============================================================== sub-screens
  private openOptions(from: 'title' | 'pause'): void {
    this.optionsFrom = from;
    this.setScreen('options');
  }
  private closeOptions(): void {
    this.cue('ui_back');
    // the game may have moved on under the menu (it cannot while paused or on the title; this is the safe way back)
    const state = this.ctx.state.current;
    if ((this.optionsFrom === 'title' && state === 'title') || (this.optionsFrom === 'pause' && state === 'paused')) this.setScreen(this.optionsFrom);
    else this.sync();
    if (this.screen === 'title') this.titleMenu.selectId('options');
    else if (this.screen === 'pause') this.pauseMenu.selectId('options');
  }
  private openSheet(which: 'story' | 'credits'): void {
    const { ctx } = this;
    if (which === 'story') {
      const r = ctx.data.story.readables.rd_backstory;
      if (r) this.reader.open('rd_backstory', r, false);
    } else {
      this.reader.open('ui_credits_body', { title: ctx.data.ui('ui_menu_credits'), body: ctx.data.ui('ui_credits_body') }, false);
    }
    this.setScreen(which);
  }
  private openReadable(key: StoryKey): void {
    const r = this.ctx.data.story.readables[key];
    if (!r) { console.error(`[ui] readable/opened: no readable '${key}' in story.json`); return; }
    this.readableKey = key;
    this.reader.open(key, r, key.startsWith('rd_plate_'));
    this.setScreen('readable');
  }
  /** Close on the sheet: a readable hands the game back to play (world hears the state change); the others go back to the title. */
  private closeSheet(): void {
    if (this.screen === 'readable') {
      this.readableKey = '';
      if (!this.ctx.state.request('playing', 'readable_closed')) this.sync();
      return;
    }
    const from = this.screen;
    this.cue('ui_back');
    this.sync();
    if (this.screen === 'title' && (from === 'story' || from === 'credits')) this.titleMenu.selectId(from);
  }

  private openEnd(stats: Readonly<RunStats>): void {
    const { ctx } = this;
    const v = this.ledgerValues;
    const set = (id: string, text: string): void => { const node = v[id]; if (node) setText(node, text); };
    set('time', clockTime(stats.playSeconds));
    set('rounds', String(stats.roundsFired));
    // "71 of 96": the word is requested (docs/requests/code-ui.md 2.3); until it lands, a slash
    const of = uiOr('ui_end_of', '/');
    set('accuracy', `${stats.roundsHit} ${of} ${stats.roundsFired}`);
    set('knots', String(stats.knotsBurst));
    set('lines', String(stats.linesOfThree));
    set('clean_six', ctx.data.ui(stats.cleanSix ? 'ui_end_yes' : 'ui_end_no'));
    set('secrets', `${stats.secrets.length} ${of} ${SECRETS_TOTAL}`);
    set('carries', ctx.data.ui(stats.tookStoneRound ? 'ui_end_carries_his' : 'ui_end_carries_six'));
    // the only count shown is lamps lit: 9 + freed, clamped to 48 (world.lamps)
    const lamps = Math.max(0, Math.min(LAMP_GLYPHS, Math.round(ctx.world.lamps)));
    setText(this.lampCount, String(lamps));
    for (let i = 0; i < LAMP_GLYPHS; i++) flag(this.lamps[i] as HTMLElement, 'on', i < lamps);
    this.endShown = true;
    this.sync();
  }

  // =============================================================== options
  /**
   * No action is ever left without a key (a stored options blob can carry `fire: []` or `pause: []`, and core's
   * sanitizer accepts it: docs/requests/code-ui.md 4.5). Checked at start and after every change of the bindings.
   */
  private healBindings(): void {
    const healed = repairBindings(this.ctx.options.value.bindings);
    if (healed) this.ctx.options.set('bindings', healed);
  }

  private applyOption(key: keyof Options): void {
    if (!this.built) return;
    if (key === 'bindings') this.healBindings();
    const o = this.ctx.options.value, frame = this.frame;
    switch (key) {
      case 'reduceMotion': flag(frame, 'rm', o.reduceMotion); break;
      case 'reduceFlashes': flag(frame, 'rf', o.reduceFlashes); break;
      case 'subtitles': flag(frame, 'no-sub', !o.subtitles); break;
      case 'captions': flag(frame, 'no-capt', !o.captions); break;
      case 'subtitleSize':
        for (const size of Object.keys(SIZE_CLASS) as Options['subtitleSize'][]) flag(frame, SIZE_CLASS[size], size === o.subtitleSize);
        break;
      default: this.hud.applyOption(key); break;
    }
    this.options.refresh(key);
  }

  // =============================================================== keyboard
  private onKey(e: KeyboardEvent): void {
    this.held.add(e.code);
    const screen = this.screen;
    if (screen === '' || screen === 'loading' || screen === 'death') return;
    // the key that answers a rebinding prompt belongs to core's capture, not to the menu under it
    // (core's listener runs first: by now the capture may already have taken this very event)
    if (this.options.capturing || e.timeStamp <= this.options.captureEndedAt) { e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    const confirm = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
    if (e.repeat && (confirm || code === 'Escape')) { e.preventDefault(); return; }
    // a sheet takes no held key: neither the OS's auto-repeat of E (it would flip a note to its last card and close it
    // before it is read) nor a key that was already down when the sheet opened, until that key has been let go
    if (SHEET[screen] && (e.repeat || this.heldAtOpen.has(code))) { e.preventDefault(); return; }
    // the end card's choice is not live until it has been shown (the rows are still lighting)
    if (screen === 'end' && this.endMenu.locked) { e.preventDefault(); return; }
    let used = true;
    switch (screen) {
      case 'title':
        if (!this.asking) used = this.menuKey(this.titleMenu, code, false);
        else if (code === 'Escape') { this.cue('ui_back'); this.ask(false); this.titleMenu.selectId('play'); }
        else used = this.menuKey(this.askMenu, code, false);
        break;
      case 'pause':
        if (code === 'Escape') { this.cue('ui_back'); this.act('resume'); }
        else used = this.menuKey(this.pauseMenu, code, false);
        break;
      case 'end': used = this.menuKey(this.endMenu, code, true); break;
      case 'click_to_resume':
        if (confirm) { this.cue('ui_select'); this.act('resume'); } else used = false;
        break;
      case 'options':
        if (code === 'Escape') this.closeOptions(); else used = this.options.key(code);
        break;
      case 'story': case 'credits': case 'readable':
        if (code === 'Escape') this.closeSheet();
        else if (confirm || this.ctx.options.value.bindings.interact.includes(code)) { this.cue('ui_select'); this.reader.advance(); }
        else used = this.menuKey(this.reader.menu, code, true);
        break;
      default: used = false; break;
    }
    if (used) e.preventDefault();
  }

  /** Arrows and W / S move (a row also takes left / right and A / D), Enter and Space choose. */
  private menuKey(menu: MenuList, code: string, row: boolean): boolean {
    switch (code) {
      case 'ArrowUp': case 'KeyW': menu.move(-1); return true;
      case 'ArrowDown': case 'KeyS': menu.move(1); return true;
      case 'ArrowLeft': case 'KeyA': if (row) menu.move(-1); return row;
      case 'ArrowRight': case 'KeyD': if (row) menu.move(1); return row;
      case 'Enter': case 'NumpadEnter': case 'Space': menu.activate(); return true;
      default: return false;
    }
  }
}

export function createUi(ctx: GameContext, root: HTMLElement): UiSystem { return new UiSystemImpl(ctx, root); }
