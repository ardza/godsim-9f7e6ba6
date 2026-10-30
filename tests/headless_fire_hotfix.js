// Fire-spread hotfix (config-only, saveVersion 37). Short fixtures only: one ignition per trial, fire-only steps until it burns out.
// Run: node tests/headless_fire_hotfix.js   (optional tuning: FIRE_MIN=30 FIRE_SCALE=0.0375 node tests/headless_fire_hotfix.js)
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
const ctx = { console, Math, JSON, performance: { now: () => 0 } }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
  "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
  "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
  "src/powers.js", "src/injury.js", "src/wolffear.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
  "src/cache.js", "src/hut.js", "src/sim.js"])
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
const G = ctx.GS, C = G.data.config, F = C.fire, W = G.World, T = G.data.T;
if (process.env.FIRE_MIN) F.minDryness = +process.env.FIRE_MIN;
if (process.env.FIRE_SCALE) F.spreadScale = +process.env.FIRE_SCALE;
if (process.env.FIRE_BUDGET) F.burnBudget = +process.env.FIRE_BUDGET;
if (process.env.FIRE_NEARWATER) C.climate.dryness.nearWater = +process.env.FIRE_NEARWATER;
const CAP = +(process.env.FIRE_CAP || 300), N = +(process.env.FIRE_N || 30), DAY = 1440, SEASON = C.time.daysPerSeason * DAY;
const tickIn = si => si * SEASON + Math.round(SEASON / 2) - C.time.startMinute;   // middle of season si (0 Greening, 1 High Sun, 3 Deep Cold)
let fails = 0; const ok = (c, name, info) => { if (!c) fails++; console.log((c ? "PASS " : "FAIL ") + name + (info ? "  [" + info + "]" : "")); };

function fixture(seed, si, pick, rain) {
  const s = G.Sim.create(seed); s.agents = []; s.animals = []; s.bodies = []; s.items = []; s.fire = {}; s.tick = tickIn(si);
  if (rain) { G.Powers.cast(s, "rain", s.world.w >> 1, s.world.h >> 1, "heavy"); const e = s.powers.effects.find(q => q.k === "rain");
    e.r = 9999; e.wetEnd = 1e9; e.bushEnd = 1e9; if (rain === "falling") { e.on = true; e.end = 1e9; } else { e.on = false; e.end = s.tick; } }
  const r = new G.RNG((seed * 7919) >>> 0), w = s.world, cand = [];
  for (let y = 3; y < w.h - 3; y++) for (let x = 3; x < w.w - 3; x++) if (pick(s, x, y)) cand.push([x, y]);
  if (!cand.length) return null;
  const [x, y] = cand[r.int(0, cand.length - 1)];
  s.fireStats.events.push({ id: 1, start: s.tick, x, y, tiles: 0, fired: true, end: null, regrown: null }); G.Fire.ignite(s, x, y, 1);
  const t0 = s.tick, sand = { n: 0 };
  for (let k = 0; k < 5 * DAY; k++) { s.tick++; G.Fire.step(s); if (!Object.values(s.fire).some(e => e.s === "fire" || e.s === "ember")) break; if (CAP && s.fireStats.events[0].tiles > CAP) break; }
  for (const kk in s.fire) { const [fx, fy] = kk.split(",").map(Number); if (W.tile(w, fx, fy) === T.SAND) sand.n++; }
  // exposure tally: every tile next to a burned tile was exposed to flames; did it catch? (by category)
  const burned = new Set(Object.keys(s.fire)), seen = new Set(), cat = {};
  for (const kk of burned) { if (s.fire[kk].s === "fire" || s.fire[kk].s === "ember") continue;   // only finished tiles: their neighbours had the full burn to catch
    const [fx, fy] = kk.split(",").map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = fx + dx, ny = fy + dy, nk = nx + "," + ny; if (!W.inb(w, nx, ny) || seen.has(nk) || !W.walkable(w, nx, ny)) continue; seen.add(nk);
      const t = W.tile(w, nx, ny), c = t === T.SAND ? "sand" : nearW(s, nx, ny) ? "nearWater" : t === T.WOODS ? "woods" : "meadow";
      const o = cat[c] = cat[c] || { exp: 0, burn: 0 }; o.exp++; if (burned.has(nk)) o.burn++; } }
  return { spread: s.fireStats.events[0].tiles - 1, mins: s.tick - t0, sand: sand.n, dry: G.Climate.groundDryness(w, x, y, t0), cat };
}
const median = a => { const b = a.slice().sort((p, q) => p - q); return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : NaN; };
const dist = res => res.map(r => r.spread);
const nearW = (s, x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = W.tile(s.world, x + dx, y + dy); if (t === T.RIVER || t === T.LAKE) return true; } return false; };
const dryMeadow = (s, x, y) => W.tile(s.world, x, y) === T.MEADOW && !nearW(s, x, y) && G.Climate.groundDryness(s.world, x, y, s.tick) > 0 && !(W.hillAt && W.hillAt(s.world, x, y));
const run = (si, pick, rain) => { const o = []; for (let i = 0; i < N; i++) { const r = fixture(1000 + i, si, pick, rain); if (r) o.push(r); } return o; };

console.log("config: fire.minDryness=" + F.minDryness + " fire.spreadScale=" + F.spreadScale + " climate.dryness.nearWater=" + C.climate.dryness.nearWater + " saveVersion=" + C.saveVersion + "  (cap " + CAP + " tiles per burn; "  + N + " trials per case, seeds 1000.." + (1000 + N - 1) + ")");
// 1. High Sun meadow (the main target)
const hs = run(1, dryMeadow), hsd = dist(hs), p8 = Math.round(100 * hsd.filter(v => v >= 8).length / hsd.length);
console.log("High Sun meadow: spread tiles median " + median(hsd) + ", " + p8 + "% reach 8+, min " + Math.min(...hsd) + ", max " + Math.max(...hsd) + ", median burn " + median(hs.map(r => r.mins)) + " min, sand tiles burned " + hs.reduce((a, r) => a + r.sand, 0));
ok(median(hsd) >= 10 && median(hsd) <= 99 && p8 >= 80, "High Sun meadow ignition: 80%+ reach 8+ tiles, median in the tens (10-99), not the whole map", "median " + median(hsd) + ", " + p8 + "% >= 8");
ok(hs.every(r => r.sand === 0), "fire never burns onto sand (High Sun runs)");
const tally = {}; for (const r of hs) for (const c in r.cat) { const t = tally[c] = tally[c] || { exp: 0, burn: 0 }; t.exp += r.cat[c].exp; t.burn += r.cat[c].burn; }
console.log("High Sun burns - share of flame-exposed tiles that caught: " + Object.keys(tally).map(c => c + " " + (100 * tally[c].burn / tally[c].exp).toFixed(1) + "% (" + tally[c].burn + "/" + tally[c].exp + ")").join(", "));
{ const t = tally.nearWater || { exp: 0, burn: 0 }, pc = t.exp ? 100 * t.burn / t.exp : 0; ok(t.exp > 0 && pc < 10, "Director: under 10% of near-water tiles next to flames catch", pc.toFixed(1) + "% (" + t.burn + "/" + t.exp + ")"); }
const stop = (name, res) => { const d = dist(res), le2 = Math.round(100 * d.filter(v => v <= 2).length / d.length);
  console.log(name + ": spread median " + median(d) + ", " + le2 + "% at 0-2 tiles, max " + Math.max(...d) + " (n=" + d.length + ")");
  ok(d.length > 0 && le2 >= 80 && median(d) <= 2, name + " still stops the fire (mostly 0-2 tiles)", "median " + median(d) + ", " + le2 + "% <= 2"); };
stop("Wet ground (rained on, rain over, High Sun meadow)", run(1, dryMeadow, "wet"));
stop("Rain falling (High Sun meadow)", run(1, dryMeadow, "falling"));
stop("Near water (meadow next to river/lake, High Sun)", run(1, (s, x, y) => W.tile(s.world, x, y) === T.MEADOW && nearW(s, x, y)));
stop("Sand (sand tile, High Sun)", run(1, (s, x, y) => W.tile(s.world, x, y) === T.SAND));
stop("Deep Cold meadow", run(3, (s, x, y) => W.tile(s.world, x, y) === T.MEADOW && !nearW(s, x, y)));
// info only
{ const d = dist(run(1, (s, x, y) => W.tile(s.world, x, y) === T.WOODS && !nearW(s, x, y))); console.log("info - High Sun woods: spread median " + median(d) + ", " + Math.round(100 * d.filter(v => v >= 8).length / d.length) + "% 8+"); }
{ const d = dist(run(0, dryMeadow)); console.log("info - Greening meadow: spread median " + median(d) + ", " + Math.round(100 * d.filter(v => v >= 8).length / d.length) + "% 8+"); }
console.log(fails ? fails + " FAIL" : "ALL PASS"); process.exit(fails ? 1 : 0);
