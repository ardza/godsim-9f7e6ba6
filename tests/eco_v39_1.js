// v39.1 rain-warmth eco / pop comparison (not in headless: ~2-4 min). 8 seeds x 1 game year, v39 (../godsim-rc code, read only) vs v39.1 (this tree),
// (a) no rain: must be identical (v39.1 only writes its new fields when it rains);
// (b) a scripted rain schedule (same in both): every 4th day at a varying hour, light / medium / heavy in turn, over the whole colony.
// Prints people deaths by cause, end population, births, and (v39.1) rain notices / rain wakes.
// Run: node tests/eco_v39_1.js [--rc /workspace/godsim-rc]
const cp = require("child_process"), path = require("path");
const ai = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const RC = ai("--rc") || path.join(__dirname, "..", "..", "godsim-rc");
if (ai("--seed")) {
  const seed = +ai("--seed"), ver = ai("--ver"), rain = ai("--rain") === "1";
  const { load } = require(path.join(ver === "rc" ? path.join(RC, "tests") : __dirname, "lib_v39.js"));
  const G = load(), C = G.data.config, s = G.Sim.create(seed), day = 1440 / C.time.tickGameMinutes, year = C.time.daysPerSeason * 4 * day;
  const deaths = {}, die0 = G.Sim.die; G.Sim.die = function (sim, a, cause) { deaths[cause] = (deaths[cause] || 0) + 1; return die0.apply(this, arguments); };
  const STR = ["light", "medium", "heavy"]; let casts = 0, rainWakes = 0, maxWet = 0, wetMin = 0, coldMin = 0;
  for (let t = 0; t < year; t++) {
    const d = Math.floor(t / day), m = t % day;
    if (rain && d % 4 === 1 && m === ((d * 7) % 24) * 60) { const L = s.agents.filter(a => !a.dead);
      if (L.length) { const cx = Math.round(L.reduce((q, a) => q + a.pos.x, 0) / L.length), cy = Math.round(L.reduce((q, a) => q + a.pos.y, 0) / L.length);
        G.Powers.cast(s, "rain", cx, cy, STR[casts++ % 3]); const e = s.powers.effects.filter(q => q.k === "rain").pop(); if (e) e.r = 200; } }
    G.Sim.step(s);
    for (const a of s.agents) { if (a.dead) continue; if (a.wet > 0) { wetMin++; maxWet = Math.max(maxWet, a.wet); } if (a.needs.warmth < 25) coldMin++; }
  }
  const PS = (s.powers && s.powers.stats) || {}; rainWakes = PS.rainWakes || 0;
  const sig = s.agents.map(a => a.id + ":" + Math.round(a.pos.x * 100) + "," + Math.round(a.pos.y * 100) + ":" + Math.round(a.needs.warmth * 1000)).join("|");
  console.log(JSON.stringify({ seed, ver, rain, deaths, pop: s.agents.filter(a => !a.dead).length, born: s.agents.length, casts, notices: (PS.notices || 0) + (PS.faces || 0), rainWakes, maxWet: Math.round(maxWet), wetHours: Math.round(wetMin / 60), coldHours: Math.round(coldMin / 60), sig: require("crypto").createHash("md5").update(sig + s.tick + JSON.stringify(deaths)).digest("hex").slice(0, 10) }));
  process.exit(0);
}
const seeds = [1, 2, 3, 4, 5, 6, 7, 8], jobs = [];
for (const rain of [0, 1]) for (const ver of ["rc", "new"]) for (const seed of seeds) jobs.push({ seed, ver, rain });
const run = j => new Promise(res => cp.execFile("node", [__filename, "--seed", String(j.seed), "--ver", j.ver, "--rain", String(j.rain), "--rc", RC], { maxBuffer: 1 << 24 }, (e, out, err) => res(e ? Object.assign({ err: String(err || e).slice(0, 400) }, j) : JSON.parse(out.trim().split("\n").pop()))));
(async () => { const rs = [], q = jobs.slice(), N = Math.max(1, require("os").cpus().length);
  await Promise.all(Array.from({ length: N }, async () => { while (q.length) rs.push(await run(q.shift())); }));
  const pick = (ver, rain) => rs.filter(r => r.ver === ver && !!r.rain === !!rain).sort((a, b) => a.seed - b.seed);
  const sum = (L, f) => L.reduce((t, r) => t + (f(r) || 0), 0), tot = L => { const o = {}; for (const r of L) for (const k in r.deaths || {}) o[k] = (o[k] || 0) + r.deaths[k]; return o; };
  let bad = 0;
  for (const rain of [0, 1]) { console.log("\n== " + (rain ? "(b) scripted rain every 4th day" : "(a) no rain") + " ==");
    for (const ver of ["rc", "new"]) { const L = pick(ver, rain); for (const r of L) if (r.err) { console.log("ERROR", r.seed, ver, r.err); bad++; }
      console.log((ver === "rc" ? "v39  " : "v39.1") + "  deaths " + JSON.stringify(tot(L)) + "  total " + sum(L, r => Object.values(r.deaths || {}).reduce((a, b) => a + b, 0)) + "  alive " + sum(L, r => r.pop) + "  born-ever " + sum(L, r => r.born) +
        "  cold<25 person-h " + sum(L, r => r.coldHours) + (rain ? "  rain casts " + sum(L, r => r.casts) : "") + (ver === "new" ? "  notices " + sum(L, r => r.notices) + "  rain wakes " + sum(L, r => r.rainWakes) + "  wet person-h " + sum(L, r => r.wetHours) + "  max wet " + Math.max(0, ...L.map(r => r.maxWet || 0)) : ""));
      for (const r of L) console.log("   seed " + r.seed + "  " + JSON.stringify(r.deaths) + " alive " + r.pop + " cold-h " + r.coldHours + (ver === "new" ? " wakes " + r.rainWakes + " wet-h " + r.wetHours : "") + "  sig " + r.sig); } }
  const a0 = pick("rc", 0), a1 = pick("new", 0), same = a0.every((r, i) => a1[i] && r.sig === a1[i].sig);
  console.log("\n" + (same ? "PASS" : "FAIL") + " (a) no rain: v39.1 identical to v39 on all 8 seeds"); process.exit(same && !bad ? 0 : 1); })();
