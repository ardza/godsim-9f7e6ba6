// Sync data/names.json (Story Writer's list) into data/names.js so names work on file:// (no fetch).
// Run: node tools/sync_names.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), src = JSON.parse(fs.readFileSync(path.join(root, "data/names.json"), "utf8"));
// Accepts a plain list, {names: [...]}, or an object whose values are lists/strings (e.g. grouped names).
const flat = v => Array.isArray(v) ? v.flatMap(flat) : v && typeof v === "object" ? flat(v.names !== undefined ? v.names : Object.values(v).filter(x => typeof x !== "string" || !/\s/.test(x))) : typeof v === "string" ? [v] : [];
const names = [...new Set(flat(src).map(n => String(n).trim()).filter(Boolean))];
const out = "// GENERATED from data/names.json by tools/sync_names.js. Edit names.json, then re-run the script.\n" +
  "(function (G) {\n  G.data = G.data || {};\n  G.data.names = " + JSON.stringify(names) + ";\n})(this.GS = this.GS || {});\n";
fs.writeFileSync(path.join(root, "data/names.js"), out);
console.log("data/names.js: " + names.length + " names");
