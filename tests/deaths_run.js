const root=process.env.ROOT||'/workspace/godsim';
const vm=require('vm'),fs=require('fs'),path=require('path');
const ctx={console,Math,JSON}; vm.createContext(ctx);
for (const f of ["data/config.js","data/tiles.js","data/names.js","data/art.js","data/materials.js","src/rng.js","src/world.js","src/climate.js","src/agent.js","src/animal.js","src/objects.js","src/fire.js","src/learn.js","src/hunt.js","src/cook.js","src/social.js","src/family.js","src/faith.js","src/shelter.js","src/powers.js","src/sim.js"]) if (fs.existsSync(path.join(root,f))) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const G=ctx.GS; const seed=+process.argv[2], years=+(process.argv[3]||2);
const C=G.data.config, tm=C.time.tickGameMinutes, Y=1440*G.Time.daysPerYear()/tm;
const D=[]; const _bc=G.Body.create; G.Body.create=function(sim,a,cause){const b=_bc.apply(this,arguments); if(b&&!b.species) D.push(b); return b;};
const s=G.Sim.create(seed); const out={seed,start:s.agents.length}; const FS=s.agents.map(a=>a.sex).sort().join('');
const SK={hours:0,any1:0,idle1:0,any3:0}; for(let y=1;y<=years;y++){ for(let i=0;i<Y;i++){ G.Sim.step(s); if(i%60===0){ const L=s.items.filter(it=>it.lit&&it.heldBy==null); if(L.length){ SK.hours++; const ch=(a,it)=>Math.max(Math.abs(it.x-Math.round(a.pos.x)),Math.abs(it.y-Math.round(a.pos.y))); const ad=s.agents.filter(a=>a.age>=12); if(ad.some(a=>L.some(it=>ch(a,it)<=1))) SK.any1++; if(ad.some(a=>a.act.type==='idle'&&L.some(it=>ch(a,it)<=1))) SK.idle1++; if(ad.some(a=>L.some(it=>ch(a,it)<=3))) SK.any3++; } } } out['y'+y]=s.agents.length+s.babies.length; }
const K=C.child, d=[];
for(const b of D){ const st=b.baby?'baby':b.age<K.youthAt?'child':b.age<K.adultAt?'youth':'adult'; d.push({c:b.cause,st,season:G.Time.at(b.diedAt).season,day:G.Time.at(b.diedAt).day,age:b.age}); }
out.deaths=d; out.sticks=SK; out.orphans={adoptions:s.famStats.adoptions||0,babyDeaths:s.famStats.babyDeaths||0,rescues:s.famStats.rescues||0,urgentWarm:s.famStats.urgentWarm||0}; const F=s.famStats; Object.assign(out,{births:F.births,conc:F.conceptions,grabs:s.fireStats.grabs||0,pickups:s.fireStats.brandPickups||0,brandSits:s.fireStats.brandSits||0,draws:s.fireStats.brandDraws||0,caught:s.fireStats.caught||0,gathers:F.gathers||0,rolls:s.fireStats.grabRolls||0,brands:s.fireStats.brands||0,cooked:(s.cookStats||{}).cooked||0});
if(s.faith) out.faith=G.Faith.stats(s);
// v16: shelters, who learned them, pairs (and their sexes), loner joins, founders' sex mix
if(s.shelters){ const SS=s.shelterStats||{}; out.shelters={count:s.shelters.length,types:s.shelters.map(q=>q.type[0]+q.tiles.length).join(' '),entered:SS.entered,full:SS.full,warmedNights:SS.warmed,stepIns:SS.stepIns,trips:SS.trips,shared:SS.shared,
  knowAny:s.agents.filter(a=>(a.shelters||[]).length).length,learned:G.Shelter.learnedCount(s),alive:s.agents.length,first:s.shelterFirst?s.shelterFirst.who+' '+s.shelterFirst.type:null}; }
out.fam2={pairs:s.famStats.pairs,lonerWalks:s.famStats.lonerWalks||0,lonerJoins:s.famStats.lonerJoins||0,founders:FS};
// v18: sticks lit by (natural) lightning fires and what people did with them
const FX=s.fireStats; out.bolt={lightningFires:FX.lightning||0,boltSticks:FX.boltSticks||0,rolls:FX.boltRolls||0,walks:FX.boltWalks||0,pickups:FX.boltPickups||0,brandPickups:FX.brandPickups||0,litDisc:(s.discoveries||[]).some(d=>d.title==='First lit stick carried')};
console.log(JSON.stringify(out));
