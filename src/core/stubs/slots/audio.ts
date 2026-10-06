// Core's stand-in for src/audio/index.ts: the same factory over the core stub. tests/harness.mjs `startServer({ pieces })`
// serves or bundles THIS file in place of src/audio/index.ts for every slot that is not named, so a module another
// builder has half written cannot break a page or a production bundle that is not about it. Never imported by the game.
import type { CreateAudioSystem } from '../../contracts.ts';
import { createNullAudio } from '../nullAudio.ts';

export const createAudioSystem: CreateAudioSystem = (ctx) => createNullAudio(ctx);
