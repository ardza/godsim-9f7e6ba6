// v38 (g) fire burn limit sweep: one fixture fire per seed per case (G.Fire.fixture), fire-only steps until it burns out. Short; no long sim.
// Run: FIRE_N=100 node tests/fire_sweep_v38g.js   (tuning: FIRE_SCALE=0.024 FIRE_BUDGET=40 FIRE_SEED0=1000; FIRE_BUDGET=0 = no limit)
// Required by tests/headless_v38.js (g): module.exports.sweep(G, { N, seed0 }).
const DAY = 1440;
function one(G, seed, kind, budgetOpen) {
  const W = G.World, s = G.Sim.create(seed); s.agents = []; s.animals = []; s.bodies = []; s.items = []; s.fire = {};
  const fx = G.Fire.fixture(s, { kind, seed }); if (!fx) return null;
  const ev = fx.ev, B = G.data.config.fire.burnBudget, exposed = new Set(), t0 = s.tick, w = s.world;
  const mark = () => { if (B > 0 && ev.tiles >= B && budgetOpen) return;   // only while this fire can still spread
    for (const k in s.fire) { if (s.fire[k].s !== "fire") continue; const [x, y] = k.split(",").map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy, nk = nx + "," + ny; if ((dx || dy) && W.inb(w, nx, ny) && W.walkable(w, nx, ny)) exposed.add(nk); } } };
  for (let k = 0; k < 5 * DAY; k++) { mark(); s.tick++; G.Fire.step(s); if (!Object.values(s.fire).some(e => e.s === "fire" || e.s === "ember")) break; }
  const cat = {}, T = G.data.T;
  for (const nk of exposed) { const [x, y] = nk.split(",").map(Number); if (x === fx.x && y === fx.y) continue;
    const t = W.tile(w, x, y), c = t === T.SAND ? "sand" : G.Fire.nearWaterTile(w, x, y) ? "nearWater" : t === T.WOODS ? "woods" : "meadow";
    const o = cat[c] = cat[c] || { exp: 0, burn: 0 }; o.exp++; if (s.fire[nk]) o.burn++; }
  let sand = 0; for (const k in s.fire) { const [x, y] = k.split(",").map(Number); if (W.tile(w, x, y) === T.SAND) sand++; }
  return { spread: Math.max(0, ev.tiles - 1), tiles: ev.tiles, mins: s.tick - t0, cat, sand, mapTiles: w.w * w.h };
}
const median = a => { const b = a.slice().sort((p, q) => p - q); return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : NaN; };
const KINDS = [["meadow", "High Sun meadow"], ["wet", "Wet ground (rained on, rain over)"], ["rain", "Rain falling"], ["nearwater", "Near-water start"], ["shore", "Dry meadow beside near-water ground"], ["sand", "Sand start"], ["cold", "Deep Cold meadow"], ["woods", "High Sun woods (info)"]];
function sweep(G, o) {
  o = o || {}; const N = o.N || 100, seed0 = o.seed0 || 1000, out = {};
  for (const [kind, label] of (o.kinds ? KINDS.filter(k => o.kinds.includes(k[0])) : KINDS)) {
    const res = []; for (let i = 0; i < N; i++) { const r = one(G, seed0 + i, kind, true); if (r) res.push(r); }
    const d = res.map(r => r.spread), tally = {};
    for (const r of res) for (const c in r.cat) { const t = tally[c] = tally[c] || { exp: 0, burn: 0 }; t.exp += r.cat[c].exp; t.burn += r.cat[c].burn; }
    out[kind] = { label, n: res.length, median: median(d), p8: Math.round(100 * d.filter(v => v >= 8).length / d.length), le2: Math.round(100 * d.filter(v => v <= 2).length / d.length),
      min: Math.min(...d), max: Math.max(...d), maxPctMap: +(100 * Math.max(...res.map(r => r.tiles)) / res[0].mapTiles).toFixed(1), medianMinutes: median(res.map(r => r.mins)), tally, sandBurned: res.reduce((a, r) => a + r.sand, 0) };
  }
  return out;
}
function report(out, log) {
  log("case | n | median spread | 0-2 tiles | 8+ tiles | min | max (map %) | median burn time");
  for (const k in out) { const r = out[k]; log(r.label + " | " + r.n + " | " + r.median + " | " + r.le2 + "% | " + r.p8 + "% | " + r.min + " | " + r.max + " (" + r.maxPctMap + "%) | " + (r.medianMinutes / 60).toFixed(1) + " h"); }
  for (const k of ["meadow", "shore"]) { const t = out[k] && out[k].tally; if (t) log(out[k].label + ": tiles next to flames (while the fire could still spread) that caught: " + Object.keys(t).map(c => c + " " + (100 * t[c].burn / t[c].exp).toFixed(1) + "% (" + t[c].burn + "/" + t[c].exp + ")").join(", ")); }
  const nw = nearWaterCatch(out); log("Near-water tiles next to flames that caught (High Sun meadow + shore fires): " + nw.pct.toFixed(1) + "% (" + nw.burn + "/" + nw.exp + ")");
}
function nearWaterCatch(out) { let exp = 0, burn = 0; for (const k of ["meadow", "shore"]) { const t = out[k] && out[k].tally.nearWater; if (t) { exp += t.exp; burn += t.burn; } } return { exp, burn, pct: exp ? 100 * burn / exp : 0 }; }
module.exports = { sweep, report, one, median, nearWaterCatch };
if (require.main === module) {
  const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
  const ctx = { console, Math, JSON, performance: { now: () => 0 } }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/injury.js", "src/wolffear.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/hut.js", "src/farm.js", "src/food.js", "src/sim.js"]) if (fs.existsSync(path.join(root, f))) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  const G = ctx.GS, F = G.data.config.fire;
  if (process.env.FIRE_SCALE) F.spreadScale = +process.env.FIRE_SCALE;
  if (process.env.FIRE_BUDGET) F.burnBudget = +process.env.FIRE_BUDGET;
  const N = +(process.env.FIRE_N || 100), seed0 = +(process.env.FIRE_SEED0 || 1000), kinds = process.env.FIRE_KINDS ? process.env.FIRE_KINDS.split(",") : null;
  console.log("fire.minDryness=" + F.minDryness + " fire.spreadScale=" + F.spreadScale + " fire.burnBudget=" + F.burnBudget + " climate.dryness.nearWater=" + G.data.config.climate.dryness.nearWater + "; " + N + " seeds from " + seed0);
  const out = sweep(G, { N, seed0, kinds }); report(out, console.log);
  if (process.env.FIRE_JSON) console.log("JSON " + JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, r]) => [k, { median: r.median, p8: r.p8, le2: r.le2, max: r.max, nw: r.tally.nearWater }]))));
}
