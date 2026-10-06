// Seeded PRNG (mulberry32). The only source of randomness in gameplay code.
import type { Rng } from './contracts.ts';

function hashLabel(label: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // final avalanche so that neighbouring seeds give unrelated streams
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export class Mulberry32 implements Rng {
  private s: number;
  /** the seed this stream (and its forks) derive from: fork() never depends on how many numbers were drawn */
  private root: number;
  private readonly label: string;
  private readonly forks: Mulberry32[] = [];
  constructor(seed: number, label = '') {
    this.root = seed >>> 0;
    this.label = label;
    this.s = label === '' ? this.root : hashLabel(label, this.root);
  }
  get state(): number { return this.s >>> 0; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(n: number): number { return Math.floor(this.next() * n); }
  chance(p: number): boolean { return this.next() < p; }
  fork(label: string): Rng {
    const child = new Mulberry32(this.root, this.label === '' ? label : this.label + '/' + label);
    this.forks.push(child);
    return child;
  }
  /** Reseed this stream and every stream forked from it (debug hook `seed`). */
  reseed(seed: number): void {
    this.root = seed >>> 0;
    this.s = this.label === '' ? this.root : hashLabel(this.label, this.root);
    for (const f of this.forks) f.reseed(seed);
  }
}

export function createRng(seed: number): Mulberry32 { return new Mulberry32(seed); }
