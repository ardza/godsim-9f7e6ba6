// v39 ecology check (not in headless_v39: ~minutes). 8 seeds x 1 game year (4 seasons) in parallel, v39 rules on.
// Asserts: on every seed deer and Wolves are both still alive at every season end. Also prints people, wild dogs,
// and what v39 did (fiber / cord / wraps / bows / arrows / spar bouts / wolf memory and fight stats) so a regression shows.
// Run: node tests/eco_v39.js   (baseline for comparison: tests/pop_v38_1_output.txt)
const path = require("path"), cp = require("child_process");
const arg = process.argv.indexOf("--seed");
if (arg > 0) { const { load } = require("./lib_v39.js"); const G = load(), C = G.data.config, seed = +process.argv[arg + 1];
  const s = G.Sim.create(seed), season = C.time.daysPerSeason * 1440 / C.time.tickGameMinutes, cnt = sp => s.animals.filter(a => a.species === sp).length, rows = [];
  const deaths = {}, die0 = G.Sim.die; G.Sim.die = function (sim, a, cause) { if (a && a.kind === "person") deaths[cause] = (deaths[cause] || 0) + 1; return die0.apply(this, arguments); };
  let minDeer = 1e9, minWolves = 1e9;
  for (let q = 0; q < 4; q++) { for (let i = 0; i < season; i++) G.Sim.step(s);
    const r = [cnt("grazer"), cnt("scavenger"), cnt("wolves"), s.agents.length]; rows.push(r.join("/")); minDeer = Math.min(minDeer, r[0]); minWolves = Math.min(minWolves, r[2]); }
  const it = s.items, v39 = { fiberStats: s.fiberStats, fightStats: s.fightStats, wolfMem: s.wolfMem || null, spar: s.sparStats || null,
    bows: it.filter(i => i.tool === "bow").length, arrows: it.filter(i => i.form === "arrow").length, cords: it.filter(i => i.material === "fiber" && i.form === "cord").length,
    wraps: s.agents.filter(a => a.wearingWrap).length, lashedHuts: (s.huts || []).filter(h => h.lashed).length };
  const fs = s.fiberStats || {}, sp = s.sparStats || {};
  v39.row = { cord: fs.twists || 0, wrap: fs.wraps || 0, bow: fs.bows || 0, arrowsCut: fs.arrowsCut || 0, shots: fs.shots || 0, spar: sp.bouts || 0, wolfDeaths: deaths.wolves || 0, woundDeaths: deaths.wounds || 0, survivors: s.agents.length };
  console.log(JSON.stringify({ seed, rows, minDeer, minWolves, deaths, v39 })); process.exit(0); }
const seeds = [1, 2, 3, 4, 5, 6, 7, 8], t0 = Date.now();
const run = seed => new Promise(res => cp.execFile("node", [__filename, "--seed", String(seed)], { maxBuffer: 1 << 24 }, (e, out, err) => res(e ? { seed, err: String(err || e) } : JSON.parse(out.trim().split("\n").pop()))));
Promise.all(seeds.map(run)).then(rs => { let bad = 0, errs = 0;
  for (const r of rs) { if (r.err) { console.log("seed " + r.seed + " ERROR " + r.err.slice(0, 600)); errs++; continue; }
    console.log("seed " + r.seed + "  season ends deer/dogs/wolves/people: " + r.rows.join("  ") + "  people deaths " + JSON.stringify(r.deaths) + "\n    v39 " + JSON.stringify(r.v39));
    if (r.minDeer === 0 || r.minWolves === 0) bad++; }
  // v39 tune (Judge, Oct 30 6:14 PM PT): the features show up in a normal year, no fixtures, no god actions; wolf deaths must not go up
  const good = rs.filter(r => !r.err), R = r => r.v39.row, pad = (v, n) => String(v).padStart(n);
  console.log("\nseed   cord  wrap   bow  arrows  shots  spar  wolfDeaths  woundDeaths  survivors   (cord/wrap/bow/spar = times made in the year: twists, wraps put on, bows strung, bouts)");
  for (const r of good) { const x = R(r); console.log(pad(r.seed, 4) + pad(x.cord, 7) + pad(x.wrap, 6) + pad(x.bow, 6) + pad(x.arrowsCut, 8) + pad(x.shots, 7) + pad(x.spar, 6) + pad(x.wolfDeaths, 12) + pad(x.woundDeaths, 13) + pad(x.survivors, 11)); }
  const sum = k => good.reduce((t, r) => t + R(r)[k], 0), seedsWith = k => good.filter(r => R(r)[k] > 0).length;
  console.log(" all" + pad(sum("cord"), 7) + pad(sum("wrap"), 6) + pad(sum("bow"), 6) + pad(sum("arrowsCut"), 8) + pad(sum("shots"), 7) + pad(sum("spar"), 6) + pad(sum("wolfDeaths"), 12) + pad(sum("woundDeaths"), 13) + pad(sum("survivors"), 11));
  const BASE = { wolfDeaths: 25, woundDeaths: 5 };   // the pre-tune eco_v39 run (Oct 30, same 8 seeds x 1 year)
  const T = [["cord", 5], ["wrap", 4], ["bow", 2], ["shots", 1], ["spar", 2]]; let tbad = 0;
  for (const [k, n] of T) { const m = seedsWith(k), pass = m >= n; if (!pass) tbad++; console.log((pass ? "PASS" : "FAIL") + " " + k + " on >= " + n + " seed(s): " + m + " (" + good.filter(r => R(r)[k] > 0).map(r => r.seed).join(",") + ")"); }
  const wd = sum("wolfDeaths"), ud = sum("woundDeaths"); if (wd > BASE.wolfDeaths) tbad++;
  console.log((wd <= BASE.wolfDeaths ? "PASS" : "FAIL") + " wolf deaths not up: " + wd + " (baseline " + BASE.wolfDeaths + ")");
  console.log("INFO wound deaths " + ud + " (baseline " + BASE.woundDeaths + "); wolf + wound deaths " + (wd + ud) + " (baseline " + (BASE.wolfDeaths + BASE.woundDeaths) + "); other deaths " + JSON.stringify(good.reduce((o, r) => { for (const k in r.deaths) if (k !== "wolves" && k !== "wounds") o[k] = (o[k] || 0) + r.deaths[k]; return o; }, {})));
  if (tbad) bad++;
  const ok = !bad && !errs; console.log((ok ? "PASS" : "FAIL") + " deer and Wolves alive at every season end on " + (rs.length - bad - errs) + " of " + seeds.length + " seeds (1 year)  [" + Math.round((Date.now() - t0) / 1000) + " s]");
  process.exit(ok ? 0 : 1); });
