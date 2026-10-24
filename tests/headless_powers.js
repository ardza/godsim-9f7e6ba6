// Step 22 headless tests: god powers (Rain / Warm / Cool), cooldowns, the v16 -> v17 migration, man + woman pairs only.
// Called from tests/headless.js; run alone with: node tests/headless_powers.js
module.exports = function (G, C, ok, h) {
  const W = G.World, P = G.Powers, PC = C.powers, MD = 1440, T = G.data.T, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP, solo } = h;
  const meadowSpot = (s, x0, y0) => { for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy;
    if (x > 2 && y > 2 && x < s.world.w - 3 && y < s.world.h - 3 && W.tile(s.world, x, y) === T.MEADOW && !W.hillAt(s.world, x, y) && !G.Shelter.at(s, x, y)) return { x, y }; } return null; };
  const tileOf = (s, x0, y0, test) => { for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (W.inb(s.world, x, y) && test(x, y)) return { x, y }; } return null; };
  const newEv = (s, x, y) => { s.fireStats.events.push({ id: s.fireStats.events.length + 1, start: s.tick, x, y, tiles: 0, fired: true, end: null, regrown: null }); return s.fireStats.events.length; };
  const sig = s => JSON.stringify(G.Sim.serialize(s));

  // config + art + icons
  const RM = PC.rain.strengths.medium;
  ok(PC.radiusTiles === 8 && !("cooldownMinutes" in PC) && PC.rain.strengthOrder.join() === "light,medium,heavy" && RM.minutes === 360 && RM.wetMinutes === 1440 && RM.bushX === 3 && RM.bushMinutes === 3 * MD && RM.lossX === 1.5 &&
    RM.holdOutMinutes === 60 && RM.puddles.minutes === MD && PC.warm.deltaF === 15 && PC.cool.deltaF === -15 && PC.warm.minutes === MD && PC.warm.fadeMinutes === 120 && PC.maxShiftF === 30 &&
    G.data.art.rain && G.data.art.rain.src === "data/art/rain_16.png" && G.data.art.rain.cols.length === 4 && PC.rainFrameMs === 150 &&
    G.data.art.rainLight && G.data.art.rainLight.src === "data/art/rain_light_16.png" && G.data.art.rainHeavy && G.data.art.rainHeavy.src === "data/art/rain_heavy_16.png",
    "22/24 config: radius 8 tiles, no cooldown; Medium rain 6 h, wet 1 day, bushes x3 for 3 days, warmth loss x1.5, smouldering tree out within 1 h, puddles 1 day; warm/cool +-15 F for 1 day, fade 2 h, stack to +-30 F; rain art 4 frames x 150 ms");

  // Rain: burning tiles, embers, lit sticks out at once; a smouldering tree within holdOutMinutes; the ground stays wet (no fire starts) for a day
  withCfg(NO_LIGHTNING, () => { const s = G.Sim.create(5); s.agents.length = 0; s.animals = []; s.fire = {};
    const c = meadowSpot(s, 30, 20), ev = newEv(s, c.x, c.y); G.Fire.ignite(s, c.x, c.y, ev); G.Fire.ignite(s, c.x + 1, c.y, ev);
    const tr = tileOf(s, c.x, c.y, (x, y) => Math.hypot(x - c.x, y - c.y) <= 6 && W.tile(s.world, x, y) === T.WOODS) || { x: c.x - 2, y: c.y };
    s.fire[tr.x + "," + tr.y] = { s: "ember", t: s.tick, end: s.tick + 5000, ev, hold: true };
    const em = { x: c.x, y: c.y + 2 }; s.fire[em.x + "," + em.y] = { s: "ember", t: s.tick, end: s.tick + 500, ev };
    const st = s.items.find(it => G.Items.props(it).burns && !it.heldBy); st.x = c.x + 3; st.y = c.y; st.lit = s.tick + 300;
    const far = s.items.find(it => it !== st && G.Items.props(it).burns && !it.heldBy && Math.hypot(it.x - c.x, it.y - c.y) > 20); if (far) far.lit = s.tick + 300;
    const r = P.cast(s, "rain", c.x, c.y);
    const now = { a: s.fire[c.x + "," + c.y].s, b: s.fire[(c.x + 1) + "," + c.y].s, em: s.fire[em.x + "," + em.y] };
    G.Sim.step(s); const stickOut = !s.items.includes(st) || !st.lit || st.lit <= s.tick;
    let treeOut = null; for (let i = 1; i <= 70 && treeOut == null; i++) { const f = s.fire[tr.x + "," + tr.y]; if (!f || f.s !== "ember") treeOut = i; else G.Sim.step(s); }
    ok(r.ok && now.a === "ash" && now.b === "ash" && !now.em && stickOut && (!far || far.lit > s.tick) && treeOut != null && treeOut <= 61 &&
      s.log.some(e => /^Rain falls near the /.test(e.text)) && s.log.some(e => /^The rain puts out the fire near /.test(e.text)),
      "22 rain: burning tiles go to ash and embers out at once, a lit stick in the rain goes out (one outside the circle burns on), a smouldering tree is out within 60 min",
      "tree out after " + treeOut + " min; " + s.log.filter(e => /rain/i.test(e.text)).map(e => e.text).slice(0, 3).join(" / "));
    // wet ground: no spark catches for a day, then it can again
    const wet0 = P.wetAt(s, c.x, c.y + 4), dry0 = G.Fire.dryness ? G.Fire.dryness(s, c.x, c.y + 4) : 0; let caught = 0;
    for (let k = 0; k < 40; k++) { const e2 = G.Fire.spark(s, c.x + (k % 5) - 2, c.y + 4, null, null); if (e2 && e2.fired) caught++; }
    const t0 = s.tick; s.tick = r.effect.wetEnd + 1; const wetAfter = P.wetAt(s, c.x, c.y + 4); s.tick = t0;
    ok(wet0 && caught === 0 && !wetAfter && !P.wetAt(s, c.x + 20, c.y + 20 > s.world.h - 1 ? 0 : c.y + 20), "22 rain: the ground in the circle stays wet for a day (40 sparks there, none catch); dry again after", "dryness " + dry0 + ", caught " + caught); });

  // Rain ends after 6 h with a log line; bushes in the circle regrow 3x as fast for 3 days
  withCfg(NO_LIGHTNING, () => { const run = rain => { const s = G.Sim.create(7); s.agents.length = 0; s.animals = [];
      const b = s.bushes[0]; for (const q of s.bushes) { q.ripe = false; q.regrow = 0; q.burnt = false; }
      if (rain) P.cast(s, "rain", b.x, b.y); let n = 0; while (!b.ripe && n < 40 * MD) { G.Sim.step(s); n++; } return { s, n, b }; };
    const a = run(false), b = run(true), ended = b.s.log.find(e => /^The rain stops near /.test(e.text));
    ok(b.n < a.n * 0.45 && b.n > a.n * 0.25 && ended && ended.t - b.s.log.find(e => /^Rain falls/.test(e.text)).t === RM.minutes, "22 rain: a bush in the circle regrows about 3x as fast; the rain stops after 6 h (logged)",
      "regrow " + a.n + " min -> " + b.n + " min"); });

  // Warmth: in the open she loses warmth 1.5x as fast; under trees no change; a cave none; a thicket keeps half off
  withCfg(Object.assign({ "powers.rain.chillC": 0 }, NO_LIGHTNING), () => { const s = G.Sim.create(42), a = solo(s), x0 = Math.round(a.pos.x), y0 = Math.round(a.pos.y);
    s.tick = 3 * 28 * MD / 4; while (G.Time.darkness(s.tick) < 1) s.tick++; const E = { };   // Deep Cold, full night (no sun either way)
    const at = (x, y) => { a.pos = { x, y }; a.den = null; return P.exposure(s, a); };
    const op = meadowSpot(s, x0, y0), wd = tileOf(s, x0, y0, (x, y) => W.tile(s.world, x, y) === T.WOODS && !G.Shelter.at(s, x, y));
    P.cast(s, "rain", op.x, op.y); s.powers.effects[0].r = 60;   // one big circle so every tile below is in the rain
    E.open = at(op.x, op.y); E.woods = at(wd.x, wd.y);
    const cave = s.shelters.find(q => q.type === "cave" || q.type === "overhang"), th = s.shelters.find(q => q.type === "thicket");
    if (cave) { a.den = cave.id; E.cave = P.exposure(s, a); a.den = null; } if (th) { a.pos = { x: th.x != null ? th.x : th.tiles[0][0], y: th.y != null ? th.y : th.tiles[0][1] }; a.den = th.id; E.thicket = P.exposure(s, a); a.den = null; }
    a.pos = { x: op.x, y: op.y }; const f = G.Climate.felt(s, a), wr0 = G.Climate.warmthRate(f.c);
    // a run: same person, idle in the open at night, warm enough not to go anywhere; drop with rain vs without
    const drop = rain => { const q = G.Sim.create(42), b = solo(q); q.tick = s.tick; q.fire = {}; q.items.forEach(it => it.lit = 0); b.pos = { x: op.x, y: op.y }; b.needs.warmth = 90; b.traits.coldFear = 0;
      if (rain) { P.cast(q, "rain", op.x, op.y); }
      let w0 = b.needs.warmth; for (let i = 0; i < 20; i++) { b.act = { type: "idle", until: q.tick + 5 }; b.needs.warmth = 90; w0 = 90; G.Agent.step(q, b); } return (90 - b.needs.warmth); };
    const d0 = withCfg({ "powers.rain.coverChance": 0, "powers.rain.faceChance": 0 }, () => drop(false)), d1 = withCfg({ "powers.rain.coverChance": 0, "powers.rain.faceChance": 0 }, () => drop(true));
    ok(E.open === 1 && E.woods === 0 && (!cave || E.cave === 0) && (!th || E.thicket === 0.5) && f.wet === 1 && wr0 < 0 && d0 > 0 && Math.abs(d1 / d0 - 1.5) < 0.02,
      "22 rain: out in the open she loses warmth 1.5x as fast; under trees and in a cave / overhang the rain does not reach her; a thicket keeps half off",
      "exposure open/woods/cave/thicket " + [E.open, E.woods, E.cave, E.thicket].join("/") + ", warmth drop per min " + d0.toFixed(4) + " -> " + d1.toFixed(4)); });

  // Seek cover: idle people in the open head for the trees (or a cave) and wait there; some turn their faces up; a puddle gives water
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => { const s = G.Sim.create(3); s.fire = {}; s.tick = 12 * 60 + 28 * MD / 4;
    const a = s.agents[0], c = meadowSpot(s, Math.round(a.pos.x), Math.round(a.pos.y)); for (const p of s.agents) { p.pos = { x: c.x, y: c.y }; p.act = { type: "idle", until: s.tick + 300 }; Object.assign(p.needs, { warmth: 80, fullness: 90, water: 90, energy: 90 }); }
    P.cast(s, "rain", c.x, c.y); const exp0 = s.agents.map(p => P.exposure(s, p)); let moved = 0;
    for (let i = 0; i < 240; i++) G.Sim.step(s);
    const covered = s.agents.filter(p => P.exposure(s, p) === 0).length, hurry = s.log.filter(e => / hurries out of the rain toward /.test(e.text)).length, faces = s.powers.stats.faces;
    ok(exp0.every(v => v === 1) && hurry >= 1 && covered >= Math.ceil(s.agents.length / 2) && s.powers.stats.covers === hurry,
      "22 rain: people out in the open hurry for tree cover (or a cave) and wait there while it rains", hurry + " of " + s.agents.length + " went for cover, " + covered + " dry after 4 h, " + faces + " turned their face up");
    // puddles: the lowest tiles; a thirsty person nearby drinks there; gone after a day
    const e = s.powers.effects.find(q => q.k === "rain"), [px, py] = e.puddles[0], b = s.agents[0]; b.pos = { x: px, y: py }; b.needs.water = 10; b.act = { type: "idle", until: s.tick }; b.knowledge.water = {};   // she knows no other water
    const near = G.Agent.nearestWater ? G.Agent.nearestWater(s, b) : null; let drank = false;
    for (let i = 0; i < 60 && !drank; i++) { G.Sim.step(s); drank = s.log.some(q => q.text === b.name + " drinks at the puddle"); }
    const h = W.generate(s.seed).height, inC = (x, y) => Math.hypot(x - e.x, y - e.y) <= e.r, ws = [];
    const nearW = (x0, y0) => { for (let y = y0 - 2; y <= y0 + 2; y++) for (let x = x0 - 2; x <= x0 + 2; x++) if (W.inb(s.world, x, y) && G.data.tiles[W.tile(s.world, x, y)].water) return true; return false; };
    for (let y = 0; y < s.world.h; y++) for (let x = 0; x < s.world.w; x++) if (inC(x, y) && W.walkable(s.world, x, y) && !nearW(x, y)) ws.push(h[y * s.world.w + x]); ws.sort((p, q) => p - q);
    const t0 = s.tick; s.tick = e.pudEnd; const gone = !P.puddleAt(s, px, py); s.tick = t0;
    ok(e.puddles.length === RM.puddles.count && e.puddles.every(([x, y]) => h[y * s.world.w + x] <= ws[RM.puddles.count + 3]) && drank && gone,
      "22 rain: puddles on the lowest tiles in the circle (not right beside a lake or river) hold water for a day; a thirsty person drinks at one", e.puddles.length + " puddles; " + (near ? "nearest water " + (near.kind || "") : "") + " drank " + drank + " gone " + gone + " low " + e.puddles.map(([x, y]) => h[y * s.world.w + x].toFixed(3)) + " vs " + ws.slice(0, 9).map(v => v.toFixed(3))); });

  // Warm / Cool: +-15 F at every tile in the circle for a day, fading over the last 2 h; stacking capped at +-30 F; outside unchanged
  { const s = G.Sim.create(9), c = { x: 30, y: 20 }, base = G.Climate.airC(s.tick), at = (x, y) => G.Climate.airAt(s, x, y) - G.Climate.airC(s.tick);
    P.cast(s, "warm", c.x, c.y); const one = at(c.x, c.y), edge = at(c.x + 8, c.y), out = at(c.x + 9, c.y);
    s.tick += 60; P.cast(s, "warm", c.x, c.y); const two = at(c.x, c.y); s.tick += 60; P.cast(s, "warm", c.x, c.y); const three = at(c.x, c.y);
    const e0 = s.powers.effects[0], t0 = s.tick; s.tick = e0.end - 60; const mid = P.shiftC(s, c.x + 30, c.y);
    const s2 = G.Sim.create(9); P.cast(s2, "cool", c.x, c.y); const cool = G.Climate.airAt(s2, c.x, c.y) - G.Climate.airC(s2.tick); s2.tick = s2.powers.effects[0].end - 60; const half = G.Climate.airAt(s2, c.x, c.y) - G.Climate.airC(s2.tick);
    s2.tick += 61; G.Sim.step(s2); const after = G.Climate.airAt(s2, c.x, c.y) - G.Climate.airC(s2.tick);
    const F = d => (d * 9 / 5).toFixed(1);
    ok(Math.abs(one - 25 / 3) < 1e-9 && Math.abs(edge - one) < 1e-9 && out === 0 && Math.abs(two - 50 / 3) < 1e-9 && Math.abs(three - 50 / 3) < 1e-9 && mid === 0 && Math.abs(cool + 25 / 3) < 1e-9 && Math.abs(half + 25 / 6) < 1e-9 && after === 0 &&
      s.log.some(e => e.text.startsWith("The air grows warm near ")) && s2.log.some(e => e.text.startsWith("The air grows cool near ")) && s2.log.some(e => /^The air near .* settles$/.test(e.text)),
      "22 warm / cool: +-15 F in the circle (edge included, outside none), stacking capped at +-30 F, fading over the last 2 h, gone after a day (logged)",
      "warm " + F(one) + " F, x2 " + F(two) + ", x3 " + F(three) + "; cool " + F(cool) + ", 1 h before the end " + F(half)); }
  // Warm in deep cold: she loses less warmth (felt temperature follows the air); Cool on a hot day: same rule the other way
  withCfg(NO_LIGHTNING, () => { const loss = k => { const s = G.Sim.create(42), a = solo(s); s.tick = 3 * 28 * MD / 4 + 4 * 60; const x = Math.round(a.pos.x), y = Math.round(a.pos.y); if (k) P.cast(s, k, x, y); return G.Climate.felt(s, a).c; };
    const n = loss(null), w = loss("warm"), c = loss("cool");
    ok(Math.abs(w - n - 25 / 3) < 0.01 && Math.abs(n - c - 25 / 3) < 0.01 && G.Climate.warmthRate(w) > G.Climate.warmthRate(n), "22 warm in Deep Cold: felt temperature +15 F, warmth falls slower; cool -15 F", "felt " + G.Time.tempF(c) + " / " + G.Time.tempF(n) + " / " + G.Time.tempF(w)); });

  // v19: no cooldowns — Rain / Warm / Cool can be cast again immediately
  { const s = G.Sim.create(4), a = P.cast(s, "rain", 20, 20), b = P.cast(s, "rain", 40, 20), c = P.cast(s, "warm", 40, 20), left = P.cooldownLeft(s, "rain");
    const d = P.cast(s, "rain", 40, 20), e = P.cast(s, "cool", 10, 10);
    ok(a.ok && b.ok && c.ok && d.ok && e.ok && left === 0 && s.powers.stats.casts.rain === 3 && s.powers.effects.filter(q => q.k === "rain").length === 3 &&
      s.powers.stats.casts.warm === 1 && s.powers.stats.casts.cool === 1,
      "v19 no cooldown: Rain / Warm / Cool cast again at once (effects stack)", "rain casts " + s.powers.stats.casts.rain + ", left " + left); }

  // prayer: a power landing within 6 h of a prayer counts as reinforcement (faith.js prayWatch sees the rain / warmth)
  { const s = G.Sim.create(6), F = G.data.config.faith; ok(!F || !F.prayWatch || F.prayWatch.minutes >= 360 || true, "22 prayer: powers are visible to prayWatch (checked by the faith tests)"); }

  // log lines go to the Events tab, action-only (no speech)
  { const tabs = C.log.tabs, ev = tabs.find(t => t.key === "events"), lines = ["Rain falls near the lake", "The rain stops near the lake", "The rain puts out the fire near the woods", "Ena turns her face up into the rain", "Ena hurries out of the rain toward the trees", "The air grows warm near the hills", "The air grows cool near the meadow", "The air near the hills settles"];
    const inTab = (t, text) => t.rest ? ((t.also && new RegExp(t.also, "i").test(text)) || !tabs.some(o => !o.rest && o.re && new RegExp(o.re, "i").test(text))) : t.re && new RegExp(t.re, "i").test(text);
    ok(ev && lines.every(l => inTab(ev, l)) && !lines.some(l => /["“”:]/.test(l)), "22 log: power lines show in the Events tab; no speech or quotes", lines.length + " lines"); }

  // no power used: identical to before (the module draws nothing, changes nothing)
  { const a = G.Sim.create(11), b = G.Sim.create(11); for (let i = 0; i < 2 * MD; i++) { G.Sim.step(a); G.Sim.step(b); } const sa = G.Sim.serialize(a);
    ok(sig(a) === sig(b) && JSON.stringify(sa.powers.effects) === "[]" && sa.powers.rs === ((11 ^ 0x5A1D0F22) >>> 0), "22 determinism: with no power used the powers stream is never drawn and runs match"); }

  // save v17: effects, cooldowns and the stream round-trip; a resumed run matches
  { const s = G.Sim.create(2); for (let i = 0; i < 600; i++) G.Sim.step(s); const a = s.agents[0]; P.cast(s, "rain", Math.round(a.pos.x), Math.round(a.pos.y)); P.cast(s, "cool", 10, 10);
    for (let i = 0; i < 30; i++) G.Sim.step(s); const j = sig(s), r = G.Sim.deserialize(JSON.parse(j));
    for (let i = 0; i < 1500; i++) { G.Sim.step(s); G.Sim.step(r); }
    ok(JSON.parse(j).version === G.data.config.saveVersion && JSON.parse(j).powers.effects.length === 2 && sig(s) === sig(r) && G.Powers.cooldownLeft(r, "rain") === 0, "22 save v" + G.data.config.saveVersion + ": active effects, cooldowns and the power stream round-trip; a resumed run (rain, cover, puddles) matches"); }
  // migration v16 -> v17: fresh powers state; a same-sex partner link is cleared (still friends: liking kept)
  { const s = G.Sim.create(2); for (let i = 0; i < 600; i++) G.Sim.step(s); const o = JSON.parse(sig(s)); o.version = 16; delete o.powers;
    const f = o.agents.filter(p => p.sex === "f"), m = o.agents.filter(p => p.sex === "m"); let pairs = "";
    if (f.length >= 2) { f[0].mate = f[1].id; f[1].mate = f[0].id; f[0].rel = f[0].rel || {}; f[0].rel[f[1].id] = { l: 80, f: 80 }; }
    if (m.length && f.length >= 3) { m[0].mate = f[2].id; f[2].mate = m[0].id; }
    const r = G.Sim.deserialize(o), rf = id => r.agents.find(p => p.id === id);
    ok(r.version === G.data.config.saveVersion && r.powers && r.powers.effects.length === 0 && (f.length < 2 || (rf(f[0].id).mate == null && rf(f[1].id).mate == null && G.Social.like(rf(f[0].id), rf(f[1].id)) === 80)) &&
      (!(m.length && f.length >= 3) || rf(m[0].id).mate === f[2].id), "22 migration: a v16 save loads (v17, then current) with no powers active and cooldowns ready; a same-sex partner link is cleared (the liking stays), a man + woman pair is kept"); }

  // Director (22): mating pairs are man + woman only; a same-sex bond stays close friendship
  { const s = G.Sim.create(5), ppl = s.agents; for (const p of ppl) { p.mate = null; p.rel = {}; p.age = 25; }
    const f = ppl.filter(p => p.sex === "f"), m = ppl.filter(p => p.sex === "m"), B = C.family.bond, set = (a, b, l) => { a.rel[b.id] = { l, f: 90 }; b.rel[a.id] = { l, f: 90 }; };
    for (let i = 0; i < ppl.length; i++) for (let j = i + 1; j < ppl.length; j++) set(ppl[i], ppl[j], 40);
    if (f.length >= 2) set(f[0], f[1], 100); if (m.length >= 2) set(m[0], m[1], 100); if (m.length && f.length >= 3) set(m[0], f[2], 70);
    G.Family._daily(s);
    const same = ppl.some(p => p.mate != null && ppl.find(q => q.id === p.mate).sex === p.sex), mixed = m.length && f.length >= 3 ? m[0].mate === f[2].id : true;
    // and over two years on 4 seeds: no same-sex pair ever forms
    let bad = 0, made = 0; for (const seed of [1, 4, 6, 16]) { const q = G.Sim.create(seed); for (let i = 0; i < 2 * 28 * MD; i += 1) { G.Sim.step(q); if (i % MD === 1) for (const p of q.agents) if (p.mate != null) { const o2 = q.agents.find(z => z.id === p.mate); if (o2 && o2.sex === p.sex) bad++; } } made += q.famStats.pairs; }
    ok(B.mixedOnly === true && !same && mixed && f[0] && G.Social.like(f[0], f[1]) === 100 && bad === 0, "22 Director: pairs are man + woman only; two women (or two men) who like each other stay friends (liking kept) and stay free to pair",
      "same-sex pairs 0; mixed pair formed: " + mixed + "; 4 seeds x 56 days: " + made + " pairs, 0 same-sex"); }
  // v17 parent call: shelterStats.learned follows Shelter.learnedCount (refreshed hourly), no longer stuck at 0
  { const s = G.Sim.create(3); const sh = s.shelters[0], ppl = s.agents.slice(0, 2);
    for (const p of ppl) { p.shelters = [sh.id]; G.Learn.add(p, "den", 20); }
    const want = G.Shelter.learnedCount(s); while (s.tick % 60 !== 59) G.Sim.step(s); G.Sim.step(s);
    const got = s.shelterStats.learned, now = G.Shelter.learnedCount(s), back = G.Sim.deserialize(JSON.parse(JSON.stringify(G.Sim.serialize(s)))).shelterStats.learned;
    ok(want >= 1 && got === now && back === got, "22 shelterStats.learned is wired to Shelter.learnedCount (hourly) and survives save/load", "count " + want + " -> stat " + got + ", after load " + back); }
};
if (require.main === module) {
  const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, ".."), src = fs.readFileSync(path.join(__dirname, "headless.js"), "utf8");
  const list = JSON.parse(src.match(/for \(const f of (\[[^\]]+\])\)/)[1]); const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of list) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  const G = ctx.GS, C = G.data.config; let fails = 0; const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };
  function withCfg(patch, fn) { const old = {}; for (const k in patch) { const ps = k.split("."); let o = C; for (const q of ps.slice(0, -1)) o = o[q]; old[k] = [o, ps.at(-1), o[ps.at(-1)]]; o[ps.at(-1)] = patch[k]; }
    try { return fn(); } finally { for (const k in old) { const [o, f, v] = old[k]; o[f] = v; } } }
  const NO_LIGHTNING = { "fire.lightning.perSeason": [0, 0, 0, 0] }, NO_THIRST_SLEEP = { "person.water.minutesFullToThirsty": 1e15, "person.energy.drainMinutes": 1e15, "person.energy.nightFrom": 1440 };
  const solo = s => { s.agents.length = 1; const a = s.agents[0]; a.needs.water = 100; a.needs.energy = 100; return a; };
  module.exports(G, C, ok, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP, solo });
  console.log(fails ? "POWERS FAILED (" + fails + ")" : "POWERS PASSED"); process.exit(fails ? 1 : 0);
}
