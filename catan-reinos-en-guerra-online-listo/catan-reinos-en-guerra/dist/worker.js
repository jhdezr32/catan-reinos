// Motor de reglas de CATÁN: REINOS EN GUERRA (puro, sin red). Lo usará el servidor como autoridad.
const RES=['madera','arcilla','lana','trigo','mineral'];
const COST={road:{madera:1,arcilla:1},settlement:{madera:1,arcilla:1,lana:1,trigo:1},city:{trigo:2,mineral:3},dev:{lana:1,trigo:1,mineral:1}};
const KINGDOMS={azul:'Asturias',amarillo:'Rumanía',rojo:'Alemania',blanco:'Canarias'};
function shuffle(a,rng){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const G=(()=>{const hexes=[],V={},E={};
 for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++)if(Math.abs(q+r)<=2)hexes.push({q,r});
 hexes.forEach((h,i)=>{const cx=Math.sqrt(3)*(h.q+h.r/2),cy=1.5*h.r;h.cx=cx;h.cy=cy;h.v=[];
  for(let k=0;k<6;k++){const a=Math.PI/180*(60*k+30),x=+(cx+Math.cos(a)).toFixed(2),y=+(cy+Math.sin(a)).toFixed(2),id=x+','+y;
   V[id]=V[id]||{id,x,y,hexes:[],adj:new Set(),edges:[]};V[id].hexes.push(i);h.v.push(id);}
  for(let k=0;k<6;k++){const a=h.v[k],b=h.v[(k+1)%6];V[a].adj.add(b);V[b].adj.add(a);const e=[a,b].sort().join('|');E[e]=[a,b].sort();}});
 for(const e in E)E[e].forEach(v=>{if(!V[v].edges.includes(e))V[v].edges.push(e);});
 return{hexes,V,E};})();
function newGame(players,rng=Math.random){
 if(players.length<3||players.length>4)throw new Error('Se necesitan 3 o 4 jugadores');
 if(new Set(players.map(p=>p.kingdom)).size!==players.length)throw new Error('Reinos duplicados');
 const types=shuffle([...Array(4).fill('madera'),...Array(3).fill('arcilla'),...Array(4).fill('lana'),...Array(4).fill('trigo'),...Array(3).fill('mineral'),'desierto'],rng);
 const nums=[5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11];let k=0;
 const hexes=types.map(t=>({t,n:t==='desierto'?null:nums[k++]}));
 const n=players.length;
 return{hexes,robber:hexes.findIndex(h=>h.t==='desierto'),
  players:players.map(p=>({...p,res:Object.fromEntries(RES.map(r=>[r,0])),dev:[],knights:0})),
  bank:Object.fromEntries(RES.map(r=>[r,19])),deck:shuffle([...Array(14).fill('caballero'),...Array(5).fill('pv'),...Array(2).fill('carreteras'),...Array(2).fill('monopolio'),...Array(2).fill('abundancia')],rng),ports:makePorts(rng),turnNo:0,devPlayed:false,offers:[],nid:1,longest:null,army:null,back:'main',freeRoads:0,bld:{},roads:{},phase:'setup',sub:'settlement',setupStep:0,setupOrder:[...Array(n).keys(),...[...Array(n).keys()].reverse()],
  turn:0,dice:null,discard:{},lastSettle:null,winner:null,log:[],seq:0};}
const cur=s=>s.phase==='setup'?s.setupOrder[s.setupStep]:s.turn;
const total=p=>RES.reduce((a,r)=>a+p.res[r],0);
function score(s,i,pub){let v=0;for(const id in s.bld)if(s.bld[id].p===i)v+=s.bld[id].t==='city'?2:1;if(s.longest===i)v+=2;if(s.army===i)v+=2;if(!pub)v+=s.players[i].dev.filter(c=>c.k==='pv').length;return v;}
const canPay=(p,c)=>Object.keys(c).every(r=>p.res[r]>=c[r]);
const pay=(p,c,s)=>{for(const r in c){p.res[r]-=c[r];if(s)s.bank[r]+=c[r];}};
function settleOk(s,i,v,setup){
 if(!G.V[v])return'Vértice inválido.';if(s.bld[v])return'Ese vértice ya está ocupado.';
 for(const a of G.V[v].adj)if(s.bld[a])return'Regla de distancia: no puede haber un asentamiento adyacente.';
 if(!setup&&!G.V[v].edges.some(e=>s.roads[e]===i))return'Debe conectar con una de tus carreteras.';return null;}
function roadOk(s,i,e,setup){
 if(!G.E[e])return'Arista inválida.';if(s.roads[e]!==undefined)return'Ya hay una carretera ahí.';
 const[a,b]=G.E[e];
 if(setup)return(s.lastSettle===a||s.lastSettle===b)?null:'En la fase inicial la carretera debe tocar tu último asentamiento.';
 const ok=v=>(s.bld[v]&&s.bld[v].p===i)||(!(s.bld[v]&&s.bld[v].p!==i)&&G.V[v].edges.some(x=>s.roads[x]===i));
 return(ok(a)||ok(b))?null:'La carretera debe conectar con tus construcciones o carreteras.';}
function apply(s0,pid,a,rng=Math.random){
 if(s0.winner!==null)return{error:'La partida ha terminado.'};
 if(a.seq!==s0.seq)return{error:'Acción duplicada o desfasada.'};
 const s=JSON.parse(JSON.stringify(s0)),i=s.players.findIndex(p=>p.id===pid);
 if(i<0)return{error:'No participas en esta partida.'};const me=s.players[i];
 const E=m=>({error:m}),log=m=>s.log.push(`${me.name} (${KINGDOMS[me.kingdom]}): ${m}`);
 const cnt=t=>Object.values(s.bld).filter(b=>b.p===i&&b.t===t).length,rc=Object.values(s.roads).filter(x=>x===i).length;
 if(s.phase==='discard'){
  if(a.type!=='discard')return E('Hay que descartar antes de continuar.');
  const need=s.discard[i];if(!need)return E('No debes descartar.');
  let sum=0;for(const r of RES){const c=(a.cards||{})[r]||0;if(c<0||c>me.res[r])return E('Descarte inválido.');sum+=c;}
  if(sum!==need)return E(`Debes descartar exactamente ${need} cartas.`);
  for(const r of RES){me.res[r]-=(a.cards[r]||0);s.bank[r]+=(a.cards[r]||0);}delete s.discard[i];log(`descarta ${need}`);
  if(!Object.keys(s.discard).length)s.phase='robber';
 }else{
  if(cur(s)!==i&&a.type!=='accept'&&a.type!=='reject')return E('No es tu turno.');
  switch(a.type){
  case'settlement':{
   if(s.phase==='setup'){if(s.sub!=='settlement')return E('Toca colocar carretera.');
    const e=settleOk(s,i,a.vertex,true);if(e)return E(e);s.bld[a.vertex]={p:i,t:'settlement'};s.lastSettle=a.vertex;s.sub='road';
    if(s.setupStep>=s.players.length)for(const h of G.V[a.vertex].hexes){const t=s.hexes[h].t;if(t!=='desierto'&&s.bank[t]>0){me.res[t]++;s.bank[t]--;}}
   }else{if(s.phase!=='main')return E('Primero tira los dados.');if(cnt('settlement')>=5)return E('No te quedan asentamientos (máximo 5).');if(!canPay(me,COST.settlement))return E('Recursos insuficientes (madera, arcilla, lana, trigo).');
    const e=settleOk(s,i,a.vertex,false);if(e)return E(e);pay(me,COST.settlement,s);s.bld[a.vertex]={p:i,t:'settlement'};}
   log('coloca un asentamiento');break;}
  case'road':{
   if(s.phase==='setup'){if(s.sub!=='road')return E('Toca colocar asentamiento.');const e=roadOk(s,i,a.edge,true);if(e)return E(e);
    s.roads[a.edge]=i;s.setupStep++;s.sub='settlement';
    if(s.setupStep>=s.setupOrder.length){s.phase='roll';s.turn=0;}
   }else{const fr=s.phase==='roads';if(!fr&&s.phase!=='main')return E('Primero tira los dados.');if(rc>=15)return E('No te quedan carreteras (máximo 15).');if(!fr&&!canPay(me,COST.road))return E('Recursos insuficientes (madera, arcilla).');
    const e=roadOk(s,i,a.edge,false);if(e)return E(e);if(!fr)pay(me,COST.road,s);s.roads[a.edge]=i;if(fr){s.freeRoads--;if(s.freeRoads<=0||!anyRoad(s,i))s.phase='main';}}
   log('coloca una carretera');break;}
  case'city':{if(s.phase!=='main')return E('Primero tira los dados.');const b=s.bld[a.vertex];
   if(!b||b.p!==i||b.t!=='settlement')return E('Necesitas un asentamiento propio ahí.');
   if(cnt('city')>=4)return E('No te quedan ciudades (máximo 4).');if(!canPay(me,COST.city))return E('No tienes suficientes recursos para construir esta ciudad (2 trigo, 3 mineral).');pay(me,COST.city,s);b.t='city';log('mejora a ciudad');break;}
  case'roll':{if(s.phase!=='roll')return E('Ya has tirado los dados.');
   const d=[1+Math.floor(rng()*6),1+Math.floor(rng()*6)],t=d[0]+d[1];s.dice=d;log(`saca ${t}`);
   if(t===7){s.back='main';s.discard={};s.players.forEach((p,k)=>{if(total(p)>7)s.discard[k]=Math.floor(total(p)/2);});s.phase=Object.keys(s.discard).length?'discard':'robber';}
   else{produce(s,t);s.phase='main';}
   break;}
  case'robber':{if(s.phase!=='robber')return E('No puedes mover el ladrón ahora.');
   if(!s.hexes[a.hex]||a.hex===s.robber)return E('Debes mover el ladrón a otro hexágono.');s.robber=a.hex;
   const vs=[...new Set(G.hexes[a.hex].v.map(v=>s.bld[v]).filter(b=>b&&b.p!==i).map(b=>b.p))].filter(k=>total(s.players[k])>0);
   if(vs.length){const v=vs.includes(a.victim)?a.victim:(vs.length===1?vs[0]:null);if(v===null)return E('Elige a quién robar.');
    const bag=RES.flatMap(r=>Array(s.players[v].res[r]).fill(r)),r=bag[Math.floor(rng()*bag.length)];s.players[v].res[r]--;me.res[r]++;}
   s.phase=s.back;log('mueve el ladrón');break;}
  case'bank':{if(s.phase!=='main')return E('Primero tira los dados.');
   if(!RES.includes(a.give)||!RES.includes(a.get)||a.give===a.get)return E('Intercambio inválido.');
   const q=ratio(s,i,a.give);if(me.res[a.give]<q)return E(`Necesitas ${q} cartas de ${a.give} (tu mejor tasa; los puertos solo valen si tienes un asentamiento o ciudad en ellos).`);
   if(s.bank[a.get]<1)return E('El banco no tiene ese recurso.');me.res[a.give]-=q;s.bank[a.give]+=q;me.res[a.get]++;s.bank[a.get]--;log(`comercia con el banco (${q}:1)`);break;}
  case'buyDev':{if(s.phase!=='main')return E('Primero tira los dados.');if(!s.deck.length)return E('El mazo de desarrollo está agotado.');
   if(!canPay(me,COST.dev))return E('Recursos insuficientes (lana, trigo, mineral).');pay(me,COST.dev,s);me.dev.push({k:s.deck.pop(),t:s.turnNo});log('compra una carta de desarrollo');break;}
  case'knight':case'roads':case'monopoly':case'plenty':{
   const k={knight:'caballero',roads:'carreteras',monopoly:'monopolio',plenty:'abundancia'}[a.type];
   if(s.devPlayed)return E('Solo puedes jugar una carta de desarrollo por turno.');
   if(!(a.type==='knight'?(s.phase==='roll'||s.phase==='main'):s.phase==='main'))return E('No puedes jugar esa carta ahora.');
   const c=me.dev.findIndex(x=>x.k===k&&x.t<s.turnNo);
   if(c<0)return E(me.dev.some(x=>x.k===k)?'No puedes jugar esta carta durante el turno en que la compraste.':'No tienes esa carta.');
   if(a.type==='roads'&&(!anyRoad(s,i)||rc>=15))return E('No tienes dónde construir carreteras.');
   if(a.type==='monopoly'&&!RES.includes(a.res))return E('Elige un recurso.');
   if(a.type==='plenty'){if(!RES.includes(a.r1)||!RES.includes(a.r2))return E('Elige dos recursos.');const nd={};nd[a.r1]=1;nd[a.r2]=(a.r1===a.r2?2:1);for(const r in nd)if(s.bank[r]<nd[r])return E('El banco no tiene esos recursos.');}
   me.dev.splice(c,1);s.devPlayed=true;
   if(a.type==='knight'){me.knights++;s.back=s.phase;s.phase='robber';}
   else if(a.type==='roads'){s.freeRoads=Math.min(2,15-rc);s.phase='roads';}
   else if(a.type==='monopoly'){let n=0;s.players.forEach((p,q)=>{if(q!==i){n+=p.res[a.res];me.res[a.res]+=p.res[a.res];p.res[a.res]=0;}});log(`monopolio de ${a.res}: recibe ${n}`);}
   else{for(const r of[a.r1,a.r2]){me.res[r]++;s.bank[r]--;}}
   log('juega '+k);break;}
  case'offer':{if(s.phase!=='main')return E('Solo puedes ofrecer intercambios en tu fase principal.');
   const g=a.give||{},w=a.want||{},sm=o=>RES.reduce((x,r)=>x+(o[r]||0),0);
   if(RES.some(r=>!Number.isInteger(g[r]||0)||!Number.isInteger(w[r]||0)||(g[r]||0)<0||(w[r]||0)<0))return E('Cantidades inválidas.');
   if(!sm(g)||!sm(w))return E('Una oferta debe incluir algo que das y algo que pides.');
   if(RES.some(r=>(g[r]||0)>me.res[r]))return E('No tienes los recursos que ofreces.');
   if(RES.some(r=>g[r]>0&&w[r]>0))return E('No puedes pedir y ofrecer el mismo recurso.');
   s.offers.push({id:s.nid++,from:i,give:g,want:w,rej:[]});log('propone un intercambio');break;}
  case'cancel':{const k=s.offers.findIndex(o=>o.id===a.id&&o.from===i);if(k<0)return E('No existe esa oferta.');s.offers.splice(k,1);log('cancela una oferta');break;}
  case'accept':case'reject':{const k=s.offers.findIndex(o=>o.id===a.id),o=s.offers[k];
   if(!o||s.phase!=='main')return E('Esa oferta ya no está disponible.');if(o.from===i)return E('No puedes aceptar tu propia oferta.');
   if(a.type==='reject'){if(!o.rej.includes(i))o.rej.push(i);log('rechaza una oferta');break;}
   const f=s.players[o.from];if(RES.some(r=>(o.give[r]||0)>f.res[r]))return E('El jugador no tiene los recursos ofrecidos.');
   if(RES.some(r=>(o.want[r]||0)>me.res[r]))return E('No tienes los recursos solicitados.');
   for(const r of RES){f.res[r]+=(o.want[r]||0)-(o.give[r]||0);me.res[r]+=(o.give[r]||0)-(o.want[r]||0);}s.offers.splice(k,1);log('acepta un intercambio');break;}
  case'end':{if(s.phase!=='main')return E('Aún no puedes terminar el turno.');s.turn=(s.turn+1)%s.players.length;s.phase='roll';s.dice=null;s.devPlayed=false;s.offers=[];s.turnNo++;log('termina su turno');break;}
  default:return E('Acción desconocida.');}
 }
 updAwards(s);if(score(s,i)>=10&&cur(s)===i){s.winner=i;s.phase='ended';}
 s.seq++;return{state:s};}
// Vista pública: oculta recursos ajenos (cartas privadas) — el servidor debe enviar esto a cada cliente.
function viewFor(s,pid){const v=JSON.parse(JSON.stringify(s));v.deckCount=v.deck.length;delete v.deck;
 v.players.forEach((p,k)=>{p.vp=score(s,k,true);if(s.winner!==null){p.pvCards=s.players[k].dev.filter(c=>c.k==='pv').length;p.vpTotal=score(s,k);}if(p.id!==pid){p.resCount=total(p);p.devCount=p.dev.length;delete p.res;delete p.dev;}});return v;}
const anyRoad=(s,i)=>Object.keys(G.E).some(e=>roadOk(s,i,e,false)===null);
function produce(s,t){for(const r of RES){const need={};s.hexes.forEach((h,hi)=>{if(h.t!==r||h.n!==t||s.robber===hi)return;for(const v of G.hexes[hi].v){const b=s.bld[v];if(b)need[b.p]=(need[b.p]||0)+(b.t==='city'?2:1);}});
 const ps=Object.keys(need),sum=ps.reduce((a,k)=>a+need[k],0);let tot=0;
 if(sum<=s.bank[r]){tot=sum;ps.forEach(k=>{s.players[k].res[r]+=need[k];});}
 else if(ps.length===1){tot=s.bank[r];s.players[ps[0]].res[r]+=tot;}
 s.bank[r]-=tot;}}
function ratio(s,i,r){let q=4;for(const p of s.ports)if(p.v.some(v=>s.bld[v]&&s.bld[v].p===i)){if(p.t==='3:1')q=Math.min(q,3);else if(p.t===r)q=Math.min(q,2);}return q;}
function longestLen(s,i){const es=Object.keys(s.roads).filter(e=>s.roads[e]===i);if(!es.length)return 0;let best=0;
 const dfs=(v,used,len)=>{best=Math.max(best,len);const b=s.bld[v];if(b&&b.p!==i&&len>0)return;
  for(const e of es){if(used.has(e)||!G.E[e].includes(v))continue;used.add(e);dfs(G.E[e].find(x=>x!==v),used,len+1);used.delete(e);}};
 for(const v of new Set(es.flatMap(e=>G.E[e])))dfs(v,new Set(),0);return best;}
function updAwards(s){const L=s.players.map((_,i)=>longestLen(s,i)),m=Math.max(...L);
 if(m<5)s.longest=null;else if(!(s.longest!==null&&L[s.longest]===m)){const c=L.map((l,i)=>l===m?i:-1).filter(x=>x>=0);s.longest=c.length===1?c[0]:null;}
 const K=s.players.map(p=>p.knights);for(let k=0;k<K.length;k++)if(K[k]>=3&&(s.army===null||K[k]>K[s.army]))s.army=k;}
function makePorts(rng){const co=Object.keys(G.E).filter(e=>{const[a,b]=G.E[e];return G.V[a].hexes.filter(h=>G.V[b].hexes.includes(h)).length===1;});
 const ord=[co[0]];let v=G.E[co[0]][1];while(ord.length<co.length){const n=co.find(e=>!ord.includes(e)&&G.E[e].includes(v));ord.push(n);v=G.E[n].find(x=>x!==v);}
 const ty=shuffle(['3:1','3:1','3:1','3:1',...RES],rng);return[0,3,7,10,14,17,21,24,28].map((k,j)=>({v:G.E[ord[k]],t:ty[j]}));}
// Salto de turno forzado (solo lo invoca el servidor cuando quien bloquea la partida está desconectado).
function forceSkip(s0,offline,rng=Math.random){
 if(s0.winner!==null)return{error:'La partida ha terminado.'};
 if(s0.phase==='setup')return{error:'No se puede saltar la colocación inicial: hay que esperar a que vuelva el jugador.'};
 const s=JSON.parse(JSON.stringify(s0));
 if(s.phase==='discard'){
  for(const k of Object.keys(s.discard)){if(!offline.includes(+k))continue;const p=s.players[k];
   for(let n=s.discard[k];n>0;n--){const bag=RES.flatMap(r=>Array(p.res[r]).fill(r)),r=bag[Math.floor(rng()*bag.length)];p.res[r]--;s.bank[r]++;}
   delete s.discard[k];s.log.push(`${p.name}: descarte automático (desconectado)`);}
  if(!Object.keys(s.discard).length)s.phase='robber';
  s.seq++;return{state:s};}
 const who=s.players[s.turn];s.log.push(`${who.name}: turno saltado (desconectado)`);
 s.freeRoads=0;s.offers=[];s.turn=(s.turn+1)%s.players.length;s.phase='roll';s.dice=null;s.devPlayed=false;s.turnNo++;s.back='main';
 s.seq++;return{state:s};}
const ENGINE={forceSkip,RES,COST,KINGDOMS,G,newGame,apply,viewFor,score,cur,produce,ratio,longestLen,updAwards};

const HTML="<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>CAT\u00c1N: REINOS EN GUERRA</title>\n<style>\n*{box-sizing:border-box}body{margin:0;font-family:Georgia,serif;background:#2b1d12;color:#f1e3c4}h1{font-variant:small-caps;text-align:center;color:#e8b84a;margin:.4em;font-size:1.6em}h3{margin:.2em 0 .5em;color:#e8b84a}\nbutton,input,select{font:inherit;padding:.45em .8em;margin:.15em;border-radius:6px;border:1px solid #8a6a2f;background:#4a331c;color:#f1e3c4}button{cursor:pointer}button:disabled{opacity:.35;cursor:not-allowed}button.on,button.pri{background:#8a6a2f}input[type=number]{width:3.5em;padding:.25em}\n.w{max-width:1000px;margin:auto;padding:8px}.row{display:flex;flex-wrap:wrap;gap:10px}.p{flex:1;min-width:270px}.k{display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid #000;margin-right:6px;vertical-align:middle}\n.card{background:#3a2917;border:1px solid #6b4f26;border-radius:10px;padding:10px;margin:6px 0}.hint{color:#e8b84a;font-weight:bold}.muted{opacity:.7;font-size:.9em}\n#log{font-size:12px;max-height:140px;overflow:auto}#t{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);background:#a33;padding:8px 14px;border-radius:8px;display:none;z-index:30;max-width:92vw}\n#st{position:fixed;top:0;left:0;right:0;background:#b8860b;color:#000;text-align:center;padding:4px;display:none;z-index:25;font-size:14px}\n#err{background:#6b1d1d;border:1px solid #c44;border-radius:8px;padding:8px 12px;margin:8px 0;display:none}\nsvg{width:100%;max-height:78vh;background:#1d5a8a;border-radius:10px;touch-action:manipulation}svg [data-a]{cursor:pointer}\n.mb{position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:20;padding:10px}.mc{background:#3a2917;border:2px solid #8a6a2f;border-radius:12px;padding:14px;max-width:460px;width:100%;max-height:90vh;overflow:auto}.ma{text-align:right;margin-top:8px}\n.res{display:inline-block;margin:2px 8px 2px 0;white-space:nowrap}table{border-collapse:collapse}td{padding:2px 6px}\n</style></head><body>\n<div id=\"st\"></div>\n<div class=\"w\"><h1>\u2694 Cat\u00e1n: Reinos en Guerra \u2694</h1><div id=\"err\" role=\"alert\"></div><div id=\"a\"></div></div>\n<div id=\"m\"></div><div id=\"t\"></div>\n<script>\n// Si el frontend se aloja en un dominio distinto al del servidor Worker, pon aqu\u00ed su URL (https://....workers.dev). Vac\u00edo = mismo dominio.\nwindow.CATAN_SERVER=window.CATAN_SERVER||'';\nconst $=i=>document.getElementById(i),SERVER=String(window.CATAN_SERVER).replace(/\\/$/,''),\nCOL={azul:'#2f5fd0',amarillo:'#e0b400',rojo:'#c0392b',blanco:'#f4f4f4'},KN={azul:'Reino de Asturias',amarillo:'Reino de Ruman\u00eda',rojo:'Reino de Alemania',blanco:'Reino de Canarias'},\nHC={madera:'#2e6b2e',arcilla:'#b5532f',lana:'#9acd5a',trigo:'#e6c84a',mineral:'#7f8591',desierto:'#d9c58f'},RES=['madera','arcilla','lana','trigo','mineral'],\nEMO={madera:'\ud83c\udf32',arcilla:'\ud83e\uddf1',lana:'\ud83d\udc11',trigo:'\ud83c\udf3e',mineral:'\u26f0\ufe0f'},\nKD={caballero:'Caballero',pv:'Punto de victoria',carreteras:'Construir carreteras',monopolio:'Monopolio',abundancia:'A\u00f1o de abundancia'};\nlet ws,geo,S,code,tk,tool='settlement',retry=0,fatal=false,leaving=false,busy=false,rt,pingT,M=null,pickRobber=null;\nconst RULES=`<p><b>Objetivo:</b> ser el primero en llegar a 10 puntos en tu turno.</p><p>Asentamiento = 1 punto, ciudad = 2, carta de punto de victoria = 1 (oculta), Camino m\u00e1s largo (m\u00ednimo 5 tramos) = 2, Ej\u00e9rcito m\u00e1s grande (m\u00ednimo 3 caballeros) = 2.</p>\n<p><b>Costes:</b> carretera = madera + arcilla \u00b7 asentamiento = madera + arcilla + lana + trigo \u00b7 ciudad = 2 trigo + 3 mineral \u00b7 carta = lana + trigo + mineral.</p>\n<p><b>Turno:</b> tira los dados; los hex\u00e1gonos con ese n\u00famero producen para sus asentamientos (1) y ciudades (2). Con un 7 se descarta la mitad si tienes m\u00e1s de 7 cartas y se mueve el ladr\u00f3n (roba una carta a un vecino).</p>\n<p><b>Comercio:</b> banco 4:1, puerto 3:1 o 2:1 (si tienes un asentamiento o ciudad en \u00e9l) y ofertas a los dem\u00e1s jugadores.</p>\n<p><b>Cartas:</b> no se puede jugar la que compraste este turno y solo una por turno (salvo puntos de victoria).</p>`;\nconst esc=s=>String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nfunction toast(m){const t=$('t');t.textContent=m;t.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display='none',4000);}\nfunction status(m){const s=$('st');s.textContent=m||'';s.style.display=m?'block':'none';}\nfunction showErr(m,tech){const e=$('err');e.textContent=m||'';e.style.display=m?'block':'none';if(m)console.error('[catan] '+m,tech||'');}\nconst tokKey=c=>'catan:tok:'+c,loadTok=c=>{try{return localStorage.getItem(tokKey(c))||''}catch{return''}},saveTok=(c,t)=>{try{localStorage.setItem(tokKey(c),t)}catch{}},clearTok=c=>{try{localStorage.removeItem(tokKey(c))}catch{}};\n\n// ---------- red ----------\nasync function api(path,opt){\n if(location.protocol==='file:'&&!SERVER)throw new Error('Esta p\u00e1gina est\u00e1 abierta como archivo local (file://) y no tiene servidor detr\u00e1s. Abre el enlace p\u00fablico de tu juego (https://\u2026workers.dev) o el servidor local de pruebas.');\n const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),12000);let r,d;\n try{r=await fetch(SERVER+path,{...opt,signal:ctl.signal,headers:{'content-type':'application/json'}});}\n catch(e){console.error('[catan] fallo de red en',path,e);throw new Error(e.name==='AbortError'?'El servidor tard\u00f3 demasiado en responder. Int\u00e9ntalo de nuevo.':'No se pudo contactar con el servidor del juego. Comprueba tu conexi\u00f3n y que has abierto el enlace correcto.');}\n finally{clearTimeout(t);}\n try{d=await r.json();}catch{console.error('[catan] respuesta no v\u00e1lida de',path,r.status);throw new Error('El servidor respondi\u00f3 algo inesperado (HTTP '+r.status+'). \u00bfEs este el enlace correcto del juego?');}\n if(!r.ok||!d.ok){console.error('[catan] error de API',path,r.status,d);const e=new Error(d.error||'Error del servidor (HTTP '+r.status+').');e.code=d.code;throw e;}\n return d;}\nfunction send(o){if(ws&&ws.readyState===1){ws.send(JSON.stringify({...o,token:tk}));return true;}toast('Sin conexi\u00f3n con el servidor; reintentando\u2026');return false;}\nfunction act(a){if(!S||!S.game)return;send({t:'act',a:{...a,seq:S.game.seq}});}\nfunction connect(){\n clearTimeout(rt);const base=SERVER?SERVER.replace(/^http/,'ws'):(location.protocol==='https:'?'wss://':'ws://')+location.host;let w;\n try{w=new WebSocket(base+'/ws/'+code);}catch(e){return backHome('No se pudo abrir la conexi\u00f3n en tiempo real: '+e.message);}\n ws=w;if(S)status('Reconectando\u2026');\n w.onopen=()=>{retry=0;w.send(JSON.stringify({t:'join',token:tk}));clearInterval(pingT);pingT=setInterval(()=>{if(w.readyState===1)w.send('{\"t\":\"ping\"}');},25000);};\n w.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}\n  if(m.t==='geo')geo=m.geo;else if(m.t==='err')toast(m.m);\n  else if(m.t==='fatal'){clearTok(code);backHome(m.m);}\n  else if(m.t==='left'){clearTok(code);location.hash='';backHome();}\n  else if(m.t==='state'){S=m;status('');render();}};\n w.onerror=()=>console.error('[catan] error de WebSocket en la sala',code);\n w.onclose=()=>{clearInterval(pingT);if(w!==ws||fatal||leaving)return;retry++;\n  if(retry>(S?15:3))return backHome(S?'Se perdi\u00f3 la conexi\u00f3n con el servidor y no se pudo recuperar. Recarga la p\u00e1gina.':'No se pudo establecer la conexi\u00f3n en tiempo real con la sala. Int\u00e9ntalo de nuevo.');\n  status(`Conexi\u00f3n perdida. Reintentando (${retry})\u2026`);rt=setTimeout(connect,Math.min(1000*retry,6000));};}\nfunction enter(c){code=c;tk=loadTok(c);fatal=false;leaving=false;retry=0;S=null;location.hash=c;showErr('');\n $('a').innerHTML='<p class=\"card\">Conectando con la sala <b>'+esc(c)+'</b>\u2026</p>';connect();}\nfunction backHome(msg){fatal=true;clearTimeout(rt);clearInterval(pingT);if(ws)try{ws.close();}catch{}S=null;status('');closeM();home();if(msg)showErr(msg);}\n\n// ---------- inicio ----------\nfunction home(){const h=(location.hash||'').slice(1).toUpperCase().replace(/[^A-Z0-9]/g,''),nm=(()=>{try{return localStorage.getItem('catan:name')||''}catch{return''}})();\n $('a').innerHTML=`<div class=\"card\"><p>Tu nombre: <input id=\"nm\" maxlength=\"20\" autocomplete=\"nickname\" value=\"${esc(nm)}\"></p>\n <p><button id=\"bc\" class=\"pri\" data-a=\"create\">Crear partida</button></p>\n <p>\u2026o \u00fanete con un c\u00f3digo: <input id=\"cd\" size=\"7\" maxlength=\"8\" value=\"${esc(h)}\" style=\"text-transform:uppercase\"> <button id=\"bj\" data-a=\"join\">Unirse</button></p>\n <p><button data-a=\"rules\">Reglas</button></p></div>${h?'<p class=\"muted\">Has abierto un enlace de invitaci\u00f3n: escribe tu nombre y pulsa \u00abUnirse\u00bb.</p>':''}`;\n if(location.protocol==='file:'&&!SERVER)showErr('Esta p\u00e1gina est\u00e1 abierta como archivo local (file://) y no tiene servidor detr\u00e1s: no se podr\u00e1n crear partidas. Abre el enlace p\u00fablico de tu juego.');}\nfunction setBusy(b,txt){busy=b;for(const id of['bc','bj']){const e=$(id);if(e)e.disabled=b;}const c=$('bc');if(c)c.textContent=b&&txt?txt:'Crear partida';}\nfunction readName(){const n=($('nm').value||'').replace(/\\s+/g,' ').trim();\n if(!n){showErr('Escribe tu nombre antes de continuar.');$('nm').focus();return null;}\n if(n.length>20||/[<>&\"'`]/.test(n)){showErr('El nombre debe tener 1-20 caracteres y no puede incluir < > & \" \\' `.');$('nm').focus();return null;}\n try{localStorage.setItem('catan:name',n)}catch{}return n;}\nasync function createGame(){if(busy)return;showErr('');const n=readName();if(!n)return;setBusy(true,'Creando partida\u2026');\n try{const d=await api('/api/create',{method:'POST',body:JSON.stringify({name:n})});saveTok(d.code,d.token);enter(d.code);}\n catch(e){showErr(e.message,e);}finally{if($('bc'))setBusy(false);}}\nasync function joinGame(){if(busy)return;showErr('');const n=readName();if(!n)return;\n const c=($('cd').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length!==5){showErr('Escribe el c\u00f3digo de 5 letras/n\u00fameros de la partida (o abre el enlace de invitaci\u00f3n).');$('cd').focus();return;}\n setBusy(true);try{const d=await api('/api/join',{method:'POST',body:JSON.stringify({code:c,name:n,token:loadTok(c)})});saveTok(c,d.token);enter(c);}\n catch(e){showErr(e.message,e);}finally{if($('bc'))setBusy(false);}}\n\n// ---------- modales ----------\nfunction closeM(){M=null;$('m').innerHTML='';}\nfunction modal(title,body,ok,onOk,cancelable=true){$('m').innerHTML=`<div class=\"mb\"><div class=\"mc\"><h3>${title}</h3>${body}<div class=\"ma\">${cancelable?'<button data-a=\"closeM\">Cancelar</button>':''}${ok?`<button class=\"pri\" id=\"mo\">${ok}</button>`:''}</div></div></div>`;\n if(ok)$('mo').onclick=()=>{if(onOk()!==false)closeM();};}\nconst num=id=>Math.max(0,parseInt($(id).value)||0);\n\n// ---------- lobby ----------\nfunction lobby(){const L=S.lobby,me=L.players[S.you],link=location.origin+location.pathname+'#'+code,host=S.you===0;\n const kids=L.players.every(p=>p.kingdom)&&new Set(L.players.map(p=>p.kingdom)).size===L.players.length,all=L.players.every(p=>p.online),n=L.players.length,can=n>=3&&n<=4&&kids&&all;\n const why=n<3?`Faltan jugadores (${n}/3 m\u00ednimo).`:!all?'Hay jugadores desconectados.':!kids?'Todos deben elegir un reino distinto.':'';\n $('a').innerHTML=`<div class=\"card\"><p>C\u00f3digo de partida: <b style=\"font-size:1.4em;letter-spacing:2px\">${esc(code)}</b></p>\n <p>Enlace de invitaci\u00f3n: <input id=\"lk\" readonly size=\"34\" value=\"${esc(link)}\"> <button data-a=\"copy\">Copiar enlace</button></p>\n <p class=\"muted\">Tus amigos solo tienen que abrir el enlace, escribir su nombre y pulsar \u00abUnirse\u00bb.</p></div>\n <div class=\"card\"><p class=\"hint\">Elige tu reino:</p>`+Object.keys(KN).map(k=>{const o=L.players.find(p=>p.kingdom===k);\n  return `<button data-a=\"pick\" data-k=\"${k}\" ${o&&o!==me?'disabled':''} class=\"${me.kingdom===k?'on':''}\"><span class=\"k\" style=\"background:${COL[k]}\"></span>${KN[k]}${o?' \u2014 '+esc(o.name):''}</button>`;}).join('')+`</div>\n <div class=\"card\"><p class=\"hint\">Jugadores (${n}/4):</p><ul>${L.players.map((p,i)=>`<li>${p.online?'\ud83d\udfe2':'\u26aa'} <b>${esc(p.name)}</b>${i===0?' \ud83d\udc51 anfitri\u00f3n':''}${i===S.you?' (t\u00fa)':''} \u2014 ${p.kingdom?`<span class=\"k\" style=\"background:${COL[p.kingdom]}\"></span>${KN[p.kingdom]}`:'<i>sin reino</i>'}${host&&!p.online?` <button data-a=\"kick\" data-i=\"${i}\">Expulsar</button>`:''}</li>`).join('')}</ul></div>\n <p>${host?`<button class=\"pri\" data-a=\"start\" ${can?'':'disabled'}>Empezar partida (3-4 jugadores)</button> <span class=\"muted\">${why}</span>`:'<span class=\"muted\">Esperando a que el anfitri\u00f3n empiece la partida\u2026</span>'}\n <button data-a=\"leave\">Abandonar sala</button></p>`;}\n\n// ---------- reglas del cliente (solo para resaltar; el servidor valida siempre) ----------\nfunction topo(){if(geo.ve)return;geo.ve={};geo.adj={};for(const e in geo.E){const[a,b]=geo.E[e];(geo.ve[a]=geo.ve[a]||[]).push(e);(geo.ve[b]=geo.ve[b]||[]).push(e);(geo.adj[a]=geo.adj[a]||[]).push(b);(geo.adj[b]=geo.adj[b]||[]).push(a);}}\nconst settleOk=(g,i,v,setup)=>!g.bld[v]&&geo.adj[v].every(a=>!g.bld[a])&&(setup||geo.ve[v].some(e=>g.roads[e]===i));\nfunction roadOk(g,i,e,setup){if(g.roads[e]!==undefined)return false;const[a,b]=geo.E[e];if(setup)return g.lastSettle===a||g.lastSettle===b;\n const ok=v=>(g.bld[v]&&g.bld[v].p===i)||(!(g.bld[v]&&g.bld[v].p!==i)&&geo.ve[v].some(x=>g.roads[x]===i));return ok(a)||ok(b);}\nfunction ratio(g,i,r){let q=4;for(const p of g.ports||[])if(p.v.some(v=>g.bld[v]&&g.bld[v].p===i)){if(p.t==='3:1')q=Math.min(q,3);else if(p.t===r)q=Math.min(q,2);}return q;}\nconst curp=g=>g.phase==='setup'?g.setupOrder[g.setupStep]:g.turn;\nconst fmt=o=>RES.filter(r=>o[r]).map(r=>o[r]+' '+EMO[r]).join(' ')||'\u2014';\nconst afford=(me,c)=>Object.keys(c).every(r=>me.res[r]>=c[r]);\n\n// ---------- partida ----------\nfunction game(){topo();const g=S.game,me=g.players[S.you],my=curp(g)===S.you,L=S.lobby,main=my&&g.phase==='main',setup=g.phase==='setup',ended=g.winner!==null;\n let eff=setup?g.sub:g.phase==='roads'?'road':tool;\n const P=([x,y])=>[x*50,y*50];let svg='';\n g.hexes.forEach((h,i)=>{const H=geo.hexes[i],cx=H.cx*50,cy=H.cy*50;svg+=`<polygon points=\"${H.v.map(v=>P(geo.V[v])).join(' ')}\" fill=\"${HC[h.t]}\" stroke=\"#222\" stroke-width=\"2\" ${g.phase==='robber'&&my?`data-a=\"hex\" data-i=\"${i}\"`:''}/>\n  <text x=\"${cx}\" y=\"${cy-14}\" text-anchor=\"middle\" font-size=\"15\" pointer-events=\"none\">${EMO[h.t]||'\ud83c\udfdc\ufe0f'}</text>`;\n  if(h.n)svg+=`<circle cx=\"${cx}\" cy=\"${cy+6}\" r=\"13\" fill=\"#f4e7c3\" stroke=\"#222\" pointer-events=\"none\"/><text x=\"${cx}\" y=\"${cy+11}\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"bold\" fill=\"${h.n===6||h.n===8?'#b00':'#000'}\" pointer-events=\"none\">${h.n}</text>`;\n  if(g.robber===i)svg+=`<circle cx=\"${cx}\" cy=\"${cy-2}\" r=\"9\" fill=\"#111\" stroke=\"#fff\" pointer-events=\"none\"/>`;});\n (g.ports||[]).forEach(p=>{const[a,b]=p.v.map(v=>P(geo.V[v])),mx=(a[0]+b[0])/2,my2=(a[1]+b[1])/2,f=1.16;\n  svg+=`<line x1=\"${a[0]}\" y1=\"${a[1]}\" x2=\"${mx*f}\" y2=\"${my2*f}\" stroke=\"#f1e3c4\" stroke-width=\"1.5\" pointer-events=\"none\"/><line x1=\"${b[0]}\" y1=\"${b[1]}\" x2=\"${mx*f}\" y2=\"${my2*f}\" stroke=\"#f1e3c4\" stroke-width=\"1.5\" pointer-events=\"none\"/>\n  <text x=\"${mx*f*1.06}\" y=\"${my2*f*1.06+4}\" text-anchor=\"middle\" font-size=\"11\" fill=\"#fff\" pointer-events=\"none\">${p.t==='3:1'?'3:1':'2:1 '+EMO[p.t]}</text>`;});\n const showRoads=my&&((setup&&g.sub==='road')||g.phase==='roads'||(main&&eff==='road'));\n for(const e in geo.E){const[a,b]=geo.E[e].map(v=>P(geo.V[v])),o=g.roads[e];\n  if(o!==undefined)svg+=`<line x1=\"${a[0]}\" y1=\"${a[1]}\" x2=\"${b[0]}\" y2=\"${b[1]}\" stroke=\"#000\" stroke-width=\"9\" stroke-linecap=\"round\" pointer-events=\"none\"/><line x1=\"${a[0]}\" y1=\"${a[1]}\" x2=\"${b[0]}\" y2=\"${b[1]}\" stroke=\"${COL[g.players[o].kingdom]}\" stroke-width=\"6\" stroke-linecap=\"round\" pointer-events=\"none\"/>`;\n  else if(showRoads&&roadOk(g,S.you,e,setup))svg+=`<line x1=\"${a[0]}\" y1=\"${a[1]}\" x2=\"${b[0]}\" y2=\"${b[1]}\" stroke=\"#7CFC00\" stroke-opacity=\".55\" stroke-width=\"10\" stroke-linecap=\"round\" data-a=\"road\" data-e=\"${e}\"/>`;}\n const showCity=main&&eff==='city',cityOk=b=>showCity&&b.p===S.you&&b.t==='settlement',showSet=my&&((setup&&g.sub==='settlement')||(main&&eff==='settlement'));\n for(const v in geo.V){const[x,y]=P(geo.V[v]),b=g.bld[v];\n  if(b){const s=b.t==='city'?10:7;svg+=`<rect x=\"${x-s}\" y=\"${y-s}\" width=\"${2*s}\" height=\"${2*s}\" rx=\"${b.t==='city'?2:7}\" fill=\"${COL[g.players[b.p].kingdom]}\" stroke=\"${cityOk(b)?'#7CFC00':'#000'}\" stroke-width=\"${cityOk(b)?4:2}\" ${cityOk(b)?`data-a=\"city\" data-v=\"${v}\"`:'pointer-events=\"none\"'}/>`;}\n  else if(showSet&&settleOk(g,S.you,v,setup))svg+=`<circle cx=\"${x}\" cy=\"${y}\" r=\"8\" fill=\"#7CFC00\" fill-opacity=\".6\" stroke=\"#fff\" data-a=\"settle\" data-v=\"${v}\"/>`;}\n const need=g.discard&&g.discard[S.you],ph={setup:my?(g.sub==='settlement'?'Coloca un asentamiento (puntos verdes).':'Coloca una carretera junto a tu \u00faltimo asentamiento.'):'Colocaci\u00f3n inicial: turno de '+g.players[curp(g)].name+'.',\n  roll:my?'Tira los dados.':'Turno de '+g.players[g.turn].name+'.',discard:need?`Debes descartar ${need} cartas.`:'Esperando descartes (7).',\n  robber:my?'Mueve el ladr\u00f3n: pulsa un hex\u00e1gono.':g.players[g.turn].name+' mueve el ladr\u00f3n.',roads:my?`Construye carreteras gratis (te quedan ${g.freeRoads}).`:g.players[g.turn].name+' construye carreteras.',\n  main:my?'Tu turno: construye, comercia o termina el turno.':'Turno de '+g.players[g.turn].name+'.',ended:'Partida terminada.'}[g.phase]||'';\n const blockers=g.phase==='discard'?Object.keys(g.discard).map(Number):[curp(g)],stuck=S.you===0&&!ended&&g.phase!=='setup'&&blockers.some(k=>!L.players[k].online),stuckS=S.you===0&&!ended&&g.phase==='setup'&&!L.players[curp(g)].online;\n const d=g.dice?g.dice[0]+' + '+g.dice[1]+' = '+(g.dice[0]+g.dice[1]):'\u2014';\n const devs=me.dev.map(c=>{const bought=c.t>=g.turnNo;if(c.k==='pv')return`<span class=\"res\">\ud83c\udfc6 ${KD.pv} (oculto)</span>`;\n  const ok=my&&!g.devPlayed&&!bought&&(c.k==='caballero'?(g.phase==='roll'||g.phase==='main'):g.phase==='main');\n  return`<button data-a=\"play\" data-k=\"${c.k}\" ${ok?'':'disabled'} title=\"${bought?'Comprada este turno: no se puede jugar todav\u00eda':''}\">${KD[c.k]}${bought?' (nueva)':''}</button>`;}).join(' ')||'<span class=\"muted\">ninguna</span>';\n const offers=g.offers.map(o=>{const mine=o.from===S.you,can=!mine&&g.phase==='main'&&RES.every(r=>(o.want[r]||0)<=me.res[r]);\n  return`<div class=\"card\">${esc(g.players[o.from].name)} da ${fmt(o.give)} por ${fmt(o.want)} ${mine?`<button data-a=\"cancel\" data-id=\"${o.id}\">Cancelar</button>`:`<button data-a=\"accept\" data-id=\"${o.id}\" ${can?'':'disabled'}>Aceptar</button><button data-a=\"reject\" data-id=\"${o.id}\" ${o.rej.includes(S.you)?'disabled':''}>Rechazar</button>`}</div>`;}).join('');\n $('a').innerHTML=`<div class=\"row\"><div class=\"p\" style=\"flex:2;min-width:300px\"><svg viewBox=\"-235 -215 470 430\">${svg}</svg></div><div class=\"p\">\n <div class=\"card\"><p class=\"hint\">${ph}</p><p>Dados: <b>${d}</b> \u00b7 Mazo: ${g.deckCount} \u00b7 <span class=\"k\" style=\"background:${COL[me.kingdom]}\"></span>${esc(me.name)} (${KN[me.kingdom]})</p>\n <p>${RES.map(r=>`<span class=\"res\">${EMO[r]} ${r}: <b>${me.res[r]}</b></span>`).join('')}</p></div>\n <div class=\"card\"><button data-a=\"roll\" ${my&&g.phase==='roll'?'':'disabled'}>\ud83c\udfb2 Tirar dados</button>\n ${['road','settlement','city'].map(t=>`<button data-a=\"tool\" data-t=\"${t}\" class=\"${eff===t?'on':''}\" ${main?'':'disabled'}>${{road:'Carretera',settlement:'Asentamiento',city:'Ciudad'}[t]}</button>`).join('')}\n <button data-a=\"buyDev\" ${main&&afford(me,{lana:1,trigo:1,mineral:1})?'':'disabled'}>Comprar carta</button><button data-a=\"bank\" ${main?'':'disabled'}>Banco/puertos</button><button data-a=\"offer\" ${main?'':'disabled'}>Ofrecer intercambio</button>\n <button class=\"pri\" data-a=\"end\" ${main?'':'disabled'}>Terminar turno</button>${need?`<button class=\"pri\" data-a=\"discard\">Descartar ${need}</button>`:''}<button data-a=\"rules\">Reglas</button>\n ${stuck||stuckS?`<p class=\"hint\">Un jugador desconectado bloquea la partida. ${stuckS?'(En la colocaci\u00f3n inicial hay que esperar a que vuelva.)':'<button data-a=\"skip\">Saltar su turno</button>'}</p>`:''}</div>\n <div class=\"card\"><b>Tus cartas de desarrollo:</b><br>${devs}</div>${offers?`<div class=\"card\"><b>Ofertas:</b>${offers}</div>`:''}\n <div class=\"card\">${g.players.map((p,i)=>`<div>${L.players[i]&&L.players[i].online?'\ud83d\udfe2':'\u26aa'} <span class=\"k\" style=\"background:${COL[p.kingdom]}\"></span><b>${esc(p.name)}</b> \u00b7 ${p.vp} pts \u00b7 ${p.res?'':p.resCount+' \ud83c\udca0 \u00b7 '}${p.devCount!==undefined?p.devCount+' cartas dev \u00b7 ':''}\u2694${p.knights}${g.longest===i?' \ud83d\udee3 Camino m\u00e1s largo':''}${g.army===i?' \ud83d\udee1 Ej\u00e9rcito m\u00e1s grande':''}${curp(g)===i&&!ended?' \u25c0':''}</div>`).join('')}</div>\n <div id=\"log\" class=\"card\">${g.log.slice(-30).reverse().map(esc).join('<br>')}</div></div></div>`+\n (ended?`<div class=\"card\"><h1>\ud83c\udfc6 \u00a1Victoria de ${esc(g.players[g.winner].name)} (${KN[g.players[g.winner].kingdom]})!</h1><p style=\"text-align:center\">${g.players.map(p=>`${esc(p.name)}: ${p.vpTotal} pts (${p.pvCards} cartas de punto de victoria ocultas)`).join(' \u00b7 ')}</p></div>`:'');\n if(!need&&M==='discard')closeM();if(need&&M!=='discard')discardModal(need);}\nfunction discardModal(need){M='discard';const me=S.game.players[S.you];\n modal('Descarta '+need+' cartas',`<p class=\"muted\">Se tir\u00f3 un 7 y tienes m\u00e1s de 7 cartas.</p>`+RES.map(r=>`<div>${EMO[r]} ${r} (tienes ${me.res[r]}): <input type=\"number\" id=\"d_${r}\" min=\"0\" max=\"${me.res[r]}\" value=\"0\"></div>`).join(''),'Descartar',()=>{\n  const cards={};let sum=0;for(const r of RES){cards[r]=num('d_'+r);sum+=cards[r];}if(sum!==need){toast('Debes descartar exactamente '+need+' cartas.');return false;}M=null;act({type:'discard',cards});},false);}\n\nfunction render(){if(!S)return;if(S.you<0)return backHome('Tu sesi\u00f3n ya no es v\u00e1lida en esta sala.');S.lobby.started&&S.game?game():(closeMIf(),lobby());}\nfunction closeMIf(){if(M)closeM();}\n\n// ---------- acciones ----------\nconst ACT={\n create:createGame,join:joinGame,closeM,rules:()=>modal('Reglas',RULES,'',null),\n copy(){const i=$('lk');i.select();const man=()=>toast('Pulsa Ctrl+C para copiar el enlace ya seleccionado');if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(i.value).then(()=>toast('Enlace copiado'),man);else man();},\n pick:d=>send({t:'pick',kingdom:d.k}),leave(){if(!confirm('\u00bfAbandonar la sala?'))return;leaving=true;send({t:'leave'});setTimeout(()=>{clearTok(code);location.hash='';backHome();},600);},\n start:()=>send({t:'start'}),kick:d=>send({t:'kick',index:+d.i}),skip:()=>send({t:'skip'}),\n roll:()=>act({type:'roll'}),tool:d=>{tool=d.t;render();},settle:d=>act({type:'settlement',vertex:d.v}),city:d=>act({type:'city',vertex:d.v}),road:d=>act({type:'road',edge:d.e}),\n buyDev:()=>act({type:'buyDev'}),end:()=>act({type:'end'}),accept:d=>act({type:'accept',id:+d.id}),reject:d=>act({type:'reject',id:+d.id}),cancel:d=>act({type:'cancel',id:+d.id}),\n discard:()=>discardModal(S.game.discard[S.you]),\n hex(d){const g=S.game,i=+d.i,H=geo.hexes[i];const vs=[...new Set(H.v.map(v=>g.bld[v]).filter(b=>b&&b.p!==S.you).map(b=>b.p))].filter(p=>g.players[p].resCount>0);\n  if(i===g.robber)return toast('Debes mover el ladr\u00f3n a otro hex\u00e1gono.');\n  if(vs.length>1)modal('\u00bfA qui\u00e9n robas?',vs.map(p=>`<button data-a=\"rob\" data-i=\"${i}\" data-p=\"${p}\">${esc(g.players[p].name)}</button>`).join(''),'',null);else act({type:'robber',hex:i,victim:vs[0]});},\n rob(d){closeM();act({type:'robber',hex:+d.i,victim:+d.p});},\n bank(){const g=S.game,me=g.players[S.you];\n  modal('Comercio con el banco / puertos',`<p>Entregas:</p>${RES.map(r=>`<label class=\"res\"><input type=\"radio\" name=\"bg\" value=\"${r}\" ${me.res[r]>=ratio(g,S.you,r)?'':'disabled'}> ${EMO[r]} ${ratio(g,S.you,r)}:1 (tienes ${me.res[r]})</label>`).join('<br>')}<p>Recibes 1:</p>${RES.map(r=>`<label class=\"res\"><input type=\"radio\" name=\"bt\" value=\"${r}\"> ${EMO[r]} ${r}</label>`).join('')}`,'Intercambiar',()=>{\n   const a=document.querySelector('input[name=bg]:checked'),b=document.querySelector('input[name=bt]:checked');if(!a||!b){toast('Elige qu\u00e9 entregas y qu\u00e9 recibes.');return false;}act({type:'bank',give:a.value,get:b.value});});},\n offer(){modal('Proponer intercambio a los dem\u00e1s',`<table><tr><td></td><td>Doy</td><td>Pido</td></tr>${RES.map(r=>`<tr><td>${EMO[r]} ${r}</td><td><input type=\"number\" min=\"0\" id=\"og_${r}\" value=\"0\"></td><td><input type=\"number\" min=\"0\" id=\"ow_${r}\" value=\"0\"></td></tr>`).join('')}</table>`,'Proponer',()=>{\n   const give={},want={};for(const r of RES){give[r]=num('og_'+r);want[r]=num('ow_'+r);}act({type:'offer',give,want});});},\n play(d){const k=d.k;if(k==='caballero')act({type:'knight'});else if(k==='carreteras')act({type:'roads'});\n  else if(k==='monopolio')modal('Monopolio: \u00bfqu\u00e9 recurso?',RES.map(r=>`<button data-a=\"mono\" data-r=\"${r}\">${EMO[r]} ${r}</button>`).join(''),'',null);\n  else modal('A\u00f1o de abundancia: elige 2 recursos del banco',`<select id=\"p1\">${RES.map(r=>`<option>${r}</option>`).join('')}</select><select id=\"p2\">${RES.map(r=>`<option>${r}</option>`).join('')}</select>`,'Tomar',()=>act({type:'plenty',r1:$('p1').value,r2:$('p2').value}));},\n mono(d){closeM();act({type:'monopoly',res:d.r});}\n};\ndocument.addEventListener('click',e=>{const el=e.target.closest&&e.target.closest('[data-a]');if(!el||el.disabled)return;const f=ACT[el.dataset.a];if(f)f(el.dataset,el);});\ndocument.addEventListener('keydown',e=>{if(e.key==='Enter'&&($('nm')===document.activeElement||$('cd')===document.activeElement)&&!busy){const h=$('cd')&&$('cd').value.trim();h?joinGame():createGame();}});\nwindow.addEventListener('error',e=>{console.error('[catan] error JS',e.message);showErr('Error inesperado en la p\u00e1gina: '+e.message);});\nwindow.addEventListener('unhandledrejection',e=>{console.error('[catan] promesa rechazada',e.reason);showErr('Error inesperado: '+(e.reason&&e.reason.message||e.reason));});\nhome();\n(()=>{const h=(location.hash||'').slice(1).toUpperCase().replace(/[^A-Z0-9]/g,'');if(h.length===5&&loadTok(h))enter(h);})();\n</script></body></html>\n";
const E=ENGINE;
const GEO={hexes:E.G.hexes.map(h=>({cx:h.cx,cy:h.cy,v:h.v})),V:Object.fromEntries(Object.entries(E.G.V).map(([k,v])=>[k,[v.x,v.y]])),E:E.G.E};
const ALPHA='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',ROOM_TTL=12*3600*1000;
const CORS={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'};
const json=(o,st=200)=>new Response(JSON.stringify(o),{status:st,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',...CORS}});
const fail=(st,code,m)=>json({ok:false,code,error:m},st);
const cleanName=n=>{n=String(n==null?'':n).replace(/\s+/g,' ').trim();return(n.length>=1&&n.length<=20&&!/[<>&"'`]/.test(n))?n:null;};
const cleanCode=c=>String(c==null?'':c).toUpperCase().replace(/[^A-Z0-9]/g,'');
const newCode=()=>{const b=new Uint8Array(5);crypto.getRandomValues(b);return Array.from(b,x=>ALPHA[x%ALPHA.length]).join('');};
const stub=(env,code)=>env.GAME.get(env.GAME.idFromName(code));
const call=(env,code,path,body)=>stub(env,code).fetch(new Request('https://room.internal'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}));

export default{async fetch(req,env){
 const u=new URL(req.url),P=u.pathname;
 try{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  if(P==='/api/health')return json({ok:true,service:'catan-reinos-en-guerra'});
  if(P==='/api/create'&&req.method==='POST'){
   const b=await req.json().catch(()=>({})),name=cleanName(b.name);
   if(!name)return fail(400,'bad_name','Escribe un nombre de 1 a 20 caracteres (sin < > & " \' `).');
   for(let i=0;i<10;i++){const code=newCode(),r=await call(env,code,'/create',{name});
    if(r.status===200){const d=await r.json();return json({ok:true,code,token:d.token});}
    if(r.status!==409)return fail(500,'create_failed','El servidor no pudo crear la sala.');}
   return fail(500,'no_code','No se pudo generar un código libre. Inténtalo de nuevo.');}
  if(P==='/api/join'&&req.method==='POST'){
   const b=await req.json().catch(()=>({})),code=cleanCode(b.code);
   if(code.length!==5)return fail(400,'bad_code','El código debe tener 5 caracteres.');
   const r=await call(env,code,'/join',{name:b.name,token:b.token});
   return new Response(r.body,{status:r.status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',...CORS}});}
  if(P.startsWith('/api/room/')&&req.method==='GET'){
   const code=cleanCode(P.slice(10));if(code.length!==5)return fail(400,'bad_code','El código debe tener 5 caracteres.');
   const r=await call(env,code,'/info');
   return new Response(r.body,{status:r.status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',...CORS}});}
  if(P.startsWith('/ws/')){
   if(req.headers.get('Upgrade')!=='websocket')return new Response('Se esperaba una conexión WebSocket',{status:426});
   const code=cleanCode(P.slice(4));if(code.length!==5)return new Response('Código inválido',{status:400});
   return stub(env,code).fetch(req);}
  if(P==='/'||P==='/index.html')return new Response(HTML,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-cache'}});
  return new Response('No encontrado',{status:404});
 }catch(e){return fail(500,'server_error','Error interno del servidor: '+(e&&e.message||e));}
}};

export class Game{
 constructor(st){this.st=st;this.socks=new Map();this.L=null;this.loaded=false;this.q=Promise.resolve();}
 async load(){if(!this.loaded){this.L=(await this.st.storage.get('L'))||null;this.loaded=true;}}
 run(fn){const p=this.q.then(fn,fn);this.q=p.catch(()=>{});return p;}
 async save(){await this.st.storage.put('L',this.L);if(this.st.storage.setAlarm)try{await this.st.storage.setAlarm(Date.now()+ROOM_TTL);}catch{}}
 async alarm(){await this.load();if(this.socks.size===0){this.L=null;if(this.st.storage.deleteAll)await this.st.storage.deleteAll();}else if(this.st.storage.setAlarm)await this.st.storage.setAlarm(Date.now()+ROOM_TTL);}
 async fetch(req){
  const u=new URL(req.url);
  if(u.pathname.startsWith('/ws/')){
   const[c,s]=Object.values(new WebSocketPair());s.accept();
   s.addEventListener('message',m=>{if(typeof m.data!=='string'||m.data.length>4096)return;let d;try{d=JSON.parse(m.data)}catch{return}
    this.run(async()=>{try{await this.load();await this.msg(s,d);}catch(e){try{s.send(JSON.stringify({t:'err',m:'Error del servidor: '+(e&&e.message||e)}));}catch{}}});});
   const gone=()=>{if(this.socks.delete(s))this.run(async()=>{await this.load();this.bc();});};
   s.addEventListener('close',gone);s.addEventListener('error',gone);
   return new Response(null,{status:101,webSocket:c});}
  const b=req.method==='POST'?await req.json().catch(()=>({})):{};
  return this.run(async()=>{await this.load();return this.http(u.pathname,b);});}
 http(path,b){
  const L=this.L;
  if(path==='/create'){if(L)return fail(409,'exists','Código ocupado.');
   const name=cleanName(b.name);if(!name)return fail(400,'bad_name','Nombre inválido.');const token=crypto.randomUUID();
   this.L={players:[{id:token,name,kingdom:null}],started:false,game:null,created:Date.now()};return this.save().then(()=>json({ok:true,token}));}
  if(!L)return fail(404,'no_room','No existe ninguna partida con ese código. Revisa que esté bien escrito.');
  if(path==='/info')return json({ok:true,players:L.players.length,started:L.started,full:L.players.length>=4});
  if(path==='/join'){
   const have=b.token&&L.players.find(p=>p.id===String(b.token));
   if(have)return json({ok:true,token:have.id,rejoin:true,name:have.name});
   if(L.started)return fail(409,'started','La partida ya ha empezado. Solo pueden volver los jugadores que ya estaban registrados.');
   if(L.players.length>=4)return fail(409,'full','La partida está llena (4 jugadores).');
   const name=cleanName(b.name);if(!name)return fail(400,'bad_name','Escribe un nombre de 1 a 20 caracteres (sin < > & " \' `).');
   if(L.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return fail(409,'name_taken','Ya hay un jugador con ese nombre en la sala. Elige otro.');
   const token=crypto.randomUUID();L.players.push({id:token,name,kingdom:null});
   return this.save().then(()=>{this.bc();return json({ok:true,token});});}
  return fail(404,'not_found','Ruta desconocida.');}
 err(s,m,fatal){try{s.send(JSON.stringify({t:fatal?'fatal':'err',m}));}catch{}if(fatal)try{s.close(4001,'fatal');}catch{}}
 online(){return new Set(this.socks.values());}
 async msg(s,d){const L=this.L;
  if(!L)return this.err(s,'La sala no existe.',true);
  if(d.t==='ping')return;
  const tk=String(d.token||'').slice(0,64),p=L.players.find(x=>x.id===tk);
  if(d.t==='join'){
   if(!p)return this.err(s,'Tu sesión no es válida para esta sala. Vuelve a unirte desde el inicio.',true);
   this.socks.set(s,tk);s.send(JSON.stringify({t:'geo',geo:GEO}));return this.bc();}
  if(!p||this.socks.get(s)!==tk)return this.err(s,'No has entrado en la partida.');
  const idx=L.players.indexOf(p),on=this.online();let changed=true;
  if(d.t==='pick'){
   if(L.started)return this.err(s,'La partida ya ha empezado.');
   const k=d.kingdom;if(!E.KINGDOMS[k])return this.err(s,'Reino desconocido.');
   if(L.players.some(x=>x.kingdom===k&&x.id!==tk))return this.err(s,'Ese reino ya está ocupado.');p.kingdom=k;}
  else if(d.t==='unpick'){if(L.started)return;p.kingdom=null;}
  else if(d.t==='leave'){
   if(!L.started){L.players=L.players.filter(x=>x.id!==tk);this.socks.delete(s);try{s.send(JSON.stringify({t:'left'}));}catch{}}
   else changed=false;}
  else if(d.t==='kick'){
   if(L.started)return this.err(s,'La partida ya ha empezado.');if(idx!==0)return this.err(s,'Solo el anfitrión puede expulsar.');
   const q=L.players[+d.index];if(!q||q.id===tk)return this.err(s,'Jugador inválido.');if(on.has(q.id))return this.err(s,'Solo puedes expulsar a jugadores desconectados.');
   L.players=L.players.filter(x=>x!==q);}
  else if(d.t==='start'){
   if(L.started)return;if(idx!==0)return this.err(s,'Solo el anfitrión puede empezar.');
   if(L.players.length<3||L.players.length>4)return this.err(s,'Hacen falta 3 o 4 jugadores.');
   if(L.players.some(x=>!on.has(x.id)))return this.err(s,'Todos los jugadores deben estar conectados.');
   if(L.players.some(x=>!x.kingdom))return this.err(s,'Todos deben elegir reino.');
   if(new Set(L.players.map(x=>x.kingdom)).size!==L.players.length)return this.err(s,'Los reinos deben ser distintos.');
   L.game=E.newGame(L.players.map(x=>({id:x.id,name:x.name,kingdom:x.kingdom})),Math.random);L.started=true;}
  else if(d.t==='act'){
   if(!L.started)return this.err(s,'La partida no ha empezado.');
   const r=E.apply(L.game,tk,d.a||{},Math.random);if(r.error)return this.err(s,r.error);L.game=r.state;}
  else if(d.t==='skip'){
   if(!L.started)return;if(idx!==0)return this.err(s,'Solo el anfitrión puede saltar turnos.');
   const g=L.game,block=g.phase==='discard'?Object.keys(g.discard).map(Number):[E.cur(g)];
   const off=block.filter(k=>!on.has(L.players[k].id));
   if(!off.length)return this.err(s,'Nadie que bloquee la partida está desconectado.');
   const r=E.forceSkip(g,off,Math.random);if(r.error)return this.err(s,r.error);L.game=r.state;}
  else return;
  if(changed)await this.save();this.bc();}
 bc(){const L=this.L;if(!L)return;const on=this.online();
  for(const[s,tk]of this.socks){const you=L.players.findIndex(x=>x.id===tk);let g=null;
   if(L.game&&you>=0){g=E.viewFor(L.game,tk);g.players.forEach(p=>delete p.id);}
   try{s.send(JSON.stringify({t:'state',you,lobby:{players:L.players.map(x=>({name:x.name,kingdom:x.kingdom,online:on.has(x.id)})),started:L.started},game:g}));}catch{}}}
}
