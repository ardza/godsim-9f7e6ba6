// Simulation core: time, world state, fixed tick, event log, (de)serialization. No DOM here.
(function (G) {
  const CFG = () => G.data.config;
  const Time = {
    daysPerYear: () => CFG().time.daysPerSeason * CFG().time.seasons.length,
    realSecondsPerTick: () => CFG().time.realSecondsPerGameDay / 1440 * CFG().time.tickGameMinutes,
    at(tick) {
      const t = CFG().time, m = t.startMinute + tick * t.tickGameMinutes, day = Math.floor(m / 1440) + 1, md = m % 1440;
      return { day, minuteOfDay: md, hour: Math.floor(md / 60), minute: md % 60, season: t.seasons[Math.floor((day - 1) / t.daysPerSeason) % t.seasons.length],
        dayOfSeason: (day - 1) % t.daysPerSeason + 1, year: Math.floor((day - 1) / Time.daysPerYear()) + 1 };
    },
    hhmm: c => String(c.hour).padStart(2, "0") + ":" + String(c.minute).padStart(2, "0"),
    stamp: tick => { const c = Time.at(tick); return "Day " + c.day + " " + Time.hhmm(c); },
    // darkness 0..1: full day 07:00-18:00, full night 21:00-04:00, linear dusk/dawn
    darkness(tick) { const h = Time.at(tick).minuteOfDay / 60; if (h >= 7 && h <= 18) return 0; if (h >= 21 || h <= 4) return 1; return h < 7 ? (7 - h) / 3 : (h - 18) / 3; }
  };

  const Sim = {};
  Sim.create = function (seed) {
    seed = seed >>> 0;
    const world = G.World.generate(seed), rng = new G.RNG((seed ^ 0xA5A5A5A5) >>> 0);
    const sim = { version: CFG().saveVersion, seed, tick: 0, nextId: 1, world, rng, bushes: G.World.placeBushes(world, rng), agents: [], log: [],
      nameBag: rng.shuffle(G.data.names.map((_, i) => i)), nameRound: 0, prev: {} };
    // founders start around a walkable meadow tile near the middle
    const cx = world.w >> 1, cy = world.h >> 1; let best = null;
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) if (G.World.tile(world, x, y) === G.data.T.MEADOW) {
      const d = Math.hypot(x - cx, y - cy) + rng.float() * 6; if (!best || d < best.d) best = { x, y, d }; }
    // 5-8 founders (seeded), each on their own walkable tile, clustered around that spot
    const sp = CFG().pop.startPeople, n = Math.min(CFG().pop.maxPeople, Array.isArray(sp) ? rng.int(sp[0], sp[1]) : sp);
    let spots = [];
    for (let r = CFG().pop.clusterRadius; spots.length < n; r++) { spots = [];
      for (let y = best.y - r; y <= best.y + r; y++) for (let x = best.x - r; x <= best.x + r; x++) if (G.World.walkable(world, x, y)) spots.push({ x, y }); }
    spots = spots.map(q => ({ x: q.x, y: q.y, d: Math.hypot(q.x - best.x, q.y - best.y) + rng.float() * 2 })).sort((p, q) => p.d - q.d);
    for (let i = 0; i < n; i++) { const a = G.Agent.createPerson(sim, spots[i].x, spots[i].y, i % 8); sim.agents.push(a); Sim.log(sim, a.name + " woke in the meadow"); }
    // animals draw from their own seeded stream (arng), so adding them leaves the people's random sequence as it was
    sim.arng = new G.RNG((seed ^ 0x5EED0A11) >>> 0); sim.animals = []; sim.herds = []; sim.bodies = [];
    G.Animal.populate(sim);
    // objects, physics rolls and fire use a third stream (orng), so the map, bushes, founders and animals are as before
    sim.orng = new G.RNG((seed ^ 0x0B1EC7ED) >>> 0); sim.items = []; sim.discoveries = []; sim.fire = {};
    G.Items.populate(sim); G.Fire.init(sim);
    return sim;
  };
  // Seeded names with no repeats until the list is used up, then a fresh shuffle (reuse is fine past the list).
  Sim.nextName = function (sim) {
    const N = G.data.names; if (!N.length) return "Person " + sim.nextId;
    if (!sim.nameBag.length) { sim.nameBag = sim.rng.shuffle(N.map((_, i) => i)); sim.nameRound++; }
    return N[sim.nameBag.pop()];
  };
  Sim.log = function (sim, text) { sim.log.push({ t: sim.tick, text }); const max = CFG().log.max; if (sim.log.length > max) sim.log.splice(0, sim.log.length - max); };

  Sim.step = function (sim) {
    sim.tick++;
    const B = CFG().bushes;
    for (const b of sim.bushes) if (!b.ripe && ++b.regrow >= B.regrowMinutes / CFG().time.tickGameMinutes) { b.ripe = true; b.regrow = 0; b.burnt = false; sim.regrown = (sim.regrown || 0) + 1; }
    for (const a of sim.agents) { sim.prev[a.id] = { x: a.pos.x, y: a.pos.y }; G.Agent.step(sim, a); }
    for (const a of sim.agents.slice()) { const c = G.Agent.deathCause(a); if (c) Sim.die(sim, a, c); }
    G.Animal.stepAll(sim);
    G.Body.stepAll(sim);
    G.Fire.step(sim);
  };
  // A death: one action line, the person leaves the living and a body stays where they were (no grave; people ignore it).
  Sim.die = function (sim, a, cause) {
    Sim.log(sim, a.name + " lies still. " + a.name + " has died of " + cause + ".");
    if (a.carry != null) G.Items.drop(sim, a);
    sim.agents.splice(sim.agents.indexOf(a), 1); delete sim.prev[a.id];
    const b = G.Body.create(sim, a, cause); sim.bodies.push(b); return b;
  };

  const TILE_CH = "MWSRL";
  Sim.serialize = function (sim) {
    return { version: sim.version, seed: sim.seed, tick: sim.tick, nextId: sim.nextId, rng: sim.rng.s,
      world: { w: sim.world.w, h: sim.world.h, attempt: sim.world.attempt, lake: sim.world.lake, source: sim.world.source, tiles: sim.world.tiles.map(t => TILE_CH[t]).join("") },
      bushes: sim.bushes, agents: sim.agents, log: sim.log, nameBag: sim.nameBag, nameRound: sim.nameRound,
      arng: sim.arng.s, animals: sim.animals, herds: sim.herds, bodies: sim.bodies,
      orng: sim.orng.s, items: sim.items, discoveries: sim.discoveries, fire: sim.fire, fireStats: sim.fireStats, physStats: sim.physStats || null, fx: sim.fx };
  };
  Sim.deserialize = function (o) {
    if (!o || o.version !== CFG().saveVersion) throw new Error("unsupported save version " + (o && o.version));
    const s = JSON.parse(JSON.stringify(o));
    const world = { w: s.world.w, h: s.world.h, seed: s.seed, attempt: s.world.attempt, lake: s.world.lake, source: s.world.source, tiles: s.world.tiles.split("").map(c => TILE_CH.indexOf(c)) };
    const rng = new G.RNG(s.rng);
    return { version: s.version, seed: s.seed, tick: s.tick, nextId: s.nextId, world, rng, bushes: s.bushes, agents: s.agents, log: s.log, nameBag: s.nameBag, nameRound: s.nameRound || 0, prev: {},
      arng: new G.RNG(s.arng), animals: s.animals, herds: s.herds, bodies: s.bodies,
      orng: new G.RNG(s.orng), items: s.items, discoveries: s.discoveries, fire: s.fire, fireStats: s.fireStats, physStats: s.physStats || undefined, fx: s.fx || [] };
  };

  G.Time = Time; G.Sim = Sim;
})(this.GS = this.GS || {});
