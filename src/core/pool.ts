/** Fixed-capacity object pool with O(1) spawn / free and allocation-free iteration (swap-remove). */
export class Pool<T> {
  readonly items: T[];
  /** items[0 .. count) are alive */
  count = 0;
  constructor(capacity: number, create: (index: number) => T) {
    this.items = [];
    for (let i = 0; i < capacity; i++) this.items.push(create(i));
  }
  get capacity(): number { return this.items.length; }
  /** Returns null when exhausted: the caller decides (drop the effect, or recycle items[0]). */
  spawn(): T | null {
    if (this.count >= this.items.length) return null;
    return this.items[this.count++] as T;
  }
  /** Free the item at index i. Iterate BACKWARDS while freeing: for (let i = pool.count - 1; i >= 0; i--). */
  freeAt(i: number): void {
    if (i < 0 || i >= this.count) return;
    const last = --this.count;
    const t = this.items[i] as T;
    this.items[i] = this.items[last] as T;
    this.items[last] = t;
  }
  /** Free a known item (linear search over the live part). Returns false when it is not alive. */
  free(item: T): boolean {
    for (let i = 0; i < this.count; i++) if (this.items[i] === item) { this.freeAt(i); return true; }
    return false;
  }
  clear(): void { this.count = 0; }
}
