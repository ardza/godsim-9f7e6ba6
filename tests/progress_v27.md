# Progress v27 — Disease powers (Cure / Plague)

**Save:** 27 (`?v=27`)  
**Spec:** `specs/15b-17.md` §30 — LOCKED  
**Date:** 2026-10-24 (America/Los_Angeles)

## Done
- `saveVersion: 27`; all `index.html` asset `?v=27`.
- God powers **Cure** (circle clears `sick`) and **Plague** (circle seeds v25 sick).
- Same tap-then-map flow as Warm/Cool; **no cooldown**.
- `Powers.answer` on cast → prayer coincidence reinforces ritual forms (faithTiles / faithMinutes).
- UI Powers row from `powers.order` after Spawn; Artist SVG keys `cure` / `plague` already in `icons.js`.
- Tint aim colors for cure (green) / plague (magenta).
- `Disease.clearPower` — clears without Discoveries / per-person recover spam; place log only.
- Plague infect source `"plague"` → action-only “doubles over as the air turns foul”.
- Migrate 26→27 (cast counters).
- Headless: `tests/headless_powers30.js` — **ALL PASS**.

## Headless proofs
- Cure clears ≥1 sick in circle; outsider unchanged.
- Plague seeds ≥1 in circle (v25 drain ×); outsider unchanged.
- Prayer reinforce on Cure and Plague.
- migrate 26→27; no cooldown; icons + `?v=27`.

## FREEZE
- Keep `godsim-rc-v26` (live freeze backup).
- Copy `godsim` → `godsim-rc` (Tester).
- **Do NOT publish.**

## Notes
- `data/art.js` had a missing comma before early §31 hide entries (Artist foreshadow); fixed so headless loads.
- No MessageSubagent Director mid-build delta beyond §30 LOCKED text.
