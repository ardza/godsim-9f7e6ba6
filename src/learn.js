// Steps 13-14: learning from experience. Each person keeps their own experience score per action (a.exp[key] = {score 0-100, n, burns, copied}).
// Scores move only from what that person felt (warmth from a fire / company / trees, a burn) or from copying someone close by whom she saw
// benefit (odds from curiosity and the action's fear trait). Copied scores are tagged with who she copied. No speech: log lines describe actions only.
// Rolls use their own seeded stream sim.lrng.
(function (G) {
  const CF = () => G.data.config, L = () => CF().learn, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;
  const Learn = {};
  Learn.newStats = () => ({ warmed: 0, burns: 0, approaches: 0, successes: 0, copies: 0, seeps: 0, byKey: {}, byStage: {} });
  const stats = sim => sim.learnStats || (sim.learnStats = Learn.newStats());
  const bump = (sim, what, key) => { const S = stats(sim); S[what] = (S[what] || 0) + 1; if (key) { const k = S.byKey[key] || (S.byKey[key] = {}); k[what] = (k[what] || 0) + 1; } };
  Learn.bump = bump;
  Learn.score = (a, key) => a.exp && a.exp[key] ? a.exp[key].score : L().start;
  Learn.rec = (a, key) => { const E = a.exp || (a.exp = {}); return E[key] || (E[key] = { score: L().start, n: 0, burns: 0, copied: null }); };
  Learn.add = (a, key, d) => { const e = Learn.rec(a, key); e.score = r2(clamp(e.score + d, 0, 100)); return e; };
  Learn.label = key => (L().actions[key] && L().actions[key].label) || key;
  Learn.short = key => (L().actions[key] && L().actions[key].short) || key;
  // what one visible success raises the doer's score by (step 20: a watching child gains seepX of this)
  Learn.gainOf = function (key) {
    const C = L(); if (C[key] && C[key].warmGain != null) return C.successWarmth * C[key].warmGain + (key === "fire" ? C.fireSuccessGain || 0 : 0);
    if (key === "hunt") return CF().hunt.gain; if (key === "cook") return CF().cook.gain; return 0;
  };
  // step 20: who taught her what: [{key, from, name, how: "copied" | "watched"}] (a copy wins over watching)
  Learn.learnedFrom = a => Object.keys(L().actions).map(k => { const e = a.exp && a.exp[k]; if (!e) return null; const c = e.copied || e.seep; return c ? { key: k, from: c.from, name: c.name, how: e.copied ? "copied" : "watched" } : null; }).filter(Boolean);
  const stageStats = (sim, st) => { const S = stats(sim), B = S.byStage || (S.byStage = {}); return B[st] || (B[st] = { seen: 0, copies: 0, seeps: 0, p: 0 }); };

  // nearest ember / fire tile to (x, y): {s, x, y, d} or null
  Learn.nearestFire = function (sim, x, y, kinds) {
    let best = null;
    for (const k in sim.fire) { const e = sim.fire[k]; if (kinds.indexOf(e.s) < 0) continue; const i = k.indexOf(","), fx = +k.slice(0, i), fy = +k.slice(i + 1), d = Math.hypot(fx - x, fy - y);
      if (!best || d < best.d) best = { s: e.s, x: fx, y: fy, d, hold: !!e.hold }; }
    return best;
  };

  // Each minute, after warmth is updated: what helped a cold person (warmth below fire.coldBelow before this minute) raises that action's score
  // by warmGain per warmth point it gave her. Every successWarmth points is one visible success others nearby may copy.
  Learn.stepWarmth = function (sim, a, felt, w0) {
    const C = L(); if (w0 >= C.fire.coldBelow) return;
    const Wm = CF().person.warmth, rate = G.Climate.warmthRate, parts = [];
    if (felt.heat > 0) { const e = Learn.nearestFire(sim, a.pos.x, a.pos.y, ["ember", "fire"]);
      if (e && (e.s === "ember" ? e.d <= C.fire.emberTiles + 1e-9 : e.d < CF().fire.heatTiles)) parts.push(["fire", felt.heat, C.fire.warmGain, e]); }
    if (felt.huddle) parts.push(["huddle", felt.huddle * Wm.huddleC, C.huddle.warmGain]);
    if (felt.sheltered) parts.push(["shelter", Wm.shelterC, C.shelter.warmGain]);
    if (felt.den > 0 && C.den) parts.push(["den", felt.den, C.den.warmGain]);   // step 21b: warmed inside a cave / overhang / thicket
    for (const [key, dC, gain, src] of parts) {
      const got = (rate(felt.c) - rate(felt.c - dC)) * TM(); if (got <= 0) continue;
      const e = Learn.add(a, key, got * gain), ep = a.learnEp || (a.learnEp = {});
      if (key === "fire") stats(sim).warmed += TM();
      ep[key] = r2((ep[key] || 0) + got);
      if (ep[key] >= C.successWarmth) { ep[key] = 0; e.n++;
        if (key === "fire") { Learn.add(a, "fire", C.fireSuccessGain || 0); childFear(sim, a); }   // Director (call 11 on 19): +10 a warming at a fire
        Learn.success(sim, a, key, src); }
    }
  };

  // step 20: a child warming at a fire with an adult close by grows less afraid of fire (fearDrop x fearChildX a warming)
  function childFear(sim, a) {
    const K = CF().child; if (!G.Family || !G.Family.isChild(a)) return;
    const near = sim.agents.some(b => b !== a && b.age >= K.adultAt && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= CF().social.nearTiles);
    if (!near) return; const was = a.traits.fireFear; a.traits.fireFear = r2(clamp(was - K.fearDrop * K.fearChildX, 0, 100));
    const S = stats(sim); S.childFearDrop = r2((S.childFearDrop || 0) + (was - a.traits.fireFear));
  }
  Learn._childFear = childFear;
  // a visible success: logged for fire (at most every 2 h each), then anyone awake within copyTiles may copy it
  Learn.success = function (sim, a, key, src) {
    bump(sim, "successes", key);
    if (key === "fire" && sim.tick - (a.warmLogAt == null ? -1e9 : a.warmLogAt) >= 120) { a.warmLogAt = sim.tick;
      G.Sim.log(sim, a.name + " warms up by the " + (src && src.s === "ember" ? "embers" : "fire"), a); }
    if (key === "fire" && G.Speech) G.Speech.onWarm(sim, a);
    Learn.watch(sim, a, key);
  };
  // copy odds for observer b (before the step-18 group factor applied in watch)
  Learn.copyChance = function (b, key) {
    const C = L(), act = C.actions[key] || {}, fear = act.fear ? b.traits[act.fear] : null;
    return clamp(C.copyChance * b.traits.curiosity / 50 * (fear == null ? 1 : 1.5 - fear / 100), 0, 1);
  };
  // step 20: the observer's stage multiplier (x2 a child, x1.5 a youth) when the doer is an adult
  Learn.stageX = function (b, a) {
    const F = G.Family; if (!F || !a || F.stage(a) !== "adult") return 1; const X = CF().child.copyX, st = F.stage(b); return X[st] || 1;
  };
  Learn.watch = function (sim, a, key) {
    const C = L(), K = CF().child, sa = Learn.score(a, key);
    for (const b of sim.agents) {
      if (b === a || b.act.type === "sleep" || Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) > C.copyTiles) continue;
      const own = Learn.score(b, key); if (sa <= own) continue;
      const st = G.Family ? G.Family.stage(b) : "adult", SS = stageStats(sim, st);
      // step 20: a child watching a parent / group member gains seepX of what the success gave the doer (no roll), up to the doer's score
      const kin = G.Family && G.Family.isChild(b) && ((b.parents && b.parents.indexOf(a.id) >= 0) || b.guard === a.id || (a.group != null && a.group === b.group));
      if (sa - own < C.copyMargin) { if (kin) seep(sim, b, a, key, sa, SS); continue; }
      const prev = b.exp && b.exp[key] && b.exp[key].copied; if (prev && prev.from === a.id && sim.tick - prev.t < 1440) { if (kin) seep(sim, b, a, key, sa, SS); continue; }   // one copy of the same person per day
      const p = clamp(Learn.copyChance(b, key) * (G.Social ? G.Social.copyFactor(a, b) : 1) * Learn.stageX(b, a), 0, 1);   // step 18: x1.25 group / x0.85 others; step 20: x2 child / x1.5 youth
      SS.seen++; SS.p = r2(SS.p + p);
      if (!sim.lrng.chance(p)) { if (kin) seep(sim, b, a, key, sa, SS); continue; }
      const e = Learn.rec(b, key); e.score = r2(own + (sa - own) * C.copyShare); e.copied = { from: a.id, name: a.name, t: sim.tick };
      bump(sim, "copies", key); SS.copies++;
      G.Sim.log(sim, b.name + " watched " + a.name + " and copied: " + Learn.label(key), [b, a]);
      if (G.Shelter) G.Shelter.copied(sim, b, a, key);   // step 21b: and now knows where that shelter is
    }
  };

  function seep(sim, b, a, key, sa, SS) {
    const e = Learn.rec(b, key), g = Math.min(sa, e.score + CF().child.seepX * Learn.gainOf(key)) - e.score; if (g <= 0) return;
    e.score = r2(e.score + g); e.seep = { from: a.id, name: a.name, t: sim.tick }; SS.seeps++; bump(sim, "seeps", key);
  }
  Learn._seep = seep;

  // Stepping onto a burning or smouldering tile is a burn: a sharp drop in her fire score and one line. No health damage. Returns the fire tile or null.
  Learn.checkBurn = function (sim, a) {
    const x = Math.round(a.pos.x), y = Math.round(a.pos.y), e = sim.fire[x + "," + y], F = L().fire;
    if (!e || (e.s !== "fire" && e.s !== "ember")) return null;
    if (sim.tick - (a.burnAt == null ? -1e9 : a.burnAt) < F.burnCooldown) return null;
    a.burnAt = sim.tick; const r = Learn.add(a, "fire", -F.burnDrop); r.burns++; a.stats.burns = (a.stats.burns || 0) + 1; bump(sim, "burns", "fire");
    G.Sim.log(sim, a.name + (e.s === "ember" ? " steps on the embers" : " steps into the flames") + " and jumps back, burned", a);
    return { s: e.s, x, y };
  };

  // When she is cold and seeking warmth: an ember in sight (or a fire within fireSight) may draw her over. Returns
  //   {stay: true} if she is already sitting close enough, {x, y, s} = a free tile near it to walk to, or null (keeps away / no fire / roll failed).
  // a tile within sit range of a burning stick that is clear of the flames (fleeTiles)
  function brandSeat(sim, a, it, sit, flee) { const R = Math.ceil(sit[1]);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const d = Math.hypot(dx, dy); if (d < sit[0] - 1e-9 || d > sit[1] + 1e-9) continue;
      const x = it.x + dx, y = it.y + dy; const f = sim.fire[x + "," + y]; if (G.World.walkable(sim.world, x, y) && !(f && (f.s === "fire" || f.s === "ember")) && G.Fire.fearedFlame(sim, a, x, y) >= flee) return true; }
    return false; }
  Learn.fireSpot = function (sim, a, free) {
    const F = L().fire, Fc = CF().fire, sight = CF().person.sightTiles;
    const em = Learn.nearestFire(sim, a.pos.x, a.pos.y, ["ember"]), fi = Learn.nearestFire(sim, a.pos.x, a.pos.y, ["fire"]);
    const LT = CF().fire.lightning, emSight = em && em.hold && LT ? Math.max(sight, LT.smokeTiles) : sight;   // step 16: a smouldering tree's smoke is seen from farther
    let t = (fi && fi.d <= F.fireSight) ? fi : (em && em.d <= emSight) ? em : null;
    // step 21: a burning stick lying on the ground warms like an ember; the nearest one in sight with a sitting tile clear of the flames
    // draws her when it is nearer than the fire / ember (or there is none)
    const B = Fc.brand, bs = B && B.sitTiles && G.Fire.groundBrands ? G.Fire.groundBrands(sim) : [];
    if (bs.length) { let bb = null; for (const it of bs) { const d = Math.hypot(it.x - a.pos.x, it.y - a.pos.y); if (d > sight || (bb && d >= bb.d) || (t && d > t.d + 1e-9)) continue;
        if (d > B.sitTiles[1] + 1e-9 && !brandSeat(sim, a, it, B.sitTiles, Fc.fleeTiles)) continue; bb = { s: "brand", x: it.x, y: it.y, d }; }
      if (bb) t = bb; }
    if (!t) return null;
    const lo = t.s === "ember" ? F.sitTiles[0] : t.s === "brand" ? B.sitTiles[0] : Fc.fleeTiles, hi = t.s === "ember" ? F.sitTiles[1] : t.s === "brand" ? B.sitTiles[1] : F.fireSitTiles + 0.5;
    if (t.d >= lo - 1e-9 && t.d <= hi + 1e-9) return Learn.score(a, "fire") >= F.stayMin ? { stay: true, s: t.s } : null;
    const seek = G.Agent.warmthSeekBelow(a), cold = clamp(0.5 + (seek - a.needs.warmth) / Math.max(1, seek), 0.5, 1.5);
    const p = clamp(F.approachChance * Math.pow(Learn.score(a, "fire") / 50, 2) * (1.5 - a.traits.fireFear / 100) * cold, 0, 1);
    if (!sim.lrng.chance(p)) return null;
    const R = Math.ceil(hi), c = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = t.x + dx, y = t.y + dy, d = Math.hypot(dx, dy);
      if (d < lo - 1e-9 || d > hi + 1e-9 || sim.fire[x + "," + y] && (sim.fire[x + "," + y].s === "fire" || sim.fire[x + "," + y].s === "ember") || !free(x, y)) continue;
      if (t.s === "brand" && G.Fire.fearedFlame(sim, a, x, y) < Fc.fleeTiles) continue;   // not a seat by a stick that is still next to flames
      c.push({ x, y, s: t.s, fx: t.x, fy: t.y, k: Math.hypot(x - a.pos.x, y - a.pos.y) }); }
    c.sort((p, q) => p.k - q.k || p.x - q.x || p.y - q.y);
    return c.length ? c : null;
  };

  G.Learn = Learn;
})(this.GS = this.GS || {});
