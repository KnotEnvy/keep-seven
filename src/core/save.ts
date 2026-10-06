// One save slot (ARCHITECTURE 10.1).
import type { SaveData, SaveStore } from './contracts.ts';
import type { KeyValueStorage } from './options.ts';

export const SAVE_KEY = 'keepseven.save.v1';
export const SAVE_VERSION = 1;

const WORLD_LISTS: readonly string[] = ['encountersCleared', 'pickupsTaken', 'lockersUsed', 'brokenIds', 'onceFlags', 'vignettesSeen'];
function isObject(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }

export class SaveStoreImpl implements SaveStore {
  current: SaveData | null = null;
  /**
   * `isCheckpoint`: true for an id that is a checkpoint marker of this build's layout (the context passes it). A save a
   * build cannot apply is no save: without the check the title offered "Go on" and the click stranded the game on LOADING
   * (polish round 2, robustness).
   */
  constructor(private readonly storage: KeyValueStorage, private readonly isCheckpoint: ((id: string) => boolean) | null = null) {}

  hasStoredSave(): boolean { return this.readStored() !== null; }
  readStored(): SaveData | null {
    let raw: string | null = null;
    try { raw = this.storage.getItem(SAVE_KEY); } catch { return null; }
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as Partial<SaveData> | null;
      if (!data || data.version !== SAVE_VERSION) return null;
      if (typeof data.checkpoint !== 'string' || !isObject(data.player) || !isObject(data.world) || !isObject(data.enemies)) return null;
      if (this.isCheckpoint && !this.isCheckpoint(data.checkpoint)) return null;
      // the shape every system's applySave reads without looking (a save of an older build with the same version number)
      const w = data.world as unknown as Record<string, unknown>;
      if (!isObject(w.doors) || !isObject(w.puzzles) || !isObject(w.stats)) return null;
      for (const key of WORLD_LISTS) if (!Array.isArray(w[key])) return null;
      const p = data.player as unknown as Record<string, unknown>;
      if (!Array.isArray(p.cylinder) || typeof p.health !== 'number' || typeof p.reserve !== 'number') return null;
      if (!Array.isArray((data.enemies as unknown as Record<string, unknown>).statics)) return null;
      return data as SaveData;
    } catch {
      return null;
    }
  }
  commit(data: SaveData): void {
    // round-trip through JSON so `current` never aliases live system state
    const text = JSON.stringify(data);
    this.current = JSON.parse(text) as SaveData;
    try { this.storage.setItem(SAVE_KEY, text); } catch { /* blocked storage: the run still has `current` */ }
  }
  clear(): void {
    this.current = null;
    try { this.storage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}
