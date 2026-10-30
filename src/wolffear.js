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
  // ---- v38 (f): baseline, inheritance, floor ----
  WF.base = () => C().baseline || 0;
  WF.seeFar = () => C().seeTiles;
  WF.floor = a => { if (a && (a.wolfFear == null || a.wolfFear < WF.base())) a.wolfFear = WF.base(); return a; };
  // newborn: baseline + inheritShare x (parents' mean - baseline), inherited part capped at inheritMax (and never below baseline)
  WF.inherit = function (fa, fb) { const c = C(), b0 = WF.base(), vs = [fa, fb].filter(v => v != null);
    const mean = vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : b0;
    return r9(b0 + Math.max(0, Math.min(c.inheritMax == null ? 30 : c.inheritMax, (c.inheritShare || 0) * (mean - b0)))); };
  // a parent's fear now: the living person, else her body's soul, else baseline
  WF.parentFear = function (sim, id) { if (id == null) return null; const q = sim.agents.find(o => o.id === id); if (q) return WF.of(q);
    const b = (sim.bodies || []).find(o => o.of === id); return b && b.soul && b.soul.wolfFear != null ? b.soul.wolfFear : null; };
  // drop fear (watching a wolf fall), never below baseline
  WF.drop = function (a, v) { const was = WF.of(a); a.wolfFear = r9(Math.max(WF.base(), was - v)); return was - a.wolfFear; };
  G.WolfFear = WF;

  // ---- v38 (f): facing wolves - readiness, standing, group strikes, group hunts, spawn joining ----
  const Fx = {};
  const FC = () => G.data.config.wolfFight, AW = () => G.data.config.animals.wolves, CFG = () => G.data.config;
  const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  const heldOf = (sim, a) => G.Items && G.Items.held ? G.Items.held(sim, a) : null;
  Fx.heldValue = function (sim, a) { const it = heldOf(sim, a); if (!it || (G.Injury && !G.Injury.canUseTools(a))) return 0;
    const t = G.Tools ? G.Tools.type(it) : null; return (t && FC().held[t]) || 0; };
  Fx.armed = (sim, a) => Fx.heldValue(sim, a) > 0;
  Fx.able = (sim, a) => !!a && a.kind === "person" && (!G.Family || G.Family.stage(a) === "adult") && awake(a) && !(a.injuries && a.injuries.length) &&
    a.needs.energy >= FC().exhaustedBelow && sim.agents.indexOf(a) >= 0;
  Fx.allies = (sim, a) => sim.agents.filter(q => q !== a && Fx.able(sim, q) && dist(a, q) <= FC().allyTiles);
  // computed on the spot, never stored or shown
  Fx.readiness = function (sim, a) { const F = FC(); return Fx.heldValue(sim, a) + (G.Hides && G.Hides.wearing(a) ? F.hide : 0) + F.perAlly * Fx.allies(sim, a).length; };
  Fx.stands = (sim, a) => Fx.readiness(sim, a) > WF.of(a);
  const stats = sim => sim.wolfFight || (sim.wolfFight = { stands: 0, runs: 0, strikes: 0, kills: 0, bites: 0, hunts: 0 });
  // the attackers on this wolf around p: p (if armed) + armed, able, ready adults within allyTiles of p and strikeTiles+allyTiles of the wolf
  Fx.attackers = function (sim, p, wolf) { const F = FC();
    return sim.agents.filter(q => (q === p || (Fx.able(sim, q) && dist(q, p) <= F.allyTiles)) && Fx.armed(sim, q) && Fx.stands(sim, q) && dist(q, wolf) <= F.strikeTiles + F.allyTiles + 0.2); };
  // a wolf chases or strikes p. Ready → stand (and strike if armed and close). Returns true when she did not run.
  Fx.confront = function (sim, p, wolf) { if (!p || !wolf || !awake(p) || sim.agents.indexOf(p) < 0) return false;
    if (!Fx.stands(sim, p)) { stats(sim).runs++; return false; }
    const S = stats(sim), F = FC(); S.stands++;
    if (Fx.armed(sim, p) && dist(p, wolf) <= F.strikeTiles + 0.2) { Fx.strike(sim, p, wolf); return true; }
    if (!(p.act && p.act.type === "idle" && p.act.goal === "standWolf")) {
      if (sim.tick - (p.standLogAt == null ? -1e9 : p.standLogAt) >= 120 / TM()) { p.standLogAt = sim.tick; G.Sim.log(sim, p.name + " stands " + (p.sex === "m" ? "his" : "her") + " ground against the " + G.Animal.label("wolves"), p); }
      if (!(p.act && p.act.goal === "wolfHunt")) p.act = { type: "idle", goal: "standWolf", until: sim.tick + Math.round(F.standMinutes / TM()), wolf: wolf.id }; }
    return true; };
  function tileFree(sim, x, y) { return G.World.inb(sim.world, x, y) && G.World.walkable(sim.world, x, y); }
  // one roll for the group
  Fx.strike = function (sim, p, wolf) { const F = FC(), S = stats(sim);
    if (sim.animals.indexOf(wolf) < 0) return false;
    if (p.wolfStrikeAt === sim.tick) return false; 
    const team = Fx.attackers(sim, p, wolf); if (!team.length) return false; for (const q of team) q.wolfStrikeAt = sim.tick;
    const odds = team.reduce((v, q) => v + G.Hunt.odds(q, heldOf(sim, q)), 0) / team.length, ch = Math.min(F.maxChance, odds * F.oddsX * team.length);
    S.strikes++; const it = heldOf(sim, p), hl = it ? ((G.Tools && G.Tools.labelOf(it)) || G.Items.matLabel(it)) : "hands";
    for (const q of team) { const h = heldOf(sim, q); if (G.Tools && h && h.tool) G.Tools.use(sim, q, h, "hunt"); }
    if (sim.orng.chance(ch)) { Fx.kill(sim, team, wolf, hl); return true; }
    G.Sim.log(sim, (team.length > 1 ? names(team) + " strike" : p.name + " strikes") + " at " + G.Animal.name(wolf) + " and miss" + (team.length > 1 ? "" : "es"), p);
    if (sim.orng.chance(F.biteChance)) { const v = sim.orng.pick(team); S.bites++;
      v.needs.energy = r9(Math.max(0, v.needs.energy - AW().threaten.damageEnergy / 2));
      WF.onAttack(sim, v); if (G.Injury) G.Injury.fromWolf(sim, v); }
    return false; };
  const names = team => team.length <= 1 ? (team[0] || {}).name : team.slice(0, -1).map(q => q.name).join(", ") + " and " + team[team.length - 1].name;
  Fx.kill = function (sim, team, wolf, hl) { const F = FC(), S = stats(sim), lead = team[0];
    sim.animals.splice(sim.animals.indexOf(wolf), 1); delete sim.prev[wolf.id];
    const b = G.Body.createAnimal(sim, wolf, { name: "people" }); b.hunters = team.map(q => q.id); sim.bodies.push(b);
    Fx.prune(sim, wolf);
    S.kills++; sim.wolfKills = (sim.wolfKills || 0) + 1;
    G.Sim.log(sim, names(team) + " strike" + (team.length > 1 ? "" : "s") + " " + b.name + " with the " + hl + ": it falls", lead);
    for (const q of team) { const e = G.Learn.add(q, "wolf_hunt", F.learnGain); e.n = (e.n || 0) + 1; q.stats.wolfKills = (q.stats.wolfKills || 0) + 1;
      if (q.act && (q.act.goal === "wolfHunt" || q.act.goal === "standWolf")) G.Agent.startIdle(sim, q, 0.3); }
    const it = heldOf(sim, lead); G.Discoveries.note(sim, lead, "strike", [it ? G.Items.baseLabel(it) : "hands", "wolves"], "wolf falls");
    G.Learn.success(sim, lead, "wolf_hunt");
    for (const o of sim.agents) if (awake(o) && Math.hypot(o.pos.x - b.x, o.pos.y - b.y) <= AW().watchTiles) { const d = WF.drop(o, F.killWatchDrop); if (d > 0) S.fearDrop = r9((S.fearDrop || 0) + d); }
    return b; };
  // a wolf gone from its pack; a pack with no wolves left is gone for good (no respawn)
  Fx.prune = function (sim, wolf) { for (const pk of sim.packs || []) if (pk.members) pk.members = pk.members.filter(id => id !== (wolf && wolf.id) && sim.animals.some(o => o.id === id));
    const before = (sim.packs || []).length; sim.packs = (sim.packs || []).filter(pk => sim.animals.some(o => o.species === "wolves" && o.pack === pk.id));
    if (sim.packs.length < before) sim.packsGone = (sim.packsGone || 0) + before - sim.packs.length; };
  Fx.packSize = (sim, pk) => sim.animals.filter(o => o.species === "wolves" && o.pack === pk.id).length;
  // the pack a wolf spawned at (x, y) would join: nearest pack wolf within spawnJoinTiles, else null (a new pack)
  Fx.joinTarget = function (sim, x, y) { let best = null, bd = Infinity;
    for (const w of sim.animals) if (w.species === "wolves" && w.pack != null) { const d = Math.hypot(w.pos.x - x, w.pos.y - y); if (d < bd) { bd = d; best = w; } }
    if (!best || bd > AW().spawnJoinTiles) return null; return (sim.packs || []).find(pk => pk.id === best.pack) || null; };
  Fx.spawnRoom = function (sim, x, y) { const pk = Fx.joinTarget(sim, x, y); return !pk || Fx.packSize(sim, pk) < AW().packSize[1]; };
  Fx.joinPack = function (sim, c, x, y) { sim.packs = sim.packs || []; let pk = Fx.joinTarget(sim, x, y);
    if (pk) { c.pack = pk.id; pk.members = (pk.members || []).concat([c.id]); return { pack: pk, joined: true }; }
    if (sim.nextPackId == null) sim.nextPackId = sim.packs.reduce((m, q) => Math.max(m, q.id + 1), 0);
    pk = { id: sim.nextPackId++, den: { x: Math.round(x), y: Math.round(y) }, members: [c.id] }; sim.packs.push(pk); c.pack = pk.id; return { pack: pk, joined: false }; };
  // ---- group hunt ----
  function inTerritory(sim, w) { const pk = G.Animal.packOf(sim, w); return !!pk && Math.hypot(w.pos.x - pk.den.x, w.pos.y - pk.den.y) <= AW().territory; }
  function walkAt(sim, a, w, since) { const t = G.Agent.tilePos(a), tx = Math.round(w.pos.x), ty = Math.round(w.pos.y);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { if (!tileFree(sim, tx + dx, ty + dy)) continue;
      const p = G.World.findPath(sim.world, t.x, t.y, tx + dx, ty + dy); if (p) { a.act = { type: "walk", goal: "wolfHunt", path: p, i: 0, wolf: w.id, since }; return true; } }
    return false; }
  const busy = a => !a.act || a.act.type === "sleep" || a.act.type === "eat" || a.act.type === "drink" || a.act.type === "eatMeat" || a.act.type === "cook" ||
    ["food", "water", "hunt", "meat", "fleeWolf", "wolfHunt", "cover", "drag", "corpse"].indexOf(a.act.goal) >= 0;
  Fx.step = function (sim) {
    if ((sim.packs || []).length && sim.packs.some(pk => !sim.animals.some(o => o.pack === pk.id))) Fx.prune(sim, null);
    const H = FC().hunt; if (sim.tick % Math.max(1, Math.round(H.checkMinutes / TM())) !== 0) return;
    const wolves = sim.animals.filter(o => o.species === "wolves" && o.pack != null); if (!wolves.length) return;
    const rng = sim.wrng || (sim.wrng = new G.RNG((sim.seed ^ 0x5EA4F00D) >>> 0));   // own stream: no shift in the older streams
    for (const a of sim.agents) {
      if (busy(a) || !Fx.able(sim, a) || !Fx.armed(sim, a) || sim.tick < (a.wolfHuntNext || 0) || (G.Agent.want && G.Agent.want(a))) continue;
      let w = null, wd = Infinity; for (const q of wolves) { const d = dist(a, q); if (d <= H.seekTiles && d < wd && inTerritory(sim, q)) { wd = d; w = q; } }
      if (!w || !Fx.stands(sim, a)) continue;
      const team = [a].concat(Fx.allies(sim, a).filter(q => Fx.armed(sim, q) && !busy(q) && Fx.stands(sim, q)));
      if (team.length - 1 < H.minAllies) continue;
      const pull = H.pullBase + G.Learn.score(a, "wolf_hunt") / H.pullPer;
      if (!rng.chance(Math.min(1, H.startChance * pull))) continue;
      const go = team.filter(q => walkAt(sim, q, w, sim.tick)); if (go.length - 1 < H.minAllies) { for (const q of go) G.Agent.startIdle(sim, q, 0.3); continue; }
      for (const q of go) q.wolfHuntNext = sim.tick + Math.round(H.cooldownMinutes / TM());
      stats(sim).hunts++; G.Sim.log(sim, names(go) + " set off after " + G.Animal.name(w), a);
    }
  };
  // walking with goal wolfHunt (after the move): strike when close; re-path; give up
  Fx.stepHunt = function (sim, a) { const F = FC(), H = F.hunt, act = a.act, w = sim.animals.find(q => q.id === act.wolf);
    if (!w || (sim.tick - act.since) * TM() > H.giveUpMinutes || !Fx.able(sim, a)) { G.Agent.startIdle(sim, a, 0.3); return; }
    if (dist(a, w) <= F.strikeTiles + 0.2) { if (Fx.armed(sim, a) && Fx.stands(sim, a)) Fx.strike(sim, a, w); if (sim.animals.indexOf(w) >= 0 && a.act === act) a.act.path = a.act.path.slice(0, a.act.i); return; }
    if ((sim.tick - act.since) % Math.max(1, Math.round(H.repathMinutes / TM())) === 0 || act.i >= act.path.length) { if (!walkAt(sim, a, w, act.since)) G.Agent.startIdle(sim, a, 0.3); } };
  Fx.arrive = function (sim, a) { const w = sim.animals.find(q => q.id === a.act.wolf);
    if (w && dist(a, w) <= FC().strikeTiles + 0.2 && Fx.armed(sim, a)) { Fx.strike(sim, a, w); if (sim.animals.indexOf(w) >= 0) a.act = { type: "idle", goal: "wolfHunt", until: sim.tick + 1, wolf: w.id, since: a.act.since }; return; }
    if (!w || !walkAt(sim, a, w, a.act.since)) G.Agent.startIdle(sim, a, 0.3); };
  // ---- fixture (test / Tester; ?fixture=wolves[&kind=...], GS.debug.wolvesFixture). Sets up a scene by the first pack's first wolf, then the live sim plays it out:
  //  dog    - no deer within huntDog.stalkTiles + 6 of the wolf, a wild dog 1 tile off, wolf hungry          (spec test 1)
  //  flee   - a deer and a wild dog 7 tiles off a hungry wolf                                                (spec test 2)
  //  corpse - the wolf feeding at a fresh deer body, a hungry wild dog 9 tiles off                            (spec test 3)
  //  fight  - three adults with long sticks (spears) beside the wolf, inside its territory                    (spec test 6)
  //  lone   - one adult, empty-handed, beside the wolf                                                         (spec test 6)
  //  spawn  - every wolf and pack removed (a wiped-out pack; spawn Wolves with the power to start a new one) (spec test 7)
  // Returns { kind, wolf, dog, deer, people, body }.
  function spotsNear(sim, cx, cy, rmax, skip) { const W = G.World, out = [];
    for (let r = 1; r <= rmax; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy; if (!W.inb(sim.world, x, y) || !W.walkable(sim.world, x, y) || W.isWater(sim.world, x, y)) continue;
      if (sim.animals.some(q => Math.round(q.pos.x) === x && Math.round(q.pos.y) === y) || sim.agents.some(q => Math.round(q.pos.x) === x && Math.round(q.pos.y) === y)) continue;
      if (skip && skip(x, y, r)) continue; out.push({ x, y, r }); }
    return out; }
  function put(sim, o, x, y) { o.pos = { x, y }; if (sim.prev) sim.prev[o.id] = { x, y }; }
  Fx.fixture = function (sim, opts) { const o = opts || {}, kind = o.kind || "fight", A = G.data.config.animals, out = { kind, wolf: null, dog: null, deer: null, people: [], body: null };
    if (kind === "spawn") { sim.animals = sim.animals.filter(q => q.species !== "wolves"); Fx.prune(sim, null); return out; }
    const w = sim.animals.find(q => q.species === "wolves" && q.pack != null); if (!w) return null; out.wolf = w;
    const pk = G.Animal.packOf(sim, w), wx = Math.round(pk ? pk.den.x : w.pos.x), wy = Math.round(pk ? pk.den.y : w.pos.y);
    const s0 = spotsNear(sim, wx, wy, 4)[0]; if (s0) put(sim, w, s0.x, s0.y); const tx = Math.round(w.pos.x), ty = Math.round(w.pos.y);
    w.act = { type: "idle", until: sim.tick + 1 }; const add = (sp, r) => { const q = spotsNear(sim, tx, ty, r + 3, (x, y, rr) => rr < r)[0]; if (!q) return null;
      const c = G.Animal.create(sim, sp, q.x, q.y, sp === "grazer" ? ((sim.herds || [])[0] ? sim.herds[0].id : 0) : null); sim.animals.push(c); put(sim, c, q.x, q.y); return c; };
    if (kind === "dog" || kind === "flee" || kind === "corpse") { const far = A.wolves.huntDog.stalkTiles + 6;
      // keep people out of the way (they would draw the wolf or scare the dog)
      for (const p of sim.agents) if (Math.hypot(p.pos.x - tx, p.pos.y - ty) < far) { const q = spotsNear(sim, tx, ty, far + 10, (x, y, rr) => rr < far)[0]; if (q) { put(sim, p, q.x, q.y); G.Agent.startIdle(sim, p, 0.3); } } }
    if (kind === "dog") { const far = A.wolves.huntDog.stalkTiles + 6; sim.animals = sim.animals.filter(q => q.species !== "grazer" || Math.hypot(q.pos.x - tx, q.pos.y - ty) > far);
      w.needs.fullness = 10; out.dog = add("scavenger", 1); }
    else if (kind === "flee") { w.needs.fullness = 10; out.deer = add("grazer", 7); out.dog = add("scavenger", 7); }
    else if (kind === "corpse") { const q = spotsNear(sim, tx, ty, 2)[0]; const deer = G.Animal.create(sim, "grazer", q.x, q.y, 0);
      const b = G.Body.createAnimal(sim, deer, { name: G.Animal.label("wolves") }); sim.bodies.push(b); out.body = b; w.needs.fullness = 30; w.act = { type: "feed", body: b.id };
      out.dog = add("scavenger", 9); if (out.dog) { out.dog.needs.fullness = 5; out.dog.act = { type: "idle", until: sim.tick + 1 }; } }
    else if (kind === "fight" || kind === "lone") { const n = kind === "fight" ? (o.n || 3) : 1;
      const adults = sim.agents.filter(q => Fx.able(sim, q) || (G.Family && G.Family.stage(q) === "adult")).slice(0, n);
      while (adults.length < n) { const p = G.Agent.createPerson(sim, tx, ty); sim.agents.push(p); adults.push(p); }
      const far = FC().allyTiles + WF.seeFar();   // everyone else out of ally / watch range, so the scene is just these adults
      for (const p of sim.agents) if (adults.indexOf(p) < 0 && Math.hypot(p.pos.x - tx, p.pos.y - ty) < far) { const q = spotsNear(sim, tx, ty, far + 10, (x, y, rr) => rr < far)[0]; if (q) { put(sim, p, q.x, q.y); G.Agent.startIdle(sim, p, 0.3); } }
      const ring = (kind === "lone" ? spotsNear(sim, tx, ty, FC().allyTiles + 2, (x, y, rr) => rr < FC().allyTiles) : spotsNear(sim, tx, ty, FC().allyTiles)).sort((p, q) => p.r - q.r);   // lone: a few tiles off, so the run is seen
      adults.forEach((p, i) => { const q = ring[i]; if (!q) return; put(sim, p, q.x, q.y); p.needs.energy = Math.max(p.needs.energy, 80); p.injuries = []; p.wolfFear = WF.base(); p.fright = null; if (p.act && p.act.type === "sleep") p.act = { type: "idle", until: sim.tick + 1 };
        if (p.carry != null && G.Items) G.Items.drop(sim, p, "fixture");
        if (kind === "fight") { const st = G.Items.create(sim, "stick", q.x, q.y); sim.items.push(st); st.heldBy = p.id; p.carry = st.id; G.Tools.lock(sim, null, st, "spear"); }
        G.Agent.startIdle(sim, p, 0.3); out.people.push(p); });
      w.needs.fullness = 60; }
    return out; };
  G.WolfFight = Fx;
})(this.GS = this.GS || {});
