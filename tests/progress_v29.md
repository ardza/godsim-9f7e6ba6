# Progress v29 — Carrying & caching + rain/warmth fix

**Save:** 29 (`?v=29`)  
**Spec:** `specs/15b-17.md` §32 — LOCKED  
**Date:** 2026-10-24 (America/Los_Angeles)  
**Status:** FROZEN to `godsim-rc` for Tester blockers-only.

## Rain/warmth bug (Commissioner, live v28) — cause + fix

**Report:** Heavy + Light rain on the same spot; person in that wet area; Warmth still climbed as daytime arrived.

**Cause:** In `src/agent.js` warmth tick, rain `lossX` only amplified *negative* `wr0`. When wet and daytime air/sun/huddle left `wr0 > 0`, the gain was applied unchanged — solar/day climb ignored active rain chill. Soft wet ground (`Powers.wetAt` after rain ends) had no warmth interaction at all.

**Fix (v29):**
1. Active rain (`felt.wet > 0` / `Powers.exposure`): if `wr0 < 0`, still amplify with `lossX`; if `wr0 > 0` and `felt.heat == 0`, clamp `wr = 0` (blocks daytime climb). Fire heat may still warm while wet.
2. Soft wet ground (wet tile, not actively raining, not under shelter/woods): same clamp on positive gain; mild ×1.15 on loss.
3. Overlapping Light+Heavy: `chillCAt` / `lossXAt` already take max — confirmed in headless.
4. Hide/fire/shelter caps unchanged.

## §32 Carrying & caching

- Hands still one item. Prefer **stash** food/tools at known shelter or prayer spot when freeing hands (`Cache.tryStash` before generic drop).
- Personal memory `a.caches` (spot key + lastKinds). Hungry → `Cache.seekRetrieve` before bush/hunt; Tools.maybe seeks tool caches.
- Watching stash/retrieve within sight → copy spot (config `cache.copyChance`).
- First intentional stash → Discoveries “First cache”. Action-only logs.
- Optional art: `data/art/cache_16.png` wired in `art.js` + render tint on remembered tiles.
- Migrate 28→29 (`cacheStats`, `a.caches: []`). `saveVersion: 29`; all `?v=29`.

## Files
- `src/cache.js` (new), `src/agent.js`, `src/objects.js`, `src/tools.js`, `src/sim.js`, `src/render.js`, `src/ui.js`
- `data/config.js`, `data/art.js`, `index.html`
- `tests/headless_cache32.js`, `tests/progress_v29.md`

## Headless
`node tests/headless_cache32.js` — **ALL PASS**
- stash / retrieve / copy-by-watch / Discoveries / tryStash walk
- ≥1 stash + ≥1 retrieve on 3 of 8 seeds (8/8)
- migrate 28→29
- rain+daytime no fire → warmth does not climb; soft wet ground same; Light+Heavy max chill/lossX

## FREEZE
- Keep `godsim-rc-v28` (live freeze backup — do not overwrite).
- Copy `godsim` → `godsim-rc` (Tester).
- **Do NOT publish.** Live stays 28 until PASS + Judge publish.
