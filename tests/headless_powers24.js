// Step 24 (save v19) headless tests: the spawn watcher's +5 curiosity fades back over 7 days (saved), a baby carried by someone struck by lightning
// dies too (cause lightning), v18 -> v19. Called from tests/headless.js; run alone with: node tests/headless_powers24.js
module.exports = function (G, C, ok, h) {
  const W = G.World, P = G.Powers, SP = C.powers.spawn, L = C.powers.lightning, MD = 1440, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP } = h;
  const TPM = 1 / C.time.tickGameMinutes;   // ticks per game minute
  const sig = s => JSON.stringify(G.Sim.serialize(s));
  const find = (s, x0, y0, test, rmin) => { for (let r = rmin || 0; r < 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = x0 + dx, y = y0 + dy;
    if (x > 8 && y > 8 && x < s.world.w - 9 && y < s.world.h - 9 && test(x, y)) return { x, y }; } return null; };
  const land = s => (x, y) => W.walkable(s.world, x, y) && !G.Shelter.at(s, x, y) && !s.agents.some(a => Math.round(a.pos.x) === x && Math.round(a.pos.y) === y);
  const keep = s => { for (const a of s.agents) { a.needs.water = 100; a.needs.energy = 100; a.needs.food = 100; if (a.needs.fullness != null) a.needs.fullness = 100; if (a.needs.warmth != null) a.needs.warmth = 100; } };
  const awake = s => { for (const a of s.agents) if (a.act.type === "sleep") G.Agent.startIdle(s, a); };
  const mkBaby = (s, c, id) => { const b = { id: s.nextId++, kind: "baby", name: "Babe" + id, sex: "f", look: 0, pos: { x: c.pos.x, y: c.pos.y }, facing: c.facing, age: 0.1, lifespan: 60,
    traits: Object.assign({}, c.traits), inh: {}, needs: Object.assign({}, c.needs), zero: { water: 0, fullness: 0, warmth: 0 }, carrier: c.id, carrierName: c.name, parents: [c.id, null], parentNames: [c.name, null],
    bornAt: s.tick, group: c.group != null ? c.group : null, children: [] }; s.babies.push(b); (c.children || (c.children = [])).push(b.id); return b; };

  // config
  const R = C.powers.rain, RL = R.strengths.light, RH = R.strengths.heavy, RM = R.strengths.medium;
  ok(C.saveVersion === 23 && SP.curiosityAdd === 5 && SP.curiosityFadeMinutes === 7 * MD && R.strengthOrder.join() === "light,medium,heavy" &&
    RL.minutes === 180 && RL.bushX === 1.5 && RL.lossX === 1.25 && RL.douse === "small" && RH.minutes === 720 && RH.bushX === 5 && RH.lossX === 2 && RH.douse === "all" && RH.wetMinutes === 2 * MD &&
    L.modes.barrage.count.join() === "2,3" && L.modes.barrage.scatterTiles === 4 && !("cooldownMinutes" in C.powers) && !("cooldownMinutes" in L) && !("cooldownMinutes" in SP),
    "24 config: save v22; spawn curiosity fade 7 d; Rain Light/Medium/Heavy scales; Lightning Barrage 2-3 in r4 (v22); no cooldowns");

  // curiosity fade: +5 now, about half gone after 3.5 days, back to normal after 7; a second watch restarts the 7 days for what is left; capped at 100
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(5); for (let i = 0; i < 30; i++) G.Sim.step(s); awake(s);
    const a = s.agents[0], o = s.agents[1], at = { x: Math.round(a.pos.x), y: Math.round(a.pos.y) };
    o.pos.x = at.x + 40; o.pos.y = at.y; const c0 = a.traits.curiosity = 60, co = o.traits.curiosity;
    const q = find(s, at.x, at.y, land(s), 2); const r = P.cast(s, "spawn", q.x, q.y, "grazer"); const c1 = a.traits.curiosity, f1 = Object.assign({}, a.curioFade);
    const run = m => { for (let i = 0; i < m * TPM; i++) { keep(s); G.Sim.step(s); } };
    run(3.5 * MD); const half = a.traits.curiosity; run(3.5 * MD + 60); const end = a.traits.curiosity, endF = a.curioFade;
    ok(r.ok && c1 === c0 + 5 && f1.left === 5 && half >= c0 + 2 && half <= c0 + 3 && end === c0 && endF == null && o.traits.curiosity === co && o.curioFade == null,
      "24 curiosity: a spawn watcher gets +5 curiosity that fades 1 point at a time, back to normal after 7 days (someone too far gets nothing)", c0 + " -> " + c1 + " -> " + half + " (3.5 d) -> " + end + " (7 d)");
    // second watch after 3 days: what is left + 5 fades over the next 7 days; cap at 100: only the points actually added come off
    a.traits.curiosity = 60; a.curioFade = null; const cast = p => { awake(s); s.powers.cd = {}; const qq = find(s, Math.round(p.pos.x), Math.round(p.pos.y), land(s), 2);
      const nb = find(s, qq.x, qq.y, (x, y) => W.walkable(s.world, x, y) && !(x === qq.x && y === qq.y), 1); p.pos.x = nb.x; p.pos.y = nb.y; G.Agent.startIdle(s, p);   // stand by it
      return P.cast(s, "spawn", qq.x, qq.y, "grazer"); };
    const why = [], alive = s.agents.includes(a); why.push(cast(a)); const c60 = a.traits.curiosity; run(3 * MD);
    const mid = a.traits.curiosity; why.push(cast(a)); const peak = a.traits.curiosity, left = a.curioFade && a.curioFade.left;
    run(6.5 * MD); const before = a.traits.curiosity; run(0.5 * MD + 60); const after = a.traits.curiosity;
    const b = s.agents[0]; b.traits.curiosity = 98; b.curioFade = null; why.push(cast(b));
    const capped = b.traits.curiosity, capLeft = b.curioFade && b.curioFade.left; run(7 * MD + 60);
    ok(peak === mid + 5 && left === mid + 5 - 60 && before > 60 && after === 60 && capped === 100 && capLeft === 2 && b.traits.curiosity === 98,
      "24 curiosity: a second watch adds +5 to what is left and the 7 days start again; at the 100 cap only the points added fade off", "mid " + mid + ", peak " + peak + ", day 6.5 " + before + ", day 7 " + after + "; 98 -> " + capped + " -> " + b.traits.curiosity + (why.every(w => w.ok) ? "" : " casts: " + why.map(w => w.ok || w.reason).join()) + " alive " + alive + " c " + c60);
  });

  // save: a fading bump round-trips and a resumed run matches; a v18 save (no curioFade, no strikes.babies) loads as v19
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(7); for (let i = 0; i < 30; i++) G.Sim.step(s); awake(s); const a = s.agents[0];
    const q = find(s, Math.round(a.pos.x), Math.round(a.pos.y), land(s), 2); P.cast(s, "spawn", q.x, q.y, "grazer"); for (let i = 0; i < 2 * MD * TPM; i++) G.Sim.step(s);
    const j = sig(s), r = G.Sim.deserialize(JSON.parse(j)); const ra = r.agents.find(x => x.id === a.id);
    const leftAt = a.curioFade ? a.curioFade.left : 0, fadeSaved = !!(a.curioFade && ra.curioFade && ra.curioFade.left === a.curioFade.left && ra.curioFade.next === a.curioFade.next);
    for (let i = 0; i < 6 * MD * TPM; i++) { G.Sim.step(s); G.Sim.step(r); }
    const o = JSON.parse(j); o.version = 18; delete o.powers.stats.strikes.babies; for (const p of o.agents) delete p.curioFade;
    const m = G.Sim.deserialize(o), back = G.Sim.deserialize(JSON.parse(sig(m)));
    ok(JSON.parse(j).version === 23 && fadeSaved && sig(s) === sig(r) && m.version === 23 && m.powers.stats.strikes.babies === 0 && m.agents.every(p => p.curioFade == null) && sig(back) === sig(m),
      "24 save: v22 keeps a fading curiosity bump (a resumed run matches); a v18 save loads as v22 (strikes.babies 0; earlier bumps are not tracked and stay)", "left " + leftAt + " at save");
  });

  // Rain strengths: Light leaves burning tiles (sticks + non-hold embers out); Heavy kills all fires + hold trees at once, wet 2 days, many puddles
  withCfg(NO_LIGHTNING, () => {
    const s = G.Sim.create(5); s.agents.length = 0; s.animals = []; s.fire = {};
    const c = find(s, 30, 20, (x, y) => W.tile(s.world, x, y) === G.data.T.MEADOW && !W.hillAt(s.world, x, y));
    const ev = s.fireStats.events.length + 1; s.fireStats.events.push({ id: ev, start: s.tick, x: c.x, y: c.y, tiles: 0, fired: true, end: null, regrown: null });
    G.Fire.ignite(s, c.x, c.y, ev);
    const em = { x: c.x, y: c.y + 2 }; s.fire[em.x + "," + em.y] = { s: "ember", t: s.tick, end: s.tick + 500, ev };
    const tr = find(s, c.x, c.y, (x, y) => Math.hypot(x - c.x, y - c.y) <= 6 && W.tile(s.world, x, y) === G.data.T.WOODS) || { x: c.x - 2, y: c.y };
    s.fire[tr.x + "," + tr.y] = { s: "ember", t: s.tick, end: s.tick + 5000, ev, hold: true };
    const rL = P.cast(s, "rain", c.x, c.y, "light");
    ok(rL.ok && rL.effect.str === "light" && s.fire[c.x + "," + c.y].s === "fire" && !s.fire[em.x + "," + em.y] && s.fire[tr.x + "," + tr.y] && s.fire[tr.x + "," + tr.y].hold &&
      rL.effect.end - s.tick === RL.minutes && rL.effect.puddles.length === RL.puddles.count && rL.effect.bushX === 1.5 && rL.effect.lossX === 1.25,
      "24 rain Light: short/mild — sticks and non-hold embers out, burning tiles and hold trees left; 3 h, bush x1.5, rare puddles",
      "fires left " + s.fire[c.x + "," + c.y].s + ", puddles " + rL.effect.puddles.length);
    // Heavy on a fresh fire: everything out, wet 2 days
    const s2 = G.Sim.create(8); s2.agents.length = 0; s2.animals = []; s2.fire = {};
    const c2 = find(s2, 30, 20, (x, y) => W.tile(s2.world, x, y) === G.data.T.MEADOW && !W.hillAt(s2.world, x, y));
    const ev2 = s2.fireStats.events.length + 1; s2.fireStats.events.push({ id: ev2, start: s2.tick, x: c2.x, y: c2.y, tiles: 0, fired: true, end: null, regrown: null });
    G.Fire.ignite(s2, c2.x, c2.y, ev2);
    const tr2 = find(s2, c2.x, c2.y, (x, y) => Math.hypot(x - c2.x, y - c2.y) <= 6 && W.tile(s2.world, x, y) === G.data.T.WOODS) || { x: c2.x - 2, y: c2.y };
    s2.fire[tr2.x + "," + tr2.y] = { s: "ember", t: s2.tick, end: s2.tick + 5000, ev: ev2, hold: true };
    const rH = P.cast(s2, "rain", c2.x, c2.y, "heavy");
    ok(rH.ok && rH.effect.str === "heavy" && s2.fire[c2.x + "," + c2.y].s === "ash" && !s2.fire[tr2.x + "," + tr2.y] &&
      rH.effect.end - s2.tick === RH.minutes && rH.effect.wetEnd - s2.tick === 2 * MD && rH.effect.bushX === 5 && rH.effect.lossX === 2 && rH.effect.puddles.length >= 20 &&
      s2.log.some(e => /^The rain puts out the fire near /.test(e.text)),
      "24 rain Heavy: long and hard — all fires + hold trees out at once, wet ground 2 days, bushes x5, many puddles",
      "puddles " + rH.effect.puddles.length + ", wet " + (rH.effect.wetEnd - s2.tick) + " min");
  });

  // Barrage (v22): primary bolt always on the tap; 2 or 3 unique land tiles within scatterTiles (4); Single is one at the tap
  withCfg(Object.assign({}, NO_LIGHTNING, { "powers.lightning.fire.dry": 0 }), () => {
    const s = G.Sim.create(4); s.agents.length = 0; s.animals = [];
    const c = find(s, 30, 20, (x, y) => W.walkable(s.world, x, y) && P.ground(s, x, y) !== "water");
    const rS = P.cast(s, "lightning", c.x, c.y, "single");
    const boltsS = s.fx.filter(f => f.k === "bolt").length;
    s.fx = []; s.fire = {};
    const rB = P.cast(s, "lightning", c.x, c.y, "barrage");
    const bolts = (rB.bolts || []).map(e => [e.x, e.y]), uniq = new Set(bolts.map(q => q.join(",")));
    const R = C.powers.lightning.modes.barrage.scatterTiles;
    const primary = bolts[0] && bolts[0][0] === c.x && bolts[0][1] === c.y;
    const inR = bolts.every(([x, y]) => Math.hypot(x - c.x, y - c.y) <= R + 1e-9 && P.ground(s, x, y) !== "water");
    ok(rS.ok && boltsS === 1 && rB.ok && bolts.length >= 2 && bolts.length <= 3 && uniq.size === bolts.length && primary && inR && rB.effect.mode === "barrage" && s.powers.stats.casts.lightning === 2,
      "24 lightning Barrage: primary on tap + extras within r" + R + "; Single is one at the tap",
      "single " + boltsS + ", barrage " + bolts.length + " at " + bolts.map(q => q.join(",")).join(" / ") + " primary=" + primary);
  });

  // baby: a baby carried by someone struck dies too (cause lightning, a baby body, one log line); a baby carried by someone next to the tile lives;
  // a baby lying alone on the struck tile dies
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(3); for (let i = 0; i < 30; i++) G.Sim.step(s); awake(s);
    const c = s.agents[0], n = s.agents[1], t = find(s, Math.round(c.pos.x), Math.round(c.pos.y), (x, y) => W.walkable(s.world, x, y) && W.walkable(s.world, x + 1, y) && !G.Shelter.at(s, x, y), 3);
    c.pos.x = t.x; c.pos.y = t.y; c.act = { type: "idle", until: s.tick + 600 }; n.pos.x = t.x + 1; n.pos.y = t.y; n.act = { type: "idle", until: s.tick + 600 };
    const b1 = mkBaby(s, c, 1), b2 = mkBaby(s, n, 2), cid = c.id, b0 = s.famStats.babyDeaths;
    const r = P.cast(s, "lightning", t.x, t.y); const body = s.bodies.find(x => x.of === b1.id);
    const line = s.log.find(e => e.text === b1.name + " lies still. " + b1.name + " " + C.body.causeVerb[L.cause] + " " + L.cause + ".");
    const lone = mkBaby(s, n, 3); lone.carrier = null; lone.orphanAt = s.tick; lone.pos = { x: t.x - 0, y: t.y }; s.powers.cd = {}; n.pos.x = t.x + 2;
    const r2 = P.cast(s, "lightning", t.x, t.y);
    ok(r.ok && r2.ok && !s.agents.some(a => a.id === cid) && !s.babies.includes(b1) && body && body.baby && body.cause === L.cause && line && s.babies.includes(b2) && s.agents.includes(n) &&
       !s.babies.includes(lone) && s.bodies.some(x => x.of === lone.id && x.cause === L.cause) && s.powers.stats.strikes.babies === 2 && s.famStats.babyDeaths === b0 + 2 && !s.log.some(e => /lies alone/.test(e.text) && e.text.indexOf(b1.name) === 0),
      "24 lightning: a baby carried by someone struck dies too (" + L.cause + ", a baby body, the death line); a baby carried next door lives; a baby lying alone on the struck tile dies", line && line.text);
  });
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
  console.log(fails ? "POWERS24 FAILED (" + fails + ")" : "POWERS24 PASSED"); process.exit(fails ? 1 : 0);
}
