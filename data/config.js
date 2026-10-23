// Sim configuration (all tunables live here). Plain script, sets GS.data.config; works on file://.
(function (G) {
  G.data = G.data || {};
  G.data.config = {
    saveVersion: 5,                 // v5: needs flipped to fullness / water / energy, all 100 = good; older saves are rejected
    saveKey: "godsim.save",
    map: {
      w: 60, h: 40, tilePx: 16,      // map is 960x640 art px, scaled to fit the screen
      renderScale: 2,                 // canvas backing px per art px (1920x1280): integer, so pixels stay crisp and walking moves in half-pixel steps
      margin: 2,                      // water never comes within 2 tiles of the edge -> land ring keeps the map connected
      woodsNoiseScale: 9, woodsFraction: 0.42,   // share of tiles that start as woods (noise quantile)
      lake: { cx: [38, 47], cy: [24, 30], rx: [6, 9], ry: [4, 6], wobble: 0.5 },
      river: { sourceX: [4, 22], sourceY: [3, 8], toward: 0.72, widenChance: 0.22, maxSteps: 500 },
      maxTries: 30
    },
    time: {
      tickGameMinutes: 1,             // 1 sim tick = 1 game minute
      realSecondsPerGameDay: 7200,    // 1x: 1 game day = 2 real hours -> 1 tick = 5 real seconds
      startMinute: 360,               // tick 0 = Day 1, 06:00
      daysPerSeason: 7,
      seasons: ["Greening", "High Sun", "Leaffall", "Deep Cold"], // names only; no season effects yet
      speeds: [0, 1, 10, 60],         // pause, 1x, 10x, 60x (60x = 12 ticks per real second)
      maxTicksPerFrame: 240,
      autosaveRealSeconds: 60
    },
    pop: { maxPeople: 60, maxAnimals: 40, startPeople: [5, 8], clusterRadius: 3 },  // the seed picks 5-8 founders, placed on distinct tiles near the middle meadow
    person: {
      walkMinutesPerTile: 8,          // at speed 50. Actual = 8 / (0.5 + speed/100): speed 0 -> 16, 50 -> 8, 100 -> 5.33 min/tile
      startAge: [16, 40], lifespan: [60, 100], // founders' ages (years; 1 year = 4 seasons x 7 days = 28 days). Ages do nothing yet
      traits: {                       // the only traits; integers 0-100, 50 = average; rolled as 50 + gaussian*spread, rounded, clamped (full 0-100 allowed)
        speed: "walk time per tile = 8 min / (0.5 + speed/100)",
        appetite: "fullness drain x (0.5 + appetite/100): full (85) to hungry (50) in ~6 h at 50, ~12 h at 0, ~4 h at 100"
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
        start: [65, 90], min: 0       // holds at 0; logs "is starving" once on reaching 0; no death
      },
      water: {
        // water: 0 = parched, 50 = thirsty, 100 = just drank. Not scaled by a trait (there is no thirst trait).
        threshold: 50,                // goes to drink below this (= actAt)
        minutesFullToThirsty: 240,    // 100 -> 50 in 4 game h => drain 50/240 = 0.208 per min (0 after 8 h)
        planFrom: 75,                 // like fullness.planFrom: leaves early if the nearest known shore is far
        start: [70, 95], min: 0       // holds at 0; logs "is parched" once; no death
      },
      drinkMinutes: 10,               // drink from any land tile next to water (4-neighbour); water rises linearly to 100
      energy: {
        // energy is 0-100. 100 = rested. Drains while awake, refills while asleep.
        drainMinutes: 960,            // 100 -> 0 over 16 waking hours
        refillMinutes: 480,           // 0 -> 100 over 8 hours of sleep
        sleepBelow: 50,               // lies down (anywhere, when idle) after dusk if energy is under this
        nightFrom: 1080, dawnAt: 360, // 18:00 .. 06:00 is "after dusk"; a sleeper with full energy gets up at dawn
        wakeIfNeedBelow: 10,          // a sleeper wakes early if fullness or water drops below this (also: a food/water goal is dropped for the other need below this)
        asleepNeedRate: 0.25,         // fullness and water drain at a quarter of the waking rate while asleep
        start: [90, 100]              // energy 0 logs "is exhausted" once and they lie down where they are, day or night
      },
      bedtimeMin: 25,                 // before lying down she drinks/eats first if that need would drop below this by the time she wakes
      bedtimeTripTiles: 6,            // ...but only if the water / a known ripe bush is within this many tiles of path (else she sleeps)
      mealMinutes: 15,                // one ripe bush = one meal, eaten in one sitting; fullness rises linearly by mealAdds
      wander: { radius: 10, idleMin: 10, idleMax: 90 },
      explore: { min: 15, max: 32, candidates: 8,
        farTiles: 999, pathCandidates: 8, nearMin: 5, nearMax: 12 }  // known bush > 20 tiles of path away? first look nearby (5-12 tiles), then go
    },
    bushes: { count: 60, regrowMinutes: 1440, startRipe: 0.85, minSpacing: 4,   // eaten bush is ripe again 1 game day later
      weights: { edge: 6, meadow: 1, woods: 0.4 } }, // edge = meadow/woods border
    log: { max: 200,
      // log line colours: first matching rule wins, else "info". Tabs filter the log; a tab with no match shows everything.
      kinds: [{ kind: "warn", match: "is starving|is hungry|bush bare|bush was bare|bush taken|is thirsty|is parched|is exhausted|woke up (hungry|thirsty)" }],
      tabs: [{ key: "all", label: "All" },
             { key: "food", label: "Food", match: "bush|berr|meal|hungry|starving" },
             { key: "water", label: "Water", match: "water|drink|thirst|parched|lake|river" },
             { key: "sleep", label: "Sleep", match: "sleep|woke|exhausted" },
             { key: "events", label: "Events", rest: true }]  // rest = every line no other tab matches
    },
    render: {                         // view only: nothing here is saved or affects the sim
      stepsPerTile: 2,                // walk frame flips every 0.5 tile actually covered; standing = frame 0
      zoom: { max: 4, wheelStep: 50, pinchStep: 1.35, tapSlop: 8 }  // whole-number zoom 1x (fit) .. 4x; wheel deltaY per step; pinch distance ratio per step; px of movement before a press becomes a pan
    }
  };
})(this.GS = this.GS || {});
