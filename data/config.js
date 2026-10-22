// Sim configuration (all tunables live here). Plain script, sets GS.data.config; works on file://.
(function (G) {
  G.data = G.data || {};
  G.data.config = {
    saveVersion: 3,                 // v3: traits and needs on 0-100 (50 = average); older saves are rejected
    saveKey: "godsim.save",
    map: {
      w: 60, h: 40, tilePx: 16,      // render resolution 960x640, scaled to fit the screen
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
    pop: { maxPeople: 60, maxAnimals: 40, startPeople: 1 },
    person: {
      walkMinutesPerTile: 8,          // at speed 50. Actual = 8 / (0.5 + speed/100): speed 0 -> 16, 50 -> 8, 100 -> 5.33 min/tile
      startAge: [18, 30], lifespan: [60, 100], // years; 1 year = 4 seasons x 7 days = 28 days
      traits: {                       // the only traits; integers 0-100, 50 = average; rolled as 50 + gaussian*spread, rounded, clamped (full 0-100 allowed)
        speed: "walk time per tile = 8 min / (0.5 + speed/100)",
        appetite: "hunger rate x (0.5 + appetite/100): hungry after ~6 h at 50, ~12 h at 0, ~4 h at 100"
      },
      traitSpread: 17.5,              // gaussian sd in trait points
      sightTiles: 6,                  // fixed sight radius (tiles)
      hunger: {
        // hunger is 0-100 (stored as a float, shown rounded). 0 = full.
        threshold: 60,                // eats at or above this
        minutesToHungry: 360,         // 0 -> 60 in 6 game h at appetite 50 => rate 60/360 = 0.167 per min (240/day)
        planFrom: 30,                 // from here, before wandering, she leaves early if the nearest known food is so far she'd arrive past the threshold
        start: [10, 35], max: 100     // clamped at 100; logs "is starving" once on reaching it; no death yet
      },
      mealMinutes: 15,                // one ripe bush = one meal, eaten in one sitting; hunger falls linearly to 0
      wander: { radius: 10, idleMin: 10, idleMax: 90 },
      explore: { min: 15, max: 32, candidates: 8,
        farTiles: 999, pathCandidates: 8, nearMin: 5, nearMax: 12 }  // known bush > 20 tiles of path away? first look nearby (5-12 tiles), then go
    },
    bushes: { count: 30, regrowMinutes: 1440, startRipe: 0.85, minSpacing: 4,   // eaten bush is ripe again 1 game day later
      weights: { edge: 6, meadow: 1, woods: 0.4 } }, // edge = meadow/woods border
    log: { max: 80 }
  };
})(this.GS = this.GS || {});
