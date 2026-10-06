// Core's stand-in for src/player/index.ts: the same factory over the core stub. tests/harness.mjs `startServer({ pieces })`
// serves or bundles THIS file in place of src/player/index.ts for every slot that is not named, so a module another
// builder has half written cannot break a page or a production bundle that is not about it. Never imported by the game.
import type { CreatePlayerSystem } from '../../contracts.ts';
import { createDummyPlayer } from '../dummyPlayer.ts';

export const createPlayerSystem: CreatePlayerSystem = (ctx) => createDummyPlayer(ctx);
