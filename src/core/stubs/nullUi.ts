// Core stub for the UI slot: no HUD, no menus. It keeps the text the real UI would show (visibleText) and, in a
// sandbox, prints the story and prompt events to a small panel. A readable is closed at once.
// Outside a sandbox it shows one plain text block for the screens that have no game to look at (title, loading,
// paused, dead, ending), every word of it from story.json, so the greybox build says what it is and how to begin.
import type { DebugSnapshot, GameContext, UiScreen, UiSystem } from '../contracts.ts';

const PANEL_LINES = 14;

class NullUi implements UiSystem {
  readonly id = 'ui' as const;
  modalOpen = false;
  screen: UiScreen | '' = '';
  private subtitle = '';
  private speaker = '';
  private caption = '';
  private prompt = '';
  private hint = '';
  private card = '';
  private checkpoint = '';
  private objective = '';
  private panel: HTMLPreElement | null = null;
  private plate: HTMLDivElement | null = null;
  private readonly lines: string[] = [];
  private dirty = false;
  private readonly off: (() => void)[] = [];
  constructor(private readonly ctx: GameContext, private readonly root: HTMLElement) {}

  private print(text: string): void {
    this.lines.push(text);
    if (this.lines.length > PANEL_LINES) this.lines.shift();
    this.dirty = true;
  }

  init(): void {
    const { ctx } = this;
    const e = ctx.events;
    if (ctx.flags.sandbox !== null && typeof document !== 'undefined') {
      this.panel = document.createElement('pre');
      this.panel.id = 'null-ui';
      this.panel.style.cssText = 'position:absolute;right:8px;bottom:8px;margin:0;padding:6px 8px;max-width:46%;background:rgba(0,0,0,0.6);color:#e9e2d0;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;pointer-events:none';
      this.root.appendChild(this.panel);
    }
    if (ctx.flags.sandbox === null && typeof document !== 'undefined') {
      this.plate = document.createElement('div');
      this.plate.id = 'null-ui-screen';
      this.plate.style.cssText = 'position:absolute;left:0;right:0;top:16%;text-align:center;color:#f1e6cf;font:20px/1.5 Georgia,"Times New Roman",serif;text-shadow:0 1px 6px rgba(0,0,0,0.85);white-space:pre-line;pointer-events:none;display:none';
      this.root.appendChild(this.plate);
    }
    this.off.push(e.on('story/line', (p) => { this.subtitle = p.text; this.speaker = p.speaker; this.print(`[line ${p.speaker}] ${p.text}`); }));
    this.off.push(e.on('story/line_end', () => { this.subtitle = ''; this.speaker = ''; }));
    this.off.push(e.on('story/card', (p) => { this.card = p.text; this.print(`[card] ${p.text}`); }));
    this.off.push(e.on('story/caption', (p) => { this.caption = p.text; this.print(`[caption] ${p.text}`); }));
    this.off.push(e.on('interact/focus', (p) => {
      this.prompt = p.prompt === '' ? '' : ctx.data.story.ui[p.prompt] ?? p.prompt;
      if (p.id !== '') this.print(`[focus] ${p.id} (${p.kind})`);
    }));
    this.off.push(e.on('objective/changed', (p) => { this.objective = p.text; this.print(`[objective] ${p.text}`); }));
    this.off.push(e.on('checkpoint/saved', (p) => { this.checkpoint = `${p.id} ${p.movement}.${p.section}`; this.print(`[checkpoint] ${p.id} (${p.movement}.${p.section})`); }));
    this.off.push(e.on('ui/hint', (p) => { this.hint = p.show ? ctx.data.story.ui[p.key] ?? p.key : ''; if (p.show) this.print(`[hint] ${this.hint}`); }));
    // a readable pauses the game; with no viewer to show, close it at once
    this.off.push(e.on('game/state', (p) => {
      this.screen = p.to === 'title' ? 'title' : p.to === 'loading' ? 'loading' : p.to === 'dead' ? 'death' : p.to === 'ending' ? 'end' : p.to === 'paused' ? 'pause' : '';
      this.showScreen();
      if (p.to === 'paused' && ctx.state.pauseReason === 'readable') ctx.state.request('playing', 'readable_closed');
    }));
    if (!ctx.flags.test && ctx.flags.sandbox === null && typeof window !== 'undefined') {
      // there are no menus yet: a click begins (or resumes) the run and takes the pointer, as the real title will
      const onClick = (): void => {
        ctx.input.requestPointerLock();
        ctx.audio.unlock();
        if (ctx.state.current === 'title') ctx.events.emit('ui/action', { action: 'play' });
        else if (ctx.state.current === 'paused') ctx.events.emit('ui/action', { action: 'resume' });
      };
      window.addEventListener('mousedown', onClick);
      this.off.push(() => window.removeEventListener('mousedown', onClick));
    }
    this.off.push(e.on('readable/opened', (p) => this.print(`[readable] ${ctx.data.story.readables[p.key]?.title ?? p.key}`)));
  }

  /** the stand-in for every menu: the screen's words from story.json, or nothing while playing */
  private showScreen(): void {
    if (!this.plate) return;
    const ui = this.ctx.data.story.ui;
    const text = this.screen === 'title' ? `${ui.ui_title}\n${ui.ui_subtitle}\n\n${ui.ui_click_to_start}`
      : this.screen === 'loading' ? ui.ui_loading
        : this.screen === 'pause' ? `${ui.ui_pause_title}\n${ui.ui_click_to_start}`
          : this.screen === 'death' ? ui.ui_death : '';
    this.plate.textContent = text ?? '';
    this.plate.style.display = text ? 'block' : 'none';
  }

  update(): void {
    if (this.dirty && this.panel) { this.panel.textContent = this.lines.join('\n'); this.dirty = false; }
  }

  visibleText(): { subtitle: string; speaker: string; caption: string; prompt: string; hint: string; card: string; checkpoint: string } {
    return { subtitle: this.subtitle, speaker: this.speaker, caption: this.caption, prompt: this.prompt, hint: this.hint, card: this.card, checkpoint: this.checkpoint };
  }
  debugState(): DebugSnapshot {
    return { stub: 'nullUi', screen: this.screen, objective: this.objective, ...this.visibleText() };
  }
  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    if (this.panel) this.panel.remove();
    if (this.plate) this.plate.remove();
  }
}

export function createNullUi(ctx: GameContext, root: HTMLElement): UiSystem { return new NullUi(ctx, root); }
