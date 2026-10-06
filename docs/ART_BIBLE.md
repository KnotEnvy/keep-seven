# KEEP SEVEN — Art Bible

Stage one, *First Tally: Plenty*. Status: **binding** for every Blender artist, the
rendering/VFX owner and the UI owner. `docs/GDD.md` is authoritative for design; where this
document gives a number the GDD also gives, the GDD wins and this file has a bug. Where
`docs/ARCHITECTURE.md` or `design/assets.json` later fix a file name, node name or budget,
those win and this file is updated to match. **`design/layout.json` wins on every position
and on the size of every opening** (section 7.1, "Openings"). Revision 2 of this file
rewrote sections 3.3, 7 and 13 to the blockout and the manifest (GDD section 23).

Inputs: `docs/GDD.md`, `docs/research/art-tone.md` (palette B "Long Light" measured there),
`docs/research/blender-pipeline.md` (what survives export), `docs/research/tech-web.md`
(what the runtime can afford).

Conventions used throughout:

- Units metres. Game space: +Y up, −Z forward, right-handed. **Compass: north = −Z,
  east = +X, west = −X, south = +Z.** If `design/layout.json` defines the compass
  differently, the compass bearings in this file are the truth and the vectors are
  re-derived from them.
- A game-space point `(x, y, z)` is Blender `(x, −z, y)`. Vectors below are game space
  unless marked "Blender".
- **Facing:** every character, creature, door and facing prop is authored facing **+Z in
  game space** (Blender −Y), the glTF front. The first-person view-model is the exception:
  it is authored in camera space, camera at the origin, barrel toward −Z.
- Colours are sRGB hex. Albedo values are what goes into vertex colour or a texture
  (converted to linear when written to a colour attribute). Display targets are what a
  screenshot pixel should measure.
- Names: snake_case, unique across objects, bones and meshes, no dots or spaces.

---

## 1. The look

### 1.1 One paragraph

A late-afternoon desert seen as a painting made of big faceted shapes: peach haze, long
mauve shadows that run down the street toward the player, red rock and grey board gone
almost the colour of the ground, and coming up through all of it the celadon-white ceramic
and petrol steel of a 1970s public utility that was built for loads, not people, and has
not stopped working. Surfaces are flat colour with painted gradients (sun-bleach from
above, dust from below, baked occlusion in the creases), carried by vertex colour and a
handful of greyscale trim strips; the richness is all in the baked light, the fog and the
sky. Frontier things lean, sag and never repeat. Old-World things are exact, over-scaled
and identical, and their decay is a missing module. Three colours glow and nothing else
does: flame for people, aqua for the works working, violet for wrong. The darkest,
sharpest, most neutral object on screen is always the blued revolver in the lower right,
and when it fires it is the only light in the room.

### 1.2 Three rules

1. **Three values, two temperatures.** Every hero view reads as light, mid and dark shapes
   when squinted at (exterior about 60 / 30 / 10; interiors invert it). Light is warm,
   shadow is cool mauve or blue. Never grey shadow, never black, never white.
2. **Shape before surface.** Silhouette, lean, bevel and a baked shadow do the work.
   Detail is rationed and spent where hands and eyes go: the gun, doors, latches, plates,
   interactables. Large surfaces stay quiet and dusty (OKLCH chroma ≤ 0.11).
3. **Three glows, each with one meaning.** Flame `#FF9433` = people, and heat that will
   hurt. Aqua `#7CF2E2` = the old works working; never hurts. Violet `#B24BFF` with a
   near-white core = wrong, and where a round goes. Every emissive sits in a dark bezel.

### 1.3 Three anti-rules

1. **No primitives.** No object may read as a lone cube, cylinder or sphere. Everything is
   built from overlapping parts with gaps and shadow lines, every hard edge is bevelled,
   every Frontier part is jittered. A raw `create_cube` in a final asset is a reject.
2. **No noise.** No grunge overlays, no photographic or high-frequency tiling textures, no
   normal maps on Low, no speckle. If a surface needs more interest it gets a gradient, a
   seam, a streak under a fastener, or a missing piece.
3. **No fourth colour, no neon.** Nothing glows outside the three hues. No violet key
   light outdoors, no tube-light outlines, no saturated large surface, no orange-and-teal
   pushed past the measured palette. And nothing from the homage blocklist
   (`art-tone.md` 1.5, 1.6): no roses, no dark spire on the horizon, no robed pursuer, no
   scarecrow shapes, no faces.

---

## 2. Palette

### 2.1 Final palette (albedo unless stated)

**Ground and Frontier (warm, mid-value, matte)**

| Name | Hex | Use |
|---|---|---|
| `sand` | `#CDA070` | all open ground, drifts, the dust skirt on every wall |
| `sand_pale` | `#DDB98C` | drift crests, sun-bleached tops, far ground |
| `rock` | `#A3563A` | gully walls, mesa, the overhang (lit faces) |
| `rock_dark` | `#63302A` | strata bands, undercuts, the overhang interior |
| `rock_cap` | `#C27A55` | top 10 % of any rock mass (bleach) |
| `adobe` | `#B98A62` | plastered walls, well-house, wall stubs |
| `adobe_base` | `#8E6549` | bottom 0.4 m of adobe, damp line, eroded patches showing brick |
| `board` | `#6E4E38` | grey board: facades, porch posts, wagon, furniture |
| `board_bleached` | `#927560` | top faces and south/west faces of board; replaced boards are `board`, old ones this |
| `board_dark` | `#3B2A22` | end grain, charred hearth timber, interior rafters |
| `tin` | `#8B8478` | corrugated sheet, cups, tins, the kettle |
| `rust` | `#B5522B` | fasteners, straps, the pylon, streaks (≤ 5 % of any surface) |
| `linen` | `#D8CDB4` | well-linen: **Bider hoods**, the share cloth, strain cloths. The palest Frontier value; reserve it for these |
| `cord` | `#A58B63` | well cord, rope, lashings |
| `leather` | `#7A4E32` | boots, straps, the Reeve's gloves (`#8A6A48` for the glove body) |
| `workcloth` | `#5E4636` / `#7A5B45` | Bider clothes ("gone the colour of the ground", but two steps darker so they are dark shapes on lit sand) |
| `town_paint` | `#6F9A94` | the town's hand-brushed well mark. A chalky imitation of the livery aqua. **Not emissive.** Only on door marks, troughs, the share cloth's family marks |
| `chalk` | `#E9E4D6` | tally wall, slate |
| `graphite` | `#3A3A40` | the Dowser's pencil: the strike through every door mark, his notes |
| `clay` | `#A9623F` | jugs, fired pots |
| `ash` | `#8C8780` / `#2A2623` | hearth ash, the ember bed at stop three, charred wood |

**Old-World / Pellam (cool, value extremes, satin)**

| Name | Hex | Use |
|---|---|---|
| `enamel` | `#CFD6CC` | celadon-white ceramic panel, ribs, the pump drum, Transit, Tamper, Windlass |
| `enamel_stain` | `#AEB6A8` | below seams and fasteners, lower third of outdoor ceramic |
| `steel` | `#36525A` | petrol blue-green structural steel, frames, floor plate |
| `steel_dark` | `#1E2F36` | bezels round every emissive, recesses, grille backs |
| `concrete` | `#6F7A76` | cast walls and floors underground, formwork lines |
| `cable` | `#1B1F24` | braided cable, gaskets, tyres. The darkest world colour; still not black |
| `livery` | `#4FB8AC` | the painted 10 cm band at 1.2 m. Non-emissive paint. On the Tamper this band is replaced by emissive violet until the proof |
| `hazard` | `#B58A3C` | broad faded diagonal on moving parts and kerbs. Never black-and-yellow stripes |
| `brass` | `#B88A3A` | cartridges, proving marks, the brass mark on the proving step, lamp bezels on the bore door |
| `lens` | `#0E1418` | glass over a dark cavity (opaque; no transparency) |

**The gun and the Reeve (neutral, the darkest and sharpest)**

| Name | Hex | Use |
|---|---|---|
| `gun_blue` | `#1C2230` | frame, cylinder, barrel body. Darker than `cable`: the darkest surface in the game |
| `gun_worn` | `#6B7078` | muzzle crown and first 30 mm of barrel, cylinder flute ridges, hammer spur, gate edge, every sharp edge (edge-wear mask) |
| `walnut` | `#3A2318` | grip panels; `#5A3824` on the worn heel |
| `glove` | `#8A6A48` | gloves; palm and trigger finger worn to `#A58460` |
| `skin` | `#9A6B4F` | the bare wrist strip only |
| `cuff` | `#3A3432` | oilcloth coat cuff, `leather` binding |
| `kept_band` | `enamel` with a `livery` hairline | the band round the kept round: it wears Pellam livery, and nobody in the Assize ever read it that way |

**Emissive (the only three; values are display targets and emissive colour)**

| Name | Hex | Core | Carried by |
|---|---|---|---|
| `flame` | `#FF9433` | `#FFE9B8` | lantern, embers, lit windows, the last fire, muzzle flash, stakes, canister rings, the lance, tracers |
| `aqua` | `#7CF2E2` | `#E6FFFB` | strips, lamps, locker lamps, the line round, proving marks, the standing line |
| `violet` | `#B24BFF` | `#F0DCFF` | knots, Bider eye-slits, the Tamper's band and vents, Transit lens at rest, the bore, the Rule |

**Sky, fog, light: see section 3. UI colours: section 10.**

### 2.2 Usage rules

1. **Convergence.** Anything old drifts toward `sand`. Blend the bottom 0.6 m of every
   outdoor wall, post and machine 60 % toward `sand` (the dust skirt) and the top 15 %
   toward the `_bleached`/`_cap` variant. Only living or powered things keep chroma.
2. **Area caps per frame (exterior):** `enamel` ≤ 15 %, `rust` ≤ 3 %, `town_paint` ≤ 1 %,
   `linen` ≤ 2 % (so a hood is always the palest small thing on the street).
3. **Per-face jitter** of ±6 % value (Frontier) or 0 % (Pellam). Pellam variation comes
   only from `enamel_stain` streaks and from which module is missing.
4. **Paint survives at 30 % saturation.** There is no fresh paint in Plenty.
5. **Black and white do not exist.** Floor is `#0B0D12`-equivalent on screen at the very
   darkest (grade lift guarantees it); ceiling for non-emissive surfaces is lit `enamel`.
6. Metals are painted, not simulated: no metallic PBR on world or enemies (a metallic
   surface under a lightmap is black). The gun alone gets a specular treatment (section 8).

### 2.3 Value structure

| Space | Light : mid : dark (area) | Lightest thing | Darkest thing | What the eye goes to |
|---|---|---|---|---|
| Overhang (first 10 s) | 25 : 5 : 70 | the valley through the mouth | the rock frame | the opening |
| Exterior Long Light | 60 : 30 : 10 | sun-facing sand, hoods, enamel | Biders, doorways, the gun | dark figures, the wind-pump, the Rule |
| Tally House | 8 : 22 : 70 | shutter hairlines, then blades of sun | rafters, far corners | latches (white insulators), hoods on the table |
| Gallery / stair | 10 : 30 : 60 | aqua strips, hoods | pipe banks | the receding strips, the brass mark |
| Lift hall | 8 : 27 : 65 | lamp streaks on the floor, Tamper enamel | far wall in fog | the ring portal, the Tamper |
| Bore chamber | 12 : 28 : 60 | knot cores, lamps | ribs (back-lit by the bore) | the drum face |
| Rim (blue hour) | 10 : 35 : 55 | ember band, lit windows, the thread | the rock frame, the ledge | the lamps, then the stone, then the fire |

Squint test numbers critics may measure on a 960 × 540 shot blurred to 32 × 18: at least
three clusters of luminance separated by ≥ 18 L* (CIELAB), and a dark-figure-on-ground
contrast ≥ 6:1 outdoors (measured 8.5:1 in the palette study).

### 2.4 Where violet is allowed (complete list)

Violet is under **2 % of any frame until the bore catwalk**. Outside this list it is a bug.

| Where | Form |
|---|---|
| Every exterior | the Rule: one constant-width hairline in the sky shader, north, never a target |
| Biders | two eye-slit pinpricks (≤ 3 px at 10 m) and the crown knot |
| Latches and mechanisms | `knot_*`: yard latch, hatch latch, cold bay latch, `knot_a/b/c`, pawls, Windlass mouths |
| Transit | lens core at rest (it flares to flame when aiming) |
| Tamper | the livery band and the glow behind both vents |
| Gallery | one hairline under the baffle door (emissive strip 2 cm × 3 m) |
| Bore catwalk, chamber | the bore's glow; baked violet light from below; threads at relight |
| Far rim | the Rule again, 2° lean; the faint violet band on `ia_stone_round`; the HUD seventh in state `violet` |

After the seventh (`wrong_fade` → 1) all of these except the Rule and the stone round go
grey (`#8A8A92`) or aqua (bands). The antechamber is **not** violet: it belongs to the
Dowser's embers.

---

## 3. Lighting plan

Shared principles:

- **Everything static is baked in Cycles.** Lightmaps on surfaces the player gets within
  10 m of; vertex-colour light on everything else; AO-only vertex colour on instanced and
  dynamic assets. The world material is unlit (`albedo × baked light`); section 4.6 lists
  bake classes.
- **Bake calibration, not magic numbers.** Light strengths are given as *bake-output
  targets*. Before baking a zone, bake a white diffuse test plane: facing the key it must
  read `key`, in open shade facing up it must read `ambient` (both linear, as below).
  Adjust the lamp and world strengths until it does. Sun angular diameter in the bake: 4°.
- **Shadows are large soft shapes.** No baked shadow detail finer than 15 cm; crisp edges
  come from geometry silhouettes.
- **Dynamic objects** (enemies, view-model, pickups, moving props) are lit by a per-zone
  ambient colour plus one unshadowed key, values in each table ("dyn ambient", "dyn key"),
  cross-faded over 0.3 s at zone boundaries, and get a blob shadow.
- **Dynamic light sources are exactly these:** the muzzle pulse (radial term in the world
  shader + pooled point light on dynamic objects, flame, r 7 m, 70 ms); the ring at the
  seventh (same term); `wrong_fade`; emissive toggles (lamps, strips, proving marks,
  windows); additive cards. Nothing else changes light at runtime.
- Fog colour = horizon colour, always. Fog is `1 − exp(−density × distance)` plus the
  height term from `tech-web.md` section 7 (`uFogHeight = base y, falloff, extra`).

Sun, all Long Light zones: azimuth 315° (north-west), elevation 14°.
**Direction to the sun `S = (−0.686, 0.242, −0.686)`**; light travels `(0.686, −0.242,
0.686)`. Blender: to-sun `(−0.686, 0.686, 0.242)`. Shadows are 4.0× the height of what
casts them and run south-east: toward the player walking north down the gully (sun
ahead-left) and west along the street (sun ahead-right).

### 3.1 Mood L0 — the overhang and the glare (`the_lip`, first 20 s)

Same bake as L1. Only the grade changes.

| | |
|---|---|
| Time | the same afternoon, eyes not yet adjusted |
| Inside the overhang | no direct sun; baked bounce only. Rock reads `#2A1A1E`–`#48272D`. The mouth is a clean dark frame: silhouette authored as a deliberate shape (one notch upper left, one fallen slab lower right), not noise |
| Glare ramp | on stepping out: exposure +1.3 stops, saturation ×0.75, fog colour toward `#E6E2D0`, fog density ×1.6; all ease to L1 over 20 s (`smoothstep`). The Rule and the pylon line must already read at the start of the ramp: the hairline's halo is not exposure-scaled |
| Stop one | under the overhang lip in bounce light. **No fire and no ash** (GDD section 2, "The trace"): a swept patch of floor, a flat stone, his coffee pot, the note. The spent case on the note is the one glint (brass, 2 px sparkle sprite) |

### 3.2 Mood L1 — Long Light (`the_lip` gully, `plenty_street`, pump yard)

| | |
|---|---|
| Time of day | late afternoon, about an hour of light left |
| Sun | `S` above; disc `#FFE9B8`, drawn radius 1.6°, halo to 14° |
| Key (bake target, sun-facing white) | `#FFD09A` × 1.30 |
| Ambient (bake target, open shade) | `#7A86D8` × 0.90. Deliberately violet-blue, **not** sky-coloured: gives mauve shadows at about 5.5:1 instead of olive mud |
| Sky gradient | zenith `#2C5A6E`, mid band `#8FB0A0` at 25° elevation, horizon `#F3C58E`; below horizon `#C9A592`. Dithered in the shader. 5 faceted cloud cards, flat-bottomed, lit edge `#FFE0B0`, body `#B9A79C`, all in the western half |
| The Rule | azimuth 0° (north), a hairline from behind the far mesa to past the zenith, leaning **1° toward the east**. Core `#F0DCFF` 2 px constant, halo `#B24BFF` 10 px at 25 %. No bloom dependence |
| Fog colour | `#EDBB86` looking toward the sun, `#C9A592` away (one dot product) |
| Fog density | 0.0058 /m (20 % at 40 m, 50 % at 120 m, 87 % at 350 m) |
| Height fog | base = local ground y; falloff 0.35 /m; extra 1.5 in the gully (dust below 3 m), 0.6 on the street, 0 in the yard |
| Display targets | lit sand `#F4A272`; shadow on sand `#5C4E59`; lit rock `#B65239`, rock shadow `#48272D`; lit board `#7E4C38`, board shadow `#2E222B`; enamel in shade `#5D6AA4` |
| Dyn ambient / key | ambient `#7A86D8` × 0.55; key `#FFD09A` × 1.1 from `S`. In baked shadow volumes (marked in layout) key × 0 |
| Practicals | none lit. Lanterns hang dark on the street (they are lit only on the rim card at the end). The sweep, the wind-pump rotor and the pylon are the moving silhouettes |
| Emissives | Bider slits and knots; `knot_yard_latch` on a dark steel latch plate; Transit lens; `aqua`: one status lamp on the pump drum door (on the seam; the town has hung a cup under it), one on `ia_ammo_box` |
| Atmosphere | cloud-shadow scroll (128² noise, world space, 0.6 m/s toward the south-east, multiplies baked light by 0.82–1.0); low sand streaks in the gully; heat shimmer on the horizon band (High only); sand sparkle on sun-facing sand (thresholded, High only) |
| Baked | sun, ambient, bounce (2 bounces), AO. Lightmap `lm_surface` on gully floor and first 3 m of walls, street ground, facades to the eave, yard ground, yard walls, drum base. Vertex light on everything above the eave, the wind-pump frame, rock above 3 m, props |
| Dynamic | muzzle pulse (barely visible in daylight: scale to 35 %), cloud shadow, blob shadows, rotor, sweep |

Composition law for L1: every post, porch and figure throws a shadow at the player. Cover
is visible as a dark shape with a warm rim. The way forward is the brightest gap. Each
facade shows one lit face (west/north) and one shadowed face.

### 3.3 Mood L2 — the Tally House (`tally_house`)

| | |
|---|---|
| Time | the same hour; the room has been shut four days |
| Sun | `S`, admitted only as hairlines round three west shutters (each a 15 mm slot baked as a thin emissive-lit streak on the surface its blade will land on) and, after `daylight`, as blades. A blade descends 0.25 m per metre of path (0.353 m per metre east) and drifts 1 m south per metre east. **Windows and landing spots are the layout's** (`shutter_*`.`params.window` and `.blade.hits`): openings 1.2 x 0.9 m at 4.05–4.95 m in the west wall; S lands on the tally wall (south wall, east of the door) at (−87, 1.33, −15); M on the head chair (−85.5, 0.8, −20) then the hearthstone (−84.1, 0.3, −18.6); N on the share cloth (−94.2, 3.87, −34.5) and, with the cloth down, the day-cell (−92.5, 3.27, −32.8). The hall is 5 m to a flat roof; nothing may hang in a blade path |
| Ambient (bake target) | `#3A2A30` × 0.25 at floor level: warm brown-black. Shadows `#2E222B`, never neutral |
| Key practical | one lantern on the south end of the table (−89, 0.95, −18.9): flame `#FF9433`, baked radius 3.5 m, falloff soft. Gutters by modulating an additive halo sprite ±15 % at 7–9 Hz, **not** the bake |
| Bounce | the baked sun streaks warm the ceiling over each shutter |
| Hatch glow | a second small lightmap layer or vertex set for the north-west end: aqua up-light from the 4 x 2 m hatch frame, radius 5 m, intensity so hoods at 6 m read `#4A7F86`. **Switched on with `hatch_powered`** as an additive lightmap term or emissive-lit vertex set (the GDD fail-safe for Reduce Flashes / Low) |
| Fog | colour `#2E222B`, density 0.020 /m, no height term. Exposure opens +1.0 stop on entry over 1.5 s; the doorway behind blooms to `#FFE3C0` |
| Dyn ambient / key | ambient `#4A3A44` × 0.35; key off, except inside a blade volume: key `#FFD09A` × 1.2 from `S` |
| Emissives | the day-cell on its hanger over the hatch (pale disc, off → aqua); aqua strips day-cell → tie-beam → west wall → floor → hatch frame (off → on); hatch latch lamp; `knot_hatch_latch`; Bider slits and knots (the only violet); lantern flame |
| Blades (after each latch) | per shutter: two crossed additive cards, flame-white `#FFD9A8` at 22 % peak, plus one additive sun-patch quad ≤ 2.5 × 1.5 m on the landing surface; dust motes only inside the card volume. Fade each card edge-on and within 0.3–2.5 m of the camera |
| Baked | lantern, hairlines, AO, everything static. `lm_tally` 1024² covers floor, walls to 3.2 m (the whole tally wall), table top and benches; walls above 3.2 m, window reveals, vigas and the roof underside are vertex-lit |
| Dynamic | the muzzle pulse at 100 % (this is its room: every shot is a flashbulb photograph of eleven seated figures); blades; hatch layer; lantern halo |

### 3.4 Mood L3 — peg stair and gallery (`the_gallery`)

| | |
|---|---|
| Time | none. Station light |
| Key | the aqua strips themselves: emissive `#7CF2E2`, baked. One 1.2 m strip per 3.6 m of ceiling, in a single receding row. **One in eight flickers** (those strips are excluded from the bake and drawn as emissive + halo only, so the bake never lies) |
| Ambient (bake target) | `#132547` × 0.30, deep blue |
| Peg stair | dark until `daylight`; then one aqua strip per flight. Coats are lit from above only: tops `#6FA7A8`, hems lost in blue. The low bare pegs sit in the pool of the second strip so they cannot be missed |
| Proving bay | the one steady, slightly brighter lamp over the brass mark (aqua-white core). Range plates catch it as three pale discs |
| Violet | one hairline under `ia_baffle`, 2 cm × 3 m, with a 0.6 m baked spill on the floor |
| Fog | colour `#0F1C33` → picks up aqua with distance (`#17414B` at 40 m via the sun-scatter term pointed down the gallery axis); density 0.023 /m |
| Floor | satin `concrete`; a smeared bright streak under each strip is baked (stretch the light's footprint 3× along the gallery axis) |
| Dyn ambient / key | ambient `#1E3A5C` × 0.45; key `#7CF2E2` × 0.5 from straight above `(0, 1, 0)` |
| Baked | strips, AO, spill. `lm_gallery` 1024²: bay, baffle wall, one gallery module (instanced along the run; the lighting is periodic so one module's lightmap repeats), stair landings |
| Dynamic | flicker strips, knot pulses, loop rim (aqua on "standing right"), door lamps, muzzle pulse 100 % (the only warm light) |

### 3.5 Mood L4 — the lift hall (`lift_hall`)

| | |
|---|---|
| Key | two rows of aqua lamps 9 m up over the rib rows, receding east; each bakes a streak on the satin floor. Lamps instanced; one in eight dead (dark, not flickering) |
| Ambient (bake target) | `#132547` × 0.22 |
| The ring | lit from inside its own reveal by a continuous aqua strip (baked), so the 9 m portal is a pale circle on a dark wall: the brightest large shape in the room |
| The diagram | 4 m relief on the wall beside the ring: six discs with a small lamp each (aqua, dim) and the seventh's lamp aqua-white and steady. Baked spill |
| Fog | colour `#0E1A2E` → `#143540` far; density 0.026 /m; the east wall is 70 % gone |
| Violet | only the Tamper (band, vents). Cold bay: the second Tamper's band is `livery` aqua paint under one clean aqua lamp: the cleanest object in the game |
| Dyn ambient / key | ambient `#1E3A5C` × 0.40; key `#7CF2E2` × 0.45 from `(0, 1, 0)` |
| Baked | `lm_hall` 1024²: floor, ribs to 4 m, gantry, ramp, ring reveal. Walls above 4 m and the ceiling are vertex-lit |
| Dynamic | muzzle pulse 100 %; slam ring; charge sparks; Tamper emissives |
| Lift ride | black shaft. Six instanced aqua lamp bars scroll upward past the static cage at a slowing rate (4 m/s → 0.5 m/s). Cage interior lit by a dim baked aqua wash; no fog change |

### 3.6 Mood L5 — the bore (`the_bore`)

Three sub-moods, one resident set, **all six-fold symmetric about the bore axis inside
the chamber** (bake one 60° sector).

| | Catwalk | Antechamber | Chamber, unproven | Chamber, proven |
|---|---|---|---|---|
| Key | violet from below, through the grille: bake target `#B24BFF` × 0.6 on undersides | the Dowser's embers: flame, baked radius 4 m, on the floor; the cradle's own lamp (aqua-white, tight) | the bore: a violet emissive disc 6 m across below kerb level + a violet fog column; bake target on rib inner faces `#8A3CCC` × 0.8, on the ceiling × 0.4 | same geometry, tinted by `wrong_fade` to aqua `#7CF2E2` × 0.9, rising bottom-up over 1.6 s behind the ring |
| Fill | `#1A1030` × 0.2 | `#132547` × 0.2 | six aqua wall lamps (one per bay, 5 m up, baked pools 3 m wide on the floor) so the floor reads and cover is visible | unchanged |
| Fog | `#2A1B4A`, 0.018 /m | `#1A1420`, 0.015 /m | `#2A1B4A`, 0.018 /m; height term base = kerb top, extra 1.2 falling upward from the bore mouth | `#12343C`, 0.012 /m |
| Dyn ambient | `#5A3A8A` × 0.40 | `#3A2A30` × 0.35 | `#4A3A7A` × 0.45 | `#2A6A70` × 0.50 |
| Dyn key | `#B24BFF` × 0.5 from `(0, −1, 0)` (lit from below) | flame × 0.6 from the embers' position | `#B24BFF` × 0.5 from below, direction from the bore axis | `#7CF2E2` × 0.6 from below |

Rules for the chamber:

- **Knots do not rely on hue here.** White core ≥ 40 % of the knot's diameter, hexagonal
  collar, dark bezel, 1.5 Hz pulse. Lamps beside the mouths are aqua-white.
- Violet → aqua is implemented as **two baked light layers** for `lm_bore` (violet layer,
  white-fill layer) blended by `wrong_fade`, or one greyscale bore layer tinted by a
  uniform plus the fill layer. Either satisfies the look; ARCHITECTURE picks.
- The standing line after the seventh: one vertical additive quad, aqua, 4 px constant.
- Floor is the lightest large surface (satin `concrete` under six pools) so Biders, stakes
  and canister rings read against it.
- Proving marks: dark brass until phase 3a, then aqua emissive disc 0.5 m with a 1.2 m
  halo sprite.

### 3.7 Mood L6 — blue hour (`far_rim`)

| | |
|---|---|
| Time | after sundown. Time has slipped; the bake is its own |
| Sun | none. Afterglow `#FF9E6B` below the horizon at azimuth 315°: rim light only (dyn key) |
| Key (bake target) | sky dome `#A9B8E0` × 0.75, soft, from above |
| Ambient | `#4A5A96` × 0.50 |
| Sky | zenith `#1B2440`, mid `#5D6690`, horizon ember band `#D9967A`, narrow (6° tall), strongest at 315° and fading round to cold `#4D5578` in the east |
| The Rule | north, **2° lean**, halo 14 px at 35 %: visibly further over than at minute one |
| The thread | aqua `#7CF2E2`, 2 px constant, dead plumb, rising from the town card. It and the Rule must be in one frame from the stone so the eye can compare plumb with leaning |
| Fog | `#4D5578`, 0.012 /m, height extra 0.8 from the plain |
| Display targets | lit ledge `#65656D`, shadow `#1F2233` |
| Emissives | town card windows (flame, `lamps` of 48); the cage gate lamp (aqua); the violet band on the stone round (faint: 30 % intensity, no halo); the last fire (flame sprite ≥ 4 px, flicker 5–8 Hz) |
| Dyn ambient / key | ambient `#4A5A96` × 0.50; key `#FF9E6B` × 0.35 from the afterglow direction `(−0.70, 0.10, −0.70)` |
| Baked | `lm_rim` 512²: ledge and rock frame. Everything else vertex-lit or unlit card |
| Composition | the cage opens in a black rock frame: **the same composition as the opening shot**, camera height and frame shape matched |

### 3.8 Baked versus dynamic, in one table

| Thing | How |
|---|---|
| Sun, sky, bounce, AO on static world | baked (lightmap or vertex) |
| Lantern, embers, strips, lamps (steady) | baked + emissive mesh + additive halo sprite |
| Flickering strips, guttering | emissive + halo only, modulated; never in the bake |
| Hatch aqua, bore violet/aqua | separate baked layer blended by a uniform |
| Sun blades, shafts | additive cards + additive patch quads |
| Muzzle flash light, the ring | radial shader term (world) + pooled point light (dynamic objects) |
| Character and prop lighting | per-zone ambient + unshadowed key, vertex AO |
| Character shadows | instanced blob quads (Low); one tight sun shadow map on High, casters = dynamic only |
| Cloud shadows | scrolling 128² multiply |

---

## 4. Material library

### 4.1 Principles

- Albedo comes from **vertex colour** (COLOR_0, linear) multiplied by a **greyscale detail
  texture** whose neutral value is mid-grey: `out = vcol × detail × 2`. Detail textures
  carry seams, grain direction and fastener marks at low contrast (texture values stay in
  0.38–0.62 except drawn seam lines, which may reach 0.22). They never carry colour.
- No normal maps, no roughness maps and no metallic on world, props, enemies or boss. The
  only roughness information in the game is the gun's gloss mask.
- Everything not within arm's reach uses **flat palette colour**: one 256² palette atlas,
  UV0 pointing each face at a cell, vertex colour doing the gradients.
- All textures are baked from Blender procedurals (`blender/lib/bake.py`, `torus_coords`
  for tiling) or drawn by script. Nothing is downloaded or photographed.

### 4.2 Shared textures

| Name | Size | Channels | Depicts | Used by |
|---|---|---|---|---|
| `tx_frontier_trim` | 1024 × 512 | greyscale detail (upload R8) | horizontal strips, each tiling in U. Rows (px tall, world height): **plank_a** 64 (0.20 m; one board, grain lines, two nail heads per 1.2 m), **plank_b** 64 (0.20 m; split end, knot), **plank_end** 32 (end grain), **adobe** 128 (2.0 m; soft trowel sweep, three hairline cracks, exposed brick course along the lower edge), **tin** 64 (0.8 m; corrugation as 12 soft bars), **strata** 96 (3.0 m; five uneven bedding bands for rock), **strap** 32 (iron strap with rivets every 0.15 m), **cord** 32 (twist) | every Frontier surface |
| `tx_pellam_trim` | 1024 × 512 | greyscale detail (R8) | rows: **panel** 128 (1.2 m module; flat with one seam line each side and four corner fasteners per 1.2 m of U), **panel_rib** 64 (ribbed ceramic: 8 soft flutes), **steel** 64 (0.6 m; brushed, bolt row), **floor** 128 (1.2 m; satin plate, seam, drain slot), **concrete** 96 (2.4 m; formwork board lines, tie holes), **cable** 32 (braid), | every Old-World surface |
| `tx_sand` | 512 × 512 | greyscale detail (R8), tiles both ways | wind ripple, low contrast, one direction (ripples run north-east to south-west so the sun rakes them); 4 m per repeat | terrain |
| `tx_mask` | 1024 × 512 | single-channel mask (R8), alpha-test 0.5 | all signage and all cut-outs: see 4.3 | decals, grilles, cards |
| `tx_palette` | 256 × 256 | RGBA albedo | 16 × 16 cells of 16 px, one palette colour per cell (rows by family: ground, frontier, pellam, gun/Reeve, emissive, UI-in-world). Sample cell centres only | props, pickups, enemies, boss, arms, far scenery |
| `tx_palette_emis` | 256 × 256 | RGB emissive | same layout; black except the emissive row: cells for flame, flame core, aqua, aqua core, violet, violet core, and a second violet pair (`violet_band`) used only for things that turn aqua under `wrong_fade` | same |
| `tx_gun` | 1024 × 512 | RGB albedo, A = gloss mask | the revolver, unique unwrap: blue, edge wear, walnut grain, case rims, the stamped mark | view-model gun |
| `tx_matcap_steel` | 256 × 256 | RGB | a blued-steel sphere: dark body, one soft warm highlight upper left, one thin cool rim lower right | gun specular (masked by gloss) |
| `tx_fx` | 1024 × 512 | RGBA | sprite atlas, section 9.1 | all VFX |
| `tx_noise` | 128 × 128 | greyscale (R8), tiles | soft cloud noise | cloud shadows, dissolves, flicker |

Lightmaps (owned by the environment pieces, sizes from GDD 9.9): `lm_surface` 2048²,
`lm_tally` 1024², `lm_gallery` 1024², `lm_hall` 1024², `lm_bore` 1024² (one 60° sector, two
layers), `lm_rim` 512². Stored as separate WebP, no mipmaps, encode scale in
`design/assets.json`.

### 4.3 `tx_mask` contents (1024 × 512, white = opaque)

All in-world writing and all alpha cut-outs live here so there is exactly one alpha-test
material. Text strings are limited to what `design/story.json` already contains.

| Region | Cells | Notes |
|---|---|---|
| `mark_cast` | 128 × 192 | the Pellam mark, exact (section 5.6) |
| `mark_brush_a/b/c` | 3 × 96 × 144 | the town's hand-brushed copies: uneven discs, a dragged stroke, one with five discs and a blob (they miscounted; use this variant exactly once, on the feed store) |
| `strike` | 256 × 32 | one ruled pencil line with a slight start hook. Placed diagonally through every door mark, always the same angle (22°), always neat |
| `numerals` | 10 × 64 × 96 | 0–9, wide stencil with bridges |
| `wordmark` | 512 × 48 | `PELLAM DEEPWORKS` |
| `station` | 384 × 48 | `LIFT STATION 4` |
| `plate_lines` | 4 × 384 × 32 | the four plate lines the player must be able to read on the object, exactly as in story.json: `LINE CHARGE. FOR SIGHTING.`, `PROVING CHARGE. BANDED.`, `DO NOT KEEP.`, `TAMPING UNIT.` All other plate body lines are cast as plain raised bars (the readable carries the words) |
| `picto_daycell` | 256 × 64 | sun, arrow, disc, open hatch |
| `picto_line` | 256 × 64 | three discs, one line through them, one eye |
| `picto_charge` | 96 × 192 | a cartridge with a band round its waist (also cast in relief on `rd_plate_proving`) |
| `picto_misc` | 6 × 64 × 64 | arrow, "stand here" footprint pair, hand-off (do not touch), tone-wave, drop (water), no-keep (charge with a return arrow) |
| `tally` | 4 × 128 × 64 | chalk strokes in bundles of five; a shaky variant; a ruled underline |
| `family_marks` | 12 × 48 × 48 | brand-like household glyphs (original: combinations of bar, hook, dot, chevron). No letters |
| `grille` | 128 × 128 tile | catwalk and grate mesh: 40 mm bars at 120 mm pitch (2 px rule: bars are fat) |
| `louvre` | 128 × 64 tile | vent slats |
| `card_edges` | 256 × 128 | torn cloth hem, coat hem, frayed canvas |

Numerals and words taller than 0.25 m in the world are **real geometry** (Blender text to
mesh, bridges cut with boolean slots), not the atlas: the "4" on station plates, port
numerals 1–8 on the bore door, the wall diagrams. GDD test 13 (720p at 70 % scale) is
passed with geometry.

### 4.4 Runtime materials (what the Blender material names mean)

Blender material names are the contract; the runtime material factory replaces each by name.

| Blender material | Texture | Lighting | Notes |
|---|---|---|---|
| `m_frontier` | `tx_frontier_trim` | lightmap if the mesh has `UVLight`, else vertex light | back-face culled |
| `m_pellam` | `tx_pellam_trim` | same | |
| `m_sand` | `tx_sand` | same | terrain only |
| `m_flat` | `tx_palette` | vertex light | far scenery, cards, anything beyond 40 m; and static props that are vertex-lit in place |
| `m_mask` | `tx_mask` | vertex colour tint × zone ambient | alpha-test; decals use polygon offset; no blending |
| `m_emis` | `tx_palette_emis` | unlit | vertex colour R = intensity, G = flicker group (0 steady, 0.5 flicker, 1.0 off-until-triggered), B = `wrong_fade` participation |
| `m_prop` | `tx_palette` + `tx_palette_emis` | dynamic (zone ambient + key), vertex AO | every dynamic or instanced asset: pickups, enemies, boss, moving props, arms |
| `m_gun` | `tx_gun` + `tx_matcap_steel` | dynamic + matcap specular | the revolver only |

An asset may use at most the materials listed for it in section 7. Zone GLBs: at most 8
materials, merged per material per 40 m chunk.

### 4.5 Vertex-colour conventions

- **`Color` (COLOR_0, exported, linear).** For lightmapped meshes: `albedo tint × AO`. For
  vertex-lit meshes: `albedo tint × baked light ÷ 4` (bake range 0–4; the runtime
  multiplies by 4; quantise at 12 bits). For dynamic assets: `albedo tint × AO × gradient`.
  Composition order: `base × lerp(1, AO, 0.8) × height gradient × dust skirt × per-face
  jitter` (`vcol.compose_vertex_color`).
- **Gradients every asset must have:** bottom-to-top value ramp 0.75 → 1.10; outdoor
  assets add the dust skirt (bottom 0.6 m, 60 % toward `sand`) and the top bleach;
  a dark streak (×0.8, 3–8 cm wide) under every fastener, sill, seam end and louvre.
- **`Wind` (second colour attribute, exported only on wind assets as `_WIND` or packed into
  UV1.x where the pipeline requires).** 0 = fixed, 1 = free end. Used by coats, cloth,
  the share cloth, cord ends, dry grass. If custom attributes do not survive
  `optimize-glb`, fall back to "height above pivot" computed in the shader; the asset must
  then be authored with its pivot at the fixed end.
- **Alpha** of COLOR_0 is not used (it may be stripped).
- Emissive is **never** a vertex colour: it is a face mapped to an emissive cell of
  `tx_palette_emis`, so it survives every optimisation step.

### 4.6 Bake classes (stated per asset in section 7)

| Class | Meaning |
|---|---|
| `LM` | static, in the zone lightmap (`UVLight` second UV set, ≥ 4 px margin) |
| `VL` | static, light baked to vertex colour **in place** in the zone scene (max edge 0.5 m near, 1.5 m far; add an edge loop where a shadow boundary must fall) |
| `AO` | instanced or moving: AO + gradients only; lit at runtime by zone ambient + key |
| `UNLIT` | emissive, cards, sky elements |

Unique static props (the wagon, the table, the water cart) are class `VL` and must also
**cast** into the zone's lightmap: the zone bake scene instantiates them at their layout
positions. Mechanism is ARCHITECTURE's; the visual requirement is that no static prop
floats without a baked contact shadow.

### 4.7 Texel density

| Class | Target |
|---|---|
| Trim strips, within 10 m | 256–320 px/m along U; strips may stretch to 64 px/m across soft surfaces (adobe, concrete) |
| Terrain (`tx_sand`) | 128 px/m |
| Gun | ≥ 2 000 px/m (it fills a quarter of the screen) |
| Lightmap, interiors | 24 texels/m (`lm_tally`), 16–20 (`lm_gallery`), 12 (`lm_hall`), 20 (`lm_bore` sector) |
| Lightmap, exterior | 16 texels/m on ground and facades within 10 m of the path; nothing thinner than 10 cm is lightmapped (vertex-light it instead) |

### 4.8 Texture memory: how it stays inside 64 MB on Low

No GPU texture compression exists in this stack; a 1024² RGBA with mips is 5.6 MB.

| Item | Bytes (Low) |
|---|---|
| Greyscale detail and mask uploaded as R8 with mips: `tx_frontier_trim`, `tx_pellam_trim`, `tx_mask` (0.7 MB each), `tx_sand` (0.35), `tx_noise` (0.02) | 2.5 MB |
| `tx_palette` + `tx_palette_emis` + `tx_matcap_steel` (RGBA 256²) | 1.05 MB |
| `tx_gun` 1024 × 512 RGBA | 2.8 MB |
| `tx_fx` 1024 × 512 RGBA | 2.8 MB |
| **Shared library, always resident** | **9.2 MB** |
| Surface set lightmaps, no mips: `lm_surface` 16.8 + `lm_tally` 4.2 + the Tally hatch up-light layer at 512² 1.0 | 22.0 MB |
| Underground set, no mips: gallery 4.2 + hall 4.2 + bore 2 layers 8.4 | 16.8 MB |
| Coda set: `lm_rim` 1.0 + town card (in `tx_mask`/palette: 0) | 1.0 MB |
| Render targets at 720p (two half-float scene buffers + depth) | about 19 MB |
| **Worst resident total (surface)** | **9.2 + 22.0 + 19 = 50 MB** (underground 45 MB, coda 29 MB) |

Fallbacks if R8 upload or unmipped lightmaps prove unavailable: with RGBA detail textures
the library is 16.6 MB and the surface total 58 MB; with mipped lightmaps as well it would
be 65 MB, so in that case `tx_fx` drops to 512² (−2.1 MB) to land at 63 MB. Enemies, boss, props and pickups own **no** textures:
they add zero. High tier may add: `lm_surface` stays 2048², bloom targets, one 1024²
shadow map; still under 128 MB with room to spare.

Download: every texture is WebP; expected total under 3 MB for textures, under 6 MB for
geometry and animation after meshopt.

---

## 5. Modelling style guide

### 5.1 Distance classes and density

| Class | Seen from | Minimum feature | Circle segments | Density guide |
|---|---|---|---|---|
| **Hero** | 0.3–1 m (view-model) | 2 mm | 24–32 on the cylinder and muzzle, 12 on screws | 6 000 tris for gun + hands |
| **Near** | 1–10 m: interactables, cover, doors, everything on the critical path | 2 cm | 16–24 | props 150–1 500 tris; walls only as dense as their silhouette and baking need |
| **Mid** | 10–40 m: facades across the street, far ribs, machinery | 8 cm | 8–12 | up to 2 500 per facade |
| **Far** | 40–150 m: gully rim, wind-pump top, hall far wall | 30 cm | 6 | under 600 per object |
| **Backdrop** | beyond 150 m | silhouette only | — | unlit cards, under 200 tris each |

**The 2-pixel rule.** Nothing thinner than 0.45 % of its usual viewing distance: 2 cm at
4 m, 4.5 cm at 10 m, 14 cm at 30 m, 45 cm at 100 m. Ropes, rails, wires, pylon lattice,
sweep cord, ladder rungs and Transit legs are fattened to pass, or drawn as alpha-tested
cards, or dropped. The pylon line beyond 150 m is cards.

### 5.2 Bevels

| Thing | Bevel | Notes |
|---|---|---|
| Gun | 0.4–0.8 mm, 1 segment; 1.5 mm on the frame's outer contour | then weighted normals. The bevel is where the specular lives |
| Hand props, pickups | 2–4 mm | |
| Furniture, doors, crates, planks | 6–12 mm | each plank bevelled before assembly, so gaps read |
| Frontier architecture | 15–30 mm chamfer, uneven (jitter the bevel width ±40 % per object) | adobe corners are 60–90 mm, soft |
| Pellam panels, plates | 20 mm, exact, identical everywhere | never jittered |
| Pellam large forms | fillet radii 0.15, 0.3 or 0.6 m only; circles true | "cut from solid to a drawing" |
| Rock | none; `smooth_angle` 28° so some edges stay faceted | |

Always: bevel → `use_smooth` → `set_sharp_from_angle(35°)` → weighted normals
(`mesh.finish`). One bevel segment is enough.

### 5.3 How to avoid the primitive look (checklist per asset)

1. **Parts, not a primitive.** A crate is a core plus planks plus frame boards. A wall is
   a slab plus base course plus cap plus posts plus a sagging lintel. Minimum three
   overlapping parts for anything larger than a cup.
2. **Break the outline.** Every asset over 1 m has at least one of: a lean (2–4°), a sag,
   a missing corner, a prop or patch, something leaning against it, a drift wedge at its
   foot, a part that overhangs. Check the silhouette as a black shape on white from two
   angles; if it is a rectangle or a circle, it is not finished. (Pellam assets break
   their outline with a missing module, an open hatch, hanging cable or a salvaged
   Frontier repair, never with a lean of their own. Tilted Pellam objects tilt because
   the ground moved: whole-body tilt, parts still square to each other.)
3. **Seeded jitter on Frontier parts:** rotation ±0.012 rad, depth ±4 mm, length 0–2 cm,
   plank widths 0.16–0.24 m, never two equal neighbours. Always `random.Random(seed)`.
4. **Taper and thickness.** Nothing is extruded straight: posts taper 5 %, walls batter
   2° inward, boards are thicker at one end. Every sheet has visible thickness at its edge.
5. **Sit it in the ground.** Free-standing objects sink 2–6 cm and tilt 2–7°; add a sand
   wedge on the windward (north-west) side.
6. **Ground contact shadow** baked (AO in vertex colour at the foot, darkened ×0.6).
7. **Delete what is never seen** (bottoms, backs against walls, interior faces) and turn
   on back-face culling.
8. **Paint it:** AO, height ramp, dust skirt, bleach, streaks, per-face jitter (4.5).

### 5.4 Wear and decay language

Ranked by value per triangle; use the top of the list first.

1. Silhouette decay: lean, sag, roof ribs against the sky, a missing board, a dropped vane.
2. Sand as the decay material: drift wedges on north-west faces, steps half buried,
   doorways with a ramp of sand.
3. Gradients (4.5).
4. Break the module: in any run of five, one is missing, fallen or replaced by the wrong
   part.
5. Repair: mismatched boards, a tin patch, a prop under a rafter, cord lashings. Decay
   with repair says people.
6. One of eight: in any row of lamps, one works wrong (flickers or is dark).
7. Edge wear on metal from the Pointiness bake (gun, Tamper arm, kerbs): lighter by 15 %.

**The two layers decay differently.** Frontier rots, splits, bleaches and is mended.
Old-World does not rot: it stains below its seams, sheds a panel to show ribs and cable,
and keeps working. Enamel still white in a town gone grey is one of the unsettling images.

**The third vocabulary, wrong** (one or two per zone, never clustered): one coat hanging
dead still; the cradle clean in a dusty room; six cases in a neat row; the cold-bay Tamper
spotless; dials all stopped at the same reading; a perfect circle of swept sand round the
kneeler's trough.

### 5.5 Frontier layer versus Old-World layer

| Axis | Frontier (Plenty) | Old-World (Pellam) |
|---|---|---|
| Made by | hands, additively, from what was lying around | machines, to a drawing |
| Geometry | off-square, leaning 2–4°, sagging, tapered, jittered | orthogonal + perfect circles, radii 0.15 / 0.3 / 0.6 m, no jitter |
| Module | none: never twice the same | **1.2 m panel module**, 0.6 m half-module, 3.6 m bay. Everything snaps to it |
| Scale | human: doors 1.2–1.6 m wide × 2.2–2.4 m, porch eaves 2.4 m, steps 0.18 m | loads, not people: doors 3–4 m, risers 0.3 m (colliders are ramps), handles at 1.6 m, the 9 m ring |
| Value / temperature | mid, warm | extremes (dark steel, pale enamel), cool |
| Surface | matte, fibrous, patched | satin, monolithic, panelised |
| Edges | split, frayed, uneven chamfer | 20 mm bevel, exact |
| Light | flame, flickering | aqua, steady, linear |
| Writing | tallies, family marks, the brushed mark | stencil capitals, numerals, pictograms, cast plates |
| Materials | `m_frontier` | `m_pellam` |

**The seam is where the story is, and where every interactable sits.** Each zone needs at
least three seam objects: *intrusion* (the ceramic rib through the street, the drum through
the well-house, the pylon leg in the gully wall), *salvage* (an access panel as the yard
door, insulators as bells and latches, cable as rope, a dispenser with a tin cup hung on
it, a pylon arm as a well-sweep), *misreading* (the mark painted as a water sign; a status
lamp, still lit, with a tin cup and a folded strain-cloth set beneath it like a hearth).

### 5.6 Pellam Deepworks: the brand

**Name.** PELLAM DEEPWORKS. Abbreviation on asset tags: `PDW`. The narrator never says it;
it exists only on plates.

**The mark (load-bearing; GDD section 2).** Six small discs in a ring, a vertical stroke
dropping from the ring's centre, a seventh solid disc at the end of the stroke.
Construction, with `U` = radius from the ring's centre to each disc centre:

- six discs, radius `0.22 U`, centres at 30°, 90°, 150°, 210°, 270°, 330° from the top
  (so no disc sits at top or bottom and the stroke passes cleanly between the lower two);
- on cast and stencilled versions the six are **open** (annulus, wall `0.07 U`: chambers);
  the seventh is **solid**, radius `0.28 U`;
- the stroke: width `0.08 U`, from the centre `(0, 0)` straight down to `(0, −2.10 U)`;
  the seventh disc centred at `(0, −2.38 U)`;
- overall box `2.44 U` wide × `3.75 U` tall. Always upright and plumb in Pellam's hand.
- No enclosing circle, no lettering inside it, never mirrored, never rotated.

It reads at 12 px tall (the six merge to a ring, the seventh stays separate). It is the
HUD cylinder widget (GDD 12.2), the lift-head diagram, the stamp under the gun's loading
gate (9 mm across) and, seen face-on, the Windlass over its bore.

Two hands, two meanings:

| | Pellam's | The town's |
|---|---|---|
| Medium | cast in relief (2 mm proud on plates, 20 mm on the wall diagrams), or stencilled in `steel_dark` on enamel | brushed in `town_paint`, 0.35–0.5 m tall, on every door at 1.5 m and on troughs |
| Form | exact | six blobs, a dragged stroke that wanders, a thumb-print seventh |
| State | clean | **every one struck through with a single neat graphite line at 22°** (`nar_marks`). The line is ruled: the neatness is the horror |

**Typography.** Wide geometric capitals from Blender's built-in font, tracking +18 %,
stencil bridges cut as two thin vertical slots per closed counter. Sizes: plate text
12 mm, asset numbers 40 mm, station numerals 0.4 m (geometry), port numerals 0.22 m
(geometry). Colour `steel_dark` on enamel; raised and unpainted on cast plates.

**House style (repeat this trio on every machine).**

1. Livery: `enamel` panel; a 10 cm `livery` band at 1.2 m above floor level (continuous
   round rooms, broken by doors); `steel` below 0.3 m as a kick plate.
2. A **cast maker's plate**, 16:9 (0.32 × 0.18 m), four corner rivets, 4 mm proud: the
   mark at left, `PELLAM DEEPWORKS` at right, an asset number beneath.
3. One **pictogram** and one **asset number** stencilled nearby. Asset numbers are
   `4-` + three digits (station 4). Never use 19 or 99; do not add sevens.

Hazard: one broad diagonal of `hazard` ochre, 0.3 m wide, at 45°, on moving parts, kerbs
and the bore door frame. Station identity: **`4`**. A plate with a 0.4 m geometry "4" at
the yard drum door, the gallery bay, the lift ring, the bore door, and on every
`ia_ammo_box` and locker (GDD `the_asking`, question 1).

**Signage rules.** Pictograms over words. No sentence appears in the world that is not in
`design/story.json`. Frontier lettering: none beyond tallies, family marks and the brushed
mark; the single exception is the child's slate (`rd_rain_tally`), whose text is in the
readable, not on the model (the model shows strokes).

**The number motif.** Six and one are structural (ribs, bays, lamps, mouths, the mark).
Do not decorate with extra sixes or sevens: the motif is confined to what the GDD lists.

---

## 6. Character and creature direction

Law for all four (GDD section 16): outdoors, enemies are **dark shapes on bright ground
carrying one pale thing**; underground they **carry something pale or lit**. Each has a
silhouette no other thing in the game shares, a weak point that is a knot (dark bezel,
near-white core, 1.5 Hz pulse, collar shape), and a motion signature readable with the
sound off. No faces, no gore, no blood: Biders fold, machines stop.

**The knot (shared design, three owners build it identically).** A clustered growth of
5–9 faceted lobes (squashed icospheres, 20 tris each) packed round one larger central
lobe. Outer lobes: `violet`. Central lobe: `violet core`, at least 40 % of the knot's
diameter as seen from the front. It sits in a **collar** 1.3× its diameter in
`steel_dark`/`cable`: *clustered* (an irregular seven-lobed dark growth, like scorched
lichen) on hoods; *hexagonal* (a flat six-sided plate with a 20 mm lip) on machines.
Pulse is a shader term on the emissive (0.7 → 1.0 at 1.5 Hz), not an animation. **The
lobes' albedo is husk grey `#8A8A92` and their violet is emissive only**, so a burst knot
is simply the same lobes with the emissive switched off: on skinned enemies by a
per-instance emissive scale (which also darkens slits, bands and lens), on rigid assets
by the same uniform plus a separate lobe node `<name>_live` that code squashes to half
height.

### 6.1 `bider` — a townsperson, hooded, waiting

- **Read at 30 m.** A low forward-leaning dark wedge with a pale head. 1.4 m at the
  stoop, shoulders narrow (0.5 m), arms hanging a hand's length too long, hood slightly
  too large (0.34 × 0.38 m). The stoop pushes the crown, and the knot on it, toward the
  player: at 30 m the knot is a 3 px white-violet point on the palest shape in the frame.
- **Colour blocking.** Three blocks only. Hood: `linen` (the lightest Frontier value;
  nothing else on the street is this pale). Body: `workcloth` dark, a long work coat or
  apron to the knee, sleeves, trousers, all converging on ground colour with a dust skirt
  from the knee down. Boots and hands: `leather` and wrapped `linen` strips (hands are
  mitten shapes bound in strain-cloth: no fingers to animate, no skin). Neck: a `cord`
  tie, three turns, with two hanging ends (0.12 m, the only loose detail).
- **The hood.** A sewn well-linen bag with a flat seam over the crown and a hem at the
  collarbone: soft, clean, made with care (a courtesy, not a punishment). Two short
  horizontal slits, 45 mm × 8 mm, 70 mm apart, each with a violet pinprick deep inside
  (an emissive quad set back 15 mm so it disappears off-axis). No mouth, no stitching
  drawn as features, no sack texture. **Not a scarecrow:** no straw, pole, hat, burlap,
  stitched mouth or spread arms.
- **Variation without new meshes:** four per-instance `workcloth` tints and a ±5 % hood
  scale on the `head` bone, so a file of six is not six clones. One mesh, one draw call.
- **Weak point.** Crown knot, visual radius 0.16 m, forward of the crown seam, clustered
  collar. Visible from the front in every locomotion pose; the animator must keep it
  inside the camera's view of the head through `run`, `lunge_windup` and `circle_strafe`.
- **Animation personality.** *Tired, not feral.* They move like people who have been
  sitting four days: the run is a heavy forward fall caught by each step, arms slack,
  head level and still (so the knot is a steady target). The wind-up is a whole-body
  crouch with the head dead still for the full 0.5 s. `sit_down` is the best clip in the
  game: two failing steps, the knees give, it sits back on its heels, the hands come down
  flat on the ground, the head lifts a little: relief. `die_back` is a fold, thrown
  1.2 m, limbs loose, face-down or on its side with the hood turned away from the camera.
- **At rest** (table, queue, kneeling, niche) they are completely human: breathing,
  hands flat, patient. That is the unease.

### 6.2 `transit` — a surveying instrument that never stopped sighting

- **Read at 30 m.** Tall, thin, three-legged: 1.9 m, a pale drum on a tripod, like a
  surveyor's level left standing in a field. Nothing else in the game has three legs or a
  single round eye.
- **Colour blocking.** Legs and drum `enamel` (stained lower third); joints, feet and the
  lens bezel `steel_dark`; a `livery` band round the drum (aqua paint, **not** violet:
  only its eye is wrong); one cast plate on the drum's side; hazard ochre on the three
  pointed feet.
- **Shape.** Three ceramic legs **0.13 m thick**, each of two segments (upper 0.95 m,
  lower 0.85 m), splayed to a 1.1 m stance, ending in a steel spike with a round
  ground-plate. They meet at a small hub under the drum. Drum head 0.45 m across,
  0.30 m deep, axis horizontal, with graduated ring marks cast round its rim and a
  folding sighting vane on top (a 0.25 m blade: breaks the round outline). One lens,
  0.24 m, deep in a dark bezel 0.05 m thick. A stake magazine hangs under the drum: a
  short rack of three hot-tipped rods, visible so the projectile has a source.
- **Weak point.** The lens: `lens` dark glass with a violet core disc 0.10 m (emissive)
  at rest. On `aim` it flares to flame with a white core and a four-point star glint
  (VFX), and the dashed sighting thread appears. Read at 30 m: a dark circle with a bright
  centre on a pale drum.
- **Animation personality.** *Fussy, precise, unhurried.* A three-beat gait (one leg at a
  time, drum perfectly level: it glides while the legs clack). `plant` drops all three
  feet with a tiny settle of the drum. Scanning is in small exact steps with holds, never
  a smooth pan. `aim` dips the head 12°, then absolute stillness for the last 0.4 s.
  `die_fold` is a dropped tripod: one leg slides, the hub drops, the drum tips forward and
  rings, lens down.

### 6.3 `tamper` — a walking pile-driver

- **Read at 30 m.** Wide, tall, lopsided: 2.4 m high, 1.6 m wide. A hunched pale barrel
  on short thick legs with one enormous right arm that hangs past its knee and one small
  left arm. Underground it is the largest pale shape in the room with a violet stripe.
- **Colour blocking.** Barrel and arm casing `enamel`, heavily stained; legs, ram shaft
  and joints `steel`/`steel_dark`; the livery band round the barrel at chest height
  (10 cm, raised 5 mm) is **violet emissive** (`violet_band` cell: goes aqua on
  `wrong_fade`); hazard ochre diagonal on the ram head; one cast plate on the left
  shoulder; asset number stencilled on the back.
- **Shape.** Barrel: a vertical ceramic drum 1.3 m across and 1.4 m tall, pitched 15°
  forward, top domed with a 0.3 m fillet, no head (a low sensor cowl only, 0.3 m wide,
  no eyes). Legs: two, 0.9 m, each a thick thigh housing and a broad square foot
  0.5 × 0.6 m. Right arm: shoulder housing 0.5 m across, a casing 1.3 m long and 0.45 m
  thick, and the **ram**: a steel piston ending in a flat square tamping head
  0.55 × 0.55 × 0.25 m. Left arm: 0.7 m, a three-fingered clamp, held tucked.
- **Weak points.** Chest vent and back vent: louvred hatches 0.5 m across, hinged at the
  top (bones `vent_chest`, `vent_back`). Shut: four ceramic slats with a hairline of
  violet between them. Open (lid swung 80° up): a dark cavity with a hexagonal-collar
  knot, visual radius 0.22 m, white core. The open lid makes a visible awning in
  silhouette, so "vent open" reads from the side too.
- **Animation personality.** *Dutiful, heavy, tireless.* It never looks at the player; it
  goes about them. A two-beat stamp with the barrel rocking 4° side to side. The slam
  wind-up raises the ram fully overhead (the silhouette doubles in height: the tell) and
  the chest lid opens on the same motion. The charge drops the cowl, drags the ram head
  along the floor (sparks), and cannot turn. `charge_stun`: it sits back on its heels
  with the ram buried and the back lid flapping open. `die`: it stops mid-stroke; the ram
  comes down slowly under its own weight; the band goes dark. It does not fall over.

### 6.4 `windlass` — the lift head: the cylinder seen from the wrong end

- **Read at 30 m and from the catwalk above.** A drum 5 m across hung face-out over the
  bore from a single heavy arm: a ring of six dark mouths with a lamp beside each, a pawl
  at the top. It is the mark, and the HUD, at architectural scale. The first view (from
  above, through the grille) must show the ring of six and the bore as the seventh.
- **Colour blocking.** Drum face `enamel`, flat and clean, with six mouths in
  `steel_dark` bezels; drum rim and back `steel` with six cast flutes (it is fluted like
  the revolver's cylinder: same count, same proportions); arm, pawl and gauge housing
  `steel`; cables `cable`; guard plate `enamel` with one broad `hazard` diagonal and a
  0.4 m geometry `4`; lamps aqua-white in brass bezels.
- **Weak points.** A knot in each mouth, visual radius 0.38 m, hexagonal collar, white
  core, set 0.3 m back so the lid's shadow frames it. Pawl knots: two, 6 m up, 3.2 m
  apart, on the arm either side of the drum, radius 0.25 m, each on a hex plate with a
  brass lamp beside it.
- **Mouth lids.** Each mouth is closed by a single ceramic lid on an offset pivot at its
  rim: it **swings aside like a loading gate**, 110° in 0.2 s, flush when shut (a 20 mm
  shadow gap), clearly out of the way when open. One rigid node per mouth.
- **Motion personality.** *Procedure.* Indexing is a ratchet: accelerate, 60°, hard stop,
  a 2° overshoot and settle. It never drifts or eases gently. `idle_sway` is 0.5° on its
  cables. In 3b it keeps working with nothing to do: lids open and shut on the beat, no
  glow. `sag_death`: the drum runs down in slowing clicks, then drops 0.4 m on its
  cables, tilts 6°, one cable goes slack.
- **Health gauge.** 26 segments in a vertical ladder on the arm housing, grouped 10 / 10
  / 6 by two wider gaps, aqua-white, each segment 0.30 × 0.10 m so it reads from the
  floor at 20 m (2-pixel rule).

### 6.5 The Dowser (a card, never a model)

A long-coated figure with a hat and a forked rod held out at his right arm's length, upright, a Y clear of
his body and hat (polish round 4: held low it could not be seen at 30 px), standing three-quarter
away. Clerkly, upright, unhurried: a man checking a reading. **Polish round 3, lead ruling
R4:** the card is a near-black silhouette (`#15121A`; it was the pale coat `#D9D2BF` against
dark rock, which no critic could find) standing on the skyline against clear sky, never
under 9 × 28 px at 720p, with at most 2 % haze; no face (he looks away), no robe, no hood,
nothing magical. One sun-glint on the rod. He stands where the layout's `vista_dowser` puts
him: on dark rim at least 25° of azimuth clear of the sun disc and its 14° halo, never in
the glare.

---

## 7. Asset list

### 7.1 Conventions for every asset

- **File:** `public/assets/<category>/<id>.glb`; source `blender/<owner>/<id>.py`.
  Categories: `env`, `props`, `weapons`, `enemies`, `boss`, `tex`, `lm`.
- **Pivot** (the asset's origin) as stated. "Base centre" = centre of the footprint at
  ground level. Hinged parts are separate nodes whose origin is the hinge.
- **Nodes code must find** are listed by exact name. Positions that gameplay reads
  (muzzles, sockets, spawn points) are **empties**, never mesh nodes. All names are
  unique within the GLB.
- **Clips** are NLA tracks named exactly as listed. `loop` clips have identical first and
  last frames. 30 fps sampling. Durations are final (GDD).
- **Tris** is the cap for the exported, triangulated asset. Instanced assets are counted
  once.
- **Mat / bake:** materials from 4.4 and bake class from 4.6.
- **LOD:** there are no LOD chains. Distance is handled by authoring to the right
  distance class, by instancing, by zone visibility, and by the static swaps noted.
- **Placement** of everything comes from `design/layout.json` markers. Dimensions here
  are the asset's own size.
- **Openings (binding).** Anything that closes, fills or frames an opening the layout cuts
  is sized by the layout, not by this document: **a leaf fills its door marker's `size`
  (width x height), a frame surrounds it, and a hatch fills its marker's footprint.** The
  table below is a copy of the layout's numbers at revision 2 for convenience; if it
  disagrees with `design/layout.json`, the layout is right. Asset scripts read the marker
  size rather than hard-coding it wherever one asset serves openings of one size, and the
  `placeholder` sizes in `design/assets.json` should be regenerated from the same markers.

| Opening (layout marker) | Width x height (m) | Filled by |
|---|---|---|
| `door_jug_gate` | 4.0 x 2.8 | `prop_stock_gate` between `lip_gate_piers` |
| `door_yard_gate` | 4.0 x 3.0 | `prop_yard_gate` (two leaves) |
| `ia_yard_door` | 2.6 x 2.8 | `ia_yard_door` |
| `door_alley`, `door_tally` | 1.6 x 2.4 | `prop_door_frontier` |
| `shutter_s/m/n` | 1.2 x 0.9, from 4.05 to 4.95 m up | `ia_shutter`; latch 1.0 m below centre (`ia_latch_*`, 3.5 m up) |
| `ia_hatch` | 4.0 x 2.0 in the floor | `ia_hatch` |
| `ia_baffle` | 3.0 x 3.0 | `ia_baffle` |
| `door_gallery_far` | 3.0 x 3.0 | `prop_door_pellam` |
| `door_cold_bay` | 3.0 x 3.0 | `ia_cold_bay_shutter` |
| `door_lift_cage` | 6.0 x 6.0 (the ring's clear opening) | zone geometry; the cage's own `gate` closes the cage |
| `door_bore` | 3.0 x 3.0 | `ia_bore_door` (disc 3 m, centre 1.5 m above the floor) |
| `door_proving_lift` | 3.0 x 3.0 | the proving-lift cage's `gate` |
| lift cages | the layout's cage solids at each end of each ride | `ia_lift_cage` |
- Every asset script ends with `budget_report` + a preview render to `shots/<piece>/`.

Draw-call notes use "dc". A zone's static world is merged per material per 40 m chunk.

### 7.2 Owner: `env_exterior`

Zone budgets (static world triangles, total / worst in view): `env_the_lip` 34k / 28k;
`env_plenty_street` 70k / 55k; `env_far_rim` 14k / 14k; backdrops 3k each. At most 8
materials and 14 dc per zone GLB.

| id | Description and dimensions | Tris | Mat / bake | Pivot | Nodes | Clips | Notes |
|---|---|---|---|---|---|---|---|
| `env_the_lip` | The whole zone: overhang + gully + gate piers. Assembled from the parts below; exported as one GLB chunked at 40 m | 34k | `m_sand`, `m_frontier`, `m_pellam`, `m_flat`, `m_mask`, `m_emis`; `LM` floor and walls to 3 m, `VL` above | zone origin from layout | `collider_*` (low-poly collision), `spawn_player`, `marker_*` as layout names them | — | sub-parts are mesh groups, not separate files |
| `lip_overhang` (part) | Rock shelter 12 W × 9 D × 3 H, mouth to the north. Roof slab 1.5–2.5 m thick, layered. Mouth outline is designed: a notch upper left, a fallen slab 2 × 1.2 m lower right, floor of packed sand with one flat rock shelf, swept, for stop one (no hearth, no ash: the pot and the note sit on it) | 2.5k | `m_frontier` strata; interior vertex-dark | — | `marker_camp_1` | — | the black frame of the first and last shots |
| `lip_gully_floor` (part) | 95 m long, 12–20 m wide, falling 14 m to the north in three shallow benches; sand with rock shelves breaking through, wind ripples, drift wedges on the west side. Grid ≤ 2 m on the path, 4 m at the edges. Optional ledge 0.5 m high with a packet | 6k | `m_sand`, `LM` | — | `marker_ledge_packet` | — | no step over 0.35 m on the path |
| `lip_gully_walls` (part) | Stratified red sandstone 8–15 m high, battered back 5–10°, five bedding bands, undercut at the base, three buttresses a side to break the corridor, talus cones at the feet. Tops are a broken skyline (never a straight line) with `rock_cap` | 14k | `m_frontier` strata strip mapped by height; `LM` to 3 m, `VL` above | — | — | — | long mauve shadow shapes from the west wall cross the floor |
| `lip_pylon_dead` (part) | A Pellam line pylon at the gully mouth: one tapered ceramic-clad mast **16 m tall** (layout `prop_pylon.height`), 1.4 m across at the base, 0.6 m at the top, on a cast concrete foot; three stub cross-arms (2.5 m, 0.45 m thick) each with a white insulator stack; one arm missing (it is the well-sweep). The lowest surviving stub is 7.6 m up and reaches to the layout's `stubArmTo` point, above and left of the gate: the seventh jug hangs from it with its body at 7.0 m. Top 4 m leans 3° (the whole mast tilts from the foot). Cable stumps hang 2 m | 1.4k | `m_pellam`, `m_flat` top; `VL` | base centre | `socket_jug_7` | — | first Old-World thing seen up close; maker's plate at 1.5 m |
| `lip_gate_piers` (part) | Two adobe-and-stone piers 1.0 × 1.0 × 3.1 m, **4.0 m apart in the clear** (the `door_jug_gate` opening, 4.0 × 2.8 m), with timber guides for the drop-bar; a low wall running into each gully side; the brushed mark (struck through) on the left pier | 900 | `m_frontier`, `m_mask` | — | `socket_gate`, `socket_sweep` | — | |
| `env_plenty_street` | Front Street + pump yard, assembled from the parts below | 70k | all world materials; `LM` ground, facades to the eave, yard | zone origin | `collider_*`, `marker_*`, `spawn_*` (alley doors, saddlery, grate, drum door, tank shed), `fp_transit_*` (firing points) | — | chunked at 40 m; yard is its own chunk |
| `street_ground` (part) | 72 × 30 m street (14 m between facades) + 30 × 28 m yard; packed sand, two wheel ruts down the centre, drifts against every north-west face, a swept bare circle 3 m across round the trough | 7k | `m_sand`, `LM` | — | — | — | grid 1.5 m on the street centre |
| `street_facade_01`…`_09` (parts) | Nine false-front buildings, board on adobe base, each 6–9 m wide, 5–7 m to the false-front top, 2.4 m porch eaves on posts, lean 2–4° (alternate directions), no two alike. **01 saddlery** (**south** side, west end; a wide open doorway onto the street, x −67.2..−65.2 in the layout, through which wave C comes; a saddle tree shape on its sign bracket, no lettering). **02 feed store** (north; a loft door 1.2 × 1.4 m open at 4 m with a hoist arm; ladder stowed inside). **03 assay shed** (north; tin roof, one sheet lifted). **04 dry-goods** (north; porch collapsed at one end). **05 smithy** (south; open front, cold forge, adobe). **06 boarding house** (south; two storeys, a balcony with a missing rail). **07 wash-house** (south; a line of cord with three strain-cloths, wind attribute). **08 undertaker's shed** (north, west end; plain, shuttered: no coffins on show, only planed boards stacked). **09 gatehouse lean-to** (west end against the yard wall). Each: a shut dressing door 1.2 × 2.2 with the brushed mark struck through (the two doors that open, `door_alley` and `door_tally`, are 1.6 × 2.4 and are props), 1–3 shuttered windows, a sand ramp at the door. Block positions and the six cross-alleys are the layout's | 2.4k each, 22k total | `m_frontier`, `m_mask`; `LM` to eave, `VL` above | — | `door_mark_01…09` (decal quads), `spawn_alley_n`, `spawn_alley_s`, `spawn_saddlery` | — | backs and roofs never seen are deleted. Interiors are black voids behind a 1 m deep dark box |
| `street_rib` (part) | A ceramic rib of the old works surfacing through the street like a whale's back: 9 m long, 1.6 m thick, 1.9 m high at the crown, a true circular arc in section (radius 0.6 m shoulders), panel seams every 1.2 m, one panel missing showing steel ribs and cable; sand banked on the north-west side, wheel ruts swerve round it | 700 | `m_pellam`; `LM` | — | — | — | full-height cover; the seam object of the street |
| `street_wall_stub_a/b`, `yard_wall_stub_a/b/c` (parts) | Broken adobe walls 3–4 m long, 0.5 m thick, 2.2–2.6 m high, stepped broken ends showing brick courses, soft 80 mm corners | 300 each | `m_frontier`; `LM` | — | — | — | full-height cover |
| `yard_wall` (part) | 3 m adobe wall round the yard, 0.6 m thick, capped with flat stones, buttressed every 6 m, one section patched with tin | 2.5k | `m_frontier`; `LM` | — | `socket_yard_gate`, `socket_yard_door` | — | |
| `yard_well_house` (part) | Adobe well-house 9 × 9 × 3.5 m with the pump drum coming up through its broken roof: a celadon ceramic drum **8 m across**, rising 6 m, panelled on the 1.2 m module with the livery band at 1.2 m and a 0.4 m `4`; a Pellam door opening 2.4 × 3 m in the drum's east face with its leaf slid half aside and stuck (zone geometry, not a prop: Transits emerge through the gap), a floor grate 1.2 × 1.2 m at the drum base (Biders climb out), one aqua status lamp by the door with a tin cup hung under it | 5k | `m_pellam`, `m_frontier`, `m_emis`, `m_mask`; `LM` to 3 m | — | `spawn_drum_door`, `spawn_grate_yard`, `socket_drum_door` | — | adobe is built round the drum: the seam |
| `yard_wind_pump` (part) | Timber derrick 14 m tall bolted to the drum top: four tapered legs 0.3 m thick, X-braces 0.2 m (fat: 2-pixel rule), a platform at 11 m, a rotor 5 m across of seven vane sockets with **one vane missing** (six tin vanes 0.5 × 1.9 m), a tail vane with the brushed mark | 3k | `m_frontier`, `m_flat`; `VL` | — | `pump_rotor` (origin on the hub axis; code spins it 9°/s), `pump_tail` | — | the moving silhouette of the zone; visible from the gully mouth |
| `yard_tank_east` (part) | A boarded water tank 3 m across × 2.6 m on four timber stilts (0.4 m) under a 5 × 5 m plank deck at 3.5 m; the stilts are boarded on the **north** side only (full-height cover from the yard); the deck is the catwalk, 1 m clear all round the tank; a cleated ramp 1.6 m wide with a 7 m run (1:2) climbs to it from the west. The Transit shed is a separate lean-to in the yard's south-west corner (layout `sp_yard_t3`) | 2.5k | `m_frontier`; `LM` ground level, `VL` above | — | `spawn_tank_shed`, `fp_transit_catwalk` | — | the problem position; footprints are the layout's `yd_tank_*` solids |
| `street_tally_exterior` (part) | The Tally House seen from the yard: a 14 × 22 m **adobe** hall, walls 5 m, **flat roof** with a low parapet, viga ends projecting in a row under it and one canale; three high west shutter openings (1.2 × 0.9 m at 4.05–4.95 m, from layout), the south door (1.6 × 2.4 m), the east front doors barred. Buttressed at the corners, plaster fallen from the lower metre | 2.5k | `m_frontier`; `LM` to 3 m, `VL` above | — | `socket_tally_door` | — | openings must match `env_tally_house` exactly (layout is the source). Nothing on its roof may rise into the Dowser sightline |
| `env_far_rim` | Ledge 30 × 20 m above the overhang; black rock frame round the lift cage opening (matching `lip_overhang`'s mouth outline, mirrored in composition); a natural rock shelf at the north-west edge where the stone sits (the stone is a prop); the drop to the plain | 14k | `m_frontier`, `m_sand`, `m_flat`; `LM` ledge, `VL` rest | zone origin | `collider_*`, `marker_stone`, `marker_end_edge`, `spawn_rim` | — | separate bake, mood L6 |
| `rim_town_card` | Plenty as a silhouette 250 m off and below: roofs, the wind-pump, the drum; 60 × 14 m card set, three layers. **48 window quads** (0.9 × 1.1 m each at card scale) in one mesh | 600 | `m_flat` (silhouette), `m_emis` (windows) | card centre | `town_windows` (one mesh; vertex colour R of quad *i* = `(i + 0.5) / 48` in lighting order: the shader lights quads with R < `lamps / 48`), `socket_thread` (base of the aqua thread) | — | lighting order spreads outward from the Tally House |
| `env_backdrop_day` | Four layers of mesa silhouette cards at 200, 350, 550 and 800 m, each lighter and nearer fog colour; the far rim at 250 m on the bearing of the layout's `vista_dowser` (kept dark there, and clear of the sun disc and halo, so the Dowser card reads pale); the **pylon line**: nine pylon cards marching north to the foot of the Rule, each 0.6× the last; five faceted cloud cards | 2.5k | `m_flat`, `UNLIT` | world origin | `socket_dowser`, `socket_rule_base` | — | drawn with fog; no depth fighting: 20 m minimum separation |
| `env_backdrop_dusk` | The same horizon for the rim, re-coloured to L6; the plain with the pylon line; marker for the last fire | 2k | `m_flat`, `UNLIT` | world origin | `socket_last_fire` | — | |

### 7.3 Owner: `env_interior`

Zone budgets (static world triangles, total / worst in view): `env_tally_house` 17k / 17k;
`env_the_gallery` 32k / 24k; `env_lift_hall` 36k / 36k; `env_the_bore` 40k / 34k.

| id | Description and dimensions | Tris | Mat / bake | Pivot | Nodes | Clips | Notes |
|---|---|---|---|---|---|---|---|
| `env_tally_house` | Hall interior 14 (E–W) × 22 (N–S) m: x −96..−82, z −37..−15. **Adobe walls 5.0 m high under a flat roof**: round vigas 0.2 m running E–W under a board deck (underside at 5.0 m), spaced so that none crosses a blade path, and one squared **tie-beam** (0.25 m) spanning E–W at z −32.8 over the hatch, from which the day-cell hangs. Walls plastered adobe, `adobe_base` to 0.4 m. Plank floor (boards run N–S, 0.2 m, two lifted). **South wall:** the door opening 1.6 × 2.4 m; east of it the **tally wall**, a dark-painted board from x −88 to −82 and from 0.4 to 3.2 m up, wrapping 1.6 m onto the east wall, with chalk tallies by household (family mark, then bundles of five; the last four rows shaky, then none), **the last four days written where the south blade lands, at (−87, 1.33, −15)**. **East wall:** at the south end the hearth (adobe chimney breast 1.2 D × 3.4 W × 2.6 H at z −20..−16.6 with a raised hearthstone 1.4 × 3.4 × 0.3 m in front; the town's own ash in the firebox, four days cold); further north, at z −28, the barred front doors (2.4 × 2.6 m, three benches stacked against them). **West wall:** three shutter openings **1.2 W × 0.9 H, from 4.05 to 4.95 m up, centred at z −24, −30.5 and −36.3**, in deep splayed reveals, with a latch seat at 3.5 m beneath each. **North-west:** a rectangular Pellam ceramic frame, 0.3 m wide with 0.15 m corner radii, set flush in the floor round a **4 × 2 m opening (x −93..−89, z −34..−32)**; the hatch leaves are a prop. A Pellam conduit runs from the day-cell hanger along the tie-beam, down the west wall at z −32.8 and across the floor to the frame, carrying the aqua strip; **on the conduit at 1.5 m is the pictogram plate** (`picto_daycell`). The table's north leaf lies dragged against the north wall | 17k | `m_frontier`, `m_pellam`, `m_mask`, `m_emis`; `LM` floor, walls to 3.2 m; `VL` above and roof | zone origin | `collider_*`, `socket_shutter_s/m/n`, `socket_latch_s/m/n`, `land_s/m/n` (blade landing points), `socket_cloth`, `socket_day_cell` (on the tie-beam), `socket_hatch`, `strip_hatch` (emissive mesh, off until triggered), `hatch_glow` (the aqua up-light layer), `marker_camp_2`, `spawn_riser_a/b` | — | strictly civic: no altar, pulpit, pews, lectern. Every number is the layout's (LEVEL.md 3); nothing over 1.3 m may stand in a blade path |
| `env_the_gallery` | **Peg stair:** 2 m wide, 12 m down in three flights with two landings, cast concrete, risers 0.3 m; both walls carry a peg rail at 1.6 m (board 0.15 m, pegs 0.03 × 0.12 m every 0.4 m) and a **low rail at 0.9 m** with the same pegs, bare; a niche 1.4 m deep × 2 W × 1.6 H off the second landing; one aqua strip per flight; flights are 33.7° ramps, the first running east, the second and third south. **Proving bay:** 10 × 8 × 5 m, concrete, livery band, a `4` plate, the range wall (three plate hooks in a row, 1.5 m apart), a raised step position, plate mounts. **Gallery:** 62 × 7 × 5 m; a 3 m walkway of floor plate between pipe banks 2 m deep (three pipes 0.5 / 0.35 / 0.2 m on saddles, a cable tray above) built as one **3.6 m module** instanced 17×, with three variant modules (panel off showing ribs; a valve station; a sagging cable); a pipe elbow arching out of the north bank at 8 m (knot seat 2.7 m above the floor), a cross-pipe valve bonnet at 15 m (3.4 m) and a ceiling conduit box right of the door at 22 m from the mark (4.2 m): the three knot seats are the layout's `knot_a/b/c` positions to the centimetre, and nothing may intrude on the line through them; the baffle wall (opening 3 × 3 m, three lamps on the lintel above it) 22 m along; the far door frame (opening 3 × 3 m) | 32k | `m_pellam`, `m_emis`, `m_mask`; `LM` bay, baffle wall, one module, landings; `VL` rest | zone origin | `collider_*`, `socket_knot_a/b/c`, `socket_step`, `socket_loop`, `socket_baffle`, `socket_locker_bay`, `socket_range_1/2/3`, `socket_plate_line`, `socket_plate_proving`, `strip_stair_1/2/3` (off until `daylight`), `strip_flicker` (flicker group), `violet_hairline`, `socket_watcher`, `spawn_file_1…6` | — | pegs, coats, hats, boots are props (instanced) |
| `env_lift_hall` | 38 × 28 × 12 m (x −18..20), 45 m long with the cage bay. Entry **gantry** on the west wall, 3 m up: a 5 × 10 m steel deck with grille decking and a rail of 0.08 m tube; a ramp 3 m wide down from its north end, **26.6° (1:2), a 6 m run**. **Ten ribs** in two rows of five, rows 8 m apart, 6 m centre to centre along the hall: each a ceramic-clad pier 1.6 × 2.4 m in plan, 12 m tall, flaring into the vault with a 0.6 m fillet, livery band, kick plate, one cast plate. Satin plate floor on the 1.2 m module. North wall: a sealed bulkhead 4 × 4 m, dished 0.15 m over a 1.5 m circle where it has been pounded. Four floor grates 1.2 × 1.2 m at the east end (layout `sp_hall_grate_1..4`). East end: **the ring**, a ceramic portal 9 m across and 1.2 m deep with a continuous aqua strip in its reveal, its clear opening 6 × 6 m (`door_lift_cage`); inside it the lift cage bay. South wall: the cold bay, 8 × 6 × 5 m, behind a shutter opening 3 × 3 m, with a 0.4 m slot beside it through which its knot shows. Beside the ring: the **lift-head diagram**, 4 m tall, in 20 mm relief with seven small lamps | 36k | `m_pellam`, `m_emis`, `m_mask`; `LM` floor, ribs to 4 m, gantry, ring; `VL` rest | zone origin | `collider_*`, `spawn_grate_hall_1…4`, `socket_tamper_vignette`, `socket_cold_shutter`, `socket_tamper_cold`, `socket_lift_cage`, `socket_lift_lever`, `diagram_lamp_1…7` (emissive quads), `socket_locker_hall`, `socket_locker_secret`, `socket_plate_service` | — | far wall is `VL` and almost lost in fog: keep it simple |
| `env_lift_shaft` | Dark-ride shell shared by both lifts: a square shaft section 12 m tall, 0.2 m clear of the cage on every side (cage sizes are the layout's), concrete with guide rails, and six lamp bars (1.2 × 0.1 m) the code scrolls upward | 800 | `m_pellam`, `m_emis`; `VL` | cage floor centre | `lamp_bar_1…6` | — | the cage does not move in world space |
| `env_the_bore` | **Catwalk:** 18 × 2 m at 8 m above the chamber floor, crossing the north side over the door bay, enclosed in a grille tube 2.4 m high (alpha-tested `grille`), entering high on the chamber wall and running to a stair head. **Stair** down (0.3 m risers, ramp collider). **Antechamber:** 10 × 14 × 5 m, north of the chamber, concrete, dusty, livery band; on its south (door) wall the cradle niche to the right of the door as faced and a `4` plate and the diagram again, 2.4 m tall (layout `prop_ante_diagram.params.height`), to the left. **Door frame** 3 m across. **Chamber:** circular, 30 m across, 14 m high. Bearings are compass bearings from the bore axis, 0° = north = the door. **Six bays centred on 0°, 60°, …, 300°** (door in bay 1 at 0°, proving-lift gate in bay 4 at 180°), each with one aqua wall lamp at 5 m and one proving-mark socket at r 4.9 m (bays are unnumbered in the world). **Six ribs between the bays at 30°, 90°, 150°, 210°, 270°, 330°**: piers 1.6 m thick × 3.0 m long, long axis radial, from r 7.5 to r 10.5 m, full height. Cartridge-point sockets on the outer wall at 90° and 270° (each behind a rib); the line-locker socket on the wall at 168°, beside the lift gate. The **kerb**: a ring 1.2 m high, 0.6 m thick, inner radius 3.0 m, `hazard` diagonal on its top face; three floor grates at its foot (r 4.5 m, at 90°, 210°, 330°). The **bore**: a 6 m shaft with panel courses going down 30 m to an emissive disc. Ceiling: a ring girder at the axis from which the Windlass arm hangs, cable runs to the walls. Modelled as **one 60° sector instanced six times** | 40k | `m_pellam`, `m_emis`, `m_mask`; `LM` sector floor, ribs, kerb, antechamber; `VL` ceiling | bore axis at chamber floor level | `collider_*`, `socket_windlass` (on the axis), `socket_mark_1…6`, `spawn_kerb_grate_1…3`, `socket_ammo_box_e/w`, `socket_locker_bore`, `socket_proving_lift`, `socket_bore_door`, `socket_cradle`, `marker_camp_3`, `bore_glow` (emissive disc + column mesh, tinted by `wrong_fade`), `bay_lamp_1…6` | — | six-fold symmetric lighting is mandatory: the sector is cut rib-centre to rib-centre (30° to 90°) so one bay, one mark and one lamp sit in its middle; door, lift gate, locker, boxes and grates are placed on top of the sectors and are not in the bake |

### 7.4 Owner: `props` (pickups, doors, puzzle mechanisms, readables, dressing)

All `m_prop` / `AO` unless stated; all static dressing that never moves may instead be
merged `VL` into its zone. Animated props with more than one moving part, or a moving part
beside static parts, use a small armature with rigid skinning (one mesh and one draw call
per material, one weight per vertex): `design/assets.json` marks them `skinned: true` and
lists their `bones` (`root` plus one bone per moving part, named as in the Nodes column).
A prop whose whole body is the one moving part may be an animated empty with the mesh as
its child.

**Pickups and ammunition**

| id | Description and dimensions | Tris | Pivot | Nodes | Clips | Notes |
|---|---|---|---|---|---|---|
| `pk_rounds_6` | A brown paper packet tied with cord, one corner torn showing two brass case heads. Modelled 1.6× life: 0.14 × 0.09 × 0.06 m | 120 | base centre | — | — | instanced; a brass glint sprite every 2.5 s |
| `pk_rounds_12` | A flat cartridge tin, `tin` with rust at the corners, lid half slid back on twelve case heads in two rows. 0.18 × 0.12 × 0.07 m. No label | 180 | base centre | — | — | the Dowser's; always set square to something, never dropped carelessly |
| `pk_canteen` | A round blanket-covered canteen (`linen` cover, `leather` strap looped twice, `tin` neck and cork). 0.24 across × 0.09 m | 220 | base centre | — | — | lies on its side or hangs by the strap |
| `prop_cartridge_lead` | One .45 round: brass case 12 mm × 33 mm, grey lead nose, total 41 mm. Life size | 40 | case head centre | — | — | used in lockers, on the stone (spent variant), in the tin |
| `prop_cartridge_line` | The same case with a turned `enamel` nose and an aqua emissive ring at the shoulder | 48 | case head | — | — | in line lockers |
| `prop_cartridge_kept` | The same case with a **band**: an `enamel` sleeve 9 mm wide round the waist with a `livery` hairline; `spent` variant is the empty case, mouth up, band intact; `violet` variant has the band's hairline in faint violet emissive | 48 | case head | — | — | six spent + one violet on the stone; one in relief on `rd_plate_proving` |
| `ia_ammo_box` | A Pellam wall dispenser: enamel box 0.6 × 0.25 × 0.9 m on a steel back-plate, a chute with a spring flap at the bottom, a small aqua lamp, a cast plate and a stencilled `4`; **a dented tin cup hung on a nail beside it** by the town, and a brushed mark above | 400 | back-plate centre at floor level | `lamp` (emissive quad), `flap` (hinge) | `dispense` 0.4 s: the flap kicks and settles | seam object; identical everywhere |
| `ia_line_locker` | A Pellam locker: enamel cabinet 0.6 × 0.3 × 1.2 m with a rounded glazed-looking door (opaque `lens`), an aqua lamp bar across the top, a brass cradle inside holding one line round upright, `picto_line` on the door | 500 | back centre at floor level | `door` (hinge left), `lamp`, `round_slot` (empty; code shows a `prop_cartridge_line` here) | `open` 0.5 s, `close` 0.5 s | one asset, four placements (`_bay`, `_hall`, `_secret`, `_bore`) |

**The gate, the street, the yard**

| id | Description and dimensions | Tris | Pivot | Nodes | Clips | Notes |
|---|---|---|---|---|---|---|
| `ia_jug` | A hand-thrown clay jug 0.32 across × 0.42 m, narrow neck, two lugs, a cord cradle; hangs from a 0.6 m cord. `broken` variant: the neck and lugs still in the cradle, body gone | 260 (intact), 140 (broken) | cord top | `jug_intact`, `jug_broken` | — | seven instances; shards and sand pour are VFX. The seventh has a hairline crack and a thread of sand already falling |
| `prop_stock_gate` | The drop-bar, sized to the `door_jug_gate` opening (4.0 × 2.8 m): a timber bar 4.6 m × 0.3 × 0.35 m of three lashed baulks whose ends ride in the piers' guides, its underside 2.35 m above the ground when shut, with six iron hooks on its east face 0.7 m apart (the jugs hang from them on 0.6 m cords, bodies centred 1.55 m up) and a slatted hurdle 3.9 m wide × 2.35 m tall hanging from it to close the opening | 500 | bottom centre of the hurdle, closed position | `gate_bar` (code raises it 0.2 m per jug, to 2.6 m), `hook_1…6` | — | `m_frontier` texture on the baulks is allowed (near class). Jugs and their hit spheres ride on the hooks as the bar rises |
| `prop_well_sweep` | The pylon's fallen arm (ceramic, 5.5 m, insulator stack still on its tip) lashed with cable to a forked timber post 3 m tall as a counter-weighted sweep; a net of stones on the short end; a cord from the long end to the gate bar | 600 | post base | `sweep_arm` (pivot at the fork; code rotates it 4° per jug) | — | the lip's seam object |
| `prop_wagon_tipped` | A freight wagon bed 3.6 × 1.5 × 0.9 m tipped on its side, one wheel (1.2 m, 12 fat spokes) in the air, one half buried, tongue broken, a drift inside it | 1 200 | base centre | — | — | `VL`; full-height cover (2.1 m as it lies) |
| `prop_trough_pump` | A dry plank trough 2.4 × 0.6 × 0.5 m with a hand-pump post 1.6 m (iron, long handle up), the brushed mark on the trough end, sand to the brim | 450 | base centre | `socket_cup`, `socket_kneeler` | — | `VL` |
| `prop_cup_tin` | A dented tin cup 0.09 × 0.08 m with a wire handle | 60 | base centre | — | — | breakable (VFX spin-off); the kneeler sets it on the trough rim. One more instance is **the Dowser's cup at stop two**: set exactly square to the edge of the Tally hearthstone on a folded strain-cloth, a dark dried ring inside it (vertex colour) |
| `prop_water_cart` | A two-wheeled cart carrying a 1.2 × 1.8 m staved barrel on its side, shafts on the ground, bung out | 900 | base centre | — | — | `VL`; cover in the yard |
| `prop_yard_gate` | Double timber wagon gate filling `door_yard_gate` (4.0 × 3.0 m): two leaves each 2.0 × 2.9 m, Z-braced, strap hinges, a bar | 400 | hinge line centre at ground | `leaf_l`, `leaf_r` | `burst_open` 0.5 s: both leaves fly outward 100°, the bar splits; `rest_open` pose held | wave D |
| `ia_yard_door` | A Pellam access panel used as a door, filling the `ia_yard_door` opening (2.6 × 2.8 m): one enamel panel on the 1.2 m module (two panels and a 0.2 m edge frame), rounded corners, hung on two hand-forged strap hinges in an adobe frame, with a steel latch plate 0.3 m square carrying a knot seat on its street (east) face, **1.3 m up and 0.95 m from the door's centre toward the latch edge** (the `knot_yard_latch` marker) | 300 | hinge axis at ground | `leaf`, `socket_knot` | `open` 0.8 s (swings in 95°, bounces) | salvage; the knot is `knot_mech` |
| `knot_mech` | The mechanism knot (section 6): visual radius 0.16 m on a hexagonal collar plate 0.42 m across | 220 | collar back centre | `knot_live` | — | used for `knot_yard_latch`, `knot_hatch_latch`, `knot_cold_bay`, `knot_a`, `knot_b`, `knot_c` (the last three at scale 1.25) |
| `ia_yard_bell` | A white ceramic insulator stack (0.28 across × 0.4 m, four skirts) hung in a timber yoke on a 2.2 m post | 260 | post base | `bell` (swing pivot at the yoke) | `ring` 1.2 s: swings 18° and damps | the Transit stakes it; after that a stake sticks in it |
| `sec_loft_bell` | The same insulator hung on a 1.2 m cord from the feed store's hoist arm, and a 3.2 m ladder (rails 0.07 m, six rungs) stowed above | 300 | hoist arm tip | `rope` (hit target, fat: 0.05 m), `bell`, `ladder` | `fall` 0.9 s: rope parts, bell drops and bounces, ladder swings down to the street | secret 1 |
| `prop_door_frontier` | A plank door filling its marker (`door_alley`, `door_tally`: 1.6 × 2.4 m), ledged and braced, leather hinge straps, a peg latch | 160 | hinge axis at ground | `leaf` | `open` 0.6 s | the yard alley door and the Tally south door. Facade doors that never open are zone geometry at 1.2 × 2.2 m; the mark decal is the zone's |
| `prop_lantern` | A square tin lantern 0.16 × 0.16 × 0.34 m with four horn panes (opaque, warm), a wire bail, a flame cell inside (emissive quad cross). `lit` and `dark` variants by emissive cell | 180 | bail top (hanging) | `flame` | — | breakable; street lanterns are dark; the Tally lantern is lit |
| `prop_bottle` | Three bottle shapes 0.08 × 0.28 m (`lens`-dark glass, opaque, one bright vertical highlight painted in vertex colour) | 60 each | base centre | — | — | breakables, instanced, in sixes on sills |
| `prop_crate`, `prop_barrel`, `prop_sack` | Plank crate 0.7 m cube (from parts, lid askew); staved barrel 0.6 × 0.9 m with three hoops; a slumped grain sack 0.7 × 0.4 × 0.3 m | 300 / 330 / 120 | base centre | — | — | instanced dressing; crates are `pierce` |
| `prop_strain_cloth` | A square of well-linen 0.8 × 0.8 m hung over a line or folded | 60 | top edge | — | — | wind attribute; one on the wash-house line hangs dead still |
| `card_dowser` | The Dowser billboard (section 6.5): a 2.0 × 0.9 m alpha-tested card, pale coat, hat, forked rod; faces the camera about Y | 2 | feet | `glint` (rod tip) | — | never under 3 × 8 px at 720p: code scales it |

**The Dowser's stops and readables**

| id | Description and dimensions | Tris | Pivot | Nodes | Clips | Notes |
|---|---|---|---|---|---|---|
| `prop_camp_ash` | A ring of seven fist stones 0.7 m across round a bed of grey ash with three charred stick ends, swept clean round it. Variants: `cold` (the town's own ash in the Tally House firebox, four days dead: dressing), `embers` (**stop three, the Dowser's only fire**: orange emissive cells between the sticks, one white-hot) | 300 | centre at ground | `ash_cold`, `ash_embers` (variant nodes; `ember_glow` is the emissive part of `ash_embers`) | — | neat: he tidies. **Not used at stop one** (GDD section 2, "The trace"): the overhang has the pot and the stone only |
| `prop_coffee_pot` | A blue-grey enamelled tin pot 0.16 × 0.22 m, spout, wire handle, chipped rim, lid off and set beside it, the inside black (stop one: it is how she reads two days) | 160 | base centre | — | — | |
| `prop_kettle` | A squat tin kettle 0.2 × 0.18 m with a bail (stop three). A thread of steam (VFX): still warm | 180 | base centre | `steam` | — | |
| `prop_flat_stone` | A flat river stone 0.5 × 0.35 × 0.08 m | 60 | base centre | — | — | stop one: the pot stands on it; the rim stone is `prop_rim_stone` |
| `rd_note` | A sheet of ruled ledger paper 0.13 × 0.2 m, folded once, ruled in graphite, weighted. Variants by what weights it: `lip` (one spent lead case), `hearth` (nothing: square on the hearthstone), `cradle` (tucked into the niche lip), `stone` (under the first banded case) | 12 + weight | centre | — | — | `m_prop` + `m_mask` ruled lines; glint on the case |
| `rd_ledger` | A bound ledger 0.3 × 0.42 × 0.05 m, cloth spine, open at the last written page, a pencil laid in the gutter | 120 | base centre | — | — | head of the table |
| `rd_rain_tally` | A child's wood-framed slate 0.22 × 0.3 m, chalk strokes in fives (decal), a cord loop, a nub of chalk | 60 | base centre | — | — | loft |
| `rd_plate` | A Pellam cast plate 0.6 × 0.34 m, 16:9, four rivets, 6 mm proud, raised border. Three variants: `line` (`picto_line` + `LINE CHARGE. FOR SIGHTING.`), `proving` (**a banded cartridge in 8 mm relief, 0.25 m tall**, + `PROVING CHARGE. BANDED.` + `DO NOT KEEP.`), `service` (`TAMPING UNIT.`). Each: mark at left, wordmark, raised bars for the remaining lines | 250 | back centre | — | — | `m_pellam`-coloured via palette; `m_mask` text |

**Tally House**

| id | Description and dimensions | Tris | Pivot | Nodes | Clips | Notes |
|---|---|---|---|---|---|---|
| `prop_tally_table` | A long trestle table 11.0 × 1.4 × 0.8 m (the layout's `ty_table` footprint) of four plank leaves on five trestles; boards worn pale where hands rest (eleven pairs of pale patches). One mesh. The fifth, north leaf (2.6 × 1.4 m), dragged away against the north wall at an angle to clear the hatch, is **zone geometry of `env_tally_house`** (layout solid `ty_table_end`) in the same plank style, not part of this asset | 900 | centre at floor | `seat_1…11` (empties: chair positions, matching the layout's seats and the two riser chairs), `socket_ledger` | — | `VL`, casts into `lm_tally` |
| `prop_chair` | A plain ladder-back chair, rush seat, 0.45 × 0.45 × 0.95 m, each instance jittered | 150 | base centre | — | — | instanced ×11 |
| `prop_head_chair` | **Not one of theirs:** a folding camp chair of pale canvas and turned wood, 0.5 × 0.5 × 0.85 m, pulled out to face the seated, in the south-east corner by the hearth. Clean | 180 | base centre | — | — | the Dowser's; lit by the middle blade, which lands on its seat |
| `prop_bench` | A plank bench 2.2 × 0.3 × 0.45 m | 90 | base centre | — | — | three barring the front doors, others along walls |
| `ia_shutter` | A board shutter leaf **1.2 W × 0.9 H m** (it fills the `shutter_*` opening), hinged along its **bottom** edge, 0.45 m below the opening's centre. It is held shut by an iron pull-rod (0.03 m, drawn fat) hooked over the leaf's top edge and running down the inside of the wall to a white ceramic insulator (0.12 × 0.16 m, the brightest small thing in the room) **1.0 m below the opening's centre, 0.06 m proud of the wall**: 3.5 m above the floor, exactly on the `ia_latch_*` marker | 160 | hinge axis centre (0.45 m below the opening centre; the `latch` node is 0.55 m below the pivot) | `shutter_leaf`, `latch` (hit target: the insulator) | `drop_open` 0.5 s: latch shatters (VFX), the rod drops, the leaf falls outward 150°, bangs, rattles twice | three instances `shutter_s/m/n`. The visible insulator and the latch hit sphere (r 0.14 m) must coincide |
| `prop_share_cloth` | The town's banner: `linen` 1.6 W × 1.2 H m hung from a viga by one 0.25 m cord, square across the north blade and facing the north window, twelve family marks in `town_paint` in a grid, hem frayed (`card_edges`). The cloth's centre is 0.86 m below the cord top (layout: cord 4.72 m up, cloth centre 3.87 m) | 200 | cord top | `cord` (hit target, fat 0.05 m), `cloth` | `fall` 1.2 s: cord parts, cloth drops and settles in a heap (4 bones) | wind attribute while hanging: hangs still (no draught in the hall) |
| `prop_day_cell` | A pale ceramic disc 0.6 m across, 0.08 m thick, slightly domed, in a steel bezel, on a steel drop-arm 1.0 m long bracketed to the tie-beam above the hatch, tilted to face the north window (layout `day_cell`: disc centre 3.27 m up, `rotY` 45). The pictogram plate is not on this asset: it is on the wall conduit in `env_tally_house` | 200 | back centre | `cell_face` (emissive: off → aqua) | — | |
| `ia_hatch` | A Pellam floor hatch filling the **4 × 2 m** rectangular opening (the `ia_hatch` marker's footprint): two enamel leaves, each 4.0 × 1.0 m, meeting on the long (east–west) centreline and sliding apart north and south into the frame. **The latch block is not part of this asset:** it is zone geometry of `env_tally_house` at the hatch's north-west corner, inside a ceramic cowl open to the north only (layout solids `ty_latch_block`, `ty_latch_cowl_*`: 1.4 × 0.5 m, 1.5 m high), with the knot seat at (−92.6, 0.9, −34.35) facing **north** (the `knot_hatch_latch` marker). The asset keeps a `socket_knot` empty there and its `latch_lamp` | 500 | opening centre at floor level | `leaf_a`, `leaf_b`, `socket_knot`, `latch_lamp` | `open` 1.0 s (each leaf slides 1.0 m, **linear in time**, so code can hold the clip at 15 % for the "ajar" state: a 0.3 m gap), `close` 1.0 s | aqua comes up through the gap as soon as it is ajar |

**Gallery and stair**

| id | Description and dimensions | Tris | Pivot | Nodes | Clips | Notes |
|---|---|---|---|---|---|---|
| `prop_coat_hung` | A work coat on a peg, 0.5 × 0.15 × 1.1 m, three variants (long, short, shawl); `workcloth` family colours | 90 each | peg (top) | — | — | instanced, wind attribute (shaft draught). **One instance has wind 0** |
| `prop_hat_hung` | A broad-brimmed felt hat, 0.38 across | 50 | peg | — | — | instanced |
| `prop_boots_pair` | A pair of work boots set side by side, 0.3 × 0.25 × 0.28 m | 90 | base centre | — | — | instanced beneath coats; none beneath the low rail |
| `ia_range_plate` | A ceramic test plate: disc 0.7 m across, 0.04 m thick, hung by two cable loops from a hook | 100 | hook | `plate` | `ring` 0.8 s: swings 10° and damps | `pierce`; three instances |
| `prop_proving_step` | A raised steel-edged step 1.6 × 1.6 × 0.15 m with a `brass` disc 0.5 m across let into its centre (the brass mark) and `picto_misc` footprints | 160 | base centre | `mark_glow` (aqua rim, off until "standing right") | — | `VL` |
| `prop_sighting_loop` | A ceramic ring 0.5 m inner diameter, 0.06 m section, on a steel post, **ring centre 2.02 m above the bay floor** (the `pz_sighting_loop` marker: 0.22 m above the eye of a player standing on the step, on the true line through the three knots), graduated ticks on its face | 220 | post base | `loop_rim` (emissive, off until on-step) | — | from the brass mark the three knots must nest inside the ring: check it in a render from the layout's `eye` point |
| `ia_baffle` | A Pellam baffle door filling the `ia_baffle` opening (3 × 3 m): two ceramic leaves with interlocking stepped edges and a `hazard` diagonal; three lamps in a row on a lamp bar that mounts on the wall above the lintel (outside the 3 × 3 m leaf area) | 500 | sill centre | `leaf_l`, `leaf_r`, `door_lamps` (lamp set of 3) | `open` 3.0 s (grinds apart, uneven: the left leaf sticks at 70 % then frees) | |

**Lift hall and bore**

| id | Description and dimensions | Tris | Pivot | Nodes | Clips | Notes |
|---|---|---|---|---|---|---|
| `prop_door_pellam` | A Pellam sliding door leaf filling `door_gallery_far` (3.0 × 3.0 × 0.12 m): enamel panels on the 1.2 m module with a steel edge frame, livery band, a pull recess at 1.6 m, a top track 0.2 m deep mounted above the opening | 220 | sill centre, closed | `leaf` | `open` 1.0 s (slides right 2.9 m, a hard stop and settle), `close` 1.0 s | the gallery far door (opened by wave B of `enc_file`); `m_prop`, `AO` |
| `prop_grate` | A steel floor or kerb grate 1.2 × 1.2 × 0.06 m, alpha-tested `grille` in a 0.08 m frame, hinged on one edge | 40 | hinge edge centre | `lid` | `flip_open` 0.4 s (thrown back 110°, clangs, stays) | yard drum base, four in the lift hall, three in the bore kerb; Biders `climb_out` after it flips |
| `ia_cold_bay_shutter` | A steel roller shutter filling `door_cold_bay` (3 × 3 m) of 0.3 m slats with a latch block low at one side (knot seat) | 260 | sill centre | `shutter`, `socket_knot` | `open` 1.5 s (rolls up) | secret 2 |
| `ia_lift_cage` | The lift cage: steel frame, grille walls (alpha-tested), plate floor, a folding gate, a lamp. **Footprint and height are the layout's cage solids**, and the two ends of a ride must match; if the two lifts differ in size the script exports each size from the same parts (module 1.2 m) rather than scaling one | 900 | floor centre | `gate` , `gate_lamp` (emissive: off / aqua) | `gate_open` 1.0 s, `gate_close` 1.0 s | proving-lift instance: `ia_proving_lift` |
| `ia_lift_lever` | A floor-standing lever: steel pedestal 0.3 × 0.3 × 1.0 m, a 0.6 m lever with a ceramic knob, a quadrant with two detents | 180 | base centre | `lever` (pivot at the quadrant) | `throw` 0.6 s | |
| `ia_bore_door` | A ceramic disc **3 m across**, 0.25 m thick, in a steel frame with `hazard` diagonals. A ring of **eight ports** at 1.0 m radius: each a dark recessed socket 0.3 m across with a brass bezel, a lamp at its rim, and a **geometry numeral 1–8, 0.22 m tall**, inside the ring beside it (between the socket and the disc centre, so the numerals clear the lamp ring). An outer ring of **twelve listening lamps** (0.08 m, brass bezels) at 1.42 m radius, dark until question 3, then filling clockwise from the top | 1 400 | disc centre (1.5 m above the floor) | `door_disc`, `port_1…8` (hit targets, empties at socket centres on the antechamber face), `port_lamps` (lamp set of 8), `listen_lamps` (lamp set of 12) | `open` 2.5 s: the disc rolls aside to the left on its track (rotates 200° as it goes) | numerals pass GDD test 13 at 6 m, 720p × 70 % |
| `ia_cradle` | A wall niche unit: a cast ceramic block 0.5 × 0.2 × 0.5 m with a lit recess holding a brass cradle shaped for **one banded round, empty**; clean (no dust skirt, no stain) on a dusty wall, **except one thumbprint in the dust on the niche lip** (a dark oval, vertex colour: `nar_cradle_2`); above it the mark in 10 mm relief, 0.5 m tall, with a small lamp at each disc, **the seventh's lamp dark** | 400 | back centre | `cradle_lamp`, `mark_lamp_1…7` | — | load-bearing; a `prop_cartridge_kept` fits it exactly |
| `ia_proving_mark` | A brass disc 0.5 m across let flush into the floor at the kerb, with a raised rim and the plumb glyph (a dot under a short stroke) | 60 | centre at floor | `mark_glow` (emissive: off → aqua) | — | six instances |
| `prop_station_plate` | An enamel plate 0.8 × 0.8 m with a geometry `4` 0.4 m tall, the wordmark and `LIFT STATION 4` | 220 | back centre | `plate_lamp` (used by the Asking's "subject lamp") | — | drum door, bay, ring, bore door |
| `prop_rim_stone` | A flat slab 0.9 × 0.5 × 0.12 m at the ledge edge, top swept clean, with seven shallow seats in a row | 80 | base centre | `seat_1…7` | — | six `prop_cartridge_kept` (spent) + `ia_stone_round` + `rd_note` (stone) |
| `ia_stone_round` | `prop_cartridge_kept`, `violet` variant, upright in seat 7 | 48 | case head | — | — | faint violet band, no halo |

### 7.5 Owner: `weapons`

One GLB: **`weapon_revolver`** (`public/assets/weapons/weapon_revolver.glb`). 6 000
triangles: gun ≤ 3 200 (`m_gun`, 1 dc), hands and arms ≤ 2 800 (`m_prop`, 1 dc). One
armature, rigid skinning for gun parts, smooth skinning for arms. Design in section 8.

- **Pivot:** the camera. Root at the origin; the asset is authored in camera space
  (camera looks down −Z, +Y up), in the `idle` pose.
- **Bones (also the nodes code reads):** `root`, `gun` (whole weapon; recoil),
  `cylinder` (axis = barrel axis; 60° per shot), `hammer`, `trigger`, `gate` (loading
  gate hinge), `ejector`, `round_1`…`round_6` (children of `cylinder`; scaled to 0 for an
  empty chamber by code), `arm_r`, `hand_r`, `thumb_r_1`, `thumb_r_2`, `index_r_1`,
  `index_r_2`, `grip_r` (three fingers as one), `arm_l`, `hand_l`, `thumb_l_1`,
  `thumb_l_2`, `index_l_1`, `index_l_2`, `fingers_l`, `round_hand_lead`,
  `round_hand_line`, `round_hand_kept` (cartridges in the left hand; scaled to 0 unless
  a clip shows them), `kept_loop` (the kept round in its cuff loop on the left wrist).
- **Empties:** `muzzle` (child of `gun`, at the crown, −Z along the bore),
  `eject` (at the gate), `cam_look` (the aim point 12 m ahead; for checking convergence).
- **Sub-meshes:** `gun_mesh`, `arms_mesh`.

| Clip | Loop | Seconds | What happens |
|---|---|---|---|
| `idle` | yes | 3.0 | breath: the gun rises and falls 3 mm, rolls 0.4°; the thumb rests beside the hammer |
| `sprint` | yes | 0.68 | muzzle up and inboard 35°, gun pumps 4 cm with each stride, left hand swings into the lower-left corner |
| `draw` | no | 0.5 | up from below the frame, muzzle arrives last, a small settle |
| `fire` | no | 0.48 | 0–0.12 kick: 0.08 m back, 20° muzzle rise, hammer falls at frame 0; 0.12–0.30 the thumb sweeps the hammer back and the cylinder turns 60° with two visible clicks (hammer half, full); settle to 0.48 exactly on the idle pose |
| `dry_fire` | no | 0.15 | hammer falls, 2 mm nod, nothing else |
| `reload_open` | no | 0.35 | the gun rolls 40° left and tips muzzle-up 25°; the right thumb flicks the gate open; the left hand comes up with a round |
| `reload_round` | no | 0.30 | the left hand seats one round at the gate (`round_hand_lead` visible, pushed home on frame 5), the cylinder clicks round 60°, the hand dips for the next |
| `reload_close` | no | 0.30 | gate snapped shut with the thumb, the gun rolls back to idle |
| `reload_fast_close` | no | 0.20 | the same in 0.2 s, straight to the firing pose |
| `load_line` | no | 0.55 | gate open, the round under the hammer is thumbed out into the palm, `round_hand_line` (aqua shoulder ring visible) seated, gate shut |
| `unload_line` | no | 0.35 | the reverse, quicker |
| `load_kept` | no | 1.8 | the centrepiece: the left wrist turns up into frame (0–0.4); the thumb breaks the band on the round in the cuff loop: the enamel band cracks and falls away in two pieces (0.4–0.9); she draws it (`round_hand_kept`), holds it one beat in the light (0.9–1.2); gate open, seats it under the hammer, gate shut (1.2–1.8) |
| `unload_kept` | no | 0.3 | gate, round back to the loop (band broken) |
| `fire_kept` | no | 1.2 | muzzle is pointing down into the bore: a longer, heavier kick (0.11 m, 26°), no cock afterward; the hammer stays down; a slow return over 0.6 s |
| `take_round` | no | 1.0 | the left hand reaches forward and down, closes on the round, brings it to the empty cuff loop and seats it |

### 7.6 Owner: `enemies`

All `m_prop`, class `AO`, one skinned mesh and one dc each. Authored facing +Z, origin at
the feet (base centre), in a rest pose that matches the first frame of `idle`.

**`enemy_bider`** — 2 500 tris, 22 bones: `root`, `hips`, `spine`, `chest`, `neck`,
`head`, `shoulder_l/r`, `upperarm_l/r`, `forearm_l/r`, `hand_l/r`, `thigh_l/r`,
`shin_l/r`, `foot_l/r`, `coat_tail_l/r`. Dimensions: 1.7 m upright, 1.4 m at the stoop
(the default), shoulders 0.5 m, hood 0.34 × 0.38 m, arms 0.78 m (long). Nodes/empties:
`crown` (centre of the knot's hit sphere, child of `head`), `hand_socket_r` (the cup).
Knot lobes and eye-slits are faces of the one mesh mapped to emissive cells. Clips exactly as GDD 7.1:

| Clip | Loop | s | What happens |
|---|---|---|---|
| `idle_stoop` | yes | 2.0 | stooped, weight shifting, hands slack, slow breath |
| `run` | yes | 0.62 | a forward fall caught by each step; arms trail; head level |
| `circle_strafe` | yes | 0.8 | side-step, hood always toward the player |
| `lunge_windup` | no | 0.5 | sinks 0.25 m, arms draw back, head dead still |
| `lunge` | no | 0.35 | 2.2 m forward (root motion baked out; code moves it), both arms thrown ahead |
| `lunge_recover` | no | 0.6 | stumbles to a stop, slow turn of the hood |
| `stumble` | no | 0.4 | one broken step, a hand out |
| `falter` | yes | 1.0 | backing, hands half raised, hood turning side to side |
| `die_back` | no | 0.9 | folds at the waist and is carried back; ends on its side, hood turned away |
| `sit_down` | no | 0.9 | two failing steps, knees fold, sits on its heels, hands flat on the ground |
| `sit_breathe` | yes | 4.0 | seated on heels, hands flat, slow breath, head slightly raised |
| `sit_table` | yes | 4.0 | on a chair, hands flat on a table at 0.76 m, breathing |
| `rise_from_seat` | no | 1.2 | hands press the table, the chair scrapes back, stands into the stoop |
| `climb_out` | no | 1.2 | two hands over a 1.2 m edge, a knee, up |
| `scoop_kneel` | yes | 2.4 | kneeling at the trough, scooping sand with a cup and pouring it back |
| `kneel_to_stand` | no | 1.0 | sets the cup on the rim (frame 12), stands, turns |
| `queue_stand` | yes | 3.0 | standing in a file, facing away, weight on one leg, patient |
| `turn_about` | no | 1.5 | the hood turns first, then the shoulders, then the feet |

Static derivatives (same script, posed and decimated; `m_prop`; `AO`; instanced; origin
at the seat or ground contact):

| id | Pose | Tris | Notes |
|---|---|---|---|
| `bider_seated_static` | last frame of `sit_down` | 500 | knot emissive off (grey husk), slits dark; **UV1.x = breath weight** (1 on the chest falling to 0 elsewhere; UV1.y = 0) and mesh extra `breath: 1`, for the 2 mm, 0.25 Hz shader breath. (Not vertex colour G: `COLOR_0` is the tint on `m_prop`.) |
| `bider_felled_static` | last frame of `die_back` | 450 | hood turned away; emissive off |
| `bider_table_static` | `sit_table` | 600 | knot live but small; hands flat; UV1.x = breath weight, extra `breath: 1`. Nine instances (the two risers at the table are skinned Biders), each with instance colour jitter |

**`enemy_transit`** — 2 000 tris, 8 bones: `root` (hub), `head` (drum), `leg_a_upper`,
`leg_a_lower`, `leg_b_upper`, `leg_b_lower`, `leg_c_upper`, `leg_c_lower`. Height 1.9 m,
stance 1.1 m, legs 0.13 m thick, drum 0.45 × 0.30 m, lens 0.24 m. Empties: `lens`
(centre of the weak point and the thread's origin), `stake_muzzle`. The lens core is an emissive
violet disc in the mesh; the aim flare is a VFX quad at `lens`, so no material swap is needed. Clips as GDD 7.2:

| Clip | Loop | s | What happens |
|---|---|---|---|
| `idle_scan` | yes | 3.0 | the drum steps left, holds, steps right, holds; one leg re-seats |
| `walk` | yes | 0.9 | three-beat gait, one leg at a time, drum level |
| `emerge` | no | 1.2 | unfolds from a 1.1 m folded bundle: legs splay one, two, three, drum rises |
| `plant` | no | 0.3 | three feet strike together, drum settles 2 cm |
| `aim_hold` | yes | 0.6 | head dipped 12°, perfectly still but for a 1 mm tremor in the vane |
| `fire` | no | 0.25 | drum recoils 6 cm, a rod leaves the rack |
| `flinch` | no | 0.25 | drum snaps 20° aside, one leg lifts |
| `sidestep_l`, `sidestep_r` | no | 0.4 | a 1.5 m crab step (code moves it) |
| `die_fold` | no | 1.0 | a leg slides out, hub drops, drum tips forward and lands lens-down |

`proj_stake` — a rod 0.6 m × 0.04 m, steel with a flame-emissive tip third and white core
line; 24 tris; instanced (pool 8 in flight + 18 stuck, shared with the boss); origin at
the tip; `cool` variant has the tip in dull orange (`#B5522B`, non-emissive).

**`enemy_tamper`** — 4 000 tris, 12 bones: `root`, `pelvis`, `barrel`, `arm_r_upper`,
`arm_r_ram`, `arm_l`, `leg_l_upper`, `leg_l_foot`, `leg_r_upper`, `leg_r_foot`,
`vent_chest`, `vent_back`. 2.4 m high, 1.6 m wide. Empties: `vent_chest_knot`,
`vent_back_knot` (hit sphere centres), `ram_head` (slam impact point), `foot_spark`. Knots and band are emissive-mapped faces of the one mesh.
Clips as GDD 7.3:

| Clip | Loop | s | What happens |
|---|---|---|---|
| `idle` | yes | 2.4 | the ram rises 0.2 m and settles, a habit |
| `walk` | yes | 1.2 | two-beat stamp, barrel rocks 4° |
| `slam_windup` | no | 1.0 | the ram goes fully overhead; `vent_chest` swings open on the same motion and stays open |
| `slam` | no | 0.3 | straight down; the whole body drops 0.15 m with it |
| `slam_recover` | no | 1.5 | chest lid open for the first 0.5 s, then shuts as the ram is hauled out |
| `charge_windup` | no | 0.8 | cowl down, one foot scrapes back twice (sparks), ram head dragged to the floor |
| `charge` | yes | 0.5 | a low fast stamp, ram dragging |
| `charge_stun` | no | 2.0 | impact, rocks back onto its heels, `vent_back` flaps open and stays open, ram buried |
| `stagger` | no | 1.5 | a step back, the ram drops, barrel twists away. Also played at half speed (3.0 s) for the GDD's `line_stagger`, with code holding both vent lids open over it: the pose must read with both lids up and must not clip them |
| `flinch_plate` | no | 0.2 | a 3° rock, no step |
| `die` | no | 2.2 | stops mid-stroke; the ram sinks slowly; lids fall shut |
| `pound_bulkhead` | yes | 2.6 | wind-up (lid open), slam on a vertical target, recover |

`tamper_cold_static` — the same mesh posed upright, ram parked, both lids shut, band in
`livery` paint (no emissive), no stain, no dust: perfectly clean. 4 000 tris, static,
`AO`, origin base centre. The secret bay.

### 7.7 Owner: `boss`

**`boss_windlass`** — 8 000 tris. **The node, bone and draw-call list is the manifest's**
(`design/assets.json`): one rigid-skinned mesh `body_mesh` on 26 bones (every part below is
a region of that mesh weighted 1.0 to its bone) plus two lamp-set meshes, `boss_lamps` and
`gauge`; `m_prop` and `m_emis`; **3 dc**. Origin on the **bore axis at chamber floor
level**, arm heading +Z at yaw 0. The drum occupies 0.9 to 3.1 m out along the heading,
2.5 m either side, 1.5 to 6.5 m up.

| Bone / part | What it is | Dimensions / position (local, metres) | Tris |
|---|---|---|---|
| `arm_yaw` | the gantry arm; pivot on the axis; code rotates about Y | a box-section steel arm from the ring girder at y 12.5 down and out to the drum hub; hub at `(0, 4.0, 2.0)`; arm section 0.8 × 1.0 m; carries the gauge housing on its outer face | 1 300 |
| `drum_spin` | the drum; child of `arm_yaw`; pivot at the hub, spin axis +Z (local) | 5.0 m across, 2.2 m deep, face plane at z = 3.1; six cast flutes round the rim; six mouths at 1.7 m radius, each 0.9 m across, mouth 1 at the top at spin 0, numbered clockwise as seen from the front | 2 600 |
| `mouth_1`…`mouth_6` | swing lids, children of `drum_spin`; pivot on the mouth rim (outboard side) | ceramic lid 0.96 m across, 0.08 m thick | 120 each |
| `knot_1`…`knot_6` | knots in the mouths (the bone carries the lobe cluster: code squashes it when hit; its white core is a lamp in `boss_lamps`); empties at hit-sphere centres are `knot_1_hit`…`knot_6_hit` | visual radius 0.38 m, set 0.3 m behind the face | 180 each |
| `guard`, `guard_piece_1`…`guard_piece_5` | the ceramic guard plate, child of `arm_yaw` (does not spin), pre-cut into five sectors that ride `guard` until `guard_shatter` | disc 4.6 m across, 0.12 m thick, parked above the drum; `pierce` | 500 |
| `pawl_l`, `pawl_r` | the pawl knots on the arm; empties `pawl_l_hit`, `pawl_r_hit` | at `(∓1.6, 6.0, 3.95)`, radius 0.30 m, hex plates; the bone carries the lobe cluster | 200 each |
| (no bone) the firing-position pawl | the fixed steel dog over the top mouth: plain geometry weighted to `arm_yaw`. It is not a node and code never addresses it | 0.5 m long | 80 |
| `cable_a`, `cable_b`, `cable_c` | haul cables from the drum back down into the bore | 0.12 m thick (2-pixel rule), three, each 9 m | 60 each |
| `boss_lamps` (lamp set, 14) | indices 0–5: the lamps beside mouths 1–6, outboard at 2.3 m radius (brass bezel 0.22 m, emissive disc); 6–11: the knot cores 1–6; 12, 13: the cores of `pawl_l`, `pawl_r` | lamp quads ride their bones | 14 × 30 |
| `gauge` (lamp set, 26) | the health ladder on the arm housing | 26 emissive segments 0.30 × 0.10 m in groups of 10 / 10 / 6, indices 0–25 bottom to top | 110 |
| empties | `muzzle_top` (the firing mouth, on `arm_yaw`), `thread_anchor_1…6` (on the mouths, for relight threads), `canister_muzzle`, and the eight `*_hit` empties above | | |

| Clip | Loop | s | What happens |
|---|---|---|---|
| `idle_sway` | yes | 4.0 | the drum sways 0.5° on its cables |
| `present` | no | 1.0 | the arm dips the drum 0.3 m toward the door and steadies: an acknowledgement |
| `mouth_open` | no | 0.2 | a lid swings 110° about its rim pivot (authored on `mouth_1`; code retargets) |
| `mouth_close` | no | 0.2 | the reverse, with a 4° bounce |
| `guard_slide_on` | no | 1.2 | the guard descends from its park and seats over the face with a 2 cm settle |
| `guard_drop` | no | 0.6 | falls away below the drum on two links |
| `guard_raise` | no | 0.6 | hauled back up |
| `guard_shatter` | no | 1.0 | the plate breaks into its five pre-cut sectors (bones `guard_piece_1…5`) that fall into the bore |
| `sag_death` | no | 3.0 | drops 0.4 m, tilts 6°, `cable_c` goes slack, a last half-swing |

`proj_canister` — a squat ceramic pot 0.35 × 0.3 m with a steel band and a flame-emissive
seam; 80 tris; instanced; origin at centre.

### 7.8 Shared library ownership

The shared textures in 4.2 are built by one script each under `blender/tex/` by the
foundation pipeline owner. If they do not exist when production starts: `env_exterior`
bakes `tx_frontier_trim` and `tx_sand`; `env_interior` bakes `tx_pellam_trim`; `props`
bakes `tx_mask`, `tx_palette`, `tx_palette_emis`; `weapons` bakes `tx_gun` and
`tx_matcap_steel`; the rendering/VFX owner makes `tx_fx` and `tx_noise`.

---

## 8. First-person presentation

### 8.1 The Assize six (the star)

A heavy single-action six-gun, gate-loaded, built for a Reeve by an armourer who thought
ornament was a kind of lying. It should look like the one object in the world that has
been cleaned every day for eleven years.

- **Overall:** 0.345 m long, 0.145 m tall, 1.3 kg in the hand (the animation must sell
  that). No engraving, no inlay, no logo but the one stamp.
- **Barrel:** 0.19 m, **octagonal for the rear 0.11 m, turned round for the front
  0.08 m**, 19 mm across the flats. The octagon's flats are the gun's signature
  highlight: one flat always catches the key. A tall blade front sight (7 mm high,
  1.8 mm thick, modelled 2.5 mm so it never drops under two pixels), rear sight a plain
  notch cut in the top strap. Crown recessed, bore 11.4 mm, modelled 14 mm deep and dark.
  The front 30 mm has gone grey (`gun_worn`) from the holster and from heat.
- **Ejector housing:** a full-length tube under the barrel on the right side with a
  crescent-headed rod.
- **Cylinder:** 42 mm across, 41 mm long, **six flutes**, six bolt notches, a visible gap
  to the barrel; case heads (brass rim, darker primer) visible from behind in each
  loaded chamber. Flute ridges worn to grey.
- **Frame:** a solid top strap, a broad recoil shield, a **loading gate on the right**
  hinged at its lower edge. Under the gate, visible only while it is open, **the mark,
  9 mm tall, stamped**: six tiny open discs, a stroke, a solid seventh. Three screws on
  the left side, slots not aligned (hand-turned).
- **Hammer:** tall spur, chequered (three raised bars, not a texture), worn bright on
  top. A fixed firing pin.
- **Trigger and guard:** a plain round guard in steel, a narrow curved trigger.
- **Grip:** one-piece **dark walnut**, plough-handle shape, 115 mm, oil-dark, worn paler
  and smooth at the heel and where the thumb sits; one hairline crack at the butt pinned
  with a brass pin (the only brass on the gun). No lanyard ring, no medallion.
- **Finish:** `gun_blue` so dark it reads black in shade and deep blue-violet under the
  sky; satin, not mirror. Edge wear only where a hand or holster goes. No rust, no
  scratches for decoration, no grime.
- **Rounds:** lead: brass + grey nose. Line: brass + enamel nose + aqua shoulder ring
  (emissive, tiny). Kept: brass + the enamel band with a livery hairline. It rides in a
  **single leather loop on the back of the left cuff**, band outward, visible in every
  reload: the player has been looking at it for twenty minutes before they are asked to
  break it.

Material: `m_gun`. Albedo from `tx_gun` (blue, wear, walnut grain drawn along the grip,
case brass). Gloss mask in alpha: blue 0.75, worn edges 0.9, walnut 0.35, brass 0.6.
Specular: `tx_matcap_steel` added × gloss × zone key colour; plus a fresnel rim toward
the zone's sky colour (enamel and gun only). The gun receives zone ambient + key like any
dynamic object and the muzzle pulse, so it warms in a shaft of sun and goes petrol-dark
underground. Target: **the darkest object in every frame, with the single sharpest
highlight.** Triangle spend: cylinder 700, barrel and sight 450, frame 900, hammer /
trigger / gate / ejector 550, grip 350, six case heads 150, hand rounds 100.

### 8.2 Hands and arms

- Right hand holds the gun; left hand is off-screen at idle and enters for reloads, the
  line round, the kept round and the stone.
- **Gloves:** unlined work gloves in dull, greyed leather (as built, polish round 2: `#5A5048` / `#6E6459`, OKLCH
  chroma ≤ 0.05, so they are never the lightest or most saturated thing in the frame; this paragraph said "pale tan"), a seam along each finger, a short
  gauntlet; palm and trigger finger worn. Slim hands, strong; not bulky. Three finger
  units on the right (thumb, index, the other three as one), four on the left.
- **Wrist:** 20 mm of bare skin between glove and cuff (`skin`), with the cord of the
  glove's tie.
- **Cuff:** a dark oilcloth coat sleeve (`cuff`), leather-bound edge, one horn button;
  the left cuff carries the kept round's loop. The sleeve ends 0.25 m up the forearm at
  the frame edge; nothing beyond it is modelled.
- Colour blocking in frame: dark gun, mid glove, dark cuff. The glove is the lightest
  part so the hand reads against dark interiors.

### 8.3 View-model camera

- **View-model FOV 40° vertical, fixed** (polish round 3, lead ruling R6; it was 52°: at 52 the 8 % share was
  reached only by pushing the gun toward the eye, and the hammer drew larger than the barrel), independent of world FOV 50–80. Rendered after
  the world with depth cleared (or a compressed depth range) so it never clips walls.
  Near plane 0.02 m.
- **Idle placement (camera space), as built in polish round 2** (two critic majors: the gun had no presence at
  4 % of the frame): muzzle at `(0.052, −0.034, −0.52)`, cant 12°, the bore 12° inboard and 4° up of the view axis
  (it no longer converges on the crosshair: hits are resolved from the eye, the `muzzle` socket is only where the
  flash and the tracer start; `cam_look` stays at `(0, 0, −12)`). On screen at 16:9 the muzzle sits at 55.8 % across,
  43.3 % up and the gun and hand cover about 8 % at idle. Still binding: no more than 18 % of the frame (the two
  kept-round clips `load_kept` / `take_round` measure 19.5 %: accepted for those two clips only), never across the
  vertical centre line. (Was: muzzle `(0.075, −0.070, −0.56)`, 58 % / 37 %, bore
  on the crosshair at 12 m.)
- **As built in polish round 3** (R6: the revolver covers at least 8 % of a 16:9 frame at idle): the player system
  adds `VIEW_PLACE` x −0.008, y 0.012, z 0.065, pitch −5°, yaw 5°, roll −4° to the authored idle in the 40° pass. The
  revolver alone covers 9.3 to 9.9 % of the frame, the hand 1.0 to 1.4 %, the left edge at 0.54 of the width (4:3:
  9.0 %; 21:9: 7.6 %). Handling clips (reload, line round, kept round, take) are framed by `VIEW_PLACE_HANDLING`
  x −0.02, y −0.04, z −0.03: the whole gun in the right half, the gloves leaving by the bottom edge. `load_kept` and
  `take_round` may reach 20 % coverage and 0.44 of the width. The sentence "never over the cylinder ring HUD" is
  withdrawn: an 8 % gun in the lower right cannot clear that corner (closer's ruling; the ring lies over the frame
  and hammer at 16:9).
- At 4:3 and 21:9 the gun keeps its distance from the right edge (anchor to the right).

### 8.4 Animation feel

Weight, then precision. Every clip starts fast and ends slow (ease-out), overshoots by a
few degrees and settles in two frames. The hammer and cylinder motion in `fire` are
visible and exactly on the audio's two clicks (frames 4–9 at 30 fps). The reload is a
practised ritual: economical, the same every time, each round pressed home with the
thumb. Nothing twirls. The only slow, deliberate clip is `load_kept`, and it is slow
because she has never done it. Procedural layers (bob, sway lag of 2–3° against look
input, landing dip, kick) are code and must not be baked into clips.

---

## 9. VFX

All particles are pooled instanced quads or points; nothing allocates per frame. Every
effect has a Low and a High count. **Additive overdraw is capped at 1.0 screen on Low
(1.5 on High) in any frame**; alpha-blended smoke at 0.5 screen. Effects use only the
three emissive hues plus neutral dust and smoke.

### 9.1 `tx_fx` atlas (1024 × 512 RGBA)

Row A, four 256 px cells: `flash_a…d` (four muzzle-flash shapes: a six-pointed star,
unequal arms, white-hot core to flame edge; the same shape in four rotations with
different arm lengths). Rows B–C, sixteen 128 px cells: `smoke_a`, `smoke_b`, `dust_a`,
`dust_b`, `spark` (a short streak), `soft_dot` (halo), `star4` (four-point glint),
`shard` (a ceramic or clay chip), `splinter`, `sand_pour`, `mote_cluster`, and five
decals: `dec_wood` (a dark hole with pale torn edge), `dec_adobe` (a pale crater),
`dec_metal` (a bright scuff), `dec_ceramic` (a white chip with a dark star crack),
`dec_stone` (a pock with dust). Sand takes no decal: it gets a crater puff only.

### 9.2 List

| Effect | Look | Budget (Low / High) |
|---|---|---|
| **Muzzle flash** | one `flash_*` quad at `muzzle`, 0.35 m, random of four, 33–50 ms, additive; plus the world light pulse (flame, r 7 m, 70 ms; 35 % outdoors by day) and the pooled point light on dynamic objects. Reduce Flashes: 60 % size, pulse halved | 1 quad |
| **Powder smoke** | 4 soft `smoke` puffs drifting up-right from the muzzle, 0.7 s, grey-warm `#B9A79C` at 25 % alpha | 4 / 6 |
| **Tracer (lead)** | a flame-white streak 3 m long, 2 px, 2 frames, from muzzle toward the hit | 1 |
| **Ricochet tracer** | the same, reflected off plate, 6 m, with a `spark` burst of 6 and the deflected glyph | 1 + 6 |
| **Line round** | a dead-straight aqua line muzzle to end point, constant 3 px with a soft halo, holds 1.2 s, fades 0.3 s; small aqua `soft_dot` at each body it passes | 1 quad + ≤ 6 dots |
| **Impact: sand** | a fan of `dust` (6), a crater puff, 0.5 s | 6 / 10 |
| **Impact: wood** | 4 `splinter` + 1 dust + `dec_wood` | 5 / 8 |
| **Impact: adobe** | a pale dust burst (5) + 2 chips + `dec_adobe` | 7 / 10 |
| **Impact: metal** | 6 `spark` (flame-white, gravity, 0.25 s) + `dec_metal` | 6 / 10 |
| **Impact: ceramic** | 5 white `shard` + 2 spark + `dec_ceramic` | 7 / 10 |
| **Impact: stone** | grey dust (4) + 2 chips + `dec_stone` | 6 / 8 |
| **Impact: cloth (Bider body)** | a puff of ground-coloured dust (5) and 3 linen threads (`splinter` tinted pale). No red, ever | 8 |
| **Decals** | pool of 48, alpha-tested where possible, each ≥ 20 s | 48 |
| **Knot burst** | the lobes vanish; 14 violet `mote_cluster` motes fly out 0.6 m and fall, fading to grey in 0.5 s; one white `soft_dot` flash 60 ms; a wet ring of `dust_a` tinted violet 20 %. Then the grey husk | 16 / 24 |
| **Bider freed** | the knot burst, then motes rising slowly from the hood for 1.5 s (6), like breath in cold air | +6 |
| **Bider felled** | a ground dust puff where it lands (6). Nothing else | 6 |
| **Bider slits and knot pulse** | emissive shader pulse; halo `soft_dot` on the knot on High | 0 / 1 each |
| **Transit aim** | lens flares violet → flame with white core; `star4` glint 0.4 m growing over the 0.9 s; the **dashed sighting thread**: constant 2 px, dashes 0.3 m, flame | 2 quads |
| **Stake** | instanced rod with a flame tip; a 1 m additive trail; on sticking: 4 sparks; cools to dull orange over 6 s | 8 in flight, 18 stuck |
| **Transit death** | lens glass: 6 `shard` + a white flash dot | 7 |
| **Tamper slam ring** | a flame ring on the floor r 3.5 m with **eight tick marks**, drawn by shader on one quad, fills during the 1.0 s wind-up; on impact a dust ring (12) and 8 chips | 1 quad + 20 |
| **Tamper charge** | `spark` stream from `foot_spark` and the dragged ram (8 per second), dust wake (6) | 14 |
| **Tamper plate hit** | grey spark burst + ricochet tracer | 7 |
| **Vent open** | violet light spilling from the cavity: a `soft_dot` halo and 4 slow motes | 5 |
| **Windlass mouth glow** | flame disc growing in the top mouth over the glow time, white core, a ring of 6 radial ticks (shape) | 1 quad |
| **Canister** | lobbed pot with a flame seam and a thin smoke trail; lands: flame ticked ring r 3.5 m for 1.0 s (same shader as the slam ring); burst: 16 sparks, a dust ring, a white flash dot | 2 rings max, 20 each |
| **Lance** | dashed flame thread on the start edge 1.2 s, then one tall additive quad (4 m × 0.25 m, white core, flame edge) sweeping at chest height; sparks where it meets a rib | 1 quad + 6 |
| **Fan (3a)** | six stakes; six lamps ramp in turn | pooled |
| **Relight thread** | a thin violet line climbing from the bore to a mouth over 1.0 s, constant 2 px, with a bright head | 6 max |
| **Guard shatter** | five mesh pieces (clip) + 20 `shard` + dust | 22 |
| **Sun blades (daylight)** | per shutter: two crossed additive cards + one landing patch; motes inside | 3 quads + 40 motes each |
| **Jug burst** | 8 clay `shard`, a sand pour (`sand_pour` streak 1.2 s, then a growing cone decal on the ground), a dust puff | 12 |
| **Seventh jug leak** | one thin falling `sand_pour` thread catching the sun, with a `star4` glint every 3 s | 2 |
| **Insulator latch / bell break** | 6 white `shard`, a flash dot | 7 |
| **Puzzle feedback** | lamps answer: emissive on with a 150 ms over-bright and a `soft_dot` halo; wrong answer: the lamp blinks off once. Outline pulse (hint T3): a 2 px aqua-white screen-space outline, 1 Hz | per lamp 1 |
| **Listening lamps** | dark until question 3; then twelve small aqua lamps filling clockwise one every 0.75 s, each with a tiny halo, the cradle's lamp stepping brighter with each; all snuff together at a shot | 12 |
| **Proving mark lit** | from the first tick of phase 3a: aqua disc + 1.2 m halo, slow 0.5 Hz breathe; the nearest mark's halo flares once if `F` is pressed off a mark | 6 |
| **Pickup glint** | `star4`, 60 ms, every 2.5 s, flame-core white | 1 each |
| **Dust motes (interior)** | 300 / 600 points wrapped round the camera, visible only in blade and shaft volumes | 1 dc |
| **Blowing sand (exterior)** | 200 / 400 low streaks hugging the ground, along the wind (to the south-east) | 1 dc |
| **Embers (camp three, last fire)** | 6 slow rising flame points, 2 s life | 6 |
| **Kettle steam** | 3 pale wisps, 2 s | 3 |
| **Dowser glint, dust-short** | one `star4` on the rod; a dust puff far short of him if shot at | 1 + 4 |
| **Wind-pump, cloth, coats** | vertex-shader sway (wind attribute) | 0 |
| **Heat shimmer** | post UV offset on the horizon band | High only |

### 9.3 Signature spectacle: the seventh

In order, all from existing parts (GDD 8.2):

1. **The hush.** On `F`: every projectile in flight bursts in harmless sparks; time ×0.5;
   ambient motes stop drifting. Over the 1.8 s of the load the arm swings in one ratchet
   run to the far side of the bore, so the drum's fluted back is to her (the cylinder seen
   from the right end at last) and the bore stands open in front of the mark.
2. **The shot.** A muzzle flash that is **aqua-white**, the only non-flame flash in the
   game, larger (0.5 m), 80 ms.
3. **The standing line.** One vertical additive quad on the bore axis, aqua with a white
   core, constant 4 px, from the bore's bottom through the roof. Permanent.
4. **The ring.** A pale ring (white, 1.5 m wide falloff, 60 % peak) racing outward across
   every surface from the bore axis, radius 0 → 40 m in 1.6 s, using the muzzle-pulse
   term. Behind it `wrong_fade` goes 0 → 1: knots go grey, livery bands that had gone violet go
   aqua, the bore's light turns from violet to aqua **from the bottom up**, fog shifts to
   `#12343C`. Reduce Flashes: no ring, a 1.6 s tint.
5. **Every Bider sits.** Rising motes from each hood.
6. **Four seconds of nothing.** No particles spawn. Dust hangs.
7. **Water.** A faint ripple of aqua light crawling up the bore wall (a scrolling
   `tx_noise` term on `bore_glow`), slow, for the rest of the stage.

Budget: 2 additive quads + the shader term. No new geometry.

### 9.4 The coda

The Rule at 2°. The aqua thread from the town card (sky shader). Lit windows: `lamps`
flame quads with a 2 px halo each, lighting one by one over 3 s on arrival. The last
fire: one flame sprite ≥ 4 px, flickering, kindling from nothing over 1.5 s, with a
1 px smoke thread on High.

---

## 10. UI art direction

**Principle.** The HUD is drawn in the gun's language: brass, bone and ink, thin strokes,
no panels, no gradients, no drop shadows beyond a 1 px dark outline for legibility. Two exceptions
(polish round 4, lead rulings R5 and R6): the end card's ink panel (10.4) and the HUD mark's soft ink backing (10.3).
Everything diegetic-feeling is a flat glyph. The screen stays empty: the mark in the
corner, three health segments, a crosshair.

### 10.1 Typography (system stacks only; nothing is downloaded)

| Voice | Stack | Style |
|---|---|---|
| Narrator, readable bodies, title | `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif` | narrator subtitles **italic**, no speaker label; readables roman, 1.5 line height |
| Station, HUD labels, menus, prompts, title-card numerals | `"Avenir Next", "Segoe UI", "Helvetica Neue", "DejaVu Sans", Arial, sans-serif` | **uppercase, weight 600, letter-spacing 0.18em** for station lines and labels (the Pellam voice); menus weight 500, 0.08em |
| The Reeve's one line | the serif stack, roman, with speaker label | |
| Numerals (reserve count) | the sans stack, tabular (`font-variant-numeric: tabular-nums`) | |

If a bundled face is ever added it must be SIL OFL and under 60 KB; none is planned.
In-world lettering uses Blender's built-in font (section 5.6), not these stacks.

### 10.2 Colours

| Token | Hex | Use |
|---|---|---|
| `ui_bone` | `#E9E2D0` | all text, crosshair, health |
| `ui_ink` | `#14110F` | outlines, subtitle backing (60 % default), menu scrim |
| `ui_brass` | `#C9A14A` | chambered rounds, selected menu item, title rule |
| `ui_brass_dim` | `#6E5A2E` | disabled items, tab rules, unlit pips (polish round 4: no longer the empty chamber's ring, which is bone `#E9E2D0` at 60 %) |
| `ui_aqua` | `#7CF2E2` | line round dot and pips, station speaker label, proving prompt |
| `ui_violet` | `#B24BFF` | **only** the seventh in state `violet` |
| `ui_pale` | `#F3E6CF` | damage arc, hit markers. **No red anywhere in the UI** |
| `ui_flame` | `#FF9433` | the boss pips only (heat that will hurt) |

### 10.3 HUD (positions and behaviour are GDD 12.2; this is the look)

- **Cylinder ring.** Six brass discs (10 px at 1080p) on a 64 px ring, 1 px ink outline;
  empty = a 1.5 px ring of bone `#E9E2D0` at 60 % (polish round 4; `ui_brass_dim` vanished on the gun's dark steel); the chamber under the hammer marked by a small
  notch tick at the top. A line round is an aqua disc. The whole ring turns 60° per
  shot. No backing plate; under the HUD mark two radial ink discs (polish round 4: alpha 0.5 out to 60 % of the
  radius, then fading to 0; one r 54 units at (0, 6) under the ring, notch and numeral, one 19 x 29 under the
  seventh; `BACKING_ALPHA` / `BACKING_CORE` in `src/ui/mark.ts`). The pause screen's enlarged mark has none.
- **The seventh.** A small cartridge drawn side-on, upright, 13.5 × 33 px at 1080p (as built, polish round 2: 1.5 ×
  the 9 × 22 first written here, which measured 8 × 19 px at 720p and was not read), bone outline,
  with its band as a filled bar, joined to the ring's centre by a 1 px hairline: together
  they are the mark. States: `sealed` (band whole); `pulse` (the outline breathes
  1 → 1.6 px every 2 s); `band_broken` (the band drawn in two offset halves); `spent`
  (outline only, 50 % opacity, no band); `violet` (band in `ui_violet`). Never restyled
  into the ring. The kept-round chamber dot is white with an aqua ring.
- **Health.** Three thin horizontal bars 46 × 5 px, 4 px apart, bone; lost = outline
  only; the regenerating bar shows a 1 px fill line.
- **Crosshair.** A 2 px dot and four 5 px ticks with a 1 px ink outline. Plumb glyph when
  the kept round is chambered: a dot under a short vertical stroke.
- **Markers.** Hit: four ticks. Weak point: ticks + a ring. Kill: ticks expand. Freed:
  **the ring alone, closing to a dot** (the gentlest marker). Deflected: a short chevron.
  All bone; shape, not colour, carries meaning.
- **Boss bar.** `ui_boss_name` in station capitals above 26 pips (4 × 10 px, 2 px gaps,
  wider gaps between the 10 / 10 / 6 groups). Lit pips `ui_flame`; in 3b they are bone.
- **Subtitles.** Narrator: serif italic, bone, centred, on a soft ink backing with 12 px
  padding, no box border. Station: capitals with an aqua label. Captions: 80 % size,
  square brackets, 70 % opacity.
- **Prompts and hints.** One line of capitals with the key in a 1 px bone-outlined
  square. Fade in 0.2 s.

### 10.4 Title cards, title screen, menus, end card

- **Movement card.** Centred. The roman numeral in the serif face at 9 % of screen
  height, a 1 px brass rule 120 px wide beneath it, the title in tracked capitals at
  2.4 %. Fade in 0.6 s, hold, fade out 0.8 s. No backing: it sits on the world, so each
  card's entry point must be composed against a quiet part of the frame.
- **Title screen.** The live doorway shot: black overhang, blazing valley, the Rule.
  `KEEP SEVEN` in the serif face, bone, tracked 0.3em, in the dark upper left of the rock
  frame; beneath it the mark as a 28 px glyph in brass and the subtitle in small
  capitals. The menu is a left-aligned column of five capitals in the dark lower left;
  the selected item is brass with a 12 px hairline before it. No logo box, no buttons.
- **Pause / options.** A 70 % ink scrim over the frozen frame; the same column; sliders
  are a 1 px bone line with a 9 px brass disc; toggles are a ring (off) or a filled disc
  (on): chambers. The cylinder widget enlarged ×3 with the seventh's state label.
- **Readables.** A bone card (`#E9E2D0` at 96 %) with ink serif text, 60 characters wide,
  slightly rotated (1°) for paper; cast plates instead use an enamel-coloured card
  (`#CFD6CC`) with ink capitals: the two hands again.
- **Death.** Fade to ink, `ui_death` in serif italic.
- **End card.** (Polish round 4, R5: the scrim over the frame is ink at **35 %**; the ledger stands on its own ink
  panel at 80 %, soft-edged, no border, in the **right third**: its left edge at 0.60 of the width or more at 4:3,
  16:9 and 21:9, the ledger `min(600 u, 31 vw)` wide, so the fire at the frame's centre and the lit windows left of it
  are seen with the card up.) Ink at 80 % over the still-drawn dusk (polish round 3, lead rulings R5 and R7; it was black: the fire,
  the town's lamps and the two threads stay behind the ledger, and no title card shows through it). `card_end` in tracked capitals; then the stats as a two-column
  ledger (label left in capitals, value right in serif), one row lighting at a time;
  **"Lamps lit in Plenty"** set apart with a small flame-coloured window glyph per lamp
  (up to 48, in rows of 12). No felled count exists.

---

## 11. Post-processing and grade

Tone map: **a shoulder-only curve with no toe** (producer ruling after the foundation's
third critic round; it replaces the Neutral tone map this section named before). Linear
values up to 0.8 are displayed exactly as authored; above 0.8 the brightest channel rolls
off toward 1.0 with the hue kept (`TONE_MAP_GLSL` in `src/core/tonemap.ts`, the curve the
core stub renderer installs; ARCHITECTURE 8.1). Filmic curves desaturate and hue-shift the
bright oranges the palette is built on, and Neutral's toe subtracts up to 0.04 linear from
every dark colour (`steel` 54,82,90 would display as 23,67,77; `gun_blue` 28,34,48 as
3,16,37): the dark end of the palette, where the gun and the interiors live, would be
darker and more saturated than authored. **Artists judge colour in `sandbox/viewer.html`
(and every `<id>_game.png`), which shows exactly this curve.** One merged pass on
Low: tone map + grade + vignette + grain. Display targets in sections 2 and 3 are the
acceptance values; verify by sampling screenshots.

### 11.1 Grade per mood (all tiers)

| Mood | Exposure | Tint (gain) | Lift (shadows) | Saturation | Contrast | Vignette |
|---|---|---|---|---|---|---|
| L0 glare | ×2.4 → ×1.0 over 20 s | `(1.04, 1.02, 0.98)` | `(0.03, 0.03, 0.03)` | 0.75 → 1.0 | 0.96 | 0.25 |
| L1 Long Light | ×1.0 | `(1.06, 1.00, 0.92)` | `(0.015, 0.020, 0.040)` (mauve) | 1.00 | 1.06 | 0.35 |
| L2 Tally | ×2.0 (one stop up) | `(1.05, 0.98, 0.90)` | `(0.030, 0.020, 0.025)` (warm brown) | 0.92 | 1.08 | 0.55 |
| L3 Gallery | ×1.6 | `(0.94, 1.00, 1.04)` | `(0.010, 0.020, 0.040)` | 0.95 | 1.08 | 0.50 |
| L4 Hall | ×1.6 | `(0.94, 1.00, 1.04)` | `(0.010, 0.020, 0.040)` | 0.95 | 1.10 | 0.50 |
| L5 Bore, unproven | ×1.5 | `(1.02, 0.96, 1.06)` | `(0.025, 0.010, 0.045)` | 1.00 | 1.08 | 0.55 |
| L5 Bore, proven | ×1.5 | `(0.94, 1.02, 1.02)` | `(0.010, 0.025, 0.035)` | 0.95 | 1.06 | 0.45 |
| L6 Blue hour | ×1.8 | `(0.98, 0.98, 1.06)` | `(0.015, 0.018, 0.040)` | 0.90 | 1.04 | 0.50 |

Cross-fade between moods over 1.5 s at zone thresholds. Grain 0.035 on all tiers (it is
also the dither that hides sky and fog banding); seeded by the simulation frame.

### 11.2 Tiers

| | Low | High |
|---|---|---|
| Passes | one merged pass: the shoulder tone map, grade, vignette, grain | + half-resolution bloom (5 levels, additive, threshold 1.0, intensity 0.6), MSAA ×4 |
| Bloom substitute | every emissive has an additive halo sprite (`soft_dot`) sized 2.5× the emitter | halo sprites at 50 % + real bloom |
| Shadows | baked + blob shadows | + one 1024² sun shadow map for dynamic casters, tight frustum, exterior zones only |
| Heat shimmer, sand sparkle, fresnel rim on enamel | off | on |
| Sun blades / shafts | 2 cards per opening, no motes beyond 40 | 3 cards, full motes |
| Cloud shadows, directional fog, height fog, sky dither | on | on |
| Particles | Low counts in 9.2 | High counts |
| Lightmaps | as authored (2048 / 1024) | same |
| Resolution | adaptive, max pixel ratio 1.0, min 0.5 | adaptive, max 1.5 |
| Anti-aliasing | none (the 2-pixel rule and constant-width lines are the mitigation) | MSAA ×4 |

**The Low tier must look finished, not reduced.** Everything that makes the look (bake,
fog, sky, palette, silhouette, grade) is identical on both tiers. A critic comparing Low
and High stills should have to look for the difference.

---

## 12. Review checklist (critics judge art against this)

Evidence required for every item: a Blender preview sheet, an in-engine screenshot at
960 × 540 on Low, or a measured number. Mark each PASS / FAIL / N-A with the file looked
at.

**Colour in a viewer frame is the colour in the file.** The viewer and every
`<id>_game.png` show linear values up to 0.8 exactly as authored (no toe); only above 0.8
does a shoulder roll off, and the game's renderer uses the same curve (section 11). A dark
palette colour in a viewer frame is tested to be within 1 / 255 of its sRGB value (`steel`,
`steel_dark`, `gun_blue`, `cable`, `walnut`). The viewer is otherwise unlit (vertex colour ×
baked light × the shared texture; `&mood=` adds one flat tint): lit display targets and
highlights are judged on the Cycles sheet until `code-render` lands, and "no pixel under
`#0B0D12`" is the grade's lift, which the viewer does not have.

**A. Look**

1. Squint test: the hero view of each zone, blurred to 32 × 18, shows three value
   clusters ≥ 18 L* apart in the ratio of section 2.3.
2. Warm light, cool shadow: sampled shadow pixels on sand are within ΔE 12 of `#5C4E59`
   (L1); no neutral-grey or black shadow anywhere (no pixel under `#0B0D12` except UI).
3. Fog colour equals horizon colour in every exterior shot; the far wall of the gallery
   and lift hall dissolves.
4. Only three emissive hues exist. List every glowing thing in the shot and its hue.
5. Violet covers under 2 % of the frame before the bore catwalk (count pixels within
   ΔE 25 of `#B24BFF`), and every violet thing is on the list in 2.4.
6. Large-surface saturation: no surface over 5 % of the frame exceeds OKLCH chroma 0.11.
7. The gun is the darkest object in frame with the sharpest highlight, in a daylight shot
   and an underground shot.
8. Sampled display colours for lit sand, lit rock, lit board and shaded enamel are within
   ΔE 10 of the targets in 3.2.

**B. Modelling**

9. No primitive read: each asset's silhouette from two angles is not a plain box,
   cylinder or sphere; it is built from at least three overlapping parts; every hard edge
   is bevelled per 5.2.
10. Frontier assets are jittered, lean 2–4° or sag, and no two repeated parts are equal.
    Pellam assets are exact, on the 1.2 m module, with radii of 0.15 / 0.3 / 0.6 m only.
11. Every asset has the vertex-colour set: AO, height ramp, dust skirt (outdoors),
    bleach, streaks under fasteners. A flat-coloured asset is a fail.
12. Nothing is thinner than two pixels at its normal viewing distance at 720p × 70 %
    scale (check ropes, rails, pylon arms, Transit legs, cables, ladder rungs).
13. Each zone shows the seam: at least three objects where Frontier and Old-World meet,
    and every interactable sits on one.
14. Decay reads in silhouette (lean, sag, missing module, drift), not in surface noise.
    No grunge or noisy texture exists.
15. Scale reads: Pellam doors are 3 m or more, the ring is 9 m, with a human-scale object
    beside each.

**C. Brand and signage**

16. The mark is constructed exactly (5.6): six open discs at 30° + 60°n, a plumb stroke,
    a solid seventh. It matches on plates, the diagram, the cradle, the gun stamp and
    the HUD.
17. Every town-painted mark is struck through with the same neat 22° graphite line.
18. Every Pellam machine carries the trio: livery band at 1.2 m, cast plate, pictogram +
    asset number. Station `4` plates are at the drum door, the bay, the ring and the bore
    door, legible at 720p × 70 %.
18b. Everything that fills an opening fits it: for each row of the 7.1 openings table, the
    asset's bounding box matches the layout marker's size within 0.05 m, and for
    `ia_shutter` the `latch` node lies within 0.05 m of its `ia_latch_*` marker. From the
    brass mark's `eye` point the three knots nest inside `prop_sighting_loop`.
19. No in-world text that is not in `design/story.json`. No 19, no 99, no decorative
    sixes or sevens. Nothing from the homage blocklist.

**D. Characters and the gun**

20. Each enemy is identifiable from a black silhouette at 30 m equivalent (48 px tall),
    and no two silhouettes can be confused.
21. Bider: pale hood on dark body; crown knot visible from the front in every frame of
    `run`, `lunge_windup` and `circle_strafe`; no face; no scarecrow features.
22. Every weak point has a dark bezel, a white core ≥ 40 % of its diameter, a collar
    shape (clustered or hexagonal) and reads in greyscale.
23. Telegraphs read with colour removed: the Transit's star and dashed thread, the
    ticked ring, the raised ram, the open vent lid.
24. Clip list, names, loop flags and durations match the GDD exactly; loops do not pop;
    `sit_down` ends hands-flat and reads as relief; `die_back` shows no face.
25. Revolver: octagon-to-round barrel, six flutes, loading gate with the stamp beneath,
    walnut grip with one brass pin, grey muzzle, no ornament. The kept round is visible
    in its cuff loop during every reload. Hammer and cylinder motion in `fire` land on
    frames 4–9.
26. View-model covers ≤ 18 % of the frame, never crosses the centre line, never clips
    into walls, and is lit by its zone (warm in sun, petrol underground).

**E. Lighting and atmosphere**

27. Each mood matches its table in section 3: sun vector, sky stops, fog colour and
    density (check 20 % at 40 m, 50 % at 120 m outdoors), practicals.
28. Baked shadows are large soft shapes with no stair-stepping visible at 720p; no
    light leaks; no static prop without a contact shadow.
29. The Tally House fight is readable with Reduce Flashes on (hatch up-light, lantern,
    emissive slits and knots).
30. The bore chamber's bake is six-fold symmetric: the Windlass looks correctly lit at
    all six indexes.
31. The opening and closing shots share a composition; the Rule visibly leans further
    at the end, and the plumb thread is in the same frame.

**F. VFX and UI**

32. Silence after a shot is a bug: every surface type gives its own impact.
33. Additive overdraw stays within the cap in the worst boss frame; pools never grow.
34. The seventh: line, ring, violet dying bottom-up, then four seconds with no new
    particles.
35. HUD: the seventh is present from the first frame, separate from the ring, in all
    five states; no red anywhere; markers differ by shape.
36. Subtitles: narrator serif italic without a label, station tracked capitals with one;
    text legible over the brightest and darkest frames.

**G. Budgets (measured, not claimed)**

37. Per-asset triangle counts at or under section 7; material lists as stated.
38. Draw calls and triangles within the `CLAUDE.md` caps and ARCHITECTURE's per-view
    numbers (neighbour zones included) in each fight's worst tick and down each zone's
    longest sightline. GDD 9.9 is a sizing estimate, not the limit.
39. Texture memory per resident set within section 4.8; no asset outside the shared
    library carries its own texture except `weapon_revolver`.
40. Low and High stills of the same view are hard to tell apart at a glance.

---

## 13. Open points for other owners

- **Compass.** This bible assumes north = −Z. `design/layout.json` must state it.
- **Blade geometry: resolved (revision 2).** The blockout computed the blades from the
  true sun; this file now copies its numbers (3.3, 7.3 `env_tally_house`, 7.4
  `ia_shutter`, `ia_hatch`, `prop_day_cell`, `prop_share_cloth`): windows 1.2 × 0.9 m at
  4.05–4.95 m, latches at 3.5 m, tally wall on the south wall, hearth in the south-east
  corner, day-cell on the tie-beam, hatch 4 × 2 m, a 5 m flat-roofed adobe hall.
- **Street to yard: resolved.** Two openings with a 5 m gate court between them
  (`door_yard_gate` 4.0 × 3.0 m, `ia_yard_door` 2.6 × 2.8 m).
- **Bore: resolved.** Ribs at 30° + 60°k, bays and marks at 0° + 60°k, locker at 168°.
- **For the manifest owner: resolved.** `tools/gen_assets.mjs` reads every opening and cage
  size from the layout's markers, so `design/assets.json` placeholder sizes follow the
  blockout; `ia_baffle` here uses the manifest's lamp set `door_lamps`.
- **Close of pre-production (integrator pass).** Where the layout or the architecture won,
  this file now says so: the static Biders' breath weight is UV1.x with extra `breath: 1`
  (7.6); the antechamber diagram is 2.4 m tall (7.3); `ia_hatch`'s latch block and cowl are
  zone geometry at the hatch's north-west corner, facing north (7.4); the dragged fifth
  table leaf is zone geometry (7.4); multi-part animated props are rigid-skinned and the
  manifest lists their bones (7.4).
- **Requests to rendering:** R8 upload for greyscale textures; unmipped lightmaps; the
  `detail × 2` world shader; matcap + fresnel on `m_gun`; a wind attribute path;
  `wrong_fade` participation from the `violet_band` palette cell; two-layer `lm_bore`;
  the hatch up-light layer in `lm_tally`.
- **Windlass mouths** are swing lids, not multi-blade irises (one rigid node each). The
  GDD's "iris" sound stays.
- **Not verified:** how the palette reads on a real monitor through the tone map and grade;
  the display targets are intentions until a screenshot is sampled.

## Amendments, polish round 2 (closer, 2026-10-04): numbers changed in the build

Where a section above still gives the older number, this table is the built value. Each was changed by a fixer against
a critic's finding and accepted by the round's closer; evidence is named in `docs/requests/<piece>.md`.

| Section | Was | Built |
|---|---|---|
| 3, 11.1 `L0` (under the overhang) | exposure ×2.4, fog ×1.6 toward `#E6E2D0`, lift 0.03, saturation 0.75, contrast 0.96, vignette 0.25 | exposure ×1.3, the Long Light's fog and lift, saturation 0.9, contrast 1.10, vignette 0.45, no height fog under the roof |
| 3.2 gully height-fog extra | 1.5 | 1.0 |
| 3, `L5` dynamic key | violet ×0.5 from below | aqua ×0.35 from above, ambient `#403A66` × 0.42 |
| 3, `L5a` (antechamber) grade | the chamber's tint (1.02, 0.96, 1.06) and lift (0.025, 0.010, 0.045) | warm: tint (1.04, 0.99, 0.95), lift (0.030, 0.018, 0.020); dynamic ember key 0.16 |
| 3, `L6` (coda) | density 0.012, height extra 0.8; far cards fogged like anything else | density 0.0065, height extra 0.25; the coda's far cards take at most 40 % fog, lit town windows 30 % |
| 3 light layers | weight 1 = full | `lm_tally_hatch`: aqua mixed half with `#E6E2D0`, weight 1 = 0.4, reach 4.2 m; `lm_bore_glow`: weight 1 = 0.65, walls and floor take 35 % of it, tint a quarter toward `#C8BCF0` |
| the ring at the seventh | radius 40 t | radius 40 t^1.5 (same 1.6 s) |
| 7.7 pawls | `(∓1.6, 6.0, 2.6)`, r 0.25 | `(∓1.6, 6.0, 3.95)`, r 0.30, on dog plates in front of the guard; the pawl cores (lamps 12, 13) are lit only in a phase-2 haul with the guard set |
| 8.2 gloves, 8.3 idle placement, 10.3 the seventh | | edited in place above |

---

## Amendments, polish round 3 (closer, 2026-10-05): the look as built under lead rulings R4 to R7

Where a section above still gives an older number, this table is the built value (`src/render/moods.ts`,
`materials.ts`, `vfx/vfx.ts`, the zone scripts). Each was changed by a fixer or a look-dev director against a critic's
finding; evidence is named in `docs/requests/code-render.md` 13 to 17, `art-env-*.md`, `lookdev-*.md`.

### Grade per mood (replaces the table of 11.1)

| Mood | Exposure | Tint | Lift | Saturation | Contrast | Vignette |
|---|---|---|---|---|---|---|
| L0 overhang | ×1.3 → ×1.0 | `(1.05, 1.00, 0.94)` | `(0.008, 0.010, 0.020)` (half of L1's) | 0.9 → 1.0 | 1.20 | 0.45 |
| L1 Long Light | ×1.0 | `(1.06, 1.00, 0.92)` | `(0.015, 0.020, 0.040)` | 1.00 | 1.06 | 0.35 |
| L2 Tally | ×2.5 | `(1.05, 0.98, 0.90)` | `(0.012, 0.007, 0.009)` | 0.92 | 1.16 | 0.55 |
| L3 Gallery | ×1.75 | `(0.96, 1.00, 1.04)` | `(0.004, 0.008, 0.016)` | 0.88 | 1.15 | 0.50 |
| L4 Hall | ×1.9 | `(1.00, 1.00, 1.00)` | `(0.004, 0.007, 0.014)` | 0.80 | 1.16 | 0.50 |
| L5 Bore, unproven | ×2.2 | `(1.00, 0.98, 1.04)` | `(0.006, 0.005, 0.014)` | 1.00 | 1.18 | 0.50 |
| L5a antechamber | ×1.3 | `(1.03, 1.00, 0.97)` | `(0.010, 0.006, 0.007)` | 0.78 | 1.18 | 0.55 |
| L5c catwalk | ×1.7 | `(1.00, 0.98, 1.04)` | `(0.008, 0.005, 0.016)` | 1.00 | 1.16 | 0.55 |
| L5p Bore, proven | ×1.8 | `(0.96, 1.02, 1.02)` | `(0.004, 0.010, 0.014)` | 0.90 | 1.15 | 0.45 |
| L6 Blue hour | ×1.12 | `(0.98, 0.98, 1.06)` | `(0.005, 0.007, 0.018)` | 0.95 | 1.22 | 0.50 |

The lift of every underground mood is about a third of the first table's: blacks sit near L* 6 to 12, not 15 to 18.

### Fog, sky and dynamic light

| Section | Was | Built |
|---|---|---|
| 3.1 `L0` | the rock frame L* 24 to 33 | lift halved, contrast 1.20: roof and side walls at L* 14 to 22; the overhang's bake has a warm bounce and one sun shaft; ledge value `LEDGE_K` 0.31, `ROCK_DARK` 0.34 (3.7) |
| 3.3 `L2` fog | | `#1C1318`, density 0.020 |
| 3.4 `L3` fog; 3.5 `L4` fog | | `#0A1424` → `#14343E`, density 0.023; `#0A1322` → `#122A36`, density 0.026. Lift hall and gallery lamps are aqua-white with near-neutral cores; sodium practicals at the Tamper's arch and at each line locker; the bore catwalk is open at eye level on its south side |
| 3.6 `L5` | ambient `#403A66` × 0.42, fog `#2A1B4A`, no fill | ambient `#41507A` × 0.55, key `#7CF2E2` × 0.35 from above, a cool fill `#9AD2D8` × 1.0 on upright faces and silhouettes of dynamic things (mood field `M_RIM`; `L5c` × 0.4, `L5p` `#BFEEE6` × 0.5), fog `#15122C`. `lm_bore_glow` on plain walls and floors: the violet held 70 % of the way to `#58C8C0`, share 0.6; the pit and the undersides keep the pure layer |
| 3.6 `L5c`, `L5p` | | ambient `#4A4A78` × 0.40, key `#9A8ED0` × 0.5, fog `#181230`; ambient `#2A6A70` × 0.50, key `#7CF2E2` × 0.6, fog `#0C262C` |
| 3.6 antechamber and chamber bake | | antechamber fill a cool grey (0.70, 0.82, 1.0) × 0.085; embers reach 6.5 m and read 1.3 on the floor at 1.5 m, their bounce 0.24 on the door wall; a wall scallop under each bay lamp of the chamber (0.6 at 2.4 m, reach 7.5 m) |
| 3.7 `L6` | fog `#4D5578` / `#B8866F`, density 0.0065, extra 0.25; zenith `#1B2440`, mid `#5D6690`, glow `#D9967A`, mid band at 6°; far cards 40 % fog | fog `#2C3454` / `#B0705A`, density 0.0032, extra 0.15; zenith `#0E1630`, mid `#443C72` at sin 0.4226 (25°), glow `#FFB888`; far-card fog cap 6 % to 160 m rising to 40 % at 800 m; the town card stands 117 to 142 m out (no ground disc) and is drawn 1.7 ×; far window glow 24 px at 38 %, windows × 1.6 emissive |
| 3 dynamic objects, 8.1 material | the view-model lit by the zone's ambient and key; flat ambient + matcap on the gun | **the view-model has its own rig in every mood** (`M_VM_AMB`, `M_VM_KEY`, `M_VM_RIM`): the mood's hues at display levels (ambient never under 0.11, key never under 0.55, rim 0.60, divided by the mood's exposure; per-mood factor `vmK`: L2 0.88, L3 0.95, L4 1.25, L5 1.35, L5a 1.4, L5p 1.3, L6 1.35), key and rim fixed in VIEW space (key up-left, rim straight up), hands at 0.75. The gun mirrors a small studio by the reflected eye ray (dark floor, bright horizon in the key's colour, the ambient as sky, the key as a hot spot), tinted by the albedo; the matcap's share is × 0.35. It reads as lit steel-grey with a blue cast, lighter than 8.1's blue-black |
| 8.2 cuff | black | dark slate with lengthwise folds |
| 9 lamp halos | 1.5 × the lamp, at most 1.5 m | 0.8 ×, at most 0.75 m (practicals 0.7 m), a tight falloff with a hot heart, gone between 16 and 38 m |
| 9.2 flashes | the kept round's flash was the powder cell tinted aqua | the cell's brightness only, tinted aqua-white (also the line round's); it lights the room aqua for a frame |
| 9.3 the seventh | | the standing line is born as a column (a 2.4 s flare); the ring is an aqua-white front 1 m wide at 58 %; the kept round's pulse is aqua-white × 1.0 over 14 m for 0.16 s |
| 9.4 the coda; the Transit's thread | fire a 13 px flame, 40 px halo; thread 2 px dashed | a 46 px animated flame, 120 px halo, a warm pool on the ground, four puffs of smoke; thread solid, 3 → 5 px with a halo |
| 10.3 HUD | bars 46 × 5; mark floor 0.864; scrim 70 % | bars 46 × 7 (min 6 px); mark floor 1.08 (95 × 138 px at 720p); the enlarged pause mark keeps 3 × max(u, 0.864) (2.4 × the HUD mark at 720p); pause scrim 78 % |
| 11.2 High tier | bloom threshold 1.0, intensity 0.6; sun shadow opacity 0.42 | threshold 1.15 of display white, intensity 0.9, radius 0.8; emissive things × 2.0 on High; sun shadow opacity 0.55 and the pass stops indoors. No shadow of the view-model or of the player |
| 7.4 `prop_rim_stone`, `rd_note`, `card_dowser` | seven shallow seats, 0.9 × 0.12 × 0.5, 80 triangles; notes ruled in `m_mask`; pale card | six brass cases 2.6 × life size built in at seats 1 to 6 (asset 0.225 m tall, 240-triangle budget), seat 7 a dark cup for the runtime round at 2.6 ×; notes are handwriting strokes in `m_prop` only; card `#15121A` |

## Amendments, polish round 4 (closer, 2026-10-05): the look as built under lead rulings R4 to R9

Sections 6.5, 10, 10.2, 10.3 and 10.4 were edited in place. The rest is here; where a section above says otherwise,
this holds. Evidence: `shots/r4-team-gun/`, `shots/r4-team-exterior-look/`, `shots/r4-team-underground-look/`,
`shots/r4-team-ui/`, `shots/round-4/`.

### 8.1 The Assize six

- **Hump-backed frame, low spur.** The frame behind the cylinder is a high rounded hump (the ears either side of the
  hammer slot), not a slope falling away; frame chamfer 2.4 mm (a rounded top strap); hammer slot 6.6 mm. The hammer
  has a slim neck and a low chequered spur: at full cock its crest stands 4 mm and its spur 2 to 3 mm above the steel
  (it was a 15 mm wedge 20 mm above the frame: the upper jaw of an open wrench in every idle frame). Cock angle 48
  degrees, the pivot and every bone unchanged. 3 169 of 3 200 triangles.
- **Material.** The `GUN` branch's reflected studio has floors of 0.58 (ambient) and 0.20 (key) (0.45 / 0.17): seen
  from its side the gun shows more faces that mirror the floor.

### 8.2 Hands and arms

The gun hand's thumb breaks at its knuckle and its end joint wraps down round the top of the grip; it may straighten
up to 26 degrees to reach a far target. A crease across each thumb joint, slimmer shafts. Arms 2 792 of 2 800
triangles (bare wrist 8 sides, cuff button 6, tie cord 9 segments pay for the thumb).

### 8.3 View-model camera: idle placement

`VIEW_PLACE` = x 0.004, y 0.013, z 0.023, pitch -7, yaw 8.5, roll -14 degrees (round 3: -0.008, 0.012, 0.065, -5, 5,
-4). The gun is turned 3.5 degrees further, rolled 10 degrees the other way and stands 4 cm farther from the eye: its
left side (cylinder flutes, trigger guard, frame screw) shows instead of the top strap and the back. Idle on Low, six
zones: gun + hand 9.6 to 10.6 % of a 16:9 frame (High 10.1 to 12.1), hand 1.4 to 1.9 %, left edge at 0.568 of the
width, the muzzle 101 px right and 69 px below the crosshair at 720p. The gun alone stays 8.3 % or more
(`tests/player/place.test.mjs`). The muzzle flash is asked for 1.6 x farther from the eye than the muzzle.

### 8.4 Animation feel: `load_kept` (supersedes "the forearm comes up, cuff to the eye ... hand-off at 0.9 s")

1.8 s, 54 frames, on the ordinary reload's framing. 0-10 the gun turns its gate to the eye and the left hand comes up
with the kept round already in its fingers, band whole; 9-16 the round is shown in profile beside the cylinder (about
75 px long at 720p); 15-18 the left thumb cracks the band (frame 17, 0.57 s) and the halves fall; 21-26 the cylinder
comes round; 27-38 the round is turned over and goes in at the gate in view (seated at 1.27 s); 38-47 hand away,
cylinder back, gate shut; 47-54 back to the firing pose. Nothing holds still for more than 7 frames. The cuff with its
loop stays under the frame for the whole clip.

### The coda (far rim, the last image)

- The eased last view stands 0.15 of the angle off the fire toward the town: the fire 5.3 degrees right of centre,
  clear of the end card's panel.
- `rim_town_card` (349 of 600 triangles): the town drawn 12.5 m further east so it is whole in the left half of the
  last frame; pitched roofs seen side-on, gable verges, porches, a dark apron under the near row; 48 distinct panes
  and 16 window pools (a second face of the same lamp, lit with its window); two smoke ribbons; **one leaning dead
  line pylon** as a card 42 m out from the ledge, in the foreground.
- `env_backdrop_dusk`: the afterglow rakes the mesa's foot (the fins' north-west flanks a dull rose `#6A4450`, their
  lee sides to the land's black). `env_far_rim`: the up-facing faces of the edge blocks, parapet and boulders hold a
  warm sheen; the last 0.75 m of the ledge's lip is swept bare and lit.
- A far lamp pane takes 6 % of the ember haze unlit (as its wall) and 30 % lit.
- L6 `vmK` is 1.25 (the gun's mean about L* 28.5 over a ledge of 13; under 1.15 more than 4 % of it falls under L* 12).

### Front Street and the yard

The Tally House front: a lime dado with the town's teal line, teal round the door, a tin door hood, a peg rail with
dried peppers, a shovel and a coil, the roof ladder, the brushed well mark with a chalked tally and two family marks,
a washing line with six cloths to the east wall. East wall: a tin pentice over the alley door, five put-log poles on
the sunlit south run. No collider, footprint or nav change. `env_plenty_street` 47 104 of 54 000 triangles.

### Underground

- `env_the_bore`: baked without adaptive sampling (sector 1024 / 512 samples); the islands of the ribs and the kerb
  smoothed inside their own outline. Arrival bay lamp 0.42 (reach 5.5 m), its closed walls and ceiling keep 0.35 of
  their baked light; catwalk work lamps 0.20.
- `env_lift_hall` cage well: work lamp 0.42, wash 0.30 (reach 5.5 m); the well's lining falls to 0.10 of its baked
  light 2.4 m from the lever. `env_lift_shaft`: wash x0.80, 6 % on the far wall, gone 2 m round the shaft.

### 11.1 Grade per mood: three High-only columns (bloom threshold / knee as display levels, intensity)

| Mood | Threshold | Knee | Intensity |
|---|---|---|---|
| L0 | 0.42 | 0.35 | 1.0 |
| L1 | 0.55 | 0.35 | 0.9 |
| L3, L4 | 0.55 | 0.40 | 1.0 |
| L6 | 0.25 | 0.40 | 1.0 |
| L2, L5, L5a, L5c, L5p | 1.15 | the pass's own (0.15 of scene light) | 0.9 |

High also carries a contact-shade term at the head of its merged pass (radius 0.55 m, 16 taps, floor 0.45, to 45 m;
no blur, a per-pixel rotation). The view-model neither takes nor gives it. Low is untouched by both.

### The muzzle pulse

Shaded by N.L per pixel with a floor of 0.12 (`PULSE_WRAP`), paler toward its centre (`PULSE_CORE` 0.7), and capped
at 0.6 of display white (`PULSE_CAP`) on every material that takes it, static world surfaces included.
