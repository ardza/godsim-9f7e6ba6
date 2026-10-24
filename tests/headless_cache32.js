// §32 Carrying & caching (v29) + rain/warmth daytime-gain regression. Run: node tests/headless_cache32.js
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
const G = load(), C = G.data.config, W = G.World, T = G.data.T, P = G.Powers, MD = 1440;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 29 && !!G.Cache && !!C.cache, "saveVersion 29 + G.Cache + config.cache", C.saveVersion);
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 29; });
  ok(refs.some(u => u.includes("cache.js")) && !bad.length, "index.html ?v=29 everywhere incl. cache.js", "bad=" + bad.slice(0, 3));
  ok(fs.existsSync(path.join(root, "data/art/cache_16.png")) && G.data.art.cache && G.data.art.cache.src.includes("cache_16"),
    "Artist cache_16 wired in art.js");
}

function meadowSpot(s, x0, y0) {
  for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (x > 2 && y > 2 && x < s.world.w - 3 && y < s.world.h - 3
      && W.tile(s.world, x, y) === T.MEADOW && !W.hillAt(s.world, x, y) && !G.Shelter.at(s, x, y)) return { x, y };
  }
  return { x: Math.round(s.agents[0].pos.x), y: Math.round(s.agents[0].pos.y) };
}

function knowShelter(s, a) {
  const sh = (s.shelters || [])[0];
  if (!sh) return null;
  G.Shelter.know(s, a, sh);
  return sh;
}

function giveMeat(s, a) {
  if (a.carry != null) G.Items.drop(s, a);
  const it = G.Items.create(s, "meat", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(it); it.heldBy = a.id; a.carry = it.id;
  a.carryUntil = s.tick + 5000;
  a.needs.fullness = 90; a.needs.water = 90; a.needs.energy = 90;
  return it;
}

function giveFlake(s, a) {
  if (a.carry != null) G.Items.drop(s, a);
  const it = G.Items.create(s, "flint", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(it); it.heldBy = a.id; a.carry = it.id;
  it.tool = "flake";
  a.carryUntil = s.tick + 5000;
  a.needs.fullness = 90; a.needs.water = 90;
  return it;
}

// ---- Unit: stash at known shelter → Discoveries First cache ----
{ const s = G.Sim.create(101);
  const a = s.agents[0];
  const sh = knowShelter(s, a);
  ok(!!sh, "seed has a shelter to know", sh && sh.type);
  const [sx, sy] = sh.tiles[0];
  a.pos = { x: sx, y: sy }; a.den = null; a.act = { type: "idle", until: s.tick + 100 };
  giveMeat(s, a);
  const okStash = G.Cache.doStash(s, a, { key: G.Cache.keyShelter(sh.id), kind: "shelter", id: sh.id, x: sx, y: sy });
  ok(okStash && a.carry == null && (a.caches || []).length >= 1, "stash at known shelter",
    "caches=" + (a.caches || []).length + " stashes=" + (s.cacheStats && s.cacheStats.stashes));
  ok((s.discoveries || []).some(d => d.action === "stash" && (d.title === "First cache" || (d.materials || []).indexOf("meat") >= 0)),
    "Discoveries First cache", (s.discoveries || []).filter(d => d.action === "stash").map(d => d.title || d.action).join(","));
  ok(s.log.some(e => /stashes /.test(e.text)) && !s.log.some(e => /puts down the/.test(e.text) && /stash/.test(e.text)),
    "action-only stash log (no generic puts-down for stash)");
}

// ---- Unit: retrieve from remembered cache when hungry ----
{ const s = G.Sim.create(103);
  const a = s.agents[0];
  const sh = knowShelter(s, a);
  const [sx, sy] = sh.tiles[0];
  a.pos = { x: sx, y: sy }; a.act = { type: "idle", until: s.tick + 50 };
  // place meat on ground at shelter + remember
  const meat = G.Items.create(s, "meat", sx, sy); s.items.push(meat);
  G.Cache.remember(a, { key: G.Cache.keyShelter(sh.id), kind: "shelter", id: sh.id, x: sx, y: sy }, ["meat"]);
  a.needs.fullness = 5; a.carry = null;
  const got = G.Cache.doRetrieve(s, a, { key: G.Cache.keyShelter(sh.id), kind: "shelter", id: sh.id, x: sx, y: sy }, true);
  ok(got && a.carry != null && G.Items.held(s, a) && G.Items.held(s, a).material === "meat",
    "retrieve meat from cache", "retrieves=" + (s.cacheStats && s.cacheStats.retrieves));
  ok(s.log.some(e => /takes meat from a cache|takes a .+ from a cache/.test(e.text)), "retrieve action log");
}

// ---- Unit: copy-by-watch ----
{ const s = G.Sim.create(107);
  // need ≥2 agents
  while (s.agents.length < 2) {
    // duplicate first agent roughly
    const a0 = s.agents[0];
    const b = JSON.parse(JSON.stringify(a0));
    b.id = s.nextId++; b.name = "Watcher"; b.caches = []; b.shelters = []; b.carry = null;
    b.pos = { x: a0.pos.x + 1, y: a0.pos.y }; s.agents.push(b);
  }
  const a = s.agents[0], b = s.agents[1];
  const sh = knowShelter(s, a);
  const [sx, sy] = sh.tiles[0];
  a.pos = { x: sx, y: sy }; b.pos = { x: sx + 1, y: sy };
  a.act = { type: "idle", until: s.tick + 20 }; b.act = { type: "idle", until: s.tick + 20 };
  b.caches = []; b.shelters = [];
  giveFlake(s, a);
  // force copyChance = 1
  const old = C.cache.copyChance; C.cache.copyChance = 1;
  G.Cache.doStash(s, a, { key: G.Cache.keyShelter(sh.id), kind: "shelter", id: sh.id, x: sx, y: sy });
  C.cache.copyChance = old;
  ok((b.caches || []).some(c => c.key === G.Cache.keyShelter(sh.id)),
    "watcher copies cache spot into memory", "b.caches=" + JSON.stringify(b.caches) + " copies=" + (s.cacheStats && s.cacheStats.copies));
  ok(s.log.some(e => /watched .+ and now knows a cache spot/.test(e.text)), "copy-by-watch action log");
}

// ---- Unit: tryStash walks when not on spot ----
{ const s = G.Sim.create(109);
  const a = s.agents[0];
  const sh = knowShelter(s, a);
  const [sx, sy] = sh.tiles[0];
  // stand a few walkable tiles away (within walkTiles), not on the cache tile
  let away = null;
  for (let r = 2; r <= 8 && !away; r++) for (let dy = -r; dy <= r && !away; dy++) for (let dx = -r; dx <= r && !away; dx++) {
    const x = sx + dx, y = sy + dy;
    if ((dx || dy) && W.inb(s.world, x, y) && W.walkable(s.world, x, y) && !G.Shelter.at(s, x, y)) away = { x, y };
  }
  if (!away) away = { x: sx + 3, y: sy };
  a.pos = { x: away.x, y: away.y }; a.act = { type: "idle", until: s.tick + 10 }; a.den = null;
  giveFlake(s, a);
  const walked = G.Cache.tryStash(s, a);
  ok(walked && ((a.act.type === "walk" && a.act.goal === "stash") || a.carry == null),
    "tryStash walks to known place (or stashes if already adjacent)",
    "act=" + (a.act && a.act.type) + "/" + (a.act && a.act.goal) + " path=" + (a.act.path && a.act.path.length) + " carry=" + a.carry);
}

// ---- Seeds: ≥1 stash + ≥1 retrieve on 3 of 8 ----
{ const seeds = [3, 7, 11, 13, 17, 19, 23, 29];
  let stashHit = 0, retHit = 0;
  for (const seed of seeds) {
    const s = G.Sim.create(seed);
    const a = s.agents[0];
    const sh = knowShelter(s, a);
    if (!sh) continue;
    const [sx, sy] = sh.tiles[0];
    a.pos = { x: sx, y: sy }; a.act = { type: "idle", until: s.tick + 30 };
    giveMeat(s, a);
    if (G.Cache.doStash(s, a, { key: G.Cache.keyShelter(sh.id), kind: "shelter", id: sh.id, x: sx, y: sy })) stashHit++;
    // put meat back for retrieve
    const meat = G.Items.create(s, "meat", sx, sy); s.items.push(meat);
    a.carry = null; a.needs.fullness = 5;
    if (G.Cache.doRetrieve(s, a, { key: G.Cache.keyShelter(sh.id), kind: "shelter", id: sh.id, x: sx, y: sy }, true)) retHit++;
  }
  ok(stashHit >= 3 && retHit >= 3, "≥1 stash + ≥1 retrieve on 3 of 8 seeds",
    "stash " + stashHit + "/8 retrieve " + retHit + "/8");
}

// ---- migrate 28→29 ----
{ const s = G.Sim.create(43);
  const raw = G.Sim.serialize(s);
  raw.version = 28; delete raw.cacheStats;
  for (const a of raw.agents) delete a.caches;
  const d = G.Sim.deserialize(raw);
  ok(d.version === 29 && d.cacheStats && Array.isArray(d.agents[0].caches),
    "migrate 28→29 adds cacheStats + a.caches", "v=" + d.version + " caches=" + JSON.stringify(d.agents[0].caches));
}

// ---- Rain/warmth regression: daytime + active rain, no fire → warmth does not climb ----
{ // Jump to midday (12:00). tickGameMinutes typically 1.
  const tm = C.time.tickGameMinutes || 1;
  const noonMin = 12 * 60; // minute of day
  // find tick such that Time.at(tick).minuteOfDay === noonMin
  // Time.at usually: tick * tickGameMinutes % 1440
  const tickAtNoon = Math.round(noonMin / tm);
  const s = G.Sim.create(211);
  // solo agent in open meadow, no fire, no shelter
  const a = s.agents[0];
  s.agents = [a]; s.animals = []; s.fire = {};
  const spot = meadowSpot(s, Math.round(a.pos.x), Math.round(a.pos.y));
  a.pos = { x: spot.x, y: spot.y }; a.den = null; a.wearingHide = null; a.sleepHide = null;
  a.act = { type: "idle", until: tickAtNoon + 5000 };
  a.needs.warmth = 40; a.needs.fullness = 80; a.needs.water = 80; a.needs.energy = 80;
  a.traits = a.traits || {}; a.traits.coldFear = 0;
  s.tick = tickAtNoon;
  // overlapping Light + Heavy rain (Commissioner report)
  const rL = P.cast(s, "rain", spot.x, spot.y, "light");
  const rH = P.cast(s, "rain", spot.x, spot.y, "heavy");
  ok(rL.ok && rH.ok && P.exposure(s, a) > 0, "Light+Heavy rain; person exposed",
    "exp=" + P.exposure(s, a) + " chill=" + P.chillCAt(s, spot.x, spot.y) + " lossX=" + P.lossXAt(s, spot.x, spot.y));
  // chillCAt / lossXAt take max of overlapping
  const chill = P.chillCAt(s, spot.x, spot.y), lossX = P.lossXAt(s, spot.x, spot.y);
  const RH = C.powers.rain.strengths.heavy;
  ok(chill === RH.chillC && lossX === RH.lossX, "overlapping rain uses max chillC/lossX",
    "chill=" + chill + " lossX=" + lossX);
  // confirm daytime sun would otherwise climb: felt without wet clamp path
  const felt = G.Climate.felt(s, a);
  ok(felt.wet > 0 && !(felt.heat > 0) && G.Time.darkness(s.tick) === 0,
    "daytime + wet + no fire heat", "felt.c=" + felt.c + " wet=" + felt.wet + " dark=" + G.Time.darkness(s.tick));
  const w0 = a.needs.warmth;
  // Disable cover-seeking / face so they stay put in rain; prevent other need walks
  const oldCover = C.powers.rain.coverChance, oldFace = C.powers.rain.faceChance;
  C.powers.rain.coverChance = 0; C.powers.rain.faceChance = 0;
  // Drain needs slowly so they don't leave for food/water; freeze other drives via high needs
  let climbed = false, minW = w0, maxW = w0;
  for (let i = 0; i < 120; i++) {
    a.needs.fullness = 80; a.needs.water = 80; a.needs.energy = 80;
    a.pos = { x: spot.x, y: spot.y }; a.den = null;
    // keep idle so walkingC doesn't apply oddly; still allow Agent.step warmth
    if (a.act.type !== "idle" && a.act.goal !== "stash") a.act = { type: "idle", until: s.tick + 100 };
    G.Sim.step(s);
    const w = a.needs.warmth;
    if (w > w0 + 1e-6) climbed = true;
    if (w < minW) minW = w; if (w > maxW) maxW = w;
  }
  C.powers.rain.coverChance = oldCover; C.powers.rain.faceChance = oldFace;
  ok(!climbed && maxW <= w0 + 1e-6,
    "rain + daytime + no fire: warmth does not increase over 120 ticks",
    "w0=" + w0.toFixed(3) + " min=" + minW.toFixed(3) + " max=" + maxW.toFixed(3) + " wet=" + (a.felt && a.felt.wet));
}

// ---- Soft wet ground (after rain ends) also blocks daytime climb without fire ----
{ const tm = C.time.tickGameMinutes || 1;
  const tickAtNoon = Math.round((12 * 60) / tm);
  const s = G.Sim.create(213);
  const a = s.agents[0]; s.agents = [a]; s.animals = []; s.fire = {};
  const spot = meadowSpot(s, Math.round(a.pos.x), Math.round(a.pos.y));
  a.pos = { x: spot.x, y: spot.y }; a.den = null; a.act = { type: "idle", until: tickAtNoon + 5000 };
  a.needs.warmth = 40; a.needs.fullness = 80; a.needs.water = 80; a.needs.energy = 80;
  a.traits = a.traits || {}; a.traits.coldFear = 0;
  s.tick = tickAtNoon;
  const r = P.cast(s, "rain", spot.x, spot.y, "heavy");
  // end active rain but keep wetEnd in future
  const e = r.effect; e.on = false; e.end = s.tick; // rain stopped
  ok(P.wetAt(s, spot.x, spot.y) && !P.raining(s, spot.x, spot.y) && P.exposure(s, a) === 0,
    "post-rain wet ground, not actively raining", "wetAt=" + P.wetAt(s, spot.x, spot.y));
  const oldCover = C.powers.rain.coverChance, oldFace = C.powers.rain.faceChance;
  C.powers.rain.coverChance = 0; C.powers.rain.faceChance = 0;
  const w0 = a.needs.warmth; let climbed = false, maxW = w0;
  for (let i = 0; i < 60; i++) {
    a.needs.fullness = 80; a.needs.water = 80; a.needs.energy = 80;
    a.pos = { x: spot.x, y: spot.y }; a.den = null;
    if (a.act.type !== "idle") a.act = { type: "idle", until: s.tick + 100 };
    G.Sim.step(s);
    if (a.needs.warmth > w0 + 1e-6) climbed = true;
    if (a.needs.warmth > maxW) maxW = a.needs.warmth;
  }
  C.powers.rain.coverChance = oldCover; C.powers.rain.faceChance = oldFace;
  ok(!climbed && maxW <= w0 + 1e-6,
    "wet ground (no active rain) + daytime + no fire: warmth does not climb",
    "w0=" + w0.toFixed(3) + " max=" + maxW.toFixed(3) + " wetGround=" + (a.felt && a.felt.wetGround));
}

console.log(fails ? ("\n" + fails + " FAIL") : "\nALL PASS");
process.exit(fails ? 1 : 0);
