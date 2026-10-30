// v38 (f) Chrome smoke: plain load + ?fixture=wolves (every kind) on desktop 1366x768 + phone 390x844; text >= 16px; 0 JS errors.
// Run: node --experimental-websocket tests/chrome_v38f.js   (screenshots → /workspace/godsim-previews/v38/)
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = "/workspace/godsim-previews/v38/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const missing = [];
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { if (!/favicon/.test(q.url)) missing.push(q.url); s.writeHead(404); s.end(); return; } s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); s.end(b); }); });
const prof = fs.mkdtempSync("/tmp/godsim38f-"); let ch;
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const HP = srv.address().port;
  ch = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore", detached: true });
  let port; for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = +fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch (e) {} }
  let fail = 0; const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (x !== undefined ? "  " + JSON.stringify(x) : "")); if (!c) fail++; };
  for (const [W, H, mobile] of [[1366, 768, false], [390, 844, true]]) {
    const tag = mobile ? "phone_390x844" : "desktop_1366x768";
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
    for (const q of ["", "&fixture=wolves", "&fixture=wolves&kind=dog", "&fixture=wolves&kind=flee", "&fixture=wolves&kind=corpse", "&fixture=wolves&kind=lone", "&fixture=wolves&kind=spawn"]) {
      await cmd("Page.navigate", { url: "http://127.0.0.1:" + HP + "/index.html?seed=3871" + q }); await sleep(2500);
      const k = (q.match(/kind=(\w+)/) || [])[1] || (q ? "fight" : "plain");
      check(await ev("!!(window.GS && GS.app && GS.app.sim && GS.data.config.saveVersion === 38)"), tag + " loads v38 " + (q || "(no fixture)"));
      if (!q) continue;
      const st = await ev("(() => { const s = GS.app.sim, w = s.animals.filter(a => a.species === 'wolves'); return { wolves: w.length, packs: (s.packs || []).length, sel: GS.app.selected != null } })()");
      check(st && (k === "spawn" ? st.wolves === 0 : st.wolves > 0), tag + " " + k + " fixture: Wolves " + (k === "spawn" ? "removed" : "present"), st);
      await ev("(() => { for (let i = 0; i < 60; i++) GS.Sim.step(GS.app.sim); GS.UI.update(GS.app); })()"); await sleep(400);
      const fs16 = await ev("(() => { let m = 99; for (const e of document.querySelectorAll('#info-body *, #log *')) { if (!e.offsetParent || !e.textContent.trim() || e.children.length) continue; m = Math.min(m, parseFloat(getComputedStyle(e).fontSize)); } return m; })()");
      check(fs16 >= 16, tag + " " + k + " fixture: visible panel text >= 16px", fs16);
      if (k === "fight" || k === "dog") await shot("wolves_" + k);
    }
    check(errs.length === 0, tag + " 0 JS errors", errs);
    sock.close();
  }
  check(missing.length === 0, "no missing files", missing);
  console.log(fail ? fail + " FAIL" : "ALL PASS"); try { process.kill(-ch.pid); } catch (e) {} srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { process.kill(-ch.pid); } catch (x) {} process.exit(1); });
