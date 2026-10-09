(()=>{
'use strict';
const POS=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT','DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
const coords={FS:[40,7],SS:[60,7],CB1:[10,20],CB2:[90,20],LB1:[34,24],LB2:[50,24],LB3:[66,24],DE1:[23,37],DT1:[41,37],DT2:[59,37],DE2:[77,37],WR1:[8,59],WR2:[92,59],WR3:[18,75],TE:[79,59],LT:[31,59],LG:[40,59],C:[50,59],RG:[60,59],RT:[69,59],QB:[50,77],RB:[50,92]};
const $=id=>document.getElementById(id),sprite=id=>'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+id+'.png';
let catalog=[],lineup={},selected='QB',salaryCap=250,saving=false,activeUsername='';
const message=s=>$('builderMessage').textContent=s;
const name=id=>catalog.find(p=>p.id===id)?.name||'Pokémon #'+id;
const salary=id=>catalog.find(p=>p.id===id)?.salary||0;
const spent=()=>POS.reduce((n,pos)=>n+salary(lineup[pos]),0);
function budget(){const used=spent(),left=salaryCap-used;const node=$('salaryBudget');node.textContent='$'+used+' / $'+salaryCap;node.classList.toggle('over-cap',left<0);$('budgetRemaining').textContent=left>=0?'$'+left+' remaining':'$'+Math.abs(left)+' over cap';$('budgetRemaining').classList.toggle('over-cap',left<0);$('budgetPercent').textContent=Math.round(used/salaryCap*100)+'% used';$('salaryProgress').setAttribute('aria-valuemax',String(salaryCap));$('salaryProgress').setAttribute('aria-valuenow',String(used));$('saveDreamTeam').disabled=saving;$('budgetBar').style.width=Math.min(100,used/salaryCap*100)+'%';$('budgetBar').classList.toggle('over-cap',left<0)}
function renderField(){
 const field=$('builderField');field.replaceChildren();
 const stripe=document.createElement('div');stripe.className='field-midline';stripe.setAttribute('aria-hidden','true');field.append(stripe);
 for(const [text,cls] of [['DEFENSE','defense'],['OFFENSE','offense']]){
  const label=document.createElement('span');label.className='clean-field-label '+cls;label.textContent=text;field.append(label);
 }
 for(const pos of POS){
  const id=lineup[pos],node=document.createElement('button');node.type='button';
  node.className='field-player'+(id?' filled':' empty')+(selected===pos?' selected':'');
  node.style.left=coords[pos][0]+'%';node.style.top=coords[pos][1]+'%';
  node.setAttribute('aria-label',pos+': '+(id?name(id)+' $'+salary(id):'empty')+'. Select to edit');
  node.title=pos+' · '+(id?name(id):'Choose Pokémon');
  node.onclick=()=>{selected=pos;render();if(window.matchMedia('(max-width: 1080px)').matches)$('pickerPanel').scrollIntoView({behavior:'smooth',block:'start'})};
  const role=document.createElement('span');role.className='field-player-role';role.textContent=pos;
  const img=document.createElement('img');img.className='field-player-sprite';img.alt='';img.loading='lazy';if(id)img.src=sprite(id);
  const nameplate=document.createElement('span');nameplate.className='field-player-name';nameplate.textContent=id?name(id):'Add player';
  const price=document.createElement('span');price.className='field-player-price';price.textContent=id?'$'+salary(id):'+';
  node.append(role,img,nameplate,price);field.append(node);
 }
}
function removeSelected(){const id=lineup[selected];if(!id)return;const removedName=name(id),refund=salary(id);delete lineup[selected];persist();render();score();message('Removed '+removedName+' from '+selected+'. $'+refund+' returned to your budget. Choose a replacement whenever you like.');}
const stat=(p,k)=>Number(p.stats?.[k])||0;
function fit(p,pos){
 const w=pos==='QB'?[2,1,1,1,3,2]:pos==='RB'?[2,3,1,3,0,0]:pos.startsWith('WR')?[1,2,0,4,2,0]:pos==='TE'?[3,2,3,1,0,1]:['LT','LG','C','RG','RT'].includes(pos)?[3,2,4,0,0,1]:pos.startsWith('DE')?[1,4,2,2,0,1]:pos.startsWith('DT')?[4,3,4,0,0,1]:pos.startsWith('LB')?[2,2,3,3,0,1]:pos.startsWith('CB')?[1,1,3,4,0,2]:[1,1,3,3,0,3];
 return ['hp','attack','defense','speed','special-attack','special-defense'].reduce((n,k,i)=>n+w[i]*stat(p,k),0);
}
function choose(p){lineup[selected]=p.id;selected=POS.find(pos=>!lineup[pos])||selected;persist();render();score();message('Added '+p.name+' to your lineup. Choose a Pokémon for '+selected+' next.');}
function recommendations(){
 const target=$('recommendedChoices');target.replaceChildren();
 $('recommendationTitle').textContent='Quick picks for '+selected;
 const taken=new Set(Object.values(lineup).map(Number)),old=lineup[selected];
 const pool=catalog.filter(p=>(!taken.has(p.id)||p.id===old)&&spent()-salary(old)+p.salary<=salaryCap);
 const categories=[
  ['Best fit',(a,b)=>fit(b,selected)-fit(a,selected)],
  ['Best value',(a,b)=>fit(b,selected)/b.salary-fit(a,selected)/a.salary],
  ['Budget',(a,b)=>a.salary-b.salary||fit(b,selected)-fit(a,selected)]
 ];
 const shown=new Set();
 for(const [label,compare] of categories){
  const p=[...pool].sort(compare).find(p=>!shown.has(p.id));if(!p)continue;shown.add(p.id);
  const btn=document.createElement('button');btn.type='button';btn.className='recommendation-card';
  const img=document.createElement('img');img.src=sprite(p.id);img.alt='';img.loading='lazy';
  const info=document.createElement('span');const tag=document.createElement('small');tag.textContent=label;
  const title=document.createElement('strong');title.textContent=p.name;
  const price=document.createElement('b');price.textContent=String.fromCharCode(36)+p.salary;
  info.append(tag,title,price);btn.append(img,info);btn.onclick=()=>choose(p);target.append(btn);
 }
 if(!shown.size)target.textContent='No affordable players available. Free up salary to see suggestions.';
}
function renderChoices(){
 $('pickerTitle').textContent='Pick your '+selected;
 const search=$('pokemonSearch').value.trim().toLowerCase(),used=new Set(Object.values(lineup).map(Number));
 const sort=$('priceSort').value;const list=catalog.filter(p=>p.name.includes(search)).sort((a,b)=>sort==='low'?a.salary-b.salary||a.id-b.id:sort==='high'?b.salary-a.salary||a.id-b.id:sort==='name'?a.name.localeCompare(b.name):a.id-b.id);
 $('pickerGuide').textContent='Editing '+selected+(lineup[selected]?' · '+name(lineup[selected])+' currently selected':' · Empty position')+' · '+list.length+' Pokémon found';
 const remove=$('removePlayer');remove.hidden=!lineup[selected];remove.disabled=!lineup[selected];remove.textContent=lineup[selected]?'✕ Remove '+name(lineup[selected])+' from '+selected:'Remove Player';
 if(!list.length){const empty=document.createElement('p');empty.className='picker-empty';empty.textContent=catalog.length?'No Pokémon match your search. Try another name.':'Loading available Pokémon…';$('pokemonChoices').replaceChildren(empty);return}
 $('pokemonChoices').replaceChildren(...list.map(p=>{
  const taken=used.has(p.id)&&lineup[selected]!==p.id;
  const tooExpensive=spent()-salary(lineup[selected])+p.salary>salaryCap;
  const btn=document.createElement('button');btn.type='button';btn.className='pokemon-choice'+(taken?' used':'')+(lineup[selected]===p.id?' chosen':'');btn.disabled=taken||tooExpensive;btn.title=taken?'Already assigned to another position':tooExpensive?'Over salary cap':p.name+' · $'+p.salary;
  const img=document.createElement('img');img.src=sprite(p.id);img.loading='lazy';img.alt='';
  const title=document.createElement('strong');title.textContent=p.name;
  const cost=document.createElement('small');cost.textContent='$'+p.salary;btn.append(img,title,cost);btn.onclick=()=>choose(p);return btn
 }))
}
function renderBreakdown(){
 $('breakdown').replaceChildren(...POS.map(pos=>{
  const row=document.createElement('div');row.className='breakdown-row';
  const pick=document.createElement('button');pick.type='button';pick.className='roster-position-pick';
  pick.textContent=pos+' · '+(lineup[pos]?name(lineup[pos])+' · $'+salary(lineup[pos]):'Open');
  pick.onclick=()=>{selected=pos;render()};row.append(pick);
  if(lineup[pos]){const remove=document.createElement('button');remove.type='button';remove.className='roster-remove';remove.textContent='✕';remove.title='Remove '+name(lineup[pos])+' from '+pos;remove.setAttribute('aria-label',remove.title);remove.onclick=()=>{selected=pos;removeSelected()};row.append(remove)}
  return row
 }))
}
function render(){renderField();recommendations();renderChoices();renderBreakdown();const filled=POS.filter(p=>lineup[p]).length;$('statusText').textContent=filled+'/22 positions filled';const count=document.querySelector('.hero-number>strong');if(count)count.innerHTML=filled+'<span>/22</span>';budget()}
function persist(){try{if(activeUsername)sessionStorage.setItem('gridiron_draft_lineup_'+activeUsername,JSON.stringify({lineup,name:$('teamName').value}));}catch{}}
function score(){const filled=POS.filter(p=>lineup[p]).length;$('overall').textContent='—';$('offenseScore').textContent='—';$('defenseScore').textContent='—';$('statusText').textContent=filled+'/22 positions filled'}
async function init(){
 try{
  const response=await fetch('/api/catalog');if(!response.ok)throw Error('Could not load Pokémon');
  const data=await response.json();if(!data.ready)throw Error('Pokémon database is still loading. Please retry.');catalog=data.pokemon;salaryCap=data.salaryCap;
  // Preserve unsaved edits across temporary errors without embedding rosters in URLs.
  try{const me=await accountRequest('/api/my-team');activeUsername=me.user?.username||'';let draft=null;try{if(activeUsername)draft=JSON.parse(sessionStorage.getItem('gridiron_draft_lineup_'+activeUsername)||'null')}catch{}if(me.team){const valid=new Set(catalog.map(p=>p.id)),seen=new Set();lineup={};for(const pos of POS){const id=Number(me.team.lineup[pos]);if(valid.has(id)&&!seen.has(id)){lineup[pos]=id;seen.add(id)}}$('teamName').value=me.team.name;message(seen.size===22?(spent()>salaryCap?'Your saved team is over the salary cap. Replace expensive Pokémon to save.':'Editing '+me.team.name+' — change any position, then save your changes.'):'Your saved team has missing or duplicate Pokémon. Fill the empty positions and save.')}else message('Build your first Dream Team: choose 22 Pokémon, then save.');if(draft?.lineup&&typeof draft.lineup==='object'){const valid=new Set(catalog.map(p=>p.id)),seen=new Set();for(const pos of POS){const id=Number(draft.lineup[pos]);if(valid.has(id)&&!seen.has(id)){lineup[pos]=id;seen.add(id)}else delete lineup[pos]}if(draft.name)$('teamName').value=draft.name;message('Restored your unsaved edits. Review the lineup and press Save My Team.')}}catch(e){if(/Log in/i.test(e.message)){location.replace('/account.html?next=/builder.html');return}message(e.message)}
  render();score();
 }catch(e){message('Unable to load: '+e.message)}
}
$('pokemonSearch').oninput=renderChoices;
$('priceSort').onchange=renderChoices;
$('removePlayer').onclick=removeSelected;

async function accountRequest(url,method,data){const r=await fetch(url,{method:method||'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}
$('saveDreamTeam').onclick=async()=>{
 if(saving)return;
 try{
  const valid=new Set(catalog.map(p=>p.id));if(!valid.size)throw Error('Pokémon are still loading. Please wait.');
  const missing=POS.filter(p=>!valid.has(lineup[p]));if(missing.length)throw Error('Select Pokémon for '+missing.length+' missing position(s): '+missing.join(', '));
  if(new Set(POS.map(p=>lineup[p])).size!==22)throw Error('Every position must have a different Pokémon.');
  if(spent()>salaryCap)throw Error('Your lineup is $'+(spent()-salaryCap)+' over the $'+salaryCap+' salary cap. Replace a player and try again.');
  saving=true;budget();$('saveDreamTeam').textContent='Saving…';message('Saving your Dream Team…');
  const teamName=$('teamName').value.trim()||'My Dream Team';
  await accountRequest('/api/my-team','POST',{name:teamName,lineup});
  try{sessionStorage.removeItem('gridiron_draft_lineup_'+activeUsername)}catch{}
  message('✓ Team saved successfully! Opening your roster…');location.assign('/my-team.html');
 }catch(e){message('Could not save: '+e.message);if(/Log in|unauthorized|session/i.test(e.message)){message('Your session expired. Re-enter your username, then return to the builder to save your edits.');}}
 finally{saving=false;$('saveDreamTeam').textContent='💾 Save My Team';budget()}
};
$('teamName').addEventListener('input',persist);
$('loadDreamTeam').onclick=async()=>{try{const d=await accountRequest('/api/my-team');if(!d.team)throw Error('No saved team yet. Save one first.');lineup=d.team.lineup;$('teamName').value=d.team.name;persist();render();score();message('Loaded '+d.team.name+' from your account.')}catch(e){message(e.message)}};
$('clearTeam').onclick=()=>{lineup={};selected='QB';persist();render();score();message('Lineup cleared')};
$('shareTeam').onclick=async()=>{persist();try{await navigator.clipboard.writeText(location.href);message('Shareable lineup link copied!')}catch{message('Copy this URL to share: '+location.href)}};
$('challengeFriends').onclick=async()=>{
 const url=new URL('/builder.html',location.origin);
 try{await navigator.clipboard.writeText(url.href);message('Challenge link copied! Friends can build their own team, enter their name, and submit to the same leaderboard.')}
 catch{message('Send your friends this link: '+url.href)}
};
init();
})();