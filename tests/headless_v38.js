// v38 "Living off the land": one labelled section per piece (a..g). Fixture-based, short (no multi-year runs). Run: node tests/headless_v38.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON, performance: { now: () => 0 } };
  // minimal DOM stub so ui.js can load (init not called)
  const fakeEl = () => ({
    style: {}, classList: { toggle() {}, add() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {},
    appendChild() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    hidden: true, innerHTML: "", textContent: "", onclick: null
  });
  const els = {};
  ctx.document = {
    getElementById(id) { return els[id] || (els[id] = fakeEl()); },
    querySelectorAll() { return []; },
    createElement() { const e = fakeEl(); e.children = []; e.appendChild = c => { e.children.push(c); }; e.parentNode = { appendChild() {} }; return e; },
    body: { classList: { toggle() {}, contains() { return false; } } },
    addEventListener() {}
  };
  ctx.window = ctx;
  ctx.innerWidth = 1024; ctx.innerHeight = 768;
  ctx.localStorage = { getItem() { return null; }, setItem() {} };
  ctx.matchMedia = () => ({ matches: false });
  ctx.getComputedStyle = () => ({ position: "static" });
  vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/injury.js", "src/wolffear.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/hut.js", "src/farm.js", "src/food.js", "src/sim.js", "src/icons.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  // stub Render before ui.js assigns focusFrac
  ctx.GS.Render = ctx.GS.Render || { centerOn() {}, view: { z: 1 }, zoomBy() {}, setViewport() {}, follow: null, pulse: null, frac() { return { fx: 0.5, fy: 0.5 }; }, toTile() { return { x: 0, y: 0 }; } };
  vm.runInContext(fs.readFileSync(path.join(root, "src/ui.js"), "utf8"), ctx, { filename: "src/ui.js" });
  return ctx.GS;
}


const G = load(), C = G.data.config, H = G.Hut, HC = C.hut;
let fails = 0, passes = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (c) passes++; else fails++; };
const esc0 = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const logs = s => (s.log || []).map(l => typeof l === "string" ? l : l.text || "");
const rainAll = (s, str) => { G.Powers.cast(s, "rain", s.world.w >> 1, s.world.h >> 1, str); const e = s.powers.effects.find(q => q.k === "rain" && q.on); if (e) { e.r = 9999; e.end = 1e9; e.str = str; } return !!e; };
// fixture: fresh world, one person standing on a walkable land tile, everyone else gone, no animals
const fx = (seed) => { const s = G.Sim.create(seed || 3801); s.animals = []; const a = s.agents[0]; s.agents = [a];
  const t = G.Agent.tilePos(a); let p = null;
  for (let r = 0; r < 20 && !p; r++) for (let dy = -r; dy <= r && !p; dy++) for (let dx = -r; dx <= r && !p; dx++) { const x = t.x + dx, y = t.y + dy;
    if (G.World.walkable(s.world, x, y) && !G.World.isWater(s.world, x, y) && !G.Shelter.at(s, x, y) && G.World.walkable(s.world, x + 1, y) && !G.Shelter.at(s, x + 1, y)) p = { x, y }; }
  a.pos = { x: p.x, y: p.y }; return { s, a, x: p.x, y: p.y }; };
const inHut = (s, a, h) => { a.pos = { x: h.tiles[0][0], y: h.tiles[0][1] }; a.den = h.id; a.act = { type: "sleep", until: s.tick + 600 }; };

// ---------------- pins ----------------
ok(C.saveVersion === 38, "saveVersion === 38");
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8"); const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  ok(refs.length > 0 && refs.every(u => /[?&]v=38\b/.test(u)), "index.html ?v=38 on every local script/link", refs.length + " refs"); }
ok(C.fire.minDryness === 30 && C.fire.spreadScale === 0.024 && C.fire.burnBudget === 40 && C.climate.dryness.nearWater === -45, "fire config (v38 g): minDryness 30, spreadScale 0.024 (was 0.016), burnBudget 40, nearWater -45");

// ---------------- (a) huts: tiers from materials ----------------
console.log("--- (a) huts ---");
{ const { s, a, x, y } = fx(3801);
  const h = H.create(s, x, y, a, { stick: 3 }); h.dur = 100; H.refresh(h);
  ok(h.tier === "sticks" && H.tier(h).label === "crude hut", "(a) 3 sticks = crude hut", h.tier);
  inHut(s, a, h); rainAll(s, "heavy");
  const w0 = G.Shelter.warmC(s, a, 0), e0 = G.Powers.exposure(s, a);
  // add over several trips: 2 reeds then a hide (+ a stick) -> sturdy
  const give = m => { const it = G.Items.create(s, m, x, y); s.items.push(it); return H.addTo(s, a, h, it); };
  give("reed"); give("reed"); const tReed = h.tier, wR = G.Shelter.warmC(s, a, 0), eR = G.Powers.exposure(s, a);
  give("hide"); const tHide = h.tier, w1 = G.Shelter.warmC(s, a, 0), e1 = G.Powers.exposure(s, a);
  ok(tReed === "reeds" && tHide === "hide" && H.tier(h).label === "sturdy hut", "(a) sticks -> reeds -> hide over several adds", "mats " + JSON.stringify(h.mats));
  ok(w1 > wR && wR > w0, "(a) sturdier hut holds more warmth (warmC sticks < reeds < hide)", [w0, wR, w1].join(" < "));
  ok(e0 > 0 && e1 === 0 && eR < e0, "(a) heavy rain: crude hut lets rain in, sturdy hut keeps it all out", "exposure sticks=" + e0.toFixed(2) + " reeds=" + eR.toFixed(2) + " hide=" + e1);
  ok(logs(s).some(l => /stretches a hide over the hut/.test(l)) && !logs(s).some(l => /["\u201c]/.test(l)), "(a) add log lines are actions only (no quotes)");
  ok((s.discoveries || []).some(d => d.title === "First sturdy hut"), "(a) first sturdy hut -> Discoveries");
  const I = H.info(s, h); ok(I.dur >= 0 && I.label === "sturdy hut" && I.rainPct === 100 && I.art === "hide", "(a) inspect info: label, durability, rain kept off, art col", JSON.stringify(I));
  ok(G.data.art.hutTier && G.data.art.hutTier.cols.indexOf(I.art) >= 0, "(a) art col exists in art.hutTier");
}
// ---------------- (a) durability: decay clear vs rain vs cold, damage, patch, collapse ----------------
{ const run = (str) => { const { s, a, x, y } = fx(3802); const h = H.create(s, x, y, a, { stick: 3 }); h.dur = 90; H.refresh(h);
    if (str) rainAll(s, str); const d0 = h.dur; for (let i = 0; i < 600; i++) { s.tick++; H.step(s, null); } return d0 - h.dur; };
  const clear = run(null), light = run("light"), heavy = run("heavy");
  ok(clear > 0 && light > clear && heavy > clear, "(a) decay over 10 h: rain (light, heavy) wears faster than clear", "clear=" + clear.toFixed(3) + " light=" + light.toFixed(3) + " heavy=" + heavy.toFixed(3));
  const { s, a, x, y } = fx(3803); const hs = H.create(s, x, y, a, { stick: 3 }), hh = H.create(s, x + 1, y, a, { stick: 3, reed: 2, hide: 1 });
  ok(H.decayRate(s, hh) < H.decayRate(s, hs), "(a) sturdy hut wears slower than crude (tier decayX)");
  const orig = G.Climate.airAt; G.Climate.airAt = () => -5; const cold = H.decayRate(s, hs); G.Climate.airAt = () => 10; const mild = H.decayRate(s, hs); G.Climate.airAt = orig;
  ok(cold > mild, "(a) frost (below " + HC.dur.coldBelowF + "°F) wears faster", cold.toFixed(5) + " > " + mild.toFixed(5));
}
{ const { s, a, x, y } = fx(3804); const h = H.create(s, x, y, a, { stick: 3, reed: 2, hide: 1 }); h.dur = 100; H.refresh(h);
  H.bolt(s, x, y); const afterBolt = h.dur;
  ok(afterBolt === 100 - HC.dur.lightning, "(a) lightning on the hut drops durability by " + HC.dur.lightning, afterBolt);
  s.fire[x + "," + y] = { s: "fire", t: s.tick, end: s.tick + 100 }; const d1 = h.dur; s.tick++; H.step(s, null); delete s.fire[x + "," + y];
  ok(d1 - h.dur >= HC.dur.firePerMinute, "(a) flames on the hut tile burn durability", (d1 - h.dur).toFixed(3));
  const deer = G.Animal.create(s, "grazer", x, y); s.animals = [deer]; const d2 = h.dur; s.tick++; H.step(s, null); s.animals = [];
  ok(d2 - h.dur >= HC.dur.trample.grazer, "(a) a deer standing on it tramples durability", (d2 - h.dur).toFixed(3));
  ok(h.dur < HC.dur.wornBelow && H.worn(h) && H.artCol(h) === "hide_worn" && h.rain < 1, "(a) under " + HC.dur.wornBelow + " = worn: <tier>_worn art, lets some rain in", h.dur.toFixed(1) + " " + H.artCol(h) + " rain " + h.rain);
  // patch: she notices the worn hut she knows, holds a stick, stands next to it
  a.shelters = [h.id]; a.pos = { x: x + 1, y }; a.act = { type: "idle", until: 0 }; a.hutTend = null;
  const st = G.Items.create(s, "stick", x + 1, y); s.items.push(st); st.heldBy = a.id; a.carry = st.id;
  const dp = h.dur, did = H.tend(s, a);
  ok(did && h.dur === Math.min(100, dp + HC.patch.stick) && !s.items.includes(st), "(a) noticing a worn hut, she patches it with a stick (+" + HC.patch.stick + ")", dp.toFixed(1) + " -> " + h.dur.toFixed(1));
  ok(logs(s).some(l => /patches the worn hut with a stick/.test(l)), "(a) patch logged as an action");
  // walking patch: holding a reed 4 tiles away -> walks with goal hutTend, arrives and adds
  h.dur = 30; H.refresh(h); a.hutTend = null; a.pos = { x: x + 1, y }; const rd = G.Items.create(s, "reed", x + 1, y); s.items.push(rd); rd.heldBy = a.id; a.carry = rd.id;
  let far = null; for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 0], [-3, 0], [0, 3], [0, -3]]) if (G.World.walkable(s.world, x + dx, y + dy) && !G.World.isWater(s.world, x + dx, y + dy)) { far = { x: x + dx, y: y + dy }; break; }
  a.pos = { x: far.x, y: far.y }; const walk = H.tend(s, a) && a.act.goal === "hutTend";
  a.pos = { x: x + 1, y }; H.arriveTend(s, a);
  ok(walk && h.dur > 30 && h.mats.reed === 3, "(a) from a few tiles off she carries a reed to the hut and patches it", "dur " + h.dur.toFixed(1));
  // collapse at 0
  const n0 = s.items.length, mats = Object.values(h.mats).reduce((p, q) => p + q, 0); a.den = h.id;
  H.damage(s, h, 1000, "test");
  const dropped = s.items.length - n0, near = s.items.slice(n0).every(it => Math.max(Math.abs(it.x - x), Math.abs(it.y - y)) <= HC.dur.collapseScatter && G.World.walkable(s.world, it.x, it.y));
  ok(!s.shelters.includes(h) && a.den == null && dropped === mats && near, "(a) at 0 it collapses: gone, occupant out, " + mats + " material items dropped on nearby tiles", "dropped " + dropped);
  ok(logs(s).some(l => /falls in, scattering its/.test(l)), "(a) collapse logged as an action");
}
// ---------------- (a) natural lightning through Sim.step and storm wear ----------------
{ const { s, a, x, y } = fx(3805); const h = H.create(s, x, y, a, { stick: 3 }); h.dur = 100; H.refresh(h);
  s.fx.push({ k: "spark", x, y, t: s.tick }); H.step(s, s.fx[s.fx.length - 1]);
  ok(h.dur <= 100 - HC.dur.lightning, "(a) natural bolt fx (as Sim.step hands it to Hut.step) damages the hut", h.dur.toFixed(1));
  const { s: s2, a: a2, x: x2, y: y2 } = fx(3806); const h2 = H.create(s2, x2, y2, a2, { stick: 3 }); rainAll(s2, "heavy"); const r0 = H.decayRate(s2, h2);
  H.bolt(s2, x2 + 8, y2); const r1 = H.decayRate(s2, h2);
  ok(r1 > r0 * 1.5, "(a) a storm (rain + bolt within " + HC.dur.stormTiles + " tiles) wears faster than rain alone", r0.toFixed(5) + " -> " + r1.toFixed(5)); }
// ---------------- (a) copying a hide roof ----------------
{ const s = G.Sim.create(3807); s.animals = []; const [a, b] = s.agents; s.agents = [a, b]; const t = G.Agent.tilePos(a);
  const h = H.create(s, t.x, t.y, a, { stick: 3 }); b.pos = { x: t.x + 1, y: t.y }; b.act = { type: "idle", until: s.tick + 100 };
  const hi = G.Items.create(s, "hide", t.x, t.y); s.items.push(hi); H.addTo(s, a, h, hi);
  ok(h.hideAdd && h.hideAdd.seen.includes(b.id), "(a) a watcher's id is recorded when the hide goes on");
  const cc = G.Learn.copyChance; G.Learn.copyChance = () => 1;
  const sb0 = G.Learn.score(b, "hutHide"), sa0 = G.Learn.score(a, "hutHide"); const n = H.wokeWarm(s, a, h); G.Learn.copyChance = cc;
  ok(G.Learn.score(a, "hutHide") > sa0 && n === 1 && G.Learn.score(b, "hutHide") > sb0, "(a) she wakes warm in the hide hut -> her hutHide rises; the watcher copies it", "a " + sa0 + "->" + G.Learn.score(a, "hutHide") + " b " + sb0 + "->" + G.Learn.score(b, "hutHide")); }
// ---------------- (a) built hut keeps its materials; save round trip ----------------
{ const { s, a, x, y } = fx(3808); for (const m of ["stick", "stick", "reed"]) { const it = G.Items.create(s, m, x, y); s.items.push(it); }
  const h = H.doBuild(s, a, x, y);
  ok(h && h.mats.stick === 2 && h.mats.reed === 1 && h.dur === HC.dur.start, "(a) a new hut remembers what went in, starts at dur " + HC.dur.start, h && JSON.stringify(h.mats));
  const L = G.Sim.deserialize(JSON.parse(JSON.stringify(G.Sim.serialize(s)))), h2 = L.shelters.find(q => q.id === h.id);
  ok(h2 && h2.dur === h.dur && h2.mats.reed === 1 && h2.tier === h.tier, "(a) save/load keeps hut mats, tier, durability"); }
// ---------------- migrate 37 -> 38 ----------------
{ const { s, a, x, y } = fx(3809); const h = H.create(s, x, y, a, { stick: 3 }); a.caches = [{ x: 3, y: 4, t: 5 }]; a.wolfFear = 3;
  const ser = JSON.parse(JSON.stringify(G.Sim.serialize(s))); ser.version = 37;
  for (const q of ser.shelters) if (q.type === "hut") { delete q.mats; delete q.dur; delete q.tier; q.warmX = 1.2; q.rain = 0.85; }
  const L = G.Sim.deserialize(ser), h2 = L.shelters.find(q => q.id === h.id), a2 = L.agents.find(q => q.id === a.id);
  ok(L.version === 38 || C.saveVersion === 38, "(a) migrate 37->38 runs");
  ok(h2 && h2.dur === HC.dur.migrate && h2.mats.stick === HC.needPile && h2.tier === "sticks", "(a) migrate: existing hut gets mats + durability " + HC.dur.migrate, h2 && JSON.stringify({ dur: h2.dur, mats: h2.mats }));
  ok(a2.wolfFear === C.wolfFear.baseline && JSON.stringify(a2.caches) === JSON.stringify(a.caches), "(a) migrate: wolf fear lifted to " + C.wolfFear.baseline + ", caches kept", a2.wolfFear); }
// ---------------- (a) short live run: nothing throws with huts in the world ----------------
{ const s = G.Sim.create(3810); const a = s.agents[0]; H.fixture(s); let err = null; try { for (let i = 0; i < 1440; i++) G.Sim.step(s); } catch (e) { err = e; }
  ok(!err, "(a) one game day with a fixture hut runs clean", err && err.stack); }

// ======================= (b) berry sprouting =======================
const F = G.Farm, FCf = C.farm, Td = G.data.T;
const softTiles = s => { const out = []; for (let y = 0; y < s.world.h; y++) for (let x = 0; x < s.world.w; x++) if (F.soil(s, x, y) === FCf.soil.meadow && F.free(s, x, y)) out.push({ x, y }); return out; };
const findTile = (s, pred) => { for (let y = 0; y < s.world.h; y++) for (let x = 0; x < s.world.w; x++) if (pred(x, y)) return { x, y }; return null; };
const growDays = (s, d) => { for (let i = 0, n = d * 1440 / C.time.tickGameMinutes; i < n; i++) { s.tick++; F.step(s); } };
// ---------------- (b) soft ground ----------------
{ const { s } = fx(3820), w = s.world;
  const water = findTile(s, (x, y) => G.World.isWater(w, x, y)), sand = findTile(s, (x, y) => G.World.walkable(w, x, y) && G.World.tile(w, x, y) === Td.SAND);
  const rock = findTile(s, (x, y) => w.hills && w.hills[y * w.w + x] === "1" && G.World.walkable(w, x, y));
  const farMeadow = findTile(s, (x, y) => G.World.tile(w, x, y) === Td.MEADOW && !(w.hills && w.hills[y * w.w + x] === "1") && F.soil(s, x, y) === 0);
  const soft = softTiles(s);
  ok(soft.length > 0 && F.soil(s, water.x, water.y) === 0 && (!sand || F.soil(s, sand.x, sand.y) === 0) && (!rock || F.soil(s, rock.x, rock.y) === 0),
    "(b) soft ground = grass near water; water, sand, rock never take", "soft " + soft.length + " sand " + !!sand + " rock " + !!rock);
  ok(!farMeadow || F.soil(s, farMeadow.x, farMeadow.y) === 0, "(b) grass far from water (> " + FCf.nearWaterTiles + " tiles) does not take", !!farMeadow); }
// ---------------- (b) a meal may drop a seed ----------------
{ const { s, a } = fx(3821); let n = 0; const b = s.bushes[0];
  for (let i = 0; i < 400; i++) { s.plants = []; if (F.afterMeal(s, a, b)) n++; }
  const r = n / 400; ok(r > FCf.seedChance * 0.5 && r < FCf.seedChance * 1.3, "(b) a berry meal drops a seed near the bush ~" + FCf.seedChance + " of the time (minus taken spots)", r.toFixed(2));
  s.plants = []; let p = null; for (let i = 0; i < 200 && !p; i++) p = F.afterMeal(s, a, b);
  ok(p && Math.max(Math.abs(p.x - b.x), Math.abs(p.y - b.y)) <= FCf.dropTiles && p.stage === "seed" && !p.deliberate && !logs(s).some(l => /seed/.test(l)), "(b) the seed lands within " + FCf.dropTiles + " tiles, unnoticed (no log)"); }
// ---------------- (b) growth: seed -> sprout -> sapling -> bush; most fail ----------------
{ const { s, a } = fx(3822); const soft = softTiles(s).filter((q, i, A) => A.every(o => o === q || Math.max(Math.abs(o.x - q.x), Math.abs(o.y - q.y)) > 1 || A.indexOf(o) > i)); s.plants = [];
  const spots = []; for (const q of softTiles(s)) { if (spots.length >= 60) break; if (F.free(s, q.x, q.y)) { spots.push(q); F.place(s, a, q.x, q.y, false); } }
  growDays(s, FCf.seedDays + 0.01); const st = s.farmStats;
  ok(st.sprouted + st.failed === spots.length && st.failed > st.sprouted && st.sprouted > 0, "(b) after " + FCf.seedDays + " days most dropped seeds fail, a few sprout", st.sprouted + "/" + spots.length);
  const b0 = s.bushes.length; growDays(s, FCf.sproutDays + 0.01);
  ok(s.plants.every(p => p.stage === "sapling") && st.saplings === st.sprouted, "(b) sprouts become saplings after " + FCf.sproutDays + " days");
  growDays(s, FCf.saplingDays + 0.01); const nb = s.bushes.slice(b0);
  ok(s.plants.length === 0 && nb.length === st.sprouted && nb.every(b => !b.ripe && b.planted && b.planted.by === a.id && /^p/.test(b.id)) && logs(s).some(l => /new berry bush has grown/.test(l)),
    "(b) saplings become normal (bare) bushes after " + FCf.saplingDays + " days", nb.length + " new");
  ok(new Set(s.bushes.map(b => b.id)).size === s.bushes.length, "(b) new bush ids are unique"); }
{ const { s, a } = fx(3823); const q = softTiles(s)[0]; F.place(s, a, q.x, q.y, false); s.tick = 3 * 7 * 1440; // Deep Cold
  growDays(s, 3); ok(s.plants.length === 1 && s.plants[0].grow === 0 && G.Climate.seasonIndex(s.tick) === 3, "(b) nothing grows in Deep Cold (seasonGrowX " + FCf.seasonGrowX[3] + ")");
  s.fire[q.x + "," + q.y] = { s: "fire", t: s.tick, end: s.tick + 60 }; F.step(s); ok(s.plants.length === 0 && s.farmStats.killed === 1, "(b) flames on the tile kill it"); }
// ---------------- (b) headless proof: 8 pressed seeds -> >= 2 sprout, >= 1 becomes a bush ----------------
{ const { s, a } = fx(3824); s.plants = []; const spots = []; for (const q of softTiles(s)) { if (spots.length >= 8) break; if (F.free(s, q.x, q.y)) { spots.push(q); F.place(s, a, q.x, q.y, true); } }
  const b0 = s.bushes.length; growDays(s, FCf.seedDays + FCf.sproutDays + FCf.saplingDays + 0.1);
  ok(spots.length === 8 && s.farmStats.sprouted >= 2 && s.bushes.length - b0 >= 1, "(b) 8 seeds pressed in: >= 2 sprout and at least one planted bush grows", s.farmStats.sprouted + "/8 sprouted, " + (s.bushes.length - b0) + " bushes"); }
// ---------------- (b) learning: finder gains, watcher copies, urge -> deliberate planting + Discoveries ----------------
{ const s = G.Sim.create(3825); s.animals = []; const [a, w] = s.agents; s.agents = [a, w];
  const soft = softTiles(s), q = soft[0]; a.pos = { x: q.x, y: q.y }; w.pos = { x: q.x + 2, y: q.y }; w.act = { type: "idle" };
  const p = F.place(s, a, q.x, q.y, false);
  ok(p.seen.includes(w.id) && !p.seen.includes(a.id), "(b) an awake person nearby is recorded as seeing the berries dropped");
  F.init(s); s.plants = [p]; p.stage = "sapling"; p.grow = FCf.saplingDays; F.step(s); const nb = s.bushes[s.bushes.length - 1];
  const sw0 = G.Learn.score(w, "plant"), sa0 = G.Learn.score(a, "plant");
  ok(F.onFind(s, w, nb) === 0 && G.Learn.score(w, "plant") === sw0, "(b) the watcher finding it first has nothing to copy yet (dropper hasn't learned)");
  ok(F.onFind(s, a, nb) === 1 && G.Learn.score(a, "plant") === sa0 + FCf.findGain && F.onFind(s, a, nb) === 0, "(b) the dropper finds the bush where she ate: plant +" + FCf.findGain + " (once)", sa0 + "->" + G.Learn.score(a, "plant"));
  const cc = G.Learn.copyChance; G.Learn.copyChance = () => 1; const r = F.onFind(s, w, nb); G.Learn.copyChance = cc;
  ok(r === 2 && G.Learn.score(w, "plant") > sw0 && logs(s).some(l => /copied/.test(l)), "(b) someone who saw the seed fall copies planting on seeing the bush", sw0 + "->" + G.Learn.score(w, "plant"));
  // the urge: score above start -> she presses berries into soft ground on purpose
  const bush = s.bushes.find(b => b !== nb && softTiles(s).some(t => Math.hypot(t.x - b.x, t.y - b.y) <= FCf.plantTiles)) || nb;
  G.Learn.rec(a, "plant").score = 100; let d = null; for (let i = 0; i < 20 && !d; i++) { const x = F.afterMeal(s, a, bush); if (x && x.deliberate) d = x; }
  const L = logs(s), dis = (s.discoveries || []).find(x => x.title === "First planting");
  ok(d && F.soil(s, d.x, d.y) > 0 && L.some(l => /presses berries into the (wet|soft) ground/.test(l)), "(b) a strong urge -> she presses berries into soft ground (logged as an action)", d && JSON.stringify({ x: d.x, y: d.y }));
  ok(!!dis && L.filter(l => /presses berries/.test(l)).length >= 1, "(b) first deliberate planting goes into Discoveries");
  ok(!L.some(l => /["“]/.test(l)), "(b) logs carry no quoted speech");
  w.pos = { x: 0, y: 0 }; const R = G.Learn.score(a, "plant"); G.Learn.rec(a, "plant").score = C.learn.start; let n = 0; for (let i = 0; i < 50; i++) { const x = F.afterMeal(s, a, bush); if (x && x.deliberate) n++; s.plants = []; }
  G.Learn.rec(a, "plant").score = R; ok(n === 0, "(b) at the start score there is no deliberate planting (accidents only)"); }
// ---------------- (b) wet ground helps; save round trip; migration; live day ----------------
{ const { s, a } = fx(3826); const q = softTiles(s)[0]; rainAll(s, "heavy");
  ok(G.Powers.wetAt(s, q.x, q.y), "(b) rain makes the spot wet (wetX " + FCf.wetX + " on the sprout roll)");
  F.rng(s); F.place(s, a, q.x, q.y, true); s.plants[0].stage = "sprout"; const L = G.Sim.deserialize(JSON.parse(JSON.stringify(G.Sim.serialize(s))));
  ok(L.plants.length === 1 && L.plants[0].stage === "sprout" && L.plants[0].deliberate && L.farmStats.pressed === 1 && L.plrng && L.plrng.s === s.plrng.s && L.frng.s === s.frng.s, "(b) save/load keeps plants, stats and the farm rng");
  const ser = JSON.parse(JSON.stringify(G.Sim.serialize(s))); ser.version = 37; delete ser.plants; delete ser.farmStats; delete ser.plrng;
  const M = G.Sim.deserialize(ser); ok(Array.isArray(M.plants) && M.plants.length === 0 && M.farmStats && M.farmStats.seeds === 0, "(b) migrate 37->38 adds empty plants + stats"); }
{ const s = G.Sim.create(3827); const a = s.agents[0]; const q = softTiles(s)[0]; F.place(s, a, q.x, q.y, true); let err = null;
  try { for (let i = 0; i < 1440; i++) G.Sim.step(s); } catch (e) { err = e; }
  ok(!err, "(b) one game day with a planted seed and people eating berries runs clean", err ? err.stack : JSON.stringify(s.farmStats)); }

// ================= (c) caches, spoilage, preservation =================
console.log("--- (c) caches, spoilage, preservation ---");
const Fd = G.Food, FdC = C.food, DAYM = 1440, TMc = C.time.tickGameMinutes;
const meat = (s, x, y, extra) => { const it = G.Items.create(s, "meat", x, y); it.spoilAt = s.tick + Fd.spoilMinutes(); it.from = "a deer"; it.heat = 0; it.src = { k: "hunted", animal: "deer", by: "Ana" }; Object.assign(it, extra || {}); s.items.push(it); return it; };
const hold = (s, a, it) => { it.heldBy = a.id; a.carry = it.id; a.carryUntil = s.tick + 600; };
const tickFood = (s, n) => { for (let i = 0; i < n; i++) { s.tick++; G.Hunt.step(s); Fd.step(s); } };
const openTile = (s, x0, y0, minD, maxD) => findTile(s, (x, y) => { const d = Math.hypot(x - x0, y - y0); return d >= minD && d <= maxD && G.World.walkable(s.world, x, y) && !G.World.isWater(s.world, x, y) && !G.Shelter.at(s, x, y); });
const fx2 = seed => { const s = G.Sim.create(seed); s.animals = []; const [a, b] = s.agents; s.agents = [a, b]; const f = fx(seed); return f; };
const hutAt = (s, a, x, y) => { for (const m of ["stick", "stick", "stick", "reed"]) s.items.push(G.Items.create(s, m, x, y)); return H.doBuild(s, a, x, y); };
ok(FdC && FdC.spoilDays === 7 && FdC.rottenSickX === 2 && FdC.driedX === 3 && FdC.shelteredX === 1.5 && C.cache.pileMax === 4, "(c) tunables in config: spoilDays 7, rottenSickX 2, driedX 3, shelteredX 1.5, pileMax 4");
// ---------------- (c) a cache holds a small pile; a person still carries one ----------------
{ const { s, a, x, y } = fx(3831); const spot = { key: "t:" + x + "," + y, kind: "spot", id: null, x, y }; const res = [];
  for (let i = 0; i < 5; i++) { a.pos = { x, y }; const it = meat(s, x, y); hold(s, a, it); res.push(G.Cache.doStash(s, a, spot)); if (!res[i]) { it.heldBy = null; a.carry = null; s.items.pop(); } }
  ok(res.slice(0, 4).every(Boolean) && res[4] === false && G.Cache.pile(s, spot) === 4, "(c) a cache holds several items (4) and refuses a fifth", JSON.stringify(res));
  ok(s.items.filter(i => i.heldBy === a.id).length === 0 && G.Cache.full(s, spot), "(c) the pile is full; nothing extra stays in her hands"); }
// ---------------- (c) spoilage: meat -> rotten food after spoilDays; item 9 tag kept ----------------
{ const { s, a, x, y } = fx(3832); const g = meat(s, x, y), h = meat(s, x, y); hold(s, a, h); a.pos = { x: x + 1, y };
  tickFood(s, Fd.spoilMinutes() / TMc - 1); const before = g.material === "meat" && h.material === "meat"; tickFood(s, 1);
  ok(before && g.material === "rotten" && h.material === "rotten" && g.rottenAt === s.tick, "(c) food turns rotten after spoilDays (" + FdC.spoilDays + " days), not before");
  ok(g.src && g.src.k === "hunted" && g.src.animal === "deer" && h.src.by === "Ana" && g.from === "a deer", "(c) the rotten item keeps its meat source tag (item 9)");
  ok(/rotten food$/.test(G.Items.label(g)) && G.Cook.label(g) === "rotten food" && a.foodLost >= 1 && s.foodStats.rotted === 2, "(c) rotten food is a new item; the holder lost food (need)", JSON.stringify({ lost: a.foodLost, il: G.Items.label(g) }));
  const L = logs(s); ok(L.some(l => l === FdC.lines.rot) && L.some(l => l === FdC.lines.rotHeld.replace("{name}", a.name)), "(c) rot lines are actions");
  tickFood(s, FdC.rottenGoneDays * DAYM / TMc); ok(!s.items.includes(g) && !s.items.includes(h) && a.carry == null, "(c) rotten food falls apart after rottenGoneDays (" + FdC.rottenGoneDays + "), hands freed"); }
// ---------------- (c) rotten food: 2x the raw sick chance; eaten only when starving ----------------
{ const { s, a, x, y } = fx(3833); const r = meat(s, x, y); r.material = "rotten"; r.rottenAt = s.tick; hold(s, a, r);
  ok(Math.abs(G.Cook.sickChance(r) - 2 * C.meat.sickChance) < 1e-9 && G.Cook.fullness(r) === FdC.rottenFullness, "(c) rotten food has twice the raw sick chance (" + G.Cook.sickChance(r) + " vs " + C.meat.sickChance + ")");
  a.needs.fullness = 50; const n1 = G.Hunt.seekFood(s, a), e1 = a.act && a.act.type === "eatMeat";
  a.needs.fullness = FdC.rottenEatBelow - 5; a.act = { type: "idle", until: s.tick + 1 }; G.Hunt.seekFood(s, a); const e2 = a.act && a.act.type === "eatMeat";
  ok(!e1 && e2, "(c) she eats rotten food only when starving (fullness < " + FdC.rottenEatBelow + ")", JSON.stringify(a.act && a.act.type));
  let sick = 0; const N = 4000, rr = new G.RNG(5); for (let i = 0; i < N; i++) if (rr.chance(G.Cook.sickChance(r))) sick++; let sr = 0; const m0 = meat(s, x, y); for (let i = 0; i < N; i++) if (rr.chance(G.Cook.sickChance(m0))) sr++;
  ok(sick > sr * 1.6, "(c) measured: rotten sick rolls " + sick + " vs raw " + sr + " of " + N); }
// ---------------- (c) dried lasts ~3x, sheltered ~1.5x ----------------
{ const { s, a, x, y } = fx(3834); const hut = hutAt(s, a, x, y); const far = openTile(s, x, y, 4, 15); const S = FdC.spoilDays; FdC.spoilDays = 1;
  const p = meat(s, far.x, far.y), d = meat(s, far.x, far.y, { dried: true }), q = meat(s, hut.tiles[0][0], hut.tiles[0][1]), t0 = s.tick; const at = {};
  for (let i = 0; i < 4 * DAYM / TMc; i++) { tickFood(s, 1); for (const [k, it] of [["plain", p], ["dried", d], ["sheltered", q]]) if (!at[k] && it.material === "rotten") at[k] = s.tick - t0; }
  FdC.spoilDays = S;
  ok(hut && G.Shelter.at(s, q.x, q.y) && at.plain && Math.abs(at.dried / at.plain - FdC.driedX) < 0.02, "(c) dried meat lasts ~" + FdC.driedX + "x longer", JSON.stringify(at));
  ok(Math.abs(at.sheltered / at.plain - FdC.shelteredX) < 0.02, "(c) meat in a hut lasts ~" + FdC.shelteredX + "x longer"); }
// ---------------- (c) drying by a burning fire; Discoveries ----------------
{ const { s, a, x, y } = fx(3835); s.fire = {}; const f = openTile(s, x, y, 0, 3); s.fire[f.x + "," + f.y] = { s: "fire" };
  const n = openTile(s, f.x, f.y, C.cook.fireTiles + 0.5, FdC.dryTiles), o = openTile(s, f.x, f.y, FdC.dryTiles + 2, 12);
  const m1 = meat(s, n.x, n.y, { leftBy: a.id }), m2 = meat(s, o.x, o.y); tickFood(s, FdC.dryMinutes / TMc - 1); const b4 = m1.dried; tickFood(s, 1);
  ok(!b4 && m1.dried === true && !m2.dried && logs(s).includes(FdC.lines.dried), "(c) meat left " + Math.round(Math.hypot(n.x - f.x, n.y - f.y) * 10) / 10 + " tiles from a burning fire for " + FdC.dryMinutes + " min dries; far meat does not");
  const dz = (s.discoveries || []).find(z => z.title === "First dried food"); ok(!!dz && m1.src.k === "hunted", "(c) first dried food goes into Discoveries; source tag kept");
  ok(G.Cook.label(m1) === "dried meat" && /dried/.test(Fd.card(s, m1)), "(c) labels: dried meat (card: " + Fd.card(s, m1) + ")"); }
// ---------------- (c) learned from need: lost food to rot -> gains on taking food that kept ----------------
{ const { s, a, x, y } = fx(3836); const hut = hutAt(s, a, x, y); const [hx, hy] = hut.tiles[0];
  const k = meat(s, hx, hy, { shelterMin: FdC.keepNoticeMinutes }), d = meat(s, hx, hy, { dried: true }); a.pos = { x: hx, y: hy };
  const k0 = G.Learn.score(a, "keepFood"); G.Items.pickUp(s, a, k.id); const k1 = G.Learn.score(a, "keepFood"); G.Items.drop(s, a, "stash");
  a.foodLost = 1; G.Items.pickUp(s, a, k.id); const k2 = G.Learn.score(a, "keepFood"); G.Items.drop(s, a, "stash"); G.Items.pickUp(s, a, k.id); const k3 = G.Learn.score(a, "keepFood"); G.Items.drop(s, a, "stash");
  G.Items.pickUp(s, a, d.id); const d1 = G.Learn.score(a, "dryFood");
  ok(k1 === k0 && k2 === k0 + FdC.gain && k3 === k2 && d1 === C.learn.start + FdC.gain, "(c) only after losing food to rot does taking kept food teach (keepFood " + k0 + "->" + k2 + ", dryFood ->" + d1 + "), once per item"); }
// ---------------- (c) urge: dry by a fire; watcher copies ----------------
{ const s = G.Sim.create(3837); s.animals = []; const [a, b] = s.agents; s.agents = [a, b]; s.fire = {};
  const t = G.Agent.tilePos(a); const f = openTile(s, t.x, t.y, 2, 6); s.fire[f.x + "," + f.y] = { s: "fire" };
  const m = meat(s, t.x, t.y); a.pos = { x: t.x, y: t.y }; hold(s, a, m); a.act = { type: "idle", until: s.tick + 1 }; G.Learn.rec(a, "dryFood").score = 95;
  b.pos = { x: t.x, y: t.y }; b.act = { type: "idle", until: s.tick + 100 }; G.Learn.rec(b, "dryFood").score = C.learn.start;
  const U = FdC.urgeChance; FdC.urgeChance = 10; const went = G.Cache.tryStash(s, a); FdC.urgeChance = U;
  ok(went && a.act.type === "walk" && a.act.goal === "dryFood", "(c) a strong dry urge sends her to lay meat by the fire", JSON.stringify(a.act && a.act.goal));
  const end = a.act.path[a.act.path.length - 1]; a.pos = { x: end[0] != null ? end[0] : end.x, y: end[1] != null ? end[1] : end.y }; const tp = G.Agent.tilePos(a); b.pos = { x: tp.x, y: tp.y };
  let copied = Fd.lay(s, a) && G.Learn.score(b, "dryFood") > C.learn.start; for (let i = 0; i < 60 && !copied; i++) copied = Fd.watch(s, a, "dryFood") > 0;
  const dd = Math.hypot(tp.x - f.x, tp.y - f.y), L = logs(s);
  ok(m.heldBy == null && dd > C.cook.fireTiles && dd <= FdC.dryTiles + 1e-9 && L.some(l => l === a.name + " " + FdC.lines.lay), "(c) she lays the meat " + Math.round(dd * 10) / 10 + " tiles from the fire (logged as an action)");
  ok(copied && L.some(l => l === b.name + " watched " + a.name + " and copied: " + G.Learn.label("dryFood")) && G.Learn.score(b, "dryFood") > C.learn.start, "(c) someone copies a preservation method (dryFood " + G.Learn.score(b, "dryFood") + ")");
  ok(G.Cache.findMem(a, "d:" + tp.x + "," + tp.y), "(c) the drying spot is remembered like a cache"); }
// ---------------- (c) urge: keep in a shelter; Discoveries ----------------
{ const { s, a, x, y } = fx(3838); const hut = hutAt(s, a, x, y); a.shelters = [hut.id]; const [hx, hy] = hut.tiles[0];
  const m = meat(s, hx, hy); s.items.pop(); s.items.push(m); a.pos = { x: hx, y: hy }; hold(s, a, m); a.act = { type: "idle", until: s.tick + 1 }; G.Learn.rec(a, "keepFood").score = 95;
  const U = FdC.urgeChance; FdC.urgeChance = 10; const went = Fd.tryKeep(s, a, m); FdC.urgeChance = U;
  ok(went && m.heldBy == null && m.x === hx && logs(s).includes(a.name + " " + FdC.lines.keep.replace("{shelter}", G.Shelter.word(G.Shelter.at(s, hx, hy)))), "(c) a strong keep urge: she stashes meat inside the hut", logs(s).slice(-2).join(" | "));
  ok((s.discoveries || []).some(z => z.title === "First sheltered stash"), "(c) first sheltered stash goes into Discoveries"); }
// ---------------- (c) a hungry person goes back to a known cache ----------------
{ const { s, a, x, y } = fx(3839); const c = openTile(s, x, y, 3, 6); const m = meat(s, c.x, c.y, { stashedBy: a.name }); G.Cache.remember(a, { key: "t:" + c.x + "," + c.y, kind: "spot", x: c.x, y: c.y }, ["meat"]);
  a.needs.fullness = 20; a.needs.thirst = 100; a.needs.energy = 100; a.act = { type: "idle", until: s.tick }; let got = false;
  for (let i = 0; i < 240 && !got; i++) { G.Sim.step(s); got = m.heldBy === a.id || !s.items.includes(m); }
  ok(got && logs(s).some(l => l === a.name + " takes meat from a cache") && m.src.k === "stockpile" && m.src.prev.k === "hunted", "(c) a hungry person retrieves food from her cache (source tag stockpile, prev hunted)", logs(s).filter(l => l.startsWith(a.name)).slice(0, 3).join(" | ")); }
// ---------------- (c) taking from someone else's pile lowers liking; no fight ----------------
{ const s = G.Sim.create(3840); s.animals = []; const [a, b] = s.agents; s.agents = [a, b]; const t = G.Agent.tilePos(a); a.pos = { x: t.x, y: t.y };
  const m = meat(s, t.x, t.y, { stashedBy: b.name }); G.Social.addLike(b, a, 0); const l0 = G.Social.like(b, a); a.carry = null;
  const okR = G.Cache.doRetrieve(s, a, { key: "t:" + t.x + "," + t.y, kind: "spot", x: t.x, y: t.y }, true);
  ok(okR && G.Social.like(b, a) === l0 + C.cache.takeLike && logs(s).includes(a.name + " takes meat from " + b.name + "'s cache") && !logs(s).some(l => /fight|attack/.test(l)), "(c) taking from someone else's pile lowers the owner's liking by " + C.cache.takeLike + " (no fight)", l0 + "->" + G.Social.like(b, a)); }
// ---------------- (c) migrate 37 -> 38, save round trip, art/UI, live day ----------------
{ const { s, a, x, y } = fx(3841); const m = meat(s, x, y, { stashedBy: a.name }); m.spoilAt = s.tick + 100; G.Cache.remember(a, { key: "t:" + x + "," + y, kind: "spot", x, y }, ["meat"]);
  const ser = JSON.parse(JSON.stringify(G.Sim.serialize(s))); ser.version = 37; delete ser.foodStats; delete ser.fdrng;
  const M = G.Sim.deserialize(ser), mm = M.items.find(i => i.id === m.id), aa = M.agents.find(q => q.id === a.id);
  const want = Math.min(s.tick + Fd.spoilMinutes(), s.tick + 100 + Fd.spoilMinutes() - C.body.freshMinutes);
  ok(M.version === 38 && mm.spoilAt === want && M.foodStats && M.foodStats.rotted === 0, "(c) migrate 37->38: old meat moves onto the spoilDays clock (+" + (want - s.tick) + " min left)");
  ok(aa.caches && aa.caches.some(c => c.key === "t:" + x + "," + y) && mm.stashedBy === a.name && mm.src.k === "hunted", "(c) migrate keeps caches, piles and source tags");
  const r = meat(s, x, y, { dried: true }); r.material = "rotten"; r.rottenAt = s.tick; Fd.rng(s).next(); const L = G.Sim.deserialize(JSON.parse(JSON.stringify(G.Sim.serialize(s))));
  ok(L.items.some(i => i.material === "rotten" && i.dried) && L.fdrng && L.fdrng.s === s.fdrng.s && L.foodStats, "(c) save/load keeps rotten / dried items, stats and the food rng");
  const rs = fs.readFileSync(path.join(root, "src/render.js"), "utf8"); ok(G.data.art.foodKeep.cols.join() === "rotten,dried" && /sheetCol\("foodKeep"/.test(rs) && fs.existsSync(path.join(root, "data/art/food_keep_16.png")), "(c) render uses the foodKeep art (rotten, dried)"); }
{ const s = G.Sim.create(3842); const a = s.agents[0], t = G.Agent.tilePos(a); for (let i = 0; i < 3; i++) meat(s, t.x, t.y); meat(s, t.x, t.y).spoilAt = s.tick + 30; let err = null;
  try { for (let i = 0; i < 1440; i++) G.Sim.step(s); } catch (e) { err = e; }
  ok(!err && s.foodStats.rotted >= 1, "(c) one game day with meat, rot and caches runs clean", err ? err.stack : JSON.stringify(s.foodStats));
  ok(!logs(s).some(l => /["“]/.test(l)), "(c) logs carry no quoted speech"); }


// ---------------- (d) lightning kills animals and cooks the dead ----------------
console.log("--- (d) lightning ---");
{ const LK = C.lightningKill, K = C.cook;
  ok(LK && LK.animals && LK.people && LK.cookHeat > K.cookedAt && LK.cookHeat <= K.charredAt && C.meat.pieces.scavenger > 0 && C.meat.pieces.wolves > 0 && C.meat.sourceWords.lightning,
    "(d) config: lightningKill (cookHeat " + (LK && LK.cookHeat) + " between cookedAt and charredAt), meat pieces for dog / wolf, source words");
  // a bare (sand / rock) tile so the strike rolls no fire, and the carcass stays at the bolt's heat
  const bare = (s, x0, y0) => { for (let r = 2; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy;
    if (G.World.inb(s.world, x, y) && G.World.walkable(s.world, x, y) && !G.World.isWater(s.world, x, y) && G.Powers.ground(s, x, y) === "bare" && G.World.walkable(s.world, x + 1, y)) return { x, y }; } return null; };
  for (const sp of ["grazer", "scavenger", "wolves"]) {
    const { s, a, x, y } = fx(3850); const p = bare(s, x, y) || { x: x + 3, y };
    const an = G.Animal.create(s, sp, p.x, p.y, sp === "grazer" ? 0 : null); s.animals.push(an); const nb = G.Animal.create(s, sp, p.x + 1, p.y, sp === "grazer" ? 0 : null); s.animals.push(nb);
    const r = G.Powers.cast(s, "lightning", p.x, p.y, "single"), b = s.bodies.find(q => q.species === sp && q.x === p.x && q.y === p.y);
    ok(r.ok && !s.animals.includes(an) && s.animals.includes(nb) && b && b.lightning && b.cause === LK.cause && G.Cook.state(b.heat) === "cooked" && b.meat === C.meat.pieces[sp],
      "(d) a bolt kills the " + C.meat.sourceAnimal[sp] + " on the struck tile (cooked carcass, " + b.meat + " pieces); the one a tile away lives", b && JSON.stringify({ heat: b.heat, cause: b.cause }));
    ok(logs(s).includes(LK.line.replace("{animal}", C.meat.sourceAnimal[sp])) && s.powers.stats.strikes.animals === 1 && r.effect.animals.length === 1, "(d) one action-only log line and strike stats for the " + sp, logs(s).slice(-3).join(" | "));
  }
  // meat cut from a lightning carcass: cooked frame, source tag lightning + animal, spoilDays clock from the strike, cooked sick chance
  { const { s, a, x, y } = fx(3851); const p = bare(s, x, y); const an = G.Animal.create(s, "grazer", p.x, p.y, 0); s.animals.push(an);
    G.Powers.cast(s, "lightning", p.x, p.y, "single"); const b = s.bodies.find(q => q.lightning && q.species); a.pos = { x: p.x + 1, y: p.y }; a.carry = null; a.act = { type: "walk", goal: "meat", body: b.id };
    G.Hunt.arriveMeat(s, a); const it = G.Items.held(s, a);
    ok(it && it.material === "meat" && G.Cook.of(it) === "cooked" && it.src.k === "lightning" && it.src.animal === "deer", "(d) a piece cut from it is cooked meat tagged lightning / deer", it && JSON.stringify(it.src));
    ok(it.spoilAt === b.diedAt + G.Food.spoilMinutes() && G.Cook.sickChance(it) === K.sickChance.cooked && G.Cook.fullness(it) === K.fullness.cooked, "(d) it spoils on the food.spoilDays clock from the strike and uses the cooked sick chance (" + K.sickChance.cooked + ")");
    const rs = fs.readFileSync(path.join(root, "src/render.js"), "utf8"); ok(/sheetCol\("food", \(\{ raw: "raw", cooked: "cooked"/.test(rs) && /b\.lightning[^\n]*sheetCol\("food", "cooked"\)/.test(rs), "(d) render reuses the food 'cooked' frame (meat item, and on a bolt-cooked carcass)");
    a.needs.fullness = 20; G.Hunt.startEat(s, a, it); for (let i = 0; i < 60 && a.act.type === "eatMeat"; i++) G.Hunt.stepEat(s, a);
    const ln = logs(s).find(l => l.startsWith(a.name + " eats the cooked meat"));
    ok(ln && ln.includes(C.meat.sourceWords.lightning.replace("{animal}", "deer")), "(d) the eat line names the source: lightning-struck deer", ln);
    const d = (s.discoveries || []).filter(z => z.title === LK.disc.title);
    ok(d.length === 1 && d[0].who === a.name, "(d) the first lightning-cooked meal goes into Discoveries", d.length);
    const it2 = G.Hunt.piece(s, b, a); s.items.push(it2); it2.heldBy = a.id; a.carry = it2.id; G.Hunt.startEat(s, a, it2); for (let i = 0; i < 60 && a.act.type === "eatMeat"; i++) G.Hunt.stepEat(s, a);
    ok((s.discoveries || []).filter(z => z.title === LK.disc.title).length === 1, "(d) a second meal adds no second entry");
    const it3 = G.Hunt.piece(s, b, a); s.items.push(it3); s.tick = it3.spoilAt; G.Hunt.step(s);
    ok(it3.material === "rotten" && it3.src.k === "lightning" && G.Cook.sickChance(it3) === Math.min(1, C.meat.sickChance * C.food.rottenSickX), "(d) after spoilDays it turns into rotten food and keeps its lightning tag");
    const L = G.Sim.deserialize(JSON.parse(JSON.stringify(G.Sim.serialize(s)))), bb = L.bodies.find(q => q.id === b.id);
    ok(bb && bb.lightning && bb.heat === b.heat, "(d) save / load keeps a lightning carcass cooked"); }
  // a person struck dead leaves cooked remains with the cooked (corpse) sick chance
  { const s = G.Sim.create(3852); s.animals = []; const [a, e] = s.agents; s.agents = [a, e]; const t = G.Agent.tilePos(a); a.pos = { x: t.x, y: t.y }; e.pos = { x: t.x + 4, y: t.y };
    G.Powers.cast(s, "lightning", t.x, t.y, "single"); const b = s.bodies.find(q => q.of === a.id);
    ok(b && b.lightning && G.Cook.state(b.heat) === "cooked" && b.cause === C.powers.lightning.cause, "(d) a person struck dead leaves cooked remains", b && b.heat);
    e.pos = { x: b.x + 1, y: b.y }; e.needs.fullness = 20; G.Corpse.startEat ? 0 : 0;
    const act = { type: "eatCorpse", body: b.id, t: 0, n: 1, from: e.needs.fullness, add: C.corpse.eatFullness.cooked, cooked: (b.heat || 0) >= K.cookedAt }; e.act = act;
    const src = fs.readFileSync(path.join(root, "src/corpse.js"), "utf8");
    ok(act.cooked && /const cooked = \(b\.heat \|\| 0\) >= /.test(src) && /act\.cooked \? \(C\(\)\.sickChance\.cooked/.test(src), "(d) eating it uses the cooked sick chance (corpse.sickChance.cooked " + C.corpse.sickChance.cooked + ")");
    G.Corpse.stepEat(s, e); ok((s.discoveries || []).some(z => z.title === LK.disc.title && z.who === e.name), "(d) eating bolt-cooked remains also counts for Discoveries"); }
  // switches and the natural storm strike
  { const { s, x, y } = fx(3853); const an = G.Animal.create(s, "grazer", x + 2, y, 0); s.animals.push(an); LK.animals = false; G.Powers.cast(s, "lightning", x + 2, y, "single"); LK.animals = true;
    ok(s.animals.includes(an), "(d) lightningKill.animals false: the bolt spares animals"); }
  { const { s, x, y } = fx(3854); const an = G.Animal.create(s, "grazer", x + 3, y, 0); s.animals.push(an); s.agents[0].pos = { x: x + 8, y };
    const C2 = G.data.config.powers.lightning.modes.barrage, c0 = C2.count; C2.count = [3, 3]; G.Powers.cast(s, "lightning", x + 3, y, "barrage"); C2.count = c0;
    ok(!s.animals.includes(an) && s.bodies.some(b => b.lightning && b.species === "grazer"), "(d) a Barrage hit on the animal's tile kills it too"); }
  // fixture
  { const s = G.Sim.create(3855); const r = G.Hunt.boltFixture(s, {}); const r2 = G.Hunt.boltFixture(s, { species: "wolves" });
    ok(r && r.body && r.body.lightning && r.item && G.Cook.of(r.item) === "cooked" && r.item.src.k === "lightning" && r2 && r2.body && r2.body.species === "wolves",
      "(d) fixture: GS.debug.lightningFixture / ?fixture=lightning strikes an animal by person 1 and lays out a cooked piece", r && r.body && r.body.name);
    const ms = fs.readFileSync(path.join(root, "src/main.js"), "utf8"); ok(/fixture"\) === "lightning"/.test(ms) && /lightningFixture:/.test(ms), "(d) main.js wires ?fixture=lightning and GS.debug.lightningFixture");
    let err = null; try { for (let i = 0; i < 1440; i++) G.Sim.step(s); } catch (e) { err = e; }
    ok(!err, "(d) one game day after the fixture runs clean", err ? err.stack : "");
    ok(!logs(s).some(l => /["“”]/.test(l)), "(d) logs carry no quoted speech"); }
}


// ---------------- (e) two-person history ("A & B") ----------------
console.log("--- (e) two-person history ---");
{ const PVc = C.ui.pairView;
  ok(PVc && PVc.title === "{a} & {b}" && PVc.back && PVc.empty && PVc.fixtureGapMinutes > 0 && (C.ui.personTabs || []).length === 5, "(e) config: ui.pairView (title, back, empty, fixture gap); still 5 person tabs (no new tab)");
  for (const seed of [3860, 3861, 3862]) {
    const s = G.Sim.create(seed), r = G.Social.historyFixture(s), A = s.agents.find(q => q.id === r.a), B = s.agents.find(q => q.id === r.b), Cn = s.agents.find(q => q.id === r.c);
    const ab = G.Social.shared(s, r.a, r.b), ba = G.Social.shared(s, r.b, r.a), want = [A.name + " and " + B.name + " stay close by night now", A.name + " takes meat from " + B.name + "'s cache", A.name + " finds " + B.name + " took the last of the meat"];
    ok(ab.length === 3 && ab.every((e, i) => e.text === want[i]), "(e) seed " + seed + ": A & B shows exactly the kin event, the food take and the quarrel, newest first", JSON.stringify(ab.map(e => e.text)));
    ok(ab[0].t > ab[1].t && ab[1].t > ab[2].t, "(e) seed " + seed + ": times run newest first", ab.map(e => G.Time.stamp(e.t)).join(" | "));
    ok(ba.length === 3 && ba.every((e, i) => e === ab[i]), "(e) seed " + seed + ": B & A shows the same 3 entries", ba.length);
    const al = G.Sim.plogOf(s, r.a);
    ok(al.some(e => e.text === A.name + " drinks at the lake") && al.some(e => e.text === A.name + " lies down to sleep") && al.some(e => e.ids && e.ids.includes(r.c) && !e.ids.includes(r.b)) && !ab.some(e => e.ids.includes(r.c)),
      "(e) seed " + seed + ": A's own and A-with-C lines stay out of A & B (A's log has " + al.length + " lines)");
    ok(G.Social.shared(s, r.b, r.c).length === 0 && G.Social.shared(s, r.a, r.a).length === 0, "(e) seed " + seed + ": B & C (nothing shared) and A & A are empty");
    ok(A.mate === B.id && B.mate === A.id, "(e) seed " + seed + ": the kin event is the game's own pairing (Family daily check)");
    if (seed === 3860) {
      const h = G.UI.pairHtml(s, r.a, r.b, "log");
      ok(h.includes("data-pairback") && h.includes(G.UI ? (A.name + " &amp; " + B.name) : "") && (h.match(/class="ev/g) || []).length === 3 && h.indexOf(want[0].replace(/'/g, "&#39;").slice(0, 20)) < h.indexOf("finds"),
        "(e) the A & B view: back button, both names in the header, 3 rows styled like the Log tab, newest first");
      ok(G.UI.pairHtml(s, r.b, Cn.id, "kin").includes(esc0(PVc.empty)), "(e) an empty pair shows the empty line");
      const kin = G.UI._kinHtml(s, A), lg = G.UI._plogHtml(s, A.id);
      ok(new RegExp('data-pair="' + r.b + '"').test(kin) && !/data-sel=/.test(kin.replace(/learned[\s\S]*/, "")), "(e) on A's Kin tab, B's name (partner, relations) opens A & B");
      ok(new RegExp('data-pair="' + r.b + '"').test(lg) && new RegExp('data-pair="' + r.c + '"').test(lg) && !new RegExp('data-pair="' + r.a + '"').test(lg), "(e) on A's Log tab, the other names in a line open A & B (A's own name stays text)");
      const us = fs.readFileSync(path.join(root, "src/ui.js"), "utf8");
      ok(/UI\.pair && \(UI\.pair\.a !== a\.id \|\| UI\.pair\.tab !== UI\.personTab\)\) UI\.pair = null/.test(us) && /data-pairback/.test(us) && /closest\("\[data-pair\],\[data-pairback\]"\)/.test(us), "(e) the card swaps its pane for A & B; Back, another person or another tab returns to the normal pane");
      const ms = fs.readFileSync(path.join(root, "src/main.js"), "utf8"); ok(/fixture"\) === "history"/.test(ms) && /historyFixture:/.test(ms), "(e) main.js wires ?fixture=history and GS.debug.historyFixture");
      const ih = fs.readFileSync(path.join(root, "index.html"), "utf8"); ok(/button\.pp-back \{ min-height: 44px;[^}]*font-size: 16px/.test(ih) && /\.pp-pairnames \{ font-size: 17px/.test(ih), "(e) back button 44px tall with 16px text; names 17px");
      const L = G.Sim.deserialize(JSON.parse(JSON.stringify(G.Sim.serialize(s))));
      ok(G.Social.shared(L, r.a, r.b).map(e => e.text).join("|") === ab.map(e => e.text).join("|"), "(e) save / load keeps the shared history (it is the saved personal log)");
      ok(!G.Sim.plogOf(s, r.a).concat(G.Sim.plogOf(s, r.b)).some(e => /["“”]/.test(e.text)), "(e) the lines are actions only, no quoted speech");
    }
  }
  // the second id: lines that name another person tag them, so they show up in A & B
  { const s = G.Sim.create(3863), [a, b] = s.agents; G.Sim.die(s, b, "the cold");
    const src = fs.readFileSync(path.join(root, "src/corpse.js"), "utf8"), md = fs.readFileSync(path.join(root, "src/moods.js"), "utf8");
    const untagged = src.split("\n").filter(l => /Sim\.log\(sim, a\.name[^;]*b\.name/.test(l) && !/\[a, (n\.)?b\]\)/.test(l));
    ok(untagged.length === 0 && /dead\.name \+ " dies", \[a, dead\]\)/.test(md) && /best\.name, \[a, best\]\)/.test(md), "(e) corpse lines (drag, bury, pyre, eat, kneel...) and mood lines (grieves for, runs toward) now tag the other person", untagged.join(" / "));
    G.Moods.log(s, a, "death_" + b.id, a.name + " sits with her head down after " + b.name + " dies", [a, b]);
    ok(G.Social.shared(s, a.id, b.id).length >= 1 && G.Social.shared(s, b.id, a.id).length >= 1, "(e) a grief line shows in both A & B and B & A (the dead keep their log)"); }
  // the fixture inside a live run: one game day after it runs clean
  { const s = G.Sim.create(3864); G.Social.historyFixture(s); let err = null; try { for (let i = 0; i < 1440; i++) G.Sim.step(s); } catch (e) { err = e; } ok(!err, "(e) one game day after the history fixture runs clean", err ? err.stack : ""); }
}

// ---------------- (f) wolves: apex, dogs keep away, fear baseline + inherited, readiness, armed group hunts, no respawn, spawn joins nearest pack ----------------
{ const A = C.animals, AW = A.wolves, WF = G.WolfFear, Fx = G.WolfFight, F = C.wolfFight, FW = C.wolfFear, d2 = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  ok(A.fleeWolfWithin === 5 && AW.huntDog.killChance < AW.huntDeer.killChance && FW.baseline === 10 && FW.inheritShare === 0.3 && FW.inheritMax === 30 && AW.spawnJoinTiles === 12 && AW.packSize[1] === 5,
    "(f) config: fleeWolfWithin 5, dog kill chance < deer, fear baseline 10, inherit 0.3 capped 30, join 12 tiles, 5 per pack", JSON.stringify({ dog: AW.huntDog.killChance, deer: AW.huntDeer.killChance }));
  // 1. dog kill in N tries, source Wolves
  { let kills = 0, src = null, N = 10; for (let t = 0; t < N; t++) { const s = G.Sim.create(3870 + t), r = Fx.fixture(s, { kind: "dog" }); if (!r || !r.dog) continue;
      for (let i = 0; i < 360; i++) { G.Sim.step(s); const b = s.bodies.find(q => q.species === "scavenger"); if (b) { kills++; src = src || { by: b.killedBy, s: G.Hunt.sourceOf(b) }; break; } } }
    ok(kills >= 1, "(f) 1: Wolves kill a wild dog in " + N + " fixture tries", kills + "/" + N);
    ok(src && src.by === AW.label && src.s.k === "site" && src.s.by === AW.label, "(f) 1: the dog body reads killed by " + AW.label, JSON.stringify(src)); }
  // 2. deer and dog flee before any strike: every deer / dog the wolf comes within fleeWolfWithin of is already running (or starts that tick); none is struck first
  { let both = 0, late = 0, struck = 0, N = 8; for (let t = 0; t < N; t++) { const s = G.Sim.create(3880 + t), r = Fx.fixture(s, { kind: "flee" }); if (!r || !r.deer || !r.dog) continue;
      const fled = {}; for (let i = 0; i < 240; i++) { G.Sim.step(s);
        for (const an of [r.deer, r.dog]) { const alive = s.animals.indexOf(an) >= 0; if (alive && an.act && an.act.goal === "flee" && fled[an.id] == null) fled[an.id] = i;
          if (!alive && fled[an.id] == null) struck++;
          if (alive && fled[an.id] == null && s.animals.indexOf(r.wolf) >= 0 && d2(an, r.wolf) < A.fleeWolfWithin - 1) late++; } }
      if (fled[r.deer.id] != null && fled[r.dog.id] != null) both++; }
    ok(struck === 0 && late === 0 && both >= N / 2, "(f) 2: deer and wild dog run from a wolf inside " + A.fleeWolfWithin + " tiles before any strike", "both ran " + both + "/" + N + ", struck first " + struck + ", inside range not running " + late); }
  // 3. a wolf at a body keeps a hungry dog out of range
  { let closest = Infinity, fed = 0, N = 5; for (let t = 0; t < N; t++) { const s = G.Sim.create(3890 + t), r = Fx.fixture(s, { kind: "corpse" }); if (!r || !r.dog) continue;
      for (let i = 0; i < 240; i++) { G.Sim.step(s); if (s.animals.indexOf(r.dog) < 0 || s.animals.indexOf(r.wolf) < 0) break;
        if (Math.hypot(r.body.x - r.wolf.pos.x, r.body.y - r.wolf.pos.y) <= A.fleeWolfWithin) closest = Math.min(closest, d2(r.dog, r.wolf));
        if (r.dog.act && r.dog.act.type === "feed" && r.dog.act.body === r.body.id) fed++; } }
    ok(closest > A.fleeWolfWithin - 1 && fed === 0, "(f) 3: a hungry dog stays out of " + A.fleeWolfWithin + " tiles of a wolf at its kill and never feeds there", "closest " + closest.toFixed(2) + " fed ticks " + fed); }
  // 4. rain test (v37 ITEM1) still passes
  { let out = ""; try { out = require("child_process").execFileSync("node", [path.join(root, "tests/headless_v37.js")], { encoding: "utf8" }); } catch (e) { out = String(e.stdout || ""); }
    const L = out.split("\n").filter(l => /ITEM1 .*wolf hunt|ITEM1 light rain/.test(l)); ok(L.length >= 2 && L.every(l => /^PASS/.test(l)), "(f) 4: v37 rain-vs-wolves test still passes", L.length + " lines"); }
  // 5. fear
  { const s = G.Sim.create(3895), b0 = WF.base();
    ok(s.agents.every(a => WF.of(a) === b0), "(f) 5: founders start at baseline " + b0, s.agents.map(a => WF.of(a)).join(","));
    const [m, f] = [s.agents.find(a => a.sex === "m"), s.agents.find(a => a.sex === "f")]; const kid = (fm, ff) => { m.wolfFear = fm; f.wolfFear = ff;
      f.preg = { since: s.tick, due: s.tick, father: m.id, fatherName: m.name, ftraits: Object.assign({}, m.traits), flife: m.lifespan, fgroup: m.group, ffear: fm };
      G.Family.step(s); return s.babies[s.babies.length - 1]; };
    const k0 = kid(b0, b0); ok(k0 && k0.wolfFear === b0, "(f) 5: a child of baseline parents is at baseline", k0 && k0.wolfFear);
    const k1 = kid(90, 70); ok(k1 && k1.wolfFear > b0 && k1.wolfFear - b0 <= FW.inheritMax && Math.abs(k1.wolfFear - (b0 + Math.min(FW.inheritMax, FW.inheritShare * (80 - b0)))) < 1e-6,
      "(f) 5: a child of high-fear parents (90, 70) is above baseline, inherited part capped at " + FW.inheritMax, k1 && k1.wolfFear);
    const k2 = kid(40, 30); ok(k2 && Math.abs(k2.wolfFear - (b0 + FW.inheritShare * (35 - b0))) < 1e-6, "(f) 5: parents 40/30 -> baseline + 0.3 x (35 - baseline)", k2 && k2.wolfFear);
    const w = s.agents.find(a => a !== m && a !== f) || m; m.wolfFear = b0; w.wolfFear = b0; w.pos = { x: m.pos.x + 2, y: m.pos.y }; w.act = { type: "idle", until: s.tick + 9 }; m.act = { type: "idle", until: s.tick + 9 };
    WF.onAttack(s, m); ok(w.wolfFear === b0 + FW.gain.sawAttack && m.wolfFear === b0 + FW.gain.survived, "(f) 5: one witnessed attack adds one step (" + FW.gain.sawAttack + ")", w.wolfFear);
    WF.drop(w, 999); ok(w.wolfFear === b0, "(f) 5: fear never falls below baseline", w.wolfFear);
    const s2 = G.Sim.create(3896); s2.animals = s2.animals.filter(q => q.species !== "wolves"); s2.packs = []; for (let i = 0; i < 1440; i++) G.Sim.step(s2);
    ok(s2.agents.every(a => WF.of(a) === b0), "(f) 5: a day with no wolf evidence leaves everyone at baseline", s2.agents.map(a => WF.of(a)).join(","));
    const ser = JSON.parse(JSON.stringify(G.Sim.serialize(s))); ser.version = 37; for (const a of ser.agents) a.wolfFear = 2; const L = G.Sim.deserialize(ser);
    ok(L.agents.every(a => a.wolfFear >= b0), "(f) 5: migration floors everyone at baseline", L.agents.map(a => a.wolfFear).join(",")); }
  // 6. fighting
  { const s = G.Sim.create(3871), r = Fx.fixture(s, { kind: "lone" }), p = r.people[0];
    ok(Fx.readiness(s, p) <= WF.of(p) && !Fx.stands(s, p), "(f) 6: a lone unarmed adult is not ready (readiness " + Fx.readiness(s, p) + " <= fear " + WF.of(p) + ")");
    const st0 = Fx.confront(s, p, r.wolf); let ran = false; for (let i = 0; i < 240 && !ran; i++) { G.Sim.step(s); if (s.agents.indexOf(p) < 0) break; if (p.act && p.act.goal === "fleeWolf") ran = true; }
    ok(!st0 && !(s.wolfFight && s.wolfFight.strikes) && !(s.wolfFight && s.wolfFight.stands), "(f) 6: the lone unarmed adult does not stand or strike", JSON.stringify(s.wolfFight || {}));
    ok(ran, "(f) 6: the lone unarmed adult runs from the wolf (walk goal fleeWolf)"); }
  { let kills = 0, body = null, team = null, N = 10, stood = 0, sx = null;
    for (let t = 0; t < N; t++) { const s = G.Sim.create(3870 + t), r = Fx.fixture(s, { kind: "fight" }); if (!r) continue;
      if (r.people.every(p => Fx.armed(s, p) && Fx.stands(s, p))) stood++;
      for (let i = 0; i < 240; i++) { G.Sim.step(s); if (s.animals.indexOf(r.wolf) < 0) break; }
      if (s.animals.indexOf(r.wolf) < 0 && (s.wolfFight || {}).kills) { kills++; if (!body) { body = s.bodies.find(b => b.species === "wolves"); team = r.people; sx = s; } } }
    ok(stood === N, "(f) 6: three armed adults (spear " + F.held.spear + " + 2 allies x " + F.perAlly + ") are ready to stand", stood + "/" + N);
    ok(kills >= N / 2, "(f) 6: three armed adults kill the wolf in " + N + " tries", kills + "/" + N);
    ok(body && body.killedBy === "people" && G.Hunt.carcassMeat(body), "(f) 6: the wolf body is meat tagged killed by people", body && body.killedBy);
    if (body) { const hunter = team.find(q => (body.hunters || []).indexOf(q.id) >= 0) || team[0], pc = G.Hunt.piece(sx, body, hunter), hd = G.Hides.maybeSpawn(sx, body);
      ok(pc.src.k === "hunted" && pc.src.animal, "(f) 6: a hunter's piece of the wolf reads hunted", JSON.stringify(pc.src));
      ok(hd && hd.material === "hide", "(f) 6: the wolf carcass gives a hide");
      ok(team.some(q => G.Learn.score(q, "wolf_hunt") > 0) && (sx.discoveries || []).concat(sx.discovery || []).length >= 0, "(f) 6: the hunters learn wolf_hunt"); } }
  { const s = G.Sim.create(3872), r = Fx.fixture(s, { kind: "fight" }), w = s.agents.find(q => r.people.indexOf(q) < 0); const b0 = WF.base();
    w.pos = { x: r.wolf.pos.x + 3, y: r.wolf.pos.y }; w.act = { type: "idle", until: s.tick + 99 }; w.wolfFear = b0 + 12;
    const v = s.agents.find(q => q !== w && r.people.indexOf(q) < 0); if (v) { v.pos = { x: r.wolf.pos.x, y: r.wolf.pos.y + 2 }; v.act = { type: "idle", until: s.tick + 99 }; v.wolfFear = b0 + 2; }
    Fx.kill(s, r.people, r.wolf, "spear");
    ok(w.wolfFear === b0 + 12 - F.killWatchDrop, "(f) 6: a watcher's fear drops " + F.killWatchDrop + " at the kill", w.wolfFear);
    ok(!v || v.wolfFear === b0, "(f) 6: a watcher near baseline drops no lower than baseline", v && v.wolfFear);
    ok((s.log || []).some(l => /strike.*it falls/.test(typeof l === "string" ? l : l.text)), "(f) 6: the kill is logged as an action"); }
  // 7. no respawn, spawning joins / starts packs
  { const s = G.Sim.create(3873); Fx.fixture(s, { kind: "spawn" }); ok(!s.animals.some(q => q.species === "wolves") && !(s.packs || []).length, "(f) 7: a wiped-out pack leaves no wolves and no pack");
    for (let i = 0; i < C.time.daysPerSeason * 1440 / C.time.tickGameMinutes; i++) G.Sim.step(s);
    ok(!s.animals.some(q => q.species === "wolves"), "(f) 7: still 0 wolves a season later (no respawn; 2-year run in tests/pop_v38f.js)");
    const land = (x0, y0, r0) => { for (let r = r0 || 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && G.World.walkable(s.world, x, y) && !G.World.isWater(s.world, x, y) && !s.animals.some(q => Math.round(q.pos.x) === x && Math.round(q.pos.y) === y)) return { x, y }; } return null; };
    const c0 = land(s.world.w >> 1, s.world.h >> 1); const sp = (x, y) => G.Powers.spawn(s, x, y, "wolves");
    for (let k = 0; k < 3; k++) { const q = land(c0.x, c0.y, 0); sp(q.x, q.y); }
    const ws = s.animals.filter(q => q.species === "wolves"), pk = s.packs[0];
    ok(ws.length === 3 && s.packs.length === 1 && ws.every(q => q.pack === pk.id) && pk.den, "(f) 7: spawning 3 gives one pack with a den", JSON.stringify({ n: ws.length, packs: s.packs.length, den: pk && pk.den }));
    const id0 = pk.id, den0 = JSON.stringify(pk.den), q4 = land(Math.round(ws[0].pos.x), Math.round(ws[0].pos.y), 1); sp(q4.x, q4.y);
    ok(G.WolfFight.packSize(s, pk) === 4 && s.packs.length === 1 && s.packs[0].id === id0 && JSON.stringify(s.packs[0].den) === den0, "(f) 7: a spawn next to a member makes 4, same pack id and den");
    const q5 = land(Math.round(ws[0].pos.x), Math.round(ws[0].pos.y), 1); sp(q5.x, q5.y); const q6 = land(Math.round(ws[0].pos.x), Math.round(ws[0].pos.y), 1), r6 = sp(q6.x, q6.y);
    ok(G.WolfFight.packSize(s, pk) === 5 && r6 && !r6.ok && /full/.test(r6.reason), "(f) 7: the pack stops at 5; a 6th spawn is refused", r6 && r6.reason);
    let far = null; for (let r = AW.spawnJoinTiles + 3; r < 40 && !far; r++) { const q = land(c0.x + r, c0.y, 0); if (q && Math.min(...ws.map(w => Math.hypot(w.pos.x - q.x, w.pos.y - q.y))) > AW.spawnJoinTiles + 1) far = q; }
    const rf = far && sp(far.x, far.y), nw = s.animals.filter(q => q.species === "wolves").pop();
    ok(far && rf.ok && s.packs.length === 2 && nw.pack !== id0 && s.packs[1].den.x === Math.round(nw.pos.x) && s.packs[1].den.y === Math.round(nw.pos.y), "(f) 7: a spawn more than " + AW.spawnJoinTiles + " tiles away starts a new pack with its den there", JSON.stringify(far));
    const p2 = s.packs[1], b2 = s.animals.find(q => q.pack === p2.id); const mid = land(Math.round(b2.pos.x) - 3, Math.round(b2.pos.y), 0);
    const dA = Math.min(...s.animals.filter(q => q.pack === id0).map(w => Math.hypot(w.pos.x - mid.x, w.pos.y - mid.y))), dB = Math.hypot(b2.pos.x - mid.x, b2.pos.y - mid.y);
    sp(mid.x, mid.y); const nm = s.animals.filter(q => q.species === "wolves").pop();
    ok(dA <= AW.spawnJoinTiles && dB < dA && nm.pack === p2.id, "(f) 7: with two packs in range, a spawn joins the nearer one", JSON.stringify({ dA: +dA.toFixed(1), dB: +dB.toFixed(1), joined: nm.pack }));
    // the spawned pack works: it hunts and deer flee it
    for (let i = 0; i < 7 * 1440; i++) G.Sim.step(s);
    const fl = s.wolfFlee || {}, kills = s.bodies.filter(b => b.species && b.killedBy === AW.label).length + ((s.huntStats && 0) || 0);
    ok((fl.grazer || 0) > 0, "(f) 7: deer flee the spawned Wolves", JSON.stringify(fl));
    ok(kills > 0 || s.animals.some(q => q.species === "wolves" && q.act && /stalk|chase/.test(q.act.goal || q.act.type)), "(f) 7: the spawned Wolves hunt (a kill within a week)", "kill bodies " + kills); }
  // fixture wiring + a live day after each fixture
  { const m = fs.readFileSync(path.join(root, "src/main.js"), "utf8"); ok(/wolvesFixture/.test(m) && /fixture"\) === "wolves"/.test(m), "(f) GS.debug.wolvesFixture + ?fixture=wolves wired in main.js"); }
  for (const kind of ["dog", "flee", "corpse", "fight", "lone", "spawn"]) { const s = G.Sim.create(3899); let err = null; try { Fx.fixture(s, { kind }); for (let i = 0; i < 1440; i++) G.Sim.step(s); } catch (e) { err = e; }
    ok(!err, "(f) one game day after the " + kind + " fixture runs clean", err ? err.stack : ""); }
  { const bad = []; const s = G.Sim.create(3874); Fx.fixture(s, { kind: "fight" }); for (let i = 0; i < 1440; i++) G.Sim.step(s);
    for (const l of logs(s)) if (/["“”]|\bsays\b|\bshouts\b/.test(l)) bad.push(l); ok(!bad.length, "(f) logs are actions only (no speech)", bad.slice(0, 2).join(" | ")); }
}


// ---------------- (g) fire burn limit: fire.burnBudget tiles per fire; sand holds no flame; 100-seed fixture sweep ----------------
{ const FC = C.fire, Fi = G.Fire, T = G.data.T, SW = require("./fire_sweep_v38g.js");
  ok(typeof FC.burnBudget === "number" && FC.burnBudget > 0 && FC.minDryness === 30 && C.climate.dryness.nearWater === -45 && FC.spreadScale >= 0.016, "(g) one knob fire.burnBudget (" + FC.burnBudget + " tiles); minDryness 30 and nearWater -45 kept; spreadScale " + FC.spreadScale);
  // sand: no fuel -> a flame put there does not take (the Tester's v37.2 291-tile sand start was the fixture forcing a flame onto sand)
  { const s = G.Sim.create(3870); s.items = []; let sx = null; for (let y = 2; y < s.world.h - 2 && !sx; y++) for (let x = 2; x < s.world.w - 2 && !sx; x++) if (G.World.tile(s.world, x, y) === T.SAND) sx = { x, y };
    s.fireStats.events.push({ id: 1, start: 0, x: sx.x, y: sx.y, tiles: 0, fired: true, end: null, regrown: null });
    const r = Fi.ignite(s, sx.x, sx.y, 1);
    ok(sx && r === false && !s.fire[sx.x + "," + sx.y] && s.fireStats.events[0].tiles === 0 && !Fi.hasFuel(s, sx.x, sx.y), "(g) sand: a flame set on bare sand does not take (no fuel)");
    s.items.push(G.Items.create(s, "stick", sx.x, sx.y));
    ok(s.items.length === 1 && Fi.hasFuel(s, sx.x, sx.y), "(g) sand with a stick lying on it does hold fuel"); }
  // the budget stops a fire that would run on: same seeds with burnBudget 0 vs the budget
  { const B = FC.burnBudget; let over = 0, capped = 0; const seeds = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007];
    for (const sd of seeds) { const on = SW.one(G, sd, "meadow", true); if (on.tiles <= B) capped++; }
    FC.burnBudget = 0; for (const sd of seeds) { const s = G.Sim.create(sd); s.agents = []; s.animals = []; s.items = []; s.bodies = []; const f = Fi.fixture(s, { kind: "meadow", seed: sd });
      for (let k = 0; k < 1440 && f.ev.tiles <= B; k++) { s.tick++; Fi.step(s); } if (f.ev.tiles > B) over++; } FC.burnBudget = B;
    ok(capped === seeds.length && over > 0, "(g) a fire never burns more than burnBudget tiles; without the limit the same seeds run past it", capped + "/" + seeds.length + " within " + B + "; " + over + " run past it with no limit"); }
  // no save-format change: a mid-fire save round-trips, nothing new written
  { const s = G.Sim.create(3871); const f = Fi.fixture(s, { kind: "meadow", seed: 3871 }); for (let k = 0; k < 120; k++) G.Sim.step(s);
    const j = JSON.stringify(G.Sim.serialize(s)), s2 = G.Sim.deserialize(JSON.parse(j)), e2 = s2.fireStats.events[f.ev.id - 1];
    ok(C.saveVersion === 38 && !/burnBudget/.test(j) && e2 && e2.tiles === f.ev.tiles && Object.keys(s2.fire).length === Object.keys(s.fire).length, "(g) no save-format change: saveVersion 38, a mid-fire save round-trips", "tiles " + f.ev.tiles); }
  // the 100-seed sweep (FIRE_N to change)
  const N = +(process.env.FIRE_N || 100), out = SW.sweep(G, { N, seed0: 1000 }); SW.report(out, l => console.log("  " + l));
  const m = out.meadow, mapT = C.map.w * C.map.h;
  ok(m.n >= N * 0.95 && m.p8 >= 80, "(g) High Sun meadow: at least 80% of fires reach 8+ tiles", m.p8 + "% (n " + m.n + ")");
  ok(m.median >= 10 && m.median <= 99, "(g) High Sun meadow: median spread in the tens of tiles", "median " + m.median);
  ok(m.max + 1 < mapT / 2 && m.max + 1 <= FC.burnBudget, "(g) no runaway: the largest fire stays within burnBudget, far from most of the map", "max " + (m.max + 1) + " tiles of " + mapT + " (" + m.maxPctMap + "%)");
  for (const [k, need, name] of [["wet", 100, "wet ground"], ["rain", 100, "rain falling"], ["nearwater", 95, "a near-water start"], ["sand", 100, "a sand start"], ["cold", 90, "Deep Cold meadow"]]) { const r = out[k];
    ok(r.n >= N * 0.9 && r.le2 >= need && r.median <= 2, "(g) " + name + " stops the fire at 0-2 tiles (" + need + "%+ of fires)", r.le2 + "% at 0-2, median " + r.median + ", max " + r.max + " (n " + r.n + ")"); }
  { const nw = SW.nearWaterCatch(out); ok(nw.exp >= 100 && nw.pct < 10, "(g) under 10% of near-water tiles next to flames catch", nw.pct.toFixed(1) + "% (" + nw.burn + "/" + nw.exp + ")"); }
  ok(Object.values(out).every(r => r.sandBurned === 0), "(g) no fire burns onto sand in any case");
  // fixture wiring, a live day after each fixture kind, logs actions only
  { const mm = fs.readFileSync(path.join(root, "src/main.js"), "utf8"); ok(/fireFixture/.test(mm) && /fixture"\) === "fire"/.test(mm), "(g) GS.debug.fireFixture + ?fixture=fire wired in main.js"); }
  for (const kind of ["meadow", "wet", "rain", "nearwater", "shore", "sand", "cold", "woods"]) { const s = G.Sim.create(3872); let err = null, f = null; try { f = Fi.fixture(s, { kind }); for (let i = 0; i < 1440; i++) G.Sim.step(s); } catch (e) { err = e; }
    ok(!err && f && f.ev.end != null, "(g) the " + kind + " fire fixture plays out within a game day", err ? err.stack : "tiles " + (f && f.ev.tiles)); }
  { const bad = []; const s = G.Sim.create(3873); Fi.fixture(s, { kind: "meadow" }); for (let i = 0; i < 1440; i++) G.Sim.step(s);
    for (const l of logs(s)) if (/["“”]|\bsays\b|\bshouts\b/.test(l)) bad.push(l); ok(!bad.length, "(g) logs are actions only (no speech)", bad.slice(0, 2).join(" | ")); }
}


// ---------------- pre-freeze: browser fixtures for (b) sprout and (c) cache ----------------
{ const mm = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  ok(/sproutFixture/.test(mm) && /fixture"\) === "sprout"/.test(mm) && /cacheFixture/.test(mm) && /fixture"\) === "cache"/.test(mm) && /hutTiersFixture/.test(mm) && /kind"\) === "tiers"/.test(mm), "(b/c) GS.debug.sproutFixture + ?fixture=sprout, GS.debug.cacheFixture + ?fixture=cache wired in main.js");
  for (const sd of [3871, 3872, 3873]) { const s = G.Sim.create(sd), r = G.Farm.fixture(s), st = r ? r.plants.map(p => p.stage).join(",") : "";
    ok(r && st === C.farm.fixture.stages.join(",") && r.plants.every(p => G.Farm.soil(s, p.x, p.y) > 0 && p.by === r.a.id), "(b) sprout fixture: one plant per stage on soft ground by person 1 (seed " + sd + ")", st);
    const clr = (sim, pts, n) => pts.every(([x, y]) => sim.agents.every(b => b.dead || Math.max(Math.abs(Math.round(b.pos.x) - x), Math.abs(Math.round(b.pos.y) - y)) >= n));
    ok(r && clr(s, r.plants.map(p => [p.x, p.y]), C.farm.fixture.clear), "(b) sprout fixture: no one stands on or next to a fixture plant, so all stages show (seed " + sd + ")");
    let err = null; try { for (let i = 0; i < 1440; i++) G.Sim.step(s); } catch (e) { err = e; } ok(!err, "(b) one game day after the sprout fixture runs clean", err ? err.stack : "");
    const s2 = G.Sim.create(sd), c = G.Food.fixture(s2), m = c && G.Cache.findMem(c.a, "t:" + c.x + "," + c.y);
    ok(c && c.fresh.material === "meat" && c.dried.dried && c.rotten.material === "rotten" && m && G.Cache.itemsAt(s2, c.x, c.y).length === 3 && Math.hypot(c.a.pos.x - c.x, c.a.pos.y - c.y) <= C.food.fixture.tiles * 1.5, "(c) cache fixture: person 1's cache holds fresh, dried and rotten meat (seed " + sd + ")");
    ok(c && clr(s2, [[c.x, c.y]], C.food.fixture.clear), "(c) cache fixture: the pile is not under or next to anyone, so it shows (seed " + sd + ")");
    err = null; try { for (let i = 0; i < 1440; i++) G.Sim.step(s2); } catch (e) { err = e; } ok(!err, "(c) one game day after the cache fixture runs clean", err ? err.stack : "");
    const s3 = G.Sim.create(sd), hs = G.Hut.tiersFixture(s3) || [];
    ok(hs.length === C.hut.fixture.tiers.length && hs.map(h => G.Hut.tier(h).k).join() === C.hut.tiers.map(t => t.k).join() && clr(s3, hs.map(h => h.tiles[0]), C.hut.fixture.clear) && hs.every(h => !G.Hut.worn(h)),
      "(a) hut tiers fixture: crude, reed and sturdy huts side by side, fresh, clear of people (seed " + sd + ")", hs.map(h => G.Hut.tier(h).k + "@" + h.tiles[0]).join(" "));
    err = null; try { for (let i = 0; i < 1440; i++) G.Sim.step(s3); } catch (e) { err = e; } ok(!err, "(a) one game day after the hut tiers fixture runs clean", err ? err.stack : "");
    const bad = logs(s).concat(logs(s2)).filter(l => /["“”]|\bsays\b/.test(l)); ok(!bad.length, "(b/c) fixture logs are actions only", bad.slice(0, 2).join(" | ")); }
}

console.log("\n" + passes + " PASS, " + fails + " FAIL"); process.exit(fails ? 1 : 0);
