# v21 (step 25 polish: speech UI/Discoveries/child copy x2, inventDiv 200, growth recheck): deaths, births and populations, no powers used

Run on Fri Oct 23, 2026 (PDT). 2 years (56 days), seeds 1-16, `node tests/deaths_run.js <seed> 2`. **No power is cast**, and the powers stream (`powers.rs`) is never drawn.

**Target: 12 of 16 seeds growing. Result: 12/16, so the target is met.**

Speech inventDiv was raised 300→200 in this polish for the silent-world case (see `tests/progress_v21.md`); that only affects token invent chance and does not change warmth, pairing, or death. Growth numbers below are from the v21 codebase with lonerTiles 20 (kept from v19).

## Summary

| run | deaths | grew | births | seeds with births | start / y1 / y2 |
|---|---|---|---|---|---|
| v19 final (lonerTiles 20) | 4 | 12/16 | 41 | 13/16 | 97 / 104 / 134 |
| **v21 (lonerTiles 20, inventDiv 200)** | **4** | **12/16** | **41** | **13/16** | **97 / 104 / 134** |

Final deaths: 4, all cold, all adults.

- Seed 1: cold, adult, Deep Cold day 25, age 36.
- Seed 6: cold, adult, Deep Cold day 26, age 24.
- Seed 9: cold, adult, Deep Cold day 54, age 23.
- Seed 10: cold, adult, Deep Cold day 25, age 20.

- **Seeds that did not grow:** 1 (5→5), 4 (5→5), 10 (7→6), 16 (5→5).

## Why seeds shrink or stay flat

### Seed 1 (5→4→5; births 1; deaths 1) — flat

- Founders ffmmm; 2 pairs by year 2.
- One adult (age 36) dies of cold in Deep Cold day 25; one birth later brings the count back to 5. Net flat, not growing.

### Seed 4 (5→5→5; births 0; deaths 0) — flat (same pattern as v19)

- Founders fffmm; 1 pair forms but no birth within 2 years.
- No deaths (lonerTiles 20 still prevents the v18/v19-pre Deep Cold loner freezes). Same non-growth as v19: pairing alone is not enough in this chaotic seed.

### Seed 10 (7→6→6; births 0; deaths 1) — shrinks

- Founders ffmmmmm (2 women, 5 men); 1 pair; 0 births.
- One adult (age 20) dies of cold in Deep Cold day 25. Loners walk/join a lot (525 walks, 43 joins, 685 urgentWarm) but the death is not replaced. Same shrinker as v19.

### Seed 16 (5→5→5; births 0; deaths 0) — flat

- Founders fffmm; 1 pair; 0 births in 2 years; no deaths. Same as v19.

## Per seed

| seed | start | y1 | y2 | grew | births | deaths |
|---|---|---|---|---|---|---|
| 1 | 5 | 4 | 5 | no | 1 | 1 |
| 2 | 7 | 8 | 11 | yes | 4 | 0 |
| 3 | 5 | 6 | 8 | yes | 3 | 0 |
| 4 | 5 | 5 | 5 | no | 0 | 0 |
| 5 | 5 | 5 | 6 | yes | 1 | 0 |
| 6 | 8 | 8 | 11 | yes | 4 | 1 |
| 7 | 5 | 6 | 9 | yes | 4 | 0 |
| 8 | 6 | 6 | 7 | yes | 1 | 0 |
| 9 | 8 | 9 | 9 | yes | 2 | 1 |
| 10 | 7 | 6 | 6 | no | 0 | 1 |
| 11 | 6 | 6 | 8 | yes | 2 | 0 |
| 12 | 8 | 10 | 16 | yes | 8 | 0 |
| 13 | 7 | 8 | 10 | yes | 3 | 0 |
| 14 | 5 | 6 | 9 | yes | 4 | 0 |
| 15 | 5 | 6 | 9 | yes | 4 | 0 |
| 16 | 5 | 5 | 5 | no | 0 | 0 |

