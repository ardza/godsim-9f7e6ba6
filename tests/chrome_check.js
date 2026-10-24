// Real headless Chrome check (pattern copied from the RPG's tests/chrome_check.js: own profile, DevTools port 0, http port 0, cleanup).
// Desktop 1280x800, phone 390x844 and phone landscape 844x390 (touch), on file:// and http. Run: node --experimental-websocket tests/chrome_check.js
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), shotDir = path.join(__dirname, "screenshots") + "/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const missing = [], GS_VERSION = (() => { const g = {}; require("vm").runInNewContext(require("fs").readFileSync(require("path").join(__dirname, "../data/config.js"), "utf8"), g); return g.GS.data.config.saveVersion; })(); // read from data/config.js
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { if (!/favicon/.test(q.url)) missing.push(q.url); s.writeHead(404); s.end(); } else { s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); s.end(b); } }); });
const prof = fs.mkdtempSync("/tmp/godsimchk-"); let ch = null;
const cleanup = () => { try { if (ch && ch.exitCode == null) process.kill(-ch.pid, "SIGKILL"); } catch (e) { try { ch.kill("SIGKILL"); } catch (e2) {} } try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} };
process.on("exit", cleanup); for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup(); process.exit(130); });
process.on("unhandledRejection", e => { console.error("CHROME CHECK ERROR:", e && e.stack || e); console.log("CHROME CHECK FAILED"); process.exit(1); });
const J = (s, what) => { try { return JSON.parse(s); } catch (e) { console.log("bad eval result for " + what + ": " + s); return {}; } };
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const HTTP = srv.address().port;
  ch = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", "--window-size=1280,800", "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore", detached: true });
  let port = null; for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = +fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch (e) {} }
  if (!port) throw new Error("Chrome did not report a DevTools port");
  let ws; for (let i = 0; i < 50 && !ws; i++) { await sleep(200); try { const l = await (await fetch("http://127.0.0.1:" + port + "/json")).json(); const p = l.find(x => x.type === "page"); if (p) ws = p.webSocketDebuggerUrl; } catch (e) {} }
  let sock, id = 0; const pend = {}, errs = [];
  const onmsg = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result || d); delete pend[d.id]; }
    if (d.method === "Runtime.consoleAPICalled" && (d.params.type === "error" || d.params.type === "warning")) errs.push(d.params.type + ": " + d.params.args.map(a => a.value).join(" "));
    if (d.method === "Runtime.exceptionThrown") errs.push("exception: " + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description));
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errs.push("log: " + d.params.entry.text + " " + (d.params.entry.url || "")); };
  // each screen size / protocol gets a fresh tab: re-using one tab across a portrait -> landscape switch left CDP touch input one event behind
  const openTab = async url => { if (sock) sock.close(); sock = new WebSocket(url); sock.onmessage = onmsg; await new Promise(r => sock.onopen = r);
    await cmd("Runtime.enable"); await cmd("Log.enable"); await cmd("Page.enable"); };
  let lastTab = null;   // close the previous config's page: left running, its 60s autosave wrote into the next config's localStorage
  const newTab = async () => { if (lastTab) { if (sock) sock.close(); sock = null; await fetch("http://127.0.0.1:" + port + "/json/close/" + lastTab).catch(() => {}); } const t = await (await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" })).json(); lastTab = t.id; await openTab(t.webSocketDebuggerUrl); };
  const cmd = (method, params = {}) => new Promise(r => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
  const ev = async e => (await cmd("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
  const q = async e => J(await ev("JSON.stringify(" + e + ")"), e);
  await openTab(ws);
  let fail = 0; const check = (c, msg, extra) => { console.log((c ? "  PASS " : "  FAIL ") + msg + (extra !== undefined ? "  " + JSON.stringify(extra) : "")); if (!c) fail++; };
  const shot = async n => { const f = shotDir + n + ".png"; fs.writeFileSync(f, Buffer.from((await cmd("Page.captureScreenshot", { format: "png" })).data, "base64")); console.log("  screenshot", f); };
  const PERSON = "(() => { const p = GS.Render.screen[GS.app.sim.agents[0].id]; return GS.Render.toClient(p.x + 0.5, p.y + 0.5); })()";
  const center = async sel => q("(() => { const r = document.querySelector('" + sel + "').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  for (const [W, H, mobile] of [[1280, 800, false], [390, 844, true], [844, 390, true]]) for (const proto of ["file", "http"]) {
    const tag = (mobile ? (W > H ? "phone_landscape_" : "phone_") : "desktop_") + W + "x" + H + "_" + proto, base = proto === "file" ? "file://" + root + "/index.html" : "http://127.0.0.1:" + HTTP + "/index.html";
    if (process.env.ONLY && !tag.includes(process.env.ONLY)) continue;   // e.g. ONLY=phone_landscape
    console.log(tag); await newTab();
    await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: mobile ? 2 : 1, mobile, screenWidth: W, screenHeight: H, screenOrientation: W > H ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 } });
    await cmd("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    const tap = async (x, y) => { if (mobile) { await cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); await sleep(60); await cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
      else for (const type of ["mousePressed", "mouseReleased"]) await cmd("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); await sleep(150); };
    const press = async sel => { const c = await center(sel); await tap(c.x, c.y); };
    // Save/Load/New world live behind the "World" menu on phones
    const pressF = async sel => { if (await ev("getComputedStyle(document.getElementById('btn-menu')).display !== 'none' && !document.getElementById('top').classList.contains('menu-open')")) await press("#btn-menu"); await press(sel); };
    const drag = async (x0, y0, x1, y1, n = 8) => { if (mobile) { await cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] }); for (let i = 1; i <= n; i++) await cmd("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n }] }); await cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
      else { await cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", clickCount: 1 }); for (let i = 1; i <= n; i++) await cmd("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n, button: "left", buttons: 1 }); await cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y: y1, button: "left", clickCount: 1 }); } await sleep(120); };
    const wheel = async (x, y, dy) => { await cmd("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy }); await sleep(80); return ev("GS.Render.view.z"); };
    const pinch = async (cx0, cy0, d0, d1, n = 8) => { const pt = d => [{ x: cx0 - d / 2, y: cy0, id: 1 }, { x: cx0 + d / 2, y: cy0, id: 2 }];
      await cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(d0) }); for (let i = 1; i <= n; i++) await cmd("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(d0 + (d1 - d0) * i / n) });
      await cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(120); return ev("GS.Render.view.z"); };
    await cmd("Page.navigate", { url: base + "?seed=42" }); await sleep(800); await ev("localStorage.clear()"); errs.length = 0;
    await cmd("Page.navigate", { url: base + "?seed=42" }); await sleep(1500);
    const st = await q("{ seed: GS.app.sim.seed, tick: GS.app.sim.tick, n: GS.app.sim.agents.length, bushes: GS.app.sim.bushes.length, person: !!(GS.Render.art().person && GS.Render.art().person.naturalWidth === 32), founders: !!(GS.Render.art().founders && GS.Render.art().founders.naturalWidth === 256 && GS.Render.art().founders.naturalHeight === 80), cfgBushes: GS.data.config.bushes.count, tiles: (() => { const s = new Set(GS.app.sim.agents.map(a => a.pos.x + ',' + a.pos.y)); return s.size; })(), bush: !!(GS.Render.art().bush && GS.Render.art().bush.naturalWidth === 16), clock: document.getElementById('clock').textContent, scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, cv: (() => { const r = document.getElementById('cv').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(), side: (() => { const r = document.getElementById('side').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })() }");
    check(st.seed === 42 && st.n >= 5 && st.n <= 8 && st.tiles === st.n && st.bushes >= 15 && st.bushes <= st.cfgBushes && /Day 1/.test(st.clock), "boots seed 42 with 5-8 founders on their own tiles, 15-" + st.cfgBushes + " bushes (15b: dry seeds fewer), clock", { founders: st.n, bushes: st.bushes, clock: st.clock });
    check(st.person && st.bush && st.founders, "Artist PNGs (data/art) loaded, incl. founders_16.png (256x80)");
    check(!st.scroll && st.cv[2] > 300 && st.cv[0] >= 0 && st.cv[0] + st.cv[2] <= W && st.cv[1] + st.cv[3] <= H && Math.abs(st.cv[2] / st.cv[3] - 1.5) < 0.02 && st.side[1] <= H + 1, "whole map fits on screen at 3:2, no page scroll", { cv: st.cv, side: st.side });
    // click/tap the person -> info panel
    await ev("GS.app.setSpeed(0); true"); await sleep(200);
    const pp = await q(PERSON);
    if (process.env.DBG) console.log("DBG tap", pp, await q("(() => { const e = document.elementFromPoint(" + pp.x + "," + pp.y + "); return e && (e.id || e.className || e.tagName); })()"));
    await tap(pp.x, pp.y); await sleep(300);
    const inf = await q("{ shown: !document.getElementById('info').hidden, text: document.getElementById('info-body').innerText, sel: GS.app.selected }");
    // 26b: person-card tabs — default Needs (Warmth); Mind holds traits/Experience; tab labels ≥16px, taps ≥44px
    const tabs0 = await q("(() => { const bs = [...document.querySelectorAll('#info-body .pcard-tab')]; return { keys: bs.map(b => b.getAttribute('data-ptab')), labels: bs.map(b => b.textContent), fs: bs.map(b => parseFloat(getComputedStyle(b).fontSize)), h: bs.map(b => b.getBoundingClientRect().height), on: (bs.find(b => b.classList.contains('on')) || {}).getAttribute('data-ptab') }; })()");
    check(inf.shown && inf.text.includes(await ev("GS.app.sim.agents[0].name")) && tabs0.keys.join() === "needs,mind,kin,knows" && tabs0.on === "needs" && tabs0.labels.join() === "Needs,Mind,Kin,Knows" && tabs0.fs.every(f => f >= 16) && tabs0.h.every(h => h >= 44) && /Fullness/.test(inf.text) && /Water/.test(inf.text) && /Energy/.test(inf.text) && /Warmth/.test(inf.text) && !/\bhunger\b|\bthirst\b/i.test(inf.text) && !/Experience/.test(inf.text) && !/Relations/.test(inf.text), (mobile ? "tap" : "click") + " person opens card on Needs tab (Fullness/Water/Energy/Warmth; Mind/Kin/Knows tabs ≥16px/44px)", { tabs: tabs0, head: inf.text.split("\n").slice(0, 3).join(" / ") });
    const v = await q("(() => { const a = GS.app.sim.agents[0], t = document.getElementById('info-body').innerText; const bars = [...document.querySelectorAll('#info-body .row.need')].map(r => { const b = r.querySelector('.bar'), i = b.querySelector('i'), em = b.querySelector('em'), br = b.getBoundingClientRect(), ir = i.getBoundingClientRect(); return { label: r.querySelector('span').textContent, word: em.textContent, fs: parseFloat(getComputedStyle(em).fontSize), left: Math.abs(ir.left - br.left) < 2, frac: ir.width / Math.max(1, br.width - 2) }; }); return { t, bars, h: Math.round(a.needs.fullness), th: Math.round(a.needs.water), en: Math.round(a.needs.energy), raw: [a.needs.fullness, a.needs.water, a.needs.energy, a.needs.warmth], words: [GS.Agent.fullnessWord(a.needs.fullness), GS.Agent.waterWord(a.needs.water)], sp: a.traits.speed, ap: a.traits.appetite }; })()");
    const num = k => { const m = v.t.match(new RegExp(k + "\\s+(?:[a-z]+\\s+)?(\\d+)/100")); return m ? +m[1] : null; };
    check(num("Fullness") === v.h && num("Water") === v.th && num("Energy") === v.en && /Warmth/.test(v.t) && !/\d\.\d/.test(v.t.split(/Needs/i)[0] || v.t), "Needs tab shows 0-100 integers for Fullness/Water/Energy/Warmth", { fullness: num("Fullness"), water: num("Water"), energy: num("Energy"), warmth: num("Warmth") });
    check(v.bars.map(b => b.label).join() === "Fullness,Water,Energy,Warmth" && v.bars[0].word === v.words[0] && v.bars[1].word === v.words[1] && /^(rested|fine|tired|delirious|sleep-deprived)$/.test(v.bars[2].word) && (v.bars[2].word === "rested") === (v.raw[2] >= 80) && v.bars.every((b, k) => b.left && b.fs >= 16 && Math.abs(b.frac - v.raw[k] / 100) < 0.03), "need bars: Fullness/Water/Energy/Warmth (the mock order), full = good, fill left to right with the value, state word >= 16px", v.bars.map(b => b.label + " " + b.word + " " + Math.round(b.frac * 100) + "%").join(" | "));
    await ev("GS.UI.personTab = 'mind'; GS.UI.update(GS.app); true"); await sleep(80);
    const mind = await q("(() => { const body = document.getElementById('info-body'), t = body.innerText, a = GS.app.sim.agents[0]; const rowNum = k => { const r = [...body.querySelectorAll('.row')].find(e => (e.querySelector('span') || {}).textContent === k); const b = r && r.querySelector('b'); const m = b && /(\\d+)[/]100/.exec(b.textContent); return m ? +m[1] : null; }; const fsr = body.querySelector('[data-exp=fire]'); return { sp: rowNum('Speed'), ap: rowNum('Appetite'), cur: /Curiosity/.test(t), cf: /Cold fear/.test(t), ff: /Fire fear/.test(t), exp: /Experience/.test(t), fire: fsr && fsr.innerText, score: Math.round(GS.Learn.score(a, 'fire')), traitsAvg: /0-100, 50 = avg/i.test(t), bad: /metabolism|perception|patience/.test(t) }; })()");
    check(mind.sp === Math.round(v.sp) && mind.ap === Math.round(v.ap) && mind.cur && mind.cf && mind.ff && mind.exp && mind.traitsAvg && mind.fire && /Fire/.test(mind.fire) && new RegExp("\\b" + mind.score + "/100").test(mind.fire) && !mind.bad, "Mind tab: Experience (Fire n/100) + traits (Speed/Appetite/Curiosity/Cold fear/Fire fear)", { sp: mind.sp, ap: mind.ap, fire: mind.fire });
    await ev("GS.UI.personTab = 'needs'; GS.UI.update(GS.app); true"); await sleep(40);
    const PLOG = "(() => { const el = document.getElementById('plog'), sec = document.getElementById('plog-sec'), s = GS.app.sim, id = GS.app.selected, L = GS.Sim.plogOf(s, id), rows = [...el.querySelectorAll('.ev')]; return { vis: !el.hidden && el.getBoundingClientRect().height > 20, sec: sec.textContent, n: L.length, rows: rows.length, first: rows[0] && rows[0].textContent, last: L.length ? GS.Time.stamp(L[L.length - 1].t) + L[L.length - 1].text : null, maxH: getComputedStyle(el).maxHeight, vh: innerHeight, oy: getComputedStyle(el).overflowY, fs: rows.length ? parseFloat(getComputedStyle(rows[0]).fontSize) : 0, kinds: [...new Set(rows.map(r => r.className))] }; })()";
    const pl = await q(PLOG);
    check(pl.vis && pl.n > 0 && pl.rows === pl.n && pl.first === pl.last && /'s log \(\d+\)/.test(pl.sec) && Math.abs(parseFloat(pl.maxH) - 0.4 * pl.vh) < 1.5 && pl.oy === "auto" && pl.fs >= 16, "personal log on the card: her own events, newest first, scrolls at max 40vh, >= 16px", { sec: pl.sec, n: pl.n, rows: pl.rows, maxH: pl.maxH, vh: pl.vh, oy: pl.oy, fs: pl.fs, first: pl.first, last: pl.last });
    const RELQ = "(() => { const s = GS.app.sim, A = s.agents, a = A[0], b = A[1]; const set = (x, y, f, l) => { x.rel = x.rel || {}; x.rel[y.id] = Object.assign(x.rel[y.id] || { m: 0, d: 0, nt: -1 }, { f, l }); }; set(a, b, 75, 72); set(b, a, 70, 66); for (let k = 2; k < A.length; k++) set(a, A[k], 30 + k, 20 + 4 * k); GS.Social.daily(s); GS.app.select(a.id); GS.UI.personTab = 'kin'; GS.UI.update(GS.app); const body = document.getElementById('info-body'), rows = [...body.querySelectorAll('.row.rel')], ring = body.querySelector('i.ring'), rr = ring && ring.getBoundingClientRect(); return { t: body.innerText, rows: rows.length, fs: Math.min(...rows.map(r => parseFloat(getComputedStyle(r).fontSize))), ring: !!ring && rr.width > 0, col: ring && getComputedStyle(ring).borderTopColor, g: a.group, groups: s.groups.length, log: s.log.slice(-3).map(e => e.text) }; })()";
    const rel = await q(RELQ);
    check(rel.g != null && rel.groups >= 1 && rel.ring && /Relations/.test(rel.t) && /keeps with/.test(rel.t) && /warm/.test(rel.t) && rel.rows >= 2 && rel.rows <= 6 && rel.fs >= 16 && rel.log.some(x => /now keep together$/.test(x) && !/["“”]/.test(x)), "step 18: card shows the group (colour swatch, members) and Relations (top 5, warm / neutral / wary, f / l), >= 16px; the log line is an action", { rows: rel.rows, fs: rel.fs, col: rel.col, groups: rel.groups, log: rel.log });
    // step 19: a pair, a birth; the mother's card links Partner / Children (44px buttons, 16px), the baby's card links Parents and shows ▲/▼; the baby sprite is loaded
    const FAMQ = "(() => { const s = GS.app.sim, A = s.agents, a = A[0], b = A[1]; a.sex = 'f'; b.sex = 'm'; a.mate = b.id; b.mate = a.id; a.preg = { since: s.tick, due: s.tick, father: b.id, fatherName: b.name, ftraits: Object.assign({}, b.traits), flife: b.lifespan, fgroup: b.group }; GS.Family.step(s); const bb = s.babies.at(-1);" +
      " GS.app.select(a.id); GS.UI.personTab = 'kin'; GS.UI.update(GS.app); const body = document.getElementById('info-body'), L = [...body.querySelectorAll('button.lnk')], r = L.map(e => { const q = e.getBoundingClientRect(); return { t: e.textContent, h: q.height, w: q.width, fs: parseFloat(getComputedStyle(e).fontSize) }; });" +
      " const kid = L.find(e => +e.dataset.sel === bb.id); if (kid) kid.click(); GS.UI.personTab = 'kin'; GS.UI.update(GS.app); const t2 = body.innerText, P = [...body.querySelectorAll('button.lnk')].map(e => e.textContent); const art = GS.Render.art().baby;" +
      " return { mom: body && r, t1: !!kid, sel: GS.app.selected === bb.id, t2: t2.slice(0, 400), P, arrows: (t2.match(/[▲▼=]/g) || []).length, art: !!art && art.naturalWidth > 0, aw: art && art.naturalWidth, log: s.log.slice(-2).map(e => e.text) }; })()";
    const fam = await q(FAMQ);
    check(fam.t1 && fam.sel && fam.mom.length >= 2 && fam.mom.every(x => x.h >= 44 && x.fs >= 16) && /Parents/.test(fam.t2) && fam.P.length >= 2 && fam.arrows >= 5 && fam.art && fam.log.some(x => / gives birth; a baby lies beside (her|him)$/.test(x)) && !fam.log.some(x => /["“”]/.test(x)),
      "step 19: mother's card links Partner / Children (>= 44px, 16px); clicking the child opens the baby's card with Parents links and ▲/▼ traits; baby sprite loaded; birth logged as an action", { mom: fam.mom, P: fam.P, arrows: fam.arrows, art: fam.aw, log: fam.log });
    // step 20: the baby grows into a child: drawn at ~75% of an adult (child strip or the founder sprite scaled), the card shows the stage and "Learned from" links (>= 44px, 16px)
    const KIDQ = "(() => { const s = GS.app.sim, bb = s.babies.at(-1), mom = s.agents[0]; if (!bb) return null; bb.age = GS.data.config.child.childAt; GS.Family.step(s); const c = s.agents.find(p => p.id === bb.id); if (!c) return null;" +
      " const r = GS.Learn.rec(c, 'fire'); r.seep = { from: mom.id, name: mom.name, t: s.tick }; const h = GS.Learn.rec(c, 'hunt'); h.copied = { from: s.agents[1].id, name: s.agents[1].name, t: s.tick };" +
      " const ctx = document.getElementById('cv').getContext('2d'), od = ctx.drawImage, F = GS.Render.art().founders, CH = GS.Render.art().child, sz = []; ctx.drawImage = function (im, ...q) { if (im === F || im === CH) { const m = ctx.getTransform(); if (q.length >= 8) { const oc = document.createElement('canvas'); oc.width = q[2]; oc.height = q[3]; const o = oc.getContext('2d'); o.drawImage(im, q[0], q[1], q[2], q[3], 0, 0, q[2], q[3]); let d; try { d = o.getImageData(0, 0, q[2], q[3]).data; } catch (e) { sz.push({ kid: im === CH, w: null, drawn: q[7] * m.d }); return od.apply(this, [im, ...q]); } let t = q[3], b = -1; for (let y = 0; y < q[3]; y++) for (let x = 0; x < q[2]; x++) if (d[(y * q[2] + x) * 4 + 3] > 20) { t = Math.min(t, y); b = Math.max(b, y); } sz.push({ kid: im === CH, w: (b - t + 1) * q[7] / q[3] * m.d }); } } return od.apply(this, [im, ...q]); };" +
      " for (const p of [mom, c]) p.act = { type: 'idle', until: s.tick + 600 }; const A0 = s.agents.slice(); s.agents = [mom, c]; try { GS.Render.draw(s, 0, performance.now() / 1000, null); } finally { s.agents = A0; ctx.drawImage = od; }" +
      " GS.app.select(c.id); GS.UI.personTab = 'mind'; GS.UI.update(GS.app); const body = document.getElementById('info-body'), row = body.querySelector('.row.learned'), L = row ? [...row.querySelectorAll('button.lnk')].map(e => { const q = e.getBoundingClientRect(); return { t: e.textContent, h: q.height, fs: parseFloat(getComputedStyle(e).fontSize) }; }) : [];" +
      " return { stage: body.querySelector('.stage') && body.querySelector('.stage').textContent, row: row && row.innerText.replace(/\\s+/g, ' '), rowFs: row ? parseFloat(getComputedStyle(row).fontSize) : 0, L, sz, mode: GS.Render.lastKid }; })()";
    const kid = await q(KIDQ);
    // figure height on screen, child / adult (file:// taints the canvas, so pixels are read on http only; on file:// the scaled path is checked by its drawn size)
    const kA = kid && kid.sz.find(x => !x.kid), kK = kid && (kid.mode === "sheet" ? kid.sz.find(x => x.kid) : kid.sz[kid.sz.length - 1]);
    const tainted = !!kA && kA.w == null, kw = !kA || !kK ? 0 : tainted ? (kid.mode === "sheet" ? 0.75 : kK.drawn / kA.drawn) : kK.w / kA.w;
    check(!!kid && kid.stage === "child" && /Learned from/.test(kid.row) && /\(fire\)/.test(kid.row) && kid.L.length >= 2 && kid.L.every(x => x.h >= 44 && x.fs >= 16) && kid.rowFs >= 16 && (kid.mode === "scaled" || kid.mode === "sheet") && Math.abs(kw - 0.75) < 0.1,
      "step 20: a child is drawn at ~75% of an adult (" + (kid && kid.mode) + "); her card shows the stage and 'Learned from' links (>= 44px, 16px)", kid && { stage: kid.stage, row: kid.row, links: kid.L, scale: tainted && kid.mode === "sheet" ? "file:// (pixels unreadable; measured on http)" : kw.toFixed(2), mode: kid.mode });
    await shot(tag + "_info");
    // tap an animal (one with nobody else within 1.5 tiles, no person within 3: a person's sprite is taller) -> animal panel
    const AN = "(() => { const s = GS.app.sim, all = [...s.agents, ...s.animals]; const onMap = a => { const c = GS.Render.toClient(a.pos.x + 0.5, a.pos.y + 0.5), e = document.elementFromPoint(c.x, c.y); return e && e.id === 'cv'; }; const clear = a => onMap(a) && all.every(o => o === a || Math.hypot(o.pos.x - a.pos.x, o.pos.y - a.pos.y) > (s.agents.includes(o) ? 3 : 1.5)); let an = s.animals.find(a => a.species === 'grazer' && clear(a)) || s.animals.find(a => a.species !== 'wolves' && clear(a)) || s.animals.find(clear); if (!an) { /* 15b: on a zoomed-in phone view no animal may be in sight: walk one onto a clear visible tile */ an = s.animals.find(a => a.species === 'grazer') || s.animals.find(a => a.species !== 'wolves') || s.animals[0]; outer: for (let y = 0; y < s.world.h; y++) for (let x = 0; x < s.world.w; x++) { if (!GS.World.walkable(s.world, x, y)) continue; an.pos = { x, y }; if (clear(an)) break outer; } an.act = { type: 'idle', until: s.tick + 1e6 }; s.prev[an.id] = { x: an.pos.x, y: an.pos.y }; GS.Render.draw(s, 1, performance.now() / 1000, GS.app.selected); } const p = GS.Render.screen[an.id]; return Object.assign(GS.Render.toClient(p.x + 0.5, p.y + 0.5), { id: an.id, sp: an.species }); })()";
    if (W > H && mobile) { await press("#sheet-handle"); await sleep(250); } const ap = await q(AN); if (process.env.DBG) console.log("DBG animal", ap, await q("(() => { const e = document.elementFromPoint(" + ap.x + "," + ap.y + "); return [e && (e.id || e.className || e.tagName), innerWidth, innerHeight, GS.Render.view]; })()")); await tap(ap.x, ap.y); await sleep(300);
    const ai = await q("{ sel: GS.app.selected, shown: !document.getElementById('info').hidden, text: document.getElementById('info-body').innerText, fs: Math.min(...[...document.querySelectorAll('#info-body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize))) }");
    check(ai.sel === ap.id && ai.shown && (new RegExp(ap.sp, "i").test(ai.text) || (ap.sp === "grazer" && /\bdeer\b/i.test(ai.text)) || (ap.sp === "scavenger" && /wild dog/i.test(ai.text)) || (ap.sp === "wolves" && /wolves/i.test(ai.text))) && /Fullness/.test(ai.text) && (/flees any person/i.test(ai.text) || /territory/i.test(ai.text)) && ai.fs >= 16, (mobile ? "tap" : "click") + " an animal opens its panel (species, Fullness, behaviour) at >= 16px", ai.text.split("\n").slice(0, 2).join(" / ") + ", min font " + ai.fs);
    await shot(tag + "_animal");
    // a body on a clear tile -> tap -> body panel
    if (W > H && mobile) { await press("#sheet-handle"); await sleep(250); }   // landscape: the open sheet covers the map; close it before looking for a clear spot
    const bp = await q("(() => { const s = GS.app.sim, all = [...s.agents, ...s.animals], a = s.agents[0]; for (let r = 3; r < 30; r++) for (let k = 0; k < 24; k++) { const x = Math.round(a.pos.x + Math.cos(k / 3.8) * r), y = Math.round(a.pos.y + Math.sin(k / 3.8) * r); const cc = GS.Render.toClient(x + 0.5, y + 0.5), ce = document.elementFromPoint(cc.x, cc.y); if (ce && ce.id === 'cv' && GS.World.walkable(s.world, x, y) && all.every(o => Math.hypot(o.pos.x - x, o.pos.y - y) > 2) && s.bushes.every(b => Math.hypot(b.x - x, b.y - y) > 1)) { const b = GS.Body.create(s, a, 'thirst'); b.x = x; b.y = y; b.name = 'Testbody'; s.bodies.push(b); return { id: b.id, x, y }; } } return null; })()");
    await sleep(400); const bc = await q("(() => { const p = GS.Render.screen[" + bp.id + "]; return GS.Render.toClient(p.x + 0.5, p.y + 0.5); })()"); await tap(bc.x, bc.y); await sleep(300);
    const bi = await q("{ sel: GS.app.selected, text: document.getElementById('info-body').innerText }");
    check(bi.sel === bp.id && /Body of Testbody/.test(bi.text) && /thirst/.test(bi.text) && /fresh/.test(bi.text) && /Flesh/.test(bi.text), (mobile ? "tap" : "click") + " a body opens its panel (whose, stage, cause, Flesh)", bi.text.split("\n").slice(0, 3).join(" / "));
    await shot(tag + "_body");
    await q("(() => { const s = GS.app.sim; s.bodies = s.bodies.filter(b => b.id !== " + bp.id + "); GS.app.select(GS.app.sim.agents[0].id); return true; })()");
    // speed buttons
    const sb = await q("[...document.querySelectorAll('#speeds button')].map(b => { const r = b.getBoundingClientRect(), sv = b.querySelector('svg'), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { t: b.textContent, icon: sv && sv.getAttribute('data-icon'), iw: sv ? Math.round(sv.getBoundingClientRect().width) : 0, aria: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), hit: !!h && (h === b || b.contains(h)) }; })");
    check(JSON.stringify(sb.map(b => b.t)) === JSON.stringify(["Pause", "1x", "10x", "60x"]) && JSON.stringify(sb.map(b => b.icon)) === JSON.stringify(["pause", "play", "fast", "superfast"]) && sb.every(b => b.iw >= 22 && b.iw <= 24 && b.aria && b.h >= 44 && b.w >= 44 && b.hit), "4 speed buttons: kit icons pause/play/fast/superfast + labels Pause/1x/10x/60x, aria-labels, >= 44px, on top", sb.map(b => b.icon + ":" + b.t + " " + b.w + "x" + b.h + " icon " + b.iw + (b.hit ? "" : " COVERED") + " '" + b.aria + "'").join(" | "));
    const rate = async (sel, ms) => { await press(sel); const a = await q("{ t: GS.app.sim.tick, at: performance.now() }"); await sleep(ms); const b = await q("{ t: GS.app.sim.tick, at: performance.now() }"); return (b.t - a.t) / ((b.at - a.at) / 1000); };
    const r60 = await rate("#speed-60", 3000); check(await ev("GS.app.speed") === 60 && r60 > 10.5 && r60 < 13.5, "60x button: ~12 ticks per real second", r60.toFixed(2));
    const r10 = await rate("#speed-10", 4000); check(await ev("GS.app.speed") === 10 && r10 > 1.4 && r10 < 2.6 && await ev("document.getElementById('speed-10').classList.contains('on')"), "10x button: ~2 ticks per real second", r10.toFixed(2));
    await press("#speed-0"); const t4 = await ev("GS.app.sim.tick"); await sleep(600); check(await ev("GS.app.sim.tick") === t4 && await ev("GS.app.speed") === 0, "Pause stops the clock");
    await press("#speed-1"); const r1 = await q("{ s: GS.app.speed, on: [...document.querySelectorAll('#speeds button.on')].map(b => b.id) }"); const t1a = await q("{ t: GS.app.sim.tick + GS.app.acc, at: performance.now() }"); await sleep(2600); const t1b = await q("{ t: GS.app.sim.tick + GS.app.acc, at: performance.now() }"); const rr1 = (t1b.t - t1a.t) / ((t1b.at - t1a.at) / 1000);
    check(r1.s === 1 && r1.on.join() === "speed-1" && rr1 > 0.1 && rr1 < 0.4, "1x (Play) button: selects alone, the clock runs at ~0.2 ticks per real second", { on: r1.on, rate: rr1.toFixed(3) });
    // keys: 0 pause, 1 = 1x, 2 = 10x, 3 = 60x, Space toggles pause/resume; tooltips name the key
    const key = async (k, code) => { await ev("document.activeElement && document.activeElement.blur(); true"); for (const type of ["keyDown", "keyUp"]) await cmd("Input.dispatchKeyEvent", { type, key: k, code, text: type === "keyDown" ? k : undefined, windowsVirtualKeyCode: k === " " ? 32 : k.charCodeAt(0) }); await sleep(80); return ev("GS.app.speed"); };
    const ks = [await key("2", "Digit2"), await key("3", "Digit3"), await key(" ", "Space"), await key(" ", "Space"), await key("0", "Digit0"), await key("1", "Digit1")];
    check(JSON.stringify(ks) === JSON.stringify([10, 60, 0, 60, 0, 1]), "keys 2/3/Space/Space/0/1 -> 10x, 60x, pause, resume 60x, pause, 1x", ks);
    const tips = await q("[...document.querySelectorAll('#speeds button')].map(b => b.title)");
    check(/key 0/.test(tips[0]) && /Space/.test(tips[0]) && /key 1/.test(tips[1]) && /key 2/.test(tips[2]) && /key 3/.test(tips[3]), "button tooltips name the keys", tips);

    // ---- UI restyle: every text at >= 16px (log, buttons, panel), palette, real tabs ----
    const fz = await q("(() => { const els = [...document.querySelectorAll('#top *, #side *, #zoom *, #panelbar *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())); const sz = e => parseFloat(getComputedStyle(e).fontSize); return { n: els.length, small: els.filter(e => sz(e) < 16).map(e => (e.id || e.className || e.tagName) + ':' + sz(e)), log: sz(document.querySelector('#log .ev')), btn: sz(document.getElementById('speed-1')), panel: sz(document.querySelector('#info .row')), min: Math.min(...els.map(sz)) }; })()");
    check(fz.n > 15 && fz.small.length === 0 && fz.log >= 16 && fz.btn >= 16 && fz.panel >= 16, "all text >= 16px (log, buttons, panel)", { min: fz.min, log: fz.log, btn: fz.btn, panel: fz.panel, small: fz.small });
    await sleep(300); // theme.css transitions button/panel colours (~200ms)
    const pal = await q("({ on: getComputedStyle(document.querySelector('#speeds button.on')).backgroundColor, off: getComputedStyle(document.querySelector('#speeds button:not(.on)')).backgroundColor, panel: getComputedStyle(document.getElementById('info')).backgroundColor, log: getComputedStyle(document.getElementById('logwrap')).backgroundColor, frame: getComputedStyle(document.getElementById('info')).borderTopColor, text: getComputedStyle(document.body).color })");
    check(pal.on === "rgb(140, 191, 85)" && pal.panel === "rgba(28, 22, 17, 0.82)" && pal.log === pal.panel && pal.frame === "rgba(241, 230, 207, 0.1)" && pal.text === "rgb(241, 230, 207)", "palette (data/ui/theme.css): active speed green pill, soft dark translucent panels with hairline borders, warm text", pal);
    if (process.env.DBG) { const c = await center("#tab-food"); console.log("DBG tab", c, await q("(() => { const e = document.elementFromPoint(" + c.x + "," + c.y + "); return e && (e.id || e.className || e.tagName); })()"), await q("document.getElementById('side').getBoundingClientRect()")); }
    await ev("GS.app.setSpeed(0); for (let i = 0; i < 240; i++) GS.Sim.step(GS.app.sim); true"); // 4 game h so every tab has lines
    if (mobile && W < H) { await ev("GS.app.select(null); GS.UI.update(GS.app); true"); await sleep(300); } // the phone card slides up over the log sheet
    await press("#tab-food");
    const tf = await q("{ on: document.getElementById('tab-food').classList.contains('on'), rows: [...document.querySelectorAll('#log .ev')].map(e => e.textContent), all: GS.app.sim.log.length, role: document.getElementById('tab-food').getAttribute('role') }");
    check(tf.on && tf.role === "tab" && tf.rows.length > 0 && tf.rows.length < tf.all && tf.rows.every(t => /bush|berr|meal|hungry|starving|meat|deer|wild dog|Wolves|grazer|carcass|scavenge|hunt|flesh/i.test(t)), "log Food tab filters the log", { shown: tf.rows.length, of: tf.all });
    await press("#tab-water"); const tw = await q("{ on: document.getElementById('tab-water').classList.contains('on'), rows: [...document.querySelectorAll('#log .ev')].map(e => e.textContent) }");
    check(tw.on && tw.rows.length > 0 && tw.rows.every(t => /water|drink|thirst|parched|dehydrated|lake|river/i.test(t)), "log Water tab shows the water lines", { shown: tw.rows.length, first: tw.rows[0] });
    const tabs = await q("(() => { const s = document.getElementById('side').getBoundingClientRect(); return [...document.querySelectorAll('#tabs [role=tab]')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, in: r.left >= s.left - 1 && r.right <= s.right + 1 && r.width > 20, fs: parseFloat(getComputedStyle(b).fontSize), clipped: b.scrollWidth > b.clientWidth + 1 }; }); })()");
    check(tabs.map(t => t.t).join() === "All,Food,Water,Sleep,Events,Death" && tabs.every(t => t.in && t.fs >= 16 && !t.clipped), "6 log filter pills (All/Food/Water/Sleep/Events/Death) fit at >= 16px", tabs.map(t => t.t + ":" + t.fs + (t.in && !t.clipped ? "" : "!")).join(" "));
    await press("#tab-all"); check(await ev("document.querySelectorAll('#log .ev').length") === Math.min(40, await ev("GS.app.sim.log.length")), "log All tab shows everything");
    // ---- layout: bottom tab bar on every size; panels (log / inspect) open ABOVE the bar, full width, never in a side column ----
    const BAR = "(() => { const b = document.getElementById('panelbar').getBoundingClientRect(), bs = [...document.querySelectorAll('#panelbar button[role=tab]')].map(e => { const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { t: e.textContent, w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(getComputedStyle(e).fontSize), hit: !!h && (h === e || e.contains(h)) }; }); return { b: [b.left, b.top, b.right, b.bottom].map(Math.round), vh: innerHeight, vw: innerWidth, bs }; })()";
    const lay = await q("(() => { const s = document.getElementById('side').getBoundingClientRect(), c = document.getElementById('cv').getBoundingClientRect(), b = document.getElementById('panelbar').getBoundingClientRect(); return { s: [s.left, s.top, s.right, s.bottom].map(Math.round), c: [c.left, c.top, c.right, c.bottom].map(Math.round), barTop: Math.round(b.top), fixed: getComputedStyle(document.getElementById('side')).position === 'fixed', open: document.getElementById('side').classList.contains('open') }; })()");
    const bar = await q(BAR);
    check(Math.abs(bar.b[3] - bar.vh) <= 8 && bar.b[0] <= 1 && bar.b[2] >= bar.vw - 1 && bar.bs.length >= 1 && bar.bs.every(x => x.hit && x.fs >= 16 && (!mobile || (x.h >= 44 && x.w >= 44))), "tab bar is a full-width bottom bar (bottom edge within 8px of the viewport bottom), buttons on top at >= 16px" + (mobile ? ", >= 44x44px" : ""), { bar: bar.b, viewport: [bar.vw, bar.vh], buttons: bar.bs });
    const pb = await q("(() => { const b = [...document.querySelectorAll('#panelbar button[role=tab]')].map(e => { const r = e.getBoundingClientRect(), i = e.querySelector('svg').getBoundingClientRect(), l = e.querySelector('.lbl').getBoundingClientRect(); return { t: e.textContent, h: Math.round(r.height), above: (i.bottom <= l.top + 1 && Math.abs((i.left + i.right) / 2 - (l.left + l.right) / 2) < 3) || (innerWidth < 600 && !e.classList.contains('on') && getComputedStyle(e.querySelector('.lbl')).display === 'none' && !!e.getAttribute('aria-label')), on: e.classList.contains('on'), bg: getComputedStyle(e).backgroundColor, col: getComputedStyle(e).color }; }); return b; })()");
    check(pb.every(x => x.h === 56 && x.above) && pb.filter(x => x.on).length === 1 && pb.filter(x => x.on).every(x => x.bg === "rgba(140, 191, 85, 0.14)" && x.col === "rgb(140, 191, 85)") && pb.filter(x => !x.on).every(x => x.bg === "rgba(0, 0, 0, 0)"), "bottom bar: 56px tabs, icon above the label, green pill on the active tab", pb);
    const LAY2 = "(() => { const R = id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return e.hidden || getComputedStyle(e).display === 'none' ? null : [r.left, r.top, r.right, r.bottom].map(Math.round); }; return { info: R('info'), log: R('logwrap'), bar: Math.round(document.getElementById('panelbar').getBoundingClientRect().top), vh: innerHeight, clock: document.getElementById('clock').innerText, season: GS.data.config.time.seasons.some(n => document.getElementById('clock').innerText.includes(n)) }; })()";
    await ev("GS.app.select(GS.app.sim.agents[0].id); GS.UI.update(GS.app); true"); await sleep(300);
    const l2 = await q(LAY2);
    if (!mobile) check(l2.info && l2.log && l2.info[0] <= 24 && l2.info[2] < W / 2 && l2.log[2] >= W - 24 && l2.log[0] > W / 2 && l2.info[3] <= l2.bar && l2.log[3] <= l2.bar && l2.info[1] >= 56 && l2.season, "desktop (mock): floating card on the left, log on the right, both above the bottom bar; clock shows the season", l2);
    else if (W < H) { check(l2.info && l2.info[3] <= l2.bar && l2.info[3] - l2.info[1] <= 0.58 * l2.vh + 1 && !l2.season && /Day \d+/.test(l2.clock), "phone (mock): the card slides up above the bar, at most 58% of the screen; the clock drops the season", { card: l2.info, vh: l2.vh, clock: l2.clock });
      check(lay.s[0] === 0 && lay.s[2] >= W - 1 && Math.abs(lay.s[3] - lay.barTop) <= 1 && lay.s[1] >= lay.c[3], "phone portrait: log sheet under the map, full width, just above the tab bar", lay); }
    if (mobile && W > H) { check(lay.fixed && lay.open && lay.s[0] === 0 && lay.s[2] >= W - 1 && Math.abs(lay.s[3] - lay.barTop) <= 1, "phone landscape: bottom sheet opened by tapping a person, just above the tab bar", lay);
      await press("#sheet-handle"); const cl = await q("(() => { const s = document.getElementById('side').getBoundingClientRect(), c = document.getElementById('cv').getBoundingClientRect(), b = document.getElementById('panelbar').getBoundingClientRect(); return { top: Math.round(s.top), bottom: Math.round(s.bottom), barTop: Math.round(b.top), h: Math.round(s.height), cvBottom: Math.round(c.bottom), open: document.getElementById('side').classList.contains('open') }; })()");
      check(!cl.open && cl.h <= 60 && cl.top >= cl.cvBottom && Math.abs(cl.bottom - cl.barTop) <= 1, "phone landscape: handle collapses the sheet to a peek bar between the map and the tab bar", cl);
      await press("#sheet-handle"); check(await ev("document.getElementById('side').classList.contains('open') && !document.getElementById('info').hidden"), "phone landscape: handle opens the sheet again");
      await press("#sheet-handle"); }
    // ---- walking: smooth movement between ticks, step frame follows distance ----
    const ID = await ev("GS.app.sim.agents[0].id");
    const setupWalk = n => ev("(() => { GS.app.setSpeed(0); const s = GS.app.sim, a = s.agents[0]; a.needs.fullness = 85; a.needs.water = 100; a.needs.energy = 100; if (a.act.type !== 'walk') a.act = { type: 'idle', until: s.tick }; for (let i = 0; i < 4000 && !(a.act.type === 'walk' && a.act.path.length - a.act.i >= " + n + "); i++) GS.Sim.step(s); GS.app.acc = 0; return a.act.type === 'walk' ? a.act.path.length - a.act.i : 0; })()");
    const samp = "({ t: GS.app.sim.tick, x: GS.Render.screen[" + ID + "].x, y: GS.Render.screen[" + ID + "].y, f: GS.Render.anim[" + ID + "].frame, walk: GS.app.sim.agents[0].act.type === 'walk', at: performance.now() })";
    await setupWalk(6); await sleep(100); await ev("GS.app.setSpeed(1); true");
    const sm = []; for (let i = 0; i < 9; i++) { await sleep(300); sm.push(await q(samp)); }
    const sameTick = sm.filter(o => o.t === sm[0].t), distinct = new Set(sameTick.map(o => o.x.toFixed(4) + "," + o.y.toFixed(4))).size;
    check(sm.every(o => o.walk) && distinct >= 4, "1x: drawn position changes every frame between ticks (no tile snapping)", { samplesInOneTick: sameTick.length, distinctPositions: distinct });
    await setupWalk(6); await sleep(100); await ev("GS.app.setSpeed(60); true");
    const fs1 = []; for (let i = 0; i < 25; i++) { await sleep(60); fs1.push(await q(samp)); }
    let dist = 0; for (let i = 1; i < fs1.length; i++) dist += Math.hypot(fs1[i].x - fs1[i - 1].x, fs1[i].y - fs1[i - 1].y);
    const walkOnly = fs1.every(o => o.walk), df = fs1[fs1.length - 1].f - fs1[0].f;
    check(!walkOnly || Math.abs(df - dist * 2) <= 1.5, "step frame flips every 0.5 tile covered (60x)", { tiles: +dist.toFixed(2), frameFlips: df });
    await ev("GS.app.setSpeed(0); true"); const fp = []; for (let i = 0; i < 6; i++) { await sleep(100); fp.push(await q(samp)); }
    check(fp.every(o => o.f === fp[0].f && o.x === fp[0].x && o.y === fp[0].y), "paused mid-walk: position and step frame hold still", { frame: fp[0].f });
    await ev("(() => { const a = GS.app.sim.agents[0]; a.needs.fullness = 85; a.needs.water = 100; a.needs.energy = 100; a.act = { type: 'idle', until: GS.app.sim.tick + 100000 }; GS.app.setSpeed(60); return true; })()");
    const fi = []; for (let i = 0; i < 10; i++) { await sleep(120); fi.push(await q(samp)); }
    check(fi[fi.length - 1].t > fi[0].t + 10 && fi.every(o => o.f === 0 && o.x === fi[fi.length - 1].x && o.y === fi[fi.length - 1].y), "standing still at 60x: standing frame, no leg movement", { ticks: fi[fi.length - 1].t - fi[0].t, frames: [...new Set(fi.map(o => o.f))] });
    await ev("GS.app.sim.agents[0].act = { type: 'idle', until: GS.app.sim.tick }; GS.app.setSpeed(0); true");
    if (!mobile) { // real seconds per tile at each speed, measured from the drawn position
      const sec = {}; for (const [spd, ms] of [[1, 8000], [10, 4000], [60, 2500]]) {
        await setupWalk(spd === 1 ? 3 : 10); await sleep(100); await ev("GS.app.setSpeed(" + spd + "); true");
        const a0 = await q(samp); let prev = a0, d = 0; while (prev.at - a0.at < ms) { await sleep(150); const o = await q(samp); d += Math.hypot(o.x - prev.x, o.y - prev.y); prev = o; } // path length drawn, turns included
        sec[spd + "x"] = +((prev.at - a0.at) / 1000 / d).toFixed(2); }
      const exp = await q("(() => { const a = GS.app.sim.agents[0], m = GS.Agent.minutesPerTile(a), s = GS.Time.realSecondsPerTick(); return { speedTrait: a.traits.speed, minPerTile: +m.toFixed(2), avgTrait1x: 8 * s, '1x': +(m * s).toFixed(2), '10x': +(m * s / 10).toFixed(2), '60x': +(m * s / 60).toFixed(2) }; })()");
      check(Math.abs(sec["1x"] / exp["1x"] - 1) < 0.15 && Math.abs(sec["10x"] / exp["10x"] - 1) < 0.15 && Math.abs(sec["60x"] / exp["60x"] - 1) < 0.2, "real seconds per tile (measured on screen)", { measured: sec, expected: exp });
      await ev("GS.app.setSpeed(0); true"); }
    // ---- zoom: whole-number steps, buttons, wheel, pinch, clamped pan, tap while zoomed ----
    await ev("GS.app.setSpeed(0); GS.app.select(null); GS.UI.openSheet(false); GS.Render.resetView(); true"); await sleep(150);
    const zs = []; for (let i = 0; i < 4; i++) { await press("#zoom-in"); zs.push(await ev("GS.Render.view.z")); }
    for (let i = 0; i < 4; i++) { await press("#zoom-out"); zs.push(await ev("GS.Render.view.z")); }
    check(JSON.stringify(zs) === "[2,3,4,4,3,2,1,1]", "+/- buttons step zoom 1x-4x in whole numbers and stop at the ends", zs);
    const p0 = await q(PERSON), wz = [await wheel(p0.x, p0.y, -100)]; const p1 = await q(PERSON);
    for (let i = 0; i < 4; i++) wz.push(await wheel(p0.x, p0.y, -100)); for (let i = 0; i < 5; i++) wz.push(await wheel(p0.x, p0.y, 100));
    check(JSON.stringify(wz) === "[2,3,4,4,4,3,2,1,1,1]" && Math.hypot(p1.x - p0.x, p1.y - p0.y) < 3, "mouse wheel steps zoom 1-4 around the cursor (point under cursor stays put)", { steps: wz, moved: +Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(2) });
    if (mobile) { const c = await center("#cv"); c.x -= 30;   // a little left of centre, so a finger 100px out never lands on the +/- group
      const pz = [await pinch(c.x, c.y, 60, 200), await pinch(c.x, c.y, 200, 60)];
      check(pz[0] >= 2 && pz[0] <= 4 && pz[1] < pz[0] && pz.every(Number.isInteger), "pinch zooms in and out in whole steps", pz); }
    await ev("GS.Render.zoomTo(4); true"); await sleep(100);
    const cvr = await q("(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()");
    const pd = await q(PERSON), selBefore = await ev("GS.app.selected");
    if (pd.x > cvr.l + 20 && pd.x < cvr.l + cvr.w - 20) { await drag(pd.x, pd.y, pd.x + 30, pd.y + 20); check(await ev("GS.app.selected") === selBefore, "a drag starting on the person pans and does not select"); }
    // drags stay clear of the floating top groups, zoom buttons and log; 8 x 0.55 of the map width (0.45 of its height) > the 3 map widths to cross at 4x
    for (let i = 0; i < 8; i++) await drag(cvr.l + cvr.w * 0.15, cvr.t + cvr.h * 0.15, cvr.l + cvr.w * 0.7, cvr.t + cvr.h * 0.6);
    const vA = await q("GS.Render.view");
    for (let i = 0; i < 8; i++) await drag(cvr.l + cvr.w * 0.7, cvr.t + cvr.h * 0.6, cvr.l + cvr.w * 0.15, cvr.t + cvr.h * 0.15);
    const vB = await q("GS.Render.view");
    check(vA.z === 4 && vA.ox === 0 && vA.oy === 0 && Math.abs(vB.ox - 720) < 1e-6 && Math.abs(vB.oy - 480) < 1e-6, "drag pans and clamps to the map edges", { topLeft: vA, bottomRight: vB });
    await ev("GS.Render.resetView(); true"); const pz0 = await q(PERSON); await wheel(pz0.x, pz0.y, -100); await wheel(pz0.x, pz0.y, -100);
    const pz3 = await q(PERSON); await tap(pz3.x, pz3.y); await sleep(250);
    const zt = await q("{ z: GS.Render.view.z, sel: GS.app.selected, shown: !document.getElementById('info').hidden }");
    check(zt.z === 3 && zt.sel === ID && zt.shown, "tap/click on the person at 3x zoom opens the inspect panel", zt);
    await shot(tag + "_zoomed");
    if (mobile && W > H) { await ev("GS.UI.openSheet(false); true"); await sleep(300); await shot(tag + "_zoomed_map"); }
    await ev("GS.Render.resetView(); GS.app.select(null); true");
    await ev("GS.app.setSpeed(0); for (let i = 0; i < 600; i++) GS.Sim.step(GS.app.sim); GS.app.setSpeed(1); true"); await sleep(300); // 10 game h later, for the screenshot
    await shot(tag + "_running");
    // the restyle screenshots (http): a person's card open, the log open, 1x - compare with godsim-previews/ui_mock_*.png
    if (proto === "http") { await ev("GS.app.select(GS.app.sim.agents[0].id); GS.UI.update(GS.app); true"); await sleep(500); await shot("ui_new_" + (mobile ? (W > H ? "phone_landscape" : "phone") : "desktop")); await ev("GS.app.select(null); true"); }
    // save / load buttons
    await ev("GS.app._save = GS.app.save; GS.app.save = m => m ? GS.app._save(m) : true; true");   // hold the 60s autosave while testing Save/Load (it could overwrite the manual save)
    await press("#speed-0"); const ts = await ev("GS.app.sim.tick"); await pressF("#btn-save");
    const sv = await q("(() => { const o = JSON.parse(localStorage.getItem('godsim.save') || 'null'); return o && { v: o.version, tick: o.tick, tiles: o.world.tiles.length, agents: o.agents.length, plog: o.plog && (o.plog[o.agents[0].id] || []).length }; })()");
    check(sv && sv.v === GS_VERSION && sv.tick === ts && sv.tiles === 2400 && sv.agents >= 4 && sv.agents <= 8, "Save button writes versioned JSON to localStorage", sv);
    await press("#speed-60"); await sleep(800); await press("#speed-0"); const moved = await ev("GS.app.sim.tick");
    await pressF("#btn-load"); const tl = await ev("GS.app.sim.tick"); check(moved > ts && tl === ts, "Load button restores the saved tick", { saved: ts, ranTo: moved, loaded: tl });
    await ev("GS.app.select(GS.app.sim.agents[0].id); GS.UI.update(GS.app); true"); await sleep(300); const plL = await q(PLOG);
    check(sv.plog > 0 && plL.vis && plL.n === sv.plog && plL.rows === plL.n && plL.first === plL.last, "personal log is saved and shows again after Load", { saved: sv.plog, loaded: plL.n, rows: plL.rows, vis: plL.vis, first: plL.first, last: plL.last });
    await ev("GS.app.save = GS.app._save; true");
    await ev("GS.app.select(null); true");
    // ---- steps 9-12: things on the ground, temperature on the clock, Discoveries tab ----
    await ev("GS.app.setSpeed(0); GS.app.select(null); GS.UI.openSheet(false); GS.Render.resetView(); true"); await sleep(300);
    const itp = await q("(() => { const s = GS.app.sim, far = it => s.agents.concat(s.animals || []).every(a => Math.hypot(a.pos.x - it.x, a.pos.y - it.y) > 2.5) && (s.bodies || []).every(b => Math.hypot(b.x - it.x, b.y - it.y) > 2); const onMap = i => { const c = GS.Render.toClient(i.x + 0.5, i.y + 0.5), e = document.elementFromPoint(c.x, c.y); return e && e.id === 'cv'; }; const it = s.items.find(i => i.heldBy == null && far(i) && onMap(i)); const c = GS.Render.toClient(it.x + 0.5, it.y + 0.5); return { id: it.id, mat: it.material, x: c.x, y: c.y }; })()");
    await tap(itp.x, itp.y); await sleep(300);
    const iti = await q("{ sel: GS.app.selected, shown: !document.getElementById('info').hidden, text: document.getElementById('info-body').innerText }");
    check(iti.sel === itp.id && iti.shown && /hardness/i.test(iti.text) && /sharpness/i.test(iti.text) && /dryness/i.test(iti.text) && /durability/i.test(iti.text), "tap a thing on the ground (" + itp.mat + "): inspect shows its material properties", { sel: iti.sel, text: iti.text.slice(0, 120) });
    await shot(tag + "_item");
    const clk = await ev("document.getElementById('clock').textContent"); check(/-?\d+°F/.test(clk) && /\b(1[0-2]|[1-9]):[0-5]\d (AM|PM)\b/.test(clk) && !/°C/.test(clk), "clock shows the air temperature in °F and a 12-hour time with AM/PM", clk);
    await ev("GS.app.select(null); (() => { const s = GS.app.sim; let n = 0; while (!s.discoveries.length && n++ < 3 * 1440) GS.Sim.step(s); })(); GS.UI.openSheet(true); GS.UI.update(GS.app); true"); await sleep(200);
    const bar0 = await ev("[...document.querySelectorAll('#panelbar button[role=tab]')].map(b => b.textContent).join()");
    await press("#ptab-discoveries"); await sleep(300);
    const dv = await q("(() => { const el = document.getElementById('panel-discoveries'), td = el.querySelector('td'), lw = document.getElementById('logwrap'); return { open: !el.classList.contains('closed') && getComputedStyle(el).display !== 'none', logOpen: !lw.classList.contains('closed'), rows: el.querySelectorAll('tbody tr').length, n: GS.app.sim.discoveries.length, fs: parseFloat(getComputedStyle(td || el).fontSize), group: td ? el.querySelector('tbody tr').lastElementChild.textContent : null, text: el.innerText.slice(0, 160) }; })()");
    check(bar0 === "Log,Discoveries,Prayers,People" && dv.open && !dv.logOpen && dv.rows === dv.n && dv.n > 0 && dv.fs >= 16 && /^(-|Group \d+)$/.test(dv.group), "Discoveries tab opens a table of firsts (who / when / what / result, group: '-' when she had none, else her group (step 18 groups can form first)), >= 16px", dv);
    const dl = await q("(() => { const s = document.getElementById('side').getBoundingClientRect(), b = document.getElementById('panelbar').getBoundingClientRect(), c = document.getElementById('cv').getBoundingClientRect(), d = document.getElementById('panel-discoveries').getBoundingClientRect(); return { s: [s.left, s.top, s.right, s.bottom].map(Math.round), barTop: Math.round(b.top), cvH: Math.round(c.height), d: [Math.round(d.width), Math.round(d.height)], logOff: document.body.classList.contains('log-off'), bare: document.getElementById('side').classList.contains('bare') }; })()");
    check(!dl.logOff && !dl.bare && Math.abs(dl.s[3] - dl.barTop) <= 1 && dl.s[0] <= 1 && dl.s[2] >= W - 1 && dl.d[0] > 100 && dl.d[1] > 40, "Discoveries open: its panel sits above the bottom bar, full width, and counts as a panel in use", dl);
    await shot(tag + "_discoveries");
    // ---- step 21: Prayers tab (action lines only, newest first, group filter, >= 16px text, >= 44px buttons) ----
    await ev("(() => { const s = GS.app.sim, A = s.agents; A.forEach((a, i) => { a.group = i % 2 ? null : 1; }); const F = ['kneel+raise', 'sway', 'circle+still', 'face:sun']; for (let i = 0; i < 6; i++) { const a = A[i % A.length], keep = a.act; a.needs.warmth = 20; GS.Faith.begin(s, a, { form: F[i % F.length], why: 'warmth', mins: 10 }); a.act = keep; s.tick++; } GS.UI.update(GS.app); })(); true");
    await press("#ptab-prayers"); await sleep(300);
    const PRST = "(() => { const el = document.getElementById('panel-prayers'), rows = [...el.querySelectorAll('.prl')], bs = [...el.querySelectorAll('.pfilt button')].map(b => b.getBoundingClientRect()); return { open: !el.classList.contains('closed') && getComputedStyle(el).display !== 'none', rows: rows.length, n: GS.app.sim.prayers.length, first: rows[0] ? rows[0].textContent : '', newest: GS.app.sim.prayers.at(-1).text, fs: rows[0] ? parseFloat(getComputedStyle(rows[0]).fontSize) : 0, bfs: Math.min(...[...el.querySelectorAll('.pfilt button')].map(b => parseFloat(getComputedStyle(b).fontSize))), bmin: Math.min(...bs.map(r => Math.min(r.width, r.height))), nb: bs.length, text: el.innerText }; })()";
    const pr0 = await q(PRST);
    check(pr0.open && pr0.rows === pr0.n && pr0.n >= 6 && pr0.first.indexOf(pr0.newest) >= 0 && pr0.fs >= 16 && pr0.bfs >= 16 && pr0.bmin >= 44 && pr0.nb >= 2 && !/["\u201c\u201d]|\b(says?|said|gods?)\b/i.test(pr0.text), "step 21 Prayers tab: action lines only, newest first, group filter buttons >= 44px, text >= 16px", { rows: pr0.rows, first: pr0.first, fs: pr0.fs, bmin: pr0.bmin, nb: pr0.nb });
    await press('.pfilt button[data-pf="1"]'); await sleep(250); const pr1 = await q(PRST);
    const want1 = await ev("GS.app.sim.prayers.filter(e => e.g === 1).length");
    check(pr1.rows === want1 && want1 > 0 && want1 < pr0.rows, "step 21 Prayers tab: the group filter shows only that group's lines", { all: pr0.rows, group1: pr1.rows, want: want1 });
    await press('.pfilt button[data-pf="all"]'); await sleep(200);
    // step 21 art: a praying person is drawn from pray_16.png (kneel then raise = kneel+arms up), a prayer spot from prayer_spot_16.png (cairn at 12+)
    const part = await ev(`(() => { const s = GS.app.sim, a = s.agents[0], R = GS.Render, A = R.art(), keep = a.act; R.lastPray = null;
      a.act = { type: "pray", form: "kneel+raise", acts: ["kneel", "raise"], done: ["kneel", "raise"], t: 12, n: 20, per: 10 };
      s.faith.spots.push({ x: Math.round(a.pos.x), y: Math.round(a.pos.y), n: 12, since: s.tick, last: s.tick }); R.draw(s, 1, 0, null);
      const out = { pray: !!A.pray, child: !!A.childPray, spot: !!A.spot, last: R.lastPray, spots: R.spotsDrawn, pose: R.prayPose(a, 0).col };
      a.act = { type: "pray", form: "offer:stick", acts: ["offer:stick"], t: 0, n: 20, per: 20 }; out.offer = R.prayPose(a, 0); a.act = { type: "pray", form: "still", acts: ["still"], t: 0, n: 20, per: 20 }; out.still = R.prayPose(a, 0).col;
      a.act = { type: "pray", form: "circle", acts: ["circle"], t: 0, n: 20, per: 20 }; out.circle = [0, 0.5, 1, 1.5].map(t => R.prayPose(a, t)).map(p => p.col + ":" + p.facing); R.draw(s, 1, 0.5, null); out.circleDrawn = R.lastPray;
      a.act = { type: "pray", form: "face:sun", acts: ["face:sun"], t: 0, n: 20, per: 20 }; out.face = R.prayPose(a, 0).col + ":" + R.prayPose(a, 0).facing;
      a.act = keep; s.faith.spots.pop(); return out; })()`);
    check(part.pray && part.child && part.spot && part.last === "kneel_arms_up" && part.spots >= 1 && part.offer.col === "kneel" && part.offer.item === "stick" && part.still === "sleep" && new Set(part.circle).size === 4 && part.circle.every(c => c.indexOf("walk:") === 0) && part.circleDrawn === "circle:right" && part.face === "walk:up",
      "step 21 art: prayer frames from pray_16 / child_pray_16 (kneel then arms up = kneel+arms up; offering = kneel + item; lie still = sleep row; circle = walk rows turning; face = walk row), prayer spots drawn from prayer_spot_16", part);
    await shot(tag + "_prayers");
    // ---- 26b People tab: All + group tabs, oldest→youngest, Fullness/Water/Energy/Warmth meters, Dead list, live <= 1/s ----
    await ev("(() => { const s = GS.app.sim; GS.app.select(null); if (!(s.bodies || []).some(b => !b.species)) GS.Sim.die(s, s.agents[s.agents.length - 1], 'cold'); s.agents[0].needs.warmth = 31; GS.UI.peopleFilter = 'all'; GS.UI.update(GS.app); })(); true");
    await press("#ptab-people"); await sleep(1200);
    const PPST = "(() => { const el = document.getElementById('panel-people'), rows = [...el.querySelectorAll('.prow')], d = el.querySelector('details.pdead'), tabs = [...el.querySelectorAll('.peop-tab')]; return { open: !el.classList.contains('closed') && getComputedStyle(el).display !== 'none', rows: rows.length, n: GS.app.sim.agents.length, names: rows.map(r => r.querySelector('.pn').textContent), ages: rows.map(r => parseInt(r.querySelector('.pa').textContent)), ids: rows.map(r => +r.dataset.pid), hmin: rows.length ? Math.min(...rows.map(r => r.getBoundingClientRect().height)) : 0, fsmin: Math.min(...[...el.querySelectorAll('.prow span, .prow b, .peop-tab, summary, .drow span')].map(e => parseFloat(getComputedStyle(e).fontSize))), tb: tabs.length ? Math.min(...tabs.map(b => Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width))) : 0, tabs: tabs.map(b => b.textContent.trim()), on: (tabs.find(b => b.classList.contains('on')) || {}).textContent, low: rows[0] ? rows[0].querySelectorAll('.pm.low').length : 0, first: rows[0] ? rows[0].innerText.replace(/\\s+/g, ' ') : '', deadOpen: d ? d.open : null, dead: d ? d.querySelector('summary').textContent : '', deadRows: d ? d.querySelectorAll('.drow').length : 0, logOpen: !document.getElementById('logwrap').classList.contains('closed'), groups: (GS.app.sim.groups || []).length, noSort: !el.querySelector('.psort') }; })()";
    const pp0 = await q(PPST);
    const desc = v => v.every((x, i) => !i || v[i - 1] >= x);
    const lowWant = await ev("(() => { const s = GS.app.sim, a = s.agents.slice().sort((p, q) => q.age - p.age || p.id - q.id)[0]; return ['fullness', 'water', 'energy', 'warmth'].filter(k => a.needs[k] < 50).length; })()");
    const wantTabs = await ev("(() => { const g = (GS.app.sim.groups || []).slice().sort((p, q) => p.id - q.id); return ['All'].concat(g.map(x => 'Group ' + x.id)); })()");
    check(pp0.open && !pp0.logOpen && pp0.rows === pp0.n && pp0.n > 0 && desc(pp0.ages) && pp0.noSort && JSON.stringify(pp0.tabs) === JSON.stringify(wantTabs) && pp0.on && pp0.on.trim() === 'All' && pp0.hmin >= 44 && pp0.fsmin >= 16 && pp0.tb >= 44 && pp0.low === lowWant && /Fullness/.test(pp0.first) && /Water/.test(pp0.first) && /Energy/.test(pp0.first) && /Warmth/.test(pp0.first) && / y · [FM] · /.test(pp0.first),
      "26b People tab: All + one tab per formed group; oldest→youngest; Fullness/Water/Energy/Warmth; no name/age sort; rows/tabs ≥44px, text ≥16px", { rows: pp0.rows, ages: pp0.ages, tabs: pp0.tabs, first: pp0.first, hmin: pp0.hmin, fs: pp0.fsmin, tb: pp0.tb });
    // group tab (if any formed): filters the list
    if (pp0.groups > 0) {
      await press('.peop-tab:nth-child(2)'); await sleep(300); const ppG = await q(PPST);
      const wantN = await ev("(() => { const g = (GS.app.sim.groups || []).slice().sort((p,q)=>p.id-q.id)[0]; return g.members.length; })()");
      check(ppG.rows === wantN && ppG.on && /Group/.test(ppG.on) && desc(ppG.ages), "26b People tab: group tab shows that group's members only (oldest→youngest)", { rows: ppG.rows, want: wantN, on: ppG.on });
      await press('.peop-tab:nth-child(1)'); await sleep(200);
    }
    // live: a need changes -> the row follows within about a second
    const pid = pp0.ids[0]; await ev("GS.app.sim.agents.find(a => a.id === " + pid + ").needs.water = 12; GS.UI.update(GS.app); true"); await sleep(1200); await ev("GS.UI.update(GS.app); true");
    const live = await q("(() => { const r = document.querySelector('#panel-people .prow[data-pid=\"" + pid + "\"]'); return r ? r.innerText.replace(/\\s+/g, ' ') : ''; })()");
    check(/Water 12\b/.test(live), "26b People tab: updates live (at most once a second)", live);
    // tap a row: that person's card opens and the map centres on them
    const tgt = pp0.ids[Math.min(1, pp0.ids.length - 1)]; await ev("GS.app.setSpeed(0); GS.Render.resetView(); true"); await press('.prow[data-pid="' + tgt + '"]'); await sleep(400);
    await ev("GS.UI.personTab = 'knows'; GS.UI.update(GS.app); true"); await sleep(60);
    const cen = await q("(() => { const R = GS.Render, v = R.view, a = GS.app.sim.agents.find(p => p.id === " + tgt + "), tp = 16, cx = (v.ox + v.bw / (2 * v.z)) / tp, cy = (v.oy + v.bh / (2 * v.z)) / tp, c = R.toClient(a.pos.x + 0.5, a.pos.y + 0.5), r = document.getElementById('cv').getBoundingClientRect(); return { sel: GS.app.selected, shown: !document.getElementById('info').hidden, name: document.querySelector('#info-body h3').textContent, want: a.name, z: v.z, dx: Math.abs(cx - a.pos.x - 0.5), dy: Math.abs(cy - a.pos.y - 0.5), inView: c.x >= r.left && c.x <= r.right && c.y >= r.top && c.y <= r.bottom, maxDx: v.bw / (2 * v.z * tp), maxDy: v.bh / (2 * v.z * tp), mw: 60, mh: 40, ox: v.ox, oy: v.oy, bw: v.bw, bh: v.bh, card: document.getElementById('info-body').innerText.match(/Known shelters: \\d+/) }; })()");
    const clampedX = cen.ox <= 0.01 || cen.ox >= 60 * 16 - cen.bw / cen.z - 0.01, clampedY = cen.oy <= 0.01 || cen.oy >= 40 * 16 - cen.bh / cen.z - 0.01;
    check(cen.sel === tgt && cen.shown && cen.name === cen.want && cen.z >= 2 && cen.inView && (cen.dx < 1.1 || clampedX) && (cen.dy < 1.1 || clampedY) && !!cen.card,
      "step 21b People tab: tapping a row opens that person's card (with 'Known shelters') and centres the map on them", cen);
    await ev("GS.app.select(null); GS.UI.update(GS.app); true"); await sleep(150);
    await press("#ptab-people"); await sleep(100); if (!(await ev("!document.getElementById('panel-people').classList.contains('closed')"))) { await press("#ptab-people"); await sleep(300); }
    const pp5 = await q(PPST); await ev("document.querySelector('details.pdead summary').scrollIntoView({ block: 'center' }); true"); await sleep(150); await press("details.pdead summary"); await sleep(1100); await ev("GS.UI.update(GS.app); true"); const pp6 = await q(PPST);
    const deadTxt = await ev("document.querySelector('details.pdead').innerText"), deadWant = await q("(GS.app.sim.bodies || []).filter(b => !b.species).map(b => [b.name, b.age, b.cause])");
    check(pp5.deadOpen === false && /^Dead \(\d+\)$/.test(pp5.dead) && pp6.deadOpen && pp6.deadRows === deadWant.length && deadWant.every(([n, a, c]) => deadTxt.indexOf(n) >= 0 && deadTxt.indexOf(a + " y") >= 0 && deadTxt.indexOf(c) >= 0),
      "step 21b People tab: a collapsed Dead section lists name, age at death and cause", { closed: pp5.dead, rows: pp6.deadRows, text: deadTxt.slice(0, 120) });
    await shot(tag + "_people");
    // ---- step 21b art: natural shelters drawn as overlays from shelter_16.png (cave / overhang / thicket; slot 2 blank, never used) ----
    const shd = await q("(() => { const s = GS.app.sim, R = GS.Render; R.draw(s, 1, 0, null); return { art: !!R.art().shelter, drawn: R.sheltersDrawn, tiles: s.shelters.reduce((n, q) => n + q.tiles.length, 0), n: s.shelters.length, types: s.shelters.map(q => q.type).join() }; })()");
    check(shd.art && shd.n >= 3 && shd.n <= 8 && shd.drawn === shd.tiles && !/hollow/.test(shd.types), "step 21b: natural shelters are drawn from shelter_16.png over the tile beneath (every shelter tile)", shd);
    if (!mobile && proto === "http") {   // proof: 4 seeds side by side with their shelters outlined
      const url = await ev(`(() => { const R = GS.Render, cv = document.getElementById('cv'), keep = GS.app.sim, seeds = [1, 4, 8, 14]; R.resetView();
        const sims = seeds.map(sd => GS.Sim.create(sd)); R.draw(sims[0], 1, 0, null); const w = cv.width, h = cv.height, k = w / (60 * 16);
        const out = document.createElement('canvas'); out.width = 2 * w + 8; out.height = 2 * h + 8; const o = out.getContext('2d'); o.fillStyle = '#111'; o.fillRect(0, 0, out.width, out.height);
        sims.forEach((s, i) => { R.draw(s, 1, 0, null); const ox = (i % 2) * (w + 8), oy = (i >> 1) * (h + 8); o.drawImage(cv, ox, oy);
          o.lineWidth = Math.max(2, Math.round(2 * k)); for (const q of s.shelters) for (const [x, y] of q.tiles) { o.strokeStyle = q.type === 'cave' ? '#ffd25a' : q.type === 'overhang' ? '#ff8a3a' : '#7dff8a'; o.strokeRect(ox + x * 16 * k + 1, oy + y * 16 * k + 1, 16 * k - 2, 16 * k - 2); }
          const fz = Math.max(16, Math.round(22 * k)), lab = 'seed ' + seeds[i] + ': ' + s.shelters.map(q => q.type[0] + q.tiles.length).join(' ') + '  (yellow cave, orange overhang, green thicket)'; o.font = fz + 'px sans-serif'; o.fillStyle = 'rgba(0,0,0,.7)'; o.fillRect(ox, oy, o.measureText(lab).width + fz, fz * 1.6); o.fillStyle = '#fff'; o.fillText(lab, ox + fz / 2, oy + fz * 1.15); });
        R.draw(keep, 1, 0, null); return out.toDataURL('image/png'); })()`);
      fs.writeFileSync(shotDir + "shelters_4seeds.png", Buffer.from(url.split(",")[1], "base64")); console.log("  screenshot", shotDir + "shelters_4seeds.png"); }
    await press("#ptab-log"); await sleep(200); await ev("GS.UI.openSheet(false); true"); await sleep(150);
    // bottom tab bar: "Log" and "Discoveries"; it opens/closes the log (filter tabs inside unchanged); the open/closed state survives a reload
    const LOGST = "{ bar: [...document.querySelectorAll('#panelbar button[role=tab]')].map(b => b.textContent).join(), open: getComputedStyle(document.getElementById('logwrap')).display !== 'none' && !document.getElementById('logwrap').classList.contains('closed'), on: document.getElementById('ptab-log').classList.contains('on'), pref: localStorage.getItem('godsim.ui'), fs: parseFloat(getComputedStyle(document.getElementById('ptab-log')).fontSize) }";
    await ev("GS.UI.openSheet(true); true"); await sleep(150); const lg0 = await q(LOGST); await press("#ptab-log"); await sleep(200); const lg1 = await q(LOGST);
    check(lg0.bar === "Log,Discoveries,Prayers,People" && lg0.open && lg0.on && lg0.fs >= 16 && !lg1.open && !lg1.on && /"panel":null/.test(lg1.pref), "tab bar has Log, Discoveries, Prayers and People (>= 16px); pressing it closes the log", { before: lg0.open, after: lg1.open, pref: lg1.pref });
    // reload: world paused while closed, continues from saved tick (pagehide save)
    await press("#speed-60"); await sleep(500); await press("#speed-0"); const tr = await ev("GS.app.sim.tick");
    await cmd("Page.navigate", { url: base }); await sleep(1500);
    const after = await q("{ tick: GS.app.sim.tick, seed: GS.app.sim.seed }"); check(after.seed === 42 && after.tick >= tr && after.tick <= tr + 1, "reload continues from the saved tick (no catch-up)", { before: tr, after: after.tick });
    await ev("GS.UI.openSheet(true); true"); await sleep(150); const lg2 = await q(LOGST); await press("#ptab-log"); await sleep(200); const lg3 = await q(LOGST);
    await cmd("Page.navigate", { url: base }); await sleep(1500); await ev("GS.UI.openSheet(true); true"); await sleep(150); const lg4 = await q(LOGST);
    check(!lg2.open && lg3.open && lg4.open && lg4.bar === "Log,Discoveries,Prayers,People" && (await ev("document.querySelectorAll('#tabs [role=tab]').length")) === 6, "log closed stays closed across a reload; reopened stays open (localStorage godsim.ui, not the save)", { afterReload: lg2.open, reopened: lg3.open, afterReload2: lg4.open });
    // ---- step 22: god powers bar (Rain / Warm / Cool): >= 44px buttons with icon + label, 16px text, on top and clear of the zoom / tab bar / card;
    //      Rain / Lightning / Spawn open a picker first; Warm / Cool arm on tap. No cooldowns. ----
    // fresh tab first (same reason as the rcfix block below: headless Chrome can stop delivering emulated touch to a tab after http navigations)
    if (mobile) { await newTab(); await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile, screenWidth: W, screenHeight: H, screenOrientation: W > H ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 } });
      await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); await cmd("Page.navigate", { url: base }); await sleep(1500); }
    await ev("GS.app.setSpeed(0); GS.app.select(null); GS.UI.power = null; GS.app.sim.powers = Object.assign(GS.Powers.newState(), { rs: GS.app.sim.powers.rs }); GS.UI.update(GS.app); true"); await sleep(200);
    // v19: on a portrait phone (< 700px) the power buttons live in a row the Powers tab slides up; it closes when a power is picked, so open it before each press
    const rowMode = W <= 700 && H > W, rowOpen = () => ev("document.body.classList.contains('pw-open')");
    const pwOpen = async () => { if (rowMode && !(await rowOpen())) { await press("#ptab-powers"); await sleep(300); } };
    const pPress = async sel => { await pwOpen(); await press(sel); await sleep(rowMode ? 300 : 0); };
    await pwOpen();
    const PWST = "(() => { const R = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }, vis = e => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden', X = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];" +
      " const bs = ['rain', 'warm', 'cool'].map(k => { const b = document.getElementById('power-' + k), r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), sv = b.querySelector('svg');" +
      " return { k, w: Math.round(r.width), h: Math.round(r.height), fs: Math.min(...[...b.querySelectorAll('span')].filter(vis).map(e => parseFloat(getComputedStyle(e).fontSize))), icon: sv && sv.getAttribute('data-icon'), lbl: b.querySelector('.lbl').textContent, cd: b.querySelector('.cd').textContent, on: b.classList.contains('on'), pressed: b.getAttribute('aria-pressed'), hit: !!h && (h === b || b.contains(h)), r: R(b) }; });" +
      " const bar = R(document.getElementById('powers')), rowM = innerWidth <= 700 && innerHeight > innerWidth, others = ['zoom', 'panelbar', 'top', 'info', 'logwrap', 'sheet-handle'].filter(id => !(rowM && id === 'logwrap')).map(id => document.getElementById(id)).filter(vis).filter(e => X(R(e), bar)).map(e => e.id);" +
      " const pw = GS.app.sim.powers; return { bs, bar, vh: innerHeight, vw: innerWidth, overlap: others, armed: GS.UI.power, effects: pw.effects.map(e => e.k + '@' + e.x + ',' + e.y), cd: Object.keys(pw.cd).filter(k => GS.Powers.cooldownLeft(GS.app.sim, k) > 0), toast: document.getElementById('toast').textContent, aiming: document.getElementById('cv').classList.contains('aiming') }; })()";
    const pw0 = await q(PWST);
    check(pw0.bs.length === 3 && pw0.bs.every(b => b.w >= 44 && b.h >= 44 && (b.fs >= 16 || (b.fs == null && W <= 700)) && b.hit && b.icon === b.k && b.lbl === { rain: "Rain", warm: "Warm", cool: "Cool" }[b.k] && b.cd === "" && !b.on && b.pressed === "false") && !pw0.overlap.length && pw0.bar[3] <= pw0.vh && pw0.bar[0] >= 0 && pw0.bar[2] <= pw0.vw,
      "step 22 powers bar: Rain / Warm / Cool buttons >= 44px with icon + label (step 23: label shown from 700px wide; aria-label always), text >= 16px, on top (hit-test), clear of zoom / tab bar / top bar / card / log", { bs: pw0.bs.map(b => [b.k, b.w, b.h, b.fs]), bar: pw0.bar.map(Math.round), overlap: pw0.overlap });
    // a free spot on the map near its centre (the canvas is what a tap there hits)
    const spot = await q("(() => { const cv = document.getElementById('cv'), r = document.getElementById('mapbox').getBoundingClientRect(), pb = document.getElementById('powers').getBoundingClientRect(), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; let best = null;" +
      " for (let y = r.top + 10; y < r.bottom - 10; y += 12) for (let x = r.left + 10; x < r.right - 10; x += 12) { if (document.elementFromPoint(x, y) !== cv || (y > pb.top - 20 && x < pb.right + 20)) continue; const d = Math.hypot(x - c.x, y - c.y); if (!best || d < best.d) best = { x, y, d }; }" +
      " const t = best && GS.Render.toTile(best.x, best.y); return best && { x: Math.round(best.x), y: Math.round(best.y), tx: Math.floor(t.x), ty: Math.floor(t.y) }; })()");
    // v19: Rain opens Light / Medium / Heavy (>= 44px, 16px); pick Medium, then tap the map. No cooldown — a second Rain cast is allowed at once.
    await pPress("#power-rain"); await sleep(150); const rainPick = await q("(() => { const pk = document.getElementById('spawnpick'); if (!pk || pk.hidden) return null; return [...pk.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(), sv = b.querySelector('svg'); return { id: b.id, t: (b.querySelector('.lbl')||b).textContent, str: b.dataset.str, icon: sv && sv.getAttribute('data-icon'), w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(getComputedStyle(b).fontSize) }; }); })()");
    check(!!rainPick && rainPick.map(b => b.str).join() === "light,medium,heavy" && rainPick.map(b => b.icon).join() === "rain_light,rain_medium,rain_heavy" && rainPick.every(b => b.w >= 44 && b.h >= 44 && b.fs >= 16),
      "v19 rain picker: Light / Medium / Heavy with Artist icons (>= 44px, 16px)", { rainPick });
    await press("#rain-medium"); await sleep(100); const pw1 = await q(PWST); await pPress("#power-rain"); const pw2 = await q(PWST);
    await pPress("#power-rain"); await press("#rain-medium"); await sleep(80); await tap(spot.x, spot.y); await sleep(200); const pw3 = await q(PWST);
    await pPress("#power-rain"); await press("#rain-medium"); await sleep(80); await tap(spot.x, spot.y); await sleep(200); const pw4 = await q(PWST);
    await pPress("#power-warm"); await tap(spot.x, spot.y); await sleep(200); const pw5 = await q(PWST);
    const rb = pw3.bs.find(b => b.k === "rain"), log3 = await q("GS.app.sim.log.slice(-8).map(e => e.text)");
    const rains = pw4.effects.filter(e => e.startsWith("rain@")).length;
    check(pw1.armed === "rain" && pw1.bs[0].on && pw1.bs[0].pressed === "true" && pw1.aiming && pw2.armed === null && !pw2.effects.length && pw3.armed === null && pw3.effects.length === 1 && pw3.effects[0] === "rain@" + spot.tx + "," + spot.ty &&
      rb.cd === "" && !pw3.cd.length && log3.some(t => /^Rain falls near the /.test(t)) && rains === 2 && pw5.effects.length >= 3 && /warm@/.test(pw5.effects.join()) && !pw5.cd.length,
      "v19 powers: Rain opens a picker (Medium), then tap casts; no cooldown (a second Rain and Warm cast at once); cancel works", { tile: spot && [spot.tx, spot.ty], cd: rb.cd, rains, effects: pw5.effects, log: log3.filter(t => /rain|air/i.test(t)) });
    const art = await q("(() => { const im = GS.Render.art().rain; return { w: im ? im.naturalWidth : 0, h: im ? im.naturalHeight : 0 }; })()");
    for (let i = 0; i < 3; i++) { await ev("GS.UI.update(GS.app); true"); await sleep(160); } await shot(tag + "_powers");
    check(art.w === 64 && art.h === 16 && errs.length === 0, "step 22 rain art loaded (4 x 16px frames) and drawn over the circle without errors", art);
    await ev("GS.app.sim.powers = Object.assign(GS.Powers.newState(), { rs: GS.app.sim.powers.rs }); GS.UI.power = null; GS.UI.update(GS.app); true");
    // ---- step 23: Lightning + Spawn join the bar (5 buttons >= 44px, icons; labels hidden on phones in portrait); Spawn opens a Grazer / Scavenger picker
    //      (>= 44px, 16px); Spawn / Lightning open pickers; no cooldowns; Lightning Single bolt strikes the tap (bolt art) ----
    const PW5 = "(() => { const R = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }, vis = e => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden', X = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];" +
      " const hb = b => { const r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === b || b.contains(h)); };" +
      " const fz = b => Math.min(...[...b.querySelectorAll('span'), b].filter(vis).filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)));" +
      " const bs = GS.data.config.powers.order.map(k => { const b = document.getElementById('power-' + k), r = b.getBoundingClientRect(), sv = b.querySelector('svg'); return { k, w: Math.round(r.width), h: Math.round(r.height), fs: fz(b), icon: sv && sv.getAttribute('data-icon'), aria: b.getAttribute('aria-label'), lblShown: vis(b.querySelector('.lbl')), cd: b.querySelector('.cd').textContent, on: b.classList.contains('on'), hit: hb(b), r: R(b) }; });" +
      " const pk = document.getElementById('spawnpick'), pbs = pk ? [...pk.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { kind: b.dataset.kind, t: b.textContent, w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(getComputedStyle(b).fontSize), hit: vis(b) && hb(b) }; }) : [];" +
      " const pwv = vis(document.getElementById('powers')), bar = R(document.getElementById('powers')), pkr = pk && vis(pk) ? R(pk) : null, rowM = innerWidth <= 700 && innerHeight > innerWidth, others = ['zoom', 'panelbar', 'top', 'info', 'logwrap', 'sheet-handle'].filter(id => !(rowM && id === 'logwrap')).map(id => document.getElementById(id)).filter(vis).filter(e => (pwv && X(R(e), bar)) || (pkr && X(R(e), pkr))).map(e => e.id);" +
      " const s = GS.app.sim; return { bs, bar, pick: pkr, pbs, pickOverBar: !!pkr && pwv && X(pkr, bar), rowOpen: document.body.classList.contains('pw-open'), tabArmed: !!document.getElementById('ptab-powers') && document.getElementById('ptab-powers').classList.contains('armed'), vh: innerHeight, vw: innerWidth, overlap: others, armed: GS.UI.power, kind: GS.UI.spawnKind, toast: document.getElementById('toast').textContent, animals: s.animals.length, spawned: s.animals.filter(a => a.spawned != null).map(a => a.species), fx: s.fx.map(f => f.k), cdl: GS.Powers.cooldownLeft(s, 'lightning'), cds: GS.Powers.cooldownLeft(s, 'spawn') }; })()";
    await pwOpen(); const GS_TM = await q("GS.data.config.time.tickGameMinutes"), p50 = await q(PW5);
    check(p50.bs.length === 5 && p50.bs.every(b => b.w >= 44 && b.h >= 44 && b.hit && b.icon === b.k && /^(Rain|Warm|Cool|Lightning|Spawn)/.test(b.aria) && (b.lblShown ? b.fs >= 16 : true) && !b.on) && (W > 700 ? p50.bs.every(b => b.lblShown) : true) && !p50.overlap.length && p50.bar[3] <= p50.vh && p50.bar[0] >= 0 && p50.bar[2] <= p50.vw && !p50.pick,
      "step 23 powers bar: Rain / Warm / Cool / Lightning / Spawn >= 44px with icons (labels >= 16px; icons only on a phone in portrait), on top, inside the screen, clear of zoom / tab bar / card / log", { bs: p50.bs.map(b => [b.k, b.w, b.h, b.lblShown ? b.fs : "icon"]), bar: p50.bar.map(Math.round), overlap: p50.overlap });
    // a land spot on the map (free tile, away from the bar and picker)
    const land = await q("(() => { const cv = document.getElementById('cv'), r = document.getElementById('mapbox').getBoundingClientRect(), pb = document.getElementById('powers').getBoundingClientRect(), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, s = GS.app.sim; let best = null;" +
      " for (let y = r.top + 10; y < r.bottom - 10; y += 12) for (let x = r.left + 10; x < r.right - 10; x += 12) { if (document.elementFromPoint(x, y) !== cv || (y > pb.top - 140 && x < pb.right + 20)) continue; const t = GS.Render.toTile(x, y), tx = Math.floor(t.x), ty = Math.floor(t.y);" +
      " if (!GS.World.walkable(s.world, tx, ty) || !GS.Powers.spawnTile(s, tx, ty) || GS.Powers.ground(s, tx, ty) === 'water') continue; const d = Math.hypot(x - c.x, y - c.y); if (!best || d < best.d) best = { x: Math.round(x), y: Math.round(y), d, tx, ty }; } return best; })()");
    await pPress("#power-spawn"); await sleep(150); const p51 = await q(PW5);
    check(!!p51.pick && p51.pbs.length === 3 && p51.pbs.map(b => b.kind).join() === "grazer,predator,wolves" && p51.pbs.every(b => b.w >= 44 && b.h >= 44 && b.fs >= 16 && b.hit) && !p51.overlap.length && !p51.pickOverBar && p51.pick[0] >= 0 && p51.pick[2] <= p51.vw && p51.pick[1] >= 0 && p51.armed === null && p51.bs.find(b => b.k === "spawn").on,
      "step 23 spawn picker: tapping Spawn shows deer / wild dog / Wolves (>= 44px, 16px, on top, clear of the bar and other panels); nothing armed until one is picked", { pick: p51.pick && p51.pick.map(Math.round), pbs: p51.pbs.map(b => [b.t, b.w, b.h, b.fs]), overlap: p51.overlap });
    await press("#spawn-grazer"); await sleep(100); const p52 = await q(PW5); await tap(land.x, land.y); await sleep(120); const p53 = await q(PW5); await sleep(300); await shot(tag + "_spawn");
    await pPress("#power-spawn"); await sleep(100); const p54 = await q(PW5);
    check(p52.armed === "spawn" && p52.kind === "grazer" && !p52.pick && p53.armed === null && p53.animals === p50.animals + 1 && p53.spawned.join() === "grazer" && p53.fx.includes("shimmer") && /^deer near /i.test(p53.toast) && p53.cds === 0 && p53.bs.find(b => b.k === "spawn").cd === "" && !!p54.pick && !/ready in/.test(p54.toast),
      "v19 spawn: pick deer, tap land: one grazer appears with a shimmer; no cooldown (Spawn opens the picker again at once)", { tile: land && [land.tx, land.ty], toast: p53.toast, cd: p53.bs.find(b => b.k === "spawn").cd, toast2: p54.toast });
    await pPress("#power-spawn"); await sleep(80);   // cancel the reopened spawn picker
    await pPress("#power-lightning"); await sleep(150); const boltPick = await q("(() => { const pk = document.getElementById('spawnpick'); if (!pk || pk.hidden) return null; return [...pk.querySelectorAll('button')].map(b => { const sv = b.querySelector('svg'); return { id: b.id, t: (b.querySelector('.lbl')||b).textContent, mode: b.dataset.mode, icon: sv && sv.getAttribute('data-icon'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), fs: parseFloat(getComputedStyle(b).fontSize) }; }); })()");
    check(!!boltPick && boltPick.map(b => b.mode).join() === "single,barrage" && boltPick.map(b => b.icon).join() === "bolt_single,bolt_barrage" && boltPick.every(b => b.w >= 44 && b.h >= 44 && b.fs >= 16),
      "v19 lightning picker: Single bolt / Barrage with Artist icons (>= 44px, 16px)", { boltPick });
    await press("#bolt-single"); await sleep(100); const p55 = await q(PW5); await tap(land.x, land.y); await sleep(40); await shot(tag + "_lightning"); const p56 = await q(PW5);
    const lart = await q("(() => { const im = GS.Render.art().lightning; return { w: im ? im.naturalWidth : 0, h: im ? im.naturalHeight : 0 }; })()"), log5 = await q("GS.app.sim.log.slice(-8).map(e => e.text)");
    check(p55.armed === "lightning" && p56.armed === null && p56.fx.includes("bolt") && log5.some(t => /^Lightning strikes /.test(t)) && /^(Single bolt|Lightning) near /.test(p56.toast) && p56.cdl === 0 && p56.bs.find(b => b.k === "lightning").cd === "" && lart.w === 48 && lart.h === 48 && errs.length === 0,
      "v19 lightning: Single bolt + tap strikes that tile (bolt art 48x48); no cooldown", { toast: p56.toast, art: lart, log: log5.filter(t => /Lightning|flat|flash|flinch/.test(t)) });
    await ev("GS.app.sim.powers = Object.assign(GS.Powers.newState(), { rs: GS.app.sim.powers.rs }); GS.UI.power = null; GS.UI.update(GS.app); true");
    // ---- v19 (Director + Artist): portrait phones < 700px: no floating power bar; the Powers tab in the bottom bar slides up one 56px row just above the bar;
    //      picking a power closes it (the whole map is free to tap); the tab is highlighted while a power waits for its spot. Elsewhere: unchanged, no tab ----
    { await ev("GS.app.sim.powers = Object.assign(GS.Powers.newState(), { rs: GS.app.sim.powers.rs }); GS.UI.power = null; GS.UI.powerRow(GS.app, false); GS.app.select(null); GS.UI.update(GS.app); true"); await sleep(350);
      const RW = "(() => { const R = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }, vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';" +
        " const cv = document.getElementById('cv'), mb = R(document.getElementById('mapbox')), pw = document.getElementById('powers'), pk = document.getElementById('spawnpick'), tab = document.getElementById('ptab-powers'), bar = document.getElementById('panelbar');" +
        " const cover = []; for (let y = mb[1] + 2; y < mb[3] - 1; y += 10) for (let x = mb[0] + 2; x < mb[2] - 1; x += 10) { const h = document.elementFromPoint(x, y); if (h && (pw.contains(h) || (pk && pk.contains(h)))) cover.push([Math.round(x), Math.round(y)]); }" +
        " const tr = tab && R(tab), th = tab && document.elementFromPoint((tr[0] + tr[2]) / 2, (tr[1] + tr[3]) / 2), cs = tab && getComputedStyle(tab);" +
        " const bs = GS.data.config.powers.order.map(k => { const b = document.getElementById('power-' + k), r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { k, w: Math.round(r.width), h: Math.round(r.height), hit: !!h && (h === b || b.contains(h)) }; });" +
        " const lbl = tab && tab.querySelector('.lbl'); return { cover: cover.length, coverAt: cover.slice(0, 3), rowVis: vis(pw), row: R(pw).map(Math.round), barTop: Math.round(bar.getBoundingClientRect().top), mapBottom: Math.round(mb[3]), open: document.body.classList.contains('pw-open')," +
        " tab: tab ? { shown: vis(tab), w: Math.round(tr[2] - tr[0]), h: Math.round(tr[3] - tr[1]), hit: !!th && (th === tab || tab.contains(th)), armed: tab.classList.contains('armed'), bg: cs.backgroundColor, exp: tab.getAttribute('aria-expanded'), icon: !!tab.querySelector('svg[data-icon=powers]'), fs: vis(lbl) ? parseFloat(getComputedStyle(lbl).fontSize) : null, aria: tab.getAttribute('aria-label') } : null," +
        " bs, pick: vis(pk), armed: GS.UI.power, toast: document.getElementById('toast').textContent, cdl: GS.Powers.cooldownLeft(GS.app.sim, 'lightning') }; })()";
      if (rowMode) {
        const r0 = await q(RW); await shot(tag + "_powerrow_closed");
        check(!r0.open && !r0.rowVis && r0.cover === 0 && r0.tab && r0.tab.shown && r0.tab.w >= 44 && r0.tab.h >= 44 && r0.tab.hit && r0.tab.icon && !r0.tab.armed && r0.tab.exp === "false" && (r0.tab.fs == null || r0.tab.fs >= 16),
          "v19 phone row closed: no floating power bar, nothing over the map (every 10px of the map hits the map, not a power button); the Powers tab is in the bottom bar (>= 44px, icon, on top)", { cover: r0.cover, at: r0.coverAt, tab: r0.tab });
        await press("#ptab-powers"); await sleep(350); const r1 = await q(RW); await shot(tag + "_powerrow_open");
        check(r1.open && r1.rowVis && r1.row[3] - r1.row[1] === 56 && Math.abs(r1.row[3] - r1.barTop) <= 1 && r1.row[0] >= 0 && r1.row[2] <= W && r1.bs.length === 5 && r1.bs.every(b => b.w >= 44 && b.h >= 44 && b.hit) && r1.tab.exp === "true" && !r1.tab.armed,
          "v19 phone: the Powers tab slides up one 56px row of 5 power icons (>= 44px, on top) just above the bottom bar", { row: r1.row, barTop: r1.barTop, bs: r1.bs.map(b => [b.k, b.w, b.h]) });
        const r1b = await q(RW); await press("#ptab-powers"); await sleep(350); const r1c = await q(RW);
        check(!r1c.open && !r1c.rowVis && r1c.cover === 0, "v19 phone: tapping the Powers tab again closes the row (nothing over the map)", { cover: r1c.cover });
        await press("#ptab-powers"); await sleep(350); await press("#power-lightning"); await sleep(350); const r2p = await q(RW);
        check(!r2p.open && !r2p.rowVis && r2p.pick && r2p.armed === null && r2p.tab.armed,
          "v19 phone: Lightning closes the row and shows Single bolt / Barrage (same picker pattern as Spawn); tab highlighted", { pick: r2p.pick, tab: r2p.tab && r2p.tab.armed });
        await press("#bolt-single"); await sleep(200); const r2 = await q(RW);
        const bg0 = r0.tab.bg;
        check(!r2.open && !r2.rowVis && !r2.pick && r2.cover === 0 && r2.armed === "lightning" && r2.tab.armed && r2.tab.bg !== bg0 && /Lightning/.test(r2.tab.aria),
          "v19 phone: picking Single bolt closes the picker; the whole map is free to tap; the Powers tab stays highlighted", { armed: r2.armed, tab: [r2.tab.armed, bg0, r2.tab.bg, r2.tab.aria], cover: r2.cover });
        // the spot: a land tile in the lower part of the map (where the row was), proving it is tappable
        const low = await q("(() => { const cv = document.getElementById('cv'), r = document.getElementById('mapbox').getBoundingClientRect(), s = GS.app.sim; for (let y = r.bottom - 8; y > r.top + r.height / 2; y -= 8) for (let x = r.left + 30; x < r.right - 30; x += 12) { if (document.elementFromPoint(x, y) !== cv) continue; const t = GS.Render.toTile(x, y), tx = Math.floor(t.x), ty = Math.floor(t.y); if (GS.World.walkable(s.world, tx, ty)) return { x: Math.round(x), y: Math.round(y), tx, ty }; } return null; })()");
        await tap(low.x, low.y); await sleep(150); const r3 = await q(RW);
        check(r3.armed === null && !r3.tab.armed && r3.cdl === 0 && /^(Single bolt|Lightning) near /.test(r3.toast) && !r3.open,
          "v19 phone: tapping the spot (low on the map, where the row was) casts it; the Powers tab highlight goes off; no cooldown", { at: low, toast: r3.toast });
        await ev("GS.app.sim.powers = Object.assign(GS.Powers.newState(), { rs: GS.app.sim.powers.rs }); GS.UI.update(GS.app); true");
        await press("#ptab-powers"); await sleep(350); await press("#power-spawn"); await sleep(350); const r4 = await q(RW);
        await press("#spawn-grazer"); await sleep(200); const r5 = await q(RW);
        await ev("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true"); await sleep(150); const r6 = await q(RW);
        check(!r4.open && r4.pick && r4.tab.armed && r4.armed === null && !r5.pick && r5.armed === "spawn" && r5.tab.armed && r5.cover === 0 && r6.armed === null && !r6.tab.armed,
          "v19 phone: Spawn closes the row and shows the deer / wild dog / Wolves picker (tab highlighted); a pick leaves the whole map free with the tab still highlighted; cancel clears it", { r4: [r4.open, r4.pick, r4.tab.armed], r5: [r5.pick, r5.armed, r5.tab.armed, r5.cover], r6: r6.tab.armed });
        await shot(tag + "_powerrow");
      } else {
        const r0 = await q(RW);
        check(r0.tab && !r0.tab.shown && r0.rowVis && r0.bs.every(b => b.w >= 44 && b.h >= 44 && b.hit), "v19: no Powers tab here (desktop / landscape); the power bar floats on the map as before", { tab: r0.tab && r0.tab.shown, row: r0.row });
      }
      await ev("GS.app.sim.powers = Object.assign(GS.Powers.newState(), { rs: GS.app.sim.powers.rs }); GS.UI.power = null; GS.UI.powerRow(GS.app, false); GS.UI.update(GS.app); true"); }
    // ---- v19 (step 24) Find button (Commissioner + Director): on every person's card (locate icon + "Find", >= 44px, 16px text). It centres the map on them,
    //      pulses their ring for 3 s and follows them until a pan or a tap elsewhere; from the map card, the People tab and the Log; a phone closes the panel ----
    { const panel0 = await q("GS.UI.panel"); await ev("GS.app.setSpeed(0); GS.UI.power = null; GS.UI.powerRow(GS.app, false); GS.app.select(null); GS.Render.follow = null; GS.Render.resetView(); GS.UI.update(GS.app); true"); await sleep(200);
      // one adult in the middle of the map (so the map edge never stops the centring)
      const fid = await q("(() => { const s = GS.app.sim, w = s.world, a = s.agents.find(q => q.age >= 16) || s.agents[0]; for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.floor(w.w / 2) + dx, y = Math.floor(w.h / 2) + dy;" +
        " if (GS.World.walkable(w, x, y) && GS.World.walkable(w, x + 3, y) && s.agents.every(b => b === a || Math.hypot(b.pos.x - x, b.pos.y - y) > 6) && s.animals.every(b => Math.hypot(b.pos.x - x, b.pos.y - y) > 3)) { a.pos = { x, y }; s.prev[a.id] = { x, y }; a.act = { type: 'idle', until: s.tick + 600 }; return a.id; } } return a.id; })()");
      const FS = id => "(() => { const R = GS.Render, s = GS.app.sim, a = s.agents.find(q => q.id === " + id + "), cv = document.getElementById('cv'), r = cv.getBoundingClientRect(), f = GS.UI.focusFrac();" +
        " const p = R.toClient(a.pos.x + 0.5, a.pos.y + 0.5), tile = 16 * R.view.z / R.view.bw * r.width, want = { x: r.left + f.fx * r.width, y: r.top + f.fy * r.height }, h = document.elementFromPoint(p.x, p.y);" +
        " const b = document.querySelector('#info-body .findbtn'), br = b && b.getBoundingClientRect(), bh = b && document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2), lb = b && b.querySelector('span');" +
        " return { sel: GS.app.selected, follow: R.follow, pulsing: R.pulsing(" + id + "), z: R.view.z, dx: Math.round(p.x - want.x), dy: Math.round(p.y - want.y), tile: +tile.toFixed(1), onMap: h === cv, panel: GS.UI.panel," +
        " btn: b ? { w: Math.round(br.width), h: Math.round(br.height), hit: !!bh && (bh === b || b.contains(bh)), on: bh && (bh.id || bh.className || bh.tagName), icon: !!b.querySelector('svg[data-icon=locate]'), text: lb && lb.textContent, fs: parseFloat(getComputedStyle(lb).fontSize), id: +b.dataset.find } : null,"+
        " cvH: Math.round(r.height) }; })()";
      const centred = o => Math.abs(o.dx) <= Math.max(2, o.tile * 0.6) && Math.abs(o.dy) <= Math.max(2, o.tile * 0.6) && o.onMap;
      // the pulse as drawn: Render notes the last pulsing ring it drew (file:// taints the canvas, so no pixel reads)
      const PD = "(() => { const d = GS.Render.pulseDrawn; return d ? { id: d.id, scale: d.scale, n: d.n, ageMs: Math.round(performance.now() - d.at * 1000) } : null; })()";
      // 1) from the People tab
      if (!(await ev("GS.UI.panel === 'people'"))) await press("#ptab-people"); await sleep(300);
      await ev("GS.UI.panelRender.people(GS.app, document.getElementById('panel-people'), true); true");
      await press('#panel-people button[data-pid="' + fid + '"]'); await sleep(250);
      await ev("GS.Render.resetView(); GS.UI.zoomUI(); true"); await sleep(100);
      const f0 = await q(FS(fid));
      check(f0.sel === fid && f0.btn && f0.btn.w >= 44 && f0.btn.h >= 44 && f0.btn.hit && f0.btn.icon && f0.btn.text === "Find" && f0.btn.fs >= 16 && f0.btn.id === fid,
        "v19 Find: the card opened from the People tab has a Find button (locate crosshair + 'Find', >= 44px, 16px text, on top)", f0.btn);
      const cvH0 = f0.cvH; await press("#info-body .findbtn"); await sleep(250); const f1 = await q(FS(fid)); await sleep(500); const pd1 = await q(PD);
      check(f1.sel === fid && f1.follow === fid && f1.pulsing && f1.z >= 2 && centred(f1) && (W <= 700 ? f1.panel === null && f1.cvH > cvH0 : f1.panel === "people"),
        "v19 Find from the People tab: the map is centred on them (zoom >= 2, in the part of the map the card leaves free), their ring pulses" + (W <= 700 ? "; the phone closed the People panel so the map got the room" : "; the panel stays open on desktop"), { dx: f1.dx, dy: f1.dy, tile: f1.tile, z: f1.z, panel: f1.panel, cvH: [cvH0, f1.cvH] });
      await shot(tag + "_find");
      await ev("(() => { const s = GS.app.sim, a = s.agents.find(q => q.id === " + fid + "); s.prev[a.id] = { x: a.pos.x, y: a.pos.y }; a.pos = { x: a.pos.x + 3, y: a.pos.y }; s.prev[a.id] = { x: a.pos.x, y: a.pos.y }; return true; })()"); await sleep(300);
      const f2 = await q(FS(fid));
      check(f2.follow === fid && centred(f2), "v19 Find: the camera follows them (moved 3 tiles, still centred)", { dx: f2.dx, dy: f2.dy });
      await sleep(Math.max(0, 3300 - 600)); const f3 = await q(FS(fid)), pd3 = await q(PD);
      check(!!pd1 && pd1.id === fid && pd1.n >= 5 && pd1.scale > 1 && pd1.ageMs < 200 && !f3.pulsing && pd3.n >= pd1.n && pd3.ageMs > 150,
        "v19 Find: their ring is drawn pulsing (bigger and brighter, every frame), then stops after 3 s", { during: pd1, after: pd3 });
      const cr = await q("(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()");
      await drag(cr.l + cr.w * 0.25, cr.t + cr.h * 0.2, cr.l + cr.w * 0.4, cr.t + cr.h * 0.3); await sleep(150);
      await ev("(() => { const s = GS.app.sim, a = s.agents.find(q => q.id === " + fid + "); a.pos = { x: a.pos.x - 3, y: a.pos.y }; s.prev[a.id] = { x: a.pos.x, y: a.pos.y }; return true; })()"); await sleep(300);
      const f4 = await q(FS(fid));
      check(f4.follow === null && !centred(f4), "v19 Find: a pan ends the follow (moved back 3 tiles, the view stays put)", { dx: f4.dx, dy: f4.dy });

      // 2) from the map card (tap her on the map)
      await ev("GS.app.select(null); GS.UI.update(GS.app); (() => { const a = GS.app.sim.agents.find(q => q.id === " + fid + "); GS.Render.centerOn(a.pos.x + 4, a.pos.y + 2, 2); GS.UI.zoomUI(); })(); true"); await sleep(250);
      const pp = await q("(() => { const a = GS.app.sim.agents.find(q => q.id === " + fid + "), p = GS.Render.toClient(a.pos.x + 0.5, a.pos.y + 0.5); return { x: Math.round(p.x), y: Math.round(p.y) }; })()");
      await tap(pp.x, pp.y); await sleep(250); let m0 = await q(FS(fid)); const tapped = m0.sel === fid;
      if (!tapped) { await ev("GS.app.select(" + fid + "); true"); await sleep(200); }
      await press("#info-body .findbtn"); await sleep(250); const m1 = await q(FS(fid));
      check(tapped && m0.btn && m1.follow === fid && m1.pulsing && centred(m1), "v19 Find from the map card (tap her on the map, then Find): centred and pulsing", { tapped, sel: m0.sel, at: pp, dx: m1.dx, dy: m1.dy });
      const far = await q("(() => { const cv = document.getElementById('cv'), r = cv.getBoundingClientRect(); for (const [fx, fy] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.3], [0.85, 0.3], [0.3, 0.5], [0.7, 0.5], [0.3, 0.7], [0.7, 0.7], [0.5, 0.3]]) { const x = r.left + fx * r.width, y = r.top + fy * r.height; if (document.elementFromPoint(x, y) === cv) return { x: Math.round(x), y: Math.round(y) }; } return null; })()");
      await tap(far.x, far.y); await sleep(200); const m2 = await q(FS(fid));
      check(m2.follow === null, "v19 Find: a tap elsewhere on the map ends the follow", { at: far, follow: m2.follow });

      // 3) from the Log: a person's name in a log line opens their card (44px tap area), then Find
      await ev("GS.app.select(null); GS.Render.resetView(); GS.UI.zoomUI(); if (GS.UI.panel !== 'log') { GS.UI.panel = 'log'; GS.UI._logKey = null; } GS.UI.tab = 'all'; const a = GS.app.sim.agents.find(q => q.id === " + fid + "); GS.Sim.log(GS.app.sim, a.name + ' looks around', a); GS.UI._logKey = null; GS.UI.update(GS.app); true"); await sleep(300);
      const ln = await q("(() => { const b = document.querySelector('#log button.logn[data-sel=\"" + fid + "\"]'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), ev = b.closest('.ev'); return { w: Math.round(r.width), h: Math.round(r.height), hit: !!h && (h === b || b.contains(h)), fs: parseFloat(getComputedStyle(b).fontSize), t: b.textContent, lineH: Math.round(ev.getBoundingClientRect().height) }; })()");
      await sleep(150); if (ln) await press('#log button.logn[data-sel="' + fid + '"]'); await sleep(250); const l0 = await q(FS(fid));
      check(!!ln && ln.w >= 44 && ln.h >= 44 && ln.hit && ln.fs >= 16 && l0.sel === fid && !!l0.btn, "v19: a person's name in the Log is a button (>= 44px tap area, 16px) that opens their card, with Find", { ln, sel: l0.sel });
      const lc = l0.cvH; await press("#info-body .findbtn"); await sleep(250); const l1 = await q(FS(fid));
      check(l1.follow === fid && l1.pulsing && centred(l1) && (W <= 700 ? l1.panel === null : l1.panel === "log"), "v19 Find from the Log card: centred and pulsing" + (W <= 700 ? "; the phone closed the Log panel" : ""), { dx: l1.dx, dy: l1.dy, panel: l1.panel });
      await ev("GS.Render.follow = null; GS.Render.pulse = null; GS.app.select(null); GS.Render.resetView(); GS.UI.zoomUI(); GS.UI.update(GS.app); true"); await sleep(200);
      // the People tab press above saved "people" as the open panel (prefs); press back to the panel the run had, so later checks (and fresh tabs) see it
      { const cur = await q("GS.UI.panel"); if (cur !== panel0) { await press("#ptab-" + (panel0 || cur)); await sleep(300); } }
      check((await q("GS.UI.panel")) === panel0, "v19 Find checks leave the panel as it was", panel0); }
    // ---- rcfix: Log closed -> the map grows into the freed space; 44px Log tab / close target on phones; Log state persists on every size ----
    const isLand = mobile && W > H;
    // fresh tab on the same origin (localStorage carries over): headless Chrome stops delivering emulated touch events to a tab after some
    // navigations on http (only the synthetic click arrives), which would make the canvas tap below a harness failure rather than an app one
    if (mobile) { await newTab(); await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile, screenWidth: W, screenHeight: H, screenOrientation: W > H ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 } });
      await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); await cmd("Page.navigate", { url: base }); await sleep(1500); }
    // visible map = canvas rect minus whatever part of it the (fixed) phone-landscape sheet covers
    const MAPA = "(() => { const c = document.getElementById('cv').getBoundingClientRect(), s = document.getElementById('side').getBoundingClientRect(), fx = getComputedStyle(document.getElementById('side')).position === 'fixed'; const O = r => Math.max(0, Math.min(c.right, r.right) - Math.max(c.left, r.left)) * Math.max(0, Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top)); let ov = fx ? O(s) : 0; if (!fx) for (const e of [document.getElementById('info'), document.getElementById('logwrap'), ...document.querySelectorAll('#side .panel')]) { const cs = getComputedStyle(e); if (!e.hidden && cs.display !== 'none' && /absolute|fixed/.test(cs.position) && e.getBoundingClientRect().height > 0) ov += O(e.getBoundingClientRect()); } const v = GS.Render.view, mw = GS.data.config.map.w * GS.data.config.map.tilePx, mh = GS.data.config.map.h * GS.data.config.map.tilePx; return { w: Math.round(c.width), h: Math.round(c.height), inView: c.left >= -1 && c.top >= -1 && c.right <= innerWidth + 1 && c.bottom <= innerHeight + 1, area: Math.round(c.width * c.height - ov), z: v.z, clamped: v.ox >= -1e-6 && v.oy >= -1e-6 && v.ox <= mw - v.bw / v.z + 1e-6 && v.oy <= mh - v.bh / v.z + 1e-6, sideW: Math.round(s.width), sideH: Math.round(s.height), scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, open: getComputedStyle(document.getElementById('logwrap')).display !== 'none' && !document.getElementById('logwrap').classList.contains('closed') }; })()";
    await ev("GS.app.setSpeed(0); GS.app.select(null); GS.Render.resetView(); GS.Render.zoomTo(3); GS.Render.panBy(-5000, -5000); true"); await sleep(250);   // zoomed and panned hard to the bottom-right
    const mo = await q(MAPA); await press("#ptab-log"); await sleep(300); const mc = await q(MAPA);
    const GROW = mobile ? 1.15 : 1.05;   // desktop: the log floats over the full-height map, so closing it uncovers (rather than resizes) the map
    check(mo.open && !mc.open && mc.area > mo.area * GROW && mc.inView && !mc.scroll, "Log closed: the visible map grows into the freed space (visible map area, open vs closed)", { open: [mo.w, mo.h, mo.area], closed: [mc.w, mc.h, mc.area] });
    check(mc.z === 3 && mc.clamped && mo.clamped, "Log open/close keeps zoom and the pan clamped to the map", { z: mc.z, clampedOpen: mo.clamped, clampedClosed: mc.clamped });
    if (!mobile) check(mc.area >= 0.99 * mc.w * mc.h && mo.area < 0.95 * mo.w * mo.h && mc.w === mo.w, "desktop: Log closed uncovers the whole map (panels float over a full-height map)", { open: [mo.w, mo.h, mo.area], closed: [mc.w, mc.h, mc.area] });
    const bc2 = await q(BAR); check(Math.abs(bc2.b[3] - bc2.vh) <= 8 && bc2.bs.every(x => x.hit), "Log closed: the tab bar stays at the bottom and its Log button stays reachable", bc2.b);
    await ev("(() => { GS.Render.resetView(); const v = GS.Render.view, p = GS.app.sim.agents[0].pos; v.ox = (p.x + 0.5) * GS.data.config.map.tilePx - v.bw / 2; GS.Render.panBy(0, 0); return true; })()"); await sleep(150); const pcl = await q(PERSON); await tap(pcl.x, pcl.y); await sleep(300); if (!(await ev("GS.app.selected"))) { await tap(pcl.x, pcl.y); await sleep(300); }
    check(await ev("GS.app.selected") === ID, "with the Log closed, tapping a person still selects them (input maps to the resized canvas)", { at: pcl, dbg: await q("(() => { const t = GS.Render.toTile(" + pcl.x + "," + pcl.y + "), e = document.elementFromPoint(" + pcl.x + "," + pcl.y + "); return { sel: GS.app.selected, t, pos: GS.app.sim.agents[0].pos, scr: GS.Render.screen[" + ID + "], hit: e && (e.id || e.tagName), view: GS.Render.view }; })()") });
    await ev("GS.app.select(null); GS.Render.zoomTo(3); " + (isLand ? "GS.UI.openSheet(true); " : "") + "true"); await sleep(250); const mc2 = await q(MAPA);   // landscape: same sheet state as the open measurement
    await press("#ptab-log"); await sleep(300); const mr = await q(MAPA);
    check(mr.open && Math.abs(mr.area - mo.area) <= mo.area * 0.02 && mr.z === 3 && mr.clamped && !mr.scroll, "reopening the Log gives the map its old size back, zoom kept", { reopened: [mr.w, mr.h, mr.area], before: [mo.w, mo.h, mo.area], closedAgain: mc2.area });
    await ev("GS.Render.resetView(); true");
    const TGT = sel => q("(() => { const e = document.querySelector('" + sel + "'), r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: Math.round(r.width), h: Math.round(r.height), hit: !!h && (h === e || e.contains(h)), fs: parseFloat(getComputedStyle(e).fontSize) }; })()");
    if (mobile) { if (isLand) { await ev("GS.UI.openSheet(true); true"); await sleep(200); }
      const lt = await TGT("#ptab-log"); check(lt.w >= 44 && lt.h >= 44 && lt.hit && lt.fs >= 16, "phone: Log tab is a >= 44x44px tap target, on top, 16px+ text", lt);
      if (isLand) { const ht = await TGT("#sheet-handle"); check(ht.w >= 44 && ht.h >= 44 && ht.hit, "phone landscape, sheet open: the close handle stays visible and >= 44px", ht);
        await ev("GS.app.select(GS.app.sim.agents[0].id); true"); await sleep(250); const ht2 = await TGT("#sheet-handle"), lt2 = await TGT("#ptab-log");
        check(ht2.hit && ht2.h >= 44 && lt2.hit && lt2.h >= 44 && lt2.w >= 44, "phone landscape, sheet open with a person inspected: close handle and Log tab still visible at >= 44px", { handle: ht2, log: lt2 });
        await press("#sheet-handle"); check(!(await ev("document.getElementById('side').classList.contains('open')")), "phone landscape: tapping the handle closes the open sheet");
        await ev("GS.app.select(null); true"); } }
    // persistence: set the state with taps only, reload, and read what is on screen (no openSheet call after the reload)
    const LOGVIS = "(() => { const l = document.getElementById('logwrap'), r = l.getBoundingClientRect(), s = document.getElementById('side'); return { vis: getComputedStyle(l).display !== 'none' && r.height > 40 && r.top < innerHeight - 20, on: document.getElementById('ptab-log').classList.contains('on'), sheet: s.classList.contains('open'), pref: localStorage.getItem('godsim.ui') }; })()";
    const reload = async () => { await press("#speed-0"); await cmd("Page.navigate", { url: base }); await sleep(1500); };
    if (isLand && !(await ev("document.getElementById('side').classList.contains('open')"))) await press("#sheet-handle");
    if (!(await ev("document.getElementById('ptab-log').classList.contains('on')"))) await press("#ptab-log");
    await sleep(200); const pv0 = await q(LOGVIS); await reload(); const pv1 = await q(LOGVIS);
    check(pv0.vis && pv1.vis && pv1.on && (!isLand || pv1.sheet), "Log open survives a reload and is on screen (localStorage godsim.ui)", { before: pv0.vis, after: pv1.vis, pref: pv1.pref });
    await press("#ptab-log"); await sleep(200); const pv2 = await q(LOGVIS); await reload(); const pv3 = await q(LOGVIS); const mcl = await q(MAPA);
    check(!pv2.vis && !pv3.vis && !pv3.on && /"panel":null/.test(pv3.pref) && (mobile ? mcl.sideH === 0 : mcl.area >= 0.99 * mcl.w * mcl.h) && mcl.area > mo.area * GROW, "Log closed survives a reload: no panel above the bar, map still the larger size", { after: pv3.vis, pref: pv3.pref, map: mcl.area, panel: [mcl.sideW, mcl.sideH] });
    if (isLand) { const ml = await q(MAPA); check(ml.area >= 0.98 * ml.w * ml.h && ml.h >= 250, "phone landscape: with the Log closed the whole map canvas is uncovered", ml); }
    await press("#ptab-log"); await sleep(200); const pv5 = await q(LOGVIS); await reload(); const pv6 = await q(LOGVIS);
    check(pv5.vis && pv6.vis && pv6.on && (!isLand || pv6.sheet), "Log reopened from the bottom bar stays open across a reload" + (isLand ? " (sheet open)" : ""), { pref: pv6.pref });
    const fz2 = await q("[...document.querySelectorAll('#top *, #side *, #zoom *, #panelbar *')].filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)).filter(x => x < 16)");
    check(fz2.length === 0, "after the Log toggles and reloads, all visible text is still >= 16px", fz2);
    // new world from a seed
    await ev("document.getElementById('seed').value = '777'; true"); await pressF("#btn-new"); await sleep(300);
    const nw = await q("{ seed: GS.app.sim.seed, tick: GS.app.sim.tick, shown: document.getElementById('seedshow').textContent }"); check(nw.seed === 777 && nw.tick === 0 && /777/.test(nw.shown), "New world from seed 777", nw);
    // night shading + fast-forward look
    // run the new world to 22:00 so the founders have lain down: sleep row + 'z', inspect shows asleep
    const ns = await q("(() => { GS.app.setSpeed(0); const s = GS.app.sim; while (s.tick < 16 * 60) GS.Sim.step(s); const z = s.agents.filter(a => a.act.type === 'sleep'); GS.app.select((z[0] || s.agents[0]).id); return { asleep: z.length, of: s.agents.length }; })()");
    await sleep(300); await shot(tag + "_night");
    const np = await ev("document.getElementById('info-body').innerText");
    check(ns.asleep >= ns.of - 1 && /asleep since/i.test(np) && /Energy\s+(?:[a-z]+\s+)?\d+\/100/.test(np), "by 22:00 the founders are asleep; inspect shows 'asleep since' and energy", ns);
    const nightClock = await ev("document.getElementById('clock').textContent"); check(/10:00 PM/.test(nightClock), "clock shows night time (12-hour)", nightClock);
    if (proto === "http") { await ev("GS.app.sim.tick = 7 * 60; true"); await sleep(250);
      const px = await q("(() => { const c = document.getElementById('cv'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4 * 97) s += d[i] + d[i + 1] + d[i + 2]; return s; })()");
      await ev("GS.app.sim.tick = 16 * 60; true"); await sleep(250);
      const pn = await q("(() => { const c = document.getElementById('cv'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4 * 97) s += d[i] + d[i + 1] + d[i + 2]; return s; })()");
      check(pn < px * 0.7, "night is darker than day on the canvas", { day: px, night: pn }); }
    // motion: the card animates in 150-250 ms; prefers-reduced-motion turns animations and transitions off
    const anim = async () => { await ev("GS.app.select(null); GS.UI.update(GS.app); true"); await sleep(150); await ev("GS.app.select(GS.app.sim.agents[0].id); GS.UI.update(GS.app); true"); await sleep(50);
      return q("(() => { const c = getComputedStyle(document.getElementById('info')); return { name: c.animationName, dur: parseFloat(c.animationDuration), tr: getComputedStyle(document.getElementById('speed-1')).transitionDuration }; })()"); };
    const m0 = await anim(); await cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); const m1 = await anim(); await cmd("Emulation.setEmulatedMedia", { features: [] }); await ev("GS.app.select(null); true");
    check(m0.name !== "none" && m0.dur >= 0.15 && m0.dur <= 0.25 && m1.name === "none" && /^0s(, 0s)*$/.test(m1.tr), "card animates in 150-250 ms; prefers-reduced-motion: no animation or transition", { normal: m0, reduced: m1 });
    // step 16 (Commissioner): every visible text shows °F and 12-hour times; check with the log, Discoveries and a person's card open
    const vis = await q("(() => { const s = GS.app.sim; GS.app.select(s.agents[0].id); GS.UI.update(GS.app); const parts = [document.body.innerText]; parts.push(document.getElementById('log').textContent, document.getElementById('panel-discoveries').textContent, document.getElementById('plog') ? document.getElementById('plog').textContent : ''); const t = parts.join('\\n'); return { c: (t.match(/[^\\n]{0,30}°C[^\\n]{0,10}/g) || []).slice(0, 3), h24: (t.match(/\\b\\d{1,2}:\\d{2}\\b(?! ?[AP]M)/g) || []).slice(0, 5), f: /°F/.test(t), ampm: (t.match(/\\d:\\d\\d [AP]M/g) || []).length }; })()");
    check(!vis.c.length && !vis.h24.length && vis.f && vis.ampm > 0, "no visible °C or 24-hour time (clock, log, Discoveries, person card)", vis);
    await ev("GS.app.select(null); true");
    check(!(await ev("document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight || scrollY > 0 || scrollX > 0")), "no page scroll after all interactions");
    check(errs.length === 0, "no JS errors", errs.length ? errs : "none");
  }
  console.log("missing files (404):", missing.length ? missing.join(", ") : "none"); if (missing.length) fail++;
  sock.close(); cleanup(); srv.close();
  console.log(fail ? "CHROME CHECK FAILED (" + fail + ")" : "CHROME CHECK PASSED"); process.exit(fail ? 1 : 0);
})();
