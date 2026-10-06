# Master plan

One complete, polished stage of a weird-west gunslinger FPS in the style of the
*Dark Tower* series. Runs in the browser (three.js / WebGL2). All 3D content is authored
in Blender via headless Python. See `CLAUDE.md` for pillars, budgets and team rules.

## Why this stack

- **Browser + three.js (WebGL2):** runs on anything with a browser, including weak
  integrated GPUs; the player tests by opening a URL; critics can play it headlessly.
- **Blender headless Python:** every asset is reproducible from a script, and Cycles
  bakes the lighting so the runtime does almost no lighting work.
- **Baked lighting + strict budgets + adaptive resolution** is how it looks good and stays fast.

## Phases

| # | Phase | Shape | Output |
|---|---|---|---|
| 0 | Environment | inline | Blender, node deps, headless browser, wrappers (done) |
| 1 | Pre-production | research fan-out → 3 pitches → judge panel → GDD → art bible + level blockout → architecture → critics → revise | `docs/GDD.md`, `docs/ART_BIBLE.md`, `docs/ARCHITECTURE.md`, `design/*.json` |
| 2 | Foundation | engine core ‖ Blender pipeline → integrate → critic → fix | Game boots into a greybox of the real layout with placeholder assets; test harness; frozen contracts |
| 3 | Production (round 1) | 12 pieces in parallel, each: build → fresh-context critic → fix | Final art and systems, developed against the placeholders |
| 4 | Integration + polish (rounds 2–5) | integrate → critic panel (playthrough, visuals, performance, story/puzzles, bugs) → triaged parallel fixes → repeat | Shippable demo |

Rounds are capped at five in total: production is round 1, polish is rounds 2–5 and
stops early once every critic passes the bar with no blockers.

## Production pieces (phase 3)

Blender: exterior environment · interior environment · props, pickups and doors ·
weapon and first-person arms · enemies · boss.

Code: player and gunplay · enemy AI and combat · rendering, atmosphere and VFX ·
world, puzzles and story scripting · UI and HUD · procedural audio.

Code is written against placeholder assets that already carry the final names, node
names and animation clips from `design/assets.json`, so art and code never block each other.

## How quality is judged

- Critics are always fresh-context agents that did not build the piece.
- Critics look at evidence, not claims: screenshots and Blender renders they open
  themselves, automated playthroughs via the deterministic step hook, measured
  draw calls / triangles / texture memory / CPU frame time.
- Headless Chromium has no GPU here, so real-GPU frame rate is the one thing only
  the player can confirm. Budgets in `CLAUDE.md` are the proxy.
