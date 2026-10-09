(()=>{'use strict';
const $=id=>document.getElementById(id);
const offense=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT'],defense=['DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
const lanes={QB:50,RB:65,WR1:12,WR2:88,WR3:25,TE:76,LT:31,LG:41,C:50,RG:59,RT:69,DE1:25,DE2:75,DT1:42,DT2:58,LB1:34,LB2:50,LB3:66,CB1:12,CB2:88,FS:40,SS:60};
let match=null,index=0,timer=null,steps=[],sprites=new Map();
const status=s=>$('status').textContent=s,clamp=x=>Math.max(2,Math.min(98,x));
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j}
function clearSteps(){steps.forEach(clearTimeout);steps=[];if(timer)clearTimeout(timer);timer=null}
function after(fn,ms){steps.push(setTimeout(fn,ms))}
function sprite(team,pos){return sprites.get(team+'-'+pos)}
function move(team,pos,x,y,ms){const e=sprite(team,pos);if(!e)return;e.style.transitionDuration=Math.max(0,ms)+'ms';e.style.left=clamp(x)+'%';e.style.top=Math.max(8,Math.min(92,y))+'%'}
function formation(e){
 const t=e.possession===1?1:0,opp=1-t,d=t===0?1:-1,spot=Math.max(0,Math.min(100,Number(e.spot)||25));
 const scored=e.kind==='touchdown',end=scored?(t===0?96:4):clamp(8+(t===0?spot:100-spot)*.84);
 const gain=Number(e.actors?.gain)||0,base=clamp(end-d*Math.max(0,gain)*.84),playing=!!e.actors?.carrier&&['play','bigplay','touchdown','incomplete','sack','turnover'].includes(e.kind);
 const x=playing?base:end,front=x-d*5,back=x-d*12,defFront=x+d*6,defBack=x+d*16;
 for(const pos of offense){const px=pos==='QB'?back:pos==='RB'?back-d*4:pos.startsWith('WR')||pos==='TE'?front-d*3:front;move(t,pos,px,lanes[pos],0)}
 for(const pos of defense){const px=pos.startsWith('CB')||pos==='FS'||pos==='SS'?defBack:pos.startsWith('LB')?defFront+d*5:defFront;move(opp,pos,px,lanes[pos],0)}
 const ball=$('battleBall');ball.style.transition='none';ball.style.left=clamp(back)+'%';ball.style.top='50%';
 $('battleFlash').textContent=({touchdown:'🏆 TOUCHDOWN!',bigplay:'⚡ BIG PLAY!',turnover:'💥 TURNOVER!',fieldgoal:'FIELD GOAL!'})[e.kind]||'';
 if(!playing)return;
 const duration=Number($('speed').value)*.8,actors=e.actors,pass=actors.playType==='pass';
 const carrier=actors.carrierPosition||offense.find(p=>match.lineups[t][p]===actors.carrier)||(pass?'WR1':'RB');
 const defender=defense.find(p=>match.lineups[opp][p]===actors.defense)||'LB2';
 after(()=>{
  for(const pos of offense)move(t,pos,pos.startsWith('WR')||pos==='TE'?front+d*12:pos==='QB'?back:front+d*4,lanes[pos],duration*.4);
  for(const pos of defense)move(opp,pos,pos.startsWith('CB')?defBack-d*4:defFront-d*3,lanes[pos],duration*.4);
 },40);
 after(()=>{
  move(t,carrier,end,lanes[carrier],duration*.65);
  move(opp,defender,clamp(end-d*(scored?9:2)),lanes[carrier]+5,duration*.7);
  for(const pos of offense.filter(p=>p!==carrier&&p!=='QB'))move(t,pos,clamp(x+d*12),lanes[pos],duration*.7);
  for(const pos of defense.filter(p=>p!==defender))move(opp,pos,clamp(x+d*13),lanes[pos],duration*.7);
  ball.style.transition='left '+Math.round(duration*.5)+'ms ease,top '+Math.round(duration*.5)+'ms ease';
  ball.style.left=clamp(pass?x+d*13:back+d*2)+'%';ball.style.top=(pass?lanes[carrier]:lanes.RB)+'%';
  after(()=>{ball.style.left=(e.kind==='incomplete'?clamp(x+d*13):end)+'%';ball.style.top=lanes[carrier]+'%'},duration*.3);
 },duration*.32)
}
function build(){sprites.clear();$('battlePlayers').replaceChildren();for(let t=0;t<2;t++)for(const pos of [...offense,...defense]){const id=match.lineups[t][pos];if(!id)continue;const el=document.createElement('div');el.className='battle-mon '+(t?'away':'home');const img=document.createElement('img');img.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+id+'.png';img.alt='Pokémon '+id;const tag=document.createElement('span');tag.textContent=pos;el.append(img,tag);$('battlePlayers').append(el);sprites.set(t+'-'+pos,el)}}
function show(e){clearSteps();$('homeScore').textContent=e.scores?.[0]??0;$('awayScore').textContent=e.scores?.[1]??0;$('quarter').textContent=e.quarter===5?'OT / FINAL':'Q'+e.quarter;$('playCall').textContent=e.text;const p=document.createElement('p');p.textContent=e.text;p.className='event-'+e.kind;$('playLog').prepend(p);formation(e)}
function next(){if(!match)return;if(index>=match.result.events.length){$('finalPanel').hidden=false;$('final').textContent=match.teamNames[match.result.winner]+' WINS! '+match.result.scores.join(' – ');return}const e=match.result.events[index++];show(e);timer=setTimeout(next,Number($('speed').value)*(['touchdown','bigplay','turnover'].includes(e.kind)?2.3:1))}
function replay(){if(!match)return;clearSteps();index=0;$('playLog').replaceChildren();$('finalPanel').hidden=true;$('homeScore').textContent='0';$('awayScore').textContent='0';next()}
async function openMatch(id){try{status('Loading match…');match=await api('/api/dream-match?id='+encodeURIComponent(id));$('match').hidden=false;$('homeName').textContent=match.teamNames[0];$('awayName').textContent=match.teamNames[1];$('matchTitle').textContent=match.teamNames.join(' VS ');build();history.replaceState({},'', '/dream-match.html?id='+id);status('Match ready!');replay();$('match').scrollIntoView({behavior:'smooth'})}catch(e){status(e.message)}}
let allOpponents=[],myUsername='';
const requestedOpponent=new URLSearchParams(location.search).get('opponent');
function renderOpponents(){const sel=$('opponents'),search=$('opponentSearch').value.trim().toLowerCase(),selected=sel.value||requestedOpponent||'';sel.replaceChildren();const options=allOpponents.filter(o=>o.username.toLowerCase().includes(search)||o.name.toLowerCase().includes(search));const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=options.length?'Choose a Dream Team':'No matching Dream Teams';sel.append(placeholder);for(const o of options){const option=document.createElement('option');option.value=o.username;option.textContent=o.name+' (@'+o.username+')';sel.append(option)}if(options.some(o=>o.username===selected))sel.value=selected}
async function opponents(){try{const d=await api('/api/dream-opponents');allOpponents=d.opponents;renderOpponents();status('Choose an opponent or share your personal invite link.')}catch(e){status(e.message)}}
function inviteLink(){return location.origin+'/dream-match.html?opponent='+encodeURIComponent(myUsername)}
$('opponentSearch').addEventListener('input',renderOpponents);
$('refresh').onclick=opponents;
$('copyInvite').onclick=async()=>{const link=inviteLink();try{await navigator.clipboard.writeText(link);$('inviteFeedback').textContent='Invite link copied! Send it to a friend.'}catch{$('inviteUrl').focus();$('inviteUrl').select();$('inviteFeedback').textContent='Copy the selected link to share it.'}};
$('shareInvite').onclick=async()=>{const link=inviteLink();if(navigator.share){try{await navigator.share({title:'Challenge my Gridiron 151 Dream Team',text:'Build your Dream Team and challenge me!',url:link})}catch(e){if(e.name!=='AbortError')$('inviteFeedback').textContent='Share unavailable. Copy the link instead.'}}else $('copyInvite').click()};
$('challenge').onclick=async()=>{const username=$('opponents').value;if(!username){status('Select an opponent first.');return}try{$('challenge').disabled=true;status('Sending challenge…');await api('/api/challenge/send',{username});status('Challenge sent to @'+username+'! They can accept it in their Challenge Inbox.')}catch(e){status(e.message)}finally{$('challenge').disabled=false}};
$('replay').onclick=replay;$('replayFinal').onclick=()=>{replay();$('match').scrollIntoView({behavior:'smooth',block:'start'})};$('skip').onclick=()=>{if(!match)return;clearSteps();const e=match.result.events.at(-1);if(e)show(e);index=match.result.events.length;$('finalPanel').hidden=false;$('final').textContent=match.teamNames[match.result.winner]+' WINS! '+match.result.scores.join(' – ')};
(async()=>{try{const params=new URLSearchParams(location.search);if(params.has('storyGame')){status('Loading your GM career replay…');const d=await api('/api/story?game='+encodeURIComponent(params.get('storyGame')));match=d.match;$('match').hidden=false;$('homeName').textContent=match.teamNames[0];$('awayName').textContent=match.teamNames[1];$('matchTitle').textContent=match.teamNames.join(' VS ');build();status('Career match replay ready!');replay();return}if(params.has('seasonWeek')&&params.has('game')){status('Loading season game…');const d=await api('/api/season?week='+encodeURIComponent(params.get('seasonWeek'))+'&game='+encodeURIComponent(params.get('game'))+(params.get('seasonCode')?'&code='+encodeURIComponent(params.get('seasonCode')):''));match=d.match;$('match').hidden=false;$('homeName').textContent=match.teamNames[0];$('awayName').textContent=match.teamNames[1];$('matchTitle').textContent=match.teamNames.join(' VS ');build();status('Season game replay ready!');replay();return}const me=await api('/api/auth/me');if(!me.user){status('Log in to challenge a Dream Team.');const a=document.createElement('a');a.href='/account.html?next='+encodeURIComponent('/dream-match.html'+(requestedOpponent?'?opponent='+encodeURIComponent(requestedOpponent):''));a.textContent='Log in / Create account →';$('status').append(' ',a);return}myUsername=me.user.username;const team=await api('/api/my-team');if(!team.team){status('Build and save your Dream Team before sending a challenge.');const link=document.createElement('a');link.href='/builder.html';link.textContent=' Build my team →';$('status').append(link);return}$('battleLobby').hidden=false;$('myTeam').textContent=team.team?'Your team: '+team.team.name:'You need to save a Dream Team in the builder before challenging.';$('inviteUrl').value=inviteLink();await opponents();if(requestedOpponent){$('opponentSearch').value=requestedOpponent;renderOpponents();if(requestedOpponent===myUsername){$('opponentSearch').value='';renderOpponents();status('This is your invite link. Share it with a friend so they can challenge you.')}else if(allOpponents.some(o=>o.username===requestedOpponent)){status('Invite received! Send a challenge to @'+requestedOpponent+'.')}}const id=new URLSearchParams(location.search).get('id');if(id)await openMatch(id)}catch(e){status(e.message)}})();
})();