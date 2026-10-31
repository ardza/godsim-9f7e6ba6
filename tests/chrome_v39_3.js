// v39.3 Chrome = chrome_v39_2 at ?v=39.3 + the People-card click check (v39.3 fix: cards updated in place, no rebuild under a press).
// v39.2 Chrome: the "Colony console" desktop / laptop UI (direction C) at 1366x768 and 1920x1080; the phone (390x844) keeps its v39.1 layout.
// Phone: the person card floats over the sheet panels, the zoom buttons and the picker's spot as in v39.1 (the picker draws on top), so only
// those pairs are exempt there. Per size: loads (saveVersion 39, art 39.3); no overlap between the docked panels, the tab bar, the inspector and the HUD / colonist bar;
// Powers closed by default, opens and closes (tab, Esc, another tab), Rain still opens the strength picker; the inspector shows the
// person picked from a People card (cards are hit-testable, not covered); speed controls work; hit targets >= 44px, text >= 14px
// (phone >= 16px as in v39.1); 0 JS errors. Once: the v39 save fixture (tests/fixtures/save_v39.json) still loads.
// Overall: 0 missing files, every loaded js / css / png / ttf carries ?v=39.3.
// Run: node --experimental-websocket tests/chrome_v39_3.js   (screenshots -> /workspace/godsim-previews/v39_3/, all at 10:00, daytime)
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = "/workspace/godsim-previews/v39_3/"; fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ttf": "font/ttf" };
const missing = [], served = new Set();
const srv = http.createServer((q, s) => { const u = q.url.split("?")[0], f = path.join(root, decodeURIComponent(u)); fs.readFile(f, (e, b) => { if (e) { if (!/favicon/.test(q.url)) missing.push(q.url); s.writeHead(404); s.end(); return; } served.add(u + (q.url.includes("?") ? "?" + q.url.split("?")[1] : "")); s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); s.end(b); }); });
const prof = fs.mkdtempSync("/tmp/godsim393-"); let ch;
const VIS = "const vis = e => { if (!e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };" +
  "const box = e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };" +
  "const over = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;" +
  "const $ = id => document.getElementById(id);" +
  "const inView = b => b.l >= -1 && b.t >= -1 && b.r <= innerWidth + 1 && b.b <= innerHeight + 1;";
// the docked pieces that must not overlap each other (whichever are on screen)
const LAYOUT = "(() => { " + VIS + " const phone = !GS.UI.console(); const ids = ['info', 'panelbar', 'logwrap', 'panel-discoveries', 'panel-prayers', 'panel-people', 'powers', 'hud', 'speeds', 'zoom', 'spawnpick'];" +
  " const sh = {}; for (const id of ids) { const e = $(id); if (vis(e)) sh[id] = box(e); }" +
  " if (vis(document.querySelector('#top .grp'))) sh.world = box(document.querySelector('#top .grp'));" +
  " const pairs = []; const k = Object.keys(sh); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i], b = k[j];" +
  "  if ((a === 'hud' && b === 'speeds') || (a === 'speeds' && b === 'hud')) continue;" +   // both live inside the one top-right widget
  "  if (phone && (a === 'info' || b === 'info') && /^(logwrap|panel-|zoom|spawnpick)/.test(a === 'info' ? b : a)) continue;" +   // both live inside the one top-right widget
  "  if (over(sh[a], sh[b])) pairs.push(a + ' x ' + b); }" +
  " const off = k.filter(id => !inView(sh[id]));" +
  " return { shown: k, overlaps: pairs, offscreen: off, boxes: sh }; })()";
const SIZES = "(() => { " + VIS + " const btns = [...document.querySelectorAll('button, summary, input')].filter(e => vis(e) && !e.closest('#files') && !e.closest('#info-body .plog'));" +
  " const small = btns.map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.className || e.tagName, w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => Math.min(x.w, x.h) < 44);" +
  " const txt = [...document.querySelectorAll('body *')].filter(e => vis(e) && !e.closest('svg') && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));" +
  " let min = 99, at = ''; for (const e of txt) { const f = parseFloat(getComputedStyle(e).fontSize); if (f < min) { min = f; at = (e.id || e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 30); } }" +
  " return { small: small.slice(0, 8), nSmall: small.length, minText: min, at }; })()";
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const HP = srv.address().port, base = "http://127.0.0.1:" + HP + "/index.html";
  ch = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore", detached: true });
  let port; for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = +fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch (e) {} }
  let fail = 0, pass = 0; const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (x !== undefined ? "  " + JSON.stringify(x) : "")); if (!c) fail++; else pass++; };
  for (const [W, H, mobile] of [[1366, 768, false], [1920, 1080, false], [390, 844, true]]) {
    const tag = (mobile ? "phone_" : "desktop_") + W + "x" + H, desk = !mobile;
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
    const click = async sel => { await ev("(() => { const e = document.querySelector('" + sel + "'); if (e) e.click(); return !!e; })()"); await sleep(350); };
    // a real pointer click at the centre of the element (proves nothing covers it); on the phone a tap
    const press = async sel => { const c = await ev("(() => { const e = document.querySelector('" + sel + "'); if (!e) return null; const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y); return { x, y, hit: !!h && (h === e || e.contains(h)) }; })()");
      if (!c) return { hit: false }; if (mobile) { await cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] }); await cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
      else { await cmd("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y }); await cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 }); await cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 }); }
      await sleep(350); return c; };
    const key = async k => { await cmd("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k === "Escape" ? "Escape" : "Digit" + k, windowsVirtualKeyCode: k === "Escape" ? 27 : 48 + +k }); await cmd("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k === "Escape" ? "Escape" : "Digit" + k, windowsVirtualKeyCode: k === "Escape" ? 27 : 48 + +k }); await sleep(250); };
    await cmd("Runtime.enable"); await cmd("Log.enable"); await cmd("Page.enable");
    await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile });
    if (mobile) await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cmd("Page.navigate", { url: base + "?seed=3871" }); await sleep(1500);
    await ev("localStorage.clear(); true"); await cmd("Page.reload"); await sleep(2500);   // fresh prefs: the default layout
    check(await ev("!!(window.GS && GS.app && GS.app.sim && GS.data.config.saveVersion === 39 && GS.app.sim.version === 39 && String(GS.data.artVersion) === '39.3')"), tag + ": loads (saveVersion 39, art 39.3)");
    check(await ev("document.fonts.check('500 15px \"Barlow Semi Condensed\"') && document.fonts.check('700 15px \"Barlow Condensed\"') && [...document.fonts].some(f => /Barlow/.test(f.family) && f.status === 'loaded')"), tag + ": bundled Barlow fonts load");
    check(await ev("GS.UI.console() === " + desk), tag + ": console layout " + (desk ? "on" : "off (v39.1 phone layout)"));
    // a lived-in world at 10:00 (daytime), paused
    await ev("(() => { const s = GS.app.sim; for (let i = 0; i < 2400; i++) GS.Sim.step(s); for (let i = 0; i < 1440 && GS.Time.at(s.tick).hour !== 10; i++) GS.Sim.step(s); GS.app.setSpeed(0); GS.UI.update(GS.app); return GS.Time.at(s.tick).hour; })()"); await sleep(300);
    let st = await ev("(() => { " + VIS + " return { pw: vis($('powers')), tab: vis($('ptab-powers')), exp: $('ptab-powers').getAttribute('aria-expanded'), panel: GS.UI.panel, hud: vis($('hud')), clock: vis($('clock')), cards: [...document.querySelectorAll('#panel-people .pp-row')].filter(vis).length, hudText: vis($('hud')) ? $('hud').textContent : '' }; })()");
    check(!st.pw && st.tab && st.exp === "false", tag + ": Powers is closed by default, its tab is in the bar", st);
    if (desk) {
      check(st.hud && !st.clock && /\d+:\d\d/.test(st.hudText) && /°F/.test(st.hudText) && /Clear|Rain/.test(st.hudText), tag + ": HUD shows season / day / time / temperature / weather / population (one-line clock hidden)", st.hudText);
      check(st.panel === "people" && st.cards >= 2, tag + ": the colonist bar (People cards) is up by default", { panel: st.panel, cards: st.cards });
    } else check(!st.hud && st.clock && st.panel === "log", tag + ": phone keeps the v39.1 clock and default Log panel", { hud: st.hud, clock: st.clock, panel: st.panel });
    let L = await ev(LAYOUT); check(L.overlaps.length === 0 && L.offscreen.length === 0, tag + ": default layout, nothing overlaps or runs off screen", L);
    await shot("default");
    // pick a person from a People card (phones open the People tab first)
    if (mobile) { await press("#ptab-people"); }
    const card = await ev("(() => { " + VIS + " const b = [...document.querySelectorAll('#panel-people .pp-row')].filter(vis)[1]; if (!b) return null; b.id = 'pp-test'; return { pid: +b.dataset.pid, name: b.querySelector('b').textContent.trim() }; })()");
    const pr = await press("#pp-test");
    st = await ev("(() => { " + VIS + " const a = GS.app.sim.agents.find(q => q.id === GS.app.selected); return { sel: GS.app.selected, info: vis($('info')), name: a ? a.name : null, card: $('info-body').textContent.slice(0, 60) }; })()");
    check(card && pr.hit && st.sel === card.pid && st.info && st.card.indexOf(st.name) >= 0, tag + ": a People card is clickable (not covered) and the inspector shows that person", { card, hit: pr.hit, st });
    L = await ev(LAYOUT); check(L.overlaps.length === 0 && L.offscreen.length === 0, tag + ": people + inspector, nothing overlaps", L);
    let S = await ev(SIZES); check(S.nSmall === 0 && S.minText >= (desk ? 14 : 16), tag + ": hit targets >= 44px, text >= " + (desk ? 14 : 16) + "px", S);
    await shot("people_inspect");
    // the other panels next to the inspector (desktop: docked bottom-right)
    for (const p of ["log", "discoveries", "prayers"]) { await click("#ptab-" + p); L = await ev(LAYOUT);
      check(L.overlaps.length === 0 && L.offscreen.length === 0 && L.shown.indexOf(p === "log" ? "logwrap" : "panel-" + p) >= 0, tag + ": " + p + " open" + (desk ? " with the inspector" : "") + ", nothing overlaps", L); }
    if (desk) { S = await ev(SIZES); check(S.nSmall === 0 && S.minText >= 14, tag + ": prayers + inspector, hit targets >= 44px, text >= 14px", S); }
    await click("#ptab-prayers");   // close it again
    if (desk) { await click("#ptab-people"); }
    // Powers: open from the tab, Esc closes; open again, closes the open panel (console); another tab closes it; picking a power closes it
    const pws = "(() => { " + VIS + " return { open: vis($('powers')), exp: $('ptab-powers').getAttribute('aria-expanded'), panel: GS.UI.panel, info: vis($('info')), cats: [...document.querySelectorAll('#powers .pw-cat')].filter(vis).length, pick: vis($('spawnpick')) }; })()";
    let pt = await press("#ptab-powers"); st = await ev(pws);
    check(pt.hit && st.open && st.exp === "true", tag + ": the Powers tab opens the menu", st);
    if (desk) check(st.panel === null && !st.info && st.cats >= 3, tag + ": the open Powers menu (category columns) closes the colonist bar and sets the inspector aside", st);
    L = await ev(LAYOUT); check(L.overlaps.length === 0 && L.offscreen.length === 0, tag + ": Powers open, nothing overlaps (menu above the tab bar)", L);
    S = await ev(SIZES); check(S.nSmall === 0 && S.minText >= (desk ? 14 : 16), tag + ": Powers open, hit targets >= 44px, text >= " + (desk ? 14 : 16) + "px", S);
    await shot("powers_open");
    await key("Escape"); st = await ev(pws); check(!st.open && st.exp === "false" && st.info, tag + ": Esc closes Powers, the inspector is back", st);
    if (desk) { await press("#ptab-powers"); await press("#ptab-log"); st = await ev(pws);
      check(!st.open && st.panel === "log", tag + ": another tab closes Powers and opens its panel", st); }
    await press("#ptab-powers"); st = await ev(pws); check(st.open && (desk ? st.panel === null : true), tag + ": Powers re-opens" + (desk ? " (Log closed)" : ""), st);
    await press("#power-rain"); st = await ev(pws); check(!st.open && st.pick, tag + ": Rain closes the menu and opens the strength picker", st);
    L = await ev(LAYOUT); check(L.overlaps.length === 0 && L.offscreen.length === 0, tag + ": the rain picker sits clear of everything", L);
    const rm = await press("#rain-medium");
    let armed = await ev("({ power: GS.UI.power, str: GS.UI.rainStr, armed: document.getElementById('ptab-powers').classList.contains('armed') })");
    armed.hit = rm.hit; check(armed.power === "rain" && armed.str === "medium" && armed.armed && rm.hit, tag + ": Medium rain is armed from an uncovered picker button (tab highlighted)", armed);
    await key("Escape"); armed = await ev("({ power: GS.UI.power, armed: document.getElementById('ptab-powers').classList.contains('armed') })");
    check(!armed.power && !armed.armed, tag + ": Esc cancels the armed power", armed);
    // speed controls: every button, by pointer, then the number keys
    const sp = await ev("GS.data.config.time.speeds"); const got = [];
    for (const s of sp.slice(1).concat([0])) { const h = await press("#speed-" + s); got.push(await ev("({ want: " + s + ", speed: GS.app.speed, on: document.getElementById('speed-" + s + "').classList.contains('on'), hit: " + h.hit + " })")); }
    check(got.every(g => g.speed === g.want && g.on && g.hit), tag + ": speed buttons work (and are not covered)", got);
    await key("2"); const k2 = await ev("GS.app.speed"); await key("0"); const k0 = await ev("GS.app.speed");
    check(k2 === sp[2] && k0 === 0, tag + ": number keys still set the speed", { k2, k0 });
    if (desk && W === 1366) {   // the v39 save still loads into the console
      const r = await ev("fetch('tests/fixtures/save_v39.json?v=39.3').then(r => r.text()).then(t => { localStorage.setItem(GS.data.config.saveKey, t); const ok = GS.app.load(); " + VIS + " return { ok, ver: GS.app.sim.version, tick: GS.app.sim.tick, n: GS.app.sim.agents.length, hud: $('hud').textContent, cards: document.querySelectorAll('#panel-people .pp-row').length }; })");
      check(r && r.ok && r.ver === 39 && r.tick === 2880 && r.n > 0 && /°F/.test(r.hud), tag + ": tests/fixtures/save_v39.json loads (v39 save, tick 2880) and the HUD follows it", r);
      await ev("(() => { for (let i = 0; i < 60; i++) GS.Sim.step(GS.app.sim); GS.UI.update(GS.app); return true; })()");
    }
    if (desk) {   // v39.3: 40 human-speed clicks (120 ms press -> release) on People cards each select that person: paused, then running at 1x
      await cmd("Page.navigate", { url: base + "?seed=3871&t=" + Date.now() }); await sleep(2500);
      await ev("(() => { const s = GS.app.sim; for (let i = 0; i < 2400; i++) GS.Sim.step(s); GS.app.setSpeed(0); if (GS.UI.panel !== 'people') { GS.UI.panel = 'people'; } GS.UI.update(GS.app); return 1; })()"); await sleep(1200);
      const pids = await ev("[...document.querySelectorAll('#panel-people .pp-row')].slice(0, 4).map(b => +b.dataset.pid)");
      const idle = await ev("new Promise(r => { const a = [GS.UI.ppRebuilds || 0, GS.UI.ppUpdates || 0]; let m = 0; const o = new MutationObserver(l => { m += l.length; }); o.observe(document.getElementById('panel-people'), { subtree: true, childList: true, attributes: true, characterData: true }); setTimeout(() => { o.disconnect(); r({ rebuilds: (GS.UI.ppRebuilds || 0) - a[0], updates: (GS.UI.ppUpdates || 0) - a[1], mutations: m }); }, 3000); })");
      check(idle.rebuilds === 0 && idle.updates === 0 && idle.mutations === 0, tag + ": paused, the People cards are not touched for 3 s (no rebuild, no update, 0 DOM mutations)", idle);
      for (const run of [0, 1]) {
        await ev("GS.app.setSpeed(" + run + "); true");
        const r0 = await ev("GS.UI.ppRebuilds || 0"); let ok = 0, miss = 0, wrong = 0; const N = 40;
        for (let i = 0; i < N; i++) { const want = pids[i % pids.length];
          const c = await ev("(() => { GS.app.selected = null; const b = document.querySelector('#panel-people .pp-row[data-pid=\"" + want + "\"]'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()");
          if (!c) { miss++; continue; }
          await cmd("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
          await cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 }); await sleep(120);
          await cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 }); await sleep(250 + (i * 37) % 300);
          const s = await ev("GS.app.selected"); if (s === want) ok++; else if (s == null) miss++; else wrong++; }
        const rb = (await ev("GS.UI.ppRebuilds || 0")) - r0;
        check(ok === N, tag + ": " + N + " human-speed clicks on People cards (" + (run ? "running 1x" : "paused") + ") each select that person", { ok, miss, wrong, N, pids, rebuilds: rb });
      }
      await ev("GS.app.setSpeed(0); true");
    }
    check(errs.length === 0, tag + ": 0 JS errors", errs);
    sock.close();
  }
  const assetRe = /\.(js|css|png|ttf)$/, ver = [...served].filter(u => assetRe.test(u.split("?")[0])), badV = ver.filter(u => !/\?v=39\.3$/.test(u));
  check(missing.length === 0, "0 missing files (404s)", missing);
  check(ver.length > 0 && badV.length === 0 && ver.some(u => /\.ttf/.test(u)), "every loaded js / css / png / ttf carries ?v=39.3", { loaded: ver.length, bad: badV.slice(0, 5) });
  console.log(pass + " PASS, " + fail + " FAIL"); try { process.kill(-ch.pid); } catch (e) {} srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { process.kill(-ch.pid); } catch (x) {} process.exit(1); });
