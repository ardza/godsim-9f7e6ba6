const fs=require("fs"),path=require("path");let src=fs.readFileSync("/workspace/godsim/tests/headless_v38.js","utf8").split("const G = load()")[0];
if(process.env.ROOT)src=src.replace('root = path.join(__dirname, "..")','root = '+JSON.stringify(process.env.ROOT));
src=src.replace(/__dirname/g,JSON.stringify("/workspace/godsim/tests"));eval(src);
const G=load(),C=G.data.config,seed=+process.argv[2],s=G.Sim.create(seed);const cnt={};const re=/ (is shivering|is stumbling|looks lost|is moving slow|drops what they were carrying|is nodding off|is slowing further|has collapsed|is not getting up)$/;
const l0=G.Sim.log;G.Sim.log=function(sim,t){const m=re.exec(t);if(m)cnt[m[1]]=(cnt[m[1]]||0)+1;return l0.apply(this,arguments);};
const deaths={},d0=G.Sim.die;G.Sim.die=function(sim,a,c){deaths[c]=(deaths[c]||0)+1;return d0.apply(this,arguments);};
let maxHypo=0;const N=8*C.time.daysPerSeason*1440/C.time.tickGameMinutes;for(let i=0;i<N;i++){G.Sim.step(s);if(i%10===0)for(const a of s.agents)maxHypo=Math.max(maxHypo,a.hypo||0);}
console.log(JSON.stringify({seed,alive:s.agents.length,maxHypo,cold:cnt,deaths}));
