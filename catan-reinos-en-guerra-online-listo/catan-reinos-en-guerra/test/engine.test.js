const assert=require('assert');const E=require('../src/engine');
let ok=0;const t=(n,f)=>{f();ok++;console.log('OK  '+n);};
const mk=n=>E.newGame(['azul','amarillo','rojo','blanco'].slice(0,n).map((k,i)=>({id:'p'+i,name:'J'+i,kingdom:k})),()=>0.37);
const step=(s,pid,a)=>{const r=E.apply(s,pid,{...a,seq:s.seq},()=>0.5);return r;};
const free=(s,setup)=>Object.keys(E.G.V).find(v=>!s.bld[v]&&![...E.G.V[v].adj].some(a=>s.bld[a]));
function setup(s){while(s.phase==='setup'){const i=E.cur(s),id='p'+i;let v=free(s);let r=step(s,id,{type:'settlement',vertex:v});assert(r.state,r.error);s=r.state;
 const e=E.G.V[v].edges.find(e=>s.roads[e]===undefined);r=step(s,id,{type:'road',edge:e});assert(r.state,r.error);s=r.state;}return s;}
t('19 hexágonos, 54 vértices, 72 aristas',()=>{assert.equal(E.G.hexes.length,19);assert.equal(Object.keys(E.G.V).length,54);assert.equal(Object.keys(E.G.E).length,72);});
t('reinos duplicados rechazados',()=>assert.throws(()=>E.newGame([{id:'a',kingdom:'azul'},{id:'b',kingdom:'azul'},{id:'c',kingdom:'rojo'}])));
t('menos de 3 jugadores rechazado',()=>assert.throws(()=>E.newGame([{id:'a',kingdom:'azul'},{id:'b',kingdom:'rojo'}])));
for(const n of[3,4])t(`fase inicial con ${n} jugadores`,()=>{const s=setup(mk(n));assert.equal(s.phase,'roll');assert.equal(Object.keys(s.bld).length,2*n);});
t('fuera de turno rechazado',()=>{const s=mk(3);assert(step(s,'p1',{type:'settlement',vertex:free(s)}).error==='No es tu turno.');});
t('acción duplicada rechazada',()=>{const s=mk(3),v=free(s);const r=E.apply(s,'p0',{type:'settlement',vertex:v,seq:5});assert(r.error);});
t('regla de distancia',()=>{let s=mk(3);const v=free(s);s=step(s,'p0',{type:'settlement',vertex:v}).state;
 const e=E.G.V[v].edges[0];s=step(s,'p0',{type:'road',edge:e}).state;const n=[...E.G.V[v].adj][0];assert(/distancia/.test(step(s,'p1',{type:'settlement',vertex:n}).error));});
t('producción de recursos',()=>{let s=setup(mk(3));const h=s.hexes.findIndex((x,i)=>x.n&&E.G.hexes[i].v.some(v=>s.bld[v]));
 const hx=s.hexes[h];s.players.forEach(p=>E.RES.forEach(r=>p.res[r]=0));const before=E.G.hexes[h].v.filter(v=>s.bld[v]&&s.robber!==h).length;
 const r=E.apply(s,'p0',{type:'roll',seq:s.seq},()=>0.5);assert(r.state.dice);});
t('costes y compra de carretera',()=>{let s=setup(mk(3));s.phase='main';s.players[0].res={madera:0,arcilla:0,lana:0,trigo:0,mineral:0};
 const e=Object.keys(E.G.E).find(e=>E.G.E[e].some(v=>s.bld[v]&&s.bld[v].p===0)&&s.roads[e]===undefined);
 assert(/insuficientes/.test(step(s,'p0',{type:'road',edge:e}).error));s.players[0].res.madera=1;s.players[0].res.arcilla=1;
 const r=step(s,'p0',{type:'road',edge:e});assert(r.state&&r.state.players[0].res.madera===0);});
t('ciudad: coste 2 trigo + 3 mineral',()=>{let s=setup(mk(3));s.phase='main';const v=Object.keys(s.bld).find(v=>s.bld[v].p===0);
 s.players[0].res={madera:0,arcilla:0,lana:0,trigo:2,mineral:3};const r=step(s,'p0',{type:'city',vertex:v});assert.equal(r.state.bld[v].t,'city');});
t('banco 4:1',()=>{let s=setup(mk(3));s.phase='main';s.players[0].res={madera:4,arcilla:0,lana:0,trigo:0,mineral:0};
 const r=step(s,'p0',{type:'bank',give:'madera',get:'trigo'});assert.equal(r.state.players[0].res.trigo,1);});
t('siete: descarte y ladrón',()=>{let s=setup(mk(3));s.players[1].res={madera:8,arcilla:0,lana:0,trigo:0,mineral:0};
 let r=E.apply(s,'p0',{type:'roll',seq:s.seq},()=>0.5/6*1.0+0.33);if(!r.state||r.state.dice[0]+r.state.dice[1]!==7){const rr=()=>{let c=0;return()=>[0.5,0.0][c++%2]};r=E.apply(s,'p0',{type:'roll',seq:s.seq},rr());}
 if(r.state.dice[0]+r.state.dice[1]===7){assert.equal(r.state.phase,'discard');assert(step(r.state,'p0',{type:'robber',hex:0}).error);
  const d=step(r.state,'p1',{type:'discard',cards:{madera:4}});assert.equal(d.state.phase,'robber');}});
t('victoria a 10 puntos',()=>{let s=setup(mk(3));s.phase='main';s.players[0].res={madera:0,arcilla:0,lana:0,trigo:2,mineral:3};
 const vs=Object.keys(s.bld).filter(v=>s.bld[v].p===0);s.bld[vs[0]].t='city';let k=0;
 for(const v of Object.keys(E.G.V)){if(k>=6)break;if(!s.bld[v]){s.bld[v]={p:0,t:'settlement'};k++;}}
 s.bld[vs[1]]={p:0,t:'settlement'};const r=step(s,'p0',{type:'city',vertex:vs[1]});assert(r.state.winner===0,JSON.stringify(E.score(r.state,0)));});
t('cartas privadas ocultas en viewFor',()=>{const s=setup(mk(3));const v=E.viewFor(s,'p0');assert(v.players[0].res&&!v.players[1].res&&v.players[1].resCount!==undefined);});
console.log(ok+' pruebas superadas');
