// v39 melee / ranged skills + group judgment (specs/reed_fiber_DRAFT.md §5). Rewires G.WolfFight (wolffear.js v38 f):
// strength(sim, q, wolf) follows her weapon (melee or bow at range); R = group / wolves x (1 - fear / fearDiv) + momentum replaces
// readiness > wolfFear (stand at standAt) and hunt.minAllies (start at engageAt). Archers join the strike roll from range; a cornered or
// struck person fights for her life (desperate roll, fgrng). G.Skills: melee / ranged gains (visible successes, copied by the generic rules).
(function (G) {
  const CF = () => G.data.config, FC = () => CF().wolfFight, X = () => CF().fight, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r9 = v => Math.round(v * 1e9) / 1e9;
  const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  const rng = sim => sim.fgrng || (sim.fgrng = new G.RNG((sim.seed ^ 0xF16A7105) >>> 0));
  const awake = a => !!a && !!a.act && a.act.type !== "sleep";

  // ---------- skills ----------
  const Skills = {};
  Skills.newStats = () => ({ melee: 0, ranged: 0, desperate: 0, wounds: 0, desperateKills: 0, spar: 0 });
  Skills.stats = sim => sim.fightStats || (sim.fightStats = Skills.newStats());
  Skills.gain = function (sim, a, key, kind) {
    const C = CF()[key]; if (!C || !a) return 0; const v = C.gain[kind]; if (!v) return 0;
    const was = G.Learn.score(a, key); let to = was + v;
    if (kind === "spar") to = Math.min(to, Math.max(was, CF().melee.sparCap));
    const e = G.Learn.rec(a, key); e.score = r9(clamp(to, 0, 100)); e.n = (e.n || 0) + 1;
    const S = Skills.stats(sim); S[key] = r9((S[key] || 0) + (e.score - was));
    if (e.score > was) G.Learn.success(sim, a, key);   // a visible success of that one key: watchers copy it, never the other
    return e.score - was;
  };
  // 38 -> 39 seeding (all v38 fighting history is melee)
  Skills.migrateOne = function (a) {
    const M = CF().skillMigrate, s = a.stats || {}, L = G.Learn;
    const survived = (a.wolfFearLog || []).filter(e => e && (e.k === "survived" || e.kind === "survived" || e.why === "survived" || e.type === "survived")).length;
    const raw = M.start + M.perKill * (s.kills || 0) + M.perWolfKill * (s.wolfKills || 0) + M.perSurvived * survived
      + M.wolfHuntX * Math.max(0, L.score(a, "wolf_hunt") - 50) + M.huntX * Math.max(0, L.score(a, "hunt") - 50);
    const E = a.exp || (a.exp = {}), kid = G.Family && G.Family.stage && ["baby", "child"].indexOf(G.Family.stage(a)) >= 0;   // children: 20 / 20
    E.melee = { score: r9(kid ? M.start : clamp(raw, M.min, M.max)), n: 0, burns: 0, copied: null };
    E.ranged = { score: r9(clamp(M.start, M.min, M.max)), n: 0, burns: 0, copied: null };
    delete E.spar;
  };
  // Decision 5: a thrown hit counts as ranged, a poke as melee (no throw action yet; these are the hooks it will call; fixtures use them now)
  Skills.thrownHit = (sim, a, animal) => Skills.gain(sim, a, "ranged", "animalShot");
  Skills.poke = (sim, a, animal) => Skills.gain(sim, a, "melee", "animalStrike");
  Skills.migrate = function (o) { for (const a of o.agents || []) Skills.migrateOne(a); };

  const Fx = G.WolfFight; if (!Fx) { G.Skills = Skills; return; }
  const WF = G.WolfFear;
  const heldOf = (sim, a) => G.Items.held(sim, a);
  const B = () => G.Bow;
  const bowReady = it => !!(B() && B().ready(it));
  const toolsOk = a => !(G.Injury && !G.Injury.canUseTools(a));
  // melee held value (a bow counts 0 up close)
  Fx.heldValue = function (sim, a) { const it = heldOf(sim, a); if (!it || !toolsOk(a)) return 0;
    const t = G.Tools ? G.Tools.type(it) : null; if (t === "bow") return 0; return (t && FC().held[t]) || 0; };
  Fx.archer = (sim, a, wolf) => { const it = heldOf(sim, a); if (!bowReady(it) || !toolsOk(a)) return false; if (!wolf) return true; const d = dist(a, wolf); return d > 1 + 1e-9 && d <= CF().bow.shootTiles + 1e-9; };
  Fx.armed = (sim, a, wolf) => Fx.heldValue(sim, a) > 0 || Fx.archer(sim, a, wolf);
  Fx.hideOn = a => G.Hides && G.Hides.wearing(a) ? FC().hide : 0;
  // computed, never stored or shown
  Fx.strength = function (sim, q, wolf) {
    const F = FC(), K = X(), it = heldOf(sim, q), hide = Fx.hideOn(q);
    if (bowReady(it) && toolsOk(q) && (!wolf || dist(q, wolf) > 1 + 1e-9)) {
      if (wolf && dist(q, wolf) > CF().bow.shootTiles + 1e-9) return 0;
      const r = G.Learn.score(q, "ranged"); return K.base + r * K.skillX + F.held.bow * Math.min(F.bowMaxX, r / 50) + hide;
    }
    return K.base + G.Learn.score(q, "melee") * K.skillX + Fx.heldValue(sim, q) + hide;
  };
  const recent = (sim, t) => t != null && sim.tick - t <= Math.round(X().momentumMinutes / TM());
  Fx.running = (sim, q) => recent(sim, q.wolfRunAt) && !(q.wolfCommitAt != null && q.wolfCommitAt > q.wolfRunAt);
  Fx.committed = (sim, q) => recent(sim, q.wolfCommitAt) && !(q.wolfRunAt != null && q.wolfRunAt > q.wolfCommitAt);
  Fx.nearestWolf = function (sim, a) { let w = null, d = Infinity; for (const o of sim.animals) if (o.species === "wolves") { const e = dist(a, o); if (e < d) { d = e; w = o; } } return w; };
  Fx.groupOf = function (sim, a, wolf) {
    const F = FC(), see = WF.seeFar(), out = [a];
    for (const q of sim.agents) { if (q === a || !Fx.able(sim, q) || Fx.running(sim, q)) continue;
      if (dist(a, q) <= F.allyTiles + 1e-9 || (wolf && dist(a, q) <= see && (Fx.archer(sim, q, wolf)   // archers she can see
        || (Fx.heldValue(sim, q) > 0 && dist(q, wolf) <= F.strikeTiles + F.allyTiles + 1e-9)))) out.push(q); }   // or armed people she can see at the wolf
    return out;
  };
  Fx.wolvesNear = (sim, a, wolf) => Math.max(wolf ? 1 : 0, sim.animals.filter(o => o.species === "wolves" && dist(a, o) <= X().packTiles + 1e-9).length);
  Fx.momentum = function (sim, a) { const K = X(), see = WF.seeFar(); let m = 0;
    for (const q of sim.agents) { if (q === a || !awake(q) || dist(a, q) > see) continue; if (Fx.committed(sim, q)) m += K.commitBoost; else if (Fx.running(sim, q)) m -= K.fleeDrop; }
    return m; };
  Fx.R = function (sim, a, wolf) {
    wolf = wolf || Fx.nearestWolf(sim, a); const K = X(), n = Fx.wolvesNear(sim, a, wolf); if (!n) return Infinity;
    const g = Fx.groupOf(sim, a, wolf).reduce((v, q) => v + Fx.strength(sim, q, wolf), 0);
    return r9(g / (K.wolfStrength * n) * (1 - WF.of(a) / K.fearDiv) + Fx.momentum(sim, a));
  };
  Fx.readiness = (sim, a, wolf) => Fx.R(sim, a, wolf);
  // can't flee: energy under exhaustedBelow, or no free tile farther from the wolf within fleeSteps
  Fx.cornered = function (sim, a, wolf) {
    if (a.needs.energy < FC().exhaustedBelow) return true; if (!wolf) return false;
    const t = G.Agent.tilePos(a), k = X().fleeSteps, d0 = dist(a, wolf), W = G.World;
    for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) { if (!dx && !dy) continue; const x = t.x + dx, y = t.y + dy;
      if (!W.walkable(sim.world, x, y) || W.isWater(sim.world, x, y)) continue; if (Math.hypot(x - wolf.pos.x, y - wolf.pos.y) > d0 + 0.5) return false; }
    return true;
  };
  Fx.stands = (sim, a, wolf) => { wolf = wolf || Fx.nearestWolf(sim, a); return Fx.R(sim, a, wolf) >= X().standAt - 1e-9 || Fx.cornered(sim, a, wolf); };
  const stats = sim => sim.wolfFight || (sim.wolfFight = { stands: 0, runs: 0, strikes: 0, kills: 0, bites: 0, hunts: 0 });
  Fx.attackers = function (sim, p, wolf) { const F = FC();
    return sim.agents.filter(q => (q === p || (Fx.able(sim, q) && (dist(q, p) <= F.allyTiles || Fx.archer(sim, q, wolf)))) && Fx.stands(sim, q, wolf) &&
      ((Fx.heldValue(sim, q) > 0 && dist(q, wolf) <= F.strikeTiles + F.allyTiles + 0.2) || Fx.archer(sim, q, wolf))); };
  Fx.confront = function (sim, p, wolf) { if (!p || !wolf || !awake(p) || sim.agents.indexOf(p) < 0) return false;
    if (!Fx.stands(sim, p, wolf)) { stats(sim).runs++; p.wolfRunAt = sim.tick; return false; }
    const S = stats(sim), F = FC(); S.stands++; p.wolfCommitAt = sim.tick;
    if ((Fx.heldValue(sim, p) > 0 && dist(p, wolf) <= F.strikeTiles + 0.2) || (Fx.archer(sim, p, wolf) && G.Bow.cool(sim, p))) { Fx.strike(sim, p, wolf); return true; }
    if (!(p.act && p.act.type === "idle" && p.act.goal === "standWolf")) {
      if (sim.tick - (p.standLogAt == null ? -1e9 : p.standLogAt) >= 120 / TM()) { p.standLogAt = sim.tick; G.Sim.log(sim, p.name + " stands " + (p.sex === "m" ? "his" : "her") + " ground against the " + G.Animal.label("wolves"), p); }
      if (!(p.act && p.act.goal === "wolfHunt")) p.act = { type: "idle", goal: "standWolf", until: sim.tick + Math.round(F.standMinutes / TM()), wolf: wolf.id }; }
    return true; };
  const names = team => team.length <= 1 ? (team[0] || {}).name : team.slice(0, -1).map(q => q.name).join(", ") + " and " + team[team.length - 1].name;
  Fx.oddsOf = function (sim, q, wolf) { const K = X();
    if (Fx.archer(sim, q, wolf)) { const bw = heldOf(sim, q), ar = bw.arrows[bw.arrows.length - 1];
      return G.Bow.hit(sim, q, ar, dist(q, wolf)) * K.rangedX * (0.5 + G.Learn.score(q, "ranged") / 100); }
    return G.Hunt.odds(q, heldOf(sim, q)) * (0.5 + G.Learn.score(q, "melee") / 100); };
  // one roll for the group (orng as v38)
  Fx.strike = function (sim, p, wolf) { const F = FC(), S = stats(sim);
    if (sim.animals.indexOf(wolf) < 0) return false;
    if (p.wolfStrikeAt === sim.tick) return false;
    const team = Fx.attackers(sim, p, wolf); if (!team.length) return false;
    const archers = team.filter(q => Fx.archer(sim, q, wolf)), melee = team.filter(q => archers.indexOf(q) < 0);
    const sum = team.reduce((v, q) => v + Fx.oddsOf(sim, q, wolf), 0), ch = Math.min(F.maxChance, sum * F.oddsX);
    for (const q of team) { q.wolfStrikeAt = sim.tick; q.wolfCommitAt = sim.tick; q.wolfUsed = q.wolfUsed || {}; q.wolfUsed[archers.indexOf(q) >= 0 ? "ranged" : "melee"] = { w: wolf.id, t: sim.tick }; }
    S.strikes++; const it = heldOf(sim, p), hl = it ? ((G.Tools && G.Tools.labelOf(it)) || G.Items.matLabel(it)) : "hands";
    for (const q of melee) { const h = heldOf(sim, q); if (G.Tools && h && h.tool) G.Tools.use(sim, q, h, "hunt"); }
    const arrows = archers.map(q => ({ q, ar: G.Bow.spend(sim, q, heldOf(sim, q)) }));
    for (const x of arrows) G.Bow.flight(sim, x.q, wolf.pos.x, wolf.pos.y);   // render-only
    for (const q of archers) G.Sim.log(sim, q.name + " " + CF().fiber.lines.shoot.replace("{prey}", G.Animal.label("wolves").toLowerCase().replace(/s$/, "")), q);
    const hit = sim.orng.chance(ch);
    for (const q of melee) Skills.gain(sim, q, "melee", "animalStrike");
    for (const q of archers) Skills.gain(sim, q, "ranged", "animalShot");
    if (hit) { const b = Fx.kill(sim, team, wolf, hl); if (b) { b.arrows = arrows.map(x => x.ar); if (archers.length) G.Fiber.disc(sim, archers[0], "strike", ["arrow", "wolves"], "shot from a bow", "First wolf shot down"); } return true; }
    for (const x of arrows) G.Bow.dropMiss(sim, x.q, x.ar, wolf.pos.x, wolf.pos.y);
    if (melee.length) G.Sim.log(sim, (melee.length > 1 ? names(melee) + " strike" : melee[0].name + " strikes") + " at " + G.Animal.name(wolf) + " and miss" + (melee.length > 1 ? "" : "es"), p);
    else G.Sim.log(sim, "The arrows miss " + G.Animal.name(wolf), p);
    const biteable = team.filter(q => melee.indexOf(q) >= 0 || dist(q, wolf) <= F.strikeTiles + 1e-9);   // archers at range are never bitten
    if (biteable.length && sim.orng.chance(F.biteChance)) { const v = sim.orng.pick(biteable); S.bites++;
      v.needs.energy = r9(Math.max(0, v.needs.energy - CF().animals.wolves.threaten.damageEnergy / 2));
      WF.onAttack(sim, v); if (G.Injury) G.Injury.fromWolf(sim, v); }
    return false; };
  const kill0 = Fx.kill;
  Fx.kill = function (sim, team, wolf, hl) {
    const pk = wolf.pack, at = { x: wolf.pos.x, y: wolf.pos.y };
    const b = kill0.call(Fx, sim, team, wolf, hl);
    for (const q of team) { const u = q.wolfUsed || {}; let any = false;
      for (const k of ["melee", "ranged"]) if (u[k] && u[k].w === wolf.id) { Skills.gain(sim, q, k, "wolfKill"); any = true; }
      if (!any) Skills.gain(sim, q, "melee", "wolfKill"); }
    if (G.WolfMem) G.WolfMem.onKilled(sim, pk, at, team);
    return b; };
  // surviving a wolf strike is always melee
  const onAttack0 = WF.onAttack;
  WF.onAttack = function (sim, p) { const r = onAttack0.apply(WF, arguments); if (p && sim.agents.indexOf(p) >= 0) Skills.gain(sim, p, "melee", "survived"); return r; };

  // ---------- desperate defence (every wolf strike on a person; fgrng) ----------
  Fx.desperate = function (sim, wolf, p) {
    if (!wolf || !p || sim.agents.indexOf(p) < 0) return false;
    const D = X().desperate, m = G.Learn.score(p, "melee"), h = Fx.heldValue(sim, p), S = Skills.stats(sim); S.desperate++;
    p.wolfCommitAt = sim.tick;
    const kch = D.kill + m / 100 * D.killSkill + h / 200, wch = D.wound + m / 100 * D.woundSkill + h / 100;
    const r1 = rng(sim).float(), it = heldOf(sim, p), what = h > 0 && it ? "with the " + ((G.Tools && G.Tools.labelOf(it)) || G.Items.matLabel(it)) : "with bare hands";
    if (r1 < kch) { S.desperateKills++; G.Sim.log(sim, p.name + " fights off the " + G.Animal.label("wolves").toLowerCase().replace(/s$/, "") + " " + what, p);
      p.wolfUsed = p.wolfUsed || {}; p.wolfUsed.melee = { w: wolf.id, t: sim.tick }; Fx.kill(sim, [p], wolf, h > 0 && it ? ((G.Tools && G.Tools.labelOf(it)) || G.Items.matLabel(it)) : "hands"); return true; }
    if (rng(sim).float() < wch) {
      const near = r1 < kch + CF().wolfMemory.nearKillMargin || (wolf.woundedUntil != null && sim.tick < wolf.woundedUntil);
      S.wounds++; wolf.woundedUntil = sim.tick + Math.round(X().woundMinutes / TM());
      G.Sim.log(sim, p.name + " fights off the " + G.Animal.label("wolves").toLowerCase().replace(/s$/, "") + " " + what, p);
      Skills.gain(sim, p, "melee", "desperateWound");
      if (G.WolfMem) G.WolfMem.onWound(sim, wolf, [p], near);
      if (G.WolfMem) G.WolfMem.toDen(sim, wolf);
      return true;
    }
    return false;
  };

  // ---------- group hunt (wrng as v38): R >= engageAt and armed replaces hunt.minAllies; followers join on momentum ----------
  function inTerritory(sim, w) { const pk = G.Animal.packOf(sim, w); return !!pk && Math.hypot(w.pos.x - pk.den.x, w.pos.y - pk.den.y) <= CF().animals.wolves.territory; }
  function tileFree(sim, x, y) { return G.World.inb(sim.world, x, y) && G.World.walkable(sim.world, x, y); }
  function walkAt(sim, a, w, since) { const t = G.Agent.tilePos(a), tx = Math.round(w.pos.x), ty = Math.round(w.pos.y);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { if (!tileFree(sim, tx + dx, ty + dy)) continue;
      const p = G.World.findPath(sim.world, t.x, t.y, tx + dx, ty + dy); if (p) { a.act = { type: "walk", goal: "wolfHunt", path: p, i: 0, wolf: w.id, since }; return true; } }
    return false; }
  Fx.walkAt = walkAt;
  const busy = a => !a.act || a.act.type === "sleep" || a.act.type === "eat" || a.act.type === "drink" || a.act.type === "eatMeat" || a.act.type === "cook" ||
    ["food", "water", "hunt", "meat", "fleeWolf", "wolfHunt", "cover", "drag", "corpse"].indexOf(a.act.goal) >= 0;
  Fx.step = function (sim) {
    if ((sim.packs || []).length && sim.packs.some(pk => !sim.animals.some(o => o.pack === pk.id))) Fx.prune(sim, null);
    const H = FC().hunt, K = X(); if (sim.tick % Math.max(1, Math.round(H.checkMinutes / TM())) !== 0) return;
    const wolves = sim.animals.filter(o => o.species === "wolves" && o.pack != null); if (!wolves.length) return;
    const wr = sim.wrng || (sim.wrng = new G.RNG((sim.seed ^ 0x5EA4F00D) >>> 0));
    const see = WF.seeFar();
    for (const a of sim.agents) {
      if (busy(a) || !Fx.able(sim, a) || sim.tick < (a.wolfHuntNext || 0) || (G.Agent.want && G.Agent.want(a))) continue;
      // a follower: someone she can see is already going after a wolf
      const lead = sim.agents.find(q => q !== a && q.act && q.act.goal === "wolfHunt" && q.act.wolf != null && dist(a, q) <= see);
      if (lead) { const w = sim.animals.find(o => o.id === lead.act.wolf);
        if (w && Fx.armed(sim, a, w) && Fx.R(sim, a, w) >= K.engageAt - 1e-9 && walkAt(sim, a, w, lead.act.since)) {
          a.wolfCommitAt = sim.tick; a.wolfHuntNext = sim.tick + Math.round(H.cooldownMinutes / TM()); a.wolfLead = lead.id; stats(sim).joins = (stats(sim).joins || 0) + 1;
          G.Sim.log(sim, a.name + " goes after " + G.Animal.name(w) + " with " + lead.name, a); }
        continue; }
      let w = null, wd = Infinity; for (const q of wolves) { const d = dist(a, q); if (d <= H.seekTiles && d < wd && inTerritory(sim, q)) { wd = d; w = q; } }
      if (!w || !Fx.armed(sim, a, null) || Fx.R(sim, a, w) < K.engageAt - 1e-9) continue;
      const pull = H.pullBase + G.Learn.score(a, "wolf_hunt") / H.pullPer;
      if (!wr.chance(Math.min(1, H.startChance * pull))) continue;
      if (!walkAt(sim, a, w, sim.tick)) continue;
      a.wolfCommitAt = sim.tick; a.wolfLead = null; a.wolfHuntNext = sim.tick + Math.round(H.cooldownMinutes / TM());
      stats(sim).hunts++; G.Sim.log(sim, a.name + " sets off after " + G.Animal.name(w), a);
    }
  };
  const sh0 = Fx.stepHunt, ar0 = Fx.arrive;
  Fx.stepHunt = function (sim, a) { const act = a.act, w = sim.animals.find(q => q.id === act.wolf);
    if (w && Fx.archer(sim, a, w) && Fx.able(sim, a)) { a.wolfCommitAt = sim.tick;
      if (G.Bow.cool(sim, a) && Fx.stands(sim, a, w)) Fx.strike(sim, a, w);
      if (a.act === act) a.act.path = a.act.path.slice(0, a.act.i); return; }
    return sh0.call(Fx, sim, a); };
  Fx.arrive = function (sim, a) { const w = sim.animals.find(q => q.id === a.act.wolf);
    if (w && Fx.archer(sim, a, w)) { if (G.Bow.cool(sim, a)) Fx.strike(sim, a, w); if (sim.animals.indexOf(w) >= 0) a.act = { type: "idle", goal: "wolfHunt", until: sim.tick + 1, wolf: w.id, since: a.act.since }; return; }
    return ar0.call(Fx, sim, a); };

  // a shared kill: followers copy the lead's wolf_hunt and the skill they used (the usual copy rule rides on Learn.success above)
  G.Skills = Skills;
})(window.GS = window.GS || {});
