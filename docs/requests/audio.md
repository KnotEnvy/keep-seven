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
