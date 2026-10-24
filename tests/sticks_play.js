// Step 21 (v15): burning sticks are picked up in normal play. Runs SEEDS (default 1..16) for YEARS (default 2) game years with no
// interventions, in parallel child processes (tests/deaths_run.js), and checks that people warming by a burning stick roll for it and
// that lit sticks are actually picked up on at least MIN seeds (default 2). Slow (minutes): run it with nohup, e.g.
//   nohup node tests/sticks_play.js > /tmp/sticks_play.log 2>&1 &
const { execFile } = require("child_process"), path = require("path");
const seeds = (process.env.SEEDS || "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16").split(",").map(Number), years = +(process.env.YEARS || 2), min = +(process.env.MIN || 2);
const run = s => new Promise(res => execFile("node", [path.join(__dirname, "deaths_run.js"), String(s), String(years)], { maxBuffer: 1 << 26 }, (e, out) => {
  let j = null; try { j = JSON.parse(out); } catch (_) {} res({ s, j, e }); }));
(async () => {
  const rs = []; const q = seeds.slice(), par = +(process.env.PAR || 8);
  await Promise.all(Array.from({ length: par }, async () => { while (q.length) rs.push(await run(q.shift())); }));
  rs.sort((p, q) => p.s - q.s); let fail = 0, rolls = 0, pick = 0, withPick = 0;
  for (const r of rs) { if (!r.j) { console.log("FAIL seed " + r.s + " did not finish " + (r.e || "")); fail++; continue; }
    rolls += r.j.rolls || 0; pick += r.j.pickups || 0; if (r.j.pickups > 0) withPick++;
    console.log("seed " + r.s + ": rolls " + (r.j.rolls || 0) + ", grabs " + (r.j.grabs || 0) + ", lit sticks picked up " + (r.j.pickups || 0) + ", sticks caught " + (r.j.caught || 0)); }
  const ok = !fail && rolls > 0 && withPick >= min;
  console.log((ok ? "PASS" : "FAIL") + " burning sticks in normal play over " + years + " years: " + rolls + " hourly rolls, " + pick + " pickups on " + withPick + "/" + rs.length + " seeds (need >= " + min + ")");
  process.exit(ok ? 0 : 1);
})();
