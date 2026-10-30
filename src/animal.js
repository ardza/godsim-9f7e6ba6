// Animals (deer, wild dogs, Wolves) and bodies. Plain objects, tick-based, seeded through their own stream sim.arng, no DOM.
// Species ids stay grazer/scavenger/wolves; UI/logs/Discoveries use deer / wild dog / Wolves (step 26b).
// Animals have no personal names (shown as "deer 12"), deer die when hunted and are born in Greening (step 17), and they flee people.
// A body is what a death leaves on the ground: fresh -> rotting -> bones (a lasting object, material "bone").
// Step 26: people may leave / drag / bury / burn / eat / ritual at a body (src/corpse.js). Bones stay as material (unless buried).
// An idle person may pick up one of a skeleton's bones (objects.bonesPerBody) as a bone item (src/objects.js).
(function (G) {
  const CF = () => G.data.config, AC = () => CF().animals, BC = () => CF().body, W = G.World;
  const TM = () => CF().time.tickGameMinutes, r2 = v => Math.round(v * 100) / 100, r9 = v => Math.round(v * 1e9) / 1e9;
  const Animal = {}, Body = {};
  // Display labels (ids unchanged). Fall back to title-cased id if config.label missing.
  const LABEL = sp => (AC()[sp] && AC()[sp].label) || ({ grazer: "deer", scavenger: "wild dog", wolves: "Wolves" }[sp] || sp);
  const isMeadow = (w, x, y) => W.inb(w, x, y) && W.tile(w, x, y) === G.data.T.MEADOW;
  const grass = (sim, x, y) => isMeadow(sim.world, x, y) && !(G.Fire && sim.fire && G.Fire.groundBare(sim, x, y));
  const tileOf = a => ({ x: Math.round(a.pos.x), y: Math.round(a.pos.y) });
  const whole = a => a.pos.x === Math.round(a.pos.x) && a.pos.y === Math.round(a.pos.y);

  Animal.name = a => LABEL(a.species) + " " + a.id;
  Animal.label = LABEL;
  Animal.create = function (sim, species, x, y, herd, rng) {
    const S = AC()[species], f = S.fullness; rng = rng || sim.arng;
    const o = { id: sim.nextId++, kind: "animal", species, herd: herd == null ? null : herd, pack: null, pos: { x, y }, facing: "down",
      needs: { fullness: r2(rng.range(f.start[0], f.start[1])) }, act: { type: "idle", until: sim.tick + rng.int(0, S.idleMax) }, stats: { meals: 0, flees: 0 } };
    return o;
  };
  Animal.fullnessDrainPerTick = a => 100 / AC()[a.species].fullness.minutesFullToEmpty * TM();
  Animal.packOf = (sim, a) => packOf(sim, a);
  Animal.flee = (sim, a, from) => flee(sim, a, from);
  Animal.doing = a => ({ graze: "grazing", feed: "feeding on a body", hunt: "hunting", threaten: "threatening" })[a.act.type]
    || ({ flee: "fleeing", wander: "wandering", meadow: "looking for grass", body: "going to a body", hunt: "stalking prey", threaten: "chasing", pack: "staying with the pack", den: "near the den" })[a.act.goal] || "resting";

  function claimOf(b) { if (b.act.type === "walk" && b.act.path.length) { const e = b.act.path[b.act.path.length - 1]; return e[0] + "," + e[1]; } const t = tileOf(b); return t.x + "," + t.y; }
  Animal.occupied = function (sim, a, x, y) { const k = x + "," + y;
    for (const b of sim.animals) if (b !== a && claimOf(b) === k) return true;
    for (const b of sim.agents) if (claimOf(b) === k) return true;
    return false; };
  function free(sim, a, x, y) { return W.walkable(sim.world, x, y) && !Animal.occupied(sim, a, x, y); }
  Animal.nearestPerson = function (sim, x, y) { let p = null, d = Infinity; for (const q of sim.agents) { const e = Math.hypot(q.pos.x - x, q.pos.y - y); if (e < d) { d = e; p = q; } } return { p, d }; };
  const personDist = (sim, x, y) => Animal.nearestPerson(sim, x, y).d;
  // v38 (f): every other animal keeps away from Wolves (animals.fleeWolfWithin)
  Animal.nearestWolf = function (sim, x, y, not) { let w = null, d = Infinity; for (const q of sim.animals) { if (q.species !== "wolves" || q === not) continue; const e = Math.hypot(q.pos.x - x, q.pos.y - y); if (e < d) { d = e; w = q; } } return { w, d }; };
  const wolfDist = (sim, x, y) => Animal.nearestWolf(sim, x, y).d;
  const FWW = () => AC().fleeWolfWithin || 0;

  function walkTo(sim, a, x, y, goal, extra) {
    const t = tileOf(a), p = W.findPath(sim.world, t.x, t.y, x, y); if (!p) return false;
    if (!whole(a)) p.unshift([t.x, t.y]);
    a.act = Object.assign({ type: "walk", goal, path: p, i: 0 }, extra || {}); return true;
  }
  function idle(sim, a, scale) { const S = AC()[a.species], night = G.Agent.isNight(sim.tick) ? S.nightIdleScale : 1;
    if (!whole(a)) { const t = tileOf(a); a.act = { type: "walk", goal: "settle", path: [[t.x, t.y]], i: 0 }; return; }
    a.act = { type: "idle", until: sim.tick + Math.round(sim.arng.range(S.idleMin, S.idleMax) * night * (scale == null ? 1 : scale)) }; }

  function flee(sim, a, from) {
    const S = AC()[a.species], t = tileOf(a), byWolf = from && from.species === "wolves"; let best = null;
    // v38 (f): from a wolf it runs to the spot farthest from every wolf (and still away from people); otherwise as before
    for (let k = 0; k < 24; k++) { const ang = k / 24 * Math.PI * 2;
      for (const d of [S.fleeTo, S.fleeTo + 3]) { const x = Math.round(t.x + Math.cos(ang) * d), y = Math.round(t.y + Math.sin(ang) * d);
        if (!free(sim, a, x, y)) continue; const sc = byWolf ? Math.min(wolfDist(sim, x, y), personDist(sim, x, y) + FWW()) : personDist(sim, x, y); if (!best || sc > best.sc) best = { x, y, sc }; } }
    if (!best || !walkTo(sim, a, best.x, best.y, "flee")) return false;
    a.stats.flees++;
    if (a.species === "grazer") { const h = sim.herds[a.herd]; if (h) { h.x = best.x; h.y = best.y; h.next = sim.tick + AC().grazer.drift.everyMinutes;
        if (sim.tick - (h.logged == null ? -1e9 : h.logged) >= 120) { h.logged = sim.tick; G.Sim.log(sim, "Deer scatter from " + (byWolf ? LABEL("wolves") : from.name), from); } } }
    else if (byWolf) { if (sim.tick - (a.logged == null ? -1e9 : a.logged) >= 240) { a.logged = sim.tick; G.Sim.log(sim, "A " + LABEL(a.species) + " runs from the " + LABEL("wolves")); } }
    else if (sim.tick - (a.logged == null ? -1e9 : a.logged) >= 240) { a.logged = sim.tick; G.Sim.log(sim, Animal.name(a) + " runs from " + from.name, from); }
    return true;
  }

  function move(sim, a) {
    const S = AC()[a.species], act = a.act; let budget = TM() / ((act.goal === "flee" || act.goal === "fleeFire" || act.goal === "threaten" || act.goal === "hunt") ? (S.fleeMinutesPerTile || S.walkMinutesPerTile) : S.walkMinutesPerTile);
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
    if (a.act.goal === "hunt") { const prey = sim.animals.find(q => q.id === a.act.prey); if (prey) return tryKill(sim, a, prey); }
    if (a.act.goal === "threaten") { const p = sim.agents.find(q => q.id === a.act.target); if (p) return tryThreaten(sim, a, p); }
    idle(sim, a, a.act.goal === "flee" || a.act.goal === "fleeFire" ? 0.3 : 1);
  }

  // People within watchTiles of a predator kill get hunt score (config.hunt.watchGain).
  function watchHunt(sim, x, y, tiles) {
    const g = CF().hunt.watchGain || 0; if (!g) return;
    for (const p of sim.agents) {
      if (p.act && p.act.type === "sleep") continue;
      if (Math.hypot(p.pos.x - x, p.pos.y - y) <= tiles) { G.Learn.add(p, "hunt", g); sim.huntWatch = (sim.huntWatch || 0) + 1; }
    }
  }

  // Predator kills a deer (or other animal): leave a carcass, action-only log, optional watch bump.
  function killPrey(sim, predator, prey) {
    const ix = sim.animals.indexOf(prey); if (ix < 0) return null;
    sim.animals.splice(ix, 1); delete sim.prev[prey.id];
    const b = G.Body.createAnimal(sim, prey, { name: predator.species === "wolves" ? LABEL("wolves") : Animal.name(predator) });   // v38 (f): meat source reads "killed by Wolves"
    sim.bodies.push(b);
    G.Sim.log(sim, Animal.name(predator) + " brings down " + b.name);
    const S = AC()[predator.species];
    watchHunt(sim, b.x, b.y, S.watchTiles || 8);
    predator.stats.kills = (predator.stats.kills || 0) + 1;
    predator.stats.meals = (predator.stats.meals || 0) + 1;
    predator.needs.fullness = r9(Math.min(100, predator.needs.fullness + AC().killFill));
    return b;
  }

  const d0 = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  function tryKill(sim, a, prey) {
    const S = AC()[a.species], H = (prey && prey.species === "scavenger" && S.huntDog) || S.huntDeer; if (!H || !prey) { idle(sim, a); return; }
    if (prey.species === "scavenger" && a.species === "wolves") { const ws = sim.wolfDog = sim.wolfDog || { tries: 0, kills: 0 }; if (d0(a, prey) <= H.strikeTiles + 0.2) ws.tries++; }
    const d = Math.hypot(prey.pos.x - a.pos.x, prey.pos.y - a.pos.y);
    if (d > H.strikeTiles + 0.2) {
      const tx = Math.round(prey.pos.x), ty = Math.round(prey.pos.y);
      if (!walkTo(sim, a, tx, ty, "hunt", { prey: prey.id })) idle(sim, a);
      return;
    }
    if (sim.arng.chance(H.killChance)) { if (prey.species === "scavenger" && sim.wolfDog) sim.wolfDog.kills++; const kb = killPrey(sim, a, prey);
      // v38 (f): the killer settles to eat its kill (no kill left to rot while it wanders off)
      if (!(kb && AC().eatOwnKill && a.needs.fullness < 100 && goFeed(sim, a, { b: kb, d: Math.hypot(kb.x - a.pos.x, kb.y - a.pos.y) }))) idle(sim, a, 0.5); }
    else { // miss: prey flees a little; predator idles briefly (v38 (f): a dog missed by a wolf runs too)
      if (prey.species === "grazer" || a.species === "wolves") flee(sim, prey, a.species === "wolves" ? a : { name: Animal.name(a) });
      idle(sim, a, 0.4);
    }
  }

  function markChaseFright(sim, a, p, pack) {
    if (!p.fright || sim.tick >= (p.fright.until || 0)) {
      p.fright = { v: 15, until: sim.tick + 720 };
      const near = sim.agents.filter(q => q !== p && Math.hypot(q.pos.x - p.pos.x, q.pos.y - p.pos.y) < 4);
      if (!near.length && p.rel) {
        let best = null, bl = -1;
        for (const q of sim.agents) { if (q === p) continue; const e = p.rel[q.id]; if (e && e.l > bl) { bl = e.l; best = q; } }
        if (best && p.rel[best.id]) p.rel[best.id].l = Math.min(100, (p.rel[best.id].l || 0) + 2);
      }
    }
    if (sim.tick - (pack.chaseLog || -1e9) >= 120) {
      pack.chaseLog = sim.tick;
      G.Sim.log(sim, Animal.name(a) + " chases " + p.name + " near the den", p);
    }
    if (G.WolfFight && G.WolfFight.confront(sim, p, a)) return true;   // v38 (f): ready enough → stands / strikes instead of running
    if (G.Moods) G.Moods.onWolfChase(sim, p, pack);
    return false;
  }
  function tryThreaten(sim, a, p) {
    const S = AC().wolves, T = S.threaten, pack = packOf(sim, a); if (!p || !pack) { idle(sim, a); return; }
    const inTerr = Math.hypot(p.pos.x - pack.den.x, p.pos.y - pack.den.y) <= S.territory;
    if (!inTerr) { idle(sim, a); return; }   // outside territory: ignore people
    const d = Math.hypot(p.pos.x - a.pos.x, p.pos.y - a.pos.y);
    const stood = markChaseFright(sim, a, p, pack);
    if (sim.animals.indexOf(a) < 0) return;   // v38 (f): the people standing their ground brought it down
    // v38 (f): an armed person standing her ground holds the wolf off - it does not press its own strike (it can still bite on the group's misses), backs off a while
    if (stood && d <= T.strikeTiles + 0.2 && G.WolfFight.armed(sim, p)) { idle(sim, a); if (a.act.type === "idle") { a.act.until = sim.tick + Math.max(1, Math.round(CF().wolfFight.heldOffMinutes / TM())); a.act.goal = "heldOff"; } return; }
    if (d > T.strikeTiles + 0.2) {
      if (!walkTo(sim, a, Math.round(p.pos.x), Math.round(p.pos.y), "threaten", { target: p.id })) idle(sim, a);
      return;
    }
    // close and person stays inside: damage / rare kill
    p.needs.energy = r9(Math.max(0, p.needs.energy - T.damageEnergy));
    if (sim.arng.chance(T.killChance)) {
      const body = G.Sim.die(sim, p, "wolves");
      G.Sim.log(sim, Animal.name(a) + " brings down " + p.name);
      if (G.WolfFear) G.WolfFear.onKill(sim, p, body);   // §40: only awake people close by saw it
    } else {
      if (G.WolfFear) G.WolfFear.onAttack(sim, p);   // §40: she knows; close watchers saw it
      if (G.Injury) G.Injury.fromWolf(sim, p);       // §40: maybe a bite / gash / broken part
    }
    if (sim.agents.indexOf(p) >= 0 && sim.tick - (pack.chaseLog || -1e9) >= 0) {
      // driven-back is secondary to the chase log above; only add if chaseLog was just set this tick or older gap
      if (pack.chaseLog !== sim.tick) { pack.chaseLog = sim.tick; G.Sim.log(sim, p.name + " is driven back by Wolves", p); }
    }
    a.act = { type: "idle", until: sim.tick + Math.round(sim.arng.range(S.idleMin, S.idleMax) * 0.4), goal: "threaten", target: p.id };
  }

  function packOf(sim, a) { return (sim.packs || []).find(p => p.id === a.pack) || null; }
  function packCenter(sim, pack) {
    const ms = sim.animals.filter(o => o.pack === pack.id);
    if (!ms.length) return { x: pack.den.x, y: pack.den.y };
    let sx = 0, sy = 0; for (const m of ms) { sx += m.pos.x; sy += m.pos.y; }
    return { x: sx / ms.length, y: sy / ms.length };
  }

  // ---- deer (grazer): graze meadow when hungry, otherwise drift around their herd's home spot ----
  function grazerDecide(sim, a) {
    const S = AC().grazer, t = tileOf(a), w = sim.world;
    if (a.needs.fullness < S.fullness.grazeBelow) {
      if (grass(sim, t.x, t.y) && whole(a)) { a.act = { type: "graze", t: 0, from: a.needs.fullness }; return; }
      for (let r = 1; r <= 8; r++) for (let y = t.y - r; y <= t.y + r; y++) for (let x = t.x - r; x <= t.x + r; x++)
        if (Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) === r && grass(sim, x, y) && free(sim, a, x, y) && walkTo(sim, a, x, y, "meadow")) return;
    }
    const h = sim.herds[a.herd] || { x: t.x, y: t.y }, R = S.herdRadius;
    for (let k = 0; k < 16; k++) { const x = h.x + sim.arng.int(-R, R), y = h.y + sim.arng.int(-R, R);
      if ((k < 10 && !isMeadow(w, x, y)) || (x === t.x && y === t.y) || !free(sim, a, x, y) || personDist(sim, x, y) < S.fleeTo || wolfDist(sim, x, y) <= FWW() + 1) continue;
      if (walkTo(sim, a, x, y, "wander")) return; }
    idle(sim, a);
  }
  function graze(sim, a) {
    const S = AC().grazer, act = a.act, n = S.fullness.grazeMinutes * (S.grazeSeason ? S.grazeSeason[G.Climate.seasonIndex(sim.tick)] : 1) / TM(); act.t++;
    a.needs.fullness = r9(Math.min(100, act.from + (100 - act.from) * act.t / n));
    if (act.t >= n) { a.needs.fullness = 100; a.stats.meals++; idle(sim, a); }
  }
  Animal.greenness = function (sim, x, y, r) { let g = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (grass(sim, x + dx, y + dy)) g += (100 - G.Climate.groundDryness(sim.world, x + dx, y + dy, sim.tick)) / 100;
    return Math.round(g * 100) / 100; };
  function driftHerds(sim) {
    const D = AC().grazer.drift, w = sim.world;
    sim.herds.forEach(h => { if (sim.tick < h.next) return; h.next = sim.tick + D.everyMinutes;
      let best = null, n = 0;
      for (let k = 0; k < 20 && n < (D.choices || 1); k++) { const ang = sim.arng.float() * Math.PI * 2, d = sim.arng.range(D.min, D.max), x = Math.round(h.x + Math.cos(ang) * d), y = Math.round(h.y + Math.sin(ang) * d);
        if (isMeadow(w, x, y) && personDist(sim, x, y) >= AC().grazer.fleeTo + 2) { n++; const g = Animal.greenness(sim, x, y, D.greenRadius || 0); if (!best || g > best.g) best = { x, y, g }; } }
      if (best) { h.x = best.x; h.y = best.y; } });
  }

  // Find nearest flesh body within tiles, preferring closer; skip if person too close.
  function nearestCorpse(sim, a, tiles, fleeW) {
    let best = null; const fw = a.species === "wolves" ? 0 : FWW();
    for (const b of sim.bodies) { if (b.flesh <= 0) continue; const d = Math.hypot(b.x - a.pos.x, b.y - a.pos.y);
      if (d <= tiles && personDist(sim, b.x, b.y) >= fleeW && (!fw || wolfDist(sim, b.x, b.y) > fw + 1) && (!best || d < best.d)) best = { b, d }; }
    return best;
  }
  function goFeed(sim, a, best) {
    const b = best.b, t = tileOf(a);
    if (best.d < 1.5 && whole(a)) { a.act = { type: "feed", body: b.id }; return true; }
    const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => [b.x + dx, b.y + dy]).filter(([x, y]) => free(sim, a, x, y))
      .sort((p, q) => Math.hypot(p[0] - t.x, p[1] - t.y) - Math.hypot(q[0] - t.x, q[1] - t.y));
    for (const [x, y] of spots) if (walkTo(sim, a, x, y, "body", { body: b.id })) return true;
    return false;
  }
  function stalkDeer(sim, a, H) {
    // §40 / v37: THE wolf rain knob (animals.wolves.rainHuntX): in rain a wolf only starts a hunt with that chance (rolled on sim.arng only while it rains here)
    if (a.species === "wolves" && G.Powers && G.Powers.rainStrAt && !(a.act && a.act.goal === "hunt")) { const rs = G.Powers.rainStrAt(sim, Math.round(a.pos.x), Math.round(a.pos.y)), X = AC().wolves.rainHuntX;
      if (rs && X && X[rs] != null && X[rs] < 1 && !sim.arng.chance(X[rs])) { const ws = sim.wolfRain = sim.wolfRain || { rests: 0, hunts: 0 }; ws.rests++; return false; } }
    if (a.species === "wolves") { const ws = sim.wolfRain = sim.wolfRain || { rests: 0, hunts: 0 }; ws.tries = (ws.tries || 0) + 1; }
    let best = null; const fw = a.species === "wolves" ? 0 : FWW();
    for (const q of sim.animals) if (q.species === "grazer") { const d = Math.hypot(q.pos.x - a.pos.x, q.pos.y - a.pos.y);
      if (d <= H.stalkTiles && (!fw || wolfDist(sim, q.pos.x, q.pos.y) > fw + 1) && (!best || d < best.d)) best = { q, d }; }
    const HD = a.species === "wolves" && AC().wolves.huntDog;   // v38 (f): deer first; a dog when no deer is in reach or a dog is close
    if (HD) { let dog = null;
      for (const q of sim.animals) if (q.species === "scavenger") { const d = d0(a, q); if (d <= HD.stalkTiles && (!dog || d < dog.d)) dog = { q, d }; }
      if (dog && (!best || (dog.d <= HD.closeTiles && dog.d < best.d))) best = dog; }
    if (!best) return false;
    if (best.d <= H.strikeTiles + 0.2 && whole(a)) { tryKill(sim, a, best.q); return true; }
    return walkTo(sim, a, Math.round(best.q.pos.x), Math.round(best.q.pos.y), "hunt", { prey: best.q.id });
  }

  // ---- wild dog (scavenger): prefer corpses ≤ corpsePreferTiles; hunt live deer if fullness < huntDeer.fullnessBelow and no nearby corpse; flee people; never hunt people ----
  function scavDecide(sim, a) {
    const S = AC().scavenger, t = tileOf(a), H = S.huntDeer;
    const corpse = nearestCorpse(sim, a, S.corpsePreferTiles || S.noticeTiles, S.fleeWithin);
    if (a.needs.fullness < S.fullness.feedBelow) {
      if (corpse && goFeed(sim, a, corpse)) return;
      // no preferred corpse: look a bit farther for any body
      if (!corpse) {
        const far = nearestCorpse(sim, a, S.noticeTiles, S.fleeWithin);
        if (far && goFeed(sim, a, far)) return;
      }
      // hunt live deer when hungry enough and no nearby corpse
      if (H && a.needs.fullness < H.fullnessBelow && !corpse && stalkDeer(sim, a, H)) return;
    }
    const R = S.wanderRadius;
    for (let k = 0; k < 12; k++) { const x = t.x + sim.arng.int(-R, R), y = t.y + sim.arng.int(-R, R);
      if ((x === t.x && y === t.y) || !free(sim, a, x, y) || personDist(sim, x, y) < S.fleeTo || wolfDist(sim, x, y) <= FWW() + 1) continue;
      if (walkTo(sim, a, x, y, "wander")) return; }
    idle(sim, a);
  }
  function feed(sim, a) {
    const Sp = AC()[a.species] || AC().scavenger, F = Sp.fullness, b = sim.bodies.find(q => q.id === a.act.body);
    if (!b || b.flesh <= 0 || a.needs.fullness >= 100) { if (b && a.needs.fullness >= 100) a.stats.meals++; idle(sim, a); return; }
    if (!b.scavenged) { b.scavenged = true; G.Sim.log(sim, (a.species === "wolves" ? Animal.name(a) : "A " + LABEL(a.species)) + " feeds on " + b.name + "'s body", b); }
    const add = Math.min(100 - a.needs.fullness, F.fillPerMinute * TM());
    a.needs.fullness = r9(a.needs.fullness + add); b.eaten = r9((b.eaten || 0) + add * F.fleshPerFullness); b.flesh = r9(Math.max(0, b.flesh - add * F.fleshPerFullness));
  }

  // ---- Wolves: one pack, den + territory; hunt deer; threaten people only inside territory ----
  function wolfDecide(sim, a) {
    const S = AC().wolves, pack = packOf(sim, a), t = tileOf(a);
    if (!pack) { // orphan: roam like a scavenger without hunting people
      if (a.needs.fullness < S.fullness.feedBelow) {
        const c = nearestCorpse(sim, a, 10, 0); if (c && goFeed(sim, a, c)) return;
        if (stalkDeer(sim, a, S.huntDeer)) return;
      }
      idle(sim, a); return;
    }
    // person inside territory → threaten / chase (never hunt people outside)
    const thr = S.threaten;
    let intruder = null;
    for (const p of sim.agents) {
      const dDen = Math.hypot(p.pos.x - pack.den.x, p.pos.y - pack.den.y);
      if (dDen <= S.territory) { const d = Math.hypot(p.pos.x - a.pos.x, p.pos.y - a.pos.y); if (d <= thr.chaseTiles && (!intruder || d < intruder.d)) intruder = { p, d }; }
    }
    if (intruder) {
      if (intruder.d <= thr.strikeTiles + 0.2 && whole(a)) { tryThreaten(sim, a, intruder.p); return; }
      const tx = Math.round(intruder.p.pos.x), ty = Math.round(intruder.p.pos.y);
      if (walkTo(sim, a, tx, ty, "threaten", { target: intruder.p.id })) return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]])
        if (free(sim, a, tx + dx, ty + dy) && walkTo(sim, a, tx + dx, ty + dy, "threaten", { target: intruder.p.id })) return;
      // still commit: stand and re-check next tick (do not fall through to pack roam)
      a.act = { type: "idle", until: sim.tick, goal: "threaten", target: intruder.p.id };
      tryThreaten(sim, a, intruder.p); return;
    }
    // v38 (f): wolves gorge on any carcass in reach (the pack shares a kill) before they need to hunt; hunt only below feedBelow
    if (a.needs.fullness < S.fullness.carrionBelow) {
      const c = nearestCorpse(sim, a, S.corpseTiles, 0); if (c && goFeed(sim, a, c)) return; }
    if (a.needs.fullness < S.fullness.feedBelow && stalkDeer(sim, a, S.huntDeer)) return;
    // pack cohesion: stay within packRadius of center; otherwise wander near den
    const ctr = packCenter(sim, pack), R = S.packRadius, WR = S.wanderRadius;
    if (Math.hypot(a.pos.x - ctr.x, a.pos.y - ctr.y) > R) {
      const x = Math.round(ctr.x + sim.arng.int(-2, 2)), y = Math.round(ctr.y + sim.arng.int(-2, 2));
      if (free(sim, a, x, y) && walkTo(sim, a, x, y, "pack")) return;
    }
    for (let k = 0; k < 10; k++) {
      const x = Math.round(pack.den.x + sim.arng.int(-WR - 2, WR + 2)), y = Math.round(pack.den.y + sim.arng.int(-WR - 2, WR + 2));
      if ((x === t.x && y === t.y) || !free(sim, a, x, y)) continue;
      if (walkTo(sim, a, x, y, "den")) return;
    }
    idle(sim, a);
  }

  function decide(sim, a) {
    if (a.species === "grazer") return grazerDecide(sim, a);
    if (a.species === "wolves") return wolfDecide(sim, a);
    return scavDecide(sim, a);
  }

  Animal.step = function (sim, a) {
    const S = AC()[a.species], n = a.needs;
    n.fullness = r9(Math.max(0, n.fullness - Animal.fullnessDrainPerTick(a)));
    // Wolves do not flee people (fleeWithin 0); wild dogs and deer do
    if (S.fleeWithin > 0) {
      const np = Animal.nearestPerson(sim, a.pos.x, a.pos.y);
      if (np.p && np.d < S.fleeWithin && a.act.goal !== "flee") flee(sim, a, np.p);
    }
    // v38 (f): deer and wild dogs run from any wolf within fleeWolfWithin, before it strikes (same flee move as from people)
    if (a.species !== "wolves" && FWW() > 0 && a.act.goal !== "flee" && a.act.goal !== "fleeFire") {
      const nw = Animal.nearestWolf(sim, a.pos.x, a.pos.y);
      if (nw.w && nw.d <= FWW()) { const st = sim.wolfFlee = sim.wolfFlee || {}; st[a.species] = (st[a.species] || 0) + 1; flee(sim, a, nw.w); }
    }
    if (a.act.goal !== "fleeFire" && G.Fire.burning(sim) && G.Fire.nearestFlame(sim, a.pos.x, a.pos.y) < CF().fire.fleeTiles) {
      const t = tileOf(a), b = G.Fire.awayTile(sim, t.x, t.y, (x, y) => free(sim, a, x, y)); if (b && walkTo(sim, a, b.x, b.y, "fleeFire")) { a.stats.fireFlees = (a.stats.fireFlees || 0) + 1;
        if (sim.tick - (sim.animalFireLog == null ? -1e9 : sim.animalFireLog) >= 120) { sim.animalFireLog = sim.tick;
          G.Sim.log(sim, (a.species === "grazer" ? "Deer" : a.species === "wolves" ? "Wolves" : "A wild dog") + (a.species === "grazer" || a.species === "wolves" ? " run" : " runs") + " from the flames"); } } }
    // Wolves: interrupt pack/den roam if a person is inside territory
    if (a.species === "wolves" && a.act.goal !== "threaten" && a.act.goal !== "fleeFire") {
      const pack = packOf(sim, a), thr = S.threaten;
      if (pack && thr) {
        let inv = null;
        for (const p of sim.agents) {
          if (Math.hypot(p.pos.x - pack.den.x, p.pos.y - pack.den.y) <= S.territory) {
            const d = Math.hypot(p.pos.x - a.pos.x, p.pos.y - a.pos.y);
            if (d <= thr.chaseTiles && (!inv || d < inv.d)) inv = { p, d };
          }
        }
        if (inv) { wolfDecide(sim, a); }
      }
    }
    const act = a.act;
    if (act.type === "walk") {
      // mid-hunt / threaten: re-check strike each few ticks
      if ((act.goal === "hunt" || act.goal === "threaten") && sim.tick % 5 === 0) {
        if (act.goal === "hunt") { const prey = sim.animals.find(q => q.id === act.prey); if (prey && Math.hypot(prey.pos.x - a.pos.x, prey.pos.y - a.pos.y) <= ((S.huntDeer && S.huntDeer.strikeTiles) || 1.5) + 0.2) return tryKill(sim, a, prey); }
        if (act.goal === "threaten") { const p = sim.agents.find(q => q.id === act.target); if (p && Math.hypot(p.pos.x - a.pos.x, p.pos.y - a.pos.y) <= ((S.threaten && S.threaten.strikeTiles) || 1.5) + 0.2) return tryThreaten(sim, a, p); }
      }
      return move(sim, a);
    }
    if (act.type === "graze") return graze(sim, a);
    if (act.type === "feed") return feed(sim, a);
    const hungry = n.fullness < (a.species === "grazer" ? S.fullness.grazeBelow : S.fullness.feedBelow);
    // do not overwrite an active threaten engagement with pack/den roam
    if ((act.goal !== "threaten" && (sim.tick >= act.until || (hungry && sim.tick % 10 === 0))) || (act.goal === "threaten" && act.type === "idle" && sim.tick >= act.until)) decide(sim, a);   // v38 (f) fix: a wolf no longer freezes after a strike
    if (a.act.type === "walk") move(sim, a);
  };
  Animal.stepAll = function (sim) {
    driftHerds(sim);
    for (const a of sim.animals) { sim.prev[a.id] = { x: a.pos.x, y: a.pos.y }; Animal.step(sim, a); }
    births(sim);
  };
  function births(sim) {
    const Bi = AC().grazer.births; if (!Bi || G.Climate.seasonIndex(sim.tick) !== Bi.season) return;
    const rng = sim.brng || (sim.brng = new G.RNG((sim.seed ^ 0xCA1FB0B5) >>> 0));
    const p = Bi.perSeason / (CF().time.daysPerSeason * 1440 / TM()), gz = sim.animals.filter(a => a.species === "grazer");
    for (const a of gz) {
      if (!rng.chance(p)) continue;
      if (sim.animals.length >= CF().pop.maxAnimals || sim.animals.filter(o => o.species === "grazer").length >= Bi.cap) continue;
      if (!gz.some(o => o !== a && sim.animals.indexOf(o) >= 0 && Math.hypot(o.pos.x - a.pos.x, o.pos.y - a.pos.y) <= Bi.mateTiles)) continue;
      const x0 = Math.round(a.pos.x), y0 = Math.round(a.pos.y), spot = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
        .map(([dx, dy]) => [x0 + dx, y0 + dy]).find(([x, y]) => W.inb(sim.world, x, y) && W.walkable(sim.world, x, y) && !Animal.occupied(sim, null, x, y) && !G.Agent.claimed(sim, null, x, y));
      if (!spot) continue;
      const c = Animal.create(sim, "grazer", spot[0], spot[1], a.herd, rng); sim.animals.push(c); sim.prev[c.id] = { x: c.pos.x, y: c.pos.y };
      sim.grazerBirths = (sim.grazerBirths || 0) + 1;
      G.Sim.log(sim, "A deer calf is born");
    }
  }

  // Prefer hill tiles or woods-edge for the den (≥ denMinFromSpawn from founders).
  function pickDen(sim, Wf, minAway) {
    const w = sim.world, T = G.data.T, land = [];
    const isWoodsEdge = (x, y) => {
      if (W.tile(w, x, y) === T.WOODS) return false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (W.inb(w, x + dx, y + dy) && W.tile(w, x + dx, y + dy) === T.WOODS) return true;
      return false;
    };
    for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) {
      if (!W.walkable(w, x, y) || personDist(sim, x, y) < minAway) continue;
      const hill = w.hills && w.hills[y * w.w + x] === "1";
      const score = (hill ? 3 : 0) + (isWoodsEdge(x, y) ? 2 : 0) + (W.mountainAt(w, x, y) ? 2 : 0);
      if (score > 0) land.push({ x, y, score });
    }
    if (!land.length) {
      for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++)
        if (W.walkable(w, x, y) && personDist(sim, x, y) >= minAway) land.push({ x, y, score: 1 });
    }
    land.sort((a, b) => b.score - a.score || a.x - b.x || a.y - b.y);
    const top = land.slice(0, Math.max(8, Math.min(40, land.length)));
    return top.length ? sim.arng.pick(top) : null;
  }

  Animal.populate = function (sim) {
    const w = sim.world, cap = CF().pop.maxAnimals, rng = sim.arng, Gz = AC().grazer, Sc = AC().scavenger, Wf = AC().wolves;
    const away = (x, y, d) => personDist(sim, x, y) >= d;
    sim.animals = sim.animals || []; sim.herds = sim.herds || []; sim.packs = sim.packs || [];
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
    // One Wolves pack (3–5), den on hill / woods edge ≥ denMinFromSpawn from founders
    if (Wf && sim.packs.length === 0 && sim.animals.length < cap) {
      const den = pickDen(sim, Wf, Wf.denMinFromSpawn || 15);
      if (den) {
        const n = rng.int(Wf.packSize[0], Wf.packSize[1]);
        const pack = { id: (sim.nextPackId = (sim.nextPackId || 1)), den: { x: den.x, y: den.y }, members: [] };
        sim.packs.push(pack);
        const spots = []; for (let r = 0; spots.length < n && r < 8; r++) for (let y = den.y - r; y <= den.y + r; y++) for (let x = den.x - r; x <= den.x + r; x++)
          if (Math.max(Math.abs(x - den.x), Math.abs(y - den.y)) === r && W.walkable(w, x, y) && !Animal.occupied(sim, null, x, y)) spots.push([x, y]);
        if (!spots.length) spots.push([den.x, den.y]);
        for (let i = 0; i < n && sim.animals.length < cap; i++) {
          const [x, y] = spots[i % spots.length];
          const wolf = Animal.create(sim, "wolves", x, y, null);
          wolf.pack = pack.id; pack.members.push(wolf.id); sim.animals.push(wolf);
        }
      }
    }
  };

  Body.create = function (sim, a, cause) {
    // §40 / v37: the wound type(s) a finder can see (cause + any open injuries), and a snapshot for Resurrect (dropped after its window)
    const wb = (BC().woundByCause || {})[cause], wounds = []; if (wb) wounds.push(wb); for (const i of (a.injuries || [])) if (wounds.indexOf(i.type) < 0) wounds.push(i.type);
    return { id: sim.nextId++, kind: "body", of: a.id, name: a.name, look: a.look || 0, x: Math.round(a.pos.x), y: Math.round(a.pos.y), diedAt: sim.tick, cause, age: Math.floor(a.age),
      stage: "fresh", stageAt: sim.tick, flesh: 100, eaten: 0, condition: 100, material: null, scavenged: false, wounds, soul: JSON.parse(JSON.stringify(a)) };
  };
  Body.stageWord = b => b.stage === "bones" ? "bones" : b.stage;
  Body.yearsMinutes = () => 1440 * G.Time.daysPerYear();
  Body.step = function (sim, b) {
    const B = BC(), tm = TM();
    if (G.Corpse && G.Corpse.skipDecay(b)) return;
    if (b.stage === "fresh" && sim.tick - b.stageAt >= B.freshMinutes) { b.stage = "rotting"; b.stageAt = sim.tick; G.Sim.log(sim, b.name + "'s body begins to rot", b); }
    if (b.stage === "rotting") {
      b.flesh = r9(Math.max(0, 100 * (1 - (sim.tick - b.stageAt) / B.rotMinutes) - (b.eaten || 0)));
      if (b.flesh <= 0) { b.stage = "bones"; b.stageAt = sim.tick; b.material = B.material; G.Sim.log(sim, "Only " + b.name + "'s bones remain", b); } }
    else if (b.stage === "bones") { b.condition = r9(Math.max(0, b.condition - 100 / (B.bonesWeatherYears * Body.yearsMinutes()) * tm));
      if (b.condition <= 0) { b.gone = true; G.Sim.log(sim, b.name + "'s bones have crumbled away", b); } }
  };
  Body.stepAll = function (sim) { for (const b of sim.bodies) Body.step(sim, b); if (sim.bodies.some(b => b.gone)) sim.bodies = sim.bodies.filter(b => !b.gone); };

  G.Animal = Animal; G.Body = Body;
})(this.GS = this.GS || {});
