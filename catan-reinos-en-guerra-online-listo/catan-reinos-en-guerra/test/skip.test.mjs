// Salto de turno cuando el jugador que bloquea la partida está desconectado (servidor real).
import {startSim} from './cf-sim.mjs';
const sim=await startSim(),U=sim.url,sleep=ms=>new Promise(r=>setTimeout(r,ms));let pass=0,bad=0;const ok=(c,n)=>{c?pass++:bad++;console.log((c?'OK  ':'FALLO ')+n);};
const post=async(p,b)=>(await fetch(U+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)})).json();
const mk=async(code,token)=>{const c={msgs:[],state:null,token};c.ws=new WebSocket(U.replace('http','ws')+'/ws/'+code);c.ws.onmessage=e=>{const m=JSON.parse(e.data);c.msgs.push(m);if(m.t==='state')c.state=m;};await new Promise(r=>c.ws.onopen=r);c.ws.send(JSON.stringify({t:'join',token}));c.send=o=>c.ws.send(JSON.stringify({...o,token}));return c;};
const a=await post('/api/create',{name:'A'}),b=await post('/api/join',{code:a.code,name:'B'}),c=await post('/api/join',{code:a.code,name:'C'});
const cl=[await mk(a.code,a.token),await mk(a.code,b.token),await mk(a.code,c.token)];await sleep(100);
['azul','amarillo','rojo'].forEach((k,i)=>cl[i].send({t:'pick',kingdom:k}));await sleep(100);cl[0].send({t:'start'});await sleep(150);
const room=sim.objs.get(a.code),G=()=>room.L.game;
const err=async(c,o)=>{const n=c.msgs.length;c.send(o);await sleep(100);return c.msgs.slice(n).find(m=>m.t==='err');};
Object.assign(G(),{phase:'main',turn:1,seq:G().seq+1});room.bc();await sleep(50);
ok(!!(await err(cl[0],{t:'skip'})),'no se puede saltar el turno de un jugador conectado');
cl[1].ws.close();await sleep(150);
ok(!!(await err(cl[2],{t:'skip'})),'un invitado no puede saltar turnos (solo el anfitrión)');
const e=await err(cl[0],{t:'skip'});ok(!e&&G().turn===2&&G().phase==='roll','el anfitrión salta el turno del jugador desconectado y la partida continúa');
await sim.close();console.log(`\n${pass} superadas, ${bad} falladas`);process.exit(bad?1:0);
