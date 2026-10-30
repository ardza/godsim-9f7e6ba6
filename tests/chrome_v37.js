// §40 / v37 quick Chrome smoke: http, desktop 1280x800 + phone 390x844; console errors; screenshots of Powers / Prayers / People / person card.
// Run: node tests/chrome_v37.js   (screenshots → /workspace/godsim-previews/v37/)
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = "/workspace/godsim-previews/v37/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const missing = [];
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { if (!/favicon/.test(q.url)) missing.push(q.url); s.writeHead(404); s.end(); return; } s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); s.end(b); }); });
const prof = fs.mkdtempSync("/tmp/godsim37-"); let ch;
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const HP = srv.address().port;
  ch = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore", detached: true });
  let port; for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = +fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch (e) {} }
  let fail = 0; const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (x !== undefined ? "  " + JSON.stringify(x) : "")); if (!c) fail++; };
  for (const [W, H, mobile] of [[1280, 800, false], [390, 844, true]]) {
    const tag = mobile ? "phone_390x844" : "desktop_1280x800";
    const t = await (await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" })).json();
    const sock = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => sock.onopen = r);
    let id = 0; const pend = {}, errs = [];
    sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result || d); delete pend[d.id]; }
      if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push("console.error: " + d.params.args.map(a => a.value || a.description).join(" "));
      if (d.method === "Runtime.exceptionThrown") errs.push("exception: " + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text));
      if (d.method === "Log.entryAdded" && d.params.entry.level === "error" && !/favicon/.test(d.params.entry.url || "")) errs.push("log: " + d.params.entry.text + " " + (d.params.entry.url || "")); };
    const cmd = (method, params = {}) => new Promise(r => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
    const ev = async e => { const r = await cmd("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) errs.push("eval: " + e.slice(0, 60) + " → " + (r.exceptionDetails.exception || {}).description); return r.result && r.result.value; };
    const shot = async n => { const f = out + tag + "_" + n + ".png"; fs.writeFileSync(f, Buffer.from((await cmd("Page.captureScreenshot", { format: "png" })).data, "base64")); console.log("  screenshot " + f); };
    await cmd("Runtime.enable"); await cmd("Log.enable"); await cmd("Page.enable");
    await cmd("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile });
    if (mobile) await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cmd("Page.navigate", { url: "http://127.0.0.1:" + HP + "/index.html?seed=3737" }); await sleep(3000);
    check(await ev("!!(window.GS && GS.app && GS.app.sim && GS.data.config.saveVersion === 37)"), tag + " loads v37 sim");
    await ev("GS.app.setSpeed && GS.app.setSpeed(0)");
    // Powers: open (phone: the row), arm Heal so the hint + armed style show
    if (mobile) await ev("document.getElementById('ptab-powers') && document.getElementById('ptab-powers').click()");
    await sleep(300); await ev("GS.UI.armPower(GS.app, 'heal')"); if (mobile) await ev("GS.UI.powerRow(GS.app, true)"); await sleep(300);
    const pw = await ev("(() => { const b = document.getElementById('power-heal'), r = b.getBoundingClientRect(), cs = getComputedStyle(b), h = document.getElementById('pw-hint'), cats = [...document.querySelectorAll('#powers .pw-cat h4')].map(x => x.textContent); return { w: r.width, h: r.height, vis: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight, bg: cs.backgroundColor, ol: cs.outlineColor, lbl: getComputedStyle(b.querySelector('.lbl')).display, lfs: getComputedStyle(b.querySelector('.lbl')).fontSize, hint: h && h.textContent, cats, n: document.querySelectorAll('#powers button.pw').length }; })()");
    check(pw && pw.vis && pw.w >= 84 && pw.h >= 64 && pw.cats.join() === "Weather,Healing,Creatures,Harm" && pw.n === 9 && pw.lbl !== "none" && pw.lfs === "16px" && pw.bg === "rgb(138, 90, 46)" && /79, 195, 217/.test(pw.ol) && pw.hint === "Heal waiting: tap a person", tag + " Powers menu: 4 categories, 84x64, labels 16px, armed colours, hint", pw);
    await shot("powers");
    await ev("GS.UI.armPower(GS.app, 'heal')"); if (mobile) await ev("GS.UI.powerRow(GS.app, false)"); await sleep(200);
    // Prayers: add two prayer rows, open the tab
    await ev("(() => { const s = GS.app.sim; GS.Faith.feed(s, s.agents[0], s.agents[0].name + ' kneels and raises both hands', 'food'); GS.Faith.feed(s, s.agents[1], s.agents[1].name + ' kneels by the fire and bows low', 'energy'); })()");
    await ev("document.getElementById('ptab-prayers').click()"); await sleep(400); await ev("GS.UI.update(GS.app)"); await sleep(300);
    const pr = await ev("(() => { const b = document.querySelector('.pr-bless'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, n: document.querySelectorAll('.pr-bless').length, icon: !!b.querySelector('svg[data-icon=bless]'), fs: getComputedStyle(b).fontSize }; })()");
    check(pr && pr.h >= 44 && pr.w >= 44 && pr.icon && pr.fs === "16px", tag + " Prayers: Bless button 44px with icon", pr);
    await shot("prayers");
    const bl = await ev("(() => { const a = GS.app.sim.agents[0], e0 = a.needs.energy; document.querySelector('.pr-bless').click(); return { blessed: GS.app.sim.prayers.filter(e => e.blessed != null).length }; })()");
    check(bl && bl.blessed === 1, tag + " Bless click answers one prayer", bl);
    // People
    await ev("document.getElementById('ptab-people').click()"); await sleep(400); await ev("GS.UI.update(GS.app)"); await sleep(1100); await ev("GS.UI.update(GS.app)"); await sleep(200);
    const pp = await ev("(() => { const d = document.querySelector('.pp-row .pp-sex'); if (!d) return null; const r = d.getBoundingClientRect(), row = d.closest('.pp-row').getBoundingClientRect(); return { w: r.width, h: r.height, n: document.querySelectorAll('.pp-row .pp-sex').length, rows: document.querySelectorAll('.pp-row').length, bg: getComputedStyle(d).backgroundColor, rowH: row.height }; })()");
    check(pp && pp.w === 10 && pp.h === 10 && pp.n === pp.rows && pp.rowH >= 44, tag + " People: 10px sex dot on every row", pp);
    await shot("people");
    // person card: one hurt person (gash leg, broken arm), some wolf fear
    await ev("(() => { const s = GS.app.sim, a = s.agents[2]; GS.Injury.add(s, a, 'legR', 'gash'); GS.Injury.add(s, a, 'armL', 'broken'); a.health = 62; a.wolfFear = 18; GS.UI.personTab = 'needs'; GS.app.select(a.id); GS.UI.update(GS.app); })()"); await sleep(600);
    await ev("GS.UI.update(GS.app)"); await sleep(200);
    const pc = await ev("(() => { const f = document.querySelector('#info-body .pp-figure'), r = f && f.getBoundingClientRect(), li = [...document.querySelectorAll('#info-body .pp-injuries li')].map(x => x.textContent), lg = document.querySelector('#pp-part-legR'), am = document.querySelector('#pp-part-armL'); return f ? { w: r.width, h: r.height, svg: f.tagName, li, legR: lg && lg.getAttribute('fill'), armL: am && am.getAttribute('fill'), health: !!document.querySelector('#info-body .pp-health .pp-meter') } : null; })()");
    check(pc && pc.w === 64 && pc.h === 128 && pc.health && pc.li.some(t => /gash.*slow/.test(t)) && pc.li.some(t => /broken.*no tools/.test(t)) && pc.legR === "#e0a84f" && pc.armL === "#e05a6e", tag + " person card: Health bar, 64x128 figure coloured, injury list with effects", pc);
    await cmd("Runtime.evaluate", { expression: "document.querySelector('#info-body .pp-health') && document.querySelector('#info-body .pp-health').scrollIntoView()" }); await sleep(200);
    await shot("person_card");
    await ev("(() => { GS.UI.personTab = 'mind'; GS.UI.update(GS.app); })()"); await sleep(300);
    const mind = await ev("[...document.querySelectorAll('#info-body .pp-skill span')].map(x => x.textContent).filter(t => /wolves/.test(t))");
    check(mind && mind.length === 1, tag + " Mind tab: Fear of wolves row", mind);
    await shot("person_mind");
    check(!errs.length, tag + " no console errors", errs.slice(0, 5));
    check(!missing.length, tag + " no 404s", missing.slice(0, 5));
    sock.close(); await fetch("http://127.0.0.1:" + port + "/json/close/" + t.id).catch(() => {});
  }
  console.log(fail ? fail + " FAILED" : "SMOKE ALL PASS");
  try { process.kill(-ch.pid, "SIGKILL"); } catch (e) {} fs.rmSync(prof, { recursive: true, force: true }); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { process.kill(-ch.pid, "SIGKILL"); } catch (x) {} process.exit(1); });
