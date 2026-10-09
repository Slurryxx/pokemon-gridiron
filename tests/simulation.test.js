const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('server.js','utf8');
const segment=source.slice(source.indexOf('function rate('),source.indexOf('async function api('));
assert.ok(segment.includes('function simulate('),'simulation function present');
const POSITIONS=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT','DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
const db=Array.from({length:151},(_,i)=>({id:i+1,name:'pokemon-'+(i+1),weight_kg:40+i,stats:{speed:70,attack:70,defense:70,hp:70,'special-attack':70,'special-defense':70}}));
const ctx={db,POSITIONS,crypto:require('node:crypto')};vm.createContext(ctx);
vm.runInContext(segment+';globalThis.runSim=simulate;',ctx);
const players=[0,1].map(t=>({lineup:Object.fromEntries(POSITIONS.map((p,i)=>[p,t*22+i+1]))}));
for(let i=0;i<15;i++){
 const r=ctx.runSim(players);
 assert.equal(r.scores.length,2);
 assert.ok(r.events.length>20);
 assert.ok(r.events.some(e=>e.kind==='final'));
 assert.ok(r.events.every(e=>Array.isArray(e.scores)&&e.scores.length===2));
 assert.ok(r.events.every(e=>e.spot>=0&&e.spot<=100));
 assert.ok(r.events.every(e=>e.possession===0||e.possession===1));
 assert.ok(r.events.some(e=>e.actors&&e.actors.carrier));
 assert.ok(r.events.every(e=>!e.actors?.carrier||(e.actors.carrier>=1&&e.actors.carrier<=151)));
 assert.equal(r.winner,r.scores[0]>r.scores[1]?0:1);
}
const html=fs.readFileSync('index.html','utf8'),client=fs.readFileSync('draft.js','utf8');
for(const id of ['field','field-qb','field-carrier','field-defense','sprite-qb','sprite-carrier','sprite-defense','scrimmage','field-ball','field-flash','fieldpossession','fieldyard'])assert.ok(html.includes('id="'+id+'"'),id+' element');
assert.ok(client.includes('function fieldUpdate(e)'));
console.log('PASS: 15 simulated games, event positions, actor IDs, scoreboard, replay DOM hooks');
