(()=>{'use strict';
const $=id=>document.getElementById(id),POS=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT','DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
let catalog=[],room=null,assigned={},poll=null,dbReady=false,lastPhase='',replayTimer=null,replayKey='',replayIndex=0;
const msg=s=>$('message').textContent=s;
async function api(endpoint,data){const r=await fetch('/api/'+endpoint,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j}
function monName(id){return catalog.find(p=>p.id===id)?.name||'#'+id}
async function loadCatalog(){try{const d=await api('catalog');dbReady=d.ready;catalog=d.pokemon;$('status').textContent=dbReady?'151 Pokémon ready':'Loading PokéAPI…';if(d.error)msg('PokéAPI download failed: '+d.error);const types=[...new Set(catalog.flatMap(p=>p.types||[]))].sort();$('type').innerHTML='<option value="">All types</option>'+types.map(t=>'<option>'+t+'</option>').join('');render();if(!dbReady)setTimeout(loadCatalog,5000)}catch(e){msg(e.message);setTimeout(loadCatalog,5000)}}
function render(){
 const used=new Map((room?.picks||[]).map(x=>[x.id,x.side])),canPick=dbReady&&room?.phase==='draft'&&room.turn===room.side;
 const q=$('search').value.toLowerCase(),type=$('type').value;
 $('catalog').replaceChildren(...catalog.filter(p=>p.name.toLowerCase().includes(q)&&(!type||p.types?.includes(type))).map(p=>{
 const b=document.createElement('button');b.className='mon'+(used.has(p.id)?' taken':'');b.disabled=!canPick||used.has(p.id);
 const img=document.createElement('img');img.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+p.id+'.png';img.loading='lazy';img.alt='';
 const title=document.createElement('strong');title.textContent=p.name;
 const meta=document.createElement('small');meta.textContent=used.has(p.id)?(used.get(p.id)===0?'Forest City pick':'Volt City pick'):'#'+p.id+' · '+(p.types||[]).join('/');
 b.append(img,title,meta);b.onclick=()=>pick(p.id);return b;
 }))}
function update(x){room={...room,...x};$('home').textContent=x.rosters[0].length+' / 22';$('away').textContent=x.rosters[1].length+' / 22';$('phase').textContent=x.phase.toUpperCase();
 $('turn').textContent=x.phase==='draft'?(x.turn===x.side?'YOUR PICK':'OPPONENT PICK'):x.phase==='waiting'?'Waiting for your friend':x.phase==='lineups'?'Draft complete — set your lineup':'Game complete';
 $('pickno').textContent='Pick '+x.picks.length+' / 44 · Snake draft (1–2–2–1)';$('positionNow').textContent=x.currentPosition?('DRAFTING FOR: '+x.currentPosition):'DRAFT COMPLETE';
 $('rosters').replaceChildren(...x.rosters.map((ids,i)=>{
 const box=document.createElement('section');box.className='roster formation-team-'+i;
 const heading=document.createElement('h3');heading.textContent=(i===0?'🌲 FOREST CITY':'⚡ VOLT CITY')+' — '+ids.length+'/22'+(x.ready[i]?' ✓':'');
 const field=document.createElement('div');field.className='formation-field';
 const defenseTitle=document.createElement('span');defenseTitle.className='formation-label formation-defense-label';defenseTitle.textContent='DEFENSE';
 const offenseTitle=document.createElement('span');offenseTitle.className='formation-label formation-offense-label';offenseTitle.textContent='OFFENSE';
 field.append(defenseTitle,offenseTitle);
 const coords={
  FS:[40,7],SS:[60,7],CB1:[10,20],CB2:[90,20],LB1:[34,24],LB2:[50,24],LB3:[66,24],
  DE1:[23,37],DT1:[41,37],DT2:[59,37],DE2:[77,37],
  WR1:[8,59],WR2:[92,59],WR3:[18,75],TE:[79,59],
  LT:[31,59],LG:[40,59],C:[50,59],RG:[60,59],RT:[69,59],
  QB:[50,77],RB:[50,92]
 };
 POS.forEach(pos=>{
  const draft=x.picks.find(p=>p.side===i&&p.position===pos);
  const pokemon=draft?.id,point=coords[pos];
  const slot=document.createElement('div');slot.className='formation-player'+(pokemon?' occupied':' vacant')+(POS.indexOf(pos)<11?' offense':' defense');
  slot.style.left=point[0]+'%';slot.style.top=point[1]+'%';
  slot.title=pos+' — '+(pokemon?monName(pokemon):'Undrafted');
  const sprite=document.createElement('img');sprite.className='formation-sprite';sprite.alt=pokemon?monName(pokemon):'';
  if(pokemon){sprite.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+pokemon+'.png';sprite.loading='lazy'}
  const nameplate=document.createElement('span');nameplate.className='formation-nameplate';
  const name=document.createElement('strong');name.textContent=pokemon?monName(pokemon):'—';
  const role=document.createElement('small');role.textContent=pos;
  nameplate.append(name,role);slot.append(sprite,nameplate);field.append(slot)
 });
 const hint=document.createElement('p');hint.className='formation-hint';hint.textContent='Defense at the top · Offense at the bottom · Pokémon appear as they are drafted';
 box.append(heading,field,hint);return box
}));
 $('assignments').hidden=x.phase!=='lineups';$('results').hidden=x.phase!=='finished';if(x.phase==='lineups'&&lastPhase!=='lineups')autoAssign();$('ready').disabled=x.ready[x.side];if(x.phase==='finished'&&x.result)results(x.result);lastPhase=x.phase;render();
}
function joined(x){$('leave').hidden=false;room={...x,token:x.token};sessionStorage.setItem('gridiron-room',JSON.stringify({code:x.code,token:x.token}));$('code').value=x.code;$('create').disabled=$('join').disabled=true;$('copy').hidden=false;$('leave').hidden=false;history.replaceState({},'',location.pathname+'?room='+x.code);update(x);clearInterval(poll);poll=setInterval(refresh,1200);msg('Joined room '+x.code+' as '+(x.side===0?'Forest City':'Volt City'))}
function leaveRoom(notice='You left the room. Enter an invite code to join another game.'){
 clearInterval(poll);poll=null;replayStop();room=null;assigned={};lastPhase='';replayKey='';
 sessionStorage.removeItem('gridiron-room');$('create').disabled=false;$('join').disabled=false;
 $('copy').hidden=true;$('leave').hidden=true;$('assignments').hidden=true;$('results').hidden=true;
 $('home').textContent='0 / 22';$('away').textContent='0 / 22';$('phase').textContent='LOBBY';
 $('turn').textContent='Waiting for opponent';$('pickno').textContent='Pick 0 / 44';
 $('positionNow').textContent='WAITING FOR DRAFT';$('rosters').replaceChildren();
 history.replaceState({},'',location.pathname+location.search.replace(/([?&])room=[^&]*&?/,'$1').replace(/[?&]$/,''));
 msg(notice);render();
}
async function refresh(){if(!room)return;try{update(await api('state?code='+room.code+'&token='+room.token))}catch(e){
 if(/Room not found|Invalid room token/i.test(e.message))leaveRoom('Your previous room expired. Create a new room or enter a fresh invite code.');
 else msg('Connection interrupted: '+e.message+'. Retrying…');
}}
async function pick(id){try{update(await api('pick',{code:room.code,token:room.token,id}))}catch(e){msg(e.message);refresh()}}
function autoAssign(){const picks=(room?.picks||[]).filter(p=>p.side===room.side);assigned=Object.fromEntries(picks.map(p=>[p.position,p.id]));renderPositions()}
function renderPositions(){const ids=room?.rosters?.[room.side]||[];$('positions').replaceChildren(...POS.map(pos=>{const box=document.createElement('div');box.className='pos';const label=document.createElement('b');label.textContent=pos;const select=document.createElement('select');select.setAttribute('aria-label',pos);ids.forEach(id=>{const opt=document.createElement('option');opt.value=id;opt.textContent=monName(id);select.append(opt)});select.value=assigned[pos]||'';select.onchange=()=>{assigned[pos]=Number(select.value)};box.append(label,select);return box}))}
// Animate all 22 starters, with ball travel tied to the play outcome.
const offenseSlots=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT'];
const defenseSlots=['DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
const lane={QB:50,RB:65,WR1:9,WR2:91,WR3:23,TE:78,LT:30,LG:40,C:50,RG:60,RT:70,DE1:27,DE2:73,DT1:42,DT2:58,LB1:35,LB2:50,LB3:65,CB1:12,CB2:88,FS:40,SS:60};
let animationTimers=[],onField=new Map();
const fieldClamp=x=>Math.max(7,Math.min(93,x));
function cancelFieldAnimation(){animationTimers.forEach(clearTimeout);animationTimers=[]}
function later(fn,ms){animationTimers.push(setTimeout(fn,ms))}
function starter(team,pos){return room?.picks?.find(p=>p.side===team&&p.position===pos)?.id}
function setPlayer(team,pos,x,y,duration=500){
 const el=onField.get(team+'-'+pos);if(!el)return;
 el.style.transitionDuration=duration+'ms';el.style.left=fieldClamp(x)+'%';el.style.top=Math.max(10,Math.min(90,y))+'%';
}
function buildField(){
 const layer=$('field-squad');layer.replaceChildren();onField=new Map();
 for(let team=0;team<2;team++)for(const pos of [...offenseSlots,...defenseSlots]){
  const id=starter(team,pos);if(!id)continue;
  const el=document.createElement('div');el.className='squad-player squad-team-'+team;el.title=(team===0?'Forest City':'Volt City')+' · '+pos+' · '+monName(id);
  const img=document.createElement('img');img.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+id+'.png';img.alt=monName(id);img.loading='eager';
  const tag=document.createElement('span');tag.textContent=pos;el.append(img,tag);layer.append(el);onField.set(team+'-'+pos,el)
 }
}
function fieldUpdate(e){
 if(onField.size!==22)buildField();
 cancelFieldAnimation();
 const t=Number.isInteger(e.possession)?e.possession:0,opp=1-t,spot=Math.max(0,Math.min(100,Number(e.spot)||25));
 const direction=t===0?1:-1,x=fieldClamp(t===0?spot:100-spot);
 const actors=e.actors||{},gain=Number(actors.gain)||0;
 const origin=fieldClamp(x-direction*Math.max(0,gain));
 const playing=!!actors.carrier&&['play','bigplay','touchdown','incomplete','sack','turnover'].includes(e.kind);
 const base=playing?origin:x,pass=actors.playType==='pass';
 $('fieldpossession').textContent=(t===0?'FOREST CITY':'VOLT CITY')+' BALL';
 $('fieldyard').textContent=spot<=50?'OWN '+Math.round(spot):'OPP '+Math.round(100-spot);
 $('scrimmage').style.left=base+'%';
 const front=base-direction*5,back=base-direction*12,defFront=base+direction*6,defBack=base+direction*16;
 for(const pos of offenseSlots){
  const px=pos==='QB'?back:pos==='RB'?back-direction*4:pos.startsWith('WR')||pos==='TE'?front-direction*3:front;
  setPlayer(t,pos,px,lane[pos],0)
 }
 for(const pos of defenseSlots){
  const px=pos.startsWith('CB')||pos==='FS'||pos==='SS'?defBack:pos.startsWith('LB')?defFront+direction*5:defFront;
  setPlayer(opp,pos,px,lane[pos],0)
 }
 const ball=$('field-ball');ball.style.transition='none';ball.style.left=fieldClamp(back)+'%';ball.style.top='50%';ball.style.opacity=playing?'1':'.35';
 const flash=$('field-flash');flash.textContent=({touchdown:'TOUCHDOWN!',turnover:'TURNOVER!',fieldgoal:'FIELD GOAL!',bigplay:'BIG PLAY!'})[e.kind]||'';
 flash.classList.remove('active');void flash.offsetWidth;if(flash.textContent)flash.classList.add('active');
 if(!playing)return;
 const speed=Math.max(200,Number($('speed').value)||700),total=Math.max(400,speed*.85);
 const carrierPos=offenseSlots.find(p=>starter(t,p)===actors.carrier)||(pass?'WR1':'RB');
 const defenderPos=defenseSlots.find(p=>starter(opp,p)===actors.defense)||'LB2';
 const finish=fieldClamp(x),start=fieldClamp(base);
 const targetY=lane[carrierPos]||50;
 // Stage 1: the snap, receivers release, linemen block and defenders react.
 later(()=>{
  for(const pos of offenseSlots){
   const isReceiver=pos.startsWith('WR')||pos==='TE';
   const px=pos==='QB'?back:pos==='RB'?back+direction*3:isReceiver?front+direction*12:front+direction*3;
   setPlayer(t,pos,px,lane[pos]+(isReceiver?(pos==='WR2'?-5:5):0),total*.45)
  }
  for(const pos of defenseSlots){
   const px=pos.startsWith('CB')?defBack-direction*4:pos==='FS'||pos==='SS'?defBack-direction*2:defFront-direction*3;
   setPlayer(opp,pos,px,lane[pos]+(pos==='CB1'?5:pos==='CB2'?-5:0),total*.5)
  }
 },25);
 // Stage 2: pass flight / handoff, then breakaway and pursuit.
 later(()=>{
  const carrierX=pass?fieldClamp(start+direction*13):fieldClamp(start-direction*3);
  setPlayer(t,carrierPos,finish,targetY,total*.65);
  setPlayer(opp,defenderPos,fieldClamp(finish-direction*2),targetY+5,total*.68);
  for(const pos of offenseSlots.filter(p=>p!==carrierPos&&p!=='QB'))setPlayer(t,pos,fieldClamp(start+direction*(pos.startsWith('WR')?17:8)),lane[pos],total*.7);
  for(const pos of defenseSlots.filter(p=>p!==defenderPos))setPlayer(opp,pos,fieldClamp(start+direction*(pos.startsWith('CB')?19:11)),lane[pos],total*.72);
  ball.style.transition='left '+Math.round(total*.4)+'ms ease-in-out,top '+Math.round(total*.4)+'ms ease-in-out';
  ball.style.left=carrierX+'%';ball.style.top=targetY+'%';
  later(()=>{
   ball.style.transition='left '+Math.round(total*.45)+'ms ease-out,top '+Math.round(total*.45)+'ms ease-out';
   ball.style.left=finish+'%';ball.style.top=targetY+'%';
   $('scrimmage').style.left=finish+'%';
  },total*.38)
 },total*.34)
}
function spotlight(e){
 const el=$('highlight'),special=['bigplay','touchdown','turnover'].includes(e.kind);
 if(!special||!e.actors?.carrier){el.hidden=true;return}
 const hero=e.kind==='turnover'?e.actors.defense:e.actors.carrier;
 el.hidden=false;el.classList.remove('show','touchdown','bigplay','turnover');void el.offsetWidth;
 el.classList.add('show',e.kind);
 $('highlightType').textContent=e.kind==='touchdown'?'🏆 TOUCHDOWN!':e.kind==='turnover'?'💥 GAME-CHANGING TURNOVER!':'⚡ EXPLOSIVE PLAY!';
 $('highlightSprite').src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/'+hero+'.png';
 $('highlightSprite').onerror=()=>{$('highlightSprite').onerror=null;$('highlightSprite').src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+hero+'.png'};
 $('highlightSprite').alt=monName(hero);
 $('highlightName').textContent=monName(hero).toUpperCase();
 $('highlightMove').textContent=e.kind==='turnover'?'DEFENSIVE STOP':e.actors.move||'INCREDIBLE ATHLETICISM';
 $('highlightDescription').textContent=e.text;
}
function showEvent(e){spotlight(e);fieldUpdate(e);$('livehome').textContent=e.scores[0];$('liveaway').textContent=e.scores[1];$('livequarter').textContent=e.quarter===5?'FINAL / OT':'Q'+e.quarter;$('livecall').textContent=e.text;const p=document.createElement('p');p.textContent=e.text;p.className='event-'+e.kind;$('plays').prepend(p)}
function replayStop(){if(replayTimer)clearTimeout(replayTimer);replayTimer=null;cancelFieldAnimation()}
function replayStart(){if(!room?.result)return;replayStop();replayIndex=0;$('plays').replaceChildren();$('final').hidden=true;$('totals').hidden=true;$('livehome').textContent='0';$('liveaway').textContent='0';$('livequarter').textContent='KICKOFF';$('livecall').textContent='Teams take the field!';fieldUpdate({spot:25,possession:0,kind:'kickoff'});$('highlight').hidden=true;replayNext()}
function replayNext(){const r=room?.result;if(!r)return;const events=r.events||r.log.map(text=>({text,kind:'play',quarter:1,scores:r.scores}));if(replayIndex>=events.length){$('winner').textContent=(r.winner===0?'Forest City':'Volt City')+' wins!';$('final').textContent=r.scores.join(' – ');$('totals').textContent='Yards: '+r.yards.join('–')+' · Turnovers: '+r.turnovers.join('–');$('final').hidden=false;$('totals').hidden=false;return}const e=events[replayIndex++];showEvent(e);replayTimer=setTimeout(replayNext,Number($('speed').value)*(['touchdown','turnover','bigplay'].includes(e.kind)?3:1))}
function results(r){const key=room.code+'-'+r.scores.join('-')+'-'+(r.events?.length||r.log.length);if(replayKey===key)return;replayKey=key;$('winner').textContent='Game Day — Live Replay';replayStart()}
$('replay').onclick=replayStart;
$('skip').onclick=()=>{if(!room?.result)return;replayStop();const r=room.result;$('plays').replaceChildren();const events=r.events||[];if(events.length)showEvent(events[events.length-1]);$('winner').textContent=(r.winner===0?'Forest City':'Volt City')+' wins!';$('final').textContent=r.scores.join(' – ');$('totals').textContent='Yards: '+r.yards.join('–')+' · Turnovers: '+r.turnovers.join('–');$('final').hidden=false;$('totals').hidden=false};
$('leave').onclick=()=>leaveRoom();
$('create').onclick=async()=>{try{joined(await api('create',{}))}catch(e){msg(e.message)}};
$('join').onclick=async()=>{try{joined(await api('join',{code:$('code').value.trim().toUpperCase()}))}catch(e){msg(e.message)}};
$('copy').onclick=async()=>{const link=location.origin+location.pathname+'?room='+room.code;try{await navigator.clipboard.writeText(link);msg('Invite copied!')}catch{msg('Send: '+link)}};
$('search').oninput=render;$('type').onchange=render;$('auto').onclick=autoAssign;
$('ready').onclick=async()=>{try{if(new Set(Object.values(assigned)).size!==22)throw Error('Assign each Pokémon to one unique position');update(await api('ready',{code:room.code,token:room.token,lineup:assigned}));msg('Lineup locked. Waiting for your friend.')}catch(e){msg(e.message)}};
const invite=new URLSearchParams(location.search).get('room')?.trim().toUpperCase();
const previous=(()=>{try{return JSON.parse(sessionStorage.getItem('gridiron-room'))}catch{return null}})();
if(invite&&(!previous||invite!==previous.code)){
 sessionStorage.removeItem('gridiron-room');$('code').value=invite;msg('Invite detected. Click Join Room to enter this match.');
}else if(previous?.code&&previous?.token){
 room=previous;$('code').value=previous.code;$('create').disabled=$('join').disabled=true;
 $('copy').hidden=false;$('leave').hidden=false;
 refresh().then(()=>{if(room&&room.code===previous.code)poll=setInterval(refresh,1200)});
}else if(invite){$('code').value=invite;msg('Invite detected. Click Join Room.')}
loadCatalog();
})();