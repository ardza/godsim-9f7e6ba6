# v17 (step 22: Rain / Warm / Cool god powers, man + woman pairs only): deaths, births and populations, no powers used

Run on Fri Oct 23, 2026 (PDT). 2 years (56 days), seeds 1-16, `node tests/deaths_run.js <seed> 2`. **No power is cast.** The powers module draws from its own stream only while an effect is active, so with no powers used the only change from v16 that affects behaviour is the Director call: pairs are man + woman only (same-sex bonds stay as close friendship).

## Summary vs v16

| run | deaths | grew | births | seeds with births | start / y1 / y2 |
|---|---|---|---|---|---|
| v16 final (r2) | 4 | 10/16 | 31 | 11/16 | 97 / 105 / 124 |
| **v17 final** | **3** | **13/16** | **42** | **14/16** | **97 / 105 / 136** |

The target was births on 14/16. **It is met: 14/16** (no births on seeds 4 and 16).
- Seed 4 forms 2 pairs but has no birth in 2 years. Seed 16 (3 women, 2 men) forms no pair in 2 years.
- In v16, same-sex pairs took founders out of the mating pool on small seeds. With mixed-only pairing, the number of seeds with births goes from 11 to 14, and births go from 31 to 42.

Deaths: 3, all cold, all adults: seed 2 (adult, Deep Cold day 25); seed 4 (adult, Deep Cold day 25); seed 5 (adult, Deep Cold day 26). Deaths in v16: 4 cold.

## Per seed (no powers)

"entered" = times someone got into a shelter. "know" = living people who know a shelter. "learned" = `Shelter.learnedCount`, which is the same value that `shelterStats.learned` now carries.

| seed | f/m | start | y1 | y2 | grew | births | pairs | deaths | entered | know | learned |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2/3 | 5 | 5 | 6 | yes | 1 | 1 | - | 23 | 5 | 5 |
| 2 | 2/5 | 7 | 8 | 11 | yes | 5 | 2 | cold (adult, Deep Cold day 25) | 199 | 5 | 5 |
| 3 | 3/2 | 5 | 6 | 9 | yes | 4 | 2 | - | 20 | 5 | 5 |
| 4 | 3/2 | 5 | 4 | 4 | no | 0 | 2 | cold (adult, Deep Cold day 25) | 16 | 4 | 3 |
| 5 | 3/2 | 5 | 4 | 5 | no | 1 | 1 | cold (adult, Deep Cold day 26) | 7 | 1 | 1 |
| 6 | 5/3 | 8 | 9 | 13 | yes | 5 | 3 | - | 19 | 5 | 3 |
| 7 | 3/2 | 5 | 6 | 7 | yes | 2 | 2 | - | 14 | 5 | 5 |
| 8 | 2/4 | 6 | 6 | 8 | yes | 2 | 2 | - | 105 | 6 | 6 |
| 9 | 4/4 | 8 | 9 | 11 | yes | 3 | 2 | - | 7 | 4 | 3 |
| 10 | 2/5 | 7 | 8 | 10 | yes | 3 | 2 | - | 97 | 7 | 7 |
| 11 | 4/2 | 6 | 6 | 8 | yes | 2 | 2 | - | 55 | 6 | 3 |
| 12 | 5/3 | 8 | 9 | 11 | yes | 3 | 3 | - | 28 | 8 | 6 |
| 13 | 3/4 | 7 | 8 | 10 | yes | 3 | 3 | - | 2 | 2 | 0 |
| 14 | 3/2 | 5 | 6 | 9 | yes | 4 | 2 | - | 18 | 5 | 5 |
| 15 | 3/2 | 5 | 6 | 9 | yes | 4 | 1 | - | 8 | 4 | 3 |
| 16 | 3/2 | 5 | 5 | 5 | no | 0 | 0 | - | 33 | 3 | 3 |

Reproducible: the earlier pairing-only run (/tmp/v17a) gave the same numbers, seed for seed, before the UI, render and `shelterStats.learned` changes. Those changes do not alter the simulation.
