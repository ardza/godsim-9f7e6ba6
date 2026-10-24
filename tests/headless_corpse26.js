// Step 26 (save v22) headless tests: corpse choices (leave/drag/bury/burn/eat/ritual),
// Discoveries firsts, lightning Barrage primary-on-tap + scatterTiles 4, warmth equilibrium,
// v21 → v22 migration (corpseFear + crng).
// Called from tests/headless.js; run alone with: node tests/headless_corpse26.js
module.exports = function (G, C, ok, h) {
  const W = G.World, P = G.Powers, Co = G.Corpse, Cl = G.Climate, MD = 1440;
  const { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP, solo } = h;
  const TPM = 1 / C.time.tickGameMinutes;
  const sig = s => JSON.stringify(G.Sim.serialize(s));
  const awake = s => { for (const a of s.agents) if (a.act.type === "sleep") G.Agent.startIdle(s, a); };
  const keep = s => { for (const a of s.agents) { a.needs.water = 100; a.needs.energy = 100; a.needs.fullness = 100; a.needs.warmth = Math.max(a.needs.warmth, 60); } };
  const findTile = (s, test) => {
    for (let y = 2; y < s.world.h - 2; y++) for (let x = 2; x < s.world.w - 2; x++) if (test(x, y)) return { x, y };
    return null;
  };
  const placeBody = (s, a, x, y) => {
    const b = G.Body.create(s, a, "cold");
    b.x = x; b.y = y; b.stage = "fresh"; b.flesh = 100; b.stageAt = s.tick;
    s.bodies.push(b);
    // remove living person so we can reuse her as actor elsewhere — caller manages agents
    return b;
  };
  const giveFlint = (s, a, x, y) => {
    const it = G.Items.create(s, "flint", x, y);
    s.items.push(it); a.carry = it.id; it.heldBy = a.id; return it;
  };
  const giveStick = (s, a, x, y, lit) => {
    const it = G.Items.create(s, "stick", x, y);
    if (lit) it.lit = s.tick + 500;
    s.items.push(it); a.carry = it.id; it.heldBy = a.id; return it;
  };

  // ---- config / art / modules ----
  const Cc = C.corpse, art = G.data.art, L = C.powers.lightning;
  ok(C.saveVersion === 23 && Co && typeof Co.maybe === "function" && typeof Cl.warmthEq === "function" &&
    Cc && Cc.dragMaxTiles === 8 && Cc.foundersFear.join() === "40,70" && Cc.ritualFaithMin === 50 &&
    L.modes.barrage.scatterTiles === 4 && L.modes.barrage.count.join() === "2,3" &&
    art.burial && art.burial.cols.join() === "mound_fresh,mound_settled,cairn,dug" &&
    art.pyre && art.pyre.cols.join() === "unlit,burning,ash" &&
    art.ashBones && art.ashBones.cols.join() === "ash_over_bones,ash_with_bone_flecks" &&
    C.person.warmth.eqPerC === 2.5 && C.person.warmth.eqAtNeutral === 50 &&
    C.learn.actions.leave && C.learn.actions.bury && C.learn.actions.ritual,
    "26 config: save v22; corpse + burial/pyre/ashBones art; Barrage scatter 4; warmth eqPerC 2.5",
    "eqK=" + C.person.warmth.eqPerC + " scatter=" + L.modes.barrage.scatterTiles);

  // warmthEq curve: ~61°F (~16.1°C) → ~65; 32°F (0°C) → 25; clamp
  { const eq = c => Cl.warmthEq(c);
    const e61 = eq((61 - 32) * 5 / 9), e32 = eq(0), eHot = eq(40), eCold = eq(-30);
    ok(Math.abs(e61 - 65) < 1.5 && Math.abs(e32 - 25) < 0.1 && eHot === 100 && eCold === 0,
      "26 warmthEq: 61°F→~65, 32°F→25, clamps 0/100",
      "61°F eq=" + e61.toFixed(1) + " 32°F eq=" + e32.toFixed(1) + " hot=" + eHot + " cold=" + eCold);
  }

  // founders corpseFear 40-70 via crng; excluded from traitSpread roll
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(7);
    const fears = s.agents.map(a => a.traits.corpseFear);
    ok(s.crng && typeof s.crng.s === "number" && s.corpseStats && fears.length === s.agents.length &&
      fears.every(f => Number.isInteger(f) && f >= 40 && f <= 70),
      "26 founders: corpseFear 40–70 from crng; corpseStats present",
      fears.join(","));
  });

  // leave: high corpseFear → leave choice; Discoveries first
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(11); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    const actor = s.agents[0], victim = s.agents[1];
    const soft = findTile(s, (x, y) => Co.soft(s, x, y) && W.tile(s.world, x, y) === G.data.T.MEADOW);
    victim.pos.x = soft.x; victim.pos.y = soft.y;
    G.Sim.die(s, victim, "cold");
    const b = s.bodies.find(q => q.of === victim.id);
    actor.pos.x = soft.x + 1; actor.pos.y = soft.y; actor.traits.corpseFear = 95; actor.traits.curiosity = 20;
    actor.corpseAt = -1e9; G.Agent.startIdle(s, actor);
    // force approach roll by bumping approachChance
    const oldA = C.corpse.approachChance; C.corpse.approachChance = 1;
    let left = false;
    for (let i = 0; i < 40 && !left; i++) {
      keep(s); actor.needs.fullness = 100; Co.maybe(s, actor);
      if (s.corpseStats.leave > 0 || s.log.some(e => /leaves .* body where it lies/.test(e.text))) left = true;
      else G.Sim.step(s);
    }
    C.corpse.approachChance = oldA;
    const disc = s.discoveries.find(d => d.key && /leave/.test(d.key) && /corpse/.test(d.key));
    ok(left && b && !b.burial && s.corpseStats.leave >= 1 && disc,
      "26 leave: high corpseFear → leaves body; Discoveries first leave",
      "leave=" + s.corpseStats.leave + " disc=" + (disc && disc.key));
  });

  // bury: sharp flint + soft ground → burial mound; skipDecay; Discoveries
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(13); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    const actor = s.agents[0], victim = s.agents[1];
    const soft = findTile(s, (x, y) => Co.soft(s, x, y));
    G.Sim.die(s, victim, "cold");
    const b = s.bodies.find(q => q.of === victim.id);
    b.x = soft.x; b.y = soft.y;
    actor.pos.x = soft.x; actor.pos.y = soft.y; actor.traits.corpseFear = 10; actor.traits.curiosity = 90;
    giveFlint(s, actor, soft.x, soft.y);
    ok(Co.digTool(G.Items.held(s, actor)) && Co.soft(s, b.x, b.y), "26 bury setup: sharp flint + soft ground");
    // drive bury directly
    actor.act = { type: "idle", until: s.tick + 1, goal: "corpse", body: b.id, choice: "bury" };
    Co.arrive(s, actor);
    ok(actor.act.type === "dig" && b.burial && b.burial.stage === "dug", "26 bury: dig starts (dug stage)");
    const n = actor.act.n;
    for (let i = 0; i < n + 2; i++) { if (actor.act.type === "dig") Co.stepDig(s, actor); else break; }
    const fr = Co.frame(b);
    ok(b.burial && b.burial.stage === "mound_fresh" && b.flesh === 0 && b.bonesLeft === 0 && Co.skipDecay(b) &&
      fr && fr.sheet === "burial" && fr.col === "mound_fresh" && s.corpseStats.bury >= 1 &&
      s.discoveries.some(d => /bury/.test(d.key)),
      "26 bury: mound_fresh, flesh/bones locked, skipDecay, Discoveries",
      "stage=" + (b.burial && b.burial.stage) + " frame=" + (fr && fr.sheet + "/" + fr.col));
  });

  // burn: lit stick → pyre burning → ash_bones; skipDecay while burning
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(17); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    const actor = s.agents[0], victim = s.agents[1];
    const soft = findTile(s, (x, y) => Co.soft(s, x, y));
    G.Sim.die(s, victim, "cold");
    const b = s.bodies.find(q => q.of === victim.id);
    b.x = soft.x; b.y = soft.y;
    actor.pos.x = soft.x; actor.pos.y = soft.y; actor.traits.corpseFear = 5; actor.traits.curiosity = 95;
    giveStick(s, actor, soft.x, soft.y, true);
    actor.act = { type: "idle", until: s.tick + 1, goal: "corpse", body: b.id, choice: "burn" };
    Co.arrive(s, actor);
    ok(b.pyre && b.pyre.stage === "burning" && Co.skipDecay(b) && s.corpseStats.burn >= 1,
      "26 burn: lit stick → pyre burning; skipDecay", "pyre=" + (b.pyre && b.pyre.stage));
    // advance burn minutes
    const burnMin = Cc.pyreBurnMinutes || 60;
    b.pyre.stageAt = s.tick - burnMin;
    Co.step(s);
    const fr = Co.frame(b);
    ok(b.pyre.stage === "ash" && b.burned && b.stage === "bones" && fr && fr.sheet === "ashBones" &&
      s.discoveries.some(d => /burn/.test(d.key)),
      "26 burn: ash → ashBones art; Discoveries burn",
      "ashFrame=" + b.ashFrame + " sheet=" + (fr && fr.sheet));
  });

  // eat: raw flesh → fullness up; may sicken; Discoveries
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, { "corpse.sickChance.raw": 1 }), () => {
    const s = G.Sim.create(19); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    const actor = s.agents[0], victim = s.agents[1];
    const soft = findTile(s, (x, y) => Co.soft(s, x, y));
    G.Sim.die(s, victim, "cold");
    const b = s.bodies.find(q => q.of === victim.id);
    b.x = soft.x; b.y = soft.y; b.flesh = 100; b.stage = "fresh";
    actor.pos.x = soft.x; actor.pos.y = soft.y; actor.needs.fullness = 20; actor.needs.energy = 80;
    actor.traits.corpseFear = 5; actor.traits.curiosity = 95;
    actor.act = { type: "idle", until: s.tick + 1, goal: "corpse", body: b.id, choice: "eat" };
    Co.arrive(s, actor);
    ok(actor.act.type === "eatCorpse", "26 eat: eatCorpse act starts");
    const n = actor.act.n, e0 = actor.needs.energy;
    for (let i = 0; i < n + 2; i++) { if (actor.act.type === "eatCorpse") Co.stepEat(s, actor); else break; }
    ok(actor.needs.fullness > 20 && b.flesh < 100 && s.corpseStats.eat >= 1 && s.corpseStats.sick >= 1 &&
      s.discoveries.some(d => /eat/.test(d.key)) && s.log.some(e => /feels sick/.test(e.text)),
      "26 eat: fullness up, flesh down, sickness (forced), Discoveries",
      "full=" + actor.needs.fullness.toFixed(0) + " flesh=" + b.flesh + " energy " + e0 + "→" + actor.needs.energy);
  });

  // ritual: faith ≥ 50 + known form → pray at body; faith up, corpseFear down
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(23); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    const actor = s.agents[0], victim = s.agents[1];
    const soft = findTile(s, (x, y) => Co.soft(s, x, y));
    G.Sim.die(s, victim, "cold");
    const b = s.bodies.find(q => q.of === victim.id);
    b.x = soft.x; b.y = soft.y;
    actor.pos.x = soft.x; actor.pos.y = soft.y;
    actor.traits.faith = 60; actor.traits.corpseFear = 50; actor.traits.curiosity = 80;
    actor.prayForms = { "kneel+raise": { n: 2, like: 1, gen: 0 } };
    const fear0 = actor.traits.corpseFear, faith0 = actor.traits.faith;
    actor.act = { type: "idle", until: s.tick + 1, goal: "corpse", body: b.id, choice: "ritual" };
    Co.arrive(s, actor);
    ok(actor.act.type === "pray" && actor.act.corpse === b.id && actor.traits.faith > faith0 &&
      actor.traits.corpseFear < fear0 && s.corpseStats.ritual >= 1 &&
      s.discoveries.some(d => /ritual/.test(d.key)),
      "26 ritual: pray at body; faith↑ corpseFear↓; Discoveries",
      "faith " + faith0 + "→" + actor.traits.faith + " fear " + fear0 + "→" + actor.traits.corpseFear);
  });

  // drag: ≤ dragMaxTiles
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(29); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    const actor = s.agents[0], victim = s.agents[1];
    const soft = findTile(s, (x, y) => Co.soft(s, x, y) && Co.soft(s, x + 3, y));
    G.Sim.die(s, victim, "cold");
    const b = s.bodies.find(q => q.of === victim.id);
    b.x = soft.x; b.y = soft.y;
    actor.pos.x = soft.x; actor.pos.y = soft.y; actor.traits.corpseFear = 5; actor.traits.curiosity = 95;
    actor.act = { type: "idle", until: s.tick + 1, goal: "corpse", body: b.id, choice: "drag" };
    Co.arrive(s, actor);
    const dest = actor.act.type === "walk" ? { x: actor.act.path && actor.act.path.length ? actor.act.path[actor.act.path.length - 1] : null } : null;
    const dx = dest && dest.x ? Math.hypot((Array.isArray(dest.x) ? dest.x[0] : actor.act.x) - b.x, (Array.isArray(dest.x) ? dest.x[1] : actor.act.y) - b.y) : null;
    // walkTo sets path — measure intended from act
    let distOk = false, walked = false;
    if (actor.act.type === "walk" && actor.act.goal === "drag") {
      walked = true;
      const path = actor.act.path || [];
      const end = path.length ? path[path.length - 1] : [Math.round(actor.pos.x), Math.round(actor.pos.y)];
      const ex = Array.isArray(end) ? end[0] : end.x, ey = Array.isArray(end) ? end[1] : end.y;
      distOk = Math.hypot(ex - b.x, ey - b.y) <= (Cc.dragMaxTiles || 8) + 1e-9;
      // finish drag by teleporting arrival
      actor.pos.x = ex; actor.pos.y = ey; actor.act = { type: "idle", until: s.tick, goal: "drag", body: b.id };
      Co.arriveDrag(s, actor);
    }
    ok(walked && distOk && b.x === Math.round(actor.pos.x) && s.corpseStats.drag >= 1 &&
      s.discoveries.some(d => /drag/.test(d.key)),
      "26 drag: body moved ≤ dragMaxTiles; Discoveries",
      "to " + b.x + "," + b.y + " drag=" + s.corpseStats.drag);
  });

  // lightning: Single on tap; Barrage primary on tap + extras ≤ scatterTiles 4
  withCfg(Object.assign({}, NO_LIGHTNING, { "powers.lightning.fire.dry": 0 }), () => {
    const s = G.Sim.create(31); s.agents.length = 0; s.animals = [];
    const c = findTile(s, (x, y) => W.walkable(s.world, x, y) && P.ground(s, x, y) !== "water" && x > 8 && y > 8 && x < s.world.w - 9);
    const rS = P.cast(s, "lightning", c.x, c.y, "single");
    s.fx = []; s.fire = {};
    const rB = P.cast(s, "lightning", c.x, c.y, "barrage");
    const bolts = (rB.bolts || []).map(e => [e.x, e.y]);
    const R = L.modes.barrage.scatterTiles;
    const primary = bolts[0] && bolts[0][0] === c.x && bolts[0][1] === c.y;
    const inR = bolts.every(([x, y]) => Math.hypot(x - c.x, y - c.y) <= R + 1e-9);
    ok(rS.ok && rB.ok && primary && bolts.length >= 2 && bolts.length <= 3 && inR && R === 4,
      "26 lightning: Single on tap; Barrage primary on tap + extras within r4",
      "barrage " + bolts.map(q => q.join(",")).join(" / "));
  });

  // migrate21 → 22: corpseFear seeded, crng, corpseStats; round-trip
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(37); for (let i = 0; i < 10; i++) G.Sim.step(s);
    const j = sig(s), r = G.Sim.deserialize(JSON.parse(j));
    const o = JSON.parse(j); o.version = 21; delete o.crng; delete o.corpseStats;
    for (const a of o.agents) if (a.traits) delete a.traits.corpseFear;
    const m = G.Sim.deserialize(o);
    const fears = m.agents.map(a => a.traits.corpseFear);
    ok(JSON.parse(j).version === 23 && sig(s) === sig(r) && m.version === 23 && m.crng && m.corpseStats &&
      fears.every(f => Number.isInteger(f) && f >= 40 && f <= 70) &&
      r.agents.every(a => a.traits.corpseFear != null),
      "26 save: v22 round-trip; v21→v22 seeds corpseFear + crng + corpseStats",
      "fears " + fears.join(","));
  });

  // warmth eq live: mild open-air mean settles 55–75; same air °F + different felt bonuses → different warmth
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, {
    "climate.seasonMeanC": [16, 16, 16, 16], "climate.dayAmpC": 0
  }), () => {
    // air fixed at 16°C ≈ 61°F → eq open ≈ 65
    const s = G.Sim.create(41); s.agents = s.agents.slice(0, 2); s.animals = []; s.fire = {};
    const a = s.agents[0], b = s.agents[1];
    const open = findTile(s, (x, y) => W.tile(s.world, x, y) === G.data.T.MEADOW && W.walkable(s.world, x, y));
    a.pos.x = open.x; a.pos.y = open.y; a.act = { type: "idle", until: s.tick + 1e9 };
    b.pos.x = open.x + 20; b.pos.y = open.y; b.act = { type: "idle", until: s.tick + 1e9 }; // far — no huddle
    a.needs.warmth = 50; b.needs.warmth = 50;
    // noon-ish so sunC applies; darkness low
    s.tick = 8 * 60; // relative; airC uses startMinute + tick
    const air = Cl.airC(s.tick), eqA0 = Cl.warmthEq(Cl.felt(s, a).c);
    let sum = 0, n = 0;
    for (let i = 0; i < 6 * MD; i++) {
      a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = 100;
      b.needs.fullness = 100; b.needs.water = 100; b.needs.energy = 100;
      G.Sim.step(s);
      if (i > 2 * MD && i % 10 === 0) { sum += a.needs.warmth; n++; }
    }
    const mean = sum / n;
    // same air, raise felt for a via huddle: put b next to a and re-eq
    const feltOpen = Cl.felt(s, a).c, eqOpen = Cl.warmthEq(feltOpen);
    b.pos.x = a.pos.x; b.pos.y = a.pos.y;
    const feltHud = Cl.felt(s, a).c, eqHud = Cl.warmthEq(feltHud);
    // fire heat bonus
    s.fire[Math.round(a.pos.x) + "," + Math.round(a.pos.y)] = { s: "fire", since: s.tick, heat: 25 };
    // Fire.heatAt may read differently — bump via felt
    const feltFire = Cl.felt(s, a).c, eqFire = Cl.warmthEq(feltFire);
    ok(air > 14 && air < 18 && eqA0 > 55 && eqA0 < 75 && mean >= 55 && mean <= 75 &&
      eqHud > eqOpen && (eqFire > eqOpen || feltFire > feltOpen),
      "26 warmth live: mild open-air mean 55–75; same air + huddle/fire → higher eq",
      "air " + air.toFixed(1) + "°C meanW " + mean.toFixed(1) + " eqOpen " + eqOpen.toFixed(1) +
      " eqHud " + eqHud.toFixed(1) + " eqFire " + eqFire.toFixed(1) + " feltΔ " + (feltHud - feltOpen).toFixed(1));
  });

  // Director v22 rain→warmth: per-strength chillC on felt × exposure; Medium at ~61°F → eq ≤ 50; never climb from rain
  {
    const R = C.powers.rain.strengths;
    ok(R.light.chillC === 3 && R.medium.chillC === 6 && R.heavy.chillC === 10 && !("chillC" in C.powers.rain),
      "26 rain chillC: Light 3 / Medium 6 / Heavy 10 (no flat chillC)",
      [R.light.chillC, R.medium.chillC, R.heavy.chillC].join("/"));
  }
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, {
    "climate.seasonMeanC": [16, 16, 16, 16], "climate.dayAmpC": 0,
    "powers.rain.coverChance": 0, "powers.rain.faceChance": 0
  }), () => {
    const s = G.Sim.create(41), a = solo(s); s.animals = []; s.fire = {};
    // night: no sun either way so dry open felt ≈ air (~16°C → eq ≈ 65)
    s.tick = 3 * 28 * MD / 4; while (G.Time.darkness(s.tick) < 1) s.tick++;
    const open = findTile(s, (x, y) => W.tile(s.world, x, y) === G.data.T.MEADOW && W.walkable(s.world, x, y));
    a.pos.x = open.x; a.pos.y = open.y; a.act = { type: "idle", until: s.tick + 1e9 };
    a.needs.warmth = 65; a.traits.coldFear = 0;
    const air = Cl.airC(s.tick);
    const dryFelt = Cl.felt(s, a), dryEq = Cl.warmthEq(dryFelt.c);
    P.cast(s, "rain", open.x, open.y, "medium");
    s.powers.effects[0].r = 60;
    const wetFelt = Cl.felt(s, a), wetEq = Cl.warmthEq(wetFelt.c);
    const wrWet = Cl.warmthRate(wetFelt.c, 65);
    // also step once: warmth must fall
    const w0 = a.needs.warmth; a.act = { type: "idle", until: s.tick + 5 }; G.Agent.step(s, a);
    const fell = a.needs.warmth < w0;
    ok(air > 14 && air < 18 && dryEq >= 60 && dryEq <= 70 && wetEq <= 50 && (dryEq - wetEq) >= 10 &&
      wetFelt.wet === 1 && wrWet < 0 && fell && wetFelt.c < dryFelt.c,
      "26 rain→warmth: same air, Medium vs dry → eq lower by ≥10 (wet eq ≤50); warmth falling in the rain",
      "air " + air.toFixed(1) + "°C dryEq " + dryEq.toFixed(1) + " wetEq " + wetEq.toFixed(1) +
      " Δeq " + (dryEq - wetEq).toFixed(1) + " wr " + wrWet.toFixed(4) + " w " + w0.toFixed(1) + "→" + a.needs.warmth.toFixed(1));
  });

  // index.html loads corpse.js at ?v=saveVersion
  { const html = require("fs").readFileSync(require("path").join(__dirname, "../index.html"), "utf8");
    ok(html.indexOf("src/corpse.js?v=" + C.saveVersion) >= 0,
      "26 index: corpse.js?v=" + C.saveVersion, "ok"); }
};

if (require.main === module) {
  const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
  const src = fs.readFileSync(path.join(__dirname, "headless.js"), "utf8");
  const list = JSON.parse(src.match(/for \(const f of (\[[^\]]+\])\)/)[1]);
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of list) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  const G = ctx.GS, C = G.data.config; let fails = 0;
  const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };
  function withCfg(patch, fn) {
    const old = {};
    for (const k in patch) { const ps = k.split("."); let o = C; for (const q of ps.slice(0, -1)) o = o[q]; old[k] = [o, ps.at(-1), o[ps.at(-1)]]; o[ps.at(-1)] = patch[k]; }
    try { return fn(); } finally { for (const k in old) { const [o, f, v] = old[k]; o[f] = v; } }
  }
  const NO_LIGHTNING = { "fire.lightning.perSeason": [0, 0, 0, 0] };
  const NO_THIRST_SLEEP = { "person.water.minutesFullToThirsty": 1e15, "person.energy.drainMinutes": 1e15, "person.energy.nightFrom": 1440 };
  const solo = s => { const a = s.agents[0]; s.agents = [a]; return a; };
  module.exports(G, C, ok, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP, solo });
  console.log(fails ? "CORPSE26 FAILED (" + fails + ")" : "CORPSE26 PASSED");
  process.exit(fails ? 1 : 0);
}
