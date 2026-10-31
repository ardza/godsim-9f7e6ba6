// v39.3: self-contained version of the Tester's repro (tests/p392c_repro.js, which drives localhost:8787 via .gt/cdp.js).
// Serves a godsim root itself (default: this folder) and runs 40 human-speed clicks (120 ms press -> release) on People cards
// at 1920x1080 and 1366x768, paused (seed 3871, 2400 ticks). Run: node --experimental-websocket tests/p393_clicks.js [root]
const { spawn } = require("child_process"), http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(process.argv[2] || path.join(__dirname, "..")), sleep = ms => new Promise(r => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".ttf": "font/ttf", ".svg": "image/svg+xml" };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split("?")[0]); if (u.endsWith("/")) u += "index.html"; const f = path.join(root, u); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); s.end(b); }); });
const prof = fs.mkdtempSync("/tmp/godsim393c-"); let ch;
(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const base = "http://127.0.0.1:" + srv.address().port;
  ch = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore", detached: true });
  let port; for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = +fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch (e) {} }
  let allOk = true;
  for (const [W, H] of [[1920, 1080], [1366, 768]]) {
    const t = await (await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" })).json();
    const sock = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => sock.onopen = r); let id = 0; const pend = {};
    sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result || d); delete pend[d.id]; } };
    const send = (method, params = {}) => new Promise(r => { pend[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
    const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.value; };
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: base + "/tests/" }); await sleep(600); await ev("localStorage.clear();true");
    await send("Page.navigate", { url: base + "/?seed=3871&t=" + Date.now() }); await sleep(3000);
    await ev("(()=>{const s=GS.app.sim;for(let i=0;i<2400;i++)GS.Sim.step(s);GS.app.setSpeed(0);GS.UI.update(GS.app);return 1})()");
    const pids = await ev("[...document.querySelectorAll('#panel-people .pp-row')].map(b => +b.dataset.pid)");
    const W4 = [3, 2, 6, 5].every(p => pids.includes(p)) ? [3, 2, 6, 5] : pids.slice(0, 4);
    let ok = 0, wrong = 0, miss = 0; const N = 40;
    for (let i = 0; i < N; i++) { const want = W4[i % 4];
      const c = await ev("(()=>{GS.app.selected=null;const b=document.querySelector('#panel-people .pp-row[data-pid=\"" + want + "\"]');if(!b)return null;const q=b.getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height/2}})()");
      if (!c) { miss++; continue; }
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 }); await sleep(120);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 }); await sleep(250 + (i * 37) % 300);
      const s = await ev("GS.app.selected"); if (s === want) ok++; else if (s == null) miss++; else wrong++; }
    console.log(W + "x" + H + " paused, 120ms clicks:", JSON.stringify({ ok, miss, wrong, N, pids: W4 })); if (ok !== N) allOk = false; sock.close();
  }
  try { process.kill(-ch.pid); } catch (e) {} srv.close(); process.exit(allOk ? 0 : 1);
})().catch(e => { console.error(e); try { process.kill(-ch.pid); } catch (x) {} process.exit(2); });
