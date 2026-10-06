# Pitch B — THE KEPT ROUND

Angle: **gunplay and encounters first.** The revolver is the protagonist. Every zone exists
to stage one distinct gunfight, and the story is told by what the gun is asked to do.

Status: a competitive pitch, not a GDD. Numbers marked *(feel spec)* come straight from
`docs/research/game-feel.md` section 9 and are not re-argued here. Everything else is this
pitch's proposal. All names and lines are original; the lexicon was checked against the
blocklist in `docs/research/art-tone.md` 1.5 and the series' official glossary (no hits; two
near-misses are listed under Risks).

---

## 1. The pitch in one screen

**Working title:** THE KEPT ROUND (stage title: *First Tally: Plenty*). Fallback title: KEEP SEVEN.

**Logline.** The last sworn gun-reeve carries six rounds for the work and a seventh she has
vowed never to fire. She tracks a patient well-spoiler through a dried-out town and down into
the humming machine underneath it, where every fight asks her to count to six and the last
one asks for seven.

**The hook in one sentence.** The man she is chasing always leaves her *one more than she
carries*: seven jugs on a gate, seven things in a street, Lift Station 7. The whole stage is
built on the arithmetic of a six-shot cylinder, and it ends when the player loads the round
that has sat sealed beside the cylinder on the HUD since the first frame.

**Tone.** Dry, practical, unhurried. The loudest thing in this world is your gun, and the
world goes quiet again after it in a way that feels like judgment. The horror is courteous:
people who sat down to wait, machines still doing a job nobody needs. Melancholy, never
grimdark; no gore, no jokes. The narrator counts things (rounds, days, jugs) and states the
worst of them most plainly.

**What it feels like to fight with six heavy shots.** You are never spraying. You pick a
target, the crosshair is honest, the hammer falls, and the thing you chose stops being a
problem: a hooded runner folds like an empty sack, a machine's lens rings like a struck
glass bell. Half a second later the cylinder has turned and you choose again. After six
choices you are a person holding a piece of warm iron for two and a half seconds, and the
arena was built around where you will be standing when that happens. The fights are not
about aim alone. They are about **which six**, and **where you reload**.

### Five gun rules this pitch holds itself to

1. **One cylinder is always enough for one thing.** No non-boss enemy survives six well-placed
   rounds; most die to one or two. Difficulty never changes shots-to-kill *(feel spec)*.
2. **A shot is a verb, and there are four verbs.** Kill (a body), break (an aim: the revolver
   is a parry), open (a mechanism), answer (a machine's question). The player learns them
   in that order.
3. **The world rhymes with the cylinder.** Six chambers, six ribs in the boss room, six lamps
   on the boss's face. The player's eye is trained to count sixes, so a seventh is felt.
4. **Reload is where the fear lives.** Every arena has an obvious place to reload (full-height
   cover within 6 m) and one stretch where there is none. Enemy pressure is timed to the
   2.45 s reload, not to hit points.
5. **No bullet produces nothing.** Kill, stagger, interrupt, spark-and-clank, pour sand, ring a
   bell. Every wrong puzzle shot does something harmless and informative.

---

## 2. Lexicon (original to this project)

| Term | Meaning in the world | Use in the game |
|---|---|---|
| **Reeve** | A sworn gun-officer of the Assize, a court that rode circuit and judged water rights. (An old English word for a local officer; here it is a title.) | The player's title. The narrator says "the Reeve". |
| **the Rule** | The hairline of light on the far horizon that every well was once sunk true to. Also the law the Assize kept. It now leans about a degree, and is the wrong colour. | The horizon goal (art brief 6.2). "Off the Rule" = crooked, wrong. |
| **the kept round / the seventh** | The cartridge given to a Reeve at swearing. Carried always, fired never. "Keeping seven" means being in good standing. | The sealed seventh mark on the HUD. The ending. |
| **plumb** | True, honest, straight. A **plumb round** is an Old-World proving charge: one shot, one perfectly straight line through anything. | The one special ammo type. |
| **the lean** | The wrongness that gets into machines and people when the Rule is off. It shows violet. A **lean-knot** is a growth of it. | The reserved "put a round in it" colour: weak points and puzzle targets. |
| **Chaff** | Townsfolk the lean has emptied. They hooded themselves with feed sacks. Singular and plural. | Rusher archetype. |
| **Transit** | A three-legged sighting machine that once surveyed bore lines. It still takes sightings. | Marksman archetype. |
| **Tamper** | A ceramic-shelled pile-driver that once packed earth around the lift shafts. | Brute archetype. |
| **the Dowser** | The pursued. A walker with a forked rod. Where he stops, the wells go wrong. | Seen twice, far off, never close. Speaks only through notes. |
| **Sinkers / Sinker-work** | Folk name for whoever sank the wells, and for anything they built. The maker's plates say PELLAM DEEPWORKS (art brief 4.4). | Old-World signage and machine voice. |

Courtesy: *"Water to you."* Reply: *"And shade."* Oath: *"By the Rule and the round."* The
formal talk before violence is **the asking**: a Reeve asks once before she draws.

---

## 3. Who, what, and the price

**Backstory (146 words).**

> The Assize was a court that rode. Its officers, the Reeves, carried a blued six-gun and
> seven rounds: six for the work, and one, given at swearing, that is never fired. The Assize
> judged water rights along the old lift line by the Rule, the bright upright on the horizon
> that every well was once sunk true to. The court is gone. The Rule leans. Tamsin Ware is the
> last Reeve anyone has heard of, eleven years sworn. For two of them she has followed the
> Dowser: a walker with a forked rod who goes from lift station to lift station and leaves
> each one wrong. He is never hurried, and he always leaves her one more problem than her gun
> holds. She does not know what he wants. She knows he counts her rounds. The trail has
> brought her to a town called Plenty.

**What she pursues.** The Dowser, and behind him the reason the Rule leans.

**What this stage costs her.** Two things, one for each half of the stage.

1. *Above ground:* the town. The hooded things she shoots in the street were, four days ago,
   people keeping a water ledger. The player learns this after the shooting, from the ledger.
2. *Below ground:* her office. The only way to put the station right is to fire a proving
   charge down its bore. The Dowser has emptied the lockers. She is carrying one. She arrives
   a Reeve keeping seven and leaves a woman with six.

The second cost is the Dowser's actual purpose, and the player only understands it at the
last camp: he is not breaking wells. He is making Reeves pay for them.

---

## 4. The gun

Unchanged from the feel spec unless stated: hitscan, pinpoint on a rested shot, 0.48 s
cadence, six rounds, per-round interruptible reload (2.45 s full), fan-the-hammer on alt-fire
(six in 0.85 s, 5 degree cone, no weak-point multiplier), no aim-down-sights, 100 damage body,
x2 weak point, x0.25 on plate.

**The object.** An Assize-pattern six: blued steel gone grey at the muzzle, dark walnut grip,
a plumb-bob stamped under the loading gate (the order's mark, and, the player will learn,
somebody else's first). The darkest, sharpest thing on screen. No engraving, no ornament.

**The cylinder HUD.** Bottom right: six brass dots in a ring that turns one notch per shot,
so the count is read by shape, not by number. Beside the ring, slightly apart, a seventh
cartridge drawn sealed with a wax band. It never fills, never empties, and cannot be
selected. The pause screen calls it "The kept round. Not for firing." Players will ask what
it is for. That question is the demo's long fuse.

**What a round does to each thing it meets.**

| Target | One ordinary round |
|---|---|
| Chaff | Dies. Thrown back 1.2 m; any Chaff within 1.2 m behind it stumbles 0.4 s |
| Transit, legs or drum | Flinch 0.25 s; two kill. If it was aiming, the aim breaks and the tell restarts |
| Transit, lens | Dies. Glass-bell tone |
| Transit's stake in flight | Bursts in a shower of sparks (hit volume doubled; a show-off move, never required) |
| Tamper, ceramic plate | Grey spark, flat clank, 0.2 m pushback, no hit marker |
| Tamper, open vent | Stagger 1.5 s, attack cancelled; three kill |
| Lean-knot on a machine | Bursts with a wet pop and a falling tone; a lamp answers |
| Jug, bell, lantern, bottle | Breaks, pours, rings. Always something |
| The Dowser, 250 m off | A puff of dust far short, and one line of narration, once |

### The one special: the plumb round

A Pellam Deepworks **proving charge**. Survey crews fired them down a fresh bore to prove
it was straight: the shot goes through everything in its way and leaves a line to measure by.

| Property | Value |
|---|---|
| Loading | `Q`: thumb the next chamber open and seat a plumb round under the hammer (0.55 s; the displaced round returns to reserve). That chamber's HUD dot turns aqua |
| Flight | Hitscan, 60 m. Passes through every enemy and every surface tagged `pierce` (ceramic plate, shutters, baffles, crates). Stops at structural rock and thick wall |
| Damage | 300 to each body, ignoring armour; doubled if the line passes through a lean-knot |
| Feedback | A dead-straight aqua "chalk line" hangs in the air for 1.5 s. Under the report, one sine tone that is slightly too pure. Every body on the line reacts in sequence, near to far, 40 ms apart |
| Supply | Fixed lockers only, never drops. Carry cap 2. About 6 to 8 fired in a full run |

**Why it earns its place.** It is the only tool that makes the player's *feet* part of the
gun. An ordinary round rewards aim; a plumb round rewards standing where three things become
one. It converts the Chaff's habit of running in file, the Tamper's straight charge and the
third puzzle into the same question: *can you make a line?* It is also the stage's central
metaphor (true versus leaning) in a form you can shoot, and it is the mechanism of the
ending. Build cost: a multi-hit ray, one quad, one oscillator, one viewmodel clip (reused
for the finale).

Scope note: we read fan-the-hammer as a fire mode of the primary and the plumb round as the
single special. If the judges read fan as the "one special", cut the fan, not the plumb
round. Nothing in the stage requires the fan.

---

## 5. Beat sheet and intensity curve

Median first-time player: about 22 minutes. Skilled: 15 to 16. Slow, with hints and a few
deaths: 25. First shot at about 1:20. First kill before 3:00. Longest unbroken combat: the
boss phases, each under 75 s with a checkpoint between.

| Min | Movement | Beat | Int. | New thing |
|---|---|---|---|---|
| 0:00–1:00 | I. The Lip | Black overhang. Cold camp, fire two days dead. Step out into glare: the valley, the pylon line, the Rule leaning on the horizon. Title card | 1 | move, look; the sealed seventh on the HUD |
| 1:00–2:10 | | The gully. **Seven Jugs** gate (puzzle 1). First shots, first forced reload | 2 | fire, reload, "he leaves seven" |
| 2:10–2:40 | II. Plenty | Through the gate. Far down the street a hooded figure kneels at a dry trough, scooping sand to its sack. It lifts its head | 2 | first Chaff, seen safely at 45 m |
| 2:40–4:20 | | **Fight 1, "The Street."** Seven Chaff in 1, 2, 3, and one more | 4 | Rusher; reload under pressure |
| 4:20–6:10 | | The Tank Yard. Troughs, hand-painted well marks. **The Missing Vane** (puzzle 2). First aqua light in the game | 2 | lean-knots; timing shot |
| 6:10–8:00 | | **Fight 2, "The Yard."** A Transit walks out of the opened door and stakes the yard bell. Duel; then two Transits and four Chaff. Afterwards: a pale figure on the far rim, 250 m off, watching. Then not | 6 | Marksman; the shot as a parry |
| 8:00–9:50 | III. The Tally House | Dark hall, raking shafts. Eleven hooded figures seated at the long table. The ledger. Cold camp, fire one day dead. A clean ceramic hatch. The hum wakes two of the seated | 3 (5) | the found account; muzzle flash as the only light |
| 9:50–11:40 | IV. The Gallery | Down the shaft. Receding aqua lamps. The proving locker and the three-plate range. **Proving the Bore** (puzzle 3) | 2 | plumb round; make a line |
| 11:40–12:20 | | **Fight 3, "The File."** Six Chaff, single file, down a 40 m gallery. One fresh plumb round in the locker | 6 | the line as a kill |
| 12:20–12:50 | V. The Lift | The Lift Hall from a safe gantry. A Tamper is pounding a sealed bulkhead, as it has for days. A Chaff wanders into the slam | 3 | Brute, shown on something else |
| 12:50–14:40 | | **Fight 4, "The Matador."** Tamper alone among the ribs, then with Chaff | 7 | armour, vents, the charge into a pillar |
| 14:40–15:20 | | Cache at the lift cage. The wall diagram of the lift head: six chambers in a ring | 2 | resupply; boss foreshadowed |
| 15:20–16:30 | | **Fight 5, "The Long Drop."** The freight lift descends. Enemies step on from passing ledges. A Tamper lands on the platform | 8 | all three together; the edge as a weapon |
| 16:30–17:50 | VI. The Bore | Antechamber. Embers still warm. His note. **The Asking** (puzzle 4): the door asks three questions | 2 | answer; and hold fire |
| 17:50–18:20 | | The asking proper. The Windlass turns its face. Listen, or shoot | 3 | parley as a mechanic |
| 18:20–21:20 | | **Boss: the Windlass.** Three phases | 9, 9, 10 | the cylinder made visible |
| 21:20–22:30 | VII. The Seventh | Bore unproven. Lockers empty. Load the kept round. One shot. The lift up. Blue hour. Six brass on a stone. A fire on the plain | 1 | the ending |

```
 10 |                                         ##
  9 |                                     ######
  8 |                               ##    ######
  7 |                          ###  ##    ######
  6 |            ####       ## ###  ##    ######
  5 |            ####  #    ## ###  ##    ######
  4 |     ####   ####  #    ## ###  ##    ######
  3 |     ####   #######    ######  ##  ########
  2 |  #########################################
  1 |#############################################
    +---------------------------------------------
     0   2   4   6   8   10  12  14  16  18  20  22  min
     Lip  Street  Yard  Tally File Mat. Drop  Windlass
```

Each peak is higher than the last. Every valley returns to 2 or 3 and carries something new
(a puzzle, the ledger, a note). The last bar of the chart is the quietest minute in the
stage and contains the most important shot.

### Encounter budget, in bullets

| Fight | Roster (total) | Max alive | "Bullets of health" | Length | The question it asks |
|---|---|---|---|---|---|
| The Street | 7 Chaff | 3 | 7 | 75–100 s | Can you count to six? |
| The Yard | 3 Transits, 4 Chaff | 4 (6 threat) | 10 | 90–110 s | Can you shoot first, from cover? |
| Tally House | 2 Chaff | 2 | 2 | 15 s | Can you shoot by your own flash? |
| The File | 6 Chaff | 6 | 6, or 1 plumb | 30–40 s | Can you make a line? |
| The Matador | 1 Tamper, 4 Chaff | 3 (6 threat) | 10 | 90–110 s | Can you hold your nerve and wait for the vent? |
| The Long Drop | 2 Transits, 6 Chaff, 1 Tamper | 5 (8 threat) | 16 | 70 s | Whom do you shoot first? |
| The Windlass | boss + about 8 Chaff | 1 + 3 | 26 + 8 | 3–4 min | Six for six |

Total about 85 bullets of enemy health plus about 15 puzzle shots: roughly 165 rounds fired
at 60 % accuracy. Supply follows the feel spec (start 6 + 24, cap 36, floor at 6, caches
before fights 2, 4, 5 and the boss). Never more than 6 bodies alive outside the boss room.

Checkpoints: after the jug gate; after each fight; on entering the Tally House, the Gallery,
the Lift Hall and the antechamber; at each boss phase. No death costs more than 90 s.

**Scope valve.** The Long Drop is the designated cut. Without it the lift ride is 25 quiet
seconds with the station's voice reading the lift-head inventory, and the stage loses 70 s
and one set-piece but nothing that teaches.

---

## 6. Zone-by-zone

Seven zones. Surface footprint about 130 m x 130 m; the underground runs back east beneath
the street and ends under the gully, so the proving lift can surface on the rim above the
starting overhang and the final image can share the opening's composition. The sun is low in
the north-west: ahead-left in the gully, ahead-right on the street (art brief, palette B
"Long Light"). Both lifts are dark rides between separately baked spaces, so the vertical
distances are fiction, not geometry.

```
 plan (north up; sun low in the north-west)

      [3 Tank Yard]---[4 Tally House]
            |
      [2 Front Street, 72 m, walked east to west]----+
                                                     |  gate
                                               [1 The Lip]
                                               gully, 95 m, walked south to north
                                               start: overhang at the south end

 section (looking north)

   W                                                    E
   Yard        Front Street                   gully / Far Rim ledge
   _|___________________________________________|______/
    | hatch                                     ^ proving lift (up, at the end)
    +====[5 Gallery, 62 m]====[6 Lift Hall]-----+
                                    |
                                    v freight lift (down)
                               [7 The Bore]
```

### Zone 1 — The Lip (exterior approach)

- **Purpose.** Establish the pursuit and the goal; teach move, fire, reload; plant "seven".
- **Size.** Overhang 12 m wide x 9 m deep; gully 95 m long, 12 to 20 m wide, falling 14 m.
- **Landmark.** A dead pylon at the gully mouth. Its fallen arm has been lashed up as a
  well-sweep to work the town's stock gate. Beyond it the pylon line walks to the Rule.
- **Light.** Starts inside black shade. The first 20 s outside are over-exposed white glare
  (palette A) that settles into Long Light: peach haze, long mauve shadows down the gully.
- **The player does.** Reads the cold camp (ash, a flat stone, a note weighted with a spent
  case). Walks out into the doorway shot. Follows the gully to the gate and shoots it open.
- **The player learns.** The fire is two days old. The Dowser knows what she carries. The
  HUD has a seventh mark that does nothing. The far violet hairline is where everything goes.

### Zone 2 — Front Street, Plenty (exterior)

- **Purpose.** Fight 1: the open-ground stand-off. One round, one Chaff, and what happens
  on the seventh.
- **Size.** 72 m x 30 m; the street itself is 14 m wide between leaning facades.
- **Landmark.** The wind-pump over the roofs at the west end, turning, one vane missing. In
  the street, a ceramic rib of Sinker-work surfacing through the dirt like a whale's back.
- **Light.** The player walks into the light. Every post and porch throws a long shadow
  diagonally down the street at her. Chaff are dark cut-outs on bright ground. One wrong thing: every door
  carries the well mark brushed by hand, and every mark has been crossed through, neatly.
- **Arena.** Cover every 6 to 8 m: a tipped wagon bed, the ceramic rib, a pump post and
  trough, two adobe wall stubs. Two loops through the north and south alleys. The exposed
  stretch is the last 20 m before the yard gate.
- **The fight.** The kneeler at the trough rises and runs 45 m straight at her: about seven
  seconds, time for three calm shots (lifespan bought with distance, not hit points). Then
  two from opposite alleys, the first split of attention. Then three in file down the middle
  of the street: shoot the leader and the two behind stumble over the sack. Six down. The
  street holds its breath for two seconds. Then the yard gate at the far end bursts outward
  and the seventh comes through it. The last enemy's entrance is the way forward opening.
- **The player learns.** One shot each. Sprint-and-reload is the retreat. They run in file.
  The count will always be one more than the cylinder.

### Zone 3 — The Tank Yard (exterior)

- **Purpose.** Puzzle 2, then fight 2: the duel at range. First sight of the Old-World awake.
- **Size.** 40 m x 36 m walled yard.
- **Landmark.** The wind-pump: a 14 m timber tower bolted onto a celadon ceramic drum 8 m
  across that comes up through the adobe well-house. A frontier machine riding a Sinker one.
  Two tin tanks on stilts with a catwalk at 3.5 m.
- **Light.** The tower's shadow lies across the yard like the hand of a clock. The drum's
  livery band is dead grey until the puzzle is solved, then lights aqua all the way round:
  the first signal colour in the game, and it makes the yard feel worse, not better.
- **Arena.** Full-height cover: the drum, tank stilts boarded on one side, three wall
  stubs, a water cart. Two loops (round the drum, round the east tank). The problem position
  is the catwalk.
- **The player does.** Clears three lean-knots off the pump. The service door irises open
  and a Transit steps out on three legs, ignores her, sights the yard bell and stakes it: the
  full tell and the slow projectile, shown on something else. Then it turns.
- **The fight.** One Transit alone at 20 m: learn that a shot during its aim breaks the aim,
  and that the lens is the kill. Then a second climbs to the catwalk and a third takes the
  far wall while four Chaff come over the east wall in two pairs to flush her from cover.
- **The player learns.** Violet knots are for shooting. Aqua means it works. White-hot means
  move. The gun can interrupt. Afterwards, on the far mesa rim, a pale upright figure with a
  forked rod is watching. A shot at him raises dust a long way short. He is gone when the
  player looks back.

### Zone 4 — The Tally House (interior)

- **Purpose.** The story turn and the mood turn. The found account. A fight lit by the gun.
- **Size.** Hall 14 m x 22 m, 5 m to the ridge; entered through the well-house drum.
- **Landmark.** The long tally table with eleven hooded figures seated along it, hands flat
  on the boards. Behind it the tally wall: every household's water share in chalk.
- **Light.** Low-key. The exposure opens a stop on entry so the slatted windows bloom peach.
  Four raking shafts land in hot coins on the table. One lantern still gutters. The front
  doors are barred from the inside with benches.
- **The player does.** Walks the length of the table. Any seated figure she shoots slumps
  with a breath of dust and nothing else. Reads the ledger at the head of the table. Finds
  the second cold camp at the hearth (one day dead) and its note. Finds a hatch of clean
  white ceramic where the table end has been dragged aside, a lean-knot on its latch.
  Shooting the knot opens the hatch; aqua light comes up through the floor under the seated
  sacks; two of them stand.
- **The fight.** Two Chaff, in the dark half of the room, at 6 to 9 m. Each muzzle flash is
  a flashbulb photograph of the table.
- **The player learns.** Four days ago the water came up the wrong colour, and they drank
  it, and they hooded themselves as a courtesy. The Dowser is now one day ahead, not two.

### Zone 5 — The Gallery (underground)

- **Purpose.** Introduce the plumb round in safety, test it as a puzzle, then pay it off as
  a kill.
- **Size.** Stair shaft 2 m wide, 12 m down (compression). Gallery 62 m x 7 m x 5 m with a
  3 m walkway between pipe banks; proving bay 10 m x 8 m at the west end.
- **Landmark.** The proving range: three ceramic test plates hung in a row, a pictogram of
  one line through three discs, and a locker stencilled PROVING CHARGE.
- **Light.** Cold and regular. Aqua strips receding to a point; one in eight flickers.
  Deep blue ambient. A hairline of violet under the baffle door at the far end: the first
  violet underground.
- **The player does.** Takes a plumb round. Puts one line through three plates. Solves
  Proving the Bore. The baffle opens on the east half of the gallery; the locker chimes and
  offers one more round; six Chaff are already running, single file, 40 m away.
- **The player learns.** A plumb round goes through everything. The placard on the locker
  reads TYPE 7. DO NOT KEEP. The order's sacred oath-round is a utility company's survey
  consumable, and nobody in the order ever knew.

### Zone 6 — The Lift (underground machine hall and freight lift)

- **Purpose.** Fight 4 (the Tamper) and fight 5 (everything at once, on a moving floor).
- **Size.** Hall 44 m x 28 m x 12 m; the far wall dissolves into fog behind a receding row
  of lamps. Entry gantry 3 m up. Lift platform 12 m x 12 m.
- **Landmark.** A ceramic ring 9 m across standing at the east end: the lift portal, built
  for loads, not people. Ten ribs, 1.6 m thick, in two rows.
- **Light.** Aqua rows, satin floor with a smeared streak under each lamp. The only violet
  is the wink from the Tamper's vent. The only warm light is the gun.
- **The player does.** Watches from the gantry while the Tamper slams a sealed bulkhead three
  times, its chest vent opening on each wind-up, and flattens a Chaff that strays inside the
  ring of its slam. Walks down the ramp. Fights it among the ribs. Resupplies. Rides the lift.
- **The fights.** *The Matador:* Tamper alone for about 40 s (or to half health), then two
  Chaff from floor grates, then two more. When the Tamper dies the Chaff falter for 2 s.
  *The Long Drop:* shaft walls scroll upward past a stationary platform. Ledges pass every
  15 s. Wave one: four Chaff in pairs, and a Transit on a ledge that is carried up out of
  sight in 8 s (shoot it before it goes, or eat a stake). Wave two: a Tamper drops onto the
  platform, with two Chaff and a second Transit. The rail has two 2 m gaps.
- **The player learns.** Plate turns a round; the vent takes it. A charge that meets a rib
  ends in a 2 s stun with the back vent open. A plumb round through the chest plate reaches
  the knot behind it. A charge that meets a gap in the rail ends in a long silence and a
  distant boom.

### Zone 7 — The Bore (underground), and the Far Rim (exterior coda)

- **Purpose.** The asking, the boss, the kept round, the last image.
- **Size.** Antechamber 10 m x 14 m. Bore chamber 30 m across, 14 m high, six ribs at 9 m
  radius, an open bore 6 m wide at the centre behind a 1.2 m ceramic kerb. Far Rim: a ledge
  30 m x 20 m.
- **Landmark.** The Windlass: a drum 5 m across hung on three cables over the bore, with
  six shuttered mouths in a ring on its face. Behind it, a hook over the bore and a cord
  cut clean: the cradle where the station's plumb hung.
- **Light.** Antechamber: the Dowser's embers, still orange. It is the first warm light
  below ground and it is his. Chamber: violet rising from the bore, the first room the
  wrong colour fills. After the last shot: aqua, from the bottom up. Far Rim: blue hour
  (palette C), separately baked.
- **The player does and learns.** See sections 7 (puzzle 4), 9 (boss) and 11 (ending).

---

## 7. Puzzles

House rules for all four (from the feel research): every element visible from one standing
spot; lamps show progress; a wrong shot does something harmless and audible; a refilling
cartridge box within 10 m; no combat until solved; hint timer counts only stalled time in
the puzzle volume and resets on each correct step. Tier 0 is composition, tier 1 a wordless
nudge at 60 s, tier 2 a goal line at 120 s, tier 3 an action line plus outline pulse at 210 s.

### Puzzle 1 — Seven Jugs (cylinder and attention), Zone 1

- **Premise.** The town's stock gate is a drop-bar held down by clay jugs and hauled up by a
  well-sweep with a stone on its short end. The Dowser has hung the jugs.
- **Mechanics.** Six jugs hang in a row on the gate bar at 8 to 12 m. Each one shot bursts
  and pours sand; the sweep creaks up one notch. After six the gate stands 1.2 m open: not
  enough, and there is no crouch. The seventh jug hangs 7 m up on the dead pylon's stub arm,
  above and left of the gate, already leaking a thread of sand that catches the sun.
- **Solution.** Shoot six, reload, look up, shoot the seventh. Seven targets guarantee one
  reload.
- **How it teaches.** It is the fire-and-reload skill gate, and the first statement of the
  stage's motif. The reload prompt appears only if the player dry-fires twice.
- **Hints.** T0: the falling sand thread is the only moving thing in frame. T1: the pylon
  arm creaks and the thread glints. T2: *"Six jugs down. The sweep wanted seven."* T3: *"The
  seventh hung high, on the dead pylon's arm."* with an outline pulse.

### Puzzle 2 — The Missing Vane (timing and position), Zone 3

- **Premise.** The wind-pump powers the drum's service door. Three lean-knots choke it.
- **Mechanics.** Three dead lamps on the drum. Knot A sits on the pump rod at ground level,
  6 m from the entry, in plain sight: the first violet thing the player can touch. Knot B
  sits on the gearbox behind the turning wheel (8 vane positions, 7 vanes, one turn per
  4.0 s). It can be hit only through the gap where the eighth vane is missing: a 0.5 s
  window every 4 s. A shot on a vane clangs and makes the wheel shudder. Knot C is on the
  lee face of the tail vane: visible from the tank catwalk at any time, or from the ground
  for 2 s whenever a gust (every 9 s, announced by a cloud shadow crossing the yard) swings
  the tail.
- **Solution.** Shoot A. Watch the gap come round and shoot B through it. Climb the catwalk,
  or wait for the gust, and shoot C. The wheel runs free, the band lights aqua, the station
  speaks for the first time, the door opens.
- **How it teaches.** A is free and names the colour. B makes the cadence of the gun matter:
  the shot is instant, so the skill is patience, not lead. C teaches that moving is aiming.
- **Hints.** T0: three lamps, three knots, a pipe run from each knot to its lamp. T1: the
  leading edge of the gap glints and ticks on each pass, a metronome for the shot. T2:
  *"Three lamps on the old drum. Three knots on the pump."* T3: *"She watched the gap come
  round, and shot through it."* At T3 the wheel also slows to one turn per 6 s.

### Puzzle 3 — Proving the Bore (alignment, plumb round), Zone 5

- **Premise.** The baffle door is held by three lean-knots that heal each other.
- **Mechanics.** Knot 1 on a pipe elbow, low left, 8 m away. Knot 2 on a valve bonnet,
  mid-height, 20 m. Knot 3 on a ceiling conduit, high right, 34 m. An ordinary round bursts
  one knot; it regrows in 3 s with a descending tone and its lamp gutters out. The three
  lie on one straight line in space. That line, extended back, passes through eye height
  above a brass survey disc set in a raised step under the one steady lamp. From the disc
  the three lights nest one inside another. Standing tolerance is +/- 0.45 m (knot hit
  radius 0.35 m).
- **Solution.** Stand on the disc, load a plumb round, fire through all three at once. The
  chalk line hangs in the air through three bursts and the baffle grinds open.
- **How it teaches.** The three-plate range beside the locker shows piercing first, with a
  pictogram. Shooting the knots one at a time shows why piercing is needed. The puzzle is
  the test; the File, seconds later, is the application.
- **Fail-safe.** The locker dispenses another plumb round whenever the player holds none and
  the door is shut.
- **Hints.** T0: brass disc, steady lamp, and a wall pictogram of three dots, one line, one
  eye. T1: the knots pulse near-to-far and the disc chimes when stood on. T2: *"They healed
  alone. They wanted killing together."* T3: *"From the brass mark, the three lights sat one
  inside the other. One plumb round."* At T3 the knot hit radius grows to 0.6 m.

### Puzzle 4 — The Asking (attention and restraint), Zone 7

- **Premise.** The bore door is a ceramic disc 3 m across with eight numbered ports in a
  ring, like the face of a cylinder with two chambers too many, and an outer ring of small
  "listening" lamps. The station asks three questions in tones and subtitles.
- **Mechanics.** A question is asked; the player answers by shooting a numbered port. A
  wrong port gives a flat tone and *"COUNT AGAIN."* The listening lamps fill clockwise
  whenever no shot is fired and empty at any shot; a full ring takes 6 s.
  1. *"IDENTIFY STATION."* The answer is on every placard since the yard: 7.
  2. *"CHAMBERS IN SERVICE."* The wall diagram of the lift head beside the door, and the one
     at the lift cage: 6.
  3. *"PLUMBS ABOARD."* The cradle pictogram beside the door has been crossed out with a
     brush. There is no plumb. There is no port for none.
- **Solution.** Shoot 7. Shoot 6. Then do not shoot: let the listening ring fill.
  *"PLUMBS ABOARD: NONE. NOTED. BORE UNPROVEN. ENTER AND STAND CLEAR."*
- **How it teaches.** The first two answers reward the attention the signage has been asking
  for. The third teaches the one gun verb not yet used, holding fire, half a minute before
  the boss rewards exactly that.
- **Fail-safe.** The third answer solves itself: a stuck player who stops shooting to think
  has answered. After three wrong shots on questions 1 or 2, the wrong ports go dark.
- **Hints.** T0: the listening ring visibly fills when the gun is quiet. T1: the correct
  port's lamp flutters. T2: *"It asked for numbers. The walls were covered in numbers."*
  T3 (question 3): *"There was no plumb, and no number for none. She let the hammer down."*

---

## 8. Enemy roster

Three archetypes, three shape languages, three heights. Stats follow the feel spec; what is
new here is each one's identity and what it does to the cylinder. Colour law: **violet is
where the round goes; white-hot is what is about to hurt you; aqua never hurts.**

### Chaff (Rusher)

- **What it is.** A townsperson of Plenty. Work clothes gone the colour of the ground, a
  feed sack over the head tied at the neck, two slits with a pinprick of violet behind them.
  No face, ever. Not a scarecrow: no straw, no pole, no grin.
- **Silhouette.** Low and forward: 1.4 m at the stoop, boxy sack head, arms too long.
- **Behaviour.** 5.8 m/s. Paths funnel them, and they follow the nearest Chaff ahead, so in
  any lane they arrive in file. Lunge at 1.8 m for 18. On a leader's death, followers within
  1.2 m stumble 0.4 s. When a Tamper dies they falter for 2 s.
- **Telegraph.** 0.5 s crouch and a dry indrawn rattle, like wind in a sack.
- **Killed well.** Early and in order: the leader first, at 10 m, so the file trips on him.
  One plumb round down the line. The fan only when three are inside 5 m, and then you had
  better know where you are reloading.
- **Death.** The sack goes down as if there were only chaff in it. A breath of dust. The sack
  stays where it fell.

### Transit (Marksman)

- **What it is.** A Pellam bore-survey instrument that never stopped taking sightings. Three
  thick ceramic legs, a drum head, one large lens.
- **Silhouette.** Tall and thin: 1.9 m, a tripod with a single eye. Nothing else in the game
  has three legs.
- **Behaviour.** 3.5 m/s between authored firing points, 12 to 25 m from the player, near
  cover but visible. Fires a white-hot survey stake at 18 m/s for 22. The stake stays stuck
  in whatever it hits, cooling to orange, for the rest of the fight. Relocates after two
  shots. Side-steps if the crosshair rests on it for 0.6 s beyond 10 m.
- **Telegraph.** 0.9 s. The legs plant with a clack, the head dips, the lens flares from
  violet to white, a tone rises, and a white sighting thread runs from lens to target. The
  thread stops tracking for the last 0.25 s, and the head is still for the last 0.4 s.
- **Killed well.** Wait for the plant. Put one round through the lens while it is holding
  still to kill you: a glass-bell note, and it folds like a dropped tripod. Or break its aim
  with a body shot, close the distance while it re-sights, and finish it.
- **What it does to the cylinder.** It makes one round worth saving. A player who empties six
  into Chaff has nothing to answer the rising tone with.

### Tamper (Brute)

- **What it is.** A walking pile-driver that packed the earth round the shafts. Enamel-white
  ceramic shell over dark steel, one enormous tamping arm, a small counter-arm, a livery band
  that has turned violet.
- **Silhouette.** Wide and tall: 2.4 m x 1.6 m, hunched barrel on short legs, lopsided.
- **Behaviour.** Walks at 2.5 m/s. **Slam:** 1.0 s wind-up with the arm raised, radius 3.5 m,
  38 damage; the chest vent opens for the whole wind-up. **Charge:** 0.8 s of pawing and a
  falling pneumatic howl, then 9 m/s in a straight line for 35; if it meets a rib or wall it
  is stunned 2.0 s with the back vent open.
- **Telegraph.** Arm up and a rising hiss for the slam; a white-hot ring appears on the floor.
  Head down, foot scraping sparks, and the howl for the charge.
- **Killed well.** Three ways, and the fight is choosing among them. *Nerve:* stand inside
  10 m, wait for the arm, put a round in the chest vent (stagger, attack cancelled), repeat
  three times. *Footwork:* bait the charge into a rib and put three in its back. *The line:*
  stand in front of the charge and send one plumb round through the chest plate and the knot
  behind it: 600 damage, one shot, at the cost of standing still in front of it.
- **What it does to the cylinder.** Plate hits waste four in six. It punishes the fan and
  rewards a single held round.

---

## 9. Boss — the Windlass (Lift Head 7)

**What it is.** The station's lift head: six lift tubes in a ring, hung over the bore to
raise water. Without its plumb it is raising something else. It is the player's cylinder,
5 m across, pointed at her.

**Why it is the right boss for this pitch.** It counts its shots where she can see them. It
fires six, and then it has to haul up six more. The fight is two cylinders taking turns, and the
player can cheat the turn order by being faster.

**The asking (30 s, skippable by firing).** The Windlass turns its face to the door.
*"LIFT HEAD PRESENTING. SIX CHAMBERS. STATE BUSINESS AT THE BORE."* The narrator: *"A Reeve
asks first. She asked."* Her question, on screen: *"Will you stand down?"* The machine
answers with procedure: it reads out what each chamber holds, in order, which is its whole
phase-one pattern, and ends *"PRESENTING FOR INSPECTION."* All six shutters open for 4 s. A
player who held fire gets a free cylinder into six open knots. A player who shot early gets
a clank off a shut plate, *"INSPECTION REFUSED,"* and a fight that starts on the machine's
terms. Nothing is lost by impatience except the advantage. On retry the asking is skipped.

**Arena.** 30 m round. Six ribs at 9 m radius block everything it fires. The bore is fenced
by a kerb the player cannot cross. Two cartridge points and, from phase two, two proving
lockers on opposite walls (one plumb round each, refilled every 25 s).

| Phase | To break it | Its turn | Your turn |
|---|---|---|---|
| **1. Six for six** | 10 hits | The top chamber irises open and glows for 0.9 s with a rising tone, fires, and the ring indexes with a ratchet clunk. Six discharges in 6.6 s: stake, stake, canister, stake, stake, canister. A stake is aimed (25 damage, 20 m/s). A canister lands, paints a 3.5 m white-hot ring for 1.0 s, then bursts (38) to push her out of cover | *"HAULING."* For 3.5 s all six mouths stand open, a knot in each. One cylinder, six targets |
| **2. The guard** | 10 hits | A ceramic guard plate slides over the face. Tells shorten to 0.8 s. New attack, the **lance**: a white-hot thread shows the path for 1.2 s, then a blade of lean-light sweeps the room at chest height over 2.5 s (30); ribs block it. Two Chaff climb from the bore each cycle and drop cartridges | The guard hangs on two pawls high on the gantry arms, left and right, each a lean-knot. Shoot both (two rounds) and the guard drops for 4 s: four rounds left for six mouths. Or send a plumb round through the guard: it counts as three hits |
| **3. Unproven** | the 6 chambers, once each | The guard shatters. The drum spins free at 40 degrees per second and **fans**: after a 1.2 s spin-up whine with all lamps flashing, six stakes in 1.2 s across a 24 degree spread. Then a 3 s haul. Three Chaff at a time | Every mouth is open and moving. Each chamber takes one hit and goes dark for good; a hit on a dead chamber clanks. Six lamps, six left, then five. A perfect cylinder ends the fight |

**Beating the draw.** In every phase, a round into a chamber during its own 0.9 s glow makes
it misfire: no projectile, one hit of damage, a cracked shutter. The revolver is a parry,
and here it is a duel repeated six times a pattern. But a round spent parrying is a round
not in the cylinder when the mouths open. That trade is the fight.

**Fairness.** No hit over 38. No attack without a tone and a pose. Phase health does not
carry over and each phase is a checkpoint. A health ring of 26 pips sits around the boss's
name; plate hits clank without a marker. After two deaths in one phase its damage drops 15 %
and a cartridge box appears, silently (feel spec).

**Kill sequence.** The last lamp goes out. Time drops to 0.2x for 0.6 s. Then the drum runs
down exactly like a spent cylinder: click, click, slower, click, and stops. Six dead mouths.
It sags on its cables. Three seconds of nothing. The bore under it is still violet.

**Build note.** The Windlass is rigid parts on one yaw pivot: no skinning, no navigation.
Its expense is VFX and sound, which is where a boss should spend.

---

## 10. Five moments a player would describe to a friend

1. **"There's a seventh bullet on the HUD the whole game that you can't use. At the end you
   load it."** One shot, straight down a well, and the line it leaves comes up through the
   roof of the world.
2. **"There's a room of people sitting at a table with sacks on their heads, and the only
   light is your gun going off."** You walked past eleven of them. You read their ledger. Two
   stand up.
3. **"I put one bullet through six of them."** The File: a 40 m corridor, a line of runners,
   an aqua chalk line hanging in the air and six sacks going down in order like dominoes. Or
   the other version: *"I stood in front of the big one while it charged and shot through it."*
4. **"The big one charged me on the lift and I stepped aside and it went off the edge."** A
   long silence. Then, from far below, a boom, and the platform shivers.
5. **"The boss is a giant revolver cylinder. It tells you its whole attack pattern if you
   don't shoot first, and if you're fast you can shoot each chamber before it fires."** And
   in the last phase it fans the hammer at you.

Runner-up: the first Transit kill. It plants, the tone climbs, you put one round through the
lens while it is trying to kill you, and the note it makes is the prettiest sound in the game.

---

## 11. The ending beat and the hook

**The seventh.** The Windlass is dead and the bore is still the wrong colour. The station:
*"BORE UNPROVEN. PLUMB ABSENT. PROVING CHARGE REQUIRED."* The two wall lockers stand open.
Each shelf has a row of clean rectangles in the dust where the boxes were. The sealed
seventh mark on the HUD, which has done nothing for twenty minutes, pulses once.

The player presses the plumb key. The same animation as every plumb round, slower: the Reeve
breaks a wax band with her thumb and seats the kept round. The seventh HUD mark empties and
the chamber under the hammer turns aqua. She aims down into the bore. The player fires.

It is the only shot in the game with no echo. The report is swallowed; what is left is the
pure tone. A line of clean aqua light stands in the bore, dead vertical, from the bottom of
the world up through the roof. The violet drains from the bottom up. Far below, for the
first time, the sound of water. *"BORE PROVEN. LIFT STATION 7 IN SERVICE. WATER WHERE YOU
STAND."* The narrator: *"She had kept it eleven years. It took less than half a second to
spend."* If the player will not press the key, nothing fails; the hint tiers say, in order,
*"There was one proving charge left in Plenty. She was carrying it,"* and *"A Reeve keeps
seven."*

**The Far Rim.** The proving lift rises in the dark beside the line of light. The cage opens
on a ledge above the overhang where the stage began: the same black frame, the same valley,
but it is blue hour and she could not say of which day. The opening shot, with three things
changed.

- Behind her, a thread of aqua stands up out of Plenty, perfectly straight. Ahead, the Rule,
  violet, leans. For the first time there is something true in the sky to measure it by, and
  the player can see exactly how far off it is.
- On a flat stone at the ledge's edge, six spent brass stand in a row, mouth up. Each has a
  mark under the rim: other Reeves' kept rounds. *"She knew five of the marks. The sixth was
  older than the Assize."* Beside them, a seventh ring scratched in the dust, empty.
- Far out on the plain, along the pylon line, one small orange fire.

Last lines: *"He had not taken hers. She had given it."* Then: *"Six, then. She went on."*
Four seconds of wind. Card: THE KEPT ROUND. FIRST TALLY ENDS. Then time, accuracy, share of
lens and vent hits, plumb lines of three or more, secrets, and "the Reeve carries: 6".

**Why it is earned.** The player has been taught for twenty minutes to count to six and to
notice sevens. The game's rarest resource turns out to be one they held all along. The cost
is real in the fiction (her office) and legible on the HUD (an empty ring that will be empty
next stage). The victory is undercut twice: the town that needed the water is seated at a
table upstairs, and the man she is chasing wanted her to do it.

**The hook.** Why is a man walking the line making Reeves spend their oaths to mend the
wells? Whose is the sixth casing? What is a Reeve with six? And the fire is close enough to
reach by morning.

---

## 12. Voice samples (all original)

Narration (past tense, counted, plain):

1. *"Ash, cold to the knuckle. Two days, by the crust on it. He had left the coffee."*
2. *"A Reeve keeps seven. Six for the work. One for the oath."*
3. *"Sand ran out of the first jug. Sand ran out of all of them."*
4. *"They had hooded themselves. It was a courtesy, once the light got into the eyes."*
5. *"The Tamper had a job once. It was still doing it."*
6. *"Too far. He would know to the yard how far."*

The Dowser's notes (unhurried, exact, never unkind):

7. *"Reeve Ware. Water to you. Seven again. You may call it rudeness. I call it arithmetic."*
8. *"You are a day behind and walking well. The town did not suffer long. I counted."*

The Tally House ledger (three hands, getting worse):

9. *"Day 4. Water came up warm and the wrong colour. We drank it. What else was there."*

Pellam Deepworks placards and the station's voice (calm, paternal, certain):

10. *"PROVING CHARGE, TYPE 7. FIRE ONLY DOWN THE BORE. DO NOT KEEP."*
11. *"LIFT STATION 7. SURFACE POWER: WIND. THANK YOU FOR YOUR PATIENCE."*
12. *"PLUMB ABSENT. BORE UNPROVEN. LIFT WILL PROCEED."*

---

## 13. Secrets (three, found by attention; each gives 12 rounds and a story fragment)

- **Street:** an insulator hung as a bell in the feed-store loft; shoot its rope. A child's
  tally of days without rain, stopping at a round number.
- **Tally House:** behind the tally wall, a Pellam status lamp kept as a shrine, still lit
  aqua, with WATER WHERE YOU STAND copied underneath by brush, badly.
- **Lift Hall:** a maintenance bay behind a lean-knot holds a second Tamper, switched off,
  perfectly clean. One plumb round on its shelf. SERVICE INTERVAL: FORTY YEARS.

---

## 14. Risks to build (honest list)

**Scope and rules**

1. **Fan plus plumb round may read as two specials.** We argue fan is a fire mode. If that
   is rejected, cut the fan; the boss's phase-three "fan" still works as its own attack.
2. **Seven zones and a separately lit coda** is the top of the allowed range. The Far Rim
   needs its own bake (fallback: grade and sky swap over the Lip's bake, accepting wrong
   shadow directions). The Long Drop is the named cut.
3. **Length.** 22 minutes median leaves 3 minutes of headroom under the cap. Four puzzles
   with 210 s hint ladders could push a slow player past 25. Mitigation: puzzle 1 is a
   skill gate that takes 40 s, and puzzle 4 partly solves itself.

**Mechanics**

4. **Puzzle 3's alignment depends on tolerances.** +/- 0.45 m is derived for 8, 20 and 34 m
   knots with 0.35 m hit spheres and a fixed 1.65 m eye. It must be tested at FOV 50 and 80
   and with step-up smoothing; the raised step must not let the player stand half on it.
5. **Puzzle 4's third answer is "do nothing."** It is self-solving, but some players will
   read a pause as a hang. The filling listening ring has to be unmissable.
6. **The Tamper going off the lift** needs charge logic that ignores a rail gap the player
   cannot pass. That asymmetry is a small cheat and must not be visible as one. If the
   charge-off-edge case is flaky, the gaps close and the moment is lost; the fight survives.
7. **The lift is an illusion** (scrolling shaft, stationary floor, ledges as moving spawn
   platforms). Enemies stepping from a moving ledge onto a still floor is a nav and
   animation special case.
8. **A stationary boss can feel like a turret.** Mitigations are the lance (forces rib use),
   canisters (force movement), adds, and the parry rule (forces aggression). If it still
   feels static in playtest, let the drum traverse the gantry on a rail.
9. **Chaff in file** is what makes the plumb round sing, and it is an AI behaviour (follow
   the Chaff ahead) on top of path funnels. In open ground they must still spread enough
   not to look like a conga line.
10. **Plumb round balance.** 300 through armour can trivialise the Tamper if lockers are
    generous. Supply is fixed and capped at 2 carried for that reason.

**Art, text and tone**

11. **Violet does three jobs:** the horizon goal, "wrong", and "shoot here". In the boss room
    violet fills the frame, so knots must read by white core, pulse and dark bezel, not hue.
    White-hot as the danger colour sits close to muzzle flash and to sunlit glare outdoors;
    every tell also needs its sound and pose.
12. **The Transit's legs and sighting thread** are thin things. Legs need to be about 13 cm
    thick to hold 2 px at 30 m; the thread needs a constant-pixel-width quad.
13. **Three-legged gait** is the one rig here with no template. A fixed tripod-gait clip and
    a plant pose are enough; do not attempt procedural IK.
14. **Shooting former townsfolk** must land as sorrow, not edge. No gore, no faces, no
    children among them, and the ledger is read *after* the street, not before.
15. **All story is text.** The ledger must fit three cards of two to three lines. If players
    skip it, the Chaff are just monsters; the seated table has to carry the idea without it.
16. **The ending depends on a planted HUD element.** If a UI pass ever "tidies away" the
    sealed seventh, the finale stops making sense. It needs to be in `design/story.json`
    and the HUD spec as load-bearing.
17. **Homage drift.** An oath-bound gun order, a patient walker pursued across a desert and a
    far vertical goal are the series' *shape*, used deliberately. The kept round, the
    Dowser's purpose, the Rule as a measure rather than a path, and every name are ours.
    Two proximity flags from the name check: "Chaff" plus sack hoods sits near harvest
    imagery the series uses (keep them clear of scarecrow shapes), and *The Kept* is a 2014
    frontier novel by James Scott (title only; KEEP SEVEN is the fallback).
18. **Not yet proven:** none of this has been played. Every time in section 5 is an estimate.

---

## 15. Sources consulted for this pitch

- `docs/research/art-tone.md`, `docs/research/game-feel.md` (binding context; numbers reused).
- Official series glossary, checked for collisions with this lexicon (none found):
  https://stephenking.com/darktower/glossary.html
- Shadoof / well-sweep (the jug gate's mechanism): https://en.wikipedia.org/wiki/Shadoof
- Theodolite and transit set-up over a point with a plumb line (the Transit, the brass
  station disc): https://www.fao.org/4/AC061E/AC061E08.htm
- Title collision check, *The Kept* (James Scott, 2014):
  https://www.wamc.org/post/kept-james-scott
