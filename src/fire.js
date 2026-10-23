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
    const per = L.perSeason[G.Climate.seasonIndex(sim.tick)] / (CF().time.daysPerSeason * 1440) * TM(); if (!(per > 0) || !sim.orng.chance(per)) return null;   // no draw when off, so a lightning-free run keeps its rng stream
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
  function ignite(sim, x, y, evId) {
    const ev = sim.fireStats.events[evId - 1], tl = W.tile(sim.world, x, y) === G.data.T.WOODS ? "woods" : "meadow";
    sim.fire[key(x, y)] = { s: "fire", t: sim.tick, end: sim.tick + mins(F().burnMinutes[tl]), ev: evId };
    ev.tiles++; sim.fireStats.tiles++;
    // what burns here: bushes (bare until the ground regrows), dry sticks (gone), flesh (bones remain)
    for (const b of sim.bushes) if (b.x === x && b.y === y && F().bushBurns) { b.ripe = false; b.burnt = true; b.regrow = -mins(F().ashMinutes + F().regrowMinutes); sim.fireStats.bushes = (sim.fireStats.bushes || 0) + 1; }
    // step 19 (Director call 1 on 18): a stick lying here is not burned away - it catches and burns on as a burning stick until the flames
    // here die down plus brand.litMinutes, then burns out
    for (const it of sim.items) if (!it.heldBy && it.x === x && it.y === y && G.Items.props(it).burns) {
      const until = sim.tick + mins(F().burnMinutes[tl] + F().brand.litMinutes); if (!it.lit) { sim.fireStats.itemsBurned = (sim.fireStats.itemsBurned || 0) + 1; sim.fireStats.brands = (sim.fireStats.brands || 0) + 1; }
      it.lit = Math.max(it.lit || 0, until); }
    for (const b of sim.bodies) if (b.x === x && b.y === y && b.flesh > 0) { if (G.Hunt && G.Hunt.carcassMeat(b)) { G.Sim.log(sim, "Flames sweep over " + b.name + "'s carcass", b); continue; }   // step 17: a carcass with meat is roasted by the heat (cook.js), not burned to bones
      b.flesh = 0; b.stage = "bones"; b.stageAt = sim.tick; b.material = CF().body.material; b.burnt = true; G.Sim.log(sim, "Flames burn " + b.name + "'s body down to the bones", b); }
  }
  Fire.ignite = ignite;

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
  // step 19: an idle person may go and take up a burning stick lying in sight, away from the flames. Emergent odds, the step-14 approach rule:
  // p = grabChance x (fire score / 50)^2 x (1.5 - fireFear / 100), rolled (learning stream) only when there is one to take.
  Fire.maybeGrab = function (sim, a) {
    if (a.carry != null) return false; const B = F().brand, R = CF().person.sightTiles; let best = null;
    for (const it of sim.items) { if (!it.lit || it.heldBy != null || it.lit - sim.tick < B.minLeftMinutes / TM()) continue;
      const d = Math.hypot(it.x - a.pos.x, it.y - a.pos.y); if (d > R || (best && d >= best.d)) continue;
      const st = sim.fire[key(it.x, it.y)]; if (st && st.s === "fire") continue; if (Fire.nearestFlame(sim, it.x, it.y) < F().fleeTiles) continue;
      if (sim.agents.some(b => b !== a && b.act.goal === "pickup" && b.act.target === it.id)) continue;
      best = { it, d }; }
    if (!best) return false;
    const p = Math.max(0, Math.min(1, B.grabChance * Math.pow(G.Learn.score(a, "fire") / 50, 2) * (1.5 - a.traits.fireFear / 100)));
    if (!sim.lrng.chance(p)) return false;
    const it = best.it; sim.fireStats.grabs = (sim.fireStats.grabs || 0) + 1;
    if (best.d === 0) return G.Items.pickUp(sim, a, it.id);
    if (G.Agent.claimed(sim, a, it.x, it.y)) return false;
    return G.Agent.walkTo(sim, a, it.x, it.y, "pickup", { target: it.id });
  };

  Fire.step = function (sim) {
    const keys = Object.keys(sim.fire); if (sim.fx.length) sim.fx = sim.fx.filter(f => sim.tick - f.t < 3);
    Fire.brands(sim);
    if (!keys.length) return;
    const Fc = F(), live = {};
    for (const k of keys) { const e = sim.fire[k]; if (!e) continue; const [x, y] = k.split(",").map(Number), ev = evOf(sim, e);
      if (e.s === "ember") {
        if (sim.orng.chance(Fc.emberToFire * (e.hold ? Fc.lightning.holdFlare : 1) * dryFactor(G.Climate.groundDryness(sim.world, x, y, sim.tick)) * TM() + (sim.items.some(it => !it.heldBy && it.x === x && it.y === y && G.Items.props(it).burns) ? Fc.emberToFire * TM() : 0))) {
          delete sim.fire[k]; ignite(sim, x, y, e.ev); if (!ev.fired) { ev.fired = true; sim.fireStats.fires++; G.Sim.log(sim, "The ember flares up: the " + (W.tile(sim.world, x, y) === G.data.T.WOODS ? "woods catch" : "grass catches") + " fire", ev.by);
            const who = sim.agents.find(a => a.id === ev.by) || (ev.byName ? { id: ev.by, name: ev.byName } : null); if (who && ev.combo) G.Discoveries.note(sim, who, ev.combo.action, [ev.combo.held, ev.combo.target, ev.fuel], "fire"); } }
        else if (sim.tick >= e.end) { delete sim.fire[k]; if (!ev.fired) { ev.end = sim.tick; ev.regrown = sim.tick; G.Sim.log(sim, "The ember goes out"); } }
      } else if (e.s === "fire") {
        for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (sim.fire[key(nx, ny)]) continue;
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
  G.Fire = Fire;
})(this.GS = this.GS || {});
