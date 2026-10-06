# Requests from `art-props` (both halves)

## Polish round 3, fixer for `art-props` (2026-10-04)

Evidence: `shots/r3-fix-art-props/` (`after_*`: the real game, 1280 x 720, Low; `composite_*`: the stone as
`env_far_rim.py` embeds it, rendered from the walker's eye 1.5 m away). Log: `scratch/r3-fix-art-props/NOTES.md`.

What changed in this piece's files (for the closer to mirror into the documents):

| Asset | Change | Documents that still say otherwise |
|---|---|---|
| `prop_rim_stone` | six brass cases 2.6 x life size (105 mm tall) are built into the stone at seats 1-6; seat 7 is the only dark cup. Height of the asset is 0.225 m (slab 0.12) | work order `art-props` row `prop_rim_stone` ("seven shallow seats", 0.9 x 0.12 x 0.5); ART_BIBLE where it describes the stone |
| `rd_note` | all four notes: handwriting strokes in `m_prop`, no ruled lines, no `m_mask` (1 draw call, was 2). `note_stone` lies under seat 1 of the stone, 0.24 m from its marker | work order row `rd_note` ("ruled in graphite (`m_mask`)", materials `m_prop`, `m_mask`); `design/assets.json` `rd_note.materials` may drop `m_mask` (check-glb passes either way) |
| `card_dowser` | COLOR_0 near-black `#15121A` (was `dowser_pale`), as `docs/requests/art-env-exterior.md` row 18 asks under lead ruling R4 | work order row `card_dowser` ("a pale long-coated figure (`#D9D2BF`)"), ART_BIBLE 6.5, GDD 9.3 / 16, `vista_dowser.params.subject`, `nar_dowser_seen` (row 18 lists them) |

Requests:

1. **Closer / pipeline, `tools/gen_assets.mjs`: `prop_rim_stone` `triBudget` 80 -> 240.** At 80 the six cases can
   only be three-sided prisms with a bright cap (75 triangles; they read as brass pegs: `after_stone_1p5m_crop4x.png`).
   The script already holds the better build and switches to it by itself when the manifest says 230 or more:
   six-sided cases with a dark bore and a lit far wall, the slab's two courses and its flake, 230 triangles
   (`composite_rich_1p5m_crop4x.png` against `composite_low_1p5m_crop4x.png`; built with
   `KS_MANIFEST_OVERLAY=scratch/r3-fix-art-props/overlay_rich.json`). The rim cell is far under its bound (16 225
   triangles drawn at the stone). After the change: `node tools/build-assets.mjs --only prop_rim_stone,env_far_rim`.
   The rich build has NOT been through `check-glb` or the zone embed (the budget stops it); `tests/art_props/dress/
   variants.test.mjs` is written to pass on both.
2. **Closer / `code-world`, `tools/gen_assets.mjs` binding `ia_stone_round`: add `scale: 2.6`** (the binding's
   `scale` is read by `src/world/build.ts`). The seventh round is the runtime `prop_cartridge_kept` / `round_violet`
   at life size: 12 mm across, about 5 x 15 px from 1.5 m, its violet band cannot be seen (only the glint sprite marks
   it: `after_stone_1p5m_crop4x.png`). At 2.6 it stands as tall as the six beside it and seat 7's cup (38 mm) fits its
   head. If the take clip (`take_round`) shows the round in the hand, check it there: the hand prop should stay life
   size. This is the part of the critic's issue that is NOT done: nothing in this piece's files draws the seventh.
3. **`art-env-exterior`, `blender/env_exterior/env_far_rim.py` line 568-573 (optional):** the six life-size
   `round_spent` cases the zone embeds in seats 1-6 are now inside the stone's own cases and never seen
   (144 hidden triangles). They can be deleted. If instead the zone should carry the cases, `zone.embed_prop(...,
   scale=2.6)` there and tell this piece to take its own out; do not keep both visible.
4. **`art-env-exterior` / `code-render` (information):** in the critic's frame the note's `m_mask` ink drew as solid
   16 mm bars, not as the 2 mm line of the `strike` region that the standalone viewer shows
   (`shots/art-props-dress/rd_note_game.png` against `shots/r3-story-ux/e5_stand_01_at_stone.png`). The notes no longer
   use `m_mask`, so nothing depends on it now, but any other embedded `m_mask` decal in a zone may have the same fault
   (wrong UVs after the embed, or the mask sampled without alpha at that distance). Not investigated further.
5. **`art-weapons` (information):** the brass of the stone's cases is `#B88A3A` (the palette's `brass`) shading to
   `#D9B463` at the mouth; under the rim's dusk vertex light it displays khaki-gold. If `round_violet` is scaled
   (request 2) its brass will sit beside these.

## Closer, polish round 3 (2026-10-05): decisions on the rows above

| Row | Decision |
|---|---|
| 1 `prop_rim_stone` budget | **Applied.** `tools/gen_assets.mjs` `triBudget` 80 -> 240; the asset rebuilt as the rich build (230 / 240 triangles, 7.6 kB, `check:assets` passes), `env_far_rim` rebuilt with it. Looked at in the real game: `shots/r3-closer/c1_stone_1p5m_crop4x.png` (six hex cases with dark bores, the written note, the seventh) |
| 2 `ia_stone_round` scale | **Applied.** The binding carries `scale: 2.6`; the round stands as tall as the six beside it and its dark band reads from 1.5 m (same frame). The round in the hand (`take_round`) is the view-model's own and stays life size |
| 3 the zone's six life-size cases | **Applied.** Deleted from `blender/env_exterior/env_far_rim.py` (zone 8 116 triangles) |
| 4 `m_mask` ink as bars inside a zone | Open (information). No note uses `m_mask` any more; `rd_note.materials` is `m_prop` in the manifest |
| 5 brass under the dusk light | Noted; the cases read khaki-gold in the frame above. Not changed |
| documents | Mirrored: ART_BIBLE round-3 amendments (7.4 row), GDD 23.6, work-order ruling 28 |
