# Progress — saveVersion 33 / §36 Ore finds

**FROZEN** to `/workspace/godsim-rc` (saveVersion 33).  
Backup left alone: `/workspace/godsim-rc-v32`. Live stays 32 until Tester PASS + Judge publish.

## Done
- `data/materials.js` — `ore` hardness **88** (rock 70), no burn; pickup/strike only.
- `data/config.js` — `saveVersion: 33`, `objects.ore` deposits `[1,3]` size `[2,6]` `where: "slope"` (hill/mountain), flexJitter.
- `src/objects.js` — populate places ore; `Items.seedMaterial` for migrate; First ore Discoveries; article “an ore”.
- `src/sim.js` — migrate **32→33** (`seedOre` flag → seed after tiles unpack; orng preserved); deserialize chains migrate33.
- `src/cache.js` — ore stashable like rock/flint.
- `src/render.js` / `data/art.js` — Artist `ore_16` (ore|ore_shard) wired.
- `index.html` — all `?v=33`.
- Headless: `tests/headless_ore36.js` — **ALL PASS** in working copy and in `godsim-rc` after freeze (deposits on slope, pickup + Discoveries, strike physics, migrate 32→33 + round-trip).

## Spec check (§36)
- Ore near hills/mountain (deposit clusters) — yes (slope = hill || mountain).
- Pickup / strike like rock — yes (same Items/Physics path).
- Higher hardness than common rock — yes (88 > 70).
- No smelting / metal bars / forge UI — yes.
- First ore pickup → Discoveries — yes (“First ore”).
- Art ore_16 — yes.

## Paths
- RC: `/workspace/godsim-rc` (v33)
- Backup: `/workspace/godsim-rc-v32`
- Headless: `/workspace/godsim-rc/tests/headless_ore36.js`
- This note: `/workspace/godsim-rc/tests/progress_v33.md`
