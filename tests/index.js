// Entry for `node --test tests/` (npm run test:e2e): every *.test.mjs of every test directory (see tests/run-dir.mjs).
import { importTests } from './run-dir.mjs';

await importTests(import.meta.url);
