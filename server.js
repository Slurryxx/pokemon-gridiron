const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const scouting=require('./scouting.js');
const {Pool}=require('pg');
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:4,connectionTimeoutMillis:10000}):null;
function dbIssue(e){
 const msg=String(e?.message||'');const code=String(e?.code||'');
 if(!pool)return 'DATABASE_URL is missing from Render environment variables.';
 if(/password authentication failed|28P01/i.test(msg+' '+code))return 'Supabase rejected the database password. Check the password in DATABASE_URL.';
 if(/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(msg+' '+code))return 'Database hostname cannot be resolved. Use the Supabase Session Pooler connection string.';
 if(/ETIMEDOUT|timeout|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(msg+' '+code))return 'Cannot reach Supabase. Check the Session Pooler host and port 5432.';
 if(/SSL|certificate|self.signed/i.test(msg+' '+code))return 'Database SSL negotiation failed. Check Supabase connection settings.';
 if(/permission denied|42501/i.test(msg+' '+code))return 'Database user lacks permission to create or write the leaderboard table.';
 if(/relation .* does not exist|42P01/i.test(msg+' '+code))return 'Leaderboard table is missing and could not be initialized.';
 if(/too many connections|53300/i.test(msg+' '+code))return 'Supabase connection limit reached. Try again shortly.';
 if(/project.*paused|project.*inactive/i.test(msg))return 'Supabase project may be paused. Resume it in the Supabase dashboard.';
 return 'Supabase database error ('+(code||'connection failure')+'). Check Render logs for details.';
}
let leaderboardReady=null;
async function leaderboardDB(){
 if(!pool)throw Error('DATABASE_URL is not configured on Render');
 if(!leaderboardReady)leaderboardReady=pool.query(`CREATE TABLE IF NOT EXISTS gridiron_leaderboard (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(28) NOT NULL,
  score INTEGER NOT NULL,
  offense INTEGER NOT NULL,
  defense INTEGER NOT NULL,
  lineup JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`).catch(e=>{leaderboardReady=null;throw e});
 await leaderboardReady;
}


const AUTH_COOKIE='gridiron_session';
const hashPassword=(password,salt)=>crypto.scryptSync(password,salt,64).toString('hex');
const authCookie=(token,maxAge)=>AUTH_COOKIE+'='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+maxAge;
async function accountsDB(){
 if(!pool)throw Error('Account database unavailable. Configure DATABASE_URL on Render.');
 await pool.query(`CREATE TABLE IF NOT EXISTS gridiron_users(id BIGSERIAL PRIMARY KEY,username VARCHAR(24) NOT NULL UNIQUE,password_salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS gridiron_sessions(token_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES gridiron_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS gridiron_teams(user_id BIGINT PRIMARY KEY REFERENCES gridiron_users(id) ON DELETE CASCADE,name VARCHAR(40) NOT NULL,lineup JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS gridiron_challenges(id BIGSERIAL PRIMARY KEY,challenger_id BIGINT NOT NULL REFERENCES gridiron_users(id),opponent_id BIGINT NOT NULL REFERENCES gridiron_users(id),challenger_name TEXT NOT NULL,opponent_name TEXT NOT NULL,challenger_lineup JSONB NOT NULL,opponent_lineup JSONB NOT NULL,result JSONB NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`);
}

// Competitive league: only accepted challenges count towards standings.
let competitionReady=null;
async function competitionDB(){
 if(!competitionReady)competitionReady=pool.query(`CREATE TABLE IF NOT EXISTS gridiron_inbox(
 id BIGSERIAL PRIMARY KEY,
 challenger_id BIGINT NOT NULL REFERENCES gridiron_users(id),
 opponent_id BIGINT NOT NULL REFERENCES gridiron_users(id),
 challenger_name TEXT NOT NULL,
 opponent_name TEXT NOT NULL,
 challenger_lineup JSONB NOT NULL,
 opponent_lineup JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
 match_id BIGINT REFERENCES gridiron_challenges(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 responded_at TIMESTAMPTZ
 )`).catch(e=>{competitionReady=null;throw e});
 await competitionReady;
}
async function leagueRows(){
 const q=await pool.query(`SELECT u.username,t.name AS team_name,
 COUNT(i.id) FILTER (WHERE i.status='accepted')::int AS played,
 COUNT(i.id) FILTER (WHERE i.status='accepted' AND ((i.challenger_id=u.id AND (c.result->>'winner')::int=0) OR (i.opponent_id=u.id AND (c.result->>'winner')::int=1)))::int AS wins,
 COUNT(i.id) FILTER (WHERE i.status='accepted' AND ((i.challenger_id=u.id AND (c.result->>'winner')::int=1) OR (i.opponent_id=u.id AND (c.result->>'winner')::int=0)))::int AS losses
 FROM gridiron_users u JOIN gridiron_teams t ON t.user_id=u.id
 LEFT JOIN gridiron_inbox i ON i.status='accepted' AND (i.challenger_id=u.id OR i.opponent_id=u.id)
 LEFT JOIN gridiron_challenges c ON c.id=i.match_id
 GROUP BY u.id,u.username,t.name
 ORDER BY wins DESC, losses ASC, played DESC, u.username ASC LIMIT 200`);
 return q.rows.map((r,i)=>({...r,rank:i+1,points:r.wins*3}));
}
const validLineup=lineup=>lineup&&typeof lineup==='object'&&POSITIONS.every(p=>Number.isInteger(lineup[p])&&lineup[p]>=1&&lineup[p]<=151)&&new Set(POSITIONS.map(p=>lineup[p])).size===22;
async function loggedIn(req){
 const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(AUTH_COOKIE+'='));
 if(!raw)return null;
 const token=raw.slice(AUTH_COOKIE.length+1);
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const r=await pool.query('SELECT u.id,u.username FROM gridiron_sessions s JOIN gridiron_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()',[hash]);
 return r.rows[0]||null;
}
async function newSession(res,userId){
 const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
 await pool.query("INSERT INTO gridiron_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[hash,userId]);
 res.setHeader('Set-Cookie',authCookie(token,2592000));
}
async function accountAPI(req,res,url,b){
 await accountsDB();
 // Username-only guest identity: intentionally no email or password.
 // Existing password-protected accounts are not claimable through this flow.
 if((url.pathname==='/api/auth/guest'||url.pathname==='/api/auth/register'||url.pathname==='/api/auth/login')&&req.method==='POST'){
  const username=String(b.username||'').trim().toLowerCase();
  if(!/^[a-z0-9_]{3,24}$/.test(username))return json(res,400,{error:'Use 3–24 letters, numbers or underscores.'});
  let r=await pool.query('SELECT id,password_salt FROM gridiron_users WHERE username=$1',[username]);
  let user=r.rows[0];
  if(user&&user.password_salt!=='guest')return json(res,409,{error:'That username belongs to an older protected account. Choose another username.'});
  if(!user){
   try{r=await pool.query("INSERT INTO gridiron_users(username,password_salt,password_hash) VALUES($1,'guest','guest') RETURNING id",[username]);user=r.rows[0]}
   catch(e){if(e.code!=='23505')throw e;r=await pool.query('SELECT id,password_salt FROM gridiron_users WHERE username=$1',[username]);user=r.rows[0];if(user?.password_salt!=='guest')return json(res,409,{error:'That username belongs to an older protected account. Choose another username.'})}
  }
  await newSession(res,user.id);return json(res,200,{user:{username}});
 }
 const user=await loggedIn(req);
 if(url.pathname==='/api/auth/me'&&req.method==='GET')return json(res,200,{user:user?{username:user.username}:null});
 if(url.pathname==='/api/auth/logout'&&req.method==='POST'){
  const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(AUTH_COOKIE+'='));
  if(raw){const hash=crypto.createHash('sha256').update(raw.slice(AUTH_COOKIE.length+1)).digest('hex');await pool.query('DELETE FROM gridiron_sessions WHERE token_hash=$1',[hash])}
  res.setHeader('Set-Cookie',authCookie('',0));return json(res,200,{ok:true});
 }
 if(url.pathname==='/api/league'&&req.method==='GET'){await competitionDB();return json(res,200,{standings:await leagueRows(),rules:'3 points per accepted-match win; accepted matches only'});}
 if(!user)return json(res,401,{error:'Log in to save your team or challenge another player.'});
 if(['/api/league','/api/profile','/api/inbox','/api/challenge/send','/api/challenge/respond'].includes(url.pathname))await competitionDB();
 if(url.pathname==='/api/profile'&&req.method==='GET'){
  const name=String(url.searchParams.get('username')||user.username).trim().toLowerCase();
  const p=await pool.query('SELECT u.id,u.username,t.name AS team_name,t.updated_at FROM gridiron_users u LEFT JOIN gridiron_teams t ON t.user_id=u.id WHERE u.username=$1',[name]);
  if(!p.rows.length)return json(res,404,{error:'Player not found'});
  const player=p.rows[0],standings=await leagueRows(),standing=standings.find(x=>x.username===name)||null;
  const recent=await pool.query(`SELECT i.id,i.status,i.created_at,i.match_id,a.username AS challenger,b.username AS opponent,c.result->'scores' AS scores,c.result->>'winner' AS winner FROM gridiron_inbox i JOIN gridiron_users a ON a.id=i.challenger_id JOIN gridiron_users b ON b.id=i.opponent_id LEFT JOIN gridiron_challenges c ON c.id=i.match_id WHERE (i.challenger_id=$1 OR i.opponent_id=$1) AND i.status='accepted' ORDER BY i.responded_at DESC LIMIT 15`,[player.id]);
  return json(res,200,{player:{username:player.username,teamName:player.team_name,rank:standing?.rank||null,wins:standing?.wins||0,losses:standing?.losses||0,points:standing?.points||0},recent:recent.rows});
 }
 if(url.pathname==='/api/inbox'&&req.method==='GET'){
  const r=await pool.query(`SELECT i.id,i.status,i.created_at,i.responded_at,i.match_id,a.username AS challenger,b.username AS opponent,i.challenger_name,i.opponent_name FROM gridiron_inbox i JOIN gridiron_users a ON a.id=i.challenger_id JOIN gridiron_users b ON b.id=i.opponent_id WHERE i.challenger_id=$1 OR i.opponent_id=$1 ORDER BY i.created_at DESC LIMIT 100`,[user.id]);
  return json(res,200,{username:user.username,challenges:r.rows});
 }
 if(url.pathname==='/api/challenge/send'&&req.method==='POST'){
  const name=String(b.username||'').trim().toLowerCase();
  if(name===user.username)return json(res,400,{error:'Challenge another player, not yourself.'});
  const opp=await pool.query('SELECT u.id,u.username,t.name,t.lineup FROM gridiron_users u JOIN gridiron_teams t ON t.user_id=u.id WHERE u.username=$1',[name]);
  const mine=await pool.query('SELECT name,lineup FROM gridiron_teams WHERE user_id=$1',[user.id]);
  if(!opp.rows.length)return json(res,404,{error:'Opponent has not saved a Dream Team.'});
  if(!mine.rows.length)return json(res,400,{error:'Save your Dream Team first.'});
  if(!validLineup(mine.rows[0].lineup)||!validLineup(opp.rows[0].lineup))return json(res,400,{error:'Invalid team lineup.'});
  const existing=await pool.query("SELECT id FROM gridiron_inbox WHERE challenger_id=$1 AND opponent_id=$2 AND status='pending' LIMIT 1",[user.id,opp.rows[0].id]);
  if(existing.rows.length)return json(res,409,{error:'You already have a pending challenge to this player.'});
  const r=await pool.query('INSERT INTO gridiron_inbox(challenger_id,opponent_id,challenger_name,opponent_name,challenger_lineup,opponent_lineup) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[user.id,opp.rows[0].id,mine.rows[0].name,opp.rows[0].name,JSON.stringify(mine.rows[0].lineup),JSON.stringify(opp.rows[0].lineup)]);
  return json(res,200,{id:r.rows[0].id,status:'pending'});
 }
 if(url.pathname==='/api/challenge/respond'&&req.method==='POST'){
  const id=Number(b.id),action=String(b.action||'');
  if(!Number.isSafeInteger(id)||id<1||!['accept','decline'].includes(action))return json(res,400,{error:'Invalid challenge action.'});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const r=await client.query("SELECT * FROM gridiron_inbox WHERE id=$1 AND opponent_id=$2 AND status='pending' FOR UPDATE",[id,user.id]);
   if(!r.rows.length){await client.query('ROLLBACK');return json(res,409,{error:'Challenge is unavailable or already answered.'})}
   const c=r.rows[0];
   if(action==='decline'){
    await client.query("UPDATE gridiron_inbox SET status='declined',responded_at=NOW() WHERE id=$1",[id]);
    await client.query('COMMIT');return json(res,200,{status:'declined'});
   }
   if(db.length!==151){await client.query('ROLLBACK');return json(res,503,{error:'Pokémon data still loading.'})}
   const result=simulate([{lineup:c.challenger_lineup},{lineup:c.opponent_lineup}]);
   const saved=await client.query('INSERT INTO gridiron_challenges(challenger_id,opponent_id,challenger_name,opponent_name,challenger_lineup,opponent_lineup,result) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[c.challenger_id,c.opponent_id,c.challenger_name,c.opponent_name,JSON.stringify(c.challenger_lineup),JSON.stringify(c.opponent_lineup),JSON.stringify(result)]);
   await client.query("UPDATE gridiron_inbox SET status='accepted',match_id=$2,responded_at=NOW() WHERE id=$1",[id,saved.rows[0].id]);
   await client.query('COMMIT');return json(res,200,{status:'accepted',matchId:saved.rows[0].id});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 if(url.pathname==='/api/my-team'&&req.method==='GET'){
  const r=await pool.query('SELECT name,lineup,updated_at FROM gridiron_teams WHERE user_id=$1',[user.id]);return json(res,200,{team:r.rows[0]||null,user:{username:user.username}});
 }
 if(url.pathname==='/api/my-team'&&req.method==='POST'){
  if(!validLineup(b.lineup))return json(res,400,{error:'Assign 22 unique Pokémon to your lineup.'});
  const name=String(b.name||user.username+"'s Dream Team").trim().slice(0,40);
  await pool.query('INSERT INTO gridiron_teams(user_id,name,lineup) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET name=$2,lineup=$3,updated_at=NOW()',[user.id,name,JSON.stringify(b.lineup)]);
  return json(res,200,{ok:true,name});
 }
 if(url.pathname==='/api/dream-opponents'&&req.method==='GET'){
  const r=await pool.query('SELECT u.username,t.name,t.updated_at FROM gridiron_teams t JOIN gridiron_users u ON u.id=t.user_id WHERE u.id<>$1 ORDER BY t.updated_at DESC LIMIT 100',[user.id]);
  return json(res,200,{opponents:r.rows});
 }
 if(url.pathname==='/api/dream-challenge'&&req.method==='POST'){
  if(db.length!==151)return json(res,503,{error:'Pokémon database still loading.'});
  const name=String(b.username||'').trim().toLowerCase();
  const r=await pool.query('SELECT u.id,u.username,t.name,t.lineup FROM gridiron_teams t JOIN gridiron_users u ON u.id=t.user_id WHERE u.username=$1',[name]);
  const opponent=r.rows[0];if(!opponent||String(opponent.id)===String(user.id))return json(res,404,{error:'Choose another player with a saved Dream Team.'});
  const mine=await pool.query('SELECT name,lineup FROM gridiron_teams WHERE user_id=$1',[user.id]);
  if(!mine.rows.length)return json(res,400,{error:'Save your Dream Team before challenging.'});
  const team=mine.rows[0];if(!validLineup(team.lineup)||!validLineup(opponent.lineup))return json(res,400,{error:'One team has an invalid lineup.'});
  const result=simulate([{lineup:team.lineup},{lineup:opponent.lineup}]);
  const saved=await pool.query('INSERT INTO gridiron_challenges(challenger_id,opponent_id,challenger_name,opponent_name,challenger_lineup,opponent_lineup,result) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[user.id,opponent.id,team.name,opponent.name,JSON.stringify(team.lineup),JSON.stringify(opponent.lineup),JSON.stringify(result)]);
  return json(res,200,{id:saved.rows[0].id});
 }
 if(url.pathname==='/api/dream-match'&&req.method==='GET'){
  const id=Number(url.searchParams.get('id'));if(!Number.isSafeInteger(id)||id<1)return json(res,400,{error:'Invalid match ID'});
  const r=await pool.query('SELECT * FROM gridiron_challenges WHERE id=$1 AND (challenger_id=$2 OR opponent_id=$2)',[id,user.id]);
  if(!r.rows.length)return json(res,404,{error:'Match not found or not accessible.'});
  const m=r.rows[0];return json(res,200,{id:m.id,teamNames:[m.challenger_name,m.opponent_name],lineups:[m.challenger_lineup,m.opponent_lineup],result:m.result});
 }
 return json(res,404,{error:'Unknown account endpoint'});
}
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
function view(r,i){const next=r.picks.length<44?turn(r.picks.length):null;const slot=next===null?null:POSITIONS[r.picks.filter(p=>p.side===next).length];return {code:r.code,side:i,phase:r.phase,picks:r.picks,turn:next,currentPosition:slot,positions:POSITIONS,rosters:[0,1].map(t=>r.picks.filter(x=>x.side===t).map(x=>x.id)),ready:r.players.map(x=>!!x?.ready),connected:r.players.map(x=>!!x),result:r.result}}
function rate(id,pos){const p=db[id-1],s=p.stats,sp=s.speed,atk=s.attack,def=s.defense,hp=s.hp,sa=s['special-attack'],sd=s['special-defense'],weight=p.weight_kg;const power=atk*.65+hp*.15+Math.min(weight,200)*.13;
 if(pos==='QB')return sa*.55+sp*.25+hp*.2;
 if(pos==='RB'||pos.startsWith('WR'))return sp*.65+sa*.2+atk*.15;
 if(pos==='TE')return power*.6+sa*.4;
 if(['LT','LG','C','RG','RT','DT1','DT2'].includes(pos))return power*.65+def*.35;
 if(pos.startsWith('DE'))return power*.5+sp*.25+def*.25;
 if(pos.startsWith('LB'))return def*.5+sp*.3+atk*.2;
 return sp*.55+sd*.25+def*.2
}
function simulate(players){
 const names=['FOREST CITY','VOLT CITY'],scores=[0,0],yards=[0,0],turnovers=[0,0],events=[];
 const rand=()=>crypto.randomInt(1000000)/1000000;
 const pick=a=>a[Math.floor(rand()*a.length)];
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const mon=(t,pos)=>db[players[t].lineup[pos]-1]?.name||'Pokémon';
 const id=(t,pos)=>players[t].lineup[pos];
 const groups={OL:['LT','LG','C','RG','RT'],DL:['DE1','DE2','DT1','DT2'],WR:['WR1','WR2','WR3','TE'],CB:['CB1','CB2','FS','SS'],LB:['LB1','LB2','LB3']};
 const group=(t,arr)=>arr.reduce((sum,pos)=>sum+skill(t,pos),0)/arr.length;
 function skill(t,pos){
  const pokemon=id(t,pos),base=rate(pokemon,pos),sc=scouting(pokemon);
  if(!sc)return base;
  const category=pos==='QB'?'QB':pos==='RB'?'RB':pos.startsWith('WR')?'WR':pos==='TE'?'TE':groups.OL.includes(pos)?'OL':pos.startsWith('DE')?'EDGE':pos.startsWith('DT')?'IDL':pos.startsWith('LB')?'EDGE':pos.startsWith('CB')?'CB':'S';
  const fit=sc.position===category?1:sc.position==='S'&&category==='CB'?.65:sc.position==='CB'&&category==='S'?.65:sc.position==='EDGE'&&pos.startsWith('LB')?.5:0;
  // Scouting informs fit and performance, but never overrides official Pokémon attributes.
  return base+(sc.grade-50)*.23*(fit?fit:-.25);
 }
 // Prefer actual moves from the Pokémon's PokéAPI moveset; never invent a move.
 const moveFor=(pokemon,passing)=>{
  const moves=db[pokemon-1]?.moves||[];
  const pool=moves.map(x=>typeof x==='string'?x:x.name).filter(Boolean);
  const preferred=passing?['thunderbolt','flamethrower','ice-beam','hyper-beam','psychic','shadow-ball','dragon-pulse','water-pulse','air-slash','swift','quick-attack','agility']:['extreme-speed','quick-attack','agility','double-edge','take-down','tackle','body-slam','rollout','headbutt','slam','aqua-jet','flame-charge','thunder-punch','mach-punch'];
  return preferred.find(m=>pool.includes(m))||pick(pool)||null;
 };
 const moveLabel=m=>m?m.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join(' '):'a burst of speed';
 const burst=(passing,duel)=>rand()<clamp((passing?.18:.12)+Math.max(-.06,Math.min(.13,duel*.002)),.08,.35);
 let fieldSpot=25,fieldTeam=0;
 const emit=(quarter,kind,text,team,actors={})=>events.push({quarter,kind,text,team,scores:[...scores],spot:clamp(fieldSpot,0,100),possession:fieldTeam,actors});
 for(let q=1;q<=4;q++){
  emit(q,'quarter','QUARTER '+q+' — Kickoff!',null);
  for(let drive=0;drive<6;drive++){
   const t=(q+drive)%2,opp=1-t;
   let spot=25,down=1,need=10;fieldSpot=spot;fieldTeam=t;
   emit(q,'drive',names[t]+' takes possession at its own 25.',t);
   for(let play=0;play<16;play++){
    const passing=rand()<.60,receiver=pick(groups.WR),blocker=pick(groups.OL);
    const defender=passing?pick(groups.CB):pick([...groups.LB,...groups.DL]);
    const ballPos=passing?receiver:'RB',ballId=id(t,ballPos),defId=id(opp,defender);
    const lineEdge=group(t,groups.OL)-group(opp,groups.DL);
    const duel=passing?(skill(t,'QB')*.37+skill(t,receiver)*.42+lineEdge*.21-skill(opp,defender)*.65-skill(opp,pick(['DE1','DE2']))*.35):(skill(t,'RB')*.58+lineEdge*.42-skill(opp,defender)*.7-group(opp,groups.LB)*.3);
    const move=moveFor(ballId,passing);const actors={offense:id(t,passing?'QB':blocker),carrier:ballId,defense:defId,playType:passing?'pass':'run',gain:0,move:moveLabel(move),matchup:[mon(t,ballPos),mon(opp,defender)]};
    if(passing){
     const pressure=clamp(.1+(skill(opp,pick(groups.DL))-group(t,groups.OL))*.003,.04,.3);
     if(rand()<pressure){const loss=crypto.randomInt(2,10);spot-=loss;fieldSpot=spot;yards[t]-=loss;actors.gain=-loss;down++;need+=loss;emit(q,'sack',mon(opp,defender)+' brings down '+mon(t,'QB')+' for a '+loss+'-yard loss!',opp,actors)}
     else if(rand()>clamp(.76+duel*.004,.44,.92)){
      const intercepted=rand()<clamp(.045-duel*.0005,.015,.12);
      if(intercepted){turnovers[t]++;emit(q,'turnover','INTERCEPTION! '+mon(opp,defender)+' picks off '+mon(t,'QB')+'!',opp,actors);break}
      down++;emit(q,'incomplete',mon(t,'QB')+' targets '+mon(t,receiver)+', but '+mon(opp,defender)+' breaks up the pass!',opp,actors)
     }else{
      const explosive=burst(true,duel);const gain=clamp(Math.round((explosive?30:12)+duel*.2+(rand()-.5)*(explosive?75:30)),0,95);
      spot+=gain;fieldSpot=spot;yards[t]+=gain;actors.gain=gain;
      if(spot>=100){scores[t]+=7;emit(q,'touchdown','TOUCHDOWN! '+mon(t,receiver)+' unleashes '+actors.move+' to finish a '+gain+'-yard strike from '+mon(t,'QB')+'!',t,actors);break}
      const first=gain>=need;if(first){down=1;need=10}else{down++;need=Math.max(1,need-gain)}
      emit(q,gain>=20?'bigplay':'play',gain>=20?'EXPLOSIVE! '+mon(t,receiver)+' uses '+actors.move+' to torch '+mon(opp,defender)+' on a '+gain+'-yard catch!':mon(t,'QB')+' finds '+mon(t,receiver)+' for '+gain+' yards against '+mon(opp,defender)+'.'+(first?' FIRST DOWN!':''),t,actors)
     }
    }else{
     const explosive=burst(false,duel);const gain=clamp(Math.round((explosive?25:6)+duel*.17+(rand()-.5)*(explosive?90:20)),-5,95);
     spot+=gain;fieldSpot=spot;yards[t]+=gain;actors.gain=gain;
     if(rand()<clamp(.012-duel*.0001,.004,.04)){turnovers[t]++;emit(q,'turnover','FUMBLE! '+mon(t,'RB')+' loses the ball after contact from '+mon(opp,defender)+'!',opp,actors);break}
     if(spot>=100){scores[t]+=7;emit(q,'touchdown','TOUCHDOWN! '+mon(t,'RB')+' uses '+actors.move+' to explode past '+mon(opp,defender)+' for a '+gain+'-yard rushing score!',t,actors);break}
     const first=gain>=need;if(first){down=1;need=10}else{down++;need=Math.max(1,need-gain)}
     emit(q,gain>=18?'bigplay':'play',gain>=18?'BREAKAWAY! '+mon(t,'RB')+' fires off '+actors.move+' and blasts past '+mon(opp,defender)+' for '+gain+' yards!':mon(t,'RB')+' runs behind '+mon(t,blocker)+' for '+gain+' yards.'+(first?' FIRST DOWN!':''),t,actors)
    }
    if(spot<=0){scores[opp]+=2;emit(q,'safety','SAFETY! '+names[opp]+' forces the ball into the end zone!',opp,actors);break}
    if(down>4){if(spot>=68&&rand()<.68){scores[t]+=3;emit(q,'fieldgoal','FIELD GOAL! '+names[t]+' adds three points.',t)}else emit(q,'punt',names[t]+' punts on fourth down.',t);break}
   }
  }
  emit(q,'endquarter','END OF QUARTER '+q+' — '+scores[0]+' : '+scores[1],null);
 }
 if(scores[0]===scores[1]){
  emit(5,'quarter','OVERTIME! Next score wins.',null);
  const strength=t=>skill(t,'QB')+skill(t,'RB')+group(t,groups.WR)+group(t,groups.OL)+group(t,groups.DL)+group(t,groups.CB);
  const winner=rand()<clamp(.5+(strength(0)-strength(1))*.002,.25,.75)?0:1;
  scores[winner]+=3;emit(5,'fieldgoal','OVERTIME WINNER! '+names[winner]+' kicks the winning field goal!',winner)
 }
 const winner=scores[0]>scores[1]?0:1;
 emit(5,'final',names[winner]+' WINS! FINAL: '+scores[0]+' – '+scores[1],winner);
 return {scores,yards,turnovers,events,log:events.map(e=>e.text),winner,engineVersion:3}
}
async function api(req,res,url){try{

 const category=pos=>pos==='QB'?'QB':pos==='RB'?'RB':pos.startsWith('WR')?'WR':pos==='TE'?'TE':['LT','LG','C','RG','RT'].includes(pos)?'OL':pos.startsWith('DE')?'EDGE':pos.startsWith('DT')?'IDL':pos.startsWith('LB')?'EDGE':pos.startsWith('CB')?'CB':'S';
 const fitScore=(id,pos)=>{const sc=scouting(id);if(!sc)return 0;const target=category(pos);const fit=sc.position===target?1:((sc.position==='CB'&&target==='S')||(sc.position==='S'&&target==='CB'))?.85:((sc.position==='EDGE'&&pos.startsWith('LB'))?.75:.65);return Math.round(sc.grade*fit)};
 const gradeLineup=lineup=>{if(!lineup||typeof lineup!=='object')throw Error('Lineup required');const ids=POSITIONS.map(p=>Number(lineup[p]));if(ids.some(id=>!Number.isInteger(id)||id<1||id>151)||new Set(ids).size!==22)throw Error('Select 22 different Pokémon');const slots=POSITIONS.map((position,i)=>({position,id:ids[i],score:fitScore(ids[i],position),scouting:scouting(ids[i])}));const total=slots.reduce((n,x)=>n+x.score,0),overall=Math.round(total/22);return {overall,total,offense:Math.round(slots.slice(0,11).reduce((n,x)=>n+x.score,0)/11),defense:Math.round(slots.slice(11).reduce((n,x)=>n+x.score,0)/11),slots,unscouted:slots.filter(x=>!x.scouting).map(x=>x.id),method:'CSV model grade multiplied by position-fit factor; not an actual win probability'}};
 // Maximum-weight assignment: one unique Pokémon per slot, including repeated position categories.
 function bestLineup(){const n=POSITIONS.length,m=150,u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);for(let i=1;i<=n;i++){p[0]=i;let j0=0;const minv=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);do{used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;for(let j=1;j<=m;j++)if(!used[j]){const cur=-fitScore(j,POSITIONS[i0-1])-u[i0]-v[j];if(cur<minv[j]){minv[j]=cur;way[j]=j0}if(minv[j]<delta){delta=minv[j];j1=j}}for(let j=0;j<=m;j++){if(used[j]){u[p[j]]+=delta;v[j]-=delta}else minv[j]-=delta}j0=j1}while(p[j0]!==0);do{const j1=way[j0];p[j0]=p[j1];j0=j1}while(j0!==0)}const result={};for(let j=1;j<=m;j++)if(p[j])result[POSITIONS[p[j]-1]]=j;return result}
 if(url.pathname==='/api/leaderboard'&&req.method==='GET'){
  try{
   await leaderboardDB();
   const rows=await pool.query('SELECT id,name,score,offense,defense,lineup,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM gridiron_leaderboard ORDER BY score DESC,created_at ASC,id ASC LIMIT 50');
   return json(res,200,{entries:rows.rows.map(x=>({...x,created:Number(x.created)})),persistent:true});
  }catch(e){console.error('Leaderboard read failed:',e.message);return json(res,503,{error:dbIssue(e)})}
 }
 if(url.pathname==='/api/leaderboard'&&req.method==='POST'){
  const b=await body(req),name=String(b.name||'').trim().replace(/[<>]/g,'').slice(0,28);
  if(name.length<2)throw Error('Enter a team name (2–28 characters)');
  const result=gradeLineup(b.lineup);
  try{
   await leaderboardDB();
   const inserted=await pool.query('INSERT INTO gridiron_leaderboard(name,score,offense,defense,lineup) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id',[name,result.overall,result.offense,result.defense,JSON.stringify(POSITIONS.map(p=>Number(b.lineup[p])))]);
   const rank=await pool.query('SELECT COUNT(*)::int AS rank FROM gridiron_leaderboard WHERE score > $1 OR (score=$1 AND id <= $2)',[result.overall,inserted.rows[0].id]);
   return json(res,200,{rank:rank.rows[0].rank,score:result.overall});
  }catch(e){console.error('Leaderboard save failed:',e.message);return json(res,503,{error:dbIssue(e)})}
 }
 if(url.pathname==='/api/scouting'&&req.method==='GET')return json(res,200,{positions:POSITIONS,records:Array.from({length:151},(_,i)=>({id:i+1,...(scouting(i+1)||{grade:null,position:null})})),note:'150 graded Pokémon in uploaded CSV; Mew (#151) was not included.'});
 if(url.pathname==='/api/best-lineup'&&req.method==='GET'){const lineup=bestLineup();return json(res,200,{lineup,...gradeLineup(lineup)})}
 if(url.pathname==='/api/lineup-score'&&req.method==='POST'){const request=await body(req);return json(res,200,gradeLineup(request.lineup))}
 if(url.pathname==='/api/health')return json(res,200,{ok:true,databaseReady:db.length===151,count:db.length,error});
 if(url.pathname==='/api/catalog')return json(res,200,{ready:db.length===151,error,pokemon:db.map(p=>({id:p.id,name:p.name,types:p.types,height_m:p.height_m,weight_kg:p.weight_kg}))});
 const b=req.method==='POST'?await body(req):{};
 if(url.pathname.startsWith('/api/auth/')||['/api/my-team','/api/dream-opponents','/api/dream-challenge','/api/dream-match','/api/league','/api/profile','/api/inbox','/api/challenge/send','/api/challenge/respond'].includes(url.pathname))return accountAPI(req,res,url,b);
 if(url.pathname==='/api/create'&&req.method==='POST'){const code=crypto.randomBytes(3).toString('hex').toUpperCase(),token=crypto.randomBytes(24).toString('hex');const r={code,players:[{token,ready:false},null],phase:'waiting',picks:[],result:null,created:Date.now()};rooms.set(code,r);return json(res,200,{...view(r,0),token})}
 const r=room(b.code||url.searchParams.get('code'));
 if(url.pathname==='/api/join'&&req.method==='POST'){if(r.players[1]||r.phase!=='waiting')return json(res,409,{error:'Room full or already started'});const token=crypto.randomBytes(24).toString('hex');r.players[1]={token,ready:false};r.phase='draft';return json(res,200,{...view(r,1),token})}
 const i=side(r,b.token||url.searchParams.get('token'));
 if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,view(r,i));
 if(url.pathname==='/api/pick'&&req.method==='POST'){
  if(db.length!==151)return json(res,503,{error:'Pokémon database still loading'});
  if(r.phase!=='draft'||turn(r.picks.length)!==i)return json(res,409,{error:'Not your turn'});
  if(!Number.isInteger(b.id)||b.id<1||b.id>151||r.picks.some(p=>p.id===b.id))return json(res,409,{error:'Pokémon unavailable'});
  const position=POSITIONS[r.picks.filter(p=>p.side===i).length];r.picks.push({side:i,id:b.id,position});if(r.picks.length===44)r.phase='lineups';return json(res,200,view(r,i))
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
