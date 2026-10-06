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
