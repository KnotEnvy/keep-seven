// Core's stand-in for src/render/index.ts: the same factory over the core stub. tests/harness.mjs `startServer({ pieces })`
// serves or bundles THIS file in place of src/render/index.ts for every slot that is not named, so a module another
// builder has half written cannot break a page or a production bundle that is not about it. Never imported by the game.
import type { CreateRenderSystem } from '../../contracts.ts';
import { createBasicRender } from '../basicRender.ts';

export const createRenderSystem: CreateRenderSystem = (ctx, canvas) => createBasicRender(ctx, canvas);
