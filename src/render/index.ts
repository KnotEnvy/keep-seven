// src/render: the render system (docs/workorders/code-render.md). This module exports exactly one factory.
import type { CreateRenderSystem } from '../core/contracts.ts';
import { RenderSystemImpl } from './system.ts';

export const createRenderSystem: CreateRenderSystem = (ctx, canvas) => new RenderSystemImpl(ctx, canvas);
