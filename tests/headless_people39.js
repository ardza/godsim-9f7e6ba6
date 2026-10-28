// §39 People UI polish (v36). Run: node tests/headless_people39.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON, performance: { now: () => 0 } };
  // minimal DOM stub so ui.js can load (init not called)
  const fakeEl = () => ({
    style: {}, classList: { toggle() {}, add() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {},
    appendChild() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    hidden: true, innerHTML: "", textContent: "", onclick: null
  });
  const els = {};
  ctx.document = {
    getElementById(id) { return els[id] || (els[id] = fakeEl()); },
    querySelectorAll() { return []; },
    createElement() { return fakeEl(); },
    body: { classList: { toggle() {}, contains() { return false; } } },
    addEventListener() {}
  };
  ctx.window = ctx;
  ctx.innerWidth = 1024; ctx.innerHeight = 768;
  ctx.localStorage = { getItem() { return null; }, setItem() {} };
  ctx.matchMedia = () => ({ matches: false });
  ctx.getComputedStyle = () => ({ position: "static" });
  vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/hut.js", "src/sim.js", "src/icons.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  // stub Render before ui.js assigns focusFrac
  ctx.GS.Render = ctx.GS.Render || { centerOn() {}, view: { z: 1 }, zoomBy() {}, setViewport() {}, follow: null, pulse: null, frac() { return { fx: 0.5, fy: 0.5 }; }, toTile() { return { x: 0, y: 0 }; } };
  vm.runInContext(fs.readFileSync(path.join(root, "src/ui.js"), "utf8"), ctx, { filename: "src/ui.js" });
  return ctx.GS;
}
const G = load(), C = G.data.config;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 36, "saveVersion === 36", "v=" + C.saveVersion);

{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 36; });
  ok(!bad.length, "index.html ?v=36 everywhere", "bad=" + bad.slice(0, 3));
  ok(/theme\.css\?v=36/.test(html), "theme.css linked with ?v=36");
}

{ const theme = fs.readFileSync(path.join(root, "data/ui/theme.css"), "utf8");
  ok(/\.people-ui/.test(theme) && /--pp-cyan/.test(theme) && /\.pp-meter/.test(theme) && /\.pp-skill/.test(theme) && /\.pp-nav/.test(theme),
    "theme.css has .people-ui / pp-* tokens (Artist mock)");
}

{ const uiSrc = fs.readFileSync(path.join(root, "src/ui.js"), "utf8");
  ok(/people-ui/.test(uiSrc) && /pp-cardhead/.test(uiSrc) && /pp-meter/.test(uiSrc) && /pp-skill/.test(uiSrc) && /pp-mood/.test(uiSrc),
    "ui.js emits people-ui / pp-* markup");
  ok(/data-pcycle/.test(uiSrc) && /UI\.cyclePerson/.test(uiSrc) && /UI\.peopleCycleList/.test(uiSrc),
    "ui.js has prev/next cycle helpers");
  ok(/pp-find/.test(uiSrc) && /data-find/.test(uiSrc) && /UI\.find/.test(uiSrc),
    "ui.js Find button (pp-find + data-find → UI.find)");
  ok(!/pp-portraits|colonist-strip|portraitStrip/.test(uiSrc),
    "no portrait-strip classes in ui.js");
}

ok(!!G.UI && typeof G.UI.peopleCycleList === "function" && typeof G.UI.cyclePerson === "function" && typeof G.UI.find === "function",
  "UI helpers loaded (peopleCycleList / cyclePerson / find)");

// ---- cycle among alive (respect peopleFilter) ----
{ const s = G.Sim.create(936);
  ok(s.agents.length >= 2, "seed has ≥2 people for cycle", "n=" + s.agents.length);
  G.UI.peopleFilter = "all";
  const list = G.UI.peopleCycleList(s);
  ok(list.length === s.agents.length && list.every((a, i) => !i || list[i - 1].age >= a.age),
    "peopleCycleList: all alive, oldest→youngest", "n=" + list.length);
  const order = list.map(a => a.id);
  const app = { sim: s, selected: order[0], select(id) { this.selected = id; } };
  ok(G.UI.cyclePerson(app, 1) && app.selected === order[1], "cyclePerson +1 → next", "sel=" + app.selected);
  ok(G.UI.cyclePerson(app, -1) && app.selected === order[0], "cyclePerson -1 → prev", "sel=" + app.selected);
  // wrap
  app.selected = order[order.length - 1];
  ok(G.UI.cyclePerson(app, 1) && app.selected === order[0], "cyclePerson wraps forward");
  app.selected = order[0];
  ok(G.UI.cyclePerson(app, -1) && app.selected === order[order.length - 1], "cyclePerson wraps back");
}

// ---- migrate 35→36 ----
{ const s = G.Sim.create(937);
  const ser = G.Sim.serialize(s);
  ser.version = 35;
  const loaded = G.Sim.deserialize(ser);
  ok(loaded.version === 36, "migrate 35→36 bumps saveVersion", "v=" + loaded.version);
  const again = G.Sim.deserialize(G.Sim.serialize(loaded));
  ok(again.version === 36 && again.seed === s.seed && again.agents.length === s.agents.length,
    "v36 save round-trips", "agents=" + again.agents.length);
}

// ---- no crash: Moods + Agent need words still present for Needs meters ----
{ const s = G.Sim.create(938), a = s.agents[0];
  ok(typeof G.Agent.fullnessWord === "function" && typeof G.Agent.waterWord === "function"
    && typeof G.Agent.energyWord === "function" && typeof G.Agent.warmthWord === "function",
    "Agent need status words exist");
  if (G.Moods) G.Moods.ensure(a);
  ok(a.moods && a.moods.happiness != null && a.moods.sadness != null && a.moods.anger != null,
    "agent moods Hap/Sad/Ang fields exist", JSON.stringify(a.moods));
}

if (fails) { console.log("\n" + fails + " FAIL"); process.exit(1); }
console.log("\nALL PASS");
