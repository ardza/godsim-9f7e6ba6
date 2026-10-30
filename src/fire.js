// Step 12: embers, fire, ash and scorched ground. State is a per-tile map sim.fire["x,y"] = {s, t, end, ev}, s = ember | fire | ash | scorched.
// Nothing here is scripted: whether a spark catches, and where flames spread, comes only from fuel dryness (ground by season + patch, or a stick's dryness).
// Fire burns bushes bare, burns sticks away and burns flesh off bodies (bones stay). People and animals only move away from it; there is no burn damage yet.
(function (G) {
  const CF = () => G.data.config, F = () => CF().fire, TM = () => CF().time.tickGameMinutes, W = G.World;
  const Fire = {};
  const key = (x, y) => x + "," + y;
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  Fire.init = sim => { sim.fire = sim.fire || {}; sim.fireStats = sim.fireStats || { sparks: 0, landed: 0, embers: 0, fires: 0, tiles: 0, events: [] }; sim.fx = sim.fx || []; };
  Fire.state = (sim, x, y) => sim.fire[key(x, y)] || null;
  const mins = m => Math.max(1, Math.round(m / TM()));

  // fuel dryness on a tile: the ground (none if it is burning, ash or scorched) or a burnable thing lying there, whichever is drier
  Fire.dryness = function (sim, x, y) {
    if (!W.inb(sim.world, x, y) || !W.walkable(sim.world, x, y) || sim.fire[key(x, y)]) return 0;
    if (G.Powers && G.Powers.wetAt(sim, x, y)) return 0;   // step 22: rained-on ground stays wet (no spark, spread, lightning or stick ember)
    let d = G.Climate.groundDryness(sim.world, x, y, sim.tick);
    for (const it of sim.items) if (!it.heldBy && !it.lit && it.x === x && it.y === y && G.Items.props(it).burns) d = Math.max(d, it.props.dryness);   // a burning stick is not fresh fuel
    return d;
  };
  const dryFactor = d => Math.max(0, (d - F().minDryness) / (100 - F().minDryness));
  Fire.fuelName = function (sim, x, y) {
    const g = G.Climate.groundDryness(sim.world, x, y, sim.tick), st = sim.items.find(it => !it.heldBy && !it.lit && it.x === x && it.y === y && G.Items.props(it).burns && it.props.dryness > g);
    if (st) return "dry " + G.Items.baseLabel(st);
    return W.tile(sim.world, x, y) === G.data.T.WOODS ? "dry leaf litter" : "dry grass";
  };

  // A spark lands on (x, y) from a strike by `who`; combo = {action, held, target} for the Discoveries record.
  Fire.spark = function (sim, x, y, who, combo) {
    const S = sim.fireStats; S.sparks++; sim.fx.push({ k: "spark", x, y, t: sim.tick });
    const d = Fire.dryness(sim, x, y); if (d <= F().minDryness) return null; S.landed++;
    if (!sim.orng.chance(F().igniteScale * dryFactor(d))) return null;
    const fuel = Fire.fuelName(sim, x, y), ev = { id: S.events.length + 1, start: sim.tick, x, y, by: who ? who.id : null, byName: who ? who.name : null, combo, fuel, tiles: 0, fired: false, end: null, regrown: null };
    S.events.push(ev); S.embers++;
    sim.fire[key(x, y)] = { s: "ember", t: sim.tick, end: sim.tick + mins(sim.orng.int(F().emberMinutes[0], F().emberMinutes[1])), ev: ev.id };
    G.Sim.log(sim, "A spark catches in the " + fuel + " and smoulders", who);
    if (who && combo) G.Discoveries.note(sim, who, combo.action, [combo.held, combo.target, fuel], "ember");
    return ev;
  };
  // Step 16 natural fire starts: lightning hits a random land tile (config.fire.lightning.perSeason strikes per season). It catches by the same
  // dryness rule as a spark; nobody started it, so no Discoveries line.
  Fire.lightning = function (sim) {
    const L = F().lightning; if (!L) return null;
    const si = G.Climate.seasonIndex(sim.tick); let rate = L.perSeason[si];
    // §38 / v35: storm odds ramp with year (climate.hard.stormX × hardT)
    const Hard = CF().climate.hard; if (Hard && Hard.stormX && G.Climate.hardT) {
      const ht = G.Climate.hardT(sim.tick); rate *= 1 + ((Hard.stormX[si] || 1) - 1) * ht;
    }
    const per = rate / (CF().time.daysPerSeason * 1440) * TM(); if (!(per > 0) || !sim.orng.chance(per)) return null;   // no draw when off, so a lightning-free run keeps its rng stream
    const w = sim.world, x = sim.orng.int(0, w.w - 1), y = sim.orng.int(0, w.h - 1), S = sim.fireStats; S.lightning = (S.lightning || 0) + 1;
    sim.fx.push({ k: "spark", x, y, t: sim.tick });
    const tree = W.tile(w, x, y) === G.data.T.WOODS, d = Math.min(100, Fire.dryness(sim, x, y) + (tree && Fire.dryness(sim, x, y) > 0 ? L.snagDry : 0));
    if (sim.fire[key(x, y)] || d <= F().minDryness || !sim.orng.chance(F().igniteScale * dryFactor(d))) { G.Sim.log(sim, "Lightning strikes the " + (W.walkable(w, x, y) ? (W.tile(w, x, y) === G.data.T.WOODS ? "woods" : "ground") : "water")); return null; }
    const fuel = Fire.fuelName(sim, x, y), ev = { id: S.events.length + 1, start: sim.tick, x, y, by: null, byName: null, combo: null, fuel: tree ? "struck tree" : fuel, tiles: 0, fired: false, end: null, regrown: null, lightning: true };
    S.events.push(ev); S.embers++; S.lightningEmbers = (S.lightningEmbers || 0) + 1;
    const span = tree ? L.holdMinutes : F().emberMinutes;
    sim.fire[key(x, y)] = { s: "ember", t: sim.tick, end: sim.tick + mins(sim.orng.int(span[0], span[1])), ev: ev.id, hold: tree || undefined };
    G.Sim.log(sim, tree ? "Lightning strikes a tree and it smoulders" : "Lightning strikes and the " + fuel + " smoulders");
    return ev;
  };
  function evOf(sim, e) { return sim.fireStats.events[e.ev - 1]; }
  // v38 (g): a tile with no fuel (sand, rock: no grass or litter) and no burnable thing lying on it cannot hold a flame
  Fire.hasFuel = (sim, x, y) => { const t = W.tile(sim.world, x, y), T = G.data.T; if (t === T.MEADOW || t === T.WOODS) return true;
    return sim.items.some(it => !it.heldBy && it.x === x && it.y === y && G.Items.props(it).burns); };
  function ignite(sim, x, y, evId) {
    if (!Fire.hasFuel(sim, x, y)) return false;
    const ev = sim.fireStats.events[evId - 1], tl = W.tile(sim.world, x, y) === G.data.T.WOODS ? "woods" : "meadow";
    sim.fire[key(x, y)] = { s: "fire", t: sim.tick, end: sim.tick + mins(F().burnMinutes[tl]), ev: evId };
    ev.tiles++; sim.fireStats.tiles++;
    // what burns here: bushes (bare until the ground regrows), dry sticks (gone), flesh (bones remain)
    for (const b of sim.bushes) if (b.x === x && b.y === y && F().bushBurns) { b.ripe = false; b.burnt = true; b.regrow = -mins(F().ashMinutes + F().regrowMinutes); sim.fireStats.bushes = (sim.fireStats.bushes || 0) + 1; }
    // step 19 (Director call 1 on 18): a stick lying here is not burned away - it catches and burns on as a burning stick until the flames
    // here die down plus brand.litMinutes, then burns out
    for (const it of sim.items) if (!it.heldBy && it.x === x && it.y === y && G.Items.props(it).burns) {
      const until = sim.tick + mins(F().burnMinutes[tl] + F().brand.litMinutes); if (!it.lit) { sim.fireStats.itemsBurned = (sim.fireStats.itemsBurned || 0) + 1; sim.fireStats.brands = (sim.fireStats.brands || 0) + 1; }
      it.lit = Math.max(it.lit || 0, until); if (ev && ev.lightning) it.bolt = 1; }   // step 23: lit by a lightning fire
    for (const b of sim.bodies) if (b.x === x && b.y === y && b.flesh > 0) { if (G.Hunt && G.Hunt.carcassMeat(b)) { G.Sim.log(sim, "Flames sweep over " + b.name + "'s carcass", b); continue; }   // step 17: a carcass with meat is roasted by the heat (cook.js), not burned to bones
      b.flesh = 0; b.stage = "bones"; b.stageAt = sim.tick; b.material = CF().body.material; b.burnt = true; G.Sim.log(sim, "Flames burn " + b.name + "'s body down to the bones", b); }
  }
  Fire.ignite = ignite;
  // Director (step 20 call 2): a stick lying within brand.catchTiles of a burning tile catches -> a burning stick until these flames die + litMinutes
  function catchNear(sim, x, y, e) { const R = F().brand.catchTiles; if (!R) return;
    for (const it of sim.items) { if (it.heldBy != null || it.lit || Math.max(Math.abs(it.x - x), Math.abs(it.y - y)) > R || !G.Items.props(it).burns || (G.Powers && G.Powers.wetAt(sim, it.x, it.y))) continue;
      it.lit = e.end + mins(F().brand.litMinutes); const S = sim.fireStats; if (evOf(sim, e) && evOf(sim, e).lightning) { it.bolt = 1; S.boltSticks = (S.boltSticks || 0) + 1; }   // step 23
      S.brands = (S.brands || 0) + 1; S.caught = (S.caught || 0) + 1;
      if (sim.tick - (S.caughtLogAt == null ? -1e9 : S.caughtLogAt) >= 60) { S.caughtLogAt = sim.tick; G.Sim.log(sim, "A stick by the flames catches fire"); } } }
  Fire.catchNear = catchNear;

  // step 19: burning sticks. Burn out at it.lit (in the hand or on the ground). One lying on a tile with no fire of its own may set that tile
  // smouldering by the ember rule, p per minute = emberToFire x dryness factor of what is there (ground or another dry stick) -> a new ember.
  Fire.brands = function (sim) {
    let any = false; for (const it of sim.items) if (it.lit) { any = true; break; } if (!any) return;   // no draw while there are none
    const Fc = F(), out = [];
    for (const it of sim.items) { if (!it.lit) continue;
      if (sim.tick >= it.lit) { out.push(it); const h = it.heldBy != null ? sim.agents.find(a => a.id === it.heldBy) : null;
        if (h) { h.carry = null; h.carryUntil = null; G.Sim.log(sim, h.name + "'s burning stick burns out", h); }
        sim.fireStats.brandsOut = (sim.fireStats.brandsOut || 0) + 1; continue; }
      if (it.heldBy != null || sim.fire[key(it.x, it.y)]) continue;
      const d = Fire.dryness(sim, it.x, it.y); if (d <= Fc.minDryness || !sim.orng.chance(Fc.emberToFire * dryFactor(d) * TM())) continue;
      const S = sim.fireStats, fuel = Fire.fuelName(sim, it.x, it.y), who = it.lastBy != null ? (sim.agents.find(a => a.id === it.lastBy) || { id: it.lastBy, name: it.lastByName }) : null;
      const combo = who ? { action: "lay down", held: "burning stick", target: fuel } : null;
      const ev = { id: S.events.length + 1, start: sim.tick, x: it.x, y: it.y, by: who ? who.id : null, byName: who ? who.name : null, combo, fuel, tiles: 0, fired: false, end: null, regrown: null, brand: true };
      S.events.push(ev); S.embers++; S.brandEmbers = (S.brandEmbers || 0) + 1;
      sim.fire[key(it.x, it.y)] = { s: "ember", t: sim.tick, end: sim.tick + mins(sim.orng.int(Fc.emberMinutes[0], Fc.emberMinutes[1])), ev: ev.id };
      G.Sim.log(sim, "The burning stick sets the " + fuel + " smouldering", who && who.id != null ? who : undefined);
      if (who) G.Discoveries.note(sim, who, combo.action, [combo.held, combo.target], "ember");
    }
    if (out.length) sim.items = sim.items.filter(it => !out.includes(it));
  };
  // Director (call 11 on 19): once each game hour, an awake idle person (not a child) by an ember / fire with a burning stick lying within reachTiles,
  // away from the flames, takes it up with p = hourChance + grabChance x (fire score / 50)^2 x (1.5 - fireFear / 100) (learning stream).
  Fire.byFire = function (sim, a) {
    const LF = CF().learn.fire, e = G.Learn.nearestFire(sim, a.pos.x, a.pos.y, ["ember", "fire"]);
    return !!e && (e.s === "ember" ? e.d <= LF.emberTiles + 1e-9 : e.d < F().heatTiles);
  };
  // Director (21): someone warming within brand.warmTiles (Chebyshev) of a burning stick lying on the ground rolls each hour too
  Fire.byBrand = (sim, a) => { const R = F().brand.warmTiles || 0; return R > 0 && sim.items.some(it => it.lit && it.heldBy == null && Math.max(Math.abs(it.x - Math.round(a.pos.x)), Math.abs(it.y - Math.round(a.pos.y))) <= R); };
  Fire.grabOdds = (a) => { const B = F().brand; return Math.max(0, Math.min(1, (B.hourChance || 0) + B.grabChance * Math.pow(G.Learn.score(a, "fire") / 50, 2) * (1.5 - (a.traits.fireFear + (a.fright ? a.fright.v : 0)) / 100))); };   // step 23: + fright after a strike
  Fire.grabHour = function (sim) {
    if (!sim.items.some(it => it.lit && it.heldBy == null)) return;
    for (const a of sim.agents.slice()) if (a.act.type === "idle" && a.carry == null && !(G.Family && G.Family.isChild(a)) && (Fire.byFire(sim, a) || Fire.byBrand(sim, a))) Fire.maybeGrab(sim, a);
    for (const a of sim.agents.slice()) if (a.act.type !== "sleep" && !DRAW_BUSY[a.act.goal] && a.needs.fullness >= F().brand.drawNeeds && a.needs.water >= F().brand.drawNeeds && a.carry == null && !(G.Family && G.Family.isChild(a)) && !Fire.byFire(sim, a) && !Fire.byBrand(sim, a)) Fire.drawToBrand(sim, a);
  };
  // step 21: a burning stick lying on the ground draws someone who has learnt fire (score >= brand.drawScore) to sit by it, cold or not:
  // odds drawChance x (score/50)^2 x (1.5 - fireFear/100), to a free seat within sitTiles of it clear of the flames she fears
  const DRAW_BUSY = { fleeFire: 1, burnt: 1, fireside: 1, pickup: 1, beside: 1, baby: 1, collapse: 1, mate: 1 };
  Fire.drawToBrand = function (sim, a) {
    const B = F().brand, Lr = G.Learn, sc = Lr.score(a, "fire"); if (!B.drawChance || sc < B.drawScore) return false;
    let best = null; for (const it of Fire.groundBrands(sim)) { const d = Math.hypot(it.x - a.pos.x, it.y - a.pos.y); if (d <= B.sitTiles[1] + 1e-9 || d > B.drawTiles || (best && d >= best.d)) continue;
      if (d * G.Agent.minutesPerTile(a) > (it.lit - sim.tick) * TM() - B.minLeftMinutes) continue; best = { it, d }; }   // burnt down before she could get there
    if (!best || !sim.lrng.chance(Math.max(0, Math.min(1, B.drawChance * Math.pow(sc / 50, 2) * (1.5 - a.traits.fireFear / 100))))) return false;
    const it = best.it, R = Math.ceil(B.sitTiles[1]), c = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = it.x + dx, y = it.y + dy, d = Math.hypot(dx, dy); if (d < B.sitTiles[0] - 1e-9 || d > B.sitTiles[1] + 1e-9) continue;
      const f = sim.fire[key(x, y)]; if (!W.walkable(sim.world, x, y) || (f && (f.s === "fire" || f.s === "ember")) || G.Agent.claimed(sim, a, x, y) || Fire.fearedFlame(sim, a, x, y) < F().fleeTiles) continue;
      c.push({ x, y, d: Math.hypot(x - a.pos.x, y - a.pos.y) }); }
    c.sort((p, q) => p.d - q.d);
    // only if it will still burn minLeftMinutes when she gets there (walk time from her speed)
    const left = (it.lit - sim.tick) * TM() - B.minLeftMinutes, mpt = G.Agent.minutesPerTile(a);
    for (const q of c.slice(0, 4)) { const path = W.findPath(sim.world, Math.round(a.pos.x), Math.round(a.pos.y), q.x, q.y); if (!path || path.length * mpt > left) continue;
      if (G.Agent.walkTo(sim, a, q.x, q.y, "fireside", { fire: "brand" })) { sim.fireStats.brandDraws = (sim.fireStats.brandDraws || 0) + 1; return true; } }
    return false;
  };
  Fire.maybeGrab = function (sim, a) {
    if (a.carry != null || (G.Family && G.Family.isChild(a))) return false; const B = F().brand, R = B.reachTiles; let best = null;
    for (const it of sim.items) { if (!it.lit || it.heldBy != null || it.lit - sim.tick < B.minLeftMinutes / TM()) continue;
      const d = Math.hypot(it.x - a.pos.x, it.y - a.pos.y); if (d > R || (best && d >= best.d)) continue;
      const st = sim.fire[key(it.x, it.y)]; if (st && st.s === "fire") continue;
      const beside = Math.max(Math.abs(it.x - Math.round(a.pos.x)), Math.abs(it.y - Math.round(a.pos.y))) <= (B.warmTiles || 0);   // already warming by it: no flee check
      const reach = B.reachFlameTiles != null && Fire.byFire(sim, a) && Fire.nearestFlame(sim, it.x, it.y) >= B.reachFlameTiles - 1e-9;   // warming at the fire: reaches in for one beside the flames
      if (!beside && !reach && Fire.fearedFlame(sim, a, it.x, it.y) < F().fleeTiles) continue;
      if (sim.agents.some(b => b !== a && b.act.goal === "pickup" && b.act.target === it.id)) continue;
      best = { it, d }; }
    if (!best) return false;
    const p = Fire.grabOdds(a); sim.fireStats.grabRolls = (sim.fireStats.grabRolls || 0) + 1;
    if (!sim.lrng.chance(p)) return false;
    const it = best.it; sim.fireStats.grabs = (sim.fireStats.grabs || 0) + 1;
    if (best.d === 0) return G.Items.pickUp(sim, a, it.id);
    if (G.Agent.claimed(sim, a, it.x, it.y)) return false;
    return G.Agent.walkTo(sim, a, it.x, it.y, "pickup", { target: it.id, brand: true });
  };
  // step 21: lit sticks lying on the ground that can draw a cold person (not on a burning tile, minLeftMinutes+ left)
  Fire.groundBrands = sim => sim.items.filter(it => it.lit && it.heldBy == null && it.lit - sim.tick >= F().brand.minLeftMinutes / TM() && !(sim.fire[key(it.x, it.y)] && sim.fire[key(it.x, it.y)].s === "fire"));

  Fire.step = function (sim) {
    const keys = Object.keys(sim.fire); if (sim.fx.length) sim.fx = sim.fx.filter(f => sim.tick - f.t < 3);
    Fire.brands(sim);
    if ((sim.tick * TM()) % 60 === 0) Fire.grabHour(sim);   // once each game hour
    const BS = CF().powers && CF().powers.boltStick; if (BS && (sim.tick * TM()) % BS.everyMinutes === 0) Fire.boltLook(sim);   // step 23: sticks lit by lightning
    if (!keys.length) return;
    const Fc = F(), live = {};
    for (const k of keys) { const e = sim.fire[k]; if (!e) continue; const [x, y] = k.split(",").map(Number), ev = evOf(sim, e);
      if (e.s === "ember") {
        if (!(G.Powers && G.Powers.wetAt(sim, x, y)) && sim.orng.chance(Fc.emberToFire * (e.hold ? Fc.lightning.holdFlare : 1) * dryFactor(G.Climate.groundDryness(sim.world, x, y, sim.tick)) * TM() + (sim.items.some(it => !it.heldBy && it.x === x && it.y === y && G.Items.props(it).burns) ? Fc.emberToFire * TM() : 0))) {
          delete sim.fire[k]; ignite(sim, x, y, e.ev); if (!ev.fired) { ev.fired = true; sim.fireStats.fires++; G.Sim.log(sim, "The ember flares up: the " + (W.tile(sim.world, x, y) === G.data.T.WOODS ? "woods catch" : "grass catches") + " fire", ev.by);
            const who = sim.agents.find(a => a.id === ev.by) || (ev.byName ? { id: ev.by, name: ev.byName } : null); if (who && ev.combo) G.Discoveries.note(sim, who, ev.combo.action, [ev.combo.held, ev.combo.target, ev.fuel], "fire"); } }
        else if (sim.tick >= e.end) { delete sim.fire[k]; if (!ev.fired) { ev.end = sim.tick; ev.regrown = sim.tick; G.Sim.log(sim, "The ember goes out"); } }
      } else if (e.s === "fire") {
        catchNear(sim, x, y, e);   // step 20 call 2: sticks lying next to the flames catch
        // v38 (g): burn budget - once this fire has burned fire.burnBudget tiles it spreads no further (the burning tiles still burn out)
        for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (sim.fire[key(nx, ny)]) continue; if (Fc.burnBudget > 0 && ev && ev.tiles >= Fc.burnBudget) break;
          const d = Fire.dryness(sim, nx, ny); if (d > Fc.minDryness && sim.orng.chance(Fc.spreadScale * dryFactor(d) * TM() * (dx && dy ? 0.7 : 1))) ignite(sim, nx, ny, e.ev); }
        if (sim.tick >= e.end) { e.s = "ash"; e.t = sim.tick; e.end = sim.tick + mins(Fc.ashMinutes); }
      } else if (e.s === "ash") { if (sim.tick >= e.end) { e.s = "scorched"; e.t = sim.tick; e.end = sim.tick + mins(Fc.regrowMinutes); } }
      else if (e.s === "scorched" && sim.tick >= e.end) delete sim.fire[k];
    }
    // per event: burned out (no ember/fire left) and regrown (nothing left at all)
    for (const k in sim.fire) { const e = sim.fire[k]; (live[e.ev] = live[e.ev] || { burning: 0, any: 0 }).any++; if (e.s === "fire" || e.s === "ember") live[e.ev].burning++; }
    for (const ev of sim.fireStats.events) {
      if (ev.end == null && ev.fired && !(live[ev.id] && live[ev.id].burning)) { ev.end = sim.tick; G.Sim.log(sim, "The fire has burned out, leaving ash"); }
      if (ev.regrown == null && ev.end != null && !live[ev.id]) { ev.regrown = sim.tick; if (ev.fired) G.Sim.log(sim, "Grass grows back over the burned ground"); }
    }
  };

  // heat felt at (x, y): strongest nearby flame, falling off linearly to 0 at heatTiles (an ember gives a third)
  Fire.heatAt = function (sim, x, y) {
    const Fc = F(); let h = 0;
    for (const k in sim.fire) { const e = sim.fire[k]; if (e.s !== "fire" && e.s !== "ember") continue; const [fx, fy] = k.split(",").map(Number), d = Math.hypot(fx - x, fy - y);
      if (d < Fc.heatTiles) h = Math.max(h, Fc.heatC * (1 - d / Fc.heatTiles) * (e.s === "ember" ? 1 / 3 : 1)); }
    for (const it of sim.items) { if (!it.lit) continue;   // step 19: a burning stick (held or lying) warms like an ember
      let bx = it.x, by = it.y; if (it.heldBy != null) { const hd = sim.agents.find(q => q.id === it.heldBy); if (!hd) continue; bx = hd.pos.x; by = hd.pos.y; }
      const d = Math.hypot(bx - x, by - y); if (d < Fc.heatTiles) h = Math.max(h, Fc.heatC * (1 - d / Fc.heatTiles) / 3); }
    return Math.round(h * 100) / 100;
  };
  Fire.flames = sim => { const o = []; for (const k in sim.fire) { const e = sim.fire[k]; if (e.s === "fire") { const [x, y] = k.split(",").map(Number); o.push([x, y]); } } return o; };
  Fire.nearestFlame = function (sim, x, y) { let d = Infinity; for (const k in sim.fire) { if (sim.fire[k].s !== "fire") continue; const [fx, fy] = k.split(",").map(Number); d = Math.min(d, Math.hypot(fx - x, fy - y)); } return d; };
  // step 20 call 2: fire score braveScore+ -> flames of a struck tree (lightning event) count only within braveTiles
  Fire.brave = a => !!a && G.Learn.score(a, "fire") >= F().brand.braveScore;
  // step 23: a stick lit by a lightning fire (it.bolt) lying in sight draws a free adult: chance x clamp(0.5 + (curiosity - fireFear - fright) / 100) every
  // boltStick.everyMinutes to walk over and pick it up (the walk is marked bolt: the flee rule does not turn her back; a burning tile on the way still burns)
  const BOLT_FREE = { wander: 1, settle: 1, follow: 1, keep: 1 };
  Fire.boltLook = function (sim) {
    const BS = CF().powers.boltStick, B = F().brand, sticks = Fire.groundBrands(sim).filter(it => it.bolt); if (!sticks.length) return 0; let n = 0;
    for (const a of sim.agents) {
      if (a.carry != null || (G.Family && G.Family.isChild(a)) || !(a.act.type === "idle" || (a.act.type === "walk" && BOLT_FREE[a.act.goal])) || (a.runUntil && sim.tick < a.runUntil) || G.Agent.want(a)) continue;
      let best = null, mpt = G.Agent.minutesPerTile(a);
      for (const it of sticks) { const d = Math.hypot(it.x - a.pos.x, it.y - a.pos.y); if (d > BS.seeTiles || (best && d >= best.d)) continue;
        if (d * mpt > (it.lit - sim.tick) * TM() - B.minLeftMinutes || sim.agents.some(b => b !== a && b.act.goal === "pickup" && b.act.target === it.id)) continue; best = { it, d }; }
      if (!best) continue;
      const fear = a.traits.fireFear + (a.fright ? a.fright.v : 0), p = BS.chance * Math.max(0, Math.min(1, 0.5 + ((a.traits.curiosity || 0) - fear) / 100)), S = sim.fireStats;
      S.boltRolls = (S.boltRolls || 0) + 1; if (!sim.lrng.chance(p)) continue;
      const it = best.it;
      if (Math.round(a.pos.x) === it.x && Math.round(a.pos.y) === it.y && a.act.type === "idle") { if (G.Items.pickUp(sim, a, it.id)) { S.boltWalks = (S.boltWalks || 0) + 1; n++; } continue; }
      if (G.Agent.claimed(sim, a, it.x, it.y)) continue;
      if (G.Agent.walkTo(sim, a, it.x, it.y, "pickup", { target: it.id, brand: true, bolt: true })) { S.boltWalks = (S.boltWalks || 0) + 1; n++; G.Sim.log(sim, a.name + " creeps toward the smouldering stick", a); }
    }
    return n;
  };
  Fire.fearedFlame = function (sim, a, x, y) { if (!Fire.brave(a)) return Fire.nearestFlame(sim, x, y); const B = F().brand; let d = Infinity;
    for (const k in sim.fire) { const e = sim.fire[k]; if (e.s !== "fire") continue; const [fx, fy] = k.split(",").map(Number), dd = Math.hypot(fx - x, fy - y), ev = evOf(sim, e);
      if (ev && ev.lightning && dd > B.braveTiles) continue; d = Math.min(d, dd); } return d; };
  Fire.burning = sim => { for (const k in sim.fire) if (sim.fire[k].s === "fire") return true; return false; };
  Fire.groundBare = (sim, x, y) => !!sim.fire[key(x, y)];   // burning, ash or scorched: no grass to graze
  // pick a reachable tile ~fleeTo tiles away that is farthest from every flame (for people and animals)
  Fire.awayTile = function (sim, x, y, free) {
    const fl = Fire.flames(sim), R = F().fleeTo; let best = null;
    for (let k = 0; k < 16; k++) { const ang = k / 16 * Math.PI * 2;
      for (const d of [R, R + 3]) { const tx = Math.round(x + Math.cos(ang) * d), ty = Math.round(y + Math.sin(ang) * d);
        if (!W.inb(sim.world, tx, ty) || !free(tx, ty) || sim.fire[key(tx, ty)] && sim.fire[key(tx, ty)].s === "fire") continue;
        let m = Infinity; for (const [fx, fy] of fl) m = Math.min(m, Math.hypot(fx - tx, fy - ty)); if (!best || m > best.m) best = { x: tx, y: ty, m }; } }
    return best;
  };
  // v38 (g) fixture (test / Tester; ?fixture=fire&kind=..., GS.debug.fireFixture). Moves the clock forward to the middle of the case's season,
  // picks a tile of that case (seeded by opts.seed, its own rng so the sim's streams are untouched) and sets it alight (a new event; flames
  // on sand do not take). kinds: meadow (High Sun dry meadow away from water, default), wet (rained on, rain over), rain (rain falling),
  // nearwater (meadow next to a river or lake), shore (dry meadow beside such ground: flames reach near-water tiles), sand, cold (Deep Cold meadow), woods (High Sun woods). Returns { kind, x, y, ev } or null.
  const KIND_SEASON = { meadow: 1, wet: 1, rain: 1, nearwater: 1, shore: 1, sand: 1, woods: 1, cold: 3 };
  Fire.nearWaterTile = (w, x, y) => { const T = G.data.T; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = W.tile(w, x + dx, y + dy); if (t === T.RIVER || t === T.LAKE) return true; } return false; };
  Fire.fixtureCase = function (sim, kind, x, y) { const w = sim.world, T = G.data.T, t = W.tile(w, x, y), nw = Fire.nearWaterTile(w, x, y);
    if (kind === "sand") return t === T.SAND;
    if (kind === "woods") return t === T.WOODS && !nw;
    if (kind === "nearwater") return t === T.MEADOW && nw;
    if (kind === "cold") return t === T.MEADOW && !nw;
    if (kind === "shore") { if (t !== T.MEADOW || nw) return false; for (const [dx, dy] of N8) { const u = W.tile(w, x + dx, y + dy); if ((u === T.MEADOW || u === T.WOODS) && Fire.nearWaterTile(w, x + dx, y + dy)) return true; } return false; }
    return t === T.MEADOW && !nw && G.Climate.groundDryness(w, x, y, sim.tick) > 0 && !(W.hillAt && W.hillAt(w, x, y)); };
  Fire.fixture = function (sim, opts) {
    opts = opts || {}; Fire.init(sim); const kind = KIND_SEASON[opts.kind] != null ? opts.kind : "meadow", Tm = CF().time, FX = F().fixture, w = sim.world;
    const season = Tm.daysPerSeason * 1440 / TM(), year = season * Tm.seasons.length, off = Tm.startMinute / TM();
    let t = Math.floor((sim.tick + off) / year) * year + KIND_SEASON[kind] * season + Math.round(season / 2) - off; if (t < sim.tick) t += year; sim.tick = t;
    if (kind === "wet" || kind === "rain") { G.Powers.cast(sim, "rain", w.w >> 1, w.h >> 1, FX.rainStrength); const e = sim.powers.effects.find(q => q.k === "rain" && !q.done);
      if (e) { e.r = w.w + w.h; e.wetEnd = 1e9; e.bushEnd = 1e9; if (kind === "rain") { e.on = true; e.end = 1e9; } else { e.on = false; e.end = sim.tick; } } }
    const E = FX.edgeTiles, cand = [];
    for (let y = E; y < w.h - E; y++) for (let x = E; x < w.w - E; x++) if (!sim.fire[key(x, y)] && Fire.fixtureCase(sim, kind, x, y)) cand.push([x, y]);
    if (!cand.length) return null;
    const r = new G.RNG(((opts.seed != null ? opts.seed : w.seed) * 7919) >>> 0), [x, y] = cand[r.int(0, cand.length - 1)], S = sim.fireStats;
    const ev = { id: S.events.length + 1, start: sim.tick, x, y, by: null, byName: null, combo: null, fuel: Fire.fuelName(sim, x, y), tiles: 0, fired: true, end: null, regrown: null, fixture: kind };
    S.events.push(ev); S.fires++;
    if (ignite(sim, x, y, ev.id) === false) { ev.end = sim.tick; ev.regrown = sim.tick; G.Sim.log(sim, "A flame touches the bare sand and dies"); }
    else G.Sim.log(sim, "Flames take hold in the " + ev.fuel);
    return { kind, x, y, ev };
  };
  G.Fire = Fire;
})(this.GS = this.GS || {});
