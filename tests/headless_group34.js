// §34 Group identity (v31). Run: node tests/headless_group34.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/sim.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx.GS;
}
const G = load(), C = G.data.config, LIST = G.data.groupNames || [];
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 31 && LIST.length === 32 && !!G.Social.qualifies && !!G.Social.refreshNames,
  "saveVersion 31 + 32 groupNames + Social naming API", C.saveVersion + " names=" + LIST.length);
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 31; });
  ok(!bad.length, "index.html ?v=31 everywhere", "bad=" + bad.slice(0, 3));
  ok(html.includes("data/group_names.js?v=31"), "group_names.js script tag present");
}

function ensureAgent(s, i) {
  while (s.agents.length <= i) {
    const a0 = s.agents[0];
    const b = JSON.parse(JSON.stringify(a0));
    b.id = s.nextId++; b.name = "P" + b.id; b.caches = []; b.sacred = []; b.shelters = [];
    b.carry = null; b.prayForms = {}; b.group = null; b.words = {};
    b.pos = { x: a0.pos.x + s.agents.length, y: a0.pos.y };
    b.act = { type: "idle", until: s.tick + 100 };
    s.agents.push(b);
  }
  return s.agents[i];
}

function lockWords(s, gid, n) {
  s.speech = s.speech || G.Speech.newState();
  const meanings = ["water", "food", "warm", "danger", "follow", "stop"];
  for (let i = 0; i < n; i++) {
    const meaning = meanings[i % meanings.length];
    const token = "tok" + i;
    const lk = G.Speech.lockKey(gid, token, meaning);
    s.speech.locks[lk] = { group: gid, token, meaning, word: "w" + i, holders: 3, since: 0 };
  }
}

function makeGroup(s, ids, sacred) {
  const g = { id: 1, ci: 0, members: ids.slice(), since: 0, sacred: sacred || [], name: null };
  s.groups = [g];
  for (const id of ids) { const a = s.agents.find(p => p.id === id); if (a) a.group = 1; }
  return g;
}

// ---- qualify → name from list; no name before gate ----
{ const s = G.Sim.create(401);
  const a = ensureAgent(s, 0), b = ensureAgent(s, 1), c = ensureAgent(s, 2);
  const g = makeGroup(s, [a.id, b.id, c.id], []);
  ok(G.Social.groupName(s, g) === "Group 1", "fallback Group N before qualify", G.Social.groupName(s, g));
  ok(!G.Social.qualifies(s, g), "not qualified with 0 words + no spot/shelter");
  lockWords(s, 1, 3);
  ok(!G.Social.qualifies(s, g), "3 words alone not enough without prayer/shelter");
  g.sacred = [{ x: 10, y: 10 }];
  ok(G.Social.qualifies(s, g), "qualifies with 3 words + prayer spot");
  G.Social.refreshNames(s);
  ok(!!g.name && LIST.indexOf(g.name) >= 0, "name picked from Story list", g.name);
  ok(G.Social.groupName(s, g) === g.name && !/^Group\s+\d+$/.test(G.Social.groupName(s, g)),
    "People/card string is syllable name not Group N", G.Social.groupName(s, g));
}

// ---- shelter cluster path (2+ members know same shelter) ----
{ const s = G.Sim.create(403);
  const a = ensureAgent(s, 0), b = ensureAgent(s, 1);
  const g = makeGroup(s, [a.id, b.id], []);
  lockWords(s, 1, 3);
  a.shelters = [7]; b.shelters = [7];
  ok(G.Social.qualifies(s, g), "qualifies with 3 words + shared shelter id");
  G.Social.refreshNames(s);
  ok(!!g.name && LIST.indexOf(g.name) >= 0, "shelter-path name from list", g.name);
}

// ---- uniqueness across groups ----
{ const s = G.Sim.create(407);
  const agents = [];
  for (let i = 0; i < 6; i++) agents.push(ensureAgent(s, i));
  s.groups = [];
  for (let gi = 1; gi <= 3; gi++) {
    const ids = [agents[(gi - 1) * 2].id, agents[(gi - 1) * 2 + 1].id];
    const g = { id: gi, ci: gi - 1, members: ids, since: 0, sacred: [{ x: gi, y: gi }], name: null };
    s.groups.push(g);
    for (const id of ids) s.agents.find(p => p.id === id).group = gi;
    lockWords(s, gi, 3);
  }
  G.Social.refreshNames(s);
  const names = s.groups.map(g => g.name);
  ok(names.every(n => !!n && LIST.indexOf(n) >= 0), "all three groups named from list", names.join(","));
  ok(new Set(names).size === 3, "names unique across groups", names.join(","));
}

// ---- name preserved across daily rebuild ----
{ const s = G.Sim.create(409);
  const a = ensureAgent(s, 0), b = ensureAgent(s, 1);
  // Force mutual relations so daily keeps them together
  a.rel = a.rel || {}; b.rel = b.rel || {};
  a.rel[b.id] = { f: 80, l: 80, m: 0, d: 0, nt: s.tick };
  b.rel[a.id] = { f: 80, l: 80, m: 0, d: 0, nt: s.tick };
  const g = makeGroup(s, [a.id, b.id], [{ x: 5, y: 5 }]);
  lockWords(s, 1, 3);
  G.Social.refreshNames(s);
  const kept = g.name;
  ok(!!kept, "setup named group", kept);
  G.Social.daily(s);
  const g2 = s.groups.find(q => q.id === 1) || s.groups[0];
  ok(g2 && g2.name === kept, "name survives Social.daily rebuild", g2 && g2.name);
}

// ---- Discoveries field uses syllable name once set ----
{ const s = G.Sim.create(411);
  const a = ensureAgent(s, 0), b = ensureAgent(s, 1);
  const g = makeGroup(s, [a.id, b.id], [{ x: 1, y: 1 }]);
  lockWords(s, 1, 3);
  G.Social.refreshNames(s);
  const d = G.Discoveries.note(s, a, "test", ["stone"], "spark");
  ok(d && d.group === g.name && !/^Group\s+\d+$/.test(d.group),
    "Discoveries group field = syllable name", d && d.group);
}

// ---- migrate 30→31 ----
{ const s = G.Sim.create(413);
  const a = ensureAgent(s, 0), b = ensureAgent(s, 1);
  const g = makeGroup(s, [a.id, b.id], [{ x: 2, y: 3 }]);
  lockWords(s, 1, 3);
  const raw = G.Sim.serialize(s);
  raw.version = 30;
  for (const gg of raw.groups || []) delete gg.name;
  const d = G.Sim.deserialize(raw);
  const g2 = (d.groups || [])[0];
  ok(d.version === 31 && g2 && g2.name && LIST.indexOf(g2.name) >= 0,
    "migrate 30→31 assigns name to qualifying group",
    "v=" + d.version + " name=" + (g2 && g2.name));
  // non-qualifying stays Group N
  const s2 = G.Sim.create(414);
  const a2 = ensureAgent(s2, 0), b2 = ensureAgent(s2, 1);
  makeGroup(s2, [a2.id, b2.id], []); // no words, no sacred
  const raw2 = G.Sim.serialize(s2);
  raw2.version = 30;
  for (const gg of raw2.groups || []) delete gg.name;
  const d2 = G.Sim.deserialize(raw2);
  const g3 = (d2.groups || [])[0];
  ok(d2.version === 31 && g3 && !g3.name && G.Social.groupName(d2, g3) === "Group " + g3.id,
    "migrate leaves unqualified as Group N", G.Social.groupName(d2, g3));
}

console.log(fails ? ("\n" + fails + " FAIL") : "\nALL PASS");
process.exit(fails ? 1 : 0);
