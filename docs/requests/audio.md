# Requests from the audio team (polish round 4)

For the closer: mirror these into the documents. Nothing here needs a change in another team's code.

| # | Against | What changed in `src/audio/` | Document text to update |
|---|---|---|---|
| 1 | `docs/GDD.md` 6.8 hit confirm (and its row in the section 23 table of moved numbers) | Under a short hit confirm (tick, tink, parry, deflect) the room's return now steps back by a per-room amount, starting 8 ms before the confirm: 5 dB for 120 ms outdoors, in the tally house and the gallery (unchanged); **8 dB for 160 ms in the lift hall; 10 dB for 200 ms in the bore**. The dry gun bus still steps back 5 dB for 120 ms everywhere. (`reverb.ts` `IR_TAIL_DUCK_DB`, `IR_TAIL_DUCK_SECONDS`; `graph.ts` `TAIL_DUCK_LEAD`.) | "the report's tail steps back 5 dB for 120 ms under a confirm" becomes "... 5 dB for 120 ms (the room's answer 8 dB for 160 ms in the lift hall and 10 dB for 200 ms in the bore)" |
| 2 | `docs/GDD.md` 6.8 / 17 | The same four confirms are louder in the two big rooms: **+2.5 dB in the lift hall, +3.5 dB in the bore** (`reverb.ts` `IR_CONFIRM_LIFT`, applied from the zone the player stands in). The kill's thud and the freed bell are unchanged. | one sentence beside row 1 |
| 3 | `docs/GDD.md` 17 (hit confirm row) | The tick's 1.9 kHz knock rings **130 ms** (was 90 ms): its peak was already at the limiter, so it gains level over a room's tail by lasting. Still a tick: 1.9 kHz, no pitch change. | none required unless the tick's length is written down |

Why (lead ruling R1; critic "combat", round 4): in the bore, with ambience and music, the confirms measured 1.2 to 2.7 dB
under the report's tail at their moment. Measured after, on the real game with the critic's own script
(`scratch/r4-team-audio/critic_after.log`): hit +0.9, weak +0.8, deflected +2.5 (Windlass) / +2.2 (Tamper), parried +0.6 dB;
kill +1.0 and freed +3.6 as before. Street: hit +2.5, weak +1.9, deflected +4.7 / +1.8, parried +2.7.

Not verified by ear (no one can listen on this machine): whether a 10 dB, 200 ms step in the bore's 2.8 s tail is heard as
pumping. It returns over about 150 ms (time constant 50 ms). If a listener dislikes it, `IR_TAIL_DUCK_DB[4]` at 8 costs
about 0.2 dB of margin.

## Closer, polish round 4 (2026-10-05): decisions

| Row | What | Decision |
|---|---|---|
| 1-3 | confirms in the hall and the bore, the tick's length | mirrored: GDD 6.8 in place and 23.8 |
| - | dry click (the player team's request) | applied by the closer in `src/audio/gun.ts` (+5 dB) |

# Requests from the audio team (polish round 5)

For the closer: mirror these into the documents. Nothing here needs a change in another team's code or in `design/*.json`.

| # | Against | What changed in `src/audio/` | Document text to update |
|---|---|---|---|
| 4 | `docs/GDD.md` 6.8 hit confirm / 17 (and the table of moved numbers) | In the two big rooms the four confirms that peak at the limiter (**hit tick, weak-point tink, parry's sour note, kill's thud**) now **hold their level before they decay: 12 ms in the lift hall, 20 ms in the bore** (`reverb.ts` `IR_CONFIRM_HOLD`; `synth.ts` `toneHeld`; the recipes' `a` in `gun.ts`, pre-rendered once per hold). Same pitch, same peak; 0 everywhere else, so the street, the tally house and the gallery sound as before. | one sentence beside rows 1-2: "... and the tick, the tink, the parry and the kill hold 12 ms (hall) / 20 ms (bore) before decaying" |
| 5 | same | **The kill's thud now steps the report's tail back in the hall and the bore** as the short confirms do (room's return 8 dB / 160 ms and 10 dB / 200 ms, gun bus 5 dB / 120 ms, from 8 ms before the thud at 190 ms). In the open a kill still moves nothing. No lift on the kill (it is at the limiter). | "the kill's thud is over the bed without it" becomes "... in the open; in the hall and the bore the tail steps back under it too" |

Why (critic "combat", round 5; R1): in the bore with ambience and music the critic measured hit +0.9, weak +0.8, kill +1.0,
parry +0.6 dB over the bed, each over the bed for only 30 ms. Cause: all four already peak at the limiter (-4 dB threshold on
the effects path), so round 4's +3.5 dB lift (row 2) bought nothing; the kill had neither lift nor tail step.

Measured on the real game with the critic's own measure (`scratch/r5-team-audio/measure.mjs`; `before.log` -> `after2.log`),
ambience and music on, dB over the bed in the confirm's loudest 60 ms:

| | hit | weak | kill | parry | time over the bed |
|---|---|---|---|---|---|
| the bore, before | +0.9 | +0.8 | +1.0 | +0.6 | 30 ms |
| the bore, after | **+5.9** | **+4.1** | **+6.5** | **+4.1** | 50-60 ms |
| lift hall, before | +1.6 | +1.0 | +4.2 | +1.2 | 30-50 ms |
| lift hall, after | +5.4 | +4.0 | +6.7 | +4.3 | 50-70 ms |
| Front Street (unchanged recipe) | +2.5 | +2.0 | +8.5 | +3.3 | 30-60 ms |

Against the rest of the mix as it really is under the confirm (tail stepped back), the bore is +10.8 / +9.0 / +12.5 / +9.1 dB.
The report's peak is unchanged (-2.1 dB) and every confirm's loudest 60 ms stays at least 3 dB under the report's first
60 ms (tested). Live in the real boss room (`scratch/r5-team-audio/live_cp_boss_p1.json`): sound running at 44.1 kHz, the
held takes are played from the bake (2-3 nodes a start), no console error.

Not changed: the bore's deflect (+2.5), the Tamper's clank (+2.2) and the freed bell (+3.6) by the same measure; the critic
did not list them and against the mix under them they are +10.6, +5.6 and +6.3 dB.

Not verified by ear (no one can listen on this machine): whether a 1.9 kHz knock held 20 ms still reads as a "tick" rather
than a short "pip". If a listener dislikes it, `IR_CONFIRM_HOLD[4]` at 0.012 costs about 1.5 dB.

## Closer, polish round 5 (2026-10-06): decisions

| Row | Decision |
|---|---|
| 4, 5 | **Mirrored**: GDD 6.8 (in place) and 23.10. Not listened to: `IR_CONFIRM_HOLD[4]` 0.02 stays |

## Fixer, pass i4 (2026-10-08): what is ready for this team, and what is ruled


| Item | State |
|---|---|
| Caption keys | none added: your table is pinned to the `cap_*` keys of `story.json` (`tests/audio/logic.spec.ts`). A new cue that needs a caption is a row here naming the key, the text and the table entry; the closer adds both together |

## Team audio, pass i4 (2026-10-08): two issues of critic "combat" (regression review), and what the documents must say

Both resolved in `src/audio/`; no other folder was touched. Numbers are the reviewer's own measures re-run on the real
game (`scratch/i4-team-audio/measure.mjs`; `before.log` -> `after.log`), ambience and music on unless said.

| # | Against | What changed in `src/audio/` | Document text to update |
|---|---|---|---|
| 6 | GDD 5 "Damage feedback" (line 274: "low thud"), GDD 17 | **Being hit is a three-layer cue that says what struck her** (`gun.ts` `hurt`, `engine.ts` `HURT_KIND`): the thud (kept, with a 190 Hz knock), a cloth-and-breath burst at 600-2000 Hz (110 ms, then 220 ms of breath), and a top layer by `DamageKind`: stake / fan / bullet = a hard knock and the rod ringing at 2.5 kHz; lunge = two tears at 4-6 kHz; slam / charge = a second blow at 150 -> 60 Hz and debris; canister / lance = a flat burst and a hiss above 5 kHz that burns out in 300 ms; a kill volume = none. It leans up to 0.5 to the side the blow came from (`HURT_PAN`), music and ambience step back 5 dB for 200 ms under it as under a shot, and two blows inside 3 ticks are one cue | 5: "low thud" -> "**a thud with a cloth-and-breath burst a small speaker plays, and a top layer by what struck her (stake: a ringing knock; lunge: two tears; slam: a second blow; canister: a hiss); it leans to the side the blow came from; music and ambience duck 5 dB for 200 ms**". 17: the same sentence in the mix paragraph |
| 7 | GDD 6.8 and 23.x row "6.8 hit confirm" (line 2100: "**150 ms** after the click (the kill's thud stays at 190 ms)") | **Every confirm sounds 190 ms after the click** (`gun.ts` `CONFIRM_DELAY` 0.15 -> 0.19, now equal to `KILL_DELAY`): the report's tail is 3.6 dB lower there in the open and 5.2 dB lower in the gallery. The tail's step under a confirm moves with it (from 182 ms) | "tick, tink, parry, deflect, freed and the kill's thud sound **190 ms** after the click" |
| 8 | GDD 6.8 / 17 row "tick, tink, parry and kill hold 12 ms (hall) / 20 ms (bore)" (line 2221), and line 468 | **The four short confirms hold in every room**: 6 ms in the open, the Tally House and the gallery (`reverb.ts` `IR_CONFIRM_HOLD` `[0.006, 0.006, 0.006, 0.012, 0.02]`). Because the kill's thud is held everywhere, **the tail steps back under a kill in the open too** (5 dB, 120 ms), which round 5 said it did not | "... hold **6 ms in the open, the Tally House and the gallery**, 12 ms (hall), 20 ms (bore); the kill's thud steps the tail back in every room" |
| 9 | GDD 17 "deflect: flat clank with a skipping bell" (line 1766) | **The Tamper's plate rings at 960 Hz** (`creatures.ts` `tamper_clank`: two more bells an octave and a fifth over the plate's 320 Hz, a longer grain of noise; centroid 328 -> 536 Hz) and is pre-rendered at load like the other confirms (50 nodes a start otherwise). The gain of 3 on its start is unchanged: the reviewer's "+3 dB" would only have pushed the limiter | none needed (it is still a clank with a skipping bell); optional: "the Tamper's plate is the lower of the two, with a ring at 960 Hz" |

Measured, the reviewer's measure (dB over the bed in the confirm's loudest 60 ms):

| | hit | weak | kill | parry | Tamper's plate |
|---|---|---|---|---|---|
| Front Street, before | +2.5 | +2.0 | +8.5 | +3.3 | +1.8 |
| Front Street, after | **+9.5** | **+7.5** | **+9.8** | **+8.3** | **+8.6** |
| the Lip, before -> after | +2.7 -> +9.1 | +1.7 -> +7.2 | +8.1 -> +9.4 | +3.1 -> +8.0 | +1.6 -> +8.3 |
| the gallery, before -> after | +1.0 -> +9.2 | -0.1 -> +7.2 | +8.0 -> +9.2 | +1.4 -> +8.7 | 0.0 -> +7.8 |
| the Tally House, before -> after | +4.8 -> +15.2 | +3.7 -> +13.1 | +14.5 -> +15.9 | +4.7 -> +14.3 | +3.4 -> +13.1 |
| lift hall, before -> after | +5.4 -> +7.7 | +4.0 -> +6.5 | +6.7 -> +6.7 | +4.3 -> +6.7 | +4.1 -> +6.5 |
| the bore, before -> after | +5.9 -> +6.9 | +4.1 -> +5.3 | +6.5 -> +6.5 | +4.1 -> +4.9 | +2.2 -> +3.2 |

The report is untouched (peak -2.1 dB) and every confirm's loudest 60 ms is still 3.7 dB or more under the report's first
60 ms (tested, every room).

The hurt cue, rendered alone through the game's graph (the reviewer's `buffer.mjs` measure plus a laptop speaker = two
200 Hz high-passes, loudest 50 ms):

| | peak | RMS | centroid | on a laptop speaker |
|---|---|---|---|---|
| 18 HP, before | -11.0 dB | -30.1 dB | 70 Hz | -35.8 dB |
| 18 HP, after (plain / lunge) | -4.2 / -3.4 dB | -24.3 / -22.7 dB | 1375 / 2423 Hz | -19.7 / -16.6 dB |
| 38 HP, before | -8.0 dB | -26.8 dB | 70 Hz | -32.9 dB |
| 38 HP, after (plain / slam / canister) | -3.1 / -3.0 / -3.3 dB | -21.8 / -19.9 / -20.3 dB | 1365 / 658 / 6115 Hz | -17.7 / -16.9 / -15.7 dB |
| the report | -2.2 dB | -15.0 dB | 309 Hz | -7.4 dB |

In the street's mix on a laptop speaker it stood +0.2 dB (a lunge) to +3.1 dB (a slam) over the bed; now +14.4 to
+17.4 dB. The gun is still 7 dB over the loudest of them on a laptop speaker (tested at 6).

**Captions.** No key is asked for. Being hit is drawn by the HUD (arc, vignette, the bar); a caption for every blow would
bury the lines that matter. The Tamper's plate has no caption either, as before.

**Not verified by ear** (no one can listen on this machine): that the four top layers read as "stake / claws / iron /
heat" and not merely as four different sounds; that a tick 190 ms after the click still feels tied to the shot (the
kill's thud has always sat there); that a 6 ms hold keeps the tick a tick. One-line retreats if a listener dislikes any:
`HURT_MID` (gun.ts, 2.4: the level of the mid and top layers), `CONFIRM_DELAY` (0.19), `IR_CONFIRM_HOLD[0..2]` (0.006).

## Closer, pass i4 (2026-10-08): decisions

| Row | Decision |
|---|---|
| rows 6 to 9 | Mirrored: GDD 5 in place, 6.8 / 17 annotated in place, GDD 23.19; ARCHITECTURE "Pass i4 (closer)" (what audio reads of `player/damaged`) |
| Not verified by ear | In `docs/KNOWN_ISSUES.md` with the three one-line retreats |
