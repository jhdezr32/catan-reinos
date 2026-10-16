// Pruebas del motor para las novedades de la versión "online-listo".
const E=require('../src/engine.js');let n=0,bad=0;
const ok=(c,m)=>{if(c){n++;console.log('OK  '+m);}else{bad++;console.log('FALLO '+m);}};
const mk=(k=3)=>E.newGame(['azul','amarillo','rojo','blanco'].slice(0,k).map((kg,i)=>({id:'id'+i,name:'J'+i,kingdom:kg})),()=>0.3);
// viewFor oculta PV durante la partida y los revela al terminar
{const s=mk();s.players[1].dev=[{k:'pv',t:0},{k:'caballero',t:0}];s.players[1].res.madera=3;
 let v=E.viewFor(s,'id0');ok(v.players[1].dev===undefined&&v.players[1].res===undefined&&v.players[1].pvCards===undefined,'durante la partida no se revelan cartas ni puntos ocultos de otros');
 ok(v.players[1].devCount===2&&v.players[1].resCount===3,'solo se ven los totales de cartas de los demás');
 s.winner=0;s.phase='ended';v=E.viewFor(s,'id0');ok(v.players[1].pvCards===1&&v.players[1].vpTotal===1,'al terminar, se revelan los puntos de victoria ocultos');
 ok(v.players[1].dev===undefined,'…pero seguirían sin enviarse las cartas ajenas');}
// forceSkip
{const s=mk();ok(E.forceSkip(s,[0]).error,'no se puede saltar la colocación inicial');
 const g=mk();g.phase='main';g.turn=1;g.devPlayed=true;g.offers=[{id:1,from:1,give:{},want:{},rej:[]}];g.turnNo=4;
 const r=E.forceSkip(g,[1]);ok(r.state.turn===2&&r.state.phase==='roll'&&r.state.devPlayed===false&&r.state.offers.length===0&&r.state.turnNo===5&&r.state.seq===g.seq+1,'saltar turno: pasa al siguiente, limpia ofertas y cartas jugadas');
 const d=mk();d.phase='discard';d.turn=0;d.players[2].res={madera:5,arcilla:3,lana:0,trigo:0,mineral:0};d.discard={2:4};d.bank.madera=14;d.bank.arcilla=16;
 const r2=E.forceSkip(d,[2]);const t=Object.values(r2.state.players[2].res).reduce((a,b)=>a+b,0);
 ok(t===4&&r2.state.phase==='robber'&&Object.keys(r2.state.discard).length===0,'descarte automático de un jugador desconectado y conservación de cartas');
 ok(Object.values(r2.state.bank).reduce((a,b)=>a+b,0)===Object.values(d.bank).reduce((a,b)=>a+b,0)+4,'las cartas descartadas vuelven al banco');
 const w=mk();w.winner=0;ok(E.forceSkip(w,[0]).error,'no se puede saltar en una partida terminada');}
console.log(`\n${n} pruebas nuevas superadas${bad?`, ${bad} FALLADAS`:''}`);process.exit(bad?1:0);
