// Core's stand-in for src/world/index.ts: the same factory over the core stub. tests/harness.mjs `startServer({ pieces })`
// serves or bundles THIS file in place of src/world/index.ts for every slot that is not named, so a module another
// builder has half written cannot break a page or a production bundle that is not about it. Never imported by the game.
import type { CreateWorldSystem } from '../../contracts.ts';
import { createNullWorld } from '../nullWorld.ts';

export const createWorldSystem: CreateWorldSystem = (ctx) => createNullWorld(ctx);
