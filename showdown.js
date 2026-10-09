'use strict';
const crypto=require('node:crypto');
const PLAYS={run:{name:'Power Run',beats:'blitz',base:5},pass:{name:'Deep Pass',beats:'stack',base:9},screen:{name:'Screen Pass',beats:'blitz',base:6},trick:{name:'Trick Play',beats:'zone',base:11}};
const DEFENSE={blitz:{name:'Thunder Blitz',beats:'pass'},zone:{name:'Zone Coverage',beats:'screen'},stack:{name:'Stack the Box',beats:'run'}};
const MOVES=[
 {name:'Quick Attack',type:'normal',description:'Explosive burst: +4 yards',bonus:4},
 {name:'Flamethrower',type:'fire',description:'Burn through coverage: +6 passing yards',bonus:6},
 {name:'Thunderbolt',type:'electric',description:'Stun defenders: +5 yards',bonus:5},
 {name:'Hydro Pump',type:'water',description:'Power through contact: +5 yards',bonus:5},
 {name:'Body Slam',type:'normal',description:'Physical mismatch: +4 yards',bonus:4},
 {name:'Agility',type:'psychic',description:'Outmaneuver the defense: +5 yards',bonus:5},
 {name:'Protect',type:'normal',description:'Secure the ball: prevent turnovers',bonus:2},
 {name:'Fly',type:'flying',description:'Win an aerial matchup: +6 passing yards',bonus:6}
];
const AI_TEAMS=[
 {name:'Pewter Rockbreakers',style:'stack',ids:[95,74,75,76,111,112,143,68,67,66,106,107,28,27,34,31,53,52,18,22,99,98]},
 {name:'Cerulean Tidal Wave',style:'zone',ids:[9,7,8,130,131,54,55,60,61,62,72,73,118,119,120,121,86,87,90,91,98,99]},
 {name:'Vermilion Thunder',style:'blitz',ids:[26,25,135,101,100,81,82,125,145,21,22,84,85,19,20,56,57,106,107,15,12,123]},
 {name:'Indigo All-Stars',style:'zone',ids:[149,6,150,143,59,65,94,130,9,3,68,76,112,131,144,145,146,151,141,142,127,128]}
];
function moveFor(p){const t=p?.types||[];if(t.includes('fire'))return MOVES[1];if(t.includes('electric'))return MOVES[2];if(t.includes('water'))return MOVES[3];if(t.includes('flying'))return MOVES[7];if(t.includes('psychic'))return MOVES[5];if(t.includes('rock')||t.includes('fighting')||t.includes('ground'))return MOVES[4];return MOVES[0]}
function setup(lineup,db,stage){const team=AI_TEAMS[Math.min(stage,AI_TEAMS.length-1)];return {version:1,id:crypto.randomUUID(),stage,team:team.name,aiStyle:team.style,playerLineup:lineup,aiLineup:team.ids,score:[0,0],quarter:1,snap:0,drive:0,ball:25,down:1,toGo:10,turn:'offense',cooldowns:{},log:[],finished:false,winner:null,updatedAt:Date.now()}}
function options(game,db){const offense=game.turn==='offense';const positions=offense?['QB','RB','WR1','WR2','WR3','TE']:['DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];return positions.map(pos=>{const id=game.playerLineup[pos],p=db[id-1],m=moveFor(p);return {position:pos,id,name:p?.name||'Pokémon',move:m.name,type:m.type,description:m.description,cooldown:game.cooldowns[pos]||0}})}
function rng(game,salt){const h=crypto.createHash('sha256').update(game.id+':'+game.snap+':'+salt).digest();return h.readUInt32BE(0)/4294967296}
function next(game){game.snap++;game.quarter=Math.min(4,Math.floor(game.snap/6)+1);if(game.snap>=24){game.finished=true;game.winner=game.score[0]===game.score[1]?'tie':game.score[0]>game.score[1]?'player':'ai'}game.updatedAt=Date.now()}
function turn(game,body,db){
 if(game.finished)throw Error('Match finished. Start another challenge.');
 const play=String(body.play||''),position=String(body.position||'');if(!PLAYS[play])throw Error('Choose a valid football play.');
 const available=options(game,db),selected=available.find(p=>p.position===position);
 if(!selected)throw Error('Choose a Pokémon on the field to use its ability.');
 if(selected.cooldown>0)throw Error(selected.name+' needs '+selected.cooldown+' more snap(s) before using '+selected.move+'.');
 const move=moveFor(db[selected.id-1]);const offense=game.turn==='offense';
 const aiCall=offense?(rng(game,'counter')<.45?AI_TEAMS[game.stage].style:['blitz','zone','stack'][Math.floor(rng(game,'defense')*3)]):['run','pass','screen','trick'][Math.floor(rng(game,'offense')*4)];
 const matchup=offense?(PLAYS[play].beats===aiCall?4:DEFENSE[aiCall].beats===play?-5:0):(DEFENSE[play].beats===aiCall?-5:PLAYS[aiCall].beats===play?4:0);
 const call=offense?play:aiCall;const base=PLAYS[call].base;
 const moveBonus=move.name==='Fly'&&call!=='pass'?1:move.name==='Flamethrower'&&call!=='pass'?2:move.bonus;
 const yards=Math.max(-7,Math.min(42,Math.round(base+(rng(game,'yards')-.5)*12+matchup+(offense?moveBonus:-moveBonus)+(game.stage*1.5)*(offense?-1:1))));
 const turnover=rng(game,'turnover')<(move.name==='Protect'?.005:.035);
 const before={ball:game.ball,down:game.down,toGo:game.toGo,quarter:game.quarter,score:[...game.score]};
 let event='';if(turnover){game.turn=offense?'defense':'offense';game.ball=100-game.ball;game.down=1;game.toGo=10;event='TURNOVER! The defense takes possession.'}
 else {game.ball=Math.max(1,Math.min(100,game.ball+yards));if(game.ball>=100){game.score[offense?0:1]+=7;game.turn=offense?'defense':'offense';game.ball=25;game.down=1;game.toGo=10;event='TOUCHDOWN! Seven points on the board.'}
 else if(yards>=game.toGo){game.down=1;game.toGo=10;event='FIRST DOWN! Move the chains.'}
 else{game.down++;game.toGo=Math.max(1,game.toGo-yards);if(game.down>4){game.turn=offense?'defense':'offense';game.ball=100-game.ball;game.down=1;game.toGo=10;event='TURNOVER ON DOWNS!'}}}
 for(const k of Object.keys(game.cooldowns))game.cooldowns[k]=Math.max(0,game.cooldowns[k]-1);game.cooldowns[position]=3;
 const entry={snap:game.snap+1,offense,play:PLAYS[call].name,aiCall:offense?DEFENSE[aiCall].name:PLAYS[aiCall].name,pokemon:selected.name,move:move.name,yards,event,before,after:{ball:game.ball,down:game.down,toGo:game.toGo,score:[...game.score]}};game.log.unshift(entry);game.log=game.log.slice(0,40);next(game);if(game.finished&&game.score[0]===game.score[1]){game.score[0]+=3;game.winner='player';entry.event+=' Overtime field goal!'}return entry
}
async function showdownAPI({pool,user,method,body,db,validLineup}){
 await pool.query(`CREATE TABLE IF NOT EXISTS gridiron_showdown (user_id BIGINT PRIMARY KEY REFERENCES gridiron_users(id) ON DELETE CASCADE, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 const get=async()=>{const r=await pool.query('SELECT data FROM gridiron_showdown WHERE user_id=$1',[user.id]);return r.rows[0]?.data||null};
 if(method==='GET'){const game=await get();return {game,options:game&&!game.finished?options(game,db):[],plays:PLAYS,defenses:DEFENSE}}
 if(method!=='POST')throw Error('Method not allowed');
 if(body.action==='start'){const t=await pool.query('SELECT lineup FROM gridiron_teams WHERE user_id=$1',[user.id]);if(!t.rows[0]||!validLineup(t.rows[0].lineup))throw Error('Build and save a valid 22-Pokémon Dream Team before playing.');const stage=Math.max(0,Math.min(3,Number(body.stage)||0));const game=setup(t.rows[0].lineup,db,stage);await pool.query('INSERT INTO gridiron_showdown(user_id,data) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET data=$2,updated_at=NOW()',[user.id,JSON.stringify(game)]);return {game,options:options(game,db),plays:PLAYS,defenses:DEFENSE}}
 if(body.action==='snap'){const client=await pool.connect();try{await client.query('BEGIN');const r=await client.query('SELECT data FROM gridiron_showdown WHERE user_id=$1 FOR UPDATE',[user.id]);if(!r.rows[0])throw Error('Start a match first.');const game=r.rows[0].data;const entry=turn(game,body,db);await client.query('UPDATE gridiron_showdown SET data=$2,updated_at=NOW() WHERE user_id=$1',[user.id,JSON.stringify(game)]);await client.query('COMMIT');return {game,entry,options:game.finished?[]:options(game,db),plays:PLAYS,defenses:DEFENSE}}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 throw Error('Invalid action.');
}
module.exports={showdownAPI,PLAYS,DEFENSE,setup,turn,options};
