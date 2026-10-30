# v38 "Living off the land": progress

Spec: specs/living_off_the_land_DRAFT.md. saveVersion 38, every `?v=` in index.html is 38. Test: `node tests/headless_v38.js` (one labelled section per piece).

## Base (done with piece a)
- `data/config.js`: saveVersion 38. Fire hotfix as ordered: `fire.minDryness` 30 (was 45), `fire.spreadScale` 0.035 (was 0.012). No other fire code was touched.
- **Fire values final (Judge, during (d)):** `climate.dryness.nearWater` −45 (was −30), `fire.spreadScale` 0.016 (replaces 0.035 from the first hotfix pass; v37 had 0.012), `fire.minDryness` stays 30. No burn-limit knob was added, and the v38 pin test now checks these three values. Side effect: `Climate.groundDryness` is also read by deer grazing (animal.js), so grass near water now looks a little greener to deer. Fire and farm don't otherwise use nearWater (farm has its own `nearWaterTiles`).
- `index.html`: all 39 local refs are `?v=38`.
- `src/sim.js`: `Sim.migrate38` is in the deserialize chain (37→38). Later pieces extend it. So far it: gives huts mats and durability (`Hut.migrate`), lifts every person's `wolfFear` to `config.wolfFear.baseline` (10), and keeps caches.

## (a) Huts: better shelter from materials + durability (DONE)
- Each hut stores `mats {stick, reed, hide}`, `tier` and `dur` (0-100). The tier is the last entry in `config.hut.tiers` whose `need` is met:
  - sticks: crude hut, warmX 1.2, rain 0.85
  - reeds (2 or more reeds): warmX 1.35, rain 0.95
  - hide (1 or more hides, 4 or more pieces): sturdy hut, warmX 1.5, rain 1.0, so no rain chill at all
- `Hut.refresh` writes warmX and rain onto the shelter, so Shelter.warmC, Powers.exposure and rain cover work with no changes.
- Building: `consumeMats` now returns what went in. The build log names the real materials ("piles 2 sticks, 1 reed into a crude hut").
- Adding over several trips (`Hut.tend`, which runs while idle):
  - A person who knows a hut within `tend.noticeTiles` looks at its durability.
  - If the hut is under `dur.patchBelow` (50, per the Director's spec; was 70), she always patches it.
  - Otherwise she may add a piece that raises the tier. The chance is `upgradeChance` × curiosity/50. For a hide it is `hideChance` × curiosity/50 × hutHide score/50.
  - She uses a piece she holds or one on the ground by the hut. If the hut is a few tiles away, she walks it over (goal `hutTend`, "carrying material to a hut").
  - Adding = the same act as building. Each piece adds `patch[mat]` durability, up to `maxMats` pieces.
  - The first sturdy hut goes into Discoveries.
- Copying the hide roof:
  - When a hide goes on, the hut records who saw it within `copy.tiles`.
  - When the person who added it wakes warm inside (Shelter.step hook), she gains `copy.gain` on the hutHide skill, which is a new `learn.actions` key and shows in the Mind tab.
  - Each watcher may then copy it through `Learn.copyChance`.
- Durability (`config.hut.dur`):
  - Weather wear is `decayPerDay` 3 × tier decayX (sticks 1, reeds 0.8, hide 0.6).
  - Rain multiplies it: light ×1.5, medium ×2, heavy ×3 (Director: softened from ×3/×5/×8). Clear is still 3/day.
  - A storm (rain plus a bolt within 12 tiles in the last 60 min) adds ×2.
  - Frost below 32°F adds ×1.5.
  - Damage: a bolt on the hut costs 60, a bolt next to it costs 20. That covers god-power strikes (powers.js `strikeOne` hook) and natural strikes (Sim.step hands the new Fire.lightning spark to `Hut.step`; fire.js is untouched). Flames on the tile cost 1.5/min. Trampling costs per minute: deer 0.5, scavenger 0.2, wolf 0.3.
  - Under `wornBelow` 50 the hut uses the `<tier>_worn` art frame and keeps ×0.85 warmth and ×0.85 rain.
  - At 0 it collapses. The shelter is removed, anyone inside is put out, its mats drop as items on walkable tiles within 2, and a log line describes the collapse.
- Art: `hutTier` (hut_tiers_16.png, 96x16: sticks, reeds, hide, sticks_worn, reeds_worn, hide_worn) is used for built huts. The old `hut` pile frame still shows huts under construction. The tint placeholder is not used. render.js also preloads `foodKeep` and `sprout` for (b) and (c).
- Inspect card: tap a hut (selection id `hut:<id>`) to see:
  - tier label and what went in
  - a durability bar (red when worn) and the current wear per day, plus the rain strength if it is raining
  - warmth ×, percent of rain kept off, room, and who is inside
- All text is actions only, with no quotes.

### Fixture for the Tester
- URL: `index.html?fixture=hut` puts a worn (42) sturdy hut by person 1 and opens its card. Add `&seed=…` to avoid loading your save.
- Console: `GS.debug.hutFixture()` or `GS.debug.hutFixture({ dur: 20, mats: { stick: 3 } })`.
- `?fixture=history` comes with piece (e).

### Tests
- `tests/headless_v38.js`: **33 PASS, 0 FAIL**. It covers:
  - pins
  - tiers: the sticks→reeds→hide upgrade is warmer, and the sturdy hut lets 0 heavy rain in
  - decay: rain (light, heavy) wears faster than clear over 10 h (no fixed numbers); frost and storm add to it
  - damage: lightning, fire and trample each lower durability
  - worn art, patch by hand and patch by walking over
  - collapse drops all 8 material items nearby
  - hide copying, the save round trip, migrate 37→38 (dur 100, wolf fear 10, caches kept), and a one-game-day live run
- `tests/headless_v37.js`: 46 PASS. The only 2 FAILs are the v37 version pins (saveVersion, ?v=37).
- Older suites (hut35, season38) fail only on their version pins, The hut35 build-log check now expects the material-naming line ("piles 2 sticks, 1 reed into a crude hut") and passes. That was the only check changed.

## (b) Berry sprouting (DONE)
- New `src/farm.js` (`G.Farm`, script tag `?v=38`). `sim.plants` holds `{id, x, y, stage seed|sprout|sapling, grow, by, deliberate, seen[]}`. It has its own rng stream (`sim.frng`, salt `farm.salt`), so other streams are unchanged. All numbers are in `config.farm`.
- Seeds: when a berry meal ends (agent.js eat hook), `seedChance` 0.25 drops a seed within `dropTiles` 2 of the bush. This is unnoticed and has no log. There's no seed if the spot is on or next to a bush, plant or shelter (`spacingTiles` 1), or if `maxPlants` 40 are already growing.
- Soft ground (`Farm.soil`): meadow 1 or woods 0.5, within `nearWaterTiles` 5 of water. Sand, rock (hills), water and dry grass give 0, so seeds there never take.
- Growth (`Farm.step`, every minute):
  - After `seedDays` 2, a seed sprouts with chance `sproutChance` 0.2 × soil × `wetX` 1.5 (rained-on ground) × `pressX` 2 (pressed in on purpose). Otherwise it is gone, so most don't sprout.
  - sprout → sapling after `sproutDays` 3. sapling → a normal bare bush (id `p<n>`, `planted` info) after `saplingDays` 5. It then ripens on the usual bush clock.
  - Growth pace by season is `seasonGrowX` [1, 1, 0.6, 0], so in Deep Cold plants wait.
  - Flames on the tile kill a plant.
  - Total bushes are capped at bushes.count × `maxBushesX` 1.6.
- Learning (Learn key `plant`, "dropping berries on soft ground", shows in the Mind tab):
  - The dropper who later finds the new bush (sense hook) gets `findGain` +15, once.
  - Anyone who was awake within `copyTiles` 5 when that seed fell, and later sees the bush, may copy her. This uses the normal Learn copy rules (copyMargin, copyChance, copyShare).
  - Above learn.start (50) the score is an urge. After a meal, the chance is `urgeChance` 0.6 × (score − 50)/50 that she presses berries into the best soft tile within `plantTiles` 3. The log reads "presses berries into the wet ground" (or "soft ground" when it is dry). The first one goes into Discoveries as "First planting".
- Art: `sprout` (sprout_16.png, cols seed | sprout | sapling) is drawn under bushes, with a code fallback. There is no farm UI, no plow and no fields.
- Save: plants, farmStats, frng, plantNext and bushNext are saved. `Sim.migrate38` adds empty `plants` and `farmStats`.
- Tests (`headless_v38.js` (b) section, all fixtures, with growth driven by `Farm.step` only):
  - soft-ground rules
  - seed drop rate and range
  - most seeds fail (14/60 sprouted)
  - stages lead to bushes with unique ids
  - Deep Cold waits and fire kills
  - **8 pressed seeds → 4 sprouted, 4 bushes** (spec: ≥2 of 8)
  - the dropper gains; a watcher copies (50→57.5)
  - the urge leads to deliberate planting plus Discoveries; there is none at the start score
  - wet ground, save round trip, migration, and a one-day live run
- Results: `headless_v38.js` **56 PASS, 0 FAIL** ((a) and pins 33, (b) 23). v37 46 PASS / 2 FAIL (pins only). hut35 and season38 fail on version pins only.

## (c) Caches, spoilage, preservation (DONE)
New `src/food.js` (G.Food, own rng `sim.fdrng`, stats `sim.foodStats`), hooked into hunt.js, cook.js, cache.js, objects.js, agent.js, sim.js, render.js, ui.js and index.html.
- **Caches hold a pile:** at most `cache.pileMax` 4 cacheable items per spot. Full spots are skipped when stashing. A person still carries one item.
- **Spoilage:** meat lasts `food.spoilDays` 7 days from the kill, whether carried or stored. This replaces the old 1-day raw-meat timer (`body.freshMinutes`, kept only for the migration).
  - After that it turns into **rotten food** (material `rotten`). It is the same item object, so `src` (item 9), `from`, `heat` and `dried` are kept.
  - Rot lines: "A piece of meat turns rotten" / "The meat X carries turns rotten".
  - Rotten food falls apart after `rottenGoneDays` 3.
- **Rotten food when eaten:** sick chance = raw `meat.sickChance` × `rottenSickX` 2, with the same meat sickness. It gives +`rottenFullness` 30 and is eaten only when fullness < `rottenEatBelow` 15.
- **Drying:** meat lying within `dryTiles` 5 of a burning fire for `dryMinutes` 180 becomes dried and spoils `driedX` 3× slower. Labels: "dried meat" / "dried cooked meat". The first one is a Discoveries entry, "First dried food".
- **Sheltered stash:** meat lying in a hut, cave, overhang or thicket spoils `shelteredX` 1.5× slower. The first stash there is a Discoveries entry, "First sheltered stash".
- **Learned from need:** losing food to rot (as holder, stasher or the person who left it) sets `foodLost`. After that, picking up dried meat gives +`gain` 15 to `dryFood`. Picking up meat that sat sheltered ≥ `keepNoticeMinutes` 1440 gives +15 to `keepFood`. This counts once per item per person.
- **Using a method (urge = `urgeChance` 0.6 × (score−50)/50, rolled when about to stash meat):**
  - Dry: walk to a tile more than `cook.fireTiles` and at most `dryTiles` from a burning fire within `dryWalkTiles` 12. She logs "lays meat out near the fire to dry", and the spot is remembered like a cache.
  - Keep: stash only at a sheltered known spot within `cache.walkTiles` × `keepWalkX` 1.5. She logs "stashes meat inside the hut/cave/...".
  - Awake people within `copyTiles` 5 may copy, using the learn copy rules. Log: "X watched Y and copied: drying meat by a fire".
- **Hungry people** go back to a known cache before searching (as before). Taking from someone else's pile lowers that owner's liking of the taker by `cache.takeLike` −3, if they know each other. Log: "takes meat from Y's cache". No fighting.
- **Art:** foodKeep sheet (`rotten`, `dried` cols) in drawItemAt, with a flat-color fallback.
- **UI:** the item card shows a dried / sheltered / rotten line.
- **Migrate 37→38:** existing meat gets `spoilAt = min(now + spoilDays, old spoilAt + spoilDays − freshMinutes)`. Caches, piles, stashedBy and src are unchanged, and `foodStats` is added.
- **Fix found on the way:** in (b), Farm reused `sim.frng`, which is Family's stream, so the two shared draws. Farm now has its own `sim.plrng`, which is saved and loaded. The (b) round-trip test now checks both streams.
- **Tunables:**
  - `config.food`: spoilDays, rottenSickX, rottenFullness, rottenEatBelow, rottenGoneDays, driedX, shelteredX, dryTiles, dryMinutes, gain, keepNoticeMinutes, urgeChance, dryWalkTiles, keepWalkX, copyTiles, lines.
  - `config.cache`: pileMax, takeLike.
  - `learn.actions`: dryFood, keepFood.
  - `materials.rotten`.
- **Tests:** headless_v38 gives **87 PASS, 0 FAIL** (pins + (a) 33, (b) 23, (c) 31). v37: 2 FAIL. hut35: 4 FAIL. season38: 4 FAIL. All of these are version pins only, as before.

## (d) Lightning kills animals and cooks the dead (DONE)
- **Who it kills:** a god bolt (`Powers.strikeOne`, single or Barrage) now kills the deer, wild dogs and wolves on the struck tile. This uses the same exact-tile radius and rules as for people, and the animal on the next tile lives. The animal is taken out of the herd or pack and leaves a carcass with cause "struck by lightning". It logs one action line, e.g. "Lightning strikes a deer and it drops dead, its hide seared". Strike stats and effects get an `animals` count. Natural storm strikes (`Fire.lightning`) still kill nobody, as before.
- **Cooked dead:** every body the bolt makes (animal, person or baby) gets `heat = max(heat, cookHeat 45)` and `lightning: true`. That is "cooked" (≥ `cook.cookedAt` 30, below `charredAt` 120). If the strike also lights the tile, the fire keeps heating the carcass and it can char.
- **Meat:** pieces cut from the carcass use the normal cooked-meat path. They get the food "cooked" frame, `cook.sickChance.cooked` and the cooked fullness. The source tag (item 9) is `{k:"lightning", animal}`, and the eat line reads "...from the lightning-struck deer". They run on the (c) `food.spoilDays` clock from the strike. Rotten lightning meat keeps its tag.
- **Person remains:** eating a bolt-killed person goes through corpse.js with `cooked` true, so the sick chance is `corpse.sickChance.cooked` 0.15 (not 0.4).
- **Discoveries:** the first lightning-cooked meal (meat or remains) adds one entry, "First lightning-cooked meal". Later meals don't add another.
- **Carcass sizes:** `meat.pieces` now has wild dog 1 and wolf 2, alongside deer 4 (about 15, 40 and 70 kg). Before this only deer could die, so dogs and wolves had no pieces.
- **Art / UI:** a lightning carcass in the fresh stage draws the food "cooked" frame on top, with a fallback rectangle. The body card adds "cooked through by the strike".
- **Tunables:**
  - `config.lightningKill`: animals, people, species, cookHeat, cause, line, disc.
  - `meat.pieces.scavenger` / `.wolves`.
  - `meat.sourceWords.lightning`.
- **Fixture:** `GS.debug.lightningFixture({species, cut})` or `index.html?fixture=lightning[&species=scavenger|wolves]` (backed by `Hunt.boltFixture`). It strikes an animal on bare ground 2–8 tiles from person 1, then lays a cut cooked piece next to the carcass and selects it.
- **Tests:** headless_v38 gives **111 PASS, 0 FAIL** (pins + (a) 33, (b) 23, (c) 31, (d) 24). v37: 2 FAIL. hut35: 4 FAIL. season38: 4 FAIL. All of these are version pins only.
- **Notes:**
  - The dog and wolf carcasses reuse the deer carcass art. This is an art gap for the Artist.
  - Animals don't flee from a strike, since the spec doesn't ask for it.

## (e) Two-person history (DONE)
**What it does.** On a person's card, tapping another person's name in the Kin tab (partner, parents, children, relations) or in a Log line swaps the pane for "A & B". It shows every line in A's personal log (`sim.plog[A]`) whose ids include B, newest first, styled like the Log tab. The header has a "← Back" button (44px, 16px text) and "A & B" (17px). Back, picking another person or switching tab returns to the normal pane. There's no new tab, no new system and no filters. It's a filter on the saved personal log, so it survives save and load and is capped by `log.personMax` (200). B & A gives the same lines because each shared line is pushed to both logs.
- `Social.shared(sim, a, b)` does the filtering. `UI.pairHtml` renders the view. `UI.pair = {a, b, tab}` holds the state. The `pairLink` handler (pointerup, plus click when detail===0) wires the taps. Names are buttons with `data-pair` and an aria-label. A dead person's name keeps the original person id.
- **Second id audit:** lines that name another person now tag them too.
  - corpse.js has 10 lines: leaves, drags, digs, buries, sets alight, watches the fire, piles sticks, eats from, kneels by.
  - moods.js has 2: the grief line "sits with … head down after X dies" and "runs toward X".
  - Quarrel, cache, pairing, birth and watcher lines were already tagged. Animal names in hunt.js are untouched, because bodies map to `b.of` and animals are filtered out.

**Tunables** (`ui.pairView`): `title "{a} & {b}"`, `back "Back"`, `backAria`, `empty "Nothing logged with both of them yet."`, `nameAria`, `fixtureGapMinutes 20` (the spacing between fixture steps). The limit is the existing `log.personMax` 200.

**Fixture:** `GS.debug.historyFixture()` or `index.html?fixture=history`, built by `Social.historyFixture`. It picks an adult A, an opposite-sex B, and C. Each step is 20 game minutes apart, and every step goes through the game's own code:
1. A drinks at the lake (A alone).
2. A finds B took the last of the meat (`Social.took`, a quarrel).
3. A finds C took the bush (A & C).
4. A takes meat from B's cache (`Cache.doRetrieve`). B is moved out of sight for this, so B doesn't also "watch" it.
5. A lies down to sleep.
6. A and B pair up (`Family._daily`, a kin event).
7. B finds a berry bush (B alone).

The card opens on A's Log, in A & B. The result is exactly 3 lines, newest first, both ways.
- **No fight or food-share action exists** in the sim. The fixture uses the nearest real ones: the quarrel over taken food, and taking food from B's cache.

**Tests:**
- headless_v38 (e) has 31 checks across 3 seeds. They cover exact lines and order both ways, exclusion of A-only, A-with-C and B-only lines, empty pairs, the rendered view, Kin and Log links, wiring, CSS sizes, save/load, no quotes, the tag audit, a grief line both ways, and a clean day after the fixture.
- New `tests/chrome_v38e.js` (run with `node --experimental-websocket`) covers desktop 1280×800 and phone 390×844. It checks that the view opens with 3 lines, Back works, tapping the partner on Kin opens the view, and there are **0 JS errors**. Screenshots are in /workspace/godsim-previews/v38/.
- **Counts:** headless_v38 142 PASS, 0 FAIL (111 from (a)-(d), all still green). chrome_v38e ALL PASS. v37 2 FAIL, hut35 4 FAIL, season38 4 FAIL, all only the old saveVersion and ?v= pins.

**Notes:**
- Corpse lines now also land in the dead person's own log.
- Picking up from a cache logs both "picks up a meat" and "takes meat from X's cache". This was there before (e).
- The card header still says "Loner" right after pairing, because that label shows group membership (Social group), not mates. This was there before (e) and wasn't changed.

## (f) Wolves (DONE)
**What it does.**
- **Apex:** deer and wild dogs run from any wolf within `animals.fleeWolfWithin` 5 before it strikes. They run to the spot farthest from every wolf. The logs are "Deer scatter from Wolves" and "A wild dog runs from the Wolves".
- **Dogs keep away:** dogs never come within that range of a wolf, and never feed at a body that has a wolf near it.
- **Wolves hunt dogs:** with `wolves.huntDog` (killChance 0.3, below deer at 0.55; deer come first). The dog body reads "killed by Wolves" (`Hunt.sourceOf` gives site/Wolves).
- **Fear:**
  - Founders and migration start at `wolfFear.baseline` 10.
  - A newborn gets baseline + `inheritShare` 0.3 × (the parents' mean − baseline). The inherited part is capped at `inheritMax` 30. The father's fear is stored on the pregnancy.
  - Fear never falls below the baseline.
- **Readiness** (computed on the spot, never stored) is held tool + hide + perAlly × able adults within allyTiles.
  - Readiness above fear means stand or strike. Otherwise the person runs, so a lone unarmed person always runs.
  - An armed person who stands holds the wolf off: it does not press its own strike and backs off for `heldOffMinutes`, but it can still bite on the group's misses.
- **Group hunts:** an armed, ready adult with ≥ `hunt.minAllies` 2 armed, ready allies may go after a wolf in its territory.
  - The roll is the mean `Hunt.odds` × `oddsX` × attackers, capped at `maxChance`. A miss can bring a bite (v37 injury) on one attacker.
  - A kill leaves a body tagged killed by "people" with meat (pieces) and one hide (`hides.fromSpecies` now includes wolves).
  - Each attacker gains `wolf_hunt` (learnGain); watchers copy it through learn.
  - The first kill goes into Discoveries.
  - Watchers within watchTiles lose `killWatchDrop` 5 fear, never below the baseline.
- **Packs:** there is no respawn, so a pack whose last wolf dies is gone (`sim.packsGone`).
  - A Spawn within `spawnJoinTiles` 12 of a pack wolf joins the nearest wolf's pack (same id and den).
  - Otherwise it starts a new pack with its den at the spawn spot.
  - Each pack is capped at `packSize[1]` 5. A 6th spawn is refused with "that pack is full (5 Wolves)".

**Tunables:**
- `animals.fleeWolfWithin` 5, `eatOwnKill` true, `killFill` 40.
- `wolves.huntDog` `{stalkTiles 10, strikeTiles 1.5, killChance 0.3, closeTiles 4}`, `spawnJoinTiles` 12, `corpseTiles` 14.
- `wolfFear.baseline` 10, `inheritShare` 0.3, `inheritMax` 30.
- `wolfFight`:
  - held `{spear/tip 25, axe 20, flake 10}`, hide 5, perAlly 10, allyTiles 3, exhaustedBelow 20
  - standMinutes 20, heldOffMinutes 15, strikeTiles 1.5, oddsX 0.8, maxChance 0.8, biteChance 0.35
  - hunt `{minAllies 2, seekTiles 12, checkMinutes 10, startChance 0.05, pullBase 0.5, pullPer 50, giveUpMinutes 120, cooldownMinutes 720, repathMinutes 10}`
  - killWatchDrop 5, learnGain 15
- `learn.actions.wolf_hunt`.

**Ecology tune.** This was needed for test 8, because deer died out on most seeds before the tune.
- The cause was wild dogs: each made 12-17 deer kills in 4 weeks.
- What changed:
  - **Dogs:** `scavenger.huntDeer.fullnessBelow` 40→15, killChance 0.35→0.15, `fullness.minutesFullToEmpty` 1440→10080.
  - **Wolves:** `fullness.minutesFullToEmpty` 2880→14400 and carrionBelow 60→85, so the pack shares a kill (corpseTiles 14).
  - **Killers:** `eatOwnKill`, so a killer feeds on its own kill and doesn't leave it.
- Grazer births perSeason stays 0.35 (a Director value).

**Fixture:** `GS.debug.wolvesFixture({kind})` or `index.html?fixture=wolves&kind=`. The kinds are fight (default: 3 adults with spears at the den), lone (1 unarmed adult), dog, flee (a deer and a dog at about 7 tiles), corpse (a wolf feeding, a hungry dog at 9 tiles) and spawn (all wolves removed). The scene adults are rested, at baseline fear and uninjured, and everyone else is moved out of ally and watch range.

**Tests:**
- headless_v38 (f) has 43 checks covering spec tests 1-8:
  - test 4 reruns v37's rain-vs-wolves ITEM1
  - test 7's "0 for 2 years" is in-suite for 1 season, with the full 2 years in pop_v38f
  - a clean game day after each fixture kind
  - no speech
- New `tests/pop_v38f.js`: 8 seeds × 2 years in parallel, plus a wiped-pack run.
- New `tests/chrome_v38f.js`: desktop 1366×768 and phone 390×844, plain load plus every `?fixture=wolves` kind, text ≥16px, **0 JS errors**.
- **Counts:**
  - headless_v38 185 PASS, 0 FAIL ((a)-(e) still green).
  - chrome_v38f ALL PASS.
  - pop_v38f: deer or dogs wiped out on 0 of 8 seeds, and the wiped pack stays at 0 for 2 years.
  - Old suites are unchanged (only the version and ?v pins fail):
    - v37 2, hut35 4, season38 4, people39 5, tip37 4
    - hides31 2, moods27 2, then crash on stale loaders
    - 26b and powers23 crash on stale loaders
- Season ends in pop_v38f, as deer/dogs/wolves/people:

| Seed | Final | People deaths |
|---|---|---|
| 1 | 13/1/5/0 | wolves 2, thirst 3 |
| 2 | 8/3/3/0 | thirst 6, wolves 1 |
| 3 | 11/1/3/0 | wolves 5 |
| 4 | 7/4/4/0 | wolves 2, thirst 3 |
| 5 | 11/3/5/0 | wolves 4, thirst 1 |
| 6 | 11/2/5/0 | wolves 5, wounds 1, thirst 2 |
| 7 | 4/4/5/0 | wolves 5 |
| 8 | 16/3/3/1 | wolves 4, thirst 1 |
| no wolves | 20/4/0/0 | thirst 6 |

- Fight fixture: the wolf is killed in 24 of 30 seeds within 4 game hours (8 of 10 in-suite).

**Bugs found/fixed:**
- A wolf froze after a threaten.
- The label read "wolvess".
- The bite victim was picked with `orng.next()*n`, which crashed because next() is a uint32; it now uses `pick`.
- The log read "A Wolves feeds"; it now reads "Wolves 28 feeds".
- Wild dogs wiped out the deer (the tune above).
- A standing group took the full threaten damage every minute; the wolf is now held off.

**Not fixed (report):**
- In src/agent.js, lines ~531-653 use `sim.rng.next() < p` (a uint32), so hypothermia confusion, drops and drowsiness never fire, and 50/50 log variants always pick the second.
- People die out within about 1 year on most seeds even with no wolves (thirst). This was there before (f).
- In 2-year runs, group hunts never start on their own, because people are rarely holding a locked spear.
- The orphan-wolf corpse radius 10 is hard-coded (pre-existing).

## (g) Fire burn limit (DONE)

**What it does**
- A fire stops spreading once it has burned `fire.burnBudget` tiles. The tiles already alight still burn out.
- A tile with no fuel (sand, with no burnable item lying on it) cannot hold a flame. `Fire.hasFuel` now guards `Fire.ignite`.
- No change to the save format: the budget reads the existing `ev.tiles`. saveVersion stays 38.

**Tunables (data/config.js `fire`)**
- `burnBudget: 40` is the new knob. It counts tiles per fire event, which is 1.7% of the 2400-tile map. 0 turns it off.
- `spreadScale: 0.024` was 0.016. It is the only tested value that clears 80%+ reach-8 on all three seed sets.
- `minDryness: 30` and `climate.dryness.nearWater: -45` are unchanged.
- `fixture: { edgeTiles: 3, rainStrength: "heavy" }` controls the fire fixture.
- Why tiles and not hours: a per-event tile budget needs no new saved field. A time limit would need a fire-start time, and lightning holdover embers already last for days.

**Fixture**
- `GS.debug.fireFixture({kind, seed})` and `?fixture=fire&kind=meadow|wet|rain|nearwater|shore|sand|cold|woods`.
- It moves the clock to the case's season, sets up the case (rain over the whole map for wet and rain), then lights a tile.
- Log lines: "Flames take hold in the grass", or "A flame touches the bare sand and dies".

**100-seed sweep (tests/fire_sweep_v38g.js, seeds 1000-1099, spreadScale 0.024, budget 40)**

| case | n | median spread | 0-2 tiles | 8+ tiles | max (map %) | median burn |
|---|---|---|---|---|---|---|
| High Sun meadow | 100 | 39 | 10% | 87% | 39 (1.7%) | 3.2 h |
| Wet ground | 100 | 0 | 100% | 0% | 0 | 0.7 h |
| Rain falling | 100 | 0 | 100% | 0% | 0 | 0.7 h |
| Near-water start | 99 | 0 | 98% | 1% | 39 (seed 1041) | 0.7 h |
| Dry meadow beside near-water ground (shore) | 99 | 5 | 47% | 49% | 39 | 2.0 h |
| Sand start | 99 | 0 | 100% | 0% | 0 (flame does not take) | 0 |
| Deep Cold meadow | 100 | 0 | 94% | 2% | 13 | 0.7 h |
| High Sun woods (info) | 100 | 39 | 9% | 90% | 39 | 4.0 h |

**Near-water catch**
- Near-water tiles next to flames that caught, across meadow and shore fires: 5.8% (12/206).
- Shore fires alone: 3.8% (7/184).
- In-meadow fires alone: 22.7% (5/22). That sample is tiny because few meadow fires reach the water before the budget stops them.

**Other seed sets (0.024)**
- Seeds 2000-2099: meadow 88% reach 8+, near-water start 96% at 0-2, Deep Cold 99% at 0-2 (max 12), near-water catch 5.5%.
- Seeds 3000-3199: meadow 90% reach 8+, near-water start 94% at 0-2.

**Alternative: spreadScale 0.02 (seeds 1000)**
- Meadow 83% reach 8+. Near-water start 100% at 0-2. Deep Cold 97% at 0-2 (max 6). Near-water catch 5.3%.
- But seeds 2000 give only 77% reach 8+, below the target.

**Bugs / findings**
- **Sand start reached 291 tiles in the Tester's v37.2 run.**
  - Cause: the hotfix fixture called `Fire.ignite` directly on a sand tile. That tile has dryness 0 and no fuel, yet it held a 40-minute flame that spread into the dry meadow beside it.
  - No real start path does this: sparks, lightning and burning sticks all check ground and dryness.
  - Fix: `Fire.hasFuel` guards `ignite`. A flame on bare sand dies at once, while a stick lying on sand still counts as fuel.
- **Old numbers (0.016, no limit) did not meet the (g) targets.**
  - Meadow: 64% reach 8+, median 167.5, max hit the 300 cap. Uncapped, fires ran past 600 tiles (about 25% of the map).
  - The old 8.2% near-water figure was luck of the seed sample. Over 300 seeds it is about 12%.
- **Near-water starts still escape about 2-6% of the time**, at any spreadScale (4% even at 0.016).
  - Cause: a high patch term can leave a near-water tile at dryness 31-44, next to dry ground at 78-80.
  - The budget keeps any such fire at 40 tiles or fewer.
- **Burn sizes pile up at the budget.** Most dry-season fires burn exactly 40 tiles.

**Tests**
- tests/headless_v38.js: 210 PASS, 0 FAIL. (a) to (f) give 185, the same as before, and the new (g) section adds 25.
  - The line-58 fire pin was updated to spreadScale 0.024 and burnBudget 40.
- tests/headless_fire_hotfix.js (copied from v37.2 and given a FIRE_BUDGET env) with FIRE_N=100: 1 FAIL.
  - The fail is its old meadow-only near-water tally: 22.7%, 5 of 22.
  - The (g) section measures near-water catching with the shore fixture instead, which gives about 200 exposures (5.8%).
- Old suites match their baselines: v37 2, hut35 4, season38 4, people39 5, tip37 4, hides31 2, moods27 2, and 26b/powers23 crash on stale loaders. Every fail is an old saveVersion or ?v= pin.

## Pre-freeze prep (not frozen; godsim-rc untouched)
- **Version check:** saveVersion is 38. index.html has 41 `?v=38` entries and nothing at another version. Every referenced file exists.
- **New fixtures:**
  - `?fixture=sprout` / `GS.debug.sproutFixture()`
  - `?fixture=cache` / `GS.debug.cacheFixture()`
  - `?fixture=hut&kind=tiers` / `GS.debug.hutTiersFixture()`
  - Config `farm.fixture`, `food.fixture` and `hut.fixture` (tiles, clear, gap, tiers).
  - The first Chrome close-ups showed people standing on the fixture plants and pile, so the fixtures now pick tiles at least `clear` (2) tiles from everyone.
- **Tests:**
  - headless_v38 now gives 238 PASS, 0 FAIL (28 new pre-freeze checks).
  - New tests/chrome_v38.js covers desktop and phone, every fixture, a plain load and the v37.2 to v38 migration: 150 PASS, 0 FAIL.
  - New tests/f7_2yr_v38.js gives 10 PASS. Its output, together with pop_v38f, is in tests/f78_v38_output.txt.
  - New tests/make_save_v37.2.js writes tests/fixtures/save_v37.2.json.
  - The old suites are unchanged from their baselines.
- **Notes:** FREEZE_NOTES_v38.md.
