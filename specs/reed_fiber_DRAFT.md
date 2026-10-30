# DRAFT — Reed fiber (save v39, after v38 "Living off the land" is published)
Status: DRAFT for Commissioner review. Spec only; build waits until v38 is published.
Scope (Commissioner via Judge, Oct 30 12:10 PT): a general-purpose fiber from reeds, used for clothes, bowstrings and rope, built so later uses can draw on it. Emergent only: people gather it, learn it and copy it. No crafting UI, no words (language is step 23), logs describe actions only. Original IP. Names marked NEW don't exist in the code yet; everything else is a real identifier today.

## Already in the game
- Reeds: seeded at world creation as `reed` items on river banks only (`objects.reed`, `where: "riverBank"`, drawn with `reedBank` overlay). Material `reed` (hardness 15, dryness 35, durability 35, flex 70, burns). First pick-up → Discoveries "First reed". **Today reeds never regrow**: every reed used in a hut or axe binding is gone for good.
- Reeds are used as a hut material (tier `reeds`, `hut.patch.reed` 18) and as the axe binder (`tools.binders: ["reed"]`, `bind` action).
- Warmth: hide worn = `hides.wornC` 8 °C, sleep-under `hides.sleepC` 6, all heat stacked and capped by `shelter.capX`. Deep Cold (`climate.hard`) can kill in the open by the ramp years.
- Hunting: `hunt.strikeTiles` 4, deer bolt inside 4 tiles, kill odds `hunt.odds` base 0.10 + sharp 0.30 + learned 0.20 + tip 0.25. Spear `tools.spear` reachTiles 2, pokeChance 0.4.
- Learning: `Learn.add` / `Learn.success`, generic copying (`learn.copyTiles` 5, copyMargin 10, copyChance 0.35, copyShare 0.5), children `child.copyX`, locked tools at `tools.scoreMin` 45. Discoveries via `Discoveries.note(sim, who, action, mats, result)`.

## New in v39
(1) Source: reed beds that regrow — NEW `reeds`
- Every tile that held a seeded reed becomes a reed bed (NEW `sim.reedBeds`), max 3 standing reeds each. Standing reeds draw on the bank overlay; picking one takes it as a `reed` item, same as now.
- A bed regrows one reed every `reeds.regrowDays` by season: Greening 3, High Sun 4, Leaffall 5, Deep Cold none. Rain on the bed speeds it (x `reeds.rainX` 1.5). Fire burns standing reeds off; the bed comes back after `fire.regrowMinutes` like other fuel.
- New beds don't spread or get planted (that's a later hook, like berry planting).

(2) Gathering and turning reeds into fiber (three plain actions, one item in hand)
- Soak: a reed left on a tile next to water (or held while standing in the shallows band) for `fiber.soakMinutes` 240 turns `soaked` (NEW item flag). This is passive, like meat drying by a fire, so the first one happens by accident.
- Beat: striking a soaked reed with anything hard (the existing `strike` try action, hardness ≥ 40) for `fiber.beatMinutes` 20 makes one NEW `fiber` item (form `bundle`). A dry reed just bends: no fiber.
- Twist: rubbing a fiber bundle (existing `rub` try action, held fiber on ground fiber, or alone while idle at score ≥ 50) for `fiber.twistMinutes` 30 turns 2 bundles into 1 `cord` (NEW form of material `fiber`).
- Generic hook: material `fiber` (NEW in data/materials.js: hardness 5, dryness 60, durability 40, flex 90, burns, `isFiber: true`). Any later recipe asks "is this a fiber item?" (bundle or cord), never "is this a reed".

(3) Uses
- Fiber clothes, NEW `wrap`: a cold person holding a bundle may wrap it about herself (same try rule as hides: `tryChance` x curiosity/50 x (0.5 + coldFear/100)). Each bundle adds one layer, up to 3. Warmth `wrap.perLayerC` 2.5 (3 layers = 7.5 °C, just under a hide's 8). A wrap can be worn under a hide: both count, still capped by `shelter.capX`, so hide + full wrap is the warmest clothing in the game. Wrap has `dur` 0-100: loses `wrap.wearPerDay` 4 (x2 in rain, x1.5 in Deep Cold); under 50 it looks worn and gives 0.7x; at 0 it drops one bundle as an item. Re-wrapping with a bundle patches +35. Hides don't wear out this way, so fiber is cheap but needs upkeep.
- Rope (cord), lashing: carrying cord to one of her huts and adding it (same act as adding a material) lashes it: hut `lashed` (NEW), decay x `rope.hutDecayX` 0.7, and patching a lashed hut restores +5 extra. A lashed cache holds `cache.pileMax` +1. Cord also joins `tools.binders` (`["reed","cord"]`): an axe bound with cord dulls slower (`rope.binderDurX` 1.5 on starting durability). Cord is the hook for later (nets, sledges, carrying slings).
- Bowstring → bow + arrows:
  - Bow (NEW tool `bow`): the existing `bind` action with a cord on a high-flex stick (flex ≥ `bow.minFlex` 65, not a shard) bends it into a strung bow. Needs bind score ≥ 45 and twist score ≥ 50.
  - Arrows (NEW item, material `stick`, form `arrow`): `cut` a stick with a sharp edge (existing cut, sharpness ≥ 55) → `bow.arrowsPerStick` 3 arrows on the ground. Striking a flint/ore point onto an arrow uses the v34 tip rule → tipped arrow.
  - Carrying: arrows ride on the bow (`bow.arrows`, max `bow.quiverMax` 6), so one-item-in-hand still holds. A person holding a bow picks up arrows within 1 tile.
  - Shooting: range `bow.shootTiles` 6 (spear reach 2, hand strike 4), so a deer can be hit before it bolts at 4. Hit = `hunt.odds.base` + `bow.oddsAdd` 0.15 + learned 0.20 (+ tip 0.25 for a tipped arrow), x `bow.farX` 0.7 beyond 4 tiles. Heavy rain x `bow.rainX` 0.6.
  - Arrows lost/recovered: a hit arrow stays in the body and comes back when meat is cut (`bow.recoverHit` 0.8, else it broke). A miss lands 1-3 tiles past the target; the shooter goes to get it if she saw it fall (`bow.recoverMiss` 0.6), else it's left as a ground item anyone can pick up. String wear: each shot `bow.snapChance` 0.02 the cord snaps → the bow drops back to an unstrung stick (restring with a new cord).

(4) How it's learned and spreads
- NEW learn actions (all start at `learn.start` 50, fear null): `fiber` "beating reeds into fiber", `twist` "twisting cord", `wrap` "wrapping in fiber", `lash` "lashing with cord", `bow` "shooting a bow".
- First triggers are accidents of existing try actions: a reed happens to lie at water's edge long enough, someone strikes it while trying things. Success = `fiber.gain` 12; doing it on purpose needs score ≥ `tools.scoreMin` 45 (like tools).
- Need pushes it: a person who was cold with no hide and then got warm from a wrap gains `wrap.warmGain` 1 per warmth point (like `learn.hide`). A shooter's kill gains `hunt.gain` and `bow` 20.
- Spread is watching only: everyone awake within `learn.copyTiles` who sees a success can copy it (generic rules, group and child multipliers). Seeing a deer drop from an arrow also gives `hunt.watchGain`.
- Discoveries (one each, first time): First soaked reed, First fiber, First cord, First fiber wrap, First lashed hut, First bow, First arrows, First bow kill, First wolf shot down. Logs: "lays a reed in the shallows", "beats a soaked reed into strands", "twists strands into cord", "wraps fiber about her shoulders", "lashes the hut with cord", "bends a stick with a cord", "looses an arrow at the deer".

(5) Save fields + migration 38 → 39 (`Sim.migrate39`, `config.saveVersion` 39)
- NEW `sim.reedBeds`: [{x, y, n, max, nextAt}]. Migration rebuilds bed spots by re-running the reed deposit placement from the world seed (objects use their own stream), sets n = reed items still on that tile (0-3), max 3. Programmer to confirm the stream reruns cleanly; fallback = beds on current reed item tiles only.
- Items: `soaked`, `soakStartAt` on reeds; material `fiber` with `form` bundle|cord; tool `bow` with `arrows`, `strung`; form `arrow` with optional `tip`.
- People: NEW `a.wearingWrap` (item id or null), wrap item `layers`, `dur`. New learn scores are absent in old saves and read as `learn.start`.
- Huts: `lashed` (default false). Caches: `lashed` (default false).
- Everything defaults to off/empty: a migrated v38 world plays the same until someone soaks a reed.

(6) Config (proposed defaults)
```
reeds:  { bedMax: 3, regrowDays: [3, 4, 5, null], rainX: 1.5 }
fiber:  { soakMinutes: 240, beatMinutes: 20, beatMinHardness: 40, twistMinutes: 30, twistPer: 2, gain: 12, scoreMin: 45,
          tryChance: 0.4, lines: {...} }
wrap:   { perLayerC: 2.5, maxLayers: 3, wearPerDay: 4, rainX: 2, coldX: 1.5, wornBelow: 50, wornX: 0.7, patch: 35, warmGain: 1 }
rope:   { hutDecayX: 0.7, hutPatchAdd: 5, cachePileAdd: 1, binderDurX: 1.5 }
bow:    { minFlex: 65, bindMin: 45, twistMin: 50, arrowsPerStick: 3, quiverMax: 6, shootTiles: 6, oddsAdd: 0.15, farX: 0.7,
          rainX: 0.6, recoverHit: 0.8, recoverMiss: 0.6, snapChance: 0.02, cooldownMinutes: 10 }
tools.binders: ["reed", "cord"]
wolfFight.held.bow: 25            (v38 (f) key; spear/axe values set there)
wolfFight.ranged: { tiles: 6, killX: 0.6, archerAllies: true }
```

(7) Art needs (16 px, same style and sheet layout as today)
- `reed_16.png`: add col `reed_soaked` (darker, limp).
- `reed_bank_16.png`: add bed stages `bed_0` (cut stubs), `bed_1`, `bed_2`, `bed_3` (full).
- NEW `fiber_16.png` cols: `bundle`, `cord`, `coil` (cord in a cache/hut).
- NEW `wrap_worn_16.png` rows down/left/right/up x cols `layer_1`, `layer_2`, `layer_3`, `worn` (64x64), drawn under `hideWorn`.
- NEW `bow_16.png` rows down/left/right/up x cols `unstrung`, `strung`, `draw` (48x64), same origin as `tools`.
- NEW `arrow_16.png` cols: `arrow`, `arrow_tip`, `arrow_ground`, `arrow_body` (stuck in carcass); plus `fx_16.png` cols `arrow_fly_0`, `arrow_fly_1`.
- `hut_tiers_16.png`: one `lashed` overlay frame that sits on any tier.
- Discoveries icons: fiber, cord, wrap, bow, arrow.

(8) Links to v38
- Reed huts compete with fiber for reeds. That's intended: regrowing beds make it a choice, not a dead end. A person won't take the last standing reed of a bed for a hut while someone within 3 tiles is soaking reeds there (no fight, just picks another bed). Lashing with cord is the "better hut" path that uses fewer reeds than a reed roof.
- Wolves (v38 (f)): a bow counts as held weapon `wolfFight.held.bow` 25 in readiness. An archer within `wolfFight.ranged.tiles` 6 counts as an armed ally for the 3+ rule (armed person + at least 2 armed allies) even when not adjacent, and shoots instead of striking (hit = the hunt kill roll x `ranged.killX` 0.6). Archers at range don't take wolf bite rolls unless the wolf turns and closes. The 3+ rule stays: no lone archer hunts wolves. A wolf killed by an arrow gives the same body, meat and hide, tag "killed by people", and watchers' fear drops by `wolfFight.killWatchDrop` as in (f).

(9) Tests (fixtures, short; no long sim runs)
1. A reed on a water-edge tile goes soaked after 240 min; one on dry ground doesn't. Striking soaked gives a fiber bundle; striking dry gives none.
2. Two bundles twist into one cord. Cord binds an axe and that axe starts with 1.5x durability.
3. A cold person with a 3-layer wrap is 7.5 °C warmer; wrap + hide stays under `shelter.capX`. Wrap dur falls faster in rain; at 0 it drops a bundle.
4. A lashed hut decays at 0.7x an unlashed one over the same span; a lashed cache holds pileMax + 1.
5. Bind cord on a flex-70 stick → bow; on a flex-40 stick → nothing. Cut stick → 3 arrows; bow holds max 6.
6. Fixture: archer 5 tiles from a deer kills in N tries before the deer bolts; spear holder at 5 tiles can't strike. Hit arrow recovered on cutting meat at ~0.8; missed arrow lands 1-3 tiles past.
7. Reed bed: picked to 0, regrows 1 in Greening after 3 days, none in Deep Cold; fire clears it and it returns.
8. Copy: a watcher within 5 tiles of a first fiber success copies the score at the expected rate over N fixture tries; Discoveries gets exactly one "First fiber".
9. Wolves: 1 spear holder + 2 archers at range 5 count as 3 armed and can kill a wolf in N tries; 1 archer alone runs.
10. Migrate 38 → 39: beds rebuilt, no wraps/bows/fiber, learn scores read 50, old huts and caches unlashed. Round-trip save/load keeps every new field.

(10) Out of scope
- Looms, weaving, any crafting or recipe UI, cloth or woven mats.
- Trade, dyes, decoration, baskets, bags or multi-slot inventory.
- Nets, fishing, snares, traps (cord is the later hook).
- Planting reeds or new reed beds spreading.
- Bows in fights between people. Talking about any of it.

## Open questions for the Commissioner
1. Clothes warmth: is a full fiber wrap (7.5 °C) just under a hide (8 °C), stacking with a hide, the right feel? Or should fiber be clearly weaker (e.g. 5 °C) so hides stay the prize?
2. Reed beds regrow (none in Deep Cold). OK to add regrowth, which also changes v38 reed huts (reeds stop being a one-time supply)?
3. Bow range 6 tiles lets hunters hit deer before they bolt. Too strong for a first bow, or keep it and let arrow loss and string snaps balance it?
4. Should archers count toward the 3+ armed rule for wolf hunts from range, or must at least 2 hunters be close in with spears/axes?
