// Step 19: pairs, conception, pregnancy, birth, inheritance and carried babies. Numbers in config.family (documented there).
// Every random draw here (sex, conception, inheritance) uses its own seeded stream sim.frng, so the other streams run as before.
// Babies live in sim.babies, not sim.agents: until step 20 they are carried and their needs follow the carrier's (no AI of their own).
(function (G) {
  const CF = () => G.data.config, FC = () => CF().family, TM = () => CF().time.tickGameMinutes;
  const Family = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;
  const cheb = (p, q) => Math.max(Math.abs(Math.round(p.x) - Math.round(q.x)), Math.abs(Math.round(p.y) - Math.round(q.y)));
  const byId = (sim, id) => sim.agents.find(a => a.id === id) || null;
  Family.pron = a => a && a.sex === "m" ? "him" : "her";
  Family.poss = a => a && a.sex === "m" ? "his" : "her";
  Family.sexWord = a => a.sex === "m" ? "male" : a.sex === "f" ? "female" : "-";

  Family.init = function (sim) {
    sim.frng = new G.RNG((sim.seed ^ 0xFA3117E5) >>> 0); sim.babies = [];
    sim.famStats = { pairs: 0, breaks: 0, conceptions: 0, births: 0, babyDeaths: 0, adoptions: 0, lost: 0, capHits: 0, okNights: 0, birthTicks: [] };
    for (const a of sim.agents) Family.setup(sim, a);
    // Director (call 2 on 19): at least minFounders of each sex. Too few of one: the last founders of the other sex (by id) switch, so the
    // draw stays seeded and nothing else moves.
    const need = FC().minFounders || 0;
    for (const sx of ["f", "m"]) { const have = sim.agents.filter(a => a.sex === sx).length, other = sim.agents.filter(a => a.sex !== sx).sort((p, q) => q.id - p.id);
      for (let i = 0; i < need - have && other.length - i > need; i++) other[i].sex = sx; }
  };
  Family.setup = (sim, a) => { if (!a.sex) a.sex = sim.frng.chance(0.5) ? "f" : "m"; if (!a.children) a.children = []; if (!a.parents) a.parents = null; };
  Family.population = sim => sim.agents.length + (sim.babies || []).length + sim.agents.filter(a => a.preg).length;
  Family.mateOf = (sim, a) => a.mate != null ? byId(sim, a.mate) : null;
  Family.besideMate = (sim, a) => { const m = Family.mateOf(sim, a); return !!m && cheb(a.pos, m.pos) <= FC().conceive.tiles; };

  // step 20 stages by age: baby (in sim.babies), child, youth, adult
  Family.stage = a => { if (!a) return null; if (a.kind === "baby") return "baby"; const K = CF().child; return a.age < K.youthAt ? (a.age < K.childAt ? "baby" : "child") : a.age < K.adultAt ? "youth" : "adult"; };
  Family.isChild = a => !!a && a.kind === "person" && a.age < CF().child.youthAt;
  Family.isYouth = a => !!a && a.kind === "person" && a.age >= CF().child.youthAt && a.age < CF().child.adultAt;
  Family.stageWord = a => ({ baby: "baby", child: "child", youth: "youth", adult: "adult" })[Family.stage(a)];
  // a child's guardian: the person she keeps close to (null for youths / adults, and for a child on her own)
  Family.guardian = (sim, a) => Family.isChild(a) && a.guard != null ? byId(sim, a.guard) : null;

  // bedtime: walk to a free tile within conceive.tiles of the partner (if within follow tiles and not already there)
  Family.goToMate = (sim, a) => Family.goBeside(sim, a, Family.mateOf(sim, a), "mate");
  // step 20: the same walk for a child to her guardian (goal "beside")
  Family.goBeside = function (sim, a, m, goal) {
    if (!m) return false;
    if (m.act.type === "walk" && (m.act.goal === "mate" || m.act.goal === "beside") && m.act.to === a.id) return false;   // already coming to her
    if (goal === "mate" && m.act.type === "walk" && m.act.goal === "mate") return false;   // the partner is already on the way to her: lie down here
    // where the partner will be: the end of her walk, else where she is
    const mp = m.act.type === "walk" && m.act.path && m.act.path.length ? { x: m.act.path[m.act.path.length - 1][0], y: m.act.path[m.act.path.length - 1][1] } : m.pos;
    const d = Math.hypot(mp.x - a.pos.x, mp.y - a.pos.y);
    if (d > CF().social.follow.tiles || cheb(a.pos, mp) <= FC().conceive.tiles) return false;
    const mx = Math.round(mp.x), my = Math.round(mp.y), cand = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const x = mx + dx, y = my + dy;
      if (!G.World.inb(sim.world, x, y) || !G.World.walkable(sim.world, x, y) || G.Agent.claimed(sim, a, x, y)) continue;
      const st = G.Fire.state(sim, x, y); if (st && (st.s === "fire" || st.s === "ember")) continue;
      cand.push({ x, y, d: Math.hypot(x - a.pos.x, y - a.pos.y) }); }
    cand.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x);
    for (const c of cand.slice(0, 3)) if (G.Agent.walkTo(sim, a, c.x, c.y, goal)) { a.act.to = m.id; return true; }
    return false;
  };

  // daily (with the step-18 daily groups): pairs break, then new pairs form (highest mutual liking first)
  function daily(sim) {
    const B = FC().bond, St = sim.famStats;
    for (const a of sim.agents) { if (!a.parents) continue; const st = Family.stage(a); if (a.stage === st) continue; a.stage = st;   // born here: growing up
      if (st === "youth") { a.guard = null; G.Sim.log(sim, a.name + " roams on " + Family.poss(a) + " own now", a, "birth"); }
      if (st === "adult") { St.adults = (St.adults || 0) + 1; G.Sim.log(sim, a.name + " is grown", a, "birth"); } }
    for (const a of sim.agents) if (Family.isChild(a) && a.guard == null) guard(sim, a);   // on her own: a group may have formed since
    for (const a of sim.agents) { if (a.mate == null) continue; const m = byId(sim, a.mate);
      if (!m) { a.mate = null; continue; }
      if (a.id < m.id && (G.Social.like(a, m) < B.breakBelow || G.Social.like(m, a) < B.breakBelow)) { a.mate = null; m.mate = null; St.breaks++; G.Sim.log(sim, a.name + " and " + m.name + " no longer stay close by night", [a, m]); } }
    const free = sim.agents.filter(a => a.mate == null && a.age >= B.age[0] && a.age <= B.age[1]), cand = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) { const a = free[i], b = free[j], p = G.Social.rel(a, b), q = G.Social.rel(b, a);
      if (B.mixedOnly && a.sex === b.sex) continue;   // step 22 Director: mating pairs are man + woman only (a same-sex bond stays friendship: liking, groups, warmth)
      if (p && q && p.l >= B.like && q.l >= B.like && p.f >= B.fam && q.f >= B.fam) cand.push({ a, b, s: p.l + q.l }); }
    cand.sort((x, y) => y.s - x.s || Math.min(x.a.id, x.b.id) - Math.min(y.a.id, y.b.id) || Math.max(x.a.id, x.b.id) - Math.max(y.a.id, y.b.id));
    for (const c of cand) { if (c.a.mate != null || c.b.mate != null) continue; c.a.mate = c.b.id; c.b.mate = c.a.id; St.pairs++;
      G.Sim.log(sim, c.a.name + " and " + c.b.name + " stay close by night now", [c.a, c.b]); }
  }

  // once a night: a pair asleep side by side, both fed / watered / warm enough, room in the group's world -> p = conceive.chance
  function nightly(sim) {
    const C = FC().conceive, St = sim.famStats;
    for (const a of sim.agents) { if (a.sex !== "f" || a.preg || a.mate == null) continue; const m = byId(sim, a.mate); if (!m || m.sex !== "m") continue;
      if (a.act.type !== "sleep" || m.act.type !== "sleep" || cheb(a.pos, m.pos) > C.tiles) continue;
      if ([a, m].some(p => p.needs.fullness < C.fullness || p.needs.water < C.water || p.needs.warmth < C.warmth)) continue;
      St.okNights = (St.okNights || 0) + 1;   // a night that met every condition (diagnostic)
      if (Family.population(sim) >= CF().pop.maxPeople) { St.capHits++; continue; }
      if (!sim.frng.chance(C.chance)) continue;
      a.preg = { since: sim.tick, due: sim.tick + Math.round(FC().pregnancy.days * 1440 / TM()), father: m.id, fatherName: m.name, ftraits: Object.assign({}, m.traits), flife: m.lifespan, fgroup: m.group };
      St.conceptions++; G.Sim.log(sim, a.name + " is with child", a);
    }
  }

  // a new baby beside the carrier: traits = parents' average x (1 +- drift), 2% chance each of a further x (1 +- mutation.size)
  function inherit(sim, mv, fv, lo, hi, round) {
    const F = FC(), r = sim.frng, avg = (mv + fv) / 2; let v = avg * (1 + r.range(-F.drift, F.drift)), mut = 0;
    if (r.chance(F.mutation.chance)) { mut = r.chance(0.5) ? 1 : -1; v *= 1 + mut * F.mutation.size; }
    v = clamp(v, lo, hi); return { avg: r2(avg), v: round ? Math.round(v) : r2(v), mut };
  }
  function birth(sim, a) {
    const p = a.preg, St = sim.famStats, inh = {}, traits = {}; a.preg = null;
    for (const k of Object.keys(a.traits)) { const t = inherit(sim, a.traits[k], p.ftraits[k] != null ? p.ftraits[k] : a.traits[k], 0, 100, true); traits[k] = t.v; inh[k] = t; }
    const L = inherit(sim, a.lifespan, p.flife || a.lifespan, FC().lifespanClamp[0], FC().lifespanClamp[1], false); inh.lifespan = L;
    const b = { id: sim.nextId++, kind: "baby", name: G.Sim.nextName(sim), sex: sim.frng.chance(0.5) ? "f" : "m", look: a.look || 0,
      pos: { x: a.pos.x, y: a.pos.y }, facing: a.facing, age: 0, lifespan: L.v, traits, inh,
      needs: Object.assign({}, a.needs), zero: { water: 0, fullness: 0, warmth: 0 },
      carrier: a.id, carrierName: a.name, parents: [a.id, p.father], parentNames: [a.name, p.fatherName], bornAt: sim.tick, group: a.group != null ? a.group : null, children: [] };
    sim.babies.push(b); a.children.push(b.id); const f = byId(sim, p.father); if (f) (f.children || (f.children = [])).push(b.id);
    St.births++; St.birthTicks.push(sim.tick);
    G.Sim.log(sim, a.name + " gives birth; a baby lies beside " + Family.pron(a), [a, b, p.father], "birth");
  }

  // step 20: a child's guardian is gone (or never was): a living parent, else the group member (16+) she likes most, else no one
  function guard(sim, a) {
    const St = sim.famStats, was = a.guard;
    let g = (a.parents || []).map(id => byId(sim, id)).filter(Boolean)[0];
    if (!g && a.group != null) g = sim.agents.filter(q => q !== a && q.group === a.group && q.age >= CF().child.adultAt)
      .sort((p, q) => G.Social.like(a, q) - G.Social.like(a, p) || p.id - q.id)[0];
    if (g) { a.guard = g.id; a.alone = false; if (!a.parents || a.parents.indexOf(g.id) < 0) { St.attached = (St.attached || 0) + 1; G.Sim.log(sim, a.name + " keeps close to " + g.name + " now", [a, g], "birth"); } return g; }
    a.guard = null; if (!a.alone || was != null) { a.alone = true; St.alone = (St.alone || 0) + 1; G.Sim.log(sim, a.name + " is on " + Family.poss(a) + " own now", a); }
    return null;
  }
  Family.checkGuard = function (sim, a) { if (!Family.isChild(a)) return null; const g = Family.guardian(sim, a); return g || (a.guard != null ? guard(sim, a) : null); };

  // step 20: a baby of childAt years walks on her own: she becomes a person in sim.agents beside her carrier
  Family.becomeChild = function (sim, b) {
    const K = CF().child, c = b.orphanAt == null ? byId(sim, b.carrier) : null, P = CF().person, t = { x: Math.round(b.pos.x), y: Math.round(b.pos.y) };
    let spot = null;
    for (let r = 1; r <= 3 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = t.x + dx, y = t.y + dy; if (!G.World.inb(sim.world, x, y) || !G.World.walkable(sim.world, x, y) || G.Agent.claimed(sim, null, x, y)) continue;
      const st = G.Fire.state(sim, x, y); if (st && (st.s === "fire" || st.s === "ember")) continue; spot = { x, y }; }
    spot = spot || t;
    const traits = Object.assign({}, b.traits); traits.fireFear = clamp(traits.fireFear + K.fearAdd, 0, 100);   // spec: fear starts at the inherited value + 20
    const n = b.needs || {};
    const a = { id: b.id, kind: "person", name: b.name, look: b.look || 0, pos: spot, facing: b.facing || "down", age: b.age, lifespan: b.lifespan,
      needs: { fullness: n.fullness != null ? n.fullness : 70, water: n.water != null ? n.water : 70, energy: n.energy != null ? n.energy : 80, warmth: n.warmth != null ? n.warmth : 70 },
      traits, inh: b.inh, knowledge: c ? JSON.parse(JSON.stringify(c.knowledge)) : { bushes: {}, water: {} }, relations: {}, exp: {},
      act: { type: "idle", until: sim.tick + 1 }, stats: { meals: 0, drinks: 0, sleeps: 0 }, carry: null, zero: Object.assign({ water: 0, fullness: 0, warmth: 0 }, b.zero || {}),
      sex: b.sex, children: [], parents: b.parents, parentNames: b.parentNames, group: b.group != null ? b.group : null, bornAt: b.bornAt, stage: "child", guard: c ? c.id : null, rel: {} };
    if (c) { const SB = K.startBond; a.rel[c.id] = { f: SB.f, l: SB.l, m: 0, d: 0 }; c.rel = c.rel || {}; c.rel[a.id] = Object.assign({ m: 0, d: 0 }, c.rel[a.id] || {}, { f: SB.f, l: SB.l }); }
    sim.babies.splice(sim.babies.indexOf(b), 1); sim.agents.push(a); sim.famStats.children = (sim.famStats.children || 0) + 1;
    G.Sim.log(sim, a.name + " walks on " + Family.poss(a) + " own now" + (c ? ", close to " + c.name : ""), c ? [a, c] : a, "birth");
    if (!c) guard(sim, a);
    return a;
  };

  // babies: carried (position / needs follow the carrier); a carrier's death leaves them lying alone until an adult takes them up or a day passes
  function babies(sim) {
    const F = FC(), tm = TM(), dead = [], grown = [];
    for (const b of sim.babies) {
      b.age += tm / (1440 * G.Time.daysPerYear());
      if (b.age >= CF().child.childAt) { grown.push(b); continue; }
      const c = b.orphanAt == null ? byId(sim, b.carrier) : null;
      if (c) { b.pos.x = c.pos.x; b.pos.y = c.pos.y; b.facing = c.facing; b.group = c.group != null ? c.group : null;
        b.needs = Object.assign({}, c.needs); b.zero = Object.assign({}, c.zero); continue; }
      if (b.orphanAt == null) { b.orphanAt = sim.tick; b.pos = { x: Math.round(b.pos.x), y: Math.round(b.pos.y) }; G.Sim.log(sim, b.name + " lies alone", b); }
      // Director (21): the group member who likes the dead carrier most heads for the baby from up to seekTiles; with no group member
      // in range, any adult within anyTiles may take it (each hour: odds = curiosity - fireFear, %). Whoever reaches adoptTiles lifts it.
      const near = (q, R) => q.age >= 16 && Math.hypot(q.pos.x - b.pos.x, q.pos.y - b.pos.y) <= R, dead0 = { id: b.carrier };
      const adult = sim.agents.filter(q => (q.id === b.rescuer || q.group != null && q.group === b.group || b.parents.indexOf(q.id) >= 0) && near(q, F.adoptTiles))
        .sort((p, q) => (q.id === b.rescuer) - (p.id === b.rescuer) || Math.hypot(p.pos.x - b.pos.x, p.pos.y - b.pos.y) - Math.hypot(q.pos.x - b.pos.x, q.pos.y - b.pos.y) || p.id - q.id)[0];
      if (adult) { b.orphanAt = null; b.rescuer = null; b.carrier = adult.id; b.carrierName = adult.name; sim.famStats.adoptions++; if (adult.act.goal === "baby") G.Agent.startIdle(sim, adult);
        G.Sim.log(sim, adult.name + " lifts the baby and carries it", [adult, b], "birth"); continue; }
      let r = b.rescuer != null ? byId(sim, b.rescuer) : null;
      if (r && !(r.act.type === "walk" && r.act.goal === "baby" && r.act.baby === b.id)) r = null;   // she turned to something else: choose again
      if (!r) { b.rescuer = null;
        const mem = sim.agents.filter(q => q.group != null && q.group === b.group && near(q, F.seekTiles) && q.act.type !== "sleep")
          .sort((p, q) => G.Social.like(q, dead0) - G.Social.like(p, dead0) || p.id - q.id);
        let pick = mem[0] || null;
        if (!pick && !sim.agents.some(q => q.group != null && q.group === b.group && near(q, F.seekTiles)) && (sim.tick - b.orphanAt) % Math.max(1, Math.round(60 / tm)) === 0)
          for (const q of sim.agents) { if (!near(q, F.anyTiles) || q.act.type === "sleep") continue; if (sim.prng.chance(Math.max(0, q.traits.curiosity - q.traits.fireFear) / 100)) { pick = q; break; } }
        if (pick && G.Agent.walkTo(sim, pick, Math.round(b.pos.x), Math.round(b.pos.y), "baby", { baby: b.id })) { b.rescuer = pick.id; sim.famStats.rescues = (sim.famStats.rescues || 0) + 1; }
      }
      if (sim.tick - b.orphanAt >= F.orphanMinutes / tm) dead.push(b);
    }
    for (const b of grown) Family.becomeChild(sim, b);
    for (const b of dead) { sim.babies.splice(sim.babies.indexOf(b), 1); sim.famStats.babyDeaths++;
      G.Sim.log(sim, b.name + " lies still. " + b.name + " has died of being left alone.", b, "death");
      const body = G.Body.create(sim, b, "being left alone"); body.baby = true; sim.bodies.push(body); }
  }

  // step 24 (v19): a baby dies at once (a carried baby whose carrier was struck, or one lying on the struck tile); same log line and body as a person
  Family.babyDie = function (sim, b, cause) {
    const i = sim.babies.indexOf(b); if (i < 0) return null; sim.babies.splice(i, 1); sim.famStats.babyDeaths++;
    const BC = G.data.config.body || {}, lines = (BC.storyDeathLines || {})[cause];
    let mid;
    if (lines && lines.length) mid = " " + lines[((b.id || 0) + (sim.tick || 0)) % lines.length];
    else {
      const vb = (BC.causeVerb || {})[cause];
      mid = typeof vb === "string" && vb.charAt(0) === "=" ? " " + vb.slice(1)
          : vb ? " " + vb + " " + cause : " has died of " + cause;
    }
    G.Sim.log(sim, b.name + " lies still. " + b.name + mid + ".", b, "death");
    const body = G.Body.create(sim, b, cause); body.baby = true; sim.bodies.push(body); return body;
  };
  Family.step = function (sim) {
    if (!sim.babies) return; const tm = TM();
    if ((sim.tick * tm) % 1440 === 0) daily(sim);   // with Social.daily (relations and groups are fresh)
    if (G.Time.at(sim.tick).minuteOfDay === FC().conceive.atMinute) nightly(sim);   // clock time (2:00 AM)
    for (const a of sim.agents) if (a.preg && sim.tick >= a.preg.due) birth(sim, a);
    if (sim.babies.length) babies(sim);
  };
  // a death: a pregnancy ends with her; the partner is free again (at the next daily check)
  Family.onDeath = function (sim, a) {
    if (a.preg) { a.preg = null; sim.famStats.lost++; }
    const m = Family.mateOf(sim, a); if (m) m.mate = null;
  };
  Family.babyById = (sim, id) => (sim.babies || []).find(b => b.id === id) || null;
  // name / state of anyone by id: a living person, a baby, or a body
  Family.who = function (sim, id) {
    const a = byId(sim, id); if (a) return { id, name: a.name, alive: true };
    const b = Family.babyById(sim, id); if (b) return { id, name: b.name, alive: true, baby: true };
    const d = sim.bodies.find(q => q.of === id); if (d) return { id: d.id, name: d.name, alive: false };
    return null;
  };
  Family._daily = daily; Family._nightly = nightly; Family._birth = birth; Family._inherit = inherit;   // for tests
  G.Family = Family;
})(this.GS = this.GS || {});
