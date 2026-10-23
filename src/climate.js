// Step 11: air temperature (season + time of day), ground dryness (season + fixed patchiness + water), and the felt temperature that drives warmth.
// Pure functions of tick / tile / sim state, no RNG and no DOM.
(function (G) {
  const CF = () => G.data.config, K = () => CF().climate, T = () => G.data.T;
  const Climate = {};
  const wrap = (i, n) => ((i % n) + n) % n;
  // Season means sit at the middle of each season and blend linearly into the next; the day is a cosine with its low at coldestHour.
  Climate.airC = function (tick) {
    const t = CF().time, m = t.startMinute + tick * t.tickGameMinutes, dps = t.daysPerSeason, n = t.seasons.length, M = K().seasonMeanC;
    const f = m / 1440 / dps - 0.5, i = Math.floor(f), w = f - i, mean = M[wrap(i, n)] * (1 - w) + M[wrap(i + 1, n)] * w;
    const h = (m % 1440) / 60, day = -Math.cos((h - K().coldestHour) / 24 * Math.PI * 2);
    return Math.round((mean + K().dayAmpC * day) * 100) / 100;
  };
  Climate.seasonIndex = tick => { const t = CF().time, m = t.startMinute + tick * t.tickGameMinutes; return Math.floor(m / 1440 / t.daysPerSeason) % t.seasons.length; };

  // distance-to-water map per world (cached), used for damp ground near the river and lake
  const wetCache = new WeakMap();
  function nearWater(w) {
    let c = wetCache.get(w); if (c) return c;
    const R = K().dryness.nearWaterTiles, W = G.World; c = new Uint8Array(w.w * w.h);
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { let near = 0;
      for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R && !near; dx++) { const t = W.inb(w, x + dx, y + dy) && W.tile(w, x + dx, y + dy); if (t === T().RIVER || t === T().LAKE) near = 1; }
      c[y * w.w + x] = near; }
    wetCache.set(w, c); return c;
  }
  // smooth fixed patchiness in [-1,1]: value noise on a 4-tile grid from the world seed
  function patch(w, x, y) {
    const g = 4, gx = Math.floor(x / g), gy = Math.floor(y / g), fx = x / g - gx, fy = y / g - gy, H = (i, j) => G.RNG.hash2(i, j, w.seed ^ 0xD1F) * 2 - 1;
    const a = H(gx, gy) * (1 - fx) + H(gx + 1, gy) * fx, b = H(gx, gy + 1) * (1 - fx) + H(gx + 1, gy + 1) * fx; return a * (1 - fy) + b * fy;
  }
  // Ground fuel dryness 0-100 for a tile, before fire state (scorched/ash ground has no fuel: see Fire.dryness).
  Climate.groundDryness = function (w, x, y, tick) {
    const D = K().dryness, t = G.World.tile(w, x, y), s = Climate.seasonIndex(tick);
    const base = t === T().MEADOW ? D.meadow[s] : t === T().WOODS ? D.woods[s] : t === T().SAND ? D.sand[s] : null;
    if (base == null || t === T().SAND) return 0;
    const v = base + D.patch * patch(w, x, y) + (nearWater(w)[y * w.w + x] ? D.nearWater : 0);
    return Math.max(0, Math.min(100, Math.round(v)));
  };

  // Felt temperature for a person: air + shelter + huddle + fire heat + activity. Returns {c, sheltered, huddle, fire}.
  Climate.felt = function (sim, a) {
    const Wm = CF().person.warmth, x = Math.round(a.pos.x), y = Math.round(a.pos.y);
    let c = Climate.airC(sim.tick); const sheltered = G.World.tile(sim.world, x, y) === T().WOODS; if (sheltered) c += Wm.shelterC; else c += Wm.sunC * (1 - G.Time.darkness(sim.tick));
    let hud = 0; for (const b of sim.agents) if (b !== a && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= Wm.huddleTiles) hud++;
    hud = Math.min(hud, Wm.huddleMax); c += hud * Wm.huddleC;
    const heat = G.Fire ? G.Fire.heatAt(sim, a.pos.x, a.pos.y) : 0; c += heat;
    if (a.act.type === "walk") c += Wm.walkingC; else if (a.act.type === "sleep") c += Wm.asleepC;
    return { c: Math.round(c * 100) / 100, sheltered, huddle: hud, heat };
  };
  // warmth change per minute for a felt temperature
  Climate.warmthRate = function (feltC) { const Wm = CF().person.warmth, d = feltC - Wm.neutralC; return (d >= 0 ? d * Wm.gainPerDegreeHour : d * Wm.lossPerDegreeHour) / 60; };
  G.Climate = Climate;
})(this.GS = this.GS || {});
