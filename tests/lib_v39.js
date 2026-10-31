// v39 test loader: same DOM stub as headless_v38.js, plus the v39 files (reeds, bow, fight39, wolfmem, spar) in index.html order.
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
const V39_FILES = ["src/reeds.js", "src/bow.js", "src/fight39.js", "src/wolfmem.js", "src/spar.js"];
function load(opts) {
  opts = opts || {};
  const ctx = { console, Math, JSON, performance: { now: () => 0 } };
  const fakeEl = () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, setAttribute() {}, getAttribute() { return null; }, addEventListener() {},
    appendChild() {}, querySelectorAll() { return []; }, querySelector() { return null; }, getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    hidden: true, innerHTML: "", textContent: "", onclick: null });
  const els = {};
  ctx.document = { getElementById(id) { return els[id] || (els[id] = fakeEl()); }, querySelectorAll() { return []; },
    createElement() { const e = fakeEl(); e.children = []; e.appendChild = c => { e.children.push(c); }; e.parentNode = { appendChild() {} }; return e; },
    body: { classList: { toggle() {}, contains() { return false; } } }, addEventListener() {} };
  ctx.window = ctx; ctx.innerWidth = 1024; ctx.innerHeight = 768;
  ctx.localStorage = { getItem() { return null; }, setItem() {} }; ctx.matchMedia = () => ({ matches: false }); ctx.getComputedStyle = () => ({ position: "static" });
  vm.createContext(ctx);
  const files = ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/injury.js", "src/wolffear.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/hut.js", "src/farm.js", "src/food.js"].concat(opts.no39 ? [] : V39_FILES, ["src/sim.js", "src/icons.js"]);
  for (const f of files) if (fs.existsSync(path.join(root, f))) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  ctx.GS.Render = ctx.GS.Render || { centerOn() {}, view: { z: 1 }, zoomBy() {}, setViewport() {}, follow: null, pulse: null, frac() { return { fx: 0.5, fy: 0.5 }; }, toTile() { return { x: 0, y: 0 }; } };
  vm.runInContext(fs.readFileSync(path.join(root, "src/ui.js"), "utf8"), ctx, { filename: "src/ui.js" });
  return ctx.GS;
}
module.exports = { load, root, V39_FILES };
