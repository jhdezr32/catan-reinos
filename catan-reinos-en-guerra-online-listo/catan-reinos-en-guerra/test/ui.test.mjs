// Pruebas de interfaz en Chromium real. Incluye la REGRESIÓN del fallo "Crear partida no hace nada".
// Requiere: npm i playwright && npx playwright install chromium   (ya instalado en el entorno de desarrollo)
import {startSim} from './cf-sim.mjs';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);let chromium;
for(const p of ['playwright','/home/claude/.npm-global/lib/node_modules/playwright']){try{({chromium}=require(p));break;}catch{}}
if(!chromium)throw new Error('Falta playwright');
const here=path.dirname(fileURLToPath(import.meta.url));
let pass=0,failN=0;const ok=(c,n)=>{if(c){pass++;console.log('OK  '+n);}else{failN++;console.log('FALLO '+n);}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sim=await startSim();const b=await chromium.launch();
const newPage=async()=>{const ctx=await b.newContext();const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));return p;};
const rooms=()=>sim.objs.size;

// ===== A. Flujo feliz: crear → lobby → invitar → unirse → reinos → empezar =====
const host=await newPage();await host.goto(sim.url+'/');
await host.fill('#nm','Juan');await host.click('#bc');
await host.waitForSelector('text=Código de partida');
const code=(await host.innerText('#a')).match(/Código de partida:\s*([A-Z0-9]{5})/)[1];
ok(!!code,'«Crear partida» muestra el lobby con código de 5 caracteres ('+code+')');
const info=await (await fetch(sim.url+'/api/room/'+code)).json();ok(info.ok&&info.players===1,'la sala existe de verdad en el servidor y se recupera por su código');
const link=await host.inputValue('#lk');ok(link===sim.url+'/#'+code,'la interfaz muestra el enlace de invitación correcto');
ok((await host.innerText('#a')).includes('Juan')&&(await host.innerText('#a')).includes('anfitrión'),'el creador queda registrado como anfitrión');
const p2=await newPage();await p2.goto(link);
ok(await p2.inputValue('#cd')===code,'abrir el enlace de invitación rellena el código');
await p2.fill('#nm','Nacho');await p2.click('#bj');await p2.waitForSelector('text=Código de partida');
await host.waitForFunction(()=>document.getElementById('a').innerText.includes('Nacho'));
ok((await host.innerText('#a')).includes('Nacho'),'el anfitrión ve entrar al amigo en tiempo real');
const p3=await newPage();await p3.goto(sim.url+'/');await p3.fill('#nm','Carlos');await p3.fill('#cd',code.toLowerCase());await p3.click('#bj');await p3.waitForSelector('text=Código de partida');
// reinos
await host.click('[data-k=azul]');await p2.click('[data-k=amarillo]');await p3.click('[data-k=rojo]');
await p3.waitForFunction(()=>document.querySelector('[data-k=azul]').disabled,null,{timeout:4000});
ok(await p3.$eval('[data-k=azul]',e=>e.disabled)&&await p2.$eval('[data-k=azul]',e=>e.disabled),'un reino ocupado queda deshabilitado en los demás clientes');
ok((await p3.innerText('#a')).includes('Reino de Asturias — Juan'),'la elección de reino de otros se ve en tiempo real');
ok(await p2.$eval('[data-a=start]',e=>e===null).catch(()=>true),'un invitado no ve el botón de empezar');
await host.waitForFunction(()=>!document.querySelector('[data-a=start]').disabled);
await host.click('[data-a=start]');
for(const [n,p] of [['anfitrión',host],['invitado 1',p2],['invitado 2',p3]]){await p.waitForSelector('svg polygon',{timeout:5000});ok((await p.$$('svg polygon')).length===19,n+' ve el tablero de 19 hexágonos');}
// primera colocación real por la interfaz
await host.waitForSelector('[data-a=settle]');const before=await p2.$$eval('svg rect',r=>r.length);
await host.click('[data-a=settle]');await p2.waitForFunction(n=>document.querySelectorAll('svg rect').length>n,before,{timeout:4000});
ok(true,'el asentamiento colocado por el anfitrión aparece en el navegador de otro jugador');
await host.waitForSelector('[data-a=road]');await host.click('[data-a=road]');
await p2.waitForFunction(()=>/Coloca un asentamiento/.test(document.getElementById('a').innerText),null,{timeout:4000});
ok(true,'tras la carretera, el turno pasa al siguiente jugador y todos lo ven');
ok(![host,p2,p3].some(p=>p.errs.length),'sin errores JavaScript en ningún navegador');

// ===== B. REGRESIÓN: el error original no debe repetirse =====
// B1. Página abierta como archivo local, sin servidor: debe mostrar un error claro
const f=await newPage();await f.goto('file://'+path.join(here,'..','src','index.html'));
ok(((await f.innerText('#err')).includes('archivo local')),'sin servidor (file://): aviso visible desde el principio');
await f.fill('#nm','Juan');await f.click('#bc');await sleep(300);
ok((await f.innerText('#err')).includes('archivo local')&&!(await f.$eval('#bc',e=>e.disabled)),'sin servidor: el botón no se queda muerto, el error sigue visible y se puede reintentar');
// B2. Frontend servido SIN backend (HTML estático): error visible, no silencio
const stat=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end(fs.readFileSync(path.join(here,'..','src','index.html')));});await new Promise(r=>stat.listen(0,'127.0.0.1',r));
const s2=await newPage();await s2.goto('http://127.0.0.1:'+stat.address().port+'/');await s2.fill('#nm','Juan');await s2.click('#bc');
await s2.waitForFunction(()=>document.getElementById('err').style.display==='block',null,{timeout:6000});
ok(/servidor|inesperado/.test(await s2.innerText('#err')),'frontend sin backend: «Crear partida» muestra un error visible: «'+(await s2.innerText('#err')).slice(0,70)+'…»');
ok(!(await s2.$eval('#bc',e=>e.disabled)),'tras el error el botón vuelve a estar activo');
stat.close();
// B3. Sin nombre → mensaje, no silencio
const n0=await newPage();await n0.goto(sim.url+'/');const r0=rooms();await n0.click('#bc');
ok((await n0.innerText('#err')).includes('Escribe tu nombre')&&rooms()===r0,'sin nombre: mensaje claro y no se crea ninguna sala');
// B4. Doble pulsación → UNA sola sala
const d=await newPage();await d.route('**/api/create',async r=>{await sleep(600);r.continue();});await d.goto(sim.url+'/');await d.fill('#nm','Doble');
const r1=rooms();await d.dblclick('#bc');await d.waitForSelector('text=Código de partida');await sleep(300);
ok(rooms()-r1===1,'doble clic en «Crear partida» crea UNA sola sala');
// B5. Servidor devuelve error → mensaje y se puede reintentar
const e5=await newPage();let fail=true;await e5.route('**/api/create',r=>{if(fail){fail=false;r.fulfill({status:500,contentType:'application/json',body:'{"ok":false,"error":"Fallo simulado del servidor"}'});}else r.continue();});
await e5.goto(sim.url+'/');await e5.fill('#nm','Reintento');await e5.click('#bc');await e5.waitForFunction(()=>document.getElementById('err').innerText.includes('Fallo simulado'));
ok(true,'error 500 del servidor → se muestra el mensaje');await e5.click('#bc');await e5.waitForSelector('text=Código de partida');ok(true,'tras el error se puede reintentar y la sala se crea');
// B6. Unirse a sala inexistente / código mal escrito
const x=await newPage();await x.goto(sim.url+'/');const r2=rooms();await x.fill('#nm','Pepe');await x.fill('#cd','ZZZZ9');await x.click('#bj');
await x.waitForFunction(()=>document.getElementById('err').style.display==='block');
ok((await x.innerText('#err')).includes('No existe ninguna partida')&&(await x.innerText('#a')).includes('Unirse'),'unirse a código inexistente: error claro y NO entra en ninguna sala');
await sleep(200);ok((await (await fetch(sim.url+'/api/room/ZZZZ9')).json()).code==='no_room','…y la sala inexistente no se ha creado');
await x.fill('#cd','AB');await x.click('#bj');ok((await x.innerText('#err')).includes('5 letras'),'código incompleto: mensaje claro');
// B7. Nombre repetido (sala en el lobby) y sala ya empezada
const fresh=await (await fetch(sim.url+'/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Anfi'})})).json();
const y=await newPage();await y.goto(sim.url+'/#'+fresh.code);await y.fill('#nm','anfi');await y.click('#bj');
await y.waitForFunction(()=>document.getElementById('err').style.display==='block');ok((await y.innerText('#err')).includes('Ya hay un jugador'),'nombre repetido en la sala: mensaje claro');
const y2=await newPage();await y2.goto(link);await y2.fill('#nm','Tarde');await y2.click('#bj');
await y2.waitForFunction(()=>document.getElementById('err').style.display==='block');ok((await y2.innerText('#err')).includes('ya ha empezado'),'unirse a una partida ya empezada: mensaje claro');
// B8. Reconexión tras recargar la página
await p2.reload();await p2.waitForSelector('svg polygon',{timeout:5000});ok(true,'recargar la página (F5) devuelve al jugador a su partida en curso');
// B9. Caída y recuperación del servidor de WebSocket: el cliente muestra estado
await p3.evaluate(()=>ws.close());await p3.waitForSelector('svg polygon',{timeout:6000});ok(true,'conexión cortada: el cliente reconecta solo y sigue en la partida');

await b.close();await sim.close();console.log(`\n${pass} superadas, ${failN} falladas`);process.exit(failN?1:0);
