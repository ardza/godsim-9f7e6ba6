// v39.1 Chrome: desktop 1366x768 + phone 390x844.
// (a) Powers is a bottom-bar tab on every layout: hidden until its tab is opened, then shown clear of the inspect card and the tab bar;
//     the tab closes it again; picking a power still works (Rain -> strength picker -> armed, tab highlighted).
// (b) rain on the inspected person shows on her card ("in the rain", wet / soaked).
// Per device: 0 JS errors. Overall: 0 missing files, every js / css / png request carries ?v=39.1.
// Run: node --experimental-websocket tests/chrome_v39_1.js   (screenshots -> /workspace/godsim-previews/v39_1/)
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = process.env.SHOT_DIR || "/workspace/godsim-previews/v39_1/"; fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const missing = [], served = new Set();
const srv = http.createServer((q, s) => { const u = q.url.split("?")[0], f = path.join(root, decodeURIComponent(u)); fs.readFile(f, (e, b) => { if (e) { if (!/favicon/.test(q.url)) missing.push(q.url); s.writeHead(404); s.end(); return; } served.add(u + (q.url.includes("?") ? "?" + q.url.split("?")[1] : "")); s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); s.end(b); }); });
const prof = fs.mkdtempSync("/tmp/godsim391-"); let ch;
// is an element really on screen (displayed, visible, has area, inside the viewport)?
const VIS = "const vis = e => { if (!e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };" +
  "const box = e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };" +
  "const over = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;";
const state = "(() => { " + VIS + " const pw = document.getElementById('powers'), tab = document.getElementById('ptab-powers'), info = document.getElementById('info'), bar = document.getElementById('panelbar');" +
  " const P = box(pw), I = box(info), B = box(bar), tr = tab.getBoundingClientRect();" +
  " return { open: vis(pw), tab: vis(tab), tabMin: Math.round(Math.min(tr.width, tr.height)), expanded: tab.getAttribute('aria-expanded'), infoShown: vis(info), overInfo: vis(pw) && vis(info) && over(P, I), overBar: vis(pw) && P.b > B.t + 1, powers: P, info: I, bar: B," +
  " btns: [...pw.querySelectorAll('button')].filter(vis).length, minBtn: Math.min(999, ...[...pw.querySelectorAll('button')].filter(vis).map(e => { const r = e.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }))," +
  " minText: Math.min(99, ...[...pw.querySelectorAll('*')].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize))) }; })()";
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
    const click = async sel => { await ev("(() => { const e = document.querySelector('" + sel + "'); if (e) e.click(); return !!e; })()"); await sleep(450); };
    await cmd("Runtime.enable"); await cmd("Log.enable"); await cmd("Page.enable");
    await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile });
    if (mobile) await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cmd("Page.navigate", { url: base + "?seed=3871" }); await sleep(2500);
    check(await ev("!!(window.GS && GS.app && GS.app.sim && GS.data.config.saveVersion === 39 && GS.app.sim.version === 39 && String(GS.data.artVersion) === '39.2')"), tag + ": loads (saveVersion 39, art ?v=39.2; v39.2 retarget)");
    await ev("(() => { GS.app.setSpeed(0); return true; })()");
    let s = await ev(state);
    check(!s.open && s.tab && s.expanded === "false", tag + ": Powers is closed by default, its tab is in the bottom bar", { open: s.open, tab: s.tab, expanded: s.expanded });
    check(s.tabMin >= 44, tag + ": Powers tab >= 44px", s.tabMin);
    await shot("start_closed");
    // inspect a person: the card shows; Powers still closed
    await ev("(() => { const a = GS.app.sim.agents[0]; GS.app.select(a.id); GS.UI.update(GS.app); return true; })()"); await sleep(400);
    s = await ev(state); check(s.infoShown && !s.open, tag + ": inspect card open, Powers still hidden", { info: s.infoShown, open: s.open });
    await shot("card_closed");
    // open Powers from its tab
    await click("#ptab-powers"); s = await ev(state);
    check(s.open && s.expanded === "true" && s.btns >= 4, tag + ": tapping the tab opens Powers", { open: s.open, expanded: s.expanded, buttons: s.btns });
    check(!s.overInfo, tag + ": open Powers does not overlap the inspect card", { powers: s.powers, info: s.info, infoShown: s.infoShown });
    check(!s.overBar, tag + ": open Powers sits above the tab bar", { powers: s.powers, bar: s.bar });
    check(s.minBtn >= 44 && s.minText >= (mobile ? 16 : 14), tag + ": power buttons >= 44px, text >= " + (mobile ? 16 : 14) + "px (v39.2 console: 14px)", { minBtn: s.minBtn, minText: s.minText });
    await shot("card_powers_open");
    // tap the tab again: closes
    await click("#ptab-powers"); s = await ev(state);
    check(!s.open && s.expanded === "false" && s.infoShown, tag + ": tapping the tab again closes Powers, the inspect card is back", { open: s.open, info: s.infoShown });
    // the powers still work: open, Rain -> picker (menu closes, as on phones), Medium -> armed; tab highlighted
    await click("#ptab-powers"); await click("#power-rain");
    const pk = await ev("(() => { " + VIS + " return { pick: vis(document.getElementById('spawnpick')), open: vis(document.getElementById('powers')) }; })()");
    check(pk.pick, tag + ": Rain opens the strength picker", pk);
    await click("#rain-medium");
    const armed = await ev("({ power: GS.UI.power, str: GS.UI.rainStr, armed: document.getElementById('ptab-powers').classList.contains('armed'), aiming: document.getElementById('cv').classList.contains('aiming') })");
    check(armed.power === "rain" && armed.str === "medium" && armed.armed && armed.aiming, tag + ": Medium rain is armed, waiting for the map tap (tab highlighted)", armed);
    // cast it on the inspected person (as the map tap would) and run 2 game hours: her card shows the rain / wetness
    await ev("(() => { const s = GS.app.sim, a = s.agents.find(q => q.id === GS.app.selected); GS.Powers.cast(s, 'rain', Math.round(a.pos.x), Math.round(a.pos.y), 'medium'); GS.UI.power = null; GS.UI.updatePowers(GS.app);" +
      " const e = s.powers.effects.find(q => q.k === 'rain'); e.r = 300; for (let i = 0; i < 120; i++) { GS.Sim.step(s); a.pos = a.pos; } GS.UI.update(GS.app); return true; })()"); await sleep(500);
    const card = await ev("(() => { const a = GS.app.sim.agents.find(q => q.id === GS.app.selected), t = document.getElementById('info-body').textContent; return { wet: Math.round(a.wet || 0), rain: /in the rain/.test(t), wetWord: /, (damp|wet|soaked)/.test(t), feels: (t.match(/feels like[^\\n]*?(?=[A-Z][a-z]+:|$)/) || [''])[0].slice(0, 120) }; })()");
    check(card.wet > 0 && card.rain && card.wetWord, tag + ": card shows 'in the rain' and how wet she is", card);
    await shot("rain_card");
    check(errs.length === 0, tag + " 0 JS errors", errs);
    sock.close();
  }
  const assetRe = /\.(js|css|png)$/, ver = [...served].filter(u => assetRe.test(u.split("?")[0])), badV = ver.filter(u => !/\?v=39\.2$/.test(u));
  check(missing.length === 0, "0 missing files (404s)", missing);
  check(ver.length > 0 && badV.length === 0, "every loaded js / css / png carries ?v=39.2 (v39.2 retarget)", { loaded: ver.length, bad: badV.slice(0, 5) });
  console.log(pass + " PASS, " + fail + " FAIL"); try { process.kill(-ch.pid); } catch (e) {} srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { process.kill(-ch.pid); } catch (x) {} process.exit(1); });
