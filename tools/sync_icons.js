// Sync the Artist's icon kit (data/ui/icons/*.svg) into src/icons.js so icons work on file:// (no fetch).
// Run: node tools/sync_icons.js   (tests/headless.js fails if src/icons.js is out of date)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), dir = path.join(root, "data/ui/icons");
function build() {
  const names = fs.readdirSync(dir).filter(f => f.endsWith(".svg")).sort();
  return "// Inline copies of the Artist's 24px line icons (data/ui/icons/*.svg, stroke=currentColor) so they take the button color on file:// too.\n" +
    "// Generated - do not edit; regenerate after the kit changes (README: UI kit). tests/headless.js checks this matches the kit.\n" +
    "(function (G) { G.icons = {\n" +
    names.map(f => " " + JSON.stringify(f.slice(0, -4)) + ": " + JSON.stringify(fs.readFileSync(path.join(dir, f), "utf8").trim())).join(",\n") +
    "\n}; })(this.GS = this.GS || {});\n";
}
module.exports = { build };
if (require.main === module) { fs.writeFileSync(path.join(root, "src/icons.js"), build()); console.log("src/icons.js: " + fs.readdirSync(dir).filter(f => f.endsWith(".svg")).length + " icons"); }
