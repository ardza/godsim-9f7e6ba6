// v39 (specs/reed_fiber_DRAFT.md §1-4): reed beds that regrow, soaking / beating / twisting reeds into fiber, fiber wraps (clothes),
// cord as rope (lashed huts and caches, cord binder). Nothing is scripted: the first soaked reed is an accident of a reed left by water,
// the first fiber an accident of the existing strike try, the first cord of the existing rub try. Action-only logs. Own stream sim.rbrng.
// G.V39 is a small hook hub the agent loop calls (maybe / coldTry / arrive / stepAct); bow.js and spar.js register into it.
(function (G) {
  const CF = () => G.data.config, RC = () => CF().reeds, FC = () => CF().fiber, WC = () => CF().wrap, PC = () => CF().rope, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;
  const Reeds = {}, Fiber = {}, V39 = { maybes: [], colds: [], arrives: {}, acts: {} };
  const rb = sim => sim.rbrng || (sim.rbrng = new G.RNG((sim.seed ^ 0x2EEDF1BE) >>> 0));
  Reeds.rng = rb;
  const stats = sim => sim.fiberStats || (sim.fiberStats = Fiber.newStats());
  Fiber.newStats = () => ({ regrown: 0, burntBeds: 0, soaked: 0, laid: 0, beats: 0, bends: 0, twists: 0, wraps: 0, rewraps: 0, patches: 0, wrapFalls: 0, lashedHuts: 0, lashedCaches: 0, cordBinds: 0, arrowsCut: 0 });
  Fiber.stats = stats;
  const her = a => a.sex === "m" ? "his" : "her";
  const disc = (sim, who, action, mats, result, title) => { const d = G.Discoveries.note(sim, who, action, mats, result); if (d) d.title = title; return d; };
  Fiber.disc = disc;

  // ---------- reed beds ----------
  const key = (x, y) => x + "," + y;
  Reeds.isReed = it => !!it && it.material === "reed" && !it.lit;
  Reeds.standing = it => Reeds.isReed(it) && !!it.stand && !it.heldBy && !it.wornBy;
  Reeds.newBed = (x, y) => ({ x, y, n: 1, max: RC().bedMax, g: 0, nextAt: null, burnt: false });
  // every tile that holds a seeded reed is a bed (Sim.create, after Items.populate); those reeds are standing
  Reeds.init = function (sim) {
    sim.reedBeds = []; const seen = {};
    for (const it of sim.items || []) if (it.material === "reed" && !it.heldBy) { it.stand = true; const k = key(it.x, it.y); if (!seen[k]) { seen[k] = 1; sim.reedBeds.push(Reeds.newBed(it.x, it.y)); } }
    for (const b of sim.reedBeds) b.n = sim.items.filter(i => Reeds.standing(i) && i.x === b.x && i.y === b.y).length;
    sim.fiberStats = Fiber.newStats(); sim.fightStats = sim.fightStats || null; sim.cacheLash = sim.cacheLash || {};
  };
  // 38 -> 39 (Sim.migrate39, on the raw save): re-run the seed's object placement (Sim.create on a scratch world: own streams, nothing shared
  // with the save) and keep the reed tiles whose terrain still matches the saved map; n = loose reeds still on the tile (0-bedMax), those stand.
  // Fallback (seed rerun gives a different map or throws): beds on the tiles that hold reeds now. Returns "seed" or "fallback".
  Reeds.migrate = function (s) {
    const items = s.items || [], here = (x, y) => items.filter(i => i.material === "reed" && !i.heldBy && !i.wornBy && !i.lit && i.x === x && i.y === y);
    let spots = null, how = "fallback";
    try {
      const t = G.Sim.create(s.seed), tw = t.world, st = (s.world && s.world.tiles) || "";
      const ch = "MWSRL", tileCh = (x, y) => ch[tw.tiles[y * tw.w + x]];
      if (s.world && tw.w === s.world.w && tw.h === s.world.h && typeof st === "string") {
        const seen = {}; spots = [];
        for (const it of t.items) if (it.material === "reed") { const k = key(it.x, it.y); if (seen[k]) continue; seen[k] = 1;
          if (st[it.y * tw.w + it.x] === tileCh(it.x, it.y)) spots.push({ x: it.x, y: it.y }); }
        if (spots.length) how = "seed"; else spots = null;
      }
    } catch (e) { spots = null; }
    if (!spots) { const seen = {}; spots = [];
      for (const it of items) if (it.material === "reed" && !it.heldBy && !it.wornBy && !it.lit) { const k = key(it.x, it.y); if (!seen[k]) { seen[k] = 1; spots.push({ x: it.x, y: it.y }); } } }
    s.reedBeds = spots.map(q => { const b = Reeds.newBed(q.x, q.y), on = here(q.x, q.y).slice(0, b.max); for (const it of on) it.stand = true; b.n = on.length; return b; });
    Reeds.lastMigrate = how; return how;
  };
  Reeds.days = sim => RC().regrowDays[G.Climate.seasonIndex(sim.tick)];
  Reeds.rainOn = (sim, x, y) => !!(G.Powers && G.Powers.rainAt && G.Powers.rainAt(sim, x, y));
  Reeds.bedAt = (sim, x, y) => (sim.reedBeds || []).find(b => b.x === x && b.y === y) || null;
  Reeds.spawn = function (sim, b) {
    const it = G.Items.create(sim, "reed", b.x, b.y, "whole", G.Items.jitterProps("reed", rb(sim))); it.stand = true; sim.items.push(it); b.n++; stats(sim).regrown++; return it;
  };
  // every reeds.stepMinutes (10): count standing reeds, grow, burn, return after fire; soak loose reeds by water
  Reeds.step = function (sim) {
    const every = Math.max(1, Math.round(10 / TM())); if (sim.tick % every !== 0) return;
    const R = RC(), dt = every * TM(), beds = sim.reedBeds || [], cnt = {};
    for (const it of sim.items) {
      if (it.material !== "reed") continue;
      if (it.stand && (it.heldBy || it.wornBy || it.lit)) delete it.stand;
      if (it.stand) { const k = key(it.x, it.y); cnt[k] = (cnt[k] || 0) + 1; }
    }
    for (const b of beds) {
      const k = key(b.x, b.y), f = sim.fire && sim.fire[k]; b.n = cnt[k] || 0; b.max = R.bedMax;
      if (f) { if (f.s === "fire" && !b.burnt) { b.burnt = true; b.g = 0; stats(sim).burntBeds++; } b.nextAt = null; continue; }
      if (b.burnt) { b.burnt = false; b.g = 0; if (b.n < b.max) Reeds.spawn(sim, b); continue; }   // the ground regrew: the bed is back with one reed
      if (b.n >= b.max) { b.g = 0; b.nextAt = null; continue; }
      const days = Reeds.days(sim); if (days == null) { b.nextAt = null; continue; }   // Deep Cold: nothing grows
      const rate = 1 / (days * 1440) * (Reeds.rainOn(sim, b.x, b.y) ? R.rainX : 1);
      b.g = Math.round((b.g + rate * dt) * 1e9) / 1e9;
      if (b.g >= 1 - 1e-9) { b.g = 0; Reeds.spawn(sim, b); }
      b.nextAt = b.n >= b.max ? null : sim.tick + Math.ceil((1 - b.g) * days * 1440 / TM());
    }
    Fiber.stepSoak(sim, every);
    Fiber.stepWraps(sim, every);
  };
  // a bank tile: land, next to water (8-neighbourhood)
  Fiber.byWater = function (sim, x, y) {
    const w = sim.world; if (G.World.isWater(w, x, y)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && G.World.isWater(w, x + dx, y + dy)) return true;
    return false;
  };
  Fiber.isFiber = it => !!it && !it.lit && !!(G.data.materials[it.material] && G.data.materials[it.material].isFiber);
  Fiber.isBundle = it => Fiber.isFiber(it) && it.form === "bundle" && !it.wornBy;
  Fiber.isCord = it => Fiber.isFiber(it) && it.form === "cord" && !it.wornBy;
  Fiber.soakable = it => Reeds.isReed(it) && !it.stand && !it.soaked && !it.wornBy;
  Fiber.stepSoak = function (sim, every) {
    const F = FC(), need = F.soakMinutes / TM();
    for (const it of sim.items) {
      if (!Fiber.soakable(it)) { if (it.soakStartAt != null && !it.soaked) it.soakStartAt = null; continue; }
      let wet = false, by = null;
      if (it.heldBy) { const h = sim.agents.find(q => q.id === it.heldBy); if (h && Fiber.byWater(sim, Math.round(h.pos.x), Math.round(h.pos.y))) { wet = true; by = h; } }
      else if (Fiber.byWater(sim, it.x, it.y)) { wet = true; by = it.leftBy != null ? sim.agents.find(q => q.id === it.leftBy) : null; }
      if (!wet) { it.soakStartAt = null; continue; }
      if (it.soakStartAt == null) { it.soakStartAt = sim.tick; continue; }
      if (sim.tick - it.soakStartAt >= need - 1e-9) {
        it.soaked = true; stats(sim).soaked++;
        const who = by || (it.heldBy ? sim.agents.find(q => q.id === it.heldBy) : null);
        if (who) disc(sim, who, "soak", ["reed"], "soft strands", "First soaked reed"); else stats(sim).soakPending = true;
      }
    }
    if (stats(sim).soakPending) for (const it of sim.items) if (it.soaked && it.material === "reed" && it.heldBy) { const h = sim.agents.find(q => q.id === it.heldBy); if (h) { disc(sim, h, "soak", ["reed"], "soft strands", "First soaked reed"); stats(sim).soakPending = false; break; } }
  };

  // ---------- labels ----------
  const ml0 = G.Items.matLabel;
  G.Items.matLabel = function (it) {
    if (it && !it.lit) {
      if (it.material === "fiber") return it.form === "cord" ? "cord" : it.form === "wrap" ? "fiber wrap" : it.form === "shard" ? "cut fiber" : "fiber bundle";
      if (it.material === "reed" && it.soaked) return "soaked reed";
      if (it.form === "arrow") return it.tip ? "tipped arrow" : "arrow";
    }
    return ml0(it);
  };

  // ---------- try act hook (objects.stepTry): beat / bend / twist / arrows ----------
  function classify(sim, a, action, it, t) {
    if (!it || !t || it === t) return null; const F = FC();
    if (action === "strike") {
      const r = Reeds.isReed(it) ? it : Reeds.isReed(t) ? t : null; if (!r) return null; const o = r === it ? t : it;
      if (r.soaked && !Reeds.isReed(o) && (o.props.hardness || 0) >= F.beatMinHardness) return "beat";
      if ((r.props.flex || 0) >= F.bendFlex && (r.props.hardness || 0) <= F.bendMaxHardness) return "bend";
      return null;
    }
    if (action === "rub") return Fiber.isBundle(it) && Fiber.isBundle(t) ? "twist" : null;
    if (action === "cut") {
      const B = CF().bow;
      if ((it.props.sharpness || 0) >= B.arrowEdge && t.material === "stick" && t.form === "whole" && !t.tool && !t.lit && G.Learn.has(a, "bow")) return "arrows";
      return null;
    }
    return null;
  }
  Fiber.classify = classify;
  Fiber.stepTry = function (sim, a) {
    const act = a.act, it = G.Items.held(sim, a), t = G.Items.byId(sim, act.target);
    if (act.fx === "none") return undefined;
    if (!act.fx) { const k = classify(sim, a, act.action, it, t); if (!k) { act.fx = "none"; return undefined; }
      act.fx = k; if (k === "beat") act.n = Math.max(1, Math.round(FC().beatMinutes / TM())); if (k === "twist") act.n = Math.max(1, Math.round(FC().twistMinutes / TM())); }
    if (++act.t < act.n) return true;
    if (!it || !t || t.heldBy || t.wornBy || classify(sim, a, act.action, it, t) !== act.fx) return false;
    a.lastTry = sim.tick;
    const F = FC(), L = F.lines;
    if (act.fx === "beat") {
      const r = Reeds.isReed(it) ? it : t;
      r.material = "fiber"; r.form = "bundle"; r.props = G.Items.jitterProps("fiber", rb(sim)); delete r.soaked; delete r.soakStartAt; delete r.stand; r.madeBy = a.id; r.madeAt = sim.tick;
      stats(sim).beats++;
      G.Sim.log(sim, a.name + " " + L.beat, a);
      disc(sim, a, "strike", ["soaked reed"], "fiber", "First fiber");
      const e = G.Learn.add(a, "fiber", F.gain); e.n++; G.Learn.success(sim, a, "fiber");
      return false;
    }
    if (act.fx === "bend") {
      stats(sim).bends++;
      const r = Reeds.isReed(it) ? it : t, o = r === it ? t : it;
      G.Sim.log(sim, a.name + " strikes the " + G.Items.matLabel(r) + " on the " + G.Items.matLabel(o) + ": it " + L.bend, a);
      return false;
    }
    if (act.fx === "twist") {
      const ix = sim.items.indexOf(t); if (ix >= 0) sim.items.splice(ix, 1);
      it.form = "cord"; it.props.durability = Math.round(clamp(((it.props.durability || 40) + (t.props.durability || 40)) / 2 + 10, 1, 100)); it.madeBy = a.id; it.madeAt = sim.tick;
      stats(sim).twists++;
      G.Sim.log(sim, a.name + " " + L.twist, a);
      disc(sim, a, "rub", ["fiber"], "cord", "First cord");
      const e = G.Learn.add(a, "twist", F.gain); e.n++; G.Learn.success(sim, a, "twist");
      return false;
    }
    if (act.fx === "arrows") {
      const B = CF().bow, x = t.x, y = t.y, ix = sim.items.indexOf(t); if (ix >= 0) sim.items.splice(ix, 1);
      for (let i = 0; i < B.arrowsPerStick; i++) { const ar = G.Items.create(sim, "stick", x, y, "arrow", Object.assign({}, t.props, { sharpness: Math.max(t.props.sharpness || 0, 30) })); ar.madeBy = a.id; sim.items.push(ar); }
      stats(sim).arrowsCut += B.arrowsPerStick;
      G.Sim.log(sim, a.name + " " + L.arrows, a);
      disc(sim, a, "cut", ["stick"], "arrows", "First arrows");
      const e = G.Learn.add(a, "bow", F.gain); e.n++; G.Learn.success(sim, a, "bow");
      return false;
    }
    return undefined;
  };

  // ---------- deliberate acts (score >= scoreMin AND a record of having done it: the default start is not know-how) ----------
  Fiber.knows = (a, k, min) => G.Learn.has(a, k) && G.Learn.score(a, k) >= (min != null ? min : FC().scoreMin) - 1e-9;
  const near = (sim, a, R, f) => { let best = null, bd = 1e9; for (const it of sim.items) { if (it.heldBy || it.wornBy || !f(it)) continue; const d = Math.hypot(it.x - a.pos.x, it.y - a.pos.y); if (d <= R + 1e-9 && (d < bd || (d === bd && it.id < best.id))) { bd = d; best = it; } } return best; };
  Fiber.near = near;
  function waterSpot(sim, a, R) {
    const t = G.Agent.tilePos(a); let best = null;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = t.x + dx, y = t.y + dy, d = Math.hypot(dx, dy); if (d > R || !G.World.walkable(sim.world, x, y) || !Fiber.byWater(sim, x, y)) continue;
      if (!best || d < best.d) best = { x, y, d }; }
    return best;
  }
  Fiber.maybe = function (sim, a) {
    if (G.Family && G.Family.isChild(a)) return false;
    const F = FC(), every = Math.max(1, Math.round(F.tryEveryMinutes / TM()));
    if (a.fiberTryAt != null && sim.tick - a.fiberTryAt < every) return false;
    const held = G.Items.held(sim, a), reach = CF().objects.tryReach;
    if (CF().bow.arrowChance && G.Learn.has(a, "bow") && (!held || (held.props.sharpness || 0) >= CF().bow.arrowEdge) && sim.items.some(i => i.tool === "bow" && i.strung && !i.heldBy && i.craftedBy === a.id)) return false;   // v39 tune: her own bow lies unheld: leave the turn to Bow.maybe (fetch an edge, cut arrows, take the bow up)
    const cur = (a.traits && a.traits.curiosity != null ? a.traits.curiosity : 50) / 50, isHard = i => !Reeds.isReed(i) && (i.props.hardness || 0) >= F.beatMinHardness && !i.lit;
    if (!held && !Fiber.knows(a, "fiber")) {   // v39 tune: a curious empty-handed person may go and pick up a soaked reed she can see (fiber.inventChance x curiosity/50)
      if (!F.inventChance) return false; a.fiberTryAt = sim.tick;
      const s = near(sim, a, F.soakWalkTiles, i => Reeds.isReed(i) && i.soaked);
      if (s && !sim.agents.some(b => b !== a && b.act.goal === "pickup" && b.act.target === s.id) && rb(sim).chance(clamp(F.inventChance * cur, 0, 1)) && G.Agent.walkTo(sim, a, s.x, s.y, "pickup", { target: s.id })) return true;
      return false;
    }
    a.fiberTryAt = sim.tick;
    if (!Fiber.knows(a, "fiber") && F.inventChance && held && Reeds.isReed(held) && held.soaked) {   // invent: a curious person with a soaked reed in hand may strike it on something hard (fiber.inventChance x curiosity/50)
      const hard = near(sim, a, reach, isHard);
      if (hard && rb(sim).chance(clamp(F.inventChance * cur, 0, 1))) { G.Items.startTry(sim, a, hard, "strike"); a.act.fx = "beat"; a.act.n = Math.max(1, Math.round(F.beatMinutes / TM())); stats(sim).invented = (stats(sim).invented || 0) + 1; return true; }
      if (!hard && F.inventHardTiles) {   // v39 tune: nothing hard in reach: she may carry it to a stone she can see (fiber.inventHardTiles)
        const far = near(sim, a, F.inventHardTiles, isHard);
        if (far && rb(sim).chance(clamp(F.inventChance * cur, 0, 1)) && G.Agent.walkTo(sim, a, far.x, far.y, "beatAt")) return true; }
      return false;
    }
    if (held && Fiber.isBundle(held)) {   // twist alone while idle (twist >= twistAlone)
      const other = near(sim, a, reach, Fiber.isBundle);
      if (other && Fiber.knows(a, "fiber") && G.Learn.score(a, "twist") >= F.twistAlone - 1e-9 && rb(sim).chance(F.tryChance)) { G.Items.startTry(sim, a, other, "rub"); a.act.fx = "twist"; a.act.n = Math.max(1, Math.round(F.twistMinutes / TM())); return true; }
      if (!other && F.setDownChance && Fiber.knows(a, "fiber") && rb(sim).chance(F.setDownChance)) { G.Items.drop(sim, a); return true; }   // v39 tune: a lone bundle is set down (hands free for the next reed; the 2nd bundle then twists with it)
      return false;
    }
    if (!Fiber.knows(a, "fiber")) return false;
    if (held && Reeds.isReed(held) && held.soaked) {   // beat it on something hard close by
      const hard = near(sim, a, reach, i => !Reeds.isReed(i) && (i.props.hardness || 0) >= F.beatMinHardness && !i.lit);
      if (hard && rb(sim).chance(F.tryChance)) { G.Items.startTry(sim, a, hard, "strike"); a.act.fx = "beat"; a.act.n = Math.max(1, Math.round(F.beatMinutes / TM())); return true; }
      return false;
    }
    if (held && Fiber.soakable(held)) {   // lay it in the shallows
      const t = G.Agent.tilePos(a);
      if (Fiber.byWater(sim, t.x, t.y)) { if (rb(sim).chance(F.tryChance)) { Fiber.laySoak(sim, a); return true; } return false; }
      const s = waterSpot(sim, a, F.soakWalkTiles);
      if (s && rb(sim).chance(F.tryChance) && G.Agent.walkTo(sim, a, s.x, s.y, "soak")) return true;
      return false;
    }
    if (!held) {   // go back for a soaked reed she can see
      if (G.Learn.has(a, "twist") && CF().bow.seekStickTiles && near(sim, a, CF().bow.seekStickTiles, Fiber.isCord)) return false;   // v39 tune: a cord lying in sight: leave it to Bow.maybe (string a bow) rather than gather more reeds
      const s = near(sim, a, F.soakWalkTiles, i => Reeds.isReed(i) && i.soaked);
      if (s && rb(sim).chance(F.tryChance) && G.Agent.walkTo(sim, a, s.x, s.y, "pickup", { target: s.id })) return true;
      const bn = near(sim, a, F.soakWalkTiles, i => Fiber.isBundle(i) && sim.items.some(j => j !== i && Fiber.isBundle(j) && !j.heldBy && !j.wornBy && Math.hypot(j.x - i.x, j.y - i.y) <= reach));
      if (bn && G.Learn.score(a, "twist") >= F.twistAlone - 1e-9 && !sim.agents.some(b => b !== a && b.act.goal === "pickup" && b.act.target === bn.id) && rb(sim).chance(F.tryChance) && G.Agent.walkTo(sim, a, bn.x, bn.y, "pickup", { target: bn.id })) return true;   // v39 tune: two bundles lying together: pick one up to twist with the other
      if (!s && F.gatherChance) {   // v39 tune: no soaked reed in sight: a fiber knower may pick up a dry reed to soak (fiber.gatherChance)
        const d = near(sim, a, F.soakWalkTiles, Fiber.soakable);
        if (d && !sim.agents.some(b => b !== a && b.act.goal === "pickup" && b.act.target === d.id) && rb(sim).chance(F.gatherChance) && G.Agent.walkTo(sim, a, d.x, d.y, "pickup", { target: d.id })) return true; }
    }
    return false;
  };
  Fiber.laySoak = function (sim, a) {
    const it = G.Items.held(sim, a); if (!Fiber.soakable(it)) return false;
    G.Items.drop(sim, a, "stash"); it.soakStartAt = sim.tick; stats(sim).laid++;
    G.Sim.log(sim, a.name + " " + FC().lines.soak, a); return true;
  };
  V39.arrives.beatAt = (sim, a) => { const F = FC(), h = G.Items.held(sim, a);   // v39 tune: arrived by a stone with a soaked reed: strike it there
    const hard = h && Reeds.isReed(h) && h.soaked ? near(sim, a, CF().objects.tryReach, i => !Reeds.isReed(i) && (i.props.hardness || 0) >= F.beatMinHardness && !i.lit) : null;
    if (hard) { G.Items.startTry(sim, a, hard, "strike"); a.act.fx = "beat"; a.act.n = Math.max(1, Math.round(F.beatMinutes / TM())); stats(sim).invented = (stats(sim).invented || 0) + 1; return true; }
    G.Agent.startIdle(sim, a, 0.5); return true; };
  V39.arrives.soak = (sim, a) => { const t = G.Agent.tilePos(a); if (Fiber.byWater(sim, t.x, t.y)) Fiber.laySoak(sim, a); G.Agent.startIdle(sim, a, 0.5); return true; };

  // ---------- fiber wrap (clothes) ----------
  Fiber.wrapItem = (sim, a) => a.wearingWrap != null ? G.Items.byId(sim, a.wearingWrap) : null;
  Fiber.wrapWant = function (sim, a) {
    const w = Fiber.wrapItem(sim, a); if (!w) return 0; const W = WC();
    let c = 0; for (let i = 0; i < Math.min(w.layers || 1, W.layerC.length); i++) c += W.layerC[i];
    return r2(c * ((w.dur != null ? w.dur : 100) < W.wornBelow ? W.wornX : 1));
  };
  // felt °C from the wrap, trimmed with fire + den + hide under shelter.capX x fire.heatC (Climate.felt)
  Fiber.warmC = function (sim, a, others) {
    const want = Fiber.wrapWant(sim, a); if (!(want > 0)) return 0;
    const capX = (CF().shelter && CF().shelter.capX != null) ? CF().shelter.capX : 1.5, cap = capX * CF().fire.heatC;
    return r2(Math.max(0, Math.min(want, cap - Math.max(0, others || 0))));
  };
  Fiber.wrapOn = function (sim, a, b) {
    if (!Fiber.isBundle(b)) return false; const W = WC(), L = FC().lines, w = Fiber.wrapItem(sim, a);
    if (b.heldBy === a.id) { a.carry = null; a.carryUntil = null; b.heldBy = null; } else if (b.heldBy) return false;
    if (!w) {
      b.form = "wrap"; b.wornBy = a.id; b.layers = 1; b.dur = 100; b.x = Math.round(a.pos.x); b.y = Math.round(a.pos.y); a.wearingWrap = b.id; stats(sim).wraps++;
      G.Sim.log(sim, a.name + " " + L.wrap.replace("{her}", her(a)), a);
      disc(sim, a, "wear", ["fiber"], "shoulders warm", "First fiber wrap");
    } else {
      const ix = sim.items.indexOf(b); if (ix >= 0) sim.items.splice(ix, 1);
      if ((w.layers || 1) < W.layerC.length) { w.layers = (w.layers || 1) + 1; stats(sim).rewraps++; }
      else { w.dur = Math.min(100, (w.dur != null ? w.dur : 100) + W.patch); stats(sim).patches++; }
      G.Sim.log(sim, a.name + " " + L.rewrap.replace("{her}", her(a)), a);
    }
    a.stats = a.stats || {}; a.stats.wraps = (a.stats.wraps || 0) + 1;
    return true;
  };
  // cold, holding a bundle: hide try rule (tryChance x curiosity/50 x (0.5 + coldFear/100)), wrap score >= scoreMin
  Fiber.maybeWrap = function (sim, a) {
    const held = G.Items.held(sim, a), b = Fiber.isBundle(held) ? held : (!held || held.material !== "fiber") ? near(sim, a, CF().objects.tryReach, Fiber.isBundle) : null;   // like a hide: in hand, or lying within reach
    if (!b) return false;
    const F = FC(), every = Math.max(1, Math.round(F.tryEveryMinutes / TM()));
    if (a.wrapTryAt != null && sim.tick - a.wrapTryAt < every) return false;
    if (!G.Hides.cold(sim, a) && !(a.needs.warmth < (WC().tryBelowWarmth != null ? WC().tryBelowWarmth : 0))) return false;   // v39 tune: chilly (warmth < wrap.tryBelowWarmth) is enough
    a.wrapTryAt = sim.tick;
    const w = Fiber.wrapItem(sim, a); if (w && (w.layers || 1) >= WC().layerC.length && (w.dur != null ? w.dur : 100) > 100 - WC().patch) return false;
    if (G.Learn.score(a, "wrap") < F.scoreMin - 1e-9) return false;
    const cur = (a.traits.curiosity != null ? a.traits.curiosity : 50) / 50, fear = (a.traits.coldFear != null ? a.traits.coldFear : 50) / 100;
    if (!rb(sim).chance(clamp(F.tryChance * cur * (0.5 + fear), 0, 1))) return false;
    return Fiber.wrapOn(sim, a, b);
  };
  Fiber.dropWrap = function (sim, a, why) {
    const w = Fiber.wrapItem(sim, a); a.wearingWrap = null; if (!w) return;
    w.wornBy = null; w.form = "bundle"; delete w.layers; delete w.dur; w.x = Math.round(a.pos.x); w.y = Math.round(a.pos.y);
    if (why === "fall") { stats(sim).wrapFalls++; G.Sim.log(sim, a.name + " " + FC().lines.wrapFall, a); }
  };
  Fiber.stepWraps = function (sim, every) {
    const W = WC(), dt = every * TM(), deep = G.Climate.seasonIndex(sim.tick) === 3;
    for (const w of sim.items) {
      if (w.material !== "fiber" || w.form !== "wrap") continue;
      const a = sim.agents.find(q => q.id === w.wornBy);
      if (!a || a.wearingWrap !== w.id) { w.wornBy = null; w.form = "bundle"; delete w.layers; delete w.dur; continue; }   // wearer gone: it lies where she was
      w.x = Math.round(a.pos.x); w.y = Math.round(a.pos.y);
      const x = W.wearPerDay / 1440 * dt * (Reeds.rainOn(sim, w.x, w.y) ? W.rainX : 1) * (deep ? W.coldX : 1);
      w.dur = Math.round(Math.max(0, (w.dur != null ? w.dur : 100) - x) * 1e6) / 1e6;
      if (w.dur <= 0) Fiber.dropWrap(sim, a, "fall");
    }
  };

  // ---------- rope: lashed huts, lashed caches ----------
  const H = G.Hut, C = G.Cache;
  if (H) {
    const add0 = H.addTo, rate0 = H.decayRate, arr0 = H.arriveTend;
    H.lash = function (sim, a, h, cord) {
      if (!h || h.lashed || !Fiber.isCord(cord)) return false;
      if (cord.heldBy === a.id) { a.carry = null; a.carryUntil = null; cord.heldBy = null; }
      const ix = sim.items.indexOf(cord); if (ix >= 0) sim.items.splice(ix, 1);
      h.lashed = true; h.lashedAt = sim.tick; stats(sim).lashedHuts++;
      G.Sim.log(sim, a.name + " " + FC().lines.lash, a);
      disc(sim, a, "lash", ["hut", "cord"], "holds together", "First lashed hut");
      const e = G.Learn.add(a, "lash", FC().gain); e.n++; G.Learn.success(sim, a, "lash");
      return true;
    };
    H.addTo = function (sim, a, h, it) {
      if (Fiber.isCord(it)) return H.lash(sim, a, h, it);
      const before = h ? h.dur : null, ok = add0.call(H, sim, a, h, it);
      if (ok && h.lashed && h.dur > before) { h.dur = Math.min(100, h.dur + PC().hutPatchAdd); H.refresh(h); }
      return ok;
    };
    H.decayRate = function (sim, h) { return rate0.call(H, sim, h) * (h && h.lashed ? PC().hutDecayX : 1); };
    H.arriveTend = function (sim, a) {
      const h = H.huts(sim).find(q => q.id === (a.act && a.act.hutId)), held = G.Items.held(sim, a);
      if (h && Fiber.isCord(held) && !h.lashed) { H.lash(sim, a, h, held); G.Agent.startIdle(sim, a, 0.5); return true; }
      return arr0.call(H, sim, a);
    };
    // idle with a cord near one of her huts that is not lashed: tie it on (hut tend odds, every tend.everyMinutes)
    Fiber.maybeLash = function (sim, a) {
      const held = G.Items.held(sim, a); if (!Fiber.isCord(held) || !H.huts(sim).length) return false;
      const T = CF().hut.tend || {}, every = (T.everyMinutes != null ? T.everyMinutes : 30) / TM();
      if (a.lashTryAt != null && sim.tick - a.lashTryAt < every) return false; a.lashTryAt = sim.tick;
      if (G.Learn.score(a, "lash") < FC().scoreMin - 1e-9) return false;
      const t = G.Agent.tilePos(a), nt = T.noticeTiles != null ? T.noticeTiles : 6; let best = null;
      for (const h of H.huts(sim)) { if (h.lashed || (a.shelters || []).indexOf(h.id) < 0) continue; const [x, y] = h.tiles[0], d = Math.hypot(x - t.x, y - t.y); if (d <= nt && (!best || d < best.d)) best = { h, d, x, y }; }
      if (!best) return false;
      const cur = (a.traits && a.traits.curiosity != null ? a.traits.curiosity : 50) / 50;
      if (!rb(sim).chance(clamp((T.upgradeChance != null ? T.upgradeChance : 0.25) * cur, 0, 1))) return false;
      if (Math.hypot(best.x - a.pos.x, best.y - a.pos.y) <= 1.5) return H.lash(sim, a, best.h, held);
      return G.Agent.walkTo(sim, a, best.x, best.y, "hutTend", { hutId: best.h.id });
    };
  }
  if (C) {
    const cab0 = C.cacheable, full0 = C.full, stash0 = C.doStash;
    C.cacheable = it => Fiber.isCord(it) || cab0.call(C, it);
    C.lashed = (sim, c) => !!(c && sim.cacheLash && sim.cacheLash[c.key] != null);
    C.full = (sim, c) => C.pile(sim, c) >= ((CF().cache.pileMax != null ? CF().cache.pileMax : 4) + (C.lashed(sim, c) ? PC().cachePileAdd : 0));
    C.doStash = function (sim, a, spot) {
      const it = G.Items.held(sim, a);
      if (Fiber.isCord(it) && spot && spot.key && !C.lashed(sim, spot)) {   // a cord at a cache ties the pile: it holds one more
        a.carry = null; a.carryUntil = null; it.heldBy = null; const ix = sim.items.indexOf(it); if (ix >= 0) sim.items.splice(ix, 1);
        (sim.cacheLash || (sim.cacheLash = {}))[spot.key] = sim.tick; stats(sim).lashedCaches++;
        G.Sim.log(sim, a.name + " lashes the cache with cord", a);
        const e = G.Learn.add(a, "lash", FC().gain); e.n++; G.Learn.success(sim, a, "lash");
        C.remember(a, spot, ["cord"]); return true;
      }
      return stash0.call(C, sim, a, spot);
    };
    void full0;
  }

  // ---------- hook hub ----------
  V39.maybe = function (sim, a) {
    if (Fiber.maybeWrap(sim, a)) return true;
    if (Fiber.maybeLash && Fiber.maybeLash(sim, a)) return true;
    if (Fiber.maybe(sim, a)) return true;
    for (const f of V39.maybes) if (f(sim, a)) return true;
    return false;
  };
  V39.coldTry = function (sim, a) { if (Fiber.maybeWrap(sim, a)) return true; for (const f of V39.colds) if (f(sim, a)) return true; return false; };
  V39.arrive = function (sim, a, g) { const f = V39.arrives[g]; if (!f) return false; f(sim, a); return true; };
  V39.stepAct = function (sim, a) { const f = V39.acts[a.act.type]; if (!f) return false; if (!f(sim, a)) G.Agent.startIdle(sim, a); return true; };
  V39.step = function (sim) { Reeds.step(sim); for (const f of V39.steps || []) f(sim); };
  V39.steps = [];

  G.Reeds = Reeds; G.Fiber = Fiber; G.V39 = V39;
})(this.GS = this.GS || {});
