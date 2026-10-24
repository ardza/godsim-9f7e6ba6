// §33 Sacred places (v30). Run: node tests/headless_sacred33.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/sim.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx.GS;
}
const G = load(), C = G.data.config, W = G.World, T = G.data.T;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 30 && !!G.Faith && C.faith.spotMin >= 3 && G.data.art.sacred,
  "saveVersion 30 + Faith + spotMin≥3 + art.sacred", C.saveVersion);
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 30; });
  ok(!bad.length, "index.html ?v=30 everywhere", "bad=" + bad.slice(0, 3));
  ok(fs.existsSync(path.join(root, "data/art/sacred_16.png")) && G.data.art.sacred.src.includes("sacred_16"),
    "Artist sacred_16 wired in art.js");
}

function meadowSpot(s, x0, y0) {
  for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (x > 2 && y > 2 && x < s.world.w - 3 && y < s.world.h - 3
      && W.tile(s.world, x, y) === T.MEADOW && !W.hillAt(s.world, x, y)) return { x, y };
  }
  return { x: Math.round(s.agents[0].pos.x), y: Math.round(s.agents[0].pos.y) };
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

// ---- Marker after ≥3 prayers at a spot ----
{ const s = G.Sim.create(301);
  const a = s.agents[0];
  const spot = meadowSpot(s, Math.round(a.pos.x), Math.round(a.pos.y));
  a.pos = { x: spot.x, y: spot.y }; a.act = { type: "idle", until: s.tick + 50 };
  a.traits.faith = 90; a.needs.fullness = 10; a.needs.water = 80; a.needs.warmth = 80; a.needs.energy = 80;
  // Force three prayer places at the same tile (spotMin=3)
  G.Faith.place(s, spot.x, spot.y);
  G.Faith.place(s, spot.x, spot.y);
  G.Faith.place(s, spot.x, spot.y);
  const marked = (s.faith.spots || []).filter(q => q.marker);
  ok(marked.length >= 1 && marked.some(q => q.n >= 3),
    "marker appears after ≥3 prayers at a spot",
    "spots=" + s.faith.spots.length + " marked=" + marked.length + " n=" + (marked[0] && marked[0].n));
  ok(!!G.Faith.spotId(marked[0].x, marked[0].y) && G.Faith.byId(s, G.Faith.spotId(marked[0].x, marked[0].y)) === marked[0],
    "spot id parse / byId for inspect");
}

// ---- Group-known + drift when Faith high / needs low ----
{ const s = G.Sim.create(307);
  const a = ensureAgent(s, 0), b = ensureAgent(s, 1);
  const spot = meadowSpot(s, Math.round(a.pos.x), Math.round(a.pos.y));
  // Build a marked sacred spot
  for (let i = 0; i < 3; i++) G.Faith.place(s, spot.x, spot.y);
  const sp = s.faith.spots.find(q => q.marker);
  ok(!!sp, "setup: marked spot exists", sp && (sp.x + "," + sp.y + " n=" + sp.n));

  // Group with shared speech
  s.groups = [{ id: 1, ci: 0, members: [a.id, b.id], since: 0, sacred: [] }];
  a.group = 1; b.group = 1;
  // Inject a locked shared word so Speech.groupWords is non-empty
  s.speech = s.speech || G.Speech.newState();
  const lockKey = "1|tok|water"; // whatever Speech.lockKey format is
  // Discover lock key format
  const lk = G.Speech.lockKey ? G.Speech.lockKey(1, "tok", "water") : "1|tok|water";
  s.speech.locks[lk] = { group: 1, token: "tok", meaning: "water", word: "wa", holders: 2 };

  // a prays at the spot → group knows
  a.pos = { x: spot.x, y: spot.y };
  G.Faith.onPrayAt(s, a, spot.x, spot.y);
  const g = s.groups[0];
  ok((g.sacred || []).some(q => q.x === sp.x && q.y === sp.y),
    "shared-speech group marks spot known after member prayed",
    "g.sacred=" + JSON.stringify(g.sacred));
  ok((b.sacred || []).some(q => q.x === sp.x && q.y === sp.y),
    "group knowledge shared to other member",
    "b.sacred=" + JSON.stringify(b.sacred));

  // Place b a few tiles away; high faith + needs low → drift
  let away = null;
  for (let r = 3; r <= 8 && !away; r++) for (let dy = -r; dy <= r && !away; dy++) for (let dx = -r; dx <= r && !away; dx++) {
    const x = sp.x + dx, y = sp.y + dy;
    if ((dx || dy) && W.inb(s.world, x, y) && W.walkable(s.world, x, y) && Math.hypot(dx, dy) <= C.faith.driftTiles)
      away = { x, y };
  }
  if (!away) away = { x: sp.x + 3, y: sp.y };
  b.pos = { x: away.x, y: away.y };
  b.act = { type: "idle", until: s.tick + 10 };
  b.traits.faith = 90;
  b.needs.fullness = 80; b.needs.water = 80; b.needs.warmth = 80; b.needs.energy = 80;
  const oldDrift = C.faith.sacredDrift; C.faith.sacredDrift = 1;
  const drifted = G.Faith.maybeDriftSacred(s, b);
  C.faith.sacredDrift = oldDrift;
  ok(drifted && b.act.type === "walk" && b.act.goal === "sacred",
    "≥1 group drift toward known sacred spot (Faith high / needs low)",
    "act=" + (b.act && b.act.type) + "/" + (b.act && b.act.goal) + " drifts=" + (s.faith.stats.sacredDrifts || 0));
}

// ---- See marker also teaches personal/group ----
{ const s = G.Sim.create(311);
  const a = s.agents[0];
  const spot = meadowSpot(s, Math.round(a.pos.x), Math.round(a.pos.y));
  for (let i = 0; i < 3; i++) G.Faith.place(s, spot.x, spot.y);
  const sp = s.faith.spots.find(q => q.marker);
  a.pos = { x: spot.x + 1, y: spot.y }; a.act = { type: "idle", until: s.tick + 5 }; a.sacred = [];
  G.Faith.seeMarkers(s);
  ok((a.sacred || []).some(q => q.x === sp.x && q.y === sp.y),
    "seeing a marker makes the spot personally known");
}

// ---- migrate 29→30 ----
{ const s = G.Sim.create(313);
  // Create a spot with n≥3 but no marker (as a v29 save would look)
  const spot = meadowSpot(s, Math.round(s.agents[0].pos.x), Math.round(s.agents[0].pos.y));
  s.faith.spots.push({ x: spot.x, y: spot.y, n: 5, since: 0, last: 0 }); // no marker field
  const raw = G.Sim.serialize(s);
  raw.version = 29;
  // strip marker / sacred if any
  for (const q of raw.faith.spots) delete q.marker;
  for (const a of raw.agents) delete a.sacred;
  for (const g of raw.groups || []) delete g.sacred;
  const d = G.Sim.deserialize(raw);
  const m = d.faith.spots.find(q => q.x === spot.x && q.y === spot.y);
  ok(d.version === 30 && m && m.marker === true && Array.isArray(d.agents[0].sacred),
    "migrate 29→30 sets marker on spots at threshold + a.sacred",
    "v=" + d.version + " marker=" + (m && m.marker) + " sacred=" + JSON.stringify(d.agents[0].sacred));
}

console.log(fails ? ("\n" + fails + " FAIL") : "\nALL PASS");
process.exit(fails ? 1 : 0);
