// src/ui: the HUD, the menus and every word the player reads (docs/workorders/code-ui.md). DOM only: no three.js, no
// canvas, no fonts or images fetched. It exports exactly this one factory (docs/ARCHITECTURE.md section 5).
import type { CreateUiSystem } from '../core/contracts.ts';
import { createUi } from './system.ts';

export const createUiSystem: CreateUiSystem = (ctx, root) => createUi(ctx, root);
