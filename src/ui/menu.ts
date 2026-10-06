// src/ui/menu: the two reusable screen parts: a column (or row) of capitals with one selected item, and the readable
// viewer's sheet. Neither knows the game: the system hands them callbacks.
import type { StoryReadable } from '../core/contracts.ts';
import { el, flag, pointerMoved, setText } from './dom.ts';
import { splitCards } from './text.ts';

export interface MenuItem { node: HTMLDivElement; run: () => void; shown: boolean; id: string }

/** A left-aligned list of capitals; the selected item is brass with a hairline before it. Keyboard and mouse. */
export class MenuList {
  readonly node: HTMLDivElement;
  readonly items: MenuItem[] = [];
  selected = 0;
  /** a locked list shows its selection but answers neither keys nor the mouse (the end card while it is revealed) */
  locked = false;
  constructor(parent: Element, private readonly onMove: () => void, private readonly onSelect: () => void) {
    this.node = el('div', 'menu', parent);
  }
  add(id: string, label: string, run: () => void): MenuItem {
    const node = el('div', 'mi', this.node);
    node.setAttribute('role', 'button');
    node.setAttribute('data-item', id);
    setText(node, label);
    const item: MenuItem = { node, run, shown: true, id };
    const index = this.items.length;
    this.items.push(item);
    node.addEventListener('mousemove', (e) => { if (pointerMoved(e) && !this.locked && item.shown && (this.selected !== index || !node.classList.contains('sel'))) { this.select(index); this.onMove(); } });
    node.addEventListener('click', (e) => { e.stopPropagation(); if (!item.shown || this.locked) return; this.select(index); this.onSelect(); item.run(); });
    return item;
  }
  show(id: string, shown: boolean): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.shown = shown;
    flag(item.node, 'off', !shown);
    if (!shown && this.items[this.selected] === item) this.first();
  }
  select(index: number): void {
    this.selected = index;
    for (let i = 0; i < this.items.length; i++) flag((this.items[i] as MenuItem).node, 'sel', i === index);
  }
  /** select the first shown item */
  first(): void {
    const i = this.items.findIndex((it) => it.shown);
    this.select(i < 0 ? 0 : i);
  }
  selectId(id: string): void {
    const i = this.items.findIndex((it) => it.id === id && it.shown);
    if (i >= 0) this.select(i);
  }
  move(delta: number): void {
    if (this.locked) return;
    const n = this.items.length;
    let i = this.selected;
    for (let step = 0; step < n; step++) {
      i = (i + delta + n) % n;
      if ((this.items[i] as MenuItem).shown) break;
    }
    if (i !== this.selected) { this.select(i); this.onMove(); }
  }
  activate(): void {
    const item = this.items[this.selected];
    if (!item || !item.shown || this.locked) return;
    this.onSelect();
    item.run();
  }
}

const MAX_DOTS = 8;

/**
 * The readable viewer: a bone card with ink serif text, about 60 characters wide, turned 1 degree; a cast plate is an
 * enamel card with ink capitals. Title, then the body in cards (a blank line starts a new card).
 */
export class Reader {
  readonly node: HTMLDivElement;
  readonly menu: MenuList;
  private readonly sheet: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly dots: HTMLElement[] = [];
  private cards: string[] = [''];
  index = 0;
  key = '';

  constructor(parent: Element, labels: { next: string; close: string }, onMove: () => void, onSelect: () => void, private readonly onClose: () => void) {
    this.node = el('div', 'scr reader', parent);
    this.sheet = el('div', 'sheet', this.node);
    this.title = el('div', 'sheet-title', this.sheet);
    this.body = el('div', 'sheet-body', this.sheet);
    const foot = el('div', 'sheet-foot', this.sheet);
    const dots = el('div', 'dots', foot);
    for (let i = 0; i < MAX_DOTS; i++) this.dots.push(el('i', '', dots));
    this.menu = new MenuList(foot, onMove, onSelect);
    this.menu.add('next', labels.next, () => this.next());
    this.menu.add('close', labels.close, () => this.onClose());
  }
  get count(): number { return this.cards.length; }
  get text(): string { return this.cards[this.index] ?? ''; }

  open(key: string, readable: Readonly<StoryReadable>, plate: boolean): void {
    this.key = key;
    this.cards = splitCards(readable.body);
    flag(this.sheet, 'plate', plate);
    setText(this.title, readable.title);
    this.show(0);
  }
  private show(index: number): void {
    this.index = index;
    setText(this.body, this.cards[index] ?? '');
    const n = this.cards.length;
    for (let i = 0; i < MAX_DOTS; i++) {
      const dot = this.dots[i] as HTMLElement;
      flag(dot, 'off', n < 2 || i >= n);
      flag(dot, 'on', i === index);
    }
    const more = index < n - 1;
    this.menu.show('next', more);
    this.menu.selectId(more ? 'next' : 'close');
  }
  /** E, Enter, Space: the next card, or close on the last. */
  advance(): void {
    if (this.index < this.cards.length - 1) this.next(); else this.onClose();
  }
  private next(): void {
    if (this.index < this.cards.length - 1) this.show(this.index + 1);
  }
}
