// v38 pre-freeze: make a real v37.2 save (saveVersion 37) with the v37.2 code in /workspace/godsim-rc-v37.2 (read only), for the 37.2 -> 38
// migration smoke test. 3 game days on seed 3720 plus one cache with meat and one hut (people, huts/shelters, caches, meat in play). Writes tests/fixtures/save_v37.2.json.
// Run: node tests/make_save_v37.2.js
const fs = require("fs"), path = require("path"), old = "/workspace/godsim-rc-v37.2";
const src = fs.readFileSync(path.join(old, "tests/headless_v37.js"), "utf8"), head = src.split("const G = load()")[0];
const prev = process.cwd(); process.chdir(path.join(old, "tests"));
const fn = new Function("require", "__dirname", "__filename", head + "\nreturn load();"); const G = fn(require, path.join(old, "tests"), path.join(old, "tests/headless_v37.js"));
process.chdir(prev);
// 3 game days on seed 3720, then person 1 stashes a piece of deer meat next to her (a remembered cache with meat that has a source),
// so the save carries what migrate 37->38 touches: huts/shelters, people's wolf fear, a cache, meat src
const s = G.Sim.create(3720); for (let i = 0; i < 3 * 1440; i++) G.Sim.step(s);
{ const a = s.agents[0], x = Math.round(a.pos.x), y = Math.round(a.pos.y), it = G.Items.create(s, "meat", x, y);
  it.spoilAt = s.tick + G.data.config.body.freshMinutes; it.heat = 0; it.stashedBy = a.name; it.src = { k: "stockpile", owner: a.name, prev: { k: "hunt", animal: "deer", by: a.name } }; s.items.push(it);
  G.Cache.remember(a, { key: "t:" + x + "," + y, kind: "spot", id: null, x, y }, ["meat"]); }
// and a v37 hut (no mats / dur yet) on a free site near person 1, built by the v37.2 code
{ const a = s.agents[0]; let site = G.Hut.pickSite(s, a);
  for (let r = 1; r < 10 && !site; r++) for (let dy = -r; dy <= r && !site; dy++) for (let dx = -r; dx <= r && !site; dx++) { const x = Math.round(a.pos.x) + dx, y = Math.round(a.pos.y) + dy;
    if (G.World.walkable(s.world, x, y) && !G.World.isWater(s.world, x, y) && !(G.Shelter && G.Shelter.at(s, x, y))) site = { x, y }; }
  G.Hut.create(s, site.x, site.y, a); }
const o = G.Sim.serialize(s); o.savedAt = Date.now();
const out = path.join(__dirname, "fixtures/save_v37.2.json"); fs.writeFileSync(out, JSON.stringify(o));
const shel = (o.shelters || []).length, caches = (o.agents || []).reduce((n, a) => n + ((a.caches || []).length), 0), meat = (o.items || []).filter(i => i.material === "meat").length;
console.log("wrote " + out + "  saveVersion " + (o.version != null ? o.version : o.saveVersion) + ", config " + G.data.config.saveVersion + ", tick " + o.tick + ", people " + (o.agents || []).length + ", animals " + (o.animals || []).length + ", shelters " + shel + ", huts " + (o.shelters || []).filter(h => h.type === "hut").length + ", remembered caches " + caches + ", meat " + meat + ", " + (JSON.stringify(o).length / 1024 | 0) + " KB");
