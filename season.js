'use strict';
// A private, persistent double round-robin season for the creator and up to 11 other saved teams.
function fixtures(teams){
 const ids=teams.map((_,i)=>i);if(ids.length%2)ids.push(null);
 const rounds=[],n=ids.length;
 for(let week=0;week<n-1;week++){
  const games=[];
  for(let i=0;i<n/2;i++){const a=ids[i],b=ids[n-1-i];if(a!==null&&b!==null)games.push({home:week%2?b:a,away:week%2?a:b})}
  rounds.push(games);
  ids.splice(1,0,ids.pop());
 }
 return [...rounds,...rounds.map(games=>games.map(g=>({home:g.away,away:g.home})))].map((games,i)=>({week:i+1,games:games.map(g=>({...g,result:null}))}));
}
function standings(season){
 const rows=season.teams.map((team,i)=>({index:i,username:team.username,name:team.name,played:0,wins:0,losses:0,draws:0,for:0,against:0,points:0}));
 for(const round of season.rounds)for(const g of round.games)if(g.result){
  const h=rows[g.home],a=rows[g.away],hs=g.result.scores[0],as=g.result.scores[1];
  h.played++;a.played++;h.for+=hs;h.against+=as;a.for+=as;a.against+=hs;
  if(hs>as){h.wins++;h.points+=3;a.losses++}else if(as>hs){a.wins++;a.points+=3;h.losses++}else{h.draws++;a.draws++;h.points++;a.points++}
 }
 return rows.sort((a,b)=>b.points-a.points||(b.for-b.against)-(a.for-a.against)||b.for-a.for||a.username.localeCompare(b.username)).map((row,i)=>({...row,rank:i+1,diff:row.for-row.against}));
}
async function seasonAPI({pool,user,method,body,simulate,validLineup,ready}){
 await pool.query('CREATE TABLE IF NOT EXISTS gridiron_seasons (owner_id BIGINT PRIMARY KEY REFERENCES gridiron_users(id) ON DELETE CASCADE, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())');
 if(method==='GET'){
  const r=await pool.query('SELECT data FROM gridiron_seasons WHERE owner_id=$1',[user.id]);
  const season=r.rows[0]?.data||null;return {season,standings:season?standings(season):[]};
 }
 if(method==='POST'&&body.action==='create'){
  if(!ready)throw Error('Pokémon database is still loading.');
  const r=await pool.query('SELECT u.id,u.username,t.name,t.lineup FROM gridiron_teams t JOIN gridiron_users u ON u.id=t.user_id ORDER BY CASE WHEN u.id=$1 THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 12',[user.id]);
  if(!r.rows.some(x=>String(x.id)===String(user.id)))throw Error('Save your Dream Team before creating a season.');
  const teams=r.rows.filter(x=>validLineup(x.lineup)).map(x=>({username:x.username,name:x.name,lineup:x.lineup}));
  if(teams.length<2)throw Error('At least two valid saved Dream Teams are needed to start a season.');
  const season={version:1,createdAt:new Date().toISOString(),teams,rounds:fixtures(teams),currentWeek:0,finished:false};
  await pool.query('INSERT INTO gridiron_seasons(owner_id,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(owner_id) DO UPDATE SET data=$2,updated_at=NOW()',[user.id,JSON.stringify(season)]);
  return {season,standings:standings(season)};
 }
 if(method==='POST'&&body.action==='advance'){
  if(!ready)throw Error('Pokémon database is still loading.');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const r=await client.query('SELECT data FROM gridiron_seasons WHERE owner_id=$1 FOR UPDATE',[user.id]);
   if(!r.rows.length)throw Error('Create a season first.');
   const season=r.rows[0].data;
   if(season.finished)throw Error('Season already complete. Start a new season to play again.');
   const round=season.rounds[season.currentWeek];if(!round)throw Error('No more games remain.');
   for(const game of round.games){
    const home=season.teams[game.home],away=season.teams[game.away];
    const result=simulate([{lineup:home.lineup},{lineup:away.lineup}]);
    game.result={scores:result.scores,winner:result.winner,yards:result.yards,turnovers:result.turnovers};
   }
   season.currentWeek++;season.finished=season.currentWeek===season.rounds.length;
   await client.query('UPDATE gridiron_seasons SET data=$2,updated_at=NOW() WHERE owner_id=$1',[user.id,JSON.stringify(season)]);
   await client.query('COMMIT');return {season,standings:standings(season)};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 throw Error('Invalid season action.');
}
module.exports={fixtures,standings,seasonAPI};
