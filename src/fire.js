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
    for (const it of sim.items) if (!it.heldBy && it.x === x && it.y === y && G.Items.props(it).burns) d = Math.max(d, it.props.dryness);
    return d;
  };
  const dryFactor = d => Math.max(0, (d - F().minDryness) / (100 - F().minDryness));
  Fire.fuelName = function (sim, x, y) {
    const g = G.Climate.groundDryness(sim.world, x, y, sim.tick), st = sim.items.find(it => !it.heldBy && it.x === x && it.y === y && G.Items.props(it).burns && it.props.dryness > g);
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
    const gone = sim.items.filter(it => !it.heldBy && it.x === x && it.y === y && G.Items.props(it).burns);
    if (gone.length) { sim.items = sim.items.filter(it => !gone.includes(it)); sim.fireStats.itemsBurned = (sim.fireStats.itemsBurned || 0) + gone.length; }
    for (const b of sim.bodies) if (b.x === x && b.y === y && b.flesh > 0) { b.flesh = 0; b.stage = "bones"; b.stageAt = sim.tick; b.material = CF().body.material; b.burnt = true; G.Sim.log(sim, "Flames burn " + b.name + "'s body down to the bones", b); }
  }
  Fire.ignite = ignite;

  Fire.step = function (sim) {
    const keys = Object.keys(sim.fire); if (sim.fx.length) sim.fx = sim.fx.filter(f => sim.tick - f.t < 3);
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
