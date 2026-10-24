// Step 26b (save v23) headless tests: animal labels (deer/wild dog/Wolves), material jitter+flex,
// deposits (rocks slopes, sticks woods edges, flint/reed river banks), mountain peak, wild dogs hunt
// live deer, Wolves pack+den+territory (people threatened only inside), watch→hunt_score, v22→v23 migrate.
// Called from tests/headless.js; run alone with: node tests/headless_26b.js
module.exports = function (G, C, ok, h) {
  const W = G.World, MD = 1440;
  const { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP, solo } = h;
  const sig = s => JSON.stringify(G.Sim.serialize(s));
  const awake = s => { for (const a of s.agents) if (a.act.type === "sleep") G.Agent.startIdle(s, a); };
  const keep = s => { for (const a of s.agents) { a.needs.water = 100; a.needs.energy = 100; a.needs.fullness = 100; a.needs.warmth = Math.max(a.needs.warmth, 60); } };
  const art = G.data.art, A = C.animals, M = G.data.materials;

  // ---- config / art / materials ----
  ok(C.saveVersion === 23 && A.grazer.label === "deer" && A.scavenger.label === "wild dog" && A.wolves.label === "Wolves" &&
    A.scavenger.corpsePreferTiles === 8 && A.scavenger.huntDeer && A.scavenger.huntDeer.fullnessBelow === 40 &&
    A.wolves.packSize.join() === "3,5" && A.wolves.territory === 10 && A.wolves.denMinFromSpawn === 15 &&
    C.hunt.watchGain === 8 && M.reed && M.reed.flex === 70 && M.stick.flex === 55 && M.rock.flex === 5 &&
    C.objects.jitterPct.join() === "0.1,0.2" && C.objects.reed && C.objects.rock.where === "slope" &&
    art.wolves && art.wolves.src.indexOf("wolves_16") >= 0 && art.reed && art.reedBank && art.mountain &&
    art.scavenger.src.indexOf("scavenger_16") >= 0 && art.grazer.src.indexOf("grazer_16") >= 0 &&
    C.powers.spawn.kindLabels.grazer === "deer" && C.powers.spawn.kindLabels.predator === "wild dog" && C.powers.spawn.kindLabels.wolves === "Wolves",
    "26b config: v23 labels deer/wild dog/Wolves; huntDeer; pack; flex; art sheets; spawn kindLabels",
    "watchGain=" + C.hunt.watchGain + " reed.flex=" + M.reed.flex);

  // Director-locked climate (spec §26b.6): San Diego–like coastal
  { const sm = C.climate.seasonMeanC, amp = C.climate.dayAmpC;
    const s = G.Sim.create(1); const air0 = G.Climate.airC(s.tick); const f0 = air0 * 9 / 5 + 32;
    // Deep Cold midpoint: season 3, midday-ish
    const deepTick = 3 * C.time.daysPerSeason * MD + 12 * 60 - C.time.startMinute;
    const deepC = G.Climate.airC(deepTick), deepF = deepC * 9 / 5 + 32;
    ok(sm.join() === "18,23,19,15" && amp === 4 && f0 >= 54 && f0 <= 62 && deepF >= 55,
      "26b climate: seasonMeanC [18,23,19,15] dayAmp 4; start air 54–62°F; Deep Cold mean ≥55°F",
      "start " + f0.toFixed(1) + "°F deep " + deepF.toFixed(1) + "°F");
  }

  // Animal.name uses labels
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(7);
    const d = s.animals.find(a => a.species === "grazer");
    const wd = s.animals.find(a => a.species === "scavenger");
    const wk = s.animals.find(a => a.species === "wolves");
    ok(d && /^deer \d+$/.test(G.Animal.name(d)) && wd && /^wild dog \d+$/.test(G.Animal.name(wd)) &&
      wk && /^Wolves \d+$/.test(G.Animal.name(wk)),
      "26b labels: Animal.name → deer / wild dog / Wolves + id",
      [d && G.Animal.name(d), wd && G.Animal.name(wd), wk && G.Animal.name(wk)].join("; "));
  });

  // mountain peak present; mountain string length = tiles
  { const seeds = [1, 7, 42, 99]; let all = true, detail = [];
    for (const seed of seeds) {
      const w = W.generate(seed), peak = [...w.mountain].filter(c => c === "3").length;
      const okM = w.mountain && w.mountain.length === w.w * w.h && peak >= 1 && w.info.mountain;
      if (!okM) all = false;
      detail.push(seed + ":peakTiles=" + peak + (w.info.mountain ? "@" + w.info.mountain.x + "," + w.info.mountain.y : ""));
    }
    ok(all, "26b mountain: every seed has peak (≥1 tile level 3) + info.mountain", detail.join(" | "));
  }

  // deposits: rocks on slopes, sticks woods edges, flint/reed on banks (never water)
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(42), T = G.data.T;
    const rocks = s.items.filter(i => i.material === "rock");
    const sticks = s.items.filter(i => i.material === "stick");
    const flints = s.items.filter(i => i.material === "flint");
    const reeds = s.items.filter(i => i.material === "reed");
    const onSlope = rocks.filter(i => W.hillAt(s.world, i.x, i.y) || W.mountainAt(s.world, i.x, i.y) > 0).length;
    const nearWoods = sticks.filter(i => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]])
        if (W.inb(s.world, i.x + dx, i.y + dy) && W.tile(s.world, i.x + dx, i.y + dy) === T.WOODS) return true;
      return W.tile(s.world, i.x, i.y) === T.WOODS;
    }).length;
    const onWater = [...flints, ...reeds].filter(i => G.data.tiles[W.tile(s.world, i.x, i.y)].water);
    const nearWater = [...flints, ...reeds].filter(i => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        if ((dx || dy) && W.inb(s.world, i.x + dx, i.y + dy) && G.data.tiles[W.tile(s.world, i.x + dx, i.y + dy)].water) return true;
      return false;
    }).length;
    ok(rocks.length >= 8 && onSlope >= rocks.length * 0.4 && sticks.length >= 8 && nearWoods >= sticks.length * 0.5 &&
      reeds.length >= 4 && flints.length >= 2 && !onWater.length && nearWater >= (flints.length + reeds.length) * 0.7,
      "26b deposits: rocks on slopes, sticks near woods, flint/reed on banks (never water)",
      "rock " + rocks.length + " slope " + onSlope + "; stick " + sticks.length + " woods " + nearWoods +
      "; flint " + flints.length + " reed " + reeds.length + " waterHits " + onWater.length);
  });

  // prop jitter: 20 rocks hardness stdev > 0; flex present
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(11);
    const rocks = s.items.filter(i => i.material === "rock").slice(0, 20);
    const hs = rocks.map(i => i.props.hardness);
    const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
    const stdev = Math.sqrt(hs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / hs.length);
    const flexOk = rocks.every(i => i.props.flex != null && i.props.flex >= 0 && i.props.flex <= 100);
    const reeds = s.items.filter(i => i.material === "reed");
    const reedFlex = reeds.length ? reeds.map(i => i.props.flex) : [];
    ok(rocks.length >= 10 && stdev > 0 && flexOk && reedFlex.every(f => f >= 40),
      "26b jitter: rock hardness stdev > 0; flex on pieces; reeds flex high",
      "n=" + rocks.length + " stdev=" + stdev.toFixed(2) + " reedFlex=[" + reedFlex.slice(0, 5).join(",") + "]");
  });

  // Wolves pack 3–5, den ≥15 from spawn, one pack
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const seeds = [1, 7, 42, 99];
    let packsOk = 0, dens = [];
    for (const seed of seeds) {
      const s = G.Sim.create(seed);
      const wolves = s.animals.filter(a => a.species === "wolves");
      const packs = s.packs || [];
      const den = packs[0] && packs[0].den;
      const dSpawn = den && s.world.spawn ? Math.hypot(den.x - s.world.spawn.x, den.y - s.world.spawn.y) : 0;
      if (packs.length === 1 && wolves.length >= 3 && wolves.length <= 5 && wolves.every(w => w.pack === packs[0].id) && dSpawn >= 15) packsOk++;
      dens.push(seed + ":n=" + wolves.length + " d=" + dSpawn.toFixed(1));
    }
    ok(packsOk === seeds.length, "26b Wolves: 1 pack of 3–5, den ≥15 from founders on each seed", dens.join(" | "));
  });

  // wild dogs hunt live deer on ≥3 of 4 seeds (force hungry, no corpse, deer nearby)
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, { "fire.lightning.perSeason": [0, 0, 0, 0] }), () => {
    const seeds = [3, 11, 42, 77]; let kills = 0, detail = [];
    for (const seed of seeds) {
      const s = G.Sim.create(seed); s.bodies = []; // no corpses
      const dog = s.animals.find(a => a.species === "scavenger");
      const deer = s.animals.filter(a => a.species === "grazer");
      if (!dog || !deer.length) { detail.push(seed + ":no animals"); continue; }
      dog.needs.fullness = 20; // under 40
      // park dog next to a deer
      const prey = deer[0];
      dog.pos = { x: prey.pos.x + 1, y: prey.pos.y };
      if (!W.walkable(s.world, dog.pos.x, dog.pos.y)) dog.pos = { x: prey.pos.x, y: prey.pos.y + 1 };
      dog.act = { type: "idle", until: s.tick };
      // boost kill chance for the proof window
      const oldK = C.animals.scavenger.huntDeer.killChance;
      C.animals.scavenger.huntDeer.killChance = 0.95;
      let got = false;
      for (let i = 0; i < 400 && !got; i++) {
        keep(s); awake(s);
        // keep dog hungry and deer nearby
        dog.needs.fullness = Math.min(dog.needs.fullness, 25);
        if (!s.animals.includes(prey)) { got = true; break; }
        // nudge dog toward prey if drifted
        if (Math.hypot(dog.pos.x - prey.pos.x, dog.pos.y - prey.pos.y) > 3) {
          dog.pos.x = prey.pos.x + (i % 2 ? 1 : -1); dog.pos.y = prey.pos.y;
          if (!W.walkable(s.world, Math.round(dog.pos.x), Math.round(dog.pos.y))) dog.pos = { x: prey.pos.x, y: prey.pos.y };
        }
        G.Sim.step(s);
        if (s.bodies.some(b => b.species === "grazer" && b.killedBy && /wild dog/.test(b.killedBy))) got = true;
        if (s.log.some(e => /wild dog \d+ brings down deer/.test(e.text))) got = true;
      }
      C.animals.scavenger.huntDeer.killChance = oldK;
      if (got) kills++;
      detail.push(seed + ":" + (got ? "kill" : "miss") + " ticks=" + s.tick);
    }
    ok(kills >= 3, "26b wild dogs eat a live deer on ≥3 of 4 seeds", kills + "/4 — " + detail.join("; "));
  });

  // people outside territory are not hunted; forced enter-territory shows chase
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(42); awake(s); keep(s);
    const pack = s.packs[0], wolves = s.animals.filter(a => a.species === "wolves");
    ok(!!pack && wolves.length >= 3, "26b territory setup has pack", pack ? "den " + pack.den.x + "," + pack.den.y : "none");
    // person far from den: step; no chase log / no wolf threaten goal
    const outsider = s.agents[0];
    outsider.pos.x = s.world.spawn.x; outsider.pos.y = s.world.spawn.y;
    G.Agent.startIdle(s, outsider);
    const far = Math.hypot(outsider.pos.x - pack.den.x, outsider.pos.y - pack.den.y);
    let chasedOut = false;
    for (let i = 0; i < 60; i++) {
      keep(s); G.Sim.step(s);
      if (wolves.some(w => w.act && w.act.goal === "threaten" && w.act.target === outsider.id)) chasedOut = true;
      if (s.log.some(e => /chases /.test(e.text) && e.text.indexOf(outsider.name) >= 0)) chasedOut = true;
    }
    ok(far > C.animals.wolves.territory && !chasedOut,
      "26b people outside territory are not hunted",
      "dist=" + far.toFixed(1) + " chased=" + chasedOut);

    // force enter territory — only the insider so wolves focus on them
    const insider = s.agents[1] || outsider;
    s.agents = [insider];
    let placed = false;
    for (let r = 0; r < C.animals.wolves.territory && !placed; r++)
      for (let dy = -r; dy <= r && !placed; dy++) for (let dx = -r; dx <= r && !placed; dx++) {
        const x = pack.den.x + dx, y = pack.den.y + dy;
        if (W.walkable(s.world, x, y)) { insider.pos = { x, y }; placed = true; }
      }
    G.Agent.startIdle(s, insider);
    pack.chaseLog = -1e9;
    // park one wolf next to the insider (others stay near den but not stacked on the strike tile)
    const w0 = wolves[0];
    w0.pos = { x: insider.pos.x + 1, y: insider.pos.y };
    if (!W.walkable(s.world, w0.pos.x, w0.pos.y)) w0.pos = { x: insider.pos.x, y: insider.pos.y + 1 };
    w0.act = { type: "idle", until: s.tick }; w0.needs.fullness = 90;
    for (const w of wolves.slice(1)) { w.act = { type: "idle", until: s.tick + 200 }; w.needs.fullness = 90; }
    const oldKill = C.animals.wolves.threaten.killChance;
    C.animals.wolves.threaten.killChance = 0;   // observe chase/fright without instant kill removing the person
    let chasedIn = false;
    for (let i = 0; i < 100 && !chasedIn; i++) {
      keep(s); awake(s);
      G.Sim.step(s);
      if (wolves.some(w => w.act && (w.act.goal === "threaten" || w.act.type === "threaten"))) chasedIn = true;
      if (s.log.some(e => /chases /.test(e.text) || /driven back by Wolves/.test(e.text) || /brings down /.test(e.text))) chasedIn = true;
      if (insider.fright && insider.fright.v > 0) chasedIn = true;
    }
    C.animals.wolves.threaten.killChance = oldKill;
    ok(chasedIn, "26b forced enter-territory run shows chase", "terrDist=" + Math.hypot(insider.pos.x - pack.den.x, insider.pos.y - pack.den.y).toFixed(1) + " fright=" + (insider.fright && insider.fright.v) + " goals=" + wolves.map(w => w.act && w.act.goal).join(","));
  });

  // watch→hunt_score bump when witnessing a predator kill
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(7); awake(s); keep(s);
    const dog = s.animals.find(a => a.species === "scavenger");
    const deer = s.animals.find(a => a.species === "grazer");
    const watcher = s.agents[0];
    const before = G.Learn.score(watcher, "hunt");
    // dog next to deer; watcher within watchTiles (8) but outside dog fleeWithin (4) so the dog does not flee the person
    const x = Math.round(deer.pos.x), y = Math.round(deer.pos.y);
    dog.pos = { x: x + 1, y }; if (!W.walkable(s.world, dog.pos.x, dog.pos.y)) dog.pos = { x, y: y + 1 };
    watcher.pos = { x: x + 6, y }; if (!W.walkable(s.world, watcher.pos.x, watcher.pos.y)) watcher.pos = { x: x - 6, y };
    if (!W.walkable(s.world, watcher.pos.x, watcher.pos.y)) watcher.pos = { x, y: y + 6 };
    // clear other people so they do not scare the dog
    s.agents = [watcher];
    dog.needs.fullness = 10;
    const oldK = C.animals.scavenger.huntDeer.killChance;
    C.animals.scavenger.huntDeer.killChance = 1;
    let bumped = false;
    for (let i = 0; i < 200 && !bumped; i++) {
      keep(s); awake(s); dog.needs.fullness = 10;
      G.Sim.step(s);
      if (G.Learn.score(watcher, "hunt") > before || (s.huntWatch || 0) > 0) bumped = true;
    }
    C.animals.scavenger.huntDeer.killChance = oldK;
    ok(bumped, "26b watch→hunt_score: witness of predator kill bumps hunt",
      "before=" + before + " after=" + G.Learn.score(watcher, "hunt") + " huntWatch=" + (s.huntWatch || 0));
  });

  // v22 → v23 migrate: mountain + packs + flex backfill; round-trip
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(9);
    const j = sig(s);
    const o = JSON.parse(j);
    ok(o.version === 23 && o.world.mountain && o.world.mountain.length === o.world.w * o.world.h && Array.isArray(o.packs),
      "26b serialize: v23 + mountain string + packs", "packs=" + o.packs.length + " mountainLen=" + (o.world.mountain || "").length);
    // fake a v22 save (strip mountain/packs, set version 22, strip flex)
    const v22 = JSON.parse(j);
    v22.version = 22; delete v22.world.mountain; delete v22.packs; delete v22.nextPackId;
    for (const it of v22.items || []) if (it.props) delete it.props.flex;
    const m = G.Sim.migrate23(v22);
    ok(m.version === 23 && m.world.mountain && m.world.mountain.length === m.world.w * m.world.h && Array.isArray(m.packs) &&
      (m.items || []).every(it => !it.props || it.props.flex != null),
      "26b migrate23: v22→v23 adds mountain zeros, packs, flex",
      "flex sample=" + (m.items[0] && m.items[0].props.flex));
    const r = G.Sim.deserialize(JSON.parse(j));
    ok(sig(s) === sig(r), "26b save round-trip identical", (j.length / 1024).toFixed(1) + " KB");
  });

  // index art + animal/render scripts at ?v=23
  { const html = require("fs").readFileSync(require("path").join(__dirname, "../index.html"), "utf8");
    const need = ["src/animal.js", "src/render.js", "src/objects.js", "src/sim.js", "data/art.js", "data/materials.js"];
    ok(need.every(f => html.indexOf(f + "?v=" + C.saveVersion) >= 0) && C.saveVersion === 23,
      "26b index: animal/render/objects/sim/art/materials ?v=23", "ok");
    const fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
    const pngs = ["reed_16.png", "reed_bank_16.png", "mountain_16.png", "wolves_16.png", "scavenger_16.png", "grazer_16.png"];
    ok(pngs.every(f => fs.existsSync(path.join(root, "data/art", f))),
      "26b art files present (reed, reed_bank, mountain, wolves; wild dog=scavenger, deer=grazer)",
      pngs.filter(f => fs.existsSync(path.join(root, "data/art", f))).join(", "));
    ok(/pcard-tabs/.test(html) && /pcard-tab/.test(html) && /font-size:\s*16px/.test(html) && /min-height:\s*44px/.test(html),
      "26b index CSS: person-card tabs ≥16px / ≥44px", "ok");
  }

  // 26b.7 person-card tabs (Needs / Mind / Kin / Knows); header+Find+plog outside
  { const tabs = (C.ui.personTabs || []).map(t => t.key).join();
    ok(tabs === "needs,mind,kin,knows" && C.ui.personTabs[0].label === "Needs",
      "26b personTabs config: Needs/Mind/Kin/Knows (Needs first)", tabs);
    const ui = require("fs").readFileSync(require("path").join(__dirname, "../src/ui.js"), "utf8");
    ok(/UI\.personTab = "needs"/.test(ui) && /data-ptab/.test(ui) && /needsPane/.test(ui) && /mindPane/.test(ui) && /kinPane/.test(ui) && /knowsPane/.test(ui),
      "26b ui.js: personTab session + four panes (Needs/Mind/Kin/Knows)", "ok");
    const ih = ui.indexOf('innerHTML = findBtn(a)');
    ok(ih >= 0 && ui.indexOf("tabBar", ih) > ih && ui.indexOf("pcard-pane", ih) > ih,
      "26b ui.js: Find + header stay outside tabs", "ih=" + ih);
  }

  // 26b.8 prayer Story banks (all needs) + 2h why cool; death lines unchanged
  { const F = G.Faith, BANKS = {
      energy: ["tired", "worn out", "weary", "spent"],
      warmth: ["shivering", "cold", "chilled"],
      fullness: ["hungry", "empty", "starved"],
      water: ["thirsty", "parched", "dry"]
    };
    const faithSrc = require("fs").readFileSync(require("path").join(__dirname, "../src/faith.js"), "utf8");
    ok(/whyTag/.test(faithSrc) && /WHY_COOL_H\s*=\s*2/.test(faithSrc) &&
      Object.keys(BANKS).every(n => BANKS[n].every(w => faithSrc.indexOf('"' + w + '"') >= 0)),
      "26b.8 faith: whyTag + WHY_COOL_H=2 + Story banks for all needs", "ok");
    const s = G.Sim.create(3), a = s.agents[0];
    const seen = {};
    for (const need of Object.keys(BANKS)) {
      seen[need] = new Set();
      for (let i = 0; i < 40; i++) { s.tick = i * 10000; seen[need].add(F.whyTag(s, a, need)); F.feed(s, a, "x", null); }
    }
    const bankOk = Object.keys(BANKS).every(n => seen[n].size >= Math.min(3, BANKS[n].length) &&
      [...seen[n]].every(w => BANKS[n].includes(w)));
    ok(bankOk, "26b.8 Story banks rotate per need",
      JSON.stringify(Object.fromEntries(Object.keys(BANKS).map(n => [n, [...seen[n]]]))));
    s.prayers = []; s.tick = 100;
    const t1 = F.whyTag(s, a, "warmth"); F.feed(s, a, "Lord", "warmth");
    s.tick = 100 + 60; const t2 = F.whyTag(s, a, "warmth");
    s.tick = 100 + 180; const t3 = F.whyTag(s, a, "warmth");
    ok(!!t1 && !t2 && !!t3, "26b.8 skip why if same person+need within ~2h", JSON.stringify({ t1, t2, t3 }));
    ok(/has died|death/.test(faithSrc) || /died/.test(faithSrc), "26b.8 death lines still present in faith", "ok");
  }

  // 26b zero-point: Fullness/Water/Energy words + energy drain 48h waking
  { const A = G.Agent;
    ok(A.fullnessWord(0) === "starving" && A.waterWord(0) === "dehydrated" && A.energyWord(0) === "sleep-deprived",
      "26b zero-point words: starving/dehydrated/sleep-deprived",
      [A.fullnessWord(0), A.waterWord(0), A.energyWord(0)].join("/"));
    ok(C.person.energy.drainMinutes === 960,
      "26b energy drainMinutes=960 (16h waking → zero)", C.person.energy.drainMinutes);
  }

  // 26b People tab: All + group tabs, age desc, Energy meter; no name/age sort
  { const ui = require("fs").readFileSync(require("path").join(__dirname, "../src/ui.js"), "utf8");
    const html = require("fs").readFileSync(require("path").join(__dirname, "../index.html"), "utf8");
    ok(/peopleFilter/.test(ui) && /peop-tabs/.test(ui) && /peop-tab/.test(ui) && /Energy/.test(ui) &&
      !/psort/.test(ui) && /q\.age\s*-\s*p\.age|b\.age\s*-\s*a\.age/.test(ui),
      "26b ui.js: People All+groups, age desc, Energy, no psort", "ok");
    ok(/peop-tabs/.test(html) && /peop-tab/.test(html),
      "26b index CSS: peop-tabs", "ok");
  }

  // 26b hypothermia: warmthZeroMinutes=4320 after full ladder; stages; alive through unconscious
  { ok(C.person.death.warmthZeroMinutes === 4320 && C.person.death.energyZeroMinutes === 7200 && C.person.hypothermia &&
      C.person.hypothermia.confusionAt === 30 && C.person.hypothermia.clumsinessAt === 120 &&
      C.person.hypothermia.drowsinessAt === 240 && C.person.hypothermia.unconsciousAt === 480,
      "26b config: warmthZero=4320 (3d); energyZero=7200 (5d); hypo stages 30/120/240/480", JSON.stringify(C.person.death) + " hypo=" + JSON.stringify({
        c: C.person.hypothermia.confusionAt, k: C.person.hypothermia.clumsinessAt,
        d: C.person.hypothermia.drowsinessAt, u: C.person.hypothermia.unconsciousAt }));
  }
  withCfg(Object.assign({ "climate.seasonMeanC": [-30, -30, -30, -30] }, NO_THIRST_SLEEP, { "person.energy.drainMinutes": 1e15 }), () => {
    const s = G.Sim.create(11), a = solo(s); a.hold = "warmth"; a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = 100;
    const marks = {};
    for (let i = 0; i < 500; i++) {
      G.Sim.step(s); if (!s.agents.length) break;
      a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = 100;
      if (a.hypo && !marks[a.hypo]) marks[a.hypo] = a.zero.warmth;
    }
    // force stage logs if rng skipped them in the open run
    a.zero.warmth = 60; a.needs.warmth = 0; a.hypo = G.Agent.hypoStage(a);
    a.hypoOddAt = null; const before = s.log.length;
    for (let i = 0; i < 5; i++) { a.act = { type: "idle", until: s.tick + 1 }; G.Agent.step(s, a); a.needs.fullness = 100; a.needs.water = 100; a.needs.energy = 100; a.needs.warmth = 0; }
    const oddOrCollapse = s.log.slice(before).some(e => /is shivering|is stumbling|looks lost|is moving slow|is nodding off|is slowing further|has collapsed|is not getting up/.test(e.text))
      || s.log.some(e => /is shivering|is stumbling|looks lost|is moving slow|drops what they were carrying|is nodding off|is slowing further|has collapsed|is not getting up/.test(e.text));
    ok(s.agents.some(q => q.id === a.id) && !s.bodies.some(b => b.of === a.id && b.cause === "cold") &&
      marks[2] != null && marks[3] != null && marks[4] != null && marks[5] != null && oddOrCollapse,
      "26b hypothermia: 8h+ at warmth 0 → unconscious stage; still alive (death only at 3 days)",
      "finalHypo=" + a.hypo + " marks=" + JSON.stringify(marks) + " alive=" + s.agents.length);
  });

  // 26b rain progressive cover: Medium rain, open-air people → ≥4/5 under cover by 3 h
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, { "powers.rain.faceChance": 0 }), () => {
    const s = G.Sim.create(3); s.fire = {};
    const T = G.data.T, w = s.world; let meadow = null, woods = null;
    for (let y = 0; y < w.h && !(meadow && woods); y++) for (let x = 0; x < w.w; x++) {
      if (!meadow && w.tiles[y * w.w + x] === T.MEADOW) meadow = { x, y };
      if (!woods && w.tiles[y * w.w + x] === T.WOODS) woods = { x, y };
    }
    // pick 5 agents on open meadow under a wide rain circle that also reaches woods
    const people = s.agents.slice(0, Math.min(5, s.agents.length));
    s.agents = people;
    for (const p of people) {
      p.pos = { x: meadow.x, y: meadow.y }; p.act = { type: "idle", until: s.tick + 500 };
      Object.assign(p.needs, { warmth: 85, fullness: 90, water: 90, energy: 95 });
      p.traits.coldFear = 80; p.rainExposedMinutes = 0;
    }
    const Pw = G.Powers; Pw.cast(s, "rain", meadow.x, meadow.y, "medium");
    s.powers.effects[0].r = 40; s.powers.effects[0].end = s.tick + 600;
    for (let i = 0; i < 180; i++) G.Sim.step(s); // 3 game hours
    const under = people.filter(p => s.agents.includes(p) && Pw.exposure(s, p) === 0).length;
    const exposedWander = people.filter(p => s.agents.includes(p) && Pw.exposure(s, p) > 0 && p.act.type === "walk" && p.act.goal === "wander").length;
    ok(under >= 4 && woods, "26b rain: ≥4/5 under woods/shelter by 3 h Medium rain",
      under + "/5 covered; exposedWander=" + exposedWander + " covers=" + (s.powers.stats.covers || 0));
    for (let i = 0; i < 60; i++) G.Sim.step(s); // through 4 h
    const stillWander = people.filter(p => s.agents.includes(p) && Pw.exposure(s, p) > 0 && p.act.goal === "wander").length;
    ok(stillWander === 0, "26b rain: none still wander exposed at 4 h if cover exists", "stillWander=" + stillWander);
  });
};

if (require.main === module) {
  const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
  const src = fs.readFileSync(path.join(__dirname, "headless.js"), "utf8");
  const list = JSON.parse(src.match(/for \(const f of (\[[^\]]+\])\)/)[1]);
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of list) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  const G = ctx.GS, C = G.data.config; let fails = 0;
  const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };
  function withCfg(patch, fn) {
    const old = {};
    for (const k in patch) { const ps = k.split("."); let o = C; for (const q of ps.slice(0, -1)) o = o[q]; old[k] = [o, ps.at(-1), o[ps.at(-1)]]; o[ps.at(-1)] = patch[k]; }
    try { return fn(); } finally { for (const k in old) { const [o, f, v] = old[k]; o[f] = v; } }
  }
  const NO_LIGHTNING = { "fire.lightning.perSeason": [0, 0, 0, 0] };
  const NO_THIRST_SLEEP = { "person.water.minutesFullToThirsty": 1e15, "person.energy.drainMinutes": 1e15, "person.energy.nightFrom": 1440 };
  const solo = s => { const a = s.agents[0]; s.agents = [a]; return a; };
  module.exports(G, C, ok, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP, solo });
  console.log(fails ? "26b FAILED (" + fails + ")" : "26b PASSED");
  process.exit(fails ? 1 : 0);
}
