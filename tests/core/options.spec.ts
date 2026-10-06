import { describe, expect, it } from 'vitest';
import type { Options } from '../../src/core/contracts.ts';
import { EventBusImpl } from '../../src/core/events.ts';
import { MemoryStorage, OPTIONS_KEY, OptionsStoreImpl, defaultOptions } from '../../src/core/options.ts';

function make(stored?: unknown): { store: OptionsStoreImpl; storage: MemoryStorage; changed: string[] } {
  const storage = new MemoryStorage();
  if (stored !== undefined) storage.setItem(OPTIONS_KEY, typeof stored === 'string' ? stored : JSON.stringify(stored));
  const events = new EventBusImpl();
  const changed: string[] = [];
  events.on('options/changed', (e) => changed.push(e.key));
  return { store: new OptionsStoreImpl(storage, events), storage, changed };
}

describe('OptionsStore', () => {
  it('has the defaults of GDD 15 and ARCHITECTURE 10.2', () => {
    expect(make().store.value).toEqual({
      sensitivity: 1, invertY: false, fov: 62, headBob: 1, screenShake: 1, reduceMotion: false, reduceFlashes: false,
      subtitles: true, subtitleSize: 'M', subtitleBackground: 0.6, captions: true, difficulty: 'normal', sprintMode: 'hold', fireMode: 'click',
      bindings: {
        forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
        fire: ['Mouse0'], reload: ['KeyR'], line: ['KeyQ'], kept: ['KeyF'], interact: ['KeyE'], sprint: ['ShiftLeft'], jump: ['Space'], pause: ['Escape', 'KeyP'],
      },
      crosshairSize: 1, crosshairColour: '#ffffff', crosshairOutline: true, hints: 'normal', graphics: 'auto', resolutionScale: 1,
      volumeMaster: 0.8, volumeEffects: 1.0, volumeMusic: 0.7,
    } satisfies Options);
  });
  it('set clamps, persists under keepseven.options.v1 and emits options/changed with the key', () => {
    const { store, storage, changed } = make();
    store.set('fov', 200);
    store.set('sensitivity', 0.01);
    store.set('difficulty', 'hard');
    store.set('crosshairColour', '#FF9433');
    expect(store.value.fov).toBe(80);
    expect(store.value.sensitivity).toBe(0.2);
    expect(store.value.difficulty).toBe('hard');
    expect(store.value.crosshairColour).toBe('#ff9433');
    expect(changed).toEqual(['fov', 'sensitivity', 'difficulty', 'crosshairColour']);
    const saved = JSON.parse(storage.getItem(OPTIONS_KEY) as string) as Options;
    expect(saved.fov).toBe(80);
    expect(saved.difficulty).toBe('hard');
  });
  it('ignores values of the wrong kind', () => {
    const { store, changed } = make();
    store.set('difficulty', 'nightmare' as Options['difficulty']);
    store.set('fov', Number.NaN);
    store.set('subtitles', 'yes' as unknown as boolean);
    expect(store.value).toEqual(defaultOptions());
    expect(changed).toEqual([]);
  });
  it('load merges over the defaults, clamps, and drops unknown keys', () => {
    const { store } = make({ fov: 10, volumeMusic: 0.25, hints: 'fast', graphics: 'ultra', bogus: 1, bindings: { fire: ['KeyG'], jump: ['ControlLeft', 'KeyJ', 'KeyK', 'KeyL'] } });
    const v = store.value as Options & { bogus?: number };
    expect(v.fov).toBe(50);
    expect(v.volumeMusic).toBe(0.25);
    expect(v.hints).toBe('fast');
    expect(v.graphics).toBe('auto');                              // an invalid stored value keeps the default
    expect(v.bogus).toBeUndefined();
    expect(v.bindings.fire).toEqual(['KeyG']);
    expect(v.bindings.jump).toEqual(['KeyJ', 'KeyK']);            // Ctrl is never bindable; at most two codes
    expect(v.bindings.forward).toEqual(['KeyW', 'ArrowUp']);      // untouched actions keep their defaults
  });
  it('survives a corrupt store and reset() restores the defaults', () => {
    const { store, changed } = make('{not json');
    expect(store.value).toEqual(defaultOptions());
    store.set('invertY', true);
    store.reset();
    expect(store.value).toEqual(defaultOptions());
    expect(changed.length).toBe(1 + Object.keys(defaultOptions()).length);
  });
});
