// Entry for `node --test tests/pipeline/` (see tests/run-dir.mjs).
import { importTests } from '../run-dir.mjs';

await importTests(import.meta.url);
