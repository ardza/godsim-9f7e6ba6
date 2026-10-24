# Progress v30 — Sacred places (§33)

**Save:** 30 (`?v=30`)  
**Spec:** `specs/15b-17.md` §33 — LOCKED  
**Date:** 2026-10-24 (America/Los_Angeles)  
**Status:** FROZEN to `godsim-rc` for Tester blockers-only. Live stays 29 until Judge publishes.

## §33 Sacred places

- Prayer spots already existed (Faith). When `spot.n >= spotMin` (3), set `spot.marker` and draw Artist `data/art/sacred_16.png` (soft worn-ground) over the stone pile.
- Marker is decorative + clickable inspect (“Worn ground” / prayer count / known groups). Not a building. No named gods.
- Personal memory `a.sacred`; groups with **shared speech** get `g.sacred` once a member prayed there or saw the marker (shared to members). Preserved across daily group rebuild.
- Idle drift (`Faith.maybeDriftSacred`): Faith ≥ `sacredFaith` **or** needs all ≥ `sacredNeeds`, not starving/fleeing → walk toward a known marked spot within `driftTiles` (goal `sacred`). Action-only; no speech/quoted words.
- Migrate 29→30: spots already at threshold get `marker: true`; `a.sacred` / `g.sacred` arrays.

## Files
- `src/faith.js` (marker / know / see / drift), `src/sim.js` (migrate30), `src/agent.js`, `src/social.js`, `src/render.js`, `src/main.js`, `src/ui.js`
- `data/config.js` (`saveVersion: 30`, sacredFaith / sacredNeeds / sacredDrift / sacredSight), `data/art.js` (already had sacred), `index.html` (`?v=30`)
- `tests/headless_sacred33.js`, `tests/progress_v30.md`

## Headless
`node tests/headless_sacred33.js` — **ALL PASS**
- marker after ≥3 prayers; spot inspect id
- shared-speech group-known + member share; ≥1 sacred drift
- see-marker → personal know
- migrate 29→30

## Standing
- Action-only logs; data-driven; °F/12h; text≥16px taps≥44px.
- Out of scope (not built): deities, temples, priesthood, forced pilgrimages, holy-site combat.

## FREEZE
- **Do NOT freeze yet.** Wait for v29 Tester PASS + Judge publish.
- Working copy = 30; `godsim-rc` = 29 (untouched this pass).
