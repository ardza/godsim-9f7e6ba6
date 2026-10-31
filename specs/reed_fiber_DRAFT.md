# FINAL — Reed fiber + melee/ranged skills + wolf memory (save v39)
Status: FINAL (Oct 30). Spec only, nothing built; build waits until v38.1 is published. v38 "Living off the land" is LIVE (commit ac4f146). The thirst/cold fix ships next as v38.1; reed fiber building waits until v38.1 is published.
Scope (Commissioner via Judge, Oct 30 12:10 PT; answers Oct 30 ~3:08 PT; fighting answers relayed by Judge Oct 30 PM; open questions decided by Judge, Oct 30 4:44 PM PT, after the Commissioner passed on them): a general-purpose fiber from reeds, used for clothes, bowstrings and rope, built so later uses can draw on it. Plus two learned skills, melee and ranged, a group judgment that replaces the v38 fixed "armed + 2 armed allies" wolf rule, sparring only by agreement (stance and copying before language, words too after), and wolves that remember and learn. Emergent only: people gather, learn and copy. No crafting UI, no new UI. No words before language (standing rule), logs describe actions only. Original IP. Names marked NEW don't exist yet; the rest are real identifiers (v38 names checked in godsim-rc).

## Already in the game
- Reeds: seeded at world creation as `reed` items on river banks only (`objects.reed`, `where: "riverBank"`, drawn with the `reedBank` overlay). Material `reed` (hardness 15, dryness 35, durability 35, flex 70, burns). First pick-up → Discoveries "First reed". **Today reeds never regrow.**
- Reeds are a hut material (tier `reeds`, `hut.patch.reed` 18) and the axe binder (`tools.binders: ["reed"]`, `bind` action).
- Warmth: hide worn `hides.wornC` 8 °C, sleep-under `hides.sleepC` 6, all heat capped by `shelter.capX`. Deep Cold (`climate.hard`) can kill in the open in the ramp years.
- Hunting: `hunt.strikeTiles` 4, deer bolt inside 4, kill odds `Hunt.odds` = `hunt.odds` base 0.10 + sharp 0.30 + learned 0.20 + tip 0.25. Spear `tools.spear` reachTiles 2, pokeChance 0.4. `a.stats.kills` counts deer kills.
- Learning: scores in `a.exp[key]` ({score, n, copied}) via `Learn.add` / `Learn.success` / `Learn.score`, start `learn.start` 50, generic copying (`learn.copyTiles` 5, copyMargin 10, copyChance 0.35, copyShare 0.5), `child.copyX`, tools lock at `tools.scoreMin` 45. Discoveries via `Discoveries.note(sim, who, action, mats, result)`.
- v38 (f) wolves (`src/wolffear.js`, `G.WolfFight`, `config.wolfFight`):
  - `WolfFight.readiness` (computed, not stored) = `wolfFight.held[tool]` (spear 25, tip_stick 25, tip_bone 25, axe 20, flake 10) + `wolfFight.hide` 5 + `wolfFight.perAlly` 10 × able adults within `allyTiles` 3. `WolfFight.able` = awake adult, uninjured, energy ≥ `exhaustedBelow` 20.
  - `WolfFight.stands` = readiness > `WolfFear.of(a)`; `WolfFight.confront` stands or runs; a lone unarmed person always runs.
  - Group hunt: an armed, standing adult with ≥ `wolfFight.hunt.minAllies` 2 armed standing allies → `startChance` 0.05 × (`pullBase` 0.5 + `wolf_hunt` score / `pullPer` 50).
  - `WolfFight.strike`: one roll for the team = mean `Hunt.odds` × `oddsX` 0.8 × attackers, capped `maxChance` 0.8; a miss bites one attacker at `biteChance` 0.35. Kill: `wolf_hunt` +`learnGain` 15, `a.stats.wolfKills`++.
  - Fear log `a.wolfFearLog` keeps the last 10 events ({t, k}), including k "survived".

## New in v39
(1) Source: reed beds that regrow (approved) — NEW `reeds`
- Every tile that held a seeded reed becomes a reed bed (NEW `sim.reedBeds`), max 3 standing reeds. Picking one takes a `reed` item as now.
- A bed regrows one reed every `reeds.regrowDays` by season: Greening 3, High Sun 4, Leaffall 5, Deep Cold none. Rain on the bed x `reeds.rainX` 1.5. Fire burns standing reeds; the bed returns after `fire.regrowMinutes` like other fuel.
- Beds don't spread and nobody plants them (later hook).

(2) Gathering and turning reeds into fiber (three plain actions, one item in hand)
- Soak: a reed left next to water (or held while standing in the shallows band) for `fiber.soakMinutes` 240 turns `soaked` (NEW item flag). Passive, like meat drying by a fire, so the first one is an accident.
- Beat: the existing `strike` try action on a soaked reed with anything hardness ≥ 40, `fiber.beatMinutes` 20 → one NEW `fiber` item (form `bundle`). A dry reed just bends.
- Twist: the existing `rub` try action on fiber (or alone while idle at twist score ≥ 50), `fiber.twistMinutes` 30: 2 bundles → 1 `cord` (NEW form of `fiber`).
- Generic hook: material `fiber` (NEW in data/materials.js: hardness 5, dryness 60, durability 40, flex 90, burns, `isFiber: true`). Later recipes ask "is this a fiber item?" (bundle or cord), never "is this a reed".

(3) Uses
- Fiber clothes, NEW `wrap`: a cold person holding a bundle may wrap it about herself (hide try rule: `tryChance` x curiosity/50 x (0.5 + coldFear/100)). Up to 3 layers, each bundle one layer. Warmth per layer `wrap.layerC` [2, 1.5, 1.5] → **full wrap +5 °C**, clearly below a hide's +8. Worn under a hide both count (8 + 5 = 13), still capped by `shelter.capX`. `dur` 0-100: −`wrap.wearPerDay` 4 (x2 in rain, x1.5 in Deep Cold); under 50 worn = 0.7x warmth; at 0 drops one bundle. Re-wrapping a bundle patches +35. Cheap, weaker than hide, needs upkeep.
- Rope (cord), lashing: adding cord to one of her huts (same act as adding a material) sets hut `lashed` (NEW): decay x `rope.hutDecayX` 0.7, patches +5 extra. A lashed cache holds `cache.pileMax` +1. Cord joins `tools.binders` (`["reed","cord"]`); a cord-bound axe starts with x `rope.binderDurX` 1.5 durability. Cord is the hook for nets, slings, sledges later.
- Bowstring → bow + arrows (range approved):
  - Bow (NEW tool `bow`): existing `bind` with a cord on a stick of flex ≥ `bow.minFlex` 65, not a shard. Needs bind ≥ 45 and twist ≥ 50.
  - Arrows (NEW form `arrow`, material `stick`): existing `cut` on a stick with a sharp edge (≥ `bow.arrowEdge` 45; was 55, which no edge in a normal year reached) → `bow.arrowsPerStick` 3. Flint/ore struck onto an arrow uses the v34 tip rule → tipped arrow.
  - Arrows ride on the bow (`bow.arrows`, max `bow.quiverMax` 6), so one item in hand still holds. A bow holder picks up arrows within 1 tile.
  - Shooting: `bow.shootTiles` 6, so a deer can be hit before it bolts at 4. Hit = `hunt.odds.base` + `bow.oddsAdd` 0.15 + learned 0.20 (+ tip 0.25), x `bow.farX` 0.7 past 4 tiles, x `bow.rainX` 0.6 in heavy rain. NEW learn key `bow` scales it: x (0.5 + bow score/100). (`bow` is the know-how for deer shots; the NEW `ranged` skill in (5) scales shots at wolves and dogs.)
  - Lost/recovered: a hit arrow comes back when meat is cut (`bow.recoverHit` 0.8, else broken). A miss lands 1-3 tiles past; she fetches it if she saw it fall (`bow.recoverMiss` 0.6), else it stays as a ground item. Each shot `bow.snapChance` 0.02 snaps the cord → unstrung stick, restring with new cord.

(4) How fiber is learned and spreads
- NEW learn actions (start `learn.start` 50, fear null): `fiber` "beating reeds into fiber", `twist` "twisting cord", `wrap` "wrapping in fiber", `lash` "lashing with cord", `bow` "shooting a bow". Skills `melee`, `ranged` and the sparring know-how `spar` are in (5).
- First triggers are accidents of existing try actions. Success `fiber.gain` 12; doing it on purpose needs score ≥ `tools.scoreMin` 45.
- Need pushes it: cold, no hide, then warmed by a wrap → `wrap.warmGain` 1 per warmth point (like `learn.hide`). A shot kill gives `hunt.gain`, `bow` +20 and `ranged` +3 (see 5).
- Spread by watching only (generic copy rules, group and child multipliers). Seeing a deer drop from an arrow also gives `hunt.watchGain`.
- Discoveries (first time each): First soaked reed, First fiber, First cord, First fiber wrap, First lashed hut, First bow, First arrows, First bow kill, First wolf shot down. Logs: "lays a reed in the shallows", "beats a soaked reed into strands", "twists strands into cord", "wraps fiber about her shoulders", "lashes the hut with cord", "bends a stick with a cord", "looses an arrow at the deer".


(5) Melee and ranged skills, group judgment, sparring (replaces the v38 fixed armed-allies rule and the earlier single `fight` draft)
- Two NEW learn keys (0-100, fear null), both starting at 20, not 50 (NEW per-key start override `learn.startOf`):
  - `melee` "fighting up close" in `a.exp.melee`: spears, clubs, fists (anything held that isn't a bow, or bare hands).
  - `ranged` "fighting at range" in `a.exp.ranged`: bows and any thrown hit (decided by Judge, Oct 30). No throw act exists today; if one is added its hits are ranged. A spear poke at `reachTiles` 2 is melee.
- Each grows only by its own practice:
  - melee: melee deer kill +3, missed melee hunt strike +1, each melee strike at a wolf or dog +4, wolf kill +10 (on top of `wolf_hunt` +15), surviving a wolf strike +5, desperate defence that wounds +8, sparring +2 (never above `melee.sparCap` 50).
  - ranged: bow (or thrown) deer kill +3, missed shot at an animal +1, each shot at a wolf or dog +4, wolf kill +10 (on top of `wolf_hunt` +15). No sparring for ranged.
  - A wolf kill gives +10 to the skill each attacker used in that fight (both if she used both). Surviving a bite is always melee.
- Spread by copying: any melee gain is a visible melee success, any ranged gain a visible ranged success; watchers within `learn.copyTiles` copy that one key by the generic rules (copyMargin, copyChance, copyShare, group and child multipliers, `child.seepX`). Watching a spear fight never raises ranged, and the reverse.
- What they scale: fights with wolves and dogs only. Deer odds stay on the existing `hunt` and `bow` keys; combat and hunting stay separate (decided by Judge, Oct 30).

Per-person strength (computed, never stored or shown), NEW `WolfFight.strength(sim, q, wolf)`. The skill follows her current weapon:
- Bare hands, spear, club, axe, flake, tip_stick, tip_bone (melee, counts within `allyTiles` 3 of her or the wolf): `fight.base` 5 + melee x `fight.skillX` 0.3 + `wolfFight.held[tool]` (0 bare) + `wolfFight.hide` 5 if wearing one.
- Bow with ≥ 1 arrow (ranged, counts from up to `bow.shootTiles` 6 of the wolf): 5 + ranged x 0.3 + `wolfFight.held.bow` 20 x min(`wolfFight.bowMaxX` 1.5, ranged/50) + hide 5. A bow with no arrows, or a wolf inside 1 tile, counts as bare hands (melee, held 0).
- Only `WolfFight.able` people count.
- Wolf strength: `fight.wolfStrength` 60 per wolf within `fight.packTiles` 6 of the target (a pack of 3 nearby = 180).

Group judgment R (each person for herself, from what she sees, no talking):
- She sums her own strength + able adults she can see within `allyTiles` (and archers within bow range of the wolf) who aren't running, divides by the wolf strength she sees, and scales by fear: **R = (group / wolves) x (1 − wolfFear / `fight.fearDiv` 150)**.
  - R ≥ `fight.standAt` 0.7 → she stands (replaces `readiness > wolfFear` in `WolfFight.stands`). Below → she runs, as now.
  - R ≥ `fight.engageAt` 1.2 and armed → she may start a hunt (replaces `hunt.minAllies`; still `startChance` x pull with `wolf_hunt`).
  - Momentum: each person she sees commit (standing, walking at the wolf, striking, shooting) adds `fight.commitBoost` 0.15 to her R; each she sees run subtracts `fight.fleeDrop` 0.15. Followers re-check every `wolfFight.hunt.checkMinutes` 10. The first to commit is the lead; others who join and then share a kill copy the lead's `wolf_hunt` and the skill they used, by the usual copy rule.
- No headcount rule. A lone hunter can't reach 1.2: melee 100 + spear + hide = 65 → 1.01; ranged 100 + bow + hide = 5 + 30 + 30 + 5 = 70 → 1.09 (the bowMaxX cap keeps a lone archer under).
- Strike roll (replaces mean `Hunt.odds` x `oddsX` x attackers): chance = min(`maxChance` 0.8, `oddsX` 0.8 x sum of each attacker's odds). Melee odds = `Hunt.odds` x (0.5 + melee/100). Archer odds = bow hit chance x `fight.rangedX` 0.6 x (0.5 + ranged/100). A miss bites only melee attackers (`biteChance` 0.35); archers take no bite unless the wolf closes within strikeTiles of them.

Cornered or struck (always melee): anyone a wolf strikes, or who can't flee (no free tile away from the wolf within 2 steps, or energy < `exhaustedBelow`), fights for her life whatever R says: one roll per wolf strike — wound `fight.desperate.wound` 0.10 + melee/100 x 0.20 + held/100, kill `fight.desperate.kill` 0.02 + melee/100 x 0.05 + held/200. `held` is the melee `wolfFight.held` value; a bow counts 0 here. A wounded wolf (NEW `wolf.woundedUntil`, `fight.woundMinutes` 720) breaks off, goes back to its den, and remembers (see 5b). Log: "fights off the wolf with bare hands" / "...with the spear".

Worked examples (defaults, baseline fear 10 → x0.93):
- 3 unarmed adults, melee 20 (11 each = 33) vs 1 wolf: R 0.51 → all run.
- 2 spears, melee 20 (36 each = 72) vs 1 wolf: R 1.12 → stand, no hunt. Same two at melee 60 (48 each = 96): R 1.49 → hunt.
- 3 spears, melee 20 (108) vs a pack of 3 (180): R 0.56 → run.
- 1 spear melee 20 (36) + archer ranged 20 (19) = 55: R 0.86 → stand. Same archer at ranged 60 (47) = 83: R 1.29 → hunt.
- Weapon decides the skill: two people, each melee 60 / ranged 20. One spear (48) + one bow (19) = 67: R 1.04 → stand, no hunt. The archer picks up a spear instead (48) = 96: R 1.49 → hunt.

(5a) Sparring — only by agreement (NEW learn key `spar`, the know-how, not a skill level; decided by Judge, Oct 30)
- Not a default behaviour. Nobody has `spar` at world start or after migration.
- Before language (no words, standing rule): the inviter takes a play-wrestle stance facing the other (NEW gesture overlay, like the speech gestures). The other agrees only by copying the stance within `spar.answerMinutes` 10; if she doesn't copy it, there is no bout. Logs describe actions only: "crouches in a play-wrestle stance before Ena", "Ena copies the stance", "wrestles with Ena in the grass". Never words, never quotes.
- After language (both in a group whose `Speech.groupWords(sim, group)` holds ≥ `spar.minWords` 1 word): the stance plus any shared word can also invite, and the other may answer by word or by copying the stance. No new speech meaning; the word line follows the existing speech log rules (group syllable, never freeform).
- Agreement, both sides, either way: the other answers yes only if liking toward the inviter ≥ `spar.like` 60, she is able, food/water/warmth needs are all ≥ `spar.needMin` 40 (100 = good), and her own roll `spar.agreeBase` 0.5 + (her spar score − 50)/100 passes (no spar score yet = 0.5). A refusal (she doesn't copy or answer) costs nothing; the inviter waits `spar.retryMinutes` 240 before asking anyone again.
- How it first arises (emergent): an idle able adult or youth with melee ≥ `spar.minMelee` 21 near (`spar.nearTiles` 8) someone who likes her and is idle or wandering takes the stance with chance `spar.inventChance` 1 per hourly check x curiosity/50. v39 tune (Judge, Oct 30): the original rule (melee 30, a wolf/dog fight within `spar.recentDays` 3, an idle group-mate within 2 tiles, 0.01/h) never fired in a 1-year run on 8 seeds; melee sits at 20-25 at idle time and the recent fighters were loners 15-45 tiles from anyone liked. `spar.needRecentFight` true and `spar.groupOnly` true restore the old preconditions. The first bout in the world is a Discoveries entry, "First sparring".
- How it spreads: after a bout both get `spar` +12 (`fiber.gain`-style success); watchers within `learn.copyTiles` copy `spar` by the generic rules, with or without language. At spar ≥ `tools.scoreMin` 45 the invite chance is `spar.inviteChance` 0.05 per hour.
- Bout: `spar.minutes` 20, at most `spar.perDay` 1 per person per day (`a.sparNext`), no injuries, melee +2 each, nothing above `melee.sparCap` 50 (so real fights are needed to go higher).

(5b) Wolves remember and learn (NEW `wolfMemory`, config-driven)
- Per-wolf memory, NEW `wolf.memory`: up to `wolfMemory.max` 8 entries {who, group, s, t, near}: `who` = person id or null, `group` = people group id (`a.group`) or null, `s` = strength 0-100, `t` = tick last raised, `near` = true if raised by a nearly-killed event. When full, the weakest entry is dropped.
- Events (s adds, capped at 100):
  - Wounded by defenders (desperate wound or a team strike that wounds): each person who struck it: person entry +`wolfMemory.personS` 60; her group entry +`wolfMemory.groupS` 50. Its own caution +`wolfMemory.woundCaution` 15.
  - A packmate (same `wolf.pack`) within `fight.packTiles` 6 sees another pack wolf wounded: the same entries at x `wolfMemory.seenX` 0.5 (30 / 25), caution +`wolfMemory.seenCaution` 10.
  - A packmate killed by people in sight: entries at x `wolfMemory.killedX` 0.8 (48 / 40), caution +`wolfMemory.killedCaution` 20.
  - Nearly killed (decided by Judge, Oct 30): wolves have no HP, so a wound counts as nearly killed when the kill roll missed by less than `wolfMemory.nearKillMargin` 0.05 (roll < kill chance + 0.05), or the wolf is wounded again while still wounded (`woundedUntil` active). Entries raised by that event are marked `near` and decay `wolfMemory.nearKillX` 2 times slower.
  - Repeated defeat: each attack it broke off (wounded or held off, v38 `heldOffMinutes`) caution +`wolfMemory.defeatCaution` 5.
- Decay: s halves every `wolfMemory.halfLifeDays` 10; entries under `wolfMemory.forgetBelow` 10 are dropped. Person 60: avoided ~10 days, forgotten ~26 days. Group 50: avoided ~7.4 days, forgotten ~23 days. A `near` entry halves every 20 days: person avoided ~20 days, forgotten ~52; group avoided ~15, forgotten ~46. If an entry is raised again, the larger half-life is kept. Entries for dead people or vanished group ids are dropped.
- Caution, NEW `wolf.caution` {v, t}: 0-100, halves every `wolfMemory.cautionHalfLifeDays` 20.
- Targeting (added to the v38 wolf target choice; Programmer to name the exact function):
  - Avoid: an entry with s ≥ `wolfMemory.avoidAt` 30 (by person, or by her group) means the wolf won't pick that person, or anyone within `allyTiles` 3 of her, as a target, and keeps at least keep(s) = `keepMin` 2 + (`keepMax` 7 − `keepMin` 2) x (s − `avoidAt` 30) / (`keepFullAt` 100 − `avoidAt` 30) tiles from her, i.e. 2 + 5 x (s − 30) / 70, clamped to 2-7, no rounding (decided by Judge, Oct 30 6:14 PM PT): 2 at s 30, about 4.14 at 60, about 4.57 at 66, 7 at 100. Below 30 nothing changes: no avoidance and no keep distance, only wary.
  - Wary: an entry between 10 and 30 leaves her targetable, but the wolf's stalk/attack start chance on her is x (1 − s/100).
  - Group caution: threat T at a target = able adults within `allyTiles` 3 of her, armed (melee tool or bow) counting `wolfMemory.armedW` 2. A wolf with caution > 0 won't start on her if T ≥ max(1, round(`wolfMemory.threatBase` 8 x (1 − caution/100))). Caution 0 = no filter (v38 behaviour). Caution 50 → 4 (avoids 2 armed adults); 75 → 2 (avoids any armed person).
- Learning is by sight only: a wolf learns from what happens to it and to packmates it can see. No sharing across packs, including when a wolf joins another pack (decided by Judge, Oct 30). A hungry or starving wolf still respects its memory; hunger never overrides avoidance (decided by Judge, Oct 30).
- Logs (actions only): "the wolf keeps its distance from Ena", "the wolf circles wide of the group".

(6) Save fields + migration 38 → 39 (`Sim.migrate39`, `config.saveVersion` 39)
- NEW `sim.reedBeds`: [{x, y, n, max, nextAt}]. Migration re-runs the reed deposit placement from the world seed (objects use their own stream), n = reed items still on the tile (0-3). Programmer to confirm the rerun is clean; fallback = beds on current reed tiles only.
- Items: `soaked`, `soakStartAt` on reeds; material `fiber` form bundle|cord; tool `bow` with `arrows`, `strung`; form `arrow` with optional `tip`.
- People: NEW `a.wearingWrap` (item id or null); wrap item `layers`, `dur`. NEW `a.exp.melee`, `a.exp.ranged`, `a.exp.spar` (absent until learned), `a.sparNext` (null).
- Wolves: NEW `wolf.woundedUntil` (null), `wolf.memory` ([]), `wolf.caution` ({v: 0, t: null}). Memory entries {who, group, s, t, near}; ids are person ids; a group entry also stores `members` (the person ids of that group when it was written). Director call (v39 build): group entries match by members, not by group id (see Programmer list b), and are dropped only when none of the remembered members is alive.
- Skill seeding in migration (clamped `skillMigrate.min` 10 to `max` 60, default 20):
  - melee = clamp(20 + 2 x `stats.kills` + 10 x `stats.wolfKills` + 5 x "survived" entries in `wolfFearLog` + 0.3 x max(0, `wolf_hunt` − 50) + 0.2 x max(0, `hunt` − 50)). v38 has no bow or throw, so all of this history is melee.
  - ranged = clamp(20 + the same terms over ranged kills/shots). v38 has none, so everyone gets 20.
  - Never-did-anything people get 20 / 20. Children get 20 / 20.
- Huts and caches: `lashed` false. Other new learn keys absent → their start value; `spar` absent.
- Everything else defaults off/empty. A migrated v38 world plays the same except the wolf stand/hunt judgment (now R) and wolves that start remembering from the first wound.

(7) Config (proposed defaults)
```
reeds:  { bedMax: 3, regrowDays: [3, 4, 5, null], rainX: 1.5 }
fiber:  { soakMinutes: 240, beatMinutes: 20, beatMinHardness: 40, twistMinutes: 30, twistPer: 2, gain: 12, scoreMin: 45, tryChance: 0.8, setDownChance: 0.5, inventHardTiles: 20, gatherChance: 0.8, inventChance: 1, soakWalkTiles: 8, lines: {...} }   (v39 tune, Judge Oct 30: was tryChance 0.4 and no first-beat / set-down / gather branches)
wrap:   { layerC: [2, 1.5, 1.5], wearPerDay: 4, rainX: 2, coldX: 1.5, wornBelow: 50, wornX: 0.7, patch: 35, warmGain: 1, tryBelowWarmth: 75 }   (v39 tune: a wrap is tried when cold OR warmth < 75)
rope:   { hutDecayX: 0.7, hutPatchAdd: 5, cachePileAdd: 1, binderDurX: 1.5 }
bow:    { minFlex: 65, bindMin: 45, twistMin: 50, arrowEdge: 45 (v39 tune, was 55), seekStickTiles: 15, arrowChance: 1, keepReady: true, fetchHungryTiles: 15, arrowsPerStick: 3, quiverMax: 6, shootTiles: 6, oddsAdd: 0.15, farX: 0.7,
          rainX: 0.6, recoverHit: 0.8, recoverMiss: 0.6, snapChance: 0.02, cooldownMinutes: 10, killGain: 20 }
fight:  { base: 5, skillX: 0.3, wolfStrength: 60, packTiles: 6, fearDiv: 150, standAt: 0.7, engageAt: 1.2,
          commitBoost: 0.15, fleeDrop: 0.15, rangedX: 0.6, woundMinutes: 720,
          desperate: { wound: 0.10, woundSkill: 0.20, kill: 0.02, killSkill: 0.05 } }
melee:  { start: 20, sparCap: 50,
          gain: { deerKill: 3, huntMiss: 1, animalStrike: 4, wolfKill: 10, survived: 5, desperateWound: 8, spar: 2 } }
ranged: { start: 20, gain: { deerKill: 3, shotMiss: 1, animalShot: 4, wolfKill: 10 } }
skillMigrate: { start: 20, perKill: 2, perWolfKill: 10, perSurvived: 5, wolfHuntX: 0.3, huntX: 0.2, min: 10, max: 60 }
spar:   { minWords: 1, answerMinutes: 10, like: 60, needMin: 40, agreeBase: 0.5, retryMinutes: 240, minMelee: 21 (was 30), recentDays: 3, nearTiles: 8 (was 2),
          groupOnly: false, partnerWander: true, needRecentFight: false, inventChance: 1 (was 0.01), inviteChance: 0.05, gain: 12, minutes: 20, perDay: 1 }
wolfMemory: { max: 8, personS: 60, groupS: 50, seenX: 0.5, killedX: 0.8, halfLifeDays: 10, forgetBelow: 10, avoidAt: 30,
          keepMin: 2, keepMax: 7, keepFullAt: 100, woundCaution: 15, seenCaution: 10, killedCaution: 20, defeatCaution: 5,
          cautionHalfLifeDays: 20, armedW: 2, threatBase: 8, nearKillMargin: 0.05, nearKillX: 2 }
learn.startOf: { melee: 20, ranged: 20 }   learn.actions: fiber, twist, wrap, lash, bow, melee, ranged, spar
tools.binders: ["reed", "cord"]
wolfFight.held.bow: 20, wolfFight.bowMaxX: 1.5   (bow scaled by min(1.5, ranged / 50) at range)
wolfFight.perAlly, wolfFight.hunt.minAllies: retired (kept in config, unread, for old fixtures)
```

(7a) v39 tune, decided by Judge, Oct 30 6:13/6:14 PM PT: the features must show up in a normal 1-year run (28 days, seeds 1-8, no fixtures, no god actions), by discovery/copy rates and preconditions only, nothing scripted or forced. Added preconditions (each rate in config):
- Fiber first beat: a curious empty-handed non-knower may pick up a soaked reed within `fiber.soakWalkTiles` (p `fiber.inventChance` x curiosity/50); holding one, she strikes it on a hard thing in reach, or walks to one within `fiber.inventHardTiles` 20 and strikes it there.
- Fiber knowers: with no second bundle near she may set a bundle down (`fiber.setDownChance` 0.5); she picks up a bundle that has another lying within reach (twist ≥ `fiber.twistAlone` 50); with no soaked reed in sight she picks up a dry reed to soak (`fiber.gatherChance` 0.8). A cord in sight (twist known, `bow.seekStickTiles`) or her own unheld bow leaves the turn to the bow.
- Wrap: tried when `Hides.cold` or warmth < `wrap.tryBelowWarmth` 75 (cold alone was taken by seekWarmth first).
- Bow: with hands free she picks up a cord in sight if a stringable stick is in sight too; with a cord and no stick in reach she walks to one within `bow.seekStickTiles` 15.
- Arrows (p `bow.arrowChance` 1 per try each): an empty strung bow is put down when an edge ≥ `bow.arrowEdge` and a whole stick are within `bow.seekStickTiles`; she fetches the edge, walks to a whole stick, cuts, puts the edge down once her arrows lie cut, and takes the bow up again; her own bow and arrows are remembered out to `bow.seekStickTiles`. Before this, the hand holding the bow could never hold the edge.
- Shooting: a loaded bow she made stays in hand through other needs (`bow.keepReady`; sleep still puts it down), and hungry with empty hands she walks back for her own loaded bow within `bow.fetchHungryTiles` 15 before going to the bushes. Before this, the bow was put down at every need, so a hungry person never had it in hand.
- Fix (not a tune): a generic strike/rub/cut try marked any piece whose form was not "whole" (bundle, cord, wrap, arrow) as a broken shard, so a held cord turned into "cut fiber" on the first idle try. Now only a piece already broken counts as broken; a cord still follows the fray rule (`physics.break.noBreakFlex`).
- Spar: see (5a).

(8) Art needs (16 px, same style and sheet layout as today)
- `reed_16.png`: add col `reed_soaked`. `reed_bank_16.png`: bed stages `bed_0` (cut stubs) … `bed_3` (full).
- NEW `fiber_16.png` cols `bundle`, `cord`, `coil`.
- NEW `wrap_worn_16.png` rows down/left/right/up x cols `layer_1`, `layer_2`, `layer_3`, `worn` (64x64), drawn under `hideWorn`.
- NEW `bow_16.png` rows down/left/right/up x cols `unstrung`, `strung`, `draw` (48x64), same origin as `tools`.
- NEW `arrow_16.png` cols `arrow`, `arrow_tip`, `arrow_ground`, `arrow_body`; `fx_16.png` add `arrow_fly_0`, `arrow_fly_1`.
- `hut_tiers_16.png`: one `lashed` overlay. Wolf: one `wounded` limp frame (or tint); a wary wolf keeping its distance is movement only, no new frame. Two people wrestling: 2-frame `spar` pose. NEW `play_stance` column in the gesture overlay sheet (invite and answer).
- Discoveries icons: fiber, cord, wrap, bow, arrow, sparring.

(9) Links to v38
- Reed huts vs fiber: both draw on beds, and regrowth keeps that a choice. A person won't take the last standing reed of a bed for a hut while someone within 3 tiles is soaking there. Cord lashing is a better-hut path that uses fewer reeds.
- Wolves: (5) replaces `readiness > wolfFear` and `hunt.minAllies` in `WolfFight.stands` and the group-hunt start; (5b) adds memory and caution to wolf target choice. `WolfFight.able`, `allyTiles`, `confront`, `standMinutes`, `heldOffMinutes`, `biteChance`, `maxChance`, `oddsX`, the hunt walk, `wolf_hunt` gains, `killWatchDrop` and fear rules stay as in v38. A wolf killed by arrows gives the same body, meat and hide, tag "killed by people".
- Speech: read-only use of `Speech.groupWords` to allow a word invite after language; no new meanings or words.

(10) Tests (fixtures, short; no long sim runs)
1. Reed at water's edge goes soaked after 240 min; on dry ground it doesn't. Striking soaked → bundle; dry → nothing.
2. 2 bundles → 1 cord. A cord-bound axe starts with 1.5x durability.
3. Wrap: 1/2/3 layers = +2 / +3.5 / +5 °C; full wrap < hide; wrap + hide ≤ `shelter.capX`. Wrap dur falls faster in rain; at 0 drops a bundle.
4. Lashed hut decays at 0.7x; lashed cache holds pileMax + 1.
5. Cord on flex-70 stick → bow; on flex-40 → nothing. Cut stick → 3 arrows; bow holds max 6.
6. Archer at 5 tiles kills a deer in N tries before it bolts; a spear holder at 5 can't strike. Hit arrow recovered ~0.8; miss lands 1-3 tiles past.
7. Reed bed picked to 0 regrows 1 in Greening after 3 days, none in Deep Cold; fire clears it and it returns.
8. Copy: a watcher within 5 tiles of a first fiber success copies at the expected rate; one "First fiber" entry.
9. Weak group backs off: 3 unarmed adults at melee 20 vs 1 wolf all run (R 0.51); 3 spears at melee 20 vs a pack of 3 run (R 0.56).
10. Skilled group engages: 2 spears at melee 60 start a hunt on a lone wolf in N tries and can kill it; 2 spears at melee 20 stand but never start one in N checks.
11. Separate growth: 5 fixture spear strikes at a wolf → melee +20, ranged unchanged; 5 fixture shots at a wolf → ranged +20, melee unchanged. Spear deer kill → melee +3; bow deer kill → ranged +3 (and bow +20). Surviving a bite → melee +5 even for an archer. Shared wolf kill → +10 to the skill each attacker used.
12. Separate copying: a watcher within 5 tiles of a melee gain may copy melee and never ranged; of a ranged gain, ranged and never melee.
13. Weapon → skill mapping: one person at melee 60 / ranged 20 counts 48 with a spear, 23 bare-handed, 19 with a bow at 5 tiles, 0 with a bow at 7 tiles, and as bare hands with an empty bow. Pair at melee 60 / ranged 20: spear + bow → R 1.04 stand, no hunt; two spears → R 1.49 hunt.
14. Archer shifts it: spear + archer at ranged 20 stands, no hunt (R 0.86); at ranged 60 hunts (R 1.29). Archers at range are never bitten. A lone archer at ranged 100 with a hide never starts a hunt (R 1.09).
15. Momentum: an armed person at R 1.1 (stands, no hunt) joins a hunt once she sees one ally commit (+0.15 → 1.25). A person at R 0.8 (stands) runs once she sees one ally run (−0.15 → 0.65).
16. Cornered: a lone unarmed person pinned against water with a wolf striking rolls desperate defence every strike (no flee) using melee; over N fixture strikes she wounds the wolf about 0.14 of the time at melee 20; holding a bow gives the same rate (bow held 0); a wounded wolf goes to its den.
17. Sparring before language, by gesture: two liked, able group-mates in a group with 0 words; one takes the stance, the other copies it → bout, +2 melee each, never above 50, at most once a day each. If she doesn't copy within 10 min → no bout. Every log line in the run is action-only (stance, copying, wrestling; no speech words, no quotes). One "First sparring" entry; a watcher copies `spar`.
18. Sparring needs agreement: an invite to someone with liking < 60, or a need under 40 → refused, no gain, inviter waits 240 min. After language, a stance plus a shared word also invites and the same rules apply. With nobody holding `spar`, first invites come only from the invent rule. Nobody starts a bout without the other's answer.
19. Wolf memory avoidance: a wolf wounded by Ena (group g) holds Ena 60, g 50; it won't target Ena or anyone within 3 tiles of her and stays ≥ 5 tiles from her; it still targets a lone person from another group.
20. Wolf memory decay: after 10 fixture days Ena's entry is 30 → still avoided; just past 10 days she is targetable at reduced start chance; after 26 days the entry is gone. The group entry drops under 30 at ~7.4 days.
21. Wolf learning from packmates: a packmate within 6 tiles that sees the wound gets entries 30 / 25 and caution +10; a wolf outside 6 tiles or in another pack learns nothing. A packmate killed in sight → 48 / 40, caution +20. At caution 50 a wolf won't start on 2 armed adults (T 4); at caution 0 it does.
22. Migrate 38 → 39: beds rebuilt; melee seeded (4 deer kills + 1 wolf kill, hunt and wolf_hunt at 50 → 38), ranged 20; a person with nothing → 20 / 20; a huge history clamps at 60; nobody has `spar`; wolves memory [] and caution 0; no wraps/bows/fiber; huts and caches unlashed.
23. Nearly killed: a wound whose kill roll missed by < 0.05 (or a second wound while still wounded) marks the entries `near`; Ena's entry then stays ≥ 30 for 20 days and is gone by ~52; a normal wound's entry is under 30 just past 10 days.
24. Starving wolf: a wolf at its lowest hunger with Ena (s 60) as the only person in reach never targets her or anyone within 3 tiles of her, and keeps ≥ 5 tiles away.
25. Thrown hits: a fixture thrown hit on a wolf raises ranged, not melee; a spear poke raises melee. Melee/ranged scores leave deer hunt odds unchanged.
26. Save round-trip: a v39 world with fiber, bows, a wrap, melee/ranged/spar scores, `sparNext`, a wolf with memory (including a `near` entry), caution and `woundedUntil` saves, loads and saves again with every new field equal.

(11) Out of scope
- Looms, weaving, any crafting or recipe UI, cloth or woven mats.
- Trade, dyes, decoration, baskets, bags or multi-slot inventory.
- Nets, fishing, snares, traps (cord is the later hook).
- Planting reeds or beds spreading.
- A throw action (ranged is ready for it; thrown hits count as ranged).
- People fighting people (melee and ranged are for animals only for now; sparring is play, not a fight), bows in fights between people.
- New speech meanings or words for sparring.
- Any skill bar, group-strength meter, wolf memory view or fight UI. Any words about it before language.

## Decisions (decided by Judge, Oct 30, 4:44 PM PT; the Commissioner passed on the open questions)
1. Before language, sparring is agreed by gesture: one takes a play-wrestle stance, the other copies it. After language, any shared word can also invite. Pre-language logs are actions only.
2. No new "play" speech meaning; the stance plus any shared word is enough.
3. Wolf memory keeps the defaults (person avoided ~10 days, forgotten ~26; group avoided ~7). A nearly killed wolf remembers twice as long (`nearKillMargin` 0.05, `nearKillX` 2).
4. Wolf learning is by sight only; no sharing across packs.
5. Thrown hits count as ranged; pokes count as melee.
6. Melee and ranged don't change deer hunt odds; combat and hunting stay separate.
7. A starving wolf still respects its memory.

## Programmer to confirm at build time
a. RESOLVED (Director, v39 build): language is step 25 everywhere (src/speech.js is right). The old "step 23" labels in PLAN.md, specs/15b-17.md and specs/fix_thirst_cold_DRAFT.md were changed to step 25. The word-invite check reads the speech locks (`Speech.groupWords`).
b. RESOLVED (Director, v39 build): a group memory entry stores the member-id snapshot of her group at the time (`members`). A person the wolf meets counts as the "same group" when at least half of the remembered members who are still alive are in her current group (alive-in-her-group x 2 >= alive remembered). It fades per the half-life above like any entry. The entry is dropped when no remembered member is alive. Group ids may change on regroup; that no longer matters. Headless checks: (i) a group re-formed under a new id with the same people is still avoided; (ii) a group holding fewer than half of the remembered (living) members is not avoided.
