// Step 26: corpse choices. Bodies already go fresh → rotting → bones; people no longer ignore them.
// Choices emerge from learning (curiosity vs corpseFear), never a scripted menu:
//   leave (default when corpseFear is high), drag (up to dragMaxTiles), bury (dig tool into soft ground → burial art),
//   burn (drag onto fire / lit stick / pyre → ash_bones), eat (flesh while fresh/rotting), ritual (faith ≥ ritualFaithMin + known form).
// First of each distinct choice per seed → Discoveries (data-detected). Rolls use the learning stream (lrng).
// Founders' corpseFear is seeded here (own stream crng, 40–70); babies inherit it like any other trait.
(function (G) {
  const CF = () => G.data.config, C = () => CF().corpse, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100, r9 = v => Math.round(v * 1e9) / 1e9;
  const Corpse = {};
  const stats = sim => sim.corpseStats || (sim.corpseStats = Corpse.newStats());
  Corpse.newStats = () => ({ seen: 0, leave: 0, drag: 0, bury: 0, burn: 0, eat: 0, ritual: 0, sick: 0, byKey: {} });
  Corpse.stats = stats;

  Corpse.init = function (sim) {
    sim.crng = new G.RNG((sim.seed ^ 0xC0B5E26F) >>> 0);
    sim.corpseStats = Corpse.newStats();
    const R = C().foundersFear;
    for (const a of sim.agents) Corpse.seedTrait(sim, a, R);
  };
  Corpse.seedTrait = (sim, a, R) => {
    const lo = (R && R[0]) != null ? R[0] : 40, hi = (R && R[1]) != null ? R[1] : 70;
    a.traits.corpseFear = sim.crng.int(lo, hi);
  };

  Corpse.soft = (sim, x, y) => {
    if (!G.World.walkable(sim.world, x, y)) return false;
    if (G.World.hillAt(sim.world, x, y)) return false;   // hills = rock clusters (no soft dig)
    const t = G.data.tiles[G.World.tile(sim.world, x, y)];
    return !!(t && !t.water);
  };
  Corpse.digTool = it => {
    if (!it || it.material === "meat" || it.lit) return false;
    const mats = C().digMaterials || ["rock", "bone", "stick", "flint"];
    // Director: bury with a sharp rock/bone/stick (Items.sharp: flint or a sharp shard); material must be a dig tool
    return mats.indexOf(it.material) >= 0 && G.Items.sharp(it);
  };
  Corpse.active = b => !!b && !b.gone && !b.burial;   // buried replaces the body for choices (mound/cairn stay)
  Corpse.hasFlesh = b => Corpse.active(b) && b.flesh > 0 && (b.stage === "fresh" || b.stage === "rotting");
  Corpse.score = (a, key) => G.Learn.score(a, key);
  Corpse.pull = (a, key) => clamp(Corpse.score(a, key) / 50, 0, 2);

  function nearestBody(sim, a) {
    const R = C().sightTiles; let best = null;
    for (const b of sim.bodies) {
      if (!Corpse.active(b)) continue;
      if (b.pyre && b.pyre.stage === "ash") continue;   // already burned out — ash_bones stay as bones material
      const d = Math.hypot(b.x - a.pos.x, b.y - a.pos.y);
      if (d > R + 1e-9) continue;
      if (!best || d < best.d) best = { b, d };
    }
    return best;
  }
  function freeNear(sim, a, x, y) {
    return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
      .map(([dx, dy]) => [x + dx, y + dy])
      .filter(([px, py]) => G.World.walkable(sim.world, px, py) && !G.Agent.claimed(sim, a, px, py))
      .sort((p, q) => Math.hypot(p[0] - a.pos.x, p[1] - a.pos.y) - Math.hypot(q[0] - a.pos.x, q[1] - a.pos.y) || p[0] - q[0] || p[1] - q[1]);
  }
  function goBody(sim, a, b, choice, extra) {
    for (const [x, y] of freeNear(sim, a, b.x, b.y).slice(0, 4))
      if (G.Agent.walkTo(sim, a, x, y, "corpse", Object.assign({ body: b.id, choice }, extra || {}))) return true;
    return false;
  }
  function fireNearBody(sim, b) {
    const R = C().fireTiles || 1.5;
    for (const k in sim.fire) {
      const e = sim.fire[k]; if (e.s !== "fire" && e.s !== "ember") continue;
      const i = k.indexOf(","), fx = +k.slice(0, i), fy = +k.slice(i + 1);
      if (Math.hypot(fx - b.x, fy - b.y) <= R + 1e-9) return { x: fx, y: fy, s: e.s };
    }
    return null;
  }
  function litHeld(sim, a) { const it = G.Items.held(sim, a); return it && it.lit ? it : null; }
  function stickNear(sim, b) {
    return sim.items.some(it => !it.heldBy && it.material === "stick" && !it.lit && Math.hypot(it.x - b.x, it.y - b.y) <= 1.5);
  }
  function knownForm(a) {
    const P = a.prayForms || {}; const keys = Object.keys(P);
    return keys.length ? keys.sort((p, q) => (P[q].n || 0) - (P[p].n || 0) || (p < q ? -1 : 1))[0] : null;
  }
  function sleepSpotBlocked(sim, a, b) {
    return Math.hypot(b.x - a.pos.x, b.y - a.pos.y) <= 1.5 && a.needs.energy < CF().person.energy.sleepBelow + 10;
  }

  // Weight each available choice from curiosity vs corpseFear and learned scores. leave wins when fear is high.
  Corpse.weights = function (sim, a, b) {
    const Cc = C(), fear = (a.traits.corpseFear != null ? a.traits.corpseFear : 50) / 100, cur = (a.traits.curiosity != null ? a.traits.curiosity : 50) / 100;
    const brave = Math.max(0.05, 1 - fear), W = [];
    const leaveW = (0.35 + fear * 1.2) * (1 + Corpse.pull(a, "leave") * 0.5);
    W.push({ k: "leave", w: leaveW });
    if (!(G.Family && G.Family.isChild(a))) {
      const dragNeed = sleepSpotBlocked(sim, a, b) ? 1.4 : 0.6;
      W.push({ k: "drag", w: brave * cur * dragNeed * (0.4 + Corpse.pull(a, "drag")) });
      if (Corpse.digTool(G.Items.held(sim, a)) && Corpse.soft(sim, b.x, b.y))
        W.push({ k: "bury", w: brave * cur * (0.35 + Corpse.pull(a, "bury")) * (Cc.buryChance || 0.5) });
      const fire = fireNearBody(sim, b), lit = litHeld(sim, a);
      if (fire || lit || stickNear(sim, b) || (G.Items.held(sim, a) && G.Items.held(sim, a).material === "stick"))
        W.push({ k: "burn", w: brave * cur * (0.3 + Corpse.pull(a, "burn")) * (Cc.burnChance || 0.45) });
      if (Corpse.hasFlesh(b) && a.needs.fullness < CF().person.actAt + 15)
        W.push({ k: "eat", w: brave * cur * (0.25 + Corpse.pull(a, "eat")) * (a.needs.fullness < CF().person.actAt ? 1.3 : 0.7) * (Cc.eatChance || 0.4) });
    }
    const form = knownForm(a);
    if ((a.traits.faith || 0) >= Cc.ritualFaithMin && form)
      W.push({ k: "ritual", w: (0.2 + (a.traits.faith || 0) / 200) * brave * (0.5 + Corpse.pull(a, "ritual")) * (Cc.ritualChance || 0.55) });
    return W;
  };
  Corpse.pick = function (sim, a, b) {
    const W = Corpse.weights(sim, a, b); if (!W.length) return "leave";
    const tot = W.reduce((t, q) => t + q.w, 0); let x = sim.lrng.float() * tot;
    for (const q of W) { x -= q.w; if (x < 0) return q.k; }
    return W[W.length - 1].k;
  };

  function noteFirst(sim, a, key, words) {
    const d = G.Discoveries.note(sim, a, key, ["corpse"], words || key);
    if (d && !d.title) d.title = "First " + (G.Learn.short(key) || key) + " of a body";
    return d;
  }
  function succeed(sim, a, key) {
    const g = C().gain[key] != null ? C().gain[key] : 15;
    const e = G.Learn.add(a, key, g); e.n = (e.n || 0) + 1;
    G.Learn.success(sim, a, key);
    const S = stats(sim); S[key] = (S[key] || 0) + 1; S.byKey[key] = (S.byKey[key] || 0) + 1;
    noteFirst(sim, a, key, key);
  }
  function watchersFear(sim, a, b) {
    const R = C().watchTiles || 4, drop = C().watchLikeDrop || -2;
    for (const q of sim.agents) {
      if (q === a) continue;
      if (Math.hypot(q.pos.x - b.x, q.pos.y - b.y) > R + 1e-9) continue;
      if ((q.traits.corpseFear || 0) < (C().watchFearAt || 55)) continue;
      G.Social.addLike(q, a, drop);
    }
  }

  // Idle: see a body in sight → pick a choice (or leave). Returns true if she set off / acted.
  Corpse.maybe = function (sim, a) {
    if (G.Family && G.Family.isChild(a) && (a.traits.corpseFear || 0) < 30) { /* children usually leave; still may ritual */ }
    const n = nearestBody(sim, a); if (!n) return false;
    const Cc = C(), S = stats(sim); S.seen++;
    if (sim.tick - (a.corpseAt == null ? -1e9 : a.corpseAt) < (Cc.cooldownMinutes || 60)) return false;
    const approach = clamp((Cc.approachChance || 0.45) * (0.4 + a.traits.curiosity / 100) * (1.15 - (a.traits.corpseFear || 50) / 120) * (0.5 + Corpse.pull(a, "drag") * 0.2), 0, 1);
    if (!sim.lrng.chance(approach) && (a.traits.corpseFear || 50) < (Cc.forceLeaveAt || 85)) return false;
    a.corpseAt = sim.tick;
    const choice = Corpse.pick(sim, a, n.b);
    if (choice === "leave") {
      succeed(sim, a, "leave");
      G.Sim.log(sim, a.name + " leaves " + n.b.name + "'s body where it lies", a);
      // step away a tile or two if close
      const t = freeNear(sim, a, Math.round(a.pos.x), Math.round(a.pos.y)).filter(([x, y]) => Math.hypot(x - n.b.x, y - n.b.y) >= 2).slice(0, 3);
      if (t.length && Math.hypot(a.pos.x - n.b.x, a.pos.y - n.b.y) < 2.5) G.Agent.walkTo(sim, a, t[0][0], t[0][1], "wander");
      return true;
    }
    return goBody(sim, a, n.b, choice);
  };

  Corpse.arrive = function (sim, a) {
    const act = a.act, b = sim.bodies.find(q => q.id === act.body);
    if (!b || !Corpse.active(b)) { G.Agent.startIdle(sim, a, 0.3); return; }
    const choice = act.choice;
    if (choice === "drag") return startDrag(sim, a, b);
    if (choice === "bury") return startBury(sim, a, b);
    if (choice === "burn") return startBurn(sim, a, b);
    if (choice === "eat") return startEat(sim, a, b);
    if (choice === "ritual") return startRitual(sim, a, b);
    G.Agent.startIdle(sim, a, 0.3);
  };

  function startDrag(sim, a, b) {
    const Cc = C(), max = Cc.dragMaxTiles || 8;
    // prefer toward a fire if burning is also known; else away from sleep cluster / random soft tile
    const fire = fireNearBody(sim, b); let dest = null;
    if (fire && Corpse.score(a, "burn") >= Corpse.score(a, "drag")) {
      const spots = freeNear(sim, a, fire.x, fire.y).filter(([x, y]) => Math.hypot(x - b.x, y - b.y) <= max + 1e-9 && Math.hypot(x - b.x, y - b.y) >= 1);
      if (spots.length) dest = { x: spots[0][0], y: spots[0][1] };
    }
    if (!dest) {
      const cand = [];
      for (let dy = -max; dy <= max; dy++) for (let dx = -max; dx <= max; dx++) {
        const x = b.x + dx, y = b.y + dy, d = Math.hypot(dx, dy);
        if (d < 2 || d > max + 1e-9 || !G.World.walkable(sim.world, x, y) || G.Agent.claimed(sim, a, x, y)) continue;
        if (sim.bodies.some(q => q !== b && q.x === x && q.y === y)) continue;
        cand.push({ x, y, d, soft: Corpse.soft(sim, x, y) ? 1 : 0 });
      }
      cand.sort((p, q) => q.soft - p.soft || Math.abs(p.d - 4) - Math.abs(q.d - 4) || p.y - q.y || p.x - q.x);
      if (cand.length) dest = cand[Math.min(cand.length - 1, sim.lrng.int(0, Math.min(5, cand.length - 1)))];
    }
    if (!dest) { G.Agent.startIdle(sim, a, 0.3); return; }
    b.draggedBy = a.id;
    G.Sim.log(sim, a.name + " drags " + b.name + "'s body", a);
    if (!G.Agent.walkTo(sim, a, dest.x, dest.y, "drag", { body: b.id, fromX: b.x, fromY: b.y })) {
      b.draggedBy = null; G.Agent.startIdle(sim, a, 0.3); return;
    }
  }
  Corpse.arriveDrag = function (sim, a) {
    const b = sim.bodies.find(q => q.id === a.act.body);
    if (!b) { G.Agent.startIdle(sim, a, 0.3); return; }
    const tx = Math.round(a.pos.x), ty = Math.round(a.pos.y);
    b.x = tx; b.y = ty; b.draggedBy = null;
    succeed(sim, a, "drag");
    G.Sim.log(sim, a.name + " leaves " + b.name + "'s body here", a);
    // if dragged onto / next to fire, burn may follow
    if (fireNearBody(sim, b) && sim.lrng.chance(0.7)) { startBurn(sim, a, b); return; }
    G.Agent.startIdle(sim, a, 0.4);
  };

  function startBury(sim, a, b) {
    if (!Corpse.digTool(G.Items.held(sim, a)) || !Corpse.soft(sim, b.x, b.y)) { G.Agent.startIdle(sim, a, 0.3); return; }
    const mins = C().digMinutes || 30, n = Math.max(1, Math.round(mins / TM()));
    b.burial = { stage: "dug", stageAt: sim.tick };
    a.act = { type: "dig", body: b.id, t: 0, n };
    G.Sim.log(sim, a.name + " digs into the ground by " + b.name + "'s body", a);
  }
  Corpse.stepDig = function (sim, a) {
    const act = a.act, b = sim.bodies.find(q => q.id === act.body);
    if (!b || !b.burial) { G.Agent.startIdle(sim, a, 0.2); return; }
    act.t++;
    if (act.t < act.n) return;
    // dug → fresh mound; flesh entombed (no longer edible / scavengable); bones locked under the mound
    b.burial = { stage: "mound_fresh", stageAt: sim.tick };
    b.flesh = 0; b.stage = "bones"; b.stageAt = sim.tick; b.material = CF().body.material; b.bonesLeft = 0;
    succeed(sim, a, "bury");
    G.Sim.log(sim, a.name + " buries " + b.name + " under a mound of earth", a);
    G.Agent.startIdle(sim, a, 0.5);
  };

  function startBurn(sim, a, b) {
    const fire = fireNearBody(sim, b), lit = litHeld(sim, a);
    if (fire || lit) {
      b.pyre = { stage: "burning", stageAt: sim.tick };
      if (!fire && lit) { /* brand used at the body */ }
      succeed(sim, a, "burn");
      G.Sim.log(sim, a.name + (lit && !fire ? " sets " + b.name + "'s body alight with a burning stick" : " watches " + b.name + "'s body catch fire"), a);
      G.Agent.startIdle(sim, a, 0.4);
      return;
    }
    // build an unlit pyre from a held stick or sticks on the ground
    const held = G.Items.held(sim, a);
    if (held && held.material === "stick" && !held.lit) {
      sim.items.splice(sim.items.indexOf(held), 1); a.carry = null; a.carryUntil = null;
      b.pyre = { stage: "unlit", stageAt: sim.tick };
      succeed(sim, a, "burn");
      G.Sim.log(sim, a.name + " piles sticks under " + b.name + "'s body", a);
      G.Agent.startIdle(sim, a, 0.4);
      return;
    }
    const ground = sim.items.find(it => !it.heldBy && it.material === "stick" && !it.lit && Math.hypot(it.x - b.x, it.y - b.y) <= 1.5);
    if (ground) {
      sim.items.splice(sim.items.indexOf(ground), 1);
      b.pyre = { stage: "unlit", stageAt: sim.tick };
      succeed(sim, a, "burn");
      G.Sim.log(sim, a.name + " piles sticks under " + b.name + "'s body", a);
      G.Agent.startIdle(sim, a, 0.4);
      return;
    }
    G.Agent.startIdle(sim, a, 0.3);
  }

  function startEat(sim, a, b) {
    if (!Corpse.hasFlesh(b)) { G.Agent.startIdle(sim, a, 0.3); return; }
    const cooked = (b.heat || 0) >= (CF().cook && CF().cook.cookedAt || 30);
    const add = cooked ? (C().eatFullness.cooked || 50) : (C().eatFullness.raw || 40);
    const n = Math.max(1, Math.round((C().eatMinutes || 20) / TM()));
    a.act = { type: "eatCorpse", body: b.id, t: 0, n, from: a.needs.fullness, add, cooked };
    G.Sim.log(sim, a.name + " eats from " + b.name + "'s body", a);
  }
  Corpse.stepEat = function (sim, a) {
    const act = a.act, b = sim.bodies.find(q => q.id === act.body);
    if (!b || !Corpse.hasFlesh(b)) { G.Agent.startIdle(sim, a, 0.2); return; }
    act.t++;
    const end = Math.min(100, act.from + act.add);
    a.needs.fullness = r9(Math.max(a.needs.fullness, act.from + (end - act.from) * Math.min(1, act.t / act.n)));
    if (act.t < act.n) return;
    a.needs.fullness = end;
    const take = C().eatFlesh || 35;
    b.eaten = r9((b.eaten || 0) + take); b.flesh = r9(Math.max(0, b.flesh - take));
    if (b.flesh <= 0 && b.stage !== "bones") { b.stage = "bones"; b.stageAt = sim.tick; b.material = CF().body.material; G.Sim.log(sim, "Only " + b.name + "'s bones remain", b); }
    succeed(sim, a, "eat");
    watchersFear(sim, a, b);
    const sickP = act.cooked ? (C().sickChance.cooked || 0.15) : (C().sickChance.raw || 0.4);
    if (sim.orng.chance(sickP)) {
      a.needs.energy = r9(Math.max(0, a.needs.energy - (C().sickEnergy || 20)));
      stats(sim).sick++;
      G.Learn.add(a, "eat", -(C().sickDrop || 5));
      G.Sim.log(sim, a.name + " feels sick after eating from the body", a);
    }
    G.Agent.startIdle(sim, a, 0.5);
  };

  function startRitual(sim, a, b) {
    const form = knownForm(a); if (!form || (a.traits.faith || 0) < C().ritualFaithMin) { G.Agent.startIdle(sim, a, 0.3); return; }
    const mins = C().ritualMinutes || 20, acts = form.split("+"), n = Math.max(1, Math.round(mins / TM()));
    a.act = { type: "pray", form, acts, done: acts, why: "death", t: 0, n, per: Math.max(1, Math.round(n / Math.max(1, acts.length))), corpse: b.id };
    const e = (a.prayForms || (a.prayForms = {}))[form] || (a.prayForms[form] = { n: 0, like: 0, gen: 0 });
    e.n++; e.last = sim.tick;
    if (G.Faith && G.Faith.feed) G.Faith.feed(sim, a, a.name + " " + (G.Faith.verb ? acts.map(s => G.Faith.verb(a, s)).join(" and ") : "kneels") + " by " + b.name + "'s body");
    else G.Sim.log(sim, a.name + " kneels by " + b.name + "'s body", a);
    succeed(sim, a, "ritual");
    a.traits.faith = clamp((a.traits.faith || 0) + (C().ritualFaithGain || 3), 0, 100);
    a.traits.corpseFear = clamp((a.traits.corpseFear || 50) - (C().ritualFearDrop || 5), 0, 100);
  }

  // Burial / pyre stage advances; light unlit pyres that sit on fire.
  Corpse.step = function (sim) {
    const Cc = C();
    for (const b of sim.bodies) {
      if (b.burial) {
        const st = b.burial.stage, age = sim.tick - b.burial.stageAt;
        if (st === "dug" && age >= (Cc.dugShowMinutes || 10)) { b.burial.stage = "mound_fresh"; b.burial.stageAt = sim.tick; }
        else if (st === "mound_fresh" && age >= (Cc.moundSettleMinutes || 10080)) { b.burial.stage = "mound_settled"; b.burial.stageAt = sim.tick; }
        else if (st === "mound_settled" && age >= (Cc.cairnMinutes || 40320)) { b.burial.stage = "cairn"; b.burial.stageAt = sim.tick; }
        continue;
      }
      if (!b.pyre) continue;
      const st = b.pyre.stage, age = sim.tick - b.pyre.stageAt;
      if (st === "unlit") {
        if (fireNearBody(sim, b)) { b.pyre = { stage: "burning", stageAt: sim.tick }; G.Sim.log(sim, b.name + "'s pyre catches fire", b); }
        continue;
      }
      if (st === "burning" && age >= (Cc.pyreBurnMinutes || 60)) {
        b.pyre = { stage: "ash", stageAt: sim.tick };
        b.flesh = 0; b.stage = "bones"; b.stageAt = sim.tick; b.material = CF().body.material; b.burned = true;
        b.ashFrame = sim.lrng.chance(0.5) ? "ash_over_bones" : "ash_with_bone_flecks";
        G.Sim.log(sim, b.name + "'s pyre burns down to ash and bones", b);
      }
    }
  };

  // Body.step: skip normal flesh rot while buried or while a pyre is burning / unlit (pyre owns the end state)
  Corpse.skipDecay = b => !!(b.burial || (b.pyre && b.pyre.stage !== "ash"));

  Corpse.frame = function (b) {
    if (b.burial) return { sheet: "burial", col: b.burial.stage };
    if (b.pyre) {
      if (b.pyre.stage === "ash") return { sheet: "ashBones", col: b.ashFrame || "ash_over_bones" };
      return { sheet: "pyre", col: b.pyre.stage };
    }
    if (b.burned && b.stage === "bones") return { sheet: "ashBones", col: b.ashFrame || "ash_over_bones" };
    return null;
  };

  G.Corpse = Corpse;
})(this.GS = this.GS || {});
