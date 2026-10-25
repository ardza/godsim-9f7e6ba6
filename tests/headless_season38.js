// §38 Hard seasons (v35). Run: node tests/headless_season38.js
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
const G = load(), C = G.data.config, MD = 1440, dps = C.time.daysPerSeason;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };
const F = c => Math.round(c * 9 / 5 + 32);
function tickAt(yearIdx, season, hour) {
  const day0 = yearIdx * dps * 4 + season * dps + 3;
  return Math.max(0, day0 * MD + hour * 60 - C.time.startMinute);
}
function meadowSpot(s) {
  const W = G.World, T = G.data.T;
  for (let y = 0; y < s.world.h; y++) for (let x = 0; x < s.world.w; x++)
    if (W.tile(s.world, x, y) === T.MEADOW && W.walkable(s.world, x, y) && !G.Shelter.at(s, x, y)) return { x, y };
  return { x: Math.round(s.world.spawn.x), y: Math.round(s.world.spawn.y) };
}

ok(C.saveVersion === 35 && C.climate.hard && C.climate.hard.rampYears > 0
  && C.climate.seasonMeanC.join() === "18,23,19,15" && C.climate.dayAmpC === 4
  && C.climate.hard.meanDeltaC[3] < -10 && C.climate.hard.dayAmpAddC[3] > 0,
  "saveVersion 35 + climate.hard ramp (mild base means kept)",
  "v=" + C.saveVersion + " deltaDC=" + C.climate.hard.meanDeltaC[3] + " ampAdd=" + C.climate.hard.dayAmpAddC[3]);

{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 35; });
  ok(!bad.length, "index.html ?v=35 everywhere", "bad=" + bad.slice(0, 3));
}

// ---- Year 0 mild coastal stays ----
{ const t0 = tickAt(0, 0, 6), tDC = tickAt(0, 3, 12), tDCn = tickAt(0, 3, 5);
  const a0 = G.Climate.airC(t0), aDC = G.Climate.airC(tDC), aN = G.Climate.airC(tDCn);
  ok(G.Climate.yearIndex(t0) === 0 && G.Climate.hardT(t0) === 0
    && F(a0) >= 54 && F(a0) <= 62 && F(aDC) >= 55 && G.Climate.warmthEq(aN) >= 45,
    "year-0: mild coastal; Deep Cold still soft (eq≥45 at night)",
    "Greening " + F(a0) + "°F · DC mid " + F(aDC) + "°F · DC night eq=" + G.Climate.warmthEq(aN).toFixed(1));
}

// ---- Year-N Deep Cold harsh enough for open-air hypo path ----
{ const t = tickAt(4, 3, 5), air = G.Climate.airC(t), eq = G.Climate.warmthEq(air);
  ok(G.Climate.yearIndex(t) === 4 && G.Climate.hardT(t) === 1
    && air < 0 && eq <= 5 && F(air) < 40,
    "year-4 Deep Cold night: air below freezing-ish; warmthEq ≈ 0 (open can hit hypo)",
    air.toFixed(1) + "°C / " + F(air) + "°F eq=" + eq.toFixed(1));
}

// ---- Open: year-0 survives cold night; year-N drains hard (tick pinned at coldest hour) ----
function runOpenPinned(yearIdx, minutes) {
  const night = tickAt(yearIdx, 3, 5);
  const s = G.Sim.create(901 + yearIdx);
  s.tick = night;
  const a = s.agents[0], spot = meadowSpot(s);
  s.agents = [a]; a.pos = { x: spot.x, y: spot.y }; a.den = null; a.shelters = [];
  a.wearingHide = null; a.act = { type: "idle", until: night + minutes + 10 };
  a.needs.warmth = 80; a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = 100;
  a.zero = { water: 0, fullness: 0, warmth: 0, energy: 0 }; a.hypo = 0;
  for (let i = 0; i < minutes; i++) {
    s.tick = night; // stay at coldest Deep Cold hour (isolate season effect)
    a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = 100;
    G.Agent.step(s, a);
  }
  const felt = a.felt || G.Climate.felt(s, a);
  return { warmth: a.needs.warmth, hypo: a.hypo || 0, eq: G.Climate.warmthEq(felt.c), felt: felt.c };
}
{ const soft = runOpenPinned(0, 480); // 8h
  const hard = runOpenPinned(4, 480);
  ok(soft.warmth > hard.warmth + 15 && soft.warmth >= 45 && hard.eq <= 5 && hard.warmth < 25,
    "open air: year-0 Deep Cold keeps warmth; year-4 drains toward hypo eq",
    "y0 w=" + soft.warmth.toFixed(1) + " eq=" + soft.eq.toFixed(1)
    + " · y4 w=" + hard.warmth.toFixed(1) + " hypo=" + hard.hypo + " eq=" + hard.eq.toFixed(1));
}

// ---- Hut + hide + fire keeps warmth in harsh Deep Cold vs open ----
{ const night = tickAt(4, 3, 5);
  const s = G.Sim.create(920);
  s.tick = night;
  const a = s.agents[0], spot = meadowSpot(s);
  s.agents = [a]; a.pos = { x: spot.x, y: spot.y };
  const hut = G.Hut.create(s, spot.x, spot.y, a);
  a.den = hut.id; a.shelters = [hut.id];
  G.Shelter.know(s, a, hut);
  const hide = G.Items.create(s, "hide", spot.x, spot.y); s.items.push(hide);
  G.Hides.wear(s, a, hide);
  // fire 2 tiles away (heats hut; not underfoot so she does not flee "burnt")
  let fx = spot.x + 2, fy = spot.y;
  if (!G.World.inb(s.world, fx, fy) || !G.World.walkable(s.world, fx, fy)) { fx = spot.x - 2; fy = spot.y; }
  s.fireStats = { events: [{ id: 1, start: night, x: fx, y: fy }], lightning: 0, embers: 0, tiles: 0 };
  s.fire[fx + "," + fy] = { s: "fire", t: night, end: night + 5000, ev: 1 };
  a.act = { type: "sleep", since: night };
  a.needs.warmth = 50; a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = 40;
  a.zero = { water: 0, fullness: 0, warmth: 0, energy: 0 }; a.hypo = 0;
  // felt snapshot: protected eq >> open eq at same harsh air
  const feltSafe0 = G.Climate.felt(s, a);
  const openSnap = runOpenPinned(4, 1);
  ok(G.Climate.warmthEq(feltSafe0.c) > openSnap.eq + 30 && (feltSafe0.den > 0 || feltSafe0.heat > 0) && feltSafe0.hide >= 0,
    "hut+hide+fire felt eq >> open at year-4 Deep Cold night",
    "safe felt=" + feltSafe0.c.toFixed(1) + " eq=" + G.Climate.warmthEq(feltSafe0.c).toFixed(1)
    + " den=" + feltSafe0.den + " heat=" + feltSafe0.heat + " hide=" + feltSafe0.hide
    + " · open eq=" + openSnap.eq.toFixed(1));
  const open = runOpenPinned(4, 480);
  for (let i = 0; i < 480; i++) {
    s.tick = night;
    a.pos = { x: spot.x, y: spot.y }; // stay on hut tile
    if (a.act.type !== "sleep" && a.act.type !== "idle") a.act = { type: "sleep", since: night };
    a.den = hut.id;
    a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = Math.min(a.needs.energy, 50);
    G.Agent.step(s, a);
  }
  const felt = a.felt || G.Climate.felt(s, a);
  ok(a.needs.warmth > open.warmth + 20 && a.needs.warmth >= 40 && (a.hypo || 0) < 3,
    "hut+hide+fire: warmth stays up vs open over 8h harsh night",
    "safe w=" + a.needs.warmth.toFixed(1) + " hypo=" + (a.hypo || 0)
    + " den=" + felt.den + " heat=" + felt.heat + " hide=" + felt.hide
    + " · open w=" + open.warmth.toFixed(1));
}

// ---- Rain/wet clamp from v29 still applies ----
{ const s = G.Sim.create(930);
  const a = s.agents[0], spot = meadowSpot(s);
  a.pos = { x: spot.x, y: spot.y }; a.act = { type: "idle", until: s.tick + 100 };
  a.needs.warmth = 60; a.den = null;
  G.Powers.cast(s, "rain", spot.x, spot.y, "medium");
  while (G.Time.darkness(s.tick) > 0.2) s.tick++;
  const before = a.needs.warmth;
  for (let i = 0; i < 30; i++) {
    a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = 100;
    G.Agent.step(s, a); s.tick++;
  }
  const felt = a.felt;
  ok(felt && (felt.wet > 0 || felt.wetGround) && a.needs.warmth <= before + 0.01,
    "v29 rain/wet clamp still blocks daytime warmth climb when exposed",
    "before=" + before.toFixed(2) + " after=" + a.needs.warmth.toFixed(2) + " wet=" + (felt && felt.wet));
}

// ---- Storm odds ramp (config × hardT) ----
{ const t0 = tickAt(0, 3, 12), t4 = tickAt(4, 3, 12);
  const si = 3, base = C.fire.lightning.perSeason[si], x = C.climate.hard.stormX[si];
  ok(G.Climate.hardT(t0) === 0 && G.Climate.hardT(t4) === 1 && x > 1 && base > 0,
    "stormX configured; hardT 0→1 from year 0 to year 4 Deep Cold",
    "stormX=" + x + " basePer=" + base);
}

// ---- Migrate 34→35 + round-trip ----
{ const s = G.Sim.create(940);
  const ser = G.Sim.serialize(s);
  ser.version = 34;
  const loaded = G.Sim.deserialize(ser);
  ok(loaded.version === 35, "migrate 34→35 bumps saveVersion", "v=" + loaded.version);
  const again = G.Sim.deserialize(G.Sim.serialize(loaded));
  ok(again.version === 35 && again.seed === s.seed && again.agents.length === s.agents.length,
    "v35 save round-trips", "agents=" + again.agents.length);
}

if (fails) { console.log("\n" + fails + " FAIL"); process.exit(1); }
console.log("\nALL PASS");
