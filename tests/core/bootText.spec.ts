// The boot-failure card says plain words (polish round 3, robustness): never an asset id, a path or an exception text.
import { describe, expect, it } from 'vitest';
import { bootFailureText } from '../../src/core/debugHook.ts';

describe('bootFailureText', () => {
  it('a file that would not come is a connection line', () => {
    const line = bootFailureText(new Error("asset 'env_the_lip': file assets/env/env_the_lip.glb failed to load"), true);
    expect(line).toBe('KEEP SEVEN could not start. A file it needs would not load. Check the connection. Reload the page to try again.');
  });
  it('anything else is the generic line: the exception text stays in the console', () => {
    const line = bootFailureText(new RangeError('Offset is outside the bounds of the DataView'), true);
    expect(line).toBe('KEEP SEVEN could not start. Reload the page to try again.');
    expect(bootFailureText('TypeError: x is not a function\n at y', true)).not.toMatch(/TypeError|function/);
  });
  it('no WebGL 2 keeps its own line', () => {
    expect(bootFailureText(new Error('whatever'), false)).toMatch(/WebGL 2/);
  });
});
