// The game state machine (ARCHITECTURE 3.4).
import type { EventBus, GameEvents, GameState, GameStateMachine, PauseReason } from './contracts.ts';

/** from -> allowed next states. Anything else is refused. */
export const STATE_TABLE: Readonly<Record<GameState, readonly GameState[]>> = {
  boot: ['title'],
  title: ['loading'],
  // 'title' from 'loading': a run that could not be loaded (a save this build cannot apply, a file that would not come)
  loading: ['playing', 'title'],
  playing: ['paused', 'dead', 'ending'],
  paused: ['playing', 'loading', 'title'],
  dead: ['playing', 'loading'],
  ending: ['title', 'loading'],
};
const SIM_RUNNING: Readonly<Record<GameState, boolean>> = {
  boot: false, title: true, loading: false, playing: true, paused: false, dead: true, ending: true,
};

export class GameStateMachineImpl implements GameStateMachine {
  current: GameState = 'boot';
  previous: GameState = 'boot';
  pauseReason: PauseReason = '';
  simRunning = false;
  // one scratch payload per nesting depth: a request made from inside a 'game/state' handler does not rewrite the
  // payload the outer listeners are still reading
  private readonly payloads: GameEvents['game/state'][] = [];
  private depth = 0;
  constructor(private readonly events: EventBus) {}

  request(next: GameState, reason = '', pauseReason: PauseReason = ''): boolean {
    const allowed = STATE_TABLE[this.current];
    if (!allowed.includes(next)) return false;
    this.previous = this.current;
    this.current = next;
    if (next === 'paused') this.pauseReason = pauseReason === '' ? 'menu' : pauseReason;
    this.simRunning = SIM_RUNNING[next];
    let payload = this.payloads[this.depth];
    if (!payload) { payload = { from: 'boot', to: 'boot', reason: '' }; this.payloads[this.depth] = payload; }
    payload.from = this.previous; payload.to = next; payload.reason = reason;
    // While 'game/state' is emitted for a transition OUT of 'paused', pauseReason still holds the reason of the pause
    // that is ending (world reads it to close a readable, ARCHITECTURE 3.5). It is cleared right after.
    this.depth++;
    this.events.emit('game/state', payload);
    this.depth--;
    if (this.current !== 'paused') this.pauseReason = '';
    return true;
  }
}
