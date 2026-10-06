// Core's stand-in for src/enemies/index.ts: the same factory over the core stub. tests/harness.mjs `startServer({ pieces })`
// serves or bundles THIS file in place of src/enemies/index.ts for every slot that is not named, so a module another
// builder has half written cannot break a page or a production bundle that is not about it. Never imported by the game.
import type { CreateEnemySystem } from '../../contracts.ts';
import { createNullEnemies } from '../nullEnemies.ts';

export const createEnemySystem: CreateEnemySystem = (ctx) => createNullEnemies(ctx);
