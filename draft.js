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
function joined(x){room={...x,token:x.token};sessionStorage.setItem('gridiron-room',JSON.stringify({code:x.code,token:x.token}));$('code').value=x.code;$('create').disabled=$('join').disabled=true;$('copy').hidden=false;history.replaceState({},'',location.pathname+'?room='+x.code);update(x);clearInterval(poll);poll=setInterval(refresh,1200);msg('Joined room '+x.code+' as '+(x.side===0?'Forest City':'Volt City'))}
async function refresh(){if(!room)return;try{update(await api('state?code='+room.code+'&token='+room.token))}catch(e){msg(e.message);clearInterval(poll)}}
async function pick(id){try{update(await api('pick',{code:room.code,token:room.token,id}))}catch(e){msg(e.message);refresh()}}
function autoAssign(){const picks=(room?.picks||[]).filter(p=>p.side===room.side);assigned=Object.fromEntries(picks.map(p=>[p.position,p.id]));renderPositions()}
function renderPositions(){const ids=room?.rosters?.[room.side]||[];$('positions').replaceChildren(...POS.map(pos=>{const box=document.createElement('div');box.className='pos';const label=document.createElement('b');label.textContent=pos;const select=document.createElement('select');select.setAttribute('aria-label',pos);ids.forEach(id=>{const opt=document.createElement('option');opt.value=id;opt.textContent=monName(id);select.append(opt)});select.value=assigned[pos]||'';select.onchange=()=>{assigned[pos]=Number(select.value)};box.append(label,select);return box}))}
function fieldUpdate(e){
 const t=Number.isInteger(e.possession)?e.possession:0,spot=Math.max(0,Math.min(100,Number(e.spot)||25)),x=t===0?spot:100-spot;
 $('fieldpossession').textContent=(t===0?'FOREST CITY':'VOLT CITY')+' BALL';
 $('fieldyard').textContent=spot<=50?'OWN '+Math.round(spot):'OPP '+Math.round(100-spot);
 $('scrimmage').style.left=x+'%';
 [['qb',e.actors?.offense,x-7,64],['carrier',e.actors?.carrier,x,38],['defense',e.actors?.defense,x+7,50]].forEach(([role,id,px,py])=>{const el=$('field-'+role),img=$('sprite-'+role);el.style.left=Math.max(8,Math.min(92,px))+'%';el.style.top=py+'%';el.style.opacity=id?'1':'.25';if(id)img.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+id+'.png'});
 $('field-ball').style.left=Math.max(8,Math.min(92,x))+'%';
 const flash=$('field-flash');flash.textContent=({touchdown:'TOUCHDOWN!',turnover:'TURNOVER!',fieldgoal:'FIELD GOAL!',bigplay:'BIG PLAY!'})[e.kind]||'';
 flash.classList.remove('active');void flash.offsetWidth;if(flash.textContent)flash.classList.add('active');
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
function replayStop(){if(replayTimer)clearTimeout(replayTimer);replayTimer=null}
function replayStart(){if(!room?.result)return;replayStop();replayIndex=0;$('plays').replaceChildren();$('final').hidden=true;$('totals').hidden=true;$('livehome').textContent='0';$('liveaway').textContent='0';$('livequarter').textContent='KICKOFF';$('livecall').textContent='Teams take the field!';fieldUpdate({spot:25,possession:0,kind:'kickoff'});$('highlight').hidden=true;replayNext()}
function replayNext(){const r=room?.result;if(!r)return;const events=r.events||r.log.map(text=>({text,kind:'play',quarter:1,scores:r.scores}));if(replayIndex>=events.length){$('winner').textContent=(r.winner===0?'Forest City':'Volt City')+' wins!';$('final').textContent=r.scores.join(' – ');$('totals').textContent='Yards: '+r.yards.join('–')+' · Turnovers: '+r.turnovers.join('–');$('final').hidden=false;$('totals').hidden=false;return}const e=events[replayIndex++];showEvent(e);replayTimer=setTimeout(replayNext,Number($('speed').value)*(['touchdown','turnover','bigplay'].includes(e.kind)?3:1))}
function results(r){const key=room.code+'-'+r.scores.join('-')+'-'+(r.events?.length||r.log.length);if(replayKey===key)return;replayKey=key;$('winner').textContent='Game Day — Live Replay';replayStart()}
$('replay').onclick=replayStart;
$('skip').onclick=()=>{if(!room?.result)return;replayStop();const r=room.result;$('plays').replaceChildren();const events=r.events||[];if(events.length)showEvent(events[events.length-1]);$('winner').textContent=(r.winner===0?'Forest City':'Volt City')+' wins!';$('final').textContent=r.scores.join(' – ');$('totals').textContent='Yards: '+r.yards.join('–')+' · Turnovers: '+r.turnovers.join('–');$('final').hidden=false;$('totals').hidden=false};
$('create').onclick=async()=>{try{joined(await api('create',{}))}catch(e){msg(e.message)}};
$('join').onclick=async()=>{try{joined(await api('join',{code:$('code').value.trim().toUpperCase()}))}catch(e){msg(e.message)}};
$('copy').onclick=async()=>{const link=location.origin+location.pathname+'?room='+room.code;try{await navigator.clipboard.writeText(link);msg('Invite copied!')}catch{msg('Send: '+link)}};
$('search').oninput=render;$('type').onchange=render;$('auto').onclick=autoAssign;
$('ready').onclick=async()=>{try{if(new Set(Object.values(assigned)).size!==22)throw Error('Assign each Pokémon to one unique position');update(await api('ready',{code:room.code,token:room.token,lineup:assigned}));msg('Lineup locked. Waiting for your friend.')}catch(e){msg(e.message)}};
const previous=(()=>{try{return JSON.parse(sessionStorage.getItem('gridiron-room'))}catch{return null}})();
if(previous){room=previous;$('code').value=previous.code;$('create').disabled=$('join').disabled=true;$('copy').hidden=false;refresh().then(()=>poll=setInterval(refresh,1200))}
else{const code=new URLSearchParams(location.search).get('room');if(code){$('code').value=code.toUpperCase();msg('Invite detected. Click Join Room.')}}
loadCatalog();
})();