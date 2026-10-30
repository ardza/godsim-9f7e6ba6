// Step 17: cooking. Nothing is scripted. Meat heats while it is close to an ember or a fire (in a hand, on the ground, or still on a carcass).
// Heat adds up minute by minute (config.cook): from cookedAt minutes it is cooked, past charredAt it is charred. Eating it gives the fullness and
// sickness odds of its state (raw: config.meat; cooked / charred: config.cook). A hungry person with raw meat in hand and a fire in sight may hold it
// there on purpose: p = holdChance x (cook score / 50)^2 x (1.5 - fireFear/100) (score 0-100, 50 = no experience). Eating cooked meat is a success (+gain, others within
// copyTiles may copy it); eating charred meat lowers the score. The first cooked meal is noted in Discoveries from what happened.
// Rolls: the decision uses the learning stream (lrng).
(function (G) {
  const CF = () => G.data.config, K = () => CF().cook, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r9 = v => Math.round(v * 1e9) / 1e9;
  const Cook = {};
  const stats = sim => sim.cookStats || (sim.cookStats = { holds: 0, cooked: 0, charred: 0, eaten: { raw: 0, cooked: 0, charred: 0 }, carcass: 0 });
  Cook.stats = stats;

  Cook.state = heat => heat > K().charredAt ? "charred" : heat >= K().cookedAt ? "cooked" : "raw";
  Cook.of = it => Cook.state(it && it.heat || 0);
  Cook.fullness = it => { if (it && it.material === "rotten") return CF().food.rottenFullness; const s = Cook.of(it); return s === "raw" ? CF().meat.fullness : K().fullness[s]; };
  // v38 (c): rotten food = rottenSickX x the raw-meat chance (same sickness); dried meat keeps the odds of its cook state
  Cook.sickChance = it => { if (it && it.material === "rotten") return Math.min(1, CF().meat.sickChance * CF().food.rottenSickX); const s = Cook.of(it); return s === "raw" ? CF().meat.sickChance : K().sickChance[s]; };
  Cook.label = it => it && it.material === "rotten" ? "rotten food" : it && it.dried ? (Cook.of(it) === "raw" ? "dried meat" : "dried " + Cook.of(it) + " meat") : Cook.of(it) + " meat";
  // close enough to cook: an ember within emberTiles or a fire within fireTiles (people keep fire.fleeTiles from flames, so that ring is "next to" a fire)
  Cook.hot = function (sim, x, y) {
    const e = G.Learn.nearestFire(sim, x, y, ["ember"]); if (e && e.d <= K().emberTiles + 1e-9) return e;
    const f = G.Learn.nearestFire(sim, x, y, ["fire"]); return f && f.d <= K().fireTiles + 1e-9 ? f : null;
  };

  function warm(sim, o, x, y, who, what) {
    if (!Cook.hot(sim, x, y)) return;
    const s0 = Cook.state(o.heat || 0); o.heat = r9((o.heat || 0) + TM()); const s1 = Cook.state(o.heat); if (s1 === s0) return;
    const S = stats(sim); S[s1]++;
    G.Sim.log(sim, what + (s1 === "cooked" ? " is cooked through by the heat" : " chars black"), who || null);
  }
  // each minute: meat close to heat warms (held, lying on the ground, or on a fresh carcass)
  Cook.step = function (sim) {
    if (!sim.fire || !Object.keys(sim.fire).length) return;
    for (const it of sim.items) { if (it.material !== "meat") continue;
      const h = it.heldBy != null ? sim.agents.find(q => q.id === it.heldBy) : null;
      if (h) warm(sim, it, Math.round(h.pos.x), Math.round(h.pos.y), h, "The meat " + h.name + " holds");
      else warm(sim, it, it.x, it.y, null, "A piece of meat by the fire"); }
    for (const b of sim.bodies) if (G.Hunt.carcassMeat(b)) { const was = b.heat || 0; warm(sim, b, b.x, b.y, null, b.name + "'s carcass"); if (!was && b.heat) stats(sim).carcass++; }
  };

  // hungry, raw meat in hand, an ember or fire in sight: maybe hold it there first. Returns true if she set off (or is already close enough).
  Cook.seek = function (sim, a, it) {
    if (!it || Cook.of(it) !== "raw") return false;
    const Kc = K(), em = G.Learn.nearestFire(sim, a.pos.x, a.pos.y, ["ember"]), fi = G.Learn.nearestFire(sim, a.pos.x, a.pos.y, ["fire"]);
    const t = [em, fi].filter(q => q && q.d <= Kc.sightTiles).sort((p, q) => p.d - q.d)[0]; if (!t) return false;
    const p = clamp(Kc.holdChance * Math.pow(G.Learn.score(a, "cook") / 50, 2) * (1.5 - a.traits.fireFear / 100), 0, 1);
    if (!sim.lrng.chance(p)) return false;
    G.Learn.bump(sim, "approaches", "cook"); stats(sim).holds++;
    if (Cook.hot(sim, Math.round(a.pos.x), Math.round(a.pos.y)) && !(sim.fire[Math.round(a.pos.x) + "," + Math.round(a.pos.y)])) { startHold(sim, a, it); return true; }
    const lo = t.s === "ember" ? 1 : CF().fire.fleeTiles, hi = t.s === "ember" ? Kc.emberTiles : Kc.fireTiles, R = Math.ceil(hi), c = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = t.x + dx, y = t.y + dy, d = Math.hypot(dx, dy);
      if (d < lo - 1e-9 || d > hi + 1e-9 || sim.fire[x + "," + y] || !G.World.walkable(sim.world, x, y) || G.Agent.claimed(sim, a, x, y)) continue;
      c.push({ x, y, k: Math.hypot(x - a.pos.x, y - a.pos.y) }); }
    c.sort((p, q) => p.k - q.k || p.x - q.x || p.y - q.y);
    for (const q of c.slice(0, 4)) if (G.Agent.walkTo(sim, a, q.x, q.y, "cook", { item: it.id })) return true;
    return false;
  };
  function startHold(sim, a, it) { a.act = { type: "cook", item: it.id, since: sim.tick, cold: 0 }; }
  Cook.arrive = function (sim, a) { const it = G.Items.byId(sim, a.act.item);
    if (!it || it.heldBy !== a.id) { G.Agent.startIdle(sim, a, 0.3); return; }
    startHold(sim, a, it); };
  // holding it to the heat: once it is cooked (or the heat is gone / she has waited waitMinutes / thirst wins) she eats it as it is
  Cook.stepHold = function (sim, a) {
    const act = a.act, it = G.Items.byId(sim, act.item);
    if (!it || it.heldBy !== a.id || !G.Hunt.edible(sim, it)) { G.Agent.startIdle(sim, a, 0.2); return; }
    if (G.Agent.want(a) === "water") { G.Agent.startIdle(sim, a, 0.1); return; }
    act.cold = Cook.hot(sim, Math.round(a.pos.x), Math.round(a.pos.y)) ? 0 : act.cold + TM();
    if (Cook.of(it) !== "raw" || act.cold >= K().coldGiveUp || sim.tick - act.since >= K().waitMinutes) G.Hunt.startEat(sim, a, it);
  };
  // after a meal of meat: cooked is a success others may copy; charred lowers the score (raw changes nothing here)
  Cook.ate = function (sim, a, it) {
    if (it && it.material === "rotten") return;   // v38 (c)
    const s = Cook.of(it); stats(sim).eaten[s]++;
    if (s === "cooked") { const e = G.Learn.add(a, "cook", K().gain); e.n++; G.Discoveries.note(sim, a, "eat", ["cooked meat"], "fullness up, not sick"); G.Learn.success(sim, a, "cook"); if (G.Disease) G.Disease.onEatCooked(sim, a); }
    else if (s === "charred") { G.Learn.add(a, "cook", -K().charDrop); G.Discoveries.note(sim, a, "eat", ["charred meat"], "little fullness"); }
  };

  G.Cook = Cook;
})(this.GS = this.GS || {});
