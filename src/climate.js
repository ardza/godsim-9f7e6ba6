// Step 11: air temperature (season + time of day), ground dryness (season + fixed patchiness + water), and the felt temperature that drives warmth.
// Pure functions of tick / tile / sim state, no RNG and no DOM.
// §38 / v35: season means + dayAmp ramp with yearIndex (mild coastal at year 0; Deep Cold can kill open-air later).
(function (G) {
  const CF = () => G.data.config, K = () => CF().climate, T = () => G.data.T;
  const Climate = {};
  const wrap = (i, n) => ((i % n) + n) % n;
  // 0-based year from tick (New Game = 0). Display Year in the clock is yearIndex + 1.
  Climate.yearIndex = function (tick) {
    const t = CF().time, m = t.startMinute + tick * t.tickGameMinutes, day = Math.floor(m / 1440) + 1;
    return Math.floor((day - 1) / (t.daysPerSeason * t.seasons.length));
  };
  // 0..1 harshness; 0 at yearIndex 0, 1 at rampYears+.
  Climate.hardT = function (tick) {
    const H = K().hard; if (!H || !(H.rampYears > 0)) return 0;
    return Math.min(1, Climate.yearIndex(tick) / H.rampYears);
  };
  // Season means after year ramp (base seasonMeanC + meanDeltaC × hardT).
  Climate.seasonMeans = function (tick) {
    const M = K().seasonMeanC, H = K().hard, t = Climate.hardT(tick);
    if (!H || !H.meanDeltaC || t <= 0) return M;
    return M.map((m, i) => m + (H.meanDeltaC[i] || 0) * t);
  };
  // Day amplitude after year ramp (base dayAmpC + dayAmpAddC[season] × hardT).
  Climate.dayAmp = function (tick) {
    const H = K().hard, t = Climate.hardT(tick), s = Climate.seasonIndex(tick);
    return K().dayAmpC + (H && H.dayAmpAddC && t > 0 ? (H.dayAmpAddC[s] || 0) * t : 0);
  };
  // Season means sit at the middle of each season and blend linearly into the next; the day is a cosine with its low at coldestHour.
  Climate.airC = function (tick) {
    const t = CF().time, m = t.startMinute + tick * t.tickGameMinutes, dps = t.daysPerSeason, n = t.seasons.length, M = Climate.seasonMeans(tick);
    const f = m / 1440 / dps - 0.5, i = Math.floor(f), w = f - i, mean = M[wrap(i, n)] * (1 - w) + M[wrap(i + 1, n)] * w;
    const h = (m % 1440) / 60, day = -Math.cos((h - K().coldestHour) / 24 * Math.PI * 2);
    return Math.round((mean + Climate.dayAmp(tick) * day) * 100) / 100;
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
  // step 22: the air at a tile = the day's air + any Warm / Cool power there
  Climate.airAt = (sim, x, y) => Climate.airC(sim.tick) + (G.Powers ? G.Powers.shiftC(sim, Math.round(x), Math.round(y)) : 0);
  Climate.felt = function (sim, a) {
    const Wm = CF().person.warmth, x = Math.round(a.pos.x), y = Math.round(a.pos.y);
    // step 22/26: rain on her (0..1): no sun; v22 per-strength chillC × exposure (L3/M6/H10); warmth loss × lossX in Agent.step
    const wet = G.Powers ? G.Powers.exposure(sim, a) : 0, rainy = wet > 0 || (G.Powers && G.Powers.any(sim) && G.Powers.raining(sim, x, y));
    let c = Climate.airAt(sim, x, y); const sheltered = G.World.tile(sim.world, x, y) === T().WOODS; if (sheltered) c += Wm.shelterC; else if (!rainy) c += Wm.sunC * (1 - G.Time.darkness(sim.tick));
    if (wet) c -= (G.Powers.chillCAt ? G.Powers.chillCAt(sim, x, y) : 0) * wet;
    let hud = 0; for (const b of sim.agents) if (b !== a && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= Wm.huddleTiles) hud++;
    hud = Math.min(hud, Wm.huddleMax); c += hud * Wm.huddleC;
    // step 20: at night a partner / group member / guardian (or ward) within bondTiles adds bondC (once)
    const sh = Wm.sleepHeat, sleepers = sh && a.act.type === "sleep" ? Climate.sleepersNear(sim, a) : 0;
    const sleepC = sleepers + 1 >= (sh ? sh.groupMin : Infinity) ? sh.groupC : sleepers >= 1 ? sh.pairC : 0; c += sleepC;   // Director (21): sleeping together
    const bond = !sleepC && Wm.bondC && G.Agent && G.Agent.isNight(sim.tick) ? Climate.bondNear(sim, a) : null; if (bond) c += Wm.bondC;
    const heat = G.Fire ? G.Fire.heatAt(sim, a.pos.x, a.pos.y) : 0; c += heat;
    // step 21b: resting / asleep inside a shelter she got into; fire + huddle + sleeping together + this stay under shelter.capX fires
    const baseWarm = heat + hud * Wm.huddleC + sleepC + (bond ? Wm.bondC : 0);
    const den = G.Shelter ? G.Shelter.warmC(sim, a, baseWarm) : 0; c += den;
    // v28: worn / sleep-under hide stacks with fire+shelter, trimmed under shelter.capX × fire.heatC
    const hide = G.Hides ? G.Hides.warmC(sim, a, baseWarm + den) : 0; c += hide;
    if (a.act.type === "walk") c += Wm.walkingC; else if (a.act.type === "sleep") c += Wm.asleepC;
    const o = { c: Math.round(c * 100) / 100, sheltered, huddle: hud, heat, bond: bond ? bond.name : null, sleepers, sleepC, den, hide }; if (wet) o.wet = wet; return o;
  };
  // step 20: is b someone she keeps with (partner, same group, her guardian or the child she guards)?
  Climate.bonded = (a, b) => b !== a && (a.mate === b.id || b.mate === a.id || (a.group != null && a.group === b.group) || a.guard === b.id || b.guard === a.id);
  Climate.bondNear = function (sim, a) { const R = CF().person.warmth.bondTiles;
    for (const b of sim.agents) if (Climate.bonded(a, b) && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= R) return b; return null; };
  // Director (21): other people asleep within sleepHeat.tiles of her
  Climate.sleepersNear = function (sim, a) { const R = CF().person.warmth.sleepHeat.tiles; let n = 0;
    for (const b of sim.agents) if (b !== a && b.act.type === "sleep" && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= R) n++; return n; };
  // v22: equilibrium warmth from felt °C (Director: eq = clamp(50 + (feltC - 10) * 2.5, 0, 100))
  Climate.warmthEq = function (feltC) {
    const Wm = CF().person.warmth, k = Wm.eqPerC != null ? Wm.eqPerC : 2.5, base = Wm.eqAtNeutral != null ? Wm.eqAtNeutral : 50;
    return Math.max(0, Math.min(100, base + (feltC - Wm.neutralC) * k));
  };
  // warmth change per minute toward eq. warmth = current warmth (defaults to eq → 0). Same gain/loss band as before; never pushes past eq.
  Climate.warmthRate = function (feltC, warmth) {
    const Wm = CF().person.warmth, eq = Climate.warmthEq(feltC);
    const w = warmth == null ? eq : warmth, gap = eq - w;
    if (Math.abs(gap) < 1e-12) return 0;
    const dFelt = Math.abs(feltC - Wm.neutralC);
    let perHour = dFelt * (gap > 0 ? Wm.gainPerDegreeHour : Wm.lossPerDegreeHour);
    // mild air near neutral still drifts toward eq (so a mild day does not leave everyone stuck at 100 / 0)
    if (dFelt < 0.5 && Math.abs(gap) > 1) perHour = Math.max(perHour, 2);
    const perMin = perHour / 60;
    return gap > 0 ? Math.min(gap, perMin) : Math.max(gap, -perMin);
  };
  G.Climate = Climate;
})(this.GS = this.GS || {});
