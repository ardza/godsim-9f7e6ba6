# v18 (step 23: Lightning / Spawn god powers, lit sticks): deaths, births and populations, no powers used

Run on Fri Oct 23, 2026 (PDT). 2 years (56 days), seeds 1-16, `node tests/deaths_run.js <seed> 2`. **No power is cast**, and the powers stream (`powers.rs`) is never drawn. The run is still not identical to v17, though. **Natural lightning fires now leave lit "bolt" sticks too** (any stick within 1 tile of a lightning fire smoulders for 6 h). Founders who see one (within 12 tiles) roll curiosity minus fear and may walk to it and carry it. That roll draws on `lrng`, and the walks change who is where. So 6 of the 16 seeds (1, 2, 4, 6, 10, 12) play out differently from v17. The other 10 (marked "same") match v17 seed for seed.

## Summary vs v17

| run | deaths | grew | births | seeds with births | start / y1 / y2 |
|---|---|---|---|---|---|
| v17 final | 3 | 13/16 | 42 | 14/16 | 97 / 105 / 136 |
| **v18** | **5** | **11/16** | **44** | **14/16** | **97 / 102 / 136** |

Deaths: 5, all cold, all adults: seed 4 ×2 (Deep Cold days 25 and 26), seed 5 (day 26), seed 6 (day 26) and seed 10 (day 25). Seed 2's v17 cold death does not happen in v18. Seed 5's death is the same as in v17.

- Seeds with births: 14/16, the same as v17. Births: 44 (v17: 42). Population at year 2: 136, the same as v17.
- Grew: 11/16 (v17: 13/16).
  - Seed 1 ends at 5 (v17: 6, with 1 birth).
  - Seed 10 ends at 7 (v17: 10) after a cold death.
  - Seed 12 does better: 16 (v17: 11).
- No one died from lightning or burns. Bolt carries are 0-2 per seed.
- Every changed seed had bolt sticks. The worse cold outcomes on seeds 4, 6 and 10 look like butterfly effects (the extra `lrng` draws and walks shift what comes later), not a direct cost: all 5 deaths are cold deaths on Deep Cold days 25-26, the same window as the v17 deaths (not checked against the timing of each bolt walk). Seed 14 had bolt walks and still matches v17.

"lightning fires" = natural lightning fires in 2 years (this was already in v17; it is counted now). "bolt sticks" = lit sticks made by those fires. "bolt walks" / "bolt carries" = walks to a lit stick and pickups of one.

## Per seed (no powers)

| seed | f/m | start | y1 | y2 | grew | births | pairs | deaths | lightning fires | bolt sticks | bolt walks | bolt carries | v17 (y1/y2, births, deaths) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2/3 | 5 | 5 | 5 | no | 0 | 1 | - | 124 | 6 | 1 | 1 | 5/6, 1 b, 0 d |
| 2 | 2/5 | 7 | 8 | 11 | yes | 4 | 2 | - | 101 | 11 | 2 | 2 | 8/11, 5 b, 1 d |
| 3 | 3/2 | 5 | 6 | 9 | yes | 4 | 2 | - | 97 | 6 | 0 | 0 | same |
| 4 | 3/2 | 5 | 3 | 4 | no | 1 | 1 | cold (adult, Deep Cold day 25); cold (adult, Deep Cold day 26) | 120 | 5 | 2 | 2 | 4/4, 0 b, 1 d |
| 5 | 3/2 | 5 | 4 | 5 | no | 1 | 1 | cold (adult, Deep Cold day 26) | 127 | 2 | 0 | 0 | same |
| 6 | 5/3 | 8 | 8 | 12 | yes | 5 | 3 | cold (adult, Deep Cold day 26) | 97 | 12 | 3 | 2 | 9/13, 5 b, 0 d |
| 7 | 3/2 | 5 | 6 | 7 | yes | 2 | 2 | - | 113 | 1 | 0 | 0 | same |
| 8 | 2/4 | 6 | 6 | 8 | yes | 2 | 2 | - | 108 | 1 | 0 | 0 | same |
| 9 | 4/4 | 8 | 9 | 11 | yes | 3 | 2 | - | 113 | 0 | 0 | 0 | same |
| 10 | 2/5 | 7 | 6 | 7 | no | 1 | 2 | cold (adult, Deep Cold day 25) | 126 | 4 | 0 | 0 | 8/10, 3 b, 0 d |
| 11 | 4/2 | 6 | 6 | 8 | yes | 2 | 2 | - | 128 | 0 | 0 | 0 | same |
| 12 | 5/3 | 8 | 10 | 16 | yes | 8 | 3 | - | 116 | 6 | 0 | 1 | 9/11, 3 b, 0 d |
| 13 | 3/4 | 7 | 8 | 10 | yes | 3 | 3 | - | 123 | 4 | 0 | 0 | same |
| 14 | 3/2 | 5 | 6 | 9 | yes | 4 | 2 | - | 92 | 3 | 2 | 1 | same |
| 15 | 3/2 | 5 | 6 | 9 | yes | 4 | 1 | - | 102 | 0 | 0 | 0 | same |
| 16 | 3/2 | 5 | 5 | 5 | no | 0 | 0 | - | 119 | 0 | 0 | 0 | same |
