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
