// §40 / v37: fear of wolves (0..config.wolfFear.max per person). Raised only when the person KNOWS a wolf did it:
// saw an attack, saw a kill, was attacked and lived, or found clear evidence (a bite-wounded body, fresh, with a wolf or pack near it).
// Small gains per event (config) so it builds step by step. Stored and shown only (Mind tab). Logs are actions only.
(function (G) {
  const WF = {};
  const C = () => G.data.config.wolfFear, TM = () => G.data.config.time.tickGameMinutes;
  const r9 = v => Math.round(v * 1e9) / 1e9;
  WF.of = a => a.wolfFear || 0;
  const kin = (a, v) => !!v && (a.mate === v.id || (a.parents || []).indexOf(v.id) >= 0 || (a.children || []).indexOf(v.id) >= 0 || (v.parents || []).indexOf(a.id) >= 0 ||
    (!!v.parents && (a.parents || []).some(q => v.parents.indexOf(q) >= 0)));
  WF.add = function (sim, a, kind, victim, why) { const c = C(), g = (c.gain[kind] || 0) + (victim && kin(a, victim) ? c.kinAdd || 0 : 0); if (g <= 0) return 0;
    const v0 = WF.of(a); a.wolfFear = r9(Math.min(c.max, v0 + g)); a.wolfFearLog = a.wolfFearLog || [];
    a.wolfFearLog.push({ t: sim.tick, k: kind }); if (a.wolfFearLog.length > 10) a.wolfFearLog.shift();
    if (sim.tick - (a.wolfFearLogAt || -1e9) >= c.logCoolMinutes / TM()) { a.wolfFearLogAt = sim.tick; G.Sim.log(sim, a.name + " " + why, a); }
    return a.wolfFear - v0; };
  const awake = a => a.act && a.act.type !== "sleep" && !a.hypoUnconscious;
  const watchers = (sim, x, y, not) => sim.agents.filter(o => o !== not && awake(o) && Math.hypot(o.pos.x - x, o.pos.y - y) <= C().seeTiles);
  // a wolf struck p and p lived: p knows; awake people within seeTiles saw it
  WF.onAttack = function (sim, p) { WF.add(sim, p, "survived", null, "backs away from the Wolves, shaking");
    for (const o of watchers(sim, p.pos.x, p.pos.y, p)) WF.add(sim, o, "sawAttack", p, "watches the Wolves strike " + p.name + " and keeps back"); };
  // a wolf killed p: awake people within seeTiles saw it (they also need no evidence step for this body)
  WF.onKill = function (sim, p, body) { for (const o of watchers(sim, p.pos.x, p.pos.y, p)) { WF.add(sim, o, "sawKill", p, "watches the Wolves bring down " + p.name + " and backs away");
      if (body) { o.wolfFearSeen = o.wolfFearSeen || []; o.wolfFearSeen.push(body.id); } } };
  // clear evidence: a fresh person body with a bite wound, a wolf near it (or inside a pack's territory); once per body per person
  WF.step = function (sim) { const c = C(), E = c.evidence, tm = TM(); if (!sim.bodies.length) return;
    const bites = sim.bodies.filter(b => !b.species && (b.wounds || []).indexOf("bite") >= 0 && (sim.tick - b.diedAt) * tm <= E.windowMinutes && !b.burial);
    if (!bites.length) return;
    for (const b of bites) {
      const sign = !E.needWolfSign || sim.animals.some(w => w.species === "wolves" && Math.hypot(w.pos.x - b.x, w.pos.y - b.y) <= E.wolfTiles) ||
        (sim.packs || []).some(pk => Math.hypot(pk.den.x - b.x, pk.den.y - b.y) <= (G.data.config.animals.wolves.territory || 0));
      if (!sign) continue;
      for (const a of sim.agents) { if (!awake(a) || Math.hypot(a.pos.x - b.x, a.pos.y - b.y) > E.tiles) continue;
        a.wolfFearSeen = a.wolfFearSeen || []; if (a.wolfFearSeen.indexOf(b.id) >= 0) continue; a.wolfFearSeen.push(b.id); if (a.wolfFearSeen.length > 20) a.wolfFearSeen.shift();
        WF.add(sim, a, "evidence", { id: b.of }, "kneels by " + b.name + "'s bitten body, then looks toward the Wolves' ground"); } } };
  G.WolfFear = WF;
})(this.GS = this.GS || {});
