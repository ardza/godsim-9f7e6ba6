// v38 (f) long check (not in headless_v38: ~2 min). 8 seeds x 2 game years (8 seasons) in parallel: deer / wild dogs / Wolves / people per week,
// asserts deer or dogs are wiped out on at most 1 seed. Plus one run with the pack removed at the start: still 0 Wolves after 2 years (no respawn).
// Run: node tests/pop_v38f.js
const vm = require("vm"), fs = require("fs"), path = require("path"), cp = require("child_process"), root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(__dirname, "headless_v38.js"), "utf8"), head = src.split("const G = load()")[0];
const arg = process.argv.indexOf("--seed");
if (arg > 0) { eval(head); const G = load(), C = G.data.config, seed = +process.argv[arg + 1], wipe = process.argv.indexOf("--wipe") > 0;
  const s = G.Sim.create(seed); if (wipe) G.WolfFight.fixture(s, { kind: "spawn" });
  const season = C.time.daysPerSeason * 1440 / C.time.tickGameMinutes, n = 8, cnt = sp => s.animals.filter(a => a.species === sp).length, rows = [];
  const deaths = {}, die0 = G.Sim.die; G.Sim.die = function (sim, a, cause) { deaths[cause] = (deaths[cause] || 0) + 1; return die0.apply(this, arguments); };
  let minDeer = 1e9, minDog = 1e9, maxWolves = 0;
  for (let w = 0; w < n; w++) { for (let i = 0; i < season; i++) G.Sim.step(s);   // 8 seasons = 2 years
    { const r = [cnt("grazer"), cnt("scavenger"), cnt("wolves"), s.agents.length]; rows.push(r.join("/")); minDeer = Math.min(minDeer, r[0]); minDog = Math.min(minDog, r[1]); maxWolves = Math.max(maxWolves, r[2]); } }
  const kills = {}; for (const b of s.bodies) if (b.species && b.killedBy) kills[b.species + "<" + b.killedBy] = (kills[b.species + "<" + b.killedBy] || 0) + 1;
  console.log(JSON.stringify({ seed, wipe, rows, minDeer, minDog, maxWolves, kills, births: s.grazerBirths || 0, deaths, dogHunt: s.wolfDog || {}, fight: s.wolfFight || {}, packs: (s.packs || []).length, packsGone: s.packsGone || 0 }));
  process.exit(0); }
const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
const run = (seed, wipe) => new Promise(res => cp.execFile("node", [__filename, "--seed", String(seed)].concat(wipe ? ["--wipe"] : []), { maxBuffer: 1 << 24 }, (e, out, err) => res(e ? { seed, err: String(err || e) } : JSON.parse(out.trim().split("\n").pop()))));
Promise.all(seeds.map(k => run(k, false)).concat([run(3873, true)])).then(rs => {
  let wiped = 0, fails = 0;
  for (const r of rs) { if (r.err) { console.log("seed " + r.seed + " ERROR " + r.err); fails++; continue; }
    console.log((r.wipe ? "wiped-pack seed " : "seed ") + r.seed + "  season ends deer/dogs/wolves/people: " + r.rows.join("  ") + "  kills " + JSON.stringify(r.kills) + "  wolf dog hunt " + JSON.stringify(r.dogHunt) + "  people vs wolves " + JSON.stringify(r.fight) + "  people deaths " + JSON.stringify(r.deaths));
    if (!r.wipe && (r.minDeer === 0 || r.minDog === 0)) wiped++; }
  const nw = rs.find(r => r.wipe); const ok1 = wiped <= 1, ok2 = nw && !nw.err && nw.maxWolves === 0;
  console.log((ok1 ? "PASS" : "FAIL") + " deer or wild dogs wiped out on " + wiped + " of " + seeds.length + " seeds (allowed 1)");
  console.log((ok2 ? "PASS" : "FAIL") + " wiped-out pack: 0 Wolves at every season end for 2 years (max " + (nw && nw.maxWolves) + ")");
  process.exit(ok1 && ok2 && !fails ? 0 : 1); });
