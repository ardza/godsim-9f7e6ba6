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
    // Display only (Commissioner): the clock reads 12-hour with AM/PM ("6:05 AM"); the sim keeps minutes since midnight.
    hhmm: c => (c.hour % 12 || 12) + ":" + String(c.minute).padStart(2, "0") + (c.hour < 12 ? " AM" : " PM"),
    // Display only: the sim works in Celsius; every temperature shown to the player goes through this ("41°F").
    tempF: c => Math.round(c * 9 / 5 + 32) + "°F",
    stamp: tick => { const c = Time.at(tick); return "Day " + c.day + " " + Time.hhmm(c); },
    // darkness 0..1: full day 07:00-18:00, full night 21:00-04:00, linear dusk/dawn
    darkness(tick) { const h = Time.at(tick).minuteOfDay / 60; if (h >= 7 && h <= 18) return 0; if (h >= 21 || h <= 4) return 1; return h < 7 ? (7 - h) / 3 : (h - 18) / 3; }
  };

  const Sim = {};
  Sim.create = function (seed) {
    seed = seed >>> 0;
    const world = G.World.generate(seed), rng = new G.RNG((seed ^ 0xA5A5A5A5) >>> 0);
    const sim = { version: CFG().saveVersion, seed, tick: 0, nextId: 1, world, rng, bushes: G.World.placeBushes(world, rng), agents: [], log: [], plog: {},
      nameBag: rng.shuffle(G.data.names.map((_, i) => i)), nameRound: 0, nameCount: {}, prev: {} };
    // founders start around the map's spawn: a meadow tile near the middle with water close by (World.generate picks it)
    const best = world.spawn;
    // 5-8 founders (seeded), each on their own walkable tile, clustered around that spot
    const sp = CFG().pop.startPeople, n = Math.min(CFG().pop.maxPeople, Array.isArray(sp) ? rng.int(sp[0], sp[1]) : sp);
    let spots = [];
    for (let r = CFG().pop.clusterRadius; spots.length < n; r++) { spots = [];
      for (let y = best.y - r; y <= best.y + r; y++) for (let x = best.x - r; x <= best.x + r; x++) if (G.World.walkable(world, x, y)) spots.push({ x, y }); }
    spots = spots.map(q => ({ x: q.x, y: q.y, d: Math.hypot(q.x - best.x, q.y - best.y) + rng.float() * 2 })).sort((p, q) => p.d - q.d);
    for (let i = 0; i < n; i++) { const a = G.Agent.createPerson(sim, spots[i].x, spots[i].y, i % 8); sim.agents.push(a); Sim.log(sim, a.name + " woke in the meadow", a); }
    // animals draw from their own seeded stream (arng), so adding them leaves the people's random sequence as it was
    sim.arng = new G.RNG((seed ^ 0x5EED0A11) >>> 0); sim.animals = []; sim.herds = []; sim.packs = []; sim.nextPackId = 1; sim.bodies = [];
    G.Animal.populate(sim);
    // objects, physics rolls and fire use a third stream (orng), so the map, bushes, founders and animals are as before
    sim.orng = new G.RNG((seed ^ 0x0B1EC7ED) >>> 0); sim.items = []; sim.discoveries = []; sim.fire = {};
    G.Items.populate(sim); G.Fire.init(sim);
    // learning rolls (approach a fire, copy someone) use a fourth stream, so the other sequences are as they were
    sim.lrng = new G.RNG((seed ^ 0x1EA2C0DE) >>> 0); sim.learnStats = G.Learn.newStats();
    sim.groups = []; sim.nextGroup = 1; sim.socStats = { took: 0 };   // step 18 (no random draws)
    G.Family.init(sim);   // step 19: sex per founder, pairs, babies - its own stream (frng), so the others are unchanged
    G.Faith.init(sim);    // step 21: faith per founder, prayers - its own stream (prng)
    G.Shelter.init(sim);  // step 21b: natural shelters from the terrain (own hash-seeded stream); nobody knows any yet
    G.Powers.init(sim);   // step 22: god powers (own stream, drawn only while one is active)
    G.Speech.init(sim);   // step 25: local language (own stream wrng)
    G.Corpse.init(sim);   // step 26: corpseFear (own stream crng), corpse choices
    G.Disease.init(sim);   // step 28: lasting sickness (own stream drng)
    G.Tools.init(sim);     // step 29: carried tools (flake / axe / long stick)
    return sim;
  };
  // Seeded names with no repeats until the list is used up, then a fresh shuffle (reuse is fine past the list).
  Sim.nextName = function (sim) {
    const N = G.data.names; if (!N.length) return "Person " + sim.nextId;
    if (!sim.nameBag.length) { sim.nameBag = sim.rng.shuffle(N.map((_, i) => i)); sim.nameRound++; }
    // Director (call 10 on 19): a name used again gets " II", " III", ... (counted per name, saved)
    const base = N[sim.nameBag.pop()], C = sim.nameCount || (sim.nameCount = {}), n = C[base] = (C[base] || 0) + 1;
    return n > 1 ? base + " " + Sim.roman(n) : base;
  };
  Sim.roman = function (n) { let s = ""; for (const [v, r] of [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) while (n >= v) { s += r; n -= v; } return s; };
  // v13 -> v14: names used so far are counted (so the next repeat gets the right numeral); children come later from babies as before
  Sim.migrate = function (o) {
    if (!o || o.version !== 13) return o; const s = JSON.parse(JSON.stringify(o)), C = {};
    const names = [].concat((s.agents || []).map(a => a.name), (s.babies || []).map(b => b.name), (s.bodies || []).filter(b => !b.species).map(b => b.name));
    for (const nm of names) if (nm) { const m = String(nm).match(/^(.*?) ([IVXLCDM]+)$/), base = m ? m[1] : nm; C[base] = (C[base] || 0) + 1; }
    s.nameCount = C; s.version = 14; return s;
  };
  // v14 -> v15: everyone gets a faith trait (from a stream seeded by seed and tick, so a load is repeatable), the prayer state starts empty
  Sim.migrate15 = function (o) {
    if (!o || o.version !== 14) return o; const s = JSON.parse(JSON.stringify(o)), r = new G.RNG((s.seed ^ 0xFA17B0DE ^ s.tick) >>> 0), sp = CFG().person.traitSpread;
    const roll = () => Math.round(Math.max(0, Math.min(100, 50 + r.gauss() * sp)));
    for (const a of s.agents || []) if (a.traits && a.traits.faith == null) a.traits.faith = roll();
    for (const b of s.babies || []) if (b.traits && b.traits.faith == null) b.traits.faith = roll();
    for (const a of s.agents || []) if (a.preg && a.preg.ftraits && a.preg.ftraits.faith == null) a.preg.ftraits.faith = roll();
    s.prng = r.s; s.faith = G.Faith.newState(); s.prayers = []; s.version = 15; return s;
  };
  // v15 -> v16: the seed's natural shelters (the terrain fields come from regenerating the seed's map), nobody knows any yet, nobody inside
  Sim.migrate16 = function (o) {
    if (!o || o.version !== 15) return o; const s = JSON.parse(JSON.stringify(o)), w = G.World.generate(s.seed);
    s.shelters = G.Shelter.generate(w, s.seed); s.shelterStats = G.Shelter.newStats(); s.shelterFirst = null; s.srng = null;
    for (const a of s.agents || []) { a.shelters = []; a.den = null; }
    s.version = 16; return s;
  };
  // v16 -> v17: no powers active, none on cooldown (own stream seeded from the seed); a same-sex pair goes back to friendship (pairs are man + woman only)
  Sim.migrate17 = function (o) {
    if (!o || o.version !== 16) return o; const s = JSON.parse(JSON.stringify(o));
    s.powers = G.Powers.newState(); s.powers.rs = (s.seed ^ 0x5A1D0F22) >>> 0;
    const by = {}; for (const a of s.agents || []) by[a.id] = a;
    if (CFG().family.bond.mixedOnly) for (const a of s.agents || []) { const b = by[a.mate]; if (a.mate != null && (!b || b.sex === a.sex)) { if (b && b.mate === a.id) b.mate = null; a.mate = null; } }
    s.version = 17; return s;
  };
  // v17 -> v18 (step 23): Lightning and Spawn powers. Their stats and cast counts start at 0, no cooldowns (ready); nobody is frightened or running;
  // sticks lit by a lightning fire before v18 are not marked (only new ones are bolt sticks). Nothing else changes.
  Sim.migrate18 = function (o) {
    if (!o || o.version !== 17) return o; const s = JSON.parse(JSON.stringify(o)), N = G.Powers.newStats();
    if (s.powers) { const t = s.powers.stats || {}; s.powers.stats = Object.assign(N, t, { casts: Object.assign(N.casts, t.casts || {}) }); s.powers.cd = s.powers.cd || {}; }
    s.version = 18; return s;
  };
  // v18 -> v19 (step 24): strikes.babies starts at 0; nobody has a fading curiosity bump (a.curioFade absent: v18 bumps were permanent and are not tracked, so they stay). Nothing else changes.
  Sim.migrate19 = function (o) {
    if (!o || o.version !== 18) return o; const s = JSON.parse(JSON.stringify(o));
    if (s.powers && s.powers.stats && s.powers.stats.strikes) s.powers.stats.strikes.babies = s.powers.stats.strikes.babies || 0;
    s.version = 19; return s;
  };
  // v19 -> v20 (step 25): empty speech state, own wrng; nobody has words / watches / gestures yet.
  Sim.migrate20 = function (o) {
    if (!o || o.version !== 19) return o; const s = JSON.parse(JSON.stringify(o));
    s.wrng = (s.seed ^ 0x5FEE7C11 ^ (s.tick || 0)) >>> 0;
    s.speech = G.Speech.newState();
    for (const a of s.agents || []) { delete a.words; delete a.speechWatch; delete a.speechDue; delete a.gesture; }
    s.version = 20; return s;
  };
  // v20 -> v21 (step 25 polish): same speech state; inventDiv / Discoveries / child copy are code+config, not save fields.
  Sim.migrate21 = function (o) {
    if (!o || o.version !== 20) return o; const s = JSON.parse(JSON.stringify(o));
    s.version = 21; return s;
  };
  // v21 -> v22 (step 26): corpseFear on every living person (founders range 40-70 via a seeded stream), corpseStats; bodies keep optional burial/pyre fields as they appear.
  Sim.migrate22 = function (o) {
    if (!o || o.version !== 21) return o; const s = JSON.parse(JSON.stringify(o));
    const R = (G.data.config.corpse && G.data.config.corpse.foundersFear) || [40, 70];
    const rng = new G.RNG((s.seed ^ 0xC0B5E26F ^ (s.tick || 0)) >>> 0);
    s.crng = rng.s; s.corpseStats = G.Corpse.newStats();
    for (const a of s.agents || []) {
      if (a.traits && a.traits.corpseFear == null) a.traits.corpseFear = rng.int(R[0], R[1]);
      delete a.corpseAt;
    }
    s.version = 22; return s;
  };
  // v22 -> v23 (step 26b): mountain bitmask on world (zeros if unknown), packs array, animal.pack null, flex already on items via create.
  Sim.migrate23 = function (o) {
    if (!o || o.version !== 22) return o; const s = JSON.parse(JSON.stringify(o));
    if (s.world && !s.world.mountain) s.world.mountain = "0".repeat((s.world.w || 0) * (s.world.h || 0));
    s.packs = s.packs || []; s.nextPackId = s.nextPackId || 1;
    for (const a of s.animals || []) if (a.pack == null) a.pack = null;
    for (const it of s.items || []) if (it.props && it.props.flex == null) {
      const m = G.data.materials[it.material]; it.props.flex = m && m.flex != null ? m.flex : 0;
    }
    for (const a of s.agents || []) {
      if (!a.zero) a.zero = { water: 0, fullness: 0, warmth: 0, energy: 0 };
      if (a.zero.energy == null) a.zero.energy = 0;
      if (a.hypo == null) a.hypo = 0;
      if (a.rainExposedMinutes == null) a.rainExposedMinutes = 0;
    }
    s.version = 23; return s;
  };
  // v23 -> v24 (step 27): per-person moods + moodClock
  Sim.migrate24 = function (o) {
    if (!o || o.version !== 23) return o; const s = JSON.parse(JSON.stringify(o));
    const B = (G.data.config.moods && G.data.config.moods.baseline) || 40;
    for (const a of s.agents || []) {
      if (!a.moods) a.moods = { happiness: B, sadness: B, anger: B };
      else { if (a.moods.happiness == null) a.moods.happiness = B; if (a.moods.sadness == null) a.moods.sadness = B; if (a.moods.anger == null) a.moods.anger = B; }
      if (!a.moodClock) a.moodClock = { hungryLow: 0, hapWas: a.moods.happiness, logAt: {} };
    }
    s.version = 24; return s;
  };
  // v24 -> v25 (step 28): disease stream + stats; per-person sick stays null until infected
  Sim.migrate25 = function (o) {
    if (!o || o.version !== 24) return o; const s = JSON.parse(JSON.stringify(o));
    s.drng = ((s.seed ^ 0xD15EA5E) >>> 0);
    s.diseaseStats = G.Disease.newStats();
    for (const a of s.agents || []) { if (a.sick === undefined) a.sick = null; }
    s.version = 25; return s;
  };
  // v25 -> v26 (step 29): tool craft stats; items may already carry a .tool field from play
  Sim.migrate26 = function (o) {
    if (!o || o.version !== 25) return o; const s = JSON.parse(JSON.stringify(o));
    s.toolStats = G.Tools.newStats();
    s.version = 26; return s;
  };
  // v26 -> v27 (step 30): Cure + Plague powers (config-driven). Ensure cast counters exist on old saves.
  Sim.migrate27 = function (o) {
    if (!o || o.version !== 26) return o; const s = JSON.parse(JSON.stringify(o));
    if (s.powers && s.powers.stats && s.powers.stats.casts) {
      s.powers.stats.casts.cure = s.powers.stats.casts.cure || 0;
      s.powers.stats.casts.plague = s.powers.stats.casts.plague || 0;
    }
    s.version = 27; return s;
  };
  // One log line. who = the person(s) involved (person/body objects or ids): the line is tagged with their ids and also goes into each one's own
  // log (sim.plog[id], last log.personMax kept, saved). k = an optional kind for the personal log ("death", "birth", "disc").
  Sim.ids = who => (who == null ? [] : Array.isArray(who) ? who : [who]).map(w => w == null ? null : typeof w === "number" ? w : w.kind === "body" ? w.of : w.id).filter((v, i, a) => v != null && a.indexOf(v) === i);
  Sim.log = function (sim, text, who, k) {
    const ids = Sim.ids(who), e = { t: sim.tick, text }; if (ids.length) e.ids = ids; if (k) e.k = k;
    sim.log.push(e); const max = CFG().log.max; if (sim.log.length > max) sim.log.splice(0, sim.log.length - max);
    for (const id of ids) Sim.plogAdd(sim, id, e);
  };
  // add to one person's own log only (e.g. their discoveries)
  Sim.plogAdd = function (sim, id, e) { const P = sim.plog || (sim.plog = {}), l = P[id] || (P[id] = []); l.push(e); const m = CFG().log.personMax; if (l.length > m) l.splice(0, l.length - m); };
  Sim.plogOf = (sim, id) => (sim.plog && sim.plog[id]) || [];

  Sim.step = function (sim) {
    sim.tick++;
    G.Powers.step(sim);   // step 22: rain ends, lit sticks in the rain go out, first-drop reactions, expired effects
    const B = CFG().bushes;
    // step 15: regrowth runs at the season's pace (counted in base-regrow minutes: 1 per minute in Greening, 1/3 in Deep Cold)
    const rate = B.regrowMinutes / Sim.seasonal(sim.tick).regrowMinutes, pw = G.Powers.any(sim);   // step 22: rained-on bushes regrow powers.rain.bushX as fast
    for (const b of sim.bushes) if (!b.ripe && (b.regrow = Math.round((b.regrow + (pw ? rate * G.Powers.bushX(sim, b) : rate)) * 1e6) / 1e6) >= B.regrowMinutes / CFG().time.tickGameMinutes - 1e-9) { b.ripe = true; b.regrow = 0; b.burnt = false; sim.regrown = (sim.regrown || 0) + 1; }
    for (const a of sim.agents) { sim.prev[a.id] = { x: a.pos.x, y: a.pos.y }; G.Agent.step(sim, a); }
    G.Shelter.step(sim);   // step 21b: who is inside which shelter, step-ins, first warm night
    for (const a of sim.agents.slice()) { const c = G.Agent.deathCause(a); if (c) Sim.die(sim, a, c); }
    G.Faith.step(sim);   // step 21: prayer bouts (own stream prng)
    G.Social.step(sim);   // step 18: familiarity, liking, daily groups
    G.Speech.step(sim);   // step 25: invent tokens, bind meanings, lock group speech
    G.Family.step(sim);   // step 19: pairs (daily), conception (2 AM), births, carried babies
    G.Animal.stepAll(sim);
    G.Body.stepAll(sim);
    G.Hunt.step(sim);
    G.Cook.step(sim);   // step 17: meat close to an ember / fire heats (cooked, then charred)
    G.Corpse.step(sim);   // step 26: burial / pyre stage advances
    if (G.Moods) G.Moods.step(sim);   // step 27: happiness / sadness / anger drift + banding
    if (G.Disease) G.Disease.step(sim);   // step 28: spread / recover / rare sickness death
    G.Fire.lightning(sim);
    G.Fire.step(sim);
  };
  // this season's bush numbers: {yield, regrowMinutes}
  Sim.seasonal = tick => { const S = CFG().bushes.season, i = G.Climate.seasonIndex(tick); return { yield: S ? S.yield[i] : 1, regrowMinutes: S ? S.regrowMinutes[i] : CFG().bushes.regrowMinutes }; };
  // A death: one action line, the person leaves the living and a body stays where they were (step 26: others may leave/drag/bury/burn/eat/ritual).
  Sim.die = function (sim, a, cause) {
    const BC = G.data.config.body || {}, lines = (BC.storyDeathLines || {})[cause];
    let mid;
    if (lines && lines.length) mid = " " + lines[((a.id || 0) + (sim.tick || 0)) % lines.length];
    else {
      const vb = (BC.causeVerb || {})[cause];
      mid = typeof vb === "string" && vb.charAt(0) === "=" ? " " + vb.slice(1)
          : vb ? " " + vb + " " + cause : " has died of " + cause;
    }
    Sim.log(sim, a.name + " lies still. " + a.name + mid + ".", a, "death");
    if (a.carry != null) G.Items.drop(sim, a);
    G.Family.onDeath(sim, a);
    G.Faith.onDeath(sim, a);   // step 21: those awake close by saw it
    if (G.Moods) G.Moods.onDeath(sim, a);   // step 27: liked death → sadness
    sim.agents.splice(sim.agents.indexOf(a), 1); delete sim.prev[a.id];
    const b = G.Body.create(sim, a, cause); sim.bodies.push(b); return b;
  };

  const TILE_CH = "MWSRL";
  Sim.serialize = function (sim) {
    return { version: sim.version, seed: sim.seed, tick: sim.tick, nextId: sim.nextId, rng: sim.rng.s,
      world: { w: sim.world.w, h: sim.world.h, attempt: sim.world.attempt, spawn: sim.world.spawn, hills: sim.world.hills, mountain: sim.world.mountain || "", info: sim.world.info, tiles: sim.world.tiles.map(t => TILE_CH[t]).join("") },
      bushes: sim.bushes, agents: sim.agents, log: sim.log, plog: sim.plog || {}, nameBag: sim.nameBag, nameRound: sim.nameRound, nameCount: sim.nameCount || {},
      arng: sim.arng.s, animals: sim.animals, herds: sim.herds, packs: sim.packs || [], nextPackId: sim.nextPackId || 1, bodies: sim.bodies,
      orng: sim.orng.s, items: sim.items, discoveries: sim.discoveries, fire: sim.fire, fireStats: sim.fireStats, physStats: sim.physStats || null, fx: sim.fx,
      lrng: sim.lrng.s, learnStats: sim.learnStats, huntStats: sim.huntStats || null,
      brng: sim.brng ? sim.brng.s : null, grazerBirths: sim.grazerBirths || 0, cookStats: sim.cookStats || null,
      groups: sim.groups || [], nextGroup: sim.nextGroup || 1, socStats: sim.socStats || null,
      frng: sim.frng.s, babies: sim.babies, famStats: sim.famStats,
      prng: sim.prng.s, faith: sim.faith, prayers: sim.prayers || [],
      shelters: sim.shelters || [], shelterStats: sim.shelterStats || null, shelterFirst: sim.shelterFirst || null, srng: sim.srng ? sim.srng.s : null,
      powers: sim.powers || null,
      wrng: sim.wrng ? sim.wrng.s : null, speech: sim.speech || null,
      crng: sim.crng ? sim.crng.s : null, corpseStats: sim.corpseStats || null,
      drng: sim.drng ? sim.drng.s : null, diseaseStats: sim.diseaseStats || null,
      toolStats: sim.toolStats || null };
  };
  Sim.deserialize = function (o) {
    if (o && o.version === 13) o = Sim.migrate(o);
    if (o && o.version === 14) o = Sim.migrate15(o);
    if (o && o.version === 15) o = Sim.migrate16(o);
    if (o && o.version === 16) o = Sim.migrate17(o);
    if (o && o.version === 17) o = Sim.migrate18(o);
    if (o && o.version === 18) o = Sim.migrate19(o);
    if (o && o.version === 19) o = Sim.migrate20(o);
    if (o && o.version === 20) o = Sim.migrate21(o);
    if (o && o.version === 21) o = Sim.migrate22(o);
    if (o && o.version === 22) o = Sim.migrate23(o);
    if (o && o.version === 23) o = Sim.migrate24(o);
    if (o && o.version === 24) o = Sim.migrate25(o);
    if (o && o.version === 25) o = Sim.migrate26(o);
    if (o && o.version === 26) o = Sim.migrate27(o);
    if (!o || o.version !== CFG().saveVersion) throw new Error("unsupported save version " + (o && o.version));
    const s = JSON.parse(JSON.stringify(o));
    const world = { w: s.world.w, h: s.world.h, seed: s.seed, attempt: s.world.attempt, spawn: s.world.spawn, hills: s.world.hills, mountain: s.world.mountain || "0".repeat(s.world.w * s.world.h), info: s.world.info, tiles: s.world.tiles.split("").map(c => TILE_CH.indexOf(c)) };
    const rng = new G.RNG(s.rng);
    return { version: s.version, seed: s.seed, tick: s.tick, nextId: s.nextId, world, rng, bushes: s.bushes, agents: s.agents, log: s.log, plog: s.plog || {}, nameBag: s.nameBag, nameRound: s.nameRound || 0, nameCount: s.nameCount || {}, prev: {},
      arng: new G.RNG(s.arng), animals: s.animals, herds: s.herds, packs: s.packs || [], nextPackId: s.nextPackId || 1, bodies: s.bodies,
      orng: new G.RNG(s.orng), items: s.items, discoveries: s.discoveries, fire: s.fire, fireStats: s.fireStats, physStats: s.physStats || undefined, fx: s.fx || [],
      lrng: new G.RNG(s.lrng), learnStats: s.learnStats, huntStats: s.huntStats || undefined,
      brng: s.brng != null ? new G.RNG(s.brng) : undefined, grazerBirths: s.grazerBirths || 0, cookStats: s.cookStats || undefined,
      groups: s.groups || [], nextGroup: s.nextGroup || 1, socStats: s.socStats || { took: 0 },
      frng: new G.RNG(s.frng), babies: s.babies || [], famStats: s.famStats,
      prng: new G.RNG(s.prng), faith: s.faith || G.Faith.newState(), prayers: s.prayers || [],
      shelters: s.shelters || [], shelterStats: s.shelterStats || G.Shelter.newStats(), shelterFirst: s.shelterFirst || null, srng: s.srng != null ? new G.RNG(s.srng) : undefined,
      powers: s.powers || Object.assign(G.Powers.newState(), { rs: (s.seed ^ 0x5A1D0F22) >>> 0 }),
      wrng: new G.RNG(s.wrng != null ? s.wrng : (s.seed ^ 0x5FEE7C11) >>> 0), speech: s.speech || G.Speech.newState(),
      crng: new G.RNG(s.crng != null ? s.crng : (s.seed ^ 0xC0B5E26F) >>> 0), corpseStats: s.corpseStats || G.Corpse.newStats(),
      drng: new G.RNG(s.drng != null ? s.drng : (s.seed ^ 0xD15EA5E) >>> 0), diseaseStats: s.diseaseStats || G.Disease.newStats(),
      toolStats: s.toolStats || G.Tools.newStats() };
  };

  G.Time = Time; G.Sim = Sim;
})(this.GS = this.GS || {});
