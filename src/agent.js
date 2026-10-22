// People: plain-object agents and their per-tick behavior. Needs and traits are continuous;
// behavior is a small action state (act) chosen from needs + knowledge each tick.
(function (G) {
  const P = () => G.data.config.person, W = G.World;
  const Agent = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;

  Agent.createPerson = function (sim, x, y) {
    const p = P(), rng = sim.rng, traits = {};
    for (const k of Object.keys(p.traits)) traits[k] = Math.round(clamp(50 + rng.gauss() * p.traitSpread, 0, 100));
    return {
      id: sim.nextId++, kind: "person", name: G.Sim.nextName(sim),
      pos: { x, y }, facing: "down",
      age: r2(rng.range(p.startAge[0], p.startAge[1])), lifespan: r2(rng.range(p.lifespan[0], p.lifespan[1])),
      needs: { hunger: r2(rng.range(p.hunger.start[0], p.hunger.start[1])) },
      traits, knowledge: { bushes: {} }, relations: {},
      act: { type: "idle", until: 0 }, stats: { meals: 0 }
    };
  };

  // Derived values (all from traits; documented in data/config.js)
  Agent.hungerPerTick = a => P().hunger.threshold / P().hunger.minutesToHungry * G.data.config.time.tickGameMinutes * (0.5 + a.traits.appetite / 100);
  Agent.hungerThreshold = a => P().hunger.threshold;
  Agent.minutesPerTile = a => P().walkMinutesPerTile / (0.5 + a.traits.speed / 100);
  Agent.sight = a => P().sightTiles;
  Agent.tilePos = a => ({ x: Math.round(a.pos.x), y: Math.round(a.pos.y) });
  Agent.doing = a => ({ idle: "resting", eat: "eating a meal" })[a.act.type] || ({ wander: "wandering", food: "going to a bush", explore: "looking for food" })[a.act.goal] || a.act.type;

  function sense(sim, a) {
    const R = Agent.sight(a), K = a.knowledge.bushes; let found = 0, ripe = false, ripeNew = false;
    for (const b of sim.bushes) {
      if ((b.x - a.pos.x) ** 2 + (b.y - a.pos.y) ** 2 > R * R) continue;
      if (!K[b.id]) { K[b.id] = { x: b.x, y: b.y, ripe: false, seen: 0 }; found++; if (b.ripe) ripeNew = true; }
      if (!b.ripe && (K[b.id].ripe || K[b.id].emptySince === undefined)) K[b.id].emptySince = sim.tick; // first time seen empty
      K[b.id].ripe = b.ripe; K[b.id].seen = sim.tick; if (b.ripe) ripe = true;
    }
    if (found) G.Sim.log(sim, a.name + (found === 1 ? " found a berry bush" : " found " + found + " berry bushes"));
    return { found, ripe, ripeNew };
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
      if (W.walkable(sim.world, x, y)) return { x, y };
    }
    return null;
  }

  function startIdle(sim, a, scale) {
    const w = P().wander;
    a.act = { type: "idle", until: sim.tick + Math.round(sim.rng.range(w.idleMin, w.idleMax) * (scale || 1)) };
  }

  // Before setting off to wander: if the nearest food is far enough that she'd arrive past the threshold, leave for it now.
  function foodIsFar(sim, a) {
    const h = P().hunger; if (a.needs.hunger < h.planFrom) return false;
    const K = a.knowledge.bushes, t = Agent.tilePos(a);
    const ids = Object.keys(K).filter(id => K[id].ripe || sim.tick - (K[id].emptySince || 0) >= G.data.config.bushes.regrowMinutes)
      .sort((p, q) => Math.hypot(K[p].x - t.x, K[p].y - t.y) - Math.hypot(K[q].x - t.x, K[q].y - t.y)).slice(0, P().explore.pathCandidates);
    let len = Infinity; for (const id of ids) { const p = W.findPath(sim.world, t.x, t.y, K[id].x, K[id].y); if (p) len = Math.min(len, W.pathLength(p)); }
    return a.needs.hunger + len * Agent.minutesPerTile(a) * Agent.hungerPerTick(a) / G.data.config.time.tickGameMinutes >= Agent.hungerThreshold(a);
  }

  function wander(sim, a) {
    if (foodIsFar(sim, a)) { G.Sim.log(sim, a.name + " set off early for a far bush"); return seekFood(sim, a, null, true); }
    const w = P().wander, r = w.radius, t = randomTarget(sim, a, 2, r);
    if (!t || !walkTo(sim, a, t.x, t.y, "wander")) startIdle(sim, a, 0.3);
  }

  // Go to the nearest remembered ripe (or due-to-regrow) bush (by path length among the 3 closest); else explore away from known bushes.
  function seekFood(sim, a, skipId, allowFar) {
    const K = a.knowledge.bushes, t = Agent.tilePos(a);
    const known = Object.keys(K).filter(id => id !== skipId && (K[id].ripe || sim.tick - (K[id].emptySince || 0) >= G.data.config.bushes.regrowMinutes))  // empty ones are expected back after a day
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

  // Not hungry yet but a ripe bush is in sight and hunger is past snackAt: eat it now if it is close by path.
  function seekNear(sim, a) {
    const t = Agent.tilePos(a), R = Agent.sight(a); let best = null;
    for (const b of sim.bushes) { if (!b.ripe || (b.x - a.pos.x) ** 2 + (b.y - a.pos.y) ** 2 > R * R) continue;
      const p = W.findPath(sim.world, t.x, t.y, b.x, b.y); if (p && W.pathLength(p) <= R * 1.5 && (!best || W.pathLength(p) < best.len)) best = { id: b.id, p, len: W.pathLength(p) }; }
    if (best) a.act = { type: "walk", goal: "food", path: best.p, i: 0, bush: best.id };
  }

  function arrive(sim, a) {
    const g = a.act.goal;
    if (g === "food") {
      const b = sim.bushes.find(q => q.id === a.act.bush);
      if (b && b.ripe) { a.act = { type: "eat", bush: b.id, t: 0, from: a.needs.hunger }; return; }
      G.Sim.log(sim, a.name + " found the bush bare");
      if (b) a.knowledge.bushes[b.id].ripe = false;
      seekFood(sim, a, b && b.id); return;
    }
    if (g === "explore" && a.needs.hunger >= Agent.hungerThreshold(a)) { seekFood(sim, a, null, true); return; } // looked nearby; now accept a far bush
    startIdle(sim, a);
  }

  function move(sim, a) {
    const act = a.act; let budget = 1 / Agent.minutesPerTile(a) * G.data.config.time.tickGameMinutes; // tiles per tick
    while (budget > 1e-9 && act.i < act.path.length) {
      const [nx, ny] = act.path[act.i], dx = nx - a.pos.x, dy = ny - a.pos.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > Math.abs(dy)) a.facing = dx > 0 ? "right" : "left"; else if (dy) a.facing = dy > 0 ? "down" : "up";
      if (d <= budget) { a.pos.x = nx; a.pos.y = ny; budget -= d; act.i++; }
      else { a.pos.x += dx / d * budget; a.pos.y += dy / d * budget; budget = 0; }
    }
    a.pos.x = Math.round(a.pos.x * 1e6) / 1e6; a.pos.y = Math.round(a.pos.y * 1e6) / 1e6; // keep saves exact
    if (act.i >= act.path.length) arrive(sim, a);
  }

  // One ripe bush = one meal, eaten in one sitting: hunger falls linearly to 0 over mealMinutes, then the bush is empty.
  function eat(sim, a) {
    const act = a.act, p = P(), b = sim.bushes.find(q => q.id === act.bush), n = p.mealMinutes / G.data.config.time.tickGameMinutes;
    if (!b || !b.ripe) { seekFood(sim, a, act.bush); return; }
    act.t++;
    a.needs.hunger = Math.max(0, Math.round(act.from * (1 - act.t / n) * 1e9) / 1e9);
    if (act.t >= n) {
      a.needs.hunger = 0; b.ripe = false; b.regrow = 0; a.knowledge.bushes[b.id].ripe = false; a.knowledge.bushes[b.id].emptySince = sim.tick;
      a.stats.meals++; G.Sim.log(sim, a.name + " ate a meal of berries");
      startIdle(sim, a);
    }
  }

  Agent.step = function (sim, a) {
    const thr = Agent.hungerThreshold(a), h0 = a.needs.hunger;
    a.needs.hunger = Math.min(P().hunger.max, h0 + Agent.hungerPerTick(a));
    a.age += G.data.config.time.tickGameMinutes / (1440 * G.Time.daysPerYear());
    if (h0 < thr && a.needs.hunger >= thr) G.Sim.log(sim, a.name + " got hungry");
    if (h0 < P().hunger.max && a.needs.hunger >= P().hunger.max) G.Sim.log(sim, a.name + " is starving");
    const seen = sense(sim, a), hungry = a.needs.hunger >= thr, act = a.act;
    if (act.type === "eat") return eat(sim, a);
    if (act.goal === "food" && !a.knowledge.bushes[act.bush].ripe && a.knowledge.bushes[act.bush].seen === sim.tick) { G.Sim.log(sim, a.name + " saw the bush was bare"); seekFood(sim, a, act.bush); }
    else if (!hungry && P().hunger.snackAt && a.needs.hunger >= P().hunger.snackAt && act.goal !== "food" && seen.ripe) seekNear(sim, a);
    else if (hungry && act.goal !== "food" && (act.goal !== "explore" || seen.ripeNew)) seekFood(sim, a);
    else if (act.type === "idle" && sim.tick >= act.until) wander(sim, a);
    if (a.act.type === "walk") move(sim, a);
  };

  G.Agent = Agent;
})(this.GS = this.GS || {});
