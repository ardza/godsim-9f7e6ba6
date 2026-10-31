// v39 wolf memory (specs/reed_fiber_DRAFT.md §5b). Per wolf: memory [{who, group, members, s, t, near}] (decay is lazy: s is the value at t),
// caution {v, t}, woundedUntil. Learned by sight only (its own wounds, packmates within fight.packTiles); never shared across packs.
// Director (v39): a group entry stores the member ids at write time; a person matches it when (alive remembered members in her group) x 2 >= (alive remembered members).
// Hooks (animal.js): mayTarget in wolfDecide's intruder pick and Animal.step's interrupt; decide at the top of wolfDecide; defeat on a held-off attack.
(function (G) {
  const CF = () => G.data.config, M = () => CF().wolfMemory, TM = () => CF().time.tickGameMinutes;
  const r9 = v => Math.round(v * 1e9) / 1e9, dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  const rng = sim => sim.fgrng || (sim.fgrng = new G.RNG((sim.seed ^ 0xF16A7105) >>> 0));
  const day = () => 1440 / TM();
  const WM = {};
  const S = sim => sim.wolfMem || (sim.wolfMem = { wounds: 0, avoids: 0, cautions: 0, keeps: 0, wary: 0 });
  WM.stats = S;
  const half = e => M().halfLifeDays * (e.near ? M().nearKillX : 1) * day();
  WM.sNow = (sim, e) => r9(e.s * Math.pow(0.5, Math.max(0, sim.tick - e.t) / half(e)));
  WM.cNow = (sim, w) => { const c = w.caution; if (!c || !c.v) return 0; return r9(c.v * Math.pow(0.5, Math.max(0, sim.tick - (c.t || 0)) / (M().cautionHalfLifeDays * day()))); };
  WM.wounded = (sim, w) => w.woundedUntil != null && sim.tick < w.woundedUntil;
  const alive = (sim, id) => sim.agents.some(q => q.id === id);
  WM.prune = function (sim, w) {
    if (!w.memory) { w.memory = []; return; }
    w.memory = w.memory.filter(e => WM.sNow(sim, e) >= M().forgetBelow && (e.who != null ? alive(sim, e.who) : (e.members || []).some(id => alive(sim, id))));
  };
  // an entry matches person p: by id, or (group entry) by the Director's member rule
  WM.matches = function (sim, e, p) {
    if (e.who != null) return e.who === p.id;
    if (p.group == null) return false;
    const live = (e.members || []).filter(id => alive(sim, id)); if (!live.length) return false;
    const inG = live.filter(id => { const q = sim.agents.find(o => o.id === id); return q && q.group === p.group; }).length;
    return inG * 2 >= live.length;
  };
  WM.sFor = function (sim, w, p) { let best = 0; for (const e of w.memory || []) if (WM.matches(sim, e, p)) best = Math.max(best, WM.sNow(sim, e)); return best; };
  function raise(sim, w, who, group, members, v, near) {
    if (v <= 0) return; w.memory = w.memory || [];
    let e = w.memory.find(x => who != null ? x.who === who : (x.who == null && x.group === group));
    if (e) { e.s = r9(Math.min(100, WM.sNow(sim, e) + v)); e.t = sim.tick; e.near = !!(e.near || near); if (members) e.members = members.slice(); }
    else { e = { who: who != null ? who : null, group: who != null ? null : group, members: who != null ? null : members.slice(), s: r9(Math.min(100, v)), t: sim.tick, near: !!near };
      w.memory.push(e);
      if (w.memory.length > M().max) { let lo = 0; for (let i = 1; i < w.memory.length; i++) if (WM.sNow(sim, w.memory[i]) < WM.sNow(sim, w.memory[lo])) lo = i; w.memory.splice(lo, 1); } }
    return e;
  }
  WM.raise = raise;
  WM.addCaution = function (sim, w, v) { const c = WM.cNow(sim, w); w.caution = { v: r9(Math.min(100, c + v)), t: sim.tick }; };
  function remember(sim, w, people, x, near) { const C = M();
    for (const p of people) { raise(sim, w, p.id, null, null, C.personS * x, near);
      if (p.group != null) raise(sim, w, null, p.group, sim.agents.filter(q => q.group === p.group).map(q => q.id), C.groupS * x, near); }
    WM.prune(sim, w); }
  const mates = (sim, pk, at, not) => sim.animals.filter(o => o.species === "wolves" && o !== not && pk != null && o.pack === pk && Math.hypot(o.pos.x - at.x, o.pos.y - at.y) <= CF().fight.packTiles + 1e-9);
  WM.onWound = function (sim, w, people, near) { const C = M(); S(sim).wounds++;
    remember(sim, w, people, 1, near); WM.addCaution(sim, w, C.woundCaution + C.defeatCaution);
    for (const o of mates(sim, w.pack, w.pos, w)) { remember(sim, o, people, C.seenX, false); WM.addCaution(sim, o, C.seenCaution); } };
  WM.onKilled = function (sim, pk, at, people) { const C = M();
    for (const o of mates(sim, pk, at, null)) { remember(sim, o, people, C.killedX, false); WM.addCaution(sim, o, C.killedCaution); } };
  WM.defeat = function (sim, w) { WM.addCaution(sim, w, M().defeatCaution); S(sim).defeats = (S(sim).defeats || 0) + 1; };
  WM.threat = function (sim, p) { const F = CF().wolfFight, Fx = G.WolfFight;
    let t = 0; for (const q of sim.agents) { if (dist(q, p) > F.allyTiles + 1e-9 || !Fx.able(sim, q)) continue; t += Fx.armed(sim, q, null) ? M().armedW : 1; } return t; };
  WM.limit = c => Math.max(1, Math.round(M().threatBase * (1 - c / 100)));
  function logCool(sim, w, key, line, p) { const k = key + "LogAt"; if (sim.tick - (w[k] == null ? -1e9 : w[k]) < M().logCoolMinutes / TM()) return;
    w[k] = sim.tick; G.Sim.log(sim, line, p); }
  const wolfWord = () => "The " + G.Animal.label("wolves").toLowerCase().replace(/s$/, "");
  // may wolf w pick person p as a target? (no memory and no caution: true, no RNG drawn — v38 behaviour)
  WM.mayTarget = function (sim, w, p) {
    if (WM.wounded(sim, w)) return false;
    const mem = w.memory && w.memory.length, c = WM.cNow(sim, w);
    if (!mem && !c) return true;
    const C = M();
    if (mem) { WM.prune(sim, w);
      for (const q of sim.agents) { if (q !== p && dist(q, p) > CF().wolfFight.allyTiles + 1e-9) continue;
        const s = WM.sFor(sim, w, q); if (s >= C.avoidAt - 1e-9) { S(sim).avoids++; logCool(sim, w, "keep", wolfWord() + " " + C.lines.keep.replace(/^The wolf /i, "").replace("{who}", q.name), q); return false; } } }
    if (c > 0 && WM.threat(sim, p) >= WM.limit(c)) { S(sim).cautions++; logCool(sim, w, "circle", wolfWord() + " " + C.lines.circle.replace(/^The wolf /i, ""), p); return false; }
    const s = mem ? WM.sFor(sim, w, p) : 0;
    if (s >= C.wary - 1e-9) {   // wary: start chance x (1 - s/100), rolled per person every waryRecheckMinutes
      const k = w.wary || (w.wary = {}), r = k[p.id];
      if (!r || sim.tick - r.t >= C.waryRecheckMinutes / TM()) { k[p.id] = { t: sim.tick, ok: rng(sim).chance(1 - s / 100) }; if (!k[p.id].ok) S(sim).wary++; }
      return k[p.id].ok;
    }
    return true;
  };
  WM.toDen = function (sim, w) { const pk = G.Animal.packOf(sim, w); if (!pk) { w.act = { type: "idle", until: sim.tick + 1 }; return; }
    G.Sim.log(sim, wolfWord() + " " + M().lines.wounded, null);
    if (!G.Animal.walkTo(sim, w, pk.den.x, pk.den.y, "den")) w.act = { type: "idle", until: sim.tick + Math.round(30 / TM()) }; };
  // top of wolfDecide: a wounded wolf stays at / goes to its den; a remembered person nearby is kept at a distance
  WM.decide = function (sim, w, pk) {
    if (WM.wounded(sim, w)) { if (pk && Math.hypot(w.pos.x - pk.den.x, w.pos.y - pk.den.y) > 1.5 && G.Animal.walkTo(sim, w, pk.den.x, pk.den.y, "den")) return true;
      w.act = { type: "idle", until: sim.tick + Math.round(30 / TM()) }; return true; }
    return WM.keepAway(sim, w);
  };
  // probes: upcoming path tiles; a remembered person within keep of the wolf or of a probe counts (so it turns before stepping in)
  // v39 (Judge): keep distance is a slope, no rounding: below avoidAt 0 (no avoidance, wary only); else keepMin + (keepMax - keepMin) x (s - avoidAt) / (keepFullAt - avoidAt), clamped to keepMin..keepMax (2 + 5 x (s - 30) / 70)
  WM.keepDist = function (s) { const C = M(); if (!(s >= C.avoidAt - 1e-9)) return 0;
    return Math.max(C.keepMin, Math.min(C.keepMax, C.keepMin + (C.keepMax - C.keepMin) * (s - C.avoidAt) / (C.keepFullAt - C.avoidAt))); };
  WM.keepAway = function (sim, w, probes) {
    if (!w.memory || !w.memory.length) return false; const C = M(), mg = C.keepMargin || 0;
    let worst = null, need = 0;
    for (const p of sim.agents) { const s = WM.sFor(sim, w, p); if (s < C.avoidAt - 1e-9) continue;
      let d = dist(w, p); for (const t of probes || []) d = Math.min(d, Math.hypot(t[0] - p.pos.x, t[1] - p.pos.y));
      const keep = WM.keepDist(s);
      if (d < keep + mg - 1e-9 && keep + mg - d > need) { need = keep + mg - d; worst = { p, keep }; } }
    if (!worst) return false;
    const p = worst.p, d = dist(w, p) || 1, ux = (w.pos.x - p.pos.x) / d, uy = (w.pos.y - p.pos.y) / d, W = G.World;
    // v39 fix: wider search (16 headings, 3 radii), a target must itself be clear of everyone remembered, and a leading
    // path step that would close the distance (walkTo starts at the rounded tile) is dropped. No way out: it stops where it is.
    const turns = [0]; for (let k = 1; k <= 8; k++) turns.push(k * Math.PI / 8, -k * Math.PI / 8);
    for (const turn of turns) for (const k of [worst.keep + 1, worst.keep + 2, worst.keep]) {
      const cs = Math.cos(turn), sn = Math.sin(turn), vx = ux * cs - uy * sn, vy = ux * sn + uy * cs;
      const x = Math.round(p.pos.x + vx * k), y = Math.round(p.pos.y + vy * k);
      if (!W.inb(sim.world, x, y) || !W.walkable(sim.world, x, y) || W.isWater(sim.world, x, y) || WM.tooClose(sim, w, x, y)) continue;
      const from = { x: w.pos.x, y: w.pos.y };
      if (G.Animal.walkTo(sim, w, x, y, "keepAway")) { const a = w.act;
        while (a.path.length > 1 && WM.closer(sim, w, from, a.path[0])) a.path.shift();
        if (a.path.some(t => WM.tooClose(sim, w, t[0], t[1]) && WM.closer(sim, w, from, t))) { w.act = { type: "idle", until: sim.tick + 1 }; continue; }
        S(sim).keeps++; logCool(sim, w, "keep", wolfWord() + " " + C.lines.keep.replace(/^The wolf /i, "").replace("{who}", p.name), p); return true; } }
    w.act = { type: "idle", until: sim.tick + 1 }; S(sim).stops = (S(sim).stops || 0) + 1;
    return true;
  };
  // every tick, memory-carrying wolves only: inside the keep distance of someone it remembers, or about to step inside it -> turn away
  WM.tooClose = function (sim, w, x, y, margin) { const C = M(), mg = margin || 0;
    for (const p of sim.agents) { const s = WM.sFor(sim, w, p); if (s < C.avoidAt - 1e-9) continue;
      const keep = WM.keepDist(s); if (Math.hypot(x - p.pos.x, y - p.pos.y) < keep + mg - 1e-9) return true; }
    return false; };
  // would tile t bring the wolf nearer than `from` to someone remembered (and inside her keep distance)?
  WM.closer = function (sim, w, from, t) { const C = M();
    for (const p of sim.agents) { const s = WM.sFor(sim, w, p); if (s < C.avoidAt - 1e-9) continue;
      const keep = WM.keepDist(s), d1 = Math.hypot(t[0] - p.pos.x, t[1] - p.pos.y);
      if (d1 < keep - 1e-9 && d1 < Math.hypot(from.x - p.pos.x, from.y - p.pos.y) - 1e-9) return true; }
    return false; };
  WM.step = function (sim) {
    for (const w of sim.animals) { if (w.species !== "wolves" || !w.memory || !w.memory.length) continue;
      if (WM.wounded(sim, w)) continue;
      const act = w.act; if (act && act.goal === "keepAway" && act.type === "walk") continue;
      let close = WM.tooClose(sim, w, w.pos.x, w.pos.y, M().keepMargin); const probes = [];
      if (act && act.type === "walk" && act.path) for (let j = act.i; j < Math.min(act.path.length, act.i + 2); j++) { const t = act.path[j]; probes.push(t); if (WM.tooClose(sim, w, t[0], t[1])) close = true; }
      if (close) WM.keepAway(sim, w, probes); }
  };
  WM.migrateOne = w => { w.memory = []; w.caution = { v: 0, t: null }; w.woundedUntil = null; };
  WM.migrate = function (o) { for (const w of o.animals || []) if (w.species === "wolves") WM.migrateOne(w); };
  G.WolfMem = WM;
  if (G.V39) G.V39.steps.push(WM.step);
})(window.GS = window.GS || {});
