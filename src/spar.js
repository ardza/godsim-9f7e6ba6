// v39 sparring, only by agreement (specs/reed_fiber_DRAFT.md §5a). Learn key `spar` (know-how). Before language the invite is a play-wrestle
// stance and the answer is copying it; after language (group with >= spar.minWords words) a shared word may also invite / answer.
// Own stream sprng. Acts: sparStance (inviter waits up to answerMinutes), spar (the bout, both). a.sparNext = day limit; a.sparRetryAt = refusal wait.
(function (G) {
  const CF = () => G.data.config, P = () => CF().spar, TM = () => CF().time.tickGameMinutes;
  const rng = sim => sim.sprng || (sim.sprng = new G.RNG((sim.seed ^ 0x59A27A11) >>> 0));
  const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  const Spar = {};
  const S = sim => sim.sparStats || (sim.sparStats = { invites: 0, wordInvites: 0, refused: 0, bouts: 0, invented: 0 });
  Spar.stats = S;
  const stage = a => G.Family ? G.Family.stage(a) : "adult";
  Spar.able = (sim, a) => !!a && a.kind === "person" && sim.agents.indexOf(a) >= 0 && (stage(a) === "adult" || stage(a) === "youth") &&
    a.act && a.act.type !== "sleep" && !a.hypoUnconscious && !(a.injuries && a.injuries.length) && a.needs.energy >= CF().wolfFight.exhaustedBelow;
  const free = a => a.act && a.act.type === "idle" && !a.act.goal;
  const dayOk = (sim, a) => a.sparNext == null || sim.tick >= a.sparNext;
  Spar.words = function (sim, a) { const g = G.Social && G.Social.group(sim, a); if (!g || !G.Speech || !G.Speech.groupWords) return [];
    const w = G.Speech.groupWords(sim, g); return w.length >= P().minWords ? w : []; };
  // recently in or saw a wolf / dog fight
  Spar.recentFight = function (sim, a) { const lim = P().recentDays * 1440 / TM(), r = t => t != null && sim.tick - t <= lim;
    if (r(a.wolfStrikeAt) || r(a.wolfCommitAt) || r(a.wolfRunAt) || r(a.dogFightAt)) return true;
    return (a.wolfFearLog || []).some(e => e && r(e.t)); };
  Spar.agrees = function (sim, b, a) { const p = P();
    if (!Spar.able(sim, b) || G.Social.like(b, a) < p.like) return false;
    if (b.needs.fullness < p.needMin || b.needs.water < p.needMin || b.needs.warmth < p.needMin) return false;
    const ch = G.Learn.has(b, "spar") ? p.agreeBase + (G.Learn.score(b, "spar") - 50) / 100 : p.agreeBase;
    return rng(sim).chance(Math.max(0, Math.min(1, ch))); };
  Spar.partner = function (sim, a) { let best = null, bd = Infinity;
    const p = P(), ok = b => free(b) || (p.partnerWander && b.act && b.act.type === "walk" && b.act.goal === "wander");   // v39 tune: spar.partnerWander, a wandering liked person also counts as free
    for (const b of sim.agents) { if (b === a || (p.groupOnly && (a.group == null || b.group !== a.group)) || !Spar.able(sim, b) || !ok(b) || !dayOk(sim, b)) continue;   // v39 tune: spar.groupOnly false, liking >= spar.like is enough
      if (G.Social.like(a, b) < P().like) continue; const d = dist(a, b); if (d <= P().nearTiles + 1e-9 && d < bd) { bd = d; best = b; } }
    return best; };
  // idle choice: roll once per game hour
  Spar.maybe = function (sim, a) { const p = P();
    if (!Spar.able(sim, a) || !free(a) || !dayOk(sim, a) || (a.sparRetryAt != null && sim.tick < a.sparRetryAt)) return false;
    const hr = Math.max(1, Math.round(60 / TM())); if (a.sparCheckAt != null && sim.tick - a.sparCheckAt < hr) return false;
    let ch = 0;
    if (G.Learn.has(a, "spar")) { if (G.Learn.score(a, "spar") >= CF().tools.scoreMin) ch = p.inviteChance; }
    else if (G.Learn.score(a, "melee") >= p.minMelee && (!p.needRecentFight || Spar.recentFight(sim, a))) ch = p.inventChance * ((a.traits && a.traits.curiosity != null ? a.traits.curiosity : 50) / 50);
    if (!ch) return false;
    const b = Spar.partner(sim, a); if (!b) return false;
    a.sparCheckAt = sim.tick;
    if (!rng(sim).chance(ch)) return false;
    return Spar.invite(sim, a, b);
  };
  // the invite: always the stance; after language, a shared word may go with it
  Spar.invite = function (sim, a, b, opts) { const p = P(), o = opts || {}; S(sim).invites++; if (!G.Learn.has(a, "spar")) S(sim).invented++;
    const ws = Spar.words(sim, a); let word = null;
    if (ws.length && (o.word || rng(sim).chance(0.5))) word = rng(sim).pick(ws).word;
    a.facing = b.pos.x < a.pos.x ? "left" : b.pos.x > a.pos.x ? "right" : a.facing;
    const yes = o.agree != null ? o.agree : Spar.agrees(sim, b, a);
    const wait = Math.max(1, Math.round(p.answerMinutes / TM()));
    a.act = { type: "sparStance", who: b.id, since: sim.tick, until: sim.tick + wait, word, answerAt: yes ? sim.tick + rng(sim).int(1, wait) : null };
    if (word) { S(sim).wordInvites++; G.Sim.log(sim, a.name + " " + p.lines.word.replace("{word}", word).replace("{who}", b.name), a); }
    else G.Sim.log(sim, a.name + " " + p.lines.stance.replace("{who}", b.name), a);
    return true; };
  Spar.stepStance = function (sim, a) { const act = a.act, b = sim.agents.find(q => q.id === act.who), p = P();
    if (act.answerAt != null && sim.tick >= act.answerAt && b && Spar.able(sim, b) && dist(a, b) <= p.nearTiles + 1.5 && dayOk(sim, b) && b.act.type !== "spar") {
      G.Sim.log(sim, b.name + " " + (act.word && Spar.words(sim, b).some(w => w.word === act.word) && rng(sim).chance(0.5) ? "calls back \"" + act.word + "\" and " + p.lines.copy : p.lines.copy), b);
      Spar.startBout(sim, a, b); return true; }
    if (sim.tick >= act.until || !b || sim.agents.indexOf(b) < 0) { S(sim).refused++; a.sparRetryAt = sim.tick + Math.round(p.retryMinutes / TM()); return false; }
    return true; };
  Spar.bare = (sim, a) => { const t = G.Agent.tilePos(a); return !(G.World.tile(sim.world, t.x, t.y) === G.data.T.MEADOW && !(G.Fire && sim.fire && G.Fire.groundBare && G.Fire.groundBare(sim, t.x, t.y))); };
  Spar.startBout = function (sim, a, b) { const p = P(), until = sim.tick + Math.max(1, Math.round(p.minutes / TM()));
    a.act = { type: "spar", with: b.id, until, lead: true }; b.act = { type: "spar", with: a.id, until, lead: false };
    b.pos.x = a.pos.x + (b.pos.x >= a.pos.x ? 1 : -1) * Math.min(1, Math.abs(b.pos.x - a.pos.x) || 1); b.pos.y = a.pos.y;
    S(sim).bouts++;
    G.Sim.log(sim, a.name + " " + (Spar.bare(sim, a) ? p.lines.boutBare : p.lines.bout).replace("{who}", b.name), a); };
  Spar.stepBout = function (sim, a) { const act = a.act, b = sim.agents.find(q => q.id === act.with);
    if (!b || !b.act || b.act.type !== "spar" || b.act.with !== a.id) { if (sim.tick >= act.until && !act.done) Spar.finish(sim, a, b, false); return sim.tick < act.until; }
    if (sim.tick < act.until) return true;
    // v39 fix: whichever of the two steps first at the end finishes the bout for both (agent order no longer matters)
    if (act.lead) Spar.finish(sim, a, b, true); else Spar.finish(sim, b, a, true);
    return false; };
  Spar.finish = function (sim, a, b, both) { const p = P(), day = Math.round(1440 / p.perDay / TM());
    const ps = both && b ? [a, b] : [a];
    for (const q of ps) { q.sparNext = sim.tick + day;
      const e = G.Learn.add(q, "spar", p.gain); e.n = (e.n || 0) + 1;
      if (G.Skills) G.Skills.gain(sim, q, "melee", "spar"); }
    if (both && b) { G.Sim.log(sim, a.name + " " + (Spar.bare(sim, a) ? p.lines.end.replace("grass", "ground") : p.lines.end).replace("{who}", b.name), a);
      G.Fiber.disc(sim, a, "spar", ["hands"], "play-wrestle", "First sparring");
      for (const q of ps) G.Learn.success(sim, q, "spar");
      for (const q of ps) if (q.act && q.act.type === "spar") { q.act.done = true; G.Agent.startIdle(sim, q); } } };
  // v39 browser fixtures (?fixture=v39&kind=...; test-only, mirrors tests/headless_v39.js setups; no log lines): a scene by person 1 for the new art.
  //   fiber: soaked reed, bundle, coil on the ground, cord in hand, wraps of 1-3 layers + a worn one   bow: strung / unstrung / drawn bows, ground arrows, a flight, arrow-struck carcass
  //   spar: a bout (adults) + a kid bout + a sparStance   wolf: a wounded wolf with memory + caution, its card open   hut: a lashed hut   beds: reed beds at 0..max
  Spar.fixture = function (sim, kind) {
    const W = G.World, a0 = sim.agents[0]; if (!a0) return null;
    const land = (x, y) => W.inb(sim.world, x, y) && W.walkable(sim.world, x, y) && !W.isWater(sim.world, x, y);
    const t0 = G.Agent.tilePos(a0); let o = null;
    for (let r = 0; r < 30 && !o; r++) for (let dy = -r; dy <= r && !o; dy++) for (let dx = -r; dx <= r && !o; dx++) { const x = t0.x + dx, y = t0.y + dy; let g = true;
      for (let yy = -2; yy <= 2 && g; yy++) for (let xx = -3; xx <= 4 && g; xx++) if (!land(x + xx, y + yy)) g = false; if (g) o = { x, y }; }
    if (!o) o = t0;
    const ppl = sim.agents.filter(q => !G.Family.isChild(q)).slice(0, 4), kids = sim.agents.filter(q => G.Family.isChild(q)).slice(0, 2);
    const put = (q, x, y) => { q.pos = { x, y }; q.act = { type: "idle", until: sim.tick + 1e6 }; q.path = null; return q; };
    const mk = (mat, x, y, form) => { const it = G.Items.create(sim, mat, x, y, form); sim.items.push(it); return it; };
    const give = (q, it) => { if (q.carry != null) { const h = G.Items.byId(sim, q.carry); if (h) h.heldBy = null; } it.heldBy = q.id; it.x = Math.round(q.pos.x); it.y = Math.round(q.pos.y); q.carry = it.id; q.carryUntil = sim.tick + 1e7; return it; };
    const bowFor = (q, strung, n) => { const b = give(q, mk("stick", 0, 0, "whole")); b.props.flex = 70; b.tool = "bow"; b.strung = strung; b.arrows = [];
      for (let i = 0; i < n; i++) b.arrows.push({ id: 9e6 + q.id * 10 + i, tip: i ? null : "flint", hard: 25, sharp: 30, flex: 50 }); return b; };
    const r = { kind, at: o, people: [] };
    if (kind === "fiber") {
      const rd = mk("reed", o.x - 2, o.y - 1); rd.soaked = true; mk("fiber", o.x - 1, o.y - 1, "bundle"); mk("fiber", o.x, o.y - 1, "cord");
      ppl.forEach((q, i) => { put(q, o.x - 1 + i * 1.5, o.y + 1); const w = mk("fiber", o.x, o.y, "wrap"); w.wornBy = q.id; w.layers = Math.min(3, i + 1); w.dur = i === 3 ? 30 : 90; q.wearingWrap = w.id; w.heldBy = null; r.people.push(q.id); });
      if (ppl[0]) give(ppl[0], mk("fiber", o.x, o.y, "cord"));
    } else if (kind === "bow") {
      ppl.forEach((q, i) => put(q, o.x - 1 + i * 1.5, o.y));
      if (ppl[0]) { bowFor(ppl[0], true, 4); ppl[0].shotAt = sim.tick; ppl[0].facing = "right"; G.Bow.flight(sim, ppl[0], o.x + 4, o.y - 1, false); }
      if (ppl[1]) bowFor(ppl[1], true, 2); if (ppl[2]) bowFor(ppl[2], false, 0);
      const g = mk("stick", o.x - 2, o.y + 2, "whole"); g.tool = "bow"; g.strung = true; g.arrows = [];
      const a1 = G.Bow.arrowItem(sim, { hard: 25, sharp: 30, flex: 50, tip: null }, o.x - 1, o.y + 2), a2 = G.Bow.arrowItem(sim, { hard: 25, sharp: 30, flex: 50, tip: "flint" }, o.x, o.y + 2), a3 = G.Bow.arrowItem(sim, { hard: 25, sharp: 30, flex: 50, tip: null }, o.x + 1, o.y + 2);
      if (a2 && !a2.tip) a2.tip = "flint"; if (a3) a3.missed = true;
      const dr = G.Animal.create(sim, "grazer", o.x + 3, o.y + 1, null); dr.pos = { x: o.x + 3, y: o.y + 1 }; const body = G.Body.createAnimal(sim, dr, ppl[0] || null);
      body.arrows = [{ id: 9e6 + 99, tip: null, hard: 25, sharp: 30, flex: 50 }]; sim.bodies.push(body); r.body = body.id;
      r.people = ppl.map(q => q.id);
    } else if (kind === "spar") {
      if (ppl[0] && ppl[1]) { put(ppl[0], o.x - 1, o.y); put(ppl[1], o.x, o.y); Spar.startBout(sim, ppl[0], ppl[1]); ppl[0].act.until = ppl[1].act.until = sim.tick + 1e6; }
      if (ppl[2] && ppl[3]) { put(ppl[2], o.x + 2, o.y - 2); put(ppl[3], o.x + 3, o.y - 2); ppl[2].act = { type: "sparStance", who: ppl[3].id, since: sim.tick, until: sim.tick + 1e6, word: null, answerAt: null }; }
      if (kids[0] && kids[1]) { put(kids[0], o.x + 2, o.y + 1); put(kids[1], o.x + 3, o.y + 1); Spar.startBout(sim, kids[0], kids[1]); kids[0].act.until = kids[1].act.until = sim.tick + 1e6; r.kids = kids.map(q => q.id); }
      r.people = ppl.map(q => q.id);
    } else if (kind === "wolf") {
      const A = ppl[0] || a0, B = ppl[1]; put(A, o.x - 1, o.y); if (B) put(B, o.x - 1, o.y + 1);
      let pk = (sim.packs || []).find(q => q.id === "fxpack"); if (!pk) { pk = { id: "fxpack", den: { x: o.x + 4, y: o.y } }; (sim.packs = sim.packs || []).push(pk); }
      const w = G.Animal.create(sim, "wolves", o.x + 3, o.y, null); w.pack = pk.id; w.pos = { x: o.x + 3, y: o.y }; w.act = { type: "idle", until: sim.tick + 1e6 }; w.facing = "left";
      w.memory = [{ who: A.id, group: null, members: null, s: 60, t: sim.tick, near: true }]; if (B) w.memory.push({ who: null, group: B.group, members: [B.id, A.id], s: 25, t: sim.tick, near: false });
      w.caution = { v: 33, t: sim.tick }; w.woundedUntil = sim.tick + Math.round(G.data.config.fight.woundMinutes / G.data.config.time.tickGameMinutes); sim.animals.push(w); r.wolf = w.id; r.people = [A.id];
    } else if (kind === "hut") {
      const h = G.Hut.fixture(sim, { dur: 80 }); if (h) { h.lashed = true; h.lashedAt = sim.tick; r.hut = G.Hut.selId(h); }
    } else if (kind === "beds") {
      const B = sim.reedBeds || []; B.slice(0, 4).forEach((b, i) => { b.n = Math.round(b.max * [0, 0.2, 0.6, 1][i]); }); r.beds = B.slice(0, 4).map(b => ({ x: b.x, y: b.y, n: b.n, max: b.max }));
    } else return null;
    return r; };
  G.Spar = Spar;
  if (G.V39) { G.V39.maybes.push(Spar.maybe); G.V39.acts.sparStance = Spar.stepStance; G.V39.acts.spar = Spar.stepBout; }
})(window.GS = window.GS || {});
