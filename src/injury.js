// §40 / v37: overall health (0..max) + RimWorld-style body-part injuries, Heal and Resurrect powers. Data: config.health / bodyParts / injuryTypes,
// config.powers.heal / resurrect. No DOM. Rolls use RNG.hash2 (no stream state), so adding injuries does not shift any other stream.
(function (G) {
  const Injury = {};
  const CF = () => G.data.config, HC = () => CF().health, PT = () => CF().bodyParts, IT = () => CF().injuryTypes, TM = () => CF().time.tickGameMinutes;
  const r9 = v => Math.round(v * 1e9) / 1e9;
  Injury.ensure = a => { if (a.health == null) a.health = HC().max; if (!Array.isArray(a.injuries)) a.injuries = []; return a; };
  Injury.role = part => (PT()[part] || {}).role || part;
  Injury.effectOf = (inj) => { const T = IT()[inj.type] || {}; return T[Injury.role(inj.part)] || {}; };
  // walk speed multiplier: the worst leg injury wins (1 = unhurt)
  Injury.moveX = a => { let m = 1; for (const i of (a.injuries || [])) { const e = Injury.effectOf(i); if (e.moveX != null) m = Math.min(m, e.moveX); } return m; };
  // tool use: false when any arm injury has toolBlock (a broken arm); toolX = worst arm multiplier otherwise
  Injury.canUseTools = a => !(a.injuries || []).some(i => Injury.effectOf(i).toolBlock);
  Injury.toolX = a => { if (!Injury.canUseTools(a)) return 0; let m = 1; for (const i of (a.injuries || [])) { const e = Injury.effectOf(i); if (e.toolX != null) m = Math.min(m, e.toolX); } return m; };
  Injury.bleed = a => (a.injuries || []).reduce((s, i) => s + ((IT()[i.type] || {}).bleedPerHour || 0), 0);
  // effect words for the card list (gash = slow, broken arm = no tools)
  Injury.effectWords = i => { const e = Injury.effectOf(i), w = []; if (e.moveX != null) w.push("slow"); if (e.toolBlock) w.push("no tools"); else if (e.toolX != null) w.push("clumsy with tools");
    if ((IT()[i.type] || {}).bleedPerHour > 0) w.push("bleeding"); return w; };
  Injury.add = function (sim, a, part, type) { Injury.ensure(a); if (!PT()[part] || !IT()[type]) return null;
    const i = { part, type, at: sim.tick }; a.injuries.push(i);
    G.Sim.log(sim, a.name + " limps away with a " + IT()[type].label + " on the " + PT()[part].label.toLowerCase().replace(/^r /, "right ").replace(/^l /, "left "), a);
    return i; };
  const pick = (w, u) => { const ks = Object.keys(w), tot = ks.reduce((s, k) => s + w[k], 0); let x = u * tot; for (const k of ks) { x -= w[k]; if (x < 0) return k; } return ks[ks.length - 1]; };
  // a wolf strike that did not kill: maybe an injury (where and what from config.health.wolfInjury)
  Injury.fromWolf = function (sim, a) { const W = HC().wolfInjury; if (!W) return null; const s = (sim.seed | 0) ^ 0x1a2b3c;
    if (G.RNG.hash2(a.id, sim.tick, s) >= W.chance) return null;
    return Injury.add(sim, a, pick(W.parts, G.RNG.hash2(a.id + 7, sim.tick, s)), pick(W.types, G.RNG.hash2(a.id + 13, sim.tick, s))); };
  // each tick: injuries close on their own after healMinutes; health falls per need at 0 and per bleeding injury, climbs back when all is well
  Injury.step = function (sim) { const H = HC(), tm = TM(), max = H.max;
    for (const a of sim.agents) { Injury.ensure(a);
      if (a.injuries.length) a.injuries = a.injuries.filter(i => { const T = IT()[i.type]; if (T && T.healMinutes && (sim.tick - i.at) * tm >= T.healMinutes) {
        G.Sim.log(sim, a.name + "'s " + T.label + " on the " + (PT()[i.part] || {}).label.toLowerCase() + " has closed", a); return false; } return true; });
      const n = a.needs, zeros = ["water", "fullness", "energy", "warmth"].filter(k => n[k] != null && n[k] <= 0).length, bleed = Injury.bleed(a);
      let d = -(zeros * H.lossPerZeroNeed + bleed) * tm / 60;
      if (!zeros && !bleed && ["water", "fullness", "energy", "warmth"].every(k => n[k] == null || n[k] >= H.regenAbove)) d = H.regenPerHour * tm / 60;
      if (d) a.health = r9(Math.max(0, Math.min(max, a.health + d))); } };
  Injury.dead = a => a.health != null && a.health <= 0;

  // ---- Heal power: every living person in the circle: all injuries mended, +healthAdd ----
  Injury.heal = function (sim, x, y, r) { const C = CF().powers.heal, out = [];
    for (const a of sim.agents) { if (Math.hypot(a.pos.x - x, a.pos.y - y) > r) continue; Injury.ensure(a);
      const had = a.injuries.length, h0 = a.health; a.injuries = []; a.health = r9(Math.min(HC().max, a.health + C.healthAdd));
      if (had || a.health > h0) { out.push(a); G.Sim.log(sim, a.name + (had ? " stands straighter as " + (had > 1 ? "the wounds close" : "the wound closes") : " breathes easier"), a); } }
    return out; };

  // ---- Resurrect power: a person's body that died within windowMinutes rises; a long-dead body does not ----
  Injury.canRaise = function (sim, b) { const R = CF().powers.resurrect;
    if (!b || b.kind !== "body" || b.species || b.gone || !b.soul) return { ok: false, why: "no soul" };
    if ((sim.tick - b.diedAt) * TM() > R.windowMinutes) return { ok: false, why: "too long dead" };
    if (b.burial || b.pyre || b.stage !== "fresh" || b.flesh < R.minFlesh) return { ok: false, why: "body gone" };
    if (sim.agents.some(a => a.id === b.of)) return { ok: false, why: "alive" };
    return { ok: true }; };
  Injury.raise = function (sim, b) { const R = CF().powers.resurrect, c = Injury.canRaise(sim, b); if (!c.ok) return null;
    const a = JSON.parse(JSON.stringify(b.soul)); a.pos = { x: b.x, y: b.y };
    for (const k of ["fullness", "water", "energy", "warmth"]) a.needs[k] = Math.max(a.needs[k] || 0, R.revive[k]);
    a.zero = {}; a.hypo = 0; a.hypoUnconscious = false; a.health = R.revive.health; a.injuries = []; a.carry = null; a.carryUntil = null; a.sick = null;
    a.act = { type: "idle", until: sim.tick + 30 }; a.inShelter = null;
    if (a.mate != null) { const m = sim.agents.find(q => q.id === a.mate); if (!m || (m.mate != null && m.mate !== a.id)) a.mate = null; else m.mate = a.id; }
    if (a.age >= a.lifespan) a.lifespan = a.age + 1440 * 30;   // old age would take her straight back
    sim.bodies.splice(sim.bodies.indexOf(b), 1); sim.agents.push(a); sim.prev[a.id] = { x: a.pos.x, y: a.pos.y };
    G.Sim.log(sim, a.name + " stirs, sits up and gets to " + (a.sex === "m" ? "his" : "her") + " feet", a);
    return a; };
  Injury.resurrect = function (sim, x, y, r) { const out = [], miss = [];
    for (const b of sim.bodies.slice()) { if (b.species || Math.hypot(b.x - x, b.y - y) > r) continue; const a = Injury.raise(sim, b); if (a) out.push(a); else miss.push(b); }
    return { raised: out, missed: miss }; };
  // a soul snapshot on a fresh body is dropped once the window has passed (keeps saves small)
  Injury.bodyStep = function (sim) { const W = CF().powers.resurrect.windowMinutes, tm = TM();
    for (const b of sim.bodies) if (b.soul && (sim.tick - b.diedAt) * tm > W) delete b.soul; };
  G.Injury = Injury;
})(this.GS = this.GS || {});
