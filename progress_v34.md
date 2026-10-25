# Progress — saveVersion 34 / §37 Hard points

**FROZEN** to `/workspace/godsim-rc` (saveVersion 34).  
Backup left alone: `/workspace/godsim-rc-v33`. Live stays 33 until Tester PASS + Judge publish.

## Done
- `data/config.js` — `saveVersion: 34`; `tools.tip` (points ore|flint, shafts stick|bone, digMult 0.55, huntOddsAdd 0.25); `hunt.odds.tip`.
- `src/tools.js` — tip craft: `finishTip` / `tryTip` / `maybeTip` / `startTip` / `stepTip`; onTry strike ore|flint onto stick|bone when score ≥45; dig/hunt helpers; Discoveries “First hard tip”; dulls with use.
- `src/hunt.js` — tip hunt odds add; tip wears on strike; tip counts as cut tool for meat.
- `src/agent.js` — act `tip` + arrive goal `tip`.
- `src/sim.js` — migrate **33→34**.
- `src/render.js` / `data/art.js` — Artist tip_stick_16 / tip_bone_16 / tip_16 already wired.
- `index.html` — all `?v=34`.
- Headless: `tests/headless_tip37.js` — **ALL PASS** in working copy and in `godsim-rc` after freeze.

## Spec check (§37)
- Strike ore or flint onto stick or bone → harder tip when score ≥45 — yes.
- Carried tip: hunt / dig bonus — yes (huntOddsAdd 0.25; digMult 0.55).
- Durability dulls with use — yes (`Tools.use` on hunt/dig).
- First hard tip → Discoveries — yes.
- Art tip sheets — yes.
- Out of scope (thrown spears / bows / metal blades) — untouched.

## Paths
- RC: `/workspace/godsim-rc` (v34)
- Backup: `/workspace/godsim-rc-v33`
- Headless: `/workspace/godsim-rc/tests/headless_tip37.js`
- This note: `/workspace/godsim-rc/progress_v34.md`
