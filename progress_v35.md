# Progress — saveVersion 35 / §38 Hard seasons

**FROZEN** to `/workspace/godsim-rc` (saveVersion 35).  
Backup left alone: `/workspace/godsim-rc-v34`. Live stays 34 until Tester PASS + Judge publish.

Freeze time: 2026-10-24 17:53 PDT (America/Los_Angeles).

## Done
- `data/config.js` — `saveVersion: 35`; `climate.hard` ramp:
  - `rampYears: 4` (full harshness at yearIndex ≥ 4)
  - `meanDeltaC: [0, -2, -6, -20]` (Deep Cold 15→−5°C at full)
  - `dayAmpAddC: [0, 0.5, 2, 6]` (stronger nights in Deep Cold)
  - `stormX: [1, 1.1, 1.4, 2.5]` (lightning rate × at full)
  - Base `seasonMeanC: [18, 23, 19, 15]` + `dayAmpC: 4` **unchanged** (mild coastal New Game).
- `src/climate.js` — `yearIndex` / `hardT` / `seasonMeans` / `dayAmp`; `airC` uses ramped means + amp.
- `src/fire.js` — natural lightning rate × `stormX` × `hardT`.
- `src/sim.js` — migrate **34→35**.
- `index.html` — all `?v=35`.
- Rain/wet clamp from v29 — untouched (still blocks daytime warmth climb when exposed).
- Headless: `tests/headless_season38.js` — **ALL PASS** in working copy and in `godsim-rc` after freeze.

## Balance note (§38)
- Year 0 Deep Cold night ~52°F, warmthEq ~53 — open air soft; no Ice Age on New Game.
- Year 4 Deep Cold night ~6°F, warmthEq 0 — open air drains to hypo (stage 3 in 8h fixture).
- Hut + hide + fire at same air: felt eq ~83, warmth holds ~83 over 8h vs open at 0.
- Greening stays near mild even at full ramp (meanDelta 0 on season 0).
- Not a blocker: no instant mass death on New Game; harshness is the year ramp.

## Spec check (§38)
- Seasons that can kill without shelter/hides/fire — yes (later Deep Cold).
- Mild coastal start stays — yes (yearIndex 0 hardT=0).
- Harshness ramps with year / Deep Cold — yes.
- Not sudden permanent Ice Age on New Game — yes.
- Rain/wet clamp v29 still applies — yes.
- Headless: year-0 open survives more than year-N; hut+hide+fire death/warmth better; migrate 34→35 — yes.

## Next
- Waiting Tester blockers-only on `godsim-rc`, then Judge publish.
- Live stays 34 until Judge publishes.

## Paths
- RC: `/workspace/godsim-rc` (v35)
- Backup: `/workspace/godsim-rc-v34` (kept; not overwritten)
- Headless: `/workspace/godsim-rc/tests/headless_season38.js`
- This note: `/workspace/godsim/progress_v35.md`
