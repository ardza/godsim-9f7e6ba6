// People: plain-object agents and their per-tick behavior. Needs and traits are continuous;
// behavior is a small action state (act) chosen from needs + knowledge each tick.
(function (G) {
  const P = () => G.data.config.person, W = G.World;
  const Agent = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;

  Agent.createPerson = function (sim, x, y, look) {
    const p = P(), rng = sim.rng, traits = {};
    for (const k of Object.keys(p.traits)) if (k !== "faith" && k !== "corpseFear") traits[k] = Math.round(clamp(50 + rng.gauss() * p.traitSpread, 0, 100));
    return {
      id: sim.nextId++, kind: "person", name: G.Sim.nextName(sim), look: look || 0,   // look = which founder sprite (render only)
      pos: { x, y }, facing: "down",
      age: r2(rng.range(p.startAge[0], p.startAge[1])), lifespan: r2(rng.range(p.lifespan[0], p.lifespan[1])),
      needs: { fullness: r2(rng.range(p.fullness.start[0], p.fullness.start[1])), water: r2(rng.range(p.water.start[0], p.water.start[1])), energy: r2(rng.range(p.energy.start[0], p.energy.start[1])), warmth: r2(rng.range(p.warmth.start[0], p.warmth.start[1])) },
      traits, knowledge: { bushes: {}, water: {} }, relations: {}, exp: {},   // exp: step 13-14 experience scores per action (see learn.js)
      act: { type: "idle", until: 0 }, stats: { meals: 0, drinks: 0, sleeps: 0 }, carry: null, wolfFear: G.data.config.wolfFear.baseline || 0,   // v38 (f): founders start at baseline   // carry = id of the one thing in hand
      caches: [], sacred: [],   // v29: personal cache memory [{key, kind, id, x, y, lastKinds}]
      zero: { water: 0, fullness: 0, warmth: 0, energy: 0 },   // minutes in a row at 0 (water/fullness/warmth/energy clocks; warmth & energy kill only after full stage ladders)
      hypo: 0, rainExposedMinutes: 0,
      moods: { happiness: 40, sadness: 40, anger: 40 }, moodClock: { hungryLow: 0, hapWas: 40, logAt: {} },
      sick: null
    };
  };

  // Derived values (all from traits; documented in data/config.js)
  // all needs: 100 = good, they drain down
  Agent.fullnessDrainPerTick = a => { const f = P().fullness; return (f.mealFillTo - f.threshold) / f.minutesFullToHungry * G.data.config.time.tickGameMinutes * (0.5 + a.traits.appetite / 100) * (a.preg ? G.data.config.family.pregnancy.drain : 1) * Agent.childDrain(a) * (G.Disease ? G.Disease.fullnessX(a) : 1); };   // step 19/20 child; step 28 sick ×1.25
  Agent.fullnessThreshold = a => P().fullness.threshold;
  Agent.waterDrainPerTick = a => { const w = P().water; return (100 - w.threshold) / w.minutesFullToThirsty * G.data.config.time.tickGameMinutes * Agent.childDrain(a); };
  Agent.childDrain = a => G.Family && G.Family.isChild(a) ? G.data.config.child.drain : 1;
  Agent.waterThreshold = a => P().water.threshold;
  // state words for the panel
  Agent.fullnessWord = v => { const f = P().fullness; return v <= 0 ? "starving" : v < f.threshold ? "hungry" : v < f.mealFillTo ? "fed" : v <= f.mealFillTo + 1e-9 ? "full" : "overfull"; };
  Agent.energyWord = v => { const E = P().energy; return v <= 0 ? "sleep-deprived" : v < E.sleepBelow ? "tired" : v < E.restedAt ? "fine" : "rested"; };
  Agent.warmthWord = v => v <= 0 ? "hypothermic" : v < 30 ? "cold" : v < 60 ? "chilly" : "warm";
  // seeks shelter / company below this warmth (cold-fear trait)
  Agent.warmthSeekBelow = a => P().warmth.seekBelow + a.traits.coldFear * P().warmth.seekPerFear;
  Agent.waterWord = v => v <= 0 ? "dehydrated" : v < P().water.threshold ? "thirsty" : "watered";
  Agent.energyDrainPerTick = a => 100 / P().energy.drainMinutes * G.data.config.time.tickGameMinutes * (G.Disease ? G.Disease.energyX(a) : 1);  // step 28 sick ×1.5
  Agent.energyRefillPerTick = a => 100 / P().energy.refillMinutes * G.data.config.time.tickGameMinutes;
  // after dusk = nightFrom .. dawnAt (minute of day)
  Agent.isNight = tick => { const E = P().energy, m = G.Time.at(tick).minuteOfDay; return m >= E.nightFrom || m < E.dawnAt; };
  // Decision rule: the lowest of fullness/water once it is below actAt; a tie goes to water.
  Agent.want = a => { const n = a.needs, at = P().actAt; if (n.water < at && n.water <= n.fullness) return "water"; if (n.fullness < at) return "food"; return null; };
  // once it holds on a night it holds until morning (no flip-flop between waking hungry and lying down again as warmth crosses the line)
  Agent.coldNight = (sim, a) => { const W = P().warmth; if (W.nightFirstBelow == null || !Agent.isNight(sim.tick) || G.Climate.seasonIndex(sim.tick) !== W.gatherSeason) return false;
    const night = G.Time.at(sim.tick + 720).day; if (a.coldNightOf === night) return true;
    if (a.needs.warmth < W.nightFirstBelow) { a.coldNightOf = night; return true; } return false; };
  Agent.minutesPerTile = a => {
    let m = P().walkMinutesPerTile / (0.5 + a.traits.speed / 100);
    const H = P().hypothermia; if (H && a.hypo >= 3) m /= H.moveX;   // clumsiness+: move speed × moveX
    if (a.injuries && a.injuries.length && G.Injury) m /= G.Injury.moveX(a);   // §40: a leg gash / bite / break slows walking
    return m;
  };
  Agent.sight = a => P().sightTiles;
  Agent.tilePos = a => ({ x: Math.round(a.pos.x), y: Math.round(a.pos.y) });
  Agent.doing = a => { const d = a.act.type === "pray" ? G.Faith.doing(a) : (a.act.type === "idle" || a.act.type === "sleep") && a.felt && a.felt.huddle && a.needs.warmth < 60 ? (a.act.type === "sleep" ? "asleep, huddled" : "huddling") :
    a.hypoUnconscious ? "unconscious from cold" : a.hypo >= 4 && a.needs.warmth <= 0 && a.act.type === "sleep" ? "asleep from cold" : ({ idle: "resting", try: ({ strike: "striking", rub: "rubbing", cut: "cutting" })[a.act.action] || "trying", bind: "binding a tool", tip: "striking a tip", chop: "chopping at a tree", eat: "eating a meal", eatMeat: "eating meat", eatCorpse: "eating from a body", dig: "digging", cook: "holding meat to the fire", drink: "drinking", sleep: "asleep" })[a.act.type] || ({ wander: "wandering", food: "going to a bush", explore: "looking for food", water: "going to the water", exploreWater: "looking for water", collapse: "stumbling to a stop", pickup: "going to pick something up", try: "going to try something", shelter: "seeking warmth", fleeFire: "moving away from flames", fireside: "going to sit by the fire", burnt: "jumping back from the flames", hunt: "going after a deer", meat: "going to a carcass", corpse: "going to a body", drag: "dragging a body", follow: "keeping close to someone", mate: "going to sleep beside a partner", keep: "keeping close to family", prayspot: "going to a prayer spot", sacred: "walking toward a worn place", stash: "going to stash something", cache: "going to a cache", hut: "piling a shelter", hutTend: "carrying material to a hut", dryFood: "laying meat by a fire to dry", beside: "going to sleep beside family", avoid: "keeping away from someone", scared: "running from the flash", fleeWolf: "running from the Wolves" })[a.act.goal] || a.act.type;
    return (G.Disease && G.Disease.isSick(a) && d.indexOf("sick") < 0) ? d + ", sick" : d; };


  // Two people never end a move on the same tile: each person claims one tile (where they stand, or the end of their path),
  // and nobody picks a destination someone else has claimed. Passing through is fine.
  function claimOf(b) { if (b.act.type === "walk" && b.act.path.length) { const e = b.act.path[b.act.path.length - 1]; return e[0] + "," + e[1]; } const t = Agent.tilePos(b); return t.x + "," + t.y; }
  Agent.claimed = (sim, a, x, y) => { const k = x + "," + y; for (const b of sim.agents) if (b !== a && claimOf(b) === k) return true; return false; };

  // land tiles next to water (4-neighbour), per world; derived from the map so it is never saved
  const shoreCache = new WeakMap();
  Agent.shore = function (w) {
    let s = shoreCache.get(w); if (s) return s; s = [];
    const TL = G.data.tiles;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { if (!W.walkable(w, x, y)) continue;
      for (const [a, b] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { if (!W.inb(w, x + a, y + b)) continue; const t = TL[W.tile(w, x + a, y + b)]; if (t.water) { s.push({ x, y, k: x + "," + y, kind: t.key }); break; } } }
    shoreCache.set(w, s); return s;
  };

  function sense(sim, a) {
    const R = Agent.sight(a), K = a.knowledge.bushes; let found = 0, ripe = false, ripeNew = false;
    for (const b of sim.bushes) {
      if ((b.x - a.pos.x) ** 2 + (b.y - a.pos.y) ** 2 > R * R) continue;
      if (!K[b.id]) { K[b.id] = { x: b.x, y: b.y, ripe: false, seen: 0 }; found++; if (b.ripe) ripeNew = true; if (b.planted && G.Farm) G.Farm.onFind(sim, a, b); }   // v38 (b)
      // seen empty: remember since when (and restart that if she expected it back by now - someone else ate it meanwhile)
      if (!b.ripe && (K[b.id].ripe || K[b.id].emptySince === undefined || sim.tick - K[b.id].emptySince >= G.data.config.bushes.regrowMinutes)) K[b.id].emptySince = sim.tick;
      K[b.id].ripe = b.ripe; K[b.id].seen = sim.tick; if (b.ripe) ripe = true;
    }
    if (found) G.Sim.log(sim, a.name + (found === 1 ? " found a berry bush" : " found " + found + " berry bushes"), a);
    const KW = a.knowledge.water || (a.knowledge.water = {}); let waterNew = false;
    for (const s of Agent.shore(sim.world)) {
      if (KW[s.k] || (s.x - a.pos.x) ** 2 + (s.y - a.pos.y) ** 2 > R * R) continue;
      if (!Object.values(KW).includes(s.kind)) G.Sim.log(sim, a.name + " found water at the " + s.kind, a);
      KW[s.k] = s.kind; waterNew = true;
    }
    return { found, ripe, ripeNew, waterNew };
  }

  function walkTo(sim, a, tx, ty, goal, extra) {
    const t = Agent.tilePos(a), sh = G.Shelter && sim.shelters && sim.shelters.some(q => q.walkX > 1),   // step 21b: thickets are slow, so she goes round them when that is quicker
      hot = extra && extra.bolt ? (x, y) => { const f = sim.fire[x + "," + y]; return f && (f.s === "fire" || f.s === "ember") && !(x === tx && y === ty) ? 40 : 1; } : null,   // step 23: round the flames to a bolt stick
      path = W.findPath(sim.world, t.x, t.y, tx, ty, sh || hot ? (x, y) => (sh ? G.Shelter.walkX(sim, x, y) : 1) * (hot ? hot(x, y) : 1) : null);
    if (!path) return false;
    a.act = Object.assign({ type: "walk", goal, path, i: 0 }, extra || {});
    return true;
  }
  Agent.walkTo = walkTo;

  function randomTarget(sim, a, rmin, rmax, ok) {
    const t = Agent.tilePos(a), rng = sim.rng;
    for (let k = 0; k < 30; k++) {
      const ang = rng.float() * Math.PI * 2, d = rng.range(rmin, rmax), x = Math.round(t.x + Math.cos(ang) * d), y = Math.round(t.y + Math.sin(ang) * d);
      if (W.walkable(sim.world, x, y) && !Agent.claimed(sim, a, x, y) && (!ok || ok(x, y))) return { x, y };
    }
    return null;
  }

  // people only stop on whole tiles: if a plan changes mid-step, finish the step onto a free neighbouring tile first
  const whole = a => a.pos.x === Math.round(a.pos.x) && a.pos.y === Math.round(a.pos.y);
  Agent.whole = whole;
  function settleTile(sim, a) {
    const xs = [Math.round(a.pos.x), Math.floor(a.pos.x), Math.ceil(a.pos.x)], ys = [Math.round(a.pos.y), Math.floor(a.pos.y), Math.ceil(a.pos.y)];
    for (const x of xs) for (const y of ys) if (W.walkable(sim.world, x, y) && !Agent.claimed(sim, a, x, y)) return [x, y];
    return [xs[0], ys[0]];
  }
  function startIdle(sim, a, scale) {
    if (!whole(a)) { a.act = { type: "walk", goal: "settle", path: [settleTile(sim, a)], i: 0, scale }; return; }
    const w = P().wander;
    a.act = { type: "idle", until: sim.tick + Math.round(sim.rng.range(w.idleMin, w.idleMax) * (scale || 1)) };
  }
  Agent.startIdle = startIdle;

  // Before setting off to wander: if the nearest food is far enough that she'd arrive past the threshold, leave for it now.
  function foodIsFar(sim, a) {
    const h = P().fullness; if (a.needs.fullness >= h.planFrom) return false;
    const K = a.knowledge.bushes, t = Agent.tilePos(a);
    const ids = Object.keys(K).filter(id => !Agent.claimed(sim, a, K[id].x, K[id].y)).filter(id => K[id].ripe || sim.tick - (K[id].emptySince || 0) >= G.data.config.bushes.regrowMinutes)
      .sort((p, q) => Math.hypot(K[p].x - t.x, K[p].y - t.y) - Math.hypot(K[q].x - t.x, K[q].y - t.y)).slice(0, P().explore.pathCandidates);
    let len = Infinity; for (const id of ids) { const p = W.findPath(sim.world, t.x, t.y, K[id].x, K[id].y); if (p) len = Math.min(len, W.pathLength(p)); }
    return a.needs.fullness - len * Agent.minutesPerTile(a) * Agent.fullnessDrainPerTick(a) / G.data.config.time.tickGameMinutes < Agent.fullnessThreshold(a);
  }

  // Same idea for water: below water.planFrom, leave now if the nearest known shore is so far she'd arrive thirsty (or none is known yet).
  function waterIsFar(sim, a) {
    const th = P().water; if (a.needs.water >= th.planFrom) return false;
    const best = nearestWater(sim, a); if (!best) return true;
    return a.needs.water - best.len * Agent.minutesPerTile(a) * Agent.waterDrainPerTick(a) / G.data.config.time.tickGameMinutes < Agent.waterThreshold(a);
  }
  // nearest remembered, unclaimed shore tile by path length (among the closest few by straight line)
  function nearestWater(sim, a) {
    const KW = a.knowledge.water || {}, t = Agent.tilePos(a), N = P().explore.pathCandidates;
    const c = Object.keys(KW).map(k => { const i = k.indexOf(","), x = +k.slice(0, i), y = +k.slice(i + 1); return { k, x, y, d: Math.hypot(x - t.x, y - t.y) }; })
      .concat(G.Powers ? G.Powers.puddlesNear(sim, t.x, t.y, Agent.sight(a)).filter(q => !KW[q.k]) : [])   // step 22: rain puddles in sight count as water
      .filter(q => !Agent.claimed(sim, a, q.x, q.y)).sort((p, q) => p.d - q.d || (p.k < q.k ? -1 : 1)).slice(0, N);
    let best = null;
    for (const q of c) { if (q.d === 0) return { k: q.k, p: whole(a) ? [] : [[q.x, q.y]], len: 0, kind: q.kind || KW[q.k] };
      const p = W.findPath(sim.world, t.x, t.y, q.x, q.y); if (p && (!best || W.pathLength(p) < best.len)) best = { k: q.k, p, len: W.pathLength(p), kind: q.kind || KW[q.k] }; }
    return best;
  }
  function seekWater(sim, a) {
    const best = nearestWater(sim, a);
    if (best && !best.p.length) { startDrink(sim, a, best.kind); return; }
    if (best) { a.act = { type: "walk", goal: "water", path: best.p, i: 0, water: best.kind }; return; }
    const e = P().explore, q = randomTarget(sim, a, e.min, e.max);   // no water known yet: go and look
    if (!q || !walkTo(sim, a, q.x, q.y, "exploreWater")) startIdle(sim, a, 0.2);
  }
  function startDrink(sim, a, kind) {
    a.act = { type: "drink", t: 0, from: a.needs.water, water: kind };
    G.Sim.log(sim, a.name + " drinks at the " + kind, a);
  }
  function drink(sim, a) {
    const act = a.act, n = P().drinkMinutes / G.data.config.time.tickGameMinutes;
    act.t++; a.needs.water = Math.min(100, Math.round((act.from + (100 - act.from) * act.t / n) * 1e9) / 1e9);
    if (act.t >= n) { a.needs.water = 100; a.stats.drinks++; if (G.Speech) G.Speech.onDrink(sim, a); if (G.Disease) G.Disease.onDrink(sim, a); startIdle(sim, a); }
  }
  // Lies down after dusk when energy is under sleepBelow (or straight back down if a need woke her early tonight).
  function shouldSleep(sim, a) { return a.needs.energy <= 0 || (Agent.isNight(sim.tick) && (a.needs.energy < P().energy.sleepBelow || a.wokeEarly)); }
  // minutes of night left from now until dawn (0 by day)
  function nightLeft(tick) { const E = P().energy, m = G.Time.at(tick).minuteOfDay; return m >= E.nightFrom ? 1440 - m + E.dawnAt : m < E.dawnAt ? E.dawnAt - m : 0; }
  // Before lying down: would fullness or water drop below bedtimeMin before she wakes (draining at the asleep rate)? Then see to it first.
  function bedtimeNeed(sim, a) {
    const E = P().energy, mins = Math.max(nightLeft(sim.tick), P().energy.refillMinutes * (1 - a.needs.energy / 100)), f = E.asleepNeedRate / G.data.config.time.tickGameMinutes, lim = P().bedtimeMin;
    const t = a.needs.water - Agent.waterDrainPerTick(a) * f * mins, h = a.needs.fullness - Agent.fullnessDrainPerTick(a) * f * mins;
    if (t < lim && t <= h) return "water"; if (h < lim) return "food"; return null;
  }
  // the nearest water / known ripe bush if it is within bedtimeTripTiles of path, else null
  function topUpTrip(sim, a, need) {
    const max = P().bedtimeTripTiles;
    if (need === "water") { const w = nearestWater(sim, a); return w && w.len <= max ? w : null; }
    const K = a.knowledge.bushes, t = Agent.tilePos(a); let best = null;
    for (const id of Object.keys(K)) { const k = K[id]; if (!k.ripe || Math.hypot(k.x - t.x, k.y - t.y) > max || Agent.claimed(sim, a, k.x, k.y)) continue;
      const p = W.findPath(sim.world, t.x, t.y, k.x, k.y); if (p && p.length && W.pathLength(p) <= max && (!best || W.pathLength(p) < best.len)) best = { id, p, len: W.pathLength(p) }; }
    return best;
  }
  function startSleep(sim, a, again) { a.topUp = null; a.act = { type: "sleep", since: sim.tick }; if (!again) a.stats.sleeps++; G.Sim.log(sim, a.name + " lies down to sleep", a); if (G.Hides) G.Hides.onSleep(sim, a); }
  function sleep(sim, a) {
    const E = P().energy, n = a.needs;
    const night = G.Time.at(sim.tick + 720).day;
    if (n.warmth < P().warmth.wakeBelow && a.coldWoke !== night && !Agent.goodSpot(sim, a)) { a.coldWoke = night; G.Sim.log(sim, a.name + " wakes up cold", a);
      if (seekWarmth(sim, a)) { a.wokeEarly = true; a.act.coldWake = true; return; } }
    // step 20: on a Deep Cold night a cold sleeper is not woken by hunger (no night food trips: she would only lie down again)
    // hunger wakes her at most once a night (step 20: with nothing to eat in Deep Cold she lay down and woke again each minute)
    const hNight = G.Time.at(sim.tick + 720).day, hungry = n.fullness < E.wakeIfNeedBelow && !Agent.coldNight(sim, a) && a.hungerWokeNight !== hNight;
    const thirsty = n.water < E.wakeIfNeedBelow;
    if (hungry || thirsty) { const why = thirsty && (n.water <= n.fullness || !hungry) ? "thirsty" : "hungry"; if (why === "hungry") a.hungerWokeNight = hNight; G.Sim.log(sim, a.name + " woke up " + why, a); startIdle(sim, a, 0); a.act.until = sim.tick; a.wokeEarly = true; return; }
    if (n.energy >= 100 && !Agent.isNight(sim.tick)) { const m = G.Time.at(sim.tick).minuteOfDay;
      G.Sim.log(sim, a.name + (m >= E.dawnAt && m < E.dawnAt + 120 ? " woke at dawn" : " woke up rested"), a); if (G.Moods) G.Moods.onSleepDone(sim, a); startIdle(sim, a, 0.3); a.wokeEarly = false; }
  }

  // ---- warmth (step 11): a spot under trees next to others is warmest; with no woods near, next to someone ----
  function spotScore(sim, a, x, y) { let n = 0; for (const b of sim.agents) if (b !== a) { const c = claimOf(b).split(",").map(Number); if (Math.hypot(c[0] - x, c[1] - y) <= P().warmth.huddleTiles) n++; } return Math.min(n, P().warmth.huddleMax); }
  Agent.goodSpot = (sim, a) => { const t = Agent.tilePos(a), wood = W.tile(sim.world, t.x, t.y) === G.data.T.WOODS, n = spotScore(sim, a, t.x, t.y);
    if (a.den != null && G.Shelter && G.Shelter.at(sim, t.x, t.y)) return true;   // step 21b: inside a shelter
    return wood && (n >= 1 || sim.agents.length < 2) || n >= 2 || (n >= 1 && Agent.isNight(sim.tick) && !!G.Climate.bondNear(sim, a)); };   // step 20: next to her own people at night
  // step 13: cold and an ember / fire in sight - she may go and sit near it (odds from her fire score, fireFear and how cold she is)
  function seekFire(sim, a) {
    const c = G.Learn.fireSpot(sim, a, (x, y) => W.walkable(sim.world, x, y) && !Agent.claimed(sim, a, x, y)); if (!c) return null;
    if (c.stay) return "stay";
    for (const q of c.slice(0, 4)) if (walkTo(sim, a, q.x, q.y, "fireside", { fire: q.s })) { G.Learn.bump(sim, "approaches", "fire"); return "go"; }
    return null;
  }
  Agent.seekFire = seekFire;
  function seekWarmth(sim, a) {
    const f = seekFire(sim, a); if (f === "go") return true; if (f === "stay") { a.fireStay = sim.tick; return false; }
    if (Agent.goodSpot(sim, a)) return false;
    if (G.Hut && G.Hut.maybe(sim, a)) return true;   // §35: pile a crude hut when cold + materials + known ground
    if (G.Shelter && G.Shelter.seek(sim, a)) return true;   // step 21b: a shelter she knows (odds from her den score)
    const L = G.Learn, wW = 6 * (0.5 + L.score(a, "shelter") / 100), wH = 4 * (0.5 + L.score(a, "huddle") / 100);   // step 14: experience scales the pull of trees / company
    const t = Agent.tilePos(a), R = P().warmth.shelterTiles, cand = [];
    for (let y = t.y - R; y <= t.y + R; y++) for (let x = t.x - R; x <= t.x + R; x++) { if (!W.inb(sim.world, x, y) || !W.walkable(sim.world, x, y) || Agent.claimed(sim, a, x, y)) continue;
      const d = Math.hypot(x - t.x, y - t.y); if (d > R) continue; const wood = W.tile(sim.world, x, y) === G.data.T.WOODS, n = spotScore(sim, a, x, y); if (!wood && !n) continue;
      cand.push({ x, y, sc: d - (wood ? wW : 0) - wH * n }); }
    cand.sort((p, q) => p.sc - q.sc || p.x - q.x || p.y - q.y);
    for (const c of cand.slice(0, 4)) { if (c.x === t.x && c.y === t.y) return false; if (walkTo(sim, a, c.x, c.y, "shelter")) return true; }
    return false;
  }
  function arriveShelter(sim, a) {
    const t = Agent.tilePos(a), n = spotScore(sim, a, t.x, t.y), wood = W.tile(sim.world, t.x, t.y) === G.data.T.WOODS;
    if (n) { const o = sim.agents.find(b => b !== a && Math.hypot(b.pos.x - t.x, b.pos.y - t.y) <= P().warmth.huddleTiles); G.Sim.log(sim, a.name + " huddles up with " + (o ? o.name : "the others") + (wood ? " under the trees" : ""), [a, o]); }
    else if (wood) G.Sim.log(sim, a.name + " shelters under the trees", a);
  }
  const WARM_GOALS = { den: 1, fireside: 1, beside: 1, mate: 1, shelter: 1, hut: 1, fleeFire: 1, burnt: 1, collapse: 1, water: 1, exploreWater: 1, baby: 1 };
  function urgentCold(sim, a, act, n) {
    const W = P().warmth; if (W.urgentBelow == null || n.warmth > W.urgentBelow || n.water < P().energy.wakeIfNeedBelow) return false;
    if (act.type !== "idle" && act.type !== "walk" || act.type === "walk" && WARM_GOALS[act.goal]) return false;
    const heat = a.felt && a.felt.heat > 0, mate = G.Climate.bondNear(sim, a), St = sim.famStats || (sim.famStats = {});
    // 21b (Director): anyone beside her counts as company, group or not; the one she walked to (and she) get +1 familiarity, nobody is refused
    const LT = W.lonerTiles || 0, comp = LT ? sim.agents.find(b => b !== a && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= W.huddleTiles) : null;
    if (a.lonerTo != null) { const q = sim.agents.find(b => b.id === a.lonerTo);
      if (q && Math.hypot(q.pos.x - a.pos.x, q.pos.y - a.pos.y) <= W.huddleTiles) { G.Social.addFam(a, q, W.lonerFam); G.Social.addFam(q, a, W.lonerFam); St.lonerJoins = (St.lonerJoins || 0) + 1;
        G.Sim.log(sim, a.name + " presses in beside " + q.name, [a, q]); a.lonerTo = null; }
      else if (!q || act.type !== "walk") a.lonerTo = null; }
    if (heat || mate || comp) { if (act.type === "walk") { startIdle(sim, a); return true; } return false; }   // there already: she stays
    if (a.urgentAt != null && sim.tick - a.urgentAt < W.urgentRetry / G.data.config.time.tickGameMinutes) return false;
    a.urgentAt = sim.tick;
    let best = null, bd = 1e9, loner = false;
    if (LT) for (const q of sim.agents) { if (q === a) continue; const d = Math.hypot(q.pos.x - a.pos.x, q.pos.y - a.pos.y); if (d <= LT && d < bd) { bd = d; best = q; } }   // nearest person / sleep pile within lonerTiles
    if (best) loner = true;
    else for (const q of sim.agents) if (G.Climate.bonded(a, q)) { const d = Math.hypot(q.pos.x - a.pos.x, q.pos.y - a.pos.y); if (d < bd) { bd = d; best = q; } }
    const df = G.Fire.burning(sim) || Object.keys(sim.fire || {}).length ? G.Fire.nearestFlame(sim, a.pos.x, a.pos.y) : Infinity;
    const tryFire = () => seekFire(sim, a) === "go", tryMate = () => best && G.Family.goBeside(sim, a, best, "beside");
    const ok = df <= bd ? tryFire() || tryMate() : tryMate() || tryFire();
    if (ok) { St.urgentWarm = (St.urgentWarm || 0) + 1; if (loner && a.act.type === "walk" && a.act.goal === "beside") { a.lonerTo = best.id; St.lonerWalks = (St.lonerWalks || 0) + 1; }
      if (a.act.type === "walk") move(sim, a); return true; }
    return false;
  }
  // move away from flames (no burn damage yet; step 12)
  function fleeFire(sim, a) {
    const t = Agent.tilePos(a), best = G.Fire.awayTile(sim, t.x, t.y, (x, y) => W.walkable(sim.world, x, y) && !Agent.claimed(sim, a, x, y));
    if (!best || !walkTo(sim, a, best.x, best.y, "fleeFire")) return false;
    if (sim.tick - (a.fledFireAt == null ? -1e9 : a.fledFireAt) >= 120) G.Sim.log(sim, a.name + " moves away from the flames", a);
    a.fledFireAt = sim.tick; return true;
  }

  // step 13: burned - step off to a tile 2-3 tiles from the burning spot (away from any flames)
  function fleeBurn(sim, a, b) {
    const t = Agent.tilePos(a), c = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = b.x + dx, y = b.y + dy, d = Math.hypot(dx, dy), f = sim.fire[x + "," + y];
      if (d < 2 || d > 3.2 || f && (f.s === "fire" || f.s === "ember") || !W.walkable(sim.world, x, y) || Agent.claimed(sim, a, x, y)) continue;
      c.push({ x, y, k: (G.Fire.burning(sim) ? -G.Fire.nearestFlame(sim, x, y) * 2 : 0) + Math.hypot(x - t.x, y - t.y) }); }
    c.sort((p, q) => p.k - q.k || p.x - q.x || p.y - q.y);
    for (const q of c.slice(0, 4)) if (walkTo(sim, a, q.x, q.y, "burnt")) return true;
    return false;
  }
  function arriveFireside(sim, a) {
    const t = Agent.tilePos(a), o = sim.agents.find(b => b !== a && Math.round(b.pos.x) === t.x && Math.round(b.pos.y) === t.y);
    if (o) G.Social.took(sim, a, o, "spot by the fire");   // step 18: someone sat down on the spot she was heading for
    if (sim.tick - (a.sitFireAt == null ? -1e9 : a.sitFireAt) >= 120) G.Sim.log(sim, a.name + " sits down near the " + (a.act.fire === "ember" ? "embers" : a.act.fire === "brand" ? "burning stick" : "fire"), a);
    a.sitFireAt = sim.tick; if (a.act.fire === "brand" && sim.fireStats) sim.fireStats.brandSits = (sim.fireStats.brandSits || 0) + 1;
    if (G.Disease) G.Disease.onSitFire(sim, a);
  }
  // step 20: a child more than keepTiles from her guardian walks to a free tile 1-2 tiles from them
  function keepNear(sim, a) {
    const g = G.Family.checkGuard(sim, a); if (!g) return false;
    if (Math.hypot(g.pos.x - a.pos.x, g.pos.y - a.pos.y) <= G.data.config.child.keepTiles) return false;
    const gx = Math.round(g.pos.x), gy = Math.round(g.pos.y), c = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (!dx && !dy) continue; const x = gx + dx, y = gy + dy;
      if (!W.inb(sim.world, x, y) || !W.walkable(sim.world, x, y) || Agent.claimed(sim, a, x, y)) continue;
      const st = G.Fire.state(sim, x, y); if (st && (st.s === "fire" || st.s === "ember")) continue;
      c.push({ x, y, d: Math.hypot(x - a.pos.x, y - a.pos.y) }); }
    c.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x);
    for (const q of c.slice(0, 4)) if (walkTo(sim, a, q.x, q.y, "keep", { to: g.id })) { const St = sim.famStats; if (St) St.keeps = (St.keeps || 0) + 1; return true; }
    return false;
  }
  Agent._keepNear = keepNear;
  function wander(sim, a) {
    // Director (step 17 call 2): cold comes first - a fire in sight, else trees / company, before any early trip, hunt or wander
    if (a.needs.warmth < Agent.warmthSeekBelow(a)) { if (seekWarmth(sim, a)) return; if (Agent.goodSpot(sim, a) || a.fireStay === sim.tick) return startIdle(sim, a); }   // cold: stay huddled / under the trees
    if (waterIsFar(sim, a)) { G.Sim.log(sim, a.name + " set off early for water", a); return seekWater(sim, a); }
    if (foodIsFar(sim, a)) { G.Sim.log(sim, a.name + " set off early for a far bush", a); return seekFood(sim, a, null, true); }
    if (keepNear(sim, a)) return;   // step 20: a child walks back to within keepTiles of her guardian
    // step 18: keep 3+ tiles from someone she dislikes; drift to 1-3 tiles off the most-liked person in sight
    const gd = G.Family.guardian(sim, a), near = (x, y) => !gd || Math.hypot(gd.pos.x - x, gd.pos.y - y) <= G.data.config.child.keepTiles;   // a child stays within reach
    if (G.Social.idleMove(sim, a, (x, y, g, ex) => walkTo(sim, a, x, y, g, ex), (x, y) => W.walkable(sim.world, x, y) && !Agent.claimed(sim, a, x, y) && near(x, y))) return;
    if (G.Corpse && G.Corpse.maybe(sim, a)) return;   // step 26: corpse choices (leave/drag/bury/burn/eat/ritual)
    if (G.Tools && (!G.Injury || G.Injury.canUseTools(a)) && G.Tools.maybe(sim, a)) return;   // §40: a broken arm blocks tool use   // step 29: bind / chop / poke / ready long stick
    if (G.Hides && G.Hides.maybe(sim, a)) return;   // v28: wear / sleep-under hide when cold
    if (G.Faith && G.Faith.maybeDriftSacred(sim, a)) return;   // §33: idle drift to known sacred marker
    if (G.Hut && G.Hut.tend && G.Hut.tend(sim, a)) return;   // v38 (a): patch a worn hut nearby / add a better piece to it
    if (G.Items.maybeTry(sim, a) || G.Items.maybePickUp(sim, a)) return;   // idle curiosity (step 9-10)
    const w = P().wander, r = w.radius, g = G.Family.guardian(sim, a), K = G.data.config.child.keepTiles,
      t = randomTarget(sim, a, 2, r, (x, y) => G.Social.wanderOk(sim, a, x, y) && (!g || Math.hypot(g.pos.x - x, g.pos.y - y) <= K));
    if (!t || !walkTo(sim, a, t.x, t.y, "wander")) startIdle(sim, a, 0.3);
  }

  // Go to the nearest remembered ripe (or due-to-regrow) bush (by path length among the 3 closest); else explore away from known bushes.
  function seekFood(sim, a, skipId, allowFar) {
    if (Agent.want(a) === "food" && G.Cache && G.Cache.seekRetrieve(sim, a, "food")) return;   // v29: remembered cache before bush/hunt
    if (Agent.want(a) === "food" && G.Hunt.seekFood(sim, a)) return;   // step 16: meat in hand, a carcass in sight, or a grazer to go after
    const K = a.knowledge.bushes, t = Agent.tilePos(a);
    const reach = G.Tools ? G.Tools.reachTiles(sim, a) : 0;
    const bushOk = (id) => {
      const bx = K[id].x, by = K[id].y;
      if (!Agent.claimed(sim, a, bx, by)) return { x: bx, y: by };
      if (reach <= 0) return null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = bx + dx, y = by + dy;
        if (Math.hypot(dx, dy) <= reach + 1e-9 && W.walkable(sim.world, x, y) && !Agent.claimed(sim, a, x, y)) return { x, y };
      }
      return null;
    };
    const known = Object.keys(K).filter(id => id !== skipId && bushOk(id) && (K[id].ripe || sim.tick - (K[id].emptySince || 0) >= G.data.config.bushes.regrowMinutes))  // empty ones are expected back after a day
      .map(id => ({ id, d: Math.hypot(K[id].x - t.x, K[id].y - t.y) })).sort((p, q) => p.d - q.d || (p.id < q.id ? -1 : 1)).slice(0, P().explore.pathCandidates);
    let best = null;
    for (const k of known) { const spot = bushOk(k.id); if (!spot) continue; const p = W.findPath(sim.world, t.x, t.y, spot.x, spot.y); if (p && (!best || W.pathLength(p) < best.len)) best = { id: k.id, p, len: W.pathLength(p) }; }
    const e = P().explore;
    if (best && (allowFar || best.len <= e.farTiles)) { a.act = { type: "walk", goal: "food", path: best.p, i: 0, bush: best.id }; return; }
    const near = best && !allowFar, ids = Object.keys(K);
    let pick = null, pickScore = -1;
    for (let c = 0; c < e.candidates; c++) {
      const q = randomTarget(sim, a, near ? e.nearMin : e.min, near ? e.nearMax : e.max); if (!q) continue;
      const score = ids.length ? Math.min(...ids.map(id => Math.hypot(K[id].x - q.x, K[id].y - q.y))) : sim.rng.float();
      if (score > pickScore) { pick = q; pickScore = score; }
    }
    if (!pick || !walkTo(sim, a, pick.x, pick.y, "explore")) { if (best) a.act = { type: "walk", goal: "food", path: best.p, i: 0, bush: best.id }; else startIdle(sim, a, 0.2); }
  }

  // Not hungry yet (fullness above snackAbove) but a ripe bush is in sight: eat it now if it is close by path (overeating). Off unless snackAbove is set.
  function seekNear(sim, a) {
    const t = Agent.tilePos(a), R = Agent.sight(a); let best = null;
    for (const b of sim.bushes) { if (!b.ripe || Agent.claimed(sim, a, b.x, b.y) || (b.x - a.pos.x) ** 2 + (b.y - a.pos.y) ** 2 > R * R) continue;
      const p = W.findPath(sim.world, t.x, t.y, b.x, b.y); if (p && W.pathLength(p) <= R * 1.5 && (!best || W.pathLength(p) < best.len)) best = { id: b.id, p, len: W.pathLength(p) }; }
    if (best) a.act = { type: "walk", goal: "food", path: best.p, i: 0, bush: best.id };
  }

  // step 18: the bush she was heading for was eaten bare by someone else in the last hours (b.ateBy / b.ateAt, set when a meal ends)
  function tookBush(sim, a, b) { if (b && b.ateBy != null && b.ateBy !== a.id && sim.tick - b.ateAt <= 240) G.Social.took(sim, a, sim.agents.find(q => q.id === b.ateBy), "bush"); }
  function arrive(sim, a) {
    const g = a.act.goal;
    if (g === "food") {
      const b = sim.bushes.find(q => q.id === a.act.bush);
      const reach = G.Tools ? G.Tools.reachTiles(sim, a) : 0;
      const dBush = b ? Math.hypot(b.x - a.pos.x, b.y - a.pos.y) : 99;
      const canReach = b && b.ripe && (reach > 0 ? dBush <= reach + 1e-9 : dBush < 0.01);
      if (canReach) {
        if (reach > 0 && G.Tools) { const sp = G.Items.held(sim, a); if (sp) G.Tools.use(sim, a, sp, "reach"); G.Tools.ensure(sim).reaches++; }
        a.act = { type: "eat", bush: b.id, t: 0, from: a.needs.fullness, over: !!a.act.over || a.needs.fullness >= Agent.fullnessThreshold(a), adds: r2(P().fullness.mealAdds * G.Sim.seasonal(sim.tick).yield) }; return; }
      G.Sim.log(sim, a.name + " found the bush bare", a);
      if (b) { a.knowledge.bushes[b.id].ripe = false; tookBush(sim, a, b); }
      if (Agent.want(a) === "water") seekWater(sim, a); else seekFood(sim, a, b && b.id); return;
    }
    if (g === "water") { if (a.act.water === "puddle" && !G.Powers.puddleAt(sim, Math.round(a.pos.x), Math.round(a.pos.y))) { seekWater(sim, a); return; }   // step 22: it dried up
      startDrink(sim, a, a.act.water); return; }
    if (g === "cover") { G.Powers.arriveCover(sim, a); return; }   // step 22: waits out the rain
    if (g === "hunt") { G.Hunt.arriveStalk(sim, a); return; }
    if (g === "wolfHunt") { if (G.WolfFight) G.WolfFight.arrive(sim, a); else startIdle(sim, a); return; }   // v38 (f)
    if (g === "meat") { G.Hunt.arriveMeat(sim, a); return; }
    if (g === "corpse") { G.Corpse.arrive(sim, a); return; }   // step 26
    if (g === "drag") { G.Corpse.arriveDrag(sim, a); return; }
    if (g === "cook") { G.Cook.arrive(sim, a); return; }
    if (g === "collapse") { startSleep(sim, a); return; }
    if (g === "settle") { startIdle(sim, a, a.act.scale); return; }
    if (g === "den") { startIdle(sim, a); return; }   // step 21b: in the shelter (Shelter.step lets her in or finds it full)
    if (g === "pickup") { G.Items.arrivePickup(sim, a); if (!G.Items.maybeTry(sim, a)) startIdle(sim, a, 0.5); return; }   // a fresh find is often tried on something close by
    if (g === "try") { if (!G.Items.arriveTry(sim, a)) startIdle(sim, a, 0.5); return; }
    if (g === "bind") { if (!G.Tools || !G.Tools.arriveBind(sim, a)) startIdle(sim, a, 0.5); return; }
    if (g === "tip") { if (!G.Tools || !G.Tools.arriveTip(sim, a)) startIdle(sim, a, 0.5); return; }
    if (g === "prayspot") { if (!G.Faith.arriveSpot(sim, a)) startIdle(sim, a); return; }   // step 21
    if (g === "sacred") { startIdle(sim, a); return; }   // §33: arrived at known sacred marker
    if (g === "stash") { if (G.Cache) G.Cache.arriveStash(sim, a); else startIdle(sim, a); return; }   // v29
    if (g === "cache") { if (G.Cache) G.Cache.arriveRetrieve(sim, a); else startIdle(sim, a); return; }   // v29
    if (g === "hut") { if (G.Hut) G.Hut.arrive(sim, a); else startIdle(sim, a); return; }   // §35
    if (g === "dryFood") { if (G.Food) G.Food.arriveDry(sim, a); else startIdle(sim, a); return; }   // v38 (c)
    if (g === "hutTend") { if (G.Hut && G.Hut.arriveTend) G.Hut.arriveTend(sim, a); else startIdle(sim, a); return; }   // v38 (a)
    if (g === "shelter") { const back = a.act.coldWake; arriveShelter(sim, a); if (back && shouldSleep(sim, a)) startSleep(sim, a, true); else startIdle(sim, a); return; }
    if (g === "mate") { if (shouldSleep(sim, a)) startSleep(sim, a); else startIdle(sim, a); return; }   // step 19
    if (g === "fleeFire" || g === "burnt") { startIdle(sim, a, 0.3); return; }
    if (g === "scared") { if (!G.Powers.arriveRun(sim, a)) startIdle(sim, a, 0.3); return; }   // step 23: ran from a strike / a new predator
    if (g === "fireside") { const br = a.act.fire === "brand"; arriveFireside(sim, a); startIdle(sim, a); if (br && G.Fire.byBrand(sim, a)) G.Fire.maybeGrab(sim, a); return; }
    if (g === "exploreWater" && Agent.want(a) === "water") { seekWater(sim, a); return; }
    if (g === "explore" && a.needs.fullness < Agent.fullnessThreshold(a) && Agent.want(a) !== "water") { seekFood(sim, a, null, true); return; } // looked nearby; now accept a far bush
    startIdle(sim, a);
  }

  function move(sim, a) {
    const act = a.act; let budget = 1 / Agent.minutesPerTile(a) * G.data.config.time.tickGameMinutes; // tiles per tick
    if (!act.path.length && !whole(a)) act.path = [[Math.round(a.pos.x), Math.round(a.pos.y)]];   // a path from the tile she is stepping onto: finish the step
    while (budget > 1e-9 && act.i < act.path.length) {
      const [nx, ny] = act.path[act.i], dx = nx - a.pos.x, dy = ny - a.pos.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > Math.abs(dy)) a.facing = dx > 0 ? "right" : "left"; else if (dy) a.facing = dy > 0 ? "down" : "up";
      const k = G.Shelter ? G.Shelter.walkX(sim, nx, ny) : 1;   // step 21b: pushing into a thicket takes walkX the time
      if (d * k <= budget) { a.pos.x = nx; a.pos.y = ny; budget -= d * k; act.i++; }
      else { a.pos.x += dx / d * budget / k; a.pos.y += dy / d * budget / k; budget = 0; }
    }
    a.pos.x = Math.round(a.pos.x * 1e6) / 1e6; a.pos.y = Math.round(a.pos.y * 1e6) / 1e6; // keep saves exact
    if (act.i >= act.path.length) arrive(sim, a);
  }

  // One ripe bush = one meal, eaten in one sitting over mealMinutes, then the bush is empty. It adds mealAdds (40) fullness:
  // a normal (hungry) meal stops at mealFillTo (85, "full"); overeating (started at/above the threshold, or the bedtime meal) adds the full 40, capped at 100.
  // step 15: adds = this season's meal (mealAdds x bushes.season.yield, set when the meal starts)
  Agent.mealEnd = (from, over, adds) => { const f = P().fullness; return Math.max(from, Math.min(over ? 100 : f.mealFillTo, from + (adds == null ? f.mealAdds : adds))); };
  function eat(sim, a) {
    const act = a.act, p = P(), b = sim.bushes.find(q => q.id === act.bush), n = p.mealMinutes / G.data.config.time.tickGameMinutes;
    if (!b || !b.ripe) { if (Agent.want(a) === "water") seekWater(sim, a); else seekFood(sim, a, act.bush); return; }
    act.t++; const end = Agent.mealEnd(act.from, act.over, act.adds);
    a.needs.fullness = Math.round((act.from + (end - act.from) * Math.min(1, act.t / n)) * 1e9) / 1e9;
    if (act.t >= n) {
      a.needs.fullness = end; b.ripe = false; b.regrow = 0; b.ateBy = a.id; b.ateAt = sim.tick; a.knowledge.bushes[b.id].ripe = false; a.knowledge.bushes[b.id].emptySince = sim.tick;
      a.stats.meals++; G.Sim.log(sim, a.name + " ate berries (" + Agent.fullnessWord(end) + ")", a);
      if (G.Speech) G.Speech.onEat(sim, a);
      if (G.Disease) G.Disease.onEatBerries(sim, a);
      if (G.Farm) G.Farm.afterMeal(sim, a, b);   // v38 (b): a seed may fall; a learned urge presses berries into soft ground
      startIdle(sim, a);
    }
  }

  // Why this person dies now (null = alive): day at water 0, week at fullness 0,
  // warmth after full hypo ladder at warmthZeroMinutes (3d) → cause "cold",
  // energy after sleep-dep ladder at energyZeroMinutes (5d) → cause "exhaustion", or lifespan.
  // Story death log lines (via body.causeVerb "="): cold → froze / didn't wake from the cold; exhaustion → never woke / worn down to nothing.
  Agent.deathCause = a => { const D = P().death, z = a.zero || {};
    if (z.water >= D.waterZeroMinutes) return "thirst";
    if (z.fullness >= D.fullnessZeroMinutes) return "hunger";
    // warmth: only after full hypo ladder (past unconsciousAt) AND warmthZeroMinutes
    if (D.warmthZeroMinutes != null && (z.warmth || 0) >= D.warmthZeroMinutes) {
      const H = P().hypothermia;
      if (!H || (z.warmth || 0) >= (H.unconsciousAt || 0)) return "cold";
    }
    if (D.energyZeroMinutes != null && (z.energy || 0) >= D.energyZeroMinutes) return "exhaustion";
    if (a.age >= a.lifespan) return "old age";
    if (a.health != null && a.health <= 0) return "wounds";   // §40 / v37: health bar run out
    return null; };

  // 26b hypothermia stage 0–5 from warmth + minutes at 0 (Director locked)
  Agent.hypoStage = a => {
    const H = P().hypothermia; if (!H) return 0;
    const w = a.needs.warmth, z = (a.zero && a.zero.warmth) || 0;
    if (w > H.clearAbove) return 0;
    if (w > 0) return w < H.shiverBelow ? 1 : 0;
    if (z >= H.unconsciousAt) return 5;
    if (z >= H.drowsinessAt) return 4;
    if (z >= H.clumsinessAt) return 3;
    if (z >= H.confusionAt) return 2;
    return 1;
  };

  function childLeft(sim, a) {
    // (no season or tiredness switch: a child keeps close all year; a need that is due is seen to first, above)
    if (sim.tick % 2 || !G.Family.isChild(a)) return false; const g = G.Family.guardian(sim, a);
    return !!g && Math.hypot(g.pos.x - a.pos.x, g.pos.y - a.pos.y) > G.data.config.child.keepTiles;
  }
  Agent.step = function (sim, a) {
    const p = P(), E = p.energy, n = a.needs, thr = Agent.fullnessThreshold(a), tthr = Agent.waterThreshold(a), h0 = n.fullness, t0 = n.water, e0 = n.energy;
    const asleep = a.act.type === "sleep", k = asleep ? E.asleepNeedRate : 1;
    n.fullness = Math.max(p.fullness.min, h0 - Agent.fullnessDrainPerTick(a) * k);
    n.water = Math.max(p.water.min, t0 - Agent.waterDrainPerTick(a) * k);
    n.energy = asleep ? Math.min(100, e0 + Agent.energyRefillPerTick(a)) : Math.max(0, e0 - Agent.energyDrainPerTick(a));
    n.fullness = Math.round(n.fullness * 1e9) / 1e9; n.water = Math.round(n.water * 1e9) / 1e9; n.energy = Math.round(n.energy * 1e9) / 1e9; // keep saves exact
    a.age += G.data.config.time.tickGameMinutes / (1440 * G.Time.daysPerYear());
    // warmth: moves toward equilibrium from felt (v22: eq = 50 + (feltC - 10) * eqPerC; air/shelter/huddle/fire raise feltC)
    const w0 = n.warmth, felt = a.felt = G.Climate.felt(sim, a);
    const wr0 = G.Climate.warmthRate(felt.c, w0), ax = Math.round(a.pos.x), ay = Math.round(a.pos.y);
    // step 22 / 24: out in the rain she loses warmth lossX (per strength) as fast
    // v29: active rain / soft wet-ground exposure blocks daytime warmth climb (unless fire heat); loss still amplified
    const lossX = felt.wet && G.Powers && G.Powers.lossXAt ? G.Powers.lossXAt(sim, ax, ay) : (G.data.config.powers.rain.strengths ? G.data.config.powers.rain.strengths.medium.lossX : 1.5);
    const softWet = !(felt.wet > 0) && G.Powers && G.Powers.wetAt && G.Powers.wetAt(sim, ax, ay)
      && !(G.Shelter && G.Shelter.inside(sim, a))
      && G.World.tile(sim.world, ax, ay) !== G.data.T.WOODS;
    let wr = wr0;
    if (felt.wet > 0) {
      if (wr0 < 0) wr = wr0 * (1 + (lossX - 1) * felt.wet);
      else if (wr0 > 0 && !(felt.heat > 0)) wr = wr0 * (G.Powers.climbXAt ? G.Powers.climbXAt(sim, ax, ay) : 0);   // rain chill blocks day climb (climbX, 0 = none); fire may still warm
      // §40 / v37: soaked skin keeps losing warmth (drainPerHour by strength x exposure) unless fire heat reaches her
      if (!(felt.heat > 0) && G.Powers.drainAt) { const d = G.Powers.drainAt(sim, ax, ay) * felt.wet / 60; if (d > 0) { wr -= d; felt.rainDrain = d; } }
    } else if (softWet) {
      if (wr0 < 0) wr = wr0 * 1.15;                    // residual damp ground: mild extra loss
      else if (wr0 > 0 && !(felt.heat > 0)) wr = 0;     // damp ground also blocks daytime climb without fire
      if (softWet) felt.wetGround = true;
    }
    n.warmth = Math.round(clamp(w0 + wr * G.data.config.time.tickGameMinutes, p.warmth.min, 100) * 1e9) / 1e9;
    if (a.hold) n[a.hold] = 0;   // test-only (GS.debug.drainWater / drainFullness / drainWarmth): hold that need at 0
    const tm = G.data.config.time.tickGameMinutes, z = a.zero || (a.zero = { water: 0, fullness: 0, warmth: 0, energy: 0 });
    if (z.energy == null) z.energy = 0;
    // test-only hold: once the held need has sat at 0 since last tick, a drink/meal in between is undone by the hold, so don't re-log it (logs once, like play)
    const hf = a.hold === "fullness" && z.fullness > 0, hw = a.hold === "water" && z.water > 0;
    z.water = n.water <= 0 ? z.water + tm : 0; z.fullness = n.fullness <= 0 ? z.fullness + tm : 0; z.warmth = n.warmth <= 0 ? (z.warmth || 0) + tm : 0;
    z.energy = n.energy <= 0 ? z.energy + tm : 0;
    if (n.energy > 0) { a.energyConfused = false; a.energyHallucAt = null; }
    // 26b rain exposure clock (awake + exposed); reset under cover / when rain ends
    if (G.Powers) {
      if (!asleep && G.Powers.exposure(sim, a) > 0) a.rainExposedMinutes = (a.rainExposedMinutes || 0) + tm * (G.Powers.exposeXAt ? G.Powers.exposeXAt(sim, ax, ay) : 1);   // §40: heavy rain runs the clock faster
      else { a.rainExposedMinutes = 0; a.rainCoverLogged = false; }
    }
    G.Learn.stepWarmth(sim, a, felt, w0);   // steps 13-14: what warmed her when cold raises that action's score (and may be copied)
    // 26b hypothermia stages (Story Writer action-only): shivering → stumbling/looking lost → moving slow/dropping things → nodding off → collapsed; death only after warmthZeroMinutes
    const H = P().hypothermia; const prevHypo = a.hypo || 0; a.hypo = Agent.hypoStage(a);
    if (H) {
      if ((w0 >= H.shiverBelow && n.warmth < H.shiverBelow) || (w0 > 0 && n.warmth <= 0) || (a.hypo >= 1 && prevHypo < 1))
        G.Sim.log(sim, a.name + " is shivering", a);
      if (a.hypo >= 2 && n.warmth <= 0) {
        if (!a.hypoOddAt || sim.tick - a.hypoOddAt >= (H.confuseLogEvery || 60)) {
          if (sim.rng.float() < (H.confuseChance || 0.2)) {
            a.hypoOddAt = sim.tick;
            G.Sim.log(sim, a.name + (sim.rng.float() < 0.5 ? " is stumbling" : " looks lost"), a);
          }
        }
        if (a.hypo >= 3 && prevHypo < 3) G.Sim.log(sim, a.name + " is moving slow", a);
        if (a.hypo >= 3 && a.carry != null && sim.rng.float() < (H.dropChance || 0)) {
          G.Items.drop(sim, a); G.Sim.log(sim, a.name + " drops what they were carrying", a);
        }
      }
    }
    // 26b energy sleep-dep: collapse→forced sleep; confusion @1d; hallucination @2d every ~6h; death at energyZeroMinutes
    if (n.energy <= 0 && z.energy >= 1440 && !a.energyConfused) {
      a.energyConfused = true; G.Sim.log(sim, a.name + " is confused from lack of sleep", a);
    }
    if (n.energy <= 0 && z.energy >= 2880 && (!a.energyHallucAt || sim.tick - a.energyHallucAt >= 360)) {
      a.energyHallucAt = sim.tick; G.Sim.log(sim, a.name + " sees things that are not there", a);
    }
    // step 13: stepping onto a burning / smouldering tile is a burn (fire score drops, she jumps back; no health damage)
    const burn = G.Learn.checkBurn(sim, a);
    if (burn) { if (a.act.type === "sleep") a.wokeEarly = true; if (a.carry != null) G.Items.drop(sim, a); if (fleeBurn(sim, a, burn)) { move(sim, a); return; } }
    // flames close by: get up and move away (no burn damage yet)
    const reaching = a.act.goal === "pickup" && a.act.brand && a.act.path && (a.act.bolt || a.act.path.length - a.act.i <= G.data.config.fire.brand.reachTiles + 1);   // step 21: reaching for a burning stick by the fire; step 23: the whole walk to a bolt stick
    if (a.act.goal !== "fleeFire" && a.act.goal !== "burnt" && !reaching && G.Fire.burning(sim) && G.Fire.fearedFlame(sim, a, a.pos.x, a.pos.y) < G.data.config.fire.fleeTiles) {   // step 20: brave ones stay by a struck tree
      if (a.act.type === "sleep") G.Sim.log(sim, a.name + " wakes to flames", a);
      if (a.act.type === "sleep" || a.act.type === "idle" || a.act.type === "try" || a.act.type === "eat" || a.act.type === "eatMeat" || a.act.type === "eatCorpse" || a.act.type === "dig" || a.act.type === "cook" || a.act.type === "drink" || a.act.type === "walk") { if (a.act.type === "sleep") a.wokeEarly = true; if (fleeFire(sim, a)) { move(sim, a); return; } } }
    // the thing in hand is put down when a need takes over, at bedtime, or after a while - step 16: unless she is hungry and it is fresh meat or something hard to hunt with
    if (a.carry != null && (a.act.type === "sleep" || ((Agent.want(a) || sim.tick >= a.carryUntil) && !G.Hunt.keep(sim, a)))) {
      // v29: prefer intentional stash at known shelter/prayer cache when freeing hands (not sleep / hypo)
      if (a.act.type !== "sleep" && !Agent.want(a) && G.Cache && G.Cache.tryStash(sim, a)) { /* walking to stash or stashed */ }
      else G.Items.drop(sim, a);
    }
    if (!hf && h0 >= thr && n.fullness < thr) G.Sim.log(sim, a.name + " is hungry", a);
    if (!hf && (h0 > p.fullness.min || a.hold === "fullness") && n.fullness <= p.fullness.min) G.Sim.log(sim, a.name + " is starving", a);
    if (!hw && t0 >= tthr && n.water < tthr) G.Sim.log(sim, a.name + " is thirsty", a);
    if (!hw && (t0 > p.water.min || a.hold === "water") && n.water <= p.water.min) G.Sim.log(sim, a.name + " is dehydrated", a);
    if (e0 > 0 && n.energy <= 0) G.Sim.log(sim, a.name + " is delirious", a);
    // 26b unconscious hypothermia: collapse in place; no self-rescue until warmth > rescueAbove
    if (H && a.hypo >= 5 && n.warmth <= (H.rescueAbove || 10)) {
      const eqCold = G.Climate.warmthRate(felt.c, n.warmth) < 0 || a.hypoUnconscious;
      if (eqCold) {
        a.hypoUnconscious = true;
        if (a.act.type !== "sleep") { G.Sim.log(sim, a.name + (sim.rng.float() < 0.5 ? " has collapsed" : " is not getting up"), a); return startSleep(sim, a); }
        return sleep(sim, a);
      }
    } else if (!H || n.warmth > (H.rescueAbove || 10)) a.hypoUnconscious = false;
    if (asleep) return sleep(sim, a);
    // drowsy (≥4 h at warmth 0): may lie down by day (cold sleep)
    if (H && a.hypo >= 4 && n.warmth <= 0 && a.act.type !== "eat" && a.act.type !== "drink" &&
        (sim.tick % (H.drowsyCheckMinutes || 10) === 0) && sim.rng.float() < (H.drowsyChance || 0.03)) {
      G.Sim.log(sim, a.name + (sim.rng.float() < 0.5 ? " is nodding off" : " is slowing further"), a); return startSleep(sim, a);
    }
    if (a.act.type === "try") { if (!G.Items.stepTry(sim, a)) startIdle(sim, a); return; }
    if (a.act.type === "pray") { if (!G.Faith.stepPray(sim, a)) startIdle(sim, a); return; }   // step 21: a prayer bout (10-40 min); step 26 ritual at a body also uses pray
    if (a.act.type === "dig") { G.Corpse.stepDig(sim, a); return; }   // step 26 bury
    if (a.act.type === "bind") { if (!G.Tools.stepBind(sim, a)) startIdle(sim, a); return; }   // step 29
    if (a.act.type === "tip") { if (!G.Tools.stepTip(sim, a)) startIdle(sim, a); return; }   // §37 hard tip
    if (a.act.type === "chop") { if (!G.Tools.stepChop(sim, a)) startIdle(sim, a); return; }
    if (a.act.type === "eatCorpse") { G.Corpse.stepEat(sim, a); return; }
    if (a.wokeEarly && !Agent.isNight(sim.tick)) a.wokeEarly = false;
    const seen = sense(sim, a), act = a.act; let want = Agent.want(a);
    // Director (step 20 call 1): on a Deep Cold night a cold person puts warmth before food (hunger takes a week, cold a day): no night food trips
    const coldNight = Agent.coldNight(sim, a);
    if (coldNight && want === "food") { want = n.water < p.actAt ? "water" : null;   // food waits for morning; water still counts
      if (!want) if (act.type === "walk" && (act.goal === "food" || act.goal === "explore")) { startIdle(sim, a); return; } }
    // Director (21): at warmth <= urgentBelow she heads for the nearest group member (or partner / guardian) or fire before anything else
    // (water still wins below wakeIfNeedBelow; a meal or drink in progress is finished). Retried every urgentRetry minutes.
    if (urgentCold(sim, a, act, n)) return;
    const goalNeed = { food: "food", explore: "food", water: "water", exploreWater: "water" }[act.goal];
    // on the way to water she keeps going even if fullness dips lower (no flip-flopping), unless fullness falls below wakeIfNeedBelow.
    // On the way to food she never carries on once water is the lower need under actAt: water wins (Director call, 6:26 PM).
    const stay = goalNeed === "water" && want === "food" && n.water < p.actAt && n.fullness >= E.wakeIfNeedBelow;
    // delirious (energy 0, 26b zero-point): lies down where she is, day or night, unless a need is below wakeIfNeedBelow
    if (n.energy <= 0 && act.type !== "eat" && act.type !== "drink" && act.goal !== "collapse" && n.fullness >= E.wakeIfNeedBelow && n.water >= E.wakeIfNeedBelow) {
      if (act.type !== "walk" || act.i >= act.path.length) return startSleep(sim, a);
      const [x, y] = act.path[act.i];   // mid-step: finish the step onto the next tile (if nobody has claimed it) and lie down there
      if (!Agent.claimed(sim, a, x, y)) { act.path = act.path.slice(0, act.i + 1); act.goal = "collapse"; } }
    if (act.type === "eat") return eat(sim, a);
    if (act.type === "eatMeat") return G.Hunt.stepEat(sim, a);
    if (act.type === "cook") return G.Cook.stepHold(sim, a);   // step 17: holding meat to an ember / fire
    if (act.type === "drink") return drink(sim, a);
    if (act.goal === "food" && !a.knowledge.bushes[act.bush].ripe && a.knowledge.bushes[act.bush].seen === sim.tick) { G.Sim.log(sim, a.name + " saw the bush was bare", a); tookBush(sim, a, sim.bushes.find(q => q.id === act.bush)); if (want === "water") seekWater(sim, a); else seekFood(sim, a, act.bush); }
    else if (stay) { /* carry on */ }
    else if (want === "water" && act.goal !== "water" && (act.goal !== "exploreWater" || seen.waterNew)) seekWater(sim, a);
    else if (want === "food" && act.goal !== "food" && act.goal !== "hunt" && act.goal !== "meat" && act.goal !== "cook" && (act.goal !== "explore" || seen.ripeNew)) seekFood(sim, a);
    else if (G.Powers && G.Powers.rainUrgent && G.Powers.rainUrgent(sim, a) && G.Powers.seekCover(sim, a, act)) { /* 26b ≥4h rain: cover outranks snacks */ }
    else if (!want && p.fullness.snackAbove != null && n.fullness > p.fullness.snackAbove && act.goal !== "food" && seen.ripe) seekNear(sim, a);
    else if (G.Powers.seekCover(sim, a, act)) { /* step 22 / 26b: out of the rain */ }
    else if (H && a.hypo >= 2 && n.warmth <= 0 && act.type === "idle" && sim.rng.float() < (H.confuseChance || 0.2) * 0.25) {
      const t0 = Agent.tilePos(a), ox = t0.x + (sim.rng.float() < 0.5 ? -1 : 1) * (1 + Math.floor(sim.rng.float() * 3)), oy = t0.y + (sim.rng.float() < 0.5 ? -1 : 1) * (1 + Math.floor(sim.rng.float() * 3));
      if (G.World.inb(sim.world, ox, oy) && G.World.walkable(sim.world, ox, oy) && !Agent.claimed(sim, a, ox, oy)) {
        const pth = G.World.findPath(sim.world, t0.x, t0.y, ox, oy); if (pth) { a.act = { type: "walk", goal: "wander", path: pth, i: 0 }; }
      }
    }
    else if (act.type === "idle" && shouldSleep(sim, a)) {
      // before lying down: if fullness or water would drop below bedtimeMin by morning, see to it first - only a short trip, once a night
      const bn = n.energy > 0 && bedtimeNeed(sim, a), b = coldNight && bn === "food" ? null : bn, go = b && a.topUp !== b && topUpTrip(sim, a, b), night = G.Time.at(sim.tick + 720).day;
      // a cold night: first find a spot under trees / next to others (once a night)
      const cold = G.Climate.airAt(sim, a.pos.x, a.pos.y) < p.warmth.neutralC + a.traits.coldFear / 20;
      // step 20: a guardian whose child already fell asleep elsewhere lies down beside the child first (once a night)
      const ward = !go && n.energy > 0 && a.wardNight !== night ? sim.agents.find(q => q.guard === a.id && G.Family.isChild(q) && q.act.type === "sleep" &&
        Math.max(Math.abs(Math.round(q.pos.x) - Math.round(a.pos.x)), Math.abs(Math.round(q.pos.y) - Math.round(a.pos.y))) > 1) : null;
      if (ward) { a.wardNight = night; if (G.Family.goBeside(sim, a, ward, "beside")) { move(sim, a); return; } }
      // step 19: a paired person first goes to lie down next to her partner (once a night); beside her partner she skips the cold shelter
      if (!go && a.mate != null && a.mateNight !== night && n.energy > 0) { a.mateNight = night; if (G.Family.goToMate(sim, a)) { move(sim, a); return; } }
      if (!go && a.mate != null && G.Family.besideMate(sim, a)) a.shelterNight = night;
      // Director (step 20 call 1): in Deep Cold pair / group members gather to sleep together - she lies down beside the nearest one (once a night)
      if (!go && n.energy > 0 && G.Climate.seasonIndex(sim.tick) === p.warmth.gatherSeason && !G.Family.guardian(sim, a)) {
        if (G.Climate.bondNear(sim, a)) a.shelterNight = night;
        else if (a.gatherNight !== night) { a.gatherNight = night; let best = null, bd = 1e9;
          for (const q of sim.agents) if (G.Climate.bonded(a, q) && !G.Family.isChild(q)) { const d = Math.hypot(q.pos.x - a.pos.x, q.pos.y - a.pos.y); if (d < bd) { bd = d; best = q; } }
          if (best && G.Family.goBeside(sim, a, best, "beside")) { const St = sim.famStats; if (St) St.gathers = (St.gathers || 0) + 1; move(sim, a); return; } } }
      // step 20: a child lies down beside her guardian; while the guardian is still up she stays close and waits (until she is nearly spent);
      // once the guardian lies down she goes beside them. There she skips the cold shelter too.
      const gd = G.Family.guardian(sim, a), K = G.data.config.child;
      if (!go && gd && n.energy > 0) {
        const dg = Math.max(Math.abs(Math.round(gd.pos.x) - Math.round(a.pos.x)), Math.abs(Math.round(gd.pos.y) - Math.round(a.pos.y)));
        if (dg > 1 && G.Family.goBeside(sim, a, gd, "beside")) { move(sim, a); return; }
        if (gd.act.type !== "sleep" && n.energy > K.waitEnergy) { if (Math.hypot(gd.pos.x - a.pos.x, gd.pos.y - a.pos.y) > K.keepTiles && keepNear(sim, a)) move(sim, a); return; } }
      if (!go && gd && Math.max(Math.abs(Math.round(gd.pos.x) - Math.round(a.pos.x)), Math.abs(Math.round(gd.pos.y) - Math.round(a.pos.y))) <= 1) a.shelterNight = night;
      if (!go && cold && a.shelterNight !== night && n.energy > 0) {
        a.shelterNight = night;
        const skipSeek = H && a.hypo >= 4 && sim.rng.float() >= (H.seekChanceAtDrowsy || 0.12);
        if (!skipSeek && seekWarmth(sim, a)) { move(sim, a); return; }
      }
      if (!go) startSleep(sim, a);
      else { a.topUp = b; G.Sim.log(sim, a.name + (b === "water" ? " goes for a drink before sleep" : " goes for a meal before sleep"), a);
        if (b === "food") a.act = { type: "walk", goal: "food", path: go.p, i: 0, bush: go.id, over: true };   // the bedtime meal counts as overeating
        else if (go.p.length) a.act = { type: "walk", goal: "water", path: go.p, i: 0, water: go.kind }; else startDrink(sim, a, go.kind); }
    }
    else if (act.type === "idle" && (sim.tick >= act.until || childLeft(sim, a))) wander(sim, a);   // step 20: a child left behind gets up
    if (a.act.type === "walk") move(sim, a);
    if (a.act.type === "walk" && a.act.goal === "hunt") G.Hunt.stepStalk(sim, a);
    if (a.act.type === "walk" && a.act.goal === "wolfHunt" && G.WolfFight) G.WolfFight.stepHunt(sim, a);   // v38 (f): close enough to strike, re-path or give up   // step 16: after she moves - close enough to strike, or give up
  };

  G.Agent = Agent;
})(this.GS = this.GS || {});
