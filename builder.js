(()=>{
'use strict';
const POS=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT','DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
const coords={FS:[40,7],SS:[60,7],CB1:[10,20],CB2:[90,20],LB1:[34,24],LB2:[50,24],LB3:[66,24],DE1:[23,37],DT1:[41,37],DT2:[59,37],DE2:[77,37],WR1:[8,59],WR2:[92,59],WR3:[18,75],TE:[79,59],LT:[31,59],LG:[40,59],C:[50,59],RG:[60,59],RT:[69,59],QB:[50,77],RB:[50,92]};
const $=id=>document.getElementById(id),sprite=id=>'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+id+'.png';
let catalog=[],lineup={},selected='QB',salaryCap=250,saving=false;
const message=s=>$('builderMessage').textContent=s;
const name=id=>catalog.find(p=>p.id===id)?.name||'Pokémon #'+id;
const salary=id=>catalog.find(p=>p.id===id)?.salary||0;
const spent=()=>POS.reduce((n,pos)=>n+salary(lineup[pos]),0);
function budget(){const used=spent(),left=salaryCap-used;const node=$('salaryBudget');node.textContent='$'+used+' / $'+salaryCap;node.classList.toggle('over-cap',left<0);$('budgetRemaining').textContent=left>=0?'$'+left+' remaining':'$'+Math.abs(left)+' over cap';$('budgetRemaining').classList.toggle('over-cap',left<0);$('budgetPercent').textContent=Math.round(used/salaryCap*100)+'% used';$('salaryProgress').setAttribute('aria-valuemax',String(salaryCap));$('salaryProgress').setAttribute('aria-valuenow',String(used));$('saveDreamTeam').disabled=saving;$('budgetBar').style.width=Math.min(100,used/salaryCap*100)+'%';$('budgetBar').classList.toggle('over-cap',left<0)}
function renderField(){
 const field=$('builderField');field.replaceChildren();
 for(const [text,cls] of [['DEFENSE','formation-defense-label'],['OFFENSE','formation-offense-label']]){const label=document.createElement('span');label.className='formation-label '+cls;label.textContent=text;field.append(label)}
 POS.forEach(pos=>{
  const id=lineup[pos],node=document.createElement('button');node.type='button';node.className='formation-player '+(id?'occupied':'vacant')+(pos===selected?' selected':'')+(POS.indexOf(pos)<11?' offense':' defense');node.style.left=coords[pos][0]+'%';node.style.top=coords[pos][1]+'%';node.title=pos+' — '+(id?name(id):'Choose Pokémon');node.onclick=()=>{selected=pos;render()};
  const img=document.createElement('img');img.className='formation-sprite';img.alt=id?name(id):'';if(id)img.src=sprite(id);
  const plate=document.createElement('span');plate.className='formation-nameplate';const title=document.createElement('strong');title.textContent=id?name(id):'SELECT';const role=document.createElement('small');role.textContent=pos;const cost=document.createElement('small');cost.textContent=id?'$'+salary(id):'';plate.append(title,role,cost);node.append(img,plate);field.append(node)
 })
}
function renderChoices(){
 $('pickerTitle').textContent='Pick your '+selected;
 const search=$('pokemonSearch').value.trim().toLowerCase(),used=new Set(Object.values(lineup).map(Number));
 const sort=$('priceSort').value;const list=catalog.filter(p=>p.name.includes(search)).sort((a,b)=>sort==='low'?a.salary-b.salary||a.id-b.id:sort==='high'?b.salary-a.salary||a.id-b.id:sort==='name'?a.name.localeCompare(b.name):a.id-b.id);
 $('pickerGuide').textContent='Editing '+selected+(lineup[selected]?' · '+name(lineup[selected])+' currently selected':' · Empty position')+' · '+list.length+' Pokémon found';
 $('pokemonChoices').replaceChildren(...list.map(p=>{
  const taken=used.has(p.id)&&lineup[selected]!==p.id;
  const tooExpensive=spent()-salary(lineup[selected])+p.salary>salaryCap;
  const btn=document.createElement('button');btn.type='button';btn.className='pokemon-choice'+(taken?' used':'')+(lineup[selected]===p.id?' chosen':'');btn.disabled=taken||tooExpensive;btn.title=taken?'Already assigned to another position':tooExpensive?'Over salary cap':p.name+' · $'+p.salary;
  const img=document.createElement('img');img.src=sprite(p.id);img.loading='lazy';img.alt='';
  const title=document.createElement('strong');title.textContent=p.name;
  const cost=document.createElement('small');cost.textContent='$'+p.salary;btn.append(img,title,cost);btn.onclick=()=>{lineup[selected]=p.id;const next=POS.find(pos=>!lineup[pos]);if(next)selected=next;persist();render();score()};return btn
 }))
}
function renderBreakdown(){ $('breakdown').replaceChildren(...POS.map(pos=>{const row=document.createElement('div');row.className='breakdown-row';row.textContent=pos+' · '+(lineup[pos]?name(lineup[pos])+' · $'+salary(lineup[pos]):'Open');return row})) }
function render(){renderField();renderChoices();renderBreakdown();const filled=POS.filter(p=>lineup[p]).length;$('statusText').textContent=filled+'/22 positions filled';const count=document.querySelector('.hero-number>strong');if(count)count.innerHTML=filled+'<span>/22</span>';budget()}
function persist(){try{sessionStorage.setItem('gridiron_draft_lineup',JSON.stringify({lineup,name:$('teamName').value}));}catch{}}
function score(){const filled=POS.filter(p=>lineup[p]).length;$('overall').textContent='—';$('offenseScore').textContent='—';$('defenseScore').textContent='—';$('statusText').textContent=filled+'/22 positions filled'}
async function init(){
 try{
  const response=await fetch('/api/catalog');if(!response.ok)throw Error('Could not load Pokémon');
  const data=await response.json();if(!data.ready)throw Error('Pokémon database is still loading. Please retry.');catalog=data.pokemon;salaryCap=data.salaryCap;
  // Preserve unsaved edits across temporary errors without embedding rosters in URLs.
  let draft=null;try{draft=JSON.parse(sessionStorage.getItem('gridiron_draft_lineup')||'null')}catch{}
  try{const me=await accountRequest('/api/my-team');if(me.team){const valid=new Set(catalog.map(p=>p.id)),seen=new Set();lineup={};for(const pos of POS){const id=Number(me.team.lineup[pos]);if(valid.has(id)&&!seen.has(id)){lineup[pos]=id;seen.add(id)}}$('teamName').value=me.team.name;message(seen.size===22?(spent()>salaryCap?'Your saved team is over the salary cap. Replace expensive Pokémon to save.':'Editing '+me.team.name+' — change any position, then save your changes.'):'Your saved team has missing or duplicate Pokémon. Fill the empty positions and save.')}else message('Build your first Dream Team: choose 22 Pokémon, then save.');if(draft?.lineup&&typeof draft.lineup==='object'){const valid=new Set(catalog.map(p=>p.id)),seen=new Set();for(const pos of POS){const id=Number(draft.lineup[pos]);if(valid.has(id)&&!seen.has(id)){lineup[pos]=id;seen.add(id)}else delete lineup[pos]}if(draft.name)$('teamName').value=draft.name;message('Restored your unsaved edits. Review the lineup and press Save My Team.')}}catch(e){if(/Log in/i.test(e.message)){location.replace('/account.html?next=/builder.html');return}message(e.message)}
  render();score();
 }catch(e){message('Unable to load: '+e.message)}
}
$('pokemonSearch').oninput=renderChoices;
$('priceSort').onchange=renderChoices;

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
  try{sessionStorage.removeItem('gridiron_draft_lineup')}catch{}
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