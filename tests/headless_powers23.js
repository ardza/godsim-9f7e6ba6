// Step 23 headless tests: Lightning (fire chance by ground, deaths, fright + running, scorch), Spawn (grazer / predator, caps, watchers),
// per-power cooldowns, lit sticks from a lightning fire picked up (not blocked by the flee rule) + the Discoveries entry, prayers answered, v17 -> v18.
// Called from tests/headless.js; run alone with: node tests/headless_powers23.js
module.exports = function (G, C, ok, h) {
  const W = G.World, P = G.Powers, PC = C.powers, L = PC.lightning, SP = PC.spawn, T = G.data.T, MD = 1440, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP } = h;
  const fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
  const sig = s => JSON.stringify(G.Sim.serialize(s));
  const find = (s, x0, y0, test, rmin) => { for (let r = rmin || 0; r < 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = x0 + dx, y = y0 + dy;
    if (x > 8 && y > 8 && x < s.world.w - 9 && y < s.world.h - 9 && test(x, y)) return { x, y }; } return null; };
  const isG = (s, g) => (x, y) => P.ground(s, x, y) === g && !G.Shelter.at(s, x, y);
  const clear = s => { s.powers.cd = {}; };
  const quiet = s => { for (const a of s.agents) { a.needs.water = 100; a.needs.energy = 100; a.needs.food = 100; } };
  const noQuote = s => s.log.every(e => !/["\u201c\u201d]| says /.test(e.text));

  // config + art + icons
  { const png = fs.readFileSync(path.join(root, "data/art/lightning_16.png")), wd = png.readUInt32BE(16), ht = png.readUInt32BE(20), icons = fs.readFileSync(path.join(root, "src/icons.js"), "utf8");
    const idx = JSON.parse(fs.readFileSync(path.join(root, "data/art/index.json"), "utf8")), rsrc = fs.readFileSync(path.join(root, "src/render.js"), "utf8"), A = G.data.art.lightning;
    ok(PC.order.join() === "rain,warm,cool,lightning,spawn" && !("cooldownMinutes" in L) && !("cooldownMinutes" in SP) && L.modes.single.count.join() === "1,1" && L.modes.barrage.count.join() === "2,3" && L.modes.barrage.scatterTiles === 8 && L.modeOrder.join() === "single,barrage" && L.fire.dry === 0.6 && L.fire.rain === 0.4 && L.fire.deepCold === 0.2 && L.scareTiles === 6 && L.fearAdd === 20 && L.fearMinutes === MD && L.runMinutes === 60 &&
      SP.watchTiles === 6 && SP.curiosityAdd === 5 && C.animals.grazer.births.cap === 40 && A && A.src === "data/art/lightning_16.png" && A.frame === 16 && A.frameH === 48 && A.cols.join() === "strike,strike_fade,ground_flash" && wd === 48 && ht === 48 && png[25] === 6 &&
      L.frameMs.join() === "80,80,150" && JSON.stringify(idx).indexOf("lightning_16.png") >= 0 && /"rain", "lightning"\]/.test(rsrc) && /lightning/.test(icons) && /spawn/.test(icons) && C.saveVersion === 19,
      "23/24 config: no cooldowns; Lightning Single/Barrage (2-3 in r8); fire 60% dry / 40% rain / 20% Deep Cold, scare 6 tiles +20 fear 1 day, run 1 h; Spawn watchers 6 tiles +5 curiosity, grazer cap 40; art 48x48; save v19"); }

  // fire chance by ground: ~60% on dry grass / forest; 0 (and no draw) on bare ground, rock, water; 40% with rain; 20% in Deep Cold
  withCfg(NO_LIGHTNING, () => { const s = G.Sim.create(5); s.agents.length = 0; s.animals = [];
    const gr = find(s, 30, 20, isG(s, "grass")), fo = find(s, 30, 20, isG(s, "forest")), rk = find(s, 30, 20, isG(s, "rock")), wa = find(s, 30, 20, isG(s, "water")), ba = find(s, 30, 20, isG(s, "bare"));
    let fires = 0, N = 400; for (let i = 0; i < N; i++) { clear(s); s.fire = {}; const q = i % 2 ? gr : fo; if (P.cast(s, "lightning", q.x, q.y).fire) fires++; }
    const draws = []; for (const q of [rk, wa, ba].filter(Boolean)) { clear(s); s.fire = {}; const r0 = s.powers.rs, r = P.cast(s, "lightning", q.x, q.y); draws.push(r.ok && !r.fire && s.powers.rs === r0); }
    clear(s); s.fire = {}; P.cast(s, "rain", gr.x, gr.y); const pr = P.strikeChance(s, gr.x, gr.y);
    const t = G.Sim.create(5), dc = Math.ceil(3 * C.time.daysPerSeason * MD / C.time.tickGameMinutes) + 10; t.tick = dc; const pc = P.strikeChance(t, gr.x, gr.y);
    ok(fires / N > 0.53 && fires / N < 0.67 && draws.length >= 2 && draws.every(Boolean) && P.strikeChance(s, rk.x, rk.y) === 0 && P.strikeChance(s, wa.x, wa.y) === 0 && pr === 0.4 && G.Climate.seasonIndex(dc) === 3 && pc === 0.2,
      "23 lightning: fire chance 60% on dry grass / forest, 40% in rain, 20% in Deep Cold, 0% on bare ground / rock / water (no roll drawn)", fires + "/" + N + " fires; rock/water/bare " + draws.length + " strikes, no fire"); });

  // a strike on rock: a 1-tile scorch, the one on the tile dies (struck by lightning), those within 6 tiles get +20 fear for a day and run for an hour
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => { const s = G.Sim.create(3); s.animals = []; quiet(s);
    const c = find(s, 30, 22, (x, y) => P.ground(s, x, y) === "grass" && !G.Shelter.at(s, x, y) && [[0, 0], [2, 0], [0, 3], [-5, 0], [9, 0]].every(([dx, dy]) => W.walkable(s.world, x + dx, y + dy)));
    const [v, n1, n2, far] = s.agents, keep = s.agents.slice(4); for (const a of keep) { a.pos.x = 2; a.pos.y = 2; } s.agents.length = 4;
    const put = (a, dx, dy) => { a.pos.x = c.x + dx; a.pos.y = c.y + dy; s.prev[a.id] = { x: a.pos.x, y: a.pos.y }; a.act = { type: "idle", until: s.tick + 600 }; a.fright = null; a.runUntil = null; };
    put(v, 0, 0); put(n1, 2, 0); put(n2, -5, 0); put(far, 9, 0); n2.act = { type: "sleep", until: s.tick + 600 };
    const t0 = s.tick, r = withCfg({ "powers.lightning.fire.dry": 0 }, () => P.cast(s, "lightning", c.x, c.y)), f = s.fire[c.x + "," + c.y], b = s.bodies.find(q => q.of === v.id);
    const ok1 = r.ok && !r.fire && f && f.s === "scorched" && !s.agents.includes(v) && b && s.log.some(e => e.text === v.name + " lies still. " + v.name + " was struck by lightning.") && s.powers.stats.strikes.killed === 1;
    const fr = [n1, n2].every(a => P.fright(s, a) === 20 && a.runUntil === t0 + 60 / C.time.tickGameMinutes && a.act.type === "walk" && a.act.goal === "scared") && P.fright(s, far) === 0 && !far.runUntil;
    const lines = s.log.some(e => e.text === n1.name + " drops flat as the sky cracks") && s.log.some(e => e.text.startsWith(n2.name + " wakes with a start")) && s.log.some(e => /^Lightning strikes the grass near /.test(e.text));
    let gone = null; for (let i = 0; i < 70; i++) G.Sim.step(s); const at1h = !n1.runUntil && P.fright(s, n1) === 20; for (let i = 0; i < MD; i++) G.Sim.step(s); const at1d = P.fright(s, n1) === 0 && !n1.fright;
    const d1 = Math.hypot(n1.pos.x - c.x, n1.pos.y - c.y);
    ok(ok1 && fr && lines && at1h && at1d && noQuote(s), "23 lightning: a strike with no fire leaves a 1-tile scorch; the one on the tile dies (struck by lightning); within 6 tiles +20 fear for 1 day and running for 1 h (a sleeper wakes); farther away untouched; action lines only",
      "body " + (b && b.name) + "; n1 ran, " + d1.toFixed(1) + " tiles off after a day"); });

  // v19: no cooldowns — Lightning / Spawn / Rain cast again at once
  withCfg(NO_LIGHTNING, () => { const s = G.Sim.create(4); quiet(s); const q = find(s, 30, 20, isG(s, "rock")) || find(s, 30, 20, isG(s, "bare")), g = find(s, 34, 22, (x, y) => W.walkable(s.world, x, y) && !G.Shelter.at(s, x, y));
    const a = P.cast(s, "lightning", q.x, q.y, "single"), b = P.cast(s, "lightning", q.x, q.y, "single"), sp = P.cast(s, "spawn", g.x, g.y, "grazer"), sp2 = P.cast(s, "spawn", g.x + 1, g.y, "grazer"), rn = P.cast(s, "rain", g.x, g.y);
    const l1 = P.cooldownLeft(s, "lightning"), s1 = P.cooldownLeft(s, "spawn");
    ok(a.ok && b.ok && sp.ok && sp2.ok && rn.ok && l1 === 0 && s1 === 0 && s.powers.stats.casts.lightning === 2 && s.powers.stats.casts.spawn === 2,
      "v19 no cooldown: Lightning / Spawn / Rain cast again at once", "lightning casts " + s.powers.stats.casts.lightning + ", spawn " + s.powers.stats.casts.spawn); });

  // Spawn: 1 grazer (nearest herd) with a shimmer; watchers within 6 tiles +5 curiosity; a predator may scare them off; caps unchanged; land only
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => { const s = G.Sim.create(6); quiet(s);
    const c = find(s, 30, 22, (x, y) => P.ground(s, x, y) === "grass" && !G.Shelter.at(s, x, y) && W.walkable(s.world, x + 3, y) && W.walkable(s.world, x - 3, y));
    const [w1, w2] = s.agents; for (const a of s.agents.slice(2)) { a.pos.x = 2; a.pos.y = 2; }
    for (const [a, dx] of [[w1, 3], [w2, -3]]) { a.pos.x = c.x + dx; a.pos.y = c.y; s.prev[a.id] = { x: a.pos.x, y: a.pos.y }; a.act = { type: "idle", until: s.tick + 600 }; a.traits.curiosity = 40; }
    const g0 = s.animals.filter(o => o.species === "grazer").length, r = P.cast(s, "spawn", c.x, c.y, "grazer"), an = r.animal;
    const g1 = s.animals.filter(o => o.species === "grazer").length, fx = s.fx.some(f => f.k === "shimmer" && f.x === an.pos.x && f.y === an.pos.y);
    const near = s.herds.reduce((b, h) => Math.hypot(h.x - an.pos.x, h.y - an.pos.y) < Math.hypot(b.x - an.pos.x, b.y - an.pos.y) ? h : b, s.herds[0]);
    const ok1 = r.ok && g1 === g0 + 1 && an.spawned === s.tick && an.herd === near.id && fx && Math.hypot(an.pos.x - c.x, an.pos.y - c.y) <= SP.freeTiles && w1.traits.curiosity === 45 && w2.traits.curiosity === 45 &&
      s.log.some(e => /^A grazer appears near /.test(e.text)) && s.log.some(e => e.text === w1.name + " stares at the new grazer");
    clear(s); const pr = withCfg({ "powers.spawn.predator.fearChance": 10 }, () => P.cast(s, "spawn", c.x, c.y, "predator"));
    const ok2 = pr.ok && pr.animal.species === "scavenger" && [w1, w2].every(a => P.fright(s, a) === SP.predator.fearAdd && a.act.goal === "scared") && s.log.some(e => e.text === w1.name + " stares at the new scavenger and backs away");
    // caps: grazers stay at 40 (refused, no cooldown), water refused
    clear(s); const wa = find(s, 30, 20, isG(s, "water")), rw = P.cast(s, "spawn", wa.x, wa.y, "grazer");
    const cap = C.animals.grazer.births.cap; while (s.animals.filter(o => o.species === "grazer").length < cap) { const o = G.Animal.create(s, "grazer", 3, 3, 0, new G.RNG(1)); s.animals.push(o); }
    const rc = P.cast(s, "spawn", c.x, c.y, "grazer"), still = s.animals.filter(o => o.species === "grazer").length;
    ok(ok1 && ok2 && !rw.ok && rw.reason === "needs land" && !rc.ok && /no room/.test(rc.reason) && still === cap && P.cooldownLeft(s, "spawn") === 0 && noQuote(s),
      "23 spawn: one grazer by the tapped tile (joins the nearest herd, a shimmer); watchers within 6 tiles +5 curiosity; a predator (scavenger) may send them backing away; refused on water and at the grazer cap (40), no cooldown spent",
      "herd " + an.herd + "; refusals: " + rw.reason + " / " + rc.reason); });

  // lit sticks: a stick within 1 tile of a lightning fire becomes a lit (bolt) stick; a curious, unafraid adult walks over through the flee rule and carries it
  // (the first carry is a Discoveries entry); the powers stream is not drawn by the pickup
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, { "powers.lightning.fire.dry": 1, "powers.boltStick.chance": 1 }), () => { const s = G.Sim.create(7); s.animals = [];
    const c = find(s, 30, 22, (x, y) => P.ground(s, x, y) === "grass" && !G.Shelter.at(s, x, y) && [-1, 1, 4, 5].every(dx => W.walkable(s.world, x + dx, y) && P.ground(s, x + dx, y) !== "forest"));
    const sticks = s.items.filter(it => G.Items.props(it).burns && !it.heldBy), st = sticks[0], st2 = sticks[1]; st.x = c.x + 1; st.y = c.y; st2.x = c.x + 30; st2.y = c.y; for (const it of s.items) if (it !== st && it !== st2 && !it.heldBy) { it.x = 2; it.y = 2; }
    const a = s.agents[0]; s.agents.length = 1; a.needs.water = 100; a.needs.energy = 100; a.needs.food = 100; a.traits.curiosity = 90; a.traits.fireFear = 10; a.carry = null;
    a.pos.x = c.x + 5; a.pos.y = c.y; s.prev[a.id] = { x: a.pos.x, y: a.pos.y }; a.act = { type: "idle", until: s.tick + 10 };
    const r = P.cast(s, "lightning", c.x, c.y), bolt = !!st.bolt && st.lit > s.tick && !st2.lit;
    const rs = s.powers.rs; let walk = null, got = null; const D0 = s.discoveries ? s.discoveries.length : 0;
    for (let i = 0; i < 6 * 60 && got == null; i++) { G.Sim.step(s); if (walk == null && a.act.goal === "pickup" && a.act.bolt) walk = i; if (a.carry === st.id) got = i; if (!s.agents.includes(a)) break; }
    const D = (s.discoveries || []).find(d => d.title === "First lit stick carried");
    ok(r.ok && r.fire && bolt && walk != null && got != null && s.fireStats.boltPickups >= 1 && s.fireStats.boltWalks >= 1 && D && s.powers.rs === rs && s.log.some(e => e.text === a.name + " creeps toward the smouldering stick") && noQuote(s),
      "23 lit stick: a stick within 1 tile of a lightning fire smoulders as a lit stick; a curious adult (curiosity - fear roll) creeps over and carries it; the first carry is a Discoveries entry",
      "walk at +" + walk + " min, carried at +" + got + " min; discovery " + (D && D.text || JSON.stringify(D || null).slice(0, 80))); });

  // through the flee rule: the stick lies beyond the flames (the walk passes them, still burning); a fearful-but-curious adult goes round and takes it
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, { "powers.lightning.fire.dry": 1, "powers.boltStick.chance": 1 }), () => { const s = G.Sim.create(7); s.animals = [];
    const c = find(s, 30, 22, (x, y) => P.ground(s, x, y) === "grass" && !G.Shelter.at(s, x, y) && [-6, -5, -4, -3, -2, -1, 1, 2].every(dx => W.walkable(s.world, x + dx, y) && P.ground(s, x + dx, y) !== "forest") && W.walkable(s.world, x, y - 1) && W.walkable(s.world, x, y + 1));
    const st = s.items.find(it => G.Items.props(it).burns && !it.heldBy); st.x = c.x + 1; st.y = c.y; for (const it of s.items) if (it !== st && !it.heldBy) { it.x = 2; it.y = 2; }
    const a = s.agents[0]; s.agents.length = 1; a.needs.water = 100; a.needs.energy = 100; a.needs.food = 100; a.traits.curiosity = 100; a.traits.fireFear = 60; a.carry = null;
    a.pos.x = c.x - 5; a.pos.y = c.y; s.prev[a.id] = { x: a.pos.x, y: a.pos.y }; P.cast(s, "lightning", c.x, c.y);
    for (const k in s.fire) s.fire[k].end = s.tick + 2000; a.runUntil = null; a.fright = null; a.act = { type: "idle", until: s.tick + 1 };
    const went = G.Fire.boltLook(s), path = a.act.path ? a.act.path.slice() : []; let got = null, burnt = false, close = 9;
    for (let i = 0; i < 120 && got == null; i++) { G.Sim.step(s); if (a.act.goal === "burnt" || a.act.goal === "fleeFire") burnt = true; close = Math.min(close, Math.hypot(a.pos.x - c.x, a.pos.y - c.y)); if (a.carry === st.id) got = i; }
    ok(went === 1 && got != null && !burnt && s.fire[c.x + "," + c.y].s === "fire" && close < C.fire.fleeTiles && !path.some(([x, y]) => x === c.x && y === c.y),
      "23 lit stick: the walk to a lightning-lit stick is not turned back by the flee rule (it passes within 2.5 tiles of live flames) and goes round the burning tiles", "carried at +" + got + " min, closest " + close.toFixed(1) + " tiles from the flames"); });

  // the curiosity-minus-fear roll: a fearful adult or one still frightened by a strike never goes
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, { "powers.lightning.fire.dry": 1 }), () => { const s = G.Sim.create(7); s.animals = [];
    const c = find(s, 30, 22, (x, y) => P.ground(s, x, y) === "grass" && !G.Shelter.at(s, x, y) && [1, 5].every(dx => W.walkable(s.world, x + dx, y)));
    const st = s.items.find(it => G.Items.props(it).burns && !it.heldBy); st.x = c.x + 1; st.y = c.y; const a = s.agents[0]; s.agents.length = 1; a.traits.curiosity = 10; a.traits.fireFear = 80;
    a.pos.x = c.x + 5; a.pos.y = c.y; s.prev[a.id] = { x: a.pos.x, y: a.pos.y }; a.act = { type: "idle", until: s.tick + 10 }; P.cast(s, "lightning", c.x, c.y); a.runUntil = null; a.act = { type: "idle", until: s.tick + 10 };
    for (let i = 0; i < 180; i++) G.Sim.step(s);
    ok(st.bolt && !s.fireStats.boltWalks && s.fireStats.boltRolls >= 1 && a.carry !== st.id, "23 lit stick: the roll is curiosity minus fear (fireFear + fright): a fearful adult leaves it", (s.fireStats.boltRolls || 0) + " rolls, 0 walks"); });

  // faith: a prayer followed within a day by a strike or a new animal close by reinforces that ritual (once per bout)
  withCfg(NO_LIGHTNING, () => { const s = G.Sim.create(8); quiet(s); const a = s.agents[0], x = Math.round(a.pos.x), y = Math.round(a.pos.y), far = s.agents.find(b => Math.hypot(b.pos.x - x, b.pos.y - y) > PC.faithTiles + 2);
    a.prayForms = { kneel: { n: 1, like: 50, gen: 0, last: s.tick - 30, hits: 0 } }; if (far) far.prayForms = { kneel: { n: 1, like: 50, gen: 0, last: s.tick - 30, hits: 0 } };
    const q = find(s, x, y, (tx, ty) => W.walkable(s.world, tx, ty) && Math.hypot(tx - x, ty - y) >= 7 && Math.hypot(tx - x, ty - y) <= 10 && !G.Shelter.at(s, tx, ty), 7);
    const r = P.cast(s, "spawn", q.x, q.y, "grazer"), l1 = a.prayForms.kneel.like; clear(s); P.cast(s, "spawn", q.x, q.y, "grazer"); const l2 = a.prayForms.kneel.like;
    const old = s.agents[1]; old.prayForms = { kneel: { n: 1, like: 50, gen: 0, last: s.tick - 2 * MD, hits: 0 } }; old.pos.x = q.x; old.pos.y = q.y; clear(s); P.cast(s, "spawn", q.x, q.y, "grazer");
    ok(r.ok && l1 === 50 + C.faith.likeGain && l2 === l1 && a.prayForms.kneel.hits === 1 && (!far || far.prayForms.kneel.like === 50) && old.prayForms.kneel.like === 50 && s.powers.stats.answered >= 1 && s.faith.stats.byPower >= 1,
      "23 faith: a prayer followed within a day by a spawn (or strike) close by reinforces that ritual, once per prayer; far away or too late counts nothing", "like 50 -> " + l1); });

  // save v18 round-trip + resumed run (a strike fire, a spawned animal); v17 -> v18 migration (new stats, cooldowns kept)
  { const s = G.Sim.create(2); for (let i = 0; i < 600; i++) G.Sim.step(s); const a = s.agents[0], q = find(s, Math.round(a.pos.x), Math.round(a.pos.y), isG(s, "grass"), 3);
    P.cast(s, "lightning", q.x, q.y); P.cast(s, "spawn", q.x + 2, q.y + 2, "predator"); for (let i = 0; i < 20; i++) G.Sim.step(s);
    const j = sig(s), r = G.Sim.deserialize(JSON.parse(j)); for (let i = 0; i < 1500; i++) { G.Sim.step(s); G.Sim.step(r); }
    const o = JSON.parse(j); o.version = 17; delete o.powers.stats.strikes; delete o.powers.stats.spawns; delete o.powers.stats.answered; o.powers.cd = { rain: 999999 };
    const m = G.Sim.deserialize(o), back = G.Sim.deserialize(JSON.parse(sig(m)));
    ok(JSON.parse(j).version === 19 && sig(s) === sig(r) && m.version === C.saveVersion && m.powers.stats.strikes && m.powers.stats.strikes.fires === 0 && m.powers.stats.spawns.grazer === 0 && m.powers.stats.answered === 0 && m.powers.cd.rain === 999999 &&
      sig(back) === sig(m), "23 save: v19 round-trips a strike, its fire and fright, and a spawned animal (a resumed run matches); a v17 save loads as v18 then v19 (new strike / spawn stats, cooldowns kept)"); }

  // no power used: the powers stream is never drawn (lightning / spawn add nothing to a quiet run)
  { const s = G.Sim.create(11), rs = s.powers.rs; for (let i = 0; i < 3 * MD; i++) G.Sim.step(s); ok(s.powers.rs === rs && !s.animals.some(o => o.spawned != null) && !s.agents.some(a => a.fright), "23 determinism: with no power used the powers stream is untouched, no animal is spawned and nobody is frightened"); }
};
if (require.main === module) {
  const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, ".."), src = fs.readFileSync(path.join(__dirname, "headless.js"), "utf8");
  const list = JSON.parse(src.match(/for \(const f of (\[[^\]]+\])\)/)[1]); const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of list) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  const G = ctx.GS, C = G.data.config; let fails = 0; const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };
  function withCfg(patch, fn) { const old = {}; for (const k in patch) { const ps = k.split("."); let o = C; for (const q of ps.slice(0, -1)) o = o[q]; old[k] = [o, ps.at(-1), o[ps.at(-1)]]; o[ps.at(-1)] = patch[k]; }
    try { return fn(); } finally { for (const k in old) { const [o, f, v] = old[k]; o[f] = v; } } }
  const NO_LIGHTNING = { "fire.lightning.perSeason": [0, 0, 0, 0] }, NO_THIRST_SLEEP = { "person.water.minutesFullToThirsty": 1e15, "person.energy.drainMinutes": 1e15, "person.energy.nightFrom": 1440 };
  module.exports(G, C, ok, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP });
  console.log(fails ? "POWERS23 FAILED (" + fails + ")" : "POWERS23 PASSED"); process.exit(fails ? 1 : 0);
}
