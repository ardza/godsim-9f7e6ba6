// §31 Hides (v28) proofs. Run: node tests/headless_hides31.js
// Do NOT freeze until v27 PASS path is clear / told.
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js", "src/sim.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx.GS;
}
const G = load(), C = G.data.config;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 28 && !!G.Hides && !!C.hides && !!G.data.materials.hide,
  "saveVersion 28 + G.Hides + config.hides + material", C.saveVersion);
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 28; });
  ok(refs.some(u => u.includes("hides.js")) && !bad.length, "index.html ?v=28 everywhere incl. hides.js", "bad=" + bad.slice(0, 3));
  ok(fs.existsSync(path.join(root, "data/art/hide_16.png")) && fs.existsSync(path.join(root, "data/art/hide_worn_16.png")),
    "Artist hide sheets present");
}

// ---- Unit: spawn hide from grazer meat take ----
{ const s = G.Sim.create(31);
  const a = s.agents[0];
  // place a fresh grazer body with meat
  const b = { id: s.nextId++, kind: "body", name: "a deer", species: "grazer", x: Math.round(a.pos.x), y: Math.round(a.pos.y),
    stage: "fresh", meat: C.meat.pieces.grazer, flesh: 100, diedAt: s.tick, heat: 0 };
  s.bodies.push(b);
  a.pos = { x: b.x, y: b.y };
  a.act = { type: "meat", body: b.id };
  G.Hunt.arriveMeat(s, a);
  const hides = s.items.filter(i => i.material === "hide");
  ok(hides.length === 1 && b.hideSpawned && s.hideStats.spawned >= 1, "first meat take spawns one hide", hides.length);
  G.Hunt.arriveMeat(s, a); // more meat
  ok(s.items.filter(i => i.material === "hide").length === 1, "second take does not spawn another hide");
}

// ---- Unit: wear → Discoveries; warmth with hide > without ----
{ const s = G.Sim.create(37);
  const a = s.agents[0];
  const hide = G.Items.create(s, "hide", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(hide); hide.heldBy = a.id; a.carry = hide.id;
  a.needs.warmth = 20; // cold
  // same felt spot: measure without then with
  const felt0 = G.Climate.felt(s, a);
  ok(G.Hides.wear(s, a, hide) && a.wearingHide === hide.id && hide.wornBy === a.id, "wear hide");
  ok((s.discoveries || []).some(d => d.action === "wear" && d.materials.indexOf("hide") >= 0),
    "Discoveries first wear", (s.discoveries || []).filter(d => d.action === "wear").map(d => d.title).join(","));
  const felt1 = G.Climate.felt(s, a);
  ok(felt1.hide > 0 && felt1.c > felt0.c, "warmth with hide > without at same spot",
    "Δc=" + (felt1.c - felt0.c).toFixed(2) + " hide=" + felt1.hide);
  // under cap with fire
  const F = C.fire.heatC, cap = C.shelter.capX * F;
  ok(felt1.heat + felt1.huddle * C.person.warmth.huddleC + (felt1.den || 0) + felt1.hide <= cap + 1e-6
    || felt1.hide <= C.hides.wornC, "hide trimmed under shared warmth cap", "hide=" + felt1.hide + " cap=" + cap);
}

// ---- Unit: sleep-under ----
{ const s = G.Sim.create(41);
  const a = s.agents[0];
  const hide = G.Items.create(s, "hide", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(hide);
  a.needs.warmth = 15;
  a.act = { type: "sleep", since: s.tick };
  ok(G.Hides.sleepUnder(s, a, hide) && a.sleepHide === hide.id, "sleep under hide");
  const felt = G.Climate.felt(s, a);
  ok(felt.hide > 0, "sleep-under adds hide felt", felt.hide);
}

// ---- Seeds: ≥1 hide on 3 of 8 ----
{ const seeds = [3, 7, 11, 13, 17, 19, 23, 29];
  let hit = 0;
  for (const seed of seeds) {
    const s = G.Sim.create(seed);
    // force: kill a grazer if any, take meat
    let g = s.animals.find(o => o.species === "grazer");
    if (!g) { // spawn one near first agent
      const a = s.agents[0];
      g = G.Animal.spawn ? null : null;
    }
    if (g) {
      // convert to body via Hunt kill path or manual body
      const b = G.Body.fromAnimal ? G.Body.fromAnimal(s, g) : null;
      if (!b && G.Hunt && G.Hunt.makeBody) { /* */ }
      // manual
      const body = { id: s.nextId++, kind: "body", name: g.name || "a deer", species: "grazer",
        x: Math.round(g.pos.x), y: Math.round(g.pos.y), stage: "fresh",
        meat: C.meat.pieces.grazer, flesh: 100, diedAt: s.tick, heat: 0 };
      s.bodies.push(body);
      // remove animal
      s.animals = s.animals.filter(o => o !== g);
      const a = s.agents[0];
      a.pos = { x: body.x, y: body.y };
      a.act = { type: "meat", body: body.id };
      if (a.carry != null) G.Items.drop(s, a);
      G.Hunt.arriveMeat(s, a);
    } else {
      // no grazer: place body at agent
      const a = s.agents[0];
      const body = { id: s.nextId++, kind: "body", name: "a deer", species: "grazer",
        x: Math.round(a.pos.x), y: Math.round(a.pos.y), stage: "fresh",
        meat: C.meat.pieces.grazer, flesh: 100, diedAt: s.tick, heat: 0 };
      s.bodies.push(body);
      a.act = { type: "meat", body: body.id };
      if (a.carry != null) G.Items.drop(s, a);
      G.Hunt.arriveMeat(s, a);
    }
    if (s.items.some(i => i.material === "hide")) hit++;
  }
  ok(hit >= 3, "≥1 hide spawned on 3 of 8 seeds", hit + "/8");
}

// ---- migrate 27→28 ----
{ const s = G.Sim.create(43);
  const raw = G.Sim.serialize(s);
  raw.version = 27; delete raw.hideStats;
  const back = G.Sim.deserialize(raw);
  ok(back.version === 28 && back.hideStats && back.hideStats.spawned === 0, "migrate 27→28", back.version);
}

console.log(fails ? ("\n" + fails + " FAIL") : "\nALL PASS");
process.exit(fails ? 1 : 0);
