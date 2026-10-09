(()=>{'use strict';
const $=id=>document.getElementById(id),POS=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT','DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
let catalog=[],room=null,assigned={},poll=null,dbReady=false,lastPhase='';
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
 $('rosters').replaceChildren(...x.rosters.map((ids,i)=>{const box=document.createElement('div');box.className='roster';const h=document.createElement('h3');h.textContent=(i===0?'Forest City':'Volt City')+' ('+ids.length+'/22)'+(x.ready[i]?' ✓':'');const list=document.createElement('ol');ids.forEach(id=>{const li=document.createElement('li');li.textContent=(x.picks.find(p=>p.id===id)?.position||'')+' — '+monName(id);list.append(li)});box.append(h,list);return box}));
 $('assignments').hidden=x.phase!=='lineups';$('results').hidden=x.phase!=='finished';if(x.phase==='lineups'&&lastPhase!=='lineups')autoAssign();$('ready').disabled=x.ready[x.side];if(x.phase==='finished'&&x.result)results(x.result);lastPhase=x.phase;render();
}
function joined(x){room={...x,token:x.token};sessionStorage.setItem('gridiron-room',JSON.stringify({code:x.code,token:x.token}));$('code').value=x.code;$('create').disabled=$('join').disabled=true;$('copy').hidden=false;history.replaceState({},'',location.pathname+'?room='+x.code);update(x);clearInterval(poll);poll=setInterval(refresh,1200);msg('Joined room '+x.code+' as '+(x.side===0?'Forest City':'Volt City'))}
async function refresh(){if(!room)return;try{update(await api('state?code='+room.code+'&token='+room.token))}catch(e){msg(e.message);clearInterval(poll)}}
async function pick(id){try{update(await api('pick',{code:room.code,token:room.token,id}))}catch(e){msg(e.message);refresh()}}
function autoAssign(){const picks=(room?.picks||[]).filter(p=>p.side===room.side);assigned=Object.fromEntries(picks.map(p=>[p.position,p.id]));renderPositions()}
function renderPositions(){const ids=room?.rosters?.[room.side]||[];$('positions').replaceChildren(...POS.map(pos=>{const box=document.createElement('div');box.className='pos';const label=document.createElement('b');label.textContent=pos;const select=document.createElement('select');select.setAttribute('aria-label',pos);ids.forEach(id=>{const opt=document.createElement('option');opt.value=id;opt.textContent=monName(id);select.append(opt)});select.value=assigned[pos]||'';select.onchange=()=>{assigned[pos]=Number(select.value)};box.append(label,select);return box}))}
function results(r){$('winner').textContent=(r.winner===0?'Forest City':'Volt City')+' wins!';$('final').textContent=r.scores[0]+' – '+r.scores[1];$('totals').textContent='Yards: '+r.yards.join('–')+' · Turnovers: '+r.turnovers.join('–');$('plays').replaceChildren(...r.log.map(s=>{const p=document.createElement('p');p.textContent=s;return p}))}
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