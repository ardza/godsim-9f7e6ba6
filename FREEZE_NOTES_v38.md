# godsim v38 "Living off the land" freeze notes (pre-freeze, /workspace/godsim)

saveVersion **38**. Every asset in index.html is `?v=38` (41 files, none at another version, all present). Not frozen; godsim-rc was not touched.

## What's new
- **(a) Huts.** Huts now come in 3 tiers, set by their materials: crude (sticks), reed, and sturdy (hide). Each tier has its own warmth, rain kept off and wear speed.
  - Durability runs 0-100. It wears faster in rain and storms, and lightning or fire knocks it down.
  - People patch huts that are under 50. At 0 a hut collapses into its materials and writes 1 log line.
  - Tapping a hut opens a card with its tier and a durability bar. Huts under 50 use a worn sprite.
- **(b) Planting.** Seeds pressed into soft ground can sprout, then grow into saplings. Rock, sand and water never sprout. The first planting goes into Discoveries.
- **(c) Caches and food.** A cache pile holds 3-5 items.
  - Food rots after food.spoilDays (7). Rotten meat makes people sick at 2x the raw rate.
  - Drying by a fire makes food last about 3x longer; keeping it sheltered, about 1.5x.
  - Hungry people go to a cache they know first. Taking someone else's pile lowers how much they like the taker. Each method gets its own Discoveries entry.
- **(d) Lightning.** Lightning kills deer, wolves and dogs in its radius and leaves the body cooked, from "lightning-struck <animal>". Cooked meat has a chance of making people sick. Eating it the first time goes into Discoveries.
- **(e) Shared history.** Tapping a name in Kin or the Log opens an "A & B" view. It shows only the entries both people share, newest first, with a Back button and both names.
- **(f) Wolves.**
  - Wolves kill dogs, and the death is logged as caused by Wolves.
  - Deer and dogs flee a wolf within 5 tiles before it strikes. Dogs won't approach a wolf body.
  - Heavy rain cuts down hunts.
  - Wolf fear starts at a baseline of 10, is inherited, and has a cap. A lone unarmed adult runs. A group of 3 or more armed people stands and can kill, which yields meat and a hide.
  - Using Spawn adds a wolf to the nearest pack within 12 tiles. A spawn farther away starts a new pack with its own den. A pack caps at 5.
- **(g) Fire burn limit.** spreadScale is 0.024 and burnBudget is 40.
  - About 88-90% of High Sun meadow fires reach 8+ tiles, the median size is in the tens, and there are no runaways.
  - Fires that start wet, in rain, near water, on sand or in Deep Cold stop at 0-2 tiles.
  - `Fire.hasFuel` now guards ignite: a flame on bare sand dies at once.
- **Migration 37 -> 38** (`Sim.migrate38`):
  - Huts get materials and dur 100.
  - Caches are kept and become piles.
  - People's wolf fear is raised to at least 10.
  - Meat keeps its source and moves onto the spoilDays clock.
  - `plants` is added.

## Fixtures (`?fixture=` / `GS.debug`)
| URL | GS.debug | Shows |
|---|---|---|
| `?fixture=hut` | `hutFixture(opts)` | a worn sturdy hut (dur 42) by person 1, with its card open |
| `?fixture=hut&kind=tiers` | `hutTiersFixture()` | a crude, a reed and a sturdy hut side by side, with the sturdy hut's card open (new pre-freeze) |
| `?fixture=sprout` | `sproutFixture()` | one seed, one sprout and one sapling on soft ground near person 1 (new pre-freeze) |
| `?fixture=cache` | `cacheFixture()` | person 1's cache holding fresh, dried and rotten meat, with the pile selected (new pre-freeze) |
| `?fixture=lightning[&species=scavenger\|wolves]` | `lightningFixture({species})` | a lightning-struck, cooked body, selected |
| `?fixture=history` | `historyFixture()` | the "A & B" shared history view |
| `?fixture=wolves&kind=fight\|dog\|flee\|corpse\|lone\|spawn` | `wolvesFixture({kind})` | each wolf case (the default is fight) |
| `?fixture=fire&kind=meadow\|wet\|rain\|nearwater\|shore\|sand\|cold\|woods` | `fireFixture({kind})` | each fire start case |

Add `&seed=N` to get the same world each time. The fixture plants, pile and huts are placed on tiles no one is standing on or next to (config `farm/food/hut.fixture.clear`), so they can be seen.

## Tests (run from /workspace/godsim)
- `node tests/headless_v38.js`: **238 PASS, 0 FAIL**.
- `node --experimental-websocket tests/chrome_v38.js`: **150 PASS, 0 FAIL**.
  - Covers desktop 1366x768 and phone 390x844: a plain load, every fixture above, and the v37.2 to v38 save migration.
  - 0 JS errors, 0 404s, 41/41 files at `?v=38`, smallest text 16px.
  - Screenshots are in /workspace/godsim-previews/v38/.
- `node tests/f7_2yr_v38.js`: 10 PASS, 0 FAIL. `node tests/pop_v38f.js`: 2 PASS. Both are 2-year runs, and their output is in `tests/f78_v38_output.txt`.
- `node tests/make_save_v37.2.js` rebuilds `tests/fixtures/save_v37.2.json` from godsim-rc-v37.2, reading it only.
- `FIRE_N=100 node tests/headless_fire_hotfix.js` has 1 known FAIL: its old meadow-only near-water tally (5/22). (g) measures this with the shore fixture instead (about 5.8%).
- The old suites match their earlier results. Every fail comes from a stale saveVersion or `?v=` pin, or an old loader: v37 2, hut35 4, season38 4, people39 5, tip37 4, hides31 2, moods27 2; 26b and powers23 crash on stale loaders.

## Soft notes (not FAIL)
- In 2-year runs, people die out on most seeds by year 2, mostly from thirst. Deer also slowly decline on some seeds (down to 2 on seed 4). Neither is a v38 FAIL item.
- On the desktop layout (1366x768), the open Powers panel covers the lower part of an open person card (seen in the sprout screenshot). This is existing layout, not changed in v38; flagged for the Director.
