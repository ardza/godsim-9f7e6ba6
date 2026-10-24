// Sync data/words.json (Story Writer) into data/words.js so syllables work on file:// (no fetch).
// Run: node tools/sync_words.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const src = JSON.parse(fs.readFileSync(path.join(root, "data/words.json"), "utf8"));
const meanings = src.meanings || src;
const keys = ["food", "water", "warm", "danger", "follow", "stop"];
for (const k of keys) {
  if (!Array.isArray(meanings[k]) || meanings[k].length < 1)
    throw new Error("words.json missing syllables for " + k);
}
const out = "// GENERATED from data/words.json by tools/sync_words.js. Edit words.json, then re-run the script.\n" +
  "(function (G) {\n  G.data = G.data || {};\n  G.data.words = " + JSON.stringify({ meanings: Object.fromEntries(keys.map(k => [k, meanings[k].map(String)])) }) + ";\n})(this.GS = this.GS || {});\n";
fs.writeFileSync(path.join(root, "data/words.js"), out);
console.log("data/words.js: " + keys.map(k => k + "×" + meanings[k].length).join(", "));
