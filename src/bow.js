// v39 bow + arrows (specs/reed_fiber_DRAFT.md §5). A cord bound on a whole stick that springs back (flex >= bow.minFlex) is a bow;
// a whole stick cut with a keen edge gives arrows. Arrows ride on the bow (it.arrows, max quiverMax); a strung bow with arrows shoots
// a deer at <= shootTiles (before it bolts at fleeWithin). Hits: body.arrows come back on the first cut of meat (recoverHit);
// misses land 1-3 tiles past and are seen fall (recoverMiss). Each shot may snap the cord (snapChance): the bow goes unstrung.
(function (G) {
  const CF = () => G.data.config, BC = () => CF().bow, FC = () => CF().fiber, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, x, y) => Math.hypot(a.pos.x - x, a.pos.y - y);
  const Bow = {};
  const rng = sim => sim.fgrng || (sim.fgrng = new G.RNG((sim.seed ^ 0xF16A7105) >>> 0));
  Bow.rng = rng;
  const st = sim => G.Fiber.stats(sim);

  Bow.isBow = it => !!it && it.tool === "bow";
  Bow.ready = it => Bow.isBow(it) && !!it.strung && (it.arrows || []).length > 0;
  Bow.isArrow = it => !!it && it.material === "stick" && it.form === "arrow" && !it.heldBy && !it.lit;
  // a stick that might take a cord (she does not know its flex until she bends it)
  Bow.stringable = it => !!it && it.material === "stick" && it.form === "whole" && !it.lit && !it.wornBy && (!it.tool || (it.tool === "bow" && !it.strung)) && !it.noBow;
  if (G.Tools) {
    G.Tools.labels.bow = "bow";
    const lab0 = G.Tools.labelOf;
    G.Tools.labelOf = it => Bow.isBow(it) && !it.strung ? "unstrung bow" : lab0(it);
  }

  // Tools.finishTip on an arrow: the v34 tip rule (no tool lock) -> tipped arrow (+hunt.odds.tip when shot)
  Bow.tipArrow = function (sim, a, shaft, point, how) {
    shaft.tip = point.material;
    shaft.props.hardness = Math.round(Math.max(shaft.props.hardness || 25, point.props.hardness || 80));
    shaft.props.sharpness = Math.max(shaft.props.sharpness || 0, point.props.sharpness || 0, 40);
    if (point.heldBy) { const h = sim.agents.find(q => q.id === point.heldBy); if (h) { h.carry = null; h.carryUntil = null; } }
    const pi = sim.items.indexOf(point); if (pi >= 0) sim.items.splice(pi, 1);
    st(sim).tippedArrows = (st(sim).tippedArrows || 0) + 1;
    if (a) {
      G.Sim.log(sim, a.name + " strikes a hard tip onto the arrow", a);
      G.Fiber.disc(sim, a, "craft", ["arrow", point.material], how || "tip on arrow", "First tipped arrow");
      const e = G.Learn.add(a, "strike", G.Tools.craftGain ? G.Tools.craftGain("strike") : 10); e.n = (e.n || 0) + 1; G.Learn.success(sim, a, "strike");
    }
    return shaft;
  };

  // ---------- string a bow ----------
  const takeOut = (sim, it) => { if (it.heldBy) { const h = sim.agents.find(q => q.id === it.heldBy); if (h) { h.carry = null; h.carryUntil = null; } } const i = sim.items.indexOf(it); if (i >= 0) sim.items.splice(i, 1); };
  const putInHand = (sim, a, it) => { if (it.heldBy === a.id) return; if (a.carry != null) G.Items.drop(sim, a); it.heldBy = a.id; it.x = Math.round(a.pos.x); it.y = Math.round(a.pos.y);
    a.carry = it.id; a.carryUntil = sim.tick + sim.orng.int(CF().objects.carry[0], CF().objects.carry[1]); };
  Bow.canTryString = a => G.Learn.score(a, "bind") >= BC().bindMin - 1e-9 && G.Learn.score(a, "twist") >= BC().twistMin - 1e-9;
  Bow.startString = function (sim, a, stick, cord) {
    const mins = CF().tools && CF().tools.bindMinutes != null ? CF().tools.bindMinutes : 15;
    a.act = { type: "bowString", stick: stick.id, cord: cord.id, t: 0, n: Math.max(1, Math.round(mins / TM())) };
    return true;
  };
  Bow.stepString = function (sim, a) {
    const act = a.act, stick = G.Items.byId(sim, act.stick), cord = G.Items.byId(sim, act.cord), R = CF().objects.tryReach + 0.5;
    const ok = it => it && (it.heldBy === a.id || (!it.heldBy && dist(a, it.x, it.y) <= R + 1e-9));
    if (!ok(stick) || !ok(cord) || !G.Fiber.isCord(cord) || !Bow.stringable(stick)) return false;
    if (++act.t < act.n) return true;
    const B = BC();
    if ((stick.props.flex || 0) < B.minFlex) {   // it does not spring back: nothing comes of it (she learns this stick will not do)
      stick.noBow = true; st(sim).bowFails = (st(sim).bowFails || 0) + 1; G.Learn.add(a, "bind", 1); return false; }
    const re = stick.tool === "bow";
    takeOut(sim, cord); stick.tool = "bow"; stick.strung = true; stick.arrows = stick.arrows || []; stick.craftedAt = sim.tick; stick.craftedBy = a.id;
    if (!stick.props.durability) stick.props.durability = 100;
    putInHand(sim, a, stick);
    const S = st(sim); if (re) S.restrings = (S.restrings || 0) + 1; else S.bows = (S.bows || 0) + 1;
    G.Sim.log(sim, a.name + " " + (re ? FC().lines.restring : FC().lines.bow), a);
    if (!re) G.Fiber.disc(sim, a, "craft", ["cord", "stick"], "bow", "First bow");
    const e = G.Learn.add(a, "bow", B.killGain / 2); e.n++; G.Learn.add(a, "bind", 2); G.Learn.success(sim, a, "bow");
    return false;
  };

  // load arrows within loadTiles onto a strung bow (no roll: she picks them up as she passes)
  Bow.load = function (sim, a, bow) {
    const B = BC(); let n = 0; bow.arrows = bow.arrows || [];
    for (const it of sim.items.slice()) {
      if (bow.arrows.length >= B.quiverMax) break;
      if (!Bow.isArrow(it) || dist(a, it.x, it.y) > B.loadTiles + 1e-9) continue;
      bow.arrows.push({ id: it.id, tip: it.tip || null, hard: it.props.hardness || 25, sharp: it.props.sharpness || 30, flex: it.props.flex || 50 });
      takeOut(sim, it); n++;
    }
    if (n) st(sim).loaded = (st(sim).loaded || 0) + n;
    return n;
  };
  Bow.arrowItem = function (sim, ar, x, y) {
    const it = G.Items.create(sim, "stick", x, y, "arrow", Object.assign(G.Items.jitterProps("stick", rng(sim)), { hardness: ar.hard, sharpness: ar.sharp, flex: ar.flex }));
    if (ar.tip) it.tip = ar.tip; sim.items.push(it); return it;
  };

  const wholeStick = i => i.material === "stick" && i.form === "whole" && !i.tool && !i.lit;
  const edgeNear = (sim, a) => G.Fiber.near(sim, a, BC().seekStickTiles, i => (i.props.sharpness || 0) >= BC().arrowEdge && !i.lit && !Bow.isBow(i) && !Bow.isArrow(i));
  Bow.maybe = function (sim, a) {
    if (G.Family && G.Family.isChild(a)) return false;
    const B = BC(), F = FC(), every = Math.max(1, Math.round(F.tryEveryMinutes / TM()));
    const held = G.Items.held(sim, a), R = CF().objects.tryReach;
    if (Bow.isBow(held) && held.strung) {
      if ((held.arrows || []).length < B.quiverMax) {
        if (Bow.load(sim, a, held)) return false;
        if (a.bowTryAt != null && sim.tick - a.bowTryAt < every) return false; a.bowTryAt = sim.tick;
        const seen = G.Fiber.near(sim, a, B.gatherTiles, it => Bow.isArrow(it) && (it.seenBy === a.id || it.madeBy === a.id)) || (B.arrowChance ? G.Fiber.near(sim, a, B.seekStickTiles, it => Bow.isArrow(it) && it.madeBy === a.id) : null);   // v39 tune: arrows she cut herself she remembers out to bow.seekStickTiles
        if (seen && G.Agent.walkTo(sim, a, seen.x, seen.y, "arrows", { target: seen.id })) return true;
        // v39 tune: an empty bow and an edge + a whole stick in sight: she may put the bow down to cut arrows (bow.arrowChance; one hand holds one thing)
        if (!seen && !(held.arrows || []).length && B.arrowChance && G.Fiber.knows(a, "bow") && edgeNear(sim, a) && G.Fiber.near(sim, a, B.seekStickTiles, wholeStick) && rng(sim).chance(B.arrowChance)) { G.Items.drop(sim, a); return true; }
      }
      return false;
    }
    if (a.bowTryAt != null && sim.tick - a.bowTryAt < every) return false;
    if (B.arrowChance && G.Fiber.knows(a, "bow")) {   // v39 tune: the arrow errand (bow.arrowChance): fetch an edge for her empty bow; once arrows lie cut, put the edge down to take up the bow again
      const mine = sim.items.find(i => Bow.isBow(i) && i.strung && !i.heldBy && i.craftedBy === a.id && !(i.arrows || []).length && dist(a, i.x, i.y) <= B.seekStickTiles + 1e-9);
      const cut = G.Fiber.near(sim, a, B.seekStickTiles, it => Bow.isArrow(it) && it.madeBy === a.id);
      if (mine && !held && !cut) { const e = edgeNear(sim, a); if (e && G.Fiber.near(sim, a, B.seekStickTiles, wholeStick)) { a.bowTryAt = sim.tick;
        if (rng(sim).chance(B.arrowChance) && G.Agent.walkTo(sim, a, e.x, e.y, "pickup", { target: e.id })) return true; return false; } }
      if (mine && held && !Bow.isBow(held) && cut && rng(sim).chance(B.arrowChance)) { a.bowTryAt = sim.tick; G.Items.drop(sim, a); return true; }
    }
    if (!held && G.Learn.has(a, "bow")) {   // hands free and she knows the bow: go back for one she can see
      const bw = G.Fiber.near(sim, a, B.gatherTiles, Bow.isBow) || (B.arrowChance ? G.Fiber.near(sim, a, B.seekStickTiles, i => Bow.isBow(i) && i.craftedBy === a.id) : null);   // v39 tune: her own bow out to bow.seekStickTiles
      if (bw) { a.bowTryAt = sim.tick; if (rng(sim).chance(F.tryChance) && G.Agent.walkTo(sim, a, bw.x, bw.y, "pickup", { target: bw.id })) return true; return false; }
    }
    const cur = (a.traits && a.traits.curiosity != null ? a.traits.curiosity : 50) / 50;
    // a cord in hand and a stick in reach (or the other way round), or an unstrung bow and a cord
    let stick = null, cord = null;
    if (held && G.Fiber.isCord(held)) { cord = held; stick = G.Fiber.near(sim, a, R, Bow.stringable); }
    else if (held && Bow.stringable(held) && (Bow.isBow(held) || G.Learn.has(a, "bow") || G.Learn.has(a, "twist"))) { stick = held; cord = G.Fiber.near(sim, a, R, G.Fiber.isCord); }
    if (!held && B.seekStickTiles && G.Learn.has(a, "twist") && Bow.canTryString(a)) {   // v39 tune: hands free, she twisted cord before: pick up a lying cord she can see if a whole stick is in sight too
      const lc = G.Fiber.near(sim, a, B.seekStickTiles, G.Fiber.isCord);
      if (lc && G.Fiber.near(sim, a, B.seekStickTiles, Bow.stringable) && !sim.agents.some(b => b !== a && b.act.goal === "pickup" && b.act.target === lc.id)) { a.bowTryAt = sim.tick;
        if (rng(sim).chance(clamp(F.tryChance * cur, 0, 1)) && G.Agent.walkTo(sim, a, lc.x, lc.y, "pickup", { target: lc.id })) return true; return false; }
    }
    if (cord && !stick && B.seekStickTiles && Bow.canTryString(a)) {   // v39 tune: a cord in hand and no stick in reach: she may go to a whole stick she can see (bow.seekStickTiles)
      const far = G.Fiber.near(sim, a, B.seekStickTiles, Bow.stringable); a.bowTryAt = sim.tick;
      if (far && rng(sim).chance(clamp(F.tryChance * cur, 0, 1)) && G.Agent.walkTo(sim, a, far.x, far.y, "string", { target: far.id })) return true;
      return false;
    }
    if (stick && cord) {
      a.bowTryAt = sim.tick;
      if (!Bow.canTryString(a)) return false;
      if (!rng(sim).chance(clamp(F.tryChance * cur, 0, 1))) return false;
      return Bow.startString(sim, a, stick, cord);
    }
    // a keen edge in hand, a whole stick in reach and she knows the bow: cut arrows (the v39 try act "cut", fx arrows)
    if (held && (held.props.sharpness || 0) >= B.arrowEdge && G.Learn.has(a, "bow") && G.Fiber.knows(a, "bow")) {
      const own = sim.items.some(i => Bow.isBow(i) && (i.heldBy === a.id || i.craftedBy === a.id));
      if (!own) return false;
      const t = G.Fiber.near(sim, a, R, i => i.material === "stick" && i.form === "whole" && !i.tool && !i.lit);
      if (!t && B.arrowChance) { const f = G.Fiber.near(sim, a, B.seekStickTiles, wholeStick); a.bowTryAt = sim.tick;   // v39 tune: walk to a whole stick in sight (then the next try cuts it)
        if (f && rng(sim).chance(B.arrowChance) && G.Agent.walkTo(sim, a, f.x, f.y, "wander")) return true; return false; }
      if (!t) return false; a.bowTryAt = sim.tick;
      if (!rng(sim).chance(clamp(F.tryChance * cur, 0, 1))) return false;
      G.Items.startTry(sim, a, t, "cut"); a.act.fx = "arrows"; return true;
    }
    return false;
  };
  Bow.arriveArrows = function (sim, a) { const b = G.Items.held(sim, a); if (Bow.isBow(b) && b.strung) Bow.load(sim, a, b); G.Agent.startIdle(sim, a, 0.2); };

  // ---------- shooting ----------
  Bow.hit = function (sim, a, ar, d) {
    const B = BC(), O = CF().hunt.odds;
    let p = O.base + B.oddsAdd + (G.Hunt.learned(a) ? O.learned : 0) + (ar && ar.tip ? O.tip : 0);
    if (d > CF().hunt.strikeTiles + 1e-9) p *= B.farX;
    if (G.Powers && G.Powers.rainStrAt && G.Powers.rainStrAt(sim, Math.round(a.pos.x), Math.round(a.pos.y)) === "heavy") p *= B.rainX;
    p *= (0.5 + G.Learn.score(a, "bow") / 100);
    if (G.Injury && a.injuries && a.injuries.length) p *= G.Injury.toolX(a);
    return clamp(p, 0, 1);
  };
  // one arrow off the bow (and the cord may snap); a miss lands 1-3 tiles past along the line, seen fall with recoverMiss
  // render-only record of a shot (G.Bow.flights: never saved, no RNG; the renderer animates it over render.arrowFlySec)
  Bow.flights = [];
  Bow.flight = function (sim, a, tx, ty, hit) { Bow.flights.push({ x0: a.pos.x, y0: a.pos.y, x1: tx, y1: ty, t: sim.tick, hit: !!hit }); if (Bow.flights.length > 16) Bow.flights.shift(); };
  Bow.spend = function (sim, a, bow) {
    const ar = bow.arrows.pop(); a.shotAt = sim.tick; const S = st(sim); S.shots = (S.shots || 0) + 1;
    if (rng(sim).chance(BC().snapChance)) { bow.strung = false; S.snaps = (S.snaps || 0) + 1; G.Sim.log(sim, a.name + "'s bow: " + FC().lines.snap, a); }
    return ar;
  };
  Bow.dropMiss = function (sim, a, ar, tx, ty) {
    const B = BC(), d = Math.hypot(tx - a.pos.x, ty - a.pos.y) || 1, k = rng(sim).int(B.missPast[0], B.missPast[1]), ux = (tx - a.pos.x) / d, uy = (ty - a.pos.y) / d;
    let x = Math.round(tx + ux * k), y = Math.round(ty + uy * k);
    if (!G.World.inb(sim.world, x, y) || !G.World.walkable(sim.world, x, y)) { x = Math.round(tx); y = Math.round(ty); }
    const it = Bow.arrowItem(sim, ar, x, y); it.missed = true; if (rng(sim).chance(B.recoverMiss)) it.seenBy = a.id;
    st(sim).missed = (st(sim).missed || 0) + 1; return it;
  };
  Bow.loose = function (sim, a, bow, tx, ty, d, p) {
    const hit = rng(sim).chance(p), ar = Bow.spend(sim, a, bow);
    Bow.flight(sim, a, tx, ty, hit);
    if (hit) st(sim).hits = (st(sim).hits || 0) + 1; else Bow.dropMiss(sim, a, ar, tx, ty);
    return { hit, arrow: ar };
  };
  Bow.cool = (sim, a) => a.shotAt == null || sim.tick - a.shotAt >= Math.max(1, Math.round(BC().cooldownMinutes / TM()));
  Bow.shootDeer = function (sim, a, g, bow) {
    const d = dist(a, g.pos.x, g.pos.y), ar = bow.arrows[bow.arrows.length - 1], p = Bow.hit(sim, a, ar, d);
    G.Sim.log(sim, a.name + " " + FC().lines.shoot.replace("{prey}", G.Animal.label(g.species).toLowerCase()), a);
    const r = Bow.loose(sim, a, bow, g.pos.x, g.pos.y, d, p), S = st(sim), H = CF().hunt;
    const hs = G.Hunt.stats ? G.Hunt.stats(sim) : null;
    if (r.hit) {
      S.bowKills = (S.bowKills || 0) + 1; if (hs) hs.kills++;
      sim.animals.splice(sim.animals.indexOf(g), 1); delete sim.prev[g.id];
      const b = G.Body.createAnimal(sim, g, a); b.arrows = [r.arrow]; sim.bodies.push(b);
      G.Sim.log(sim, b.name + " falls with an arrow in it", a);
      const e = G.Learn.add(a, "hunt", H.gain); e.n++; a.stats.kills = (a.stats.kills || 0) + 1;
      const eb = G.Learn.add(a, "bow", BC().killGain); eb.n++;
      if (G.Skills) G.Skills.gain(sim, a, "ranged", "deerKill");
      G.Fiber.disc(sim, a, "strike", ["arrow", "grazer"], "shot from a bow", "First bow kill");
      G.Learn.success(sim, a, "hunt"); G.Learn.success(sim, a, "bow");
      for (const q of sim.agents) if (q !== a && q.act.type !== "sleep" && dist(q, b.x, b.y) <= ((CF().animals.wolf || {}).watchTiles || 8)) G.Learn.add(q, "hunt", H.watchGain || 0);
      if (G.Moods) G.Moods.onHuntKill(sim, a);
      if (!G.Hunt.goMeat(sim, a, b)) G.Agent.startIdle(sim, a, 0.3);
      return true;
    }
    if (hs) hs.misses = (hs.misses || 0) + 1;
    if (G.Skills) G.Skills.gain(sim, a, "ranged", "shotMiss");
    G.Sim.log(sim, a.name + "'s arrow misses " + G.Animal.name(g), a);
    if (!bow.arrows.length || !bow.strung) G.Agent.startIdle(sim, a, 0.3);
    else if (a.act.type === "walk") a.act.path = a.act.path.slice(0, a.act.i);   // stand and nock another
    return false;
  };
  if (G.Hunt) {
    const H = G.Hunt, w0 = H.weapon, ss0 = H.stepStalk, as0 = H.arriveStalk, am0 = H.arriveMeat;
    H.weapon = it => Bow.ready(it) || w0(it);
    // v39 tune (Judge): keep a loaded bow of her own in hand through other needs (bow.keepReady; sleep still puts it down), and when hunger
    // comes with empty hands, go back for her own loaded bow lying within bow.fetchHungryTiles (was: the bow was put down at every need and the hungry hand was empty)
    const k0 = H.keep, sf0 = H.seekFood;
    H.keep = (sim, a) => { if (k0(sim, a)) return true; const it = G.Items.held(sim, a); return !!(BC().keepReady && Bow.ready(it) && it.craftedBy === a.id); };
    H.seekFood = function (sim, a) {
      const n = BC().fetchHungryTiles;
      if (n && !G.Items.held(sim, a) && !(G.Family && G.Family.isChild(a))) {
        const bw = sim.items.find(i => Bow.ready(i) && !i.heldBy && i.craftedBy === a.id && dist(a, i.x, i.y) <= n + 1e-9);
        if (bw && G.Agent.walkTo(sim, a, bw.x, bw.y, "pickup", { target: bw.id })) return true;
      }
      return sf0.call(H, sim, a);
    };
    const shootable = (sim, a) => {
      const act = a.act, Hc = CF().hunt, g = sim.animals.find(q => q.id === act.prey), it = G.Items.held(sim, a);
      if (!g || !Bow.ready(it) || G.Agent.want(a) !== "food" || sim.tick - act.since > Hc.giveUpMinutes) return null;
      return dist(a, g.pos.x, g.pos.y) <= BC().shootTiles + 1e-9 ? { g, it } : null;
    };
    H.stepStalk = function (sim, a) {
      const s = shootable(sim, a);
      if (!s) return ss0.call(H, sim, a);
      if (Bow.cool(sim, a)) Bow.shootDeer(sim, a, s.g, s.it);
      else if (a.act.type === "walk") a.act.path = a.act.path.slice(0, a.act.i);
    };
    H.arriveStalk = function (sim, a) {
      const s = shootable(sim, a);
      if (!s) return as0.call(H, sim, a);
      if (Bow.cool(sim, a)) Bow.shootDeer(sim, a, s.g, s.it);
    };
    // first cut of meat from a body with arrows in it: each comes back (recoverHit) at the carcass, and the cutter's bow takes it
    H.arriveMeat = function (sim, a) {
      const b = sim.bodies.find(q => q.id === a.act.body);
      if (b && b.arrows && b.arrows.length && dist(a, b.x, b.y) <= 1.5) {
        const S = st(sim);
        for (const ar of b.arrows) { if (rng(sim).chance(BC().recoverHit)) { const it = Bow.arrowItem(sim, ar, b.x, b.y); it.seenBy = a.id; S.recovered = (S.recovered || 0) + 1; } else S.lost = (S.lost || 0) + 1; }
        b.arrows = [];
        const bw = sim.items.find(i => Bow.isBow(i) && i.strung && (i.heldBy === a.id));
        if (bw) Bow.load(sim, a, bw);
      }
      return am0.call(H, sim, a);
    };
  }

  G.Bow = Bow;
  if (G.V39) {
    G.V39.maybes.push(Bow.maybe);
    G.V39.acts.bowString = Bow.stepString;
    G.V39.arrives.arrows = Bow.arriveArrows;
    G.V39.arrives.string = (sim, a) => { const h = G.Items.held(sim, a), st = h && G.Fiber.isCord(h) ? G.Fiber.near(sim, a, CF().objects.tryReach, Bow.stringable) : null;   // v39 tune: arrived at the stick
      if (st && Bow.canTryString(a) && Bow.startString(sim, a, st, h)) return true; G.Agent.startIdle(sim, a, 0.5); return true; };
  }
})(window.GS = window.GS || {});
