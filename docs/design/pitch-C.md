# Pitch C — DEAD PLUMB

*Stage one: "The Sounding". Angle: puzzle-and-discovery-first.*

Status: a pitch. Every number is a starting value taken from, or consistent with,
`docs/research/game-feel.md`; every look decision follows `docs/research/art-tone.md`
(palette B "Long Light", Pellam Deepworks, flame / aqua / violet). Nothing here has been
built or played. Names have had a quick web check only (section 13).

---

## 1. The pitch in one breath

**You are walking around inside a gun the size of a town. Work out how it is loaded,
cocked and fired. Then fire it at the thing that keeps it.**

Under the dry settlement of Sounding sits a Pellam Deepworks percussion bore: a forty-tonne
weight on a cable, raised and dropped to break rock for water. It has a **hammer** (the
weight), a **cylinder** (a six-station turret, one station live) and a **trigger** (three
dogs that hold the weight up). The player meets each part separately, uses each for a small
local reason — open a hatch, move a stair, cross a gap — and only later sees what those
actions did to the whole. The boss fight is the firing sequence performed under pressure.
The manufacturer's mark the player has walked past forty times (a ring, a line, a dot)
turns out to be the operating diagram.

Why this wins as a demo:

- **The puzzle language is the gun.** Six chambers, one live; cock; index; release. The
  player already knows how the machine works because they have been reloading a small one
  for fifteen minutes. No tutorial text is needed to explain the finale.
- **Every puzzle changes the world somewhere else**, and the stage loops so the player sees it.
- **It is cheap.** The whole machine is rigid-body animation: no cloth, no fluid sim, no
  new skeleton. Three humanoid enemies share one rig and wear masks. The boss is bolted to
  the floor.
- **The ending costs something** the HUD has been showing since the first minute.

---

## 2. Title, logline, tone

**Working title:** DEAD PLUMB ("dead plumb": exactly, finally vertical).
**Stage title:** The Sounding.

**Logline.** The last keeper of true measure tracks a forger of weights into a dry town
that worships the machine under its well, learns that the machine is a gun pointed at the
ground, and has to spend the one thing he swore never to fire in order to pull its trigger.

**Tone.** Patient, dry, exact. A man who measures things for a living walks through a
country where measurements have stopped agreeing. The horror is clerical: a maintenance
machine that has kept its schedule for three centuries using the townspeople as parts, and a
ledger that records it in a neat hand. Nothing screams. The loud things are the revolver,
the bells, and one very large weight. Melancholy first, dread second, spectacle last and
only twice.

---

## 3. Lexicon (original; ten terms)

| Term | Meaning | Use |
|---|---|---|
| **Assizer** | A rider of the Assize: an itinerant judge and keeper of true weights and measures. The player's title. (Real archaic English word for an officer of weights and measures; not used by the source series.) | "The Assizer" is the only name the narrator uses for the player. |
| **the Standard** | The Assizer's revolver. Six chambers: "six measures". | "The Standard held six. It always had." |
| **the Proof** | The seventh round. The Assize's master weight, cast once, as a cartridge, worn sealed on a neck-cord. Every measure in the settled lands was checked against it. Never to be fired. | Shown on the HUD from the first minute as a sealed seventh chamber. |
| **the Slack** | What has happened to the world: miles longer than they were, noon arriving late, clocks that disagree. A chain-surveyor's word for the error in a loose chain. | "The Slack had got into the road." |
| **the Lean** | The violet hairline on the horizon that rises past the top of the sky, one degree off true vertical. What the pursuit bends toward. | "The Lean stood where it always stood, a hair off true." |
| **shortweight** | Anything falsified; and specifically the clean, cold, violet-edged false metal Coyne leaves in things. Lead will not move it. | The art bible's "wrong" colour always means shortweight. |
| **the Even** | The steady tone the station sounds when all is well, and the four-note hymn the town built on it. | "They rang the Even every morning." |
| **on shift** | Taken below and kept. Those taken are **Hands**. | "Eleven went on shift. Nine came up." |
| **bellplate** | Pellam strike-enamel. It does not dent; it rings, and sends a bullet on at the angle it came. | Pictogram: an arrow meeting a plate and turning. |
| **fair measure** | The Assize's courtesy, offered before judgment or violence. Reply: "and full." Oath: "by weight and by line." | Used three times in the stage, twice by Coyne, mockingly. |

Proper names: **Sounding** (the settlement; a sounding is a depth taken with a plumb line),
**Coyne** (the pursued), **the Tender** (the boss), **Pellam Deepworks** (from the art brief).

The shootable language follows from the Pellam mark: **a lit dot inside a dark ring answers
a bullet.** Every puzzle target and every enemy weak point is that shape — a pale enamel
disc, dark bezel, aqua centre lamp — and nothing else in the game is.

---

## 4. The player, the pursuit, the cost

**Backstory (143 words).**
The Assize kept the measures of the settled lands: the yard, the pound, the hour. Its riders
carried them to the edges and judged by them. Then the measures began to disagree. Rods in
the vault were found filed short and weights recast light, the work of years, and the vault's
own keeper, Coyne, was gone west toward the Lean with the master rods. The Assize sent
riders after him. That was eleven years ago. One rider is left. He carries a revolver called
the Standard and, sealed on a cord at his neck, the Proof: the last weight nobody has
touched. He does not know whether Coyne broke the measures or only noticed first that they
were breaking. He intends to ask. Coyne is two days ahead, unhurried, and leaves a tin of
cartridges at every cold camp, which is an insult.

**What he pursues.** Coyne, and behind Coyne the Lean. In this stage: the trail runs
through Sounding and Coyne has stopped there long enough to do something to the well.

**What the stage costs him.** The Proof. Coyne has jammed the machine's trigger with a wedge
of shortweight that only the Proof will break. To end the town's three-hundred-year shift
the Assizer has to fire the one true thing his order has left, on Coyne's invitation,
knowing it is what Coyne wants. He comes out with six ordinary rounds, no reference, and —
in the last ten seconds — a reason to doubt the reference was ever sound.

---

## 5. The machine (the thing the whole stage is)

```
 surface ───────────[ THE STEEPLE: headframe, town wind-pump bolted on ]────────────
                         │ hammer cable                 │ cage rope
  WINDING HOUSE ─ drum ──┤  brake  <-- P1 the Even      │
  (the chapel)           │                           [ CAGE ] rides DOWN ...
                         │
                     ══ three DOGS (the sear) ══  <-- P3, Sear Gallery
                        [    THE BOB    ]         ... and the HAMMER rides UP
                        [  40 t, 9 m    ]
  ── hall dome ──────────▽──────────────────────────────────────────────────────────
                         F   firing position
           TURRET: six stations on a ratchet, one LIVE  <-- P2, the Collar
  ── hall floor ─────────◎──────────────────────────────────────────────────────────
                         │ bore
                         ▼ water, a long way down
```

Four rules. The player discovers them in this order and is never told them in a list.

1. **The cage is the counterweight.** When the cage goes down the hammer comes up and
   latches on the dogs. Every shift that ever rode down cocked the gun.
2. **The turret has six stations and turns one click per strike on a pawl plate.** Five
   stations are anvils for a dry stroke. One is the live port: an open bore.
3. **Three dogs hold the hammer.** Each opens for five seconds when its keeper is struck and
   then closes. All three open at once and the weight goes.
4. **Live station under a raised hammer, three dogs open: one stroke.** The station has
   exactly one left in it ("ONE STROKE REMAINS").

The Tender, the station's custodian machine, has rooted itself in the live port. It keeps
the hammer exercised and never lets it fall. Coyne's wedge sits in the third dog.

---

## 6. Beat sheet

Times are for a median first-time player (about 23 minutes; a confident player finishes in
16–17). Intensity 0–10.

| # | Minutes | Zone | Beat | Int. | New thing |
|---|---|---|---|---|---|
| 1 | 0:00–1:20 | Cut | Cold camp under the overhang. Step out of black into the valley: Steeple, pylon line, the Lean. Title card "I. THE CUT". | 1 | move, look, the goal, the Proof on the HUD |
| 2 | 1:20–2:30 | Cut | The tally bar: a Pellam gate that wants seven strikes. First shot by 2:00, first reload by 2:20. | 2 | fire, reload, "lit dot answers a bullet", first bellplate ring |
| 3 | 2:30–3:30 | Sounding | The street. A masked figure sweeps a porch and does not look up. | 2 | first Hand, shown harmless |
| 4 | 3:30–5:30 | Sounding | Fight 1: Hands, one, then two, then three. First kill by 4:00. | 4–5 | Hand (rusher) |
| 5 | 5:30–7:00 | Sounding | The square. Troughs painted with the mark. A wind-pump bolted to nothing. A Riveter up the Steeple, riveting the same plate over and over. Secret 1. | 2 | story through place, Riveter shown safe |
| 6 | 7:00–9:00 | Sounding | Fight 2: Riveter at range alone, then a second on the chapel roof with Hands. A missed rivet rings the porch bell. | 6 | Riveter (marksman); "bells ring when hit" |
| 7 | 9:00–11:15 | Winding House | Threshold. Pews facing a winding drum. **Puzzle 1: the Even.** | 2–3 | tone-and-order puzzle |
| 8 | 11:15–12:00 | Winding House | Fight 2b: the bell called the shift, and the shift comes. Masked silhouettes file into the blazing doorway. | 5 | "solve, then ambush"; flashbulb shooting |
| 9 | 12:00–12:45 | Winding House | Vestry: cold camp, the Roll of the Shift, Coyne's second tag. The altar is a cage gate. Checkpoint. | 1 | the found account |
| 10 | 12:45–14:00 | Throat | The cage ride. He goes down; across the dome the hammer comes up. Lobby; the deflector corridor (a twenty-second bank-shot lesson). | 3 | rule 1, bellplate as a tool |
| 11 | 14:00–16:15 | Collar Hall | Fight 3: the Yokeman alone, then with Hands and a Riveter on the high stub. | 7 | Yokeman (brute), bank shot in combat |
| 12 | 16:15–18:30 | Collar Hall | **Puzzle 2: the Collar.** The status board. "It had never been a prayer." | 3 | rule 2; the mark is a diagram |
| 13 | 18:30–20:15 | Sear Gallery | The look down: six chambers seen end-on. **Puzzle 3: the Dogs.** Coyne's wedge and third tag. | 2–3 | rules 3 and 4; the story peak |
| 14 | 20:15–20:45 | Collar Hall | Ladder down (loop closes). Shift locker, full resupply, checkpoint. The Even goes flat. | 2 | calm before; "if the tone changes, leave" |
| 15 | 20:45–24:15 | Collar Hall | **Boss: the Tender**, three phases. **Puzzle 4: the Stroke** is the fight. | 8 / 9 / 10 | everything, combined |
| 16 | 24:15–25:45 | Hall, then Sounding | Silence. Water. The long stair and the time slip. Blue hour. The true line against the Lean. The second Proof. A fire kindles on the plain. | 1 | the hook |

```
 10 |                                                               ####
  9 |                                                           ########
  8 |                                                        ###########
  7 |                                   ######               ###########
  6 |                 #####             ######               ###########
  5 |         ####    #####      ##     ######               ###########
  4 |         ####    #####      ##     ######               ###########
  3 |         ####    ########   ##  #################       ###########
  2 |   ##################################################################
  1 |########################################################################
    +------------------------------------------------------------------------ min
     0    2    4    6    8    10   12   14   16   18   20   22   24   26
beat 1  2 3  4    5   6    7    8 9  10   11     12    13  14    15     16
```

Shape: three rising combat peaks (5, 6, 7), each followed by a longer and more interesting
quiet than the last, because the quiets are where this pitch lives. The two-and-a-half
minutes of puzzle and revelation before the boss (beats 12–13) are deliberately the longest
calm in the stage: the player walks into the fight knowing exactly what has to happen and
dreading the last step. The research's "gauntlet" beat is cut and replaced by Puzzle 3;
the doorway ambush (beat 8) keeps the middle from going slack.

Combat totals: about 31 enemies plus the boss. Never more than 8 alive.

---

## 7. Zones

Footprint: about 90 m × 230 m on the surface; everything underground sits beneath the
square. Travel is roughly west, toward the Lean; the sun is ahead-left, 14 degrees up.

### Z1 — The Cut (exterior approach)

- **Purpose.** Arrival, goal, the gun. The Searchers shot.
- **Size.** A quarried cutting 90 m long, 8–14 m wide, walls 10–12 m, opening on the valley rim.
- **Landmark.** The tally bar: a Pellam weigh-gate four metres tall and half buried, with
  seven lamps and one strike disc. Beyond it, the first full view: Sounding, the Steeple,
  dead pylons walking west, the Lean.
- **Light.** Starts in the black shade of an overhang (palette A glare as the player
  steps out, settling to Long Light within thirty seconds).
- **Does.** Reads Coyne's first tag at a two-day-old fire. Takes the tin of cartridges.
  Walks out. Shoots the gate seven times: six, reload, one. The enamel face of the gate
  sends a visible tracer skipping off into the wall with a clear bell note if struck off the disc.
- **Learns.** A lit dot in a ring answers a bullet. Things here want seven and the gun
  holds six. Pellam enamel rings and throws a bullet. Where he is going.

### Z2 — Sounding (exterior settlement)

- **Purpose.** Frontier surface, first two fights, the seam between town and machine.
- **Size.** One street 60 m × 9 m into a square 26 m across; seven leaning buildings (three
  enterable as open-fronted shells for cover); a far gate, shut, on the west side.
- **Landmark.** The Steeple: a 30 m Pellam headframe, exact and pale, with the town's
  crooked wind-pump bolted to its side. The pump turns. Its rod goes down and taps a pipe.
- **Light.** Long Light. Shadows of the Steeple and the porch posts lie across the street
  toward the player and mark the cover.
- **Does.** Watches a Hand sweep a porch. Fights Hands that come from under porches and out
  of a dry trough. In the square, picks a Riveter off the Steeple platform, then fights a
  mixed wave. One Riveter's first shot is scripted to miss and ring the bell on the chapel porch.
- **Learns.** Every trough and door carries the Pellam mark, painted badly by hand, as a
  sign for water; no trough is wet. The wind-pump does nothing. The hammer cable is taut
  and the cage rope is slack. The townspeople are still here, in a sense, and still tidy.
- **Wrong details (one per look).** The swept porch. Six lanterns on the street lit in
  daylight, in a row. The wind-pump's vane points into the wind (Secret 1: shoot its
  lashing; it swings true and points at a roof cache).

### Z3 — The Winding House (building interior)

- **Purpose.** Threshold, Puzzle 1, the found account, the door down.
- **Size.** Nave 14 m × 9 m, 7 m to the trusses; vestry 4 m × 4 m.
- **Landmark.** A chapel built inside a machine room. Pews face a Pellam winding drum three
  metres across. Offerings — cups, a child's shoe, tallies — sit on its brake housing under a
  blinking four-segment lamp. The altar rail is a cage gate.
- **Light.** Long Light interior: brown-black, slatted shafts with dust, exposure up a stop
  so the doorway behind burns peach-white. Every shot is a flashbulb.
- **Does.** Solves the Even. Holds the doorway against the shift. Reads the Roll and Coyne's tag.
- **Learns.** The hymn is a machine code and ringing it was how the town sent people down.
  The Roll of the Shift counts them: fewer come up each year, then none, then no entries.
  The last hand in the ledger is not the same hand as the rest.

### Z4 — The Throat (descent)

- **Purpose.** Mood turn, rule 1, the arena shown before it is an arena, bank-shot lesson.
- **Size.** Cage 2.4 m × 2.4 m; ride of 50 m (25 s). The last 14 m run down the inside wall
  of the hall dome behind a grille. Lobby 6 m × 5 m. Deflector corridor: an L, 12 m + 8 m,
  2.4 m wide, 2.6 m high.
- **Landmark.** The bob. Nine metres of dark steel with stencilled capitals — PERCUSSION
  HEAD / STAND CLEAR OF THE BORE — lifting off the turret and rising to the ceiling at exactly
  the rate the cage sinks.
- **Light.** Underground palette: cold, aqua strips in receding rows, deep blue fog so the
  far side of the dome dissolves. The only warm light the player has is the muzzle.
- **Does.** Strikes the DOWN disc. Rides. Watches a row of Hands on the hall floor, standing
  at their stations facing the turret, turn their masks up together to watch the hammer
  rise and then turn them to the cage. Hears three great clacks overhead. In the corridor,
  opens a door whose disc is round the corner by banking a shot off the plate at the bend
  (the disc's glow is baked onto the plate; the pictogram is on the wall).
- **Learns.** Going down raised it. Whatever it is, he has just set it. Enamel turns a bullet
  where he wants it.

### Z5 — The Collar Hall (machine hall; later the boss arena)

- **Purpose.** Release after compression; Fight 3; Puzzle 2; the boss.
- **Size.** Round, 30 m across, dome 14 m. Turret 14 m across, flush with the floor, six
  stations at 5.5 m radius.
- **Landmark.** The turret. Five anvil drums (2 m wide, 2.6 m tall: full-height cover that
  moves) and a sixth station occupied by a shrouded column, clean where everything else is
  dusted, with a hairline of violet in one seam. Above the north station the shaft mouth,
  ringed in aqua, with the point of the bob hanging in it; on that ring, 14 m up, three
  discs — two lit aqua, one violet — that mean nothing yet. On the north wall, the status
  board: the Pellam mark three metres tall with six lamps round its ring.
- **Light.** Six-fold symmetric aqua strips (so the baked turret is correct at every click).
- **Does.** Kills the Yokeman by baiting it into an anvil or banking a round into its back.
  Turns the turret to bring a stair to a door. Reads the board.
- **Learns.** Six stations, one live, one click per strike. The first click he ever makes
  carries the shrouded column under the hammer and the station objects, calmly.

```
                      N   status board
                    F = 0   <- under the hammer
              5  .         .  1
   -1 plate  |    TURRET    |  +1 plate
   (behind   |   14 m dia   |  (in plain view)
    panel)    4  .         .  2
                      3   <- high door stub, 6 m up
                      S   entrance from the corridor
```

### Z6 — The Sear Gallery (interior, above the dome)

- **Purpose.** The revelation, Puzzle 3, the cost made explicit.
- **Size.** A ring catwalk 1.6 m wide at 6.5 m radius round the shaft, 20 m above the hall
  floor, reached by a 14 m dog-leg stair behind the high door. Two gaps of 3 m.
- **Landmark.** The bob at arm's length, and the three dogs under its shoulder. Looking down
  the annulus: the turret seen end-on, six circles in a ring, one of them under his feet.
- **Light.** Darkest space in the stage. Aqua from below, up through the gap, on the
  underside of everything. One violet glint: the wedge.
- **Does.** Opens two dogs to bridge two gaps, the second with a bank shot. Reaches the
  third, which will not open. Reads the tag tied to the wedge. Takes the ladder down.
- **Learns.** It is a gun. He is the only one in three hundred years who would recognise
  one. The trigger is jammed with shortweight and Coyne knows what he carries.

### Z7 — Sounding at blue hour (epilogue; Z2 reused)

- **Purpose.** The ending image and the hook.
- **Size.** The square and the far gate only (about 40 m × 30 m walkable).
- **Landmark.** The cable, now hanging dead straight down the well; behind it, the Lean.
- **Light.** Palette C by sky, fog and grade swap over the Z2 geometry. Water planes in
  every trough. One orange fire, far out, lit while the player watches.
- **Does.** Walks. Looks. Picks something up.
- **Learns.** Section 11.

---

## 8. Puzzles

Shared rules (from the game-feel brief): one-room rule; state always visible on lamps and
audible as tones; wrong inputs do something harmless and informative; no combat during a
puzzle; a self-refilling cartridge source within 10 m (Coyne's tin on the surface, a shift
locker below); hint timer counts only stalled time in the zone and resets on any correct
step. Tiers: **T0** composition, **T1** 60 s wordless nudge, **T2** 120 s narrator names the
goal, **T3** 210 s narrator names the action plus an outline pulse, **T4** 300 s the
fail-safe: the puzzle quietly relaxes so that no player can remain stuck.

### Puzzle 1 — The Even (Winding House). Observation + order.

- **Premise.** The brake on the winding drum listens for four tones. The town rang them
  every morning to call the cage and called it a hymn.
- **Elements.** (a) The brake lamp: four stacked segments that play the sequence every eight
  seconds, each segment with its own pitch, low at the bottom. (b) Three Pellam insulators
  hung from the truss as bells, plainly different in size, stencilled 1, 2 and 4. (c) An
  empty hook between them, lit by a slat of sun. (d) Bell 3, hung on the porch as the town
  bell, framed dead centre in the open doorway behind the player. (e) A hymn-board by the
  door: four painted circles of different sizes in order, the last with a little roof over it.
- **Mechanics.** Shooting a bell rings it and swings it. The right next bell latches its
  lamp segment with a chime. A wrong bell gives a flat buzz and drops the latched segments.
  No timer.
- **Solution.** 2, 4, 1, then turn round and ring 3 through the doorway at 18 m. The brake
  lets go, the drum turns a quarter, dust comes down through the shafts, the cage gate opens.
- **Teaches itself by.** The lamp is the only aqua thing in a brown room and sings as the
  player walks in. The bells are in the one shaft of light. A rivet rang the porch bell in
  the fight outside two minutes earlier. Size, numeral and lamp height carry the order
  for anyone playing without sound.
- **Hints.** T1: the rope of the next correct bell sways and the bell hums its note. T2:
  "Four notes. The house wanted them in its own order." T3: "The lamp sang the order. The
  bells were numbered. One had been carried out to the porch." T4: order is no longer
  enforced; any four different bells release the brake.
- **Hinge.** The Even carries. Ten seconds later the shift answers it (beat 8).

### Puzzle 2 — The Collar (Collar Hall). Environmental logic.

- **Premise.** A service stair stands on turret station 2. The only door onward is 6 m up
  the south wall. Bring the stair to the door.
- **Elements.** The +1 pawl plate on the east wall (a 1.2 m strike disc, lit, with a cable
  running visibly from it down to the turret race). A −1 plate on the west wall, hidden
  behind an enamel panel hanging by one bolt, its cable also visible. A fallen duct across
  the turret's path between positions 2 and 3. The status board, whose six lamps show where
  the live station is.
- **Mechanics.** Each strike on a plate turns the turret one station (1.2 s, with a ratchet
  sound the player will recognise from their own reload). Anything riding the turret rides.
  If the stair meets the duct it clangs and the turret settles back one click.
- **Start.** Stair at position 1. Door at position 3. Live station at 5.
- **Solution.** The short way (+1, +1) is blocked at the duct. Shoot the bolt on the west
  panel; it falls and rings; the −1 plate is behind it. Go the long way round: from 2,
  five clicks back; from 1, four. A full cylinder, more or less.
- **What it shows on the way.** The first +1 click puts the live station at 0, under the
  hammer. The board flashes; the station says, evenly, "LIVE CHAMBER AT FIRING POSITION.
  HAMMER RAISED. THIS IS NOT AN EXERCISE CONDITION." Then the player clicks it away again
  without understanding. They will remember.
- **Hints.** T1: the hanging panel creaks and its bolt catches the light; the hidden plate's
  cable sparks along its run. T2: "The stair wanted to stand under the door. Something would
  not let it pass." T3: "There was a second plate behind the hanging panel. One bolt held
  it." T4: the next clang against the duct shakes the panel down by itself.
- **Payoff line (on the board, once solved).** "A ring with six stations and one of them
  lit. A line. A weight. It had never been a prayer. It was a diagram."

### Puzzle 3 — The Dogs (Sear Gallery). Timing + bank shot.

- **Premise.** The catwalk round the shaft is broken in two places. The dogs that hold the
  hammer, when they swing open, lie flat across exactly those gaps.
- **Elements.** Three dogs with three keepers (strike discs) and a three-lamp tally over the
  stair head. Dog A's keeper is in plain view across the shaft. Dog B's keeper is behind the
  bob from anywhere the player can stand; a bellplate with the deflector pictogram is on the
  wall opposite. Dog C's keeper is dark, with a clean violet-edged wedge driven through it
  and a tin tag on a ribbon.
- **Mechanics.** A struck keeper opens its dog for 5 s (a tick that quickens, then a slam),
  lighting one tally lamp. An open dog is a 1.5 m wide bridge with a rail. A dog that closes
  with the player on it carries them back to where they started; nothing here kills.
  Bank shots snap to a strike disc within 5 degrees of the true reflection.
- **Solution.** Shoot keeper A, cross. Bank a round off the bellplate into keeper B, cross.
  At C, shoot the wedge: a violet spark, a dead clank, the round skips away. Read the tag.
  Most players will then open A and B together to see what happens: the tally reads two of
  three and the station says "SEAR: TWO OF THREE. HOLDING." That is rule 3, learned by
  trying to break it.
- **Hints.** T1: the bellplate rings faintly and glints. T2: "The second keeper sat behind
  the weight. He could not see it from any place he could stand." T3: "Pellam enamel turned
  a bullet. There was a plate on the wall for that." T4: the bob's slow sway widens until
  keeper B shows past its edge for two seconds in every six.
- **Exit.** A drop-ladder to the hall floor: the loop closes and stays open as a shortcut.

### Puzzle 4 — The Stroke (the boss fight). Synthesis.

The three earlier answers performed in order, under fire, plus one step the player has
been dreading. Detailed in section 9. Its hint path is the station's own status voice,
which calls every state change aloud, and the narrator at the usual tiers.

### The 20-second lesson — the deflector corridor (not counted)

An L-shaped corridor, a shut door at the far end whose disc faces round the corner, a
bellplate at the bend with the disc's glow baked onto it, and a pictogram. One shot. It
gates on the skill so that Puzzle 3 and the Yokeman never have to explain it.

### Secrets (attention only; each gives a story scrap and 12 rounds)

1. The wind-pump vane that points into the wind (Z2).
2. One anvil drum's stroke counter reads zero while the rest read thousands; its inspection
   disc opens a locker with a Pellam memo: "ONE STROKE REMAINS. DO NOT EXERCISE ON LIVE CHAMBER." (Z5)
3. From the gallery, the dead seventh lamp on the status board can be struck by a bank shot
   down the shaft. It lights. The board was built for seven. (Z6)

---

## 9. Enemies and boss

All three archetypes are townspeople kept **on shift**: work-coats, a blank celadon Pellam
dust-visor with one horizontal slot (no face, no eyes), and a collar with an aqua lamp at
the throat. One shared skeleton, three proportions. Outdoors they are dark shapes on bright
sand; underground the visor and collar are the pale, lit things the eye finds. They do not
speak. Each has four or five synthesized calls — shift-whistle chirps, a held breath, a
ratchet — that are captioned. When one dies its collar lamp goes out before it hits the ground.

| | **Hand** (rusher) | **Riveter** (marksman) | **Yokeman** (brute) |
|---|---|---|---|
| Asks | Can you count to six while backing up? | Can you aim while something is in the air? | Can you stop shooting the front of it? |
| Silhouette | 1.4 m, hunched, a pry-bar held low; reads as a comma | 1.9 m, thin, a long spike-setter held upright; reads as an exclamation mark | 2.4 m × 1.6 m, a man inside a Pellam load-frame with enamel plates in front; reads as a door |
| Behaviour | Does chores until roused. Closes at 5.8 m/s, circles when it has no attack token | Holds a firing point at 12–25 m, relocates after two shots, backs off inside 8 m | Walks at 2.5 m/s, slams, or charges in a straight line at 9 m/s |
| Attack | Lunge, 1.8 m, 18 dmg | A hot rivet: a visible flame-orange bolt at 18 m/s, 22 dmg | Slam, 3.5 m radius, 38 dmg; charge, 35 dmg |
| Telegraph | 0.5 s crouch and a rising chirp | 0.9 s: tool levelled, a glint at the muzzle, a climbing tone; the visor holds dead still for the last 0.4 s | Slam: 1.0 s, frame arms raised, throat lamp exposed. Charge: 0.8 s, one foot scraped back, a ratchet wind |
| Shots | 1 anywhere | 2 body, 1 visor | Plates ×0.25 (grey spark, clank, no marker). Back power-disc ×2: three hits. Throat lamp during the slam wind-up: one hit staggers 1.5 s |
| Killed well | During the crouch, at four metres, so the body is thrown back into the next one | A visor shot in the still 0.4 s. Or any hit while it aims: the aim breaks and the tell restarts — the revolver as a parry | Step aside from the charge so it hits an anvil drum and stands stunned for 2 s with its back to you. Or stand still and bank one off the bellplate behind it |
| Alive at once | up to 5 | up to 2 | 1 |

First appearances are all safe: the sweeper on the porch; the Riveter on the Steeple
riveting one plate forever; the Yokeman seen from the cage, carrying an anvil part across
the hall. Tokens, spawn rules and morale break (Hands hesitate two seconds when the Yokeman
falls) are as in the game-feel brief.

### Boss — the Tender

**What it is.** The station's custodian: a segmented Pellam column six metres tall when it
stands up out of the live port, with two long service arms and, behind a shutter, a face
that is a pressure gauge. Every other dial in the station stopped at the same reading long
ago. The Tender's needle moves, and it is the boss's health in the world (a HUD bar with
three pips repeats it). It is rooted in station 6 and **rides the turret**: where the live
station goes, it goes. It speaks procedure in a calm synthesized voice that detunes as the
violet spreads through its seams.

**Why it is here.** It has kept Bore Station Six at readiness for 4,112 months past its
service interval, exercising the hoist daily with the labour available, and conserving the
last stroke by sitting in the chamber it would be fired through.

**Arena.** The Collar Hall. Five anvil drums as moving cover; the duct it tears down in its
first move becomes a sixth piece; two shift lockers; pawl plates east and west; and the
three keepers, repeated as discs on the ring of the shaft mouth 14 m overhead (the two aqua
dots and the violet one the player has been walking under since beat 11).

**Build-up and reveal.** As the player steps off the ladder the Even drops a semitone. The
shroud on station 6 splits. First act, before any attack: it turns the turret two clicks to
carry itself from position 1 to position 3, as far from the hammer as it can get. "It moved
itself out from under the weight. That was the first thing it did."

| Phase | The player's job | The Tender's attacks (tell) | How it is hurt |
|---|---|---|---|
| **1. Exercise** | Learn it. | **Sweep**: an arm drawn back, rising tone, 1.2 s; a 9 m arc that an anvil drum stops dead. **Rivet fan**: shutter opens, glint, 0.8 s; five slow bolts. | After each fan the shutter stays open 3.5 s to vent: the gauge face is a ×2 weak point. Nine hits. |
| **2. Index** | Bring station 6 to position 0. Three clicks, either way. | Adds: Hands in twos. One arm grips the turret brake, so the pawl plates go dark. **Counter-index**: a 1.5 s ratchet wind, then it turns itself one click back. | Three hits on the gripping arm's elbow disc and it lets go for 8 s: the plates light, and every strike on a plate is a click. A hit on the elbow during the ratchet wind cancels the counter-index. Arriving at 0, the station's own turret stop drops — exactly as a revolver's cylinder locks at full cock — and the Tender cannot leave. |
| **3. Release** | Pull the trigger. | Violet. Both arms, sweeps 20 % faster, a ring of rivets. One Riveter on the stub. It can no longer reach the south half of the hall. | Three gauge hits jam the shutter and stagger it for 6 s. In that window: keeper A, keeper B, and the Proof into the wedge at C. |

**The kill.** With the third dog open the hammer drops — one metre. The Tender has put both
arms up and caught it. Forty tonnes, held over its own head, arms shaking, shutter jammed
wide, the gauge needle hard over, its voice saying "HOLDING. HOLDING." The player has about
eight seconds and whatever is in the cylinder: six hits on the gauge face are needed, and
two rounds have just gone into the keepers. Four, a two-round reload, two more; or load
full and fan the hammer from underneath it. The sixth hit breaks the glass at 0.2× time.
The Proof pulled the trigger; the Standard does the killing. The arms fold. The hammer goes through the Tender, through
the live port and down the bore, and every lamp in the hall goes out.

If the player runs out of time, the Tender heaves the weight back onto dogs A and B. C stays
open for good. The retry is A, B, six shots.

**Fairness.** Checkpoint at each phase; retry in under three seconds with the intro skipped.
Largest single hit 38. Every attack has a pose and a sound. After two deaths in one phase:
damage ×0.85, the counter-index happens half as often, and the dog window becomes 7 s,
silently. Roughly thirty purposeful shots across the fight, of which about ten are aimed at
the machine rather than the boss. The station voice calls every state: "BRAKE RELEASED",
"TURRET LOCKED FOR STROKE", "SEAR: TWO OF THREE".

---

## 10. The secondary: the Proof (one round)

The only special ammunition is a single cartridge.

- **On the HUD from the first minute:** six chamber pips drawn as a cylinder, and beside
  them, apart, a seventh with a seal across it. The narrator mentions it once at the first
  camp and the game does not mention it again until the gallery.
- **How it works.** It cannot be loaded until the player has put a lead round into the
  wedge and seen it fail. After that, holding the Proof key for 1.4 s breaks the seal and
  seats it (a unique animation: thumb through wax, the round turned once in the light). It
  fires only when the trigger is pulled with the wedge under the crosshair; at anything
  else the gun fires lead. It cannot be wasted, so it cannot soft-lock the stage.
- **The shot.** The heaviest report in the game, a white tracer, 0.2× time, the wedge going
  from violet to white to nothing. Then the seventh pip on the HUD is an empty ring for the
  rest of the fight.
- **Why it earns its place.** It is the stage's cost, and a cost has to be something the
  player has owned for a while. Twenty minutes of a sealed icon they were never allowed to
  touch makes breaking it mean something that a cutscene could not. It needs one animation
  clip, one sound, one effect and one HUD state. And it is what the hook hangs on.

Two things that are not secondaries, stated so nobody counts them as scope creep:
**fan-the-hammer** stays as the revolver's alt-fire exactly as the game-feel brief specifies
(nothing in this stage requires it; it remains the first cut); **bellplates** are a
property of one prop, costing one reflected ray and one tone.

---

## 11. The ending and the hook

1. **Dark, and four seconds of nothing.** Then, from a long way under the floor, water.
2. **The lamps come back aqua, steady.** The Even returns, in tune for the first time in the
   stage. Any Hands still standing sit down where they are. Their collars are dark.
3. **The stair.** The cage went up when the weight went down. "He climbed. It took the rest
   of the day, or it took three." Fade.
4. **Sounding at blue hour.** The troughs are full. The wind-pump has stopped. The cable hangs
   down the well dead straight: the longest plumb line in the country. If the player stands
   at the well-head and looks west, the game lets the cable and the Lean share the frame.
   They start at the same point on the horizon. They do not stay together. For eleven
   years he has taken the Lean for the one straight thing in a bent land, and now he has a
   true line to hold against it. "It leaned. It leaned more than it had."
5. **The far gate is open.** Just outside it, a cold camp, and on a flat stone, standing on
   its base, a sealed round. The same seal. Picking it up puts it on the HUD in the seventh
   place, and the seal on the icon is very slightly violet. The tag reads:
   *"For the debt. It is as true as the last one. — C."*
6. **The last image** matches the first: a dark frame, the plain, the pylons, the Lean,
   brighter now. Far out, an orange point that was not there kindles while the player
   watches. Coyne waited to see whether he would pick it up.
7. **Card.** "END OF THE FIRST MEASURE." Time, accuracy, visor shots, bank shots, secrets.

**The hook, plainly.** Only one Proof was ever cast. Either the thing in his hand is false,
or the thing he fired was, and with it everything his order ever judged by. The player
leaves wanting two things: to catch the man at the fire, and to find out what happens when
they pull the trigger on the second one.

---

## 12. Voice: sample lines

Narrator (past tense, third person, title cards and subtitles):

1. "The ashes were two days cold and banked neatly. Coyne had not hurried."
2. "Seven lamps. The Standard held six. It always had."
3. "Somebody had swept the porch that morning. Nobody had lived there in his lifetime."
4. "They had painted the mark on every trough. It had not brought water."
5. "He went down and the weight went up. It seemed a fair trade, and he distrusted it."
6. "Six chambers and one of them live. He knew that arithmetic."
7. "From above it was plain. He had been walking around inside a gun."
8. "He broke the seal with his thumb. Eleven years, and it took no effort at all."
9. "The cable hung dead plumb. Behind it, the Lean did not."

The station and the Tender (synthesized tones, captioned in capitals):

- "BORE STATION SIX. HAMMER RAISED. LABOUR ABSENT."
- "SERVICE INTERVAL EXCEEDED BY 4,112 MONTHS. RESUMING."
- "LIVE CHAMBER AT FIRING POSITION. THIS IS AN ERROR. THIS IS AN ERROR."

Pellam signage: "STAND CLEAR OF THE BORE." / "EXERCISE THE HOIST DAILY." / "ONE STROKE REMAINS."

The Roll of the Shift (ledger, vestry): "Rang the Even at first light. Cage came. Eleven
went on shift. Nine came up. Good water." And forty pages on, in a different hand: "Rang.
None to go down. It came for us anyway."

Coyne (stamped tin tags on violet ribbon, the only clean things in the stage):

- "Fair measure, Assizer. Two days. You are gaining, but the miles are not what they were. — C."
- "Lead will not shift this. You carry the one thing that will; I weighed it myself, once.
  Spend it or keep it. Either way I learn what you are. — C."

---

## 13. Risks to build (honest)

1. **The turret is a moving floor.** Player, enemies and corpses ride a 14 m platform that
   rotates 60 degrees in 1.2 s. That needs platform-carry in the character controller and
   an answer for AI pathing during a click. Mitigations: everything on the turret "braces"
   (no steering) for the 1.2 s; the navmesh is identical at all six positions by symmetry;
   baked lighting stays valid because the hall is lit six-fold. Still the single riskiest
   system in the pitch. Fallback: the turret race is a walkway nobody can stand on.
2. **The boss is a state machine layered on a boss.** Brake arm, pawl plates, counter-index,
   turret stop, dogs, wedge, catch. If state is not instantly legible the fight becomes
   "what does it want from me". The status voice, the board and the lamp tallies have to be
   finished, not placeholder, before the fight can be judged. Cut line: drop the
   counter-index (phase 2 becomes "free the brake, click three times").
3. **Bank shots in first person are fiddly.** The 5-degree snap, big plates fixed at
   45 degrees and the corridor lesson should make them reliable; they have not been tested.
   Cut line: Puzzle 3's second keeper becomes a timing shot past the swaying bob (already
   the T4 fail-safe) and bellplates become flavour.
4. **A tone puzzle with synthesized audio** must be solvable with the sound off. It is
   (size, numeral, lamp height), but the bells need to look as different as they sound.
5. **It is light on shooting.** About 31 enemies in 23 minutes, three fights and an ambush
   before the boss. That is the intended trade for this angle, but a critic who came for a
   shooter may find beats 12–13 long. The scope valve runs the other way from the other
   pitches: add a wave to Fight 3 rather than cut a puzzle.
6. **Vertical aiming under pressure.** Keeper discs 14 m overhead while a boss swings at
   you. The 6 s stagger and the out-of-reach south half of the hall are meant to make this
   calm; if playtests say otherwise the stagger lengthens and the discs grow.
7. **The cage ride** is 25 s of scripted moving platform past moving scenery. If it judders
   at 35 fps it is worse than a staircase. Fallback: a stair with three grilled windows.
8. **The revelation depends on art.** "It is a gun" must be readable from the gallery in one
   look: six circles in a ring, seen end-on, with clean silhouettes in fog. If the turret is
   noisy or the fog too thick, the central idea of the pitch does not land and the narrator
   has to say it, which is weaker.
9. **The Proof is a scripted beat** dressed as an ammo type. Some players will feel the
   hand of the designer when it will not fire at anything but the wedge. I think that is the
   right trade against a soft-lock; a critic may disagree.
10. **The epilogue reuses a late-afternoon bake at blue hour.** Shadow directions will be
    wrong for the new sky. The art brief accepts this as on-theme; a small second bake of the
    square is the alternative and costs texture memory.
11. **Length.** 23 minutes median is near the top of the brief. First trims, in order: the
    second gap in Puzzle 3; the second wave of Fight 2; Secret 3.
12. **Homage drift and names.** A pursuer, a pursued who leaves notes, a line of pylons and
    a far vertical goal are the art brief's sanctioned motifs, but together with a
    "forbidden round" they should be re-read against the blocklist by someone other than me.
    No player-facing text here uses a blocked term, the number on the Tender's interval was
    chosen to avoid the flagged ones, and "diagram" is used where "drawing" was tempting.
    "Dead Plumb" returned no existing game in a quick search and "assizer" is a real archaic
    word; neither has had a proper trademark check. "Coyne" is unchecked.

Budget sanity (estimates, not measurements): hall worst case — shell 1, turret 1, anvils 1
(instanced), stair 1, bob and cable 1, dogs 1 (instanced), lamps 1 (instanced), plates and
board 2, Tender 8 rigid parts, 4 enemies, viewmodel 3, effects about 12, HUD and post 4:
about 40 draw calls, under 60k triangles. The surface and the underground never draw
together; the cage ride is the seam.
