// `node --test tests/<dir>/` on Node 22+ no longer searches a directory: the argument is resolved like a module, so it
// runs that directory's index.js. Each test directory therefore has a three-line index.js that calls this, and the
// documented commands (`node --test tests/core/`, `npm run test:e2e`) work as written.
// The glob form runs the files in parallel processes instead: node --test "tests/core/*.test.mjs".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Imports every *.test.mjs under the directory of `metaUrl` (recursively), in name order. */
export async function importTests(metaUrl) {
  const dir = path.dirname(fileURLToPath(metaUrl));
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.mjs')) files.push(p);
    }
  };
  walk(dir);
  for (const f of files) await import(pathToFileURL(f).href);
  return files;
}
