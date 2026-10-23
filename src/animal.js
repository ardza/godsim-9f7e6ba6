// Animals (grazers, scavengers) and bodies. Plain objects, tick-based, seeded through their own stream sim.arng, no DOM.
// Animals have no names (shown as "Grazer 12"), no deaths or births yet, and they flee people.
// A body is what a death leaves on the ground: fresh -> rotting -> bones (a lasting object, material "bone"). People ignore bodies,
// but bones are things: an idle person may pick up one of a skeleton's bones (objects.bonesPerBody) as a bone item (src/objects.js).
(function (G) {
  const CF = () => G.data.config, AC = () => CF().animals, BC = () => CF().body, W = G.World;
  const TM = () => CF().time.tickGameMinutes, r2 = v => Math.round(v * 100) / 100, r9 = v => Math.round(v * 1e9) / 1e9;
  const Animal = {}, Body = {};
  const LABEL = { grazer: "Grazer", scavenger: "Scavenger" };
  const isMeadow = (w, x, y) => W.inb(w, x, y) && W.tile(w, x, y) === G.data.T.MEADOW;
  const grass = (sim, x, y) => isMeadow(sim.world, x, y) && !(G.Fire && sim.fire && G.Fire.groundBare(sim, x, y));   // burned / scorched ground has no grass until it regrows
  const tileOf = a => ({ x: Math.round(a.pos.x), y: Math.round(a.pos.y) });
  const whole = a => a.pos.x === Math.round(a.pos.x) && a.pos.y === Math.round(a.pos.y);

  Animal.name = a => LABEL[a.species] + " " + a.id;
  Animal.create = function (sim, species, x, y, herd) {
    const S = AC()[species], f = S.fullness;
    return { id: sim.nextId++, kind: "animal", species, herd: herd == null ? null : herd, pos: { x, y }, facing: "down",
      needs: { fullness: r2(sim.arng.range(f.start[0], f.start[1])) }, act: { type: "idle", until: sim.tick + sim.arng.int(0, S.idleMax) }, stats: { meals: 0, flees: 0 } };
  };
  Animal.fullnessDrainPerTick = a => 100 / AC()[a.species].fullness.minutesFullToEmpty * TM();
  Animal.doing = a => ({ graze: "grazing", feed: "feeding on a body" })[a.act.type] || ({ flee: "fleeing", wander: "wandering", meadow: "looking for grass", body: "going to a body" })[a.act.goal] || "resting";

  // nobody (person or other animal) ends a move on a tile someone else stands on or is heading to
  function claimOf(b) { if (b.act.type === "walk" && b.act.path.length) { const e = b.act.path[b.act.path.length - 1]; return e[0] + "," + e[1]; } const t = tileOf(b); return t.x + "," + t.y; }
  Animal.occupied = function (sim, a, x, y) { const k = x + "," + y;
    for (const b of sim.animals) if (b !== a && claimOf(b) === k) return true;
    for (const b of sim.agents) if (claimOf(b) === k) return true;
    return false; };
  function free(sim, a, x, y) { return W.walkable(sim.world, x, y) && !Animal.occupied(sim, a, x, y); }
  Animal.nearestPerson = function (sim, x, y) { let p = null, d = Infinity; for (const q of sim.agents) { const e = Math.hypot(q.pos.x - x, q.pos.y - y); if (e < d) { d = e; p = q; } } return { p, d }; };
  const personDist = (sim, x, y) => Animal.nearestPerson(sim, x, y).d;

  function walkTo(sim, a, x, y, goal, extra) {
    const t = tileOf(a), p = W.findPath(sim.world, t.x, t.y, x, y); if (!p) return false;
    if (!whole(a)) p.unshift([t.x, t.y]);   // mid-step: finish onto the nearest whole tile first
    a.act = Object.assign({ type: "walk", goal, path: p, i: 0 }, extra || {}); return true;
  }
  function idle(sim, a, scale) { const S = AC()[a.species], night = G.Agent.isNight(sim.tick) ? S.nightIdleScale : 1;
    if (!whole(a)) { const t = tileOf(a); a.act = { type: "walk", goal: "settle", path: [[t.x, t.y]], i: 0 }; return; }
    a.act = { type: "idle", until: sim.tick + Math.round(sim.arng.range(S.idleMin, S.idleMax) * night * (scale == null ? 1 : scale)) }; }

  // Flee: run to the reachable tile (fleeTo .. fleeTo+3 tiles away, 24 directions) that is farthest from every person.
  function flee(sim, a, from) {
    const S = AC()[a.species], t = tileOf(a); let best = null;
    for (let k = 0; k < 24; k++) { const ang = k / 24 * Math.PI * 2;
      for (const d of [S.fleeTo, S.fleeTo + 3]) { const x = Math.round(t.x + Math.cos(ang) * d), y = Math.round(t.y + Math.sin(ang) * d);
        if (!free(sim, a, x, y)) continue; const sc = personDist(sim, x, y); if (!best || sc > best.sc) best = { x, y, sc }; } }
    if (!best || !walkTo(sim, a, best.x, best.y, "flee")) return false;
    a.stats.flees++;
    if (a.species === "grazer") { const h = sim.herds[a.herd]; if (h) { h.x = best.x; h.y = best.y; h.next = sim.tick + AC().grazer.drift.everyMinutes;   // the herd regroups away from her
        if (sim.tick - (h.logged == null ? -1e9 : h.logged) >= 120) { h.logged = sim.tick; G.Sim.log(sim, "Grazers scatter from " + from.name, from); } } }
    else if (sim.tick - (a.logged == null ? -1e9 : a.logged) >= 240) { a.logged = sim.tick; G.Sim.log(sim, Animal.name(a) + " runs from " + from.name, from); }
    return true;
  }

  function move(sim, a) {
    const S = AC()[a.species], act = a.act; let budget = TM() / ((act.goal === "flee" || act.goal === "fleeFire") ? S.fleeMinutesPerTile : S.walkMinutesPerTile);
    while (budget > 1e-9 && act.i < act.path.length) {
      const [nx, ny] = act.path[act.i], dx = nx - a.pos.x, dy = ny - a.pos.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > Math.abs(dy)) a.facing = dx > 0 ? "right" : "left"; else if (dy) a.facing = dy > 0 ? "down" : "up";
      if (d <= budget) { a.pos.x = nx; a.pos.y = ny; budget -= d; act.i++; } else { a.pos.x += dx / d * budget; a.pos.y += dy / d * budget; budget = 0; }
    }
    a.pos.x = Math.round(a.pos.x * 1e6) / 1e6; a.pos.y = Math.round(a.pos.y * 1e6) / 1e6;
    if (act.i >= act.path.length) arrive(sim, a);
  }
  function arrive(sim, a) {
    if (a.act.goal === "body") { const b = sim.bodies.find(q => q.id === a.act.body); if (b && b.flesh > 0 && Math.hypot(b.x - a.pos.x, b.y - a.pos.y) < 1.5) { a.act = { type: "feed", body: b.id }; return; } }
    if (a.act.goal === "meadow" && grass(sim, a.pos.x, a.pos.y)) { a.act = { type: "graze", t: 0, from: a.needs.fullness }; return; }
    idle(sim, a, a.act.goal === "flee" || a.act.goal === "fleeFire" ? 0.3 : 1);
  }

  // ---- grazers: graze meadow when hungry, otherwise drift around their herd's home spot ----
  function grazerDecide(sim, a) {
    const S = AC().grazer, t = tileOf(a), w = sim.world;
    if (a.needs.fullness < S.fullness.grazeBelow) {
      if (grass(sim, t.x, t.y) && whole(a)) { a.act = { type: "graze", t: 0, from: a.needs.fullness }; return; }
      for (let r = 1; r <= 8; r++) for (let y = t.y - r; y <= t.y + r; y++) for (let x = t.x - r; x <= t.x + r; x++)
        if (Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) === r && grass(sim, x, y) && free(sim, a, x, y) && walkTo(sim, a, x, y, "meadow")) return;
    }
    const h = sim.herds[a.herd] || { x: t.x, y: t.y }, R = S.herdRadius;
    for (let k = 0; k < 16; k++) { const x = h.x + sim.arng.int(-R, R), y = h.y + sim.arng.int(-R, R);
      if ((k < 10 && !isMeadow(w, x, y)) || (x === t.x && y === t.y) || !free(sim, a, x, y) || personDist(sim, x, y) < S.fleeTo) continue;
      if (walkTo(sim, a, x, y, "wander")) return; }
    idle(sim, a);
  }
  function graze(sim, a) {
    const S = AC().grazer, act = a.act, n = S.fullness.grazeMinutes * (S.grazeSeason ? S.grazeSeason[G.Climate.seasonIndex(sim.tick)] : 1) / TM(); act.t++;
    a.needs.fullness = r9(Math.min(100, act.from + (100 - act.from) * act.t / n));
    if (act.t >= n) { a.needs.fullness = 100; a.stats.meals++; idle(sim, a); }
  }
  // how green the grazing is around (x, y): grass tiles within r x (100 - ground dryness)/100 (dry or burned ground counts for less / nothing)
  Animal.greenness = function (sim, x, y, r) { let g = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (grass(sim, x + dx, y + dy)) g += (100 - G.Climate.groundDryness(sim.world, x + dx, y + dy, sim.tick)) / 100;
    return Math.round(g * 100) / 100; };
  function driftHerds(sim) {
    const D = AC().grazer.drift, w = sim.world;
    sim.herds.forEach(h => { if (sim.tick < h.next) return; h.next = sim.tick + D.everyMinutes;
      // step 15: of up to D.choices acceptable spots, go to the greenest (most grass around, dampest ground)
      let best = null, n = 0;
      for (let k = 0; k < 20 && n < (D.choices || 1); k++) { const ang = sim.arng.float() * Math.PI * 2, d = sim.arng.range(D.min, D.max), x = Math.round(h.x + Math.cos(ang) * d), y = Math.round(h.y + Math.sin(ang) * d);
        if (isMeadow(w, x, y) && personDist(sim, x, y) >= AC().grazer.fleeTo + 2) { n++; const g = Animal.greenness(sim, x, y, D.greenRadius || 0); if (!best || g > best.g) best = { x, y, g }; } }
      if (best) { h.x = best.x; h.y = best.y; } });
  }

  // ---- scavengers: notice a body with flesh within noticeTiles, go and eat it (unless a person is near it); else roam ----
  function scavDecide(sim, a) {
    const S = AC().scavenger, t = tileOf(a);
    if (a.needs.fullness < S.fullness.feedBelow) {
      let best = null;
      for (const b of sim.bodies) { if (b.flesh <= 0) continue; const d = Math.hypot(b.x - a.pos.x, b.y - a.pos.y);
        if (d <= S.noticeTiles && personDist(sim, b.x, b.y) >= S.fleeWithin && (!best || d < best.d)) best = { b, d }; }
      if (best) { const b = best.b;
        if (best.d < 1.5 && whole(a)) { a.act = { type: "feed", body: b.id }; return; }
        const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => [b.x + dx, b.y + dy]).filter(([x, y]) => free(sim, a, x, y))
          .sort((p, q) => Math.hypot(p[0] - t.x, p[1] - t.y) - Math.hypot(q[0] - t.x, q[1] - t.y));
        for (const [x, y] of spots) if (walkTo(sim, a, x, y, "body", { body: b.id })) return;
      }
    }
    const R = S.wanderRadius;
    for (let k = 0; k < 12; k++) { const x = t.x + sim.arng.int(-R, R), y = t.y + sim.arng.int(-R, R);
      if ((x === t.x && y === t.y) || !free(sim, a, x, y) || personDist(sim, x, y) < S.fleeTo) continue;
      if (walkTo(sim, a, x, y, "wander")) return; }
    idle(sim, a);
  }
  function feed(sim, a) {
    const F = AC().scavenger.fullness, b = sim.bodies.find(q => q.id === a.act.body);
    if (!b || b.flesh <= 0 || a.needs.fullness >= 100) { if (b && a.needs.fullness >= 100) a.stats.meals++; idle(sim, a); return; }
    if (!b.scavenged) { b.scavenged = true; G.Sim.log(sim, "A scavenger feeds on " + b.name + "'s body", b); }
    const add = Math.min(100 - a.needs.fullness, F.fillPerMinute * TM());
    a.needs.fullness = r9(a.needs.fullness + add); b.eaten = r9((b.eaten || 0) + add * F.fleshPerFullness); b.flesh = r9(Math.max(0, b.flesh - add * F.fleshPerFullness));
  }

  Animal.step = function (sim, a) {
    const S = AC()[a.species], n = a.needs;
    n.fullness = r9(Math.max(0, n.fullness - Animal.fullnessDrainPerTick(a)));
    const np = Animal.nearestPerson(sim, a.pos.x, a.pos.y);
    if (np.p && np.d < S.fleeWithin && a.act.goal !== "flee") flee(sim, a, np.p);
    // flames close by: move away (no burn damage yet)
    if (a.act.goal !== "fleeFire" && G.Fire.burning(sim) && G.Fire.nearestFlame(sim, a.pos.x, a.pos.y) < CF().fire.fleeTiles) {
      const t = tileOf(a), b = G.Fire.awayTile(sim, t.x, t.y, (x, y) => free(sim, a, x, y)); if (b && walkTo(sim, a, b.x, b.y, "fleeFire")) { a.stats.fireFlees = (a.stats.fireFlees || 0) + 1;
        if (sim.tick - (sim.animalFireLog == null ? -1e9 : sim.animalFireLog) >= 120) { sim.animalFireLog = sim.tick; G.Sim.log(sim, (a.species === "grazer" ? "Grazers" : "A scavenger") + " run" + (a.species === "grazer" ? "" : "s") + " from the flames"); } } }
    const act = a.act;
    if (act.type === "walk") return move(sim, a);
    if (act.type === "graze") return graze(sim, a);
    if (act.type === "feed") return feed(sim, a);
    const hungry = n.fullness < (a.species === "grazer" ? S.fullness.grazeBelow : S.fullness.feedBelow);
    if (sim.tick >= act.until || (hungry && sim.tick % 10 === 0)) (a.species === "grazer" ? grazerDecide : scavDecide)(sim, a);
    if (a.act.type === "walk") move(sim, a);
  };
  Animal.stepAll = function (sim) {
    driftHerds(sim);
    for (const a of sim.animals) { sim.prev[a.id] = { x: a.pos.x, y: a.pos.y }; Animal.step(sim, a); }
  };

  // Start animals (seeded), all under pop.maxAnimals: grazers in herds on meadow, scavengers scattered; both away from the founders.
  Animal.populate = function (sim) {
    const w = sim.world, cap = CF().pop.maxAnimals, rng = sim.arng, Gz = AC().grazer, Sc = AC().scavenger;
    const away = (x, y, d) => personDist(sim, x, y) >= d;
    sim.animals = sim.animals || []; sim.herds = sim.herds || [];
    const meadow = []; for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (isMeadow(w, x, y)) meadow.push([x, y]);
    const nG = Math.min(Gz.start, cap), per = Math.ceil(nG / Gz.herds);
    for (let h = 0; h < Gz.herds && sim.animals.length < nG; h++) {
      let home = null;
      for (let k = 0; k < 200 && !home; k++) { const [x, y] = rng.pick(meadow); if (away(x, y, Gz.startAway) && sim.herds.every(o => Math.hypot(o.x - x, o.y - y) >= 8)) home = { x, y }; }
      if (!home) home = { x: rng.pick(meadow)[0], y: rng.pick(meadow)[1] };
      sim.herds.push({ id: h, x: home.x, y: home.y, next: rng.int(0, Gz.drift.everyMinutes) });
      const spots = []; for (let r = 0; spots.length < per && r < 12; r++) for (let y = home.y - r; y <= home.y + r; y++) for (let x = home.x - r; x <= home.x + r; x++)
        if (Math.max(Math.abs(x - home.x), Math.abs(y - home.y)) === r && W.walkable(w, x, y) && !Animal.occupied(sim, null, x, y)) spots.push([x, y]);
      for (const [x, y] of spots.slice(0, Math.min(per, nG - sim.animals.length))) sim.animals.push(Animal.create(sim, "grazer", x, y, h));
    }
    const land = []; for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (W.walkable(w, x, y)) land.push([x, y]);
    for (let i = 0; i < Sc.start && sim.animals.length < cap; i++) {
      for (let k = 0; k < 300; k++) { const [x, y] = rng.pick(land);
        if (away(x, y, Sc.startAway) && !Animal.occupied(sim, null, x, y) && sim.animals.every(o => o.species !== "scavenger" || Math.hypot(o.pos.x - x, o.pos.y - y) >= 8)) { sim.animals.push(Animal.create(sim, "scavenger", x, y)); break; } }
    }
  };

  // ---- bodies ----
  Body.create = function (sim, a, cause) {
    return { id: sim.nextId++, kind: "body", of: a.id, name: a.name, look: a.look || 0, x: Math.round(a.pos.x), y: Math.round(a.pos.y), diedAt: sim.tick, cause, age: Math.floor(a.age),
      stage: "fresh", stageAt: sim.tick, flesh: 100, eaten: 0, condition: 100, material: null, scavenged: false };
  };
  Body.stageWord = b => b.stage === "bones" ? "bones" : b.stage;
  Body.yearsMinutes = () => 1440 * G.Time.daysPerYear();
  Body.step = function (sim, b) {
    const B = BC(), tm = TM();
    if (b.stage === "fresh" && sim.tick - b.stageAt >= B.freshMinutes) { b.stage = "rotting"; b.stageAt = sim.tick; G.Sim.log(sim, b.name + "'s body begins to rot", b); }
    if (b.stage === "rotting") { // flesh left = what rot (by time since rotting began) and scavengers (eaten) have not taken
      b.flesh = r9(Math.max(0, 100 * (1 - (sim.tick - b.stageAt) / B.rotMinutes) - (b.eaten || 0)));
      if (b.flesh <= 0) { b.stage = "bones"; b.stageAt = sim.tick; b.material = B.material; G.Sim.log(sim, "Only " + b.name + "'s bones remain", b); } }
    else if (b.stage === "bones") { b.condition = r9(Math.max(0, b.condition - 100 / (B.bonesWeatherYears * Body.yearsMinutes()) * tm));
      if (b.condition <= 0) { b.gone = true; G.Sim.log(sim, b.name + "'s bones have crumbled away", b); } }
  };
  Body.stepAll = function (sim) { for (const b of sim.bodies) Body.step(sim, b); if (sim.bodies.some(b => b.gone)) sim.bodies = sim.bodies.filter(b => !b.gone); };

  G.Animal = Animal; G.Body = Body;
})(this.GS = this.GS || {});
