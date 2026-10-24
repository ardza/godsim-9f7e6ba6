# v19 (step 24: phone Powers row, spawn-watch curiosity fades over 7 days, a carried baby dies with its struck carrier, Find button; growth recheck): deaths, births and populations, no powers used

Run on Fri Oct 23, 2026 (PDT). 2 years (56 days), seeds 1-16, `node tests/deaths_run.js <seed> 2`. **No power is cast**, and the powers stream (`powers.rs`) is never drawn.

**Target: 12 of 16 seeds growing. Result after the growth recheck: 12/16, so the target is met.**

- **Before tuning (lonerTiles 15):** 11/16, the same as v18 seed for seed. Neither v19 rule acts without powers: the curiosity fade needs someone to watch a Spawn, and the baby death needs a god-cast Lightning strike. `Powers.curioStep` makes no RNG draws, and the phone row and Find are UI only.
- **The one tuning step:** following the seed 4 diagnosis below, `person.warmth.lonerTiles` goes from 15 to 20 (data/config.js). A loner at warmth 20 or below now looks 20 tiles, not 15, for someone to press in beside. Nothing else changed. Natural lightning still leaves lit sticks, as the spec says.

## Summary

| run | deaths | grew | births | seeds with births | start / y1 / y2 |
|---|---|---|---|---|---|
| v18 final | 5 | 11/16 | 44 | 14/16 | 97 / 102 / 136 |
| v19 before tuning (lonerTiles 15) | 5 | 11/16 | 44 | 14/16 | 97 / 102 / 136 |
| **v19 final (lonerTiles 20)** | **4** | **12/16** | **41** | **13/16** | **97 / 104 / 134** |

Final deaths: 4, all cold, all adults.

- Seed 1: Deep Cold day 25.
- Seed 6: day 26.
- Seed 9: day 54, in year 2.
- Seed 10: day 25.

No one died from lightning or burns. No baby died.

- **Seeds that did not grow:** 1 (5→5), 4 (5→5, no deaths now but no birth), 10 (7→6) and 16 (5→5, no birth).
- **Newly growing:** seed 5 (5→6, its cold death is gone).

Seed 4 no longer loses anyone. Seed 1 lost one adult but gained a birth, so it still ends at 5. Seed 10 still loses one adult and now has no birth (7→6).

**Trade-off.** Births fall from 44 to 41 and year 2 population from 136 to 134. This matters because the seeds are chaotic: changing one walk shifts the RNG order for the rest of the run. 12/16 is met, but the overall headcount is about the same.

## Why seed 4 shrinks (logged before any tuning, per the step 24 spec)

Traced with `/tmp/s4/trace.js 4`: a sample every game hour through Deep Cold, plus each victim's own log. Seed 4 starts with 5 founders, 3 women and 2 men: Tesh (m), Vesk (m), Inn (f), Rasha (f) and Holm (f). It ends year 1 with 3 people (Vesk, Rasha, Holm) and no pair. It ends year 2 with 4 people: one birth late in year 2 is not enough to get back to 5.

**Year 1 Deep Cold kills two loners.** Both died alone, with no group, no partner, and nobody within 1.5 tiles in any hourly sample (nb0). Both spent the coldest days making long food and water trips instead of keeping warm.

- **Tesh** (coldFear 57; knows 1 shelter, the thicket).
  - **Day 24:** warmth falls from 49 to 0 while he walks about 28 tiles east, from the den area (x 28) to the lake (x 48) and the berries (x 56), and then back. The air is 27-41 °F, all below the 50 °F neutral point, so every hour away costs warmth. Food was low (fullness 2 at noon), so the trips beat warmth.
  - **Night of day 24:** he sleeps alone on open meadow, 4 tiles from a fire, with no company. His warmth stays at 0.
  - **Day 25:** he spends the day on more lake and berry trips with fullness at 0. At 10:12 PM he "presses in beside Rasha" for a moment. Then he heads back towards the thicket and dies of cold at 11:36 PM, still walking, a full game day after his warmth hit 0.
- **Inn** (coldFear 77; knows 0 shelters).
  - **Night of day 24:** she sleeps from 7 PM on open meadow, 8 tiles from a fire, alone. Her warmth falls from 46 to 9 by 2 AM. She wakes (parched) and walks to the lake; her warmth is 0 by 3 AM on day 25.
  - **Day 25:** she spends the day on water and berry trips along the far north and west edge (x 8-18, y 1-16), 20-32 tiles from any fire, with "the bush was bare" at 12:30 PM. Rasha pressed in beside her once (8:21 AM) and she copied huddling, but nobody stayed.
  - **6:04 PM, day 25:** she collapses from exhaustion on open sand and sleeps there, 20 tiles from the nearest fire, with nobody near. She dies at 2:50 AM on day 26.

**Root cause.** In this world the water (the lake) and the berries are far from the fire and the woods. In Deep Cold the two loners kept making meal and water trips while their warmth was 0. When warmth was urgent (≤ 20), the "nearest person within lonerTiles (15)" rescue never fired, because the group was more than 15 tiles away. The `nightFirstBelow` rule only covers night food trips, and water always wins over warmth. Nobody paired in year 1, so no child was coming to make up for the two deaths. Seed 4 has shrunk in every build since v17 (v17: 4/4, 0 births, 1 death).

- **Lightning:** neither victim's log shows a bolt walk or a lit-stick carry in their last 25 lines. The seed's 2 bolt walks belong to others.
- **Chaos:** the experiments below show how much the seed's result swings on RNG order. With no natural bolt sticks, seed 4 still loses an adult. With lonerTiles 20, 25 or 30 it loses nobody, but it still does not grow: no birth within 2 years (0 or 1 pair, formed late or never).

## Growth experiments (16 seeds, 2 years, no powers; scratch copies in /tmp, only lonerTiles 20 kept)

| variant | deaths | grew | births | seeds with births | start / y1 / y2 |
|---|---|---|---|---|---|
| v19 before tuning | 5 | 11/16 | 44 | 14/16 | 97 / 102 / 136 |
| no natural bolt sticks (`boltStick: null`), diagnostic only: against the spec | 3 | 13/16 | 42 | 14/16 | 97 / 105 / 136 |
| **lonerTiles 20 (kept)** | **4** | **12/16** | **41** | **13/16** | **97 / 104 / 134** |
| lonerTiles 25 | 4 | 12/16 | 40 | 12/16 | 97 / 104 / 133 |
| lonerTiles 30 | 4 | 12/16 | 40 | 12/16 | 97 / 104 / 133 |

- I kept 20 because it is the smallest step that meets the target, and 25 and 30 add nothing.
- Undoing natural bolt sticks gives 13/16. The spec keeps them ("natural lightning also leaves lit sticks"), so this is not used.
- A softer Deep Cold window, where all the deaths fall, is the other lever. It is not tried here, because it changes the climate.
- The headless check (21b) now expects 20 tiles and adds a join from 17-19 tiles away.

## Per seed (final, lonerTiles 20, no powers)

| seed | f/m | start | y1 | y2 | grew | births | pairs | deaths | lightning fires | bolt sticks | bolt walks | bolt carries | v19 before tuning (y1/y2, births, deaths) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2/3 | 5 | 4 | 5 | no | 1 | 2 | cold (adult, Deep Cold day 25) | 123 | 8 | 1 | 1 | 5/5, 0 b, 0 d |
| 2 | 2/5 | 7 | 8 | 11 | yes | 4 | 2 | - | 104 | 12 | 2 | 2 | same |
| 3 | 3/2 | 5 | 6 | 8 | yes | 3 | 2 | - | 97 | 3 | 0 | 0 | 6/9, 4 b, 0 d |
| 4 | 3/2 | 5 | 5 | 5 | no | 0 | 1 | - | 119 | 5 | 2 | 2 | 3/4, 1 b, 2 d |
| 5 | 3/2 | 5 | 5 | 6 | yes | 1 | 1 | - | 110 | 0 | 0 | 0 | 4/5, 1 b, 1 d |
| 6 | 5/3 | 8 | 8 | 11 | yes | 4 | 2 | cold (adult, Deep Cold day 26) | 102 | 11 | 2 | 2 | 8/12, 5 b, 1 d |
| 7 | 3/2 | 5 | 6 | 9 | yes | 4 | 2 | - | 110 | 1 | 0 | 0 | 6/7, 2 b, 0 d |
| 8 | 2/4 | 6 | 6 | 7 | yes | 1 | 1 | - | 109 | 1 | 0 | 0 | 6/8, 2 b, 0 d |
| 9 | 4/4 | 8 | 9 | 9 | yes | 2 | 2 | cold (adult, Deep Cold day 54) | 110 | 0 | 0 | 0 | 9/11, 3 b, 0 d |
| 10 | 2/5 | 7 | 6 | 6 | no | 0 | 1 | cold (adult, Deep Cold day 25) | 120 | 9 | 1 | 1 | 6/7, 1 b, 1 d |
| 11 | 4/2 | 6 | 6 | 8 | yes | 2 | 2 | - | 128 | 0 | 0 | 1 | same |
| 12 | 5/3 | 8 | 10 | 16 | yes | 8 | 3 | - | 116 | 6 | 0 | 1 | same |
| 13 | 3/4 | 7 | 8 | 10 | yes | 3 | 3 | - | 123 | 4 | 0 | 0 | same |
| 14 | 3/2 | 5 | 6 | 9 | yes | 4 | 2 | - | 92 | 3 | 2 | 1 | same |
| 15 | 3/2 | 5 | 6 | 9 | yes | 4 | 1 | - | 103 | 0 | 0 | 0 | same |
| 16 | 3/2 | 5 | 5 | 5 | no | 0 | 1 | - | 121 | 0 | 0 | 0 | same |

"lightning fires" means natural lightning fires in 2 years. "bolt sticks" means lit sticks made by those fires. "bolt walks" and "bolt carries" mean walks to a lit stick and pickups of one. "same" means the seed matches v19 before tuning, which is also v18, exactly.
