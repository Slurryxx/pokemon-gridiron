'use strict';
const crypto=require('node:crypto');
async function ensure(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS gridiron_season_lobbies (
  code VARCHAR(16) PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES gridiron_users(id) ON DELETE CASCADE,
  name VARCHAR(48) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS gridiron_season_members (
  code VARCHAR(16) NOT NULL REFERENCES gridiron_season_lobbies(code) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES gridiron_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(code,user_id)
 )`);
}
const cleanCode=v=>String(v||'').trim().toUpperCase();
async function details(pool,code,userId,validLineup){
 const r=await pool.query(`SELECT l.code,l.name,l.status,l.owner_id,l.created_at,u.username AS host,
 (SELECT COUNT(*)::int FROM gridiron_season_members m WHERE m.code=l.code) AS member_count
 FROM gridiron_season_lobbies l JOIN gridiron_users u ON u.id=l.owner_id WHERE l.code=$1`,[code]);
 if(!r.rows.length)throw Error('Season invite not found. Check your link.');
 const lobby=r.rows[0];
 const members=await pool.query(`SELECT u.username,t.name AS team_name,t.lineup,m.user_id FROM gridiron_season_members m
 JOIN gridiron_users u ON u.id=m.user_id LEFT JOIN gridiron_teams t ON t.user_id=m.user_id
 WHERE m.code=$1 ORDER BY CASE WHEN m.user_id=$2 THEN 0 ELSE 1 END,m.joined_at`,[code,lobby.owner_id]);
 const memberRows=members.rows.map(m=>({username:m.username,teamName:m.team_name,ready:!!m.lineup&&validLineup(m.lineup)}));
 return {lobby:{code:lobby.code,name:lobby.name,status:lobby.status,host:lobby.host,memberCount:lobby.member_count,owner:userId!=null&&String(userId)===String(lobby.owner_id),joined:userId!=null&&members.rows.some(m=>String(m.user_id)===String(userId)),members:memberRows,canStart:lobby.status==='open'&&memberRows.length>=2&&memberRows.every(m=>m.ready)}};
}
async function lobbyAPI({pool,user,method,body,validLineup,seasonAPI,simulate,ready}){
 await ensure(pool);
 if(method==='GET'){
  if(body.code)return details(pool,cleanCode(body.code),user?.id,validLineup);
  if(!user)throw Error('Log in to manage your seasons.');
  const r=await pool.query(`SELECT l.code,l.name,l.status,l.owner_id FROM gridiron_season_lobbies l
 JOIN gridiron_season_members m ON m.code=l.code WHERE m.user_id=$1 ORDER BY l.created_at DESC LIMIT 30`,[user.id]);
  return {lobbies:r.rows.map(l=>({code:l.code,name:l.name,status:l.status,owner:String(l.owner_id)===String(user.id)}))};
 }
 if(!user)throw Error('Log in or create a profile before joining a season.');
 if(method!=='POST')throw Error('Method not allowed.');
 if(body.action==='create'){
  const name=String(body.name||'Friends League').trim().slice(0,48);
  if(name.length<3)throw Error('League name must be at least 3 characters.');
  let code;for(let i=0;i<5;i++){code=crypto.randomBytes(5).toString('hex').toUpperCase();const exists=await pool.query('SELECT 1 FROM gridiron_season_lobbies WHERE code=$1',[code]);if(!exists.rows.length)break}
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('INSERT INTO gridiron_season_lobbies(code,owner_id,name) VALUES($1,$2,$3)',[code,user.id,name]);await client.query('INSERT INTO gridiron_season_members(code,user_id) VALUES($1,$2)',[code,user.id]);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  return details(pool,code,user.id,validLineup);
 }
 const code=cleanCode(body.code);
 if(!/^[A-F0-9]{10}$/.test(code))throw Error('Invalid season invite code.');
 if(body.action==='join'){
  const r=await pool.query('SELECT status FROM gridiron_season_lobbies WHERE code=$1',[code]);
  if(!r.rows.length)throw Error('Season invite not found.');
  if(r.rows[0].status!=='open')throw Error('This season has already started. Ask the host for a new invite.');
  const members=await pool.query('SELECT COUNT(*)::int AS count FROM gridiron_season_members WHERE code=$1',[code]);
  if(members.rows[0].count>=12)throw Error('This league is full (12 teams).');
  await pool.query('INSERT INTO gridiron_season_members(code,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[code,user.id]);
  return details(pool,code,user.id,validLineup);
 }
 if(body.action==='start'){
  if(!ready)throw Error('Pokémon catalog is loading.');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const r=await client.query('SELECT owner_id,status FROM gridiron_season_lobbies WHERE code=$1 FOR UPDATE',[code]);
   if(!r.rows.length)throw Error('Season not found.');
   if(String(r.rows[0].owner_id)!==String(user.id))throw Error('Only the host can start this season.');
   if(r.rows[0].status!=='open')throw Error('Season already started.');
   const d=await details(client,code,user.id,validLineup);
   if(!d.lobby.canStart)throw Error('At least two players must join and save valid Dream Teams before kickoff.');
   const players=d.lobby.members.map(m=>m.username);
   const season=await seasonAPI({pool:client,user,method:'POST',body:{action:'create',players},simulate,validLineup,ready});
   await client.query('UPDATE gridiron_season_lobbies SET status=$2 WHERE code=$1',[code,'active']);
   await client.query('COMMIT');
   return {...await details(pool,code,user.id,validLineup),season:season.season,standings:season.standings};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 throw Error('Invalid season lobby action.');
}
async function access(pool,code,user){
 await ensure(pool);
 const r=await pool.query(`SELECT l.owner_id,l.status FROM gridiron_season_lobbies l
 JOIN gridiron_season_members m ON m.code=l.code WHERE l.code=$1 AND m.user_id=$2`,[cleanCode(code),user.id]);
 if(!r.rows.length)throw Error('Join this season to see its games.');
 return {ownerId:r.rows[0].owner_id,host:String(r.rows[0].owner_id)===String(user.id),status:r.rows[0].status};
}
module.exports={lobbyAPI,access};
