# Known issues in this build (v1.0.0, 2026-10-08)

This is everything we know to be still open. Nothing here stops the stage from being
played from the title to the end card. The numbers behind each line are in
`docs/INTEGRATION_REPORT.md`, Part T.

## Release

This build is version `v1.0.0`, published to GitHub Pages at
https://knotenvy.github.io/keep-seven/ by the repository's workflow, which typechecks,
runs the unit tests, builds, and boots the built site in a headless browser from a
sub-path before it publishes. Two defects found in the last review were fixed just before
the release: on the Low setting, dying in the Tally House no longer leaves the shutters
and figures drawn in garbage colours, and the nine seated figures now answer a shot.

## Not yet checked by a person: the most useful things to report

- **Frame rate on a real graphics card.** The game has only ever run on a software
  renderer. We do not know its frame rate on integrated graphics, or what the High
  setting costs (a sun shadow, ground dust and a glow round the sun outdoors; sheen, lit
  air and contact shading in the rooms). Being hit now draws three large blurred glows on
  the side of the screen; their cost was never timed either. None of it has been timed
  on real hardware. If it stutters, add `?perf=1` to the page's address
  for the overlay and tell us the numbers, your graphics card and whether the setting
  was Low or High.
- **Automatic quality.** The game picks Low or High by itself on the first load. The
  thresholds it uses were never measured on real hardware. If it picks badly, say what it
  picked; Options lets you override it.
- **Sound.** All audio is synthesised and nobody has listened to it on speakers. New in
  this iteration and unheard: being hit now has a sound that differs by what hit you
  (a stake, claws, the big machine, the boss's canister) and leans to the side it came
  from; the small sound that confirms a hit comes a little later after the shot (190
  thousandths of a second) and is held slightly longer; the big machine's armour rings
  higher. Tell us if the four hit sounds are merely different rather than recognisable,
  or if the confirm no longer feels tied to the shot.
- **How it plays in human hands.** Every fight was tuned with scripted players. After
  the last changes each fight was replayed once with a "plain" and a "middling" scripted
  player on Normal; Easy and Hard were not replayed at all.
- **Being hit.** The view jerks one to two degrees away from a blow for a quarter of a
  second, the side of the screen the blow came from flares a soft red-violet over a dark
  bruise (it was a pale bar that looked like a progress bar), and the arc round the
  crosshair stays a second. Nobody has felt whether the three together are too much or,
  for a light hit, too little: a light hit's flare is deliberately modest, and on a
  bright scene it shows as a darkening rather than a colour. "Screen shake" in Options
  scales the jerk and "Reduce motion" removes it.
- **Screens that are not 16:9.** Ultra-wide (21:9) and 4:3 were checked for the menus and
  the ending, but not for every scene. The changes to the run and fire hints, the man on
  the far rim (and the places he can be seen from) and the ending were checked at 16:9 only. At 4:3 the revolver's muzzle
  still comes close to the dial on the bore door.
- **A phone or a tablet.** A visitor without a mouse is told on the first screen that the
  game needs a mouse and a keyboard, before anything large is downloaded, and may load it
  anyway; the title repeats it. This was checked with an emulated phone, not a real one.

## Fights

- **The rising in the Tally House costs nothing.** The two figures that stand up from the
  table now do so two and a half seconds apart, but even a careless player takes no
  damage there.
- **The yard is harder than the boss for a middling player.** A scripted player with slow
  reactions and an unsteady aim died once in the yard (to the two walking machines'
  stakes) and never to the boss. A plain scripted player took no damage at all from the
  boss's first two phases.
- **The big machine in the lift hall is the costliest fight before the boss.** Its ground
  slam takes more than a third of your health. Its chest vent still opens only in the
  second half of the slam's wind-up on Normal and Hard, so about half the rounds fired at
  it ring off armour. If you die to it, the next slams are slower with the vent open
  longer, and from the second death a ring pulses on the open vent. That help and the
  ring on its back vent were tested in a test room, not replayed in the real hall.
- The big machine now charges only down a clear lane and turns to face you before it
  runs. Standing behind a pillar no longer makes it stun itself; stepping behind one as
  it winds up still does. A player who lands the vent shot every time from a spot with
  no clear lane may take no damage from it.
- **The corridor fight underground (the queue of six) barely touches a careful player.**
  It does punish standing still.
- **Standing still in the boss's second phase is still fatal.** The game says "move" the
  first time you are hit, and each of the boss's hints is now said only once per phase.
- In the corridor fight, the two enemies that come from behind slow down if you turn and
  watch them from far away. It can look odd.
- The special "line" round now keeps the height of the first body it passes through, so a
  chest shot carries down a queue. If that first body is one that is already dissolving,
  the round can still bend at it.
- On Hard, every enemy's warning is a fifth shorter than on Normal and the boss and the
  big machine are tighter; nobody has played it.

## Story and guidance

- **The wait before the boss fight is still a wait**: 13 seconds from the machine's first
  line to the moment you can act, 18 to the fight proper.
- On a second attempt in the same sitting, a shot during the boss's speech skips to the
  end of it instead of counting as a refusal. Nothing on screen says so, and the game
  forgets it if you reload the page.
- The six small lamps on the boss that light up as it names its chambers are only a few
  pixels each on the Low setting.
- **A fast player can still miss narrator lines.** If the yard's walking machine is shot
  down before it turns to you, its introduction is never said. The watcher in the stair
  niche speaks only if you look at it. The line about the cup in the Tally House is said
  only if you come within eight metres of the cup and look toward it. The lines about
  the dead camp fire before the boss are said only if you look at the camp.
- **The man on the far rim can now be seen only from where nothing stands in front of
  him**: the strip in front of the Tally House door and the north side of the yard. There
  he rises over the rim in a third of a second as you arrive. From the yard gate, the
  east half and the middle of the yard there is no figure and no glint of his rod (he
  used to look as if he stood on the water tank from there). A player who lingers in the
  east yard is led on by the lamp at the Tally House door after twenty seconds, not by
  the glint. Nobody has played this; tell us if you never saw him, or saw him pop up.
  He stays for as long as he is on your screen and walks down behind the skyline after
  forty seconds of being watched. The moment you step somewhere the view of him is not
  clear he is gone at once, without a step down (he used to linger for a third of a
  second over the water tank). He now stands on the flat top of a long mesa rim; from
  the west side of the yard, where he never shows, that rim is a plain long bar over
  the wall.
- The two secrets are now pointed at more strongly (the loft bell rings from twelve
  metres with a glint; the cold bay's seam and knot glint), but the pointers are still
  wordless, the bell uses a stand-in chime, and the cold bay's knot makes no sound.
- With "reduce motion" switched on, the view is not turned for you in the ending, so the
  line about the Rule leaning can be said with the Rule out of sight.
- The revolver is lowered when the last fire catches, not a moment earlier when the line
  about it begins.
- The goal line top left also appears during a fight (it names the fight). There is no
  option to switch it off.
- When you look straight at the man on the far rim, the crosshair sits across his feet.
- The drawing of the lift head in the lift hall is hidden behind a pillar from the middle
  of the hall.
- With exactly ten people freed, the end card says "10" under a row of twenty lamps (the
  count skips nineteen).
- The end card's numbers let you work out how many townsfolk were shot rather than
  freed, although the game never says so.
- The loading bar fills by size, but can stand still for up to a second while one large
  file arrives on a slow connection.
- The save made when the boss dies shows no "saved" mark on screen.
- When you continue from the title, the title card of the movement you are in is shown
  again, on purpose. It is shown small in a corner if a fight is already running.
- The hint that you can run may appear under the first movement's title card and beside
  a narrator line.
- When you die, the line that says what killed you is shown over the picture as the
  fight restarts; it is not held on a dark screen first.
- A visitor without a mouse is still offered "Begin" (a tablet with a mouse and keyboard
  attached can play).

## Picture

- **The revolver** is the same dark blue steel in every room, the gloves stay leather
  brown and the grip stays red wood underground. In this iteration the hammer was made
  lower and slimmer, the edges got soft worn bands and scratches, and the glove fingers
  got thinner with corded seams and folds at the joints. Still open: the wear is modest
  at normal size (it is plain only when you zoom in); the barrel points away from you as
  steeply as before, so the gun's outline is short; the broad shield behind the cylinder
  was not reshaped; the brass round held in the left hand still takes the room's colour
  (olive under the teal light). On High the steel is very slightly warmer and a little
  less shiny than on Low. In recoil the gun's outline is stair-stepped.
- **Loading the revolver**: the left hand is turned so its palm, thumb and the round face
  you, and it is a shade darker than the gun hand with a dark cuff. The two hands are
  the same leather and still touch on screen. Taking a round from a locker, loading the
  kept round, unloading and running were not looked at in the game with the new hand
  position, the new hammer or the thinner fingers.
- **The hand**: the three fingers round the grip point almost at you, so each shows about
  one and a half joints rather than a whole finger. In recoil the revolver fills the
  right third of the screen for a moment.
- The revolver now has a line of struck letters on the barrel, but it is on the side
  turned away from you: you see it only in passing. The glove's stitching is as fine as
  its texture allows; finer would need a larger texture.
- **High and Low still look almost the same in a few places**: inside the lift cage on
  the rim when you face its walls, on the near rock walls of the gully, looking from the
  gallery's far door into the lift hall (the hall's lamps get their glow only once you
  step through), and at the first look at the boss from the catwalk. Under the overhang
  at the start and on the rim at dusk High now has its own air: warm dust along the
  gully, and on the rim a mist on the plain, drifting dust and light round the lamps.
  There is still no sun shadow from High's shadow system at dusk, and no sharp shadow
  edge from the overhang on the sand.
- The broken low walls in the yard and the street end in brickwork with an uneven,
  toothed edge and loose bricks at the foot. From less than a metre away the joints
  between bricks are soft. On High the one in front of the far-rim view sits in deep
  shade and shows less of its brick than on Low.
- On High, things that are part of a level but lit on their own (the wagon, the water
  cart, the pump, crates, the table) now keep their own shading and take only a faint
  cast shadow. This changed how all of them look on High; it was checked on the wagon,
  the cart and the peg stair, not on every one.
- On High, pale straight stripes were seen on the ground in the middle of Front Street
  in one team's frames. We could not tell what causes them; say so if you see them.
- **Shadows under creatures**: in a building's shade a creature now has a darker, tighter
  shadow at its feet. On High it is weaker than on Low, because High's dust and haze are
  drawn over it. The walking machines' shadow was made larger so that their feet stand
  on it; nobody has looked at that on a real screen.
- **A black disc on a black arm hangs in the middle of the long gallery** once the three
  glowing knots there have been shot (it is the empty seat of a knot). It carries no
  light beside the teal pipes.
- **The seventh round on the stone** is now lit and sits in a violet glow, but its sleeve
  is still pale with only a hair-thin violet line. The stone's white glint fires on top
  of that glow.
- **The stone that holds the seventh round** is a cracked, layered outcrop with banded
  rock, a dressed slab on top and a small stack of marker stones. No sand drifts up its
  sides. The faceted red rock balanced behind it is unchanged and reads as a rough
  model.
- **The last picture**: the foreground is stepped rock with softly fire-lit edges, and
  the plain has low swells, a dry wash and scrub. The last fire is small and far (a
  larger one was asked for and not made), and on High it is a soft glow rather than the
  crisp flame Low shows. You can count six or seven lit windows while the end card says
  nine: the leftmost building of the town is cut by the edge of the screen (more so at
  4:3).
- **The gully's rock above head height is still a few very large flat faces** with long
  straight skylines. Its breakup is painted, not built; the "stones" on
  its floor are painted too, and so is the new wind-laid pattern on the gully's and the
  street's sand: there are still few real things lying on those floors. The patches of sun on its floor are painted: no gap in the
  rock above lets that sun in.
- **The court in front of the town gate still has nothing tall in its middle**; the
  fallen shade roof is flat. The tall pylon by the gate now has bands, missing panels and a cut cable down its
  side; its base is still a box. The trodden patches in front of the street's doors were
  placed by eye and one may sit a pace off its door.
  The grey line poles in the last stretch of the gully read weakly against the red rock.
- The tipped wagon's wheel has a pale iron tyre and ridged spokes and the water cart's
  barrel has boarded ends, but neither has wood grain or nail heads; in a building's
  shade at arm's length the wheel is still three flat values.
- The mule's bones near the start are simple shapes if you walk right up to them.
- Brick showing through broken plaster looks stepped from less than a metre away.
- Dead trees, bushes, rock slabs, the bones, the fallen poles and the half-buried pipe in
  the gully cannot be bumped into; pressing into the foot of a wall can put the view
  against a trunk.
- **On the peg stair**, the hats have a rounder crown with a dent, but they are still
  very simple (no curled brim edge, no underside), the coats still read dark olive under
  the teal light and both hang stiff; a peg without a hat reads as a small light. On
  High a soft dark halo still shows on the wall round each coat and hat (two fixes were
  tried and taken out). The stair now has a handrail, a cable run and a brighter pool of
  light at its turn; the wall beside that lamp is very dark, so the rail is hard to see
  there from the upper flight.
- **The seated figures in the Tally House** show their simple shapes from closer than
  about 70 cm (ten-sided hoods, mitten hands, box legs under the table). They are lit
  once, so they do not brighten when the shutters open. The glass knot on a freed, seated
  figure is a plain grey bead.
- The boss's glowing knots are now clusters of crystal points. The knots on the hooded
  figures, the big machine and the latches are still rounded lobes with flat facets. How
  the new crystal knot looks when it is hit or bursts was not studied.
- **The boss**: its face is now twelve bolted plates with seams and stains, and its six
  lamps are small lenses. With the muzzle almost on a plate, the enamel between the
  bolts is still smooth. On Low there is no glow round a lit lamp.
- The hoods carry two faint slits and a breath stain that can read as a face. When a
  hooded figure is freed and sits down, its hood changes shape slightly.
- **The big machine in the lift hall** has seams, rivets, grime and scuffs on its drum
  now; its arms, thighs and cap are as plain as before, and the cold one standing in the
  hall has none of the new detail. It was looked at standing still, not mid-fight.
- The ring on a stand in the proving bay shows its fourteen flat sides from two metres.
- **The seventh shot**: from the mark you face the bore, so the ring of light that crosses
  the floor leaves from behind you and you see only its far side.
- The boss room's floor has a sheen but no true reflection of the purple well and the
  lamps; from the catwalk looking down it shows little. On High the drifting motes
  underground are a few white dots against dark pillars. (A strip of floor was missing
  across both of the boss room's doorways; it is there now.)
- Underground: the rim of the bore is still a ring of large blocks; looking straight down
  the bore, the lining below the rim is visibly faceted. The lift hall's pillars and walls now carry stains, bay numbers and cable trays; the
  stains are soft at arm's length, the pillars are clean above four metres, and the
  floor between them is still a large open plate. Under a long strip lamp, High's light cone comes from the
  strip's middle rather than its whole length.
- The lift cage at the rim: its back wall is noticeably brighter than the rest of the
  cage against the dusk.
- On High a dark soft-edged smudge shows round some wall plates underground.
- On High the sun, when in view from the yard, is a bleached blob that swallows its disc.
- The ammunition dispenser in the antechamber is a flat dark block at arm's length.
- The cabinet at the foot of the lift-hall ramp has no cable run or stained foot. A small
  pocket beside it, the ramp and the gantry can hold the player briefly.
- The first frames after the first load are drawn at reduced resolution under a fade from
  black, by design. On a slow machine the picture may stay soft for longer.
- The preview renders in `shots/art-weapons/` show an older revolver and gloves, and the
  gun's own preview tool draws the hands with the wrong texture.

## Performance and build

- **The title cannot be shown before the street and the Tally House have arrived.** The
  first load fetches about 9.4 MB in 60 requests before the title appears: about 4
  seconds on a 25 Mbit line, longer on a slower one. The script is one 1.76 MB file
  (0.52 MB compressed).
- **Memory on High at 1080p is close to its limit** in one place: 121 of 128 MiB while the
  Tally House and the gallery below it are both loaded. Low peaks at 55 of 64 MiB.
- High draws up to about 226 500 triangles in the yard (the limit is 400 000) because the
  town is drawn a second time to cast shadows. Low peaks at about 100 400 of 120 000 and
  68 draw calls of 100.
- The game still allocates about 4 to 6 kB of memory per tick and drawn frame (inside the
  3D library and the main loop; the boss's second phase is the highest at 5.8, up from 5.1). Memory
  stays flat in long runs and no tick is slow, but it is not the zero we aimed for.
- The first time you choose High in Options, its shaders are compiled behind the pause
  menu, which can hitch on a slow machine. An automatic step down to a lower setting is
  now prepared during the first load; if the game changes area and steps down in the
  same moment, a short hitch is still possible.
- On the lowest setting ("min") the picture's size still changes in steps when the game
  lowers its resolution to keep up.
- Going down the lift at the end, and every "restart from checkpoint", still builds the
  level's collision data in one go (behind a dark or loading screen).
- After three full runs in one page without a reload, two stale lamp entries per run
  remain in memory (a few hundred kB). Reloading the page clears it.
- Rebuilding every asset from the Blender scripts takes about nine minutes, and any change
  to a design file rebuilds all of them. Two rebuilds give the same files except the
  outdoor lightmap, which differs slightly each time. Edits to the revolver's and the
  hands' helper scripts are not noticed by the build and need `--force`. A prop that is
  merged into a level and needs two materials must be built as two meshes.
- The street and yard are at the limit of what the Low setting may plan for (about 160
  triangles of plan left), and the boss room's level file has 19 triangles left; the boss itself has 29.
- The triangle count the game submits from the peg stair includes every coat and hat in
  the gallery, seen or not (hidden ones are drawn at zero size). It is inside the limit.

## Tests and tools

- The scripted "plain", "middling" and "careless" players were run once each per fight at
  the close of the fourth iteration (one seed): a small sample. They were not run again
  in the fifth or the sixth, in which no fight was changed. A whole-stage run with them was not made.
- The test player shoots the big machine's back vent from the front (slower, still passes)
  and never looks at the watcher in the stair niche, so that line is not exercised by the
  full run (a separate test covers it).
- One test of the loading bar ("the loading line follows the bytes in") failed twice in
  this iteration. The fault was in the test (it counted a file a moment before the page
  could know of it); the test now allows for that moment. The bar itself was not changed.
- Two picture tests pass by a hair: the revolver in the boss room is just bright enough
  against the room behind it, and the soft corner shading in the gallery on High is just
  strong enough. Brightening the boss room or weakening that shading would fail them.
- One test allowance from an earlier iteration is still loosened: the revolver in the
  Tally House may be 2.5 lightness steps brighter than the room behind it (it was 2).
- The debug hook is gone from the published script, but each system's own debug helpers
  (teleport, solve a puzzle, clear a fight) are still inside it, unreachable without the
  hook. Removing them would save about 15 kB.
- The three longest test suites take 6 to 10 minutes each when run one at a time on this
  machine (render, interface, world). A time limit shorter than 15 minutes will cut them
  off; a suite that is cut off no longer leaves browsers running.
- Some image viewers recolour large or teal-heavy screenshots (the revolver can look plum
  or brown in a contact sheet). The files themselves are right; judge colour from a
  single frame at full size.
