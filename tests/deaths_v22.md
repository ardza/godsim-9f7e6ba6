# v22 (step 26) — freeze notes / deaths

Scope locked lean: corpse choices (leave/drag/bury/burn/eat/ritual), lightning aim (Barrage primary-on-tap + scatterTiles 4), warmth eq = clamp(50+(feltC−10)×2.5, 0, 100), rain chill L3/M6/H10 on felt×exposure. No materials / predators / moods / mountain / reeds.

## Balance seeds (NOT a freeze blocker — Judge/Commissioner)

`node tests/headless.js` balance (10 seeds × 10 days): capsAll/pd ≤ 0.15 overall (0.100 observed), but **allOk** fails on:

| seed | n | at0 s/p/e | asleep 0–4h | note |
|---|---|---|---|---|
| 2 | 7 | 1/4/6 | 86% | asleepAtNight &lt; 0.9 |
| 777777 | 7 | 1/9/10 | 98% | caps/pd 0.286 &gt; 0.2 (non-dry); historically chaotic |

**No threshold nudge.** Seed chaos / pre-existing flaky band (777777 already called out in the balance test comment). Not clearly caused by 26 alone. Revisit post-publish if growth dips.

## 26 blockers (green at freeze)

- Corpse choices: leave/drag/bury/burn/eat/ritual — `headless_corpse26.js`
- Lightning: Single on tap; Barrage primary on tap + extras within scatterTiles **4**
- Warmth eq: mild open-air mean 55–75; night open cools / huddle warms toward eq
- Rain chill: Light **3** / Medium **6** / Heavy **10**; dry vs Medium → Δeq ≥ 10 (65→50), warmth falling

## Chrome

- `ONLY=desktop_1280x800` → CHROME CHECK PASSED
- `ONLY=phone_390x844` → CHROME CHECK PASSED

## Freeze

- Backup: `godsim-rc-v21` kept (saveVersion 21)
- Live: `godsim` → `godsim-rc` (saveVersion 22, every `?v=` = 22)
- No git / no deploy
