# KEEP SEVEN — Game Design Document

Stage one: **First Tally: Plenty**. One continuous stage: about ten minutes for a player who knows it (measured:
the plain-skill proxy 9.5 to 10 minutes, the scripted bot 8.0), an estimated 12 to 16 minutes for a first-time
player who reads the notes and solves the puzzles unaided (section 4.2; polish round 5: it said "about 21").

Status: **binding**. Builders implement what this document says. Where it gives a number,
that number is the starting value to build; tuning happens in polish rounds and is recorded
here. Revision 2 (after the pre-production critic round) reconciles this document with
the blockout: section 23 records what changed and which level-design requests are accepted.
Where a position or an opening size is given here it is copied from `design/layout.json`;
if they ever differ, the layout is the truth and this file has a bug. All player-facing text lives in `design/story.json` and is referenced here by key
(`nar_*`, `stn_*`, `rv_*`, `hint_*`, `cap_*`, `card_*` are in `lines`; `rd_*` in `readables`;
`obj_*` in `objectives`; `ui_*` in `ui`). Do not put literal player-facing strings in code.

Lineage: built on Pitch B (gunplay first), with the play-personalised ending, the mercy
outcome, the Daylight puzzle and the tonal family from Pitch A, and the legible machine,
the follow-through kill, the hook object and the T4 fail-safe from Pitch C. Section 22 lists
how every judge red flag was resolved.

---

## 1. Identity

**Title.** KEEP SEVEN. (Never "The Kept Round": that collides with a published novel.)

**Logline.** The last sworn Reeve carries six rounds for the work and a seventh she has
vowed never to fire. She tracks a patient well-spoiler through a hooded, shuttered town and
down into the machine under its well, where every fight asks her to count to six and the
last one asks for seven.

**The one idea.** Everything is the arithmetic of a six-shot cylinder and one more. The HUD
shows six chambers in a ring and a seventh, sealed, apart. The maker's mark on every machine
is the same picture. The boss is the same picture, five metres across. The stage ends when
the player breaks the seal.

**Tone.** Dry, practical, unhurried, courteous. The loudest thing in the world is the gun,
and the quiet after it feels like judgment. The horror is polite: people who hooded
themselves and sat down to wait, machines still doing a job for nobody. Melancholy, never
grimdark. No gore, no jokes, no faces. The narrator counts things (rounds, days, jugs,
lamps) and states the worst of them most plainly.

**Five gun rules.**

1. One cylinder is always enough for one thing. Shots-to-kill never changes with difficulty.
2. A shot is a verb. Five verbs, taught in this order: **kill** (a body), **free** (burst a
   knot), **break** (an aim), **open** (a mechanism), **answer** (a machine's question).
   Then one more: **hold fire**.
3. The world rhymes with the cylinder: six ribs, six chambers, six lamps, and one apart.
4. Reload is where the fear lives. Every arena has an obvious place to reload and one
   stretch with none.
5. No bullet produces nothing. Every shot kills, frees, staggers, interrupts, rings,
   pours, sparks or skips. Silence after a shot is a bug.

---

## 2. Lexicon (original to this project; thirteen terms, each taught by a thing seen or shot)

| Term | Meaning | Taught by |
|---|---|---|
| **Reeve** | A sworn gun-officer of the Assize. The player. Tamsin Ware, eleven years sworn. | Narration from the first minute. |
| **the Assize** | A court that rode circuit and judged water rights. Gone. | Narration; the stamp under the loading gate. |
| **the Rule** | The hairline of violet light on the far horizon that every well was once sunk true to. It leans about one degree. | Visible from every exterior. |
| **the kept round** | The banded cartridge given to a Reeve at swearing. Carried always, fired never. "Keeping seven" is being in good standing. | The sealed seventh on the HUD. |
| **lead** | Ordinary rounds. | Use. |
| **line round** | A Pellam *line charge*: one dead-straight line through everything it meets. The one special ammunition. | The proving bay, zone 4. |
| **proving charge** | A Pellam consumable, banded, one issued per bore, fired down the bore to prove it true. The kept round is one. Nobody in the Assize ever knew. | Cast plate in zone 4; the empty cradle in zone 6. |
| **the lean** | The wrongness that gets into machines and people where the Rule is off. It shows violet. | Colour law, section 16. |
| **knot** | A growth of the lean. On a latch, a machine or the crown of a hood. Where a round goes. | Yard door latch, then everywhere. |
| **Bider** | A townsperson of Plenty with the lean in them. They hooded themselves and sat down to bide until it cleared. | The street, then the Tally House table. |
| **Transit** | A three-legged Pellam sighting machine. | Yard vignette. |
| **Tamper** | A ceramic-shelled Pellam pile-driver. | Lift Hall vignette. |
| **the Dowser** | The pursued. A long-coated man with a forked rod (pale-coated in the notes; the one time he is seen he is a dark shape on the skyline). Where he stops, wells go wrong, or he finds them going. | Notes, three stops (a coffee pot, a chair and a cup, a bed of embers), one far sighting. |

Also: **Pellam Deepworks** (maker's plates only; the narrator says "the old works"), the
**Windlass** (the boss, Lift Head of Station 4), **Plenty** (the town).

Courtesy: call `Water to you.`, reply `And shade.` **Hard cap: the call appears twice (two
Dowser notes) and the reply once (the last line of the stage).** No other call-and-response
formula exists, and it is never presented as a stock greeting: not on the title screen, in
menus, loading text, store text or marketing. Oath: `By the Rule and the round`, used
exactly once (`rv_ask`).

**The trace (how the pursuit is read).** The Dowser's three stops are deliberately not three
fires. Stop one (the overhang): his coffee pot, the coffee gone to tar, two days. Stop two
(the Tally House): his folding chair pulled out to face the seated and his cup on their
hearthstone, the dregs dried to a ring, one day. Stop three (the antechamber): a bed of
embers still orange and a warm kettle, inside the hour. Only the third is a fire, so that the
fire on the plain at the end is the second fire of the stage and not the fourth. He does not
set the town on her: he sat with them, counted, and went on (`nar_tally_chair_2`,
`rd_note_hearth`). The Biders rise because the lean is in them, not because he asked.

Banned in all player-facing text: every item in `docs/research/art-tone.md` 1.5; the words
"walker", "gunslinger", "palaver", "tower", "beam"; any sentence on the fled/followed
skeleton; the numbers 19 and 99 on authored signage; "stand true". The Dowser is never
robed, never dark, never magical: a clerkly man with a rod, a kettle and a pencil.

### The maker's mark (load-bearing)

The Pellam mark is **a ring of six small discs, a vertical stroke dropping from the ring's
centre, and a seventh solid disc at the end of the stroke.** It is cast on every plate, and
painted badly by the town on doors and troughs as their sign for "water here". The same
mark is stamped under the loading gate of the Reeve's gun as the Assize's crest. It is the
HUD's cylinder widget. It is the Windlass over its bore. The narrator names this in zone 5
(`nar_mark_1..3`). The art bible must use this mark, not the broken-ring candidate in the
research brief.

---

## 3. Backstory (120 words; menu "The story so far", key `rd_backstory`)

The Assize was a court that rode. Its officers, the Reeves, carried a blued six-gun and
seven rounds: six for the work, and one, banded, given at swearing and never fired. The
Assize judged water by the Rule, the bright upright on the horizon that every well was sunk
true to. The court is gone. The Rule leans. Tamsin Ware is the last Reeve anyone has heard
of. For two years she has been behind the Dowser, who goes from well to well, and each one
is wrong when she reaches it. He is never hurried. He always leaves her one more problem
than her gun holds. She does not know whether he spoils the wells or only reaches them
first. She means to ask.

**What this stage costs her.** Her office. The only way to put Plenty's water right is to
fire a proving charge down its bore; the Dowser has emptied the cradle (`nar_cradle_2`);
she is carrying the last one in Plenty (`nar_one_left`). She arrives keeping seven and leaves with six, or with seven of which one is his.

**What the Dowser wants.** Not to break wells. To make Reeves spend their oaths mending
them. Six have. The Rule leans a little further each time. The player learns the first half
at the cradle and sees the second half from the rim.

---

## 4. Narrative

### 4.1 Movements (title cards; numeral and title, shown 3.5 s on entry)

| # | Card key | Zone |
|---|---|---|
| I | `card_i` The Lip | `the_lip` |
| II | `card_ii` Plenty | `plenty_street` |
| III | `card_iii` The Tally | `tally_house` |
| IV | `card_iv` The Line | `the_gallery` |
| V | `card_v` The Weight | `lift_hall` |
| VI | `card_vi` The Asking | `the_bore` |
| VII | `card_vii` Seven | `far_rim` |

### 4.2 Beat sheet (measured, polish round 5)

The times are **measured on the game as built**: the critics' plain-skill proxy on Normal (0.4 to 0.45 s to react,
an aim error, body shots, back-pedalling inside 6 m; it knows every solution and reads nothing), whole runs from the
title, `scratch/r5-playthrough/plainFull2.json` and `plainFull3.json`, with the fights re-measured after the round's
tuning (`scratch/r5-fixer/proxy/`, `docs/INTEGRATION_REPORT.md` Part I). That run is **9.5 to 10 minutes**; the
scripted bot's is 8.0. **A first-time person** stops at three notes and a ledger, looks at the vistas, works the four
puzzles out and dies now and then: **an estimated 12 to 16 minutes, 20 with every hint tier and several deaths**. No
person has played this tree; the estimate is the proxy's run plus the reading and the puzzles. Earlier revisions of this
sheet planned 21 minutes with fights of 55 to 110 s: the fights as built are 21 to 37 s for the proxy (the yard about
60 s in a whole run), the Windlass's phases 27 to 44 s and 57 to 73 s. Lead ruling R1: the document follows the game.

| Proxy time | Zone | Beat | Int. | New thing | Lines |
|---|---|---|---|---|---|
| 0:00–0:36 | the_lip | Black overhang. Stop one (his coffee pot, two days cold; a note under a spent case). Step into glare; the valley, the pylon line, the Rule leaning. Title. The gully. **Seven Jugs** gate: first shots, first forced reload. (A person: 1.5 to 2.5 min with the note.) | 1 to 2 | move, look; the sealed seventh on the HUD; fire, reload, "one more than she carries" | `nar_open_1` `nar_open_2` `rd_note_lip` `nar_seven` `nar_rule` `card_title` `card_i` `nar_jugs_sand` `nar_jugs_open` |
| 0:36–0:39 | plenty_street | Through the gate. At 43 m a hooded figure kneels at a dry trough, scooping sand. It sets the cup on the rim, then comes (3 s on show). | 2 | first Bider | `card_ii` `nar_kneeler` `nar_plenty` (the kneeler line first since polish round 5) |
| 0:39–1:03 | | **Fight 1, The Street** (21 to 27 s). **Eight** Biders: the kneeler; four out of the two alley mouths nearest the gate, beside and behind her; a file of two from the saddlery two seconds later; and one more through the yard gate. Plain proxy 0 to 18 HP, careless 18 to 88. | 4 | kill, and free (crown knot) | `nar_first_fell` or `nar_first_seat` (once each) `nar_street_after` ("Eight of them.") |
| 1:03–1:18 | | The struck-through door marks. Cache. The yard door: one knot on its latch. | 2 | knots are for shooting | `nar_marks` `nar_first_knot` |
| 1:18–2:19 | | **Fight 2, The Yard** (57 to 75 s in a whole run; 27 to 38 s from its checkpoint at full health). A Transit steps out, stakes the yard bell, then turns (`nar_transit` on the turn). Duel; then two Transits and four Biders. The hardest fight before the Tamper for a player who arrives hurt. | 6 | break an aim; lens kill | `stn_yard_wake` `nar_transit` |
| 2:19–2:45 | | On the far rim, 250 m off, clear of the sun: a man with a forked rod, dark against the sky. Then not. | 1 | the pursued, seen | `nar_dowser_seen` `nar_dowser_shot` `nar_dowser_gone` |
| 2:45–3:07 | tally_house | Dark hall. Eleven hooded, seated, hands flat. **Daylight** puzzle: each shot throws a blade of sun on a piece of the story. Ledger. Stop two (his chair, his cup, one day). (A person: 2 to 3 min.) | 2 | open; the found account | `card_iii` `nar_tally_1..3` `nar_tally_wall` `nar_tally_chair` `nar_tally_chair_2` `nar_tally_hearth` `rd_note_hearth` `nar_ask` `rd_ledger` `stn_tally_wake_1..2` |
| 3:07–3:13 | | The hatch knot. The hatch starts ajar; aqua comes up through the floor. Two of the seated stand. **Fight 3**, lit by the gun (6 s). The hatch opens on the second. | 5 | muzzle flash as the light | `nar_two_rise` `nar_nine` |
| 3:13–3:25 | the_gallery | The stair of pegs. Coats, hats, boots; the low pegs bare. One Bider in a niche, apart from the rest, turns its hood to watch. It does nothing else. | 3 | the solitary scare | `card_iv` `nar_pegs_1..2` `nar_watcher_1..2` |
| 3:25–3:33 | | Proving bay. The plate of the banded charge. Line locker, three-plate range. **Proving Line** puzzle. (A person: 1 to 2 min.) | 2 | line round; make a line | `nar_plate_1..3` `nar_line_first` |
| 3:33–4:07 | | **Fight 4, The File** (28 to 37 s). Six Biders in a queue at the far door. They turn; one line round sits them down in order. Then the answer (polish round 5): as she nears the far door, two who did not queue come down the peg stair **behind** her and run the length of the gallery; four seconds later a bang on the far door, and a second after that it bursts on four more. Both ends of a 3 m walkway with no cover reach her within about two seconds. Plain proxy 0 HP, careless 0 to 72. | 6 | the line as mercy, then lead with something at her back | `nar_file` `nar_file_lined` `nar_file_behind` `nar_file_more` |
| 4:07–4:21 | lift_hall | Gantry. A Tamper has been pounding a sealed bulkhead for days. | 3 | Brute, shown on something else | `card_v` `nar_tamper_1` |
| 4:21–4:50 | | **Fight 5, The Matador** (25 to 31 s from trigger to death). Tamper alone among the ribs, then with Biders. A line round is a third of the job. Plain proxy 38 to 56 HP, careless 0 to 91; the hardest single enemy of the stage (section 6.7). | 7 | plate, vents, the charge into a rib; the line opens both vents | `hint_tamper_vent` (after four rounds off the plate) `nar_tamper_dead` |
| 4:50–5:35 | | Cache. The wall diagram: six in a ring, one apart. The lift, 25 quiet seconds, the station reading its inventory. | 2 | the mark is a diagram | `nar_mark_1..3` `stn_lift_1..3` |
| 5:35–6:07 | the_bore | A grilled catwalk past the Windlass, hanging over the violet bore. Stair down. Stop three: embers, still orange. The empty cradle. His note. **The Asking** puzzle: three questions; the third is answered by holding fire while the listening ring counts. (A person: 2 to 3 min.) | 2 to 3 | the arena before it is one; answer; hold fire | `card_vi` `nar_windlass_seen` `nar_embers_1..2` `nar_cradle` `nar_cradle_2` `rd_note_cradle` `stn_ask_*` |
| 6:07–6:35 | | Parley (28 s). Listen, or shoot. | 3 | courtesy as a mechanic | `stn_parley_*` `nar_parley` `rv_ask` |
| 6:35–8:11 | | **Boss: the Windlass.** Phase 1: 27 to 44 s. Phase 2: 57 to 73 s. Phase 3a lasts as long as she takes to find a mark (4 s for the proxy). | 9, 9, 10 | the cylinder made visible; lead failing | `stn_boss_*` `nar_one_left` |
| 8:11–8:40 | | The seventh. The head swings clear. One shot down the bore. Four seconds of true silence. Six lead rounds into a machine that is still hauling on an empty rope (17 to 45 s). | 10 then 2 | the kept round | `nar_seal` `nar_office` `nar_kept` `stn_proven` `stn_dry` `nar_hauling` `stn_service` |
| 8:40–9:45 | far_rim | The proving lift. Blue hour. A plumb thread of light over Plenty; the Rule leaning further. Lamps in the town, counted. A flat stone, glinting, off to the left of the view: six spent cases and one unfired round with a violet band. A fire on the plain, the second fire of the stage. | 1 | the ending and the hook | `card_vii` `nar_lift_up` `nar_rim_1..4` `nar_lamps` `nar_lamps_count` `nar_stone_1..4` `rd_note_stone` `nar_take_1`, then `nar_take_2` (taken) or `nar_leave` (left), `nar_fire` `nar_last` `card_end` |

```
 10 |                                #
  9 |                          #######
  8 |                          #######
  7 |                 ##       #######
  6 |     ####     ## ##       #######
  5 |     ####   # ## ##       #######
  4 |   # ####   # ## ##       #######
  3 |   # ####   #######   ###########
  2 |#########  ########################
  1 |#######################################
    +----------------------------------------
     0:00    2:00    4:00    6:00    8:00    9:45
     Lip St Yard  Tally File Mat  Lift Ask Windlass  Rim
```

One column is 15 s of the proxy's run. What the curve guarantees for a player who has learned the line round (the
intended lesson): between the yard and the boss there are still three real fights. The Tally rise is two Biders in the
dark (5). The File is one line round **and then six more from both ends of a corridor with no cover** (6, about 30 s).
The Matador cannot be ended by one trigger pull: a line round through the chest is a third of the Tamper's health and
a 1.8 s opening, and the Bider waves run on a clock (7, 25 to 31 s for the proxy, up to a minute for a player who
mostly hits plate). Section 6.7 and section 10 carry the numbers. **The measured curve peaks twice**: the Tamper is
the hardest thing before the boss (a 0.5 s-reaction proxy died twice to it in the round-5 critique), and the Windlass
that follows is fair rather than cruel (0 deaths in the round's thirteen plain and careless-but-moving legs, seven of the critic's and six after the
tuning; 25 to 123 HP lost over phases 1 and 2). That is the shipped curve.

Hard budget: no quiet stretch over 3.5 minutes; no fight over 2 minutes; boss phases about 90 s at most (lead ruling
R2; measured 27 to 77 s); first shot by 1:20; first kill by 3:00; a slow player with every hint tier firing still
finishes inside 25 minutes (section 13 fail-safes guarantee the bound). The beat timer is measured with the
deterministic step hook (section 21).

### 4.3 Emotional arc

1. **Competence** (Lip): she is good at this and counts everything.
2. **Unease** (Street): the things she shoots wear clothes and kneel at troughs. One of
   them, shot through the knot on its hood, sits down and breathes.
3. **Recognition** (Tally House, stair): they were a town four days ago; they hooded
   themselves as a courtesy; the children got out. The player does not need the ledger to
   know it: the tally wall, the table and the pegs are on the critical path.
4. **A tool that is true** (Gallery): the line round frees everything on its line. And a
   cast plate shows that the thing she swore on is a utility company's consumable.
5. **Weight** (Lift Hall): something that was never anyone. A relief to shoot.
6. **The trap closes** (Bore): the cradle is empty; he emptied it (`nar_cradle_2`); she is
   carrying the only one (`nar_one_left`). Lead fails in front of her. The station states
   procedure (a proving charge is required at the mark) and the marks are lit from the moment
   the guard breaks, so a player who has understood can act at once. Nobody tells her to
   break the band until the hint ladder does: the first press of `F` is the player's own.
7. **Spending** (the seventh): quiet, then the cleanest sound in the game.
8. **Bittersweet** (Rim): lamps in Plenty that the player can count and partly caused; the
   Rule leaning further for it; a stone with six spent oaths and one false one offered.

### 4.4 Ending and hook

- No victory sting. No narrator verdict on the player's shooting. The only count shown is
  lamps lit.
- **Lamps.** `lamps = 9 + freed`, where 9 are the seated at the Tally table who never rose
  and `freed` is every Bider seated by a crown-knot shot, a line round or the kept round.
  The town card seen from the rim lights exactly that many flame-coloured windows (48
  window quads authored; clamp at 48).
- **The stone.** Six spent banded cases, mouth up, and a seventh round, unfired, whose band
  is faintly violet. The player may take it (interact) or walk on. Taking it fills the
  HUD's seventh slot with a violet-banded round. Either way a fire kindles on the plain
  along the pylon line. Either way the last line is the reply to a courtesy first offered
  in minute one.
- **Questions the player leaves holding.** Why does mending a well tip the Rule? Whose is
  the sixth case, older than the Assize? What is a Reeve who keeps a round that is not
  hers? And the fire is close enough to reach by morning, and it is not moving.

---

## 5. Player

All values from the feel spec (`docs/research/game-feel.md` section 9) unless stated.

| Item | Value |
|---|---|
| Capsule / eye | radius 0.35 m, height 1.8 m, eye 1.65 m |
| Run / sprint | 5.0 / 6.75 m/s (sprint forward only; firing cancels sprint; reload allowed while sprinting) |
| Backward / strafe | x0.9 / x1.0 |
| Ground accelerate / friction / stop speed | 12 / 8 / 2.0 m/s (Quake-style model on a 60 Hz fixed tick) |
| Air acceleration | 12 m/s², no air friction, horizontal speed capped at take-off speed |
| Gravity / jump velocity / apex | 24 m/s² / 6.93 m/s / 1.0 m; air time 0.58 s |
| Coyote / jump buffer | 0.10 s / 0.10 s |
| Step-up / max slope | 0.35 m / 45° |
| Crouch | none |
| Fall damage | none. Lethal drops are kill volumes (only the bore, which is fenced by a 1.2 m kerb) |
| Jump required | never beyond 0.6 m up or 2.0 m across; the critical path needs no jump at all |
| Jump reach | the controller refuses a landing higher than the jump's apex above the take-off ground: a 0.9 m box can be mounted, a 1.2 m box and the 1.3 m cover solids cannot (the collision engine's own ledge lift would otherwise add one capsule radius, 0.35 m, to the apex: ARCHITECTURE 6) |
| FOV | 62° vertical default, range 50–80; viewmodel FOV fixed 40° (polish round 3, ruling R6; it was 52°) |
| Look | 0.07°/count, slider x0.2–x4, per rendered frame, unsmoothed, raw input where available |
| Camera motion | bob 0.028/0.014 m, footfall every 1.9 m (run) / 2.3 m (sprint), strafe roll 1.0°, sprint FOV +4° in 0.2 s, landing dip 0.012 m per m/s (max 0.12 m, 0.22 s) |
| Health | 100 in three segments (34/33/33). The current segment regenerates after 4 s without damage at 12 HP/s. A canteen restores one full segment |
| Max single hit | 38 (canister, slam). Nothing instant-kills |
| Last-hit grace | a fatal hit from above 25 HP leaves 1 HP and 0.75 s of immunity |
| Hidden assists | an enemy's first shot at a fresh target always misses; enemy accuracy x0.8 against a player moving faster than 3 m/s; the last 20 HP absorb x0.75 |
| Damage feedback | directional arc on the HUD for 0.6 s (pale, not red); trauma +0.3 to +0.6 by damage; low thud; health segment flashes outline. Never a full-screen flash |
| Interaction | `E`, range 2.2 m, cone 25° from the crosshair; prompt appears at 3.0 m. Readables pause the simulation while open |
| Death | 0.6 s fade to dark with `ui_death` coming up with the ink (whole at 0.6 s, 9 vh above centre); control is returned 1.8 s (108 ticks) after the fatal tick; the line stays, outlined, 1.4 s after the respawn and fades in 0.4 s: whole for 2.6 s (polish round 4) |
| Respawn | at the last checkpoint with max(saved, 60) HP, max(saved, 18) reserve rounds, a full cylinder, and the line rounds held at the checkpoint. The current encounter resets; freed and felled Biders of that encounter are removed from the counts; vignettes and title cards never replay |

Controls (all rebindable): move `WASD`/arrows, look mouse, fire `LMB`, reload `R`, load
line round `Q`, break the seal `F`, interact `E`, sprint `Shift` (hold or toggle), jump
`Space`, pause `Esc`/`P`.

---

## 6. Weapons

One weapon: the **Assize six** (`assize_six`). One special ammunition type: the **line
round** (`line_round`). One scripted story round: the **kept round** (`kept_round`), which
is not a combat option and can be fired exactly once, at one place.

**Fan-the-hammer is OUT.** There is no alt-fire. `RMB` is unbound.

### 6.1 The object

A blued six-gun gone grey at the muzzle, dark walnut grip, no engraving, no ornament. Under
the loading gate, 9 mm across, the six-and-one mark. The darkest, sharpest, most neutral
thing on screen. Viewmodel budget: 6 000 triangles including hands, one draw call for the
gun and one for the hands; gloved hands, bare wrists, a coat cuff.

### 6.2 Stat table

| Property | Lead (`lead_round`) | Line round (`line_round`) | Kept round (`kept_round`) |
|---|---|---|---|
| Ballistics | hitscan, 200 m, no falloff | hitscan, 60 m, pierces | hitscan, straight down the bore |
| Damage | 100 body; x2 on a weak point (Transit lens, Tamper vent); x0.25 on plate | 300 to every body on the line, ignoring plate. **No knot multiplier.** Through a Tamper's chest or back knot it also forces `line_stagger` (1.8 s, both vents open; 3.0 before polish round 4): section 6.7 | n/a (scripted) |
| Effect on Biders | body: felled. Crown knot: freed (sits) | **every Bider on the line is freed**, wherever it is hit | every Bider alive is freed |
| Pierces | nothing | every enemy, and every surface tagged `pierce` in `design/layout.json` (ceramic plate, the Windlass guard, shutters, baffles, crates). Stops at untagged world geometry | n/a |
| Cadence | 0.48 s; one shot per click (option: hold to repeat at cadence) | same | n/a |
| Fire buffer | a click in the last 0.15 s of the cycle fires on the first legal tick | same | same |
| Spread | 0° rested, standing or moving. Bloom +1.5° per shot, fully decayed in 0.35 s, so normal cadence is always pinpoint | 0° | 0° |
| Aim assist | none, except: Bider crown-knot sphere r 0.22 m (Easy 0.26, Hard 0.20); Transit lens r 0.17 m; a stake in flight r 0.30 m | puzzle `proving_line` only (section 13) | the trigger falls only when the aim ray enters the **bore target volume** (section 6.6 rule 4); the crosshair shows when it does |
| Camera kick | +2.5° pitch, ±0.4° yaw, peak at 55 ms, back exactly on the aim point by 320 ms | same | +3.5° pitch, peak 80 ms, recovered by 600 ms |
| Viewmodel kick | 0.08 m back, 20° rise, 0.3 s | same | 0.11 m, 26°, 0.6 s |
| FOV punch | +1.2° for 80 ms | same | none |
| Fire trauma | +0.25 (decay 1.8/s, max 1.2° pitch/yaw, 1.5° roll, rotational only) | +0.25 | +0.15 |
| Capacity | cylinder 6; reserve cap 36; start 6 + 24 | carry cap 2, held outside the reserve; chambered by `Q` | 1, on the HUD from frame one |
| Supply | pickups of 6 and 12, refill boxes, drops (section 6.5) | fixed lockers only, never dropped (section 6.4) | none |

### 6.3 Reload (per round, interruptible)

| Phase | Time | Notes |
|---|---|---|
| Open gate | 0.35 s | clip `reload_open` |
| Seat one round | 0.30 s each | clip `reload_round`; a distinct seat-click per round; HUD dot fills |
| Close | 0.30 s | clip `reload_close` |
| Full reload from empty | **2.45 s** from `R`; **2.57 s** from a dry click | 0.35 + 6 x 0.30 + 0.30 (+ 0.117, the dry beat) |
| Interrupt | fire pressed: finish the round in hand, fast-close 0.20 s (`reload_fast_close`), fire. Worst case 0.50 s | |
| Empty cylinder | a trigger pull gives one dry click with **a beat of its own**: the hammer stays down 7 ticks (0.117 s, `DRY_BEAT`, clip `dry_fire`, weapon phase still `ready`), then the reload opens by itself. `R` inside the beat opens it at once; `Q` and the kept key act at once and cancel it; a second pull inside the beat is not a second click and is not lost (it interrupts the opening reload: one round is seated, then the shot: 7 ticks more than the worst case above). Polish round 4 | |
| Manual reload | `R` at any time with fewer than 6 chambered and reserve above 0 | |
| While sprinting | allowed | the core retreat move |

### 6.4 Line round rules

1. `Q` with at least one line round held: thumb the gate, seat a line round **under the
   hammer** (0.55 s, clip `load_line`); the displaced lead round, if any, returns to the
   reserve. That chamber's HUD dot turns aqua. The next shot is the line round.
2. `Q` again before firing returns it to the carry (0.35 s).
3. On fire: one ray, 60 m, collected through a **raycast-all** path with no per-frame
   allocation (a preallocated hit list of 16). Hits are sorted near to far. Every body
   reacts in sequence, 40 ms apart. Every Bider on the line is freed. The ray stops at the
   first hit whose surface is not an enemy and not tagged `pierce`.
4. Visual: a dead-straight aqua line from muzzle to end point, constant 3 px wide with a
   soft halo, holds 1.2 s and fades over 0.3 s. Audio: under the report, one sine tone,
   slightly too pure (section 17).
5. Lockers (`ia_line_locker_*`): the only supply.

| Locker | Zone | Gives | Rule |
|---|---|---|---|
| `ia_line_locker_bay` | the_gallery, proving bay | 1 | Dispenses whenever the player holds 0 line rounds and `proving_line` is unsolved. On solve it chimes and offers exactly 1 more (once). |
| `ia_line_locker_hall` | lift_hall, at the ramp foot | 1 | Once. It is half a Tamper, not a whole one (section 6.7). |
| `ia_line_locker_secret` | lift_hall, cold bay | 1 | Once (secret). |
| `ia_line_locker_bore` | the_bore chamber, on the wall at bearing 168°, beside the proving-lift gate (which is opposite the door) | 1 | Once per attempt at phase 2; opens with `stn_boss_guard_set`. |

Maximum fired in a full run: 6. Nothing on the critical path after `proving_line` requires
one. **A line round fired down the bore does not prove it** (`stn_bore_line_short`): the
line charge and the proving charge are different stock, and the station says so.

### 6.5 Lead economy

- Start 6 + 24. Reserve cap 36.
- `pk_rounds_6` (a paper packet) and `pk_rounds_12` (a cartridge tin). The tins sit at the
  Dowser's three stops and are his (`nar_tin`): he supplies her lead and keeps her proving
  charge spent.
- `ia_ammo_box` (refill box, a Pellam wall dispenser the town has hung a tin cup on):
  tops the reserve to 18 whenever it is below 18; infinite; one within 10 m of every puzzle
  and at both cartridge points in the boss room (there: gives 18, 10 s cooldown each;
  polish round 4: at 12 a plain player ended phase 1 with an empty reserve and opened phase 2
  with a run to the box; polish round 3, ruling R2: at 6 every 20 s the reserve read 0 for
  most of both phases and the fight was spent crossing the room). One more inside the yard
  door, on the yard face of the east wall (`ia_ammo_box_yard`, polish round 4: a poor shot
  ran wholly dry in the yard with no source of rounds on the fight's side).
- **Ammo floor (mandatory):** if cylinder + reserve is 6 or less, the next Bider freed or
  felled, the next Transit put down, or the next breakable broken, drops `pk_rounds_6`.
  **Against the Tamper** (nobody to free): a round that meets it with cylinder + reserve at
  6 or less shakes one `pk_rounds_6` out of it, again no sooner than 10 s later (polish
  round 4, ruling R1: it was once per attempt); and with cylinder and reserve both empty
  one packet is laid a step out from the hall's line locker, with the locker's chime, on
  the same 10 s wait. No attempt at the Tamper can end with nothing to fire.
- Drops: Biders drop `pk_rounds_6` at 25 % (Easy 40 %, Hard 15 %). Boss adds always drop:
  `pk_canteen` if health is under 34, otherwise `pk_rounds_6`.
- Fixed placements: section 14.

### 6.6 Kept round rules (load-bearing; see also section 12.4)

1. The HUD shows it, sealed, from the first frame. It cannot be selected.
2. **The six proving marks are lit aqua, and `F` is live on them, from the first tick of
   phase 3a** (the tick `stn_boss_p2_break` fires) until the kept round is fired. There is
   no delay and no hidden condition: a player who goes to a mark the moment the guard breaks
   is right, and the game says so.
   - `F` anywhere **before phase 3a**: the HUD seventh shivers for 0.3 s and a soft dead
     click plays. The first time only, `nar_not_for_firing`.
   - `F` **during phase 3a but off a mark**: the same shiver and click, the nearest mark's
     halo flares once (a pointer), and no narration. **`nar_not_for_firing` is suppressed
     for the whole of phase 3a**, including a first-ever press: the game never tells the
     player their correct idea is wrong.
   - After the kept round is spent, `F` does nothing but the shiver.
3. `F` on a proving mark in phase 3a (on the press `nar_seal` goes on screen at once, over whatever line is there; `nar_office` is said only after the proof, behind `stn_proven`, `nar_kept` and `stn_dry`: polish round 5): clip `load_kept` (1.8 s): she breaks the band with
   her thumb and seats it. The HUD seventh empties; the chamber under the hammer shows a
   white dot with an aqua ring. The crosshair becomes the plumb glyph (a dot under a short
   vertical stroke). Narration on the **first** successful press only, in this order, queued
   one after the other and never cut by the shot: `nar_seal` (starts with the clip; it
   describes what her thumb is doing), and nothing else before the shot (polish round 5: hint T1 is `hint_kept_1`, and `nar_office` is kept for
   after the proof). On the shot's tick `stn_proven` is on screen over whatever is there, `nar_kept` is the next line
   (about 3.3 s after the shot), then `stn_dry` and `nar_office`.
4. While it is chambered, the trigger falls only if the aim ray enters the **bore target
   volume**: a vertical cylinder of radius 3.0 m on the bore axis, from kerb-top height
   (floor + 1.2 m) down to 6 m below the floor. **The kerb and the Windlass are ignored by
   this test.** From a mark (r 4.9 m, eye 1.65 m) that accepts any aim from about 3° to 75°
   below the horizon across the width of the bore: "point it down into the hole" always
   works, and nobody is asked to thread the slot between kerb top and drum. While the aim is
   legal the plumb glyph's stroke lengthens and a soft tick sounds once (tier 0: the
   crosshair tells her before the trigger does). A pull anywhere else: the hammer does not
   move, `nar_down_the_bore` (once), then silent.
5. Leaving the mark by more than 2.5 m before firing returns it to the seventh slot
   (`unload_kept`, 0.3 s); the HUD seventh then shows the band broken. It can be reloaded
   at any mark, as often as needed.
6. It cannot miss and cannot be wasted. There is no state of the game in which the kept
   round is gone and the bore is unproven.

### 6.7 What one round does (the reaction table; implement exactly)

| Target | One lead round | One line round |
|---|---|---|
| Bider, body | Felled. Thrown back 1.2 m. Kill marker, low thud. Biders within 1.2 m behind stumble 0.4 s | Freed |
| Bider, crown knot | **Freed**: the knot bursts, the Bider takes two failing steps and sits. Weak-point marker, glass *tink*. Biders within 4 m stumble 0.5 s | Freed |
| Bider, seated | No hit volume. The round passes and strikes the world behind | passes |
| Transit, legs or drum | Flinch 0.25 s; if aiming, the aim breaks and the tell restarts. Two kill | Dies |
| Transit, lens | Dies. Glass-bell note, weak-point marker | Dies |
| Stake in flight | Bursts in sparks. Never required | bursts |
| Tamper, plate | 25 (x0.25). Grey spark, flat clank, 0.2 m pushback, **the tracer skips off** as a visible ricochet with a bell note. No hit marker; a "deflected" glyph | Passes through the plate: **300** (half its health), hit marker, `flinch_plate` |
| Tamper, chest or back knot (the knot's hit sphere is **always live for a line round**, vent shut or open; for lead it exists only while that vent is open) | 200 while the vent is open. Stagger 1.5 s, attack cancelled. Three kill | **300 and `line_stagger`**: 1.8 s, attack cancelled, **both vents forced open**. Weak-point marker. Never more than 300: one line round cannot kill a Tamper from full health (900). Three line rounds kill; so do one line round and three vent shots |
| Tamper, during the bulkhead vignette | plate: clank and ricochet, **no damage**; a round into the vent while it is open on a wind-up: 200, and the encounter starts at once | 300 (and `line_stagger` through a knot), and the encounter starts at once |
| Knot on a mechanism | Bursts: wet pop, falling tone, a lamp answers | Bursts every knot on the line |
| Jug, insulator, bell, lantern, bottle, cup | Breaks, pours, rings. Always something | same, and continues |
| Windlass chamber, open | One hit; the chamber goes dark; its note sounds | counts as up to three hits through the guard |
| Windlass, shut shutter / guard | Clank, ricochet tracer, deflected glyph | pierces the guard |
| Seated figures at the Tally table | no hit volume | passes |
| The Dowser at 250 m | A puff of dust far short; `nar_dowser_shot`, once | same |
| The bore, before the proof | A flat, dead ring; `stn_bore_lead` (once per phase) | The line fades at 60 m; `stn_bore_line_short` |
| Sand, wood, adobe, metal, ceramic, stone | Surface-specific impact, decal (pool of 48, each at least 20 s) | same along the line's end point |

### 6.8 Shot timeline and feedback (lead)

| t (ms) | Event |
|---|---|
| 0 | Click. Same tick: ray resolved, round removed, flash on, report scheduled, kicks start, marker, impact, target reaction |
| 0–50 | Muzzle flash sprite (one of 4 rotations, 33–50 ms), asked for 1.6 x farther from the eye than the muzzle on the eye-to-muzzle line (`FLASH_PUSH`: the same place on screen, 0.625 the size; its white core under 1.2 % of a 720p frame). Polish round 5: render places the sprite each drawn frame on the line from the eye through the view-model's `muzzle` node as drawn, at the distance asked for, so the flash rides the kick (sprite to drawn muzzle under 1 px at 960 x 540); the powder smoke and the tracer begin where the muzzle of the shot's tick is seen through the world camera (the view-model pass has its own 40 degree projection), so on the first drawn frame they start a little under the risen barrel. Muzzle light pulse in the world shader: radius 7 m, 70 ms, flame colour, shaded by N.L per pixel (floor 0.12), paler toward its centre, and what it adds to any surface is held under 0.6 of display white whatever the mood's exposure (polish round 4) |
| 55 | Camera kick peak |
| 0–70 | Target-local pose freeze: 50 ms on a hit, 70 ms on a kill or a freeing. Never a global freeze |
| 120–300 | Hammer cock and cylinder turn: animation, two mechanical clicks, the HUD ring turns one notch |
| 320 | Camera back exactly on the aim point |
| 480 | Ready |
| 0–700 | Powder smoke: 4 soft particles |
| 0–1500 | Report tail (per-zone reverb, section 17) |

Feedback list:

- **Visual.** Flash sprite and shader light pulse; tracer (cosmetic, 2 frames); impact sets
  for sand, wood, adobe, metal, ceramic, stone, cloth; decals; hit marker 90 ms (four
  ticks); weak-point marker 120 ms (four ticks plus a ring: a different shape, not only a
  colour); kill marker 160 ms (ticks expand); freed marker 160 ms (the ring alone, closing
  to a dot); deflected glyph (a short chevron); slow-motion x0.3 for 0.3 s real time on
  the last enemy of an encounter and at boss phase breaks (look stays real-time).
- **Audio.** Six-layer report (section 17); last two rounds of a cylinder have brighter
  mechanics and a drier tail; dry click; seat-clicks; hit confirm tick; weak-point *tink*;
  kill thud; deflect clank and bell; music and ambience duck 5 dB for 200 ms per shot. Under a short confirm (tick, tink, parry, deflect) the dry gun bus steps back 5 dB for 120 ms and the room's answer 5 dB for 120 ms (8 dB for 160 ms in the lift hall, 10 dB for 200 ms in the bore); those four confirms are +2.5 dB in the lift hall and +3.5 dB in the bore; the tick's 1.9 kHz knock rings 130 ms; the dry click peaks at about -8 dB (polish round 4). Polish round 5: the tick, the tink, the parry and the kill hold their level 12 ms (lift hall) / 20 ms (the bore) before decaying (`IR_CONFIRM_HOLD`; they already peak at the limiter, so a lift bought nothing), and the kill's thud steps the report's tail back in those two rooms as the short confirms do (in the open a kill moves nothing): in the bore hit / weak / kill / parry measure +5.9 / +4.1 / +6.5 / +4.1 dB over the bed (they were +0.6 to +1.0).
- **Haptic substitutes.** Rotational camera trauma; viewmodel kick; FOV punch; HUD cylinder
  ring kick (the ring jumps 2 px and settles); the per-zone echo answering the shot.

### 6.9 Viewmodel clips (`weapon_revolver` in `design/assets.json`)

| Clip | Loop | Seconds |
|---|---|---|
| `idle` | yes | 3.0 |
| `sprint` | yes | 0.68 |
| `draw` | no | 0.5 |
| `fire` | no | 0.48 (kick 0–0.12, cock and turn 0.12–0.30, settle to 0.48) |
| `dry_fire` | no | 0.15 (cut at 0.117 s by `reload_open` when there are rounds to seat) |
| `reload_open` | no | 0.35 |
| `reload_round` | no | 0.30 |
| `reload_close` | no | 0.30 |
| `reload_fast_close` | no | 0.20 |
| `load_line` | no | 0.55 |
| `unload_line` | no | 0.35 |
| `load_kept` | no | 1.8 (re-staged in polish round 4 on the ordinary reload's framing: the round shown in profile beside the cylinder 0.30 to 0.53 s, the band cracked at 0.57 s, the round turned over and seated at the gate in view by 1.27 s, back to the firing pose by 1.8 s; nothing holds still for more than 7 frames) |
| `unload_kept` | no | 0.3 |
| `fire_kept` | no | 1.2 |
| `take_round` | no | 1.0 (the stone, zone 7) |

---

## 7. Enemies

Three archetypes and a boss. Never more than **6 enemies alive** outside the boss room and
**boss + 3** inside it. Attack tokens: 2 concurrent on Normal (Easy 1, Hard 3), sub-caps
2 melee / 1 ranged / 1 heavy, token cooldown 0.6 s, at least 0.3 s between attack starts.
AI thinks at 10 Hz with per-enemy phase offsets, steers and animates at 60 Hz, at most 4
line-of-sight rays per frame. Telegraph durations scale with difficulty (+20 % Easy,
−10 % Hard). Health never scales. Enemies outside the view cone attack at half frequency
and never start an attack from behind within 6 m without their cue having played.

Colour and shape law for enemies: section 16.

### 7.1 `bider` — the Rusher

- **Role.** Pressure. Flushes the player from cover. The only skinned humanoid.
- **What it is.** A townsperson of Plenty. Work clothes gone the colour of the ground. A
  hood of pale well-linen (the town's straining cloth), tied at the neck with well cord,
  two slits with a pinprick of violet behind each. On the crown of the hood, forward, a
  **knot**: a clustered growth 0.16 m in radius with a dark collar, a near-white core and a
  1.5 Hz pulse. No face, ever. **Not a scarecrow:** no straw, no pole, no hat, no stitched
  mouth, no feed-sack burlap, no outstretched arms.
- **Silhouette.** Low and forward. 1.4 m at the stoop (1.7 m upright), shoulders 0.5 m,
  hood 0.34 x 0.38 m, arms a little too long. The stoop presents the crown knot to the
  player. Outdoors a dark shape with a pale head on bright ground; underground the pale
  hood carries it.
- **Budget.** 2 500 triangles, one skinned mesh, one draw call, 22 bones, no cloth
  simulation (coat tails are two bones).
- **HP** 100. **Damage** lunge 18. **Speeds** run 5.8 m/s. **Threat** 1.
- **Perception.** Aware of the player from encounter trigger. Navigates to the player's
  last known position if line of sight is lost for more than 1 s.
- **Hit volumes.** Crown sphere r 0.22 m at the knot (tested first); body capsule.

State machine:

| State | Enter when | Does | Leaves to |
|---|---|---|---|
| `dormant` | spawned by a vignette (kneeling, seated, queued) | plays the vignette loop; shootable; a crown shot frees it without a fight | `rise` on trigger |
| `rise` | encounter trigger | `kneel_to_stand` 1.0 s, `rise_from_seat` 1.2 s or `climb_out` 1.2 s; shootable throughout | `approach` |
| `approach` | — | run at 5.8 m/s toward the player. In volumes tagged `lane` it follows the nearest Bider ahead and does not overtake; in open ground it takes one of five approach offsets (0°, ±12°, ±25°) so groups fan and do not form a line | `windup` at 2.4 m with a melee token; `circle` at 3 m without one |
| `circle` | no token | strafes at 3.0 m/s on a 3 m radius, `cap_bider_rattle` bark every 1.5 s | `windup` when a token frees |
| `windup` | token | 0.5 s crouch, head still, dry indrawn rattle | `lunge` |
| `lunge` | — | 0.35 s, 2.2 m forward, reach 1.8 m, 18 damage once | `recover` |
| `recover` | — | 0.6 s, slow turn | `approach` |
| `stumble` | a neighbour ahead within 1.2 m is felled, or a knot bursts within 4 m | 0.4 s / 0.5 s | previous |
| `falter` | the Tamper dies, or the kept round is fired in phase 3a (then go to `freed`) | 2.0 s, backs off 2 m | `approach` |
| `felled` | body damage of 100 or more | 70 ms freeze, `die_back` 0.9 s, thrown 1.2 m along the shot. After 3 s the body is replaced by an instanced static mesh (`bider_felled_static`) | final |
| `freed` | crown knot burst, any line round, or the kept round | 70 ms freeze, knot bursts (violet motes, falling tone), `sit_down` 0.9 s (two failing steps, knees fold, sits back on its heels, hands flat on the ground), then `sit_breathe`. After 3 s replaced by an instanced static mesh (`bider_seated_static`) with a vertex-shader breath (2 mm chest scale, 0.25 Hz). No hit volume. Increments `freed` | final |

- **Killed well.** The leader first, at 10 m. Or better: the knot, which also staggers the
  two behind. One line round down a file.
- **Audio.** `cap_bider_rattle` (windup: wind in a sack), cloth-and-boot footfalls, a
  breathy exhale on `freed` (`cap_bider_sits`), a soft fold on `felled`.

Clips (`enemy_bider`):

| Clip | Loop | Seconds |
|---|---|---|
| `idle_stoop` | yes | 2.0 |
| `run` | yes | 0.62 |
| `circle_strafe` | yes | 0.8 |
| `lunge_windup` | no | 0.5 |
| `lunge` | no | 0.35 |
| `lunge_recover` | no | 0.6 |
| `stumble` | no | 0.4 |
| `falter` | yes | 1.0 |
| `die_back` | no | 0.9 |
| `sit_down` | no | 0.9 |
| `sit_breathe` | yes | 4.0 |
| `sit_table` | yes | 4.0 (seated on a chair, hands flat on a table; pose source for `bider_table_static`) |
| `rise_from_seat` | no | 1.2 |
| `climb_out` | no | 1.2 |
| `scoop_kneel` | yes | 2.4 (vignette) |
| `kneel_to_stand` | no | 1.0 (sets a cup down first) |
| `queue_stand` | yes | 3.0 (vignette, facing away) |
| `turn_about` | no | 1.5 |

Entrances are limited to three: run in through a doorway, `rise_from_seat`/`kneel_to_stand`,
and `climb_out` (floor grate or the bore kerb). No wall-vaulting, no ledges.

### 7.2 `transit` — the Marksman

- **Role.** Zoning. Punishes standing in the open. Makes one round worth saving.
- **What it is.** A Pellam bore-survey instrument that never stopped taking sightings.
- **Silhouette.** Tall and thin: 1.9 m. Three ceramic legs **0.13 m thick** (thin-geometry
  rule), a drum head 0.45 m across, one lens 0.24 m across with a violet core in a dark
  bezel. Nothing else in the game has three legs.
- **Budget.** 2 000 triangles, rigid parts skinned to one mesh (one draw call), 8 bones.
- **HP** 200. **Damage** stake 22. **Speeds** walk 3.5 m/s. **Threat** 2. Max alive 2.
- **Perception.** Sight 40 m, 120° cone; hears shots anywhere in its encounter.
- **Weak point.** The lens: r 0.17 m hit sphere, x2 (one shot).

State machine:

| State | Does | Timing |
|---|---|---|
| `vignette` | T1 only, once: emerges, ignores the player, plants, sights the yard bell and stakes it (the full tell on something else), then turns. **Shootable throughout with normal damage.** A lens shot kills it (wave B's 40 s clock starts from that kill). A body hit makes it `flinch`, ends the vignette and puts it in `relocate` at once. It never targets the player before the turn. `nar_transit` plays on the turn, or is skipped if it died first | about 4 s |
| `emerge` | steps out of a door and unfolds; shootable | 1.2 s |
| `relocate` | walks to an authored firing point 12–25 m from the player, near cover but visible (scored: line of sight, band, unoccupied, not used in the last 10 s). Backs off if the player is inside 8 m | 3.5 m/s |
| `plant` | legs clack down | 0.3 s |
| `aim` | **telegraph 0.9 s**: head dips, lens flares from violet to hot orange-white with a four-point star glint (shape), a rising tone, and a **dashed sighting thread** (constant 2 px, dashes 0.3 m) from lens to target. The thread stops tracking for the last 0.25 s; the head is still for the last 0.4 s. Needs the ranged token | 0.9 s |
| `fire` | one stake: 18 m/s, radius 0.15 m, 22 damage, hot orange with a white core, a low whirr in flight. It sticks in whatever it hits and cools to dull orange. Stuck stakes are pooled and instanced, **cap 18**, oldest recycled | 0.25 s |
| `cooldown` | | 1.5 s on Easy and Normal, 1.2 s on Hard (polish round 4: the yard was harder than the Windlass for a middling shot) |
| relocation rule | after 2 shots from one point | |
| `sidestep` | if the crosshair rests on it for 0.6 s beyond 10 m; at most once per 3 s; never during `aim` | 0.4 s, 1.5 m |
| `flinch` | on a body hit; an `aim` in progress is cancelled and restarts from `plant` | 0.25 s |
| `die_fold` | folds like a dropped tripod; the lens rings | 1.0 s; stays |

- **Killed well.** Wait for the plant. One round through the lens while it holds still to
  kill you.
- **Audio.** Leg clacks (three-beat gait, unmistakable), the rising aim tone
  (`cap_transit_tone`), stake whirr, the lens bell on death.

Clips (`enemy_transit`): `idle_scan` (loop, 3.0), `walk` (loop, 0.9), `emerge` (1.2),
`plant` (0.3), `aim_hold` (loop, 0.6), `fire` (0.25), `flinch` (0.25), `sidestep_l` (0.4),
`sidestep_r` (0.4), `die_fold` (1.0). The gait is one fixed clip; no procedural IK.

### 7.3 `tamper` — the Brute

- **Role.** Anchor, area denial, set piece. Something that was never anyone.
- **What it is.** A walking pile-driver that packed earth round the shafts.
- **Silhouette.** Wide and tall: 2.4 m high, 1.6 m wide, a hunched enamel-white barrel on
  short legs, lopsided: one enormous tamping arm (right), one small counter-arm. The livery
  band has gone violet. Chest vent and back vent: louvred hatches 0.5 m across; behind each
  a knot, hit sphere r 0.28 m. **For lead the sphere exists only while that vent is open.
  For a line round it is always live**, because the line passes through the shut plate
  (section 6.7).
- **Budget.** 4 000 triangles, rigid parts on one skinned mesh, 12 bones.
- **HP** 900 (polish round 4, ruling R1: at 1 200 it was an ammunition wall, 48 plate hits
  against the 30 rounds a player carries, and a plain player ran dry and died to the wave
  Biders; polish round 3, ruling R3: at 600 it died to three vent shots in 13 to 19 s and
  never touched her). **Damage** slam 38, charge 35. **Speeds** walk 2.5 m/s, charge 9 m/s.
  **Threat** 4. Max alive 1.
- **Perception.** Always aware within its encounter. Turn rate 90°/s walking, 20°/s while
  charging (it cannot follow a side-step). It charges when she is 8 to 20 m away, in sight,
  and it has not charged in the last 4 s (polish round 3; it was 6).
- **Armour.** Plate takes x0.25 (25 per lead round; 36 rounds if every shot lands on plate,
  which is the lesson). Vents take x2 (200: five vent shots). A line round does a flat 300
  (a third of it) wherever it passes through the body and never more: through a knot it adds `line_stagger`, not damage.

State machine:

| State | Does | Timing |
|---|---|---|
| `vignette` | dormant clip `pound_bulkhead`: pounds the sealed bulkhead, chest vent open on each wind-up, facing away from the gantry. It ignores the player. **Plate hits clank and do no damage** (no chipping it down from the gantry). A lead round into the open chest vent, or any line round, does its normal damage **and starts `enc_matador` at once** exactly as if `trg_enc_matador` had been entered (doors lock, the wave clock starts, it turns). Otherwise it leaves this state only on `trg_enc_matador` | until triggered |
| `advance` | walks toward the player | 2.5 m/s |
| `slam_windup` | arm up, a rising hiss; the **chest vent opens for the last 0.6 s of the wind-up** (`TAMPER.slamVentLateBy`, polish round 3; it was the whole 1.0 s, and on Easy it still is, polish round 4); a hot-orange ring with eight tick marks (shape) is painted on the floor, radius 3.5 m. Starts inside 4.5 m. Needs the heavy token | **1.15 s on Normal, 1.38 s on Easy, 0.9 s on Hard** (`TAMPER.slamWindupBy` 1.15 / 1.15 / 1.0 x the difficulty's telegraph scale, polish round 5: it was 1.0 x the scale; the vent's window is unchanged, the last 0.6 s, on Easy the last 1.0 s; the clip is played slower by the ratio) |
| `slam` | 38 damage within 3.5 m of the impact point (line of sight required: ribs block) | 0.3 s |
| `slam_recover` | chest vent stays open the first 0.5 s | 1.5 s |
| `charge_windup` | head down, foot scraping sparks, a falling pneumatic howl (`cap_tamper_howl`). Starts at 8–20 m with a clear lane. The direction is fixed at the end of the wind-up | 0.8 s |
| `charge` | straight line at 9 m/s, 35 damage on contact, up to 22 m | until contact |
| `charge_stun` | if the charge meets a rib or wall: stunned, **back vent open** | 2.0 s |
| `stagger` | on a lead hit in an open vent: attack cancelled | 1.5 s |
| `line_stagger` | on a line round through either knot: attack cancelled, **both vents open for the whole state** (code holds the `vent_chest` and `vent_back` bones open over the clip). Plays the `stagger` clip stretched to the state's length (1.5 / 1.8 of its speed); no new clip. A lead vent hit during it does 200 and does not restart or shorten it. A second line round during it does 300 and restarts it | 1.8 s (polish round 4; was 3.0) |
| `flinch_plate` | plate hit: 0.2 m pushback, no interrupt | 0.2 s |
| `die` | stops mid-stroke, the arm comes down slowly under its own weight, the band goes dark | 2.2 s; stays |

Pattern: slam if the player is within 4.5 m, else charge if a lane exists and the last
charge was more than 6 s ago, else advance.

- **Killed well.** Three ways. *Nerve:* stand inside 4.5 m, wait for the arm, put a round in
  the chest vent, three times. *Footwork:* bait the charge into a rib, three in its back.
  *The line:* stand in front of the charge and send one line round through the chest plate
  and the knot behind it: half its health gone, the charge broken, and three seconds with
  both vents standing open, which is time for two rounds into a vent if the cylinder is
  ready. The line round is the best opening in the fight and is never the whole fight.
- **Audio.** A two-beat stamp, the hiss, the howl, plate clank with a skipping bell, the
  slam as a sub thump with debris.

Clips (`enemy_tamper`): `idle` (loop, 2.4), `walk` (loop, 1.2), `slam_windup` (1.0; played at 1 / 1.15 speed on Normal and Easy before the telegraph scale),
`slam` (0.3), `slam_recover` (1.5), `charge_windup` (0.8), `charge` (loop, 0.5),
`charge_stun` (2.0), `stagger` (1.5), `flinch_plate` (0.2), `die` (2.2),
`pound_bulkhead` (loop, 2.6; vignette).

---

## 8. Boss — `windlass` (Lift Head, Station 4)

**What it is.** The station's lift head: six lift chambers in a ring, hung over the bore to
raise water. With the bore unproven it raises something else. It is the player's cylinder,
five metres across, seen from the wrong end.

**Body.** A drum 5.0 m across and 2.2 m deep, face vertical, centre 4.0 m above the floor.
On the face a ring of six shuttered mouths at 1.7 m radius, each 0.9 m across, each holding
a knot (hit sphere r 0.45 m when open) in a dark bezel with a white core and a hexagonal
collar; a lamp beside each mouth. The drum spins on its own axis (`drum_spin`) to bring a
mouth to the top (the firing position, marked by a fixed pawl). The drum hangs from a
gantry **arm** that pivots at the bore axis (`arm_yaw`); the drum's centre sits 2.0 m out
from the axis, facing outward. Seen in plan the drum therefore occupies 0.9 to 3.1 m out
from the axis along the arm's heading and 2.5 m to either side of it, and hangs from 1.5 m
to 6.5 m above the floor: its face stands over the kerb (r 3.0 to 3.6 m). Budget: 8 000
triangles; **the node, bone and draw-call list is the manifest's**
(`design/assets.json`, `boss_windlass`): one rigid-skinned mesh `body_mesh` on 26 bones
plus two lamp-set meshes, 3 draw calls.

Bones (`boss_windlass`): `root`, `arm_yaw`, `drum_spin`, `mouth_1`..`mouth_6` (lids),
`knot_1`..`knot_6`, `guard`, `guard_piece_1`..`guard_piece_5`, `pawl_l`, `pawl_r`,
`cable_a`..`cable_c`. Empties: `knot_1_hit`..`knot_6_hit`, `pawl_l_hit`, `pawl_r_hit`,
`muzzle_top`, `canister_muzzle`, `thread_anchor_1`..`thread_anchor_6`. Lamp sets:
`boss_lamps` (14: indices 0–5 the lamps beside mouths 1–6, 6–11 the knot cores 1–6, 12 and
13 the pawl cores) and `gauge` (26 segments on the arm housing: the boss's health,
diegetic; indices 0–25 in groups of 10, 10, 6). The fixed firing-position pawl over the top
mouth is plain geometry on `arm_yaw`, not a node.

**Arena** (positions from `design/layout.json`; bearings are compass bearings from the bore
axis, 0° = north = the door, clockwise). The bore chamber: 30 m across, 14 m high. Six
**bays** centred on 0°, 60°, 120°, 180°, 240°, 300°; bay 1 is the door bay (0°) and the
proving-lift gate is in bay 4 (180°), directly opposite. Six ribs 1.6 m thick and 3.0 m
long radially (r 7.5 to 10.5 m, centred on 9 m), full height, **between** the bays at 30°,
90°, 150°, 210°, 270°, 330°. They block everything the Windlass fires. The bore is 6 m wide
behind a kerb (r 3.0 to 3.6 m, 1.2 m high) the player cannot cross. Six brass **proving
marks** (`ia_proving_mark_1..6`) set in the floor on the bay centres at r 4.9 m: dark brass
through phases 1 and 2, **lit aqua from the first tick of phase 3a**. Two cartridge points
(`ia_ammo_box`, 18 rounds, 10 s cooldown; polish round 4, it was 12) on the outer wall at 90° and 270°, each directly
behind a rib: the obvious places to reload. One line locker on the wall at 168°, beside the
lift gate. Three floor grates at the kerb foot (r 4.5 m, at 90°, 210°, 330°) where Biders
climb out. The arrival catwalk crosses the north side 8 m up, over the door bay.
**Lighting is six-fold symmetric** so the bake is valid at every arm index.

**The kept-round target.** The bore target volume of section 6.6 rule 4: a cylinder of
radius 3.0 m on the axis from kerb-top height down, with the kerb and the boss ignored.
`bore_opening` in the layout is its marker (top at floor + 1.2 m).

**Movement (it is not a turret).** The arm has six indexes, each facing one bay. The
Windlass can aim only within ±35° of the arm's heading. Before each pattern it **indexes**
to the bay the player is in: `stn_boss_indexing`, a ratchet run, 1.5 s per 60° step (the
shorter way round), shutters shut while moving. A player who changes bay during a pattern
is out of its arc until the next index: moving is defence, and it relocates the fight.
The one exception to "it indexes to the player's bay" is the hush (section 8.2): there the
arm swings to the bay **opposite** the occupied mark and the bore stands open in front of
her.

**Hit rule.** Only a knot in an **open** mouth takes a hit. Each open knot takes one hit and
goes dark until the haul ends. Shut shutters and the guard clank.

**Parry rule (not a dominant strategy).** A lead round into a **stake** chamber during its
glow makes it misfire: no stake, a cracked shutter, a sour note. A parry **does not count
as a hit** and does not reduce phase health; it only spares the player a dodge and costs a
round that will not be in the cylinder when the mouths open. **Canister chambers cannot be
parried** (a heavier lid: clank). The fan in phase 3 cannot be parried.

### 8.1 The asking (parley; skipped on retry)

On entering, the door seals. The Windlass indexes to face her. `stn_parley_1`. Then
`nar_parley`, then her question on screen, `rv_ask`. The machine answers with procedure: it
reads out what each chamber holds, in order (`stn_parley_2`, `stn_parley_3`), which is its
whole phase-1 pattern, and ends `stn_parley_4`. **All six mouths open for 4.0 s, starting
on the tick `stn_parley_4` appears** (the line is on screen while they stand open). A
player who held fire gets **two** free hits into the open knots (`BOSS.parleyGift` 2, polish
round 3; it was up to six, and phase 1 was over before its pattern had been seen): the lids
shut on the second. Then `nar_parley_kept`, and phase 1 begins.

**The rule is taught here, before it is needed** (polish round 3, ruling R2). `stn_parley_4`
states it in the station's voice ("A LIT CHAMBER IS OPEN. ALL SIX OPEN ON THE HAUL.") while the mouths stand open, and `nar_parley_kept` repeats it as they shut ("It would
open again to haul"). On a retry the parley is skipped: `hint_boss_haul` ("Lit meant open. All six opened to haul.") is said at the first haul of **every** try of
phase 1 and 2, the first included (`BOSS.teachDeaths` 0), so a player who refused the parley
hears it too. **The rule as built:** a lit knot in an open mouth takes its hit whenever the
mouth stands open, the chamber about to fire included (a stake chamber struck in its glow
still misfires, a canister still lobs, and a knot burst in the glow stays dark through the
haul: six a cycle at most). A shut lid is plate: the mouth's hit sphere is live only while
the lid is more than half open and the guard is not set.

A shot at any time before `stn_parley_4`: a clank off a shut plate, `stn_parley_refused`,
and phase 1 begins at once with no inspection. Nothing is lost by impatience but the
advantage. Timeline if heard out, from the door sealing (line holds from
`design/story.json`): `stn_parley_1` 0–5.5 s, `nar_parley` 5.5–10, `rv_ask` 10–14.5,
`stn_parley_2` 14.5–19, `stn_parley_3` 19–23, `stn_parley_4` and the open mouths 23–27,
phase 1 from 28 s. **Total 28 s.**

### 8.2 Phases

Health is **26 pips**: 10 + 10 + 6. Damage does not carry across a phase boundary. Each
phase start is a checkpoint. Phase transitions are 3 s, invulnerable, with slow-motion x0.3
for 0.3 s on the breaking hit.

**Phase 1 — Six for six (10 hits).**

| Step | Timing | What |
|---|---|---|
| Index | 1.5 s per step | to the player's bay |
| Six discharges | 1.1 s each (0.9 s glow + 0.2 s index) and, in phase 1 only, **0.8 s of rest with the lids shut** after each notch (`BOSS.p1Rest`, polish round 3): a chamber every 1.9 s, 11.4 s total (it was 6.6) | order **stake, stake, canister, stake, stake, canister**. The top mouth irises open, glows hot orange with a rising tone, fires, and the drum indexes with a ratchet clunk. The lamp beside each mouth goes out as it fires: the player can count its cylinder |
| Stake | 20 m/s, 25 damage, aimed at the player's position at the end of the glow | sticks; shared pool with Transit stakes |
| Canister | lobbed, 1.2 s flight, lands at the player's position at launch; paints a hot-orange ticked ring r 3.5 m for 1.0 s, then bursts for 38. It lands **behind cover** so the player must leave it | max 2 rings alive |
| Haul | **3.0 s** (polish round 3, the enemies' fixer; 5.0 earlier in the round, 3.5 before): `stn_boss_hauling`, all six mouths open, six knots, the lamps relight one by one (the haul's clock). **While it hauls (phases 1 and 2) the arm follows her**, one bay every 0.5 s, mouths open (`BOSS.haulFollows`): a circling player no longer meets the drum's back for the whole haul | the player's turn: one cylinder, six targets |

Phase 1 ends at 10 hits: `stn_boss_p1_break`.

**Phase 2 — The guard (10 hits).** `stn_boss_guard_set`: a ceramic guard plate slides over
the face (`pierce`-tagged). `ia_line_locker_bore` opens. Tells shorten to 0.8 s.

| Step | Timing | What |
|---|---|---|
| Index | 1.5 s per step | |
| Five discharges | stake, canister, **lance**, stake, canister | 7.7 s total |
| Lance | a dashed hot-orange thread shows the sweep's start edge for **1.2 s** with a rising two-tone; then a blade of light sweeps the arm's 70° arc at chest height over **2.5 s** (28°/s), 30 damage once. Ribs block it. One quad, additive, capped | forces rib use |
| Adds | 2 Biders climb out of the kerb grates at each haul start. Cap 3 alive, 6 total in the phase | they drop cartridges or a canteen |
| Haul | **6.5 s** (polish round 3; it was 4.0). The guard stays shut unless both **pawls** are shot: two knots high on the arm, left and right of the drum, 3.2 m apart, 6 m up, each r 0.3 m. Both burst: `stn_boss_guard_released`, the guard drops for the rest of the haul (at least 4.5 s is guaranteed: the haul extends if needed). Pawls reset each cycle | two rounds for the pawls, four left for six mouths |
| Line option | a line round through the guard counts as **3 hits** (it meets up to three knots; fixed at 3 for clarity) | |

Phase 2 ends at 10 hits: the guard shatters, `stn_boss_p2_break`.

**Phase 3a — Unproven (no pips can be removed).**

- The drum spins free at 40°/s. All six mouths stand open and moving.
- **Attack: the fan.** 1.2 s spin-up whine with all six lamps flashing in turn (at 5 Hz,
  under the flash limit), then six stakes in 1.2 s across a 24° spread, 18 damage each,
  **at most two can damage the player per fan** (36). Then a 3.0 s haul. Then index.
- Each mouth takes one hit and goes dark, and its pip goes out. **4.0 s later it relights
  from the bore** with a rising gurgle, a visible violet thread climbing from the bore to
  that mouth, the pip relighting, and `stn_boss_refilled`. This is lead failing in front of
  the player.
- Adds: up to 3 Biders alive, one every 8 s, at most 9 in the phase; none after hint T3.
- **From the first tick of the phase** (with `stn_boss_p2_break`): the six proving marks
  light aqua and `F` is live on them (section 6.6 rule 2). The objective becomes
  `obj_boss_unproven`.
- (Polish round 4: the world says `stn_boss_charge_required` then `nar_one_left` **1.5 s** into phase 3a unless the band is already broken; both are dropped unheard once she has pressed `F`. The Windlass's own ask below still starts the HUD pulse and the hint ladder and repeats the station's line.)
- At phase start + 12 s, or at the first relight, whichever is first, **and only if the
  kept round has not been loaded yet**: `stn_boss_charge_required`, then at once
  `nar_one_left` (once-only; every player who has not already acted hears that she is
  carrying the last one), and the HUD seventh starts to pulse once per 2 s. This delay
  applies to the station line, the narrator line and the HUD pulse only; it never gates the
  marks or the key.
- **Reward for skill.** If all six mouths are dark at once (a clean cylinder before any
  relight): `stn_boss_head_dry_refilling`, the Windlass stops attacking for 6.0 s. A safe
  walk to a mark.
- Lead down the bore: flat ring, `stn_bore_lead`. Line round down the bore:
  `stn_bore_line_short`.
- **Hints (phase 3a only; fast ladder, counted from `stn_boss_charge_required`):**
  T1 15 s **`hint_kept_1`** (polish round 5; it was `nar_office`, the thesis line, which is now said only after the
  proof, so nobody finishes the stage without it and no slow player spends it early; T2 replaces a T1 line still on
  screen, and after a second death in the phase a cut T1 line is not said again in front of T2); T2 30 s `hint_kept_2`; T3 45 s an outline pulse on the nearest
  mark, `ui_prompt_kept` shown persistently, adds stop; T4 75 s the fan's damage drops to 9
  per stake and the haul lengthens to 6 s. (`nar_one_left`, formerly the T2 hint
  `hint_kept_1`, now plays for everyone with `stn_boss_charge_required`.)
- **The hush.** When the player presses `F` on a mark: every stake and canister in flight
  bursts harmlessly in sparks, the Windlass shuts its mouths and stops (it does not attack
  again until the shot or until the player leaves the mark), time scale drops to x0.5 for
  the 1.8 s load (not with Reduce Motion), ambience ducks. Biders in `windup` or `lunge`
  are forced to `falter`. **The head stands clear:** over the 1.8 s of the load the arm
  swings in one unbroken ratchet run to the index **opposite** the occupied mark (180°;
  `cap_ratchet`), so the drum hangs over the far kerb with its fluted back to her and
  nothing stands between the mark and the bore: for the first time she sees the cylinder
  from the right end. If she leaves the mark it indexes back to her bay as usual.

**The seventh.** She aims down into the bore (any aim into the bore target volume, section
6.6 rule 4; the plumb glyph confirms it). The trigger falls.

1. It is the only shot in the game with **no echo**: the crack and boom are cut after
   120 ms; what is left is one pure tone, exactly in tune (section 17).
2. A line of aqua light stands in the bore, dead vertical, 4 px wide, from the bottom up
   through the roof. It stays for the rest of the stage.
3. **The ring.** A pale ring races outward from the bore across every surface (one radial
   term in the world shader, shared with the muzzle pulse: radius 0 to 40 m in 1.6 s).
   Violet dies as it passes: knots go grey, the livery bands go aqua, the bore drains from
   the bottom up.
4. Every Bider alive sits (`freed`, counted).
5. **The station hum, which has been under every second of the underground, stops. Four
   seconds of true silence.** `cap_hum_stops`. The Windlass is frozen for those 4 s.
   `nar_kept`.
6. `stn_proven`. Far below, for the first time, the sound of water (`cap_water_below`).

**Phase 3b — Dry (6 hits; no damage to the player is possible).**

- `stn_dry`. The drum turns at 15°/s. It goes on working: every 1.1 s the top mouth irises
  open with **a dry click and no glow** (the player's own dry-fire sound, enormous). Then
  `stn_boss_hauling`, twice, 4 s apart; `nar_hauling` after the second. Polish round 5: each of the three is said
  only into a line box that has stood free 0.5 s (`BOSS.dryLineQuiet`), so none is ever queued: a player who kills
  it within about 10 s of HEAD DRY hears none of them, and none can be announced after it is dead. "HEAD DRY." itself
  is on screen about 4.5 s after the phase begins, behind `nar_kept`.
- All six mouths are open and cannot relight. Each takes one lead round. The six hits
  sound the first six degrees of the scale, ascending.
- No time limit. If the six are done in one cylinder with no miss: stat `clean_six`.
- **Kill sequence.** The sixth lamp goes out. Time x0.2 for 0.6 s. The drum runs down
  exactly like a spent cylinder: click, click, slower, click, stop. It sags on its cables
  (`sag_death`, 3.0 s). Three seconds of nothing. `stn_service`, `stn_thanks`. The proving
  lift's gate lamp lights aqua on the far wall.

### 8.3 Fairness and legibility

- No hit over 38. Every attack has a tone, a pose and a shape; nothing relies on hue.
- **A station voice line announces every state change** (indexing, hauling, guard set,
  guard released, chamber refilled, charge required, proven, dry). The `gauge` on the arm
  mirrors the HUD pips.
- HUD: `ui_boss_name` with 26 pips in three groups. Clanks show the deflected glyph.
- Mercy: after 1 death in the same phase (polish round 3; it was 2), boss damage x0.85 and
  one extra `pk_rounds_12` at the door, silently. The teaching line `hint_boss_haul` is said
  at the first haul of every try (8.1).
- Phase 2's pawls, once burst, **stay burst for the phase** (`BOSS.pawlsReset` false, polish
  round 3): the guard drops by itself at every later haul.
- Retry starts at the phase, control within 3 s, parley skipped. Polish round 5: on a retry of phase 1, 2 or 3a the
  first attack (and the adds' clock) is held **4 s** (`BOSS.retryLead`; it was 1.5), and on Easy and Normal she comes
  back on **full health** (`BOSS.retryFullHealth`; Hard keeps the respawn floor of 60). A player who never moves at all
  after a respawn into phase 2 still dies, at 13 to 15.5 s.
- Pools and caps: stakes in flight 8; stuck stakes 18 (shared, instanced); canister rings
  2; lance quad 1; violet threads 6. Additive overdraw in the chamber is bounded at one
  screen on Low.
- **Reduce Flashes / Low tier:** the chamber is lit by the bake (violet from the bore, then
  aqua), not by flashes. Knots are read by white core, hexagonal collar, dark bezel and
  pulse. The lamp flashing before the fan becomes a steady ramp.

Clips and code-driven motion (`boss_windlass`): `idle_sway` (loop, 4.0), `present` (1.0),
`mouth_open` / `mouth_close` (0.2, per mouth, retargeted to `mouth_n`), `guard_slide_on`
(1.2), `guard_drop` (0.6), `guard_raise` (0.6), `guard_shatter` (1.0), `sag_death` (3.0).
`arm_yaw` and `drum_spin` are driven by code.

---

## 9. Zones

Seven zones. Surface footprint about 130 x 130 m; the underground runs back east under the
street and ends under the gully, so the proving lift surfaces on the rim above the starting
overhang. The whole stage fits inside 300 x 300 m. The sun is low in the north-west
(azimuth 315°, elevation 14°): ahead-left in the gully, ahead-right on the street. Palette B
"Long Light" for the body, a first 20 s at palette A's glare, palette C for the rim.

### 9.1 Flow

```
 PLAN (north up; sun low in the north-west)

              [3 tally_house]
                    |  yard door
   [2b pump yard]---+
        |  yard gate
   [2a front street, 72 m, walked east to west]-----+
                                                    |  jug gate (pz seven_jugs)
                                              [1 the_lip]
                                              gully 95 m, walked south to north
                                              start: overhang at the south end
                                              [7 far_rim: ledge above the overhang]

 SECTION (looking north)

   W                                                         E
   yard / tally      front street                gully        rim
   __|__________________________________________|____________/‾‾
     | hatch (pz daylight)                              ^
     | peg stair, 12 m down                             | proving lift (up, dark ride)
     +==[4 the_gallery 62 m]==[5 lift_hall]             |
                                   |                    |
                                   v lift (down, 25 s, dark ride)
                         [6 the_bore: catwalk > antechamber > chamber]---+

 FLOW, GATES (G) AND CHECKPOINTS (cp)

 cp_lip_start > camp 1 > gully > G1 jug gate [seven_jugs] > cp_lip_gate
  > street: enc_street > cp_street_clear > G2 yard door [one knot]
  > yard: enc_yard > cp_yard_clear > (Dowser sighting) > tally door
  > cp_tally_enter > [daylight] > G3 hatch [knot: ajar] > enc_tally > cp_tally_hatch
  > hatch opens > peg stair (surface set unloads) > cp_gallery_bay > [proving_line] > G4 baffle
  > cp_gallery_baffle > enc_file > cp_file_clear
  > cp_hall_gantry > enc_matador > cp_hall_clear > cache, diagram > G5 lift (ride)
  > catwalk > cp_bore_ante > [the_asking] > G6 bore door
  > cp_boss_p1 > cp_boss_p2 > cp_boss_p3 > (the seventh) > cp_boss_proven
  > G7 proving lift (ride) > cp_rim > the stone (the edge alone does not end it) > end card
```

Every gate closes behind the player except G1 and G2 (the street and yard remain one
space). No backtracking is ever required.

### 9.2 `the_lip` (exterior approach)

- **Purpose.** Establish the pursuit and the goal; teach move, fire, reload; plant "one
  more than she carries".
- **Dimensions.** Overhang 12 m wide x 9 m deep x 3 m. Gully 95 m long, 12–20 m wide,
  falling 14 m to the north. Walls 8–15 m.
- **Landmark.** A dead pylon, 16 m tall, at the gully mouth. Its fallen arm has been lashed up as a
  well-sweep to work the town's stock gate. Beyond it the pylon line marches to the Rule.
- **Lighting.** Starts inside black shade (the doorway shot). The first 20 s outside are
  over-exposed glare that settles into Long Light: peach haze, long mauve shadows down the
  gully toward the player. Fog 20 % at 40 m, 50 % at 120 m, 88 % at 350 m.
- **Traversal.** Walk out, walk down. One optional 0.5 m step-up to a ledge with
  `pk_rounds_6`.
- **Taught.** He was here two days ago and is not hurrying. He knows what she carries. The HUD has a seventh
  mark that does nothing. The violet hairline is where everything goes.
- **Contents.** Stop one (no fire: a swept patch of floor): a flat stone, his coffee pot on
  it with the coffee gone to tar (`nar_open_1`), `rd_note_lip` under a spent case,
  `pk_rounds_12` (his tin; `nar_tin`). The jug gate (opening 4.0 x 2.8 m). `ia_ammo_box`
  6 m from the gate.
- **Secrets.** None.

### 9.3 `plenty_street` (exterior settlement: Front Street and the pump yard)

- **Purpose.** Fight 1 (the stand-off in open ground) and fight 2 (the duel at range).
- **Dimensions.** Street 72 x 30 m; the street proper is 14 m wide between leaning facades
  (nine facades, 2–4° lean). Pump yard at the west end: 30 x 28 m, walled 3 m.
- **Landmark.** The wind-pump: a 14 m timber tower bolted to a celadon ceramic drum 8 m
  across that comes up through the adobe well-house. It turns; one vane is missing. In the
  street, a ceramic rib of the old works surfaces through the dirt like a whale's back.
- **Lighting.** The player walks into the light. Every post and porch throws a long shadow
  down the street at her. Biders are dark shapes with pale heads on bright ground. The one
  wrong thing: every door carries the six-and-one mark brushed by hand, and every mark has
  been struck through, neatly, in the same pencil (`nar_marks`).
- **Street arena.** Full-height cover about every 9 m, alternating sides (east to west: a
  tipped wagon bed, an adobe wall stub, the ceramic rib, a second stub, a pump post with a
  low trough). Two loops through the north and south alleys. The exposed stretch is the
  last 25 m before the yard gate. The saddlery (wave C) is on the **south** side at the
  west end; the feed store (the secret) on the north side.
- **Gate court.** The yard gate (`door_yard_gate`, 4.0 x 3.0 m, burst by wave D) and the
  yard door (`ia_yard_door`, 2.6 x 2.8 m, the knotted Pellam panel, G2) are two openings
  with a 5 m court between them.
- **Yard arena.** Full-height cover: the drum, tank stilts boarded on the north side, three
  wall stubs, a water cart. Two loops (round the drum, round the east tank). Problem position:
  the tank catwalk at 3.5 m. The yard bell (an insulator on a post) at the centre.
- **Traversal.** Flat. Catwalk by ramp (optional).
- **Taught.** One shot each. The knot on the hood frees. Sprint-and-reload is the retreat.
  The count is always one more than the cylinder. Knots are for shooting. A shot can break
  an aim. Hot orange with a shape and a rising tone means move.
- **Contents.** `pk_rounds_6` x2 (wagon, south alley), `pk_canteen` (trough),
  `pk_rounds_12` inside the yard by the water cart, `ia_ammo_box_yard` inside the yard door, `pk_canteen` (water cart), yard door `ia_yard_door`
  with `knot_yard_latch`.
- **Secret `sec_loft_bell`.** The feed-store loft, north side: an insulator hung as a bell
  is visible through the open loft door. Shoot its rope: it falls, rings, and knocks the
  loft ladder down (the fallen ladder is a 37° ramp collider enabled by the shot: the player
  walks up it; there is no climbing). Inside: `pk_rounds_12` and `rd_rain_tally`.
- **The sighting.** After `enc_yard`, on the far mesa rim, 250 m: the Dowser. A billboard
  card scaled so it is never under 9 x 28 px at 720p (lead ruling R4; it was 3 x 8), a
  near-black figure (`#15121A`) standing on the skyline against clear sky, with one
  sun-glint off the rod to draw the eye. **Two conditions the blockout must meet** (the
  bearing is the layout's, `vista_dowser`): the card stands at least 25° of azimuth clear
  of the sun (which is at 315°, 14° up), on dark rim and not in the glare; and the beat
  starts only from a position with a clear line to him, so `nar_dowser_seen` never narrates
  something off screen. The 12 s clock starts when he is first within the view cone, not
  when the trigger is entered; he goes when the player looks away for 2 s after having
  looked at him for 1 s, or at 12 s. A shot raises dust far short.

### 9.4 `tally_house` (interior)

All positions are the blockout's (`design/layout.json`, `docs/LEVEL.md` section 3); this
section was rewritten to them in revision 2 (request 1, section 23).

- **Purpose.** The story turn and the mood turn. Puzzle `daylight`. A fight lit by the gun.
- **Dimensions.** Hall 14 m (east–west) x 22 m (north–south): interior x −96..−82,
  z −37..−15. Adobe walls 5 m high under a flat viga roof. Entered at the south end from
  the yard by `door_tally` (1.6 x 2.4 m). **Strictly civic:** a water-share hall. No
  altar, no pulpit, no pews, no lectern, no religious furniture of any kind.
- **Landmark.** The long tally table down the middle (x −89.7..−88.3, z −29.6..−18.6) with
  eleven hooded figures seated along it, hands flat on the boards (nine
  `bider_table_static`, instanced, and the two riser chairs). On the **south wall, east of
  the door** (x −88..−82, wrapping a little onto the east wall), the tally wall: every
  household's share in chalk.
- **Lighting.** Low-key. Exposure opens one stop on entry. Hairlines of sun leak round
  three shutters high on the west wall. One lantern gutters on the south end of the table
  (flame, baked, radius 3.5 m). Shadows warm brown-black. The front doors (east wall, at
  z −28) are barred from the inside with benches. After `daylight`: up to three blades of
  sun, each a pair of crossed additive cards landing on an additive sun patch; the hall
  stays low-key because the blades are narrow (each patch at most 2.5 x 1.5 m).
- **Traversal.** Flat. The table splits the hall into two 5.4 m lanes joined at both ends
  (a loop).
- **Taught.** Four days ago the water came up the wrong colour. They hooded themselves as a
  courtesy and sat down to bide. The Dowser sat with them, and did not set them on anyone.
  He is now one day ahead.
- **Contents.**
  - South end: `ia_ammo_box` on the south wall west of the door; the lantern.
  - South-east corner (**stop two**): the hearth, a chimney breast on the east wall at
    z −20..−16.6, holding the town's own ash, four days cold (dressing; nobody narrates
    it). On the hearthstone: **his cup**, the dregs dried to a ring (`nar_tally_hearth`),
    `rd_note_hearth`, `pk_rounds_12`, `pk_canteen`. In front of it, pulled out to face the
    seated: the head chair, a folding camp chair that is not one of theirs
    (−85.5, 0, −20; `nar_tally_chair`, `nar_tally_chair_2`).
  - North head of the table: `rd_ledger`.
  - North-west corner: the hatch, a 4 x 2 m two-leaf rectangular Pellam floor hatch
    (x −93..−89, z −34..−32) with its latch block and `knot_hatch_latch` in a cowl at its
    north-west corner, facing north (zone geometry; `design/layout.json` `ty_latch_cowl_*`);
    the table's north leaf has been dragged aside against the north wall to clear it. The
    **day-cell**, a pale disc hung on a drop-arm from the tie-beam above the hatch
    (−92.5, 3.27, −32.8), facing the north window. The **share cloth**, hung from a viga by
    one cord between that window and the day-cell (cord at −94.2, 4.72, −34.5).
- **Secrets.** None (the optional shutters are the reward here).

### 9.5 `the_gallery` (underground)

- **Purpose.** The solitary scare; introduce the line round in safety, test it, pay it off.
- **Dimensions.** Peg stair: 2 m wide, 12 m down in three flights with two landings
  (compression; collides as 33.7° ramps): the first flight runs east under the hall floor,
  the second and third south. Proving bay 10 x 8 x 5 m at the stair foot. Gallery
  62 x 7 x 5 m with a 3 m walkway between pipe banks, tagged `lane`: 22 m west of the
  baffle door (the puzzle), 40 m east of it (the File).
- **Landmark.** The proving range: three ceramic test plates hung in a row, the cast plate
  of the banded charge, the line locker. And the sighting loop: a ceramic ring on a post.
- **Lighting.** Cold and regular. Aqua strips receding to a point; one in eight flickers.
  Deep blue ambient. A hairline of violet under the baffle door: the first violet
  underground. On the stair: aqua strips woken by `daylight`, one per flight.
- **Peg stair dressing.** Both walls carry rows of pegs with coats, hats and paired boots
  beneath (instanced props, vertex-shader sway from the shaft's draught). About one peg in
  five is empty. **The low row of pegs, at child height, is bare** (`nar_pegs_2`). One coat
  hangs dead still. On the second landing, in a niche, a Bider sits apart from the rest: it turns
  its hood to follow the player (one skinned instance in `sit_breathe` with a head-yaw
  clamp of ±60°), does nothing else, has no hit volume, and counts toward nothing.
- **Taught.** A line round goes through everything and frees whatever it meets. Standing
  in the right place is aiming. The kept round is Pellam stock.
- **Contents.** `rd_plate_line`, `rd_plate_proving`, `ia_line_locker_bay`, three range
  plates (`pierce`), `ia_ammo_box`, `pk_canteen`.
- **Secrets.** None.

### 9.6 `lift_hall` (underground machine hall)

- **Purpose.** The Tamper. The mark explained. The ride down.
- **Dimensions.** 38 x 28 x 12 m, 45 m long with the cage bay; the far wall dissolves into
  fog behind a receding row of lamps. Entry gantry (a 5 x 10 m deck) 3 m up on the west
  wall with a 3 m wide ramp down (26.6°, a 6 m run). Ten ribs 1.6 x 2.4 m in two rows of
  five, the rows 8 m apart. Lift cage bay at the east end inside a ceramic ring 9 m across
  (cage size is the layout's).
- **Landmark.** The ring: a portal built for loads, not people. On the wall beside it, 4 m
  tall, the lift-head diagram: six in a ring, one hung apart.
- **Lighting.** Aqua rows, satin floor with a smeared streak under each lamp. The only
  violet is the Tamper's band and vents. The only warm light is the gun.
- **Traversal.** Ramp from the gantry. Flat floor. Two loops round the rib rows.
- **Taught.** Plate turns a round and the tracer skips; the vent takes it. A charge that
  meets a rib ends in a stun with the back vent open. A line round goes through the plate,
  takes half of it, and through the knot throws both vents open. The mark is a diagram.
- **Contents.** `pk_rounds_12` and `pk_canteen` on the gantry; `ia_line_locker_hall` at
  the ramp foot; after the fight, `pk_rounds_12` and `pk_canteen` at the cage; the wall
  diagram trigger; `ia_lift_lever`.
- **Secret `sec_cold_bay`.** A maintenance bay on the south wall behind a shutter whose
  latch carries a knot, visible only from behind the third rib. Inside: a second Tamper,
  switched off, perfectly clean, band aqua. `ia_line_locker_secret`, `pk_rounds_12`,
  `rd_plate_service`.
- **The ride.** 25 s in a dark shaft. Lamps pass upward at a slowing rate. `stn_lift_1..3`.
  Both lift rides are **teleports inside a dark ride**: the cage does not move in world
  space, the departure and arrival cages are separate places in the layout
  (`nav.portals`), and they must be the same size and shape as each other so the player's
  offset in the cage carries over (blockout owner).
  The underground set swaps nothing here (the bore is in the same resident set); the ride
  is a rest, not a load. The other ride, the proving lift out of the bore, **is** the load
  (underground to coda): it lasts at least 12 s (`ia_proving_lift.params.ride.seconds`) and
  until the coda set is built, with `nar_lift_up` in the dark.

### 9.7 `the_bore` (underground: catwalk, antechamber, chamber)

- **Purpose.** Show the arena before it is one. The Asking. The boss. The seventh.
- **Dimensions.** Arrival catwalk 18 m long, 8 m above the chamber floor, enclosed in
  grille (shots clank and skip); it crosses the chamber's north side over the door bay. A
  stair down (ramp collision) to the antechamber, 10 x 14 x 5 m, which lies north of the
  chamber. The bore door, 3 m across, in the antechamber's south wall. The chamber, 30 m
  across x 14 m (section 8).
- **Landmark.** The Windlass over the violet bore, seen first from above through the
  grille: it turns its face to follow her, shutters shut. `nar_windlass_seen`.
- **Lighting.** Catwalk: violet from below, the first room the wrong colour fills.
  Antechamber: the Dowser's embers, still orange: the first warm light below ground, and it
  is his. Chamber: violet rising from the bore until the seventh; then aqua, bottom up.
- **Taught.** See sections 8 and 13.4.
- **Contents (antechamber).** Stop three, the only fire he leaves: embers, the kettle still warm,
  `pk_rounds_12`, `pk_canteen` x2, `ia_ammo_box`. The **cradle** (`ia_cradle`): a wall niche
  cast for one banded round, lit, empty, clean in a dusty room, on the door wall to the
  right of the door as faced; beneath it `rd_note_cradle`; above it the six-and-one mark
  with the seventh disc's lamp dark. The station "4" plate and the wall diagram are on the
  same wall to the left of the door. The bore door with eight numbered ports.
  **`nar_cradle` then `nar_cradle_2` are critical-path lines:** they play when the cradle
  is looked at within 4 m for 0.5 s, or, if that has not happened, when question 3 of the
  Asking is put (the question lights the cradle). Either way nobody enters the chamber
  without hearing that he took the charge out and carried it off.
- **Secrets.** None.

### 9.8 `far_rim` (exterior coda)

- **Purpose.** The last image and the hook.
- **Dimensions.** A ledge 30 x 20 m above the overhang where the stage began. The lift
  cage opens in a black rock frame: the opening shot's composition.
- **Lighting.** Blue hour (palette C), separately baked. No sun. An ember band on the
  horizon. Fog close and blue.
- **In frame.** North-west and below: Plenty as a silhouette card with flame-lit windows
  (`lamps` of them) and a 2 px thread of aqua standing dead plumb out of it (sky shader).
  Ahead, north: the Rule, violet, leaning **two degrees** now, visibly further than in the
  opening. On the ledge's edge, a flat stone: six spent banded cases in a row, mouth up, a
  seventh round unfired with a faintly violet band (`ia_stone_round`), and `rd_note_stone`
  weighted under the first case. Out on the plain along the pylon line: nothing, until the
  decision; then one small orange fire (an emissive sprite never under 4 px, flickering).
- **Traversal.** 17 m from the cage to the stone, which lies to the left (west) of the
  view the cage opens on. It must be found without a marker: the six case mouths carry the
  only brass glint on the ledge (a `star4` sprite every 2.5 s, like a pickup), and
  `nar_lamps` and `nar_lamps_count` are fired from the north-west part of the ledge so the
  town view and the stone share a frame.
- **End trigger.** The ending is armed **only by the stone**: on taking the round, or once
  she has been **40 quiet seconds away from the stone (more than 4 m) after its last line**; the clock stands still
  while any line is on screen and coming back starts it again (lead ruling R5, polish round 5: `ending.ts`
  `LEAVE_MIN` 40 is the floor over the marker's `endAfterSeconds` 25, which the frozen layout still quotes). On the
  take, `nar_take_1` is on screen on the take's tick over whatever is there, `nar_take_2` follows, none of the stone's
  four lines is said after it, and the lamps' two lines, if unsaid, follow with her view eased up to the plain and the town. The note is read before the round can be taken: the first `E` at the stone
  opens `rd_note_stone`, the second takes the round. The fire kindles **in her view** (the
  view is eased to it over 1.5 s, standing 0.15 of the angle off the fire toward the town so the lit windows are in frame and the fire is clear of the end card's panel; with reduce-motion it
  waits up to 20 s for her to look) and the wind and the end card come only after it has
  been in view for 2 s; no line plays behind the card. **Walking
  to the north edge does not end the stage** unless `trg_stone` has already fired; before
  that the edge is just a view. Fail-safes: 60 s after `cp_rim` without `trg_stone`, the
  glint doubles in size and rate and `nar_stone_1` plays as a pointer; at 150 s the ending
  proceeds down the "leave" branch from wherever she stands. Then: the fire kindles, the
  last lines play, 4 s of wind, the end card.

### 9.9 Per-zone budgets (design estimates of each zone's **own** content; not test limits)

These rows were written zone by zone and do not include neighbouring zones that stay drawn
(the street seen from the lip, the lip seen from the street, the gallery through an open
door) or the backdrop. They size the art; they are **not** what a frame is measured
against. The limits a frame must meet are the caps in `CLAUDE.md` and the per-view numbers
`docs/ARCHITECTURE.md` computes with neighbours included; acceptance test 11 points there.

| Zone | Draw calls, typical / worst | Triangles in view | Baked light | Resident set |
|---|---|---|---|---|
| the_lip | 40 / 55 | 45k | vertex colour on rock; `lm_surface` 2048 shared with the street | surface |
| plenty_street | 70 / 95 (fight 2) | 95k | `lm_surface`; props vertex colour | surface |
| tally_house | 50 / 65 | 40k | `lm_tally` 1024 | surface |
| the_gallery | 45 / 60 | 50k (modules instanced) | `lm_gallery` 1024 | underground |
| lift_hall | 50 / 70 | 60k | `lm_hall` 1024 | underground |
| the_bore | 60 / 95 (phase 2 with effects) | 70k | `lm_bore` 1024, six-fold symmetric (bake one 60° sector; instance) | underground |
| far_rim | 25 / 35 | 25k | `lm_rim` 512 | coda |

Texture memory per resident set (uncompressed RGBA with mips): surface about 27 MB plus
shared atlases (4 MB); underground about 17 MB plus atlases; coda about 1.5 MB. **Surface
and underground are never resident together:** the swap happens on the peg stair after the
hatch closes; underground to coda on the proving lift. Vertex-colour baking is the default;
lightmap texels go only to surfaces the player gets within 10 m of.

---

## 10. Encounters

Rules for all: spawn points are diegetic and at least 12 m from the player; emergence takes
0.8–1.5 s and is shootable; the exit is visible but shut and opens with a cue on the last
enemy; the last enemy gets the slow-motion beat; a wave triggers when the previous wave is
down to one alive, or after its timeout, unless its row gives another rule. **Clear** means:
every enemy the encounter has spawned is down, and no wave is still to come. A wave whose
row says "cancelled" under some condition is then never spawned and does not hold the
encounter open. A dormant member that is damaged before the trigger starts the encounter
(sections 7.2, 7.3).

### `plenty_street`

| Id | Trigger | Composition | Spawn pattern | Arena notes | Intended tactic |
|---|---|---|---|---|---|
| `enc_street` | passing the jug gate posts | 8 `bider`; max alive 5 (polish round 3, ruling R3: seven spread along the street, three at a time, cost a plain player nothing) | **A:** the kneeler at the trough, 43 m west; finishes its scoop, sets the cup down (3 s), comes. **B** (A down, or 3 s after A is hit, or 8 s after A rises): **4**, two out of each of the two alley mouths nearest the gate (north at x −14.5, south at x −21.5: beside and behind where she stands when the kneeler falls, 8 to 15 m from her; polish round 4, ruling R3: from the alleys beside the kneeler they came one by one down 30 m of street and cost nobody anything). **C** (B down to 2, or 2 s after B; polish round 4, it was down to 1 or 6 s): 2 through the doorway of the saddlery (south side, west end), in file down the street centre (tagged `lane`), 1.6 m apart. Two seconds of nothing. **D:** the yard gate bursts outward and the eighth comes through it | cover about every 9 m; exposed last 25 m | three calm shots on A; split attention on B; leader first on C so two stumble; reload before D, which nobody does the first time |
| `enc_yard` | bursting `knot_yard_latch` | 3 `transit`, 4 `bider`; max alive 4 | **Vignette:** T1 emerges from the drum door, ignores her, plants, sights the yard bell and stakes it (the full tell, shown on something else, 4 s), then turns. **A:** T1 alone at 20 m. **B** (T1 dead, or 14 s): T2 emerges and climbs to the catwalk point; T3 emerges from the tank shed to the far wall point; +2 s, 2 `bider` `climb_out` of the drum-base grate while the Transits are still planting; +10 s (and at most 3 alive), 2 `bider` from the street-side alley door (polish round 3: 40 s, +6 s, +16 s) | drum, stilts, wall stubs, cart; catwalk is the problem position | break T1's aim, then learn the lens; in B, the Biders flush her from the cover the Transits are punishing; shoot the catwalk Transit first |

### `tally_house`

| Id | Trigger | Composition | Spawn pattern | Arena notes | Intended tactic |
|---|---|---|---|---|---|
| `enc_tally` | bursting `knot_hatch_latch` | 2 `bider` | the latch lets go and the hatch leaves part 0.3 m and **stop, ajar** (too narrow to pass; aqua comes up through the gap); chairs scrape (`cap_chairs`) 0.8 s before movement; the two seated nearest the **south** end, on opposite sides of the table, `rise_from_seat`. **The hatch opens fully, with its cue, when the second is down**: nobody goes below with the encounter live. The 12 m rule is the blockout's to keep: the knot can be hit only from places at least 12 m from both riser chairs (a cowled knot seat, or other chairs) | 5.4 m lanes either side of the table; dark; the ajar hatch throws aqua up the north end; their eye-slits and crown knots are the only violet | shoot by the flash; the crown knots are visible in the dark, so this is the easiest place in the stage to free two |

### `the_gallery`

| Id | Trigger | Composition | Spawn pattern | Arena notes | Intended tactic |
|---|---|---|---|---|---|
| `enc_file` | `proving_line` solved | 12 `bider` (6 + 2 + 4); max alive 6 | **A:** the baffle grinds open over 3 s on six Biders standing in a queue 40 m away at the far door, facing away (`queue_stand`); `turn_about` 1.5 s; they run in file, 1.6 m apart. **R, the rear pair** (polish round 5, lead rulings R3 and R10: three rounds of numbers had left the file costing nothing): once the file is down to one, when she comes within 16 m of `door_gallery_far` (or 25 s after the file was down to one; with the file standing nobody comes), two Biders start down flight 3 of the peg stair, out of sight behind the bay wall 60 m behind her, and run through the bay and down the gallery after her; `nar_file_behind` names them on that tick. **B, the door** (an ambush since polish round 4; four and on the rear pair's clock since round 5): 4 s after the rear pair start, a bang on the far door and `nar_file_more`, and 1 s later (it was 2) `door_gallery_far` bursts open on 4 gathered behind it (the fourth comes through as soon as the stage's cap of six alive allows: the dormant Tamper counts). **They do not file:** lane-following is off for both waves; the door's four hold lateral offsets across the walkway (−1.0, 0, +1.0, −0.4 m) and are staggered 1.2 m in depth, so no straight line from the walkway takes more than two. The rear pair are about 20 m behind her when the door's four are 8 m in front. The door stays open; the encounter is clear when all twelve are down | a 3 m walkway, 40 m, no cover; the line locker chimes 5 m behind the player with one round when the puzzle is solved | A: one line round, six sit down in order (or six lead rounds, leader first). Then six more on six chambers from two sides: shoot the door's four as they come through, turn for the two behind, or back off down the walkway and take the rear pair first. The line shot is the payoff; what answers it is the fight. Measured (Normal): the plain proxy loses nothing, the careless one 0 to 72 HP; 28 to 37 s |

### `lift_hall`

| Id | Trigger | Composition | Spawn pattern | Arena notes | Intended tactic |
|---|---|---|---|---|---|
| vignette | entering the gantry | 1 `tamper`, 1 `bider` | the Tamper pounds the sealed bulkhead three times (`pound_bulkhead`, state `vignette`, section 7.3), chest vent opening on each wind-up; a Bider `climb_out` of a grate inside the ring of its slam and is knocked flat (felled; not counted against the player). 8 s, skippable by walking on; it goes on pounding until the encounter starts | seen from 3 m up, 16 m away | watch the vent |
| `enc_matador` | stepping off the ramp, or damaging the Tamper from the gantry (section 7.3 `vignette`) | 1 `tamper`, up to 4 `bider`; max alive 3 | **Waves run on the clock only, never on the Tamper's health.** **A:** Tamper alone, t = 0. **B:** t = 15 s: 2 `bider` `climb_out` of the two floor grates at the east end. **C:** t = 35 s (20 s after B): 2 more from the other two grates (polish round 3: 40 s and 65 s never came: the fight was over). **If the Tamper is dead when a wave's time comes, that wave is cancelled.** On the Tamper's death every Bider alive falters 2 s. **Clear:** the Tamper is dead and every Bider already spawned is down | ten ribs; two loops; no cover stops a slam but ribs block it | nerve, footwork or the line (which is half the Tamper and a three-second opening, not a kill); free the Biders while it is stunned. A fast, clean kill inside 15 s meets no Biders: that is the reward for nerve, and it takes the line round and five vent shots at arm's length. Measured with the plain proxy on Normal (polish round 3): about 40 s with the line round, 70 HP lost |

### `the_bore`

| Id | Trigger | Composition | Spawn pattern | Arena notes | Intended tactic |
|---|---|---|---|---|---|
| `enc_windlass` | `the_asking` solved and the door crossed | `windlass` + `bider` adds (phase 2: 6; phase 3a: up to 9); max alive boss + 3 | adds `climb_out` of three kerb grates, never the one nearest the player | section 8 | section 8 |

Totals: up to 26 Biders outside the boss room (7 street, 4 yard, 2 tally, 9 file, up to 4
hall), up to 15 inside; 3 Transits; 1 Tamper; 1 boss. About 85 "bullets of enemy health"
plus 20 puzzle shots. The lamp count (`9 + freed`) is clamped at 48 as before.

---

## 11. Set pieces and how each is staged cheaply

| # | Moment | Staging |
|---|---|---|
| 1 | **The doorway shot.** Black overhang, blazing valley, the Rule. | Baked contrast; exposure ramp over 20 s in the merged post pass; the Rule is one line in the sky shader at constant 2 px with a halo. |
| 2 | **The kneeler.** A hooded figure scoops sand at a dry trough, sets the cup down, comes. | One vignette clip pair; the cup is a breakable prop. |
| 3 | **The one who sat down.** The first crown-knot shot. | One clip, one burst sprite, one tone; then an instanced static mesh. |
| 4 | **The Dowser on the rim.** | One billboard, one glint sprite, one dust-puff. |
| 5 | **Daylight.** Each shot throws a blade of sun onto a piece of the story. | Per shutter: two crossed additive cards, one additive sun patch quad, a shutter drop animation (rigid). No relight. Stretch (not round 1): a per-shutter additive lightmap layer. |
| 6 | **The table by gun-light.** | The muzzle pulse in the world shader is the only dynamic light. Eleven figures are one instanced static pose; two are swapped to skinned at the trigger. |
| 7 | **The stair of pegs and the one that watches.** | Instanced coats with vertex-shader sway; one skinned instance with a head-yaw clamp. Aqua strips switched on by `daylight`. |
| 8 | **One bullet, six sit down.** | Raycast-all; 40 ms staggered reactions; one line quad. |
| 9 | **Standing in front of the Tamper.** | Line round, `pierce` on plate, a flat 300, and `line_stagger` (1.8 s): the `stagger` clip stretched with both vent bones held open by code. No new clip. |
| 10 | **The arena seen from above.** | The catwalk is inside the bore bake; the grille is a `pierce`-less collider that skips shots. |
| 11 | **The machine that answers if you ask.** | A timed subtitle sequence and six shutter animations. |
| 12 | **The seventh.** The line, the ring racing over every surface, violet dying, four seconds of true silence. | One vertical quad; one radial shader term shared with the muzzle pulse; a uniform that lerps the wrong colour to grey and the bands to aqua; stopping an oscillator. |
| 13 | **The dry click.** A five-metre cylinder dry-firing at her. | The player's own dry-fire sound, pitched down an octave, with the shutter clip and no projectile. |
| 14 | **Lamps in Plenty.** | A silhouette card with 48 unlit window quads; `lamps` of them switched to flame emissive in a fixed authored order. |
| 15 | **The stone.** | Seven small props; one interact; one HUD state. |

---

## 12. Onboarding, HUD, menus

### 12.1 Onboarding without pop-up walls

- Control within 10 s. No text wall; `rd_backstory` is in the menu, optional.
- Skill gates: the jug gate proves fire, aim and reload (seven targets, six rounds). The
  yard door proves "violet knot = shoot". The proving range proves the line round.
- Safe vignettes before each archetype (kneeler at 45 m; Transit staking the bell; Tamper
  on the bulkhead). The Bider in the stair niche and the queue show Biders at rest.
- **Lazy key hints.** Each appears only if the player has not done the action within 4 s
  of first needing it, and never again after the first success: `ui_hint_move`,
  `ui_hint_fire`, `ui_hint_reload` (only after two dry clicks), `ui_hint_sprint`,
  `ui_hint_interact`, `ui_hint_line` (at the locker), `ui_prompt_kept` (phase 3a, on a
  mark; at T3 persistently). No others.
- The way forward is always the brightest, most contrasting or only moving thing in frame.

### 12.2 HUD

| Element | Position | Spec |
|---|---|---|
| Crosshair | centre | a dot and four ticks with a dark outline; size, colour and outline configurable. Becomes the plumb glyph while the kept round is chambered |
| **Cylinder ring** | **bottom left, over the health bars** (polish round 5: it stood bottom right, printed across the gun hand; at 1280 x 720 the mark's box is x 14 to 109, y 526 to 676 and nothing of the gauges is in the lower right) | six brass dots in a ring 64 px across at 1080p that turns one notch (60°) per shot over 0.18 s, so the count is read by shape. A chambered line round is an aqua dot. Empty chambers are dark rings. Reserve count as a numeral beneath (`ui_hud_reserve`; 15 mark units, 16 px at 720p) |
| **The seventh** | beside the ring, 20 px apart, lower right of it, joined to the ring's centre by a hairline stroke (the six-and-one mark); drawn at **2 x** the chamber glyph (`SEVENTH_SCALE` 2: 19 x 48 px at 720p; it was 1.5 x, the smallest thing on screen) | a cartridge drawn sealed with a band. Never fills, never empties, cannot be selected, until phase 3a. States (six; the contract's `SeventhState`): `sealed`, `pulse` (phase 3a), `chambered` (the kept round is under the hammer: the slot is drawn empty, section 6.6 rule 3, and the round is the white dot with an aqua ring in the cylinder ring), `band_broken` (returned to the slot by `unload_kept`, 6.6 rule 5), `spent` (an empty outline for the rest of the game), `violet` (after taking the stone's round). **Load-bearing: no UI pass may remove, hide or restyle it into the ring.** |
| Line rounds | under the ring | 0–2 aqua pips |
| Health | bottom left | three segments; the regenerating segment shows a thin fill line |
| Damage arc | around the crosshair | 0.6 s, directional, pale |
| Markers | crosshair | hit, weak point, kill, freed, deflected (section 6.8) |
| Boss | top centre | `ui_boss_name`, 26 pips in groups of 10, 10, 6 |
| Subtitles | bottom centre | speaker label for station and Reeve lines; narrator has none and is set in a serif italic; station lines in wide tracked capitals. At most 2 lines of 42 characters |
| Captions | above subtitles, smaller, bracketed | key sounds (`cap_*`) when captions are on |
| Prompt | lower centre | `ui_prompt_read`, `ui_prompt_take`, `ui_prompt_use`, `ui_prompt_kept` |
| Checkpoint | top left, 2 s | `ui_checkpoint` with the movement numeral and a section number |
| Title cards | centre | numeral and title, 3.5 s, no input lock. Polish round 5: shown **once a run** (not again after a restore) and **gives way to a fight**: on an enemy's telegraph or attack, an encounter or wave starting, a boss phase, damage to her or her own shot a card that is up has 1.0 s on screen in all and fades in 0.3 s; one that arrives within 6 s after such an event is that brief from the start |

No minimap, no objective marker, no compass. The current objective is on the pause screen
only (`obj_*`). Each is set by exactly one event:

| Objective | Set when |
|---|---|
| `obj_lip_camp` | start |
| `obj_lip_gate` | entering the forecourt below the gully |
| `obj_street` | `cp_lip_gate` (the jug gate open) |
| `obj_yard_door` | `enc_street` clear |
| `obj_yard` | `knot_yard_latch` burst (`enc_yard` starts) |
| `obj_tally` | `enc_yard` clear |
| `obj_tally_hatch` | `hatch_powered` |
| `obj_gallery` | `cp_gallery_bay` |
| `obj_file` | `proving_line` solved |
| `obj_hall` | `cp_hall_gantry` |
| `obj_lift` | `enc_matador` clear |
| `obj_ante` | `cp_bore_ante` |
| `obj_boss` | `enc_windlass` starts |
| `obj_boss_unproven` | first tick of phase 3a |
| `obj_boss_dry` | the kept round fired |
| `obj_proving_lift` | the Windlass dead |
| `obj_rim` | `cp_rim` |

### 12.3 Menus

- **Title.** `ui_title`, `ui_subtitle`; `ui_menu_play`, `ui_menu_continue` (if a save
  exists), `ui_menu_story`, `ui_menu_options`, `ui_menu_credits`. Behind it: the overhang
  doorway shot, live. Polish round 5: with a stored save **Go on is the chosen item and names its count**
  ("GO ON  VI · 2"), and Begin over a save asks first (a column "Begin?": Go on, Begin, Back; only that Begin
  starts a new run; Escape and Back return). With no save Begin starts at once.
- **Pause.** `ui_pause_resume`, `ui_pause_options`, `ui_pause_restart_cp`,
  `ui_pause_quit`; the current objective; the cylinder widget enlarged with the seventh
  labelled by state: `ui_seventh_sealed` (also for `pulse`), `ui_seventh_broken` (also for
  `chambered`: the band is broken and the round is in the gun), `ui_seventh_spent`,
  `ui_seventh_violet`. Pause works everywhere, including vignettes and the parley.
- **Readable.** Title, body in cards (a blank line in the body starts a new card),
  `ui_read_next`, `ui_read_close`. The simulation pauses.
- **End card.** `card_end`, then stats (`ui_end_*`): time; rounds fired; accuracy; knots
  burst; lines of three or more; a clean six (yes or no); secrets (n of 2);
  **lamps lit in Plenty** (n); **the Reeve carries** (6, or 7 with `ui_end_carries_his`).
  Never a count of the felled. Then `ui_end_again`, `ui_end_menu`.

### 12.4 The seventh as a system (so nobody tidies it away)

`design/story.json` meta records `load_bearing: ["hud_seventh", "ui_seventh_*",
"rd_plate_proving", "ia_cradle"]`. The ending requires: (a) the seventh visible on the HUD
from the first frame; (b) the plate in the proving bay on the critical path; (c) the empty
cradle beside the Asking door; (d) a distinct key (`F`), distinct from the line round key
(`Q`).

---

## 13. Puzzles

House rules: every element visible from one standing spot; lamps show progress; a wrong
shot does something harmless and audible; `ia_ammo_box` within 10 m; no combat until
solved; the hint timer counts only time inside the puzzle volume without progress, pauses
in combat, and resets on each correct step.

Hint tiers (Normal; Fast is 30 / 60 / 120 / 180; Off suppresses T1–T3 but **T4 always
applies**):

| Tier | At | What |
|---|---|---|
| T0 | always | composition |
| T1 | 60 s | a wordless nudge |
| T2 | 120 s | a line naming the goal |
| T3 | 210 s | a line naming the action, and an outline pulse |
| T4 | 300 s | the puzzle quietly relaxes so that it cannot hold the player |

### 13.1 `seven_jugs` — the_lip (the cylinder as the constraint; attention)

- **Premise.** The town's stock gate is a drop-bar held down by clay jugs of sand and
  hauled up by a well-sweep with a stone on its short end. The Dowser has hung the jugs.
- **Rules.** Six jugs hang in a row on the gate bar, 8–12 m from the approach. Each one
  shot bursts and pours sand; the sweep creaks up one notch; the gate rises 0.2 m; a note
  sounds (scale degrees 1–6, ascending). After six the gate stands 1.2 m open: not enough,
  and there is no crouch. The seventh jug hangs 7 m up on the dead pylon's stub arm, above
  and left of the gate, already leaking a thread of sand that catches the sun. It sounds
  the seventh degree: the scale is left unresolved.
- **State.** `jugs_broken` 0–7; `gate_height` = 0.2 x min(jugs, 6), then 2.6 m at 7. The
  six jugs hang from the bar and rise with it: each jug's hit sphere follows its hook, not
  its marker.
- **Solution.** Six, reload, look up, the seventh. Any order works.
- **Teaching.** Fire-and-reload skill gate, and the first statement of the motif.
  `nar_jugs_sand` on the first jug; `nar_jugs_open` when the gate rises.
- **Hints.** T0 the falling sand thread is the only moving thing in frame. T1 the pylon arm
  creaks and the thread glints. T2 `hint_jugs_2`. T3 `hint_jugs_3` and an outline pulse.
  T4 the seventh jug's hit radius doubles; at 360 s its rope gives and it falls on its own
  (`hint_jugs_4`).
- **Fail-safes.** `ia_ammo_box` at 6 m. Jugs cannot be missed permanently. No enemies.

### 13.2 `daylight` — tally_house (environmental logic, three steps; from Pitch A)

Geometry is the blockout's (`design/layout.json` `shutter_*`, `ia_latch_*`, `day_cell`,
`ia_cloth_cord`, `ia_hatch`; `docs/LEVEL.md` section 3). The sun is the true sun (azimuth
315°, elevation 14°): light travels (0.686, −0.242, 0.686), so a blade drops 0.353 m and
drifts 1 m south for every metre it travels east. Nothing in this section may be moved
without recomputing the blades in the generator.

- **Premise.** Pellam headworks wake to daylight. When the light began to hurt the town's
  eyes they shuttered the hall and barred the doors. The hatch to the works has no power.
- **Elements.**
  - Three shutters high on the **west wall** (`shutter_s`, `shutter_m`, `shutter_n`):
    openings 1.2 m wide x 0.9 m high, from 4.05 to 4.95 m up, at z −24, −30.5 and −36.3.
  - Three latches (`ia_latch_s/m/n`): one white ceramic insulator each, **3.5 m up,
    directly beneath its window** (1.0 m below the opening's centre), on the end of a
    pull-rod that runs up to the shutter. The brightest small things in the room. A
    hairline of sun already leaks round each shutter and points at its landing spot.
  - The **day-cell**: a pale disc 0.6 m across hung on a drop-arm from the tie-beam above
    the hatch, at (−92.5, 3.27, −32.8), tilted to face the north window. Its cable runs
    along the beam and down the west wall; where it comes down, at eye height, is the
    **pictogram plate** (sun, arrow, disc, open hatch).
  - The **share cloth**: the town's banner of family marks, hung from a viga by one cord
    (`ia_cloth_cord` at −94.2, 4.72, −34.5) square across the north blade, 1.8 m in from
    its window.
  - The hatch (north-west of the table head) and its latch block.
- **Rules.** Shoot a latch: the rod drops, the shutter falls open outward with a bang and a
  blade of gold light crosses the hall and lands.
  - `shutter_s` lands on the **tally wall**, on the south wall just east of the door she
    came in by (a 1.2 x 0.9 m patch at −87, 1.33, −15): shares in chalk, four days of them
    in a shaking hand written exactly where the light falls, then none. `nar_tally_wall`.
  - `shutter_m` crosses the whole hall over the heads of the seated (it grazes one hood)
    and lands on the **head chair** and then the **hearthstone** in the south-east corner:
    a chair that is not one of theirs, pulled out to face the seated; his cup, dry; his
    note. `nar_tally_chair`, `nar_tally_chair_2`, `nar_tally_hearth`.
  - `shutter_n` is aimed at the day-cell, 3.5 m in, but lands on the share cloth.
    `nar_tally_cloth`. Shoot the cloth's cord: it falls; the blade reaches the day-cell.
- **The story blades land behind her, by design.** The hatch, the day-cell and the ledger
  pull the player north up the hall; the two story blades land in the south-east corner,
  beside the door she entered by. This is staged, not hidden:
  1. *The latches are met in story order.* Walking north along either lane she passes
     below S, then M, then N. A player who shoots the first white insulator she sees opens
     the tally wall first.
  2. *Each drop turns her round.* The bang is behind and to the left; the blade is the only
     moving light in the room and it crosses overhead pointing back the way she came. The
     blade's cards are drawn the full length of its path, so from anywhere in the hall it
     reads as a pointer to where it lands.
  3. *The line waits for the look.* Each blade's narration starts when its landing patch
     comes within 30° of the crosshair, or 4 s after the drop, whichever is first. The
     narrator does not describe a wall she has her back to for longer than that.
  4. *Nothing she needs is back there.* The tally wall, the chair and the cup are carried
     by narration and read at 10 m. What rewards the walk back is on the hearthstone:
     `rd_note_hearth`, `pk_rounds_12` (his tin) and `pk_canteen`, glinting in the middle
     blade.
  5. *The walk back is the other lane.* Up one side of the table, back down the other: the
     hall is walked as a loop, past eleven seated figures twice, which is the point of the
     room.
- **State.** `shutter_open[s,m,n]`, `cloth_down`, `cell_lit` = `shutter_open[n]` and
  `cloth_down`, `hatch_powered` = `cell_lit`.
- **Solution.** Latch N, then the cord. Two shots minimum, four if the player opens
  everything, which they should: the other two shutters are the story. On `cell_lit`: a
  rising chime, `stn_tally_wake_1`, `stn_tally_wake_2`; aqua strips run from the day-cell
  along the beam, down the wall and across the floor to the hatch; the hatch latch is lit,
  and on it `knot_hatch_latch`. Shooting the knot is step three: the latch lets go, the
  hatch parts 0.3 m and stops ajar with aqua coming up through it, and `enc_tally` starts.
  The hatch opens fully when the encounter is clear (section 10).
- **"Wrong" shutters are never wrong.** They do something beautiful and informative.
- **Teaching.** The leaking hairlines; the latches; the pictogram; the yard door has
  already taught the knot.
- **Hints.** T1 the unbroken north latch glints and dust thickens in its hairline toward
  the cloth and the day-cell. T2 `hint_daylight_2`. T3 `hint_daylight_3` and an outline
  pulse on the next target. T4 the north shutter's latch gives on its own and the cloth's
  cord frays through 10 s later (`hint_daylight_4`).
- **Fail-safes.** Nothing can be put into an unsolvable state. `ia_ammo_box` at the door.
  **The muzzle-flash fight must work with Reduce Flashes and on Low:** the hatch throws
  baked-in aqua up the north end (switched on with `hatch_powered`), the lantern gutters
  at the south end, and Bider eye-slits and crown knots are emissive.

### 13.3 `proving_line` — the_gallery (alignment; the line round)

- **Premise.** The baffle door is held by three knots that heal each other.
- **Elements.** `knot_a` on a pipe elbow, low left, 8 m from the mark. `knot_b` on a valve
  bonnet, mid-height, 15 m. `knot_c` on a ceiling conduit, high right, 22 m. Because the
  line rises from eye height, "low, mid, high" are 2.7, 3.4 and 4.2 m above the floor. The
  three lie on one straight line; that line, extended back, passes through eye height
  (1.65 m plus the step) above the **brass mark**: a disc set in a raised step (1.6 x 1.6 m,
  0.15 m high, so the player is on it or off it) under the one steady lamp. Two metres in
  front of the mark, a **sighting loop**: a ceramic ring 0.5 m across on a post, **its
  centre 2.02 m above the bay floor** (0.22 m above the eye of a player on the step, on the
  true line: `pz_sighting_loop`), through which, from the mark, the three knots sit nested
  one inside the other. Three lamps on the door.
- **Rules.** A lead round bursts one knot; its lamp lights; it regrows in 3.0 s with a
  descending tone and its lamp gutters out. A line round bursts every knot on its line.
  When all three are burst within 0.5 s of each other they do not regrow.
- **Assist (so this is never a positioning pixel hunt).** If the player is on the step and
  fires a line round whose ray passes within 0.6 m of `knot_a`, the ray is snapped to the
  authored true line (the snap is at most 3°). **Who implements it:** the world system, in
  `knot_a`'s hit receiver: while `on_step` is true `knot_a` answers line rounds with an
  enlarged hit volume (radius 0.6 m), and the three knots burst as one line. The player's
  shot code knows nothing about puzzle state and there is no contract for it, so the drawn
  tracer may differ from the true line by up to 3°. Standing anywhere on the step works. On the
  step, a soft chime and the loop's rim lighting aqua confirm "you are standing right" at
  tier 0. This must hold at FOV 50 and 80.
- **State.** `knot_burst[a,b,c]` with timers; `on_step`; `solved`.
- **Solution.** Stand on the step, `Q`, fire through the loop.
- **Teaching.** The three-plate range beside the locker shows piercing first (`pierce`
  plates ring in sequence), with `rd_plate_line`'s pictogram of three discs, one line, one
  eye. Shooting the knots one at a time shows why one line is needed. `nar_line_first` on
  the first line round fired.
- **Hints.** T1 the knots pulse near to far, and the loop's rim glints. T2 `hint_line_2`.
  T3 `hint_line_3` and an outline pulse on the step. T4 the snap widens to 10°: any line
  round fired from the step toward the door solves it.
- **Fail-safes.** `ia_line_locker_bay` dispenses whenever the player holds none and the
  door is shut. `ia_ammo_box` in the bay.

### 13.4 `the_asking` — the_bore antechamber (observation and restraint)

- **Premise.** The bore door is a ceramic disc 3 m across with eight numbered ports in a
  ring, like the face of a cylinder with two chambers too many, and an outer ring of twelve
  small **listening lamps**. The station asks three questions in tones and subtitles.
- **Rules.** A question is asked; the player answers by shooting a numbered port. A wrong
  port: a flat tone, `stn_ask_wrong`, and the question's subject lamp flashes (the station
  number plate, the wall diagram, the cradle). **The listening ring is dark through
  questions 1 and 2** (an unanswered question is simply asked again after 20 s). It comes
  alive for the first time on question 3, as a new thing answering a new kind of question:
  when the `stn_ask_3` subtitle has finished, the lamps **fill clockwise one every 0.75 s
  (9 s for the ring), each with a soft rising tick (`cap_listening`), and the cradle's
  lamp steps brighter with each tick**, so the ring is visibly counting something and the
  cradle is visibly what it is counting. It fills **only while the player is inside the
  puzzle volume** (the antechamber within 8 m of the door); outside it the ring holds. **Any
  shot, anywhere, empties it at once** with a falling tone; a shot into a port also gives
  `stn_ask_wrong`. The ring then starts again from nothing.
  1. `stn_ask_1`. The answer is on every placard since the yard, and on the plate beside
     this door: **4**.
  2. `stn_ask_2`. The wall diagram beside the door (and in the lift hall): **6**.
  3. `stn_ask_3`. The cradle is beside the door, lit, empty. There is no port for none.
- **State.** `question` 1–3; `listen` 0–12; `wrong_count`.
- **Solution.** Shoot 4. Shoot 6. Then do not shoot: stay by the door and let the ring
  fill (about 12 s from the question being put: 3 s of subtitle and 9 s of ring).
  `stn_ask_done` (which says it in words: the cradle holds none, noted). The door opens.
- **Why this is earned and not an accident.** The answer is still restraint, and a player
  who simply waits still gets through: that is the fail-safe. But the wait is now long
  enough to watch, and it is watched: twelve lamps going round with a tick each and the
  cradle brightening in step is a mechanism visibly listening. A player who tries a port
  sees and hears the whole ring fall and start again and has learned the rule in one shot.
  The station then confirms in words what was done.
- **Teaching.** The first two answers reward the attention the signage has asked for. The
  third teaches the one verb not yet used, holding fire, half a minute before the boss
  rewards exactly that. It also makes the player look at the empty cradle.
- **Hints.** T0 on question 3 the listening ring visibly and audibly fills while the gun is
  quiet and falls at a shot, and the cradle lamp steps with it. T1 the correct port's lamp
  flutters (questions 1 and 2); on question 3 the hint timer only runs while the player
  keeps emptying the ring, and T1 is the cradle lamp flaring at each reset. T2
  `hint_ask_2`. T3 `hint_ask_3` (question 3) or `hint_ask_3_num` (questions 1 and 2). T4
  not needed: question 3 solves itself in 9 s of held fire; on questions 1 and 2, after
  three wrong shots the wrong ports go dark.
- **Fail-safes.** A stuck player who stops shooting to think has answered question 3. The
  word "plumb" does not appear in any question; the special ammunition is called the line
  round everywhere; the question is about the cradle the player is looking at.

---

## 14. Interactables and pickups

| Id | Type | Behaviour |
|---|---|---|
| `pk_rounds_6` | pickup | +6 reserve (cap 36). Walk over. A paper packet. Seat-click sound |
| `pk_rounds_12` | pickup | +12 reserve. A cartridge tin. At his three stops it is the Dowser's |
| `pk_canteen` | pickup | restores the current health segment to full and the next one too if the current is already full. Walk over; ignored at 100 HP |
| `ia_ammo_box` | refill | `E`: tops reserve to 18 (boss room: +18, 10 s cooldown). A Pellam dispenser with a tin cup hung on it |
| `ia_line_locker_bay`, `_hall`, `_secret`, `_bore` | locker | `E`: +1 line round (cap 2). Rules in 6.4. Chimes when stocked |
| `ia_jug_1`..`ia_jug_7` | shootable | `seven_jugs` |
| `knot_yard_latch` | shootable knot | opens `ia_yard_door`, starts `enc_yard`. T2 at 60 s: `hint_yard_knot` |
| `ia_yard_bell` | shootable | rings. The Transit stakes it in the vignette |
| `ia_latch_s`, `ia_latch_m`, `ia_latch_n` | shootable | `daylight` shutters; each is 3.5 m up, 1.0 m below its window's centre |
| `ia_cloth_cord` | shootable | drops the share cloth |
| `knot_hatch_latch` | shootable knot | lit by `hatch_powered`; releases the hatch to **ajar** (0.3 m, impassable) and starts `enc_tally` |
| `ia_hatch` | door, 4 x 2 m, two leaves | ajar on its knot; **opens fully when `enc_tally` is clear**; closes behind the player on the stair (resident-set swap) |
| `ia_range_plate_1..3` | shootable, `pierce` | ring in sequence |
| `knot_a`, `knot_b`, `knot_c` | shootable knots | `proving_line` |
| `ia_baffle` | door | opens on `proving_line` |
| `knot_cold_bay` | shootable knot | opens the secret bay |
| `ia_lift_lever` | `E` | available when `enc_matador` is clear; starts the ride |
| `ia_ask_port_1..8` | shootable | `the_asking` |
| `ia_cradle` | look target | `nar_cradle`, `nar_cradle_2` when looked at within 4 m for 0.5 s, or when `stn_ask_3` is put, whichever is first |
| `ia_proving_mark_1..6` | floor trigger | lit and live from the first tick of phase 3a: `F` loads the kept round |
| `ia_proving_lift` | `E` | available after the boss; the ride to the rim |
| `ia_stone_round` | `E` | take the violet-banded round; the stone (`trg_stone`) is the only thing that arms the ending |
| `sec_loft_bell_rope` | shootable | secret 1 |
| Readables | `E` | `rd_note_lip`, `rd_rain_tally`, `rd_ledger`, `rd_note_hearth`, `rd_plate_line`, `rd_plate_proving`, `rd_plate_service`, `rd_note_cradle`, `rd_note_stone` |
| Breakables | shootable | bottles, lanterns, cups, insulators: break, ring, count for the ammo floor |

Fixed placements: lip (tin at stop one, packet on the ledge, box at the gate); street
(two packets, canteen, tin by the water cart inside the yard, canteen at the cart, secret tin); tally (box,
tin at stop two, canteen); gallery (box, canteen, locker); hall (tin and canteen on the
gantry, locker, tin and canteen at the cage, secret tin and locker); antechamber (tin, two
canteens, box); chamber (two boxes, locker).

---

## 15. Options, accessibility, difficulty

| Option | Range | Default |
|---|---|---|
| Mouse sensitivity | x0.2–x4, live | x1 |
| Invert Y | on / off | off |
| Field of view | 50–80 vertical, shown as 16:9 horizontal (79–112) | 62 |
| Head bob | 0–150 % | 100 % |
| Screen shake | 0–100 % | 100 % |
| Reduce motion | bob 0, shake 0, no FOV kicks, no slow-motion, no strafe roll, no hush time-scale | off |
| Reduce flashes | muzzle light halved, flash sprite 60 % size, no additive screen effects, the ring at the seventh becomes a slow tint, boss lamp flashing becomes a ramp, hit flashes become outlines | off |
| Subtitles | on / off; size S / M / L / XL (M is 2.6 % of screen height); background 0–100 % | on, M, 60 % |
| Captions for sounds | on / off | on |
| Difficulty | Easy / Normal / Hard, changeable mid-game | Normal |
| Sprint | hold / toggle | hold |
| Fire | click per shot / hold to repeat at cadence | click |
| Key bindings | every action rebindable; arrows mirror WASD | — |
| Crosshair | size, colour, outline | small, white, outlined |
| Puzzle hints | Off / Normal / Fast | Normal |
| Graphics | Auto / Low / High; resolution scale 50–100 % of the tier's drawing-buffer cap (Low 1366 × 768, High 1920 × 1080; ARCHITECTURE 8.2) | Auto |
| Volume | master, effects, music | 80 / 100 / 70 |

Pause works everywhere. Settings apply without a restart. Sensitivity and FOV are on the
first page. Colour is never the only carrier. No more than three flashes in any second
anywhere in the game.

| Difficulty | Damage taken | Attack tokens | Telegraphs | Bider drops | Crown knot radius | Shots to kill |
|---|---|---|---|---|---|---|
| Easy | x0.6 | 1 | +20 % | 40 % | 0.26 m | unchanged |
| Normal | x1.0 | 2 | — | 25 % | 0.22 m | unchanged |
| Hard | x1.4 | 3 | −10 % | 15 % | 0.20 m | unchanged |

Three more rows by difficulty (polish round 4). The Tamper's chest vent opens for the last
1.0 s of the slam wind-up on Easy and for its last 0.6 s on Normal and Hard; the wind-up itself is 1.38 s on Easy,
1.15 s on Normal and 0.9 s on Hard (polish round 5). A Transit rests 1.5 s
between stakes on Easy and Normal and 1.2 s on Hard. On Hard the Windlass rests 0.4 s after
each phase-1 notch (0.8 s otherwise) and its stakes fly at 23 m/s (20 otherwise): before,
Hard played the boss at Normal's lengths with only more damage.

---

## 16. Colour and shape law (resolves the "fourth hue" conflict)

Three emissive hues exist. Nothing else glows.

| Hue | Means | Always carried by |
|---|---|---|
| **Flame** `#FF9433` | people, and **heat that will hurt you** | People: lanterns, embers, windows, the last fire. Danger: a white core, a **shape** (ticked ring for areas, dashed thread for lines, four-point star for an aim) and a **rising tone**. There is no separate "white-hot" hue |
| **Aqua** `#7CF2E2` | the old works working; it never hurts | strips, lamps, the line round, the proving line |
| **Violet** `#B24BFF`, core `#F0DCFF` | wrong, and where a round goes | Every knot has a dark bezel, a near-white core, a 1.5 Hz pulse and a collar shape (clustered on hoods, hexagonal on machines). Outdoors knots sit on dark backing. In the bore chamber knots read by core, collar and pulse, not hue |

The Rule on the horizon is violet and is never a target. Violet occupies under 2 % of any
frame until the bore. Thin things: nothing thinner than 2 px at its usual distance;
Transit legs 0.13 m; the sighting thread, lance thread, line-round line, the Rule and the
final thread are constant-pixel-width; the Dowser card and the last fire have minimum pixel
sizes.

---

## 17. Audio direction (WebAudio synthesis only; no files)

### One tonal family

Everything that answers a bullet shares **one bell voice** (two detuned sines plus an
inharmonic partial at x2.76, fast attack, exponential decay, a noise click on the front).
Pitch and decay vary by object; the scale is **D Dorian** (D E F G A B C), root D3
146.83 Hz. Jugs sound degrees 1–7 ascending (clay: 0.25 s decay, low-passed). Insulator
latches, the yard bell and the loft bell: 1.2 s. Range plates: degrees 1, 3, 5. Knots: the
bell voice with a falling pitch (minus a fourth over 0.4 s) and a wet noise pop. Transit
lens: degree 5, two octaves up, 1.8 s, the prettiest sound in the game. Windlass chambers:
degrees 1–6 by mouth number.

**The station hum runs under every underground second: D2 and A2, both 20 cents flat,
with slow beating.** The machines sing slightly flat. The line round's tone is D5, 8 cents
sharp ("slightly too pure" and not quite right). **The kept round is the only sound in the
game exactly in tune: pure D4 and D5 sines, 3.5 s, no noise, no echo.** It resolves the
seventh degree left hanging at the jug gate twenty minutes earlier. Then the hum stops.

### Ambience per zone

| Zone | Bed | Events |
|---|---|---|
| the_lip | band-passed noise wind with slow gusts; under the overhang, low-passed and close | pebble ticks; the sweep creaking; a far pylon wire singing (a thin sine cluster) |
| plenty_street | wind; the wind-pump's creak and a seven-beat clatter with one beat missing; loose tin | a shutter tapping; cloth; the yard bell answering stray shots |
| tally_house | near silence; the lantern's flutter; wood ticking | eleven slow breaths, out of phase, just audible; dust hiss in a blade of sun |
| the_gallery | the hum; relay ticks; a drip that is not water (a pitched click) | the flickering strip's buzz; coats moving on the stair |
| lift_hall | the hum, wider; the Tamper's pounding at 2.6 s intervals until it dies | long reverb tail on everything |
| the_bore | the hum, louder, with a slow violet "breath" (a filtered noise swell every 5 s) | the Windlass's ratchet; after the seventh: silence, then water far below, then a clean hum, in tune |
| far_rim | cold wind, lower and steadier; no machine | a far wire; the fire's crackle when it kindles, very small |

### Music approach

No score in the usual sense. A **generative drone-and-wire** system in D Dorian:

- A per-zone drone (two or three filtered oscillators) that the ambience bed already
  provides.
- A **wire**: a plucked-string voice (Karplus-Strong) that plays single notes or two-note
  figures at long random intervals (8–20 s) in calm, chosen from the scale; it is the
  nearest thing to a theme: D, A, C (1, 5, 7), the seventh always left hanging.
- **Combat layer:** a low skin drum (sine thump with a noise slap) at 96 bpm with three
  intensity states (sparse, steady, driving) set by the alive threat budget, plus a bowed
  fifth swell. It enters over 1 s when an encounter triggers and **cuts to nothing on the
  last kill**: the quiet after the gun is the reward.
- Boss: the drum locks to the Windlass's 1.1 s discharge cadence, so its ratchet is the
  percussion.
- The ending: the wire plays D, A, C, and for the first and only time resolves to D, on
  `nar_last`.
- Music ducks 5 dB for 200 ms on every shot.

### Key SFX (character)

| Sound | Character |
|---|---|
| Revolver report | six layers: 3 ms crack (noise, high-passed 2 kHz), body (band-passed noise 600–2500 Hz, 120 ms), boom (sine 150 to 50 Hz over 160 ms), mechanics (hammer at 0 ms; cock and ratchet at 120–300 ms), tail (per-zone feedback delay: outdoors 1.3 s with a slap at 320 ms; tally 0.5 s dense; gallery 0.9 s flutter; hall 2.2 s; bore 2.8 s), duck. Pitch ±4 % per shot. Last two rounds: brighter mechanics, drier tail |
| Dry fire | one dead click |
| Reload | gate click; six distinct seat-clicks rising slightly in pitch; gate close |
| Line round | the report, plus D5 slightly sharp, 1.2 s |
| Kept round | the report cut at 120 ms; pure D4 and D5, 3.5 s; then nothing for 4 s |
| Hit confirm / weak point / kill / freed / deflect | tick / glass *tink* / low thud / the bell voice falling then a breath / flat clank with a skipping bell |
| Bider | dry rattle (wind in a sack) on wind-up; cloth-and-boot run; a breath on sitting |
| Transit | three-beat ceramic clack; a rising sine sweep 400 to 1600 Hz over 0.9 s; stake whirr; lens bell |
| Tamper | two-beat stamp; rising hiss; falling howl (saw sweep 300 to 80 Hz); sub slam with debris noise |
| Windlass | ratchet (noise clicks through a comb filter); mouth iris (a short filtered sweep); the glow tone; canister thump and fizz; lance two-tone; haul (a long rising whine with the lamps' ticks); refill gurgle (pitched noise rising); the dry click (the player's dry fire an octave down); run-down clicks |
| Station voice | each line is preceded by a three-note chime in the flat tuning and carried by a formant-less tone pattern (one blip per word, pitch by word length); never speech |
| Doors and gates | sweep creak; yard gate bang; shutter drop bang with a rattle; hatch iris; baffle grind |
| Pickups | paper rustle and brass; tin clink; canteen slosh |
| Checkpoint | a single soft wire note |

### Captions for sounds (every `cap_*` key and the sound it belongs to)

Shown only with "Captions for sounds" on. Whoever plays the sound raises its caption. A
caption holds 2 s and the same key is not shown again within 4 s. Every `cap_*` key in
`design/story.json` is in this table; a key that is not here is a bug.

| Key | Sound | When it is shown |
|---|---|---|
| `cap_bider_rattle` | Bider wind-up rattle and circling bark | each wind-up; each bark while circling |
| `cap_bider_sits` | the breath of a freed Bider | each freeing |
| `cap_transit_clack` | a Transit's three-beat gait | when a Transit emerges, and when one walks while out of view |
| `cap_transit_tone` | the Transit's rising aim tone | each `aim` |
| `cap_stake` | a stake in flight | each stake fired at the player (Transit or Windlass) |
| `cap_tamper_hiss` | the Tamper's slam wind-up | each `slam_windup` |
| `cap_tamper_howl` | the Tamper's charge wind-up | each `charge_windup` |
| `cap_tamper_pound` | the bulkhead pounding | on entering the gantry, once |
| `cap_chairs` | chairs scraping | the 0.8 s cue of `enc_tally` |
| `cap_station_chime` | the three-note chime before a station line | before the first station line in each zone only |
| `cap_listening` | the listening lamps ticking | each time the ring starts to fill on question 3 |
| `cap_ratchet` | the Windlass's ratchet | each index run, the swing clear at the hush, the run-down at its death |
| `cap_canister` | a canister launched | each canister |
| `cap_lance` | the lance's two-tone tell | each lance |
| `cap_refill` | a chamber relighting from the bore | each relight in phase 3a |
| `cap_dry_click` | the Windlass dry-firing | the first three dry clicks of phase 3b |
| `cap_hum_stops` | the station hum stopping | at the seventh |
| `cap_water_below` | water far below | after `stn_proven` |
| `cap_gate` | the yard gate bursting | wave D of `enc_street` |
| `cap_shutter` | a shutter dropping open | each `daylight` latch |
| `cap_locker_chime` | a line locker stocked | each time a locker offers a round |
| `cap_fire_kindles` | the fire on the plain | the ending |
| `cap_wire_resolves` | the wire resolving to D | with `nar_last` |

Mix priority: player gun, enemy telegraphs, hit confirms, station voice, everything else.
`AudioContext({ latencyHint: 'interactive' })`; the crack is scheduled at `currentTime`.

---

## 18. Checkpoints and save rules

| Id | When |
|---|---|
| `cp_lip_start` | start |
| `cp_lip_gate` | jug gate open |
| `cp_street_clear` | `enc_street` clear |
| `cp_yard_clear` | `enc_yard` clear |
| `cp_tally_enter` | entering the hall |
| `cp_tally_hatch` | `enc_tally` clear |
| `cp_gallery_bay` | foot of the stair |
| `cp_gallery_baffle` | `proving_line` solved (the locker's extra round is restocked on respawn) |
| `cp_file_clear` | `enc_file` clear |
| `cp_hall_gantry` | entering the gantry (vignette marked seen) |
| `cp_hall_clear` | `enc_matador` clear |
| `cp_bore_ante` | entering the antechamber |
| `cp_boss_p1`, `cp_boss_p2`, `cp_boss_p3` | each phase start (parley marked heard) |
| `cp_boss_proven` | the kept round fired |
| `cp_rim` | the lift opens on the rim |

- A death never costs more than 90 s. Control within 3 s. Vignettes, cards and narration
  never replay: **every `nar_*` line plays at most once per run**, whatever fires it and
  however many markers name it (`design/story.json` `meta.rules.narrator_repeat`).
- `cp_boss_proven` is committed when the kept round is fired, not when the boss dies.
- A checkpoint never saves a losing state: floors of 60 HP and 18 reserve.
- Saved per checkpoint: checkpoint id, health, cylinder, reserve, line rounds, puzzle and
  door state, secrets, `freed` and `felled` counts, stats, once-only line flags, the
  seventh's state.
- One autosave slot in `localStorage`, written at each checkpoint, read by
  `ui_menu_continue`. Options are saved separately and immediately. No manual save.
- `ui_pause_restart_cp` ("Back to the last count") reloads the last checkpoint.

---

## 19. Systems contracts the design depends on

1. **`pierce` tag** in `design/layout.json` on colliders the line round passes through.
   A raycast-all path through the BVH with a preallocated result list; ordered multi-hit.
2. **`lane` tag** on volumes where Biders follow in file (street centre for wave C, the
   gallery walkway).
3. **Deterministic step hook**: the game can be advanced tick by tick with scripted input,
   with a query API for player state, enemy states, puzzle state, the seventh's state,
   `freed`, draw calls, triangles and texture memory.
4. **Instanced static bodies**: `bider_seated_static`, `bider_felled_static`,
   `bider_table_static`. One draw call per type, any count.
5. **World shader terms**: muzzle pulse (radial, position and radius uniforms and a cap uniform, 0.6 / exposure; skipped entirely on frames where both slots are at rest), the ring
   (same term, larger radius), per-zone ambient tint for dynamic objects, a `wrong_fade`
   uniform that lerps violet emissives to grey and livery bands to aqua.
6. **Resident sets**: surface, underground, coda; swapped on the peg stair and the proving
   lift.

---

## 20. Scope guard — what is OUT

- Fan-the-hammer, any alt-fire, aim-down-sights, a second weapon, melee, grenades.
- Crouch, lean, ladders the player climbs, swimming, fall damage, moving platforms that
  carry the player other than the two lift rides (which are dark rides: the cage does not
  move in world space).
- **The Long Drop** (the lift fight). The ride is 25 quiet seconds.
- The Missing Vane puzzle (replaced by `daylight`); bank shots as a mechanic (the ricochet
  is cosmetic only); a rotating-floor arena; timed bridges.
- A fourth enemy archetype; a second Tamper that fights; Transits in the boss room; any
  enemy that enters over a wall or from a moving ledge; any enemy with a ranged hitscan.
- Any human face, speech, lip or facial animation; any voice-over; any audio file.
- Children on the roll or anywhere in the stage (they were sent east; the bare low pegs
  and the ledger say so).
- Gore, blood, dismemberment, corpses with faces. Shooting seated Biders.
- A narrator comment on, or a count of, the felled.
- Inventory, currency, upgrades, crafting, dialogue choices, a map, objective markers.
- Dynamic shadows on Low; any dynamic shadowed point light; real-time relight of the
  Tally House (stretch: additive lightmap layers, not in round 1).
- Per-shutter relit bakes, a blue-hour relight of the street (the rim is its own small
  bake and the town is a card).
- A boss that leaves the gantry; a boss rail traverse beyond the six-index arm.
- More than two secrets. Manual saves. Multiplayer. Gamepad support (stretch, not round 1).
- Any name, term, place, line or signature image on the blocklist in
  `docs/research/art-tone.md` 1.5 and 1.6.

### 20.1 Cut order for what is IN (if a piece runs out of time, degrade in this order)

Builders who cannot finish everything cut from the top of this list down, say so in their
report, and leave the id in place with its fallback so nothing downstream breaks. Nobody
cuts anything that is not on this list without asking.

| # | Cut | Fallback that keeps the build whole |
|---|---|---|
| 1 | `sec_cold_bay` (the clean Tamper, `ia_line_locker_secret`, `rd_plate_service`, `knot_cold_bay`) | the shutter stays shut and unknotted; secrets become "n of 1" |
| 2 | The watcher's head-turn (`vig_watcher` as a skinned instance) | a `bider_seated_static` in the niche; `nar_watcher_1` only |
| 3 | Hint tier 3 outline pulses | the T3 lines still play; no outline shader |
| 4 | (retired: the architecture has no Medium tier. Low and High only, plus the hidden `min` fallback; the row keeps its number so the other rows keep theirs) | Auto picks Low or High |
| 5 | The Bider knocked flat in the Tamper vignette | the Tamper pounds alone |
| 6 | The Transit staking the bell (`vig_yard_bell`) | T1 emerges and turns; the bell is still shootable |
| 7 | `sec_loft_bell` and `rd_rain_tally` | secrets row dropped from the end card |
| 8 | End-card rows "lines of three or more" and "a clean six" | the other rows stay |
| 9 | High-tier extras: heat shimmer, sand sparkle, sun shadow map, cloud-shadow scroll | Low look on High |
| 10 | Checkpoints `cp_hall_gantry` and `cp_gallery_bay` (15 remain) | a death there costs up to 30 s more; the 90 s rule still holds |
| 11 | Per-clip polish on enemy clips that are never seen close: `circle_strafe`, `falter`, `sidestep_l/r` | reuse `run`, `stumble`, `walk` under the listed names |
| 12 | Wave B of `enc_file` | the File is six |

**Never cut:** the sealed seventh on the HUD and the `F` flow; `rd_plate_proving` and
`nar_plate_1..3`; the cradle and `nar_cradle`, `nar_cradle_2`; the kneeler; the Dowser
sighting; the south and middle `daylight` blades; T4 on every puzzle; the ammo floor; the
lamp count; the stone. Readables other than those in rows 1 and 7 are text only and are
not worth cutting.

---

## 21. Acceptance tests (run through the deterministic step hook; pass or cut)

1. **Feel spec checks** from `game-feel.md` section 9 (movement, jump, fire, reload,
   tokens, ammo floor, hint tiers).
2. **Crown knot.** A scripted run at each difficulty frees at least 5 of the 7 street
   Biders when aiming at the knot centre with ±0.1 m of injected aim error at 10 m. If
   under 5, raise the radius before anything else.
3. **File.** In `enc_file`, six Biders hold a line within ±0.4 m laterally for the 40 m
   run in 20 of 20 seeded runs; one line round from the walkway centre frees all six. In
   `enc_street` wave C, three hold file down the street. In open ground (waves B, D; the
   yard) no three Biders are collinear within 0.5 m for more than 1 s. If file-following
   is flaky, the File falls back to spawn spacing alone. Wave B of `enc_file`: no straight
   line from any walkway nav node passes within 0.3 m of all three for more than 0.5 s.
4. **Tally rise.** From every nav node from which `knot_hatch_latch` can be hit, both
   risers are at least 12 m from the player at trigger; the cue plays 0.8 s first; the
   hatch is impassable until both are down and opens within 1.5 s of the second.
5. **Tamper.** A charge into a rib yields `charge_stun` in 20 of 20 runs. From full health
   (900): one line round through the chest knot from the front leaves it at 600 in
   `line_stagger` with both vents open for 1.8 s; two more line rounds, or three lead rounds
   into a vent, then kill; **one line round never kills**. A line round through plate away
   from the knots does 300 and no stagger. In the vignette, plate hits from the gantry do
   0 damage; a vent hit or a line round starts `enc_matador`. With the Tamper killed at
   t < 15 s no Bider spawns and the encounter is clear on its death; killed at 15 s < t <
   35 s, wave C never spawns and clear follows the two of wave B.
6. **`proving_line`.** Solved from each corner and the centre of the step at FOV 50, 62
   and 80; not solved from 0.3 m off the step without T4.
7. **`the_asking`.** The ring stays dark on questions 1 and 2. On question 3, standing
   inside the puzzle volume without firing opens the door 12 s after the question is put
   (3 s subtitle, 9 s ring); a shot at 8 s empties the ring and the door then opens 9 s
   after that shot; standing outside the volume the ring does not advance. With two line
   rounds held, the door still opens the same way. `nar_cradle` and `nar_cradle_2` have
   played by the time the door opens, in every run.
8. **Ending cannot soft-lock.** From `cp_boss_p3` with 0 lead in cylinder and reserve and
   2 line rounds held: the proof is reachable, and phase 3b is completable (boxes).
   Firing both line rounds down the bore does not end phase 3a. The kept round cannot be
   fired anywhere but the bore, and cannot be lost.
   **The mark is live at once:** `F` on a mark on the first tick of phase 3a loads the kept
   round; `nar_not_for_firing` cannot play at any time in phase 3a. **The shot is easy:**
   from the centre of each of the six marks, every aim between 5° and 60° below the horizon
   within ±25° of the bearing to the axis fires; an aim at the far wall does not. After the
   press the arm is at the opposite index within 1.8 s (game time).
9. **Parry is not dominant.** A scripted player who parries every stake and never shoots
   during a haul does zero pips of damage.
10. **Lamps.** The end card's lamp count equals 9 + `freed`, and equals the number of lit
    window quads on the rim card.
11. **Budgets.** Draw calls, triangles and texture memory against the caps in `CLAUDE.md`
    and the per-view numbers in `docs/ARCHITECTURE.md` (which include the neighbour zones
    that stay drawn), measured in each fight's worst tick and looking down each zone's
    longest sightline. Section 9.9 is not a test limit. CPU frame time at most 4 ms of JS.
12. **Length.** Measured with the harness's path-following bot (`followPath` along
    `nav.criticalPath`, walking by input, with a fixed dwell at each puzzle: 25 s
    `seven_jugs`, 70 s `daylight`, 60 s `proving_line`, 45 s `the_asking`, and fights
    resolved by the debug hook after a fixed fight time from section 4.2): the run finishes
    in 19–23 minutes. Until the harness provides `followPath`, the test is the sum of the
    scripted segment times and is reported as an estimate, not a pass. An
    idle-at-every-puzzle run (waiting for T4 everywhere) finishes inside 25 plus fights.
13. **Readability at 720p with resolution scale 70 %.** Port numerals on the Asking door,
    the "4" on station plates, the sighting thread, the Dowser card, the last fire.
14. **Text.** Every string in `design/story.json` passes the blocklist grep; an author
    other than the writer re-reads it against `art-tone.md` 1.5 and 1.6 before lock.
    *Record:* the pre-production critic panel (fresh context, not the writer) re-read
    version 1 against 1.5 and 1.6 and found no name, coined term or quotation; it flagged
    three proximities, each moved one step in version 2 (the trace is no longer three
    fires; the courtesy is capped and barred from UI and marketing; `nar_tally_chair_2`
    states that the Dowser did not turn the town). Version 2 passes the grep (section 23).
    The re-read is repeated by a non-writer after any later text change.
15. **Blind story read.** With every readable skipped, a critic can still state: they were
    townsfolk four days ago (`nar_tally_wall`, `stn_tally_wake_2`); the children left
    (`nar_pegs_2`); the Dowser sat with them and did not set them on her
    (`nar_tally_chair_2`); he emptied the cradle (`nar_cradle_2`, guaranteed by the
    Asking); she was carrying the last proving charge (`nar_plate_2`, `nar_one_left`); she
    spent it (`nar_seal`, `nar_kept`); some of the town came home (`nar_lamps_count`).

---

## 22. Judge red flags and how each is resolved

| Red flag | Resolution |
|---|---|
| Ending logic hole (carried plumb rounds at the bore) | The special is a **line charge**; the bore needs a **proving charge**; they are different stock. A line round down the bore fails audibly (`stn_bore_line_short`). No boss-room refills. Test 8. |
| Climax mis-teaches the attentive | Marks lit and `F` live from the first tick of phase 3a; `nar_not_for_firing` suppressed in 3a; the bore target is a generous volume and the head swings clear. Section 6.6, test 8. |
| Mid-game sag once the line round is learned | The line round is half a Tamper, not all of one; hall waves run on the clock; the File has a second wave that will not line up. Sections 6.7, 10, test 5. |
| Finale deflation | The kept round has its own load, crosshair, sound (the only in-tune, echoless sound), image (the standing line, the ring) and consequences (violet dies, Biders sit, the hum stops, the boss goes dry). It is fired inside the fight and followed by six lead rounds (the follow-through). |
| "PLUMBS ABOARD" collision | The word is gone. Question 3 is about the cradle the player is looking at. |
| Parry dominance; boss as turret | Parries do not count as hits; canisters cannot be parried. The arm indexes between six bays with a ±35° arc. |
| Puzzle 2 stall | The Missing Vane is cut. `daylight` has no timing window, and its geometry is the blockout's true-sun geometry (section 13.2). |
| Puzzle 3 pixel hunt | A 1.6 m step, a snap, a chime, a sighting loop; FOV-tested. |
| Scope | Seven zones in three resident sets; five fights and a boss; Long Drop cut; fan cut; two secrets. |
| Story lands only if read | The tally wall, the table, the pegs, the plate, the cradle and the station's voice are all on the critical path. Test 15. |
| Homage proximity | Hoods are well-linen, not sacks; "Chaff" is gone; no scarecrow shapes; the hall is civic; the mercy outcome and the lamp count invert the town beat; the end card never counts the felled; "walker" is banned; the seven motif is confined to the gun and the gate (the station is 4; the charge has no type number); the Dowser is a clerk with a rod. Independent re-read required (test 14). |
| Flash dependence | Section 13.2 fail-safe; boss lit by the bake. |
| Colour overload | Section 16. Danger is flame with shape and tone. |
| Conga line; Tamper off the edge | `lane` tag only; the edge is cut. Test 3. |
| Length | Section 4.2 budget; T4 on every puzzle; test 12. |
| Precision stat must only reward | Lamps count up from 9. The felled are never counted or mentioned. Line rounds and the kept round free for free. Test 2. |
| Texture memory | Section 9.9. |
| Gun feature set | Lead, line, kept. Clip list in 6.9. |
| Bider clip list and entrances | Section 7.1: 18 clips, three entrances. |
| Thin geometry | Section 16. |
| Pierce contract | Section 19. |
| Sealed seventh is load-bearing | Sections 12.2 and 12.4; story.json meta. |
| Text legibility | Wide capitals; numerals as geometry where large; test 13. Ledger is three cards. |
| Real-GPU frame rate unverifiable | Test 11 proxies; the player confirms. |

---

## 23. Revision 2 record (after the pre-production critic round)

### 23.1 Level-design requests (`docs/requests/level-design.md`): all five accepted

The design owner accepts requests 1 to 5 as blocked out. `design/layout.json` is the truth
for every position and opening size; this document and `docs/ART_BIBLE.md` have been
rewritten to it.

| # | Request | Decision | Where it now lives |
|---|---|---|---|
| 1 | `daylight` landing spots cannot be on the east wall under the true sun | **Accepted.** True sun kept. Tally wall on the south wall east of the door; hearth, head chair and stop two in the south-east corner; day-cell hung from the tie-beam above the hatch with its pictogram plate on the west wall; hatch 4 x 2 m; windows 1.2 x 0.9 m at 4.05–4.95 m with latches at 3.5 m; 5 m adobe walls, flat roof. No line of text says "east wall" | 9.4, 13.2; ART_BIBLE 3.3, 7.2, 7.3, 7.4 |
| 2 | Bore rib bearings versus door, locker and cartridge points | **Accepted.** Door, lift gate and marks on bay centres (0° + 60°k); ribs at 30° + 60°k; cartridge points behind the ribs at 90° and 270°; locker at 168° beside the lift gate | 6.4, 8; ART_BIBLE 7.3 |
| 3 | Yard gate and yard door are two openings | **Accepted.** A 5 m gate court between them | 9.3 |
| 4 | The loft "ladder" | **Accepted.** A ramp collider enabled by the shot | 9.3 |
| 5 | Lift rides are teleports | **Accepted**, with the condition that each ride's two cages match in size and shape | 9.6 |

### 23.2 What changed in revision 2 (for other owners)

| Area | Change |
|---|---|
| Line round | Flat 300, no knot multiplier. Through a Tamper knot: `line_stagger` 3.0 s, both vents open (new state, no new clip). Tamper knot spheres always live for line rounds |
| Tamper, Transit | `vignette` rows added to both state tables with hit rules |
| `enc_matador` | Waves B and C by time only (15 s, 35 s; 40 s and 65 s until polish round 3), cancelled if the Tamper is dead; clear defined |
| `enc_file` | 9 Biders: wave B of 3 through `door_gallery_far`, not in file; needs three spawn markers and `nar_file_more` |
| `enc_tally` | Hatch ajar on the knot, fully open on clear |
| Kept round | Marks lit and `F` live from the first tick of 3a; `nar_not_for_firing` suppressed in 3a; bore target volume (cylinder r 3.0 from kerb top down, kerb and boss ignored); the arm swings to the opposite index during the load; narration order `nar_seal`, `nar_office`, `nar_kept` |
| Phase 3a hints | T1 `nar_office`, T2 `hint_kept_2`, T3 outline and prompt. `hint_kept_1` is renamed `nar_one_left` and plays for everyone with `stn_boss_charge_required` |
| `the_asking` | Listening ring dark on questions 1 and 2; on question 3 it fills at 0.75 s a lamp (9 s), only inside the puzzle volume, with the cradle lamp stepping; `nar_cradle`, `nar_cradle_2` guaranteed |
| Parley | 28 s; the mouths open as `stn_parley_4` appears |
| Far rim | Only the stone arms the ending; fail-safes at 60 s and 150 s |
| The trace | Stop one is a coffee pot, stop two a chair and a cup, stop three embers: one fire, not three |
| Story keys | New: `nar_tally_chair_2`, `nar_file_more`, `nar_cradle_2`, `nar_one_left`. Removed: `hint_kept_1`. Label `ui_speaker_station` is now "STATION". Every `nar_*` line plays once per run |
| Captions | Every `cap_*` key is bound to a sound in section 17 |
| Budgets, tests, scope | 9.9 is not a test limit; tests 4, 5, 7, 8, 11, 12, 14, 15 rewritten; section 20.1 is the cut order |

### 23.3 Blocklist check, story.json version 2

Grep of every string in `design/story.json` against the names, places, coined terms,
corporations and catchphrases of `docs/research/art-tone.md` 1.5, and the words banned in
section 2 of this document: no match. Run again after any text change.

### 23.4 Close of pre-production (integrator pass)

Changes made here in answer to `docs/requests/workorders.md` (no design change; each makes
this document say what the contracts, the layout and the work orders already did):

| Section | Change |
|---|---|
| 12.2, 12.3 | The seventh has six HUD states: `chambered` added (slot drawn empty). The pause label for `chambered` is `ui_seventh_broken`, for `pulse` `ui_seventh_sealed`; no new story key |
| 13.3 | The `proving_line` snap is world's (`knot_a`'s receiver), not the player's shot code |
| 9.4 | The hatch latch block is in a north-facing cowl at the hatch's north-west corner (the layout's) |
| 15, 20.1 row 4 | Resolution scale is relative to the tier's drawing-buffer cap; there is no Medium tier |
| 9.6 | The proving-lift ride is at least 12 s (`ia_proving_lift.params.ride.seconds` in the layout) and lasts until the coda set is built |

### 23.5 After the foundation (integrator pass before production)

No design change; two places where this document now says what the engine and the rulings do:

| Section | Change |
|---|---|
| 5 | "Jump reach" row: the apex stays 1.0 m; the controller refuses a landing above it, because the collision engine lifts a capsule one radius onto a ledge it is pressed into (ARCHITECTURE 6; `code-player` 4.1). Cover at 1.3 m stays cover |
| 16 (colour law), by reference | The tone map is a shoulder-only curve with no toe (ART_BIBLE 11; ARCHITECTURE 8.1): colours up to 0.8 linear are shown as authored, so the dark end of the palette is not crushed |

### 23.6 Polish round 3 record (closer, 2026-10-05): the game as built under lead rulings R1 to R8

Lead rulings R1 to R8 of polish round 3 outrank this document's numbers; the sections above were edited in place where
a sentence had become false, and this table is the complete list. Sources: `docs/requests/code-enemies.md` R3.1,
`code-world.md` 9, `code-ui.md` 9, `code-render.md` 13 to 17, `code-audio.md`, `lookdev-*.md`; measurements in
`docs/INTEGRATION_REPORT.md` Part F.

| Section | Was | Built |
|---|---|---|
| 5, 6.9 view-model | FOV 52 degrees; clips shown as authored | FOV **40 degrees**; idle placement `VIEW_PLACE` x -0.008, y 0.012, z 0.065, pitch -5, yaw 5, roll -4 (the revolver alone covers 9 to 10 % of a 16:9 frame at idle, R6); the handling clips (reload, line round, kept round, take) are framed by `VIEW_PLACE_HANDLING` x -0.02, y -0.04, z -0.03. Clip names and durations are unchanged |
| 6.8 hit confirm | the confirm 85 ms after the click | tick, tink, parry, deflect and freed sound **150 ms** after the click (the kill's thud stays at 190 ms); the report's tail steps back 5 dB for 120 ms under a confirm |
| 7.1 Bider | separation 0.75 m | **0.95 m**; a circling Bider does not strafe within 50 degrees (seen from her) of the one ahead of it on the ring |
| 7.2 Transit `seek` | cycled seek / relocate / plant when blind; stopped 8 m short | walks toward her until it sees her and plants there; one that cannot find her holds still for 6 s facing where she was; of two that seek together the second holds 1.8 m behind the first. A Transit kill satisfies the ammo floor |
| 7.2 the sighting thread | 2 px, dashed | solid, 3 px growing to 5 over the 0.9 s of the aim, with a halo and a glow on the lens |
| 7.3 Tamper | chest vent open for the whole slam wind-up | open for the last 0.6 s (HP 1 200 and a charge every 4 s stand, ruling 27) |
| 8.1 parley | up to six free hits | two; `stn_parley_4` and `hint_boss_haul` reworded (a lit chamber is open; all six open on the haul) |
| 8.2 phase 1 | pattern 6.6 s, haul 5.0 s, glowing chamber parried with no pip | pattern 11.4 s (0.8 s rest per notch), haul 3.0 s, the arm follows her in the haul, **every lit knot in an open mouth counts** |
| 8.2 phase 2 | pawls re-set at every haul end | burst pawls stay burst; haul 6.5 s and 4.5 s guaranteed stand |
| 8.3 teaching | `hint_boss_haul` from the first death | at the first haul of every try, the first included |
| 9.3, 16 the Dowser | pale `#D9D2BF`, 3 x 8 px, against the mesa's shadowed face; gone at 12 s | near-black `#15121A`, 9 x 29 px at 720p, on the skyline against clear sky; **held until she has looked at him** (inside 15 degrees) for 1 s, then gone 2 s after she looks away. The 12 s clock only opens the Tally House door. `nar_dowser_seen`: "On the far rim, a man with a forked rod, dark against the sky. Watching." |
| 9.8 the rim | six life-size cases; life-size seventh; leave clock 25 s from the trigger | six brass cases 2.6 x life size built into the stone and the seventh round at the same 2.6 x (binding scale; the round in the hand stays life size); the leave clock of 9.8 above; the 150 s fail-safe waits while she is within 8 m of a stone she has not found |
| 4.4 lamps | `9 + freed` | the same, skipping 19 (ten freed gives 20) |
| 12.2 HUD | health bars 46 x 5 px at 1080p; mark floor 0.864; pause scrim 70 % | bars 46 x 7, never under 6 px; `MARK_MIN_SCALE` 1.08 (95 x 138 px at 720p); the pause scrim 78 % (options and the resume plate stay 70 %). The cylinder ring lies over the revolver's frame at idle at 16:9: accepted (closer's ruling: an 8 % gun in the lower right cannot clear that corner; the ring's discs carry their ink outline) |
| 12.2 end card | `KNOTS BURST` counts mechanism knots | it counts freed crown knots and the Windlass's pips and pawls as well |
| 17 audio | | as 6.8 above; `hit_tick` +2.5 dB |
| system text | | `system.waiting` "Waiting on the connection." (a set's files late during play) |

**Honest gap against R2:** phase 1 lasts 26 to 40 s for the plain-skill proxy (R2 asks 60 to 90 s), phase 2 about 60 s.
The fixer chose a short fair phase over a long one padded with dead time; the levers are `BOSS.p1Rest` and `pipsP1`.

### 23.7 Polish round 4 record (cross-cutting fixer, 2026-10-05): tuning under lead rulings R1 to R3

The sections above were edited in place; this table is the complete list. Measurements (the critics' plain-skill and
careless proxies, three runs each, before and after) are in `docs/INTEGRATION_REPORT.md` Part G.

| Section | Was | Built |
|---|---|---|
| 7.3 Tamper | 1 200 HP (six vent shots, a line round a quarter, 48 plate hits) | **900 HP** (five vent shots, a line round a third, 36 plate hits). The late vent (last 0.6 s of the wind-up) stands on Normal and Hard; Easy has the whole 1.0 s |
| 6.5 ammo floor at the Tamper | one packet per attempt | a packet whenever a round meets it at 6 or fewer, 10 s apart; wholly dry, one by the hall locker with its chime |
| 6.5 boss-room cartridge points | 12 rounds / 10 s | **18** / 10 s |
| 6.5, 10 the yard | no cartridge point | `ia_ammo_box_yard` inside the yard door |
| 7.2 Transit | cooldown 1.2 s | 1.5 s on Easy and Normal, 1.2 s on Hard |
| 10 `enc_street` | B from the alleys beside the kneeler; C on B down to 1 or 6 s after B | B from the two alley mouths nearest the gate; C on B down to 2 or 2 s after B |
| 10 `enc_file` | B 4 s after the sixth is down or 25 s after the turn; 2.5 m depth stagger | also 2 s after the file is first hit; 1.2 m |
| 15 Hard | damage, tokens, tells, drops, knot radius | also: Windlass phase-1 rest 0.4 s, its stakes 23 m/s; Transit cooldown 1.2 s |
| 12.2 end card | `KNOTS BURST` recounted the Windlass's remaining pips at every phase change (186 for 78 rounds) | each pip once (65 for 78 rounds in the scripted run) |
| 12 key names | "Mouse 1 to fire" | "Left click to fire" (`ui_key_mouse_left` / `_middle` / `_right`) |

**Honest gaps against R3:** the file still costs a plain player nothing and a careless one health in one run of three
(its nine come down 40 m of open corridor; a near entrance needs a floor grate the gallery does not have). The lift
hall's gantry is still a perch nothing can reach (the enemies' and the world's to close).

### 23.8 Polish round 4 record (closer, 2026-10-05): the game as built by the round's code and look teams

Lead rulings R1 to R9 outrank the numbers above. Where a section quotes a number that moved it was edited in place
(6.3, 6.5 to 6.9, 7.3 `line_stagger`, 8.2 phase 3a, 9.8, 10 `enc_file`, the death row of section 5); the rows below are
the complete list, and where a section above still says otherwise, **this table holds**. Measurements are in
`docs/INTEGRATION_REPORT.md` Part H; each team's own table is in `docs/requests/<team>.md`.

| Section | Was | Built |
|---|---|---|
| 5 Death | `ui_death` 1.2 s, cut at the respawn | the line comes up with the ink (whole at 0.6 s), stays outlined 1.4 s after the respawn, fades in 0.4 s: whole for 2.6 s. Control still 1.8 s after the fatal tick |
| 5 Respawn, 8.2 | a hurt player walked into the Windlass as she was | on a **first arrival** at phase 1, 2 and 3a she has at least **67** health (`BOSS_HEALTH_FLOOR`) before the phase's checkpoint is saved; a restore still gives the player's own 60 (`RESPAWN_MIN_HEALTH`) |
| 6.3 Empty cylinder | dry click and reload on the same tick | a dry beat of 7 ticks (0.117 s), then the reload opens; 2.57 s from a dry click to ready |
| 6.5, 8.2 | phase 2 opened with a run to the box | as phase 1 breaks a `pk_rounds_12` falls at her feet when she holds fewer than 12 in reserve (`BOSS_BREAK_RESERVE`) |
| 6.5, 6.7, 7.3 `line_stagger` | 3.0 s | **1.8 s**; a line round and three vent shots kill (900 HP) |
| 6.6 rule 3, 8.2 hints | `nar_seal` queued behind `nar_one_left`; `nar_office` queued on the press | `nar_seal` at once on the press, over whatever line is there; `nar_office` after `nar_kept` (or from the ladder's first tier) |
| 6.8 flash | sprite at the muzzle | 1.6 x farther from the eye on the eye-to-muzzle line (0.625 the size); pulse shaded by N.L, capped at 0.6 of display white |
| 6.8, 17 confirms | room's answer 5 dB / 120 ms everywhere | 8 dB / 160 ms in the lift hall, 10 dB / 200 ms in the bore; the four short confirms +2.5 dB (hall) and +3.5 dB (bore); the tick's knock 130 ms (90); dry click about -8 dB peak (-13) |
| 6.9 `load_kept` | "cuff to the eye, hand-off at 0.9 s", a 1 to 2 s hold | re-staged on the reload's framing (see the 6.9 row); band cracked at 0.57 s, seated at 1.27 s; length 1.8 s unchanged |
| 6.9, ART_BIBLE 8.3 idle placement | `VIEW_PLACE` (-0.008, 0.012, 0.065; -5, 5, -4 degrees) | (0.004, 0.013, 0.023; pitch -7, yaw 8.5, roll -14): the gun's left side shows (flutes, trigger guard, frame screw); gun + hand 9.6 to 10.6 % of the frame on Low (10.1 to 12.1 High), the muzzle 101 px right and 69 px below the crosshair at 720p |
| 7.1 Bider | runs straight at her whenever it sees her | straight only within 1.2 m of her height (`BIDER.directLevel`), else the nav graph; a goal with no route is approached as far as the graph goes (`Nav.path(a, b, out, near)`) |
| 7.2 Transit | a second Transit behind one that sees her stays blind | blind for 6 s behind such a Transit it passes and plants where it sees her, at least 2.0 m from every other Transit (`TRANSIT.passAfter`, `passApart`; a failed pass waits 12 s, `passRetry`) |
| 7.3 Tamper vents | an open vent takes lead from anywhere | only from its own side: the horizontal cosine between the round and the body's facing under 0.3 for the chest, over -0.3 for the back (`TAMPER.ventSide`); the bulkhead vignette is exempt |
| 7.3 `charge` / `charge_stun` | any touch of a rib stuns | stunned once a wall, a rib or the cabinet has pushed it 0.25 m off its line (`TAMPER.grazeDepth`); a shallower graze is slid past |
| 7.3 `advance` | straight at her | off her level (0.6 m, `TAMPER.directLevel`) it walks the nav graph (it climbs the ramp and fights on the gantry: the perch is closed); held 0.5 s, it walks the graph for 3 s (`TAMPER.unwedge`) |
| 7.3 `slam` | a slam every 2.9 s on a cornered player | after a slam that landed, no attack starts until 1.5 s after its recover (`TAMPER.slamAfterHit`) |
| 8.2 phase 3a | the station asks at 12 s | the world's ask at **1.5 s** (`kept.ts` `ASK_AFTER`); the Windlass's own ask at 12 s still starts the HUD pulse and the hint ladder (open: move `BOSS.chargeRequiredAt` to about 2 s) |
| 8.2 the seventh, steps 5 and 6 | 4 s of silence, `nar_kept`, `stn_proven` | on the shot the waiting fight lines are dropped and **`stn_proven` is said at once**; when phase 3b begins (4 s) `stn_dry`, then `nar_kept`, then `nar_office` if unheard; `cap_water_below` when both the 4 s and "BORE PROVEN." are over. `stn_dry` is the world's line |
| 9.3 the sighting | the 12 s clock opens the Tally House door | not while `nar_dowser_seen` is on screen (it waits for the line's end); going in under a sighting line cuts it. The Dowser holds the rod out at arm's length, upright (figure 14 x 29 px at 720p, luma 50 on 191) |
| 9.8 the stone | until the note is read `E` reads it | she is offered the one she is looking at (TAKE at the round, READ at the note); only a look between them (within 2 degrees) offers the unread note |
| 9.8 the stone's and rim's lines | four stone lines; `nar_rim_2`, `nar_rim_3` on a clock | on the take branch only `nar_stone_1` of the lines not yet started is kept; `nar_rim_2` / `nar_rim_3` wait, once `trg_stone` has fired, until the town is within 35 degrees of her view |
| 9.8 the eased last view | 0.35 of the angle toward the town (the fire under the end panel) | **0.15**: the fire 5.3 degrees right of centre (x 695 of 1280), clear of the end card's panel |
| 9.8 the town card | 176 triangles, centred on `vista_plenty.target` | 349 of 600: drawn 12.5 m further east, 48 panes, 16 window pools, pitched roofs, two smoke ribbons, one leaning dead line pylon 42 m out |
| 10 `enc_file` wave B | on clocks (2 s after the first hit, 4 s after the sixth, 25 s) | **an ambush at the far door**: with the file down to one, let go when she is within 12 m of `door_gallery_far` (or 25 s after the file was down to one); a bang, `nar_file_more`, the door bursts 2 s later with three abreast 6 to 8 m ahead (`WAVE_RULES['enc_file/B']`) |
| 12 readables | `thenLine` / `lines` queued at the back | said next in line as the readable closes |
| 12.2 HUD mark | spent chamber a `#6E5A2E` ring; nothing behind | spent chamber bone `#E9E2D0` at 60 %; two soft ink discs under the mark (alpha 0.5 to 60 % of the radius, then to 0) |
| 12.2 end card | ink at 80 % over the whole frame, ledger centred | scrim 35 %; the ledger on an 80 % ink panel in the right third (left edge at 0.60 of the width or more), `min(600 u, 31 vw)` wide |
| 19 / 21 render | bloom on emissives only, one threshold (1.15) | High: a bloom threshold / knee / intensity per mood (L0 0.42 / 0.35 / 1.0, L1 0.55 / 0.35 / 0.9, L3 and L4 0.55 / 0.40 / 1.0, L6 0.25 / 0.40 / 1.0, others 1.15); High: a contact-shade term at the head of the merged pass from the scene's own depth (no extra pass or target) |
| test bound (`tests/e2e/lib/page-play.js`) | a restore under 67 HP is a problem | under 60 (the documented floor) |

**Rulings at the close.** `nar_take_1` stays on the leave branch (`design/story.json` `ending_branch.leave`): the line
is about her own kept round and is true on both branches. The Tamper's charge wind-up stays 48 ticks. The death state
is not skippable (core's `DEATH_TICKS`). **Open for round 5:** `BOSS.chargeRequiredAt` 12 -> about 2 s; the pocket
between `lh_ramp_cabinet`, the ramp and the gantry plinth; `ia_lift_cage`'s lattice and floor; the "Windlass seen" beat
fired while she faces the bay's corner; the HUD mark's backing over the gun hand.

### 23.9 Polish round 5 record (cross-cutting fixer, 2026-10-06): the last round of changes

Lead rulings R1 to R13 outrank the numbers above. Edited in place: the header, 4.2 (the whole beat sheet, now measured),
10 `enc_file`. The rows below are the complete list of what this pass changed; measurements are in
`docs/INTEGRATION_REPORT.md` Part I, the log in `scratch/r5-fixer/NOTES.md`.

| Section | Was | Is now |
|---|---|---|
| 4.2 beat sheet | planned times: 21 minutes, fights of 55 to 110 s | measured times: 9.5 to 10 minutes for the plain proxy, 12 to 16 estimated for a first-time person; fights 21 to 37 s (the yard about 60 s in a whole run), boss phases 27 to 44 s and 57 to 73 s |
| 4.2, 10 `enc_street` text | `nar_street_after` "Seven of them." after eight Biders; `nar_plenty` before `nar_kneeler` | "Eight of them. She had started with six in the gun."; the kneeler line first (behind `nar_plenty` it was said after the kneeler was down). Wave A stays at 3 s: a 6 s trial took the cost out of the fight |
| 10 `enc_file` | 9 Biders: the queue of six, then three through the far door 2 s after a bang | 12: the queue of six; **two down the peg stair behind her** when she nears the far door (`sp_file_10`, `sp_file_11`, wave R, `nar_file_behind`); 4 s later the bang and 1 s after it **four** through the far door (`sp_file_12` added; `nar_file_more` says "Four more") |
| 6.5, 7.3 the Tamper | no line about the vents | `hint_tamper_vent` ("Lead rang off its plate. The vents stood open only after the blow.") after the fourth round in a row that the plate turns, once an attempt, on Easy and Normal, with hints on |
| 6.5, 8.2 the Windlass | a tin of twelve at her feet as phase 2 begins when she holds under twelve in reserve | the same again at the break into phase 3 (several runs reached it with an empty reserve) |
| 13 `kept` hint tier 1 | `nar_office` (the pay-off line of the seventh shot, spent early on a slow player) | the data for its own line exists: `hint_kept_1` ("Lead would not finish it. She had carried the other round eleven years."), named `hint1` in the bore's `lines`; **wiring it is the world's** (`src/world/kept.ts`, tier 1) |
| 18 saves | a save with a malformed `world` or `enemies` part threw inside `applySave` and was dropped with a console error and a stack | refused when read (`src/core/save.ts`): never offered as "Go on"; a save that still cannot be applied is dropped with a one-line warning |

**Not changed, and why.** The Tamper's slam wind-up (1.0 s) and the respawn into Windlass phase 2: the enemies
team's, listed for it. `BOSS.chargeRequiredAt` stays 12 s (no round-5 critic raised it; it also sets phase 3a's adds
clock). The Tally House's nine keep their seats: the rear pair of the file are not counted among them.

### 23.10 Polish round 5 record (closer, 2026-10-06): the game as handed to the player

Lead rulings R1 to R13 outrank the numbers above. Where a section quotes a number that moved it was edited in place
(6.6 rule 3, 6.8, 7.3 `slam_windup`, 8.2 hints and phase 3b, 8.3, 9.8, 12.2, 12.3, 15); the rows below are the complete
list of what the round's code and look teams changed after 23.9, and where a section above still says otherwise,
**this table holds**. Measurements are in `docs/INTEGRATION_REPORT.md` Part J; each team's own table is in
`docs/requests/<team>.md`. `design/*.json` did not change after 23.9: where a layout note still quotes an old number
(`trg_stone.endAfterSeconds` 25, `exit_rim.endsWhen`), the code's floor holds.

| Section | Was | Built |
|---|---|---|
| 5, 6.9, ART_BIBLE 8.3 idle placement | `VIEW_PLACE` (0.004, 0.013, 0.023; -7, 8.5, -14) | (0, 0.025, 0.026; pitch -7, yaw 7.5, roll -13): the view-model stands 3.5 % of the frame height higher; the thumb, the forefinger and the walnut grip are in the frame. At 720p gun + hands 11.6 to 12.2 % of the frame, the muzzle 98 px right of and 47 px below the crosshair (108 px, 15 % of the frame height, away). `VIEW_PLACE_HANDLING` y -0.04 -> -0.07: the reload, line-round and kept-round clips are drawn about 9 % of the frame height lower (12.8 to 13.4 % of the frame, the crosshair clear) |
| 6.6, 8.2 the seventh (steps 5, 6) | `stn_proven` on the shot; at phase 3b `stn_dry`, `nar_kept`, `nar_office`; "four seconds of true silence" | on the shot's tick "BORE PROVEN." over whatever is there; **`nar_kept` next, about 3.3 s after the shot** (inside the four seconds: the sound is still silent, the narrator's text is not); then `stn_dry`, then `nar_office` (about 11 s after the shot) |
| 6.8 flash | the sprite 1.6 x out on the eye-to-muzzle line of the shot's tick: on the frames after it stood below-left of the lifted barrel | placed each drawn frame on the drawn `muzzle` node's line: it rides the kick. Smoke and tracer still begin at the shot tick's muzzle |
| 6.8, 17 confirms | +2.5 / +3.5 dB lift in the hall / the bore (bought nothing: all four are at the limiter) | tick, tink, parry and kill hold 12 ms (hall) / 20 ms (bore) before decaying; the kill's thud steps the tail back in those rooms |
| 7.3 `slam_windup`, 15 | 1.0 s x the telegraph scale | 1.15 s Normal, 1.38 s Easy, 0.9 s Hard; vent window unchanged |
| 8.2 hints | T1 `nar_office` | T1 `hint_kept_1`; `nar_office` only after the proof |
| 8.2 phase 3b | the HAULING lines queued (one was announced 9.5 s after the Windlass was dead) | said only into a free line box; never after the death |
| 8.3 retry | first attack 1.5 s after the restore, health 60 | 4 s; full health on Easy and Normal |
| 9.2 / 9.3 the yard latch | `nar_first_knot` on the burst (3 s after it in play) | **said when she first looks at the latch knot** (within 26 m and 14 degrees, no fight live; `interact.ts` `KNOT_SEEN`); if she shot first it must start within 1.5 s of the burst or is dropped (`KNOT_LINE_LATE`) |
| 9.3, 9.6 quiet-after-a-fight lines (`trg_marks`, `trg_hall_diagram`) | queued whatever followed | dropped if another fight is live when their turn comes (a brisk player who shoots the latch within about 3 s of seeing it does not hear `nar_marks`) |
| 9.5 the watcher | both `nar_watcher_*` said wherever she had got to | next in line at the vignette; `nar_watcher_1` dropped once she is 10 m from the niche, `nar_watcher_2` once she is 13 m on or if the first was never shown (`VIGNETTE_NEAR`, `VIGNETTE_GONE`) |
| 9.8 leaving the stone | 25 s more than 4 m away after `nar_stone_4` | 40 quiet seconds (the clock stands while a line is on screen). No warning line exists |
| 9.8 the take | `nar_take_1` queued behind the stone's lines (19 s after the take on a quick take) | on the take's tick; no stone line after a take; the lamps' lines follow with the view eased to the town; the fire after them (take 3.5 s, fire 20.8 s, card 34.8 s on a brisk take) |
| 9.8 the rim, look | the mesa east and west a plain maroon box; the cage's rock room ink (L* 7); a 0.56 m notch in the brow; a pale pylon stump | wings of the rim's own cliff 26 m west and 33 m east (unlit cards in the backdrop); the room lit rock (walls L* 9 to 14, reveal 18 to 24) with the new sub-mood `L6c` on the cage's own parts; the notch a bite a hand deep; the stump x 0.32 |
| 9.6 the lift hall ring | level 1.5, white reveal | `RING_T` 1.0, panel joints round the ring, stained reveal |
| 12.2 HUD mark | lower right, on the gun hand; the seventh 1.5 x; reserve numeral 12 units | **lower left over the health bars**; the seventh 2 x (19 x 48 px at 720p); numeral 15 units. Under the pause the HUD's own mark is not drawn; under a full page no gauge is drawn |
| 12.2 movement cards | 3.5 s every time | once a run; cut to 1.0 s + 0.3 s fade by a fight |
| 12.3 title | Begin always chosen; one press over a save wiped the run | with a save **Go on is the chosen item and names its count**; Begin over a save asks first ("Begin?": Go on, Begin, Back); only that Begin starts a new run |
| 12.2 end card | — | under 900 px wide the ledger labels do not wrap; no checkpoint numeral behind the card |
| 19 / 21 render, High | emissives x 2 everywhere; no sheen; one bloom table; contact shade 16 taps; sun shadow square 36 m | a dense lamp set (the Windlass's gauge) held at 1.08 x the bloom threshold; a **High-only sheen** on lightmapped station faces (L3, L4, L5, L5p 2.2; L5c 1.2); bloom by mood L4 0.68, L5 0.80 / 0.45 / 0.9, L5p 0.75 / 0.45 / 1.0, L5c 0.48 / 0.45 / 1.0, L5a 0.75 / 0.40 / 0.9; the strongest contact-shade tap dropped and the shade eased in a lamp's pool; the sun shadow square 52 m |

**Rulings at the close.** The belt-and-braces moot rule for `stn_boss_hauling` / `stn_boss_indexing` once the
Windlass is dead was **not added** (the enemies no longer queue the line; an unverifiable edit to the story queue in
the last hour is the greater risk). The gun's level in the Tally House (L* 34.5 over a room of 23) stays: the test's
floor of 0.85 of the rig is not moved. The gun team's change to `tests/render/polish3.test.mjs` (the view-model
hidden while two beams are measured) and render-tech's to `tests/player/flash.test.mjs` ("at the muzzle as drawn")
are accepted: neither relaxes a bound. `BOSS.chargeRequiredAt` stays 12 s. The pocket beside `lh_ramp_cabinet` and
`ia_lift_cage`'s single-sided panels are not changed and are listed as known gaps.
