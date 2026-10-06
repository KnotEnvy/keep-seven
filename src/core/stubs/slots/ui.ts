// Core's stand-in for src/ui/index.ts: the same factory over the core stub. tests/harness.mjs `startServer({ pieces })`
// serves or bundles THIS file in place of src/ui/index.ts for every slot that is not named, so a module another
// builder has half written cannot break a page or a production bundle that is not about it. Never imported by the game.
import type { CreateUiSystem } from '../../contracts.ts';
import { createNullUi } from '../nullUi.ts';

export const createUiSystem: CreateUiSystem = (ctx, root) => createNullUi(ctx, root);
