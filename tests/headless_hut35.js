// §35 Built shelters / crude huts (v32). Run: node tests/headless_hut35.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/hut.js", "src/sim.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx.GS;
}
const G = load(), C = G.data.config, W = G.World, T = G.data.T;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 32 && !!G.Hut && !!C.hut && C.hut.warmX > C.shelter.cave.warmX,
  "saveVersion 32 + G.Hut + config.hut warmX > cave",
  "v=" + C.saveVersion + " warmX=" + (C.hut && C.hut.warmX));

{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 32; });
  ok(!bad.length && html.includes("src/hut.js?v=32"), "index.html ?v=32 everywhere + hut.js", "bad=" + bad.slice(0, 3));
  ok(fs.existsSync(path.join(root, "data/art/hut_16.png")) && G.data.art.hut && G.data.art.hut.cols.join() === "pile,hut",
    "Artist hut_16 wired (pile|hut)");
}

function knowShelter(s, a) {
  const sh = (s.shelters || []).find(q => q.type !== "hut") || (s.shelters || [])[0];
  if (!sh) return null;
  G.Shelter.know(s, a, sh);
  return sh;
}

function pileMats(s, a, n) {
  const t = G.Agent.tilePos(a);
  const mats = [];
  for (let i = 0; i < n; i++) {
    const mat = i === n - 1 ? "reed" : "stick";
    const it = G.Items.create(s, mat, t.x, t.y);
    s.items.push(it);
    mats.push(it);
  }
  return mats;
}

function forceDen(a, score) {
  a.learn = a.learn || {};
  a.learn.den = a.learn.den || { score: 50 };
  a.learn.den.score = score;
}

// ---- Unit: build on known shelter ground → Discoveries First crude hut ----
{ const s = G.Sim.create(501);
  const a = s.agents[0];
  const sh = knowShelter(s, a);
  ok(!!sh, "seed has natural shelter to know", sh && sh.type);
  // site adjacent to shelter tile
  const [sx, sy] = sh.tiles[0];
  let bx = sx, by = sy;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
    const x = sx + dx, y = sy + dy;
    if (W.walkable(s.world, x, y) && W.tile(s.world, x, y) !== T.WATER && !G.Hut.hutOccupied(s, x, y)) {
      const nat = G.Shelter.at(s, x, y);
      if (nat && nat.tiles.length <= 1 && nat.type !== "hut") continue;
      bx = x; by = y; break;
    }
  }
  a.pos = { x: bx, y: by }; a.den = null; a.act = { type: "idle", until: s.tick + 100 };
  a.needs.warmth = 20; a.traits.curiosity = 90; forceDen(a, 80);
  pileMats(s, a, 3);
  const hut = G.Hut.doBuild(s, a, bx, by);
  ok(!!hut && hut.type === "hut" && hut.warmX >= C.hut.warmX, "doBuild creates hut shelter", hut && JSON.stringify({ id: hut.id, warmX: hut.warmX }));
  ok((s.hutStats && s.hutStats.built) >= 1, "hutStats.built++", s.hutStats && s.hutStats.built);
  ok((s.discoveries || []).some(d => d.title === "First crude hut" || (d.action === "build" && (d.materials || []).indexOf("hut") >= 0)),
    "Discoveries First crude hut", (s.discoveries || []).filter(d => d.action === "build").map(d => d.title || d.key).join(","));
  ok(s.log.some(e => /piles sticks and reeds into a crude hut/.test(e.text)), "action-only build log");
  ok((a.shelters || []).indexOf(hut.id) >= 0 && a.den === hut.id, "builder knows + occupies hut");
}

// ---- Unit: warmth in hut > open at same air ----
{ const s = G.Sim.create(503);
  const a = s.agents[0];
  const sh = knowShelter(s, a);
  const [sx, sy] = sh.tiles[0];
  let bx = sx + 1, by = sy;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = sx + dx, y = sy + dy;
    if (W.walkable(s.world, x, y) && W.tile(s.world, x, y) !== T.WATER) { bx = x; by = y; break; }
  }
  // open meadow spot far from hut
  let ox = bx, oy = by;
  for (let r = 5; r < 25; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = bx + dx, y = by + dy;
      if (!W.inb(s.world, x, y) || !W.walkable(s.world, x, y)) continue;
      if (W.tile(s.world, x, y) === T.MEADOW && !G.Shelter.at(s, x, y) && !W.hillAt(s.world, x, y)) { ox = x; oy = y; r = 99; break; }
    }
  }
  a.pos = { x: bx, y: by }; a.act = { type: "idle", until: s.tick + 50 }; a.den = null;
  pileMats(s, a, 3);
  const hut = G.Hut.doBuild(s, a, bx, by);
  a.act = { type: "idle", until: s.tick + 50 }; a.den = hut.id; a.pos = { x: bx, y: by };
  const feltHut = G.Climate.felt(s, a);
  // move to open air, leave den
  a.den = null; a.pos = { x: ox, y: oy };
  const feltOpen = G.Climate.felt(s, a);
  ok(feltHut.den > 0 && feltHut.c > feltOpen.c,
    "warmth felt in hut > open at same air",
    "hut=" + feltHut.c + " den=" + feltHut.den + " open=" + feltOpen.c);
}

// ---- Unit: scavengers don't steal structure (hut is shelter, not item) ----
{ const s = G.Sim.create(505);
  const a = s.agents[0];
  const sh = knowShelter(s, a);
  const [sx, sy] = sh.tiles[0];
  let bx = sx, by = sy;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = sx + dx, y = sy + dy;
    if (W.walkable(s.world, x, y) && W.tile(s.world, x, y) !== T.WATER) { bx = x; by = y; break; }
  }
  a.pos = { x: bx, y: by }; pileMats(s, a, 3);
  const hut = G.Hut.doBuild(s, a, bx, by);
  const before = (s.shelters || []).filter(q => q.type === "hut").length;
  // scavenger step shouldn't remove hut
  for (let i = 0; i < 200; i++) G.Animal.stepAll(s);
  const after = (s.shelters || []).filter(q => q.type === "hut").length;
  ok(before === 1 && after === 1 && !s.items.some(it => it.material === "hut"),
    "scavengers don't steal hut structure", "before=" + before + " after=" + after);
}

// ---- Unit: maybe() walks / builds when cold + materials + known ground ----
{ const s = G.Sim.create(507);
  const a = s.agents[0];
  const sh = knowShelter(s, a);
  const [sx, sy] = sh.tiles[0];
  a.pos = { x: sx, y: sy }; a.den = null; a.act = { type: "idle", until: s.tick + 10 };
  a.needs.warmth = 15; a.traits.curiosity = 100; forceDen(a, 90);
  a.hutTry = null;
  pileMats(s, a, 4);
  // force chance
  const old = C.hut.tryChance; C.hut.tryChance = 1;
  const did = G.Hut.maybe(s, a);
  C.hut.tryChance = old;
  ok(did && (a.act.goal === "hut" || (s.hutStats && s.hutStats.built >= 1)),
    "Hut.maybe walks or builds when cold+mats+known",
    "goal=" + (a.act && a.act.goal) + " built=" + (s.hutStats && s.hutStats.built));
  if (a.act && a.act.goal === "hut") {
    // arrive
    a.pos = { x: a.act.hutX, y: a.act.hutY };
    G.Hut.arrive(s, a);
  }
  ok((s.shelters || []).some(q => q.type === "hut"), "hut exists after maybe/arrive");
}

// ---- Multi-seed: ≥1 hut on 3 of 8 seeds ----
{ const seeds = [601, 603, 607, 609, 613, 617, 619, 623];
  let withHut = 0;
  const oldChance = C.hut.tryChance, oldEvery = C.hut.tryEveryMinutes;
  C.hut.tryChance = 1; C.hut.tryEveryMinutes = 1;
  for (const seed of seeds) {
    const s = G.Sim.create(seed);
    const a = s.agents[0];
    const sh = knowShelter(s, a);
    if (!sh) continue;
    const [sx, sy] = sh.tiles[0];
    // place person near shelter with mats, cold, high den
    a.pos = { x: sx, y: sy }; a.den = null; a.act = { type: "idle", until: 0 };
    a.needs.warmth = 10; a.needs.fullness = 90; a.needs.water = 90; a.needs.energy = 90;
    a.traits.curiosity = 100; forceDen(a, 95); a.hutTry = null;
    pileMats(s, a, 5);
    // also seed mats at adjacent tiles
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = sx + dx, y = sy + dy;
      if (!W.walkable(s.world, x, y)) continue;
      s.items.push(G.Items.create(s, "stick", x, y));
      s.items.push(G.Items.create(s, "reed", x, y));
    }
    for (let i = 0; i < 400; i++) {
      if ((s.shelters || []).some(q => q.type === "hut")) break;
      // keep cold + idle-ish
      a.needs.warmth = Math.min(a.needs.warmth, 25);
      if (a.act.type === "idle" || (a.act.type === "walk" && a.act.goal === "hut")) {
        /* let sim step handle */
      } else if (a.act.type !== "walk") {
        a.act = { type: "idle", until: s.tick };
      }
      G.Sim.step(s);
      // also poke maybe directly if still no hut
      if (i % 20 === 19 && !(s.shelters || []).some(q => q.type === "hut")) {
        a.hutTry = null; a.needs.warmth = 10;
        if (a.act.type !== "walk") G.Hut.maybe(s, a);
      }
    }
    if ((s.shelters || []).some(q => q.type === "hut")) withHut++;
  }
  C.hut.tryChance = oldChance; C.hut.tryEveryMinutes = oldEvery;
  ok(withHut >= 3, "≥1 hut on 3 of 8 seeds", withHut + "/8");
}

// ---- migrate 31→32 ----
{ const s = G.Sim.create(701);
  const raw = G.Sim.serialize(s);
  raw.version = 31;
  delete raw.hutStats; delete raw.hrng;
  const d = G.Sim.deserialize(raw);
  ok(d.version === 32 && d.hutStats && d.hutStats.built === 0,
    "migrate 31→32 adds hutStats", "v=" + d.version + " built=" + (d.hutStats && d.hutStats.built));
  // round-trip with a hut
  const a = d.agents[0];
  const sh = knowShelter(d, a);
  if (sh) {
    const [sx, sy] = sh.tiles[0];
    let bx = sx, by = sy;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = sx + dx, y = sy + dy;
      if (W.walkable(d.world, x, y) && W.tile(d.world, x, y) !== T.WATER) { bx = x; by = y; break; }
    }
    a.pos = { x: bx, y: by }; pileMats(d, a, 3);
    G.Hut.doBuild(d, a, bx, by);
    const j = G.Sim.serialize(d);
    const r = G.Sim.deserialize(j);
    ok(r.version === 32 && (r.shelters || []).some(q => q.type === "hut" && q.built),
      "hut round-trips in save v32", "huts=" + (r.shelters || []).filter(q => q.type === "hut").length);
  } else {
    ok(false, "migrate round-trip setup had shelter");
  }
}

console.log(fails ? ("\n" + fails + " FAIL") : "\nALL PASS");
process.exit(fails ? 1 : 0);
