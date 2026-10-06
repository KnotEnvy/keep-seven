// src/ui/dom: the few DOM helpers the UI is built with. Text reaches the page only through setText / keyed().
import type { TextToken } from './text.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: Element | null): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls !== '') node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

export function svg(tag: string, attrs: Readonly<Record<string, string | number>>, parent: Element | null, cls = ''): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const name of Object.keys(attrs)) node.setAttribute(name, String(attrs[name]));
  if (cls !== '') node.setAttribute('class', cls);
  if (parent) parent.appendChild(node);
  return node;
}

/** Writes only when the text differs. */
export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** One class on or off; no write when it already is. */
export function flag(node: Element, name: string, on: boolean): void {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}

/** Replace a node's content with tokens: plain text, and each key name in its own outlined square. */
export function keyed(node: Element, tokens: readonly TextToken[]): void {
  node.textContent = '';
  for (const t of tokens) {
    if (!t.key) { node.appendChild(document.createTextNode(t.text)); continue; }
    const k = el('span', 'key', node);
    k.textContent = t.text;
  }
}

/** A line glyph drawn twice: a wider ink stroke under the visible one (the 1 px outline of ART_BIBLE 10). */
export function inked(tag: string, attrs: Readonly<Record<string, string | number>>, parent: Element, cls: string): SVGElement {
  svg(tag, attrs, parent, 'ink ' + cls);
  return svg(tag, attrs, parent, cls);
}

let lastX = -1, lastY = -1;
/**
 * True when the pointer really moved since the last call. A browser also sends mouse events when the page changes under
 * a pointer that is standing still (a tab switched, a row redrawn): those must not steal the keyboard's selection.
 */
export function pointerMoved(e: MouseEvent): boolean {
  if (e.clientX === lastX && e.clientY === lastY) return false;
  lastX = e.clientX; lastY = e.clientY;
  return true;
}
