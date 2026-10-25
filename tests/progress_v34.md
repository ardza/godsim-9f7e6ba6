# Progress — saveVersion 34 / §37 Hard points

**Working copy only:** `/workspace/godsim`  
**Do NOT freeze yet** — wait for v33 PASS + Judge publish. Live stays 32 (or 33 after publish); `godsim-rc` is on v33 for Tester.

## Done
- `data/config.js` — `saveVersion: 34`; `tools.tip` (points ore|flint, shafts stick|bone, digMult 0.55, huntOddsAdd 0.25); `hunt.odds.tip`.
- `src/tools.js` — tip craft: `finishTip` / `tryTip` / `maybeTip` / `startTip` / `stepTip`; onTry strike ore|flint onto stick|bone when score ≥45; dig/hunt helpers; Discoveries “First hard tip”; dulls with use.
- `src/hunt.js` — tip hunt odds add; tip wears on strike; tip counts as cut tool for meat.
- `src/agent.js` — act `tip` + arrive goal `tip`.
- `src/sim.js` — migrate **33→34**.
- `src/render.js` / `data/art.js` — Artist tip_stick_16 / tip_bone_16 / tip_16 already wired.
- `index.html` — all `?v=34`.
- Headless: `tests/headless_tip37.js` — **ALL PASS** (craft ≥45, dig/hunt bonus, Discoveries, dull, onTry, score gate, ≥1 tip on 8/8 seeds, migrate 33→34 + round-trip).

## Spec check (§37)
- Strike ore or flint onto stick or bone → harder tip when score ≥45 — yes.
- Carried tip: hunt / dig bonus — yes (huntOddsAdd 0.25; digMult 0.55).
- Durability dulls with use — yes (`Tools.use` on hunt/dig).
- First hard tip → Discoveries — yes.
- Art tip sheets — yes.
- Out of scope (thrown spears / bows / metal blades) — untouched.

## Next
- Wait for Tester v33 PASS + Judge publish, then freeze v34 to rc.
- Then §38 / v35 Hard seasons.

## Paths
- Headless: `/workspace/godsim/tests/headless_tip37.js`
- This note: `/workspace/godsim/tests/progress_v34.md`
- `godsim-rc` untouched (still saveVersion 33).
