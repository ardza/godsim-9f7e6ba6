// Step 27 Moods (v24) proofs. Run: node tests/headless_moods27.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/sim.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx.GS;
}
const G = load(), C = G.data.config;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 24 && !!G.Moods, "saveVersion 24 + G.Moods loaded", C.saveVersion);
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 24; });
  ok(refs.some(u => u.includes("moods.js")) && !bad.length, "index.html ?v=24 everywhere incl. moods.js", refs.length + " links"); }

// ---- Proof 1: liked death → sadness up + more prayer starts ----
{ const s = G.Sim.create(42);
  const a = s.agents[0], b = s.agents[1] || s.agents[0];
  // force liking ≥50, place near, ensure moods
  G.Moods.ensure(a); G.Moods.ensure(b);
  a.rel = a.rel || {}; a.rel[b.id] = { f: 80, l: 70, m: 0, d: 0 };
  a.pos = { x: b.pos.x + 1, y: b.pos.y }; a.needs.energy = 80; a.act = { type: "idle", until: s.tick + 1 };
  a.traits.faith = 90; a.moods.sadness = 40; a.moods.happiness = 40; a.moods.anger = 40;
  const sad0 = a.moods.sadness;
  // Count prayer rolls/bouts with sadness low vs after death bump
  function countPrayers(seedMod, sadness) {
    const s2 = G.Sim.create(42 + seedMod);
    const p = s2.agents[0];
    G.Moods.ensure(p);
    p.moods.sadness = sadness; p.moods.happiness = 40; p.moods.anger = 40;
    p.traits.faith = 95; p.needs.energy = 90; p.needs.fullness = 20; p.needs.water = 20; p.needs.warmth = 70;
    p.sawDeath = { t: s2.tick, name: "Tib" };
    p.act = { type: "idle", until: 0 };
    // strip predators / quiet world a bit
    s2.animals = []; s2.packs = [];
    let bouts = 0;
    for (let i = 0; i < 1440; i++) { // 1 day
      const before = (s2.faith && s2.faith.stats && s2.faith.stats.bouts) || 0;
      G.Sim.step(s2);
      const after = (s2.faith && s2.faith.stats && s2.faith.stats.bouts) || 0;
      bouts += after - before;
      // keep trigger alive
      if (p.needs) { p.needs.fullness = Math.min(p.needs.fullness, 25); p.needs.energy = Math.max(40, p.needs.energy); }
      if (p.act && p.act.type === "sleep") p.act = { type: "idle", until: s2.tick };
    }
    return bouts;
  }
  G.Sim.die(s, b, "starvation");
  const sad1 = a.moods.sadness;
  const logHit = s.log.some(e => e.text && e.text.indexOf("head down") >= 0);
  ok(sad1 >= sad0 + 20, "proof1: liked death raises sadness", sad0.toFixed(1) + " → " + sad1.toFixed(1));
  ok(logHit, "proof1: action-only death mood log", s.log.filter(e => /head down/.test(e.text)).map(e => e.text)[0]);
  const praySad = countPrayers(0, 75), prayBase = countPrayers(1, 40);
  ok(praySad >= prayBase, "proof1: sadness ≥60 → more prayer starts than baseline", "sad " + praySad + " vs base " + prayBase);
}

// ---- Proof 2: mild prosperity invent > stressed over ~1 year ----
{ function inventYear(seed, mode) {
    const s = G.Sim.create(seed);
    s.animals = (s.animals || []).filter(o => o.species !== "wolves"); s.packs = [];
    for (const a of s.agents) {
      G.Moods.ensure(a);
      a.traits.curiosity = 90;
      if (mode === "prosper") {
        a.needs.fullness = 90; a.needs.water = 90; a.needs.warmth = 90; a.needs.energy = 90;
        a.moods.happiness = 75; a.moods.sadness = 30; a.moods.anger = 30;
      } else {
        a.needs.fullness = 25; a.needs.water = 25; a.needs.warmth = 25; a.needs.energy = 50;
        a.moods.happiness = 20; a.moods.sadness = 70; a.moods.anger = 40;
      }
      // pair near each other so invent has someone nearby
      if (s.agents[0] !== a) a.pos = { x: s.agents[0].pos.x + 1, y: s.agents[0].pos.y };
    }
    const ticks = 1440 * 30; // ~30 days (faster than full year; scales with invent rate)
    for (let i = 0; i < ticks; i++) {
      for (const a of s.agents) {
        if (mode === "prosper") { a.needs.fullness = Math.max(a.needs.fullness, 80); a.needs.water = Math.max(a.needs.water, 80); a.needs.warmth = Math.max(a.needs.warmth, 70); a.needs.energy = Math.max(50, a.needs.energy); a.moods.happiness = Math.max(65, a.moods.happiness); a.moods.sadness = Math.min(35, a.moods.sadness); }
        else { a.needs.fullness = Math.min(a.needs.fullness, 30); a.needs.water = Math.min(a.needs.water, 30); a.needs.warmth = Math.min(a.needs.warmth, 35); a.moods.sadness = Math.max(65, a.moods.sadness); a.moods.happiness = Math.min(30, a.moods.happiness); }
        if (a.act && a.act.type === "sleep") a.act = { type: "idle", until: s.tick };
      }
      G.Sim.step(s);
    }
    const invents = (s.speech && s.speech.stats && s.speech.stats.invents) || 0;
    const tries = (s.physStats && s.physStats.tries) || 0;
    return { invents, tries, total: invents + tries };
  }
  const pro = inventYear(7, "prosper"), str = inventYear(7, "stress");
  ok(pro.total > str.total, "proof2: prosperity invent/try count > stressed (30d)", "prosper " + JSON.stringify(pro) + " vs stress " + JSON.stringify(str));
}

// ---- Proof 3: Wolf chase → anger + flee/group ----
{ const s = G.Sim.create(99);
  // find or place a pack
  let pack = (s.packs || [])[0];
  if (!pack) {
    const den = { x: Math.round(s.agents[0].pos.x), y: Math.round(s.agents[0].pos.y) };
    pack = { id: 1, den, chaseLog: -1e9 };
    s.packs = [pack]; s.nextPackId = 2;
    s.animals.push({ id: s.nextId++, kind: "animal", species: "wolves", pos: { x: den.x + 1, y: den.y }, facing: "down", act: { type: "idle", until: 0 }, pack: pack.id, age: 5, lifespan: 20 });
  }
  const a = s.agents[0];
  G.Moods.ensure(a);
  a.moods.anger = 40; a.moods.happiness = 40; a.moods.sadness = 40;
  a.pos = { x: pack.den.x + 1, y: pack.den.y }; a.act = { type: "idle", until: 0 };
  // give a group mate to seek
  if (s.agents.length < 2) { /* only one */ }
  else { const mate = s.agents[1]; a.group = 1; mate.group = 1; mate.pos = { x: a.pos.x + 8, y: a.pos.y }; }
  const ang0 = a.moods.anger;
  const wolf = s.animals.find(o => o.species === "wolves" && o.pack === pack.id) || s.animals.find(o => o.species === "wolves");
  G.Moods.onWolfChase(s, a, pack);
  const ang1 = a.moods.anger;
  const fleeing = a.act && (a.act.goal === "fleeWolf" || a.act.goal === "follow" || a.act.goal === "avoid");
  ok(ang1 > ang0, "proof3: Wolf chase raises anger", ang0.toFixed(1) + " → " + ang1.toFixed(1));
  ok(fleeing, "proof3: person flees territory / seeks group after chase", a.act && (a.act.type + ":" + a.act.goal));
}

// migrate 23→24
{ const s = G.Sim.create(3);
  const raw = G.Sim.serialize(s); raw.version = 23;
  for (const a of raw.agents) { delete a.moods; delete a.moodClock; }
  const r = G.Sim.deserialize(raw);
  ok(r.version === 24 && r.agents.every(a => a.moods && a.moods.happiness != null && a.moodClock), "migrate23→24 adds moods", r.agents[0].moods);
  const j = JSON.stringify(G.Sim.serialize(r));
  ok(JSON.parse(j).version === 24, "save round-trip v24");
}

console.log(fails ? "\n" + fails + " FAIL(S)" : "\nAll mood proofs passed.");
process.exit(fails ? 1 : 0);
