// Pruebas de integración: worker compilado (dist/worker.js) + clientes WebSocket reales.
// Ejecutar: node test/integration.test.mjs   (antes: python3 build.py)
import {startSim} from './cf-sim.mjs';
let pass=0,failN=0;
const ok=(c,n)=>{if(c){pass++;console.log('OK  '+n);}else{failN++;console.log('FALLO '+n);}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,ms=4000,what=''){const t=Date.now();while(Date.now()-t<ms){const v=f();if(v)return v;await sleep(10);}throw new Error('timeout esperando '+what);}
const sim=await startSim();const U=sim.url;
const post=async(p,b)=>{const r=await fetch(U+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});return{status:r.status,body:await r.json()};};
const get=async p=>{const r=await fetch(U+p);return{status:r.status,body:await r.json()};};

class Client{
  constructor(code,token,name){this.code=code;this.token=token;this.name=name;this.msgs=[];this.raw=[];this.state=null;this.geo=null;this.closed=false;}
  async open(){this.ws=new WebSocket(U.replace('http','ws')+'/ws/'+this.code);
    this.ws.onmessage=e=>{this.raw.push(e.data);const m=JSON.parse(e.data);this.msgs.push(m);if(m.t==='state')this.state=m;if(m.t==='geo')this.geo=m.geo;};
    this.ws.onclose=()=>{this.closed=true;};
    await new Promise((res,rej)=>{this.ws.onopen=res;this.ws.onerror=()=>rej(new Error('ws error'));});
    this.ws.send(JSON.stringify({t:'join',token:this.token}));return this;}
  send(o){this.ws.send(JSON.stringify({...o,token:this.token}));}
  async req(o){const n=this.msgs.length;this.send(o);
    await until(()=>this.msgs.slice(n).some(m=>m.t==='state'||m.t==='err'||m.t==='fatal'||m.t==='left'),4000,'respuesta a '+JSON.stringify(o).slice(0,60));
    const m=this.msgs.slice(n).find(m=>m.t==='err'||m.t==='fatal');return m?{err:m.m}:{ok:true};}
  async act(a){return this.req({t:'act',a:{...a,seq:this.state.game.seq}});}
  close(){this.ws.close();}
}
async function newRoom(n=1){const c=await post('/api/create',{name:'Anfi'});const cl=[await new Client(c.body.code,c.body.token,'Anfi').open()];
  for(let i=1;i<n;i++){const j=await post('/api/join',{code:c.body.code,name:'J'+i});cl.push(await new Client(c.body.code,j.body.token,'J'+i).open());}
  await until(()=>cl.every(x=>x.state&&x.state.lobby.players.length===n),3000,'lobby');return{code:c.body.code,cl};}

// ===== 1. Crear sala de verdad =====
const c1=await post('/api/create',{name:'Juan'});
ok(c1.status===200&&/^[A-Z2-9]{5}$/.test(c1.body.code)&&c1.body.token.length>20,'crear partida devuelve código de 5 caracteres y token');
const info=await get('/api/room/'+c1.body.code);
ok(info.status===200&&info.body.players===1&&info.body.started===false,'la sala existe en el servidor y se recupera por su código');
const codes=new Set();for(let i=0;i<30;i++){const r=await post('/api/create',{name:'X'});codes.add(r.body.code);}
ok(codes.size===30,'30 salas creadas → 30 códigos únicos');
const bad=await post('/api/create',{name:'   '});ok(bad.status===400&&bad.body.code==='bad_name','crear con nombre vacío → 400 con mensaje');
const bad2=await post('/api/create',{name:'<script>'});ok(bad2.status===400,'crear con nombre con caracteres peligrosos → 400');
const bad3=await post('/api/create',{name:'A'.repeat(21)});ok(bad3.status===400,'crear con nombre de 21 caracteres → 400');
const cors=await fetch(U+'/api/create',{method:'OPTIONS'});ok(cors.status===204&&cors.headers.get('access-control-allow-origin')==='*','CORS: preflight OPTIONS correcto');
const home=await fetch(U+'/');const html=await home.text();ok(home.status===200&&html.includes('Crear partida')&&html.includes('/api/create'),'GET / sirve el frontend que llama a /api/create');
const health=await get('/api/health');ok(health.body.ok===true,'/api/health responde');

// ===== 2. Salas inexistentes: NO se crean =====
const ne=await get('/api/room/ZZZZ9');ok(ne.status===404&&ne.body.code==='no_room','consultar sala inexistente → 404');
const nj=await post('/api/join',{code:'ZZZZ9',name:'Pepe'});ok(nj.status===404&&nj.body.code==='no_room','unirse a sala inexistente → 404');
const ne2=await get('/api/room/ZZZZ9');ok(ne2.status===404,'tras intentar unirse, la sala inexistente SIGUE sin existir (no se crea una nueva)');
const wsx=await new Client('ZZZZ9','tokenfalso','x').open();await until(()=>wsx.msgs.some(m=>m.t==='fatal'),3000,'fatal');ok(wsx.msgs.some(m=>m.t==='fatal'),'WebSocket a sala inexistente → error fatal, sin crear sala');
await sleep(50);const ne3=await get('/api/room/ZZZZ9');ok(ne3.status===404,'el WebSocket tampoco creó la sala');
const badc=await post('/api/join',{code:'AB',name:'Pepe'});ok(badc.status===400,'código mal formado → 400');

// ===== 3. Unirse y validaciones =====
const j1=await post('/api/join',{code:c1.body.code,name:'Nacho'});ok(j1.status===200&&j1.body.token&&j1.body.token!==c1.body.token,'unirse a sala existente OK con token propio');
const dup=await post('/api/join',{code:c1.body.code.toLowerCase(),name:'nacho'});ok(dup.status===409&&dup.body.code==='name_taken','nombre repetido (sin distinguir mayúsculas) → 409; el código acepta minúsculas');
const j2=await post('/api/join',{code:c1.body.code,name:'Carlos'});const j3=await post('/api/join',{code:c1.body.code,name:'Eduardo'});
ok(j2.status===200&&j3.status===200,'cuarto jugador entra');
const full=await post('/api/join',{code:c1.body.code,name:'Quinto'});ok(full.status===409&&full.body.code==='full','quinto jugador → partida llena');
const rj=await post('/api/join',{code:c1.body.code,name:'otro',token:j1.body.token});ok(rj.status===200&&rj.body.rejoin===true,'reentrar con el token propio funciona aunque la sala esté llena');
const wsb=await new Client(c1.body.code,'tokeninventado','x').open();await until(()=>wsb.msgs.some(m=>m.t==='fatal'),3000,'fatal2');ok(wsb.msgs.some(m=>m.t==='fatal'),'WebSocket con token inválido → fatal, no entra');

// ===== 4. Lobby sincronizado y reinos =====
{const {code,cl}=await newRoom(3);const[h,a,b]=cl;
 ok(h.state.lobby.players.length===3&&a.state.you===1&&h.state.you===0,'los 3 clientes ven el lobby con su índice');
 ok(!JSON.stringify(h.raw).includes(a.token)&&!JSON.stringify(a.raw).includes(h.token),'los tokens/identificadores no se envían a otros clientes');
 await h.req({t:'pick',kingdom:'azul'});await until(()=>a.state.lobby.players[0].kingdom==='azul',3000,'sync');ok(a.state.lobby.players[0].kingdom==='azul'&&b.state.lobby.players[0].kingdom==='azul','elegir reino se sincroniza a todos');
 const r=await a.req({t:'pick',kingdom:'azul'});ok(r.err&&/ocupado/.test(r.err),'un reino ocupado no se puede elegir otra vez');
 await a.req({t:'pick',kingdom:'amarillo'});
 const s1=await h.req({t:'start'});ok(s1.err&&/reino/.test(s1.err),'no se puede empezar sin que todos tengan reino');
 const s2=await a.req({t:'start'});ok(s2.err&&/anfitri/.test(s2.err),'solo el anfitrión puede empezar');
 b.close();await until(()=>h.state.lobby.players[2].online===false,3000,'offline');ok(h.state.lobby.players[2].online===false,'estado de conexión: desconectado se refleja en tiempo real');
 const k=await h.req({t:'start'});ok(k.err,'no se empieza con un jugador desconectado');
 const b2=await new Client(code,b.token,'J2').open();await until(()=>h.state.lobby.players[2].online===true,3000,'online');ok(h.state.lobby.players[2].online,'reconexión: vuelve a aparecer conectado con el mismo token');
 await b2.req({t:'pick',kingdom:'rojo'});
 const st=await h.req({t:'start'});ok(st.ok,'anfitrión empieza con 3 conectados y reinos distintos');
 await until(()=>[h,a,b2].every(x=>x.state.lobby.started&&x.state.game),3000,'game');ok([h,a,b2].every(x=>x.state.game&&x.state.game.players.length===3),'todos pasan al tablero de la MISMA partida');
 const hs=h.state.game.hexes.map(x=>x.t+x.n).join(),as=a.state.game.hexes.map(x=>x.t+x.n).join();ok(hs===as,'todos ven el mismo tablero');
 // privacidad
 const g=a.state.game;ok(g.players[0].res===undefined&&g.players[0].dev===undefined&&g.players[1].res!==undefined,'cada cliente solo recibe sus propios recursos/cartas');
 ok(g.deck===undefined&&typeof g.deckCount==='number','el mazo de desarrollo no se envía');
 ok(!a.raw.some(r=>r.includes(h.token)||r.includes(b2.token)),'ningún token ajeno aparece en el tráfico');
 const late=await post('/api/join',{code,name:'Tarde'});ok(late.status===409&&late.body.code==='started','tras empezar no entran jugadores nuevos');
 const re=await post('/api/join',{code,name:'x',token:a.token});ok(re.status===200&&re.body.rejoin,'tras empezar, un jugador registrado sí puede reconectar');
 // colocación inicial: acciones validadas en el servidor
 const V=Object.keys(h.geo.V),bad=await a.act({type:'settlement',vertex:V[0]});ok(bad.err&&/turno/.test(bad.err),'acción fuera de turno rechazada por el servidor');
 const bad2=await h.act({type:'settlement',vertex:'1,1'});ok(bad2.err,'vértice inventado rechazado');
 const good=await h.act({type:'settlement',vertex:V[10]});ok(good.ok&&a.state.game.bld[V[10]],'asentamiento válido se refleja en TODOS los clientes');
 const stale=await new Promise(res=>{const n=h.msgs.length;h.send({t:'act',a:{type:'road',edge:'x',seq:0}});until(()=>h.msgs.length>n,2000).then(()=>res(h.msgs[h.msgs.length-1]));});ok(stale.t==='err','acción con seq desfasada rechazada');
 // salto de turno / desconexión
 a.close();b2.close();await sleep(100);
 const sk=await h.req({t:'skip'});ok(sk.err&&/colocación|esperar/.test(sk.err)||sk.err,'no se puede saltar la colocación inicial');
 h.close();
}

// ===== 5. Kick y abandonar en el lobby =====
{const {cl}=await newRoom(3);const[h,a,b]=cl;a.close();await until(()=>h.state.lobby.players[1].online===false,3000,'off');
 const k=await h.req({t:'kick',index:1});await until(()=>h.state.lobby.players.length===2,3000,'kick');ok(k.ok&&h.state.lobby.players.length===2,'el anfitrión puede expulsar a un jugador desconectado');
 const k2=await h.req({t:'kick',index:1});ok(k2.err,'no se puede expulsar a un jugador conectado');
 await b.req({t:'leave'});await until(()=>h.state.lobby.players.length===1,3000,'leave');ok(h.state.lobby.players.length===1,'abandonar libera el sitio y se sincroniza');}

// ===== 6. Partida completa con bots hasta la victoria =====
async function botGame(n){
  const {cl}=await newRoom(n);const K=['azul','amarillo','rojo','blanco'];
  for(let i=0;i<n;i++)await cl[i].req({t:'pick',kingdom:K[i]});
  const st=await cl[0].req({t:'start'});if(!st.ok)throw new Error('start: '+st.err);
  await until(()=>cl.every(c=>c.state.game),3000,'game');
  const geo=cl[0].geo,V=Object.keys(geo.V),E=Object.keys(geo.E),RES=['madera','arcilla','lana','trigo','mineral'];
  const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const cur=g=>g.phase==='setup'?g.setupOrder[g.setupStep]:g.turn;
  let steps=0,errs=0;const t0=Date.now();
  while(true){
    const g=cl[0].state.game;if(g.winner!==null)break;
    if(++steps>6000||Date.now()-t0>150000)throw new Error('la partida no terminó (fase '+g.phase+', pasos '+steps+')');
    const act=async(c,a)=>{const r=await c.act(a);if(r.err)errs++;return r;};
    if(g.phase==='discard'){for(const k of Object.keys(g.discard)){const c=cl[k],me=c.state.game.players[k],need=g.discard[k],cards={};let left=need;
        for(const r of RES){const t=Math.min(left,me.res[r]);if(t){cards[r]=t;left-=t;}}await act(c,{type:'discard',cards});}continue;}
    const i=cur(g),c=cl[i],me=c.state.game.players[i];
    if(g.phase==='setup'){
      if(g.sub==='settlement'){for(const v of shuffle(V)){if((await act(c,{type:'settlement',vertex:v})).ok)break;}}
      else{for(const e of shuffle(E)){if((await act(c,{type:'road',edge:e})).ok)break;}}continue;}
    if(g.phase==='roll'){await act(c,{type:'roll'});continue;}
    if(g.phase==='robber'){for(const h of shuffle([...Array(19).keys()])){const r=await act(c,{type:'robber',hex:h,victim:undefined});if(r.ok)break;
        const vs=[0,1,2,3].slice(0,n).filter(x=>x!==i);for(const v of vs){if((await act(c,{type:'robber',hex:h,victim:v})).ok)break;}if(c.state.game.phase!=='robber')break;}continue;}
    if(g.phase==='roads'){for(const e of shuffle(E)){if((await act(c,{type:'road',edge:e})).ok)break;}if(cl[0].state.game.phase==='roads')await act(c,{type:'end'});continue;}
    if(g.phase==='main'){
      const has=o=>Object.keys(o).every(r=>me.res[r]>=o[r]);let done=false;
      // 1) ciudad
      if(has({trigo:2,mineral:3})){for(const v of Object.keys(g.bld)){if(g.bld[v].p===i&&g.bld[v].t==='settlement'&&(await act(c,{type:'city',vertex:v})).ok){done=true;break;}}if(done)continue;}
      // 2) asentamiento
      if(has({madera:1,arcilla:1,lana:1,trigo:1})){for(const v of shuffle(V)){if((await act(c,{type:'settlement',vertex:v})).ok){done=true;break;}}if(done)continue;}
      // 3) carta de desarrollo y jugar las que se pueda
      for(const d of me.dev){const tp={caballero:'knight',carreteras:'roads'}[d.k];if(tp&&d.t<g.turnNo&&!g.devPlayed){const r=await act(c,{type:tp});if(r.ok){done=true;break;}}}if(done)continue;
      if(has({lana:1,trigo:1,mineral:1})&&g.deckCount>0){if((await act(c,{type:'buyDev'})).ok)continue;}
      // 4) intercambio con el banco para completar lo que falta
      let traded=false;for(const give of RES){const q=2;if(me.res[give]>=4){const need=RES.find(r=>r!=give&&me.res[r]===0);if(need){const r=await act(c,{type:'bank',give,get:need});if(r.ok){traded=true;break;}}}}if(traded)continue;
      // 5) carretera si sobran materiales
      if(has({madera:1,arcilla:1})&&Object.values(g.roads).filter(x=>x===i).length<15){for(const e of shuffle(E)){if((await act(c,{type:'road',edge:e})).ok){done=true;break;}}if(done)continue;}
      await act(c,{type:'end'});continue;}
    await sleep(5);
  }
  const g=cl[0].state.game;return{g,cl,steps,errs};
}
for(const n of[3,4]){
  const t=Date.now();let res;
  try{res=await botGame(n);}catch(e){ok(false,'partida de '+n+' bots hasta la victoria: '+e.message);continue;}
  const{g,cl,steps}=res;const w=g.players[g.winner];
  ok(g.winner!==null&&g.phase==='ended','partida de '+n+' jugadores terminada con victoria ('+w.name+', '+w.vpTotal+' pts, '+steps+' pasos, '+((Date.now()-t)/1000).toFixed(1)+'s)');
  ok(g.players[g.winner].vpTotal>=10,'el ganador tiene ≥10 puntos');
  ok(cl.every(c=>c.state.game.winner===g.winner&&c.state.game.players.every(p=>p.pvCards!==undefined)),'todos los clientes reciben la victoria y los puntos ocultos revelados');
  const tot=r=>g.bank[r]+g.players.reduce((a,p,k)=>a+(cl[k].state.game.players[k].res[r]),0);
  ok(['madera','arcilla','lana','trigo','mineral'].every(r=>tot(r)===19),'conservación de recursos: banco+jugadores = 19 de cada tipo');
  cl.forEach(c=>c.close());
}
await sim.close();
console.log(`\n${pass} superadas, ${failN} falladas`);process.exit(failN?1:0);
