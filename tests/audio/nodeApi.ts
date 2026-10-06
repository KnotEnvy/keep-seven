// Typed doors to the few Node APIs the audio unit tests need (tsconfig lists only "vite/client" types).
export interface Fs { readFileSync(path: string, encoding: 'utf8'): string }
export async function nodeFs(): Promise<Fs> { return (await import('node:fs' as string)) as Fs; }
/** The repository root (this file is tests/audio/nodeApi.ts). */
export const ROOT: string = decodeURIComponent(new URL('../../', import.meta.url).pathname).replace(/\/$/, '');
