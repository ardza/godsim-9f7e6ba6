// Step 29 Tools (save v26): lock useful strike/cut/rub/bind outcomes as carried tools when Learn score ≥45.
// Tools: flake (sharp rock/bone/flint), crude axe/hoe (stick + sharp bound by reed or friction-fit), long stick (reach/poke).
// §37 / v34: hard tip — strike ore|flint onto stick|bone → tip_stick / tip_bone (same scoreMin craft lock).
// Durability from hardness; dulls with use → lose bonus, then break to junk. First craft → Discoveries. Own helpers; rolls use orng/lrng.
// Action-only logs. Overlay sheets: tools_16 + tip_stick_16 / tip_bone_16 / tip_16.
(function (G) {
  const CF = () => G.data.config, TC = () => CF().tools || {}, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;
  const Tools = {};

  Tools.newStats = () => ({ crafts: 0, byType: {}, binds: 0, friction: 0, vine: 0, dulls: 0, breaks: 0, chops: 0, pokes: 0, reaches: 0 });
  Tools.init = function (sim) {
    sim.toolStats = Tools.newStats();
  };
  Tools.ensure = function (sim) {
    if (!sim.toolStats) sim.toolStats = Tools.newStats();
    return sim.toolStats;
  };

  Tools.type = it => (it && it.tool) || null;
  Tools.is = (it, t) => Tools.type(it) === t;
  Tools.isTool = it => !!Tools.type(it);
  Tools.labels = { flake: "sharp flake", axe: "crude axe", spear: "long stick", tip_stick: "hard tip", tip_bone: "hard tip" };
  Tools.labelOf = it => {
    const t = Tools.type(it); if (!t) return null;
    const base = Tools.labels[t] || t;
    if (it.props && it.props.durability != null && it.props.durability <= (TC().dullBelow != null ? TC().dullBelow : 15))
      return "dull " + base;
    return base;
  };

  Tools.scoreMin = () => TC().scoreMin != null ? TC().scoreMin : 45;
  Tools.scoreOk = function (a, keys) {
    const min = Tools.scoreMin();
    for (const k of keys) if (G.Learn.score(a, k) >= min - 1e-9) return true;
    return false;
  };
  Tools.craftGain = (key) => {
    const g = TC().gain || {};
    return g[key] != null ? g[key] : (TC().craftGain != null ? TC().craftGain : 12);
  };

  // Sharp rock / bone / flint piece that can lock as a flake
  Tools.canFlake = function (it) {
    if (!it || it.tool || it.lit || it.material === "meat") return false;
    const mats = (TC().flake && TC().flake.materials) || ["rock", "flint", "bone"];
    if (mats.indexOf(it.material) < 0) return false;
    return G.Items.sharp(it);
  };
  // Whole stick that can lock as a long stick
  Tools.canSpear = function (it) {
    if (!it || it.tool || it.lit || it.form === "shard" || it.form === "arrow") return false;   // v39: an arrow is not a long stick
    return it.material === "stick";
  };
  Tools.isTipPoint = function (it) {
    if (!it || it.lit || it.tool || it.material === "meat") return false;
    const mats = (TC().tip && TC().tip.points) || ["ore", "flint"];
    return mats.indexOf(it.material) >= 0;
  };
  Tools.isTipShaft = function (it) {
    if (!it || it.lit || it.form === "shard") return false;
    if (it.tool && !Tools.is(it, "spear")) return false;   // plain stick/bone or long stick OK
    if (it.form === "arrow" && it.tip) return false;   // v39: an arrow takes one tip
    const mats = (TC().tip && TC().tip.shafts) || ["stick", "bone"];
    return mats.indexOf(it.material) >= 0;
  };
  Tools.isSharpHead = function (it) {
    if (!it || it.lit || it.material === "meat") return false;
    const mats = (TC().axe && TC().axe.head) || ["rock", "flint", "bone"];
    return mats.indexOf(it.material) >= 0 && G.Items.sharp(it);
  };
  // v39: a binder is a reed or a cord (fiber form cord); tools.binders names them ("cord" stands for any fiber cord)
  Tools.binderName = it => !it ? null : (it.material === "fiber" && it.form === "cord") ? "cord" : it.material;
  Tools.isBinder = it => !!it && !it.lit && !it.wornBy && !it.tool && !it.soaked && ((TC().binders) || ["reed"]).indexOf(Tools.binderName(it)) >= 0 && (it.material !== "fiber" || it.form === "cord");
  Tools.isStickPart = function (it) {
    return !!(it && !it.lit && it.material === "stick" && it.form !== "shard" && it.form !== "arrow" && !it.tool);
  };

  Tools.digOk = function (it) {
    if (!it) return false;
    if (Tools.is(it, "flake") || Tools.is(it, "axe") || Tools.isTip(it)) return Tools.bonusLive(it);
    return false;
  };
  Tools.isTip = it => Tools.is(it, "tip_stick") || Tools.is(it, "tip_bone");
  Tools.tipTypeFor = shaft => shaft && shaft.material === "bone" ? "tip_bone" : "tip_stick";
  Tools.bonusLive = function (it) {
    if (!it || !it.tool) return false;
    const below = TC().dullBelow != null ? TC().dullBelow : 15;
    return (it.props.durability == null ? 100 : it.props.durability) > below;
  };
  // dig minutes multiplier (<1 = faster)
  Tools.digMult = function (it) {
    if (!Tools.bonusLive(it)) return 1;
    if (Tools.is(it, "axe")) return (TC().axe && TC().axe.digMult) != null ? TC().axe.digMult : 0.5;
    if (Tools.isTip(it)) return (TC().tip && TC().tip.digMult) != null ? TC().tip.digMult : 0.55;
    if (Tools.is(it, "flake")) return (TC().flake && TC().flake.digMult) != null ? TC().flake.digMult : 0.7;
    return 1;
  };
  Tools.cutMult = function (it) {
    if (!Tools.bonusLive(it)) return 1;
    if (Tools.is(it, "flake")) return (TC().flake && TC().flake.cutMult) != null ? TC().flake.cutMult : 0.6;
    if (Tools.isTip(it)) return (TC().tip && TC().tip.cutMult) != null ? TC().tip.cutMult : 0.65;
    if (Tools.is(it, "axe")) return (TC().axe && TC().axe.cutMult) != null ? TC().axe.cutMult : 0.8;
    return 1;
  };
  Tools.huntOddsAdd = function (it) {
    if (!Tools.isTip(it) || !Tools.bonusLive(it)) return 0;
    const tip = TC().tip || {}, H = CF().hunt, O = (H && H.odds) || {};
    if (tip.huntOddsAdd != null) return tip.huntOddsAdd;
    return O.tip != null ? O.tip : 0.25;
  };
  Tools.reachTiles = function (sim, a) {
    const it = G.Items.held(sim, a);
    if (!Tools.is(it, "spear") || !Tools.bonusLive(it)) return 0;
    if (G.Injury && !G.Injury.canUseTools(a)) return 0;   // §40: broken arm, no spear reach
    return (TC().spear && TC().spear.reachTiles) != null ? TC().spear.reachTiles : 2;
  };

  function bump(sim, type) {
    const S = Tools.ensure(sim); S.crafts++; S.byType[type] = (S.byType[type] || 0) + 1;
  }

  Tools.lock = function (sim, a, it, type, how) {
    if (!it || it.tool === type) return null;
    it.tool = type;
    // durability from hardness (data-driven); keep existing if already set high enough
    const hard = it.props.hardness != null ? it.props.hardness : 50;
    const base = Math.round(hard * (TC().durFromHardness != null ? TC().durFromHardness : 1));
    it.props.durability = clamp(Math.max(it.props.durability || 0, base), 1, 100);
    it.craftedAt = sim.tick; it.craftedBy = a ? a.id : null;
    bump(sim, type);
    if (a) {
      a.stats = a.stats || {}; a.stats.crafts = (a.stats.crafts || 0) + 1;
      const lab = Tools.labels[type] || type;
      const keep =
        type === "spear" ? "a long stick" :
        type === "axe" ? "a crude axe" :
        Tools.isTip({ tool: type }) ? "a hard tip" :
        "a sharp flake";
      G.Sim.log(sim, a.name + " keeps " + keep + " ready", a);
      const d = G.Discoveries.note(sim, a, "craft", [lab], how || ("made " + lab));
      if (d) d.title = (Tools.isTip({ tool: type }) ? "First hard tip" : ("First " + lab));
      const key = type === "axe" ? "bind" : (how && how.indexOf("cut") >= 0 ? "cut" : "strike");
      const e = G.Learn.add(a, key, Tools.craftGain(key)); e.n = (e.n || 0) + 1;
      G.Learn.success(sim, a, key);
    }
    return it;
  };

  // After a physics try: raise strike/cut/rub score; maybe lock tip / flake / long stick
  Tools.onTry = function (sim, a, action, held, target, outcome) {
    if (!a || !action) return;
    Tools.ensure(sim);
    const gain = Tools.craftGain(action);
    if (outcome && outcome.results && outcome.results.length) {
      const e = G.Learn.add(a, action, gain); e.n = (e.n || 0) + 1;
      G.Learn.success(sim, a, action);
    } else {
      G.Learn.add(a, action, -(TC().missDrop != null ? TC().missDrop : 1));
    }
    if (!Tools.scoreOk(a, [action, "strike", "cut", "rub"])) return;
    // §37: strike ore|flint onto stick|bone → hard tip (consumes point)
    if (action === "strike" && held && target && Tools.tryTip(sim, a, held, target, action + " tip")) return;
    // sharp shard / flint → flake
    const check = (piece, side) => {
      if (!Tools.canFlake(piece)) return;
      if (outcome && (outcome.broke === side || outcome.sharpened && side === "held" || G.Items.sharp(piece)))
        Tools.lock(sim, a, piece, "flake", action + " edge");
    };
    if (held) check(held, "held");
    if (target) check(target, "target");
    // whole stick involved → long stick
    if (held && Tools.canSpear(held)) Tools.lock(sim, a, held, "spear", action + " stick");
    else if (target && Tools.canSpear(target) && !target.heldBy) Tools.lock(sim, a, target, "spear", action + " stick");
  };

  // Fuse ore/flint point onto stick/bone shaft → tip_stick / tip_bone. Returns true if crafted.
  Tools.tryTip = function (sim, a, aIt, bIt, how) {
    if (!aIt || !bIt || aIt === bIt) return false;
    let point = null, shaft = null;
    if (Tools.isTipPoint(aIt) && Tools.isTipShaft(bIt)) { point = aIt; shaft = bIt; }
    else if (Tools.isTipPoint(bIt) && Tools.isTipShaft(aIt)) { point = bIt; shaft = aIt; }
    else return false;
    if (Tools.isTip(shaft)) return false;
    return !!Tools.finishTip(sim, a, shaft, point, how || "strike tip");
  };

  Tools.finishTip = function (sim, a, shaft, point, how) {
    if (!shaft || !point || !Tools.scoreOk(a, ["strike", "cut", "rub", "bind"])) return null;
    if (shaft.form === "arrow" && G.Bow) return G.Bow.tipArrow(sim, a, shaft, point, how);   // v39: the v34 tip rule on an arrow -> tipped arrow (no tool lock)
    const type = Tools.tipTypeFor(shaft);
    const hard = Math.round(Math.max(shaft.props.hardness || 25, point.props.hardness || 80));
    const sharp = Math.max(shaft.props.sharpness || 0, point.props.sharpness || 0, 40);
    shaft.props.hardness = hard;
    shaft.props.sharpness = sharp;
    shaft.props.durability = clamp(Math.round(hard * (TC().durFromHardness != null ? TC().durFromHardness : 1)), 1, 100);
    shaft.form = "whole";
    shaft.tool = type;
    shaft.tippedWith = point.material;
    shaft.craftedAt = sim.tick; shaft.craftedBy = a ? a.id : null;
    // consume point
    if (point.heldBy) {
      const h = sim.agents.find(q => q.id === point.heldBy);
      if (h) { h.carry = null; h.carryUntil = null; }
    }
    const pi = sim.items.indexOf(point); if (pi >= 0) sim.items.splice(pi, 1);
    // ensure shaft in hand
    if (a && shaft.heldBy !== a.id) {
      if (a.carry != null) G.Items.drop(sim, a);
      shaft.heldBy = a.id; shaft.x = Math.round(a.pos.x); shaft.y = Math.round(a.pos.y);
      a.carry = shaft.id; a.carryUntil = sim.tick + sim.orng.int(CF().objects.carry[0], CF().objects.carry[1]);
    }
    bump(sim, type);
    if (a) {
      a.stats = a.stats || {}; a.stats.crafts = (a.stats.crafts || 0) + 1;
      G.Sim.log(sim, a.name + " strikes a hard tip onto the " + G.Items.matLabel(shaft).replace(/^broken /, ""), a);
      const d = G.Discoveries.note(sim, a, "craft", ["hard tip"], how || (point.material + " on " + shaft.material));
      if (d) d.title = "First hard tip";
      const e = G.Learn.add(a, "strike", Tools.craftGain("strike")); e.n = (e.n || 0) + 1;
      G.Learn.success(sim, a, "strike");
    }
    return shaft;
  };

  // Idle: holding one part + the other in reach → try bind into axe
  Tools.maybeBind = function (sim, a) {
    const C = TC(); if (!C || a.carry == null) return false;
    if (G.Family && G.Family.isChild(a)) return false;
    const cool = Math.round((C.bindCooldown != null ? C.bindCooldown : 360) / TM());
    if (sim.tick - (a.lastBind == null ? -1e9 : a.lastBind) < cool) return false;
    const held = G.Items.held(sim, a); if (!held || held.lit || held.material === "meat") return false;
    const stickHeld = Tools.isStickPart(held) || Tools.is(held, "spear");
    const headHeld = Tools.isSharpHead(held) || Tools.is(held, "flake");
    if (!stickHeld && !headHeld) return false;
    const R = C.bindReach != null ? C.bindReach : 1.5;
    const ground = sim.items.filter(i => !i.heldBy && !i.lit && Math.hypot(i.x - a.pos.x, i.y - a.pos.y) <= R + 1e-9);
    let stick = stickHeld ? held : ground.find(Tools.isStickPart) || ground.find(i => Tools.is(i, "spear"));
    let head = headHeld ? held : ground.find(Tools.isSharpHead) || ground.find(i => Tools.is(i, "flake"));
    if (!stick || !head || stick === head) return false;
    if (stick.tool === "axe" || head.tool === "axe") return false;
    const chance = (C.bindChance != null ? C.bindChance : 0.55) * (a.traits.curiosity / 50)
      * (G.Moods ? G.Moods.bindMult(a) : 1);
    if (!sim.orng.chance(clamp(chance, 0, 1))) return false;
    a.lastBind = sim.tick;
    // walk onto the ground piece if needed
    const other = held === stick ? head : stick;
    if (other.heldBy == null && (Math.round(a.pos.x) !== other.x || Math.round(a.pos.y) !== other.y)) {
      if (G.Agent.walkTo(sim, a, other.x, other.y, "bind", { stick: stick.id, head: head.id })) return true;
      return false;
    }
    return Tools.startBind(sim, a, stick, head);
  };
  Tools.startBind = function (sim, a, stick, head) {
    const mins = (TC().bindMinutes != null ? TC().bindMinutes : 15);
    a.act = { type: "bind", stick: stick.id, head: head.id, t: 0, n: Math.max(1, Math.round(mins / TM())) };
    G.Sim.log(sim, a.name + " works the " + G.Items.matLabel(head) + " onto the " + G.Items.matLabel(stick), a);
    return true;
  };
  Tools.arriveBind = function (sim, a) {
    const stick = G.Items.byId(sim, a.act.stick), head = G.Items.byId(sim, a.act.head);
    if (!stick || !head) return false;
    return Tools.startBind(sim, a, stick, head);
  };
  Tools.stepBind = function (sim, a) {
    const act = a.act; if (++act.t < act.n) return true;
    const stick = G.Items.byId(sim, act.stick), head = G.Items.byId(sim, act.head);
    if (!stick || !head) return false;
    // binder: reed on the tile / in hand; else friction-fit
    const binders = (TC().binders) || ["reed"];
    const isB = Tools.isBinder;
    let binder = null;
    const held = G.Items.held(sim, a);
    if (held && isB(held) && held !== stick && held !== head) binder = held;
    if (!binder) {
      const R = (TC().bindReach != null ? TC().bindReach : 1.5);
      binder = sim.items.find(i => !i.heldBy && !i.wornBy && isB(i) && i !== stick && i !== head
        && Math.hypot(i.x - a.pos.x, i.y - a.pos.y) <= R + 1e-9) || null;
    }
    const S = Tools.ensure(sim);
    // success needs score ≥45 on bind/strike/cut
    if (!Tools.scoreOk(a, ["bind", "strike", "cut", "rub"])) {
      G.Sim.log(sim, a.name + " cannot make the pieces hold", a);
      G.Learn.add(a, "bind", 2);
      return false;
    }
    // fuse: stick becomes axe in hand; remove head (+ binder)
    const hard = Math.round(((stick.props.hardness || 25) + (head.props.hardness || 70)) / 2);
    const sharp = Math.max(stick.props.sharpness || 0, head.props.sharpness || 0);
    stick.props.hardness = hard;
    stick.props.sharpness = sharp;
    stick.props.durability = clamp(Math.round(hard * (TC().durFromHardness != null ? TC().durFromHardness : 1)), 1, 100);
    stick.form = "whole";
    stick.tool = "axe";
    stick.boundWith = binder ? Tools.binderName(binder) : "friction";
    if (binder && Tools.binderName(binder) === "cord") stick.props.durability = clamp(Math.round(stick.props.durability * ((CF().rope || {}).binderDurX || 1)), 1, 100);   // v39: cord-bound
    stick.craftedAt = sim.tick; stick.craftedBy = a.id;
    // remove head from world
    if (head.heldBy) { const h = sim.agents.find(q => q.id === head.heldBy); if (h) { h.carry = null; h.carryUntil = null; } }
    const hi = sim.items.indexOf(head); if (hi >= 0) sim.items.splice(hi, 1);
    if (binder) {
      if (binder.heldBy) { const h = sim.agents.find(q => q.id === binder.heldBy); if (h) { h.carry = null; h.carryUntil = null; } }
      const bi = sim.items.indexOf(binder); if (bi >= 0) sim.items.splice(bi, 1);
      S.binds++;
    } else S.friction++;
    // ensure axe is in hand
    if (stick.heldBy !== a.id) {
      if (a.carry != null) G.Items.drop(sim, a);
      stick.heldBy = a.id; stick.x = Math.round(a.pos.x); stick.y = Math.round(a.pos.y);
      a.carry = stick.id; a.carryUntil = sim.tick + sim.orng.int(CF().objects.carry[0], CF().objects.carry[1]);
    }
    bump(sim, "axe");
    a.stats = a.stats || {}; a.stats.crafts = (a.stats.crafts || 0) + 1;
    const how = binder ? ("bound with " + binder.material) : "friction-fit";
    G.Sim.log(sim, a.name + " binds a crude axe (" + how + ")", a);
    const d = G.Discoveries.note(sim, a, "craft", ["crude axe"], how);
    if (d) d.title = "First crude axe";
    const e = G.Learn.add(a, "bind", Tools.craftGain("bind")); e.n = (e.n || 0) + 1;
    G.Learn.success(sim, a, "bind");
    return false;
  };

  // Dull / break with use
  Tools.use = function (sim, a, it, kind) {
    if (!it || !it.tool) return;
    Tools.ensure(sim);
    const wear = (TC().dullPerUse != null ? TC().dullPerUse : 3);
    it.props.durability = Math.max(0, (it.props.durability || 0) - wear);
    sim.toolStats.dulls++;
    const below = TC().dullBelow != null ? TC().dullBelow : 15;
    if (it.props.durability <= 0) {
      const was = it.tool; it.tool = null; it.form = "shard";
      sim.toolStats.breaks++;
      if (a) G.Sim.log(sim, a.name + "'s " + (Tools.labels[was] || was) + " breaks", a);
    } else if (it.props.durability <= below && a) {
      // one-shot dull log via clock
      const clk = a.toolLog || (a.toolLog = {});
      if (clk.dull == null || sim.tick - clk.dull > 360) {
        clk.dull = sim.tick;
        G.Sim.log(sim, a.name + "'s " + (Tools.labels[it.tool] || it.tool) + " has dulled", a);
      }
    }
  };

  // Idle: axe near woods → chop (slow) → produce a stick
  Tools.maybeChop = function (sim, a) {
    const C = TC().axe || {}; const it = G.Items.held(sim, a);
    if (!Tools.is(it, "axe") || !Tools.bonusLive(it)) return false;
    if (G.Family && G.Family.isChild(a)) return false;
    const cool = Math.round((C.chopCooldown != null ? C.chopCooldown : 720) / TM());
    if (sim.tick - (a.lastChop == null ? -1e9 : a.lastChop) < cool) return false;
    const chance = (C.chopChance != null ? C.chopChance : 0.25) * a.traits.curiosity / 50;
    if (!sim.orng.chance(clamp(chance, 0, 1))) return false;
    const T = G.data.T, w = sim.world, t = G.Agent.tilePos(a);
    let spot = null;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = t.x + dx, y = t.y + dy;
      if (G.World.inb(w, x, y) && G.World.tile(w, x, y) === T.WOODS) { spot = { x, y }; break; }
    }
    if (!spot) return false;
    a.lastChop = sim.tick;
    const mins = C.chopMinutes != null ? C.chopMinutes : 60;
    a.act = { type: "chop", x: spot.x, y: spot.y, t: 0, n: Math.max(1, Math.round(mins / TM())) };
    G.Sim.log(sim, a.name + " chops at a tree with the crude axe", a);
    return true;
  };
  Tools.stepChop = function (sim, a) {
    const act = a.act, it = G.Items.held(sim, a);
    if (!Tools.is(it, "axe")) { return false; }
    if (++act.t < act.n) return true;
    Tools.use(sim, a, it, "chop");
    const stick = G.Items.create(sim, "stick", act.x, act.y);
    sim.items.push(stick);
    Tools.ensure(sim).chops++;
    G.Sim.log(sim, a.name + " cuts a stick free from the tree", a);
    G.Discoveries.note(sim, a, "chop", ["crude axe", "tree"], "stick");
    return false;
  };

  // Idle: long stick near scavenger → poke (scare)
  Tools.maybePoke = function (sim, a) {
    const C = TC().spear || {}; const it = G.Items.held(sim, a);
    if (!Tools.is(it, "spear") || !Tools.bonusLive(it)) return false;
    if (G.Family && G.Family.isChild(a)) return false;
    const cool = Math.round((C.pokeCooldown != null ? C.pokeCooldown : 180) / TM());
    if (sim.tick - (a.lastPoke == null ? -1e9 : a.lastPoke) < cool) return false;
    const R = C.pokeTiles != null ? C.pokeTiles : 4;
    const dog = (sim.animals || []).find(an => an.species === "scavenger"
      && Math.hypot(an.pos.x - a.pos.x, an.pos.y - a.pos.y) <= R + 1e-9);
    if (!dog) return false;
    const chance = (C.pokeChance != null ? C.pokeChance : 0.4) * a.traits.curiosity / 50;
    if (!sim.orng.chance(clamp(chance, 0, 1))) return false;
    a.lastPoke = sim.tick;
    Tools.use(sim, a, it, "poke");
    Tools.ensure(sim).pokes++;
    // scare: force flee goal away from the person
    dog.act = { type: "walk", goal: "flee", path: null, i: 0, from: a.id };
    // give it a flee target
    const Sp = CF().animals.scavenger, t = { x: Math.round(dog.pos.x), y: Math.round(dog.pos.y) };
    let best = null;
    for (let k = 0; k < 16; k++) {
      const x = t.x + sim.arng.int(-Sp.fleeTo - 2, Sp.fleeTo + 2), y = t.y + sim.arng.int(-Sp.fleeTo - 2, Sp.fleeTo + 2);
      if (!G.World.walkable(sim.world, x, y)) continue;
      const sc = Math.hypot(x - a.pos.x, y - a.pos.y);
      if (!best || sc > best.sc) best = { x, y, sc };
    }
    if (best && G.Animal && G.Animal._walkTo) { /* optional */ }
    if (best) {
      const path = G.World.findPath(sim.world, t.x, t.y, best.x, best.y);
      if (path && path.length) dog.act = { type: "walk", goal: "flee", path, i: 0 };
      else dog.pos = { x: best.x, y: best.y };
    }
    G.Sim.log(sim, a.name + " pokes at a wild dog with the long stick", a);
    return true;
  };

  // Idle curiosity: holding a whole stick with score ≥45 → set it aside as a long stick (if not already)
  Tools.maybeSpear = function (sim, a) {
    const it = G.Items.held(sim, a);
    if (!Tools.canSpear(it)) return false;
    if (!Tools.scoreOk(a, ["strike", "cut", "rub", "bind"])) return false;
    const C = TC().spear || {};
    const chance = (C.readyChance != null ? C.readyChance : 0.2) * a.traits.curiosity / 50;
    if (!sim.orng.chance(clamp(chance, 0, 1))) return false;
    Tools.lock(sim, a, it, "spear", "set aside");
    return true;
  };


  // Idle: holding ore|flint or stick|bone + the other in reach → strike a hard tip (score ≥45)
  Tools.maybeTip = function (sim, a) {
    const C = TC().tip || {}; if (!C || a.carry == null) return false;
    if (G.Family && G.Family.isChild(a)) return false;
    if (!Tools.scoreOk(a, ["strike", "cut", "rub", "bind"])) return false;
    const cool = Math.round((C.tipCooldown != null ? C.tipCooldown : 360) / TM());
    if (sim.tick - (a.lastTip == null ? -1e9 : a.lastTip) < cool) return false;
    const held = G.Items.held(sim, a); if (!held || held.lit || held.material === "meat") return false;
    const pointHeld = Tools.isTipPoint(held);
    const shaftHeld = Tools.isTipShaft(held);
    if (!pointHeld && !shaftHeld) return false;
    const R = C.tipReach != null ? C.tipReach : 1.5;
    const ground = sim.items.filter(i => !i.heldBy && !i.lit && Math.hypot(i.x - a.pos.x, i.y - a.pos.y) <= R + 1e-9);
    let point = pointHeld ? held : ground.find(Tools.isTipPoint);
    let shaft = shaftHeld ? held : ground.find(Tools.isTipShaft);
    if (!point || !shaft || point === shaft) return false;
    if (Tools.isTip(shaft)) return false;
    const chance = (C.tipChance != null ? C.tipChance : 0.5) * (a.traits.curiosity / 50)
      * (G.Moods ? G.Moods.bindMult(a) : 1);
    if (!sim.orng.chance(clamp(chance, 0, 1))) return false;
    a.lastTip = sim.tick;
    const other = held === shaft ? point : shaft;
    if (other.heldBy == null && (Math.round(a.pos.x) !== other.x || Math.round(a.pos.y) !== other.y)) {
      if (G.Agent.walkTo(sim, a, other.x, other.y, "tip", { shaft: shaft.id, point: point.id })) return true;
      return false;
    }
    return Tools.startTip(sim, a, shaft, point);
  };
  Tools.startTip = function (sim, a, shaft, point) {
    const mins = (TC().tip && TC().tip.tipMinutes != null) ? TC().tip.tipMinutes : 12;
    a.act = { type: "tip", shaft: shaft.id, point: point.id, t: 0, n: Math.max(1, Math.round(mins / TM())) };
    G.Sim.log(sim, a.name + " strikes the " + G.Items.matLabel(point) + " onto the " + G.Items.matLabel(shaft), a);
    return true;
  };
  Tools.arriveTip = function (sim, a) {
    const shaft = G.Items.byId(sim, a.act.shaft), point = G.Items.byId(sim, a.act.point);
    if (!shaft || !point) return false;
    return Tools.startTip(sim, a, shaft, point);
  };
  Tools.stepTip = function (sim, a) {
    const act = a.act; if (++act.t < act.n) return true;
    const shaft = G.Items.byId(sim, act.shaft), point = G.Items.byId(sim, act.point);
    if (!shaft || !point) return false;
    if (!Tools.scoreOk(a, ["strike", "cut", "rub", "bind"])) {
      G.Sim.log(sim, a.name + " cannot set the tip", a);
      G.Learn.add(a, "strike", 2);
      return false;
    }
    Tools.finishTip(sim, a, shaft, point, "struck tip");
    return false;
  };

  Tools.maybe = function (sim, a) {
    if (a.carry == null && G.Cache && G.Cache.seekRetrieve(sim, a, "tool")) return true;   // v29: remembered tool cache
    if (Tools.maybeTip(sim, a)) return true;
    if (Tools.maybeBind(sim, a)) return true;
    if (Tools.maybeChop(sim, a)) return true;
    if (Tools.maybePoke(sim, a)) return true;
    if (Tools.maybeSpear(sim, a)) return true;
    return false;
  };

  G.Tools = Tools;
})(this.GS = this.GS || {});
