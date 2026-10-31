// v39 Chrome smoke: desktop 1366x768 + phone 390x844. Plain load + every v39 fixture (?fixture=v39&kind=fiber|bow|spar|wolf|hut|beds).
// Per page: loads v39, the fixture's scene is there, the new art was really drawn (GS.Render.last* / *Drawn counters), the new UI is on screen
// (Skills tab, wolf Memory card, Discoveries icons), every visible text >= 16px, tabs / panel buttons >= 44px, 60 game minutes run.
// Per device: 0 JS errors. Overall: 0 missing files (404s), every new v39 art sheet requested and every js / css / png request carries ?v=39.
// Run: node --experimental-websocket tests/chrome_v39.js   (screenshots -> /workspace/godsim-previews/v39/)
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = "/workspace/godsim-previews/v39/"; fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const missing = [], served = new Set();
const srv = http.createServer((q, s) => { const u = q.url.split("?")[0], f = path.join(root, decodeURIComponent(u)); fs.readFile(f, (e, b) => { if (e) { if (!/favicon/.test(q.url)) missing.push(q.url); s.writeHead(404); s.end(); return; } served.add(u + (q.url.includes("?") ? "?" + q.url.split("?")[1] : "")); s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" }); s.end(b); }); });
const prof = fs.mkdtempSync("/tmp/godsim39-"); let ch;
const S = "GS.app.sim", R = "GS.Render", body = "(document.querySelector('#info-body') ? document.querySelector('#info-body').textContent : '')";
// [query, label, state check after one render (JS expression returning {ok, ...}), closeup points expression]
const pages = [
  ["", "plain", "({ ok: " + S + ".agents.length > 0 && (" + S + ".reedBeds || []).length > 0 && " + R + ".bedsDrawn > 0, people: " + S + ".agents.length, beds: " + R + ".bedsDrawn })", null],
  ["&fixture=v39&kind=fiber", "fiber", "(() => { const s = " + S + ", it = s.items; return { ok: it.some(i => i.material === 'reed' && i.soaked) && it.some(i => i.material === 'fiber' && i.form === 'bundle') && it.some(i => i.material === 'fiber' && i.form === 'cord' && i.heldBy == null) && ['layer_1', 'layer_2', 'layer_3', 'worn'].every(f => " + R + ".seen.wrap[f]) && /Fighting skills/.test(" + body + ") && /fiber wrap/.test(" + body + "), wrapFrames: Object.keys(" + R + ".seen.wrap), wraps: s.agents.filter(a => a.wearingWrap).length, skillsTab: /Fighting skills/.test(" + body + ") } })()", "[[GS.Spar._fx.at.x, GS.Spar._fx.at.y]]"],
  ["&fixture=v39&kind=bow", "bow", "(() => { const s = " + S + "; return { ok: s.agents.filter(a => { const h = GS.Items.held(s, a); return h && h.tool === 'bow'; }).length >= 3 && ['strung', 'unstrung', 'draw'].every(f => " + R + ".seen.bow[f]) && " + R + ".flightsDrawn > 0 && s.bodies.some(b => b.arrows && b.arrows.length) && /strung bow/.test(" + body + "), bowFrames: Object.keys(" + R + ".seen.bow), flights: " + R + ".flightsDrawn, missed: s.items.filter(i => i.missed).length } })()", "[[GS.Spar._fx.at.x, GS.Spar._fx.at.y]]"],
  ["&fixture=v39&kind=spar", "spar", "(() => { const s = " + S + ", sp = s.agents.filter(a => a.act.type === 'spar'), st = s.agents.filter(a => a.act.type === 'sparStance'); return { ok: sp.length >= 2 && st.length >= 1 && ['spar_0', 'spar_1', 'kid_spar_0'].every(f => Object.keys(" + R + ".seen.spar).some(k => k.startsWith(f))) && Object.keys(" + R + ".seen.spar).some(k => k.endsWith('_m')) && /Fighting skills/.test(" + body + "), sparring: sp.length, stance: st.length, sparFrames: Object.keys(" + R + ".seen.spar), kids: (GS.Spar._fx.kids || []).length } })()", "[[GS.Spar._fx.at.x, GS.Spar._fx.at.y]]"],
  ["&fixture=v39&kind=wolf", "wolf", "(() => { const s = " + S + ", w = s.animals.find(a => a.id === GS.app.selected); return { ok: !!w && GS.WolfMem.wounded(s, w) && " + R + ".lastWolfWounded === w.id && /Memory/.test(" + body + ") && /Caution/.test(" + body + ") && /limping/.test(" + body + ") && /nearly killed it/.test(" + body + "), wounded: w && GS.WolfMem.wounded(s, w), drawn: " + R + ".lastWolfWounded, card: " + body + ".slice(0, 160) } })()", "[[GS.Spar._fx.at.x, GS.Spar._fx.at.y]]"],
  ["&fixture=v39&kind=hut", "hut", "(() => { const h = GS.Hut.huts(" + S + ").filter(x => x.lashed); return { ok: h.length > 0 && " + R + ".lashedDrawn > 0, lashed: h.length, drawn: " + R + ".lashedDrawn } })()", "GS.Hut.huts(GS.app.sim).filter(h => h.lashed).map(h => h.tiles[0])"],
  ["&fixture=v39&kind=beds", "beds", "(() => { const B = " + S + ".reedBeds.slice(0, 4); return { ok: B.length === 4 && B[0].n === 0 && B[3].n === B[3].max && " + R + ".bedsDrawn >= 4, beds: B.map(b => b.n + '/' + b.max), drawn: " + R + ".bedsDrawn } })()", "GS.app.sim.reedBeds.slice(0, 4).map(b => [b.x, b.y])"],
];
// the v39 art sheets (new + the Artist's updated ones) that must be requested, each with ?v=39
const V39_ART = ["fiber_16", "wrap_worn_16", "bow_16", "arrow_16", "wolf_wounded_16", "spar_16", "reed_16", "reed_bank_16", "fx_16", "gesture_16", "child_gesture_16", "hut_tiers_16"].map(n => "/data/art/" + n + ".png");
const textMin = "(() => { let m = 99, at = ''; for (const e of document.querySelectorAll('body *')) { if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue; if (/^(SCRIPT|STYLE|CANVAS|svg|path)$/i.test(e.tagName)) continue; const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue; const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; const f = parseFloat(getComputedStyle(e).fontSize); if (f < m) { m = f; at = e.tagName + '.' + e.className + ' ' + e.textContent.trim().slice(0, 30); } } return { m, at }; })()";
const tapMin = "(() => { let m = 999, at = ''; for (const e of document.querySelectorAll('[data-ptab], #panelbar button')) { const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).display === 'none') continue; const v = Math.min(r.width, r.height); if (v < m) { m = v; at = (e.id || e.getAttribute('data-ptab') || e.textContent.trim()).slice(0, 20); } } return { m, at }; })()";
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
    const shot = async (n, clip) => { const f = out + tag + "_" + n + ".png"; fs.writeFileSync(f, Buffer.from((await cmd("Page.captureScreenshot", clip ? { format: "png", clip, captureBeyondViewport: true } : { format: "png" })).data, "base64")); console.log("  screenshot " + f); };
    await cmd("Runtime.enable"); await cmd("Log.enable"); await cmd("Page.enable");
    await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile });
    if (mobile) await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    let minText = 99, minTap = 999;
    for (const [q, k, st, pts] of pages) {
      await cmd("Page.navigate", { url: base + "?seed=3871" + q }); await sleep(2500);
      check(await ev("!!(window.GS && GS.app && GS.app.sim && GS.data.config.saveVersion === 39 && GS.app.sim.version === 39 && GS.data.artVersion === 39)"), tag + " " + k + ": loads v39");
      if (k !== "plain") await ev("(() => { const s = GS.app.sim, a = s.agents[0]; GS.Spar._fx = { at: { x: Math.round(a.pos.x) + 1, y: Math.round(a.pos.y) }, kids: s.agents.filter(q => q.act.type === 'spar' && GS.Family.isChild(q)).map(q => q.id) }; return true; })()");   // close-up centre: person 1 (the fixture puts its scene around her)
      if (k === "spar") { await ev("(() => { const s = GS.app.sim, F = GS.data.config.family || {}; const ad = s.agents.filter(q => q.act.type !== 'spar' && q.act.type !== 'sparStance' && !GS.Family.isChild(q)).slice(-2); if (ad.length < 2) return false; for (const q of ad) { q.age = 6; } if (!GS.Family.isChild(ad[0])) return 'age'; const a = GS.app.sim.agents[0]; ad[0].pos = { x: a.pos.x + 3, y: a.pos.y + 1 }; ad[1].pos = { x: a.pos.x + 4, y: a.pos.y + 1 }; GS.Spar.startBout(s, ad[0], ad[1]); ad[0].act.until = ad[1].act.until = s.tick + 1e6; GS.Spar._fx.kids = ad.map(q => q.id); return true; })()"); await sleep(1000); }   // seed 3871 starts with no children: two adults made 6 for the kid bout (test-only)
      if (k === "bow") { await ev("(() => { GS.data.config.render.arrowFlySec = 60; const a = GS.app.sim.agents[0]; GS.Bow.flight(GS.app.sim, a, a.pos.x + 4, a.pos.y - 1, false); return true; })()"); await sleep(400); }
      await sleep(300);
      const r = await ev(st); check(r && r.ok, tag + " " + k + ": fixture scene present and its v39 art drawn", r);
      await shot(k);
      if (pts) {   // a close-up of the fixture tiles (the canvas fits the map)
        const box = await ev("(() => { const s = GS.app.sim, cv = document.getElementById('cv').getBoundingClientRect(), tp = cv.width / s.world.w, P = " + pts + "; const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x0 = Math.max(0, Math.min(...xs) - 4), y0 = Math.max(0, Math.min(...ys) - 3), x1 = Math.max(...xs) + 5, y1 = Math.max(...ys) + 4;" +
          " return { x: cv.left + x0 * tp, y: cv.top + y0 * tp, width: (x1 - x0) * tp, height: (y1 - y0) * tp, scale: " + (mobile ? 4 : 3) + " }; })()");
        if (box) await shot(k + "_closeup", box); }
      if (k === "fiber") {   // Discoveries icons: two v39 firsts, then open the Discoveries panel
        await ev("(() => { const s = GS.app.sim, a = s.agents[0]; GS.Fiber.disc(s, a, 'fiber', ['reed', 'flint'], 'beat', 'First fiber'); GS.Fiber.disc(s, a, 'bow', ['stick', 'cord'], 'string', 'First bow'); GS.UI.panel = 'discoveries'; GS.UI.update(GS.app); return true; })()"); await sleep(400);
        const d = await ev("(() => { const ic = [...document.querySelectorAll('table.disc .disc-ico svg')].filter(e => e.getBoundingClientRect().width > 0); return { icons: ic.length, rows: document.querySelectorAll('table.disc tr').length } })()");
        check(d && d.icons >= 2, tag + " Discoveries: v39 firsts show their disc_* icons", d); await shot("discoveries");
        await ev("(() => { GS.UI.panel = 'log'; GS.UI.update(GS.app); return true; })()"); }
      await ev("(() => { for (let i = 0; i < 60; i++) GS.Sim.step(GS.app.sim); GS.UI.update(GS.app); })()"); await sleep(300);
      const tx = await ev(textMin); minText = Math.min(minText, tx.m); check(tx.m >= 16, tag + " " + k + ": every visible text >= 16px", tx);
      const tp = await ev(tapMin); minTap = Math.min(minTap, tp.m); check(tp.m >= 44, tag + " " + k + ": person tabs and panel buttons >= 44px", tp);
    }
    console.log("  " + tag + " smallest visible text: " + minText + "px, smallest tab / panel button: " + minTap + "px");
    check(errs.length === 0, tag + " 0 JS errors", errs);
    sock.close();
  }
  const assetRe = /\.(js|css|png)$/, ver = [...served].filter(u => assetRe.test(u.split("?")[0])), badV = ver.filter(u => !/\?v=39$/.test(u));
  const artV = V39_ART.map(f => ({ f, req: [...served].filter(u => u.split("?")[0] === f) })), artBad = artV.filter(x => !x.req.length || x.req.some(u => !/\?v=39$/.test(u)));
  check(artBad.length === 0, "all 12 new / updated v39 art sheets requested, each with ?v=39", artBad.length ? artBad : artV.map(x => x.req[0]));
  check(missing.length === 0, "0 missing files (404s)", missing);
  check(ver.length > 0 && badV.length === 0, "every loaded js / css / png carries ?v=39", { loaded: ver.length, bad: badV });
  console.log(pass + " PASS, " + fail + " FAIL"); try { process.kill(-ch.pid); } catch (e) {} srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { process.kill(-ch.pid); } catch (x) {} process.exit(1); });
