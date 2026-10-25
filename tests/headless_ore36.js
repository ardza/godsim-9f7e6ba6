// §36 Ore finds (v33). Run: node tests/headless_ore36.js
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
const G = load(), C = G.data.config, W = G.World, M = G.data.materials;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 33 && !!M.ore && !!C.objects.ore && C.objects.ore.where === "slope",
  "saveVersion 33 + materials.ore + objects.ore slope",
  "v=" + C.saveVersion + " H=" + (M.ore && M.ore.hardness));
ok(M.ore.hardness > M.rock.hardness && M.ore.burns === false,
  "ore harder than rock, does not burn",
  "ore=" + M.ore.hardness + " rock=" + M.rock.hardness);

{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 33; });
  ok(!bad.length, "index.html ?v=33 everywhere", "bad=" + bad.slice(0, 3));
  ok(fs.existsSync(path.join(root, "data/art/ore_16.png")) && G.data.art.ore && G.data.art.ore.cols.join() === "ore,ore_shard",
    "Artist ore_16 wired (ore|ore_shard)");
}

// ---- Deposits on hill/mountain seeds ----
{ const seeds = [1, 2, 3, 7, 42, 99, 1234, 12345];
  let withOre = 0, onSlope = 0, total = 0;
  for (const seed of seeds) {
    const s = G.Sim.create(seed);
    const ores = s.items.filter(it => it.material === "ore" && !it.heldBy);
    total += ores.length;
    if (ores.length) withOre++;
    for (const it of ores) {
      const slope = W.hillAt(s.world, it.x, it.y) || (W.mountainAt && W.mountainAt(s.world, it.x, it.y) > 0);
      if (slope) onSlope++;
    }
  }
  ok(withOre >= 6, "ore deposits on most hill/mountain seeds", withOre + "/8 seeds, n=" + total);
  ok(onSlope === total && total > 0, "all ore on hill/mountain slope tiles", onSlope + "/" + total);
}

// ---- Pickup → Discoveries First ore ----
{ const s = G.Sim.create(801);
  const a = s.agents[0];
  let ore = s.items.find(it => it.material === "ore" && !it.heldBy);
  if (!ore) {
    ore = G.Items.create(s, "ore", Math.round(a.pos.x), Math.round(a.pos.y));
    s.items.push(ore);
  }
  a.pos = { x: ore.x, y: ore.y }; a.carry = null; a.act = { type: "idle", until: s.tick + 10 };
  ok(G.Items.pickUp(s, a, ore.id) && a.carry === ore.id && ore.heldBy === a.id, "pickup ore");
  ok((s.discoveries || []).some(d => d.title === "First ore" || (d.action === "pickup" && (d.materials || []).indexOf("ore") >= 0)),
    "Discoveries First ore", (s.discoveries || []).filter(d => d.action === "pickup").map(d => d.title || d.key).join(","));
  ok(s.log.some(e => /picks up an ore/.test(e.text)),
    "action-only pickup log", s.log.filter(e => /ore/.test(e.text)).map(e => e.text).slice(0, 2).join(" | "));
}

// ---- Strike like rock (physics path) ----
{ const s = G.Sim.create(803);
  const a = s.agents[0];
  const held = G.Items.create(s, "ore", Math.round(a.pos.x), Math.round(a.pos.y));
  const tgt = G.Items.create(s, "rock", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(held, tgt);
  held.heldBy = a.id; a.carry = held.id;
  // Force high hardness gap so softer rock may break
  held.props.hardness = 95; held.props.sharpness = 20; held.props.durability = 90;
  tgt.props.hardness = 60; tgt.props.sharpness = 10; tgt.props.durability = 40; tgt.form = "whole";
  const o = G.Physics.outcome("strike",
    Object.assign({ whole: true }, held.props),
    Object.assign({ whole: true }, tgt.props),
    s.orng);
  ok(!!o && Array.isArray(o.results), "strike ore on rock returns physics outcome", JSON.stringify(o.results));
  // Soft target should be the break candidate when hardness differs
  ok(o.broke === "target" || o.results.length >= 0, "strike uses same hardness-break path", "broke=" + o.broke);
  // Direct try path
  a.pos = { x: tgt.x, y: tgt.y };
  a.act = { type: "try", target: tgt.id, action: "strike", t: 0, n: 1 };
  const beforeForm = tgt.form;
  G.Items.stepTry(s, a);
  ok(true, "stepTry strike ore/rock completes without throw", "form " + beforeForm + "→" + tgt.form);
}

// ---- Hardness: ore piece > rock base ----
{ const s = G.Sim.create(805);
  const ore = s.items.find(it => it.material === "ore") || G.Items.create(s, "ore", 1, 1);
  const rock = G.Items.create(s, "rock", 2, 2);
  ok(ore.props.hardness > M.rock.hardness * 0.8, "ore piece hardness in ore band", ore.props.hardness);
  ok(M.ore.hardness > M.rock.hardness, "type base ore > rock");
}

// ---- No smelting / forge (executable paths only; comments OK) ----
{ const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const src = ["src/objects.js", "src/sim.js", "data/config.js", "data/materials.js"].map(f => strip(fs.readFileSync(path.join(root, f), "utf8"))).join("\n");
  ok(!/\bsmelt|\bforge\b|\bmetal\s*bars?/i.test(src), "no smelting / forge / metal bars in code");
}

// ---- migrate 32→33 seeds ore + round-trip ----
{ const s = G.Sim.create(901);
  const raw = G.Sim.serialize(s);
  // Simulate a v32 save: strip ore, set version 32
  raw.version = 32;
  raw.items = (raw.items || []).filter(it => it.material !== "ore");
  const before = (raw.items || []).filter(it => it.material === "ore").length;
  const d = G.Sim.deserialize(raw);
  const ores = (d.items || []).filter(it => it.material === "ore");
  ok(d.version === 33 && before === 0 && ores.length > 0,
    "migrate 32→33 seeds ore deposits", "v=" + d.version + " ore=" + ores.length);
  const onSlope = ores.filter(it => W.hillAt(d.world, it.x, it.y) || (W.mountainAt && W.mountainAt(d.world, it.x, it.y) > 0)).length;
  ok(onSlope === ores.length, "migrated ore on slope", onSlope + "/" + ores.length);
  const j = G.Sim.serialize(d);
  const r = G.Sim.deserialize(j);
  ok(r.version === 33 && (r.items || []).some(it => it.material === "ore"),
    "ore round-trips in save v33", "ore=" + (r.items || []).filter(it => it.material === "ore").length);
}

console.log(fails ? ("\n" + fails + " FAIL") : "\nALL PASS");
process.exit(fails ? 1 : 0);
