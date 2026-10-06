// Entry for `node --test tests/<dir>/` (see tests/run-dir.mjs). Copy this file AS IT IS into any test directory, at any depth
// (tests/player/, tests/art_props/, tests/art_props/mech/): it finds tests/run-dir.mjs from wherever it is, and runs every
// *.test.mjs under its own directory, sub-folders included.
const { importTests } = await import(import.meta.url.replace(/\/tests\/(?!.*\/tests\/).*$/, '/tests/run-dir.mjs'));
await importTests(import.meta.url);
