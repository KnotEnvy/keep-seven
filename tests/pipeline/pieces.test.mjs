// Who answers for an id: the piece (builder) of every asset and texture, which is where its evidence goes and what
// `--only <piece>` / `asset-status --owner <piece>` select (docs/workorders/README.md 1.1: three orders are split in two).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, OVERLAY, node, buildFixtures } from './common.mjs';
import { loadManifest, pieceOf, select, PIECE_NAMES } from '../../tools/pipeline-lib.mjs';

const M = loadManifest(OVERLAY);

test('pieceOf: every id has one piece, and the split orders divide as the work-order README says', () => {
  const by = {};
  for (const id of [...Object.keys(M.assets), ...Object.keys(M.textures)]) {
    const p = pieceOf(M, id);
    assert.ok(PIECE_NAMES.includes(p), `${id}: '${p}' is a known piece`);
    (by[p] ??= []).push(id);
  }
  assert.deepEqual(by['art-enemies-bider'].sort(), ['bider_felled_static', 'bider_seated_static', 'bider_table_static', 'enemy_bider']);
  assert.deepEqual(by['art-enemies-transit'].sort(), ['enemy_transit', 'proj_stake']);
  assert.deepEqual(by['art-boss-tamper'].sort(), ['enemy_tamper', 'tamper_cold_static']);
  assert.deepEqual(by['art-boss-windlass'].sort(), ['boss_windlass', 'proj_canister']);
  for (const t of ['tx_mask', 'tx_palette', 'tx_palette_emis']) assert.equal(pieceOf(M, t), 'art-props-mech', `${t}: the manifest says props_dress, the script is art-props-mech's`);
  assert.equal(by['art-props-mech'].filter((id) => M.assets[id]).length, 28); assert.equal(by['art-props-dress'].length, 29);
  assert.equal(pieceOf(M, 'tx_gun'), 'art-weapons'); assert.equal(pieceOf(M, 'tx_fx'), 'code-render'); assert.equal(pieceOf(M, 'lm_surface'), 'art-env-exterior');
  assert.equal(pieceOf(M, 'fixture_room'), 'foundation-pipeline'); assert.equal(pieceOf(M, 'no_such_id'), null);
});

test('select: a piece name selects exactly that builder\'s ids; an owner or a split order selects both halves', () => {
  assert.deepEqual(select(M, ['art-boss-tamper']), { assets: ['enemy_tamper', 'tamper_cold_static'], textures: [] });
  assert.deepEqual(select(M, ['art-props-mech']).textures.sort(), ['tx_mask', 'tx_palette', 'tx_palette_emis']);
  assert.deepEqual(select(M, ['art-props-dress']).textures, [], 'art-props-dress never builds the three shared textures');
  assert.equal(select(M, ['art-props-dress']).assets.length, 29);
  assert.equal(select(M, ['boss']).assets.length, 4); assert.equal(select(M, ['art-enemies']).assets.length, 6);
  assert.deepEqual(select(M, ['props_dress']).textures.sort(), ['tx_mask', 'tx_palette', 'tx_palette_emis'], 'the manifest owner still carries them (integrator)');
  assert.throws(() => select(M, ['art-nobody']), /is not an asset id, a texture id, a piece \(/);
  // the Python side follows the same rule (tests/pipeline/fixtures/lib_smoke.py holds manifest.piece_of_id to a table)
});

test('preview-asset writes into the folder of the piece that owns the id, without --piece', () => {
  // a fixture is the pipeline's own: its sheet lands in shots/foundation-pipeline/ (no other piece's folder is touched here)
  buildFixtures();                                                        // the sheet is made from the raw export
  const out = path.join(ROOT, 'shots/foundation-pipeline/fixture_stool_sheet.png');
  fs.rmSync(out, { force: true });
  const r = node(['tools/preview-asset.mjs', 'fixture_stool', '--manifest', OVERLAY]);
  assert.equal(r.code, 0, r.out); assert.ok(fs.existsSync(out), r.out);
  const src = fs.readFileSync(path.join(ROOT, 'tools/preview-asset.mjs'), 'utf8');
  assert.match(src, /const piece = pieceArg \?\? pieceOf\(M, id\)/, 'assets: the piece of the id');
  assert.match(src, /put\(pieceArg \?\? pieceOf\(M, id\)/, 'textures: the piece of the id');
  const bad = node(['tools/preview-asset.mjs', '--textures', 'tx_nothing']);
  assert.equal(bad.code, 2); assert.match(bad.out, /unknown texture 'tx_nothing'/);
});
