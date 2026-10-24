# Progress v28 — Hides and warmth

**Save:** 28 (`?v=28`)  
**Spec:** `specs/15b-17.md` §31 — LOCKED  
**Date:** 2026-10-24 (America/Los_Angeles)  
**Status:** FROZEN to `godsim-rc` for Tester blockers-only.

## Done
- `saveVersion: 28`; all `index.html` asset `?v=28`.
- Material `hide` (soft mass); Artist `hide_16` + `hide_worn_16` sheets wired in `art.js` + render.
- Skinned grazer: first meat take from grazer carcass → one hide (`hideSpawned`); pick up / carry / drop.
- Cold people (warmth < seek or hypo≥1): wear carried/ground hide or sleep under ground hide (Learn `hide` ≥45; curiosity + coldFear).
- Felt °C `wornC: 8` / `sleepC: 6` stacks with fire+shelter, trimmed under existing `shelter.capX × fire.heatC` cap.
- First wear → Discoveries “First hide”.
- Render: ground/carried hide sheet; worn cloak overlay by facing.
- Migrate 27→28 (`hideStats`).
- Headless: `tests/headless_hides31.js` — **ALL PASS**.

## Headless proofs
- Grazer carcass meat take spawns one hide; second take does not.
- Wear / sleep-under when cold; warmth under existing fire+shelter cap.
- First wear → Discoveries; migrate 27→28; `?v=28` + icons/art wired.

## FREEZE
- Keep `godsim-rc-v27` (live freeze backup — do not overwrite).
- Copy `godsim` → `godsim-rc` (Tester).
- **Do NOT publish.** Live stays 27 until PASS + Judge publish.

## Notes
- Parallel with v27 Tester cycle; freeze ordered after v27 PASS / LIVE.
