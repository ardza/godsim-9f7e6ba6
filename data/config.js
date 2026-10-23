// Sim configuration (all tunables live here). Plain script, sets GS.data.config; works on file://.
(function (G) {
  G.data = G.data || {};
  G.data.config = {
    saveVersion: 14,                // v14: children / youths as people (stage by age, guardian, learned-from), name numbering; v13: sex, pairs, pregnancy, babies (own stream frng), burning sticks; v12: relations (familiarity, liking) and groups; v11: cooked meat (heat), grazer births (own stream), cook score; v10: hunting, carcasses, meat, lightning; v9: varied maps (spawn, hills, map info; no lake/source); v8: learning (experience scores, copying), seasonal food, per-person logs; v7: objects, physics + discoveries, temperature + warmth, fire (v6: aging, death, bodies, animals); older saves are rejected
    saveKey: "godsim.save",
    map: {
      w: 60, h: 40, tilePx: 16,      // map is 960x640 art px, scaled to fit the screen
      renderScale: 2,                 // canvas backing px per art px (1920x1280): integer, so pixels stay crisp and walking moves in half-pixel steps
      margin: 2,                      // water never comes within 2 tiles of the edge -> land ring keeps the map connected
      // Step 15b map variety: every value comes from the seed (own stream per field). Same live tiles; only the layout changes.
      noise: { heightScale: 16, moistScale: 13, woodsScale: 6, octaves: [[1, 0.6], [0.45, 0.28], [0.2, 0.12]] },   // 3 octaves of value noise
      hills: { fraction: [0.10, 0.15], rockChance: 0.3 },   // top 10-15% of the height field; shown as clusters of the live rock things (there is no rock tile)
      moisture: { bias: [-0.3, 0.3], dryGround: 0.2 },      // per-seed dry..lush bias added to the moisture noise; open ground drier than dryGround is bare sand
      forest: { density: [0.1, 0.6], biasPull: 0.8, jitter: 0.1, patch: 0.35, hillPenalty: 0.25 },   // density 0.35 + bias x 0.8 +/- 0.1, clamped; woods = the moistest tiles
      lakes: { count: [0, 4], target: [0.035, 0.09], minSize: 12, spacing: 12, wobble: 0.12 },   // share of the map the water aims at; lakes fill low basins
      rivers: { count: [0, 2], sourceTop: 0.25, minLength: 8, pull: 0.03, jitter: 0.02, widenLast: 0.3, maxSteps: 400 },   // spring in the top 25% of height; score = height + pull x distance to the nearest lake/edge
      waterPct: [3, 12],               // attempts outside this are redone (next attempt of the same seed)
      spawnWaterTiles: 8,              // founders gather around a meadow tile with water this close (all of them stay within 12)
      maxPocket: 8,                    // land cut off by water: pockets up to this many tiles become a pond, bigger means a new attempt
      maxTries: 40
    },
    time: {
      tickGameMinutes: 1,             // 1 sim tick = 1 game minute
      realSecondsPerGameDay: 7200,    // 1x: 1 game day = 2 real hours -> 1 tick = 5 real seconds
      startMinute: 360,               // tick 0 = Day 1, 06:00
      daysPerSeason: 7,
      seasons: ["Greening", "High Sun", "Leaffall", "Deep Cold"], // season effects: climate (step 11), bushes.season and animals grazeSeason (step 15)
      speeds: [0, 1, 10, 60],         // pause, 1x, 10x, 60x (60x = 12 ticks per real second)
      maxTicksPerFrame: 240,
      autosaveRealSeconds: 60
    },
    pop: { maxPeople: 60, maxAnimals: 40, startPeople: [5, 8], clusterRadius: 3 },  // the seed picks 5-8 founders, placed on distinct tiles near the middle meadow
    person: {
      walkMinutesPerTile: 8,          // at speed 50. Actual = 8 / (0.5 + speed/100): speed 0 -> 16, 50 -> 8, 100 -> 5.33 min/tile
      startAge: [16, 40], lifespan: [60, 100], // years; 1 year = 4 seasons x 7 days = 28 game days. Each person gets a seeded lifespan and dies of old age on reaching it
      traits: {                       // the only traits; integers 0-100, 50 = average; rolled as 50 + gaussian*spread, rounded, clamped (full 0-100 allowed)
        speed: "walk time per tile = 8 min / (0.5 + speed/100)",
        appetite: "fullness drain x (0.5 + appetite/100): full (85) to hungry (50) in ~6 h at 50, ~12 h at 0, ~4 h at 100",
        curiosity: "chance to go and pick up a thing in sight when idle = objects.pickupChance x curiosity/50",
        coldFear: "seeks shelter / huddles once warmth is below warmth.seekBelow + coldFear x warmth.seekPerFear (35 at 0, 60 at 50, 85 at 100)",
        fireFear: "step 13: going near embers / a fire when cold is less likely the higher it is (x (1.5 - fireFear/100)); also lowers the odds of copying someone at a fire"
      },
      traitSpread: 17.5,              // gaussian sd in trait points
      sightTiles: 6,                  // fixed sight radius (tiles)
      // All three needs read the same way: 0-100, 100 = good, they drain down (stored as floats, shown rounded).
      // Decision rule: act on the LOWEST of fullness/water once it is below actAt (50); a tie goes to water.
      actAt: 50,
      fullness: {
        // fullness: 0 = starving, 50 = hungry, 85 = full, above 85 = overfull (only by overeating).
        threshold: 50,                // goes to eat below this (= actAt)
        minutesFullToHungry: 360,     // mealFillTo (85) -> 50 in 6 game h at appetite 50 => drain 35/360 = 0.097 per min (0 after ~14.6 h)
        planFrom: 70,                 // below this, before wandering, she leaves early if the nearest known food is so far she'd arrive below the threshold
        mealAdds: 40,                 // one ripe bush = +40 fullness
        mealFillTo: 85,               // ...but a normal (hungry) meal stops at 85 = "full"
        // Overeating: a meal started at or above threshold (a snack), or the bedtime meal, adds the full 40, capped at 100 ("overfull").
        snackAbove: null,             // set e.g. 50: a person above this who sees a ripe bush close by eats it (off = no snacking)
        start: [65, 90], min: 0       // holds at 0; logs "is starving" once on reaching 0; dies after 7 game days at 0 (person.death)
      },
      water: {
        // water: 0 = parched, 50 = thirsty, 100 = just drank. Not scaled by a trait (there is no thirst trait).
        threshold: 50,                // goes to drink below this (= actAt)
        minutesFullToThirsty: 240,    // 100 -> 50 in 4 game h => drain 50/240 = 0.208 per min (0 after 8 h)
        planFrom: 75,                 // like fullness.planFrom: leaves early if the nearest known shore is far
        start: [70, 95], min: 0       // holds at 0; logs "is parched" once; dies after 1 full game day at 0 (person.death)
      },
      drinkMinutes: 10,               // drink from any land tile next to water (4-neighbour); water rises linearly to 100
      energy: {
        // energy is 0-100. 100 = rested. Drains while awake, refills while asleep.
        drainMinutes: 960,            // 100 -> 0 over 16 waking hours
        refillMinutes: 480,           // 0 -> 100 over 8 hours of sleep
        sleepBelow: 50,               // lies down (anywhere, when idle) after dusk if energy is under this
        restedAt: 80,                 // panel word: "rested" at 80+, "fine" from sleepBelow, "tired" below that, "exhausted" at 0
        nightFrom: 1080, dawnAt: 360, // 18:00 .. 06:00 is "after dusk"; a sleeper with full energy gets up at dawn
        wakeIfNeedBelow: 10,          // a sleeper wakes early if fullness or water drops below this (also: a food/water goal is dropped for the other need below this)
        asleepNeedRate: 0.25,         // fullness and water drain at a quarter of the waking rate while asleep
        start: [90, 100]              // energy 0 logs "is exhausted" once and they lie down where they are, day or night
      },
      // Warmth (step 11): 0-100, 100 = warm. Each minute it moves toward an equilibrium set by the felt temperature:
      //   felt = air + shelter (on a woods tile) + huddle (per other person within huddleTiles, up to huddleMax) + heat from fire + walking/asleep offsets
      //   it rises by (felt - neutralC) x gainPerDegreeHour per hour when felt > neutralC, falls by (neutralC - felt) x lossPerDegreeHour when below.
      warmth: {
        neutralC: 10,                 // felt temperature with no net gain or loss
        lossPerDegreeHour: 0.85, gainPerDegreeHour: 1.5,
        shelterC: 5,                  // standing/lying on a woods tile (under trees: out of the wind)
        huddleC: 4, huddleMax: 3, huddleTiles: 1.5,   // each other person this close adds 4 C, up to 3 people
        walkingC: 2, asleepC: -1,     // moving makes heat; lying still loses a little
        sunC: 3,                      // daylight out in the open (scaled by daylight; none under trees)
        shelterTiles: 15,             // looks this far for a woods tile / company when seeking warmth
        wakeBelow: 10,                // a sleeper this cold, not under trees with company, wakes once a night to find a better spot
        seekBelow: 35, seekPerFear: 0.5,   // seeks warmth (shelter, others) below 35 + coldFear x 0.5
        start: [80, 100], min: 0      // logs "is cold" below 30 and "is freezing" at 0; dies after 1 full game day at 0 (person.death)
      },
      // Dying of need: a full game day at water 0, a full game day at warmth 0, or 7 game days at fullness 0 (the clock restarts once the need is above 0). Energy 0 never kills.
      death: { waterZeroMinutes: 1440, warmthZeroMinutes: 1440, fullnessZeroMinutes: 10080 },
      bedtimeMin: 25,                 // before lying down she drinks/eats first if that need would drop below this by the time she wakes
      bedtimeTripTiles: 6,            // ...but only if the water / a known ripe bush is within this many tiles of path (else she sleeps)
      mealMinutes: 15,                // one ripe bush = one meal, eaten in one sitting; fullness rises linearly by mealAdds
      wander: { radius: 10, idleMin: 10, idleMax: 90 },
      explore: { min: 15, max: 32, candidates: 8,
        farTiles: 999, pathCandidates: 8, nearMin: 5, nearMax: 12 }  // known bush > 20 tiles of path away? first look nearby (5-12 tiles), then go
    },
    // A death leaves a body on the tile where the person was (no grave). It decays: fresh (fixed time) -> rotting (until its flesh is gone) -> bones.
    // Bones stay as a lasting object tagged with the primitive material "bone" (its properties come in step 10) and weather away over many years.
    // People ignore bodies. Bodies and bones are inspectable and saved.
    body: {
      freshMinutes: 1440,             // fresh for 1 game day (flesh can already be eaten by scavengers)
      rotMinutes: 10080,              // rotting: the flesh (0-100) decays 100 -> 0 in 7 game days on its own; scavengers feeding make it go sooner (~2 days)
      bonesWeatherYears: 20,          // bones' condition falls 100 -> 0 over 20 game years, then they are gone
      material: "bone"                // primitive material the bones are (data only for now)
    },
    // Animals (no names; grazers die only when hunted and are born in Greening, step 17). All count toward pop.maxAnimals (40). They flee people: when a person is within fleeWithin tiles
    // they run (at fleeMinutesPerTile) to a tile at least fleeTo tiles from every person.
    animals: {
      grazer: {
        start: 15, herds: 3, herdRadius: 3,   // ~15 in 3 herds placed on meadow, away from the founders (>= startAway tiles)
        startAway: 12,
        walkMinutesPerTile: 10, fleeMinutesPerTile: 3, fleeWithin: 4, fleeTo: 6,
        fullness: { minutesFullToEmpty: 1440, grazeBelow: 50, grazeMinutes: 60, start: [55, 100] },  // fullness 0-100 (100 = good); grazes on a meadow tile for an hour (fills linearly to 100)
        idleMin: 20, idleMax: 90, nightIdleScale: 3,   // stands about (rests) between moves; longer at night
        drift: { everyMinutes: 180, min: 3, max: 6, choices: 6, greenRadius: 2 },  // the herd's home spot drifts to another meadow tile 3-6 tiles away every ~3 h; members wander within herdRadius of it
                                      // step 15: of up to 6 candidate spots it takes the greenest (grass tiles around x dampness (100 - ground dryness))
        grazeSeason: [1, 1, 1, 2],    // graze time x this by season: winter grass is thin, so a meal takes twice as long
        // Director (step 17): births in Greening only. Each grazer with another grazer within mateTiles has perSeason / (season minutes) chance a minute
        // of a calf (0.35 a grazer: about 0.7 calves per pair a spring), on a free tile next to it, in its herd. No births at or above cap grazers or pop.maxAnimals in all.
        // Own random stream (brng), so births do not shift the other streams.
        births: { season: 0, perSeason: 0.35, mateTiles: 6, cap: 40 }   // Director (step 17 call 3): 0.35 per grazer a spring
      },
      scavenger: {
        start: 4, startAway: 10,
        walkMinutesPerTile: 6, fleeMinutesPerTile: 3, fleeWithin: 4, fleeTo: 6,
        noticeTiles: 15,              // notices a body with flesh within this many tiles (and goes to eat it unless a person is within fleeWithin of it)
        fullness: { minutesFullToEmpty: 1440, feedBelow: 70, fillPerMinute: 1, fleshPerFullness: 0.15, start: [20, 60] }, // fullness 0-100; feeds on flesh at +1/min until 100, each point taking 0.15 of the body's flesh (0-100); holds at 0, no death.
                                      // Tuned so a body the scavengers find is bones ~2 days into rotting (10-seed mean ~1.7 d, range 0.3-3.6 d) instead of 7
        wanderRadius: 8, idleMin: 30, idleMax: 120, nightIdleScale: 1
      }
    },
    // Step 9 objects: seeded on the ground at world creation (their own stream, so the map, bushes and founders are unchanged).
    // People carry one thing at a time: an idle person may walk over and pick up a thing in sight (curiosity), and drops it when a need takes over,
    // before sleep, or after carry minutes. Bones from a body count: picking one up takes one of the body's bones (bonesPerBody).
    objects: {
      rock: { count: 40, where: "any" },            // anywhere on land
      stick: { count: 40, where: "woodsEdge" },     // on or next to woods
      flint: { count: 15, where: "water" },         // within 3 tiles of a river or lake (15b: some maps have no river)
      minSpacing: 1,                                 // never two on one tile at the start
      bonesPerBody: 4,                               // a skeleton gives 4 bones that can be picked up; the rest stays as the body's bones
      pickupChance: 0.6,                            // at the end of an idle spell, x curiosity/50 (0.5 at curiosity 100)
      carry: [60, 300],                              // minutes she holds it before putting it down (seeded per pick-up)
      tryChance: 0.8, tryMinutes: 5, tryReach: 10,   // a holder may try an action on a thing on the ground within tryReach tiles, right after picking up or when idle (~1 try / person / day)
      tryCooldown: 360                               // ...at most once per 6 game h each
    },
    // Step 10 physics: outcome rules over the material properties (data/materials.js). Actions: strike, rub, cut. "Held" = the thing in hand, "target" = the thing on the ground.
    physics: {
      sharpAt: 45,   // Director (step 17): one threshold - sharpness >= 45 is "sharp" everywhere (hunting odds and the sharp-shard rule)
      actions: ["strike", "rub", "cut"],
      // strike: hard on hard with a keen edge throws a spark (steel-free flint sparks: an edge of a hard stone shaves hot grains off another hard stone)
      spark: { minHardness: 65, minEdge: 35, chance: 0.6 },
      // break (strike only): the softer of the two may break. p = scale x (harder - softer hardness)/100 x (100 - durability)/100, at most max
      break: { scale: 6, max: 0.8, edgeFromHardness: 1.4, shardDurability: 0.6 }, // a broken piece: sharpness = max(old, hardness x 1.4); "sharp shard" from physics.sharpAt
      // rub: the softer one is abraded; a hard-enough softer thing gets keener (sharpens); soft dry on soft dry grows warm (friction)
      rub: { hardnessGap: 10, sharpenMinHardness: 45, sharpenBy: 4, wear: 3, warmMaxHardness: 40, warmMinDryness: 60 },
      // cut: a keen edge drawn across a softer thing notches it
      cut: { minSharpness: 55, wear: 5 }
    },
    // Step 11 air temperature (C) by season and time of day: each season has a mean, blended smoothly into the next; the day swings +-dayAmp,
    // coldest at 05:00 and warmest at 15:00.
    climate: { seasonMeanC: [13, 23, 12, -2], dayAmpC: 5, coldestHour: 5,
      // ground dryness 0-100 by season (Greening, High Sun, Leaffall, Deep Cold), plus a fixed per-tile patchiness +-patch, minus wetC near water
      dryness: { meadow: [35, 70, 55, 25], woods: [30, 50, 50, 20], sand: [0, 0, 0, 0], patch: 25, nearWaterTiles: 2, nearWater: -30 } },
    // Step 12 fire. A spark lands on the target's tile: it catches if the fuel there (ground grass/litter, or a stick lying there) is dry enough:
    //   p(ember) = igniteScale x (dryness - minDryness)/(100 - minDryness). An ember smoulders, then flares into fire (or dies out).
    // A burning tile spreads each minute to each dry 8-neighbour with p = spreadScale x (dryness - minDryness)/(100 - minDryness), burns out to ash,
    // and the scorched ground regrows (fuel back, bushes ripen again) within about a season.
    fire: {
      minDryness: 45, igniteScale: 0.5,
      emberMinutes: [20, 60], emberToFire: 0.04,          // per minute while smouldering, x dryness factor; else it goes out at the end
      burnMinutes: { meadow: 40, woods: 120 },              // how long a tile burns
      spreadScale: 0.012,
      ashMinutes: 1440, regrowMinutes: 8640,                // ash 1 day, then scorched ground; fuel and grass back 6 more days later (a season = 7 days)
      heatC: 25, heatTiles: 4,                              // a fire adds up to 25 C to the felt temperature, falling to 0 at 4 tiles (ember: a third)
      fleeTiles: 2.5, fleeTo: 5,                            // people and animals move away from flames within 2.5 tiles (no burn damage yet)
      bushBurns: true,                                      // a bush on a burning tile is burnt bare and ripens again only once the ground has regrown
      // Step 16 (Director tuning): natural fire starts. Lightning hits a random land tile perSeason times per season (seeded, orng); whether it
      // catches is the same dryness rule as a spark (p = igniteScale x dryness factor), so wet ground (sand, near water, Deep Cold) rarely burns.
      // On a woods tile it hits a tree: the dead wood in a snag is drier than the litter (+snagDry), and a struck tree can smoulder for days
      // (a "holdover": ember lasting holdMinutes, flaring up at holdFlare x the normal ember rate); its smoke is seen from smokeTiles away.
      lightning: { perSeason: [12, 6, 30, 8], snagDry: 20, holdMinutes: [2880, 30240], holdFlare: 0.01, smokeTiles: 40 },
      // Step 19 (Director call 1 on 18): carrying fire. A stick lying on a tile that catches fire is not burned away: it becomes a burning stick, lit
      // until the flames there die down plus litMinutes. Once the tile no longer burns (ember / ash, no flames within fleeTiles), an idle person
      // with it in sight may go and pick it up: p = grabChance x (fire score / 50)^2 x (1.5 - fireFear/100) (learning stream). She carries it until
      // it burns out (or a need / bedtime makes her put it down). Held or lying, it warms like an ember. Lying on dry ground or by a dry stick it
      // can light that tile by the ember rule: p per minute = fire.emberToFire x dryness factor -> a new ember there (orng; nothing scripted).
      // Director (call 11 on 19): once each game hour, an awake idle person by a fire (an ember within learn.fire.emberTiles, a fire within
      // heatTiles) with a burning stick lying within reachTiles takes it up with p = hourChance + grabChance x (fire score / 50)^2 x (1.5 - fireFear/100).
      // Children (under youth age) never take one.
      brand: { litMinutes: 120, hourChance: 0.05, grabChance: 0.1, minLeftMinutes: 30, reachTiles: 3 }
    },
    // Steps 13-14 learning. Each person keeps their own experience score (0-100, 50 = no experience) per action they have felt the result of.
    // Behaviour shifts only from that score (what this person felt) or from copying someone nearby who benefited; nothing is scripted and nothing is said.
    // Step 18: relations and groups (src/social.js). 0-100 scales; liking starts at 50 (average).
    //   familiarity +famPerHour per game hour within nearTiles, -famDropPerDay per game day apart.
    //   liking +like.shared once per stretch of a rising need (eating, drinking, warmed by fire or huddling) with them within nearTiles (a stretch ends
    //   after like.gapMinutes with no rise); like.took when they took the bush / meat / fire spot she was heading for; drifts to 50 at driftPerDay (1 per 3 days).
    //   follow: idle, she walks to 1-3 tiles off the most-liked person within follow.tiles if that liking >= minLike. avoid: idle, keeps avoid.tiles+ from liking < below.
    //   groups: every game day, connected components (2+) of pairs whose mutual familiarity AND liking are >= 60. copy odds x member / x other.
    //   skillAt: a group knows the union of its members' learned scores >= skillAt. Card words: warm >= 70, neutral 40-69, wary < 40.
    social: { nearTiles: 4, famPerHour: 1, famDropPerDay: 1, like: { start: 50, shared: 2, took: -3, driftPerDay: 1 / 3, gapMinutes: 30 },
      follow: { minLike: 60, tiles: 15, off: [1, 3], offBelow: 50, offSeason: 3 },   // Director (call 2 on 18): no following in Deep Cold (season 3) or while any of her needs is under 50
      avoid: { below: 25, tiles: 3 }, group: { fam: 60, like: 60, min: 2 },
      copy: { member: 1.25, other: 0.85 }, skillAt: 40, words: { warm: 70, neutral: 40 }, cardTop: 5 },
    // Step 19 reproduction and inheritance (src/family.js; own seeded stream frng, so the other streams are unchanged).
    //   sex: 50/50 per person (founders at seed time, babies at birth); the "f" partner of a pair is the carrier.
    //   bond: two adults (bond.age years) whose mutual liking >= like and familiarity >= fam become a pair (one each), checked daily; it breaks
    //     if either liking drops under breakBelow or one dies. A paired person goes to lie down next to her partner at bedtime (once a night).
    //   conception: once a night at atMinute (2:00 AM) a pair asleep within tiles (Chebyshev) of each other, both fullness/water >= 50 and
    //     warmth >= 40, population (people + babies + pregnancies) under pop.maxPeople: p = chance.
    //   pregnancy: days (one season); the carrier's fullness drain x drain. If she dies, nothing is born.
    //   inheritance: each trait and lifespan = parents' average x (1 +- drift); mutation.chance per trait of a further x (1 +- mutation.size).
    //     Learned scores are not inherited. Traits clamp 0-100; lifespan to lifespanClamp.
    //   babies (age < babyYears): carried on the carrier's tile; their needs follow hers (met when she eats, drinks, sleeps). If the carrier
    //     dies the baby lies alone; an adult of its group (or a parent) within adoptTiles takes it up; else it dies after orphanMinutes.
    family: { bond: { age: [16, 45], like: 75, fam: 70, breakBelow: 40 },
      conceive: { atMinute: 120, tiles: 1, fullness: 35, water: 35, warmth: 30, chance: 0.15 },   // Director (call 1 on 19): 15%, gates 35 / 35 / 30
      pregnancy: { days: 7, drain: 1.25 }, drift: 0.05, mutation: { chance: 0.02, size: 0.2 }, lifespanClamp: [40, 120],
      babyYears: 3, adoptTiles: 2, orphanMinutes: 1440,
      minFounders: 2 },   // Director (call 2 on 19): every seed starts with at least 2 founders of each sex
    // Step 20 childhood (src/family.js). Stages by age (years; 1 year = 28 days): baby 0-3 (carried, step 19), child 3-12, youth 12-16, adult 16+.
    //   child: a person of her own (walks, eats from bushes, drinks alone); fullness / water drain x drain; while awake she keeps within keepTiles of her
    //     guardian (mother, else father, else the adult she attached to) and sleeps beside them. No hunting, no meat from carcasses, no burning sticks;
    //     she picks up only the materials in carry. Her fireFear starts at the inherited value + fearAdd; each fire warming success with an adult
    //     within social.nearTiles lowers it by fearDrop x fearChildX (fearDrop = the adult reference rate; adults' traits stay as they are).
    //   copying from an adult within learn.copyTiles: odds x copyX[stage]. Watching (no copy roll needed): a child who sees a parent or group member's
    //     success gains seepX x what that success gave the doer (learn.gainOf), up to the doer's score; tagged as learned from them.
    //   youth: roams like an adult (follows the most liked like anyone); hunts with kill odds x youthKillX; pairs only from bond.age[0] (16).
    //   orphans: a child with no living parent attaches to the group member (16+) she likes most (logged); none = she is on her own.
    //   waitEnergy: at bedtime a child whose guardian is still up stays close and waits, unless her energy is at or below this.
    //   startBond: familiarity / liking a new child and her carrier start with for each other (they spent 3 years together).
    child: { childAt: 3, youthAt: 12, adultAt: 16, drain: 0.7, keepTiles: 4, waitEnergy: 10, carry: ["stick", "rock"], fearAdd: 20, fearDrop: 1, fearChildX: 1.5,
      copyX: { child: 2, youth: 1.5 }, seepX: 0.5, youthKillX: 0.5, startBond: { f: 100, l: 75 } },
    learn: {
      start: 50,                      // score before any experience
      // fire: a cold person (warmth < coldBelow) within emberTiles of an ember (or heatTiles of a fire) whose warmth the heat is helping gains
      //   warmGain points per warmth point the heat gave them. Stepping onto a burning (or smouldering) tile is a burn: score - burnDrop, she moves away. No health damage.
      fire: { coldBelow: 60, emberTiles: 2, warmGain: 4, burnDrop: 35, burnCooldown: 30, fireSight: 10,
        // approach odds per warmth-seeking decision = approachChance x (score/50)^2 x (1.5 - fireFear/100) x (0.5 + how far below her seek level / that level)
        approachChance: 0.5, sitTiles: [1, 2], fireSitTiles: 3, stayMin: 30 },   // stays sitting near it while her score is >= stayMin
      // huddle / shelter: warmth felt from others close by / from the trees raises those scores the same way (warmGain per warmth point);
      // the score scales the pull of company / trees when seeking warmth: weight x (0.5 + score/100)  (= the old weights at 50)
      huddle: { warmGain: 1 }, shelter: { warmGain: 1 },
      successWarmth: 3, fireSuccessGain: 10,   // Director (call 11 on 19): each warming success at a fire also raises the fire score by 10
                   // every 3 warmth points gained this way is one visible "success" others nearby can see
      // Step 14 copying (generic, any action key): an awake person within copyTiles who sees a success may copy it if the other's score is
      // at least copyMargin above her own: p = copyChance x curiosity/50 x (fear factor: 1.5 - fear/100 for the action's fear trait, else 1).
      // Copied: her score moves copyShare of the way to theirs, tagged with who she copied (local only).
      copyTiles: 5, copyMargin: 10, copyChance: 0.35, copyShare: 0.5,
      actions: { fire: { label: "sitting by the fire", short: "fire", fear: "fireFear" }, huddle: { label: "huddling up", short: "huddling", fear: null }, shelter: { label: "sheltering under the trees", short: "shelter", fear: null },
        hunt: { label: "going after grazers", short: "hunting", fear: null },
        cook: { label: "holding meat to the fire", short: "cooking", fear: "fireFear" } }
    },
    // Step 16 hunting. A hungry person (fullness under actAt, the normal "goes to eat" point) holding a thing hard enough to strike with
    // (hardness >= minHardness: rock 70, stick 25, flint 80, bone 55; meat 5 is not) who sees a grazer within sightTiles may go after it instead of a bush:
    //   p(go) = approachChance x hunt score / 50 (score 0-100, 50 = no experience; step 14 learning, copied like any other action).
    // Grazers bolt from anyone inside their fleeWithin (4 tiles), so the one strike comes as she closes to strikeTiles (a lunge or a thrown stone):
    //   p(kill) = base + sharp (held sharpness >= physics.sharpAt: flint 45, any sharp shard) + learned (her hunt score >= learnedAt).
    // A kill raises her score by gain (a visible success others within copyTiles may copy); a miss lowers it by missDrop.
    hunt: { coldBelow: 30,   // Director (call 1 on 18): only warmth under 30 stops a hunt (step 17 used her warmth-seeking level)
      minHardness: 20, sightTiles: 12, strikeTiles: 4, approachChance: 0.5, cooldownMinutes: 120, giveUpMinutes: 90,
      odds: { base: 0.10, sharp: 0.30, learned: 0.20 }, learnedAt: 60,
      gain: 20, missDrop: 2, sickDrop: 5,
      scavengeChance: 0.5 },   // a fresh carcass with meat in sight (sightTiles): p(go and take meat) = scavengeChance x hunt score / 50
    // Step 16 meat. A killed grazer is a body (fresh -> rotting -> bones, same timings as config.body). While it is fresh, meat can be taken from it:
    // pieces per carcass, each taking fleshPerPiece of its flesh. A piece stays edible until the carcass would have begun to rot (diedAt + body.freshMinutes),
    // then it rots away. Eating raw meat: +fullness (capped at 100) over eatMinutes; sickChance of being sick (energy - sickEnergy).
    // Step 17 cooking. Meat (held, on the ground or on a fresh carcass) within emberTiles of an ember or fireTiles of a fire gains 1 heat a minute
    // (people keep fire.fleeTiles 2.5 from flames, so 2.5-3 tiles is "next to" a fire). heat >= cookedAt: cooked; heat > charredAt: charred.
    // Eating: raw = meat.fullness / meat.sickChance; cooked / charred = fullness / sickChance below.
    // A hungry person with raw meat in hand and an ember or fire within sightTiles may hold it there first: p = holdChance x (cook score / 50)^2 x (1.5 - fireFear/100).
    // She eats it once it is cooked, after waitMinutes, or after coldGiveUp minutes away from heat. Eating cooked meat: cook score + gain (others
    // within copyTiles may copy it); eating charred: - charDrop. sightTiles 15 (Director, step 17 call 1): seeking is only done hungry with meat in hand.
    // A wildfire passing over a fresh carcass does not burn it to bones: the carcass heats like any meat (fire on or within fireTiles), so it roasts or chars.
    cook: { emberTiles: 1.5, fireTiles: 3, cookedAt: 30, charredAt: 120, fullness: { cooked: 70, charred: 20 }, sickChance: { cooked: 0, charred: 0 },
      sightTiles: 15, holdChance: 0.15, waitMinutes: 60, coldGiveUp: 10, gain: 20, charDrop: 10 },
    meat: { pieces: { grazer: 4 }, fleshPerPiece: 20, takeMinutes: 10, fullness: 60, eatMinutes: 15, sickChance: 0.25, sickEnergy: 20 },
    bushes: { count: 60, minCount: 15, moistBase: 0.5, dry: { below: -0.1, at: -0.3, fewer: [0.3, 0.5] }, regrowMinutes: 1440, startRipe: 0.85, minSpacing: 4,   // eaten bush is ripe again 1 game day later (Greening; see season)
      // Step 15 seasons (Greening, High Sun, Leaffall, Deep Cold): a meal gives mealAdds x yield; an eaten bush ripens again after regrowMinutes
      // (people still expect it back after the base regrowMinutes, so in winter they find more bushes bare)
      season: { yield: [1, 1.25, 1.25, 0.8], regrowMinutes: [1440, 1080, 1080, 2160] },   // tuned (5 seeds x 1 year): 0.8 / 36 h -> 3% of winter minutes hungry, avg fullness 53; 0.6 / 72 h was 38% hungry and 17 deaths
      weights: { edge: 6, meadow: 1, woods: 0.4 } }, // edge = meadow/woods border
    log: { max: 200, personMax: 200,   // personMax: each person's own log keeps their last 200 events (saved)
      // log line colours: first matching rule wins, else "info". Tabs filter the log; a tab with no match shows everything.
      kinds: [{ kind: "birth", match: "gives birth|stay close by night|carries the baby" }, { kind: "warn", match: "has died|is freezing|is cold|catches fire|burns|burned|is sick|is starving|is hungry|bush bare|bush was bare|bush taken|is thirsty|is parched|is exhausted|woke up (hungry|thirsty)" }],
      tabs: [{ key: "all", label: "All" },
             { key: "food", label: "Food", match: "bush|berr|meal|hungry|starving|meat|grazer" },
             { key: "water", label: "Water", match: "water|drink|thirst|parched|lake|river" },
             { key: "sleep", label: "Sleep", match: "sleep|woke|exhausted" },
             { key: "events", label: "Events", rest: true },   // rest = every line no other tab matches
             { key: "death", label: "Death", match: "died|lies still|body|bones" }]
    },
    // Side-panel tab bar (view only, not in the sim save). Each entry is one tab button; pressing it opens/closes that panel (one open at a time).
    // Adding a tab is just a new entry here: { key, label, icon?, el?, open? } (icon = a data/ui/icons name, drawn above the label). el = id of an existing element in index.html; without el an empty
    // <div id="panel-KEY" class="panel"> is created in the side panel, and GS.UI.panelRender[KEY](app, div) (if defined) fills it on each update.
    // open = open on a first visit. Which panel is open is remembered in localStorage "godsim.ui" (separate from the save).
    ui: { prefsKey: "godsim.ui",
      panels: [{ key: "log", label: "Log", icon: "log", el: "logwrap", open: true },
               { key: "discoveries", label: "Discoveries", icon: "discoveries" }],
      speedIcons: ["pause", "play", "fast", "superfast"] },   // one per time.speeds entry (0, 1x, 10x, 60x); data/ui/icons via src/icons.js
    render: {                         // view only: nothing here is saved or affects the sim
      stepsPerTile: 2,                // walk frame flips every 0.5 tile actually covered; standing = frame 0
      zoom: { max: 4, wheelStep: 50, pinchStep: 1.35, tapSlop: 8 }  // whole-number zoom 1x (fit) .. 4x; wheel deltaY per step; pinch distance ratio per step; px of movement before a press becomes a pan
    }
  };
})(this.GS = this.GS || {});
