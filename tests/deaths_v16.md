# v16 (step 21b: natural shelters, People tab, Director 21b calls): deaths and populations

Final run (r2, after the thicket-routing fix), 2 years (56 days), seeds 1-16, `node tests/deaths_run.js <seed> 2`, same climate as v15 (no climate value changed).
Stages: adult 16+, youth 12-16, child 3-12, baby 0-3.

## Deaths by cause, v16 vs v15

| cause | v16 adult | v16 youth | v16 child | v16 baby | v16 total | v15 total |
|---|---|---|---|---|---|---|
| cold | 4 | 0 | 0 | 0 | 4 | 4 |
| thirst | 0 | 0 | 0 | 0 | 0 | 0 |
| hunger | 0 | 0 | 0 | 0 | 0 | 0 |
| old age | 0 | 0 | 0 | 0 | 0 | 0 |
| other (left alone) | 0 | 0 | 0 | 0 | 0 | 1 |
| all | 4 | 0 | 0 | 0 | 4 | 5 |

All 4 v16 deaths are adults in Deep Cold in year 2 (seed 1 day 52; seed 5 day 26; seed 16 days 52 and 54).

| run | deaths | grew | births | seeds with births | start / y1 / y2 |
|---|---|---|---|---|---|
| v15 final | 5 | 10/16 | 22 | 11/16 | 97 / 100 / 114 |
| v16 r1 (before the routing fix) | 0 | 12/16 | 27 | 12/16 | 97 / - / 122 |
| **v16 final (r2)** | **4** | **10/16** | **31** | **11/16** | **97 / 105 / 124** |

Targets were births on 14/16 or more and growth on 12/16. Final: births on 11/16 and growth on 10/16. Both are missed (see the diagnosis below).

r1 and r2 differ only by the routing fix: walks are now planned by time, so people go round a thicket when that is quicker. On seeds 1-16 the deaths moved 0 -> 4.
To check whether the fix itself costs lives, I ran seeds 17-32 for 2 years with and without it:
- with the fix: 7 deaths, 10/16 grew, 33 births;
- without it: 8 deaths, 9/16 grew, 31 births.

The difference is run-to-run divergence, not the fix. A single cold death in year 2 on a 5-person seed is enough to flip "grew".

## Per seed

Founders f/m, then population at start / y1 / y2. "entered" = times someone got into a shelter. "warm wakes" = woke inside with warmth >= 50. "know" = living people who know at least one shelter. "learned" = know one and den score above the start. "loner joins" = loners at warmth <= 20 who reached someone. The last column is v15's y2 / births / deaths.

| seed | f/m | start | y1 | y2 | grew | births | deaths | shelters (types: c = cave, o = overhang, t = thicket; digit = tiles) | entered | warm wakes | know | learned | first shelter use | loner joins | v15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2/3 | 5 | 5 | 4 | no | 0 | cold (adult, Deep Cold day 52) | 7 (1 cave, 3 overhang, 3 thicket): t2 o1 c3 o1 t4 o1 t2 | 26 | 11 | 4 | 4 | Zaba cave | 31 | v15: 5 / 0 / 0 |
| 2 | 2/5 | 7 | 8 | 9 | yes | 2 | 0 | 7 (2 cave, 2 overhang, 3 thicket): c3 c3 t4 o1 t3 o1 t2 | 178 | 39 | 6 | 5 | Cael cave | 40 | v15: 9 / 2 / 0 |
| 3 | 3/2 | 5 | 6 | 9 | yes | 4 | 0 | 6 (0 cave, 0 overhang, 6 thicket): t4 t3 t3 t4 t3 t3 | 20 | 6 | 5 | 5 | Tull thicket | 27 | v15: 7 / 2 / 0 |
| 4 | 3/2 | 5 | 5 | 5 | no | 0 | 0 | 7 (2 cave, 0 overhang, 5 thicket): t4 t4 t4 c3 c3 t2 t2 | 7 | 2 | 2 | 2 | Vesk thicket | 24 | v15: 4 / 0 / 1 |
| 5 | 3/2 | 5 | 4 | 5 | no | 1 | cold (adult, Deep Cold day 26) | 6 (2 cave, 1 overhang, 3 thicket): o1 c3 t4 t2 c3 t3 | 7 | 2 | 1 | 1 | Quo thicket | 15 | v15: 7 / 2 / 0 |
| 6 | 5/3 | 8 | 9 | 13 | yes | 5 | 0 | 4 (0 cave, 1 overhang, 3 thicket): o1 t4 t2 t2 | 8 | 1 | 2 | 1 | Cosk overhang | 47 | v15: 12 / 4 / 0 |
| 7 | 3/2 | 5 | 6 | 7 | yes | 2 | 0 | 6 (0 cave, 3 overhang, 3 thicket): o1 o1 t4 t3 o1 t4 | 14 | 3 | 5 | 5 | Zuri overhang | 33 | v15: 8 / 3 / 0 |
| 8 | 2/4 | 6 | 6 | 6 | no | 0 | 0 | 7 (2 cave, 3 overhang, 2 thicket): o1 t3 o1 t3 c3 c3 o1 | 76 | 20 | 6 | 5 | Aru cave | 36 | v15: 6 / 0 / 0 |
| 9 | 4/4 | 8 | 9 | 11 | yes | 3 | 0 | 6 (1 cave, 1 overhang, 4 thicket): t3 o1 c3 t4 t2 t3 | 9 | 2 | 4 | 3 | Beso thicket | 51 | v15: 9 / 1 / 0 |
| 10 | 2/5 | 7 | 7 | 8 | yes | 1 | 0 | 6 (1 cave, 2 overhang, 3 thicket): o1 o1 c3 t3 t4 t2 | 123 | 30 | 6 | 6 | Yari cave | 48 | v15: 8 / 2 / 1 |
| 11 | 4/2 | 6 | 6 | 6 | no | 0 | 0 | 6 (2 cave, 2 overhang, 2 thicket): o1 t2 t3 c3 o1 c3 | 48 | 7 | 5 | 2 | Bru thicket | 48 | v15: 5 / 0 / 1 |
| 12 | 5/3 | 8 | 9 | 11 | yes | 3 | 0 | 4 (1 cave, 0 overhang, 3 thicket): t2 t4 c3 t2 | 28 | 7 | 8 | 6 | Tull cave | 57 | v15: 8 / 2 / 2 |
| 13 | 3/4 | 7 | 8 | 9 | yes | 2 | 0 | 5 (1 cave, 2 overhang, 2 thicket): c3 t3 t4 o1 o1 | 1 | 1 | 1 | 0 | Ulk thicket | 34 | v15: 9 / 2 / 0 |
| 14 | 3/2 | 5 | 6 | 9 | yes | 4 | 0 | 8 (3 cave, 0 overhang, 5 thicket): c3 c2 t3 t3 t3 c2 t4 t4 | 18 | 7 | 5 | 5 | Bela thicket | 13 | v15: 6 / 1 / 0 |
| 15 | 3/2 | 5 | 6 | 9 | yes | 4 | 0 | 4 (2 cave, 1 overhang, 1 thicket): o1 c3 c3 t4 | 8 | 3 | 4 | 3 | Sabe cave | 23 | v15: 6 / 1 / 0 |
| 16 | 3/2 | 5 | 5 | 3 | no | 0 | cold (adult, Deep Cold day 52); cold (adult, Deep Cold day 54) | 3 (2 cave, 0 overhang, 1 thicket): c3 t4 c3 | 23 | 13 | 1 | 1 | Ula cave | 12 | v15: 5 / 0 / 0 |
Totals:
- Shelters: 92 on 16 seeds (3-8 each): 22 cave, 21 overhang, 49 thicket. They come from the terrain on their own stream, so they are the same in r1, r2 and the headless test.
- Use: 594 entries and 154 warm wakes. 65 living people know a shelter, and 54 have learned (den score above the start).
- First shelter use is a Discoveries entry on every seed.
- 539 loner joins.

## No-birth diagnosis

### 1. v15 values (before any change)

Run with `node tests/births_diag.js <seed> 2`. Values: bond like 75 / fam 70 (both ways), age 16-45; conceive at 2 AM, within 1 tile, fullness 35 / water 35 / warmth 30, chance 0.15.
"Nights" = each 2 AM check of a paired woman, labelled by the first condition that failed.

| seed | founders f/m | pairs formed (day, sexes) | best f+m mutual like/fam | 2 AM nights | births |
|---|---|---|---|---|---|
| 1 | 2/3 | day 36 f+m, day 48 f+m | 99.9 / 100 | asleep apart 13, all gates met 9, fullness 4, water 1, not both asleep 1 | 0 |
| 4 | 3/2 | day 48 f+m | 98.9 / 100 | asleep apart 6, fullness 1, not both asleep 1 | 0 |
| 8 | 2/4 | day 18 m+m, day 20 f+f | 59.6 / 40 | same-sex pair 72 | 0 |
| 11 | 4/2 | day 22 f+f | 47.9 / 43 | same-sex pair 68 | 0 |
| 16 | 3/2 | day 29 f+f | 55.2 / 32 | same-sex pair 54 | 0 |

- Seeds 8, 11 and 16: pairing ignores sex, so the closest friends pair first, and here those are two women (and on seed 8 also two men). No woman-man pair reaches 75 / 70.
- Seeds 1 and 4: woman-man pairs form late and sleep more than 1 tile apart on most nights. Seed 1 met every gate on 9 nights, and getting 0 births at 15% is luck (about 23%).
- The needs gates are rarely the cause.

### 2. Director values (like 65 / fam 60, conception 20%), final v16 code

| seed | founders f/m | pairs formed (day, sexes) | best f+m mutual like/fam (day) | 2 AM nights | births |
|---|---|---|---|---|---|
| 1 | 2/3 | day 34 f+f | 99.9 / 100 (day 54) | same-sex pair 44 | 0 |
| 4 | 3/2 | day 15 m+m, day 25 f+f | 92.8 / 100 (day 55) | same-sex pair 62 | 0 |
| 8 | 2/4 | day 20 m+m, day 38 m+f | 99.9 / 100 (day 52) | asleep apart 14, fullness 2, water 1, all gates met 1 | 0 |
| 11 | 4/2 | day 24 m+m, day 46 f+f | 99.9 / 100 (day 54) | same-sex pair 20 | 0 |
| 16 | 3/2 | day 16 f+f, day 39 m+f | 88.5 / 100 (day 50) | same-sex pair 80, already with child 5, asleep apart 4, all gates met 3 | 0 (a conception, but seed 16 lost 2 adults in Deep Cold on days 52 and 54 before a birth) |

The r1 run (before the routing fix) showed the same picture: seeds 1, 8, 14 and 16 were all blocked by same-sex pairs (88 of 88 nights on seed 14).

Why:
- The lower thresholds make pairs form 2-3 weeks earlier, so the first pair is again the two closest friends.
  With 2-3 women among 5-6 founders, that is often two women or two men. Once paired, each person is taken, so the woman-man pairs that reach 65 / 60 later (best 88-100 / 100) can't form.
- Lowering the thresholds again would not help: it only makes same-sex pairs form sooner.
- Births on >= 14/16 need a pairing rule change, for example pair only f+m for conception, or let a same-sex pair not block a f+m pair. That is not one of the allowed levers, so it is left as an open question.
