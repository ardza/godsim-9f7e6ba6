// Step 16: hunting, carcasses and raw meat. Nothing is scripted: a hungry person who happens to hold a hard thing and sees a deer may go after it
// (odds from her hunt score); whether the strike kills comes from the held thing's sharpness and her experience (config.hunt). A kill leaves a carcass
// (a body: fresh -> rotting -> bones); meat taken from it while fresh is an item that is edible until the carcass would have begun to rot.
// Eating raw meat fills her (config.meat) and may make her sick. Firsts (first kill, first meat eaten, first sickness) are detected from what happened.
// Rolls: the go/scavenge decisions use the learning stream (lrng), the strike and sickness use the objects/physics stream (orng).
(function (G) {
  const CF = () => G.data.config, H = () => CF().hunt, MC = () => CF().meat, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r9 = v => Math.round(v * 1e9) / 1e9;
  const Hunt = {};
  const stats = sim => sim.huntStats || (sim.huntStats = { stalks: 0, strikes: 0, kills: 0, misses: 0, byHeld: {}, scavenge: 0, taken: 0, eaten: 0, sick: 0, spoiled: 0 });
  Hunt.stats = stats;
  const dist = (a, x, y) => Math.hypot(x - a.pos.x, y - a.pos.y);

  Hunt.weapon = it => !!it && it.material !== "meat" && it.props.hardness >= H().minHardness;
  Hunt.sharp = it => G.Items.sharp(it);   // one shared threshold (config.physics.sharpAt)
  Hunt.learned = a => G.Learn.score(a, "hunt") >= H().learnedAt;
  Hunt.odds = (a, it) => { const O = H().odds; const tipAdd = (G.Tools && G.Tools.huntOddsAdd) ? G.Tools.huntOddsAdd(it) : 0; return clamp((O.base + (Hunt.sharp(it) ? O.sharp : 0) + (Hunt.learned(a) ? O.learned : 0) + tipAdd) * (G.Family && G.Family.isYouth(a) ? G.data.config.child.youthKillX : 1), 0, 1); };   // step 20: a youth x0.5; §37 tip hunt bonus
  Hunt.edible = (sim, it) => !!it && it.material === "meat" && sim.tick < it.spoilAt;
  Hunt.isMeat = it => !!it && it.material === "meat";
  Hunt.pull = a => clamp(G.Learn.score(a, "hunt") / 50, 0, 2);
  // keep the thing in hand while hungry if it is food or something to hunt with
  // step 17: fresh meat in hand is kept while she is awake (a thirsty person no longer drops her meat, or her meal half-eaten); a hard thing only while hungry
  Hunt.keep = (sim, a) => { const it = G.Items.held(sim, a); if (Hunt.edible(sim, it)) return true; return G.Agent.want(a) === "food" && Hunt.weapon(it); };
  Hunt.carcassMeat = b => !!b && !!b.species && b.stage === "fresh" && b.meat > 0 && b.flesh >= MC().fleshPerPiece;
  // art column: fresh (untouched) -> picked (meat taken, scavenged or rotting) -> bones
  G.Body.carcassFrame = b => b.stage === "bones" ? "bones" : (b.stage === "fresh" && b.meat === MC().pieces[b.species] && !b.scavenged) ? "fresh" : "picked";

  // a killed animal becomes a body (same stages and timings as a person's)
  G.Body.createAnimal = function (sim, an, by) {
    return { id: sim.nextId++, kind: "body", of: null, species: an.species, name: G.Animal.name(an), look: 0, x: Math.round(an.pos.x), y: Math.round(an.pos.y), diedAt: sim.tick,
      cause: "killed", killedBy: by ? by.name : null, age: null, stage: "fresh", stageAt: sim.tick, flesh: 100, eaten: 0, condition: 100, material: null, scavenged: false,
      meat: (MC().pieces[an.species] || 0) };
  };

  function freeNear(sim, a, x, y) {
    const c = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => [x + dx, y + dy])
      .filter(([px, py]) => G.World.walkable(sim.world, px, py) && !G.Agent.claimed(sim, a, px, py) && !(sim.animals || []).some(q => Math.round(q.pos.x) === px && Math.round(q.pos.y) === py));
    return c.sort((p, q) => dist(a, p[0], p[1]) - dist(a, q[0], q[1]) || p[0] - q[0] || p[1] - q[1]);
  }
  function goMeat(sim, a, b) { for (const [x, y] of freeNear(sim, a, b.x, b.y).slice(0, 4)) if (G.Agent.walkTo(sim, a, x, y, "meat", { body: b.id })) return true; return false; }

  // Called when hunger sends her looking for food (before the bushes). Returns true if she set off / started on something.
  Hunt.seekFood = function (sim, a) {
    if (G.Family && G.Family.isChild(a)) return false;   // step 20: a child eats from bushes only (no hunting, no meat off carcasses)
    const it = G.Items.held(sim, a), Hc = H();
    if (Hunt.edible(sim, it)) { if (!(G.Cook && G.Cook.seek(sim, a, it))) startEat(sim, a, it); return true; }   // fresh meat in hand: eat it (step 17: or hold it to a fire first)
    // a fresh carcass with meat in sight: go and take some (scavenging, or back to her own kill)
    let cb = null;
    for (const b of sim.bodies) if (Hunt.carcassMeat(b)) { const d = dist(a, b.x, b.y); if (d <= Hc.sightTiles && (!cb || d < cb.d)) cb = { b, d }; }
    if (cb && sim.lrng.chance(clamp(Hc.scavengeChance * Hunt.pull(a) * (G.Moods ? G.Moods.shareBias(a) : 1), 0, 1)) && goMeat(sim, a, cb.b)) { stats(sim).scavenge++; return true; }
    // holding something hard and a grazer in sight: go after it
    // Director (call 1 on 18): only real cold (warmth under hunt.coldBelow, 30) stops a hunt (step 17 used her warmth-seeking level)
    if (Hunt.weapon(it) && sim.tick - (a.huntAt == null ? -1e9 : a.huntAt) >= Hc.cooldownMinutes && a.needs.warmth >= Hc.coldBelow) {
      let g = null; for (const q of sim.animals) if (q.species === "grazer") { const d = dist(a, q.pos.x, q.pos.y); if (d <= Hc.sightTiles && (!g || d < g.d)) g = { q, d }; }
      if (g && sim.lrng.chance(clamp(Hc.approachChance * Hunt.pull(a) * (G.Moods ? G.Moods.huntMult(a) : 1), 0, 1))) { a.huntAt = sim.tick;
        if (stalkTo(sim, a, g.q, sim.tick)) { stats(sim).stalks++; G.Learn.bump(sim, "approaches", "hunt"); return true; } }
    }
    return false;
  };
  function stalkTo(sim, a, g, since) {
    for (const [x, y] of freeNear(sim, a, Math.round(g.pos.x), Math.round(g.pos.y)).slice(0, 4)) if (G.Agent.walkTo(sim, a, x, y, "hunt", { prey: g.id, since })) return true;
    return false;
  }
  // each minute of a stalk (after she has moved): close enough -> the strike; prey gone / too far / too long / no longer hungry -> give up
  Hunt.stepStalk = function (sim, a) {
    const act = a.act, Hc = H(), g = sim.animals.find(q => q.id === act.prey), it = G.Items.held(sim, a);
    if (!g || !Hunt.weapon(it) || G.Agent.want(a) !== "food" || sim.tick - act.since > Hc.giveUpMinutes || dist(a, g.pos.x, g.pos.y) > Hc.sightTiles * 1.5) { G.Agent.startIdle(sim, a, 0.3); return; }
    if (dist(a, g.pos.x, g.pos.y) <= Hc.strikeTiles + 1e-9) { strike(sim, a, g, it); return; }
    if ((sim.tick - act.since) % 10 === 0 || act.i >= act.path.length) { if (!stalkTo(sim, a, g, act.since)) G.Agent.startIdle(sim, a, 0.3); }
  };
  Hunt.arriveStalk = function (sim, a) { const g = sim.animals.find(q => q.id === a.act.prey);
    if (g && dist(a, g.pos.x, g.pos.y) <= H().strikeTiles + 1e-9 && Hunt.weapon(G.Items.held(sim, a))) return strike(sim, a, g, G.Items.held(sim, a));
    if (!g || !stalkTo(sim, a, g, a.act.since)) G.Agent.startIdle(sim, a, 0.3); };

  Hunt.strike = (sim, a, g, it) => strike(sim, a, g, it);
  function strike(sim, a, g, it) {
    const S = stats(sim), p = Hunt.odds(a, it), hl = (G.Tools && G.Tools.labelOf(it)) || G.Items.matLabel(it), base = G.Items.baseLabel(it), k = (it.form === "shard" ? "broken " : "") + base;
    S.strikes++; if (G.Family && G.Family.isYouth(a)) S.youthStrikes = (S.youthStrikes || 0) + 1; const bh = S.byHeld[k] || (S.byHeld[k] = { strikes: 0, kills: 0 }); bh.strikes++;
    if (G.Tools && it && it.tool) G.Tools.use(sim, a, it, "hunt");   // §37: tip (and other tools) dull with hunt use
    if (sim.orng.chance(p)) {
      S.kills++; bh.kills++; if (G.Family && G.Family.isYouth(a)) S.youthKills = (S.youthKills || 0) + 1;
      sim.animals.splice(sim.animals.indexOf(g), 1); delete sim.prev[g.id];
      const b = G.Body.createAnimal(sim, g, a); sim.bodies.push(b);
      G.Sim.log(sim, a.name + " strikes " + b.name + " with the " + hl + ": it falls", a);
      const e = G.Learn.add(a, "hunt", H().gain); e.n++; a.stats.kills = (a.stats.kills || 0) + 1;
      G.Discoveries.note(sim, a, "strike", [base, "grazer"], "deer falls");
      G.Learn.success(sim, a, "hunt");
      if (G.Moods) G.Moods.onHuntKill(sim, a);
      if (!goMeat(sim, a, b)) G.Agent.startIdle(sim, a, 0.3);
    } else {
      S.misses++; G.Learn.add(a, "hunt", -H().missDrop);
      G.Sim.log(sim, a.name + " strikes at " + G.Animal.name(g) + " with the " + hl + " and misses", a);
      G.Agent.startIdle(sim, a, 0.3);
    }
  }

  // at the carcass: put down what she holds, take a piece of meat, and eat it now if hungry
  Hunt.arriveMeat = function (sim, a) {
    const b = sim.bodies.find(q => q.id === a.act.body), M = MC();
    if (!Hunt.carcassMeat(b) || dist(a, b.x, b.y) > 1.5) { if (b && !Hunt.carcassMeat(b) && b.tookBy != null && b.tookBy !== a.id && sim.tick - b.tookAt <= 240) G.Social.took(sim, a, sim.agents.find(q => q.id === b.tookBy), "last of the meat");   // step 18
      G.Agent.startIdle(sim, a, 0.3); return; }
    const cutter = G.Items.held(sim, a);
    const usedCut = !!(G.Tools && cutter && G.Tools.bonusLive(cutter) && (G.Tools.is(cutter, "flake") || G.Tools.is(cutter, "axe") || G.Tools.isTip(cutter)));
    if (usedCut) G.Tools.use(sim, a, cutter, "cut");
    if (a.carry != null) G.Items.drop(sim, a);
    const it = G.Items.create(sim, "meat", b.x, b.y); it.spoilAt = b.diedAt + CF().body.freshMinutes; it.from = b.id; it.heat = b.heat || 0;   // step 17: meat off a roasted carcass is as cooked as the carcass
    sim.items.push(it); it.heldBy = a.id; a.carry = it.id; a.carryUntil = sim.tick + sim.orng.int(CF().objects.carry[0], CF().objects.carry[1]);
    b.meat--; b.tookBy = a.id; b.tookAt = sim.tick; b.eaten = r9((b.eaten || 0) + M.fleshPerPiece); b.flesh = r9(Math.max(0, b.flesh - M.fleshPerPiece)); stats(sim).taken++;
    if (usedCut) G.Sim.log(sim, a.name + " cuts meat from " + b.name + "'s carcass", a);
    else G.Sim.log(sim, a.name + " takes meat from " + b.name + "'s carcass", a);
    if (G.Hides && b.species === "grazer") G.Hides.maybeSpawn(sim, b);   // v28: one hide per grazer carcass on first take
    if (G.Agent.want(a) === "food") Hunt.seekFood(sim, a); else G.Agent.startIdle(sim, a, 0.5);
  };

  Hunt.startEat = (sim, a, it) => startEat(sim, a, it);
  function startEat(sim, a, it) { a.act = { type: "eatMeat", item: it.id, t: 0, n: Math.max(1, Math.round(MC().eatMinutes / TM())), from: a.needs.fullness }; }
  Hunt.stepEat = function (sim, a) {
    const act = a.act, M = MC(), it = G.Items.byId(sim, act.item);
    if (!it || it.heldBy !== a.id || !Hunt.edible(sim, it)) { G.Agent.startIdle(sim, a, 0.2); return; }
    act.t++; const end = Math.min(100, act.from + G.Cook.fullness(it));
    a.needs.fullness = r9(Math.max(a.needs.fullness, act.from + (end - act.from) * Math.min(1, act.t / act.n)));
    if (act.t < act.n) return;
    a.needs.fullness = end; sim.items.splice(sim.items.indexOf(it), 1); a.carry = null; a.carryUntil = null;
    a.stats.meals++; a.stats.meat = (a.stats.meat || 0) + 1; stats(sim).eaten++;
    const lab = G.Cook.label(it), raw = G.Cook.of(it) === "raw";
    G.Sim.log(sim, a.name + " eats the " + lab + " (" + G.Agent.fullnessWord(end) + ")", a);
    if (raw) G.Discoveries.note(sim, a, "eat", ["raw meat"], "fullness up");
    G.Cook.ate(sim, a, it);
    if (G.Speech) G.Speech.onEat(sim, a);
    const pS = G.Cook.sickChance(it); if (pS > 0 && sim.orng.chance(pS)) { stats(sim).sick++;
      G.Learn.add(a, "hunt", -H().sickDrop);
      if (G.Disease) G.Disease.infect(sim, a, "meat");
      else { a.stats.sick = (a.stats.sick || 0) + 1; a.needs.energy = r9(Math.max(0, a.needs.energy - M.sickEnergy));
        G.Sim.log(sim, a.name + " retches after the " + lab, a); }
      G.Discoveries.note(sim, a, "eat", [lab], "sick"); }
    G.Agent.startIdle(sim, a);
  };

  // each minute: meat past its time rots away (in a hand or on the ground)
  Hunt.step = function (sim) {
    if (!sim.items.some(i => i.material === "meat" && sim.tick >= i.spoilAt)) return;
    sim.items = sim.items.filter(it => { if (it.material !== "meat" || sim.tick < it.spoilAt) return true;
      const h = it.heldBy != null && sim.agents.find(q => q.id === it.heldBy); if (h) { h.carry = null; h.carryUntil = null; }
      stats(sim).spoiled++; G.Sim.log(sim, h ? "The meat " + h.name + " carries rots away" : "A piece of meat rots away", h || null); return false; });
  };

  G.Hunt = Hunt;
})(this.GS = this.GS || {});
