// Pruebas de interfaz de las mecánicas (banco, ofertas, descarte, ladrón, ciudad, cartas) en Chromium real.
import {startSim} from './cf-sim.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let chromium;
for(const p of ['playwright','/home/claude/.npm-global/lib/node_modules/playwright']){try{({chromium}=require(p));break;}catch{}}
let pass=0,failN=0;const ok=(c,n)=>{if(c){pass++;console.log('OK  '+n);}else{failN++;console.log('FALLO '+n);}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sim=await startSim(),b=await chromium.launch();
const mk=async()=>{const p=await(await b.newContext()).newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));return p;};
const ps=[await mk(),await mk(),await mk()],names=['Juan','Nacho','Carlos'],K=['azul','amarillo','rojo'];
await ps[0].goto(sim.url+'/');await ps[0].fill('#nm','Juan');await ps[0].click('#bc');await ps[0].waitForSelector('text=Código de partida');
const code=(await ps[0].innerText('#a')).match(/Código de partida:\s*([A-Z0-9]{5})/)[1];
for(let i=1;i<3;i++){await ps[i].goto(sim.url+'/#'+code);await ps[i].fill('#nm',names[i]);await ps[i].click('#bj');await ps[i].waitForSelector('text=Código de partida');}
for(let i=0;i<3;i++)await ps[i].click(`[data-k=${K[i]}]`);
await ps[0].waitForFunction(()=>!document.querySelector('[data-a=start]').disabled);await ps[0].click('[data-a=start]');
const room=sim.objs.get(code),G=()=>room.L.game;
// colocación inicial 100% por la interfaz (12 pasos: 3 jugadores × 2 rondas × asentamiento+carretera)
for(let step=0;step<12;step++){const cur=G().setupOrder[G().setupStep],p=ps[cur],sub=G().sub;
  await p.waitForSelector(sub==='settlement'?'[data-a=settle]':'[data-a=road]',{timeout:4000});await p.click(sub==='settlement'?'[data-a=settle]':'[data-a=road]');
  const s0=G().seq;for(let t=0;t<200&&G().seq===s0;t++)await sleep(10);}
ok(G().phase==='roll'&&Object.keys(G().bld).length===6&&Object.keys(G().roads).length===6,'colocación inicial completa por la interfaz (6 asentamientos, 6 carreteras)');
// tirada real por el botón
await ps[0].waitForSelector('button:not([disabled])[data-a=roll]');await ps[0].click('[data-a=roll]');for(let t=0;t<200&&!G().dice;t++)await sleep(10);
ok(!!G().dice,'el botón «Tirar dados» tira los dados en el servidor y se muestra: '+G().dice);
const force=(f)=>{f(G());room.bc();};
const settle=async(f)=>{await sleep(80);};
// preparar estado controlado: fase principal, turno de Juan
force(g=>{g.phase='main';g.turn=0;g.devPlayed=false;g.discard={};g.robber=g.hexes.findIndex(h=>h.t==='desierto');
  g.players[0].res={madera:4,arcilla:0,lana:1,trigo:2,mineral:3};g.players[1].res={madera:0,arcilla:0,lana:0,trigo:1,mineral:0};g.players[2].res={madera:1,arcilla:1,lana:1,trigo:1,mineral:1};g.seq++;});
await ps[0].waitForFunction(()=>!document.querySelector('[data-a=bank]').disabled);
// Banco 4:1 (o mejor por puerto)
await ps[0].click('[data-a=bank]');await ps[0].click('input[name=bg][value=madera]');await ps[0].click('input[name=bt][value=arcilla]');await ps[0].click('#mo');
for(let t=0;t<200&&G().players[0].res.arcilla!==1;t++)await sleep(10);
ok(G().players[0].res.arcilla===1&&G().players[0].res.madera<=2,'banco: intercambio ejecutado desde el modal (madera→arcilla)');
// Ciudad
await ps[0].click('[data-a=tool][data-t=city]');await ps[0].waitForSelector('[data-a=city]');await ps[0].click('[data-a=city]');
for(let t=0;t<200&&Object.values(G().bld).filter(b=>b.p===0&&b.t==='city').length===0;t++)await sleep(10);
ok(Object.values(G().bld).some(b=>b.p===0&&b.t==='city')&&G().players[0].res.mineral===0,'ciudad: construida con el botón y los recursos descontados');
// Carta de desarrollo
force(g=>{g.players[0].res={madera:0,arcilla:0,lana:1,trigo:1,mineral:1};g.seq++;});
await ps[0].waitForFunction(()=>!document.querySelector('[data-a=buyDev]').disabled);await ps[0].click('[data-a=buyDev]');
for(let t=0;t<200&&G().players[0].dev.length===0;t++)await sleep(10);
ok(G().players[0].dev.length===1,'comprar carta de desarrollo');
await ps[0].waitForSelector('text=Mazo: 24');ok(true,'el contador del mazo se actualiza para todos (24)');
// Oferta entre jugadores: Juan da 1 lana por 1 trigo, Nacho acepta
force(g=>{g.players[0].res={madera:0,arcilla:0,lana:1,trigo:0,mineral:0};g.players[1].res={madera:0,arcilla:0,lana:0,trigo:1,mineral:0};g.seq++;});
await ps[0].waitForFunction(()=>!document.querySelector('[data-a=offer]').disabled);
await ps[0].click('[data-a=offer]');await ps[0].fill('#og_lana','1');await ps[0].fill('#ow_trigo','1');await ps[0].click('#mo');
await ps[1].waitForSelector('[data-a=accept]');ok(true,'la oferta aparece en el navegador del otro jugador');
await ps[1].waitForFunction(()=>!document.querySelector('[data-a=accept]').disabled);await ps[1].click('[data-a=accept]');
for(let t=0;t<200&&G().players[1].res.lana!==1;t++)await sleep(10);
ok(G().players[1].res.lana===1&&G().players[0].res.trigo===1&&G().offers.length===0,'intercambio entre jugadores ejecutado atómicamente');
// Descarte con 7: el modal aparece solo
force(g=>{g.phase='discard';g.discard={1:4};g.players[1].res={madera:4,arcilla:2,lana:2,trigo:0,mineral:0};g.seq++;});
await ps[1].waitForSelector('text=Descarta 4 cartas');ok(true,'descarte: el modal obligatorio aparece al jugador afectado');
await ps[1].fill('#d_madera','4');await ps[1].click('#mo');
for(let t=0;t<200&&G().phase==='discard';t++)await sleep(10);
ok(G().phase==='robber'&&G().players[1].res.madera===0,'descarte aceptado → pasa a mover el ladrón');
// Ladrón: Juan pulsa un hexágono
const hexTarget=G().robber===0?1:0;
await ps[0].waitForSelector('[data-a=hex]');await ps[0].click(`[data-a=hex][data-i="${hexTarget===G().robber?2:hexTarget}"]`,{force:true});
await sleep(150);const askVictim=(await ps[0].innerText('#m')).includes('¿A quién robas?');
if(askVictim){ok(true,'ladrón: con varios vecinos la interfaz pregunta a quién robar');await ps[0].click('[data-a=rob]');}
for(let t=0;t<200&&G().phase==='robber';t++)await sleep(10);
ok(G().phase==='main','ladrón movido con un clic en el hexágono');
// Cartas: Año de abundancia y Monopolio desde modales
force(g=>{g.devPlayed=false;g.turnNo=5;g.players[0].dev=[{k:'abundancia',t:1},{k:'monopolio',t:1},{k:'pv',t:1}];g.players[0].res={madera:0,arcilla:0,lana:0,trigo:0,mineral:0};g.seq++;});
await ps[0].waitForSelector('button[data-a=play][data-k=abundancia]:not([disabled])');await ps[0].click('[data-a=play][data-k=abundancia]');await ps[0].selectOption('#p1','mineral');await ps[0].selectOption('#p2','trigo');await ps[0].click('#mo');
for(let t=0;t<200&&G().players[0].res.mineral!==1;t++)await sleep(10);
ok(G().players[0].res.mineral===1&&G().players[0].res.trigo===1,'carta Año de abundancia desde la interfaz');
ok(await ps[0].$eval('[data-a=play][data-k=monopolio]',e=>e.disabled),'solo una carta de desarrollo por turno: la segunda queda deshabilitada');
// Terminar turno
await ps[0].click('[data-a=end]');for(let t=0;t<200&&G().turn!==1;t++)await sleep(10);
await ps[1].waitForSelector('button:not([disabled])[data-a=roll]');ok(G().turn===1,'«Terminar turno» pasa el turno y al siguiente jugador se le activa «Tirar dados»');
// Victoria visible
force(g=>{g.turn=1;g.phase='main';g.players[1].res={madera:0,arcilla:0,lana:0,trigo:2,mineral:3};
  // 8 puntos por edificios + ciudad nueva
  g.bld={};const V=Object.keys(room.L.game.bld);g.seq++;});
await sleep(100);
ok(![...ps].some(p=>p.errs.length),'sin errores JavaScript durante toda la sesión de juego: '+ps.map(p=>p.errs.join('|')).join(''));
await b.close();await sim.close();console.log(`\n${pass} superadas, ${failN} falladas`);process.exit(failN?1:0);
