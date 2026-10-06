import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/core/contracts.ts';
import { EventBusImpl } from '../../src/core/events.ts';
import { GameStateMachineImpl, STATE_TABLE } from '../../src/core/state.ts';

const ALL: GameState[] = ['boot', 'title', 'loading', 'playing', 'paused', 'dead', 'ending'];

function at(path: GameState[]): { sm: GameStateMachineImpl; log: string[] } {
  const events = new EventBusImpl();
  const log: string[] = [];
  events.on('game/state', (e) => log.push(`${e.from}>${e.to}:${e.reason}`));
  const sm = new GameStateMachineImpl(events);
  for (const s of path) expect(sm.request(s, 'setup'), `setup ${s}`).toBe(true);
  return { sm, log };
}
const ROUTE: Record<GameState, GameState[]> = {
  boot: [], title: ['title'], loading: ['title', 'loading'], playing: ['title', 'loading', 'playing'],
  paused: ['title', 'loading', 'playing', 'paused'], dead: ['title', 'loading', 'playing', 'dead'], ending: ['title', 'loading', 'playing', 'ending'],
};

describe('GameStateMachine', () => {
  it('is the table of ARCHITECTURE 3.4', () => {
    expect(STATE_TABLE).toEqual({
      boot: ['title'], title: ['loading'], loading: ['playing', 'title'], playing: ['paused', 'dead', 'ending'],
      paused: ['playing', 'loading', 'title'], dead: ['playing', 'loading'], ending: ['title', 'loading'],
    });
  });
  it('accepts every transition in the table and refuses everything else', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const { sm, log } = at(ROUTE[from]);
        const before = log.length;
        const ok = sm.request(to, 'test');
        expect(ok, `${from} -> ${to}`).toBe(STATE_TABLE[from].includes(to));
        expect(sm.current).toBe(ok ? to : from);
        expect(log.length).toBe(before + (ok ? 1 : 0));          // every transition emits game/state, a refusal nothing
        if (ok) { expect(log[log.length - 1]).toBe(`${from}>${to}:test`); expect(sm.previous).toBe(from); }
      }
    }
  });
  it('simRunning is true in title, playing, dead and ending only', () => {
    const want: Record<GameState, boolean> = { boot: false, title: true, loading: false, playing: true, paused: false, dead: true, ending: true };
    for (const s of ALL) expect(at(ROUTE[s]).sm.simRunning, s).toBe(want[s]);
  });
  it('keeps the pause reason while paused; a listener still reads it when the pause ends', () => {
    const events = new EventBusImpl();
    const sm = new GameStateMachineImpl(events);
    sm.request('title'); sm.request('loading'); sm.request('playing');
    const seen: string[] = [];
    events.on('game/state', (e) => seen.push(`${e.to}:${sm.pauseReason}`));
    expect(sm.request('paused', 'readable', 'readable')).toBe(true);
    expect(sm.pauseReason).toBe('readable');
    sm.request('playing', 'readable_closed');
    expect(sm.pauseReason).toBe('');
    sm.request('paused', 'pause');
    expect(sm.pauseReason).toBe('menu');                          // the default reason
    expect(seen).toEqual(['paused:readable', 'playing:readable', 'paused:menu']);
  });
  it('a request made inside a game/state handler keeps both payloads intact', () => {
    const events = new EventBusImpl();
    const sm = new GameStateMachineImpl(events);
    sm.request('title'); sm.request('loading'); sm.request('playing');
    const seen: string[] = [];
    events.on('game/state', (e) => { if (e.to === 'paused') sm.request('playing', 'closed_at_once'); });
    events.on('game/state', (e) => seen.push(`${e.from}>${e.to}`));
    sm.request('paused', 'readable', 'readable');
    expect(sm.current).toBe('playing');
    expect(seen).toEqual(['paused>playing', 'playing>paused']);
  });
});
