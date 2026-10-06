// Typed doors to the few Node APIs the unit tests need. tsconfig lists only "vite/client" types (app code must not see
// Node's globals), so the modules are imported through a string-typed specifier and narrowed here.
export interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  existsSync(path: string): boolean;
}
export interface ChildProcess {
  spawnSync(command: string, args: string[], options: { cwd: string; encoding: 'utf8' }): { status: number | null; stdout: string; stderr: string };
}
export async function nodeFs(): Promise<Fs> { return (await import('node:fs' as string)) as Fs; }
export async function nodeChildProcess(): Promise<ChildProcess> { return (await import('node:child_process' as string)) as ChildProcess; }
/** The repository root (this file is tests/core/nodeApi.ts). */
export const ROOT: string = decodeURIComponent(new URL('../../', import.meta.url).pathname).replace(/\/$/, '');
export const NODE: string = (globalThis as unknown as { process: { execPath: string } }).process.execPath;
