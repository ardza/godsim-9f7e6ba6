// Sync data/group_names.json (Story Writer's list) into data/group_names.js so names work on file:// (no fetch).
// Run: node tools/sync_group_names.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), src = JSON.parse(fs.readFileSync(path.join(root, "data/group_names.json"), "utf8"));
const names = [...new Set((src.names || []).map(n => String(n).trim()).filter(Boolean))];
const out = "// GENERATED from data/group_names.json by tools/sync_group_names.js. Edit group_names.json, then re-run the script.\n" +
  "(function (G) {\n  G.data = G.data || {};\n  G.data.groupNames = " + JSON.stringify(names) + ";\n})(this.GS = this.GS || {});\n";
fs.writeFileSync(path.join(root, "data/group_names.js"), out);
console.log("data/group_names.js: " + names.length + " names");
