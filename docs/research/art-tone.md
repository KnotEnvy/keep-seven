# Art & tone research brief

Audience: the art director writing `docs/ART_BIBLE.md`, and the GDD / story authors.
Scope: tone, format, visual references, palettes, material and shape vocabulary, and the
cheap rendering tricks that buy "spectacular" inside the budgets in `CLAUDE.md`.

Status of the claims in here:

- **Measured** = computed or rendered on this machine. Palette numbers come from
  `scratch/art-tone/palettes.cjs`; the mock-ups are in `shots/research/art-tone-palettes.png`
  (opened and checked). Blender facts were probed in 4.5.14 with `scratch/art-tone/probe.py`.
- **Sourced** = from the web references listed in section 8.
- Everything else is opinion from general knowledge of the works named. It is meant to be
  argued with, but it is deliberately specific so there is something to argue about.

Nothing here is a final name or final text. All names offered are suggestions for the GDD.

---

## 0. The brief in one paragraph

Make a **late-afternoon desert that is winding down**, painted in three values and two
temperatures, with a warm hand-made frontier sitting on top of a cool, perfect, over-scaled
machine world that still hums. Light does the work: one low sun, long mauve shadows, peach
haze that swallows the far distance, and a hairline on the horizon that is the wrong colour.
Geometry is chunky and readable, colour comes from vertex gradients and baked light rather
than textures, and three emissive hues carry meaning: **flame = people, aqua = the Old-World
still working, violet = wrong**. Indoors the frame inverts to dark with hot shafts; underground
it goes cold, repetitive and vast. The gun is the darkest, sharpest, most neutral object on screen.

---

## 1. Tone and format

### 1.1 The braid: four genres, each with a job

The series is distinctive because it never picks one genre. Its stated sources are a Browning
poem, Leone's westerns, Tolkien-scale quest fantasy and Arthurian legend, overlaid with
science fiction and horror (sourced: Wikipedia, series page). Each strand should be given
one job in our stage so the blend is deliberate rather than a costume pile.

| Strand | What it contributes | Where it shows in our stage |
|---|---|---|
| **Western** | The surface. Space, heat, silence, a lone figure, a gun with weight, courtesy before violence. | Exterior, settlement, props, the weapon, the staging of fights (stillness, then one loud decision). |
| **Far-future ruin** | The substrate. Machines older than memory that still do their job for nobody. Not a bang apocalypse: a long wearing-out. | Everything underground, anything that hums, the horizon goal, signage, puzzles. |
| **Arthurian quest** | The spine. A fallen order, an inherited duty, a wounded land, an oath that costs the oath-taker. | The player character's code and manner, heraldic touches on the gun, the narrator's formality. |
| **Quiet horror** | The pressure. Wrongness noticed slowly; things that used to be people or purposes. Dread, not gore. | One or two details per area that do not add up; the "wrong" colour; the boss. |

The emotional key is **melancholy and patience**, not grimness. The world is not hostile so
much as tired: distances have stretched, directions drift, clocks disagree. That entropy is
the single most useful idea to steal, because it is a *feeling about the setting* rather
than a plot point, and it can be shown for free (see 4.5 and 5.2).

### 1.2 Structural devices to evoke

1. **Pursuit.** The protagonist is behind someone and has been for a long time. The pursued
   is never rushed, is always one step ahead, and leaves things behind on purpose. For a
   demo this is ideal: the player reads the level as a trail. Use *cold camps* (a dead fire,
   an arranged object, a message that anticipates the player) as the breadcrumb and the
   checkpoint art. The stage should end with the gap narrowed, not closed.
2. **Frontier surface, machine underneath.** A settlement's well turns out to be a service
   shaft. A wind-pump is bolted to something that was never meant for wind. People use the
   Old-World without understanding it and have built custom and superstition around it.
3. **Thresholds.** Crossing a doorway changes the rules: light, sound, temperature of the
   image. In the books this goes as far as doors between worlds. For us the cheap and
   original version is **threshold as grade change**: each doorway between exterior,
   interior and underground swaps fog colour, exposure and ambience over about half a second.
   The player should feel every door.
4. **A goal on the horizon.** One landmark visible from almost everywhere outside, far
   beyond the stage, that the whole journey bends toward. It gives the pursuit a direction
   and gives level design a compass. (See 1.6 for why ours must not be a dark tower.)
5. **The palaver.** Conflict is preceded, and sometimes replaced, by formal talk. The
   climactic meeting in the first book is a conversation, not a duel. For a shooter: give
   the boss encounter a spoken prelude with ritual courtesy, and let the pursued speak
   *to* the player through what is left behind. Short, dry, unhurried.
6. **Sparse, dry narration.** A storyteller's voice in the past tense, with authority and
   very few adjectives. It notices practical things (water, distance, ammunition) and
   states terrible things flatly.
7. **Stories inside the story.** The series constantly stops to tell an older tale. The
   demo-sized version: one found account (a ledger, a recorded voice on a dying machine)
   that reframes what the player just walked through.
8. **The wheel.** The saga's shape is circular. Do not copy the device, but an ending image
   that rhymes with the opening image (same framing, later light, one thing changed) gives
   a demo a finished shape for free.

**Format.** The books are built from titled parts with numbered short sections, an opening
"what has gone before" summary, and epigraphs. That is directly usable as presentation:
a title card per area, a section numeral on each checkpoint, and narration delivered in
two-to-three-line cards rather than paragraphs. Recommend 4 to 5 titled movements for the
stage: approach, settlement, interior, descent, meeting.

### 1.3 Narration rules (with original sample lines)

- Past tense, third person or a close second voice. Never jokes, sometimes dry.
- Sentences of 4 to 14 words. One image per sentence. Concrete nouns.
- Understate. The worse the thing, the plainer the sentence.
- Practical first: water, shade, rounds left, how old the tracks are.
- One formal courtesy phrase and one oath, both invented for this project, used rarely.
- Never explain the Old-World. Characters name machines by what they do for them.

Register examples (original, for tone only; final text belongs in `design/story.json`):

> The fire had been dead two days. He had not hurried, then.
>
> Six rounds. The well still worked, which was worse.
>
> Somebody had swept the porch. Nobody lived there.
>
> The machine asked him a question in a language of numbers. He shot the part that glowed.

### 1.4 Go to the roots, not the surface

The series is itself a remix of public-domain or generic material. Drawing on the same roots
gets the flavour without touching the author's inventions:

- Browning's 1855 poem about a knight crossing a blasted plain to a tower: the mood of
  doubt, exhaustion and arrival. (Use the mood; avoid the knight's name, see below.)
- Malory: the Maimed King whose wound lays the land waste, the Dolorous Stroke, the
  perilous seat, oaths that bind. A wounded land that cannot heal until a question is asked.
- Italian westerns: operatic stillness, extreme wide against extreme close, dusty sweating
  people rather than clean heroes (sourced: ASC, MoMA notes on Leone and Delli Colli).
- The wasteland tradition generally: dry wells, broken images, a land waiting.

### 1.5 Do NOT use (homage-not-copy list)

Treat this as a blocklist for `design/story.json`, asset names, signage and marketing.
It is not exhaustive: when in doubt, check the publisher's official glossary (section 8)
and invent something else.

**Character names.** Roland, Deschain, the Man in Black, Walter, Marten, Flagg, the Crimson
King, Jake, Eddie, Susannah, Odetta, Detta, Oy, Cuthbert, Alain, Cort, Susan Delgado, Rhea,
Sheemie, Callahan, Mordred, Blaine, Shardik, Maturin, Gan, Arthur Eld, Farson, Jonas,
Tick-Tock, Andy, Mia, Patrick, Brautigan. Also avoid surnames and places from the author's
wider work (Derry, Castle Rock, Torrance, Hallorann and so on); the series cross-links to them.

**Place names.** Mid-World, In-World, Out-World, End-World, All-World, Gilead, New Canaan,
Tull, Mohaine, Mejis, Hambry, Lud, River Crossing, the Calla(s), Thunderclap, Fedic,
Discordia, Devar-Toi, Algul Siento, Jericho Hill, Eyebolt Canyon, the Borderlands, the
Clearing, "the Way Station" as a proper noun, "the Waste Lands" as a proper noun,
"golgotha" for the meeting place, Keystone anything.

**Coined terms and usages.** ka, ka-tet and every ka- compound, khef, tet, an-tet, dinh, sai,
thankee, hile, sigul, char, charyou tree, commala, gunna, graf, delah, roont, trig, glammer,
todash, thinny, the Beam(s), Path of the Beam, Guardians, Breakers, the Prim, the White,
the Red, slow mutants, billy-bumbler, lobstrosities, taheen, can-toi, low men, Wolves,
harriers, skin-man, starkblast, devil grass, "wheels" as a distance unit, High Speech,
Low Speech, the Great Old Ones / Old Ones / Old People, Dogan, Horn of Eld, Black Thirteen,
the Wizard's Rainbow, Maerlyn, the Unfound Door, the Drawing, "the Dark Tower" and "the
Tower" as the name of the goal.

**Corporations.** North Central Positronics, LaMerk, Sombra, Tet Corporation. Do not echo
their construction either (compass direction + "Positronics", or a foundry stamp that is
an obvious anagram).

**Quotations and catchphrases.** No line from the books, including these recognisable ones:

- the opening sentence (pursued "fled across the desert", pursuer "followed"), and any
  sentence built on its skeleton;
- "The world has moved on" and "moved on" as a stock phrase. Note that pillar 2 in
  `CLAUDE.md` paraphrases it: fine as an internal label, **never in player-facing text**;
- "there are other worlds than these";
- the three-part marksman's catechism (aim with the eye / shoot with the mind / kill with
  the heart) and "forgotten the face of [my/your] father";
- "Long days and pleasant nights", "I cry your pardon", "well-met", "stand true",
  "set my watch and warrant on it", "there will be water if God wills it",
  "all things serve the Beam", "ka is a wheel".

**Numbers.** Avoid 19, 99 and 1999 as recurring or prominent numbers on signage, serials,
dials and puzzle solutions.

**"Gunslinger" and "palaver".** Both are ordinary English words and fine in docs and
marketing as genre descriptors. But the series uses "gunslinger" as the title of a knightly
order and "palaver" as its signature word for parley. In the fiction, give the player's
order its own title and use "parley", "words" or an invented term.

### 1.6 Signature images and set-pieces to steer clear of

Motifs are free; specific combinations are the author's. Do not stage:

| Signature | Why it is recognisable | Safe swap that keeps the motif |
|---|---|---|
| A dark tower in a field of red roses; a single guarded rose | The central icon | A goal that is not a building: a hairline rising from the horizon past the top of the sky, a hair off true vertical (see 6.2) |
| Six lines of force crossing at the centre, visible in drifting clouds and bent shadows, with animal guardians at each end | The cosmology | One physical line of dead transmission pylons marching to the vanishing point. No cloud streaming, no totems, no word "beam" |
| Free-standing doors on a beach, each labelled with a word, opening into another person's eyes | Book two's core device | Doors that belong to real structures; the far side has a different grade and sound |
| Revolvers with sandalwood grips, forged from a legendary sword | The hero's guns | Blued steel, dark horn or walnut grip, a small invented maker's mark; no sword lore, no rose engraving |
| A red eye sigil; red as the colour of the enemy | The antagonist's sign | Our "wrong" colour is violet; no eye glyphs |
| A pink crystal ball; a rainbow set of seeing-glasses | Book four | No scrying glass props |
| A boy alone at a desert relay station; a preacher who turns a town; a hand-pumped rail cart through tunnels of glowing mutants; a parley at a place of bones with a card reading | The first book's exact beats | Use the *shape* (settlement, shelter, descent, meeting), invent the content |
| A sentient train that demands riddles; a cyborg bear with a dish on its head; a talking raccoon-dog companion | Later books | Machines that speak in procedure and status codes, not personality; no animal companion |
| Old pop songs and brand names surviving as folk culture | A running joke in the books | Invented work-songs and an invented manufacturer (4.4); no real songs or brands at all |

---

## 2. Visual reference analysis

The filter for every reference: **does the look survive at low polygon counts, with baked
lighting and almost no texture memory?** That favours works built on silhouette, limited
palette, atmosphere and big value shapes, and rules out works that depend on micro-detail.

### 2.1 Film

| Work | Borrow | Leave |
|---|---|---|
| **Leone / Delli Colli**, *Once Upon a Time in the West*, *The Good, the Bad and the Ugly* | Extreme wide then extreme close; figures as dark cut-outs; dusty, sweat-stained surfaces; waiting as drama. Stage arenas as stand-offs: clear sightlines, a few hard cover shapes, long shadows as leading lines. | Period-accurate clutter. |
| **Ford**, *The Searchers* (the doorway shots) | The frame-within-a-frame: black interior, blazing exterior. Our opening and every interior exit should be this shot. It costs nothing and is the strongest value contrast available. | |
| **Miller / Seale / Whipp**, *Mad Max: Fury Road* | The decision to *reject* muddy desaturated apocalypse: push sand and rust to orange, push sky and shadow to teal, keep detail in both ends, grade "like a graphic novel"; night as saturated blue (sourced: Color Culture). Hue separation keeps characters legible. | The saturation level. At full strength it reads as action spectacle, not melancholy. Take the separation, halve the chroma. |
| **Villeneuve / Deakins**, *Blade Runner 2049* (the orange city) | Proof that one hue plus fog plus colossal silhouettes is spectacular. Giant shapes fading into haze, a tiny figure for scale. | Monochrome for a whole stage; it tires fast in a shooter. |
| **Villeneuve / Fraser**, *Dune* | Monolithic, unornamented architecture; haze layers; scale shown by a small human element at the base of a huge form. | |
| **Tarkovsky**, *Stalker* | Quiet horror through stillness and ordinary objects in the wrong place; a threshold that changes the film stock. Direct model for "threshold as grade change". | The pace. |
| **Eastwood**, *High Plains Drifter* | A frontier town repainted one wrong colour. The whole "wrong colour" idea in one image. | Red (see 1.6). |
| **Crichton**, *Westworld* (1973) and the later series | Warm western veneer, cold clean service corridors underneath. Two palettes, one cut between them. | |
| **Zahler**, *Bone Tomahawk*; **Hillcoat**, *The Proposition* | Horror arriving in broad daylight; heat and flies; dusk as elegy. | Gore. |
| **Coens / Deakins**, *No Country for Old Men*; **Anderson / Elswit**, *There Will Be Blood* | Low sun, long shadows, big empty frame, the derrick as a lone vertical. | |

### 2.2 Illustration and painting

| Artist | Borrow |
|---|---|
| **Moebius** (*Arzach*, the desert sketchbooks) | Flat colour fields, clean contour, pastel desert with turquoise and violet shadow, strange architecture as simple solids. Sable took its whole look from here. |
| **Ed Mell** | Desert mesas and thunderheads painted as faceted planes. This is literally low-poly landscape with gradient fills: the best single reference for our terrain and clouds. |
| **Maynard Dixon** | Very low horizons, huge simple cloud shapes, shadow as flat cool colour. |
| **Frederic Remington**, the nocturnes | A night palette of green-blue and silver with one warm window. Reference for palette C. |
| **Georgia O'Keeffe**, the bone-and-desert paintings | Bleached bone against sky; reduction to two or three shapes. |
| **Simon Stålenhag** | Ordinary landscape, colossal derelict machine in haze, a maker's logo on it, one small light still on. The exact relationship we want between frontier and Old-World. |
| **Zdzisław Beksiński** | Ochre-and-umber dread, architecture that looks grown. Use a drop of this for the boss space only. |

### 2.3 Games

| Game | Borrow | Evidence |
|---|---|---|
| **Sable** | Fog tuned per area was the single biggest win for mid and long distance readability; flat colour needs light and shadow to stay readable; a desert lets you place "islands of content" with empty space between. | Sourced: Game Developer |
| **Firewatch** | "The sky is the largest chunk of colour and is responsible for every other colour." Distance as stacked flat layers, each lighter than the last; a directional stylised fog. | Sourced: Thumbsticks GDC write-up, Campo Santo blog |
| **Journey** | One glowing landmark as constant navigation; palette shifts per chapter; non-physical, "phenomenological" sand lighting with sparkle chosen for feeling. | Sourced: GDC Vault |
| **Team Fortress 2** | Read order is silhouette, then value, then colour. Two factions as two shape languages: warm colours, natural materials, angular geometry versus cool colours, industrial materials, orthogonal forms. Map this straight onto frontier versus Old-World. Environment detail kept quiet so characters pop. | Sourced: Valve NPAR 2007 / GDC 2008 |
| **Half-Life 2** | "The collision of the old and the new": a foreign architecture that cuts through the old one instead of sitting beside it. The Old-World should intrude. | Sourced: Antonov interviews |
| **Breath of the Wild** | Ancient tech identified by one emissive colour and one linework pattern. Players learn "that glow means interactive" in minutes. | Opinion |
| **Hyper Light Drifter** | A single hot synthetic accent on ruined tech; dead giants as landscape. | Opinion |
| **Inside** | Near-monochrome, fog layers, one accent, dread without a word. | Opinion |
| **Kentucky Route Zero** | The closest *tone*: flat shapes, theatrical light, uncanny Americana, restraint. | Opinion |
| **DUSK, Quake** | Chunky geometry and coloured lightmaps carry a whole mood on weak hardware. | Opinion |
| **Shadow of the Colossus** | Overexposed pale sky, haze, vast emptiness, scale. | Opinion |
| **Weird West / West of Dead / Hard West / Evil West** | Hard lines and brush-like fills for a timeless look; heavy black shadow shapes; looming, over-tall frontier buildings for a gothic feel. | Sourced: previews, Xbox Wire |

What to leave from the weird-west games: skulls, zombies, hellfire, bloody sunsets. That is
the loud version of the genre. Ours is the quiet one.

What to leave from Fallout: the 1950s atomic-diner future. It is that series' signature and
would also drag us toward jokes. Our Old-World design era is **late-1960s to 1970s
institutional modernism**: utility authorities, space-agency ground equipment, Swiss-grid
signage, appliance design with big radii. Calm, rational, slightly condescending.

### 2.4 Five laws distilled from the references

1. **Three values first.** Every hero view must read as light, mid and dark shapes when
   squinted at. Exterior is roughly 60% light, 30% mid, 10% dark; interiors invert it.
2. **Two temperatures.** Warm light, cool shadow. Never grey shadows, never black.
3. **The sky is the palette.** Fog colour equals horizon colour. Everything distant
   converges on it.
4. **Saturation lives in light and in small things.** Large surfaces stay dusty (measured:
   large-area albedos in the palettes below sit at OKLCH chroma 0.03 to 0.11; emissives at
   0.11 to 0.25).
5. **Detail is rationed.** Big quiet shapes, with detail clustered where the player's hands
   and eyes go: doors, handles, the gun, signage, interactables.

---

## 3. Candidate palettes

![Palette mock-ups](../../shots/research/art-tone-palettes.png)

*Flat-shaded mock-ups generated from the hex values below: exterior, building interior,
underground, and swatches. Regenerate with `node scratch/art-tone/palettes.cjs`.*

### 3.0 Conventions

- **Sky, sun, fog, shadow** rows are *display targets*: what the pixel should be on screen
  after tone mapping and grade.
- **Sand, rock, wood, rust, metal, enamel** rows are *albedo* (base colour, sRGB) to author
  in Blender. Lit and shadowed results are listed separately.
- **Key** and **bake ambient** are light colours with relative intensities for the Cycles
  bake. "Lit" and "shadow" values below were computed as `albedo x (key + ambient)` and
  `albedo x ambient` in linear space (measured, simple model, no bounce).
- The **bake ambient is not the visible sky colour.** It is chosen so shadows land where
  we want them. A first attempt using a sky-coloured ambient on orange sand produced olive
  shadows (`#313123`) at a 12.6:1 ratio: muddy and too dark. The retuned violet-blue
  ambient gives mauve shadows at about 5.5:1 (measured).
- Each palette has three emissive voices: **flame** (people), **signal** (Old-World still
  functioning), **wrong** (the uncanny).

### 3.1 Palette A: "White Noon"

Bleached, high-key, the desert as glare. Leone and Moebius.

| Role | Hex | Note |
|---|---|---|
| Sky zenith | `#4A86B8` | clear dusty blue |
| Sky mid | `#9DBFD0` | |
| Sky horizon / fog | `#E6E2D0` / `#DDD9C6` | bone-white haze |
| Sun disc | `#FFF6E0` | |
| Key light | `#FFF1D6` x 1.15 | elevation 60 to 70 degrees |
| Bake ambient | `#8FA0E0` x 0.70 | |
| Shadow (on sand) | `#666772` | lit sand `#F7D8AD`; ratio 5.2:1 |
| Sand | `#D9C39A` | |
| Rock / rock dark | `#B08A64` / `#7D5A44` | pale sandstone, darker strata |
| Wood | `#988A76` | silvered, sun-bleached |
| Rust | `#A3522D` | |
| Old-World metal | `#4F6468` | cold grey-green |
| Old-World enamel | `#E8E6DA` | |
| Flame | `#FF9B3D` | |
| Signal | `#2FE0C8` | turquoise |
| **Wrong** | `#B24BFF` | violet; core `#F0DCFF` |

Lighting moods:

- **Exterior.** Sun nearly overhead; short hard shadows pooled under things; sky ambient
  strong, so shade is blue and open. Fog pale and thin until about 150 m, then a white-out.
  Heat shimmer at full strength. Reads as exposure and thirst.
- **Building interior.** The most extreme contrast of the three: doorways blown to near
  white, shade a cool slate (`#454757` on wood). Shafts are short and steep, landing as
  small bright coins on the floor.
- **Underground.** Deep blue-black (`#21324C` on metal) with turquoise signal strips.
  The jump from white glare to this is violent, which is the point of A.

Assessment (measured and opinion): lowest drama per baked texel. Short shadows mean the
lightmap contributes little shape outdoors, facets look flat under overhead light, and a
first try at a chartreuse "wrong" colour vanished against lit sand (contrast 1.02:1, only
33 degrees of hue from the sun colour), which is why A also uses violet. Good as a
*contrast beat*, weak as the main look.

### 3.2 Palette B: "Long Light" (recommended)

Late afternoon sliding toward dusk. The day is nearly over, which is the theme.

| Role | Hex | Note |
|---|---|---|
| Sky zenith | `#2C5A6E` | dusty teal |
| Sky mid | `#8FB0A0` | pale sage band at about 25 degrees elevation |
| Sky horizon | `#F3C58E` | peach-gold |
| Fog | `#EDBB86` toward sun, `#C9A592` away | directional (5.2) |
| Sun disc | `#FFE9B8` | |
| Key light | `#FFD09A` x 1.30 | elevation 12 to 16 degrees |
| Bake ambient | `#7A86D8` x 0.90 | violet-blue, deliberately not sky-coloured |
| Shadow (on sand) | `#5C4E59` | lit sand `#F4A272`; ratio 5.5:1 |
| Sand | `#CDA070` | |
| Rock / rock dark | `#A3563A` / `#63302A` | red sandstone; lit `#B65239`, shadow `#48272D` |
| Wood | `#6E4E38` | lit `#7E4C38`, shadow `#2E222B` |
| Rust | `#B5522B` | lit `#CF502B` |
| Old-World metal | `#36525A` | petrol blue-green; lit `#3C4D58`, shadow `#132547` |
| Old-World enamel | `#CFD6CC` | celadon-white ceramic; shadow `#5D6AA4` |
| Flame | `#FF9433` | |
| Signal | `#7CF2E2` | pale aqua |
| **Wrong** | `#B24BFF` | violet; core `#F0DCFF` |

Lighting moods:

- **Exterior.** Sun 12 to 16 degrees up and 30 to 40 degrees off the player's main direction
  of travel, ahead and to one side: three-quarter back-light. Every object throws a long
  mauve shadow toward the player (leading lines, cover made visible), every silhouette gets
  a warm rim, and buildings show one lit and one shadowed face. Sun angular size 3 to 5
  degrees in the bake so shadow edges are soft enough to survive low lightmap resolution.
  Fog targets: about 20% at 40 m (combat range stays clear), 50% at 120 m, 85 to 90% at
  350 m. A thicker dust layer below about 3 m in gullies. Exposure puts sunlit sand at
  about 80% display value; only the sun disc and glints clip.
- **Building interior.** Low-key. Exposure rises about one stop on entry, so doors and
  windows bloom to a peach near-white and the outside becomes a bright abstract. Raking
  shafts of key colour through slats and bullet holes, each landing on a baked hot patch;
  bounce from those patches warms the ceiling for free. One flame source per room, radius
  3 to 4 m, baked. Shadows are warm brown-black (`#2E222B`), never neutral. Dust motes only
  inside the shafts.
- **Underground machine space.** Cold and regular. No sun, no flame except what earlier
  travellers left. Key light is the signal colour itself, baked from emissive strips in
  long receding rows. Ambient is deep blue (`#132547`); fog starts near-black blue and
  picks up a little aqua with distance so the far wall of a big hall dissolves. Satin
  floors with a smeared streak under each light. The only warm light is the player's
  muzzle flash. Violet appears first as a hairline under a door, and only fills a room in
  the final chamber.

Assessment (measured and opinion): best contrast structure of the three. Dark figure
against lit sand measures 8.5:1; violet is 78 degrees of hue from its nearest neighbour;
signal on dark metal is 11.3:1. Low sun makes the bake do visible work: long shadows,
warm bounce, facets catching light at different angles. Risk is drifting into
orange-and-teal blockbuster or, with the violet, into synthwave; see section 7.

### 3.3 Palette C: "Blue Hour"

After sundown or before dawn. Horror-forward, lantern-lit. Remington's nocturnes.

| Role | Hex | Note |
|---|---|---|
| Sky zenith | `#1B2440` | indigo |
| Sky mid | `#5D6690` | |
| Sky horizon | `#D9967A` | ember band, low and narrow |
| Fog | `#4D5578` | blue-violet |
| Afterglow ("sun") | `#FF9E6B` | below the horizon; rim only |
| Key light | `#A9B8E0` x 0.75 | soft, from the sky dome |
| Bake ambient | `#4A5A96` x 0.50 | |
| Shadow (on sand) | `#1F2233` | lit sand `#65656D`; ratio 7.9:1 |
| Sand | `#A89880` | |
| Rock / rock dark | `#6F5B55` / `#3F3438` | |
| Wood | `#5A4A42` | |
| Rust | `#8A4630` | |
| Old-World metal | `#2E3A4A` | |
| Old-World enamel | `#C4CCD6` | |
| Flame | `#FFA640` | the main light source of the whole palette |
| Signal | `#E8F4FF` | cold white |
| **Wrong** | `#5CFF9E` | phosphor green (violet is too close to this sky: 38 degrees) |

Lighting moods:

- **Exterior.** No sun. A narrow ember band on the horizon rims every silhouette; the rest
  is soft blue sky-light. Lanterns and windows are the composition. Fog is close and blue.
- **Building interior.** Lantern pools on black. Beautiful, but indistinguishable from
  every other horror game interior.
- **Underground.** Cold white strips, green wrongness. Little contrast with the exterior,
  so the descent loses its shock.

Assessment (measured and opinion): the moodiest stills, the worst game. Dark figure against
lit ground is only 3.5:1, and 2.8:1 against fog; the lit ground itself sits low in the
range. On a cheap laptop panel in a bright room it becomes mud, and a slow, loud revolver
needs targets the player can see. All three zones are dark, so thresholds lose their punch.
Keep C as the **source of the stage's final image** (see 6.3), not as the main look.

---

## 4. Material and shape vocabulary

### 4.1 Two layers, opposite in every axis

| Axis | Frontier layer | Old-World layer |
|---|---|---|
| Made by | hands, additively, from what was lying around | machines, cut from solid, to a drawing |
| Temperature | warm | cool |
| Value | middle | extremes: very dark metal, very pale enamel |
| Geometry | angular, slightly off-square, leaning 2 to 4 degrees, sagging, tapered | orthogonal plus perfect circles, large radii, long unbroken horizontals |
| Scale | human: 1.2 x 2.2 m doors, 2.4 m eaves, steps you can climb | not for people: 4 m doors, 0.6 m risers or no stairs at all, handles too high |
| Surface | matte, fibrous, patched | satin, monolithic, panelised on a strict module (suggest 1.2 m) |
| Edges | split, frayed, uneven | bevelled, exact, unworn |
| Repetition | never twice the same | identical modules; decay shown by which module is missing |
| Materials | grey board, adobe, canvas, rope, hide, tin sheet, bone | ceramic enamel panel, oxidised steel, cast concrete, braided cable, glass |
| Light | flame, flickering, orange | steady, linear, aqua |
| Sound (for the audio team) | wood creak, wind, cloth | hum, relay tick, a tone that is slightly too pure |
| Writing | almost none: tallies, brands, paint slashes | stencilled text, numbers, pictograms |

Cheapness note: both layers are easy to script. Frontier is boxes and planks with per-vertex
jitter and a lean. Old-World is boxes, cylinders and bevels with *no* jitter. The contrast
between jittered and unjittered geometry is itself the art direction.

### 4.2 The seam is where the story is

- **Intrusion.** The Old-World is never set-dressing beside the town. It comes *through*
  it: a pylon leg through a barn roof, a ceramic rib surfacing in the street where the
  sand blew off, the well that is a maintenance shaft.
- **Salvage.** Frontier objects made of Old-World parts used wrongly: an access panel as a
  door, cable as rope, an insulator as a bell, a lens as a window, a status lamp kept as a
  shrine because it is still lit.
- **Misreading.** People have decorated, fenced, prayed to or bricked up the machinery.
  Offerings at a junction box. Hazard pictograms copied by hand as charms.

Every interactable should sit on the seam, so the player's eye is trained to look there.

### 4.3 The third vocabulary: wrong

Used at one or two points per area, never clustered. All of these are nearly free:

- A baked shadow that points the wrong way, or belongs to nothing.
- One object that is perfectly clean in a place where everything is dusted.
- Things arranged in a neat row by nobody. Two identical "unique" things.
- A cloth that hangs dead still while every other cloth moves.
- Water running the wrong way (reverse the UV scroll).
- A lamp lit where there is no power, in the wrong colour.
- A perfect circle in a natural material; a grown, irregular shape in ceramic.
- Dials all stopped at the same reading in rooms that were abandoned at different times.

### 4.4 An original defunct manufacturer

One company made everything under the sand. Its marks are the Old-World's voice, and the
cheapest environmental storytelling we have.

**Name candidates** (suggestions; none collides with anything found in a quick web check,
but run a proper name check before locking):

1. **PELLAM DEEPWORKS** (recommended). Pellam is Malory's Maimed King, whose wound made
   the Waste Land: an Arthurian root, not one of the series' names. A utility that drilled
   for water in a land that then dried is the whole theme in a letterhead. Six wide
   capitals, stencil-friendly, abbreviates to PDW on asset tags.
2. **QUILLON MOTIVE** (a quillon is a sword's cross-guard). Suits rail and traction equipment.
3. **HESPER UTILITY** (Hesper: the evening star, the west). Softer, civic.

**The mark.** A ring broken at the bottom, with a vertical stroke dropping from its centre
through the gap to a small solid dot: a plumb line leaving a well-head. Reasons:

- three primitives (arc, bar, disc), about 60 to 80 triangles as real geometry, or a
  64-pixel single-channel mask;
- no enclosed counters, so it works as a stencil and as a cast plate;
- it reads at 12 pixels;
- it rhymes with the vertical hairline on the horizon;
- the townspeople can plausibly have adopted it as their sign for "water here", painted
  crudely on doors and troughs. Same glyph, two hands, two meanings.

**Typography.** Wide geometric capitals, generous tracking, stencil bridges. Blender's
built-in font converts to mesh at about 16 triangles per letter (measured: "PELLAM" is 98
triangles), so large signage can be real geometry: crisp at any resolution and zero texture
memory. Cut stencil bridges with two thin boolean slots. Small text goes in one shared
signage atlas (512 x 512 single channel is enough), tinted by vertex colour.

**House style.**

- Livery: enamel white panel, a 10 cm band of signal aqua at 1.2 m height, dark steel
  below. Hazard marking is a broad diagonal in faded ochre, not black-and-yellow stripes.
- Every machine carries a cast maker's plate (16:9, four rivets), a stencilled asset
  number, and one pictogram. Repetition of this trio is what makes the layer feel designed.
- Tone of voice: calm, paternal, certain. Suggested lines (original; final text goes in
  `design/story.json`): "WATER WHERE YOU STAND." / "BUILT TO OUTLAST THE NEED." /
  "LIFT STATION 14. SERVICE INTERVAL: FORTY YEARS." / "IF THE TONE CHANGES, LEAVE."
- Pictograms over words wherever possible: cheaper, language-free, and eerier.

**Frontier lettering.** Almost none. Tallies, livestock-brand glyphs, a slash of paint.
Where the Old-World mark is copied it is copied badly, with a brush.

### 4.5 Making decay read without grunge textures

Ranked by value per triangle:

1. **Silhouette first.** Lean, sag, a missing corner, roof ribs showing against the sky.
   If the outline looks intact, no amount of surface dirt will say "ruin".
2. **Sand is the decay material.** Drifts wedged against windward walls, rooms half full,
   steps buried. One wedge mesh plus a vertex-colour "dust skirt" blending the bottom
   0.6 m of every wall toward the sand colour.
3. **Gradients.** Top-down sun bleach (lighter, less saturated at the top), bottom-up
   dust, a dark vertical streak under every fastener, sill and seam. All vertex colour.
4. **Convergence.** Old things lose their own colour and approach the ground colour.
   Paint survives at 30% saturation. Only living or powered things keep chroma.
5. **Break the module.** In any repeated run, one in five is missing, fallen, or replaced
   with the wrong part.
6. **Repair.** Mismatched boards, a patch plate, a prop under a beam. Decay with repair
   says people; decay without says nobody.
7. **Tilt and burial.** Free-standing objects tilt 2 to 7 degrees and sit a little into
   the ground. Nothing old is level.
8. **One of eight.** In a row of lamps, one works and flickers. More convincing than
   all dead, and it gives the bake a light source.
9. **Baked AO is grime.** Cycles' ambient occlusion in crevices already reads as dirt.
   Cycles' *Pointiness* output (present in 4.5, probed) baked to vertex colour gives
   edge wear on metal for free.
10. **The two layers decay differently.** Frontier rots, splits and bleaches. Old-World
    does not rot: it stains, sheds a panel to show ribs and cable, and keeps humming.
    Enamel that is still white in a town gone grey is one of the unsettling images.

---

## 5. Cheap techniques that deliver "spectacular"

Hard facts that shape every choice (from `CLAUDE.md` and measurement):

- Low tier: no shadow maps, one merged post pass, 100 draw calls, 120k triangles, 64 MB of
  textures. The stack has no GPU texture compression step, so assume textures sit
  uncompressed in memory: a 2048 x 2048 RGBA map is about 16 MB, 21 MB with mips. **Two
  large lightmaps are most of the budget.** Albedo therefore comes from vertex colour and
  tiny shared atlases, and the memory is spent on light.
- At 720p with a 75 degree vertical field of view (assumption), one pixel covers about
  2.1 mm per metre of distance: 2 cm at 10 m, 6 cm at 30 m, 21 cm at 100 m. **Nothing
  should be thinner than 2 pixels at its normal viewing distance**: minimum thickness is
  about 0.45% of distance. Wires, rails, fence slats and antenna masts must be fattened,
  drawn as fading cards, or dropped. Adaptive resolution makes this worse, not better.
- Blender 4.5 here can bake to image textures or straight to vertex colours, and has the
  Nishita sky and the Pointiness attribute (probed).

### 5.1 Baked light is the look

- Bake sun plus ambient plus emissives in Cycles. The warm bounce under porches and the
  aqua spill from signal strips are the richness; nothing at runtime can afford them.
- Design shadows as **large soft shapes**. Sun size 3 to 5 degrees. Put crisp detail in
  geometry silhouettes, not in lightmap texels.
- Use lightmaps on terrain and architecture the player gets close to; bake props and
  distant scenery to vertex colour (add an edge loop where a shadow boundary must fall).
- Dynamic things (enemies, the gun, pickups) cannot receive the bake. Give each zone an
  ambient colour and a key direction and tint dynamic objects with it, plus a soft blob
  shadow. Without this the gun looks pasted on; with it, the gun warms as the player
  steps into a shaft.
- **Muzzle flash as a light.** A one-to-two-frame radial brighten around the muzzle in the
  world shader, in flame colour, no real light. In a dark room every shot becomes a
  flashbulb photograph of the space. This is the cheapest way to make the gun the star.

### 5.2 Sky and fog

- **Sky dome shader, no texture:** three-stop vertical gradient, sun disc, a wide soft
  halo, a slightly brighter band at the horizon. Add dither or blue noise in the shader;
  smooth gradients band badly at 8 bits and it is the first thing a critic will see.
- **Directional fog:** fog colour is the horizon colour, blended toward the sun colour as
  the view direction approaches the sun. One dot product; this is what makes looking
  west feel like looking into light.
- **Height fog:** denser near the ground and in low places. Computing it per vertex is
  acceptable on the low tier because terrain is tessellated anyway.
- **Layered distance:** three or four unlit silhouette cards of mesas, under 200
  triangles each, each lighter and closer to fog colour than the one in front. This is
  the Firewatch look and it is nearly free.
- **Clouds:** a few big faceted shapes in the Ed Mell manner as gradient-shaded cards,
  not a noise texture.
- **Cloud shadows:** one small tiling noise texture scrolled across the exterior in world
  space, multiplying the baked light. It makes a static bake feel alive, and it sells
  scale because the shadows cross the far mesas too.
- **Time slip (optional, strong):** because the theme is a world whose time has gone
  soft, the sky gradient, fog and grade can be changed between areas even though baked
  shadows cannot move. See 6.3.

### 5.3 Shafts, dust and glow

- **Sun shafts from cards.** Two or three crossed additive quads per opening, aligned to
  the sun direction, soft-edged by a gradient, no depth write. Fade each card as it turns
  edge-on to the camera and as the camera gets close, or they pop. Each shaft must land
  on a hot spot in the bake. Cap total shaft coverage at roughly one and a half screens
  of overdraw on the low tier.
- **Dust motes.** One draw call: a few hundred small sprites in a box that follows and
  wraps around the camera, visible only where a shaft volume says so. Outdoors, swap for
  low streaks of blowing sand hugging the ground.
- **Emissive language.** Unlit bright geometry, a baked halo on nearby surfaces, and an
  additive glow sprite as fake bloom on the low tier (real half-resolution bloom on high).
  Always frame an emissive with a dark bezel: measured luminance contrast of signal or
  violet against lit sand is under 2:1, against dark metal 4 to 11:1. Only three emissive
  hues exist in the game.
- **Glints.** A thresholded sparkle on sand facing the sun (after Journey), and a simple
  fresnel rim toward sky colour on enamel and on the gun. No environment maps needed.

### 5.4 Heat, motion, life

- **Heat shimmer.** A small UV offset in the merged post pass, masked to distant depth and
  to a band around the horizon, one to two pixels of amplitude. No extra pass. Off
  indoors. Fallback: wobble the vertices of the far silhouette cards.
- **Vertex-shader wind.** Cloth strips, hanging cable, dry grass: a sine in the vertex
  shader weighted by a vertex-colour channel. No bones, no CPU.
- **Rigid loops.** A wind-pump turning against the sky, a swinging sign, a lantern on a
  hook. A moving silhouette on the skyline is worth more than any texture.
- **Circling birds** as two-triangle sprites over anything dead. A dust devil as a
  scrolling cone in the far distance.

### 5.5 Colour without textures

- **Vertex-colour gradients** on everything: bleach from above, dust from below, AO,
  edge wear. A wall needs only two or three horizontal loops (base, top of dust skirt,
  eave) to carry them.
- **One palette atlas** for all props (64 to 256 pixels). One material, so props merge or
  instance into few draw calls.
- **A trim sheet at most** for plank and panel lines, greyscale, tinted by vertex colour.
- **No normal maps** on the low tier. Bevels and facets catching the low sun do that job.

### 5.6 Scale

- One colossal Old-World form visible from the first frame: 200 m tall, a few hundred
  triangles, fogged almost to a silhouette. Put a human-scale ladder, door or lamp at its
  foot so the eye can measure it.
- Underground, a hall whose far end is lost in fog, with one instanced row of identical
  lights receding to a point. Depth for a single draw call.
- **Compression then release.** A low, narrow, dark passage immediately before every big
  reveal. The reveal is only as big as the corridor before it was small.

### 5.7 The final image

- One merged pass: tone map, split-tone grade (cool lift in shadows, warm gain in
  highlights), vignette, a little grain or dither, heat shimmer.
- Tone mapping changes the palette. Filmic curves in three.js (ACES, AgX) desaturate and
  hue-shift bright oranges; the neutral curve preserves authored colour better. Decide
  early, then verify by sampling screenshots against the hex targets in section 3. That
  check can be automated with the image tools already installed and would give critics a
  number instead of an impression.
- Per-zone grade and exposure, cross-faded at thresholds.

### 5.8 What not to spend on

Real-time shadows; full PBR texture sets; noisy tiling textures; stacked transparent
layers; thin geometry; grey fog; black shadows; more than three emissive hues; fine
detail anywhere the player cannot walk up to.

---

## 6. Recommended direction

### 6.1 The look

**Palette B, "Long Light", as the body of the stage; palette A's glare for one short beat;
palette C for the last image.** Chunky faceted geometry, vertex-colour gradients, baked
soft light, peach directional fog, three emissive voices. Frontier jittered and warm,
Old-World exact and cool, the seam between them always visible. Design era for the
Old-World: 1970s public utility. Manufacturer: Pellam Deepworks, with the plumb-line mark.

### 6.2 The horizon goal

Not a tower. **A hairline of violet light rising from behind the far mesas to beyond the
top of the sky, about one degree off true vertical.** It is the only violet thing outdoors.
It costs one line in the sky shader (draw it at a constant two-pixel width with a soft
halo so it never aliases), it is visible from everywhere, it cannot be mistaken for the
series' icon, and it is quietly wrong: the eye wants it to be plumb and it is not. A line
of dead pylons walks toward its base to give level design a direction. Naming is for the
GDD; working label "the hairline".

### 6.3 Colour script for the stage

| Movement | Zone | Look | The picture |
|---|---|---|---|
| 1. Approach | exterior | B, with a first minute at A's glare as the player leaves shade | Step out of a black overhang into the valley: pylons, haze, the hairline. The doorway shot. |
| 2. Settlement | exterior | B | A street of long shadows, a wind-pump turning, one detail that is wrong. First fight staged as a stand-off. |
| 3. Shelter | building interior | B interior | Slatted shafts, dust, a cold camp; in the floor, a clean ceramic hatch with a lit aqua strip. |
| 4. Descent | underground | B underground | A cramped shaft, then the machine hall: receding lights, a ring too big for people, violet leaking at the far end. |
| 5. Meeting and after | underground, then exterior | violet chamber, then C | The parley and the boss in the wrong light. Then the player climbs out and it is blue hour: time has slipped, the hairline is brighter, and far ahead on the plain is one small orange fire. The pursuit goes on. |

The last exterior should be a separate, small baked area so it can have its own light.
The opening and closing shots should share a composition.

### 6.4 Ten rules for the art bible

1. Squint test: three values, readable, in every hero view.
2. Warm light, cool shadow. No grey, no black.
3. Fog colour is horizon colour, always.
4. Flame means people. Aqua means the machine works. Violet means wrong. Nothing else glows.
5. Violet occupies under 2% of any frame until the final chamber, and always has a
   near-white core.
6. Frontier geometry is jittered and leans. Old-World geometry is exact and over-scaled.
7. Every interactable sits on the seam between the two.
8. Nothing thinner than two pixels at its usual distance.
9. Outside, enemies are dark shapes on bright ground. Underground, they carry something
   pale or lit.
10. The gun is the darkest, most neutral, most specular thing on screen, and its flash
    lights the room.

---

## 7. Risks and open questions

- **Homage drift.** The pylon line plus a far vertical goal is close in *function* to the
  series' cosmology. Keep it physical, singular and unnamed-as-beam, and keep clear of the
  set-pieces in 1.6. Someone should run final story text against the blocklist and the
  official glossary.
- **Orange-and-teal cliche; synthwave.** Palette B with a violet accent can tip into a
  music-video look. Guards: large-area chroma stays at or under 0.11, violet under 2% of
  frame, no violet key light outdoors, no neon tubing shapes.
- **Violet is low in luminance contrast** against lit sand (measured about 1.9:1). It works
  by hue, by a white core, and against dark or sky. If the horizon hairline does not read
  on a real monitor, widen the halo before changing the colour.
- **Texture memory.** If lightmaps cannot be compressed, two 2048 maps consume most of the
  64 MB. The look survives on vertex-colour baking alone, but shadow shapes get coarser;
  the art bible should say which surfaces deserve lightmap texels.
- **Low-range lightmaps.** An 8-bit lightmap cannot hold sunlit sand and deep interior
  shade at once without banding. Interiors and exterior probably need separate maps or an
  overbright multiplier, plus dither.
- **Tone mapping** will move every hex in section 3. Until the curve is chosen and tested,
  treat the display targets as intentions.
- **Time-slip ending** needs a second baked exterior, which costs memory and download.
  Fallback: a sky, fog and grade swap over the same bake, accepting that shadow direction
  will be wrong for the new light, which is at least on theme.
- **Sun shafts** are overdraw on exactly the machines we care about. They need a hard cap
  and a low-tier variant with fewer cards.
- **Name check.** "Pellam Deepworks" and the alternates had no hits in a quick search but
  have not had a proper trademark check.
- **Unverified here:** how the palette looks on a real GPU and monitor. The mock-ups are
  flat SVG renders from the hex values, not engine output.

---

## 8. Sources

Tone and lexicon:

- Wikipedia, *The Dark Tower* (series): influences, genre blend, structure.
  https://en.wikipedia.org/wiki/The_Dark_Tower_(series)
- Official glossary of the series' High and Low Speech (use as the blocklist reference).
  https://stephenking.com/DarkTower/glossary.html
- J. A. Wilders, "Journey Through the Dark": genre hybridity.
  https://jawilders.substack.com/p/journey-through-the-dark-analyzing
- Dolorous Stroke / the Maimed King (Pellam) in Malory.
  https://en.wikipedia.org/wiki/Dolorous_Stroke

Film:

- *Mad Max: Fury Road* cinematography and grade analysis.
  https://colorculture.org/mad-max-fury-road-cinematography-analysis/
- "Shooting *Once Upon a Time in the West*", American Cinematographer.
  https://theasc.com/articles/shooting-once-upon-a-time-in-the-west
- No Film School, iconic colour grades. https://nofilmschool.com/iconic-film-color-grades

Games:

- "How Shedworks refined the art of Sable in pursuit of readability", Game Developer.
  https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability
- "The Art of Firewatch" (GDC 2015 write-up), Thumbsticks.
  https://www.thumbsticks.com/gdc-2015-the-art-of-firewatch
- Campo Santo development blog. https://blog.camposanto.com/
- "Sand Rendering in Journey", GDC Vault. https://gdcvault.com/play/1017742/Sand-Rendering-in
- Valve, "Illustrative Rendering in Team Fortress 2" (NPAR 2007).
  https://cdn.fastly.steamstatic.com/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2_Slides.pdf
- Valve, "Stylization with a Purpose" (GDC 2008).
  https://cdn.fastly.steamstatic.com/apps/valve/2008/GDC2008_StylizationWithAPurpose_TF2.pdf
- Viktor Antonov on City 17. https://www.combineoverwiki.net/wiki/Viktor_Antonov
- *Weird West* preview (art style), COGconnected. https://cogconnected.com/preview/weird-west-preview/
- *Evil West* on Xbox Wire. https://news.xbox.com/en-us/2022/11/22/explore-the-weird-west/
- *West of Dead*, Fonts In Use. https://fontsinuse.com/uses/44358/west-of-dead-video-game
- "Moebius: the art that influenced video games", PopMatters.
  https://www.popmatters.com/moebius-art-influence-video-games

Technique:

- "Volumetric Light Rays with Three.js", Codrops.
  https://tympanus.net/codrops/2022/06/27/volumetric-light-rays-with-three-js
- three.js forum thread on persistent light shafts in a cave scene.
  https://discourse.threejs.org/t/help-with-persistent-volumetric-light-god-rays-light-shafts-sunbeam-sunburst-for-underground-cave-scene/79085
- Vertex-colour baking for stylised shading (overview).
  https://www.tripo3d.ai/blog/explore/smart-mesh-vertex-color-baking-for-stylized-shading

Local evidence:

- `shots/research/art-tone-palettes.png` (palette mock-ups, generated)
- `scratch/art-tone/palettes.cjs`, `scratch/art-tone/report.txt` (palette maths)
- `scratch/art-tone/probe.py` (Blender 4.5.14 capability probe)
