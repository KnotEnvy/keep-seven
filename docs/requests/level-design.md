# Requests from level design (blockout)

**Status: all five RESOLVED.** The design owner accepted them as blocked out (GDD 23.1) and
the sources were rewritten to the layout; the integrator pass re-checked each one.

| # | Request | Status | Where it lives now |
|---|---|---|---|
| 1 | `daylight` landing spots | RESOLVED: true sun kept, targets moved as blocked out. No story line says "east wall" (checked: no match in `design/story.json`) | GDD 9.4, 13.2; ART_BIBLE 3.3, 7.3, 7.4 |
| 2 | Rib bearings versus door, locker, cartridge points | RESOLVED: bays at 0° + 60°k, ribs at 30° + 60°k, locker at 168° | GDD 6.4, 8; ART_BIBLE 7.3 |
| 3 | Yard gate and yard door | RESOLVED: two openings, a 5 m gate court between | GDD 9.3 |
| 4 | The loft "ladder" | RESOLVED: ramp collider `st_loft_ladder` enabled by the shot | GDD 9.3 |
| 5 | Lift rides are teleports | RESOLVED: each ride's two cages match (validator: 5082 / 5082 and 2640 / 2640 lattice points); the proving-lift ride now has `seconds: 12` in the layout | GDD 9.6; `nav.portals` |

The original requests follow, unchanged.

## 1. GDD 9.4 / 13.2: `daylight` landing spots cannot be on the east wall (needs GDD + story owner sign-off)

The GDD puts the tally wall, the hearth and the day-cell on the Tally House's east wall and
has the three west-wall shutters throw blades onto them. With the binding sun (azimuth 315,
elevation 14; ART_BIBLE 3.3 requires blades to follow it), a blade drops 0.353 m and drifts
1 m south per metre it travels east. From a window centred at y 4.5 in a 5 m wall it reaches
the floor 12.8 m in, 12.8 m south of the window. So it cannot hit the east wall (14 m away)
above floor level, and nothing at the hall's north end can be lit from the west wall.

The blockout keeps the true sun and moves the targets (design/layout.json, tally_house):

- tally wall: south wall, east of the door (x -88..-82), blade patch at (-87, 1.33, -15)
- hearth, head chair, cold camp two: east wall, SOUTH end (z -20..-16.6), not the middle
- day-cell: a disc hung from the tie-beam above the hatch at (-92.5, 3.27, -32.8), not on the east wall
- hatch: 4 x 2 m opening at x -93..-89, z -34..-32 (north-west of the table head)

Please confirm, or choose another fix (a sun due west for this hall, or a 7.5 m hall).
Text check: `nar_tally_wall`, `nar_tally_chair`, `nar_tally_hearth`, `nar_tally_cloth` and
`hint_daylight_*` should not say "east wall".

## 2. GDD 8: rib bearings versus door, locker and cartridge points

Ribs at 0/60/..., locker "opposite the door" at 180 and boxes at 90/270 cannot all hold with
the door in a bay. Blockout: door, lift gate and proving marks on bay centres (bearings
0, 60, ...), ribs at 30, 90, ...; cartridge points at 90/270 are therefore behind ribs.

## 3. GDD 9.3: "yard gate" and "yard door" are two openings

Wave D bursts the yard gate; G2 is the knotted yard door. The blockout puts a 5 m gate
court between them (x -79..-74).

## 4. GDD 9.3 secret: the loft "ladder"

Player-climbed ladders are out of scope (GDD 20), so the fallen ladder is a 37 degree ramp
collider (`st_loft_ladder`, dynamic, enabled by `sec_loft_bell_rope`).

## 5. Lift rides are teleports

The lift hall cage (24, -15, -14) and the bore arrival cage (2, -36, 83) are not vertically
aligned; `nav.portals` records both rides. The proving lift IS aligned with the rim cage.

## Code integrator, polish round 2 (2026-10-04): what was decided on the code-side rows

| Row | Decision |
|---|---|
| 1 to 5 | no layout change by the code integrator. For a level owner: the tables of `docs/requests/code-world.md` 2.1 to 2.5 and 6.1.11 still wait for layout fields |

