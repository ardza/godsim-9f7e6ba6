// v38 (f) spec test 7, full length: wipe out the pack, run 2 game years (8 seasons) with no powers used, then the spawn checks
// (3 Wolves -> pack + den that hunts and that deer flee; joining, nearer pack, far spawn -> new pack, cap 5). The same check
// block as headless_v38 (f) 7, with its one-season wait stretched to 8 seasons. Run: node tests/f7_2yr_v38.js
const fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(__dirname, "headless_v38.js"), "utf8"), head = src.split("const G = load()")[0];
eval(head); const G = load(), C = G.data.config;
let passes = 0, fails = 0; const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (c) passes++; else fails++; };
const A = C.animals, AW = A.wolves, Fx = G.WolfFight;
let block = src.slice(src.indexOf("  // 7. no respawn"), src.indexOf("  // fixture wiring + a live day after each fixture"));
const oneSeason = "for (let i = 0; i < C.time.daysPerSeason * 1440 / C.time.tickGameMinutes; i++) G.Sim.step(s);";
if (block.indexOf(oneSeason) < 0) throw new Error("f7 block changed in headless_v38.js");
block = block.replace(oneSeason, "const SEASON = C.time.daysPerSeason * 1440 / C.time.tickGameMinutes; let maxW = 0; const ends = [];\n" +
  "    for (let w = 0; w < 8; w++) { for (let i = 0; i < SEASON; i++) G.Sim.step(s); const nW = s.animals.filter(q => q.species === 'wolves').length; maxW = Math.max(maxW, nW);\n" +
  "      ends.push('Y' + ((w >> 2) + 1) + ' ' + C.time.seasons[w % 4] + ': ' + s.animals.filter(q => q.species === 'grazer').length + ' deer, ' + s.animals.filter(q => q.species === 'scavenger').length + ' dogs, ' + nW + ' wolves, ' + s.agents.length + ' people'); }\n" +
  "    console.log('  season ends after the wipe: ' + ends.join(' | '));\n" +
  "    ok(maxW === 0 && (s.packs || []).length === 0, '(f) 7: 0 Wolves and no pack at every season end for 2 game years, no powers used', 'max ' + maxW + ', day ' + Math.floor(s.tick / 1440));");
block = block.replace("still 0 wolves a season later (no respawn; 2-year run in tests/pop_v38f.js)", "still 0 wolves after 2 game years (no respawn)");
console.log("v38 (f) test 7, 2-year run, seed 3873, saveVersion " + C.saveVersion);
eval(block);
console.log("\n" + passes + " PASS, " + fails + " FAIL"); process.exit(fails ? 1 : 0);
