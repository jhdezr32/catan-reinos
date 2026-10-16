// Simulador mínimo del runtime de Cloudflare Workers + Durable Objects para pruebas locales.
// Carga el worker COMPILADO (dist/worker.js) y lo sirve por HTTP/WebSocket reales.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
let WebSocketServer;
for(const p of ['ws','/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/ws']){try{({WebSocketServer}=require(p));break;}catch{}}
if(!WebSocketServer)throw new Error('Falta el módulo ws');
const here=path.dirname(fileURLToPath(import.meta.url));

// --- polyfills de Workers ---
const NativeResponse=globalThis.Response;
globalThis.Response=class extends NativeResponse{
  constructor(body,init={}){
    if(init.status===101){super(null,{status:200});Object.defineProperty(this,'status',{value:101});this.webSocket=init.webSocket;}
    else super(body,init);
  }};
function makePair(){
  const mk=()=>({l:{message:[],close:[]},accepted:false,peer:null,real:null,
    accept(){this.accepted=true;},
    addEventListener(t,f){(this.l[t]=this.l[t]||[]).push(f);},
    send(d){if(this.real){if(this.real.readyState!==1)throw new Error('socket cerrado');this.real.send(d);}else this.peer.emit('message',{data:d});},
    emit(t,e){(this.l[t]||[]).forEach(f=>f(e));},
    close(){if(this.real)this.real.close();}});
  const a=mk(),b=mk();a.peer=b;b.peer=a;return {0:a,1:b};
}
globalThis.WebSocketPair=function(){return makePair();};

export async function startSim({port=0,distFile=path.join(here,'..','dist','worker.js'),failNext}={}){
  const tmp=path.join(here,'.worker-under-test.mjs');fs.copyFileSync(distFile,tmp);
  const mod=await import(pathToFileURL(tmp).href+'?t='+Date.now());
  // Durable Objects en memoria
  const storages=new Map(),objs=new Map();
  const env={GAME:{
    idFromName:n=>({name:n}),
    get:id=>{let o=objs.get(id.name);if(!o){const st={storage:{_m:storages.get(id.name)||new Map(),async get(k){return this._m.get(k);},async put(k,v){this._m.set(k,JSON.parse(JSON.stringify(v)));}}};storages.set(id.name,st.storage._m);o=new mod.Game(st,env);objs.set(id.name,o);}return {fetch:r=>o.fetch(r)};}}};
  const toReq=(req)=>new Request('http://'+(req.headers.host||'localhost')+req.url,{method:req.method,headers:req.headers});
  const server=http.createServer(async(req,res)=>{
    try{
      const body=await new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>r(b));});
      const init={method:req.method,headers:req.headers};if(!['GET','HEAD'].includes(req.method))init.body=body;
      const r=await mod.default.fetch(new Request('http://'+(req.headers.host||'localhost')+req.url,init),env);
      res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
    }catch(e){res.writeHead(500);res.end('ERR '+e.stack);}
  });
  const wss=new WebSocketServer({noServer:true});
  server.on('upgrade',async(req,sock,head)=>{
    try{
      const r=await mod.default.fetch({url:'http://'+req.headers.host+req.url,method:'GET',headers:{get:k=>({upgrade:'websocket'})[k.toLowerCase()]??req.headers[k.toLowerCase()]??null}},env);
      if(r.status!==101){sock.write(`HTTP/1.1 ${r.status} X\r\n\r\n`);return sock.destroy();}
      wss.handleUpgrade(req,sock,head,real=>{
        const srv=r.webSocket.peer; // lado servidor
        srv.real=real;
        real.on('message',m=>srv.emit('message',{data:m.toString()}));
        real.on('close',()=>srv.emit('close',{}));
      });
    }catch(e){console.error('UPGRADE ERR',e);sock.destroy();}
  });
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  return {server,port:server.address().port,url:'http://127.0.0.1:'+server.address().port,objs,storages,
    close:()=>new Promise(r=>{wss.clients.forEach(c=>c.terminate());server.close(()=>r());})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const s=await startSim({port:+process.env.PORT||8787});console.log('SIM listo en',s.url);}
