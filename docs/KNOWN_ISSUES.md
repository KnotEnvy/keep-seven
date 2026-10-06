# Known issues after polish round 5

These are the issues the final reviewers listed after the last round of changes. Nothing
here blocks finishing the stage. One is rated major; the rest are polish. Performance was
last reviewed in round 4 (8.6) and is not repeated here; its open notes are in
`docs/INTEGRATION_REPORT.md`.

No person has yet checked real-GPU frame rate, the audio, or how the game plays in human
hands. Reports on those are worth more than anything below.

Labels such as R6 or R13 that remain in the text are the project's internal review rulings
(for example: the revolver must be a handsome, readable object; the High tier must look
visibly richer than Low).

## Visuals — 8.0 / 10

- **Major.** At idle the hand reads as two brown lumps and the revolver as a smooth toy-like casting — R13 asks for a hand that reads as a hand and R6 for a handsome object.
- High is still indistinguishable from Low in the gully, at the lip gate and in the yard — High now shows real sun shadows in the street and bloom on lamps, beacons, knots and the hall arch, but in the first zone and the yard a player flipping tiers sees no change.
- On High, bloom washes the antechamber station plate '4' into an unreadable glowing square — The lit plate reads '4' crisply on Low; on High the bloom halo erases the numeral and spreads a yellow-green glow over the wall.
- The rim lift cage interior is a flat maroon box — Turning round on arrival at the rim shows plain maroon walls with a wavy line texture, a flat tiled floor and thin coloured stripes: it reads as blockout next to the layered mesa outside.
- The end card sits on top of the revolver, and the fire is small beside it — the last image is strong, but the card covers the right third exactly where the pale gun is, leaving a ghosted gun behind the statistics, and the fire is roughly a 20 x 45 px cone next to the derrick.
- A few props read as primitive shapes up close — The hung coats on the gallery stair are faceted olive blobs at arm's length, and the orange locker/crate boxes in the lift hall and the dark bore stair are flat untextured volumes.

## Combat and gunfeel — 8.5 / 10

- The yard is the stage's sharpest spike and can run a player dry — The second fight of the stage kills proxies more often than the boss does, and several runs ended it with an empty pouch.
- The file is still free for a player who shoots straight — After the line round frees the first six, the second wave of six Biders each die to one body shot and almost never complete a wind-up against a 0.45 s-reaction player.
- The Tamper is the dearest fight and punishes a static player hard — The slam (38 HP, 3.5 m radius) lands on anyone who does not step away during its 1.15 s wind-up, and a hurt arrival from the file can die here.
- Hard plays almost like Normal — Hard is winnable, but a plain-skill proxy sees little difference in the Tamper and the Windlass, so the setting offers a veteran little extra.
- The idle hand is two smooth sausage fingers — The revolver itself now reads at a glance (barrel, fluted cylinder, recoil shield, hammer spur), but at idle the hand is a pair of unmodelled brown tubes with no knuckles or glove seams.
- The act card sits over the Tamper during its first charge after a checkpoint load — "V THE WEIGHT" is drawn at screen centre over the Tamper while it winds up its first charge, hiding the telegraph on a respawn.
- The tracer starts below the muzzle on the first frame of a shot — The flash is now on the muzzle, but the tracer streak on the first drawn frame begins lower-left of the flash rather than from the barrel.

## Playthrough — 8.5 / 10

- The file is still free for a player who looks both ways — The round-5 change (two Biders from the stair behind, four bursting from the far door) makes the file cost a careless player, but a plain-skill player who turns on the nearest threat and back-pedals still takes no damage.
- The file's warning lines arrive after the ambush they describe — The narrator's cues for the fight's two surprises trail the events, and "Four more, from the far door" is on screen about a second before the fight is over.
- The Tamper swings between harmless and nearly lethal — The slam decides the whole fight: the same duel costs nothing in some runs and almost a full health bar in others, and a back-pedalling player takes more than one who stands still.
- Windlass phase 2 kills a player who stands still in about 11 seconds, every respawn — A player who stands and shoots in phase 2 dies, respawns and dies again on the same schedule.
- Walking away from the stone ends the stage with no warning — The final choice is safe while she stands at the stone or waits on the ledge, but stepping back from it silently resolves to "she left it" about 40 to 60 s later.
- Nothing in play points at either secret — Both secrets work and pay twelve rounds each, but no line, glint or sound draws the eye to the loft bell or the cold bay knot.
- The end card's TIME leaves out failed attempts and deaths are never shown — TIME counts only the surviving timeline, so a run with deaths reads much shorter than it was played, and the card has no deaths row to explain the gap.

## Story and UX — 8.5 / 10

- The Windlass parley text runs about 9 s behind the boss — When the player answers the third question and walks straight in, the narrator's cradle line and the station's sign-off still hold the subtitle queue as the parley starts.
- Nothing tells the player that walking away from the stone is a choice — On the rim the objective reads only 'Go on.' and the only prompts are 'E Read' and 'E Take'.
- A brisk player loses several lines that carry story or teaching — Lines queue behind room descriptions and go stale.
- Movement card is faint over a bright sky and sits on the view — The movement numeral and title ('VII / SEVEN') are thin outlined type centred just above the crosshair.
- End-card row 'Six dry mouths, one cylinder' uses a word the player never reads — Everywhere else in the fight the boss's ports are 'chambers' (the objective is 'The head is dry.
- 'Hold SHIFT to run' hint appears mid-fight under the crosshair — The run hint first shows during the Front Street fight and stays about 17 s, centred just below the crosshair where the Biders are.
- At idle the muzzle covers part of the asking dial — Facing the bore door square on, the barrel overlaps the ports and numerals at 3 and 4 on the dial the player is asked to read and shoot.

## Robustness — 8.8 / 10

- Menus and end card break in a very small window (480x270) — At 480x270 the end card overflows the window: its title and first row are above the top edge, values wrap one word per line, and 'Walk it again' / 'Title' sit below the bottom edge.
- Every tier switch relinks about 39 shader programs — Changing the graphics tier in Options relinks roughly 39 programs each time, which is a visible hitch behind the pause menu on a slow machine.
- Unpaced High-tier test runs outgrow the browser memory limit — A whole-stage High-tier tour driven by the step hook with drawing on dies with 'Target crashed' (the memory watchdog kills the renderer).
- Test bot's title start does not know the new 'Begin?' confirmation — tests/e2e/lib/bot.mjs startFromTitle clicks 'play' and expects play to begin.
- Last-lift checkpoint and post-ending 'Go on' replay finished beats — The checkpoint held during the proving-lift ride (cp_boss_proven) restores the Windlass alive in its dry phase, so a page reload or 'Back to the last count' on that ride makes the player fire the last six rounds again.
