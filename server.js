const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PORT=process.env.PORT||3000,rooms=new Map(),POSITIONS=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT','DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
let db=[],error='';
async function init(){
 try{
  const cache=path.join(__dirname,'pokemon_151.json');
  if(fs.existsSync(cache)){const x=JSON.parse(fs.readFileSync(cache));if(x.length===151&&x.every(p=>p.moves&&p.stats)){db=x;return}}
  let n=1;const results=Array(151);
  await Promise.all(Array.from({length:8},async()=>{while(n<=151){let id=n++;for(let tries=0;tries<4;tries++){try{
   const r=await fetch('https://pokeapi.co/api/v2/pokemon/'+id,{signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('PokéAPI HTTP '+r.status);
   const p=await r.json();
   results[id-1]={id,name:p.name,height_m:p.height/10,weight_kg:p.weight/10,types:p.types.map(x=>x.type.name),abilities:p.abilities.map(x=>x.ability.name),stats:Object.fromEntries(p.stats.map(x=>[x.stat.name,x.base_stat])),moves:p.moves.map(x=>({name:x.move.name,learned:x.version_group_details.map(y=>({method:y.move_learn_method.name,level:y.level_learned_at,version:y.version_group.name}))}))};break
  }catch(e){if(tries===3)throw e;await new Promise(r=>setTimeout(r,1000*(tries+1)))}}}}));
  db=results;try{fs.writeFileSync(cache,JSON.stringify(db))}catch{}console.log('Pokémon database ready: '+db.length)
 }catch(e){error=e.message;console.error('Database download failed',e)}
}
init();
const json=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
async function body(req){let a=[],n=0;for await(const c of req){n+=c.length;if(n>20000)throw Error('Request too large');a.push(c)}return JSON.parse(Buffer.concat(a).toString()||'{}')}
function room(code){const r=rooms.get(String(code||'').toUpperCase());if(!r)throw Error('Room not found');return r}
function side(r,token){const i=r.players.findIndex(x=>x&&x.token===token);if(i<0)throw Error('Invalid room token');return i}
function turn(n){return Math.floor(n/2)%2===0?n%2:1-n%2}
function view(r,i){return {code:r.code,side:i,phase:r.phase,picks:r.picks,turn:r.picks.length<44?turn(r.picks.length):null,rosters:[0,1].map(t=>r.picks.filter(x=>x.side===t).map(x=>x.id)),ready:r.players.map(x=>!!x?.ready),connected:r.players.map(x=>!!x),result:r.result}}
function rate(id,pos){const p=db[id-1],s=p.stats,sp=s.speed,atk=s.attack,def=s.defense,hp=s.hp,sa=s['special-attack'],sd=s['special-defense'],weight=p.weight_kg;const power=atk*.65+hp*.15+Math.min(weight,200)*.13;
 if(pos==='QB')return sa*.55+sp*.25+hp*.2;
 if(pos==='RB'||pos.startsWith('WR'))return sp*.65+sa*.2+atk*.15;
 if(pos==='TE')return power*.6+sa*.4;
 if(['LT','LG','C','RG','RT','DT1','DT2'].includes(pos))return power*.65+def*.35;
 if(pos.startsWith('DE'))return power*.5+sp*.25+def*.25;
 if(pos.startsWith('LB'))return def*.5+sp*.3+atk*.2;
 return sp*.55+sd*.25+def*.2
}
function simulate(players){const scores=[0,0],yards=[0,0],turnovers=[0,0],log=[];
 const o=[0,1].map(t=>POSITIONS.slice(0,11).reduce((n,p)=>n+rate(players[t].lineup[p],p),0)/11);
 const d=[0,1].map(t=>POSITIONS.slice(11).reduce((n,p)=>n+rate(players[t].lineup[p],p),0)/11);
 const rand=()=>crypto.randomInt(1000000)/1000000;
 for(let q=1;q<=4;q++){log.push('QUARTER '+q);for(let drive=0;drive<6;drive++){
  const t=(q+drive)%2,opp=1-t;let spot=25,down=1,need=10;
  for(let play=0;play<14;play++){
   const edge=o[t]-d[opp];
   if(rand()<Math.max(.01,Math.min(.12,.045-edge*.0003))){turnovers[t]++;log.push('Q'+q+' '+(t?'VOLT':'FOREST')+' turnover');break}
   let gain=Math.max(-5,Math.round(5+edge*.16+(rand()-.5)*22));if(rand()<.12)gain=0;
   spot+=gain;yards[t]+=gain;log.push('Q'+q+' '+(t?'VOLT':'FOREST')+' '+gain+' yards, '+down+' & '+need);
   if(spot>=100){scores[t]+=7;log.push('Q'+q+' TOUCHDOWN '+(t?'VOLT':'FOREST')+'!');break}
   if(spot<=0){scores[opp]+=2;log.push('Q'+q+' SAFETY!');break}
   if(gain>=need){down=1;need=10}else{down++;need=Math.max(1,need-gain)}
   if(down>4){if(spot>=60&&rand()<.7){scores[t]+=3;log.push('Q'+q+' FIELD GOAL '+(t?'VOLT':'FOREST')+'!')}break}
  }
 }}
 if(scores[0]===scores[1]){const winner=rand()<Math.max(.2,Math.min(.8,.5+(o[0]-d[1]-o[1]+d[0])*.01))?0:1;scores[winner]+=3;log.push('OVERTIME FIELD GOAL!')}
 return {scores,yards,turnovers,log,winner:scores[0]>scores[1]?0:1}
}
async function api(req,res,url){try{
 if(url.pathname==='/api/health')return json(res,200,{ok:true,databaseReady:db.length===151,count:db.length,error});
 if(url.pathname==='/api/catalog')return json(res,200,{ready:db.length===151,error,pokemon:db.map(p=>({id:p.id,name:p.name,types:p.types,height_m:p.height_m,weight_kg:p.weight_kg}))});
 const b=req.method==='POST'?await body(req):{};
 if(url.pathname==='/api/create'&&req.method==='POST'){const code=crypto.randomBytes(3).toString('hex').toUpperCase(),token=crypto.randomBytes(24).toString('hex');const r={code,players:[{token,ready:false},null],phase:'waiting',picks:[],result:null,created:Date.now()};rooms.set(code,r);return json(res,200,{...view(r,0),token})}
 const r=room(b.code||url.searchParams.get('code'));
 if(url.pathname==='/api/join'&&req.method==='POST'){if(r.players[1]||r.phase!=='waiting')return json(res,409,{error:'Room full or already started'});const token=crypto.randomBytes(24).toString('hex');r.players[1]={token,ready:false};r.phase='draft';return json(res,200,{...view(r,1),token})}
 const i=side(r,b.token||url.searchParams.get('token'));
 if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,view(r,i));
 if(url.pathname==='/api/pick'&&req.method==='POST'){
  if(db.length!==151)return json(res,503,{error:'Pokémon database still loading'});
  if(r.phase!=='draft'||turn(r.picks.length)!==i)return json(res,409,{error:'Not your turn'});
  if(!Number.isInteger(b.id)||b.id<1||b.id>151||r.picks.some(p=>p.id===b.id))return json(res,409,{error:'Pokémon unavailable'});
  r.picks.push({side:i,id:b.id});if(r.picks.length===44)r.phase='lineups';return json(res,200,view(r,i))
 }
 if(url.pathname==='/api/ready'&&req.method==='POST'){
  if(r.phase!=='lineups')return json(res,409,{error:'Finish the draft first'});
  const owned=new Set(r.picks.filter(p=>p.side===i).map(p=>p.id)),l=b.lineup;
  if(!l||POSITIONS.some(p=>!Number.isInteger(l[p])||!owned.has(l[p]))||new Set(POSITIONS.map(p=>l[p])).size!==22)return json(res,400,{error:'Each drafted Pokémon must fill exactly one position'});
  r.players[i].lineup=Object.fromEntries(POSITIONS.map(p=>[p,l[p]]));r.players[i].ready=true;
  if(r.players.every(p=>p.ready)){r.result=simulate(r.players);r.phase='finished'}
  return json(res,200,view(r,i))
 }
 return json(res,404,{error:'Unknown endpoint'})
 }catch(e){return json(res,400,{error:e.message})}}
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))return api(req,res,url);
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
 let name;try{name=decodeURIComponent(url.pathname)}catch{return json(res,400,{error:'Bad URL'})}
 if(name==='/')name='/index.html';const file=path.resolve(__dirname,'.'+name);
 if(!file.startsWith(__dirname+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||file.endsWith('pokemon_151.json'))return json(res,404,{error:'Not found'});
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res)
}).listen(PORT,'0.0.0.0',()=>console.log('Pokémon Gridiron listening on '+PORT));
setInterval(()=>{for(const [code,r] of rooms)if(Date.now()-r.created>21600000)rooms.delete(code)},3600000).unref();
