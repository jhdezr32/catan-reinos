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
module.exports={forceSkip,RES,COST,KINGDOMS,G,newGame,apply,viewFor,score,cur,produce,ratio,longestLen,updAwards};
