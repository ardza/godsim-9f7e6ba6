// Sim configuration (all tunables live here). Plain script, sets GS.data.config; works on file://.
(function (G) {
  G.data = G.data || {};
  G.data.config = {
    saveVersion: 36,                // v36: People UI polish; v35: hard seasons; v34: hard tips; v33: ore finds; v32: built shelters; v31: group identity; v30: sacred places; v29: caching
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
      maxTries: 40,
      // Step 26b: one stronger mountain peak per seed (amplify existing height field around the inland max)
      mountain: { peakBoost: 0.55, peakRadius: 5, slopeRadius: 9, minHeightRank: 0.85 }
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
        fireFear: "step 13: going near embers / a fire when cold is less likely the higher it is (x (1.5 - fireFear/100)); also lowers the odds of copying someone at a fire",
        faith: "step 21: per-hour chance of a prayer bout when a need is under faith.needBelow or after seeing a death = faith / faith.hourDiv (founders: own stream prng; inherited like the rest)",
        corpseFear: "step 26: high → leave bodies alone; low + curiosity → drag/bury/burn/eat/ritual (founders: own stream crng 40-70; inherited like the rest)"
      },
      traitSpread: 17.5,              // gaussian sd in trait points
      sightTiles: 6,                  // fixed sight radius (tiles)
      // All three needs read the same way: 0-100, 100 = good, they drain down (stored as floats, shown rounded).
      // Decision rule: act on the LOWEST of fullness/water once it is below actAt (50); a tie goes to water.
      actAt: 50,
      fullness: {
        // 26b zero-point: fullness 0 = starving (extreme); food fills Fullness only (never Energy). 50 = hungry, 85 = full, above 85 = overfull.
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
        // 26b zero-point: water 0 = dehydration (panel/log: "dehydrated"), 50 = thirsty, 100 = just drank. Not trait-scaled.
        threshold: 50,                // goes to drink below this (= actAt)
        minutesFullToThirsty: 240,    // 100 -> 50 in 4 game h => drain 50/240 = 0.208 per min (0 after 8 h)
        planFrom: 75,                 // like fullness.planFrom: leaves early if the nearest known shore is far
        start: [70, 95], min: 0       // holds at 0; logs "is dehydrated" once; dies after 1 full game day at 0 (person.death)
      },
      drinkMinutes: 10,               // drink from any land tile next to water (4-neighbour); water rises linearly to 100
      energy: {
        // 26b zero-point: energy is 0-100. 100 = rested. Drains while awake only; refills from sleep only (food never fills energy).
        // 0 = serious multi-day sleep deprivation (panel: "delirious" — confusion / hallucinations), not mere grogginess.
        drainMinutes: 960,            // 100 -> 0 over 16 waking hours (Director/specs: zero feels extreme; night-1 bedtime still fires)
        refillMinutes: 480,           // 0 -> 100 over 8 hours of sleep
        sleepBelow: 50,               // lies down (anywhere, when idle) after dusk if energy is under this
        restedAt: 80,                 // panel: "rested" 80+, "fine" sleepBelow..restedAt, "tired" below sleepBelow, "delirious" at 0
        nightFrom: 1080, dawnAt: 360, // 18:00 .. 06:00 is "after dusk"; a sleeper with full energy gets up at dawn
        wakeIfNeedBelow: 10,          // a sleeper wakes early if fullness or water drops below this (also: a food/water goal is dropped for the other need below this)
        asleepNeedRate: 0.25,         // fullness and water drain at a quarter of the waking rate while asleep
        start: [90, 100]              // energy 0: delirious → collapse/forced sleep; confusion @1d; hallucinations @2d; dies after energyZeroMinutes (5 days) at 0
      },
      // Warmth (step 11 / v22): 0-100. Felt = air + shelter + huddle + fire + activity (± rain chill). Equilibrium from felt:
      //   eq = clamp(eqAtNeutral + (feltC - neutralC) * eqPerC, 0, 100)  → open air ~61°F (~16°C) ≈ 65; ~32°F (0°C) ≈ 25.
      // Each minute warmth moves toward eq at the gain/loss-per-degree-hour band (never a hard climb to 100 / fall to 0 from mild air alone).
      warmth: {
        neutralC: 10,                 // °C; eq reads eqAtNeutral here (50). Air display stays °F elsewhere.
        eqAtNeutral: 50, eqPerC: 2.5, // Director v22: eq = clamp(50 + (feltC - 10) * 2.5, 0, 100)
        lossPerDegreeHour: 0.85, gainPerDegreeHour: 1.5,
        shelterC: 5,                  // standing/lying on a woods tile (under trees: out of the wind)
        huddleC: 4, huddleMax: 3, huddleTiles: 1.5,   // each other person this close adds 4 C, up to 3 people
        walkingC: 2, asleepC: -1,     // moving makes heat; lying still loses a little
        sunC: 3,                      // daylight out in the open (scaled by daylight; none under trees)
        // Director (step 20 call 1): at night a partner or group member (or a child's guardian) within bondTiles (1 tile, diagonals too) warms her by
        // bondC = about half a fire's heatC (25); counted once, on top of the huddle. In Deep Cold (season gatherSeason) pairs / group members also
        // gather to sleep together at bedtime: she goes to lie down beside the nearest one first (once a night). The climate itself is unchanged.
        bondC: 12.5, bondTiles: 1.5, gatherSeason: 3,
        // Director (21): sleepers keep each other warm - 3+ people asleep within sleepTiles of each other get fire warmth (groupC = fire heatC 25),
        // 2 get half (pairC). Replaces bondC for sleepers (bondC stays for awake people at night). Anyone at warmth <= urgentBelow heads for the
        // nearest group member (or partner / guardian) or fire before anything else (retry every urgentRetry minutes).
        sleepHeat: { tiles: 1.5, pairC: 12.5, groupC: 25, groupMin: 3 }, urgentBelow: 20, urgentRetry: 10, lonerTiles: 20, lonerFam: 1,   // 21b Director: at <= urgentBelow, the nearest person / sleep pile within lonerTiles (group or not); joining = +lonerFam familiarity both ways. v19 (step 24 growth recheck): 15 -> 20 tiles, see tests/deaths_v19.md (seed 4's two loners froze 15+ tiles from everyone)
       
        nightFirstBelow: 60,          // on a Deep Cold night, below this warmth she makes no food trips (walks / bedtime meals): warmth first; water still wins
        shelterTiles: 15,             // looks this far for a woods tile / company when seeking warmth
        wakeBelow: 10,                // a sleeper this cold, not under trees with company, wakes once a night to find a better spot
        seekBelow: 35, seekPerFear: 0.5,   // seeks warmth (shelter, others) below 35 + coldFear x 0.5
        start: [80, 100], min: 0      // hypothermia stage logs (Story Writer): shivering → stumbling/looking lost → moving slow/dropping things → nodding off → collapsed; then death at warmthZeroMinutes (3 days)
      },
      // 26b hypothermia (warmth 0): stages by minutes at 0; death only after warmthZeroMinutes (3 days, full ladder first). Unconscious can be rescued when warmth > rescueAbove.
      hypothermia: {
        shiverBelow: 30,            // crossing below → "is shivering"
        confusionAt: 30,            // ~30 min at 0: "is stumbling" / "looks lost"
        clumsinessAt: 120,          // ~2 h at 0: "is moving slow"; may drop carry ("drops what they were carrying")
        drowsinessAt: 240,          // ~4 h at 0: "is nodding off" / "is slowing further"
        unconsciousAt: 480,         // ~8 h at 0 + eq colder: "has collapsed" / "is not getting up"; rescue when warmth > rescueAbove; death only after warmthZeroMinutes (full ladder first)
        clearAbove: 20,             // warmth rising above this clears hypo stage effects
        rescueAbove: 10,            // unconscious ends when warmth exceeds this (fire / huddle / weather)
        moveX: 0.6,                 // clumsiness speed multiplier
        dropChance: 0.015,          // per tick while clumsy+ and carrying
        drowsyChance: 0.03,         // per checkMinutes while drowsy: collapse by day
        confuseChance: 0.2,         // when idle/wander pick: odd goal
        confuseLogEvery: 60,        // minutes between stumble/lost logs
        drowsyCheckMinutes: 10,
        seekChanceAtDrowsy: 0.12    // drowsy+: chance to start shelter-seek on their own (else may fail to)
      },
      // Dying of need (26b zero-point): 1 game day dehydrated (water 0), 7 days starving (fullness 0).
      // Warmth: full hypo ladder first, then death at warmthZeroMinutes (3 days at 0). Energy: forced sleep/delirium ladder, then death at energyZeroMinutes (5 days). Clocks restart when need > 0.
      death: { waterZeroMinutes: 1440, fullnessZeroMinutes: 10080, warmthZeroMinutes: 4320, energyZeroMinutes: 7200 },
      bedtimeMin: 25,                 // before lying down she drinks/eats first if that need would drop below this by the time she wakes
      bedtimeTripTiles: 6,            // ...but only if the water / a known ripe bush is within this many tiles of path (else she sleeps)
      mealMinutes: 15,                // one ripe bush = one meal, eaten in one sitting; fullness rises linearly by mealAdds
      wander: { radius: 10, idleMin: 10, idleMax: 90 },
      explore: { min: 15, max: 32, candidates: 8,
        farTiles: 999, pathCandidates: 8, nearMin: 5, nearMax: 12 }  // known bush > 20 tiles of path away? first look nearby (5-12 tiles), then go
    },
    // A death leaves a body on the tile where the person was (no grave). It decays: fresh (fixed time) -> rotting (until its flesh is gone) -> bones.
    // Bones stay as a lasting object tagged with the primitive material "bone" (its properties come in step 10) and weather away over many years.
    // Step 26: people may leave / drag / bury / burn / eat / ritual at a body (corpse.js). Bodies and bones are inspectable and saved.
    body: {
      freshMinutes: 1440,             // fresh for 1 game day (flesh can already be eaten by scavengers)
      rotMinutes: 10080,              // rotting: the flesh (0-100) decays 100 -> 0 in 7 game days on its own; scavengers feeding make it go sooner (~2 days)
      bonesWeatherYears: 20,          // bones' condition falls 100 -> 0 over 20 game years, then they are gone
      material: "bone",               // primitive material the bones are (data only for now)
      // step 23: "was struck by lightning". 26b Story: storyDeathLines[cause] = full predicates (picked by id); "=" in causeVerb also works.
      causeVerb: { "struck by lightning": "was" },
      storyDeathLines: {
        cold: ["froze", "didn't wake from the cold"],
        exhaustion: ["never woke", "worn down to nothing"],
        sickness: ["didn't recover", "wasted away"]
      }
    },
    // Animals (no names; grazers die only when hunted and are born in Greening, step 17). All count toward pop.maxAnimals (40). They flee people: when a person is within fleeWithin tiles
    // they run (at fleeMinutesPerTile) to a tile at least fleeTo tiles from every person.
    animals: {
      // Step 26b: species ids stay grazer/scavenger/wolves; UI/logs/Discoveries/spawn labels are deer / wild dog / Wolves.
      grazer: {
        label: "deer", labelPlural: "deer",
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
        label: "wild dog", labelPlural: "wild dogs",
        start: 4, startAway: 10,   // cap = today's scavenger start/pop (unchanged)
        walkMinutesPerTile: 6, fleeMinutesPerTile: 3, fleeWithin: 4, fleeTo: 6,   // flees people within fleeWithin
        noticeTiles: 15,              // notices a body with flesh within this many tiles (and goes to eat it unless a person is within fleeWithin of it)
        corpsePreferTiles: 8,         // 26b: prefers corpses within 8 over hunting live deer
        huntDeer: { fullnessBelow: 40, stalkTiles: 12, strikeTiles: 1.5, killChance: 0.35 },  // hunts living deer when hungry and no nearby corpse; never hunts people
        watchTiles: 8,                // people within this of a kill get hunt_score bump
        fullness: { minutesFullToEmpty: 1440, feedBelow: 70, fillPerMinute: 1, fleshPerFullness: 0.15, start: [20, 60] }, // fullness 0-100; feeds on flesh at +1/min until 100, each point taking 0.15 of the body's flesh (0-100); holds at 0, no death.
                                      // Tuned so a body the scavengers find is bones ~2 days into rotting (10-seed mean ~1.7 d, range 0.3-3.6 d) instead of 7
        wanderRadius: 8, idleMin: 30, idleMax: 120, nightIdleScale: 1
      },
      // 26b Wolves: one pack per seed, den + territory; hunt deer; threaten people only inside territory.
      wolves: {
        label: "Wolves", labelPlural: "Wolves",
        packSize: [3, 5], packRadius: 6,   // members stay ~6 tiles of pack center
        territory: 10,                     // den radius; threaten people only inside
        denMinFromSpawn: 15,               // den >= 15 tiles from founder spawn
        denPrefer: ["hill", "woodsEdge"],  // hill or woods edge
        walkMinutesPerTile: 5, fleeMinutesPerTile: 3, fleeWithin: 0, fleeTo: 0,  // do not flee people (they threaten instead, in territory)
        huntDeer: { stalkTiles: 14, strikeTiles: 1.5, killChance: 0.55 },
        threaten: { chaseTiles: 10, strikeTiles: 1.5, damageEnergy: 40, killChance: 0.25 },
        watchTiles: 8,
        fullness: { minutesFullToEmpty: 2880, feedBelow: 60, fillPerMinute: 1.2, fleshPerFullness: 0.12, start: [40, 80] },
        wanderRadius: 5, idleMin: 20, idleMax: 80, nightIdleScale: 1.2
      }
    },
    // Step 9 objects: seeded on the ground at world creation (their own stream, so the map, bushes and founders are unchanged).
    // People carry one thing at a time: an idle person may walk over and pick up a thing in sight (curiosity), and drops it when a need takes over,
    // before sleep, or after carry minutes. Bones from a body count: picking one up takes one of the body's bones (bonesPerBody).
    objects: {
      // Step 26b deposits by terrain (clusters, not a blanket). Counts are totals across deposits.
      rock:  { deposits: [4, 8], size: [3, 12], where: "slope" },       // hill/mountain slopes; clusters
      stick: { deposits: [5, 9], size: [3, 8],  where: "woodsEdge" },   // woods edges
      flint: { deposits: [1, 3], size: [3, 7],  where: "riverBank" },   // 1–3 river-bank clusters (not blanket)
      reed:  { deposits: [4, 8], size: [4, 10], where: "riverBank" },   // river banks only (1–2 tile land band; never mid-stream)
      ore:   { deposits: [1, 3], size: [2, 6],  where: "slope" },       // §36 / v33: rarer clusters on hill/mountain slopes
      minSpacing: 1,                                 // never two on one tile at the start
      bonesPerBody: 4,                               // a skeleton gives 4 bones that can be picked up; the rest stays as the body's bones
      pickupChance: 0.6,                            // at the end of an idle spell, x curiosity/50 (0.5 at curiosity 100)
      carry: [60, 300],                              // minutes she holds it before putting it down (seeded per pick-up)
      tryChance: 0.8, tryMinutes: 5, tryReach: 10,   // a holder may try an action on a thing on the ground within tryReach tiles, right after picking up or when idle (~1 try / person / day)
      tryCooldown: 360,                              // ...at most once per 6 game h each
      // Per-piece property jitter (±jitterPct of type base for hardness/sharpness/dryness/durability; flex uses flexJitter)
      jitterPct: [0.10, 0.20],
      flexJitter: { stick: 25, rock: 3, flint: 3, bone: 8, reed: 20, berry: 5, meat: 8, ore: 2, hide: 10 }
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
    climate: { // 26b/v23 Director: San Diego–like coastal (Commissioner Oct 24) — mild year-round base. §38/v35: harshness ramps with year (not Ice Age on New Game).
      seasonMeanC: [18, 23, 19, 15], dayAmpC: 4, coldestHour: 5,
      // §38 Hard seasons: yearIndex 0 keeps mild means; by rampYears, Deep Cold mean/night can kill open-air without den/hide/fire.
      hard: {
        rampYears: 4,                    // full harshness at yearIndex ≥ 4 (display Year 5+)
        meanDeltaC: [0, -2, -6, -20],    // °C added to seasonMeanC × hardT (Deep Cold 15→-5°C at full)
        dayAmpAddC: [0, 0.5, 2, 6],      // extra dayAmp × hardT (stronger nights in Deep Cold)
        stormX: [1, 1.1, 1.4, 2.5]       // lightning rate × at full ramp (Deep Cold storms)
      },
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
      brand: { litMinutes: 360,   /* 21b Director: a lit stick smolders ~6 h */ hourChance: 0.05, grabChance: 0.1, minLeftMinutes: 30, reachTiles: 3,
        // Director (step 20 call 2): a stick lying within catchTiles (Chebyshev, so diagonals too) of a burning tile catches and becomes a burning
        // stick (lit until those flames die down + litMinutes). A person whose fire score is braveScore+ no longer moves away from the flames of a
        // struck (smouldering) tree unless they are within braveTiles, and may take up a burning stick lying that close to them too.
        catchTiles: 1, braveScore: 40, braveTiles: 1.5,
        // Director (21): an idle person within warmTiles (Chebyshev) of a burning stick lying on the ground rolls each hour as well (no flee check for it)
        warmTiles: 1,
        // step 21 stick fix: a burning stick lying on the ground (away from flames, minLeftMinutes+ left) draws a cold person like an ember, to sit
        // within sitTiles of it; someone already warming at a fire (byFire) may reach a stick at least reachFlameTiles from the nearest flame
        // (not in the flames) without the flee check, and her short walk to it (<= reachTiles) is not cut short by the flames
        sitTiles: [1, 1.5], reachFlameTiles: 1,
        // and (cold or not) someone awake with fire score >= drawScore, fullness and water >= drawNeeds and not on an urgent errand, within drawTiles
        // of one, may go and sit by it, checked each game hour: odds drawChance x (score/50)^2 x (1.5 - fireFear/100); only for a stick that will still burn minLeftMinutes when she arrives (walk time from her speed); on sitting down she rolls
        // the grab at once (then hourly while she stays)
        drawTiles: 10, drawScore: 40, drawChance: 0.5, drawNeeds: 30 }
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
    // Step 21b natural shelters (src/shelter.js), per seed from the terrain on their own hash-seeded stream (salt): never built, never a hollow.
    //   cave: 1-3 tiles from the side of a hill cluster (>= cave.minCluster tiles) inward; overhang: 1 edge tile of a hill cluster; thicket: 2-4 tiles of the
    //   densest woods (5x5 woods count + moistW x moisture >= minDense). count: int in [count] x room (room = min(1, caves x roomCave + ...)), at least spacing apart;
    //   the type for each pick is drawn by mix x sqrt(candidates), so the terrain sets the mix. cap = people inside (thicket: per tile). warmX x fire.heatC while
    //   resting / asleep inside; fire + huddle + sleeping together + shelter at most capX x heatC. rain = share of rain kept off (data only until step 22).
    //   Learning: idle with warmth < stepIn.below and a shelter within stepIn.tiles: p = stepIn.chance x curiosity/50 x (1.5 - fear/100) (fearTrait), every
    //   everyMinutes. Warming inside raises the "den" score (learn.den); cold / bedtime: p(go to nearest known within seekTiles) = goChance x (score - scoreFloor)/(100 - scoreFloor).
    //   Woke inside with warmth >= wokeWarm = a warm night (the first per seed is a Discovery). Full: she doesn't fit, liking of the nearest one inside + crowdLike.
    shelter: { salt: 0x5E17E2D, count: [3, 8], roomCave: 0.25, roomOverhang: 0.02, roomThicket: 0.1, spacing: 6, mix: { cave: 1, overhang: 0.8, thicket: 1 },
      cave: { minCluster: 12, tiles: [1, 3], cap: 6, warmX: 1.0, rain: 1 }, overhang: { minCluster: 3, cap: 3, warmX: 0.6, rain: 1 },
      thicket: { tiles: [2, 4], minDense: 22, moistW: 4, growSlack: 3, cap: 3, perTile: true, warmX: 0.4, rain: 0.5, walkX: 2 },
      capX: 1.5, crowdLike: -1, wokeWarm: 50, fearTrait: "fireFear", stepIn: { below: 50, tiles: 3, chance: 0.3, everyMinutes: 30 },
      seekTiles: 30, goChance: 0.9, scoreFloor: 40,
      articles: { cave: "a cave", overhang: "an overhang", thicket: "a thicket", hut: "a crude hut" },
      enterLines: { cave: "crawls into the cave mouth", overhang: "ducks in under the overhang", thicket: "pushes into the thicket", hut: "ducks into the crude hut" },
      peerLines: { cave: "creeps toward a dark gap in the hillside", overhang: "edges toward the hanging rock", thicket: "parts the brush of a thicket", hut: "edges toward the piled hut" },
      tripLines: { cave: "heads back to the cave", overhang: "heads back to the overhang", thicket: "heads back to the thicket", hut: "heads back to the crude hut" } },
    family: { bond: { age: [16, 45], like: 65, fam: 60, breakBelow: 40, mixedOnly: true },   // step 22 Director: mixedOnly = pairs are man + woman only;   // 21b Director: 65 / 60 (was 75 / 70)
      conceive: { atMinute: 120, tiles: 1, fullness: 35, water: 35, warmth: 30, chance: 0.20 },   // 21b Director: 20% per night   // Director (call 1 on 19): 15%, gates 35 / 35 / 30
      pregnancy: { days: 7, drain: 1.25 }, drift: 0.05, mutation: { chance: 0.02, size: 0.2 }, lifespanClamp: [40, 120],
      babyYears: 3, adoptTiles: 2, orphanMinutes: 2880, seekTiles: 15, anyTiles: 10,
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
      huddle: { warmGain: 1 }, shelter: { warmGain: 1 }, den: { warmGain: 3 }, hide: { warmGain: 1 },   // 21b: den = warmed inside a cave / overhang / thicket
      // v28: hide wear / sleep-under raises Learn "hide" via warmGain when cold
      successWarmth: 3, fireSuccessGain: 10,   // Director (call 11 on 19): each warming success at a fire also raises the fire score by 10
                   // every 3 warmth points gained this way is one visible "success" others nearby can see
      // Step 14 copying (generic, any action key): an awake person within copyTiles who sees a success may copy it if the other's score is
      // at least copyMargin above her own: p = copyChance x curiosity/50 x (fear factor: 1.5 - fear/100 for the action's fear trait, else 1).
      // Copied: her score moves copyShare of the way to theirs, tagged with who she copied (local only).
      copyTiles: 5, copyMargin: 10, copyChance: 0.35, copyShare: 0.5,
      actions: { fire: { label: "sitting by the fire", short: "fire", fear: "fireFear" }, huddle: { label: "huddling up", short: "huddling", fear: null }, shelter: { label: "sheltering under the trees", short: "shelter", fear: null },
        den: { label: "sleeping in a cave, overhang or thicket", short: "shelters", fear: null },
        hide: { label: "wearing a hide", short: "hide", fear: null },
        hunt: { label: "going after deer", short: "hunting", fear: null },
        cook: { label: "holding meat to the fire", short: "cooking", fear: "fireFear" },
        leave: { label: "leaving a body where it lies", short: "leaving bodies", fear: "corpseFear" },
        drag: { label: "dragging a body", short: "dragging bodies", fear: "corpseFear" },
        bury: { label: "burying a body", short: "burying", fear: "corpseFear" },
        burn: { label: "burning a body", short: "burning bodies", fear: "corpseFear" },
        eat: { label: "eating from a body", short: "eating bodies", fear: "corpseFear" },
        ritual: { label: "ritual at a body", short: "body ritual", fear: "corpseFear" },
        strike: { label: "striking things together", short: "striking", fear: null },
        cut: { label: "cutting with an edge", short: "cutting", fear: null },
        rub: { label: "rubbing things together", short: "rubbing", fear: null },
        bind: { label: "binding a tool", short: "binding", fear: null } }
    },
    // Step 16 hunting. A hungry person (fullness under actAt, the normal "goes to eat" point) holding a thing hard enough to strike with
    // (hardness >= minHardness: rock 70, stick 25, flint 80, bone 55; meat 5 is not) who sees a grazer within sightTiles may go after it instead of a bush:
    //   p(go) = approachChance x hunt score / 50 (score 0-100, 50 = no experience; step 14 learning, copied like any other action).
    // Grazers bolt from anyone inside their fleeWithin (4 tiles), so the one strike comes as she closes to strikeTiles (a lunge or a thrown stone):
    //   p(kill) = base + sharp (held sharpness >= physics.sharpAt: flint 45, any sharp shard) + learned (her hunt score >= learnedAt).
    // A kill raises her score by gain (a visible success others within copyTiles may copy); a miss lowers it by missDrop.
    hunt: { coldBelow: 30,   // Director (call 1 on 18): only warmth under 30 stops a hunt (step 17 used her warmth-seeking level)
      minHardness: 20, sightTiles: 12, strikeTiles: 4, approachChance: 0.5, cooldownMinutes: 120, giveUpMinutes: 90,
      odds: { base: 0.10, sharp: 0.30, learned: 0.20, tip: 0.25 }, learnedAt: 60,
      gain: 20, missDrop: 2, sickDrop: 5, watchGain: 8,   // 26b: watch animal kill within watchTiles → +watchGain hunt score
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
    // §31 / v28: grazer hide — soft mass item; worn / sleep-under felt °C stacks with fire+shelter under shelter.capX × fire.heatC
    hides: {
      wornC: 8, sleepC: 6,           // felt °C while wearing / sleeping under (trimmed by shared warmth cap)
      reachTiles: 1.5,               // ground hide in reach to wear or sleep under
      tryEveryMinutes: 30,
      tryChance: 0.4,                // × curiosity/50 × (0.5 + coldFear/100) when cold (warmth < seek or hypo)
      scoreLock: 45,                 // Learn "hide" score to lock wear (start 50 so often met)
      gainWear: 10, gainSleep: 6,
      logWear: "pulls the hide about her shoulders",
      logSleep: "curls up under the hide",
      logDrop: "lets the hide fall from her shoulders"
    },
    // §32 / v29: stash food/tools at known shelter or prayer spot; personal a.caches; copy by watching
    cache: {
      walkTiles: 18,                 // max walk to prefer stash / retrieve over random drop
      copyChance: 0.55,              // watcher within sightTiles copies the spot
      includeHide: true              // hide counts as stashable (optional per spec)
    },
    // §35 / v32: crude hut from sticks/reeds/hides on known ground; warmX > cave; no villages
    hut: {
      salt: 0xB017532,
      needPile: 3,                   // sticks + reeds (+ hide weight) to finish one footprint
      hideWeight: 1,                 // optional hide counts toward needPile
      gatherTiles: 2,                // ground materials within this many tiles
      siteTiles: 12,                 // walk this far to a known-ground build site
      warmX: 1.2,                    // better than cave 1.0 / thicket 0.4 (still under shelter.capX)
      rain: 0.85,
      cap: 3,
      tryEveryMinutes: 60,
      tryChance: 0.45,               // × curiosity/50 × den factor
      scoreFloor: 40                 // den Learn score floor (same idea as shelter.goChance)
    },
    bushes: { count: 60, minCount: 15, moistBase: 0.5, dry: { below: -0.1, at: -0.3, fewer: [0.3, 0.5] }, regrowMinutes: 1440, startRipe: 0.85, minSpacing: 4,   // eaten bush is ripe again 1 game day later (Greening; see season)
      // Step 15 seasons (Greening, High Sun, Leaffall, Deep Cold): a meal gives mealAdds x yield; an eaten bush ripens again after regrowMinutes
      // (people still expect it back after the base regrowMinutes, so in winter they find more bushes bare)
      season: { yield: [1, 1.25, 1.25, 0.8], regrowMinutes: [1440, 1080, 1080, 2160] },   // tuned (5 seeds x 1 year): 0.8 / 36 h -> 3% of winter minutes hungry, avg fullness 53; 0.6 / 72 h was 38% hungry and 17 deaths
      weights: { edge: 8, meadow: 0.6, woods: 1.2 } }, // 26b: denser near woods (edge + woods up, open meadow down)
    log: { max: 200, personMax: 200,   // personMax: each person's own log keeps their last 200 events (saved)
      // log line colours: first matching rule wins, else "info". Tabs filter the log; a tab with no match shows everything.
      kinds: [{ kind: "birth", match: "gives birth|stay close by night|carries the baby" }, { kind: "warn", match: "has died|froze|didn't wake from the cold|never woke|worn down to nothing|is shivering|is stumbling|looks lost|is moving slow|drops what they were carrying|is nodding off|is slowing further|has collapsed|is not getting up|is confused from lack of sleep|sees things that are not there|has been in the rain too long|catches fire|burns|burned|is sick|is starving|is hungry|bush bare|bush was bare|bush taken|is thirsty|is parched|is dehydrated|is exhausted|is delirious|woke up (hungry|thirsty)" }],
      tabs: [{ key: "all", label: "All" },
             { key: "food", label: "Food", match: "bush|berr|meal|hungry|starving|meat|deer|wild dog|Wolves|grazer" },
             { key: "water", label: "Water", match: "water|drink|thirst|parched|dehydrated|lake|river" },
             { key: "sleep", label: "Sleep", match: "sleep|woke|exhausted|delirious" },
             { key: "events", label: "Events", rest: true, also: "^Rain falls|^The rain stops|^The air grows|^The air near .* settles|into the rain|from the rain" },   // rest = every line no other tab matches; also = lines it shows even if another tab claims them (step 22: power use)
             { key: "death", label: "Death", match: "died|lies still|body|bones" }]
    },
    // Side-panel tab bar (view only, not in the sim save). Each entry is one tab button; pressing it opens/closes that panel (one open at a time).
    // Adding a tab is just a new entry here: { key, label, icon?, el?, open? } (icon = a data/ui/icons name, drawn above the label). el = id of an existing element in index.html; without el an empty
    // <div id="panel-KEY" class="panel"> is created in the side panel, and GS.UI.panelRender[KEY](app, div) (if defined) fills it on each update.
    // open = open on a first visit. Which panel is open is remembered in localStorage "godsim.ui" (separate from the save).
    // Step 21 faith and prayer (src/faith.js; own seeded stream prng). See the header of src/faith.js for the rules. No speech, no named powers.
    faith: { needBelow: 25, deathSeenMinutes: 1440, deathSeenTiles: 8, hourDiv: 400, boutMinutes: [10, 40], sourceTiles: 5,
      actions: ["kneel", "raise", "sway", "offer", "circle", "face", "still"],   // kneel, raise arms skyward, sway / dance, offer (place a held thing), circle a spot, face the sun / fire, lie still
      weights: { kneel: 1, raise: 1, sway: 1, offer: 1, circle: 1, face: 1, still: 1 }, heldX: 3, nearX: 3,   // first form: offer x3 when holding an offerable thing, face:fire x3 when a fire is in sight
      offer: ["berry", "meat", "bone", "flint", "stick"], maxActs: 3, fireSight: 10,
      copyTiles: 5,                    // a prayer seen this close may be copied (learn.copyChance x curiosity/50 x social.copy x child.copyX)
      reinforceMinutes: 360, riseBy: 10, likeGain: 25, likeScale: 25,   // triggering need up 10+ within 6 h: liking +25 for that form; pick weight 1 + liking/25
      spotTiles: 2, spotMin: 3, driftTiles: 10, placesMax: 400, feedMax: 300,
      // §33 / v30 sacred places: marker at spotMin; group-known via shared speech; idle drift
      sacredFaith: 55,               // faith trait at/above this counts as "Faith high" for idle drift
      sacredNeeds: 45,               // all core needs at/above this counts as "needs low"
      sacredDrift: 0.35,             // chance when idle+eligible to walk toward a known marked spot within driftTiles
      sacredSight: 8 },              // tiles: seeing a marker can make the spot known
    // Step 22 / 24 god powers (src/powers.js; own seeded stream, drawn only while a power is active, so a run with no powers is unchanged).
    //   Tap a power, then (for Rain / Lightning / Spawn) pick a strength or mode, then the map. Circle radius = radiusTiles.
    //   v19 power rewrite (Commissioner): no cooldowns on any power. Rain has Light / Medium / Heavy; Lightning has Single bolt / Barrage.
    //   rain strengths (scales in rain.strengths): duration, bushX / bushMinutes, puddles count, lossX (warmth), wetMinutes, douse mode
    //     (small = sticks + non-hold embers only; fires = burning tiles + embers, hold trees within holdOutMinutes; all = fires + hold trees at once).
    //   Shared rain: checkMinutes / coverChance / coverTiles / waitMinutes / faceChance.
    //   v22 rain chill (Director): per-strength open-air chillC on feltC × exposure — Light 3 / Medium 6 / Heavy 10 (no flat chillC).
    //   warm / cool: shift the air by deltaF (°F) inside the circle for minutes, fading out over the last fadeMinutes; overlapping effects add,
    //     capped at +/- maxShiftF. tint = the overlay colour (view only); rainFrameMs = rain art frame time (view only).
    //   Lightning modes: single = one tile at the tap; barrage = one bolt on the tap plus count-1 more on random land tiles within scatterTiles (no water, at most one per tile; v22 scatterTiles 4, primary always on tap).
    //   Spawn: one animal (picker), under the usual caps. Faith: a strike / spawn / cure / plague within faithTiles / faithMinutes answers a recent prayer.
    //   v27: Cure clears sick in the circle; Plague seeds sick (v25 rules). Instant, no cooldown (same tap-then-map as Warm/Cool).
    // Step 26 corpse choices. People no longer ignore bodies. Choices emerge from curiosity vs corpseFear (founders 40-70 via crng)
    // and learned scores (leave/drag/bury/burn/eat/ritual); copying uses group rules. Soft ground = walkable non-hill non-water.
    // Burial: digMaterials into soft ground → dug (brief) → mound_fresh → mound_settled → cairn (burial_16). Bones locked under the mound.
    // Burn: fire / lit stick / stick pile → pyre unlit→burning→ash, then ash_bones_16. Eat: flesh while fresh/rotting only.
    // Ritual: faith >= ritualFaithMin + a known prayer form at the body (reuses pray frames); raises faith, may cut corpseFear.
    corpse: {
      sightTiles: 8, approachChance: 0.5, cooldownMinutes: 90, forceLeaveAt: 90,
      dragMaxTiles: 8, digMinutes: 30, dugShowMinutes: 10,
      moundSettleMinutes: 10080,   // 7 days → settled mound
      cairnMinutes: 40320,         // 28 days → cairn
      digMaterials: ["rock", "bone", "stick", "flint"],  // bury needs a sharp tool (Items.sharp: flint or a sharp shard of these)
      fireTiles: 1.5, pyreBurnMinutes: 60,
      eatFullness: { raw: 40, cooked: 50 }, sickChance: { raw: 0.4, cooked: 0.15 }, sickEnergy: 20, sickDrop: 5,
      eatMinutes: 20, eatFlesh: 35,
      ritualFaithMin: 50, ritualMinutes: 20, ritualFaithGain: 3, ritualFearDrop: 5,
      watchTiles: 4, watchLikeDrop: -2, watchFearAt: 55,
      buryChance: 0.55, burnChance: 0.5, eatChance: 0.45, ritualChance: 0.6,
      foundersFear: [40, 70],
      gain: { leave: 8, drag: 12, bury: 18, burn: 18, eat: 15, ritual: 12 }
    },
    powers: { radiusTiles: 8, order: ["rain", "warm", "cool", "lightning", "spawn", "cure", "plague"], labels: { rain: "Rain", warm: "Warm", cool: "Cool", lightning: "Lightning", spawn: "Spawn", cure: "Cure", plague: "Plague" },
      lightning: { modes: { single: { label: "Single bolt", count: [1, 1], scatterTiles: 0 }, barrage: { label: "Barrage", count: [2, 3], scatterTiles: 4 } },
                   modeOrder: ["single", "barrage"],
                   fire: { dry: 0.6, rain: 0.4, deepCold: 0.2, deepColdSeason: 3 }, cause: "struck by lightning", scareTiles: 6, fearAdd: 20, fearMinutes: 1440,
                   runMinutes: 60, runTiles: [7, 10], frameMs: [80, 80, 150] },
      // Spawn: one animal on a free land tile (at the tap or the nearest free one within 2), under the usual caps (pop.maxAnimals, grazer births.cap).
      // v19: the +curiosityAdd fades back over curiosityFadeMinutes (7 days) after the latest watch, 1 point at a time.
      // kinds: picker key -> species ("predator" = the scavenger, the only meat-eater there is). Watchers awake within watchTiles: +curiosityAdd (trait, max 100);
      // for a predator each watcher rolls fearChance x (1.5 - curiosity/100) to back away (fright fearAdd for fearMinutes, runs runMinutes).
      spawn: { kinds: { grazer: "grazer", predator: "scavenger", wolves: "wolves" }, kindLabels: { grazer: "deer", predator: "wild dog", wolves: "Wolves" }, freeTiles: 2,
               watchTiles: 6, curiosityAdd: 5, curiosityFadeMinutes: 10080, predator: { fearChance: 0.5, fearAdd: 10, fearMinutes: 720, runMinutes: 20, runTiles: [4, 6] }, shimmerMs: 700 },
      faithTiles: 12, faithMinutes: 1440,
      // lit sticks (step 23): a stick within fire.brand.catchTiles of a lightning fire (a struck tree, a strike, or a Lightning power) is a bolt stick, lit
      // fire.brand.litMinutes past the flames. Every everyMinutes each free adult (idle / wandering, empty-handed) who can see one within seeTiles rolls
      // chance x clamp(0.5 + (curiosity - fireFear - fright) / 100, 0, 1) to walk over and pick it up (the walk does not turn back at the flee rule).
      boltStick: { everyMinutes: 30, seeTiles: 12, chance: 0.5 },
      // 26b rain shelter: short OK; ≥exposeRaiseAt raise seek; ≥exposeForceAt force cover walk; ≥exposeUrgentAt cover outranks snacks.
      rain: { checkMinutes: 30, coverChance: 0.5, coverTiles: 10, coverTilesLong: 16, waitMinutes: 180, faceChance: 0.3,
              exposeRaiseAt: 30, exposeRaiseCheck: 10, exposeRaiseChance: 0.85,
              exposeForceAt: 120, exposeUrgentAt: 240,
              strengthOrder: ["light", "medium", "heavy"],
              strengths: {
                light:  { label: "Light",  minutes: 180, bushX: 1.5, bushMinutes: 1440, chillC: 3,  lossX: 1.25, wetMinutes: 720,  holdOutMinutes: null, douse: "small", puddles: { count: 2,   minutes: 720 } },
                medium: { label: "Medium", minutes: 360, bushX: 3,   bushMinutes: 4320, chillC: 6,  lossX: 1.5,  wetMinutes: 1440, holdOutMinutes: 60,   douse: "fires", puddles: { count: 6,   minutes: 1440 } },
                heavy:  { label: "Heavy",  minutes: 720, bushX: 5,   bushMinutes: 7200, chillC: 10, lossX: 2,    wetMinutes: 2880, holdOutMinutes: 0,    douse: "all",   puddles: { count: 200, minutes: 2880 } } } },
      warm: { deltaF: 15, minutes: 1440, fadeMinutes: 120 }, cool: { deltaF: -15, minutes: 1440, fadeMinutes: 120 }, maxShiftF: 30,
      tint: { warm: "rgba(255,150,60,0.13)", cool: "rgba(90,170,255,0.15)", rain: "rgba(60,80,110,0.12)", lightning: "rgba(255,250,210,0.6)", cure: "rgba(120,220,160,0.18)", plague: "rgba(140,60,100,0.18)" }, rainFrameMs: 150 },
    // Step 25 local language (src/speech.js; own seeded stream wrng). Tokens are gesture+sound strings.
    //   Invent when a need is under needBelow and someone is within nearTiles: chance = curiosity/inventDiv per hour (v21: 200 after the 4x2y silent-world run; was 300).
    //   Hearers within hearTiles watch meanMinutes for a matching outcome (seeTiles) and bind token→meaning with bindGain.
    //   When groupMin people in a group share the same token→meaning at scoreAt+, that token is group speech (one syllable
    //   from data/words.js). Copying of bound tokens uses copyChance x curiosity/50, x copyX inside the group once it is speech; children/youths also get family.child.copyX (x2 / x1.5) like skills (v21).
    //   Gesture overlays (Artist gesture_16) show gestureMinutes while the token is not yet group speech for her group.
    speech: { needBelow: 30, nearTiles: 4, hearTiles: 6, seeTiles: 8, inventDiv: 100, meanMinutes: 60, gestureMinutes: 3,   // v21: inventDiv 300→200→100 (silent world; 150 left only 1/4 at ≥3 shared); see tests/progress_v21.md)
      start: 0, bindGain: 40, reuseGain: 8, scoreAt: 40, groupMin: 3, copyMinScore: 20, copyChance: 0.5, copyShare: 1, copyX: 1.5,   // v21: bindGain 25→40; copyShare 0.5→1; copyChance 0.35→0.5 so ≥2/4 reach 3 shared words
      meanings: ["food", "water", "warm", "danger", "follow", "stop"],
      tokens: [
        { token: "point+grunt", col: "point_right", bias: ["food", "water", "danger"], action: "points and grunts" },
        { token: "point+call", col: "point_left", bias: ["food", "water"], action: "points and calls out" },
        { token: "pat+chest", col: "pat_chest", bias: ["follow", "warm"], action: "pats her chest" },
        { token: "stop+hand", col: "stop_hand", bias: ["stop"], action: "holds up a hand" },
        { token: "beckon+call", col: "beckon", bias: ["follow"], action: "beckons and calls" }
      ] },
    // Step 29 Tools (v26): lock useful strike/cut/rub/bind outcomes as carried tools when Learn score ≥ scoreMin.
    // flake = sharp rock/bone/flint; axe = stick + sharp (reed binder or friction-fit); spear = long stick (reach berries / poke scavengers).
    // Durability from hardness; dulls with use. First craft → Discoveries. Overlays: data/art/tools_16.png.
    tools: {
      scoreMin: 45,
      craftGain: 12,
      missDrop: 1,
      gain: { strike: 10, cut: 10, rub: 8, bind: 18 },
      durFromHardness: 1,
      dullPerUse: 3,
      dullBelow: 15,
      binders: ["reed"],
      bindChance: 0.55,
      bindCooldown: 360,
      bindMinutes: 15,
      bindReach: 1.5,
      flake: { materials: ["rock", "flint", "bone"], digMult: 0.7, cutMult: 0.6 },
      axe: { head: ["rock", "flint", "bone"], digMult: 0.5, cutMult: 0.8, chopMinutes: 60, chopCooldown: 720, chopChance: 0.25 },
      spear: { reachTiles: 2, pokeTiles: 4, pokeChance: 0.4, pokeCooldown: 180, readyChance: 0.25 },
      // §37 / v34 Hard tips: strike ore|flint onto stick|bone → tip_stick / tip_bone (score ≥ scoreMin)
      tip: {
        points: ["ore", "flint"], shafts: ["stick", "bone"],
        digMult: 0.55, huntOddsAdd: 0.25, cutMult: 0.65,
        tipChance: 0.5, tipCooldown: 360, tipMinutes: 12, tipReach: 1.5
      }
    },
    // Step 28 Disease (v25): lasting sick state (Energy drain ×1.5, Fullness drain ×1.25) for 1–3 days.
    // Seeded by raw meat / corpse eat, person-to-person spread within spreadTiles, or scavengers at rotting bodies (once/day).
    // Recover score rises from sleep while sick, drink, cooked meat, berries, sitting by fire; at recoverAt → clear + Discoveries.
    // Rare death while sick if Fullness and Water both under deathNeedBelow (own stream drng).
    disease: {
      durationDays: [1, 3],
      energyDrainX: 1.5,
      fullnessDrainX: 1.25,
      deathNeedBelow: 20,
      deathChancePerHour: 0.00008,
      spreadTiles: 2,
      spreadDiv: 800,
      seedTiles: 2,
      seedChance: 0.15,
      recoverAt: 100,
      recover: { sleepPerHour: 8, drink: 12, cookedMeat: 20, berries: 10, fireSit: 8 },
      fireSitCoolMinutes: 60,
      logCoolMinutes: 360,
      acuteEnergy: 20,
      dangerEnergyBelow: 30,
      dangerChancePerHour: 0.25
    },
    // Step 27 Moods (v24): happiness / sadness / anger 0–100 float toward baseline ∼40 when needs fine.
    // Dominant = highest ≥ dominantAt (else none). Multipliers on existing rolls only. Fear traits stay separate.
    moods: {
      baseline: 40, dominantAt: 60,
      floatPerHour: 2,
      hapNeedGood: 60, hapNeedBad: 40,
      hapRisePerHour: 4, hapFallNeedPerHour: 6, hapAloneNightPerHour: 5,
      likedNearbyTiles: 4, likedMin: 60, hapLikedPerHour: 3, sleepDoneBoost: 8,
      sadDeathLike: 50, sadDeathTiles: 10, sadDeathBump: 25,
      sadHungryBelow: 25, sadHungryDayMinutes: 1440, sadHungryPerHour: 4,
      sadFallHapRising: 3, sadRitualDrop: 12,
      angLikeHitScale: 2, angWolfChaseBump: 20, angFallPerDay: 40, angHuntDrop: 15, angShareDrop: 10, angContestBump: 12,
      invent: { happiness: 1.35, sadness: 0.7, angerStrikeCut: 1.1 },
      bind: { happiness: 1.25, sadnessRitual: 1.2, angerBreak: 1.2 },
      prayer: { sadness: 1.5, happiness: 0.85 },
      hunt: { anger: 1.4, hapShare: 1.25, hapContest: 0.7 },
      copy: { happinessGroup: 1.2 },
      band: { angerAvoidTiles: 5, sadSeekTiles: 15 },
      logCoolMinutes: 360
    },
    ui: { prefsKey: "godsim.ui",
      powersTab: { label: "Powers", icon: "powers" },   // v19: portrait phones (< 700px): the bottom-bar tab that slides up the power row (CSS in index.html)
      find: { label: "Find", icon: "locate", pulseMs: 3000, zoom: 2, ringScale: 1.7 },   // v19 (step 24): the Find button on a person's card: centre the map on them (zoom at least 2), pulse their group ring brighter and bigger for pulseMs, follow until a pan or a tap elsewhere
      personTabs: [   // v25: Needs / Mind / Kin / Knows / Log (personal events in Log tab only; header + Find outside; no under-card strip)
        { key: "needs", label: "Needs" }, { key: "mind", label: "Mind" }, { key: "kin", label: "Kin" }, { key: "knows", label: "Knows" }, { key: "log", label: "Log" }
      ],
      panels: [{ key: "log", label: "Log", icon: "log", el: "logwrap", open: true },
               { key: "discoveries", label: "Discoveries", icon: "discoveries" },
               { key: "prayers", label: "Prayers", icon: "prayers" },
               { key: "people", label: "People", icon: "people" }],   // step 21b: everyone alive (sortable, live at most once a second) + the dead (not saved)   // step 21: prayer feed (action lines only), filter by group
      speedIcons: ["pause", "play", "fast", "superfast"] },   // one per time.speeds entry (0, 1x, 10x, 60x); data/ui/icons via src/icons.js
    render: {                         // view only: nothing here is saved or affects the sim
      stepsPerTile: 2,                // walk frame flips every 0.5 tile actually covered; standing = frame 0
      zoom: { max: 4, wheelStep: 50, pinchStep: 1.35, tapSlop: 8 }  // whole-number zoom 1x (fit) .. 4x; wheel deltaY per step; pinch distance ratio per step; px of movement before a press becomes a pan
    }
  };
})(this.GS = this.GS || {});
