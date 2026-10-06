#!/usr/bin/env node
// Writes src/core/contracts.ts from the fenced block between <!-- contracts:begin --> and
// <!-- contracts:end --> in docs/ARCHITECTURE.md (section 5), so the code and the document cannot drift.
//   node tools/extract_contracts.mjs [--out <path>] [--check]
// --check exits 1 when the file on disk differs from the document.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const out = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(ROOT, 'src/core/contracts.ts');
const md = fs.readFileSync(path.join(ROOT, 'docs/ARCHITECTURE.md'), 'utf8');
const m = md.match(/<!-- contracts:begin -->\s*```ts\n([\s\S]*?)\n```\s*<!-- contracts:end -->/);
if (!m) { console.error('FAIL: contracts block not found in docs/ARCHITECTURE.md'); process.exit(1); }
const code = m[1] + '\n';
if (args.includes('--check')) {
  const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === code;
  console.log(same ? 'contracts.ts matches docs/ARCHITECTURE.md' : 'FAIL: contracts.ts differs from docs/ARCHITECTURE.md');
  process.exit(same ? 0 : 1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, code);
console.log(`wrote ${path.relative(ROOT, out)} (${code.split('\n').length - 1} lines)`);
