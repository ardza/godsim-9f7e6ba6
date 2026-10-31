// v39 fixtures: specs/reed_fiber_DRAFT.md §10 tests 1-26 + Director checks (i) group-member matching, (ii) entry dropped when no remembered member lives.
// Run: node tests/headless_v39.js
const { load } = require("./lib_v39.js");
const G = load(), C = G.data.config, W = G.World;
let fails = 0, passes = 0; const failed = [];
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (c) passes++; else { fails++; failed.push(msg); } };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);
const texts = s => (s.log || []).map(l => typeof l === "string" ? l : l.text || "");
const clone = o => JSON.parse(JSON.stringify(o));
const DAY = 1440 / C.time.tickGameMinutes;
const R2 = v => Math.round(v * 100) / 100;

// ---------- helpers ----------
function bare(seed) {   // a world with no animals and no people (people are added per fixture)
  const s = G.Sim.create(seed || 39); s.animals = []; s.packs = []; s.agents = []; s.bodies = []; return s; }
function landOK(s, x, y) { return W.inb(s.world, x, y) && W.walkable(s.world, x, y) && !W.isWater(s.world, x, y); }
function openSpot(s, r) {   // a tile with every tile within r dry, walkable land
  const w = s.world;
  for (let y = r + 1; y < w.h - r - 1; y++) for (let x = r + 1; x < w.w - r - 1; x++) {
    let good = true; for (let dy = -r; dy <= r && good; dy++) for (let dx = -r; dx <= r && good; dx++) if (!landOK(s, x + dx, y + dy)) good = false;
    if (good) return { x, y }; }
  return null; }
function shoreSpot(s) {   // land tile with water 4-adjacent
  const w = s.world;
  for (let y = 2; y < w.h - 2; y++) for (let x = 2; x < w.w - 2; x++) { if (!landOK(s, x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (W.isWater(w, x + dx, y + dy)) return { x, y, wx: x + dx, wy: y + dy }; }
  return null; }
function dryInland(s) {   // land tile with no water within 3 tiles
  const w = s.world;
  for (let y = 4; y < w.h - 4; y++) for (let x = 4; x < w.w - 4; x++) { if (!landOK(s, x, y)) continue; let wet = false;
    for (let dy = -3; dy <= 3 && !wet; dy++) for (let dx = -3; dx <= 3 && !wet; dx++) if (W.isWater(w, x + dx, y + dy)) wet = true;
    if (!wet && !G.Fiber.byWater(s, x, y)) return { x, y }; }
  return null; }
function person(s, x, y, o) {
  const p = G.Agent.createPerson(s, x, y); s.agents.push(p); p.pos = { x, y };
  p.needs.fullness = 90; p.needs.water = 90; p.needs.energy = 90; p.needs.warmth = 90; p.injuries = []; p.wolfFear = G.WolfFear.base(); p.fright = null;
  p.act = { type: "idle", until: s.tick + 1e6 }; p.carry = null; p.den = null;
  o = o || {}; if (o.melee != null) setSkill(p, "melee", o.melee); if (o.ranged != null) setSkill(p, "ranged", o.ranged);
  if (o.group != null) p.group = o.group; return p; }
function setSkill(p, k, v) { const e = G.Learn.rec(p, k); e.score = v; return e; }
function item(s, mat, x, y, form, props) { const it = G.Items.create(s, mat, x, y, form); if (props) Object.assign(it.props, props); s.items.push(it); return it; }
function give(s, p, it) { if (p.carry != null) { const o = G.Items.byId(s, p.carry); if (o) o.heldBy = null; } it.heldBy = p.id; it.x = Math.round(p.pos.x); it.y = Math.round(p.pos.y); p.carry = it.id; p.carryUntil = s.tick + 1e7; return it; }
function spear(s, p) { const st = item(s, "stick", Math.round(p.pos.x), Math.round(p.pos.y)); G.Tools.lock(s, null, st, "spear"); return give(s, p, st); }
function bow(s, p, n) { const b = item(s, "stick", Math.round(p.pos.x), Math.round(p.pos.y), "whole", { flex: 70 }); b.tool = "bow"; b.strung = true; b.arrows = [];
  for (let i = 0; i < (n == null ? 6 : n); i++) b.arrows.push({ id: 9e6 + i, tip: null, hard: 25, sharp: 30, flex: 50 }); return give(s, p, b); }
function hide(s, p) { const h = item(s, "hide", Math.round(p.pos.x), Math.round(p.pos.y)); h.wornBy = p.id; p.wearingHide = h.id; return h; }
function wolf(s, x, y, packId) {
  let pk = (s.packs || []).find(q => q.id === packId);
  if (!pk) { pk = { id: packId, den: { x, y } }; (s.packs = s.packs || []).push(pk); }
  const w = G.Animal.create(s, "wolves", x, y, null); w.pack = packId; w.pos = { x, y }; w.act = { type: "idle", until: s.tick + 1e6 };
  w.memory = []; w.caution = { v: 0, t: null }; w.woundedUntil = null; s.animals.push(w); return w; }
// fire on a tile (Fire's own item burn is stood in for: the standing reeds on it go), and the ground coming back
function burnTile(s, x, y) { s.fire = s.fire || {}; s.fire[x + "," + y] = { s: "fire", t: s.tick, end: s.tick + 60 }; s.items = s.items.filter(it => !(G.Reeds.isReed(it) && it.x === x && it.y === y && !it.heldBy)); G.Reeds.step(s); return true; }
function unburn(s, x, y) { delete s.fire[x + "," + y]; }
function tickTo(s, n) { s.tick += n; }
function runTry(s, a, guard) { let k = 0; while (a.act && a.act.type === "try" && k++ < (guard || 500)) { const r = G.Items.stepTry(s, a); if (!r) break; } }
const SKILLS = ["melee", "ranged"];
const score = (p, k) => G.Learn.score(p, k);

// ===== 1. soak + beat =====
(function () {
  const s = bare(39), sh = shoreSpot(s), dr = dryInland(s);
  ok(!!sh && !!dr, "1 fixture: a shore tile and a dry inland tile");
  const wet = item(s, "reed", sh.x, sh.y), dry = item(s, "reed", dr.x, dr.y);
  const need = C.fiber.soakMinutes / C.time.tickGameMinutes;
  for (let i = 0; i < need - 1; i++) { s.tick++; G.Fiber.stepSoak(s, 1); }
  const before = !!wet.soaked;
  for (let i = 0; i < 2; i++) { s.tick++; G.Fiber.stepSoak(s, 1); }
  ok(!before && wet.soaked === true, "1 reed at the water's edge soaks after 240 min (not before)", "at239=" + before + " at241=" + wet.soaked);
  for (let i = 0; i < need * 2; i++) { s.tick++; G.Fiber.stepSoak(s, 1); }
  ok(!dry.soaked, "1 reed on dry ground never soaks (480 min)");
  const a = person(s, sh.x, sh.y); give(s, a, wet); const rock = item(s, "flint", sh.x, sh.y);
  ok((rock.props.hardness || 0) >= C.fiber.beatMinHardness, "1 striker hardness >= beatMinHardness", rock.props.hardness);
  G.Items.startTry(s, a, rock, "strike"); runTry(s, a);
  ok(wet.material === "fiber" && wet.form === "bundle", "1 striking a soaked reed -> fiber bundle", wet.material + "/" + wet.form);
  const b = person(s, dr.x, dr.y); give(s, b, dry); const rock2 = item(s, "flint", dr.x, dr.y);
  G.Items.startTry(s, b, rock2, "strike"); runTry(s, b);
  ok(dry.material === "reed" && !G.Fiber.isBundle(dry), "1 striking a dry reed -> no fiber", dry.material + "/" + dry.form);
  ok((s.discoveries || []).filter(d => d.title === "First fiber").length === 1, "1 one 'First fiber' discovery");
})();

// ===== 2. twist + cord-bound axe =====
(function () {
  const s = bare(39), o = openSpot(s, 2), a = person(s, o.x, o.y);
  const b1 = item(s, "fiber", o.x, o.y, "bundle"), b2 = item(s, "fiber", o.x, o.y, "bundle"); give(s, a, b1);
  const n0 = s.items.filter(i => i.material === "fiber").length;
  G.Items.startTry(s, a, b2, "rub"); runTry(s, a);
  const fib = s.items.filter(i => i.material === "fiber");
  ok(n0 === 2 && fib.length === 1 && fib[0].form === "cord", "2 two bundles rubbed -> one cord", n0 + " -> " + fib.map(i => i.form).join(","));
  ok((s.discoveries || []).some(d => d.title === "First cord"), "2 'First cord' discovery");
  // axe with a reed binder vs a cord binder: same stick + head
  const axeDur = binder => { const t = bare(39), q = openSpot(t, 2), p = person(t, q.x, q.y);
    for (const k of ["bind", "strike", "cut", "rub"]) setSkill(p, k, 70);
    const st = item(t, "stick", q.x, q.y, "whole", { hardness: 30 }), hd = item(t, "flint", q.x, q.y, "whole", { hardness: 70 });
    const bd = binder === "cord" ? item(t, "fiber", q.x, q.y, "cord") : item(t, "reed", q.x, q.y); give(t, p, bd);
    G.Tools.startBind(t, p, st, hd); let k = 0; while (k++ < 200 && G.Tools.stepBind(t, p)) {}
    return { dur: st.props.durability, tool: st.tool, with: st.boundWith }; };
  const r = axeDur("reed"), c = axeDur("cord");
  ok(r.tool === "axe" && c.tool === "axe" && c.with === "cord", "2 both binders make an axe", JSON.stringify([r, c]));
  ok(c.dur === Math.min(100, Math.round(r.dur * C.rope.binderDurX)), "2 cord-bound axe starts at 1.5x durability", r.dur + " -> " + c.dur);
})();

// ===== 3. wrap =====
(function () {
  const s = bare(39), o = openSpot(s, 2), a = person(s, o.x, o.y);
  const want = [];
  for (let i = 0; i < 3; i++) { const b = item(s, "fiber", o.x, o.y, "bundle"); give(s, a, b); G.Fiber.wrapOn(s, a, b); want.push(G.Fiber.wrapWant(s, a)); }
  ok(near(want[0], 2) && near(want[1], 3.5) && near(want[2], 5), "3 wrap 1/2/3 layers = +2 / +3.5 / +5 C", want.join(" / "));
  ok(want[2] < C.hides.wornC, "3 full wrap < worn hide", want[2] + " < " + C.hides.wornC);
  const cap = C.shelter.capX * C.fire.heatC, both = G.Fiber.warmC(s, a, C.hides.wornC);
  ok(both + C.hides.wornC <= cap + 1e-9, "3 wrap + hide <= shelter.capX x heatC", both + " + " + C.hides.wornC + " <= " + cap);
  const w = G.Fiber.wrapItem(s, a), rain0 = G.Reeds.rainOn;
  const wearFor = (rain, mins) => { w.dur = 100; G.Reeds.rainOn = () => rain; for (let i = 0; i < mins; i++) { s.tick++; G.Fiber.stepWraps(s, 1); } G.Reeds.rainOn = rain0; return 100 - w.dur; };
  const dDry = wearFor(false, 600), dWet = wearFor(true, 600);
  ok(dWet > dDry * 1.5, "3 wrap wears faster in rain", R2(dDry) + " vs " + R2(dWet));
  w.dur = 0.0001; s.tick++; G.Fiber.stepWraps(s, 1);
  ok(!a.wearingWrap && w.form === "bundle" && s.items.indexOf(w) >= 0, "3 wrap at 0 falls apart: a bundle is left", w.form);
})();

// ===== 4. lashed hut / cache =====
(function () {
  const s = bare(39), o = openSpot(s, 3), a = person(s, o.x, o.y);
  const h = G.Hut.create(s, o.x, o.y, a, []); (s.shelters = s.shelters || []).push(h);
  const r0 = G.Hut.decayRate(s, h); const cord = give(s, a, item(s, "fiber", o.x, o.y, "cord"));
  G.Hut.lash(s, a, h, cord); const r1 = G.Hut.decayRate(s, h);
  ok(h.lashed && near(r1 / r0, C.rope.hutDecayX), "4 lashed hut decays at 0.7x", R2(r1 / r0));
  ok(s.items.indexOf(cord) < 0, "4 the cord is used up in the lashing");
  const spot = { key: "test:1", x: o.x, y: o.y };
  const pile0 = G.Cache.pile; let n = C.cache.pileMax; G.Cache.pile = () => n;
  const fullBefore = G.Cache.full(s, spot); (s.cacheLash = {})[spot.key] = s.tick; const fullAfter = G.Cache.full(s, spot); n = C.cache.pileMax + 1; const fullAt = G.Cache.full(s, spot);
  G.Cache.pile = pile0;
  ok(fullBefore && !fullAfter && fullAt, "4 lashed cache holds pileMax + 1", C.cache.pileMax + " -> " + (C.cache.pileMax + 1));
})();

// ===== 5. bow string / arrows / quiver =====
(function () {
  const s = bare(39), o = openSpot(s, 2), a = person(s, o.x, o.y); setSkill(a, "bind", 60); setSkill(a, "twist", 60);
  const st = (flex) => { const stick = item(s, "stick", o.x, o.y, "whole", { flex }); const cord = give(s, a, item(s, "fiber", o.x, o.y, "cord"));
    G.Bow.startString(s, a, stick, cord); let k = 0; while (k++ < 200 && G.Bow.stepString(s, a)) {} return { stick, cord }; };
  const good = st(70), bad = st(40);
  ok(good.stick.tool === "bow" && good.stick.strung, "5 cord on a flex-70 stick -> bow");
  ok(!bad.stick.tool && bad.stick.noBow && s.items.indexOf(bad.cord) >= 0, "5 cord on a flex-40 stick -> nothing (cord kept, stick marked)");
  const b = person(s, o.x, o.y); G.Learn.add(b, "bow", 10);
  const flake = give(s, b, item(s, "flint", o.x, o.y, "flake", { sharpness: 70 })); const sh = item(s, "stick", o.x, o.y, "whole");
  G.Items.startTry(s, b, sh, "cut"); runTry(s, b);
  const arrows = s.items.filter(i => i.form === "arrow");
  ok(arrows.length === 3 && s.items.indexOf(sh) < 0, "5 cut stick -> 3 arrows", arrows.length);
  for (let i = 0; i < 6; i++) item(s, "stick", o.x, o.y, "arrow");
  const bw = good.stick; bw.arrows = []; const n = G.Bow.load(s, a, bw);
  ok(bw.arrows.length === C.bow.quiverMax && C.bow.quiverMax === 6 && s.items.filter(i => i.form === "arrow").length === 3, "5 bow holds max 6 (9 lying, 6 loaded)", n);
})();

// ===== 6. archer vs deer; spear at 5 can't; recovery; miss lands past =====
(function () {
  const tries = [], N = 40; let kills = 0, bolted = 0;
  for (let k = 0; k < 20; k++) {
    const s = bare(100 + k), o = openSpot(s, 7), a = person(s, o.x, o.y, { ranged: 20 }); a.needs.fullness = 20; bow(s, a, 6);
    const d = G.Animal.create(s, "grazer", o.x + 5, o.y, null); d.pos = { x: o.x + 5, y: o.y }; d.act = { type: "idle", until: s.tick + 1e6 }; s.animals.push(d);
    let n = 0; while (n < N && s.animals.indexOf(d) >= 0) { const bw = G.Items.held(s, a); if (!bw || !G.Bow.ready(bw)) { bw && (bw.strung = true); bw && (bw.arrows = [{ id: 1, hard: 25, sharp: 30, flex: 50 }]); }
      a.shotAt = null; G.Bow.shootDeer(s, a, d, G.Items.held(s, a)); n++; if (Math.hypot(d.pos.x - a.pos.x, d.pos.y - a.pos.y) <= C.animals.grazer.fleeWithin) bolted++; }
    if (s.animals.indexOf(d) < 0) { kills++; tries.push(n); } }
  const avg = tries.reduce((x, y) => x + y, 0) / Math.max(1, tries.length);
  ok(5 > C.animals.grazer.fleeWithin && 5 <= C.bow.shootTiles, "6 5 tiles is past the deer's bolt distance and within shootTiles", C.animals.grazer.fleeWithin + " / " + C.bow.shootTiles);
  ok(kills >= 18, "6 archer at 5 tiles kills a deer within " + N + " shots", kills + "/20, mean " + R2(avg) + " shots");
  // spear at 5: the stalk does not strike
  { const s = bare(120), o = openSpot(s, 7), a = person(s, o.x, o.y, { melee: 60 }); a.needs.fullness = 20; spear(s, a);
    const d = G.Animal.create(s, "grazer", o.x + 5, o.y, null); d.pos = { x: o.x + 5, y: o.y }; s.animals.push(d);
    a.act = { type: "walk", goal: "hunt", path: [[o.x, o.y]], i: 1, prey: d.id, since: s.tick };
    const st0 = JSON.stringify(G.Hunt.stats ? G.Hunt.stats(s) : s.huntStats || {}); G.Hunt.arriveStalk(s, a);
    const st1 = JSON.stringify(G.Hunt.stats ? G.Hunt.stats(s) : s.huntStats || {});
    ok(st0 === st1 && s.animals.indexOf(d) >= 0, "6 spear holder at 5 tiles can't strike"); }
  // recovery of hits (~0.8) and misses landing 1-3 tiles past
  { const s = bare(121), o = openSpot(s, 7), a = person(s, o.x, o.y); let back = 0, tot = 0;
    for (let k = 0; k < 400; k++) { const b = { id: 7e6 + k, x: o.x + 1, y: o.y, arrows: [{ id: 1 }, { id: 2 }] }; s.bodies.push(b); a.act = { type: "walk", goal: "meat", body: b.id, path: [], i: 0 };
      const n0 = s.items.filter(i => i.form === "arrow").length; try { G.Hunt.arriveMeat(s, a); } catch (e) {} back += s.items.filter(i => i.form === "arrow").length - n0; tot += 2;
      s.items = s.items.filter(i => i.form !== "arrow"); s.bodies = s.bodies.filter(q => q !== b); }
    ok(near(back / tot, C.bow.recoverHit, 0.05), "6 hit arrows recovered ~0.8", R2(back / tot));
    const past = []; let seen = 0, M = 300; const tx = o.x + 4, ty = o.y;
    for (let k = 0; k < M; k++) { const n0 = s.items.length; G.Bow.dropMiss(s, a, { id: k, hard: 25, sharp: 30, flex: 50 }, tx, ty); const it = s.items[s.items.length - 1];
      if (s.items.length > n0) { past.push(Math.hypot(it.x - tx, it.y - ty)); if (it.seenBy === a.id) seen++; } }
    const mx = Math.max(...past), mn = Math.min(...past);
    ok(past.length > M * 0.9 && mn >= 1 - 0.5 && mx <= 3 + 0.75, "6 a miss lands 1-3 tiles past the target", "n=" + past.length + " min " + R2(mn) + " max " + R2(mx));
    ok(near(seen / past.length, C.bow.recoverMiss, 0.07), "6 a miss is seen to fall ~0.6", R2(seen / past.length)); }
})();

// ===== 7. reed bed regrowth / Deep Cold / fire =====
(function () {
  const s = bare(39); G.Reeds.init(s); const b = (s.reedBeds || [])[0];
  ok(!!b, "7 world has reed beds", (s.reedBeds || []).length);
  const pick = () => { for (const it of s.items.slice()) if (G.Reeds.isReed(it) && it.stand && it.x === b.x && it.y === b.y) s.items.splice(s.items.indexOf(it), 1); b.n = 0; b.nextAt = null; };
  const seasonStart = idx => { const T = C.time, perS = T.daysPerSeason * 1440; let t = 0; while (G.Climate.seasonIndex(t) !== idx) t += 60; return t; };
  const standing = () => s.items.filter(it => G.Reeds.isReed(it) && it.x === b.x && it.y === b.y).length;
  s.tick = seasonStart(0); pick(); s.weather = s.weather || {};
  const rain0 = G.Reeds.rainOn; G.Reeds.rainOn = () => false;
  const run = mins => { for (let i = 0; i < mins; i += 10) { s.tick += 10; G.Reeds.step(s); } };
  run(3 * 1440 - 20); const early = standing(); run(40); const at3 = standing();
  ok(early === 0 && at3 === 1, "7 bed picked to 0 regrows 1 in Greening after 3 days", early + " -> " + at3);
  s.tick = seasonStart(3); pick(); run((C.time.daysPerSeason - 0.5) * 1440);
  ok(standing() === 0 && G.Climate.seasonIndex(s.tick) === 3, "7 no regrowth in Deep Cold (the whole season)");
  // fire clears it, and it returns when the ground regrows
  s.tick = seasonStart(0) + 7 * C.time.daysPerSeason * 1440 * 0 ; pick(); b.n = 2; for (let i = 0; i < 2; i++) { const it = item(s, "reed", b.x, b.y); it.stand = true; }
  G.Reeds.rainOn = () => false;
  const key = b.x + "," + b.y; const burn = burnTile(s, b.x, b.y); run(10); const flagged = b.burnt; const afterFire = standing();
  unburn(s, b.x, b.y, burn); let back = 0; for (let i = 0; i < 6 * 1440 && !back; i += 10) { s.tick += 10; G.Reeds.step(s); back = standing(); }
  ok(flagged && afterFire === 0 && back === 1, "7 fire clears the bed; it returns with one reed", afterFire + " -> " + back);
  G.Reeds.rainOn = rain0;
})();

// ===== 8. copy fiber; one First fiber =====
(function () {
  let copies = 0, exp = 0, N = 300;
  for (let k = 0; k < N; k++) {
    const s = bare(500 + k), o = openSpot(s, 6), a = person(s, o.x, o.y), b = person(s, o.x + 4, o.y);
    const e = G.Learn.rec(a, "fiber"); e.score = 70;
    exp += Math.min(1, Math.max(0, G.Learn.copyChance(b, "fiber") * (G.Social ? G.Social.copyFactor(a, b) : 1) * G.Learn.stageX(b, a) * (G.Moods ? G.Moods.copyMult(b, a) : 1)));
    G.Learn.success(s, a, "fiber"); if (G.Learn.has(b, "fiber")) copies++; }
  ok(near(copies / N, exp / N, 0.06), "8 watcher at 4 tiles copies fiber at the expected rate", R2(copies / N) + " vs " + R2(exp / N));
  const s = bare(39), sh = shoreSpot(s), a = person(s, sh.x, sh.y);
  for (let k = 0; k < 2; k++) { const r = item(s, "reed", sh.x, sh.y); r.soaked = true; give(s, a, r); const rock = item(s, "flint", sh.x, sh.y); G.Items.startTry(s, a, rock, "strike"); runTry(s, a); }
  ok((s.discoveries || []).filter(d => d.title === "First fiber").length === 1 && G.Fiber.stats(s).beats === 2, "8 two beats, one 'First fiber' entry");
})();


// ---------- wolf scenes ----------
const Fx = G.WolfFight, K = C.fight, FCF = C.wolfFight;
function scene(seed, r) { let s = bare(seed), o = openSpot(s, r || 8); for (let k = 1; !o && k < 20; k++) { s = bare(seed + 1000 * k); o = openSpot(s, r || 8); } const w = wolf(s, o.x, o.y, 1); s.packs[0].den = { x: o.x, y: o.y }; return { s, o, w }; }
function withCfg(obj, patch, fn) { const old = {}; for (const k in patch) { old[k] = obj[k]; obj[k] = patch[k]; } try { return fn(); } finally { for (const k in old) obj[k] = old[k]; } }

// ===== 9. weak group backs off =====
(function () {
  { const { s, o, w } = scene(9); const ps = [person(s, o.x + 2, o.y, { melee: 20 }), person(s, o.x + 2, o.y + 1, { melee: 20 }), person(s, o.x + 3, o.y, { melee: 20 })];
    const R = Fx.R(s, ps[0], w); const runs = ps.map(p => Fx.confront(s, p, w));
    ok(near(R, 0.51, 0.005) && runs.every(x => x === false) && ps.every(p => p.wolfRunAt === s.tick), "9 3 unarmed adults at melee 20 vs 1 wolf all run", "R " + R2(R)); }
  { const { s, o, w } = scene(9); wolf(s, o.x - 1, o.y, 1); wolf(s, o.x, o.y - 1, 1);
    const ps = [person(s, o.x + 2, o.y, { melee: 20 }), person(s, o.x + 2, o.y + 1, { melee: 20 }), person(s, o.x + 3, o.y, { melee: 20 })]; ps.forEach(p => spear(s, p));
    const R = Fx.R(s, ps[0], w); const runs = ps.map(p => Fx.confront(s, p, w));
    ok(near(R, 0.56, 0.005) && runs.every(x => x === false), "9 3 spears at melee 20 vs a pack of 3 run", "R " + R2(R)); }
})();

// ===== 10. skilled group engages =====
(function () {
  const huntOf = (melee, N) => { const { s, o, w } = scene(10); const ps = [person(s, o.x + 5, o.y, { melee }), person(s, o.x + 5, o.y + 1, { melee })]; ps.forEach(p => spear(s, p));
    const R0 = Fx.R(s, ps[0], w); let n = 0, started = false; const every = Math.max(1, Math.round(FCF.hunt.checkMinutes / C.time.tickGameMinutes));
    while (n < N && !started) { s.tick = (Math.floor(s.tick / every) + 1) * every; Fx.step(s); n++; started = ps.some(p => p.act && p.act.goal === "wolfHunt"); }
    return { s, o, w, ps, n, started, R0, R: Fx.R(s, ps[0], w) }; };
  const hi = huntOf(60, 400);
  ok(near(hi.R0, 1.49, 0.005) && hi.started, "10 2 spears at melee 60 start a hunt on a lone wolf", "R " + R2(hi.R0) + ", after " + hi.n + " checks");
  // ... and can kill it: both next to the wolf, strikes until it falls (cap 60)
  hi.ps.forEach((p, i) => { p.pos = { x: hi.o.x + 1, y: hi.o.y + i }; p.needs.energy = 90; p.injuries = []; });
  let k = 0; while (k++ < 60 && hi.s.animals.indexOf(hi.w) >= 0) { hi.s.tick++; hi.ps.forEach(p => { p.injuries = []; p.needs.energy = 90; }); Fx.strike(hi.s, hi.ps[0], hi.w); }
  ok(hi.s.animals.indexOf(hi.w) < 0, "10 ... and can kill it", k + " strikes");
  const lo = huntOf(20, 400);
  ok(near(lo.R0, 1.12, 0.005) && Fx.stands(lo.s, lo.ps[0], lo.w) && !lo.started, "10 2 spears at melee 20 stand but never start one in 400 checks", "R " + R2(lo.R0));
})();

// ===== 11. separate growth =====
(function () {
  withCfg(FCF, { maxChance: 0, biteChance: 0 }, () => {
    const { s, o, w } = scene(11); const a = person(s, o.x + 1, o.y, { melee: 20, ranged: 20 }); spear(s, a);
    const al = person(s, o.x + 1, o.y + 1, { melee: 100 });   // a bare-handed ally so she stands (not an attacker: nothing in hand)
    for (let i = 0; i < 5; i++) { s.tick++; Fx.strike(s, a, w); }
    ok(score(a, "melee") === 40 && score(a, "ranged") === 20, "11 5 spear strikes at a wolf: melee +20, ranged unchanged", score(a, "melee") + " / " + score(a, "ranged"));
    const b = person(s, o.x + 5, o.y, { melee: 20, ranged: 20 }); bow(s, b, 6); a.pos = { x: o.x + 7, y: o.y + 7 }; al.pos = { x: o.x + 5, y: o.y + 1 };
    for (let i = 0; i < 5; i++) { s.tick += 20; b.shotAt = null; Fx.strike(s, b, w); }
    ok(score(b, "ranged") === 40 && score(b, "melee") === 20, "11 5 shots at a wolf: ranged +20, melee unchanged", score(b, "melee") + " / " + score(b, "ranged"));
  });
  { const s = bare(11), o = openSpot(s, 7), a = person(s, o.x, o.y, { melee: 20, ranged: 20 }); a.needs.fullness = 20; spear(s, a);
    const d = G.Animal.create(s, "grazer", o.x + 1, o.y, null); d.pos = { x: o.x + 1, y: o.y }; s.animals.push(d);
    const odds0 = G.Hunt.odds; G.Hunt.odds = () => 1; G.Hunt.strike(s, a, d, G.Items.held(s, a)); G.Hunt.odds = odds0;
    ok(s.animals.indexOf(d) < 0 && score(a, "melee") === 23 && score(a, "ranged") === 20, "11 spear deer kill: melee +3", score(a, "melee") + " / " + score(a, "ranged")); }
  { const s = bare(11), o = openSpot(s, 7), a = person(s, o.x, o.y, { melee: 20, ranged: 20 }); a.needs.fullness = 20; bow(s, a, 6);
    const d = G.Animal.create(s, "grazer", o.x + 5, o.y, null); d.pos = { x: o.x + 5, y: o.y }; s.animals.push(d);
    const bw0 = score(a, "bow"), hit0 = G.Bow.hit; G.Bow.hit = () => 1; G.Bow.shootDeer(s, a, d, G.Items.held(s, a)); G.Bow.hit = hit0;
    ok(s.animals.indexOf(d) < 0 && score(a, "ranged") === 23 && score(a, "melee") === 20 && R2(score(a, "bow") - bw0) === C.bow.killGain, "11 bow deer kill: ranged +3 (and bow +20)", score(a, "ranged") + ", bow " + bw0 + " -> " + score(a, "bow")); }
  { const { s, o, w } = scene(11); const b = person(s, o.x + 5, o.y, { melee: 20, ranged: 20 }); bow(s, b, 6);
    G.WolfFear.onAttack(s, b); ok(score(b, "melee") === 25 && score(b, "ranged") === 20, "11 surviving a bite: melee +5 even for an archer", score(b, "melee")); }
  withCfg(FCF, { maxChance: 1, oddsX: 100 }, () => {
    const { s, o, w } = scene(11); const a = person(s, o.x + 1, o.y, { melee: 20, ranged: 20 }), b = person(s, o.x + 5, o.y, { melee: 20, ranged: 20 }); spear(s, a); bow(s, b, 6);
    Fx.strike(s, a, w);
    ok(s.animals.indexOf(w) < 0 && score(a, "melee") === 34 && score(a, "ranged") === 20 && score(b, "ranged") === 34 && score(b, "melee") === 20,
      "11 shared wolf kill: +10 to the skill each attacker used (+4 for the strike/shot)", "spear " + score(a, "melee") + "/" + score(a, "ranged") + ", archer " + score(b, "melee") + "/" + score(b, "ranged"));
  });
})();

// ===== 12. separate copying =====
(function () {
  const trial = (key, other, N) => { let copied = 0, crossed = 0; const s = bare(12), o = openSpot(s, 6);
    for (let k = 0; k < N; k++) { s.agents = []; s.tick += 1441; const a = person(s, o.x, o.y, { melee: 80, ranged: 80 }), b = person(s, o.x + 4, o.y, { melee: 20, ranged: 20 });
      G.Skills.gain(s, a, key, key === "melee" ? "animalStrike" : "animalShot"); if (score(b, key) > 20) copied++; if (score(b, other) !== 20) crossed++; }
    return { copied, crossed }; };
  const m = trial("melee", "ranged", 200), r = trial("ranged", "melee", 200);
  ok(m.copied > 0 && m.crossed === 0, "12 a melee gain: watcher may copy melee, never ranged", "copied " + m.copied + "/200, ranged changed " + m.crossed);
  ok(r.copied > 0 && r.crossed === 0, "12 a ranged gain: watcher may copy ranged, never melee", "copied " + r.copied + "/200, melee changed " + r.crossed);
})();

// ===== 13. weapon -> skill mapping =====
(function () {
  const { s, o, w } = scene(13); const a = person(s, o.x + 1, o.y, { melee: 60, ranged: 20 });
  const st = () => R2(Fx.strength(s, a, w));
  spear(s, a); const sp = st(); G.Items.drop(s, a); a.carry = null; const bareH = st();
  bow(s, a, 6); a.pos = { x: o.x + 5, y: o.y }; const b5 = st(); a.pos = { x: o.x + 7, y: o.y }; const b7 = st();
  a.pos = { x: o.x + 5, y: o.y }; G.Items.held(s, a).arrows = []; const empty = st();
  ok(sp === 48 && bareH === 23 && b5 === 19 && b7 === 0 && empty === 23, "13 melee 60 / ranged 20: spear 48, bare 23, bow@5 19, bow@7 0, empty bow = bare", [sp, bareH, b5, b7, empty].join(" / "));
  const pair = (twoSpears) => { const q = scene(13); const p1 = person(q.s, q.o.x + 1, q.o.y, { melee: 60, ranged: 20 }), p2 = person(q.s, q.o.x + (twoSpears ? 1 : 3), q.o.y + (twoSpears ? 1 : 0), { melee: 60, ranged: 20 });
    spear(q.s, p1); if (twoSpears) spear(q.s, p2); else bow(q.s, p2, 6); const R = Fx.R(q.s, p1, q.w); return { R, stand: Fx.stands(q.s, p1, q.w), hunt: R >= K.engageAt - 1e-9 }; };
  const sb = pair(false), ss = pair(true);
  ok(near(sb.R, 1.04, 0.005) && sb.stand && !sb.hunt, "13 spear + bow -> R 1.04 stand, no hunt", R2(sb.R));
  ok(near(ss.R, 1.49, 0.005) && ss.hunt, "13 two spears -> R 1.49 hunt", R2(ss.R));
})();

// ===== 14. archer shifts it =====
(function () {
  const sa = rg => { const q = scene(14); const p1 = person(q.s, q.o.x + 1, q.o.y, { melee: 20 }), p2 = person(q.s, q.o.x + 3, q.o.y, { melee: 20, ranged: rg }); spear(q.s, p1); bow(q.s, p2, 6);
    return { q, p1, p2, R: Fx.R(q.s, p1, q.w) }; };
  const a20 = sa(20), a60 = sa(60);
  ok(near(a20.R, 0.86, 0.005) && Fx.stands(a20.q.s, a20.p1, a20.q.w) && a20.R < K.engageAt, "14 spear + archer at ranged 20: stands, no hunt", R2(a20.R));
  ok(near(a60.R, 1.29, 0.005) && a60.R >= K.engageAt, "14 ... archer at ranged 60: hunts", R2(a60.R));
  withCfg(FCF, { maxChance: 0, biteChance: 1 }, () => { const { q, p1, p2 } = a60; let bitP1 = 0, bitP2 = 0; const on0 = G.WolfFear.onAttack;
    G.WolfFear.onAttack = function (sim, v) { if (v === p1) bitP1++; if (v === p2) bitP2++; return on0.apply(this, arguments); };
    for (let i = 0; i < 100; i++) { q.s.tick += 20; p2.shotAt = null; const g = G.Items.held(q.s, p2); g.arrows = [{ id: 1, hard: 25, sharp: 30, flex: 50 }]; g.strung = true;
      p1.injuries = []; p2.injuries = []; p1.needs.energy = 90; p2.needs.energy = 90; p1.wolfFear = p2.wolfFear = G.WolfFear.base(); p1.fright = p2.fright = null;
      setSkill(p1, "melee", 20); setSkill(p2, "ranged", 60); if (!G.Items.held(q.s, p1) || !G.Items.held(q.s, p1).tool) spear(q.s, p1); Fx.strike(q.s, p1, q.w); }
    G.WolfFear.onAttack = on0;
    ok(bitP1 === 100 && bitP2 === 0, "14 archers at range are never bitten (bite chance forced to 1)", "spear bitten " + bitP1 + "/100, archer " + bitP2 + "/100"); });
  { const q = scene(14); const p = person(q.s, q.o.x + 4, q.o.y, { ranged: 100 }); bow(q.s, p, 6); hide(q.s, p); const R = Fx.R(q.s, p, q.w);
    let started = false; const every = Math.max(1, Math.round(FCF.hunt.checkMinutes / C.time.tickGameMinutes));
    for (let n = 0; n < 400 && !started; n++) { q.s.tick = (Math.floor(q.s.tick / every) + 1) * every; Fx.step(q.s); started = p.act && p.act.goal === "wolfHunt"; }
    ok(near(R, 1.09, 0.005) && !started, "14 a lone archer at ranged 100 with a hide never starts a hunt (400 checks)", R2(R)); }
})();

// ===== 15. momentum =====
(function () {
  { const q = scene(15); const a = person(q.s, q.o.x + 4, q.o.y, { melee: 60 }), b = person(q.s, q.o.x + 4, q.o.y + 1, { melee: 60 }); spear(q.s, a);
    const R0 = Fx.R(q.s, a, q.w), c = person(q.s, q.o.x + 4, q.o.y - 6, { melee: 60 }); spear(q.s, c);
    c.act = { type: "walk", goal: "wolfHunt", path: [[q.o.x + 1, q.o.y]], i: 0, wolf: q.w.id, since: q.s.tick };
    const every = Math.max(1, Math.round(FCF.hunt.checkMinutes / C.time.tickGameMinutes)); q.s.tick = (Math.floor(q.s.tick / every) + 1) * every;
    c.wolfCommitAt = null; Fx.step(q.s); const joinedNo = a.act && a.act.goal === "wolfHunt";
    c.wolfCommitAt = q.s.tick; const R1 = Fx.R(q.s, a, q.w); Fx.step(q.s); const joined = a.act && a.act.goal === "wolfHunt";
    ok(near(R0, 1.1, 0.01) && Fx.stands(q.s, a, q.w) && R0 < K.engageAt && !joinedNo, "15 armed person at R 1.1 stands, does not join on her own", R2(R0));
    ok(near(R1, 1.25, 0.01) && joined, "15 ... joins once she sees one ally commit (R 1.25)", R2(R1)); }
  { const q = scene(15); const a = person(q.s, q.o.x + 2, q.o.y, { melee: 70 }); spear(q.s, a); const R0 = Fx.R(q.s, a, q.w), st0 = Fx.stands(q.s, a, q.w);
    const d = person(q.s, q.o.x + 2, q.o.y + 6, { melee: 20 }); d.wolfRunAt = q.s.tick; const R1 = Fx.R(q.s, a, q.w); const res = Fx.confront(q.s, a, q.w);
    ok(near(R0, 0.79, 0.01) && st0 && near(R1, 0.64, 0.01) && res === false && a.wolfRunAt === q.s.tick, "15 a person at R 0.8 stands, runs once she sees one ally run (R 0.65)", R2(R0) + " -> " + R2(R1)); }
})();

// ===== 16. cornered: desperate defence =====
(function () {
  const WATER = Object.keys(G.data.tiles).map(Number).find(k => G.data.tiles[k].water);
  const pin = (seed, holdBow) => { const q = scene(seed, 6), ws = q.s.world, o = q.o; q.w.pos = { x: o.x + 1, y: o.y };
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx < 0 || Math.abs(dy) >= 2 || dx >= 2) ws.tiles[(o.y + dy) * ws.w + (o.x + dx)] = WATER;
    const p = person(q.s, o.x, o.y, { melee: 20 }); if (holdBow) bow(q.s, p, 0); return Object.assign(q, { p }); };
  const rate = (holdBow, N) => { const q = pin(16, holdBow); let wounds = 0, kills = 0, rolls = 0, den = 0;
    const cornered = Fx.cornered(q.s, q.p, q.w), stands = Fx.stands(q.s, q.p, q.w);
    for (let i = 0; i < N; i++) { let w = q.w; if (q.s.animals.indexOf(w) < 0) { w = q.w = wolf(q.s, q.o.x + 1, q.o.y, 1); } w.woundedUntil = null; w.memory = []; w.caution = { v: 0, t: null }; w.pos = { x: q.o.x + 1, y: q.o.y }; w.act = { type: "idle", until: q.s.tick + 9 };
      const m0 = score(q.p, "melee"); setSkill(q.p, "melee", 20); const sk = G.Skills.stats(q.s), k0 = sk.desperateKills, w0 = sk.wounds;
      Fx.desperate(q.s, w, q.p); rolls++; if (sk.desperateKills > k0) kills++; else if (sk.wounds > w0) { wounds++; if (w.act && (w.act.goal === "den" || w.act.type === "idle")) den++; }
      q.s.tick += 1; }
    return { cornered, stands, rate: wounds / (rolls - kills), kills, wounds, den, exp: K.desperate.wound + 20 / 100 * K.desperate.woundSkill }; };
  const a = rate(false, 3000), b = rate(true, 3000);
  ok(a.cornered && a.stands, "16 a lone unarmed person pinned against water is cornered: stands (no flee)");
  ok(near(a.rate, a.exp, 0.025), "16 bare hands at melee 20 wound the wolf ~0.14 of strikes", R2(a.rate) + " (" + a.wounds + " wounds, " + a.kills + " kills / 3000)");
  ok(near(b.rate, a.exp, 0.025) && G.WolfFight.heldValue(pin(17, true).s, pin(17, true).p) === 0, "16 holding a bow gives the same rate (bow held 0)", R2(b.rate));
  ok(a.den === a.wounds, "16 a wounded wolf goes to its den", a.den + "/" + a.wounds);
  // the hook: animal.js asks desperate() before the wolf's close damage
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "src/animal.js"), "utf8");
  ok(/G\.WolfFight\.desperate\s*&&\s*G\.WolfFight\.desperate\(sim, a, p\)\) return;/.test(src), "16 every wolf strike on a person rolls desperate defence first (animal.js hook)");
})();

// ===== 17-18. sparring =====
const SP = C.spar, Spar = G.Spar, TMn = C.time.tickGameMinutes;
function likeSet(a, b, l) { (a.rel = a.rel || {})[b.id] = { f: 50, l, m: 0, d: 0 }; }
function drive(s, n, until) { for (let i = 0; i < n; i++) { s.tick++; for (const a of s.agents.slice()) if (a.act && G.V39.acts[a.act.type]) G.V39.stepAct(s, a); if (until && until()) return i + 1; } return n; }
function sparScene(seed, o2) { const s = bare(seed), o = openSpot(s, 6), g = 70; s.groups = [{ id: g, members: [] }];
  const a = person(s, o.x, o.y, { melee: 40, group: g }), b = person(s, o.x + 1, o.y, { melee: 40, group: g });
  s.groups[0].members = [a.id, b.id]; likeSet(a, b, 80); likeSet(b, a, 80); a.wolfCommitAt = s.tick; s.speech = { locks: {} }; return { s, o, a, b, g }; }
const isAction = t => !/"/.test(t) && !/\b(says|said|calls out|calls back|word)\b/i.test(t);
(function () {
  // order-independent: inviter first and inviter second in the agent list
  for (const order of ["inviter first", "inviter second"]) {
    const { s, o, a, b } = sparScene(17); const w = person(s, o.x + 3, o.y, { melee: 20, group: 70 }); s.groups[0].members.push(w.id);
    if (order === "inviter second") s.agents = [b, a, w];
    const log0 = s.log.length, m0 = [score(a, "melee"), score(b, "melee")];
    ok(Spar.words(s, a).length === 0, "17 fixture: group with 0 words (" + order + ")");
    Spar.invite(s, a, b, { agree: true });
    drive(s, 200, () => s.sparStats.bouts >= 1 && a.act.type !== "spar" && b.act.type !== "spar");
    const lines = texts(s).slice(log0);
    ok(s.sparStats.bouts === 1 && score(a, "melee") === m0[0] + 2 && score(b, "melee") === m0[1] + 2 && G.Learn.has(a, "spar") && G.Learn.has(b, "spar"),
      "17 stance -> copy -> bout: +2 melee each, both gain spar (" + order + ")", score(a, "melee") + "/" + score(b, "melee"));
    ok(lines.length >= 3 && lines.every(isAction) && lines.some(t => /stance/.test(t)) && lines.some(t => /copies/.test(t)) && lines.some(t => /wrestles/.test(t)),
      "17 every log line is action-only (stance, copying, wrestling) (" + order + ")", JSON.stringify(lines));
    // once a day: a second agreed invite the same day gets no bout
    Spar.invite(s, a, b, { agree: true }); drive(s, 60);
    ok(s.sparStats.bouts === 1, "17 at most one bout a day each (" + order + ")", "bouts " + s.sparStats.bouts);
  }
  { // cap 50 and many days: one First sparring, a watcher copies spar
    const { s, o, a, b } = sparScene(171); setSkill(a, "melee", 49); setSkill(b, "melee", 49); const w = person(s, o.x + 3, o.y, { melee: 20, group: 70 });
    let copied = false, maxM = 0;
    for (let d = 0; d < 30; d++) { s.tick += DAY; a.act = { type: "idle", until: s.tick + 1e6 }; b.act = { type: "idle", until: s.tick + 1e6 }; a.needs.energy = b.needs.energy = 90;
      Spar.invite(s, a, b, { agree: true }); drive(s, 60); maxM = Math.max(maxM, score(a, "melee"), score(b, "melee")); if (G.Learn.has(w, "spar")) copied = true; }
    ok(s.sparStats.bouts === 30 && maxM === 50, "17 sparring melee never above 50 (30 bouts from 49)", "bouts " + s.sparStats.bouts + " max " + maxM);
    ok((s.discoveries || []).filter(d => d.title === "First sparring").length === 1, "17 one 'First sparring' entry");
    ok(copied, "17 a watcher copies spar", "watcher spar " + score(w, "spar")); }
  { const { s, a, b } = sparScene(172); const m0 = score(b, "melee"); Spar.invite(s, a, b, { agree: false }); const t0 = s.tick; drive(s, Math.round(SP.answerMinutes / TMn) + 2);
    ok(s.sparStats.bouts === 0 && score(b, "melee") === m0 && a.act.type !== "sparStance", "17 no copy within 10 min -> no bout"); }
})();
(function () {
  const refuse = (setup, label) => { const q = sparScene(18); setup(q); const m0 = [score(q.a, "melee"), score(q.b, "melee")]; Spar.invite(q.s, q.a, q.b); const t0 = q.s.tick;
    drive(q.s, Math.round(SP.answerMinutes / TMn) + 2);
    const wait = q.a.sparRetryAt != null ? (q.a.sparRetryAt - (t0 + Math.round(SP.answerMinutes / TMn))) * TMn : null;
    ok(q.s.sparStats.bouts === 0 && q.s.sparStats.refused === 1 && score(q.a, "melee") === m0[0] && score(q.b, "melee") === m0[1] && wait === SP.retryMinutes,
      "18 " + label + " -> refused, no gain, inviter waits 240 min", "wait " + wait); return q; };
  let all = true; for (let k = 0; k < 40; k++) { const q = sparScene(1800 + k); likeSet(q.b, q.a, 59); if (Spar.agrees(q.s, q.b, q.a)) all = false; } ok(all, "18 liking 59: never agrees (40 rolls)");
  for (const nd of ["fullness", "water", "warmth"]) { let any = false; for (let k = 0; k < 40; k++) { const q = sparScene(1900 + k); q.b.needs[nd] = 39; if (Spar.agrees(q.s, q.b, q.a)) any = true; } ok(!any, "18 " + nd + " 39: never agrees (40 rolls)"); }
  refuse(q => likeSet(q.b, q.a, 59), "liking 59");
  refuse(q => { q.b.needs.fullness = 30; }, "need under 40");
  // after language: a stance + a shared word
  { const q = sparScene(181); q.s.speech = { locks: { k1: { group: 70, token: "t", meaning: "food", word: "ba", holders: 2 } } };
    ok(Spar.words(q.s, q.a).length === 1, "18 fixture: group has a shared word");
    Spar.invite(q.s, q.a, q.b, { agree: true, word: true }); const ln = texts(q.s).slice(-1)[0];
    drive(q.s, 200, () => q.s.sparStats.bouts >= 1 && q.a.act.type !== "spar");
    ok(/"ba"/.test(ln) && q.s.sparStats.wordInvites === 1 && q.s.sparStats.bouts === 1, "18 after language: a stance + shared word invites -> bout", ln);
    const r = sparScene(182); r.s.speech = q.s.speech; likeSet(r.b, r.a, 59); Spar.invite(r.s, r.a, r.b, { word: true }); drive(r.s, 12);
    ok(r.s.sparStats.bouts === 0 && r.s.sparStats.refused === 1, "18 ... the same agreement rules apply (liking 59 refused)"); }
  // invent rule only, while nobody holds spar
  { let inv = 0, lowInv = 0, noFight = 0; const hr = Math.round(60 / TMn);
    for (let k = 0; k < 30; k++) { const q = sparScene(1830 + k); q.a.traits.curiosity = 100;
      for (let h = 0; h < 24 * 3; h++) { q.s.tick += hr; q.a.act = { type: "idle", until: q.s.tick + 1e6 }; q.b.act = { type: "idle", until: q.s.tick + 1e6 }; q.a.wolfCommitAt = q.s.tick; q.a.sparRetryAt = null; q.a.sparNext = null;
        if (Spar.maybe(q.s, q.a)) { inv++; break; } }
      const lo = sparScene(1860 + k); setSkill(lo.a, "melee", C.spar.minMelee - 1); lo.a.traits.curiosity = 100;
      const nf = sparScene(1890 + k); nf.a.wolfCommitAt = null; nf.a.traits.curiosity = 100;
      for (let h = 0; h < 24 * 3; h++) for (const z of [lo, nf]) { z.s.tick += hr; z.a.act = { type: "idle", until: z.s.tick + 1e6 }; if (z === lo) z.a.wolfCommitAt = z.s.tick; if (Spar.maybe(z.s, z.a)) { if (z === lo) lowInv++; else noFight++; } } }
    // v39 tune (Judge): config spar.needRecentFight false -> a fight is no longer required; with it true the old rule holds
    let nfOn = 0; const nr0 = C.spar.needRecentFight; C.spar.needRecentFight = true;
    try { for (let k = 0; k < 30; k++) { const nf = sparScene(1890 + k); nf.a.wolfCommitAt = null; nf.a.traits.curiosity = 100;
      for (let h = 0; h < 24 * 3; h++) { nf.s.tick += hr; nf.a.act = { type: "idle", until: nf.s.tick + 1e6 }; if (Spar.maybe(nf.s, nf.a)) { nfOn++; break; } } } } finally { C.spar.needRecentFight = nr0; }
    ok(inv > 0 && lowInv === 0 && (C.spar.needRecentFight ? noFight === 0 : noFight > 0) && nfOn === 0, "18 nobody holds spar: invites only via the invent rule (melee >= spar.minMelee " + C.spar.minMelee + "; a recent fight only if spar.needRecentFight)",
      "invented " + inv + "/30, melee " + (C.spar.minMelee - 1) + ": " + lowInv + ", no fight (needRecentFight " + C.spar.needRecentFight + "): " + noFight + ", no fight with needRecentFight true: " + nfOn); }
  { // no bout without the other's answer: startBout is only called from stepStance once answered
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "src/spar.js"), "utf8").split("Spar.fixture = function")[0], calls = src.match(/Spar\.startBout\(sim/g) || [];
    let ok2 = true; for (let k = 0; k < 50; k++) { const q = sparScene(2000 + k); Spar.invite(q.s, q.a, q.b); drive(q.s, 40); if (q.s.sparStats.bouts > q.s.sparStats.invites - q.s.sparStats.refused) ok2 = false;
      if (q.s.sparStats.bouts && !texts(q.s).some(t => /copies the stance/.test(t))) ok2 = false; }
    ok(calls.length === 1 && ok2, "18 nobody starts a bout without the other's answer (50 random invites)", "startBout call sites outside the test-only Spar.fixture: " + calls.length); }
})();

// ===== 19-21, 23-24, Director: wolf memory =====
const WMm = G.WolfMem, MC = C.wolfMemory;
function memScene(seed) { const q = scene(seed, 8), s = q.s; s.groups = [{ id: 5, members: [] }, { id: 6, members: [] }];
  const ena = person(s, q.o.x + 8, q.o.y, { group: 5 }), kin = person(s, q.o.x + 8, q.o.y + 2, { group: 5 }), other = person(s, q.o.x - 8, q.o.y, { group: 6 });
  ena.name = "Ena"; s.groups[0].members = [ena.id, kin.id]; s.groups[1].members = [other.id]; return Object.assign(q, { ena, kin, other }); }
const ent = (w, p) => w.memory.find(e => e.who === p.id), gEnt = (w, g) => w.memory.find(e => e.who == null && e.group === g);
(function () {
  const q = memScene(19), { s, w, ena, kin, other } = q; WMm.onWound(s, w, [ena], false); w.woundedUntil = null;
  ok(ent(w, ena).s === 60 && gEnt(w, 5).s === 50 && gEnt(w, 5).members.length === 2, "19 a wolf wounded by Ena holds Ena 60, her group 50", ent(w, ena).s + "/" + gEnt(w, 5).s);
  const stranger = person(s, ena.pos.x, ena.pos.y + 3, { group: 6 });
  ok(!WMm.mayTarget(s, w, ena) && !WMm.mayTarget(s, w, stranger), "19 won't target Ena or a non-member within 3 tiles of her");
  stranger.pos = { x: ena.pos.x - 20, y: ena.pos.y }; let any = false; for (let i = 0; i < 20; i++) { s.tick += 30; if (WMm.mayTarget(s, w, other)) any = true; }
  ok(WMm.mayTarget(s, w, other) && any, "19 still targets a lone person from another group");
})();
// a wolf run in the full sim near pinned people: min distance to Ena (memory) vs control (no memory)
function wolfRun(seed, withMem, starving, ticks, hold60) { const q = memScene(seed), { s, w, ena, kin } = q;
  s.agents = [ena, kin]; s.groups[1].members = []; kin.pos = { x: ena.pos.x, y: ena.pos.y + 2 };
  for (const p of s.agents) { p.wolfFear = G.WolfFear.base(); }
  if (withMem) { WMm.onWound(s, w, [ena], false); w.woundedUntil = null; w.caution = { v: 0, t: null }; }
  w.pos = { x: ena.pos.x - 8, y: ena.pos.y }; if (starving) { w.needs = w.needs || {}; w.needs.fullness = 0; } w.act = { type: "idle", until: s.tick + 1 };
  const pins = s.agents.map(p => ({ p, x: p.pos.x, y: p.pos.y })); let minE = 1e9, minK = 1e9, bitten = 0, minSlack = 1e9; const on0 = G.WolfFear.onAttack;
  G.WolfFear.onAttack = function (sim, v) { bitten++; return on0.apply(this, arguments); };
  const ka0 = WMm.keepAway; if (process.env.DBG) WMm.keepAway = function (sim, ww) { const r = ka0.apply(this, arguments); console.log("DBG ka t" + sim.tick, r, JSON.stringify(ww.act).slice(0, 120)); return r; };
  try { for (let t = 0; t < ticks; t++) { for (const z of pins) { z.p.pos = { x: z.x, y: z.y }; z.p.act = { type: "idle", until: s.tick + 1e6 }; z.p.needs.fullness = 90; z.p.needs.water = 90; z.p.needs.warmth = 90; z.p.needs.energy = 90; z.p.injuries = []; }
      if (starving) w.needs.fullness = 0; if (withMem && hold60) { const e = ent(w, ena); if (e) { e.s = 60; e.t = s.tick + 1; } } G.Sim.step(s); if (s.animals.indexOf(w) < 0) break;
      { const dE = Math.hypot(w.pos.x - ena.pos.x, w.pos.y - ena.pos.y); if (process.env.DBG && dE < 5) console.log("DBG t" + t, R2(dE), "ena", ena.pos.x, ena.pos.y, "sE", R2(WMm.sFor(s, w, ena)), "tc", WMm.tooClose(s, w, w.pos.x, w.pos.y), "agents", s.agents.length, s.agents.map(p => p.name + "@" + R2(p.pos.x) + "," + R2(p.pos.y)).join(" "), JSON.stringify(w.act).slice(0, 200), w.pos.x, w.pos.y); minE = Math.min(minE, dE); if (withMem) { const sv = WMm.sFor(s, w, ena), kp = WMm.keepDist(sv); minSlack = Math.min(minSlack, dE - kp); } } minK = Math.min(minK, Math.hypot(w.pos.x - kin.pos.x, w.pos.y - kin.pos.y)); } }
  finally { G.WolfFear.onAttack = on0; WMm.keepAway = ka0; }
  return { minE: R2(minE), minK: R2(minK), slack: R2(minSlack), bitten, keeps: (s.wolfMem || {}).keeps || 0 }; }
(function () {
  const m = wolfRun(19, true, true, 720, true), c = wolfRun(19, false, true, 720), d = wolfRun(19, true, true, 2880, false);
  const K60 = 2 + 5 * (60 - 30) / 70;   // the Judge's formula, written out (4.142857...)
  ok(m.minE >= K60 - 1e-6 && m.bitten === 0 && c.bitten > 0, "19 stays >= 2 + 5x(60-30)/70 = " + R2(K60) + " tiles from Ena held at s 60 (12 h full sim)", "min " + m.minE + ", bites " + m.bitten + ", keeps " + m.keeps + " | control without memory: min " + c.minE + ", bites " + c.bitten);
  ok(d.slack >= -1e-6 && d.bitten === 0, "19 ... with decay over 2 days it keeps its formula distance (keep = 2 + 5 x (s - 30) / 70, clamped 2-7)", "min distance " + d.minE + ", min slack " + d.slack);
})();
(function () {
  // v39 Judge: keep-away is a slope, no rounding: keep(s) = 2 + 5 x (s - 30) / 70 clamped to 2..7; below 30 no avoidance (wary only)
  const f = sv => sv < 30 ? 0 : Math.max(2, Math.min(7, 2 + 5 * (sv - 30) / 70));
  const pts = [0, 10, 29, 29.99, 30, 31, 45, 50, 60, 66, 80, 99, 100, 120, 200]; let bad = [];
  for (const sv of pts) if (Math.abs(WMm.keepDist(sv) - f(sv)) > 1e-9) bad.push(sv + ": " + WMm.keepDist(sv) + " vs " + f(sv));
  ok(!bad.length, "keep-away slope: WolfMem.keepDist(s) === 2 + 5x(s-30)/70 clamped 2-7, 0 below 30 (15 points)", bad.join("; ") || pts.map(sv => sv + "->" + R2(WMm.keepDist(sv))).join(" "));
  ok(WMm.keepDist(100) === 7 && Math.abs(WMm.keepDist(66) - 4.5714285714) < 1e-9 && WMm.keepDist(30) === 2 && WMm.keepDist(29.99) === 0 && Math.abs(WMm.keepDist(60) - 30 / 7) > 0.1 && Math.abs(WMm.keepDist(60) - 29 / 7) < 1e-9,
    "keep-away slope: 7 at s 100, 4.571 at 66, 2 at 30, none at 29.99, 4.143 at 60 (no rounding)", [100, 66, 60, 30, 29.99].map(sv => sv + "->" + WMm.keepDist(sv)).join(" "));
  let mono = true; for (let sv = 30; sv < 100; sv += 0.5) if (!(WMm.keepDist(sv + 0.5) > WMm.keepDist(sv))) mono = false;
  ok(mono, "keep-away slope: strictly rising from s 30 to 100 in 0.5 steps (no flat steps from rounding)");
  ok(MC.avoidAt === 30 && MC.keepMin === 2 && MC.keepMax === 7 && MC.keepFullAt === 100 && MC.keepTiles === undefined && MC.keepPer === undefined, "keep-away slope: threshold/min/max/full live in config.wolfMemory (avoidAt 30, keepMin 2, keepMax 7, keepFullAt 100); old keepTiles/keepPer gone");
  // below 30: no avoidance, no keep - a wolf holding Ena at 29 may still target her and has no keep distance
  const q = memScene(1901), { s, w, ena } = q; WMm.onWound(s, w, [ena], false); w.woundedUntil = null; w.caution = { v: 0, t: null };
  const e = ent(w, ena); e.s = 29; e.t = s.tick; if (e.near) e.near = false; const g = gEnt(w, 5); if (g) { g.s = 0; }
  w.memory = w.memory.filter(x => x === e);
  const sv = WMm.sFor(s, w, ena); let hit = false; for (let i = 0; i < 200 && !hit; i++) { if (WMm.mayTarget(s, w, ena)) hit = true; s.tick += 1; }
  ok(sv < 30 && hit && !WMm.tooClose(s, w, ena.pos.x + 0.5, ena.pos.y, 0), "keep-away slope: s 29 -> no avoidance and no keep (targetable, may stand 0.5 tiles away)", "s " + R2(sv) + ", targetable " + hit);
})();
(function () {
  const q = memScene(20), { s, w, ena, other } = q; WMm.onWound(s, w, [ena], false); w.woundedUntil = null; w.caution = { v: 0, t: null }; const t0 = s.tick;
  s.agents = [ena, other]; other.pos = { x: ena.pos.x - 30, y: ena.pos.y };
  s.tick = t0 + 10 * DAY; const s10 = WMm.sNow(s, ent(w, ena));
  ok(near(s10, 30) && !WMm.mayTarget(s, w, ena), "20 after 10 days Ena's entry is 30 -> still avoided", s10);
  s.tick = t0 + 10 * DAY + 1; let okN = 0, N = 0; for (let i = 0; i < 400; i++) { s.tick += Math.round(MC.waryRecheckMinutes / TMn); const sv = WMm.sFor(s, w, ena); if (sv < 25) break; N++; if (WMm.mayTarget(s, w, ena)) okN++; }
  ok(N > 50 && okN > 0 && okN < N, "20 just past 10 days: targetable at a reduced start chance", okN + "/" + N + " (~" + R2(1 - 29 / 100) + ")");
  s.tick = t0 + 26 * DAY; WMm.prune(s, w); const e26 = ent(w, ena);
  s.tick = t0 + Math.floor(25.8 * DAY); const q2 = memScene(20); WMm.onWound(q2.s, q2.w, [q2.ena], false); q2.s.tick += Math.floor(25.8 * DAY); WMm.prune(q2.s, q2.w);
  ok(!e26 && !!ent(q2.w, q2.ena), "20 after 26 days the entry is gone (still there at 25.8)", "26d: " + JSON.stringify(e26 || null) + " 25.8d: " + JSON.stringify(ent(q2.w, q2.ena) || null));
  const q3 = memScene(201); WMm.onWound(q3.s, q3.w, [q3.ena], false); const g = gEnt(q3.w, 5), t3 = q3.s.tick; let dayAt = null;
  for (let d = 0; d < 10 * DAY; d++) { q3.s.tick = t3 + d; if (WMm.sNow(q3.s, g) < MC.avoidAt) { dayAt = R2(d / DAY); break; } }
  ok(dayAt != null && near(dayAt, 7.37, 0.05), "20 the group entry drops under 30 at ~7.4 days", dayAt);
})();
(function () {
  const q = memScene(21), { s, w, ena } = q; const mate = wolf(s, w.pos.x + 5, w.pos.y, 1), far = wolf(s, w.pos.x + 7, w.pos.y, 1), alien = wolf(s, w.pos.x + 2, w.pos.y, 2);
  WMm.onWound(s, w, [ena], false);
  ok(ent(mate, ena).s === 30 && gEnt(mate, 5).s === 25 && WMm.cNow(s, mate) === 10, "21 a packmate within 6 tiles sees the wound: 30 / 25, caution +10", ent(mate, ena).s + "/" + gEnt(mate, 5).s + " c" + WMm.cNow(s, mate));
  ok(!far.memory.length && !alien.memory.length && !WMm.cNow(s, far) && !WMm.cNow(s, alien), "21 a wolf outside 6 tiles or in another pack learns nothing");
  const q2 = memScene(211); const m2 = wolf(q2.s, q2.w.pos.x + 4, q2.w.pos.y, 1), at = { x: q2.w.pos.x, y: q2.w.pos.y }; q2.s.animals.splice(q2.s.animals.indexOf(q2.w), 1);
  WMm.onKilled(q2.s, 1, at, [q2.ena]);
  ok(ent(m2, q2.ena).s === 48 && gEnt(m2, 5).s === 40 && WMm.cNow(q2.s, m2) === 20, "21 a packmate killed in sight: 48 / 40, caution +20", ent(m2, q2.ena).s + "/" + gEnt(m2, 5).s + " c" + WMm.cNow(q2.s, m2));
  // the kill hook calls onKilled
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "src/fight39.js"), "utf8") + require("fs").readFileSync(require("path").join(__dirname, "..", "src/animal.js"), "utf8") + require("fs").readFileSync(require("path").join(__dirname, "..", "src/bow.js"), "utf8");
  ok(/WolfMem\.onKilled\(/.test(src), "21 wolf deaths call WolfMem.onKilled (source hook)");
  const q3 = memScene(212), { s: s3, w: w3 } = q3; s3.agents = []; const a1 = person(s3, w3.pos.x + 4, w3.pos.y), a2 = person(s3, w3.pos.x + 4, w3.pos.y + 1); spear(s3, a1); spear(s3, a2);
  w3.caution = { v: 50, t: s3.tick };
  const T = WMm.threat(s3, a1), L50 = WMm.limit(50), no = WMm.mayTarget(s3, w3, a1); w3.caution = { v: 0, t: null }; const yes = WMm.mayTarget(s3, w3, a1);
  ok(T === 4 && L50 === 4 && !no && yes, "21 caution 50: won't start on 2 armed adults (T 4); caution 0: does", "T " + T + " limit " + L50);
})();
(function () {
  // 23 nearly killed: a kill roll missed by < 0.05 marks near; a second wound while wounded marks near
  const q = memScene(23), { s, w, ena } = q; ena.pos = { x: w.pos.x + 1, y: w.pos.y }; setSkill(ena, "melee", 20);
  const D = C.fight.desperate, kch = D.kill + 20 / 100 * D.killSkill, wch = D.wound + 20 / 100 * D.woundSkill; const R0 = s.fgrng || (s.fgrng = new G.RNG(1)), f0 = R0.float, c0 = R0.chance;
  const seq = [kch + 0.01, 0]; let i = 0; R0.float = () => seq[Math.min(i++, seq.length - 1)]; R0.chance = p => R0.float() < p;
  try { G.WolfFight.desperate(s, w, ena); } finally { R0.float = f0; R0.chance = c0; }
  const e1 = ent(w, ena);
  ok(!!e1 && e1.near === true && s.animals.indexOf(w) >= 0, "23 a wound whose kill roll missed by < 0.05 marks the entry near", e1 && JSON.stringify(e1));
  const q2 = memScene(231); WMm.onWound(q2.s, q2.w, [q2.ena], false); const n1 = ent(q2.w, q2.ena).near; q2.w.woundedUntil = q2.s.tick + 100;
  q2.ena.pos = { x: q2.w.pos.x + 1, y: q2.w.pos.y }; const R1 = q2.s.fgrng || (q2.s.fgrng = new G.RNG(1)), g0 = R1.float, h0 = R1.chance, sq = [0.99, 0]; let j = 0; R1.float = () => sq[Math.min(j++, 1)]; R1.chance = p => R1.float() < p;
  try { G.WolfFight.desperate(q2.s, q2.w, q2.ena); } finally { R1.float = g0; R1.chance = h0; }
  ok(n1 === false && ent(q2.w, q2.ena).near === true, "23 a second wound while still wounded marks near");
  const q3 = memScene(232); WMm.onWound(q3.s, q3.w, [q3.ena], true); const e = ent(q3.w, q3.ena), t = q3.s.tick;
  q3.s.tick = t + 20 * DAY; const s20 = WMm.sNow(q3.s, e); q3.s.tick = t + 51 * DAY; WMm.prune(q3.s, q3.w); const at51 = !!ent(q3.w, q3.ena); q3.s.tick = t + 52 * DAY; WMm.prune(q3.s, q3.w); const at52 = !!ent(q3.w, q3.ena);
  const q4 = memScene(233); WMm.onWound(q4.s, q4.w, [q4.ena], false); q4.s.tick += 10 * DAY + 1; const sN = WMm.sNow(q4.s, ent(q4.w, q4.ena));
  ok(s20 >= 30 - 1e-9 && at51 && !at52 && sN < 30, "23 near: >= 30 for 20 days, gone by 52; a normal wound under 30 just past 10 days", "near@20d " + R2(s20) + ", @51d " + at51 + ", @52d " + at52 + "; normal@10d+ " + R2(sN));
})();
(function () {
  const m = wolfRun(24, true, true, 1440, true), c = wolfRun(24, false, true, 1440);
  ok(m.minE >= 2 + 5 * (60 - 30) / 70 - 1e-6 && m.minK >= 3 - 1e-6 && m.bitten === 0 && c.bitten > 0, "24 a starving wolf never targets Ena (s 60) or her companion, keeps >= 2 + 5x(60-30)/70 = 4.14 tiles (24 h full sim)",
    "Ena min " + m.minE + ", companion min " + m.minK + ", bites " + m.bitten + " | control: bites " + c.bitten + ", min " + c.minE);
})();
(function () {
  // Director (i)/(ii): member-id group memory
  const q = memScene(2501), { s, w, ena, kin } = q; const c1 = person(s, ena.pos.x + 20, ena.pos.y, { group: 5 }); s.groups[0].members.push(c1.id);
  WMm.onKilled; WMm.onWound(s, w, [kin], false); w.woundedUntil = null; w.caution = { v: 0, t: null }; delete w.memory[w.memory.indexOf(ent(w, kin))]; w.memory = w.memory.filter(Boolean);
  // group entry only (members kin, ena, c1); re-form all three under a new id 9
  for (const p of [ena, kin, c1]) p.group = 9; s.groups.push({ id: 9, members: [ena.id, kin.id, c1.id] });
  ok(WMm.sFor(s, w, ena) === 50 && !WMm.mayTarget(s, w, ena), "Director (i) a group re-formed under a new id with the same people is still avoided", WMm.sFor(s, w, ena));
  ena.group = 11; c1.group = 11; kin.group = 12; kin.pos = { x: ena.pos.x - 10, y: ena.pos.y }; s.groups.push({ id: 11, members: [ena.id, c1.id] }, { id: 12, members: [kin.id] });
  const two = WMm.sFor(s, w, ena), one = WMm.sFor(s, w, kin);
  ok(two === 50 && one === 0 && WMm.mayTarget(s, w, kin), "Director (ii) fewer than half of the living remembered members (1 of 3) is not avoided; 2 of 3 still is", "2/3 -> " + two + ", 1/3 -> " + one);
  s.agents = s.agents.filter(p => p !== c1); const half = WMm.sFor(s, w, kin);
  ok(half === 50, "Director (ii) half of the living members (1 of 2 after a death) counts as the group", half);
  s.agents = s.agents.filter(p => [ena, kin].indexOf(p) < 0); WMm.prune(s, w);
  ok(!gEnt(w, 5), "Director the group entry is dropped when no remembered member is alive");
})();

// ===== 22. migrate 38 -> 39 =====
(function () {
  const o = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "fixtures/save_v38.1.json"), "utf8")); const s = G.Sim.deserialize(o);
  const m = s.agents.map(a => score(a, "melee")), r = s.agents.map(a => score(a, "ranged"));
  ok(s.version === 39 && s.reedBeds.length > 0, "22 beds rebuilt", s.reedBeds.length + " beds");
  ok(m[0] === 38 && m[1] === 60 && m[2] === 20 && r.every(v => v === 20), "22 melee seeded (4 deer + 1 wolf kill, hunt/wolf_hunt 50 -> 38), huge history clamps 60, nothing -> 20; ranged 20", m.join("/") + " ranged " + r.join("/"));
  ok(s.agents.every(a => !G.Learn.has(a, "spar")), "22 nobody has spar");
  const ws = s.animals.filter(a => a.species === "wolves"); ok(ws.length > 0 && ws.every(w => Array.isArray(w.memory) && !w.memory.length && w.caution.v === 0 && w.woundedUntil == null), "22 wolves memory [] and caution 0", ws.length + " wolves");
  ok(!s.items.some(it => it.material === "fiber" || it.tool === "bow" || it.wrap || it.form === "wrap") && !s.agents.some(a => a.wrap || a.wearingWrap), "22 no wraps, bows or fiber");
  ok(!(s.huts || []).some(h => h.lashed) && !Object.keys(s.cacheLash || {}).length, "22 huts and caches unlashed", (s.huts || []).length + " huts");
})();

// ===== 25. thrown hits / pokes / deer odds =====
(function () {
  const q = scene(25), { s, w } = q; const a = person(s, q.o.x + 3, q.o.y, { melee: 20, ranged: 20 });
  G.Skills.thrownHit(s, a, w); const t = [score(a, "melee"), score(a, "ranged")]; G.Skills.poke(s, a, w); const p = [score(a, "melee"), score(a, "ranged")];
  ok(t[0] === 20 && t[1] === 24 && p[0] === 24 && p[1] === 24, "25 a thrown hit on a wolf raises ranged, not melee; a poke raises melee", "after throw " + t.join("/") + ", after poke " + p.join("/"));
  const sp = spear(s, a); const odds = []; for (const [mm, rr] of [[0, 0], [20, 20], [100, 100], [100, 0], [0, 100]]) { setSkill(a, "melee", mm); setSkill(a, "ranged", rr); odds.push(G.Hunt.odds(a, sp)); }
  ok(odds.every(v => v === odds[0]), "25 melee/ranged scores leave deer hunt odds unchanged", odds.map(R2).join(" "));
})();

// ===== 26. save round-trip =====
(function () {
  const s = G.Sim.create(2626); const a = s.agents[0], b = s.agents[1];
  const fb = item(s, "reed", 3, 3); fb.material = "fiber"; fb.form = "bundle"; const bw = bow(s, a, 3); setSkill(a, "melee", 44.5); setSkill(a, "ranged", 37); G.Learn.add(a, "spar", 12); a.sparNext = s.tick + 99; a.sparRetryAt = s.tick + 7;
  const wrapIt = s.items.find(it => it.form === "wrap"); const wl = s.animals.find(x => x.species === "wolves") || wolf(s, 10, 10, 1);
  wl.memory = [{ who: a.id, group: null, members: null, s: 60, t: s.tick, near: true }, { who: null, group: a.group, members: [a.id, b.id], s: 50, t: s.tick, near: false }]; wl.caution = { v: 33, t: s.tick }; wl.woundedUntil = s.tick + 500;
  const wr = item(s, "fiber", Math.round(b.pos.x), Math.round(b.pos.y)); wr.form = "wrap"; wr.wornBy = b.id; wr.layers = 2; wr.dur = 71; b.wearingWrap = wr.id;
  const j1 = JSON.stringify(G.Sim.serialize(s)); const s2 = G.Sim.deserialize(JSON.parse(j1)); const j2 = JSON.stringify(G.Sim.serialize(s2));
  const a2 = s2.agents.find(x => x.id === a.id), w2 = s2.animals.find(x => x.id === wl.id), bw2 = s2.items.find(x => x.id === bw.id), fb2 = s2.items.find(x => x.id === fb.id);
  ok(j1 === j2, "26 save -> load -> save is byte-identical", j1.length + " / " + j2.length);
  ok(a2 && score(a2, "melee") === 44.5 && score(a2, "ranged") === 37 && G.Learn.has(a2, "spar") && a2.sparNext === a.sparNext && a2.sparRetryAt === a.sparRetryAt && bw2 && bw2.tool === "bow" && bw2.strung && bw2.arrows.length === 3 && fb2 && fb2.material === "fiber" && s2.agents.find(x => x.id === b.id).wearingWrap === wr.id && s2.items.find(x => x.id === wr.id).layers === 2 && s2.items.find(x => x.id === wr.id).dur === 71
    && w2 && JSON.stringify(w2.memory) === JSON.stringify(wl.memory) && w2.caution.v === 33 && w2.woundedUntil === wl.woundedUntil && w2.memory[0].near === true,
    "26 every new field equal after load (fiber, bow+arrows, melee/ranged/spar, sparNext, wolf memory incl. near, caution, woundedUntil)");
})();
// ===== 27. v39 tune preconditions: a cord survives a generic try; a loaded bow stays in hand; hungry, she goes back for it =====
(function () {
  const BCf = G.data.config.bow;
  let s = bare(2727), o = openSpot(s, 6); const a = person(s, o.x, o.y);
  const forms = []; let broke = 0;
  for (let k = 0; k < 40; k++) { const c = item(s, "fiber", o.x, o.y, "cord"); give(s, a, c); const r = item(s, "rock", o.x + 1, o.y); G.Items.startTry(s, a, r, "strike"); runTry(s, a);
    forms.push(c.form); if (c.form === "shard") broke++; s.items.splice(s.items.indexOf(r), 1); s.items.splice(s.items.indexOf(c), 1); a.carry = null; a.act = { type: "idle", until: s.tick + 1e6 }; }
  ok(broke === 0 && forms.every(f => f === "cord"), "27 a held cord struck on a rock 40 times stays a cord (generic try no longer marks a non-'whole' form as a shard)", forms.slice(0, 6).join(","));
  const st = item(s, "stick", o.x, o.y); give(s, a, st); const r2 = item(s, "rock", o.x + 1, o.y); Object.assign(r2.props, { hardness: 95 }); Object.assign(st.props, { hardness: 20, durability: 1 });
  let sb = 0; for (let k = 0; k < 60 && st.form === "whole"; k++) { G.Items.startTry(s, a, r2, "strike"); runTry(s, a); a.act = { type: "idle", until: s.tick + 1e6 }; if (st.form === "shard") sb = 1; }
  ok(sb === 1, "27 control: a whole stick on a hard rock can still break into a shard", "form " + st.form);
  s = bare(2728); o = openSpot(s, 8); const b = person(s, o.x, o.y); const bw = bow(s, b, 3); bw.craftedBy = b.id; b.needs.water = 5;
  const keepOn = G.Hunt.keep(s, b), keepOff = withCfg(BCf, { keepReady: false }, () => G.Hunt.keep(s, b));
  ok(BCf.keepReady === true && keepOn === true && keepOff === false, "27 bow.keepReady: thirsty, her own loaded bow stays in hand (off: put down)", "on " + keepOn + ", off " + keepOff);
  G.Items.drop(s, b); bw.x = o.x + 5; bw.y = o.y; b.needs.water = 90; b.needs.fullness = 10;
  const fetchOn = G.Hunt.seekFood(s, b) && b.act.goal === "pickup" && b.act.target === bw.id;
  b.act = { type: "idle", until: s.tick + 1e6 };
  const fetchOff = withCfg(BCf, { fetchHungryTiles: 0 }, () => G.Hunt.seekFood(s, b) && b.act.goal === "pickup" && b.act.target === bw.id);
  b.act = { type: "idle", until: s.tick + 1e6 }; bw.arrows = [];
  const fetchEmpty = G.Hunt.seekFood(s, b) && b.act.goal === "pickup" && b.act.target === bw.id;
  ok(BCf.fetchHungryTiles === 15 && fetchOn && !fetchOff && !fetchEmpty, "27 bow.fetchHungryTiles: hungry with empty hands she walks to her loaded bow 5 tiles off (off at 0; not for an empty bow)", "on " + fetchOn + ", off " + fetchOff + ", empty " + fetchEmpty);
})();
console.log("\n" + passes + " passed, " + fails + " failed"); if (fails) console.log("failed: " + failed.join(" | "));
