// v38 (e) Chrome smoke: ?fixture=history on desktop 1280x800 + phone 390x844; the A & B view, Back, a name tap on Kin; 0 JS errors.
// Run: node tests/chrome_v38e.js   (screenshots → /workspace/godsim-previews/v38/)
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = "/workspace/godsim-previews/v38/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const missing = [];
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { if (!/favicon/.test(q.url)) missing.push(q.url); s.writeHead(404); s.end(); return; } s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); s.end(b); }); });
const prof = fs.mkdtempSync("/tmp/godsim38e-"); let ch;
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
    await cmd("Page.navigate", { url: "http://127.0.0.1:" + HP + "/index.html?seed=3860&fixture=history" }); await sleep(3000);
    check(await ev("!!(window.GS && GS.app && GS.app.sim && GS.data.config.saveVersion === 38)"), tag + " loads v38 with ?fixture=history");
    await ev("GS.app.setSpeed && GS.app.setSpeed(0)"); await sleep(300);
    const tap = sel => ev("(() => { const e = document.querySelector('" + sel + "'); if (!e) return false; e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' })); return true; })()");
    const view = () => ev("(() => { const p = document.querySelector('#info-body .pp-pair'); if (!p) return null; const b = p.querySelector('button.pp-back'), r = b.getBoundingClientRect(), n = p.querySelector('.pp-pairnames'); return { names: n.textContent, nfs: getComputedStyle(n).fontSize, bh: r.height, bfs: getComputedStyle(b).fontSize, bvis: r.width > 0 && r.bottom <= innerHeight + 2, rows: [...p.querySelectorAll('.ev')].map(x => x.textContent), rfs: p.querySelector('.ev') && getComputedStyle(p.querySelector('.ev')).fontSize, tabs: document.querySelectorAll('#info-body .pp-tabs button, #info-body [data-ptab]').length }; })()");
    let v = await view();
    check(v && /^\S+ & \S+$/.test(v.names) && v.rows.length === 3 && /stay close by night now/.test(v.rows[0]) && /cache/.test(v.rows[1]) && /took the last of the meat/.test(v.rows[2]) && v.bh >= 44 && v.bfs === "16px" && parseFloat(v.nfs) >= 16 && parseFloat(v.rfs) >= 16, tag + " the A & B view opens: both names, back button, the 3 shared lines newest first", v);
    await shot("pair_log");
    await tap("#info-body [data-pairback]"); await sleep(400);
    const back = await ev("({ pair: !!document.querySelector('#info-body .pp-pair'), log: document.querySelectorAll('#info-body .plog .ev').length, links: document.querySelectorAll('#info-body [data-pair]').length })");
    check(back && !back.pair && back.log > 3 && back.links > 0, tag + " Back returns to A's Log tab, whose other names are links", back);
    await ev("GS.UI.personTab = 'kin'; GS.UI._personCardKey = null; GS.UI.update(GS.app)"); await sleep(300);
    const bId = await ev("String(GS.app.sim.agents.find(q => q.id === GS.app.selected).mate)");
    check(await tap("#info-body [data-pair=\"" + bId + "\"]"), tag + " Kin tab has the partner's name as a link"); await sleep(400);
    v = await view(); check(v && v.rows.length === 3, tag + " tapping the partner on Kin opens the same 3 lines", v && v.rows);
    await shot("pair_kin");
    check(errs.length === 0, tag + " 0 JS errors", errs);
    sock.close();
  }
  check(missing.length === 0, "no missing files", missing);
  console.log(fail ? fail + " FAIL" : "ALL PASS"); try { process.kill(-ch.pid); } catch (e) {} srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { process.kill(-ch.pid); } catch (x) {} process.exit(1); });
