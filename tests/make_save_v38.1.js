// v39: make a real v38.1 save (saveVersion 38) with the v38.1 code in /workspace/godsim-rc-v38.1 (read only), for the 38 -> 39 migration test
// (spec test 22). 3 game days on seed 3810, then three people get a known fighting history (as the v37.2 fixture adds a cache):
//   person 1: 4 deer kills + 1 wolf kill, hunt and wolf_hunt 50 (melee should seed to 38)
//   person 2: a huge history (40 kills, 5 wolf kills, 3 "survived" entries; clamps at 60)
//   person 3: nothing at all (20 / 20)
// Writes tests/fixtures/save_v38.1.json.  Run: node tests/make_save_v38.1.js
const fs = require("fs"), path = require("path"), old = "/workspace/godsim-rc-v38.1";
const src = fs.readFileSync(path.join(old, "tests/headless_v38.js"), "utf8"), head = src.split("const G = load()")[0];
const prev = process.cwd(); process.chdir(path.join(old, "tests"));
const fn = new Function("require", "__dirname", "__filename", head + "\nreturn load();"); const G = fn(require, path.join(old, "tests"), path.join(old, "tests/headless_v38.js"));
process.chdir(prev);
const s = G.Sim.create(3810); for (let i = 0; i < 3 * 1440; i++) G.Sim.step(s);
const ex = (a, k, v) => { a.exp = a.exp || {}; a.exp[k] = { score: v, n: 0, burns: 0, copied: null }; };
{ const a = s.agents[0]; a.stats = Object.assign(a.stats || {}, { kills: 4, wolfKills: 1 }); a.wolfFearLog = []; ex(a, "hunt", 50); ex(a, "wolf_hunt", 50); }
{ const a = s.agents[1]; a.stats = Object.assign(a.stats || {}, { kills: 40, wolfKills: 5 }); a.wolfFearLog = [{ t: 1, k: "survived" }, { t: 2, k: "survived" }, { t: 3, k: "survived" }]; ex(a, "hunt", 90); ex(a, "wolf_hunt", 90); }
{ const a = s.agents[2]; a.stats = Object.assign(a.stats || {}, { kills: 0, wolfKills: 0 }); a.wolfFearLog = []; if (a.exp) { delete a.exp.hunt; delete a.exp.wolf_hunt; } }
const o = G.Sim.serialize(s); o.savedAt = Date.now();
const out = path.join(__dirname, "fixtures/save_v38.1.json"); fs.writeFileSync(out, JSON.stringify(o));
console.log("wrote " + out + "  saveVersion " + o.version + ", config " + G.data.config.saveVersion + ", tick " + o.tick + ", people " + o.agents.length +
  ", wolves " + o.animals.filter(a => a.species === "wolves").length + ", reeds " + o.items.filter(i => i.material === "reed").length + ", huts " + (o.shelters || []).filter(h => h.type === "hut").length);
