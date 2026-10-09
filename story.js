'use strict';
const POS=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT','DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
const RIVALS=['Pallet Pioneers','Cerulean Cyclones','Vermilion Volts','Celadon Guardians','Fuchsia Phantoms','Saffron Stars','Cinnabar Inferno','Viridian Titans','Indigo Legends'];
const CHAPTERS=['Rookie General Manager','Building the Foundation','Rivalry Season','The Draft Room','Midnight Trade Talks','The Playoff Chase','Front Office Pressure','The Contender','Road to Indigo','Dynasty Dreams','Legacy Season','Hall of Champions'];
function seeded(seed){let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296}}
function roster(catalog,cap,seed){
 const rand=seeded(seed),pool=catalog.map(p=>({id:p.id,cost:p.salary})).filter(p=>Number.isInteger(p.id)&&p.cost>=0).sort((a,b)=>a.cost-b.cost||a.id-b.id);
 const picked={},used=new Set();let remaining=cap;
 for(let i=0;i<POS.length;i++){
  const rest=POS.length-i-1,choices=pool.filter(p=>!used.has(p.id)&&p.cost<=remaining-rest*3);
  if(!choices.length)throw Error('Could not assemble a valid rival roster.');
  const fair=choices.filter(p=>p.cost<=Math.ceil(remaining/(rest+1)*1.3));
  const candidates=fair.length?fair:choices;
  const lower=Math.floor(candidates.length*.55);
  const p=candidates[lower+Math.floor(rand()*(candidates.length-lower))];picked[POS[i]]=p.id;used.add(p.id);remaining-=p.cost;
 }
 return picked;
}
function newCareer(username,catalog,cap){
 const teams=[{username,name:'Your Franchise',lineup:roster(catalog,cap,801)}];
 RIVALS.forEach((name,i)=>teams.push({username:'cpu_'+i,name,lineup:roster(catalog,cap,4200+i*117)}));
 return {version:1,username,createdAt:new Date().toISOString(),chapter:0,week:0,careerWins:0,careerLosses:0,championships:0,credits:100,reputation:10,morale:60,training:0,scouting:0,facilities:0,choice:null,teams,history:[],lastGame:null,completed:false};
}
function stage(c){return CHAPTERS[c.chapter]||'Hall of Champions'}
function choices(c){
 const week=c.week+1;
 return [
  {id:'training',title:'Run intense training',detail:'Spend 15 credits. Improve preparation and team morale.',cost:15},
  {id:'scout',title:'Scout the opposition',detail:'Spend 10 credits. Build scouting knowledge and reputation.',cost:10},
  {id:'community',title:'Host a fan event',detail:'Earn 20 credits and grow your reputation.',cost:0},
  {id:'rest',title:'Protect your starters',detail:'Recover morale before kickoff.',cost:0}
 ];
}
function opponentIndex(c){return 1+((c.week+c.chapter*3)%9)}
function publicState(c){return {...c,choices:choices(c),chapterTitle:stage(c),totalChapters:CHAPTERS.length,totalGames:CHAPTERS.length*18,playedGames:c.history.length,nextOpponent:c.completed?null:c.teams[opponentIndex(c)].name};}
function applyChoice(c,action){
 const option=choices(c).find(x=>x.id===action);if(!option)throw Error('Choose a front-office decision.');
 if(c.credits<option.cost)throw Error('Not enough franchise credits.');
 c.credits-=option.cost;
 if(action==='training'){c.training++;c.morale=Math.min(100,c.morale+7)}
 if(action==='scout'){c.scouting++;c.reputation+=2}
 if(action==='community'){c.credits+=20;c.reputation+=3;c.morale=Math.min(100,c.morale+2)}
 if(action==='rest')c.morale=Math.min(100,c.morale+12);
 c.choice=action;
}
async function storyAPI({pool,user,method,body,simulate,catalog,cap,validLineup}){
 await pool.query('CREATE TABLE IF NOT EXISTS gridiron_careers (owner_id BIGINT PRIMARY KEY REFERENCES gridiron_users(id) ON DELETE CASCADE,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 if(method==='GET'){
  const r=await pool.query('SELECT data FROM gridiron_careers WHERE owner_id=$1',[user.id]);
  if(body.game!==undefined&&body.game!==null){
   const c=r.rows[0]?.data;if(!c)throw Error('Start your GM career first.');
   const i=Number(body.game);if(!Number.isSafeInteger(i)||i<0||i>=c.history.length)throw Error('Game not found.');
   const g=c.history[i];if(!g.result?.events?.length)throw Error('This game has no replay.');
   return {match:{teamNames:[c.teams[0].name,c.teams[g.opponent].name],lineups:[g.lineup,c.teams[g.opponent].lineup],result:g.result}};
  }
  return {career:r.rows[0]?publicState(r.rows[0].data):null};
 }
 if(method!=='POST')throw Error('Method not allowed.');
 if(body.action==='start'){
  if(catalog.length<151)throw Error('Pokémon are still loading.');
  const existing=await pool.query('SELECT 1 FROM gridiron_careers WHERE owner_id=$1',[user.id]);
  if(existing.rows.length)throw Error('Career already exists. Continue your saved career.');
  const c=newCareer(user.username,catalog,cap);
  await pool.query('INSERT INTO gridiron_careers(owner_id,data) VALUES($1,$2)',[user.id,JSON.stringify(c)]);
  return {career:publicState(c)};
 }
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const r=await client.query('SELECT data FROM gridiron_careers WHERE owner_id=$1 FOR UPDATE',[user.id]);
  if(!r.rows.length)throw Error('Start your GM career first.');
  const c=r.rows[0].data;
  if(c.completed)throw Error('Career completed. Your Hall of Fame legacy is saved.');
  if(body.action==='name'){
   const name=String(body.name||'').trim();if(name.length<3||name.length>36)throw Error('Team name must be 3–36 characters.');
   c.teams[0].name=name;
  }else if(body.action==='roster'){
   if(!validLineup(body.lineup))throw Error('Roster must have 22 unique, affordable Pokémon.');
   c.teams[0].lineup=body.lineup;
  }else if(body.action==='decision'){
   if(c.choice)throw Error('You already made a decision for this game.');
   applyChoice(c,String(body.decision||''));
  }else if(body.action==='play'){
   if(!c.choice)throw Error('Choose a front-office strategy before kickoff.');
   const opponent=opponentIndex(c),result=simulate([{lineup:c.teams[0].lineup},{lineup:c.teams[opponent].lineup}]);
   const win=result.scores[0]>result.scores[1],tie=result.scores[0]===result.scores[1];
   if(win)c.careerWins++;else if(!tie)c.careerLosses++;
   c.credits+=win?28:14;c.reputation+=win?3:1;c.morale=Math.max(10,Math.min(100,c.morale+(win?4:-5)));
   c.history.push({chapter:c.chapter,week:c.week+1,opponent,scores:result.scores,result,lineup:c.teams[0].lineup,decision:c.choice,won:win});
   c.lastGame=c.history.length-1;c.choice=null;c.week++;
   if(c.week===18){const wins=c.history.slice(-18).filter(g=>g.won).length;if(wins>=11){c.championships++;c.credits+=75;c.reputation+=15}c.chapter++;c.week=0;if(c.chapter>=CHAPTERS.length)c.completed=true}
  }else throw Error('Invalid career action.');
  await client.query('UPDATE gridiron_careers SET data=$2,updated_at=NOW() WHERE owner_id=$1',[user.id,JSON.stringify(c)]);
  await client.query('COMMIT');return {career:publicState(c)};
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
module.exports={storyAPI,newCareer,roster,CHAPTERS};
