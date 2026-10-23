// People: plain-object agents and their per-tick behavior. Needs and traits are continuous;
// behavior is a small action state (act) chosen from needs + knowledge each tick.
(function (G) {
  const P = () => G.data.config.person, W = G.World;
  const Agent = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;

  Agent.createPerson = function (sim, x, y, look) {
    const p = P(), rng = sim.rng, traits = {};
    for (const k of Object.keys(p.traits)) traits[k] = Math.round(clamp(50 + rng.gauss() * p.traitSpread, 0, 100));
    return {
      id: sim.nextId++, kind: "person", name: G.Sim.nextName(sim), look: look || 0,   // look = which founder sprite (render only)
      pos: { x, y }, facing: "down",
      age: r2(rng.range(p.startAge[0], p.startAge[1])), lifespan: r2(rng.range(p.lifespan[0], p.lifespan[1])),
      needs: { fullness: r2(rng.range(p.fullness.start[0], p.fullness.start[1])), water: r2(rng.range(p.water.start[0], p.water.start[1])), energy: r2(rng.range(p.energy.start[0], p.energy.start[1])) },
      traits, knowledge: { bushes: {}, water: {} }, relations: {},
      act: { type: "idle", until: 0 }, stats: { meals: 0, drinks: 0, sleeps: 0 }
    };
  };

  // Derived values (all from traits; documented in data/config.js)
  // all needs: 100 = good, they drain down
  Agent.fullnessDrainPerTick = a => { const f = P().fullness; return (f.mealFillTo - f.threshold) / f.minutesFullToHungry * G.data.config.time.tickGameMinutes * (0.5 + a.traits.appetite / 100); };
  Agent.fullnessThreshold = a => P().fullness.threshold;
  Agent.waterDrainPerTick = a => { const w = P().water; return (100 - w.threshold) / w.minutesFullToThirsty * G.data.config.time.tickGameMinutes; };
  Agent.waterThreshold = a => P().water.threshold;
  // state words for the panel
  Agent.fullnessWord = v => { const f = P().fullness; return v <= 0 ? "starving" : v < f.threshold ? "hungry" : v < f.mealFillTo ? "fed" : v <= f.mealFillTo + 1e-9 ? "full" : "overfull"; };
  Agent.waterWord = v => v <= 0 ? "parched" : v < P().water.threshold ? "thirsty" : "watered";
  Agent.energyDrainPerTick = a => 100 / P().energy.drainMinutes * G.data.config.time.tickGameMinutes;
  Agent.energyRefillPerTick = a => 100 / P().energy.refillMinutes * G.data.config.time.tickGameMinutes;
  // after dusk = nightFrom .. dawnAt (minute of day)
  Agent.isNight = tick => { const E = P().energy, m = G.Time.at(tick).minuteOfDay; return m >= E.nightFrom || m < E.dawnAt; };
  // Decision rule: the lowest of fullness/water once it is below actAt; a tie goes to water.
  Agent.want = a => { const n = a.needs, at = P().actAt; if (n.water < at && n.water <= n.fullness) return "water"; if (n.fullness < at) return "food"; return null; };
  Agent.minutesPerTile = a => P().walkMinutesPerTile / (0.5 + a.traits.speed / 100);
  Agent.sight = a => P().sightTiles;
  Agent.tilePos = a => ({ x: Math.round(a.pos.x), y: Math.round(a.pos.y) });
  Agent.doing = a => ({ idle: "resting", eat: "eating a meal", drink: "drinking", sleep: "asleep" })[a.act.type] || ({ wander: "wandering", food: "going to a bush", explore: "looking for food", water: "going to the water", exploreWater: "looking for water", collapse: "stumbling to a stop" })[a.act.goal] || a.act.type;

  // Two people never end a move on the same tile: each person claims one tile (where they stand, or the end of their path),
  // and nobody picks a destination someone else has claimed. Passing through is fine.
  function claimOf(b) { if (b.act.type === "walk" && b.act.path.length) { const e = b.act.path[b.act.path.length - 1]; return e[0] + "," + e[1]; } const t = Agent.tilePos(b); return t.x + "," + t.y; }
  Agent.claimed = (sim, a, x, y) => { const k = x + "," + y; for (const b of sim.agents) if (b !== a && claimOf(b) === k) return true; return false; };

  // land tiles next to water (4-neighbour), per world; derived from the map so it is never saved
  const shoreCache = new WeakMap();
  Agent.shore = function (w) {
    let s = shoreCache.get(w); if (s) return s; s = [];
    const TL = G.data.tiles;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { if (!W.walkable(w, x, y)) continue;
      for (const [a, b] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { if (!W.inb(w, x + a, y + b)) continue; const t = TL[W.tile(w, x + a, y + b)]; if (t.water) { s.push({ x, y, k: x + "," + y, kind: t.key }); break; } } }
    shoreCache.set(w, s); return s;
  };

  function sense(sim, a) {
    const R = Agent.sight(a), K = a.knowledge.bushes; let found = 0, ripe = false, ripeNew = false;
    for (const b of sim.bushes) {
      if ((b.x - a.pos.x) ** 2 + (b.y - a.pos.y) ** 2 > R * R) continue;
      if (!K[b.id]) { K[b.id] = { x: b.x, y: b.y, ripe: false, seen: 0 }; found++; if (b.ripe) ripeNew = true; }
      // seen empty: remember since when (and restart that if she expected it back by now - someone else ate it meanwhile)
      if (!b.ripe && (K[b.id].ripe || K[b.id].emptySince === undefined || sim.tick - K[b.id].emptySince >= G.data.config.bushes.regrowMinutes)) K[b.id].emptySince = sim.tick;
      K[b.id].ripe = b.ripe; K[b.id].seen = sim.tick; if (b.ripe) ripe = true;
    }
    if (found) G.Sim.log(sim, a.name + (found === 1 ? " found a berry bush" : " found " + found + " berry bushes"));
    const KW = a.knowledge.water || (a.knowledge.water = {}); let waterNew = false;
    for (const s of Agent.shore(sim.world)) {
      if (KW[s.k] || (s.x - a.pos.x) ** 2 + (s.y - a.pos.y) ** 2 > R * R) continue;
      if (!Object.values(KW).includes(s.kind)) G.Sim.log(sim, a.name + " found water at the " + s.kind);
      KW[s.k] = s.kind; waterNew = true;
    }
    return { found, ripe, ripeNew, waterNew };
  }

  function walkTo(sim, a, tx, ty, goal, extra) {
    const t = Agent.tilePos(a), path = W.findPath(sim.world, t.x, t.y, tx, ty);
    if (!path) return false;
    a.act = Object.assign({ type: "walk", goal, path, i: 0 }, extra || {});
    return true;
  }

  function randomTarget(sim, a, rmin, rmax) {
    const t = Agent.tilePos(a), rng = sim.rng;
    for (let k = 0; k < 30; k++) {
      const ang = rng.float() * Math.PI * 2, d = rng.range(rmin, rmax), x = Math.round(t.x + Math.cos(ang) * d), y = Math.round(t.y + Math.sin(ang) * d);
      if (W.walkable(sim.world, x, y) && !Agent.claimed(sim, a, x, y)) return { x, y };
    }
    return null;
  }

  // people only stop on whole tiles: if a plan changes mid-step, finish the step onto a free neighbouring tile first
  const whole = a => a.pos.x === Math.round(a.pos.x) && a.pos.y === Math.round(a.pos.y);
  function settleTile(sim, a) {
    const xs = [Math.round(a.pos.x), Math.floor(a.pos.x), Math.ceil(a.pos.x)], ys = [Math.round(a.pos.y), Math.floor(a.pos.y), Math.ceil(a.pos.y)];
    for (const x of xs) for (const y of ys) if (W.walkable(sim.world, x, y) && !Agent.claimed(sim, a, x, y)) return [x, y];
    return [xs[0], ys[0]];
  }
  function startIdle(sim, a, scale) {
    if (!whole(a)) { a.act = { type: "walk", goal: "settle", path: [settleTile(sim, a)], i: 0, scale }; return; }
    const w = P().wander;
    a.act = { type: "idle", until: sim.tick + Math.round(sim.rng.range(w.idleMin, w.idleMax) * (scale || 1)) };
  }

  // Before setting off to wander: if the nearest food is far enough that she'd arrive past the threshold, leave for it now.
  function foodIsFar(sim, a) {
    const h = P().fullness; if (a.needs.fullness >= h.planFrom) return false;
    const K = a.knowledge.bushes, t = Agent.tilePos(a);
    const ids = Object.keys(K).filter(id => !Agent.claimed(sim, a, K[id].x, K[id].y)).filter(id => K[id].ripe || sim.tick - (K[id].emptySince || 0) >= G.data.config.bushes.regrowMinutes)
      .sort((p, q) => Math.hypot(K[p].x - t.x, K[p].y - t.y) - Math.hypot(K[q].x - t.x, K[q].y - t.y)).slice(0, P().explore.pathCandidates);
    let len = Infinity; for (const id of ids) { const p = W.findPath(sim.world, t.x, t.y, K[id].x, K[id].y); if (p) len = Math.min(len, W.pathLength(p)); }
    return a.needs.fullness - len * Agent.minutesPerTile(a) * Agent.fullnessDrainPerTick(a) / G.data.config.time.tickGameMinutes < Agent.fullnessThreshold(a);
  }

  // Same idea for water: below water.planFrom, leave now if the nearest known shore is so far she'd arrive thirsty (or none is known yet).
  function waterIsFar(sim, a) {
    const th = P().water; if (a.needs.water >= th.planFrom) return false;
    const best = nearestWater(sim, a); if (!best) return true;
    return a.needs.water - best.len * Agent.minutesPerTile(a) * Agent.waterDrainPerTick(a) / G.data.config.time.tickGameMinutes < Agent.waterThreshold(a);
  }
  // nearest remembered, unclaimed shore tile by path length (among the closest few by straight line)
  function nearestWater(sim, a) {
    const KW = a.knowledge.water || {}, t = Agent.tilePos(a), N = P().explore.pathCandidates;
    const c = Object.keys(KW).map(k => { const i = k.indexOf(","), x = +k.slice(0, i), y = +k.slice(i + 1); return { k, x, y, d: Math.hypot(x - t.x, y - t.y) }; })
      .filter(q => !Agent.claimed(sim, a, q.x, q.y)).sort((p, q) => p.d - q.d || (p.k < q.k ? -1 : 1)).slice(0, N);
    let best = null;
    for (const q of c) { if (q.d === 0) return { k: q.k, p: whole(a) ? [] : [[q.x, q.y]], len: 0, kind: KW[q.k] };
      const p = W.findPath(sim.world, t.x, t.y, q.x, q.y); if (p && (!best || W.pathLength(p) < best.len)) best = { k: q.k, p, len: W.pathLength(p), kind: KW[q.k] }; }
    return best;
  }
  function seekWater(sim, a) {
    const best = nearestWater(sim, a);
    if (best && !best.p.length) { startDrink(sim, a, best.kind); return; }
    if (best) { a.act = { type: "walk", goal: "water", path: best.p, i: 0, water: best.kind }; return; }
    const e = P().explore, q = randomTarget(sim, a, e.min, e.max);   // no water known yet: go and look
    if (!q || !walkTo(sim, a, q.x, q.y, "exploreWater")) startIdle(sim, a, 0.2);
  }
  function startDrink(sim, a, kind) {
    a.act = { type: "drink", t: 0, from: a.needs.water, water: kind };
    G.Sim.log(sim, a.name + " drinks at the " + kind);
  }
  function drink(sim, a) {
    const act = a.act, n = P().drinkMinutes / G.data.config.time.tickGameMinutes;
    act.t++; a.needs.water = Math.min(100, Math.round((act.from + (100 - act.from) * act.t / n) * 1e9) / 1e9);
    if (act.t >= n) { a.needs.water = 100; a.stats.drinks++; startIdle(sim, a); }
  }
  // Lies down after dusk when energy is under sleepBelow (or straight back down if a need woke her early tonight).
  function shouldSleep(sim, a) { return a.needs.energy <= 0 || (Agent.isNight(sim.tick) && (a.needs.energy < P().energy.sleepBelow || a.wokeEarly)); }
  // minutes of night left from now until dawn (0 by day)
  function nightLeft(tick) { const E = P().energy, m = G.Time.at(tick).minuteOfDay; return m >= E.nightFrom ? 1440 - m + E.dawnAt : m < E.dawnAt ? E.dawnAt - m : 0; }
  // Before lying down: would fullness or water drop below bedtimeMin before she wakes (draining at the asleep rate)? Then see to it first.
  function bedtimeNeed(sim, a) {
    const E = P().energy, mins = Math.max(nightLeft(sim.tick), P().energy.refillMinutes * (1 - a.needs.energy / 100)), f = E.asleepNeedRate / G.data.config.time.tickGameMinutes, lim = P().bedtimeMin;
    const t = a.needs.water - Agent.waterDrainPerTick(a) * f * mins, h = a.needs.fullness - Agent.fullnessDrainPerTick(a) * f * mins;
    if (t < lim && t <= h) return "water"; if (h < lim) return "food"; return null;
  }
  // the nearest water / known ripe bush if it is within bedtimeTripTiles of path, else null
  function topUpTrip(sim, a, need) {
    const max = P().bedtimeTripTiles;
    if (need === "water") { const w = nearestWater(sim, a); return w && w.len <= max ? w : null; }
    const K = a.knowledge.bushes, t = Agent.tilePos(a); let best = null;
    for (const id of Object.keys(K)) { const k = K[id]; if (!k.ripe || Math.hypot(k.x - t.x, k.y - t.y) > max || Agent.claimed(sim, a, k.x, k.y)) continue;
      const p = W.findPath(sim.world, t.x, t.y, k.x, k.y); if (p && p.length && W.pathLength(p) <= max && (!best || W.pathLength(p) < best.len)) best = { id, p, len: W.pathLength(p) }; }
    return best;
  }
  function startSleep(sim, a) { a.topUp = null; a.act = { type: "sleep", since: sim.tick }; a.stats.sleeps++; G.Sim.log(sim, a.name + " lies down to sleep"); }
  function sleep(sim, a) {
    const E = P().energy, n = a.needs;
    if (n.fullness < E.wakeIfNeedBelow || n.water < E.wakeIfNeedBelow) { G.Sim.log(sim, a.name + " woke up " + (n.water <= n.fullness ? "thirsty" : "hungry")); startIdle(sim, a, 0); a.act.until = sim.tick; a.wokeEarly = true; return; }
    if (n.energy >= 100 && !Agent.isNight(sim.tick)) { const m = G.Time.at(sim.tick).minuteOfDay;
      G.Sim.log(sim, a.name + (m >= E.dawnAt && m < E.dawnAt + 120 ? " woke at dawn" : " woke up rested")); startIdle(sim, a, 0.3); a.wokeEarly = false; }
  }

  function wander(sim, a) {
    if (waterIsFar(sim, a)) { G.Sim.log(sim, a.name + " set off early for water"); return seekWater(sim, a); }
    if (foodIsFar(sim, a)) { G.Sim.log(sim, a.name + " set off early for a far bush"); return seekFood(sim, a, null, true); }
    const w = P().wander, r = w.radius, t = randomTarget(sim, a, 2, r);
    if (!t || !walkTo(sim, a, t.x, t.y, "wander")) startIdle(sim, a, 0.3);
  }

  // Go to the nearest remembered ripe (or due-to-regrow) bush (by path length among the 3 closest); else explore away from known bushes.
  function seekFood(sim, a, skipId, allowFar) {
    const K = a.knowledge.bushes, t = Agent.tilePos(a);
    const known = Object.keys(K).filter(id => id !== skipId && !Agent.claimed(sim, a, K[id].x, K[id].y) && (K[id].ripe || sim.tick - (K[id].emptySince || 0) >= G.data.config.bushes.regrowMinutes))  // empty ones are expected back after a day
      .map(id => ({ id, d: Math.hypot(K[id].x - t.x, K[id].y - t.y) })).sort((p, q) => p.d - q.d || (p.id < q.id ? -1 : 1)).slice(0, P().explore.pathCandidates);
    let best = null;
    for (const k of known) { const p = W.findPath(sim.world, t.x, t.y, K[k.id].x, K[k.id].y); if (p && (!best || W.pathLength(p) < best.len)) best = { id: k.id, p, len: W.pathLength(p) }; }
    const e = P().explore;
    if (best && (allowFar || best.len <= e.farTiles)) { a.act = { type: "walk", goal: "food", path: best.p, i: 0, bush: best.id }; return; }
    const near = best && !allowFar, ids = Object.keys(K);
    let pick = null, pickScore = -1;
    for (let c = 0; c < e.candidates; c++) {
      const q = randomTarget(sim, a, near ? e.nearMin : e.min, near ? e.nearMax : e.max); if (!q) continue;
      const score = ids.length ? Math.min(...ids.map(id => Math.hypot(K[id].x - q.x, K[id].y - q.y))) : sim.rng.float();
      if (score > pickScore) { pick = q; pickScore = score; }
    }
    if (!pick || !walkTo(sim, a, pick.x, pick.y, "explore")) { if (best) a.act = { type: "walk", goal: "food", path: best.p, i: 0, bush: best.id }; else startIdle(sim, a, 0.2); }
  }

  // Not hungry yet (fullness above snackAbove) but a ripe bush is in sight: eat it now if it is close by path (overeating). Off unless snackAbove is set.
  function seekNear(sim, a) {
    const t = Agent.tilePos(a), R = Agent.sight(a); let best = null;
    for (const b of sim.bushes) { if (!b.ripe || Agent.claimed(sim, a, b.x, b.y) || (b.x - a.pos.x) ** 2 + (b.y - a.pos.y) ** 2 > R * R) continue;
      const p = W.findPath(sim.world, t.x, t.y, b.x, b.y); if (p && W.pathLength(p) <= R * 1.5 && (!best || W.pathLength(p) < best.len)) best = { id: b.id, p, len: W.pathLength(p) }; }
    if (best) a.act = { type: "walk", goal: "food", path: best.p, i: 0, bush: best.id };
  }

  function arrive(sim, a) {
    const g = a.act.goal;
    if (g === "food") {
      const b = sim.bushes.find(q => q.id === a.act.bush);
      if (b && b.ripe) { a.act = { type: "eat", bush: b.id, t: 0, from: a.needs.fullness, over: !!a.act.over || a.needs.fullness >= Agent.fullnessThreshold(a) }; return; }
      G.Sim.log(sim, a.name + " found the bush bare");
      if (b) a.knowledge.bushes[b.id].ripe = false;
      seekFood(sim, a, b && b.id); return;
    }
    if (g === "water") { startDrink(sim, a, a.act.water); return; }
    if (g === "collapse") { startSleep(sim, a); return; }
    if (g === "settle") { startIdle(sim, a, a.act.scale); return; }
    if (g === "exploreWater" && Agent.want(a) === "water") { seekWater(sim, a); return; }
    if (g === "explore" && a.needs.fullness < Agent.fullnessThreshold(a)) { seekFood(sim, a, null, true); return; } // looked nearby; now accept a far bush
    startIdle(sim, a);
  }

  function move(sim, a) {
    const act = a.act; let budget = 1 / Agent.minutesPerTile(a) * G.data.config.time.tickGameMinutes; // tiles per tick
    if (!act.path.length && !whole(a)) act.path = [[Math.round(a.pos.x), Math.round(a.pos.y)]];   // a path from the tile she is stepping onto: finish the step
    while (budget > 1e-9 && act.i < act.path.length) {
      const [nx, ny] = act.path[act.i], dx = nx - a.pos.x, dy = ny - a.pos.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > Math.abs(dy)) a.facing = dx > 0 ? "right" : "left"; else if (dy) a.facing = dy > 0 ? "down" : "up";
      if (d <= budget) { a.pos.x = nx; a.pos.y = ny; budget -= d; act.i++; }
      else { a.pos.x += dx / d * budget; a.pos.y += dy / d * budget; budget = 0; }
    }
    a.pos.x = Math.round(a.pos.x * 1e6) / 1e6; a.pos.y = Math.round(a.pos.y * 1e6) / 1e6; // keep saves exact
    if (act.i >= act.path.length) arrive(sim, a);
  }

  // One ripe bush = one meal, eaten in one sitting over mealMinutes, then the bush is empty. It adds mealAdds (40) fullness:
  // a normal (hungry) meal stops at mealFillTo (85, "full"); overeating (started at/above the threshold, or the bedtime meal) adds the full 40, capped at 100.
  Agent.mealEnd = (from, over) => { const f = P().fullness; return Math.max(from, Math.min(over ? 100 : f.mealFillTo, from + f.mealAdds)); };
  function eat(sim, a) {
    const act = a.act, p = P(), b = sim.bushes.find(q => q.id === act.bush), n = p.mealMinutes / G.data.config.time.tickGameMinutes;
    if (!b || !b.ripe) { seekFood(sim, a, act.bush); return; }
    act.t++; const end = Agent.mealEnd(act.from, act.over);
    a.needs.fullness = Math.round((act.from + (end - act.from) * Math.min(1, act.t / n)) * 1e9) / 1e9;
    if (act.t >= n) {
      a.needs.fullness = end; b.ripe = false; b.regrow = 0; a.knowledge.bushes[b.id].ripe = false; a.knowledge.bushes[b.id].emptySince = sim.tick;
      a.stats.meals++; G.Sim.log(sim, a.name + " ate berries (" + Agent.fullnessWord(end) + ")");
      startIdle(sim, a);
    }
  }

  Agent.step = function (sim, a) {
    const p = P(), E = p.energy, n = a.needs, thr = Agent.fullnessThreshold(a), tthr = Agent.waterThreshold(a), h0 = n.fullness, t0 = n.water, e0 = n.energy;
    const asleep = a.act.type === "sleep", k = asleep ? E.asleepNeedRate : 1;
    n.fullness = Math.max(p.fullness.min, h0 - Agent.fullnessDrainPerTick(a) * k);
    n.water = Math.max(p.water.min, t0 - Agent.waterDrainPerTick(a) * k);
    n.energy = asleep ? Math.min(100, e0 + Agent.energyRefillPerTick(a)) : Math.max(0, e0 - Agent.energyDrainPerTick(a));
    n.fullness = Math.round(n.fullness * 1e9) / 1e9; n.water = Math.round(n.water * 1e9) / 1e9; n.energy = Math.round(n.energy * 1e9) / 1e9; // keep saves exact
    a.age += G.data.config.time.tickGameMinutes / (1440 * G.Time.daysPerYear());
    if (h0 >= thr && n.fullness < thr) G.Sim.log(sim, a.name + " is hungry");
    if (h0 > p.fullness.min && n.fullness <= p.fullness.min) G.Sim.log(sim, a.name + " is starving");
    if (t0 >= tthr && n.water < tthr) G.Sim.log(sim, a.name + " is thirsty");
    if (t0 > p.water.min && n.water <= p.water.min) G.Sim.log(sim, a.name + " is parched");
    if (e0 > 0 && n.energy <= 0) G.Sim.log(sim, a.name + " is exhausted");
    if (asleep) return sleep(sim, a);
    if (a.wokeEarly && !Agent.isNight(sim.tick)) a.wokeEarly = false;
    const seen = sense(sim, a), act = a.act, want = Agent.want(a), goalNeed = { food: "food", explore: "food", water: "water", exploreWater: "water" }[act.goal];
    // keep going for the need she set off for unless the other one has dropped below wakeIfNeedBelow (no flip-flopping between food and water)
    const stay = goalNeed && want && want !== goalNeed && (goalNeed === "water" ? n.water : n.fullness) < p.actAt && (want === "water" ? n.water : n.fullness) >= E.wakeIfNeedBelow;
    // exhausted (energy 0): lies down where she is, day or night, unless a need is below wakeIfNeedBelow
    if (n.energy <= 0 && act.type !== "eat" && act.type !== "drink" && act.goal !== "collapse" && n.fullness >= E.wakeIfNeedBelow && n.water >= E.wakeIfNeedBelow) {
      if (act.type !== "walk" || act.i >= act.path.length) return startSleep(sim, a);
      const [x, y] = act.path[act.i];   // mid-step: finish the step onto the next tile (if nobody has claimed it) and lie down there
      if (!Agent.claimed(sim, a, x, y)) { act.path = act.path.slice(0, act.i + 1); act.goal = "collapse"; } }
    if (act.type === "eat") return eat(sim, a);
    if (act.type === "drink") return drink(sim, a);
    if (act.goal === "food" && !a.knowledge.bushes[act.bush].ripe && a.knowledge.bushes[act.bush].seen === sim.tick) { G.Sim.log(sim, a.name + " saw the bush was bare"); if (want === "water") seekWater(sim, a); else seekFood(sim, a, act.bush); }
    else if (stay) { /* carry on */ }
    else if (want === "water" && act.goal !== "water" && (act.goal !== "exploreWater" || seen.waterNew)) seekWater(sim, a);
    else if (want === "food" && act.goal !== "food" && (act.goal !== "explore" || seen.ripeNew)) seekFood(sim, a);
    else if (!want && p.fullness.snackAbove != null && n.fullness > p.fullness.snackAbove && act.goal !== "food" && seen.ripe) seekNear(sim, a);
    else if (act.type === "idle" && shouldSleep(sim, a)) {
      // before lying down: if fullness or water would drop below bedtimeMin by morning, see to it first - only a short trip, once a night
      const b = n.energy > 0 && bedtimeNeed(sim, a), go = b && a.topUp !== b && topUpTrip(sim, a, b);
      if (!go) startSleep(sim, a);
      else { a.topUp = b; G.Sim.log(sim, a.name + (b === "water" ? " goes for a drink before sleep" : " goes for a meal before sleep"));
        if (b === "food") a.act = { type: "walk", goal: "food", path: go.p, i: 0, bush: go.id, over: true };   // the bedtime meal counts as overeating
        else if (go.p.length) a.act = { type: "walk", goal: "water", path: go.p, i: 0, water: go.kind }; else startDrink(sim, a, go.kind); }
    }
    else if (act.type === "idle" && sim.tick >= act.until) wander(sim, a);
    if (a.act.type === "walk") move(sim, a);
  };

  G.Agent = Agent;
})(this.GS = this.GS || {});
