# Known issues in this build (2026-10-07, after the third iteration toward release)

This is everything we know to be still open. Nothing here stops the stage from being
played from the title to the end card. The numbers behind each line are in
`docs/INTEGRATION_REPORT.md`, Part P.

## Not yet checked by a person: the most useful things to report

- **Frame rate on a real graphics card.** The game has only ever run on a software
  renderer. We do not know its frame rate on integrated graphics, or what the High
  setting costs. In this pass High gained cones of light under ceiling lamps, drifting
  dust underground, shafts of sun in the gully, stars at dusk and a glow round the far
  town's lamps; none of it has been timed on real hardware. If it stutters, add `?perf=1`
  to the page's address for the overlay and tell us the numbers, your graphics card and
  whether the setting was Low or High.
- **Automatic quality.** The game picks Low or High by itself on the first load. The
  thresholds it uses were never measured on real hardware. If it picks badly, say what it
  picked; Options lets you override it.
- **Sound.** All audio is synthesised and nobody has listened to it on speakers. Reports
  on loudness, harshness and whether cues can be told apart are welcome.
- **How it plays in human hands.** Every fight was tuned with scripted players, and they
  were not replayed after this pass's changes (the boss's opening speech is five seconds
  shorter and its rule is now taught at the first hit and the first retry). Easy and Hard
  were not replayed. The timing of the narrator's lines, which now wait for you to look at
  the thing they are about, was checked by script, not by a person.
- **Screens that are not 16:9.** Ultra-wide (21:9) and 4:3 were checked for the menus and
  the ending, but not for every scene. At the dial on the bore door the lowered revolver
  was checked at 16:9 only.
- **The published page.** It was checked locally from a sub-path with a plain file
  server. The publishing workflow has never run; somebody should open the real page once.

## Fights

- **The corridor fight underground (the queue of six) barely touches a careful player.**
  A player who backs away and shoots straight takes one hit at most. It does punish
  standing still.
- **The big machine in the lift hall is the costliest fight before the boss.** Its ground
  slam takes more than a third of your health. A player who never steps out of the ring
  still dies to the third slam, though the game tells you to move.
- **Standing still in the boss's second phase is still fatal** (about 16 seconds after a
  respawn). The game now says "move" the first time you are hit.
- **In the corridor fight, the two enemies that come from behind slow down if you turn
  and watch them from far away.** It can look odd.
- The street fight now begins when you come within about 20 metres of the kneeling figure
  or look at it from a little further, not at the gate. Nobody has played it that way by
  hand.
- On Hard, only the timing of the boss and the big machine is tighter; nobody has played it.

## Story and guidance

- **The wait before the boss fight is shorter but still a wait**: 17 seconds from the
  machine's first line to the moment you can act, 22 to the fight proper, and about 2
  seconds more if a narrator line is on screen as you walk in.
- On a second attempt in the same sitting, a shot during the boss's speech skips to the
  end of it instead of counting as a refusal. Nothing on screen says so, and the game
  forgets it if you reload the page.
- The six small lamps on the boss that light up as it names its chambers are only a few
  pixels each on the Low setting.
- **A fast player can still miss narrator lines.** If the yard's walking machine is shot
  down before it turns to you, its introduction is never said. The watcher in the stair
  niche speaks only if you look at it. On the peg stair, a player who runs straight down
  and on into the bay does not hear the second line about the coats.
- In the Tally House at a brisk pace, the station's line about daylight comes several
  seconds after the lights come on, because it waits for two narrator lines. The line
  about the table cloth is dropped if you shoot the cord quickly.
- **In the ending where you leave the round on the stone, one line about the round
  ("He had not taken hers. She had given it.") is still said.** Two earlier reviewers
  read it as belonging to the other ending. It was kept on purpose; say so if it
  confuses you.
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
- The bell in the loft that hints at a secret uses a stand-in chime, not a bell sound.
- When you continue from a save that opens a new movement, the movement's title card is
  shown again.
- The hint that you can run may now appear beside a narrator line (on its own row).

## Picture

- **The revolver in the Tally House** is still warm: under the lamps its barrel carries a
  broad orange band and the whole gun reads bronze rather than blue steel. **In the dark
  rooms** (the gallery, the plate door, the rim) the steel is lighter than what is behind
  it, where a reviewer asked for darker.
- **The hand**: the three fingers round the grip point almost at you, so each shows about
  one and a half joints rather than a whole finger, and the little finger is below the
  edge of the screen. The gloves take the room's colour whole (olive under the teal
  light underground).
- The revolver's flank has no engraving or maker's mark. Taking a round from a locker and
  unloading were not looked at frame by frame with the new hand.
- **High and Low still look almost the same in a few places**: inside the lift cage on
  the rim, looking back at that cage, the yard looking at the derrick, and the view down
  on the big machine's hall. Outdoors the average difference between the settings did
  not grow in this pass; what High adds changed (shafts, deeper shadow, stars).
- On High, a plain wall close to you in shade can look like a flat dark plum block.
- **The gully's rock above head height is still a few very large flat faces** with long
  straight skylines; only the band you walk beside was broken up. The patches of sun on
  its floor are painted: no gap in the rock above lets that sun in, and on High each
  shaft fades in a few metres over the floor.
- **The court in front of the town gate still has nothing tall in its middle**; the
  fallen shade roof is flat. The grey line poles in the last stretch of the gully read
  weakly against the red rock.
- The mule's bones near the start are simple shapes if you walk right up to them.
- Brick showing through broken plaster looks stepped from less than a metre away. The
  adobe walls got new paint only, no new shapes.
- In the last picture the leftmost building of the town is cut by the edge of the screen
  (more so at 4:3). The dune in front of the fire has no fire-lit edge.
- Dead trees, bushes, rock slabs, the bones, the fallen poles and the half-buried pipe in
  the gully cannot be bumped into; pressing into the foot of a wall can put the view
  against a trunk.
- **The coats on the peg stair** now have backs, collars and sleeves, but hang stiff, and
  from arm's length their outline is close to a rectangle. Under the teal light they are
  dark olive and their toggles are faint. On High a soft dark halo shows on the wall
  round each coat.
- **The seated figures in the Tally House** show their simple shapes from closer than
  about 70 cm (ten-sided hoods, mitten hands, box legs under the table). They are lit
  once, so they do not brighten when the shutters open. The glass knot on a freed, seated
  figure is a plain grey bead and can read a little like a cap.
- The glowing knots on machines and latches (the yard and hatch latches, the boss's
  mouths) are still clusters of flat facets; only the hooded figures' knots were remade.
- The hoods carry two faint slits and a breath stain that can read as a face.
- When a hooded figure is freed and sits down, its hood changes shape slightly.
- The ring on a stand in the proving bay shows its fourteen flat sides from two metres.
- **The seventh shot**: from the mark you face the bore, so the ring of light that crosses
  the floor leaves from behind you and you see only its far side. The drifting dust on
  High is a few small specks in any one frame.
- Underground: the rim of the bore is still a ring of large blocks; looking straight down
  the bore, the lining below the rim is visibly faceted. The peg stair's concrete shows
  faint dark course lines. Under a long strip lamp, High's light cone comes from the
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
- The preview renders in `shots/art-weapons/` show an older revolver and gloves.

## Performance and build

- **Memory on High at 1080p is close to its limit** in one place: 121 of 128 MiB while the
  Tally House and the gallery below it are both loaded. Low peaks at 55 of 64 MiB.
- High draws up to about 220 000 triangles in the street and yard (the limit is 400 000)
  because the town is drawn a second time to cast shadows. Low peaks at about 97 000 of
  120 000.
- The game still allocates about 5 to 6 kB of memory per tick and drawn frame (inside the
  3D library and the main loop). Memory stays flat in long runs and no tick is slow, but
  it is not the zero we aimed for.
- The first time you choose High in Options, its shaders are compiled behind the pause
  menu, which can hitch on a slow machine. Switching back and forth afterwards is free.
- The script is one 1.7 MB file (0.5 MB compressed). The first load fetches about 9.4 MB
  in 60 requests before the title appears.
- After three full runs in one page without a reload, two stale lamp entries per run
  remain in memory (a few hundred kB). Reloading the page clears it.
- Rebuilding every asset from the Blender scripts takes about nine minutes, and any change
  to a design file rebuilds all of them. Two rebuilds give the same files except the
  outdoor lightmap, which differs slightly each time.
- Several pieces are at the edge of their triangle allowance and cannot be refined
  further without moving allowance from elsewhere: the street and yard (about 160
  triangles left), the boss room (175), the upper gully rock (under 300).
- The triangle count the game submits from the peg stair includes every coat in the
  gallery, seen or not (hidden ones are drawn at zero size). It is inside the limit.

## Tests and tools

- The scripted whole-stage runs with a "plain" and a "careless" player were not repeated
  after the last changes; each team replayed only what it changed.
- The test player shoots the big machine's back vent from the front (slower, still passes)
  and never looks at the watcher in the stair niche, so that line is not exercised by the
  full run (a separate test covers it).
- One test allowance was loosened in this pass: the revolver in the Tally House may be
  2.5 lightness steps brighter than the room behind it (it was 2).
- One run of the sound tests failed once because the test machine's network changed
  under the browser; the second run passed.
- Nothing of the last four passes is committed yet. The page is published from a commit,
  so every changed and new file must be committed before the release tag (the list is in
  the integration report, P.7).
