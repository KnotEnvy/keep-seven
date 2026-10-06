// src/player: the Reeve's body and her gun (docs/workorders/code-player.md). This module exports exactly one factory
// (docs/ARCHITECTURE.md section 5, "Factory summary"); every number lives in ./defs.ts.
import type { CreatePlayerSystem } from '../core/contracts.ts';
import { PlayerSystemImpl } from './system.ts';

export const createPlayerSystem: CreatePlayerSystem = (ctx) => new PlayerSystemImpl(ctx);
