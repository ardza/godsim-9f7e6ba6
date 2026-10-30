# godsim v38.1 hotfix freeze notes: thirst + cold fix
Code only. saveVersion stays **38** (no new save fields, no migration). Every asset in index.html is now `?v=38.1` (41 refs), same all-files practice as the v38 freeze. Spec: specs/fix_thirst_cold_DRAFT.md. Built on v38 (commit ac4f146); /workspace/godsim matched godsim-rc before the change (only the reed fiber spec draft differed).

## Changes
- **Thirst (src/agent.js:560, 1 line).** A walk to stash a carried item no longer starts while a need is pressing (`!Agent.want(a)`); the item is put down instead. Before, at the shore the stash walk overwrote the drink every tick and people died of thirst next to the lake.
- **Cold (src/agent.js lines 531, 533, 537, 573, 580, 581, 619, 620, 653).** `sim.rng.next()` (a uint32) -> `sim.rng.float()` (0-1). Cold confusion, dropping what you carry, drowsy day-sleep and confused wander now happen; both log variants now appear; drowsy (stage 4+) people again seek warmth at bedtime ~12% of nights instead of never. No raw `rng.next()` left in agent.js.
- **index.html:** `?v=38` -> `?v=38.1` on all 41 local refs.
- **tests/chrome_v38.js:** version check accepts `?v=38` or `?v=38.1`.
- **New tests:** tests/headless_v38_1.js (thirst + cold fixtures; `ROOT=... node tests/headless_v38_1.js` runs them on another build), tests/cold2y_v38_1.js (2-year cold-line and death counter per seed).

## Results
- headless_v38: 238 PASS, 0 FAIL. chrome_v38: 150 PASS, 0 FAIL (0 JS errors desktop 1366x768 + phone 390x844, 0 missing files, 37.2->38 save migration still OK).
- headless_v38_1: 12/0 on v38.1; 4/8 on v38 (the bugs reproduce there).
  - Thirst fixture: water 5 at the shore holding a flake, known cache 6+ tiles away: drinks to 100 within 15 min, 1 "drinks at the lake", 0 stash lines (v38: water stuck at 5, 15 drink + 15 stash lines). Control with no need still walks to stash.
  - Cold fixture (31 people, 5 seeds, held at warmth 0 for 8 h from 06:00, wolves removed): stumbling 113 / looks lost 120, drops 28, nodding off 10 / slowing further 8, moving slow 31 of 31 (v38: 0/0, 0, 0/0, 31).
- headless_cache32: 3 FAIL, the same 3 stale v29 pins that fail on v38 (saveVersion 29, ?v=29, migrate 28->29). Not new.
- pop_v38f (8 seeds x 2 years + wiped-pack seed 3873): both PASS (deer/dogs wiped on 0 of 8; wiped pack stays 0).

| 2 years | v38 | v38.1 |
|---|---|---|
| thirst deaths, 8 seeds | 18 | 0 |
| wolf deaths, 8 seeds | 26 | 35 |
| cold / other deaths | 0 | 0 |
| seeds with people alive at end | 1 of 8 (seed 3) | 5 of 8 (seeds 2, 3, 4, 5, 8) |
| wiped-pack seed 3873 | 6 thirst deaths, 0 left | 0 deaths, 6 of 6 left |

- Cold in the 2-year runs: no one even reached shivering (max stage 0 on all 8 seeds), so 0 cold lines and 0 cold deaths. The fix changes nothing in mild play; it only matters once people are really cold.

## Known / soft
- Wolves are now the only killer in 2-year runs (seeds 1, 6, 7 die out; people still make 0 stands). Separate tune; reed fiber/fighting skill addresses it.
- Old stash counts may drop a little (people put items down when needy).
- Cold effects verified with the test-only warmth hold, not a natural Deep Cold night.
