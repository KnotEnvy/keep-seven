# Integration report

Ten parts. **Part J** (first below) is the closing pass of polish round 5, the last round of changes: **its gate, fights, numbers, hero frames and known-gaps list (J.1 to J.6) describe the game as handed to the player**, and where it differs from any other part, Part J holds. **Part I** (after it) is the cross-cutting fix and tuning pass that opened polish round 5, the last
round of changes: its gate, fights and numbers (I.1 to I.5) are the current ones for what it measured, and where it
differs from Parts A to H, Part I holds. The round's code and look teams work after it; what they change is in their
own request files. **Part H** is the closing pass of polish round 4 (its hero frames and its known-gaps list H.6 stand
unless I.5 names them). **Part G** is the cross-cutting fix and tuning pass that opened polish round 4. **Part F** is
the closing pass of polish round 3. **Part E** is the cross-cutting fix and tuning pass that opened polish round 3.
**Part D** is the closing pass of polish round 2. **Part C** (at the end) is the cross-cutting fix pass that followed
the first critic panel of polish round 2. **Part A** is the code integration (the real game wired, played, built and
measured; A.1 is how to run and play, A.5 how to drive the real game). **Part B** is the art integration that came
before it (`B.1` to `B.6`: where another document says "INTEGRATION_REPORT section 6" it means B.6).

# Part J. Closing pass, polish round 5 (2026-10-06): the game as handed to the player

The cross-cutting fixer (Part I), the round's code teams (enemies, world, ui, audio, render-tech) and look teams (gun,
exterior-look, underground-look) had finished; this pass decided their request rows, mirrored the documents, confirmed
every asset is built from its final source, ran the whole gate on the final tree one suite at a time, replayed the
plain and careless proxies through the whole stage, measured, and took the hero frames. **No game code, test or design
file was changed in this pass**: the tree the teams left was sound. Evidence: `shots/round-5/` (twelve hero frames +
`hero_sheet.jpg`), `shots/r5-closer/` (every leg's frames), `scratch/r5-closer/` (`NOTES.md`, `gate/`, `perf/`,
`proxy/`, `build_assets.log`, `before/` = the documents as they stood before this pass).
**Memory:** one browser at a time throughout, every suite at `--test-concurrency=1`, every drawn leg in its own
browser from a checkpoint; the watchdog killed nothing in this pass.

## J.0 Run and play

`npm run dev` (the dev page, with the debug hook; `?cp=<checkpoint>` jumps) or `npm run build` and serve `dist/` (the
public page: no debug hook, `?cp=` ignored). Keys and the rest: A.1, unchanged except: the HUD's six-and-one mark is
now **lower left** over the health bars; on the title, with a save, **Go on** is the chosen item and **Begin asks
first**. Driving the real game from a script: A.5; a bot that clicks `[data-item="play"]` over a save must then click
`[data-item="ask_play"]`. Legs started from `cp_boss_p1/p2/p3` have a 4 s lead-in before the first attack.

## J.1 The gate (one command after another, on the final tree; `scratch/r5-closer/gate/summary.txt` and one log each)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout (309 solids, 268 markers), manifest, `contracts.ts` = ARCHITECTURE section 5: pass (run again after the last document edit) |
| `npm run test:unit` | 25 files, 440 pass |
| `node tools/build-assets.mjs`, `npm run check:assets` | 102 items, all up to date (the teams' rebuilds of `weapon_revolver`, `env_far_rim`, `env_backdrop_dusk`, `env_the_bore`, `env_lift_hall` and their lightmaps are the final ones; nothing embeds them); 84 assets, 18 textures, 9.69 MB: all pass |
| `node --test tests/player/` `enemies/` `world/` `render/` | 41, 65, 101, **58** pass, 0 fail (`prewarm` High passes now: paced) |
| `node --test tests/ui/` `audio/` `pipeline/` | 47, 44, 83 pass, 0 fail |
| `node --test tests/art_weapons/` `art_enemies/` `art_boss/` `art_props/` `art_env_interior/` `art_env_exterior/` | 24, 33, 39, 97, 17, 23 pass, 0 fail |
| `node --test tests/core/` (core stubs) | 70 pass, 6 skipped, 0 fail |
| `KEEP7_REAL=all node --test tests/core/` | 76 pass, 0 fail (339 s) |
| `node --test tests/e2e/` | **8 pass**: "Go on" at every checkpoint; the playthrough by input from the title to the end card (**30 378 ticks, 8.2 min of play, 86 rounds, 36 freed, 0 deaths, no god mode, hash `fd5db816`**); the same tick and hash on a second load; the other ending; a death at each of the 17 checkpoints (108 ticks to control); the production bundle booted as the public page with no debug hook; `?cp=` ignored there; the file that will not come |
| `npm run build` | `dist/js/index-*.js` 1 917 164 B (540 kB gzip), CSS 25 375 B, one script; `dist` 105 files, 12 104 234 B = **11.54 MiB of 20** |

## J.2 Seams and requests

No seam needed a code fix. The shared render files three look teams edited at once (`src/render/moods.ts`,
`materials.ts`, `system.ts`, `shared.ts`, `post.ts`, `vfx/vfx.ts`) were checked first: every team's stated entry is in
the file (`L6c` and `rimCage`, `SHEEN`, the bloom fields, `vmKey` / `vmAmb`, L5a `vmK` 1.44, `uSheen`, `DENSE_*`,
`SHADOW_HALF` 26, `AO_LIT`, `rideMuzzle`, `GUN_TOE`, `VM_HANDS` 0.88), unit and `tests/render` are green: no lost or
half-applied edit. `tests/render/moods.spec.ts`, which two teams saw failing mid-round, passes.

| # | File | What |
|---|---|---|
| 1 | `docs/GDD.md` (6.6, 6.8, 7.3, 8.2, 8.3, 9.8, 12.2, 12.3, 15 in place + **23.10**) | every number and behaviour of the round's teams |
| 2 | `docs/ART_BIBLE.md` (10.3 in place + "Amendments, polish round 5"), `docs/ARCHITECTURE.md` (8.1, 8.2, 8.4; nothing in section 5), `docs/LEVEL.md` (7 in place + section 12) | the same |
| 3 | `docs/requests/*.md` (nine files) | a "Closer, polish round 5" decision table at the end of each |

**Ruled, not applied:** the moot rule for `stn_boss_hauling` / `stn_boss_indexing` after the kill (a guard for a case
nobody has seen); pacing inside the shared e2e bot's `step()`; the `env_backdrop_dusk` note in `design/assets.json`
(frozen data; it would rebuild 102 assets for a note). **Accepted:** the gun team's edit of
`tests/render/polish3.test.mjs` and render-tech's of `tests/player/flash.test.mjs` (no bound relaxed).

## J.3 The fights (Normal, final tree; `scratch/r5-closer/proxy/w_*`, `whole_summary.txt`)

Three plain and three careless runs through the whole stage. **Each run is nine legs, each in a fresh browser from a
checkpoint** (the memory rule), so every leg starts on full health with 6 + 24 rounds: what a hurt arrival costs is
not in these numbers, except in one run that by accident played from the gallery bay to the end card in one page
(`w_p1_L4_ranon`, last row). "Plain": 0.45 s to react, aim error 0.12 m + 0.012 m per metre, back-pedals inside 6 m.
"Careless": 0.60 / 0.67 / 0.55 s, no back-pedalling, stands still in a fight (it keeps moving at the Windlass: R2's
player). Seconds are section times (the walk in included); HP is damage taken.

| | Plain (seeds 101 / 202 / 303) | Careless (seeds 5 / 66 / 777) |
|---|---|---|
| Whole stage (sum of legs) | 9:24 / 9:18 / 9:48; **0 / 0 / 0 deaths** | 9:35 / 10:14 / 9:26; **0 / 1 / 0 deaths** (the Tamper) |
| Front Street | 40 / 36 / 47 s; 18 / 36 / 18 HP | 37 / 42 / 36 s; 54 / 88 / 18 HP |
| the yard | 38 / 38 / 53 s; **0 / 0 / 0 HP** | 50 / 50 / 44 s; 0 / 86 / 0 HP |
| Tally House (the seated) | 0 HP | 18 / 18 / 18 HP |
| the file | 31 / 31 / 28 s; **0 / 0 / 0 HP** | 32 / 33 / 29 s; 54 / 54 / 0 HP |
| the Tamper | 49 s; 76 / 76 / 76 HP (two slams; the leg does not vary with the seed); 0 deaths | 42 s, 0 HP / **29 s to a death, then 42 s; 147 HP** / 42 s, 0 HP |
| Windlass phase 1 | 50 / 50 / 47 s; 0 / 76 / 63 HP; 0 deaths | 40 / 49 / 50 s; 0 / 0 / 76 HP; 0 deaths |
| Windlass phase 2 | 61 / 59 / 59 s; 0 / 63 / 68 HP; 0 deaths; reaches phase 3 with 12 to 18 in reserve | 61 / 60 / 57 s; 38 / 88 / 0 HP; 0 deaths |
| One continuous run, gallery bay to end card (plain, 101) | file 0 HP; Tamper 76 (leaves on 67); phase 1 30 s; **one death in phase 2** (canister 134 + stake 22 from an arrival on 67), then 56 s | |

Honest reading against the rulings. **R2: met** by these proxies: no death at the Windlass in six runs from its
checkpoints and one in the continuous run; phase 1 is 40 to 50 s (4 s of it the new lead-in), phase 2 57 to 61 s;
nothing drags and nothing is over in a blink. **R3 / R10: met for a careless player, not for the plain proxy.** Front
Street costs everyone something (18 to 88). **The yard, from its own checkpoint, costs the plain proxy nothing** and
the careless one 86 in one run of three; **the file costs the plain proxy nothing** in three of three (it turns on
whatever is nearest the tick it appears) and the careless one 54 in two of three. The Tamper is now the fight that
always costs (76 to the plain proxy, a death for the slowest careless one) and never runs anyone dry. **R11:** nothing
new was found or made; not re-probed in this pass. These proxies see everything around them at once and repeat their
mistakes; **no person has played this tree**, and Easy and Hard were not run.

## J.4 Numbers

| What | Low | High | Cap (Low / High) |
|---|---|---|---|
| Worst cell, encounters cleared, 1280 x 720 (`perf/cells_*`, `cells_rest.log`): draw calls | 67 (`cell_gallery`) | 92 (`cell_yard`) | 100 / 220 |
| Worst cell: triangles | 86 024 (`cell_yard`) | 109 982 (`cell_yard_door`) | 120 000 / 400 000 |
| Worst cell: textures + render targets | 57.5 MiB (`cell_tally`; 50.5 by the GL hook) | 72.0 MiB (`cell_tally`; 75.5 by the GL hook) | 64 / 128 |
| Peak seen in the played High legs (enemies alive, effects) | | 89 dc / 114 179 tris (Front Street) | |

Per cell, Low dc / tris: gully 47 / 57 190, gate 53 / 76 477, street 53 / 82 661, yard door 48 / 85 925, yard
60 / 86 024, tally seam 36 / 47 713, tally 54 / 68 473, gallery stair 39 / 46 433, gallery 67 / 77 084, hall
63 / 72 702, bore 58 / 60 820, rim 15 / 17 361. High: 74 / 71 131, 81 / 92 332, 82 / 99 452, 91 / 109 982,
92 / 105 471, 47 / 47 726, 65 / 68 486, 50 / 46 444, 78 / 77 095, 74 / 72 713, 69 / 60 831, 26 / 17 372. Memory by set
(Low / High, claimed): surface 53.6 / 68.0, with the Tally House 57.5 / 72.0, underground 46.3 / 60.8, coda
34.3 / 48.7 MiB. The file's fight with six alive: I.4 (Low 45 dc, 63 310 tris). Low at 1080p was not re-measured.

| What | Measured |
|---|---|
| JS per fixed tick, six real systems, live fights (`perf/fightms.log`; no drawing) | median 0.011 ms (yard), 0.031 (the file, six alive), 0.031 (Tamper), 0.030 (Windlass phase 2); worst single tick of 1 200: 0.6 ms (the file). Budget 4 ms |
| Allocation per tick + drawn frame (`perf/alloc.log`) | yard 5 236 B, file 4 890, Tamper 5 019, **Windlass phase 2 5 535** (test limit 6 144). Tick only: 1 472 / 1 497 / 1 690 / 2 271 B |
| Total download (production build) | **11.54 MiB of 20** (105 files): assets 9.69 MB in 102 files, JS 1.83 MiB, CSS 24.8 KiB |
| Bundle | `index-*.js` 1 917 164 B (540 kB gzip), one script; CSS 25 375 B (5.6 kB gzip) |
| Playthrough | the test's bot 30 378 ticks, **8.2 game minutes** of play (8.4 by the clock); the proxies 9.3 to 10.2 min. A first-time person: an estimated 12 to 16 minutes (GDD 4.2) |
| Death to control | 108 ticks (1.8 s) at each of the 17 checkpoints |

## J.5 Hero frames (`shots/round-5/`, the real game, High, 1280 x 720)

`hero_01` the title over the overhang · `02` the opening view · `03` Front Street mid-shot: the flash star on the
muzzle, two Biders · `04` Plenty's street, the kneeler at the trough · `05` the Dowser on the skyline at the crosshair
· `06` the Tally House: the blade of light over the seated, the hatch latch's knot, the aqua line · `07` the gallery:
the knot in the sighting loop · `08` the Tamper charging down the aisle, a round on its way · `09` the Windlass at the
parley · `10` a phase-2 haul, mid-shot, the flash on the muzzle · `11` the seventh: the line down the bore on the
shot's first frame · `12` the far rim: the fire, the lamps of Plenty, the pylon, the two threads. 01, 02, 04 to 07, 09
and 10 are the e2e bot's own frames, playing by input, one leg per browser (`scratch/r5-closer/heroseg.mjs`); 03 and
08 are `flash.mjs` / `tamper.mjs` (a debug jump to the checkpoint, then walked and fired by input; 08 in god mode: a
frame, not a measurement); 11 is a canvas capture from the underground team's `seventh.mjs` (the game's frame without
the DOM HUD); 12 is the TRUE last image (she takes the round and the game eases the view itself: the exterior team's
`end.mjs`). **All twelve and the sheet were opened at full size; no asset was rebuilt after them.**

Seen in them and not fixed: on High in the Tally House the gun is a pale copper-pink, the lightest large shape of the
frame (06); the gun is pale against the blue hour (12) and fills the lower right of every idle frame; the seventh's
frame shows a fine stipple along the pit's edges (High's contact shade has no blur) (11); the Tamper is small at 10 m
(08); the title of a fresh boot shows the revolver in front of the doorway (01).

## J.6 Known gaps of the handed-over game (current; this list replaces H.6 and I.5)

Closed in round 5: the narrator's wrong count on the street; the file as a walk-through for a careless player; the save
that read like a crash; the empty reserve at phase 3; Begin wiping a run; the HUD mark on the gun hand; the smallest
seventh; the flash below-left of the barrel; the confirms lost in the bore; HAULING after the kill; the maroon box and
the ink cage on the rim; the gauge as one white bar; `prewarm` killed by the watchdog; `nar_office` spent early; the
stone's lines after a take; 25 s to lose the choice.

**Play**
- **The plain proxy is unhurt by the yard (from its checkpoint) and by the file**; the careless one is unhurt by each
  in one or two runs of three. Both fights punish standing still and not looking round, neither punishes a proxy that
  sees behind itself.
- The Tamper is the stage's dearest fight before the boss (76 HP plain; one careless death). Its slower wind-up clip
  was not judged as a picture.
- A player who never moves after a respawn into Windlass phase 2 still dies (13 to 15.5 s).
- Stepping back from the stone ends the stage after 40 quiet seconds with no warning line.
- A brisk player does not hear `nar_marks`; one who runs past the niche hears neither watcher line. "HEAD DRY." is on
  screen about 4.5 s after phase 3b begins.
- The title's question reads "Begin?" with no sentence saying the count is lost. After "Quit to title" the title's
  backdrop is the run's last frame.
- The pocket between `lh_ramp_cabinet`, the ramp and the gantry plinth; the "Windlass seen" beat facing the bay's corner.
- The e2e bot shoots the Tamper's back vent from in front (green, dearer).

**Picture**
- The gun: light for the Tally House (copper-pink on High); a little silver on High; the frame's plain left flank; the
  hand is a thumb, a forefinger and a grip; smoke and tracer start about 70 px (of 540) under the risen barrel on the
  first drawn frame. 21:9 and 4:3 were not looked at with the new placement.
- The rim: from the ledge's far ends the mesa's wings are painted bands; `ia_proving_lift_cage` and `ia_lift_cage`
  have single-sided panels (from inside she looks through the walls and roof); `ia_lift_cage`'s lattice and flat floor.
- High: no outdoor term this round (no glow round the rim fire or the lit windows, no shafts); within 1 to 2.4 of 255
  of Low from the catwalk and in the Tally House; the contact shade's stipple on edges; the sheen is satin, not
  reflection; the sun shadow at 20 to 26 m was not captured.
- The hall's ring is still the brightest large shape from `cp_hall_clear`. The Cycles previews in `shots/art-weapons/`
  show older gloves.

**Budgets and build**
- JS + CSS 1.85 MiB against a 1.5 MiB share (total 11.54 of 20); one 1.92 MB script.
- Low's memory 57.5 of 64 MiB; allocation 5.5 kB per tick + frame in the Windlass (limit 6 144).
- A full asset rebuild is about 490 to 520 s.

**Not verified**
- **No real GPU**: frame rate on integrated graphics, the cost of High's sheen and 20 depth reads.
- **Nobody has listened**: the held confirms (a 20 ms "tick" may read as a "pip"), the narrator inside the four silent seconds.
- Easy and Hard; a whole-stage proxy run in one page (the memory rule); R11 was not re-probed; Low at 1080p.
- **No person has played this tree.**

# Part I. Cross-cutting fix and tuning pass, polish round 5 (2026-10-06)

The fifth critic panel (playthrough 8.1, visual 7.8, combat 7.8, story-ux 8.3, robustness 8.0) filed one major and
three minors against core, the design data and the story text, and two majors against the file: "still not a fight"
after three rounds of number changes (lead rulings R3 and R10). This pass took them in `src/core`, `tests/`,
`tools/gen_layout.mjs` (then the generated `design/layout.json`, `design/assets.json`), `design/story.json`, the wave
table and two small reads of `src/world/director.ts`, and the docs. No number of `src/enemies` or `src/player` was
changed. What the piece owners must follow up is in `docs/requests/polish-r5-fixer.md`. Log:
`scratch/r5-fixer/NOTES.md`; proxy runs: `scratch/r5-fixer/proxy/` (`t*_` trials, `a_*` after); the gate:
`scratch/r5-fixer/gate/` (`summary.txt` and one log per command); frames: `shots/r5-fixer/`. Run and play: A.1.
**Memory:** every browser run of this pass was one page at a time, in the foreground, in legs of one fight.

## I.1 The gate after this pass (one command after another, on the tree as it stands)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout (309 solids, 268 markers), manifest, `contracts.ts` = ARCHITECTURE section 5: pass (no contract change) |
| `npm run test:unit` | 25 files, 439 pass |
| `node tools/build-assets.mjs`, `npm run check:assets` | 102 items built in 487 s after the design change (`scratch/r5-fixer/build_assets.log`); 84 assets, 18 textures, 9.66 MB: all pass |
| `node --test tests/player/` `enemies/` `world/` | 41, 62, 94 pass, 0 fail |
| `node --test tests/render/` | **51 pass, 1 fail**: `prewarm.test.mjs` "high: no program links in play from the title to the gallery" ends in "Target crashed": the memory watchdog killed its browser at 4 569 MiB (`scratch/mem-watchdog.log`, 10:51). The robustness critic saw the same on the unchanged tree; it is the render team's test and is listed for it. Not rerun |
| `node --test tests/ui/` `audio/` `pipeline/` | 41, 42, 83 pass, 0 fail |
| `node --test tests/art_weapons/` `art_enemies/` `art_boss/` `art_props/` `art_env_interior/` `art_env_exterior/` | 24, 33, 39, 97, 17, 21 pass, 0 fail |
| `node --test tests/core/` (core stubs) | 70 pass, 6 skipped, 0 fail |
| `KEEP7_REAL=all node --test tests/core/` | 76 pass, 0 fail (335 s) |
| `node --test tests/e2e/` | **8 pass**: "Go on" at every checkpoint; the playthrough by input from the title to the end card (**29 775 ticks, 8.0 min of play, 85 rounds, 34 freed, 0 deaths, no god mode, hash `d9519973`**); the same tick and hash on a second load; the other ending; a death at each of the 17 checkpoints (108 ticks to control); the production bundle; `?cp=` ignored there; the file that will not come |
| `npm run build` | `dist/js/index-*.js` 1 904 270 B (535 kB gzip), CSS 24 230 B, one script; `dist` 105 files, 12 053 957 B = **11.50 MiB of 20** |

## I.2 What was fixed

| # | Issue | Change | Proof |
|---|---|---|---|
| 1 | Major (story-ux): the narrator says "Seven of them" after Front Street sends eight | `design/story.json` `nar_street_after`: "Eight of them. She had started with six in the gun." The composition is the same on Easy, Normal and Hard (the director reads the difficulty only for drops) | `scratch/r5-fixer/street_lines.log` (real game, the bot from `cp_lip_gate`): 8 `enemy/freed`, `encounter/cleared` and the line on the same tick, 17.6 s |
| 2 | Major (world's, both the playthrough and the combat critic; R3, R10): the file is not a fight | **composition, not numbers.** The answer to the line shot comes from both ends of the walkway: with the file down to one, when she is within 16 m of the far door, two Biders start down flight 3 of the peg stair behind her (out of sight behind the bay wall) and run the gallery after her (`nar_file_behind`); 4 s later the bang on the far door and 1 s after it (it was 2) the door bursts on four (it was three). Layout: `sp_file_10`, `sp_file_11`, `sp_file_12`, wave `R`; `WAVE_RULES` `enc_file/R`, `enc_file/B`; two rule fields (`afterDownOf`, `nearOf`) | I.3; `tests/world/director.spec.ts`, `tests/world/polish_r4.test.mjs` (rewritten, pass); `shots/r5-fixer/file_rear_pair.png` and `file_door_2.png` (opened: two violet crowns 35 m down the walkway under "Four more, from the far door"; three crowns bursting out of the far door, the hall behind them) |
| 3 | Minor (robustness): a dropped save logs a `console.error` with a `TypeError` stack | `src/core/save.ts` `readStored` checks what `applySave` indexes into (`stats.secrets`, the stat numbers, every list entry, each puzzle and its `data`, the doors, the cylinder, `bossPhase`, every `statics` entry): such a save is no save. `src/core/flow.ts`: what still cannot be applied is dropped with one `console.warn` line, no stack | `tests/core/save.spec.ts` (new test: the critic's two shapes and fifteen more return null); `tests/core/robust.test.mjs` (the two shapes are never offered as "Go on") |
| 4 | Minor (combat): phase 2 of the Windlass can end with an empty reserve; a mis-aiming player dies twice to the Tamper's slam | `src/world/director.ts`: the tin of twelve of the phase-2 break also at the break into phase 3a (when she holds under twelve); the fourth round in a row that the Tamper's plate turns says `hint_tamper_vent` ("Lead rang off its plate. The vents stood open only after the blow."), once an attempt, Easy and Normal, hints on | `tests/world/polish_r5.test.mjs` (new, 2 pass); I.3: the plain proxy reaches phase 3a with 12 to 18 in reserve (it was 0) |
| 5 | Minor (playthrough): fights run at a third of the beat sheet's length | `docs/GDD.md` header and 4.2 rewritten with the measured times; 10 `enc_file`; 23.9 | the document |
| 6 | (world's minor, the data half) lines after the thing they describe | `trg_enc_street` lists `nar_kneeler` first: it is on screen at 0.0 s, the kneeler stands at 3.0 s (it was said 7 s after the kneeler was freed). A trial that held wave A to 6 s took the cost out of the fight and was reverted (I.4) | `scratch/r5-fixer/street_lines.log` |
| 7 | (ui's minor, the text half) "A clean six at the last" explains nothing | `ui_end_clean_six`: "Six dry mouths, one cylinder" | `design/story.json`; `tests/ui/` 41 pass |
| 8 | (world's minor, the data half) the kept round's first hint spends `nar_office` | the line `hint_kept_1` and its name `hint1` in the bore target's `lines` exist; **not wired** (`src/world/kept.ts` is the world's) | `npm run validate` |
| 9 | The e2e bot skipped the death at `cp_file_clear` | `tests/e2e/lib/page-play.js`: the file section ends on the clear; the tidying is the next section's | `node --test tests/e2e/`: 17 of 17 restores |

Other owners' files edited (each listed in `docs/requests/polish-r5-fixer.md`): `src/world/director.ts` (`WAVE_RULES`,
`FILE_BURST` 1, `FILE_NEAR_REAR` 16, `FILE_REAR` 4, `TAMPER_PLATE_HINT` 4; reads of `afterDownOf` and `nearOf`; the
plate count in `onTamperHit`; `bossBreak()` at `p3a`); `tests/world/director.spec.ts`, `polish_r4.test.mjs`, the new
`polish_r5.test.mjs`. Nothing in `src/enemies`, `src/player`, `src/render`, `src/ui`, `src/audio`.

## I.3 The fights, before and after (Normal; three runs each)

"Plain": the critics' proxy (`page-human.js`, `page-plainboss.js`, copied unchanged) at 0.40 / 0.45 / 0.35 s to react
and an aim error of 0.10 / 0.12 / 0.09 m + 0.012 m per metre, back-pedalling inside 6 m. "Careless": 0.60 / 0.67 /
0.55 s, no back-pedalling, standing still in a fight (at the Windlass it keeps moving: R2's player). "Before" is the
critics' own fresh legs on the unchanged tree (`scratch/r5-playthrough/v_*.log`, `scratch/r5-combat/v2_*.log`,
`batch2.out`); "after" is `scratch/r5-fixer/proxy/a_*.log` and, for the file, `t6_*.log`. Each leg starts at the
fight's checkpoint with full health and 6 + 24 rounds. Seconds are section times (the walk in included) unless marked
"enc" (trigger to clear); HP is damage taken. These proxies see everything around them at once; a person does not.

| Fight | Before: seconds / deaths / HP | After: seconds / deaths / HP |
|---|---|---|
| Front Street, plain | enc 21 to 26 s; 0 deaths; 18 / 0 / 0 | 42 / 61 / 41 s; 0; 0 / 0 / 0 (untouched but for the line order) |
| Front Street, careless | 23 to 30 s; 0; 54 / 88 / 36 | 37 / 42 / 36 s; 0; 54 / 88 / 18 |
| the yard, plain | 27 / 27 / 38 s; 0; 0 / 0 / 0 (whole runs, arriving hurt: 86 / 44 / 108) | 38 / 38 / 34 s; 0; 0 / 0 / 0 (untouched) |
| the yard, careless | 36 s; 0; 0 (whole runs: three deaths in three) | 50 / 50 / 44 s; 0; 0 / 86 / 0 |
| **the file, plain, a line round** | enc 24 s; 0; **0 / 0** (4 rounds fired) | enc 32 / 32 / 28 s; 0; **0 / 0 / 0** (she reloads between the two ends or ends on an empty cylinder) |
| **the file, careless, a line round** | enc 24 s; 0; **0 / 0 / 18** | enc 33 / 34 / 30 s; 0; **72 / 54 / 0** |
| the file, no line round, plain | enc 28 to 29 s; 0; 0 | enc 37 s; 0; 0 |
| the file, no line round, careless | enc 28 s; 0; 36 | enc 35 s; 0; 54 |
| the Tamper, plain | enc 25 to 31 s; 0 to 2 deaths (the 0.5 s proxy: slam 190); 38 to 108 | 48 / 47 / 51 s; **0 deaths**; 38 / 38 / 56; ends 2 to 5 + 23 to 29 |
| the Tamper, careless | 28 s; 0; 69 | 43 / 45 / 43 s; 0; 0 / 91 / 38 |
| Windlass phase 1, plain | 27 to 43 s; 0 deaths | 34 / 44 / 34 s; 0 deaths |
| Windlass phase 2, plain | 59 to 77 s; 0 deaths; 38 to 76 HP over both; **reaches phase 3 with 0 in reserve** in several runs | 57 / 62 / 64 s; 0 deaths; 81 / 38 / 63 HP over both; **reaches phase 3 with 12 / 12 / 18 in reserve** |
| Windlass, careless (moving) | phase 1 30 to 41 s, phase 2 48 to 77 s; 0 deaths | phase 1 44 / 40 / 42 s, phase 2 58 / 73 / 58 s; 0 deaths; 63 / 123 / 76 HP |
| The whole stage, plain | 9:19 / 9:25 of play (`plainFull2`, `3`), 0 deaths; careless-standing (`careFull1`) 2 deaths in the yard, 3 at the Tamper, 3 in phase 2 | **not rerun as one page** (the memory rule); the sum of the legs is about 10 s longer at the file |

Honest reading against the rulings. **R2: met**, unchanged: no death at the Windlass in six legs, phase 1 34 to 44 s,
phase 2 57 to 73 s. **R3 / R10, the file:** the careless proxy now loses 54 to 72 HP in two runs of three and nothing
in the third; the plain proxy still loses nothing, because it turns on whatever is nearest the instant it appears and
back-pedals. What changed is the shape: twelve Biders, six of them answering the line shot from both ends inside
about two seconds. A person who does not look behind her will pay more than either proxy;
no person has played it. **The street** costs the careless proxy 18 to 88 and the plain one nothing in these three
legs (the critic's had 18 in one of three): as before. **The yard** from its own checkpoint at full health costs the
plain proxy nothing; it bites a player who arrives hurt (the critics' whole runs). **The Tamper** is a 43 to 51 s duel
that costs 38 to 91 HP, kills nobody at these presets and leaves nobody dry; the critic's 0.5 s-reaction proxy died
twice to its slam, which the new hint line addresses for a player who is shooting plate, and nothing addresses for
one who is slow (the wind-up is the enemies team's). **R11:** no perch was found or made; the gantry stander is still
reached and killed (the critics' `v_gantry.log`; not rerun). Easy and Hard were not run in this pass.

## I.4 Numbers that moved

| What | Before | After |
|---|---|---|
| Layout | 265 markers | 268 (`sp_file_10`, `sp_file_11`, `sp_file_12`); `enc_file` 12 Biders in three waves |
| `cell_gallery` bound (assets.json, ARCHITECTURE 7.5) | 117 500 triangles, 83 / 91 calls | 119 000, 83 / 91 (cap 120 000 / 100 typical, 150 worst): two more static bodies; the alive cap is still six |
| `cell_hall`, `cell_gallery_stair` bounds | 107 875; 46 910 | 109 375; 48 410 |
| `cell_tally`, `cell_tally_seam` bounds | 78 297, 74 / 79; 51 565, 47 / 53 | 99 297, 77 / 85; 67 565, 49 / 57 (the stair's two spawn markers stand in a chunk those cells can show; nobody is alive there while she is in the Tally House) |
| Measured in the file's fight, 1280 x 720, six alive, the far door open (`scratch/r5-fixer/file_perf.mjs`) | | Low 45 draw calls, 63 310 triangles, 46.4 MiB; High 56, 63 321, 60.8 MiB |
| Playthrough (the bot) | 29 338 ticks, 82 rounds, 31 freed, hash `155622f7` | 29 775 ticks, 85 rounds, 34 freed, hash `d9519973` (the same on a second load) |
| Story | | new `nar_file_behind`, `hint_tamper_vent`, `hint_kept_1`; changed `nar_street_after`, `nar_file_more`, `ui_end_clean_six` |
| Unit tests; world browser tests | 438; 92 | 439; 94 |
| Assets | | all 102 items rebuilt against the final design data (487 s), `check:assets` passes; download 11.50 MiB of 20 |

**Tried and taken back:** wave A of the street held to 6 s (so the kneeler line would begin while it kneels): the
plain proxy lost 0 / 0 / 0 and the careless one 0 / 0 / 54 (`scratch/r5-fixer/proxy/x6_street_*.log`); with the line
first in the trigger's list the line is on screen at 0.0 s anyway. The file's first trial (the rear pair 2 s after the
line shot, three at the door: `t1_`, `t3_`): careless 18 / 18 / 0. Per-cell budgets other than the file's fight were
not re-measured: nothing else that is drawn changed. H.4 stands otherwise.

## I.5 Not done, and why (H.6 stands unless named here)

- **Closed since H.6:** "the file costs nothing" (I.3: it costs the careless proxy; the plain proxy is still unhurt);
  the narrator's count on Front Street; the save that read like a crash; the empty reserve at phase 3.
- **The plain proxy is unhurt by the file and by Front Street.** Both fights now punish a player who stands or does
  not look round; neither punishes a proxy that sees behind itself. No person has played either.
- **The fourth Bider at the far door arrives late** when five others and the dormant Tamper are up (the stage's cap
  of six alive): a straggler, not a bug; `nar_file_more` says "Four more" while three are in the doorway.
- **The Tamper is the stage's peak, the Windlass gentler** (the playthrough critic's minor): the slam wind-up and the
  respawn into phase 2 are the enemies team's; nothing here changed them.
- **`hint_kept_1` is data without wiring**: until the world reads it, tier 1 of the kept round's ladder still says
  `nar_office`.
- **The moot rules for `nar_watcher_*`, `nar_first_knot` and the stone's lines on a quick take; the final choice made
  by stepping 4 m back from the stone for 25 s:** the world's code. `trg_stone.endAfterSeconds` stays 25.
- **`tests/render/prewarm.test.mjs` (High)** is killed by the memory watchdog; render's.
- **The pocket beside `lh_ramp_cabinet`:** not moved (a solid there moves a prop, a bake and the charge-stun bait, and
  could not be verified safely in the last round).
- **Not run:** Easy and Hard; a whole-stage proxy run in one page (the memory rule; the legs stand in for it); the
  out-of-level sweep; the per-cell budget table. **No real GPU, nobody has listened, no person has played this tree.**

# Part H. Closing pass, polish round 4 (2026-10-05)

The round's code teams (player, enemies, world, ui, audio, render-tech) and look teams (gun, exterior-look,
underground-look) had finished; this pass decided their request rows, mirrored the documents, rebuilt every asset, ran
the whole gate on the final tree, replayed the plain and careless proxies and measured. Run and play: A.1 (unchanged).
Evidence: `shots/round-4/` (twelve hero frames + `hero_sheet.jpg`), `shots/r4-closer/` (the whole tour on High, 77
frames, `high_tour.json`, `sheetA/B/C.jpg`), `scratch/r4-closer/` (`NOTES.md`, `gate/`, `perf/`, `proxy/`,
`build_assets.log`, `before/` = the files as they stood before this pass).

## H.1 The gate (one command after another, on the tree as it stands; `scratch/r4-closer/gate/`)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout (309 solids, 265 markers), manifest, `contracts.ts` = ARCHITECTURE section 5: pass (run again after the last document edit) |
| `npm run test:unit` | 25 files, 438 pass. In the gate run itself one failed (`tests/core/collision.spec.ts` micro-benchmark: 8 216 B allocated, expected 0) while six proxy runs shared the machine; alone it passes before and after (`gate/summary_unit_rerun.txt`): a load flake of a benchmark, not a seam |
| `node tools/build-assets.mjs`, `npm run check:assets` | 102 items built in 521.5 s after the design texts changed (`build_assets.log`); 84 assets, 18 textures, 9.66 MB: all pass |
| `node --test tests/player/` `enemies/` `world/` `render/` | 41, 62, 92, 52 pass, 0 fail |
| `node --test tests/ui/` `audio/` `pipeline/` | 41, 42, 83 pass, 0 fail |
| `node --test tests/art_weapons/` `art_enemies/` `art_boss/` `art_props/` `art_env_interior/` `art_env_exterior/` | 24, 33, 39, 97, 17, 21 pass, 0 fail |
| `node --test tests/core/` (core stubs) | 70 pass, 6 skipped, 0 fail |
| `KEEP7_REAL=all node --test tests/core/` | 76 pass, 0 fail (454 s) |
| `node --test tests/e2e/` | **8 pass**: "Go on" at every checkpoint; the playthrough by input from the title to the end card (**29 338 ticks, 7.9 min of play, 82 rounds, 31 freed, 0 deaths, no god mode, hash `155622f7`**); the same tick and hash on a second load; the other ending; a death at each of the 17 checkpoints (108 ticks to control); the production bundle booted as the public page; `?cp=` ignored there; the file that will not come |
| `npm run build` | `dist/js/index-*.js` 1 900 550 B (534 kB gzip), CSS 24 232 B, one script; `dist` 105 files, 12 050 761 B = **11.49 MiB of 20** |

## H.2 Seams fixed and requests decided in this pass

| # | File | What | Why |
|---|---|---|---|
| 1 | `src/audio/gun.ts` | `dry_fire`: click 0.34 -> 0.61, tone 0.25 -> 0.45 (+5 dB, about -8 dB peak); the kept round's refusal keeps its old level | the player team's request to audio, which had finished (combat critic: the empty-gun moment was never felt). `tests/audio/` 42 pass. Not listened to |
| 2 | `tests/e2e/lib/page-play.js` | a restore is a problem under **60** HP (it was 67); a comment that said three seconds of line stagger | 60 is the documented respawn floor (`RESPAWN_MIN_HEALTH`); the bound of 67 failed at `cp_boss_p3` mid-round when the timeline moved. Not a weakening: the test pinned a number the game never promised |
| 3 | `tools/gen_layout.mjs`, `tools/gen_assets.mjs` (then the generated JSON, then all 102 assets) | texts only: `enc_file` wave B `when` (+ `notRead`), `sp_file_7..9` notes, `trg_dowser.doorOpensWhen`, the `rim_town_card` note | the world's and the exterior team's rows: the design data described rules the game no longer follows |
| 4 | `docs/GDD.md` (in place + 23.8), `docs/ART_BIBLE.md` (6.5, 10, 10.2 to 10.4 in place + round-4 amendments), `docs/ARCHITECTURE.md` (8.1, 8.2, 8.4), `docs/LEVEL.md` (8, 11) | every number, placement and look change of the nine teams | the request rows |
| 5 | `docs/requests/*.md` (ten files) | a "Closer, polish round 4" decision table at the end of each | |

The shared files of the look teams (`src/render/moods.ts`, `materials.ts`, `post.ts`, `system.ts`, `shared.ts`,
`src/world/ending.ts`, `src/player/defs.ts`) were checked first: each team's stated values are in the files (L6 `vmK`
1.25, the bloom fields and `MOOD_SIZE` 69, the `GUN` floors 0.58 / 0.20, the `FARFOG` cap, `PULSE_*`, the High
depth-range branch, `TURN_TOWARD_TOWN` 0.15, `VIEW_PLACE`), and unit + `tests/render` were green before anything was
touched: no lost or half-applied edit.

**Ruled:** `nar_take_1` stays on the leave branch; the gun team's relaxed R6 bound at the antechamber
(`min(bgL - 9, 27)`) is accepted; L6 `vmK` stays 1.25; the death state is not skippable; the end panel is not narrowed
at 4:3. **Left open for round 5** (each in its request file): `BOSS.chargeRequiredAt` 12 -> 2 s; the pocket beside
`lh_ramp_cabinet`; `ia_lift_cage`'s lattice and floor; the "Windlass seen" beat; the HUD backing over the gun hand;
the flash below-left of the lifted barrel.

## H.3 The fights (Normal, final tree; `scratch/r4-closer/proxy/`)

"Plain": 0.45 s to react, aim error 0.12 m + 0.012 m per metre, back-pedals inside 6 m; at the Windlass it circles and
shoots what is open. "Careless": 0.6 s, no back-pedalling; in the whole runs and at the Windlass it keeps moving in the
boss room (R2's player), in the section runs it stands still. Seconds are section times (the walk in included); HP is
damage taken in the section.

**Whole stage from the title, three runs each** (`h_*.log`, `full_summary.txt`):

| | Plain 101 / 202 / 303 | Careless 5 / 66 / 777 |
|---|---|---|
| Whole stage | 10:27 / 9:59 / 10:00; **1 / 1 / 1 deaths** (Windlass phase 2, the yard, Windlass phase 2) | 9:59 / 9:02 / 9:32; **2 / 0 / 1 deaths** (all in the yard) |
| Front Street | 38 / 39 / 34 s; 0 deaths; 0 / 36 / 0 HP | 37 / 41 / 37 s; 0; 36 / 88 / 18 HP |
| the yard | 69 / 107 / 69 s; 0 / 1 / 0 deaths; 103 / 64 / 84 HP | 115 / 42 / 65 s; 2 / 0 / 1 deaths; 165 / 44 / 108 HP |
| Tally House (the seated) | 0 HP | 0 / 18 / 36 HP |
| the file | 33 / 31 / 32 s; 0; **0 / 0 / 0 HP** | 31 / 32 / 31 s; 0; **0 / 0 / 0 HP** |
| the Tamper | 41 / 42 / 41 s; 0; 38 / 38 / 38 HP | 42 / 42 / 42 s; 0; 38 / 38 / 38 HP |
| Windlass phase 1 | 43 / 33 / 26 s; 0 deaths; 0 HP | 26 / 27 / 41 s; 0; 0 HP |
| Windlass phase 2 (per try) | 52 (died) then 53 / 49 / 54 (died) then 54 s; 97 / 63 / 108 HP | 57 / 63 / 60 s; 0 deaths; 38 / 38 / 0 HP |

**Sections from their checkpoints, three seeds each** (`sections_summary.txt`, `s6_surf_*`):

| Fight | Plain: seconds / deaths / HP | Careless: seconds / deaths / HP |
|---|---|---|
| Front Street | 40 / 36 / 47 s; 0; 18 / 36 / 18 | 37 / 42 / 36 s; 0; 54 / 88 / 36 |
| the yard | 65 / 50 / 49 s; 0; 86 / 18 / 18 | 75 / 51 / 56 s; 1 / 0 / 0; 116 / 66 / 22 |
| the file | 34 / 34 / 32 s; 0; 0 / 0 / 0 | standing 32 s; 0 / 0 / 18; walking on 32 s; 18 / 0 / 36 |
| the Tamper, a line round | 47 s; 0; 38 (the same on all three seeds) | 43 s; 0; **0** |
| the Tamper, no line round | 37 s; 0; 105 | |
| Windlass phase 1 / 2 | 31 / 32 / 30 s and 74 / 74 / 60 s; 0 deaths; 155 / 113 / 76 HP over both | (moving) 30 / 42 / 30 s and 62 / 76 / 57 + 56 s; 0 / 0 / 1 deaths; 0 / 76 / 178 HP |

Honest reading against the rulings. **R2: met.** At most one death at the Windlass in any run (4 of 12 boss attempts
cost one); phase 1 lasts 26 to 43 s, a phase-2 try 49 to 76 s; nothing drags past 90 s. Phase 1 is short (26 s for two
runs). The world now tops her up to 67 at each phase and drops rounds at the break. **R3:** the street costs a careless
player 18 to 88 HP and a plain one 0 to 36 (unhurt in two whole runs of three). **The yard is now the hardest fight
before the boss and arguably too hard:** 64 to 103 HP for the plain proxy in whole runs and a death in one of three;
three deaths in three careless whole runs. From its own checkpoint at full health it is 18 to 86 (plain). A runtime
trial of `TRANSIT.passAfter` 10 gave identical runs, so nothing was tuned at the close: it is the first thing for
round 5's combat critic. **The file is still not a fight** for anyone who stops and shoots (0 HP in nine of nine such
runs); only the player who walks on pays (18 / 0 / 36). **The Tamper** is a 37 to 47 s duel that costs one slam
(38 HP) with a line round, 105 without, and nothing to a standing proxy whose cadence lands in the vent window: a
real fight, with uneven cost, never a death here. These proxies are deterministic per seed and stand in for a person;
no person has played this tree. Easy and Hard were not run.

## H.4 Numbers

| What | Low | High | Cap (Low / High) |
|---|---|---|---|
| Worst cell, encounters cleared, 1280 x 720 (`perf/cells_*.log`): draw calls | 67 (`cell_gallery`) | 89 (`cell_yard_door`) | 100 / 220 |
| Worst cell: triangles | 86 036 (`cell_yard`) | 108 924 (`cell_yard_door`) | 120 000 / 400 000 |
| Worst cell: textures + render targets | 57.5 MiB (`cell_tally`) | 72.0 MiB (`cell_tally`; 75.5 by the GL hook) | 64 / 128 |
| Peak over the played run on High (the tour: enemies alive, effects) | | 87 dc / 120 143 tris / 72.0 MiB | |

Per cell, Low dc / tris: gully 47 / 57 190, gate 52 / 76 469, street 53 / 82 661, yard door 47 / 85 909, yard
59 / 86 036, tally seam 37 / 47 801, tally 54 / 70 767, gallery stair 40 / 46 433, gallery 67 / 77 084, hall 64 / 75 026,
bore 58 / 60 948, rim 16 / 17 409. High: 71 / 70 129, 79 / 91 837, 81 / 98 585, 89 / 108 924, 87 / 105 196, 48 / 47 814,
65 / 70 780, 51 / 46 444, 78 / 77 095, 75 / 75 037, 69 / 60 959, 27 / 17 420. Memory by set (Low / High): surface
53.6 / 68.0, with the Tally House 57.5 / 72.0, underground 46.3 / 60.8, coda 34.3 / 48.7 MiB. High's contact shade and
per-mood bloom added no target and no pass (render targets 39.1 MiB as before). Low at 1080p was not re-measured (F.4).

| What | Measured |
|---|---|
| JS per fixed tick, six real systems, live fights (`perf/fightms.log`; no drawing) | median 0.021 ms (yard), 0.049 (the file), 0.046 (Tamper), **0.051 (Windlass phase 2, the worst)**; worst single tick of 1 200: 1.9 ms (yard). Budget 4 ms |
| Allocation per tick + drawn frame (`perf/alloc.log`) | yard 5 130 B, file 4 864, Tamper 4 935, **Windlass phase 2 5 305** (test limit 6 144). Tick only: 1 415 / 1 429 / 1 635 / 2 194 B |
| Total download (production build) | **11.49 MiB of 20** (105 files): assets 9.66 MiB in 102 files, JS 1.81 MiB, CSS 23.7 KiB. To the title 13 requests / 2.21 MiB; to control 53 requests / 7.41 MiB |
| Bundle | `index-*.js` 1 900 550 B (534 kB gzip), one script; CSS 24 232 B (5.4 kB gzip) |
| Playthrough | the test's bot 29 338 ticks, **7.9 game minutes** (8.15 min with the tour's pauses: 29 794 ticks); the proxies 9.0 to 10.4 min. GDD 4.2 expects 15 to 25 minutes of a person |
| Death to control | 108 ticks (1.8 s) at each of the 17 checkpoints |

## H.5 Hero frames (`shots/round-4/`, the real game, High, 1280 x 720)

`hero_01` the title over the overhang · `02` the opening view · `03` Front Street, a Bider at 3.7 m, its knot burst,
the flash · `04` Plenty's street · `05` the Dowser on the skyline, rod held out · `06` the Tally House: the blade of
light, the seated, the hatch lit aqua · `07` the gallery: the knot in the sighting loop · `08` the Tamper charging down
the aisle, mid-shot · `09` the Windlass at the parley · `10` a phase-2 haul, the guard set, a round into a pawl ·
`11` the seventh: the pit turned aqua · `12` the far rim: the fire, the lamps of Plenty and their pools, the pylon, the
two threads. 01, 02, 04 to 07 and 09 to 11 are the tour's own frames (the bot playing by input,
`scratch/r4-closer/tour.mjs`); 03 and 08 are from `flash.mjs` / `tamper.mjs` (a debug jump to the checkpoint, then
walked and fired by input; 08 in god mode: a frame, not a measurement); 12 is the TRUE last image (she takes the round
and the game eases the view itself: `scratch/r4-team-exterior-look/end.mjs`), not the bot's. **All twelve and the
sheet were opened at full size after the final asset build.**

Seen in them and not fixed: the flash star sits below and left of the lifted barrel's end (03, 08); the gun is still
the lightest large shape of the last image, pale against the blue hour (12); at idle the hand is a thumb and a finger
under the HUD mark's ink disc (01, 02, 05); in the street frame the gun rides low and is cut by the frame (04); the
seventh's frame shows the pit and the gun, not the shot (11); the Tamper is small at 10 m in 08.

## H.6 Known gaps after round 4 (current; F.6 stands unless named here)

Closed since F.6 and G.5: the gantry perch; the save overwritten by "Go on"; the Tamper as an ammunition wall; the
kept load's frozen hold; the hammer and frame end reading as an open jaw; the end card over the fire; `KNOTS BURST`;
the station's late ask and the trailing "BORE PROVEN."; a hurt player walking into the Windlass at 34.

**Play**
- **The yard is the hardest fight before the boss** (H.3): a death for the plain proxy in one whole run of three and
  three deaths in three careless whole runs.
- **The file costs nothing** to a player who stops and aims; **Front Street** costs a plain player nothing in two whole
  runs of three.
- The Tamper costs a fixed-cadence standing proxy nothing; its encounter is 24 to 27 s from trigger to death.
- Windlass phase 1 is 26 to 43 s. The Windlass's own ask (HUD pulse, hint ladder) still starts at 12 s.
- A pocket between `lh_ramp_cabinet`, the ramp and the gantry plinth can trap a player under the Tamper.
- The "Windlass seen" beat fires while she faces the arrival bay's corner. `ia_lift_cage`: lattice and flat floor.
- The e2e bot shoots the Tamper's back vent from in front (plate now): green, 4 rounds dearer.

**Picture**
- The gun in the blue hour (L* 28.5 on a ledge of 13); the grip hand under the HUD backing; the frame's plain left
  flank; the flash below-left of the barrel end.
- At 4:3 the Tally House row is cut by the frame's left edge in the last image; 21:9 was not captured in the game.
- High's contact shade has no blur (a fine stipple) and has only been seen on SwiftShader; High is still within
  1.5 / 255 of Low on a plain wall, `vista_tamper`, the catwalk vista and `cp_hall_gantry`.
- The bore's door jambs go pale salmon for the frames of a shot; the catwalk girders' lightmap is speckled.
- The Tamper at 1 m on the gantry was not judged by a look team; the Cycles previews in `shots/art-weapons/` show the
  round-3 gun.

**Budgets and build**
- JS + CSS 1.84 MiB against a 1.5 MiB share (total 11.49 of 20); one 1.90 MB script.
- Low's memory 57.5 of 64 MiB; allocation 5.3 kB per tick + frame (limit 6 144).
- A full asset rebuild is 521 s (`env_the_bore` about 300 s).

**Not verified**
- **No real GPU**: frame rate on integrated graphics, the real cost of the per-pixel pulse and of High's 20 depth reads.
- Nobody has listened: the louder dry click, the 10 dB step in the bore, the confirms.
- Easy and Hard; the Low tour and Low at 1080p this round; `tests/core/collision.spec.ts`'s allocation benchmark
  fails when the machine is loaded.
- No person has played this tree.

# Part G. Cross-cutting fix and tuning pass, polish round 4 (2026-10-05)

The fourth critic panel filed two majors and five minors against core, the design data, the tests and the story text,
and found the difficulty curve "flat, then a wall, then a fair boss" (rulings R1 to R3): the street and the file cost
nothing, the Tamper was an ammunition wall that killed more often than the Windlass. This pass took them in
`src/core`, `tests/`, `tools/gen_layout.mjs` (then the generated `design/layout.json`, `design/assets.json`),
`design/story.json`, the number tables of `src/enemies/defs.ts` and `src/world/director.ts`, and the docs. What the
piece owners must follow up is in `docs/requests/polish-r4-fixer.md`. Log: `scratch/r4-fixer/NOTES.md`; proxy runs:
`scratch/r4-fixer/proxy/` (`a1_*`); the gate: `scratch/r4-fixer/gate/` (`summary.txt` and one log per command).
Run and play: A.1 (unchanged; the fire hint now reads "Left click to fire").

## G.1 The gate after this pass (one command after another, on the tree as it stands)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout (309 solids, 265 markers), manifest, `contracts.ts` = ARCHITECTURE section 5: pass (no contract change) |
| `npm run test:unit` | 25 files, 434 pass |
| `node tools/build-assets.mjs`, `npm run check:assets` | 102 items built in 421 s after the design change; 84 assets, 18 textures, 9.64 MB: all pass |
| `node --test tests/player/` `enemies/` `world/` `render/` | 40, 59, 84, 48 pass, 0 fail |
| `node --test tests/ui/` `audio/` `pipeline/` | 41, 41, 83 pass, 0 fail |
| `node --test tests/art_weapons/` `art_enemies/` `art_boss/` `art_props/` `art_env_interior/` `art_env_exterior/` | 24, 33, 39, 97, 17, 21 pass, 0 fail |
| `node --test tests/core/` (core stubs) | first run 69 pass, 6 skipped, 1 fail: `budget.test.mjs` pinned the street zone's old bound (72 calls, 115 381 triangles). Pin updated; second run of the whole suite (`core_stubs_2.log`): **70 pass, 6 skipped, 0 fail** |
| `KEEP7_REAL=all node --test tests/core/` | first run 75 pass, 1 fail (the same pin); second run (`core_real_2.log`): **76 pass, 0 fail** |
| `node --test tests/e2e/` | **8 pass**: "Go on" at every checkpoint keeps the save (new); the playthrough by input from the title to the end card (**28 837 ticks, 7.7 min of play, 78 rounds, 29 freed, 0 deaths, no god mode, hash `6d90fc21`**); the same tick and hash on a second load; the other ending, leaving the round (new); a death at each of the 17 checkpoints (108 ticks to control); the production bundle booted as the public page; `?cp=` ignored there; the file that will not come |
| `npm run build` | `dist/js/index-*.js` 1 885 041 B (529 kB gzip), CSS 23 608 B, one script; `dist` 105 files, 12 015 696 B = 11.46 MiB of 20 |

The other suites were not run a second time after the pin in `tests/core/budget.test.mjs` changed (a test file only).

## G.2 What was fixed

| # | Issue | Change | Proof |
|---|---|---|---|
| 1 | Major: "Go on" at any Windlass checkpoint overwrote the save with a half-fresh world (the next death restored zone `the_lip`, four unsolved puzzles, six stray Biders, a sealed seventh, 15 lamps on the card) | `src/core/flow.ts`: `restoreTrio` sets `applying`, and the `checkpoint/reached` listener returns while it is set. `enemies.applySave` sets the boss phase, the world reaches `cp_boss_p*` on it, and outside a tick that commit was immediate, before `world.applySave` and `player.applySave` | new `tests/e2e/goon.test.mjs` (real game, real `localStorage`): at each of the 16 checkpoints after the first, reload + "Go on" + 150 ticks, the save in memory and in storage deep-equals the stored one and nothing was committed; then a death gives back the same objective (and, at the Windlass, the same enemies). Passes; with the guard commented out it fails at the four boss checkpoints with 74 to 78 differences (`scratch/r4-fixer/goon_unfixed.log`, `goon_fixed.log`) |
| 2 | Major: the Tamper an ammunition wall, harder than the boss | 900 HP (1 200); its ammo floor repeats every 10 s (it was once per attempt) and a wholly dry player gets a packet by the hall locker, with the chime. The late vent stands on Normal (Easy: the whole wind-up). GDD 6.5, 7.3, 23.7 | G.3: plain proxy at 0.45 s, 0 deaths in 9 section runs and 3 whole runs (before: 1, 5 and 0 deaths in the three whole runs), never left at 0 + 0 (one dry spell, ended by the locker packet) |
| 3 | Minor: 0.75 s of live play with a free cursor after a note is closed without the lock | `src/core/loop.ts`: the lock lost while paused on a readable sets `lockLost`; the first tick of play pauses with `focus_lost` | `tests/core/robust.test.mjs` (with the real UI the pause is a readable and at most one tick of play runs before the plate; beside the stub UI the watchdog path is tested as before) |
| 4 | Minor: the bot's leave-the-round route never reached the end card | `tests/e2e/lib/page-play.js`: she walks to the `exit_rim` strip | new e2e test "the other ending" (`tookStoneRound` false, `ending/stone` taken false, the end card up) |
| 5 | Minor: "Mouse 1 to fire" | `design/story.json`: `ui_key_mouse_left` / `_middle` / `_right` ("Left click", ...), which the UI's key namer already looks for | `tests/ui/hud.test.mjs`, `screens.test.mjs` (pins updated), `tests/ui/text.spec.ts` |
| 6 | Minor: the real-time core test fails under machine load | every wait of that test is 300 s (`REAL_WAIT_MS`); each is on ticks or state, none on a rate. The page was already 320 x 180 | the gate (stubs and `KEEP7_REAL=all`) |
| 7 | Minor: the yard harder than the Windlass for an average shot; Hard barely differs | `ia_ammo_box_yard` inside the yard door; a Transit's cooldown 1.5 s on Easy and Normal (1.2 on Hard); on Hard the Windlass rests 0.4 s after a phase-1 notch (0.8) and its stakes fly 15 % faster | G.3; `tests/enemies/logic.spec.ts`, `transit.test.mjs`; `shots/r4-fixer/yard_box.png`, `yard_box_near.png` (opened: the box by the door, the prompt on it) |
| 8 | (world's, two critics) the end card's `KNOTS BURST` more than double the rounds fired | `src/world/director.ts`: the `boss/pips` listener counted "26 minus what is left" again at every change of the Windlass's phase | the scripted run: 65 knots for 78 rounds (186 before); the playthrough test bounds it |
| 9 | (world's, R3) the street and the file cost nothing | wave B of the street comes out of the two alley mouths nearest the gate, beside and behind her, and C two seconds after B; the file's three come 2 s after the file is first hit, 1.2 m apart in depth | G.3; `shots/r4-fixer/street_waveB_2s.png` (opened: a crown rounding the south wall 12 m off while the kneeler is still up the street) |
| 10 | (world's minor) phase 1 ends with an empty reserve | the bore's two cartridge points give 18 (12) | `tests/world/kept.test.mjs`, `polish_r2.test.mjs` |

Other owners' files edited for the tuning (each listed in `docs/requests/polish-r4-fixer.md`): `src/enemies/defs.ts`
(tables), one read each in `tamper.ts`, `transit.ts`, `boss/attacks.ts`, `boss/index.ts`; `src/world/director.ts`
(`WAVE_RULES`, the Tamper's floor, the pips listener); their tests that pinned the old numbers
(`tests/enemies/tamper.test.mjs`, `transit.test.mjs`, `logic.spec.ts`, `tests/world/director.spec.ts`,
`director.test.mjs`, `kept.test.mjs`, `polish_r2.test.mjs`, `tests/ui/hud.test.mjs`, `screens.test.mjs`,
`tests/core/data.spec.ts`).

## G.3 The fights, before and after (Normal; three runs each)

"Plain": the critics' proxy (`page-human.js`, `page-plainboss.js`, copied unchanged) at 0.45 s to react and an aim
error of 0.12 m + 0.012 m per metre, back-pedalling inside 6 m. "Careless": 0.6 s, no back-pedalling, standing still
in a fight (at the Windlass the moving careless proxy of the combat critic: R2 is about a player who keeps moving; one
that stands still there dies in phase 2 every 9 s, before and after). "Before" is the critics' own round-4 logs on the
unchanged game (`scratch/r4-combat/batch1.out`, `scratch/r4-playthrough/*Full*.log`); "after" is
`scratch/r4-fixer/proxy/a1_*.log`. Seconds are section times (the walk in included); HP is damage taken.

| Fight | Before: seconds / deaths / HP | After: seconds / deaths / HP |
|---|---|---|
| Front Street, plain | 38 / 36 / 39 s; 0 deaths; **0 / 0 / 0** | 43 / 36 / 47 s; 0 deaths; **18 / 36 / 18** |
| Front Street, careless | 43 / 44 / 40 s; 0; **0 / 0 / 0** | 37 / 42 / 40 s; 0; **54 / 88 / 36** |
| the yard, plain | 54 / 39 / 43 s; 0; 0 / 0 / 66 | 70 / 50 / 49 s; 0; 66 / 18 / 22 |
| the yard, careless | 50 / 45 / 48 s; 0; 44 / 0 / 0 | 41 (after two deaths) / 45 / 40 s; **2 / 0 / 0 deaths**; 150 / 18 / 22 |
| the file, plain | (not run by the critics; careless below) | 35 / 41 / 34 s; 0; 0 / 0 / 0 |
| the file, careless | 33 / 33 / 34 s; 0; **0 / 0 / 0** | 36 / 40 / 35 s; 0; **0 / 36 / 0** |
| the Tamper, plain, a line round | 48 / 47 s and a 307 s stall run dry; 0 deaths; 0 / 0 / 56 | 55 / 53 / 53 s; 0; **53 / 53 / 53**; ends 5 + 5 or better |
| the Tamper, plain, no line round | **1 / 1 / 2 deaths** (130 / 129 / 295 HP), then 36 to 40 s | 37 / 37 / 37 s; **0 deaths**; 38 / 38 / 38 |
| the Tamper, careless | 48 / 42 / 67 s; 0; 0 / 18 / 18; ran dry once | 50 / 50 / 50 s; 0; 36 / 36 / 36 |
| the Tamper in whole runs from the title, plain | **1 / 5 / 0 deaths**; 0 reserve after it in 6 of 8 runs | 59 / 51 / 44 s; **0 / 0 / 0 deaths**; 91 / 38 / 0 HP; one dry spell, ended by the locker packet |
| Windlass phase 1, plain | 34 / 33 / 45 s; 0 deaths | 31 / 32 / 30 s; 0 deaths |
| Windlass phase 2, plain | 58 / 57 / 59 s; 0 deaths (25 / 63 / 133 HP over both phases) | 74 / 62 / 60 s; 0 deaths (155 / 144 / 76 HP over both phases; this proxy is slower and wider than the critic's) |
| Windlass, careless (moving) | phase 1 30 / 41 / 33 s, phase 2 77 / 63 / 63 s; 0 deaths; 38 / 38 / 101 HP | phase 1 41 / 44 / 40 s, phase 2 59 / 59 / 63 s; 0 deaths; 108 / 133 / 0 HP |
| The whole stage, plain | 9:48 to 14 min; 1 / 5 / 0 deaths | 9:45 / 10:22 / 9:51; **0 / 0 / 0 deaths** |
| The whole stage, careless standing still | 6 / 4 / 5 deaths | 6 deaths (one run): yard 1, Tamper 1, Windlass 4 |
| Hard, plain (one run each) | boss 34 to 45 s and 57 to 59 s, 0 deaths | street 25 HP, yard 25 HP, Tamper 48 s, boss 37 s and 58 s, 0 deaths, 53 HP |

Honest reading against the rulings. **R2:** met: no death at the Windlass for a player who moves, phase 1 30 to 44 s,
phase 2 59 to 74 s (82 s in one whole run); nothing was changed in the boss on Normal but the cartridge points (18).
**R3:** the street now costs every proxy health (18 to 88 HP) and the Tamper is a 37 to 59 s duel that costs 36 to 91
HP and no longer kills a plain player or starves her. The yard costs 18 to 66 HP and killed the standing proxy twice
in one seed of three (it entered at 67 HP after the street). **The file is still not a fight:** a plain proxy lost
nothing in three runs, the careless one 36 HP in one of three. **The lift hall's gantry is still a perch** nothing can
reach (enemies' logic; not touched). A whole careful run (0.4 s, error 0.10, back-pedalling) still walks the street
unhurt in the three whole runs: the cost falls on a player who stands her ground.

## G.4 Numbers that moved

| What | Before | After |
|---|---|---|
| Layout | 264 markers | 265 (`ia_ammo_box_yard`); `sp_street_alley_*` moved; the bore boxes give 18 |
| `cell_street` / `cell_yard` bound (assets.json, ARCHITECTURE 7.5 and 8.3) | 115 381 triangles, 69 / 76 calls | 115 781, 72 / 79 (cap 120 000 / 100 typical, 150 worst) |
| `cell_lip_gully` bound | 64 166, 50 / 55 | 80 666, 55 / 62 (wave B now stands in the chunk the gully shows) |
| `cell_yard_door`, `cell_tally` bounds | 104 647, 72 / 78; 77 897, 71 / 76 | 105 047, 75 / 81; 78 297, 74 / 79 |
| Playthrough (the bot) | 29 220 ticks, 82 rounds, 28 freed, hash `1b8e8d99` | 28 837 ticks, 78 rounds, 29 freed, hash `6d90fc21` (the same on a second load) |
| End card, the bot's run | 186 knots for 82 rounds | 65 for 78 |
| Assets | | all 102 items rebuilt against the new design data (421 s), `check:assets` passes |
| Unit tests | 433 | 434 |

Measured budgets (draw calls, triangles, memory per cell) were not re-measured in this pass: one 400-triangle,
3-call prop was added to the yard and nothing else that is drawn changed. F.4 stands otherwise.

## G.5 Not done, and why

- **The gantry perch** and **the file as a fight**: logic and art of the enemies and world pieces; requested.
- **The Tamper's line stagger and first charge** (critic's minor): not changed; with 900 HP the fight already costs
  what R3 asks.
- **`stn_boss_proven` trailing the kept round by 10 to 15 s**, **`nar_take_1` said on the leave branch**: world's story
  queue; requested.
- **A person has not played it.** The proxies stand in for one; Easy was run once (the Tamper: 48 s, 0 HP).
- Budgets on a real GPU, the audio by ear: as F.6.

# Part F. Closing pass, polish round 3 (2026-10-05)

The round's fixers (art-props, audio, player, ui, exterior, interior, weapons, enemies, render, world) and three look-dev
directors (gun, exterior, underground) had finished; this pass decided their request rows, mirrored the documents,
fixed the seams, rebuilt every asset, ran the whole gate on the final tree, replayed the critics' plain-skill proxy and
measured. Run and play: A.1 (unchanged; the reload hint and `E` at the stone now read the note first, then take the
round). Evidence: `shots/round-3/` (twelve hero frames + `hero_sheet.jpg`), `shots/r3-closer/` (the whole tour on
High and Low, 77 frames a tier, `high_tour.json`, `low_tour.json`, sheets `sheetA/B/C.jpg`), `scratch/r3-closer/`
(`NOTES.md`, `gate/` = the final run, `gate_run1/`, `gate_run2/`, `perf/`, `proxy/`).

## F.1 The gate (run 3, on the tree as it stands; one command after another)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout (309 solids, 264 markers), manifest, `contracts.ts` = ARCHITECTURE section 5: pass |
| `npm run test:unit` | 25 files, 433 pass |
| `node tools/build-assets.mjs`, `npm run check:assets` | 102 items built in 406 s after the last design change, 3 more after F.2 row 4; then 102 skipped. 84 assets, 18 textures, 9.64 MB: all pass |
| `node --test tests/player/` `enemies/` `world/` `render/` | 40, 59, 84, 48 pass, 0 fail |
| `node --test tests/ui/` `audio/` `pipeline/` | 41, 41, 83 pass, 0 fail |
| `node --test tests/art_weapons/` `art_enemies/` `art_boss/` `art_props/` `art_env_interior/` `art_env_exterior/` | 24, 33, 39, 97, 17, 21 pass, 0 fail |
| `node --test tests/core/` (core stubs) | 70 pass, 6 skipped (the six rewritten sandbox pages), 0 fail |
| `KEEP7_REAL=all node --test tests/core/` | 76 pass, 0 fail (253 s) |
| `node --test tests/e2e/` | 6 pass: the playthrough by input from the title to the end card (**29 220 ticks, 7.8 min of play, 82 rounds, 28 freed, 0 deaths, no god mode, hash `1b8e8d99`**), the same tick and hash on a second load, a death at each of the 17 checkpoints (108 ticks to control), the production bundle booted as the public page, `?cp=` ignored there, the file that will not come |
| `npm run build` | `dist/js/index-*.js` 1 883 315 B (528 kB gzip), CSS 23 608 B, one script; `dist` 105 files, 12 013 482 B = 11.46 MiB of 20 |

Run 1 had one failure (F.2 row 1) and was stopped there; run 2 had two (rows 3 and 4); run 3 has none.

## F.2 Seams fixed in this pass

| # | File | What was wrong | Found by |
|---|---|---|---|
| 1 | `design/story.json` | the closer's own first rewording of `stn_parley_4` and `hint_boss_haul` (enemies R3.3: a lit chamber counts now, so "only on the haul" was half the rule) ran to three subtitle rows. Now "WILL NOT STAND DOWN. A LIT CHAMBER IS OPEN. ALL SIX OPEN ON THE HAUL." and "The ribs stopped what it threw. Lit meant open. All six opened to haul." | `tests/ui/hud.test.mjs` (gate run 1) |
| 2 | `design/story.json`, `tools/gen_layout.mjs`, `tools/gen_assets.mjs` (then the generated JSON) | `nar_dowser_seen` said "a pale man" over a dark figure; `system.waiting` did not exist (the world fell back to a line about the title screen); `vista_dowser` said pale and [3, 8] px; `trg_dowser.goesWhen`, `lampsFormula`, `trg_stone` described rules the world no longer follows; `prop_rim_stone` budget 80 (the six cases were three-sided pegs), `ia_stone_round` life size (5 x 15 px from 1.5 m), `rd_note` listed `m_mask`, `rim_town_card` 60 x 14 m | the fixers' request rows |
| 3 | `src/ui/ui.css`, `tests/ui/screens.test.mjs`, ART_BIBLE 10.4 | the end card was an opaque ink screen: the demo's literal last image was a black ledger (lookdev-exterior row 5; rulings R5, R7). It is ink at 80 % over the still-drawn dusk. Looking at it showed a second seam: the title card "FIRST TALLY ENDS" still fading out UNDER the ledger; it is hidden while the end card is up. The test pinned the opaque colour: it now pins the 80 % ink and asserts that no title card shows (a changed design, stated here; nothing else in it moved) | the tour's frames (`shots/r3-closer/high_77_ending_card.png` before, `rimB_low_09_ending_card.png` after); gate run 2 |
| 4 | `blender/props/dress/prop_rim_stone.py` (asset, `env_far_rim`, `lm_rim` rebuilt) | the rich build of the stone (which the 240-triangle budget switches on) had never been through its test: a case leaning 2.5 degrees brought its bore ring within 10.2 mm of the seat's axis, the test asks 11. Lean 1.5 degrees at most, bore 15 mm | `tests/art_props/dress/variants.test.mjs` (gate run 2) |
| 5 | `blender/env_exterior/env_far_rim.py` | six life-size cases hidden inside the stone's own (144 triangles): removed | art-props request 3 |
| 6 | `docs/GDD.md` (in place and 23.6), `docs/ART_BIBLE.md` (6.5, 8.3, 10.4 in place; round-3 amendments with the grade table as built), `docs/ARCHITECTURE.md` (7.2, 8.1), `docs/workorders/README.md` (ruling 28), `tests/player/place.test.mjs` (a title), `tests/art_weapons/lib.mjs`, `framing.test.mjs` (comments) | the documents described the game before the round | the request rows |

The shared files of the three look-dev directors (`src/render/moods.ts`, `materials.ts`, `system.ts`, `vfx/vfx.ts`,
`tests/render/moods.spec.ts`, `feedback.test.mjs`, `polish3.test.mjs`) were checked first: no lost or half-applied
edit (unit 433 and `tests/render` 48 pass before anything else was touched; each director's stated values are in the
files). Every new row of `docs/requests/*.md` has a decision in a "Closer, polish round 3" table at the end of its file.

## F.3 The fights (the critics' plain-skill proxy, Normal, final tree; `scratch/r3-closer/proxy/`)

The proxy is `scratch/r3-playthrough/page-human.js` / `page-plainboss.js`, byte for byte (0.4 s to react, aim error
0.10 m + 0.012 m per metre, body shots mostly, back-pedals inside 6 m; at the Windlass it circles inside the ribs and
shoots what is open). "Careless": 0.6 s, no back-pedalling. One run each; results vary between runs (the enemies'
fixer saw 0 to 116 HP lost at the Matador with the same settings).

| Section | Seconds | Deaths | HP lost | Log |
|---|---|---|---|---|
| **Whole stage from the title** | 9:48 (rim reached at 8:44) | **0** | 76 (all of it the canister, phase 2) | `full.log` |
| the lip (jugs) | 37.9 | 0 | 0 | |
| Front Street | 40.5 section | 0 | 0 | |
| the yard | 47.0 section | 0 | 0 | |
| Tally House | 40.5 | 0 | 0 | |
| the file | 31.6 | 0 | 0 | |
| the Matador (with a line round) | 57.3 section | 0 | 0; ran dry once | |
| the asking and the parley | 59.4 | 0 | 0 | |
| Windlass phase 1 (first arrival) | **43.1** | 0 | 0 | |
| Windlass phase 2 | **57.2** | 0 | 76 | |
| Windlass from `cp_boss_p1` (no parley) | phase 1 34.3, phase 2 57.9 | 0 | 25 | `boss.log` |
| the same, weaker proxy (0.5 s, error 0.14) | 34.3, 59.1 | 0 | 88 | `bossW.log` |
| Matador with a line round, from the checkpoint | 47.5 | 0 | 0 | `mat.log` |
| Matador, no line round | dies once at 29 s, then clears in 29 s | 1 | 130 (112 slam, 18 lunge) | `matNL.log` |
| Matador, careless, line round | 49.0 | 0 | 0 | `matC.log` |
| Front Street, careless | 42.2 | 0 | **0** | `surfC.log` |
| the yard, careless | 57.6 | 0 | **101** (66 stake, 35 lunge) | `surfC.log` |

Against the rulings, honestly. **R2:** at most two deaths: met (0 in every run). The rule is taught in the parley and
at the first haul of every try. Phase 2 is about 60 s. **Phase 1 is 34 to 43 s, not the 60 to 90 s R2 asks**: not
changed at the close (the enemies' fixer's reasons stand: ten pips are ten hits for a proxy that lands 15 of 17; the
levers are `BOSS.p1Rest` and `pipsP1`). **R3:** the Matador lasts 47 to 57 s with a line round (met on length), but in
these three runs it cost the proxy nothing with a line round and killed it once without one: the threat is real but
uneven. The yard costs a careless player 101 HP. **Front Street cost neither proxy anything in these runs** (the
cross-cutting fixer measured 18 HP for the careless one before the Biders' wider spacing went in): R3's "street should
cost a careless player health" is not met on this evidence.

## F.4 Numbers

| What | Low | High | Cap (Low / High) |
|---|---|---|---|
| Worst cell, encounters cleared, 1280 x 720 (`perf/cells_*.log`): draw calls | 67 (`cell_gallery`) | 88 (`cell_yard_door`) | 100 / 220 |
| Worst cell: triangles | 84 071 (`cell_yard_door`) | 106 723 (`cell_yard_door`) | 120 000 / 400 000 |
| Worst cell: textures + render targets | 57.5 MiB (`cell_tally`) | 72.0 MiB (`cell_tally`) | 64 / 128 |
| Peak over the whole played run (the tour: enemies alive, effects, a frame every 20 ticks and every beat) | 66 dc / 89 983 tris / 57.6 MiB | 88 dc / 117 920 tris / 72.0 MiB | |

Per cell, Low dc / tris: gully 47 / 57 158, gate 52 / 76 261, street 50 / 80 440, yard door 47 / 84 071, yard
56 / 83 813, tally seam 37 / 47 769, tally 52 / 68 722, gallery stair 40 / 46 401, gallery 67 / 77 052, hall 64 / 74 994,
bore 58 / 60 916, rim 16 / 17 204. High: 71 / 70 097, 79 / 91 629, 78 / 96 364, 88 / 106 723, 83 / 102 612, 48 / 47 782,
63 / 68 735, 51 / 46 412, 78 / 77 063, 75 / 75 005, 69 / 60 927, 27 / 17 215. Memory by set (Low / High): surface
53.6 / 68.0, with the Tally House 57.5 / 72.0, underground 46.3 / 60.8, coda 34.3 / 48.7 MiB.

**Low at 1080p** (asked for; `perf/low1080.mjs`, a real-time page, not `?test=1`): the tier's buffer caps
(`maxBufferHeight` 768, 1 049 088 px) hold the drawing buffer at 1365 x 768 (ratio 0.711): textures 28.9 + render
targets 28.0 = **56.9 MiB** on the surface set, **60.9 MiB** with the Tally House's textures (32.9): inside 64. Under
`?test=1` the ratio is pinned at 1 and the same view claims 84.4 to 88.3 MiB (68.5 to 72.5 by the GL hook): a test
page's number, not a player's (`perf/cells_low_1080.log`).

| What | Measured |
|---|---|
| JS per fixed tick, all six real systems, live fights (`perf/fightms.mjs`; no drawing; this CPU, the gate running beside it) | median 0.018 ms (yard), **0.054 ms (the file, the worst)**, 0.047 (Tamper), 0.046 (Windlass phase 2); worst single tick of 1 200: 0.5 ms (Tamper). Budget 4 ms a frame |
| Allocation per tick + drawn frame (`perf/alloc.mjs`) | yard 5 065 B, file 4 772, Tamper 4 773, **Windlass phase 2 5 071** (test limit 6 144). Tick only: 1 368 / 1 415 / 1 618 / 2 194 B |
| Total download (production build) | **11.46 MiB of 20** (105 files): assets 9.64 MiB in 102 files, JS 1.80 MiB, CSS 23.1 KiB. To the title: 13 requests, 2.19 MiB; to control after "Begin": 53 requests, 7.33 MiB |
| Bundle | `index-*.js` 1 883 315 B (528 kB gzip), one script; CSS 23 608 B (5.3 kB gzip) |
| Playthrough | the test's bot 29 220 ticks, **7.8 game minutes**; the tour's bot 29 819 ticks (8.0 min, 480.6 s on the end card); the plain proxy 9.8 min. GDD 4.2 expects 15 to 25 minutes of a person |
| Death to control | 108 ticks (1.8 s) at each of the 17 checkpoints |

High from the title to the end card ran in ONE browser session this time (the tour plays in legs, one per checkpoint:
`scratch/r3-closer/tour.mjs`), with no console error on either tier.

## F.5 Hero frames (`shots/round-3/`, the real game, High, 1280 x 720)

`hero_01` the title over the overhang · `02` the opening view · `03` Front Street, a Bider at 4 m, mid-shot, the flash ·
`04` Plenty's street · `05` the Dowser on the skyline, dark against the sky · `06` the Tally House: the blade of light,
the seated, the hatch lit aqua · `07` the gallery: the knot in the sighting loop · `08` the Tamper charging down the
aisle, mid-shot · `09` the Windlass presenting · `10` a phase-2 haul, the guard set, a round into a pawl · `11` the
seventh: the standing line in the bore, the pit turned aqua · `12` the far rim: the fire, the lamps of Plenty, the two
threads. 01, 02, 04 to 07, 09 to 11 are the tour's own frames (the bot playing by input); 03 and 08 are from
`scratch/r3-closer/flash.mjs` / `tamper.mjs` (a debug jump to the checkpoint, then walked and fired by input; 08 in god
mode: a frame, not a measurement); 12 was shot again after the last rebuild (`rim.mjs`). **All twelve and the sheet
were opened at full size after the final asset build.**

Seen in them and not fixed: the back of the revolver (the cocked hammer and the frame's flat end) reads as an open
jaw at the right edge of every idle frame, and the right thumb is a smooth tan tube (01, 02, 05, 12); the gun is pale
salmon in the blue hour (12); the HUD ring lies over the gun's frame; in `hero_10` the flash itself is out of frame
(the tracer and the burst on the pawl are in it); the Tally House is dark outside its blades (06).

## F.6 Known gaps after round 3 (current; D.5, A.8 and B.6 stand unless named here)

Closed since D.5 and E.5: the Windlass as a wall (0 deaths for the proxy); the rule taught before it is needed; the
Dowser unreadable (R4: dark, 9 x 29 px, on the skyline, held until looked at); the ending's timer and the line behind
the card (R5); the gun's size at idle (R6: 9 to 10 % alone); the eight red tests of E.1.

**Play**
- **Windlass phase 1 lasts 34 to 43 s for the proxy** (R2 asks 60 to 90). Phase 2 about 60 s.
- **Front Street costs a careless proxy nothing**; the Matador's damage is uneven (0 with a line round in three runs, a
  death without one).
- Health is not topped up to 67 when phase 2 or 3 is entered alive (the proxy entered phase 3 at 34 HP).
- Reload: no eject beat, clip lengths unchanged (0.95 s for one round); the kept load holds its band-break pose about
  1.5 s; the left fingers cross the lower frame while seating a round.
- Hint tier 3 outlines on mesh-less anchors still draw nothing. A brisk player who takes the round at once loses
  `nar_rim_2` / `nar_rim_3`.
- A stake chamber struck in its glow still answers "parry" in the event's reason (the HUD shows "weak" and a pip).

**Picture**
- The revolver: hammer and frame end, the thumb, faceted fingers (arms at 2 788 of 2 800 triangles); steel-grey with a
  blue cast, not the bible's blue-black; pale silver in the hush of the kept load; brighter than what it covers by 10
  to 13 L* in the Tally House, the gallery and on the rim.
- The boss room from the flank and behind is still 83 to 87 % under L* 35; on High the Windlass's pip gauge blooms
  into one white bar. Both lift cages are the darkest thing in their rides; the view-model is salmon in the proving lift.
- The Dowser is about L* 22, not under 15 (the Long Light grade's lift).
- The last image: the town still reads as boxes with square lit panes; the fire is a small candle-shaped sprite; fire
  view p95 L* 66.5 against a target of 70. The first image: the baked sun patch competes with the slot.
- The stone close-up is a dark, flat frame; its brass reads khaki-gold; the handwriting is dashes at 0.5 m.
- The yard gate leaf is a flat lavender panel; the chapter card `VII` sits over the town's derrick at the lamps beat;
  the antechamber's ember prop is a 20 px dot.
- High equals Low wherever there is no emissive and no caster in view; no shadow of the view-model on High.

**Budgets and build**
- JS + CSS 1.82 MiB against a 1.5 MiB share (total 11.46 of 20); one 1.88 MB script.
- Low's memory is 57.5 of 64 MiB at 720p and 60.9 at 1080p (buffer capped at 768 lines).
- Allocation 5.1 kB per tick + frame (limit 6 144), unchanged.
- A long single `bot.play` leg grows the tab's renderer process by about 1 MiB a drawn frame (code-render 18): the
  tour's legs avoid it; whether real-time play grows the same way was not established.

**Not verified**
- **No real GPU**: frame rate on integrated graphics, shader-link cost on a real driver, a real context loss.
- Nobody has listened to the audio (the 150 ms confirms and the 5 dB step under them included).
- Easy and Hard; the two secrets; the "leave the round" ending by input; 4:3 and 21:9 in the real game this round.
- The proxy numbers of F.3 are one run each.

# Part E. Cross-cutting fix and tuning pass, polish round 3 (2026-10-04)

The third critic panel filed six majors and seven minors against core, the design data and the story text, and found
that lead rulings R2 and R3 were not met (the Windlass a wall, the mid-stage fights short and harmless). This pass took
them in `src/core`, `tools/`, `tests/harness.mjs`, `tests/core`, `tests/e2e`, `design/*.json` (layout and manifest
through their generators), the number tables of `src/enemies/defs.ts` and `src/world/director.ts`, and the docs. What
the piece owners must follow up is in `docs/requests/polish-r3-fixer.md`. Log: `scratch/r3-fixer/NOTES.md`; proxy runs:
`scratch/r3-fixer/t1_*`, `t2_*`, `t3_*`, `full.*`; the gate: `scratch/r3-fixer/gate/`.

## E.1 The gate after this pass

**Run the gate commands one at a time.** Side by side on this shared machine (load 60 to 90, sixty headless browsers)
they fail with `page.goto` timeouts and `Target crashed` (the kernel's OOM killer: a `?test=1` page holds about 1 GB),
none of which is in the game. Every page of a browser launched through `tools/browser.mjs` now has a 120 s default
timeout (`PAGE_TIMEOUT_MS`), and the harness's `goto` names it.

| Command | Result (final run of this pass, one command at a time; logs in `scratch/r3-fixer/gate/`) |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout (309 solids, 264 markers), manifest, `contracts.ts` = ARCHITECTURE section 5: pass (no contract change) |
| `npm run test:unit` | 25 files, 426 pass (416 before: +7 quality, +3 boot text) |
| `node tools/build-assets.mjs`, then `npm run check:assets` | 102 items built in 405 s (the design files are inputs of every item); 84 assets, 18 textures, 9.41 MiB: all pass |
| `node --test tests/core/` (core stubs) | 69 pass, 6 skipped, 1 fail in the full run: `budget.test.mjs` pinned the old street bound (112 382); fixed, and that file re-run alone passes (2 of 2). The whole suite was not run a second time with stubs; with the real systems (next row) it ran after the fix |
| `KEEP7_REAL=all node --test tests/core/` | 76 pass, 0 fail |
| `node --test tests/e2e/` | 6 pass: the playthrough (29 042 ticks, 7.8 min, 88 rounds, 29 freed, 0 deaths, no god mode, hash `b38ee8ad`), the same tick and hash on a second load, a death at each of the 17 checkpoints (108 ticks to control), the production bundle, `?cp=` ignored there, the file that will not come |
| `node --test tests/player/` `render/` `audio/` `pipeline/` | 36, 40, 39, 83 pass, 0 fail |
| `node --test tests/ui/` | 39 pass, 0 fail (first run 1 fail: `perf.test.mjs` did not know the end card's new word "of"; fixed and re-run) |
| `node --test tests/enemies/` | 52 pass, **5 fail** (below) |
| `node --test tests/world/` | 67 pass, **3 fail** (below) |
| `node --test tests/art_weapons/` `art_enemies/` `art_boss/` `art_props/` `art_env_interior/` `art_env_exterior/` | 23, 33, 39, 96, 17, 21 pass, 0 fail (after the rebuild) |
| `npm run build` | `dist/js/index-*.js` 1 848 810 B (518 kB gzip), CSS 23 400 B, one script; `dist` 105 files, 11 740 675 B = 11.20 MiB of 20 |

Red and handed to their owners (they pin numbers ruling 27 changed; lists in `docs/requests/polish-r3-fixer.md`):
`tests/enemies/tamper.test.mjs` (4: the arithmetic of 600 HP), `tests/enemies/file.test.mjs` "lane_street" (the saddlery
file is two), `tests/world/director.test.mjs` (3: the old wave clocks).

## E.2 What was fixed

| # | Issue | Change | Proof |
|---|---|---|---|
| 1 | Major (twice): the rule "it opens only to haul" is not taught before the fight | `design/story.json`: `stn_parley_4` "LIFT HEAD WILL NOT STAND DOWN. CHAMBERS OPEN ONLY ON THE HAUL. PRESENTING." (said while the six stand open); `nar_parley_kept` "It stood open while she looked. It would open again to haul."; `hint_boss_haul` reworded and said from the first death in a phase (`BOSS.mercyDeaths` 1). GDD 8.1, 8.3 | `npm run validate` (story wiring); the two lines are the parley's own keys, so they play on every first try (`src/enemies/boss/parley.ts`, unchanged). Saying the hint at the first haul of the very first try is code-enemies' (request 2) |
| 2 | Major: after one short stall the adaptive resolution stays low for one to two minutes; 30 fps taken for the display on a GPU too weak for Low | `src/core/quality.ts`: the doubling back-off is earned only by a probe upward that failed; an ordinary step down holds the ceiling 300 frames. `hold(frames)`: the loop leaves out every frame while the state is not `playing` and 30 frames after `load/set` and `world/staged`. `starve()` looks once at the tier below at its minimum ratio before it adopts a slow cadence that nothing faster was ever seen beside | the critic's model against the real class (`scratch/r3-performance/quality_sim*.ts`, rerun): a 2 s stall is back at ratio 1 17.6 s after it ends (was 130 s), a 1 s stall 10.6 s (was 63 s), three 120 ms frames 5 s (was 30 s); case P ends on `min` at 16.7 ms (was Low at 30 fps). Seven new unit tests (J, S, T, P, the 30 Hz cap, the failed probe, held frames): `tests/core/quality.spec.ts`, 40 pass. **Cost:** a fight heavier than walking (case E) now gives 42 ratio changes in ten minutes (23 before), hitches every 45 s (case L) 65 (51): each drop recovers sooner, so there are more steps |
| 3 | Major: pointer lock lost while a note is open; a refused or silent lock at "Begin" | `src/core/loop.ts`: a watchdog. `playing` without the lock for 45 ticks (after the lock has been asked for once: `input.lockAsked`) pauses with `focus_lost`, whatever path led there | `tests/core/robust.test.mjs` (real-time page, stubs and `KEEP7_REAL=all`): paused within a second, no shot. The critic's own `scratch/r3-robustness/rt.mjs readableLock`: closing the note now ends on the click-to-resume plate; a click gives `playing`, `locked: true`, `clickFired: 0` |
| 4 | Major: Windlass phase 2 runs 130 to 290 s and the bore starves the player; phase 1 a wall | `BOSS.p1Haul` 3.5 -> 5.0 s, `p2Haul` 4.0 -> 6.5 s, `p2OpenGuaranteed` 3.0 -> 4.5 s; the bore boxes 12 rounds / 10 s (6 / 20); mercy from the first death. Pips (10 / 10 / 6) and every damage number stand. GDD 6.5, 8.2, 8.3 | E.3 |
| 5 | Major: street and yard cost a plain player nothing; the Matador is over in 13 to 19 s | the Tamper 1 200 HP (600), a charge every 4 s (6), grate Biders at 15 s and 35 s (40 / 65). Front Street: 8 Biders (7), wave B is four from the two alleys at once (new markers `sp_street_alley_n2`, `_s2`), C a file of two, max alive 5; B 3 s after the kneeler is hit, C 6 s after B. Yard: T2 / T3 at 14 s (40), grate Biders +2 s (+6), alley Biders +10 s (+16). GDD 7.3, 10; LEVEL 2a | E.3 |
| 6 | Minor: ammo runs a plain player dry in the yard | `pk_rounds_12_yard_gate` moved inside the yard by the water cart (-84.6, 0, -1.9). The ammo floor on a Transit kill is world's logic (request) | the full proxy run: `cp_yard_clear` 2 + 9, `cp_tally_enter` 2 + 27, no "DRY" in the yard (was 0 + 0 at tick 6 823) |
| 7 | Minor: text nits | `ui_pause_restart_cp` "Back to the last count (checkpoint)"; `nar_rim_4` cut and merged into `nar_rim_3`; `hint_boss_haul`; `ui_hint_interact` "{interact} to read or take"; `ui_end_of` "of" (the end card reads `86 of 87`); `hint_jugs_2_few` added for world | validate; `scratch/r3-fixer/real_rerun.log` shows the pause item |
| 8 | Minor: the boot-failure card shows the raw exception | `bootFailureText`: "KEEP SEVEN could not start. A file it needs would not load. Check the connection. Reload the page to try again." for a file that would not come, no middle sentence otherwise; the raw text stays in `console.error` and `__dbg.error` | `tests/core/bootText.spec.ts`; `tests/core/stubs.test.mjs` (production page, a 404) |
| 9 | Minor: one renderer crash on the public page | not reproduced: `scratch/r3-story-ux/real.mjs` rerun alone on a quiet machine runs to its end (title, options, Begin at 1280 x 720 on High, play, death, quit; `scratch/r3-fixer/real_rerun.log`, exit 0). Taken for memory pressure at load 60 to 80 | the log |
| 10 | Minor: false failures when suites run side by side | E.1 | |
| 11 | The scripted bot | it died to the Matador once the Tamper had 1 200 HP (it spent lead on shut vents and backed into the Biders). It now fires only into an open vent, stays at slam range and side-steps the charge (`tests/e2e/lib/page-play.js`, `page-bot.js`) | the playthrough: 29 042 ticks, 88 rounds, 29 freed, 0 deaths, hash `b38ee8ad`, the same on a second load |

## E.3 The fights, before and after (the critics' plain-skill proxy, Normal)

The proxy is `scratch/r3-playthrough/page-human.js` and `page-plainboss.js`, copied unchanged to `scratch/r3-fixer/`:
0.4 s to react, an aim error of 0.10 m + 0.012 m per metre, body shots mostly, back-pedalling inside 6 m; at the
Windlass it circles inside the ribs and **shoots whatever is open**, in or out of a haul. "Careless" is the same with no
back-pedalling and 0.6 s. "Before" is the critics' round-3 logs on the unchanged game.

| Fight | Before | After |
|---|---|---|
| Windlass phase 1, from the checkpoint (no parley) | six deaths in a row (61 to 118 s each), then 340 s in god mode (`r3-playthrough/pBoss.log`) | **74 s, no death** (`t1_boss`); a weaker player (0.5 s, error 0.14): 87.5 s, no death (`t2_boss2`) |
| Windlass phase 2, from the checkpoint | three deaths (15, 162, 287 s), then 229 s | **one death (54 s), then 64 s** (`t1_boss`); weaker: one death (28 s), then 64 s |
| Windlass, first arrival in a whole run from the title | phase 1 21 s; phase 2 two deaths, 481 s in all, 23 box trips (`run2c`) | phase 1 35 s; **phase 2 123 s, no death**, 6 box trips (`full.log`): she enters phase 2 with 4 + 0 and half her rounds are parried or deflected. Over the 60 to 90 s of R2; requests 3 and 4 to code-enemies are the levers left |
| The Matador, with a line round | 12.8 s, 0 damage | **about 41 s** (section 54.5 s with the walk in), 73 HP lost: one charge, one slam (`t3_mat`) |
| The Matador, no line round | 18 s, 0 damage | about 20 s (section 36.8 s), 56 HP lost (`t3_matNL`); in the whole run from the title: 55 s section, ran dry once, 0 damage |
| The Matador, careless | 19 s, 0 damage | one death, then 52 s (`t3_matC`) |
| Front Street | plain 24.5 s, 0 damage; careless 28 s, 0 | plain 26 s, 0 damage; **careless 28 s, 18 HP** (three more Biders felled inside 2.5 m) (`street.mjs`, `t3_streetP.log`) |
| The yard | plain 36.8 s, 22 HP; careless 37 s, 40 HP | plain 33 s, 22 HP; **careless 30 s, 88 HP** |
| The whole stage | 16:25, 2 deaths, 184 rounds (`run2c`) | **10:31, no death**, 202 rounds (`full.json`) |

Tried and withdrawn: the Tamper at 1 400 HP (the careless proxy died twice, the plain one lost 103 HP); wave C of the
street 1.5 s after B with the old seven (still no damage: they arrive one by one from 20, 27 and 50 m).

Honest reading against the rulings. **R2:** met from the checkpoints (0 and 1 deaths, 64 to 88 s a phase); on a first
arrival phase 2 is 123 s without a death. The rule is taught in the parley. A shot into a glowing chamber outside a
haul is still a parry with no pip. **R3:** the Matador is a real fight (40 s and 56 to 73 HP with a plain player; a
careless one dies once); street and yard cost a careless player health (18 and 88 HP); a plain player who back-pedals
still walks Front Street unhurt, and the street is still about 26 s.

## E.4 Numbers that moved

| What | Before | After |
|---|---|---|
| Layout | 263 markers | 264 (`sp_street_alley_n2`, `_s2` added; `sp_street_saddlery_3` removed) |
| `cell_street` / `cell_yard` bound (assets.json) | 112 381 triangles, 68 / 75 calls | 115 381, 69 / 76 (one more Bider alive; cap 120 000 / 100) |
| Playthrough (the bot) | 28 686 ticks, 87 rounds, 28 freed, hash `364c5533` | 29 042 ticks, 88 rounds, 29 freed, hash `b38ee8ad` |
| Assets | | all 102 items rebuilt against the new design data (405 s), `check:assets` passes, 9.41 MiB |

## E.5 Not done, and why

- **Allocation** (about 5 kB per tick + frame, 58 % inside three): not cut. Every skinned instance already goes through
  `quietSkeleton`; the rest (three's frustum per render call, the bone-texture cache key, mixers of dormant actors) is in
  the render and enemies systems or needs three's upload path bypassed. The test limit stays 6 144 B.
- **One 1.85 MB script**: not split. Dynamic imports from the flow change the composition root and the production test's
  "one script"; not attempted in a pass that also retuned every fight.
- **The ammo floor on a Transit kill**, **the parry that counts**, **pawls that stay burst**, **the vent that opens late**,
  **a Bider's stagger on a body shot**, **the Transit's seek**: logic of the enemies and world systems; requested.
- **The ending's timer and the fire** (R5), **the Dowser** (R4), **the gun** (R6), **the three frames** (R7): other owners'
  issues; nothing here touches them.
- **Easy and Hard** were not replayed with the new numbers. No real GPU, as before: the quality controller is proven on
  a model of a display.
- Eight browser tests of the enemies and world suites are red (E.1).

# Part D. Closing pass, polish round 2 (2026-10-04)

The eight fixers of the round (exterior, interior, weapons, boss, enemies, render, world, ui) had finished; this pass
decided their request rows, fixed the seams between them, rebuilt the assets, ran every gate command on the final tree
and measured. Run and play: A.1 (unchanged). Evidence: `shots/round-2/` (twelve hero frames + `hero_sheet.jpg`),
`shots/r2-closer/` (the whole tour, 78 frames a tier, `low_tour.json`, `high_tour.json`), `scratch/r2-closer/gate/`
(one log per command, `summary.txt`), `scratch/r2-closer/gate_run1/` (the first run, with its three failures),
`scratch/r2-closer/perf/` (`cells.log`, `fightms.json`, `alloc.json`).

## D.1 The gate (final run, on the tree as it stands)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout, manifest, `contracts.ts` = ARCHITECTURE section 5: pass |
| `npm run test:unit` | 24 files, 416 pass |
| `npm run check:assets` | 84 assets, 18 textures, 9.41 MiB: all pass; `node tools/build-assets.mjs` afterwards: 102 skipped (nothing stale) |
| `node --test tests/player/` `enemies/` `world/` `render/` | 36, 57, 70, 40 pass, 0 fail |
| `node --test tests/ui/` `audio/` `pipeline/` | 39, 39, 83 pass, 0 fail |
| `node --test tests/art_weapons/` `art_enemies/` `art_boss/` `art_props/` `art_env_interior/` `art_env_exterior/` | 23, 33, 39, 96, 17, 21 pass, 0 fail |
| `node --test tests/core/` (core stubs) | 69 pass, 6 skipped (the six rewritten sandbox pages), 0 fail |
| `KEEP7_REAL=all node --test tests/core/` | 75 pass, 0 fail (243 s) |
| `node --test tests/e2e/` | 6 pass (35 s): the playthrough by input from the title to the end card (28 686 ticks, 7.7 min of play, 87 rounds, 28 freed, 0 deaths, no god mode, hash `364c5533`), the same tick and hash on a second load, a death at each of the 17 checkpoints (108 ticks to control), the production bundle booted as the public page, `?cp=` ignored there, the file that will not come |
| `npm run build` | `dist/js/index-*.js` 1 846 668 B (517 kB gzip), CSS 23 400 B, one script |

The first run of the gate in this pass had three failures; each is a row of D.2 (rows 1, 2, 3).

## D.2 Seams fixed in this pass

| # | File | What was wrong | Found by |
|---|---|---|---|
| 1 | `blender/env_interior/env_lift_hall.py`, `env_the_bore.py` (both zones and `lm_hall`, `lm_bore`, `lm_bore_glow` rebuilt) | the interior fixer dropped the zone floor 0.11 m under the lift cage's footprint to end a z-fight with the cage's slab; three nav nodes (`n_lh_071`, `n_lh_cage`, `n_bo_arrival`) then had no zone floor within the 0.05 m that `tests/pipeline/greybox.test.mjs` holds. The floor is now 0.04 m under: inside the cage's 0.1 m slab, never coplanar with its top | `node --test tests/pipeline/` (2 fail) |
| 2 | `tests/player/wired.test.mjs` | asserted that she stays where she quit; since Part C row 10 the title is the overhang again and core stands her on `player_start`. The test now asserts `player_start` (still "no walking on the title") | `node --test tests/player/` (1 fail; requested of code-player in `polish-r2-fixer.md`, no player fixer ran this round) |
| 3 | `src/core/options.ts` (`sanitizeBindings`) | code-ui 8.2a: an action stored with no key stayed without one on a page without the real UI. Core now gives it its defaults back from whoever holds them: the same rule as the UI's `repairBindings` (a first version with a different rule failed `tests/ui/screens.test.mjs`; the rule was made the UI's) | request row; `node --test tests/ui/` |
| 4 | `src/enemies/boss/index.ts` | the pawl fallback constants were still z 2.6 (the asset's sockets are at 3.95); and the pawl cores (lamps 12, 13) were lit in every phase although a pawl can be burst only in a phase-2 haul with the guard set. They light only then | art-boss requests |
| 5 | `src/audio/gun.ts`, `src/ui/hud.ts`, `tests/ui/hud.test.mjs` | a parry (lead into a glowing chamber: no damage) played the rising confirm tone and showed no glyph. It is a falling tritone pair and the `deflected` glyph; the test asserts the glyph | code-enemies R2.2 |
| 6 | `design/story.json` | `hint_boss_haul` did not exist, so the Windlass's teaching line (from the second death in phase 1 or 2) was silent | code-enemies R2.1 |
| 7 | `src/render/moods.ts` (`L5a`), `src/render/materials.ts` (`FARFOG` 0.55 -> 0.40) | the antechamber still took the chamber's violet grade over an ember-brown bake; the coda's far land was a mid tone | art-env-interior row 2, art-env-exterior row 13; looked at in the tour |
| 8 | `src/enemies/pool.ts` | the Tamper's blob shadow was hidden by its own feet: `setLevel(2)` | code-render row 7 |
| 9 | `docs/ART_BIBLE.md` (8.2, 8.3, 10.3, 7.7 and an amendments table), `docs/workorders/README.md` (rulings 24 to 26, the exterior's share), `docs/workorders/art-weapons.md`, `art-boss.md` | the documents still gave the numbers the round's fixers had changed against critic findings | the fixers' request rows |

Every new row of `docs/requests/*.md` has a decision in a "Closer, polish round 2" table at the end of its file
(applied, ruled, or named as open for round 3).

Assets: a plain `node tools/build-assets.mjs` at the start found the zones up to date and rebuilt 71 props and
textures; after row 1 the two zones were rebuilt (`--only`), and the full build that followed rebuilt 97 of 102 items
(zones and `lm_surface` last) in 263 s. The gate, the tour, the hero frames and every number below are from after that
build.

## D.3 Numbers

| What | Low | High | Cap (Low / High) |
|---|---|---|---|
| Worst cell, encounters cleared, 1280 x 720: draw calls | 67 (`cell_gallery`) | 88 (`cell_yard_door`) | 100 / 220 |
| Worst cell: triangles | 82 867 (`cell_yard_door`) | 105 519 (`cell_yard_door`) | 120 000 / 400 000 |
| Worst cell: textures + render targets | 57.5 MiB (`cell_tally`, `cell_tally_seam`) | 72.0 MiB (the same) | 64 / 128 |
| Peak over the whole played run (enemies alive, effects, one frame every 20 ticks and every beat) | 65 dc / 86 214 tris / 57.6 MiB | 85 dc / 113 720 tris / 72.0 MiB | |

Per cell (`scratch/r2-closer/perf/cells.log`: peak over every nav node of the cell and eight headings, AI off):
Low dc / tris: gully 47 / 57 160, gate 52 / 75 747, street 50 / 79 236, yard door 47 / 82 867, yard 56 / 82 611,
tally seam 37 / 47 757, tally 52 / 68 038, gallery stair 40 / 46 319, gallery 67 / 76 274, hall 64 / 74 210,
bore 58 / 60 216, rim 16 / 17 126. High: 71 / 70 101, 79 / 91 115, 78 / 95 160, 88 / 105 519, 83 / 101 410, 48 / 47 770,
64 / 68 720, 51 / 46 330, 78 / 76 285, 75 / 74 221, 69 / 60 227, 28 / 18 583. Texture + target memory by set (Low / High):
surface 53.6 / 68.0, with the Tally House 57.5 / 72.0, underground 46.3 / 60.8, coda 34.3 / 48.7 MiB. **Low's memory is
at 57.5 of 64 MiB at 720p**: 24.6 MiB of it is render targets, which grow with the canvas; at 1080p and ratio 1 Low
would pass 64 (the adaptive ratio is what holds it; not measured there). The exterior grew this round (yard door
77 340 -> 82 867 triangles on Low).

| What | Measured |
|---|---|
| JS per fixed tick, all six real systems, live fights (`fightms.json`; no drawing; this machine's CPU) | median 0.012 ms (yard), 0.031 (the file), 0.030 (Tamper), **0.032 ms (Windlass phase 2, the worst)**; worst single tick of 1 200: 1.0 ms (Tamper). Budget 4 ms a frame |
| Allocation per tick + drawn frame | **5 116 B** in `tests/core/alloc.test.mjs` (limit 6 144; 4 448 at integration); live fights (`alloc.json`): yard 5 038, file 4 807, Tamper 4 429, Windlass p2 4 987. Tick only: 1 374 / 1 415 / 2 644 / 1 952 B |
| Total download (production build, as fetched by the public page) | **11.19 MiB of 20** (105 files): assets 9.41 MiB in 102 files, JS 1.76 MiB, CSS 22.9 KiB. To the title: 13 requests, 2.16 MiB; to control after "Begin": 53 requests, 7.19 MiB |
| Bundle | `index-*.js` 1 846 668 B (517 kB gzip), one script; CSS 23 400 B (5.2 kB gzip) |
| Assets by folder (MiB) | env 4.09, lm 2.75, enemies 0.84, props 0.78, tex 0.37, boss 0.32, weapons 0.25 |
| Playthrough | 28 686 ticks, **7.7 minutes of play** (the test's bot); the tour's bot, fighting closer: 29 350 ticks, 7.9 min. GDD 4.2 expects 15 to 25 minutes of a person |
| Death to control | 108 ticks (1.8 s) at each of the 17 checkpoints |

## D.4 Hero frames (`shots/round-2/`, the real game, High, 1280 x 720, the bot playing by input)

`hero_01` the title over the overhang · `02` the opening view (the HUD: three health bars, the ring, the seventh) ·
`03` the sixth jug, mid-shot, muzzle flash · `04` Plenty's street · `05` the yard and the tank, the Dowser's line ·
`06` the Tally House, a shutter dropped, dust in the blade of light · `07` the gallery: the knot in the sighting loop ·
`08` the lift hall, a shot at the Tamper · `09` the Windlass presenting · `10` a phase-2 haul, mid-shot ·
`11` the seventh: the thread down the bore, the pit turning from violet to aqua · `12` the far rim, blue hour, the
lamps of Plenty. All twelve are from the tour run after the final build. Each of the twelve was opened at full size
from the tour run before the last rebuild (same beats, same framing); the final twelve were opened together as
`hero_sheet.jpg`, and the whole tour before them as five contact sheets.

Seen in them and not fixed: the gloves read orange-pink in the violet chamber during a reload (`hero_10`); the Tamper
is behind the flash in `hero_08`; lamp halos float as soft dots in the bore (`hero_10`, `hero_11`); the Tally House is
dark outside its blades of light (`hero_06`); `hero_11` shows the pit, not the gun firing.

## D.5 Known gaps after round 2 (current; A.8 and B.6 still stand unless named here)

Closed since A.8: the view-model's placement (8 % of the frame at idle), `nar_ask` and the quit tests of C.1.

**Play**
- **The Windlass on Normal is still a wall for a player who has neither rule** (the playthrough critic's major). The
  fixer's measurement with the critic's own proxy: three deaths in phase 1, then god mode. No GDD number was moved
  (ruling 26); what went in is teaching (the line from the second death, the sour parry, the pawl lamps). Not replayed
  with the critic's proxy after those went in.
- **The Matador is over in 8 to 18 s** (major, declined by the fixer and by ruling 26: GDD 10 says so in words).
- The rim's forced end is still 150 s (now from her first step out of the cage).
- Hint tier 3 outlines on the jugs, latches, the brass step and the proving marks draw nothing (`setOutline` needs a mesh).
- The jugs' T2 hint is wordless below six down; no lamp over the hatch latch from the Daylight stand spot.
- A Transit's new `seek` can walk it out of its yard (no encounter-zone limit).

**Picture**
- The Dowser is about 4 x 13 px at 720p against a cliff that fog lifts to L* 72: still not read at a glance.
- The rim's value plan (10 : 35 : 55) is not reached; unlit town windows are black squares; the far fire is drawn in
  front of a mesa.
- The lift hall's light band (L* > 70) is 0 to 3 % of a frame against the bible's 8 %; the antechamber is dark.
- The catwalk grille breaks into dashes at grazing angles (`m_mask` minification); the cage floor at the bore arrival
  is near-black violet.
- The yard is below the street's level of dressing; broken walls' raked ends read as small staircases from some angles.
- Reload: the left hand covers the gate; `load_kept` / `take_round` cover 19.5 % of the frame; the HUD ring sits over
  the sleeve at idle.
- The Windlass's pawl lobes still glow in every phase (only the lamp cores were gated).

**Budgets and build**
- JS + CSS 1.78 MiB against a 1.5 MiB share (total 11.19 of 20). The exterior's GLB share was raised to 2.4 (ruling 24).
- The Windlass has 9 triangles and under 10 kB of headroom.
- Allocation rose from 4 448 to 5 116 B per tick + frame over the round (limit 6 144); the source was not isolated.
- `blender/placeholders.py` keeps the pawls at z 2.6 (ruling 25).
- A plain build after an `--only` build rebuilds almost everything (97 of 102): slow, not wrong.

**Not verified**
- **No real GPU**: frame rate on integrated graphics is unmeasured; the spread build's compile cost is unmeasured
  (SwiftShader reports 0 ms); a real context loss was not re-run.
- Easy and Hard; the two secrets; the "leave the round" ending; a person's pace through the story queue's stale rule.
- The audio was not listened to (the new parry note included); the UI's wall-clock animations were not judged.
- The interior zones after the last rebuild were looked at only in the tour's frames (hall and bore: sheet only).
- `swapTo` / `enterSeam` failing during play after the retries (`polish-r2-fixer.md`, code-world 3).

# Part A. Code integration, polish round 2 (2026-10-04)

All six real systems (player, enemies, world, render, ui, audio) run in their slots on the final assets. Everything
below was measured on this machine in this pass (WSL2, headless Chromium on SwiftShader: **no GPU**; wall-clock frame
rate means nothing here). Evidence: `shots/integrate-code/` (158 tour frames, five extra frames, contact sheets in `sheets/`,
`playthrough.json`, `restores.json`, `production.json`, `low_tour.json`, `high_tour.json`). Logs:
`scratch/integrate-code/final_*.log`.

## A.1 Run and play the demo

| What | Command |
|---|---|
| Dev server | `npm run dev`, then open the printed `http://127.0.0.1:<port>/` (the port is OS-assigned) |
| Production bundle | `npm run build` (output in `dist/`), then `npx vite preview` and open the printed URL |
| Straight into a run / at a checkpoint (**dev server, `?test=1` or `?debug=1` only**: a public page ignores both, C.2 row 11) | `...?autostart=1` / `...?cp=cp_gallery_bay` (any of the 17 checkpoint ids) |
| Fixed quality tier | `...?tier=min` / `low` / `high` (otherwise detected, and adapted while playing) |
| Perf overlay | `F3`, or `...?perf=1` |
| Keep the save between page loads | `...?persist=1` (then "Continue" on the title) |
| The debug hook in a production build | `...?debug=1` (`window.__dbg`) |

**Controls** (all rebindable in Options): `W A S D` or the arrows move, the mouse looks, **left click fires**, `R`
reloads (one round at a time; firing interrupts it), `Q` puts a line round under the hammer (and takes it out again),
`F` loads the kept round (only on a lit proving mark, in the Windlass's third phase), `E` interacts (notes, cartridge
points, line lockers, lift levers, the round on the stone), `Shift` runs, `Space` jumps, `Esc` or `P` pauses. In a
note: `E`, `Enter`, `Space` or a click turns the card, `Esc` closes it.

**Options** (title or pause menu): mouse sensitivity, invert Y, field of view 50 to 80, head bob, screen shake, reduce
motion, reduce flashes, subtitles (size S to XL, background), captions for sounds, difficulty (easy / normal / hard),
sprint hold / toggle, fire click / hold, key bindings, crosshair size / colour / outline, hints off / normal / fast,
graphics auto / low / high, resolution scale, three volumes.

**The stage, as a player meets it:** the lip (a note, seven jugs for six rounds), Plenty's street (eight Biders), the
yard (a knot on the door, three Transits and four Biders, the man on the far rim), the Tally House (three shutters, a
cord, the hatch knot, two risers), the gallery (the proving line, the file of six and the six who did not queue), the lift hall (the Tamper), the
lift, the antechamber (three questions), the Windlass (parley, two phases of lead, the kept round, six dry mouths),
the proving lift, the far rim (the lamps, the stone, the end card). The bot plays it in 7.8 minutes; GDD 4.2 expects 15
(skilled) to 25 minutes of a person.

## A.2 What the gate commands say

| Command | Result (final run of this pass) |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout, manifest, `contracts.ts` = ARCHITECTURE section 5: pass (no contract change was made) |
| `npm run test:unit` (vitest) | 23 files, 392 pass |
| `KEEP7_REAL=all node --test tests/core/` | 68 pass, 0 fail (225 s) |
| `node --test tests/core/` (core stubs) | 62 pass, 6 skipped (the six rewritten sandbox pages), 0 fail |
| `node --test tests/player/` `enemies/` `world/` `render/` | 36, 51, 52, 32 pass, 0 fail |
| `node --test tests/ui/` `audio/` `pipeline/` | 34 pass, 39 pass, 83 pass (four tests rewritten: A.3), 0 fail |
| `node --test tests/art_weapons/` `art_enemies/` `art_boss/` `art_props/` `art_env_interior/` `art_env_exterior/` | 22, 33, 39, 96, 17, 19 pass, 0 fail |
| `node --test tests/e2e/` | 4 pass: the playthrough, its determinism, a death at every checkpoint, the production bundle (20 s) |
| `npm run build` | `dist/js/index-*.js` 1 812 618 B (505 kB gzip), one script |

Seven `tests/core` tests failed under `KEEP7_REAL=all` when this pass began. Five asserted something only a stub
does and were rewritten to ask the same question of both (no assertion was weakened): the starved alloc test's
`roundsFired` (a six-shot gun runs dry: `setAmmo` in the loop), the texture figure of `?assets=none` (the real renderer
counts bone textures, as the contract says), "continue" (the save is committed through play, not through a warp), the
viewer's panel text of a final file, the production page's "click anywhere" (the real title is a menu), and "nothing is
held after a walk" (she coasts 0.43 m). Two were real: the allocation and the frame-dependent hash, A.3 rows 2 and 3.

## A.3 Seams fixed (each one listed; file, what was wrong, how it was found)

| # | File | What was wrong | Found by |
|---|---|---|---|
| 1 | `src/core/greybox.ts` | the terrain sheet had a solid id of its own, so `capsuleFree` was false everywhere above the lip | the art integrator; random walks |
| 2 | `src/core/assets.ts` (`quietSkeleton`), `src/render/system.ts` (`quietSort`), `src/render/materials.ts` (`fadeProp`) | a tick plus a frame allocated 7 366 B (limit 6 144): three re-uploaded the bone texture of every skinned prop every frame, `Array.sort` copied the render list, nine floats were stored per dynamic mesh. Now 4 411 to 4 448 B | `alloc.test.mjs`, heap profile |
| 3 | `src/ui/hud.ts` (`debug()`) | the HUD's debug state held a DOM cache refreshed only on drawn frames, so `__dbg.hash()` depended on how many frames a script drew | `walk.test.mjs` |
| 4 | `src/core/flow.ts`, `src/core/loop.ts` | a checkpoint reached inside a tick was saved between two systems' listeners of one event: the save of `cp_boss_proven` held the Windlass in its hush, and **a death after the proof gave back an unproven bore with the seventh spent** | the playthrough's death at every checkpoint |
| 5 | `src/world/checkpoints.ts` | the save of `cp_lip_start` was taken before the first objective was set: a death before the jug gate came back with no objective | the same |
| 6 | `src/core/input.ts` | Chromium's settling `mousemove` as the pointer lock engages (-96, -399 after the click on "Begin") was sometimes read as a look: the run began with her looking at the roof | the production page's first screenshot |
| 7 | `src/audio/engine.ts` | `boss/discharge` comes with the shot (enemies) but audio started the 0.9 s glow tone on it again: a rising tone after every shot of the Windlass | `docs/requests` (audio 1.7 against enemies 4.6) |
| 8 | `src/world/build.ts` | `plug_door_tally` was hidden while the door was shut: sky through the plank gaps | the art integrator |
| 9 | `src/render/moods.ts` (`L5a`) | every dynamic thing in the antechamber took a 0.6 ember key: the bore door, cradle and plate were orange in a violet room | the art integrator; tour |
| 10 | `src/render/materials.ts` | High's fresnel rim (rim^3 x 0.35) washed the revolver pale teal out of doors; the coda's fog took 95 % of the town card (now capped at 55 % on the coda's far cards); `userData.tint` was not drawn (the Biders' four tints) | the art integrator; tour; `docs/requests` |
| 11 | `src/enemies/defs.ts`, `tamper.ts`, `transit.ts`, `bider.ts` | walk clips played at 1.0 against faster ground speeds (feet slid); `turn_about` snapped 180 degrees at its end; a wider tint spread | `docs/requests` (art) |

`tests/harness.mjs`: `Game.shot` waits up to 120 s; `openGame({ ignoreConsole })` and `AUDIO_DEVICE_ERROR`.
`tests/pipeline`: four tests rewritten to build their own placeholder copies (`common.mjs`).
Every row of `docs/requests/*.md` has a decision in the last section of its file.

## A.4 The playthrough (`tests/e2e/playthrough.test.mjs`)

The bot starts on the title screen, clicks "Begin" in the DOM, and plays to the end card on Normal with the hook's
**input** surface only: `followPath` / `walkTo` (which turn the view and hold `forward`), `setAim` / `aimAt` /
`aimAtEntity` (look), `tap('fire' | 'reload' | 'line' | 'kept' | 'interact' | 'jump')`, `setActions(['back'])`, and
DOM key presses for the UI's own screens (a note's cards). It reads the game the way a test may: `player()`,
`enemies()`, `world.puzzle / encounter / doorState`, events, `probe()` (what the round would meet), and for the
Windlass `ext.enemies.boss()` / `bossPoint()`.

- **No teleport, no forced puzzle or encounter, no ammunition or health cheat.** The test asserts one
  `player/spawned` in the whole run, 17 `checkpoint/saved` in order, and an empty `report.god`.
- **God mode: nowhere.** The driver can switch it on by itself after three deaths in one section and would write
  that to `report.god`; the test fails if it is not empty. An earlier version of the bot died four times in the
  Windlass's second phase standing in front of the lance; it now waits outside the arm's 35 degree arc and comes in
  for the hauls, and takes no damage there.
- **The four puzzles by their solutions:** seven jugs (six, reload, the seventh on the pylon arm); daylight (the three
  latches in story order, the cord, then the hatch knot); the proving line (a line round from the locker, the brass
  step, `Q`, through the loop at `knot_a`: three knots within half a second); the asking (port 4, port 6, then
  holding fire while the ring counts). No hint tier 4 fires.
- **The six encounters fought:** the street (7 Biders), the yard (3 Transits, 4 Biders), the Tally House (2), the
  file (one line round down the queue frees six, three more by lead), the Tamper (a line round through the chest,
  lead into the open vents), the Windlass (six open mouths in the parley's inspection; phase 1; phase 2: both pawls,
  then mouths, three hauls; phase 3a: to a lit mark, `F`, down the bore; phase 3b: six dry mouths). 28 Biders freed,
  none felled (it aims for the crown knot), 87 rounds, 86 of them told.
- **Both rides** by walking into the cage and pressing `E` on the lever.
- **Deterministic:** a second page load ends on the same tick (28 943) with the same hash (`734e2ad7`) and the same
  stats.
- **A death at every checkpoint** (third test): on first reaching each of the 17 checkpoints she is killed through
  `player.applyDamage`; the death sequence and the restore run by themselves; the puzzles, encounters, doors,
  objective, resident set and boss phase must be what the checkpoint held, she must stand at its marker, alive, on the
  ground, outside geometry, with 67 HP or more and six rounds or more, and control must be back within 180 ticks
  (measured: 108 at every one). The run then goes on, from that restore, to the end card. This check found rows 4
  and 5 of A.3.

**Where the bot needed help, honestly:**

| Place | What |
|---|---|
| nowhere | god mode, teleport, `solvePuzzle`, `clearEncounter`, `setAmmo`, `setHealth` |
| aim | it aims with `setAim` (exact, instant) and fires on the next tick: a marksman no person is. Biders are engaged inside 30 m (18 m in the tour), Transits and the Tamper at any distance |
| the boss room | `followPath('critical')` walks straight at the next nav node and pressed into a rib from bay 3 (it has no path planner off the graph). The bot walks the chamber on its own ring (inside the ribs) to the lift gate. Not a level bug: a player walks round a rib |
| the Windlass | it reads `ext.enemies.boss()` (the pattern step, which mouths are dark, the pawls) and `bossPoint()`: debug queries, where a player reads the lamps and listens |
| the note on the stone | from the east the round's focus sphere is in front of the note (0.4 m apart) and `E` takes the round; the bot reads the note from the south |
| sprint | it runs only on the last leg of the street (so the "hold Shift" hint goes away, as it does for a player); everywhere else it walks |

**What the playthrough does not prove:** that a person finds the solutions (the bot knows them); the fights' difficulty
(it is never hit: its health is 100 at every checkpoint); the two secrets (not visited); the "leave the round" ending
(`bot.play({ leaveTheRound: true })` exists, not run in the test); Easy and Hard.

## A.5 Driving the real game (for critics)

`tests/e2e/lib/bot.mjs` (Node side) + `page-bot.js` (senses and hands) + `page-play.js` (the stage, one function per
checkpoint). A runnable example: `node tests/e2e/example.mjs`.

```js
import { startServer } from '../harness.mjs';
import { openBot } from './lib/bot.mjs';

const server = await startServer({});
const bot = await openBot(server, { piece: 'critic-visuals', tier: 'high' });   // the title; nothing stubbed
await bot.startFromTitle();                                                      // clicks "Begin"
const run = await bot.play({ until: 'cp_tally_hatch', shots: 'daylight:|fight:', shotPrefix: 'tally_' });
console.log(run.checkpoint, run.report.notes, run.frames);                       // shots/critic-visuals/tally_NN_<beat>.png
await bot.jump('cp_boss_p2');                                                    // a debug jump to any checkpoint
await bot.play({ until: 'cp_boss_p3', shots: 'all' });                           // the bot fights phase 2 from there
await bot.game.shot('where_i_am');                                               // a frame now (canvas + HUD)
await bot.close(); await server.close();
```

| Call | What it does |
|---|---|
| `openBot(server, { piece, tier, seed, viewport, checkpoint })` | the real game on its title (or, with `checkpoint`, in a run there). `piece` names `shots/<piece>/` |
| `bot.startFromTitle()` | a DOM click on the title menu's first item; resolves in `playing` |
| `bot.play({ until, shots, shotPrefix, settleMs, frameEvery, dieAtEveryCheckpoint, god, godAfterDeaths, skipReadables, leaveTheRound })` | plays by input from where the run stands to a checkpoint id or `'ending'`. `shots`: `'all'`, a list of beat names, or a regular expression source: a page screenshot at each. Returns `{ state, checkpoint, tick, report, beats, journal, frames }` |
| `bot.jump(checkpoint)` | `__dbg.checkpoint(id)`: a fresh timeline at that checkpoint (6 + 24 rounds, full health) |
| `bot.eval((b, dbg, arg) => ..., arg)` | page-side code with the bot (`b`) and the hook: `b.go(to)`, `b.walkTo(x, z)`, `b.shootEntity(id, part)`, `b.fight(done, opts)`, `b.reload()`, `b.collect()`, `b.helpers.use(id)`, `b.helpers.read(id)`, `b.helpers.clear(encounter)`, `b.SECTIONS[cp]()`, `b.boss.*` |
| `bot.game` | the harness `Game`: `dbg(method, ...args)`, `state()`, `events()`, `shot(name)`, `step(n)`, `until(cond)` |
| `node tests/e2e/tour.mjs [low high] [--until cp] [--range 18] [--piece name]` | the whole tour: a frame at every beat, `<tier>_tour.json` |

Beats (the names `shots` matches): `start`, `read:<id>`, `puzzle:<id>`, `seven_jugs:six_down / open`,
`fight:<encounter>`, `clear:<encounter>`, `knot:yard_latch / hatch_latch`, `story:dowser / tamper_vignette /
windlass_seen / cradle / rim_vista / lamps / stone / round_taken`, `daylight:<target>`, `proving_line:aimed / solved`,
`file:lined`, `matador:line`, `ride:<id>:cage / dark`, `enter:<zone>`, `the_asking:answered_1 / answered_2 / listening /
solved`, `boss:parley / inspection / p1 / p1:pattern / p1:haul / p2 / p2:pattern / p2:guard / p2:haul / p3a /
on_the_mark / hush / plumb / the_seventh / p3b / dead / lift_gate_open`, `ending:fire`, `ending`, `ending:card`,
`restore:<checkpoint>`.

Useful `__dbg` calls on the real game: `state()` (everything, JSON), `player()`, `enemies()`, `puzzles()`,
`objectives()`, `perf()` / `perfPeak()` / `perfRun(n)`, `events(sinceSeq, name)`, `probe()`, `hash()`, `checkpoint(id)`,
`setTier('low' | 'high' | 'min')`, `setOption(key, value)`, `god(on)`, `ext.core.stepAsync(n, render)`,
`ext.core.damage(amount)`, `ext.core.playerExtra()`, `ext.world.status()`, `ext.world.hintClock(seconds)` (fast-forward
the hint ladders), `ext.enemies.boss()`, `ext.enemies.actors()`, `ext.assets.report()`. A page screenshot (`game.shot`)
includes the HUD; `__dbg.capture()` is the canvas alone.

Three things a critic's script will meet: (1) the UI's animations (the end card's rows, hint fades) run on the wall
clock, not on stepped ticks: after stepping, wait real time before a screenshot of them (`play({ settleMs: 400 })`
does it before every beat's frame, and `tour.mjs` waits 7 s for the end card: without it a frame shows the prompt of
something she left a thousand ticks ago); (2) a readable pauses the game (`state().game === 'paused'`) and takes DOM keys, not `tap`; (3) under
`?test=1` nothing is drawn unless asked: `play({ frameEvery: 20 })` or `dbg.step(0, true)`.

## A.6 Measured

**The production bundle** (`tests/e2e/production.test.mjs`, `shots/integrate-code/production.json`): 105 files,
**11 257 839 B = 10.74 MiB of 20**. JS 1 812 618 B (1.73 MiB; 505 kB gzip), CSS 23 018 B, HTML 759 B, assets
9 421 444 B (8.98 MiB, 102 files). The work-order share for JS + CSS is 1.5 MiB uncompressed: over by 0.25 MiB, inside
by a factor of three over the wire. No `window.__dbg` without `?debug=1`; 37 assets and 13 textures from files in the
surface set, 0 synthesised; no console error; no request over 399.

**Load sequence** (the page a player gets): `index.html` (759 B), the stylesheet, the one script (1.8 MB), then the
ten shared textures, the surface set's lightmaps and three zone files, its props, the revolver and the first
creatures. The title is up after 16 to 20 requests (2.4 to 4.2 MiB, depending on how far the prefetch has got when the menu appears); a click on "Begin" has control after 53 requests,
**6.85 MiB**. The underground and coda sets are fetched during play (the seam on the peg stair, the proving lift).

**Budgets with every real system, enemies alive and effects running** (`*_tour.json`: the peak over the whole played
run, one frame every 20 ticks and every beat, 960 x 540):

| | draw calls | triangles | textures + render targets | caps |
|---|---|---|---|---|
| Low | 65 | 79 772 | 46.8 MiB | 100 / 120 000 / 64 |
| High | 84 | 106 808 | 58.4 MiB | 220 / 400 000 / 128 |

Per cell with encounters cleared: B.2. `KEEP7_REAL=all node --test tests/core/budget.test.mjs` passes.

**JS** (this machine's CPU): `simMs + updateMs` median 0.050 ms per tick over the walked critical path with all six
real systems (`walk.test.mjs`; the budget is 4 ms per frame). The whole playthrough, fights and boss included, runs
28 943 ticks in about 8.5 s of wall time with the bot's own work in it: under 0.3 ms per tick on average.
**Allocation**: 2 182 B per tick fighting, 704 B walking, **4 448 B per tick plus a rendered frame** (limit 6 144).
**Death to control**: 108 ticks (1.8 s) at every checkpoint. **Seam** (peg stair): worst 46.8 MiB.

## A.7 The tour (`shots/integrate-code/`)

`node tests/e2e/tour.mjs low high`: 79 frames a tier (`low_NN_<beat>.png`, `high_NN_<beat>.png`), nine contact
sheets a tier in `sheets/`. No console error, no warning, no death, no god mode on either tier. **Opened:** all nine Low
sheets of the final tour except `low_sheet_02` and `05` (those two were opened from the tour before the last, same
beats); of High, sheets 04 and 06 of the final tour and 00, 01, 03, 05, 08 of earlier tours (after the gun and
antechamber fixes). `high_sheet_02` and `07` were not opened. What the frames show:
the title menu over the overhang; the note; the jugs, the sand thread and the pylon arm; the street and the yard in
the long light; the Tally House with its eleven seated, the three blades and the day-cell's green; the hatch ajar with
aqua under it; the gallery, the sighting loop with the knot in it, the line round's aqua trace down the file; the lift
hall and the Tamper at its bulkhead; the cage; the antechamber, the eight ports and the listening ring filling; the
Windlass through the open door, its six mouths, the guard, the bore turning from violet to aqua at the seventh, the
dead head; the rim with the plumb thread and the Rule; the stone and the note; the end card.

Fixed from looking: the orange door in the violet antechamber, the teal revolver on High, the town lost in the coda's
fog, the roof-ward first frame of the production page, the frames the bot took of the wrong thing (vista markers name
their subject in `params.target`).

## A.8 Known gaps (code side; art gaps are in B.6)

- **No real GPU was used.** Frame rate on integrated graphics is unmeasured; the budgets above are the proxy.
- The **view-model** is small and low (4 % of the frame at idle); not re-placed.
- **`rise_from_seat`**: the two risers of the Tally House stand up through their chairs.
- The **cowl** round the hatch knot is drawn as a plain salmon block (`low_20_fight_enc_tally.png`): art.
- The **well sweep's arm** and the Pellam **yard door** read pale blue-white in the long light (`low_04`, `low_08`).
- **`E` between the note and the round on the stone** takes whichever focus sphere the ray meets first; from the east
  that is the round.
- **Story keys** still missing in `design/story.json` (`ui_end_of`, `ui_opt_size_*`, `ui_key_*`): the end card reads
  `86 / 87`. (The two boot lines exist since Part C, as `system.no_webgl` and `system.boot_failed`.)
- **Contract requests not applied**: `GameClock.cancelSlowMotion(reason)` (a hush unloaded early plays out its 1.6 s
  of half speed), `interact/focus.inRange`, `projectile/spawned.atPlayer`, a position on `enemy/state`.
- **World's id tables** (checkpoint progress, wave rules, the shaft and locker bindings) are still code, not layout.
- **High tier**: heat shimmer and sand sparkle are not built (GDD 20.1 row 9).
- **JS + CSS** is 1.75 MiB against a 1.5 MiB share (the total is 10.74 of 20).
- The bot is never hurt in the tour. Five extra frames (`extra_01` to `extra_05`, `sheets/extra_sheet.png`, opened) show
  a Bider at arm's length, a hit taken (one health segment short), the death line, the pause menu and the options
  screen; the damage arc and the Transit's and Windlass's hits on her were not caught in a frame.
- **Impacts on false fronts** still land on the collider plane behind porch posts (B.6).
- The UI's wall-clock animations and the audio were not judged: no frame shows motion and nothing listened.

# Part B. Art integration, polish round 2 (2026-10-04)

Everything below was measured on this machine in this pass. Evidence: `shots/integrate-art/`
(`viewer/`, `game_low/`, `game_high/`: one 2 x 2 sheet of four headings per checkpoint, vista
marker and seat; `budget_none.json`). Scripts: `scratch/integrate-art/` (`tour.mjs`, `budget.mjs`,
`geo.mjs`, `ground.mjs`, `holes.mjs`, `dark.mjs`).

## B.1. State of the assets

| Check | Result |
|---|---|
| `rm -rf public/assets blender/export && node tools/build-assets.mjs --force` | 102 items built in 392 s, exit 0 (zones last, embedding the final props; `lm_surface` as the late bake) |
| `npm run check:assets` | 84 assets, 18 textures, 8.98 MB: all pass |
| `node tools/asset-status.mjs` | 0 placeholder assets of 84, 0 placeholder clips of 88, 0 placeholder textures of 18 (nothing cut by the scope guard) |
| `npm run validate` | layout 16 checks 0 warnings; assets.json 16 checks; contracts match |
| `npx tsc --noEmit` | clean |
| Download | `public/assets` 9 421 444 B = **8.98 MiB**; production bundle (all six real systems) 1 832 939 B = 1.75 MiB; **10.73 MiB of 20** |

Per folder (MiB): env 3.77, lm 2.65, enemies 0.84, props 0.78, tex 0.37, boss 0.32, weapons 0.25.

## B.2. Budgets with real art (all six real systems, `scratch/integrate-art/budget.mjs`)

Peak over up to nine nav nodes per cell and eight headings each, encounters cleared, AI off
(no live enemies in the frame: the cell bounds of `assets.json` include them).

| Cell | Low: draw calls / triangles / tex + RT MiB | High |
|---|---|---|
| cell_lip_gully | 46 / 55 560 / 42.8 | 70 / 68 501 / 54.5 |
| cell_lip_gate | 51 / 73 191 / 42.8 | 78 / 88 561 / 54.5 |
| cell_street | 49 / 72 429 / 42.8 | 77 / 88 248 / 54.4 |
| cell_yard_door | 47 / 77 340 / 42.8 | 85 / 99 887 / 54.4 |
| cell_yard | 55 / 75 770 / 42.8 | 82 / 94 498 / 54.4 |
| cell_tally_seam | 36 / 47 653 / 46.8 | 47 / 47 666 / 58.4 |
| cell_tally | 52 / 63 467 / 46.8 | 64 / 64 044 / 58.4 |
| cell_gallery_stair | 39 / 46 131 / 35.6 | 50 / 46 142 / 47.2 |
| cell_gallery | 68 / 76 046 / 35.5 | 79 / 76 057 / 47.2 |
| cell_hall | 63 / 71 608 / 35.6 | 74 / 71 619 / 47.2 |
| cell_bore | 52 / 59 634 / 35.5 | 63 / 59 645 / 47.2 |
| cell_rim | 16 / 15 482 / 23.5 | 28 / 15 667 / 35.2 |

Caps (`CLAUDE.md`): Low 100 / 120 000 / 64, High 220 / 400 000 / 128. Every cell is inside on both
tiers and, on Low, inside its own computed bound. Nothing had to be merged or decimated.
`KEEP7_REAL=all node --test tests/core/budget.test.mjs` passes.

## B.3. What was changed (requests decided: see the last section of each `docs/requests/*.md`)

Layout (through `tools/gen_layout.mjs`; 308 solids, 263 markers; README rulings 21 to 23):

- `knot_a/b/c` face west (rotY 90): the proving line reads from the mark.
- `ia_stone_round` y 18.356, `light_rim_stone_glint` y 18.40 and sprite `aim_star`, `rd_note_stone`
  y 18.362; `rim_stone` solid = the drawn shelf (1.95 x 0.35 x 0.9 at (1.29, 102.513)).
- `rd_note_lip` on the flat stone (11.373, 14.085, 104.546); `rd_ledger` y 0.795.
- Wagon: `st_cover_wagon` (wheel end, 1.5 x 2.1 x 1.6) + new `st_wagon_bed` (2.2 x 1.6 x 1.6).
  Cart: `yd_cover_cart` (barrel, 2.2 x 2.0 x 1.62) + new `yd_cart_shafts` (1.14 x 0.45 x 0.9).
  `propPivot` on the two cover solids is where the prop stands.
- `params.cue` on `door_yard_gate`, `ia_hatch`, `ia_baffle`; seven line keys on `bore_opening.params.lines`.

Blender (integration seams only, each marked `integration` in the source):

- `env_exterior/lip_fields.py`: the lip's ground is the layout's plane within 3 m of every
  checkpoint, start and spawn marker (collider measured 14.0000 at the start, 0.0000 at the gate).
- `env_exterior/street_yard.py`: yard sand stops at the Tally House wall face; wagon and cart at `propPivot`.
- `env_exterior/street_parts.py`, `lip_parts.py`: near-black underlays 16 cm under the ground
  (cracks at wall feet and at the lip / street seam showed the sky); kept out of every bake.
- `env_exterior/ext_frontier.py`: a shallow dark box behind every shut dressing door and shutter.
- `env_exterior/surface_common.py`: a caster box for the Tally House in the surface bake (the sun
  shone through it onto the yard); `heal_black` for vertex-lit faces baked pitch black (the black
  line round the overhang's ceiling).
- `env_exterior/env_far_rim.py`: the slab's pivot is `ia_stone_round`; the shelf is the solid.
- `env_interior/env_the_bore.py`: the missing 1 x 2 m floor of the antechamber's east doorway.

## B.4. Tests after the final build

| Command | Result |
|---|---|
| `npx vitest run` | 390 pass, **2 fail**: `tests/core/data.spec.ts` lines 25 and 363 pin 306 solids; the layout has 308 |
| `node --test tests/art_env_exterior/` | 19 / 19 |
| `node --test tests/art_env_interior/` | 17 / 17 |
| `node --test tests/art_props/` | 96 / 96 |
| `node --test tests/core/{flow,walk,budget,seam,boot,playthrough,determinism}.test.mjs` (stubs) | 26 pass, **1 fail**: random walks, see 5.1 |
| `node --test tests/pipeline/` | 79 pass, **4 fail**: tests written against placeholder files, see 5.2 |

## B.5. For the code integrator

(All seven items were taken up in Part A: A.2, A.3 and the last section of each `docs/requests/*.md`.)

1. **`capsuleFree` is false everywhere above a sculpted terrain** (the whole of `the_lip`).
   `src/core/greybox.ts` gives the terrain sheet a solid index of its own (`solidIds.push('')`), and
   `collision.ts` `freeImpl` then counts one crossing of that open sheet by its downward ray as
   "inside a solid". Measured: false at (16, 14 + 0.2, 107.5) and at every height above the ground
   at (12, 60). Give the extra triangles the "no solid" index (any value >= `solidIds.length`,
   without pushing an id). This, not the 4 mm, is what fails the random walks at `cp_lip_start` /
   `cp_lip_gate`; `src/player/controller.ts:207` and `src/enemies/transit.ts:433` call it.
   The 4 mm itself is fixed (`flow.test.mjs` restart passes with stubs).
2. `tests/pipeline`: (h) expects a `brk_` empty in `env_tally_house` (the final zone has 11 `inst_`,
   0 `brk_`); test 20 and "a final zone is not held to the blockout" need a placeholder zone;
   "a placeholder never replaces a final file" starts from a placeholder `prop_crate`. All four
   assume files that no longer exist.
3. `tests/core/data.spec.ts`: 306 -> 308 (two lines).
4. `KEEP7_REAL=all node --test tests/core/flow.test.mjs`: "continue resumes the stored save" fails
   with the real systems (not looked into: code side).
5. **`plug_door_tally` is hidden while `door_tally` is closed** (`src/world/build.ts:715`), and
   `prop_door_frontier` has gaps between its planks: from the yard the shut door shows bright slits
   of sky (`shots/integrate-art/game_low/cp_yard_clear.png`, frame 4). Show the plug whenever the
   Tally House unit is not drawn.
6. Dynamic props against the baked rooms (render's lighting of `m_prop` instances): the bore door,
   cradle and station plate render orange in the dark-violet antechamber (`game_low/x_cradle.png`,
   `x_camp_three.png`); the well sweep's arm renders pale blue-white (`x_lip_gate.png`); the Pellam
   yard door and the wash on the line are near-white in the street (`x_cart.png`, `x_trough.png`).
   On High the revolver renders pale teal (`game_high/cp_street_clear.png`).
7. Rows left to code in `docs/requests/code-world.md` 2.1 to 2.5 and 6.1.11, the walk rates of the
   Tamper and the Transit, the view-model's placement.

## B.6. Known gaps (art)

- The fallen ceramic rib in the street (`m_pellam`, enamel, sunlit) displays as a nearly white
  shape with little form: lit enamel is the art bible's brightest surface. Not restyled.
- A hairline of sky in a seam of the stepped adobe stub in the yard (`game_low/x_yard_tally_door.png`,
  frame 2) and across the far mesa at the lip gate (`x_lip_gate.png`, frame 3).
- Impacts on a false front under a porch land on the collider plane behind the posts
  (`docs/requests/code-render.md` 5): only the wagon, cart and rim stone were brought to the drawn shape.
- The drawn rim shelf is 1.2 m deep, its solid 0.9 m: 0.15 m of 0.24 m high rock on each long side
  has no collision.
- The cart's and wagon's cover changed shape (see 3): the encounters of the street and yard were
  not replayed with live enemies in this pass.
- 16 roof triangles of the yard's Tally facade are coplanar with the Tally House deck at y 5.0
  (never seen from above).
- The antechamber threshold and all interior zones were looked at only on Low in the game and in
  the viewer; High was captured for checkpoints and vistas and only the street sheet was opened.

# Part C. Cross-cutting fix pass, polish round 2 (2026-10-04)

The first critic panel of the round (playthrough, performance, story, robustness) filed one blocker, four majors and
ten minors against core, the layout and the story text. This pass took them in `src/core`, `src/main.ts` (unchanged in
the end), `index.html`, `tools/gen_layout.mjs` -> `design/layout.json`, `design/story.json`, `tests/core`, `tests/e2e`
and the docs. Nothing under `src/<piece>/`, `tests/<piece>/` or `blender/` was edited; what the pieces must follow up
is in `docs/requests/polish-r2-fixer.md`. Evidence: `shots/fixer-r2/` (every frame named below was opened),
`scratch/fixer-r2/` (scripts and the logs of the final gate, `f_*.log`).

## C.1 The gate after this pass

| Command | Result (final run of this pass) |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run validate` | layout 16 checks 0 warnings (309 solids, 263 markers); assets.json 16 checks; `contracts.ts` = ARCHITECTURE section 5 (no contract change) |
| `npm run test:unit` | 24 files, 405 pass (392 before: +8 quality, +4 asset retry, +1 save shape) |
| `KEEP7_REAL=all node --test tests/core/` | 75 pass, 0 fail (309 s; 68 before + the 7 of `robust.test.mjs`) |
| `node --test tests/core/` (core stubs) | 69 pass, 6 skipped, 0 fail (128 s) |
| `node --test tests/e2e/` | 6 pass (37 s): the four of Part A + the public page ignoring `?cp=` + the file that will not come |
| `npm run build` | `dist/js/index-*.js` 1 820 692 B (was 1 812 618), one script; CSS 23 018 B |
| `node --test tests/ui/` | 34 pass, 0 fail (final run) |
| `node --test tests/pipeline/` `render/` `enemies/` `audio/` `art_env_exterior/` | 83, 32, 51, 39, 19 pass, 0 fail (run before the collider was thinned from 1 m to 0.1 m and before the quit went through `loading`; not re-run after) |
| `node --test tests/world/` | 51 pass, **1 fail**: `misc.test.mjs:25` asserts `nar_ask` after the hearth note (it moved to the critical path, row 8) |
| `node --test tests/player/` | 35 pass, **1 fail**: `wired.test.mjs:74` asserts she stays where she quit (the title is the overhang again, row 10) |

The two failures assert the behaviour the critics asked to change; both tests belong to their pieces
(`docs/requests/polish-r2-fixer.md`, code-world 1 and code-player 2).

## C.2 What was fixed

| # | Issue | Cause | Change | Proof |
|---|---|---|---|---|
| 1 | **Blocker**: she walks out of the world behind the first north facade and falls for ever | the wall drawn at the east end of the north alley (`chunk_st_east`, face at x 0.03) had no solid in the layout; nothing catches a fall | `st_alley_cap_n` (x -0.1..0, y 0..4, z -15..-12: a slab against the drawn face, inside the zone's bounds). And a net: below 20 m under the lowest zone floor (y -65) `flow.ts` puts her back on her checkpoint with its save, no death | the critic's own `scratch/r2-playthrough/trace.mjs cp_street_clear 45 nojump`: `lastGround x -0.45, fellAt null, 20 s later y 0`; `tests/core/robust.test.mjs` (walks at the wall on three lines; teleports to y -80 and is back, alive, `fallsCaught` 1) on stubs and on the real systems; `shots/fixer-r2/alley_east_end.png` |
| 2 | Major: one 8 s stall demotes to `min` for good and stores it | `starve()` after 5 s, stored at once, nothing promotes | `quality.ts`: 15 s; a demotion to `min` is not stored when it happens; `min` on budget for 60 s at its full ratio tries Low again (three tries a session, 60 / 120 / 240 s); stored only when a try failed, when `min` held 180 s with no way up, or when `min` starves; a stored demotion at boot is retried once and removed when Low holds 7 200 frames (ARCHITECTURE 8.5) | the critic's `quality_sim.ts` scenario D: no demotion, ratio back to 1.00 at 195 s, stored `''`; eight new unit tests |
| 3 | Minor: the ratio overshoots (0.9 -> 0.6) and has a dead band | sqrt of a vsync-quantised frame time; nothing between +4 % and +15 % | at most two steps a decision; more than 6 % over for 120 frames gives one step | scenario E: `0.9, 0.7, 0.8` (23 changes in 10 min, was 28); scenario G: 3.2 % of frames over 17.5 ms (was 100 %), ratio 0.9 |
| 4 | Minor (twice): bone textures leak on every set release | cloned skeletons were never disposed | `AssetStore.release()` disposes the skeleton of every skinned instance ever cloned from a released asset | `robust.test.mjs`: `renderer.info.memory.textures` after four swap-quit-begin cycles, real systems: 20, 20, 20, 20 (the critic: 37, 55, 73, 91) |
| 5 | Major: pointer lock lost on the death card | `loop.ts` remembered a lost lock only in `loading` | also in `dead`: the first playing tick pauses with `focus_lost` | `robust.test.mjs`, real-time page (no `?test=1`), stubs and real systems |
| 6 | Major: a failed request is never retried; the game goes on in a broken world | the rejected promise stayed in the entry; `fetchBinary` gave up at once; a flow job that threw left the state alone | network errors and 5xx are asked again after 0.5, 1, 2 s; a failed load is forgotten; a flow job that throws in `loading` (or a same-set respawn) returns to the title with one line (`system.load_failed`), the cursor back, the save kept, the title shot rebuilt before the title is shown | `tests/core/assetsRetry.spec.ts`; `tests/e2e/production.test.mjs` on the **public** page: `lm_gallery.webp` aborted for good is asked 4 times, title + line + "Go on" still offered, then the 5th request loads the gallery (`shots/integrate-code/production_load_failed.png`, `shots/fixer-r2/prod_net_always_title.png`, `prod_net_always_go_on.png`); aborted once: `retries 1`, the gallery lit (`prod_net_once_1.png`) |
| 7 | Major: an exception in a flow job strands the game on LOADING; a bad save does it on every "Go on" | `Flow.run` logged and stopped; `readStored` checked almost nothing | `loading -> title` is a legal transition (ARCHITECTURE 3.4); "Go on" with a save that cannot be applied clears it (`save_unreadable`); `readStored` refuses an unknown checkpoint and mistyped parts | `robust.test.mjs` (the critic's four corrupt saves are not offered; a save that throws in `applySave` is dropped, title, no "Go on" after a reload); `save.spec.ts` |
| 8 | Minor: story text | | `nar_jugs_open`, `rd_note_stone`, `hint_line_3` ("... One line would take all.": the critic's wording is 97 characters, the subtitle box holds two lines of 42), `hint_ask_3`, `obj_boss_dry`, "synthesised"; `nar_ask` is now the third line of the middle shutter (`shutter_m.params.lines`), not the hearth note's `thenLine` | `npm run validate` (story wiring); `tests/ui/text.spec.ts` |
| 9 | Minor: a lost WebGL context | no listener | `loop.ts`: `webglcontextlost` is prevented and pauses (`focus_lost`); nothing is drawn while it is lost; `render.warmUp()` on restore; the canvas has a black background | `robust.test.mjs` (synthetic events: prevented, paused, flag cleared). A real loss and restore was not re-run in this pass |
| 10 | Minor: quit leaves the title over wherever she was | `quitToTitle` changed only the state | `flow.ts` `titleShot`, behind the loading screen (a quit is now `paused -> loading -> title`): `world.buildSet('surface')`, the other sets released, mood / exposure / wrong-fade reset, she stands on `player_start`; no checkpoint is committed in `title` | `shots/fixer-r2/quit_1_title.png` (quit in the Windlass chamber: the overhang), `quit_2_go_on.png` ("Go on" is back at `cp_boss_p2`, phase 2); `robust.test.mjs`, `flow.test.mjs` |
| 11 | Minor: `?cp=` on the public page | read unconditionally | `cp` and `autostart` only on a dev, test or `?debug=1` page | `production.test.mjs` (`?cp=cp_boss_p2&autostart=1`: the title menu); unit test |
| 12 | Minor: a 1.4 s task under the menu | decode, upload, build, start and warm-up ran as one task; the first frame's uploads came after the title | boot yields between its stages, uploads one texture a task, and draws one frame behind the loading screen | `scratch/fixer-r2/prod.json`: long tasks 251, 156, 122 ms before the menu is visible (865 ms), 62 and 55 ms after (was 501 and 1 374 ms) |

## C.3 Not done, and why

- **Per-tick allocation** (4 459 B per tick + frame, limit 6 144; unchanged): the two project-owned hot spots are in
  `src/enemies/boss/index.ts` and the player's view-model mixer, not core's. Requested; the test limit was not lowered.
- **The lamp count in words** (`nar_lamps_count`): the `{n}` substitution is in `src/world/story.ts`. Requested.
- **`swapTo` / `enterSeam` order in world**: world still removes the old zones before the new set is active. Core's
  retry and the return to the title cover respawn, restart and "Go on"; a failure of the seam or of a lift's swap
  **during play** (after the retries) is still world's to handle. With `?debug=1` a missing file is replaced by a
  stand-in, as on the dev server: that page is not the public one.
- **A vendor chunk** for three and postprocessing: not done (one script, 1.73 MiB; optional in the finding).
- **The dressing of the alley's end**: none needed (the wall was already drawn); the collider is 0.1 m thick and stands
  up to 0.13 m in front of the drawn face.
- **Other gaps in the blockout's perimeter** were not searched for; the net under the world is what covers them.
- The world keeps the quit run's state under the title (doors, flags, `running`); nothing visible or audible came of
  it in the checks above, and "Begin" resets it.
- No real GPU, as before: the quality controller is proven on synthetic frame times only.
