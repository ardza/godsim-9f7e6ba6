# Progress — saveVersion 32 / §35 Built shelters

**Working copy only:** `/workspace/godsim`  
**Do NOT freeze** — wait for v31 PASS+publish. Live stays v30; rc is on v31 blockers for Tester.

## Done
- `src/hut.js` — pile sticks/reeds/hides into crude hut on known ground (known shelter / cache / sacred-adjacent walkable; not water). Curiosity + den score gate; consume ≥3 pile materials; one footprint; Discoveries “First crude hut”; action-only log.
- `data/config.js` — `saveVersion: 32`, `hut: { needPile: 3, warmX: 1.2, tryChance, tryEveryMinutes, … }`, hut articles/lines.
- `src/shelter.js` — hut type word + warmC via shelter warmX.
- `src/agent.js` — `Hut.maybe` in `seekWarmth`; arrive goal `hut`; status + WARM_GOALS.
- `src/render.js` — `drawShelters` blits `hut_16` cols `pile`|`hut` (Artist wired).
- `src/sim.js` — `Hut.init`, serialize `hutStats`/`hrng`, migrate **31→32**.
- `index.html` — all `?v=32` + `src/hut.js`.
- Headless: `tests/headless_hut35.js` — **ALL PASS** (hut create, Discoveries, warmth in hut > open, scavengers don’t steal structure, ≥1 hut on 7/8 seeds, migrate 31→32 + round-trip).

## Spec check (§35)
- Cold people pile materials into crude hut on known ground — yes.
- Warmer than bare cave/thicket alone (`warmX` 1.2 > cave) — yes (felt den bonus).
- No villages / multi-room / ownership UI — yes (single footprint shelter).
- Scavengers don’t steal structure — hut is shelter, not item.
- First crude hut → Discoveries — yes.

## Next
- Wait for Tester v31 PASS + Judge publish, then freeze v32 to rc.
- Then §36 / v33 Ore finds.

## Paths
- Headless: `/workspace/godsim/tests/headless_hut35.js`
- This note: `/workspace/godsim/tests/progress_v32.md`
- `godsim-rc` untouched (still saveVersion 31).
