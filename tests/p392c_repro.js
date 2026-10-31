(async()=>{const {send,ev,errs,sleep}=await require('./cdp.js')();
await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://localhost:8787/tests/'}); await sleep(600); await ev('localStorage.clear();true');
await send('Page.navigate',{url:'http://localhost:8787/?seed=3871&t='+Date.now()}); await sleep(3000);
await ev(`(()=>{const s=GS.app.sim;for(let i=0;i<2400;i++)GS.Sim.step(s);GS.app.setSpeed(0);GS.UI.update(GS.app);return 1})()`);
let ok=0,wrong=0,miss=0; const N=40;
for(let i=0;i<N;i++){
 const want=[3,2,6,5][i%4];
 const c=JSON.parse(await ev(`(()=>{GS.app.selected=null;const b=document.querySelector('#panel-people .pp-row[data-pid="${want}"]');const q=b.getBoundingClientRect();return JSON.stringify({x:q.left+q.width/2,y:q.top+q.height/2})})()`));
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:c.x,y:c.y});
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:c.x,y:c.y,button:'left',clickCount:1});
 await sleep(120);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:c.x,y:c.y,button:'left',clickCount:1});
 await sleep(250+ (i*37)%300);
 const s=await ev('GS.app.selected'); if(s===want) ok++; else if(s==null) miss++; else wrong++;
}
console.log('1920 paused, 120ms clicks:',{ok,miss,wrong,N});
process.exit(0)})();
