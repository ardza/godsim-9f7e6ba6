// v16 (Director 21b): why a seed has no births. Runs one seed for YEARS years and reports the sex mix of pair-age adults, pairs formed
// (and whether each pair is f+m), the best mutual liking / familiarity reached by any f+m pair of pair age, and per 2 AM night of each f+m pair
// which conception gate failed first. Usage: node tests/births_diag.js <seed> [years]
const root = require("path").join(__dirname, ".."), vm = require("vm"), fs = require("fs"), path = require("path");
const ctx = { console, Math, JSON }; vm.createContext(ctx);
for (const f of ["data/config.js","data/tiles.js","data/names.js","data/art.js","data/materials.js","src/rng.js","src/world.js","src/climate.js","src/agent.js","src/animal.js","src/objects.js","src/fire.js","src/learn.js","src/hunt.js","src/cook.js","src/social.js","src/family.js","src/faith.js","src/shelter.js","src/powers.js","src/sim.js"]) if (fs.existsSync(path.join(root, f))) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
const G = ctx.GS, seed = +process.argv[2], years = +(process.argv[3] || 2), C = G.data.config, FC = C.family, Y = 1440 * G.Time.daysPerYear() / C.time.tickGameMinutes;
const s = G.Sim.create(seed), out = { seed, bond: FC.bond, conceive: FC.conceive, sexStart: {}, pairs: [], bestFM: null, nights: {}, births: 0 };
for (const a of s.agents) out.sexStart[a.sex] = (out.sexStart[a.sex] || 0) + 1;
const B = FC.bond, CC = FC.conceive, cheb = (p, q) => Math.max(Math.abs(Math.round(p.x) - Math.round(q.x)), Math.abs(Math.round(p.y) - Math.round(q.y)));
const seen = new Set();
for (let t = 0; t < years * Y; t++) { G.Sim.step(s);
  for (const a of s.agents) if (a.mate != null && a.id < a.mate && !seen.has(a.id + "-" + a.mate)) { seen.add(a.id + "-" + a.mate); const m = s.agents.find(q => q.id === a.mate); out.pairs.push({ t: Math.round(s.tick / 1440), sexes: a.sex + (m ? m.sex : "?") }); }
  if (G.Time.at(s.tick).minuteOfDay === CC.atMinute) {
    const age = s.agents.filter(a => a.age >= B.age[0] && a.age <= B.age[1]);
    for (const a of age) for (const b of age) { if (a.sex !== "f" || b.sex !== "m") continue; const p = G.Social.rel(a, b), q = G.Social.rel(b, a);
      const v = { l: Math.min(p ? p.l : 0, q ? q.l : 0), f: Math.min(p ? p.f : 0, q ? q.f : 0) }; if (!out.bestFM || Math.min(v.l - B.like, v.f - B.fam) > Math.min(out.bestFM.l - B.like, out.bestFM.f - B.fam)) out.bestFM = Object.assign({ day: Math.round(s.tick / 1440) }, v); }
    for (const a of s.agents) { if (a.sex !== "f" || a.mate == null) continue; const m = s.agents.find(q => q.id === a.mate); let why;
      if (!m) why = "partner gone"; else if (m.sex !== "m") why = "same-sex pair"; else if (a.preg) why = "already with child";
      else if (a.act.type !== "sleep" || m.act.type !== "sleep") why = "not both asleep"; else if (cheb(a.pos, m.pos) > CC.tiles) why = "asleep apart";
      else if ([a, m].some(p => p.needs.fullness < CC.fullness)) why = "fullness gate"; else if ([a, m].some(p => p.needs.water < CC.water)) why = "water gate";
      else if ([a, m].some(p => p.needs.warmth < CC.warmth)) why = "warmth gate"; else why = "all gates met";
      out.nights[why] = (out.nights[why] || 0) + 1; } } }
out.births = s.famStats.births; out.sexEnd = {}; for (const a of s.agents) out.sexEnd[a.sex] = (out.sexEnd[a.sex] || 0) + 1;
console.log(JSON.stringify(out));
