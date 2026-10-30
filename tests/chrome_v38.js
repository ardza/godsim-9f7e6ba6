// v38 pre-freeze Chrome smoke: desktop 1366x768 + phone 390x844. Plain load, every v38 fixture (hut, sprout, cache, lightning x3, history,
// wolves x6, fire x8) and a real 37.2 -> 38 save migration (tests/fixtures/save_v37.2.json, made by tests/make_save_v37.2.js).
// Per page: loads v38, the fixture's scene is there, 60 game minutes run, every visible text >= 16px. Per device: 0 JS errors. Overall: no missing files.
// Run: node --experimental-websocket tests/chrome_v38.js   (screenshots -> /workspace/godsim-previews/v38/)
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = "/workspace/godsim-previews/v38/"; fs.mkdirSync(out, { recursive: true });
const save372 = fs.readFileSync(path.join(__dirname, "fixtures/save_v37.2.json"), "utf8"), o372 = JSON.parse(save372);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const missing = [], served = new Set();
const srv = http.createServer((q, s) => { const u = q.url.split("?")[0], f = path.join(root, decodeURIComponent(u)); fs.readFile(f, (e, b) => { if (e) { if (!/favicon/.test(q.url)) missing.push(q.url); s.writeHead(404); s.end(); return; } served.add(u + (q.url.includes("?") ? "?" + q.url.split("?")[1] : "")); s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" }); s.end(b); }); });
const prof = fs.mkdtempSync("/tmp/godsim38-"); let ch;
// [query, label, state check (JS expression returning {ok, ...}), screenshot?]
const S = "GS.app.sim", sel = "(GS.app.selected != null && !!document.querySelector('#info-body') && document.querySelector('#info-body').textContent.trim().length > 0)";
const pages = [
  ["", "plain", "({ ok: " + S + ".agents.length > 0, people: " + S + ".agents.length })", true],
  ["&fixture=hut", "hut", "(() => { const h = GS.Hut.huts(" + S + "); return { ok: h.length > 0 && " + sel + " && /hut/i.test(document.querySelector('#info-body').textContent), huts: h.length, card: " + sel + " } })()", true],
  ["&fixture=hut&kind=tiers", "hut_tiers", "(() => { const h = GS.Hut.huts(" + S + "); return { ok: h.length === 3 && h.map(x => GS.Hut.tier(x).k).join() === 'sticks,reeds,hide' && " + sel + " && /sturdy hut/i.test(document.querySelector('#info-body').textContent), tiers: h.map(x => GS.Hut.tier(x).k) } })()", true],
  ["&fixture=sprout", "sprout", "(() => { const p = " + S + ".plants || []; return { ok: p.length >= 3 && ['seed','sprout','sapling'].every(k => p.some(q => q.stage === k)) && " + sel + ", stages: p.map(q => q.stage) } })()", true],
  ["&fixture=cache", "cache", "(() => { const it = " + S + ".items.find(i => i.id === GS.app.selected); const pile = it ? GS.Cache.itemsAt(" + S + ", it.x, it.y).map(i => i.material + (i.dried ? '(dried)' : '')) : []; return { ok: !!it && pile.length === 3 && pile.includes('rotten') && " + sel + ", pile } })()", true],
  ["&fixture=lightning", "lightning", "(() => { const b = " + S + ".bodies.find(q => q.id === GS.app.selected); return { ok: !!b && " + sel + ", body: b && b.species, cooked: b && b.cooked } })()", true],
  ["&fixture=lightning&species=scavenger", "lightning_dog", "({ ok: " + sel + " })", false],
  ["&fixture=lightning&species=wolves", "lightning_wolf", "({ ok: " + sel + " })", false],
  ["&fixture=history", "history", "(() => { const t = document.querySelector('#info-body') ? document.querySelector('#info-body').textContent : ''; return { ok: / & /.test(t) && /Back/.test(t), pairView: / & /.test(t) } })()", true],
].concat(["fight", "dog", "flee", "corpse", "lone", "spawn"].map(k => ["&fixture=wolves&kind=" + k, "wolves_" + k,
  "(() => { const w = " + S + ".animals.filter(a => a.species === 'wolves'); return { ok: " + (k === "spawn" ? "w.length === 0" : "w.length > 0") + ", wolves: w.length } })()", k === "fight"]))
 .concat(["meadow", "wet", "rain", "nearwater", "shore", "sand", "cold", "woods"].map(k => ["&fixture=fire&kind=" + k, "fire_" + k,
  "(() => { const e = " + S + ".fireStats.events.filter(q => q.fixture === '" + k + "').pop(); return { ok: !!e" + (k === "sand" ? " && e.tiles === 0" : " && e.tiles >= 1") + ", tiles: e && e.tiles, burning: Object.keys(" + S + ".fire).length } })()", k === "meadow"]));
const textMin = "(() => { let m = 99, at = ''; for (const e of document.querySelectorAll('body *')) { if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue; if (/^(SCRIPT|STYLE|CANVAS|svg|path)$/i.test(e.tagName)) continue; const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue; const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; const f = parseFloat(getComputedStyle(e).fontSize); if (f < m) { m = f; at = e.tagName + '.' + e.className + ' ' + e.textContent.trim().slice(0, 30); } } return { m, at }; })()";
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const HP = srv.address().port, base = "http://127.0.0.1:" + HP + "/index.html";
  ch = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore", detached: true });
  let port; for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = +fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch (e) {} }
  let fail = 0, pass = 0; const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (x !== undefined ? "  " + JSON.stringify(x) : "")); if (!c) fail++; else pass++; };
  for (const [W, H, mobile] of [[1366, 768, false], [390, 844, true]]) {
    const tag = mobile ? "phone_390x844" : "desktop_1366x768";
    const t = await (await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" })).json();
    const sock = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => sock.onopen = r);
    let id = 0; const pend = {}, errs = [];
    sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result || d); delete pend[d.id]; }
      if (d.method === "Runtime.consoleAPICalled" && (d.params.type === "error" || (d.params.type === "warning" && /fail/i.test(JSON.stringify(d.params.args))))) errs.push("console." + d.params.type + ": " + d.params.args.map(a => a.value || a.description).join(" "));
      if (d.method === "Runtime.exceptionThrown") errs.push("exception: " + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text));
      if (d.method === "Log.entryAdded" && d.params.entry.level === "error" && !/favicon/.test(d.params.entry.url || "")) errs.push("log: " + d.params.entry.text + " " + (d.params.entry.url || "")); };
    const cmd = (method, params = {}) => new Promise(r => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
    const ev = async e => { const r = await cmd("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) errs.push("eval: " + e.slice(0, 60) + " -> " + (r.exceptionDetails.exception || {}).description); return r.result && r.result.value; };
    const shot = async n => { const f = out + tag + "_" + n + ".png"; fs.writeFileSync(f, Buffer.from((await cmd("Page.captureScreenshot", { format: "png" })).data, "base64")); console.log("  screenshot " + f); };
    await cmd("Runtime.enable"); await cmd("Log.enable"); await cmd("Page.enable");
    await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile });
    if (mobile) await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    let minText = 99;
    for (const [q, k, st, sh] of pages) {
      await cmd("Page.navigate", { url: base + "?seed=3871" + q }); await sleep(2500);
      check(await ev("!!(window.GS && GS.app && GS.app.sim && GS.data.config.saveVersion === 38 && GS.app.sim.version === 38)"), tag + " " + k + ": loads v38");
      const r = await ev(st); check(r && r.ok, tag + " " + k + ": fixture scene present", r);
      if (sh) await shot(k);
      if (k === "sprout" || k === "cache" || k === "hut" || k === "hut_tiers") {   // a close-up of the fixture tiles (canvas fits the map): sprouts / pile / hut sprite visible
        const box = await ev("(() => { const s = GS.app.sim, cv = document.getElementById('cv').getBoundingClientRect(), w = s.world.w, tp = cv.width / w; let pts = " +
          "'" + k + "' === 'sprout' ? (s.plants || []).map(p => [p.x, p.y]) : '" + k + "' === 'cache' ? s.items.filter(i => i.id === GS.app.selected).map(i => [i.x, i.y]) : GS.Hut.huts(s).map(h => h.tiles[0]);" +
          " const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs) - 3, y0 = Math.min(...ys) - 3, x1 = Math.max(...xs) + 4, y1 = Math.max(...ys) + 4;" +
          " return { x: cv.left + x0 * tp, y: cv.top + y0 * tp, width: (x1 - x0) * tp, height: (y1 - y0) * tp, scale: 3 }; })()");
        if (box) { const f = out + tag + "_" + k + "_closeup.png"; fs.writeFileSync(f, Buffer.from((await cmd("Page.captureScreenshot", { format: "png", clip: box, captureBeyondViewport: true })).data, "base64")); console.log("  screenshot " + f); } }
      await ev("(() => { for (let i = 0; i < 60; i++) GS.Sim.step(GS.app.sim); GS.UI.update(GS.app); })()"); await sleep(300);
      const tx = await ev(textMin); minText = Math.min(minText, tx.m); check(tx.m >= 16, tag + " " + k + ": every visible text >= 16px", tx);
    }
    // 37.2 -> 38 migration: a real v37.2 save in localStorage, boot without ?seed (loads the save)
    await cmd("Page.navigate", { url: base + "?seed=1" }); await sleep(1500);
    await ev("(() => { GS.app.save = () => true; localStorage.clear(); localStorage.setItem(GS.data.config.saveKey, " + JSON.stringify(save372) + "); return true; })()");
    await cmd("Page.navigate", { url: base }); await sleep(2500);
    const mg = await ev("(() => { const s = GS.app.sim, C = GS.data.config, huts = GS.Hut.huts(s), m = s.items.find(i => i.material === 'meat' && i.stashedBy); return { version: s.version, tick: s.tick, people: s.agents.length, huts: huts.length, hutDur: huts.map(h => h.dur), fearOk: s.agents.every(a => a.wolfFear >= C.wolfFear.baseline), caches: s.agents.reduce((n, a) => n + (a.caches || []).length, 0), meatSrc: m && m.src && m.src.k, meatSpoil: m && m.spoilAt, plants: Array.isArray(s.plants) } })()");
    check(mg && mg.version === 38 && mg.tick === o372.tick && mg.people === o372.agents.length, tag + " migrate 37.2->38: the v37.2 save loads as v38, same tick and people", mg && { version: mg.version, tick: mg.tick, people: mg.people });
    check(mg && mg.huts > 0 && mg.hutDur.every(d => d === 100) && mg.fearOk && mg.caches === 1 && mg.meatSrc === "stockpile" && mg.plants, tag + " migrate 37.2->38: huts dur 100, wolf fear >= baseline, cache kept, meat src kept, plants added", mg);
    await shot("migrated");
    await ev("(() => { for (let i = 0; i < 60; i++) GS.Sim.step(GS.app.sim); GS.UI.update(GS.app); GS.app.save(false); })()"); await sleep(300);
    await cmd("Page.navigate", { url: base }); await sleep(2500);
    const rt = await ev("({ version: GS.app.sim.version, tick: GS.app.sim.tick, stored: JSON.parse(localStorage.getItem(GS.data.config.saveKey)).version })");
    check(rt && rt.version === 38 && rt.stored === 38 && rt.tick >= o372.tick + 60, tag + " migrated save round-trips as v38", rt);
    const tx = await ev(textMin); minText = Math.min(minText, tx.m); check(tx.m >= 16, tag + " migrated: every visible text >= 16px", tx);
    await ev("localStorage.clear()");
    console.log("  " + tag + " smallest visible text: " + minText + "px");
    check(errs.length === 0, tag + " 0 JS errors", errs);
    sock.close();
  }
  const ver = [...served].filter(u => /\.(js|css)$/.test(u.split("?")[0]) || /\.(js|css)\?/.test(u)), badV = ver.filter(u => !/\?v=38$/.test(u));
  check(missing.length === 0, "no missing files (404s)", missing);
  check(ver.length > 0 && badV.length === 0, "every loaded js/css carries ?v=38", { loaded: ver.length, bad: badV });
  console.log(pass + " PASS, " + fail + " FAIL"); try { process.kill(-ch.pid); } catch (e) {} srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { process.kill(-ch.pid); } catch (x) {} process.exit(1); });
