# DRAFT — Fix: thirst die-off + cold effects (after v38)
Status: DRAFT for Commissioner review. No build until the Commissioner picks this vs reed fiber order.

Two small code fixes, no new features. Could ship as **v38.1** (code only, saveVersion stays 38, only the `?v=` cache-busting goes up) or ride at the front of v39.

## 1) Thirst die-off

### Problem
- In 2-year runs (tests/f78_v38_output.txt, `pop_v38f.js`), people are gone by year 2 on 7 of 8 seeds. Thirst is the top cause: 19 thirst deaths across the 8 seeds, and 6 of 6 deaths on the no-wolves seed 3873.
- It's older than v38 wolves (progress_v38.md:252). The same code is in v37.2 and dates back to caching (v29).

### Cause (evidence)
It isn't the water need rate, finding water, or settling far from water. People die **standing at the shore, stuck in a drink that never starts**.
- Every one of the 19 thirst deaths I traced (8 seeds × 2 years, read-only harness in /tmp) was the same: the person was on a shore tile (path length 0 to water), knew 19-140 water tiles, warmth 79-100, and had spent ~1440 straight minutes at water 0 in the `drink` action with `t` stuck at 0.
- The loop, src/agent.js, each tick:
  1. Line 558-560: she is carrying something and has a need (`Agent.want(a)`), so `G.Cache.tryStash` (src/cache.js:165-183) sets a new walk to a cache ("heads to a known place to leave what they carry").
  2. Line 614: water is the need and the goal isn't "water", so `seekWater` sees she's already at the shore and calls `startDrink` (line 165), which sets a new drink with `t: 0`.
  3. Next tick, step 1 overwrites the drink with the stash walk again, before line 611 (`if (act.type === "drink") return drink(...)`) can ever run. So water never goes up.
- After `death.waterZeroMinutes` (1440) at 0 she dies of thirst next to the lake. The log gets 2 lines a minute ("heads to a known place…" / "drinks at the lake") for the whole day.
- Away from the shore the same fight only costs a re-path each step (with log spam), so it shows up mainly at the water.
- Need rates are normal and not the cause: water 100→50 in 4 h (`person.water.minutesFullToThirsty` 240), 0 after ~8 h awake, death after 1 day at 0.

### Proposed fix (code, 1 line)
- src/agent.js:560: don't stash while a need is pressing. Put the item down instead:
  `if (a.act.type !== "sleep" && !Agent.want(a) && G.Cache && G.Cache.tryStash(sim, a)) …` (otherwise the existing `G.Items.drop`).
- She still stashes when she's done carrying (`carryUntil`) and has no need. No config change.
- Measured (the same fix applied in memory, 8 seeds × 2 years, same harness):

| | thirst deaths | seeds with people alive at end of year 2 |
|---|---|---|
| now | 19 | 1 of 8 |
| fixed | 0 | 5 of 8 (seeds 2, 3, 4, 5, 8) |
| no wolves, seeds 3873/1/2, now | 18 | 0 of 3 |
| no wolves, seeds 3873/1/2, fixed | 0 | 3 of 3 (no deaths at all) |

## 2) Cold effects never fire (RNG bug)

### Problem
- At hypothermia stages 2-4, confusion ("is stumbling" / "looks lost"), dropping what you carry, and drowsy day-sleep ("is nodding off" / "is slowing further") never happen.

### Cause (evidence)
- src/rng.js:4: `RNG.next()` returns a whole number from 0 to about 4.29 billion. `RNG.float()` (line 10) is the 0-1 value.
- src/agent.js uses `sim.rng.next()` as if it were 0-1, so `next() < p` is never true, and `next() >= p` is always true:
  - :531 confusion (`< confuseChance` 0.2): never.
  - :533, :573, :581 log variants (`< 0.5`): always the second line ("looks lost", "is not getting up", "is slowing further"). The first two are never reached, but :573 is, so a cold collapse always reads "is not getting up".
  - :537 drop (`< dropChance` 0.015): never.
  - :580 drowsy day-sleep (`< drowsyChance` 0.03): never.
  - :619-620 confused wander (`< confuseChance × 0.25`): never. Its offset math (`Math.floor(next() * 3)`) would also be huge.
  - :653 `skipSeek = … next() >= seekChanceAtDrowsy` (0.12): always true. So at stage 4+, people **never** look for warmth at bedtime (it should be 12%). This one makes the cold worse today, the other way round from the rest.
- These are the only `.next()` calls outside rng.js. The same mistake in wolves was already fixed with `pick` (progress_v38.md:245).

### Proposed fix (code, 9 lines in src/agent.js)
- src/agent.js lines 531, 533, 537, 573, 580, 581, 619, 620, 653: change `sim.rng.next()` to `sim.rng.float()`.
- `float()` takes one draw just like `next()`, so the RNG stream is used the same way.
- Config stays as it is: `person.hypothermia` confuseChance 0.2, dropChance 0.015, drowsyChance 0.03, drowsyCheckMinutes 10, confuseLogEvery 60, seekChanceAtDrowsy 0.12.
- Measured (fixture, in memory: 27 people on 5 seeds held at warmth 0 for 8 h from 06:00, each carrying an item, wolves removed):

| log line | now | fixed |
|---|---|---|
| is stumbling / looks lost | 0 | 202 |
| drops what they were carrying | 0 | 25 |
| is nodding off / is slowing further | 0 | 19 |
| is moving slow (not random, control) | 27 | 27 |

## Save impact
- None. No new or renamed save fields, and no migration. saveVersion stays 38. Bump the `?v=` on agent.js and index.html.
- A save made mid-loop loads fine: the next tick she drops the item and drinks.

## Tests
- Fixture (thirst): a person at a shore tile with water 5, holding a stick, with a known cache 5+ tiles away. Within 15 min she has water 100, she logged "drinks at the lake" once, and there are 0 "heads to a known place" lines while thirsty. The same fixture with no need still stashes (v29 stash test still green).
- Fixture (cold): the table above. People held at warmth 0 for 8 h get at least 1 stumble/lost, 1 drop and 1 nodding-off line across the group, and both log variants appear. A drowsy person at bedtime seeks warmth on some nights, not never.
- Rerun headless_v38 and headless_cache32. Some seed-pinned counts may shift because outcomes change, but there should be no new FAIL beyond the known stale pins.
- **2-year check (Programmer runs `node tests/pop_v38f.js`):** people still alive at the end of year 2 on most of the 8 seeds (target 5+ of 8), 0 thirst deaths where the person died on a shore tile, and the wiped-pack seed 3873 keeps its people. Deer/dog checks stay PASS.

## Risks
- **Wolves become the main killer.** With thirst fixed, seeds 1, 6 and 7 still die out, all to wolves (people ran 0 stands in 2 years: `"stands":0`). 5 of 8 just meets "most". If the Commissioner wants a wider margin, that's a separate wolf tune, not part of this fix.
- **Cold gets real.** Drops and day-sleep start happening, so a bad Deep Cold could kill more. But drowsy people also start looking for warmth again (line 653). In the 2-year runs nobody reached stage 2+, so survival there didn't change. Watch cold deaths in the 2-year check.
- **Fewer stashes while needy.** Items get put down at the shore or bush instead. That's the intended fix, but stash counts in old tests may drop a little.
- Logs stay action-only, with no words before language (step 25). No new lines are added, and the existing ones just start appearing.

## Not confirmed
- No population growth showed up in any 2-year run (counts only go down or stay flat). I didn't look into births.
- The cold fixture used the test-only warmth hold (`a.hold`), not a natural Deep Cold night.
