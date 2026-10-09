(()=>{
'use strict';
const POS=['QB','RB','WR1','WR2','WR3','TE','LT','LG','C','RG','RT','DE1','DE2','DT1','DT2','LB1','LB2','LB3','CB1','CB2','FS','SS'];
const coords={FS:[40,7],SS:[60,7],CB1:[10,20],CB2:[90,20],LB1:[34,24],LB2:[50,24],LB3:[66,24],DE1:[23,37],DT1:[41,37],DT2:[59,37],DE2:[77,37],WR1:[8,59],WR2:[92,59],WR3:[18,75],TE:[79,59],LT:[31,59],LG:[40,59],C:[50,59],RG:[60,59],RT:[69,59],QB:[50,77],RB:[50,92]};
const $=id=>document.getElementById(id),sprite=id=>'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+id+'.png';
let catalog=[],records=[],lineup={},selected='QB',best=null;
const message=s=>$('builderMessage').textContent=s;
const cat=pos=>pos==='QB'?'QB':pos==='RB'?'RB':pos.startsWith('WR')?'WR':pos==='TE'?'TE':['LT','LG','C','RG','RT'].includes(pos)?'OL':pos.startsWith('DE')?'EDGE':pos.startsWith('DT')?'IDL':pos.startsWith('LB')?'EDGE':pos.startsWith('CB')?'CB':'S';
function fit(id,pos){const sc=records[id];if(!sc?.grade)return 0;const target=cat(pos),factor=sc.position===target?1:((sc.position==='CB'&&target==='S')||(sc.position==='S'&&target==='CB'))?.85:((sc.position==='EDGE'&&pos.startsWith('LB'))?.75:.65);return Math.round(sc.grade*factor)}
const name=id=>catalog.find(p=>p.id===id)?.name||'Pokémon #'+id;
function renderField(){
 const field=$('builderField');field.replaceChildren();
 for(const [text,cls] of [['DEFENSE','formation-defense-label'],['OFFENSE','formation-offense-label']]){const label=document.createElement('span');label.className='formation-label '+cls;label.textContent=text;field.append(label)}
 POS.forEach(pos=>{
  const id=lineup[pos],node=document.createElement('button');node.type='button';node.className='formation-player '+(id?'occupied':'vacant')+(pos===selected?' selected':'')+(POS.indexOf(pos)<11?' offense':' defense');node.style.left=coords[pos][0]+'%';node.style.top=coords[pos][1]+'%';node.title=pos+' — '+(id?name(id):'Choose Pokémon');node.onclick=()=>{selected=pos;render()};
  const img=document.createElement('img');img.className='formation-sprite';img.alt=id?name(id):'';if(id)img.src=sprite(id);
  const plate=document.createElement('span');plate.className='formation-nameplate';const title=document.createElement('strong');title.textContent=id?name(id):'SELECT';const role=document.createElement('small');role.textContent=pos;plate.append(title,role);node.append(img,plate);field.append(node)
 })
}
function renderChoices(){
 $('pickerTitle').textContent='Pick your '+selected;
 const search=$('pokemonSearch').value.trim().toLowerCase(),sort=$('sortMode').value,used=new Set(Object.values(lineup).map(Number));
 const list=catalog.filter(p=>p.name.includes(search)).sort((a,b)=>sort==='dex'?a.id-b.id:sort==='grade'?(records[b.id]?.grade||0)-(records[a.id]?.grade||0):fit(b.id,selected)-fit(a.id,selected)||a.id-b.id);
 $('pokemonChoices').replaceChildren(...list.map(p=>{
  const taken=used.has(p.id)&&lineup[selected]!==p.id;
  const btn=document.createElement('button');btn.className='pokemon-choice'+(taken?' used':'')+(best?.lineup?.[selected]===p.id?' best':'');btn.disabled=taken;btn.title=taken?'Already assigned to another position':p.name+' · '+(records[p.id]?.position||'Unscouted');
  const img=document.createElement('img');img.src=sprite(p.id);img.loading='lazy';img.alt='';
  const title=document.createElement('strong');title.textContent=p.name;
  const grade=document.createElement('small');grade.textContent=records[p.id]?.grade!=null?'Fit '+fit(p.id,selected)+' / Grade '+records[p.id].grade:'Not scouted';
  btn.append(img,title,grade);btn.onclick=()=>{lineup[selected]=p.id;const next=POS.find(pos=>!lineup[pos]);if(next)selected=next;persist();render();score()};return btn
 }))
}
function renderBreakdown(){
 $('breakdown').replaceChildren(...POS.map(pos=>{const row=document.createElement('div');row.className='breakdown-row';const left=document.createElement('span');left.textContent=pos+' · '+(lineup[pos]?name(lineup[pos]):'Open');const right=document.createElement('strong');right.textContent=lineup[pos]?fit(lineup[pos],pos)+'/100':'—';row.append(left,right);return row}))
}
function render(){renderField();renderChoices();renderBreakdown();$('statusText').textContent=Object.keys(lineup).length+'/22 positions filled'}
function persist(){const url=new URL(location.href);const encoded=POS.map(p=>lineup[p]||0).join('.');url.searchParams.set('team',encoded);history.replaceState({},'',url)}
async function score(){
 if(POS.some(p=>!lineup[p])){$('overall').textContent='—';$('offenseScore').textContent='—';$('defenseScore').textContent='—';return}
 try{const res=await fetch('/api/lineup-score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lineup})});const data=await res.json();if(!res.ok)throw Error(data.error);$('overall').textContent=data.overall;$('offenseScore').textContent=data.offense;$('defenseScore').textContent=data.defense;message('Complete lineup scored! '+(best?'Best possible: '+best.overall+'/100. ':'')+'Your score is an average scouting fit grade, not a win probability.')}catch(e){message(e.message)}
}
async function init(){
 try{
  const [catRes,scRes,bestRes]=await Promise.all([fetch('/api/catalog'),fetch('/api/scouting'),fetch('/api/best-lineup')]);
  if(!catRes.ok||!scRes.ok||!bestRes.ok)throw Error('Could not load lineup data');
  const c=await catRes.json(),sc=await scRes.json();best=await bestRes.json();catalog=c.pokemon;records=Object.fromEntries(sc.records.map(p=>[p.id,p]));
  const saved=new URL(location.href).searchParams.get('team');if(saved){const ids=saved.split('.').map(Number);if(ids.length===22&&ids.every(n=>Number.isInteger(n)&&n>=0&&n<=151)){const nonzero=ids.filter(Boolean);if(new Set(nonzero).size===nonzero.length)POS.forEach((p,i)=>{if(ids[i])lineup[p]=ids[i]})}}
  render();score();message('Scouting loaded: 150 graded Pokémon. Best possible complete lineup: '+best.overall+'/100.');
 }catch(e){message('Unable to load: '+e.message)}
}
$('pokemonSearch').oninput=renderChoices;$('sortMode').onchange=renderChoices;
$('autoBest').onclick=()=>{if(!best){message('Best team is still loading');return}lineup={...best.lineup};persist();render();score()};
$('clearTeam').onclick=()=>{lineup={};selected='QB';persist();render();score();message('Lineup cleared')};
$('shareTeam').onclick=async()=>{persist();try{await navigator.clipboard.writeText(location.href);message('Shareable lineup link copied!')}catch{message('Copy this URL to share: '+location.href)}};
$('challengeFriends').onclick=async()=>{
 const url=new URL('/builder.html',location.origin);
 try{await navigator.clipboard.writeText(url.href);message('Challenge link copied! Friends can build their own team, enter their name, and submit to the same leaderboard.')}
 catch{message('Send your friends this link: '+url.href)}
};
function submitFeedback(text,kind='info'){
 const node=$('submitFeedback');node.textContent=text;node.dataset.kind=kind;message(text);
}
async function refreshBoard(){
 try{
  const r=await fetch('/api/leaderboard');const data=await r.json();
  if(!r.ok)throw Error(data.error||'Could not load rankings');
  const list=$('leaderboardEntries');list.replaceChildren();
  if(!data.entries.length){list.textContent='No teams submitted yet. Be the first!';return}
  data.entries.forEach((entry,i)=>{
   const row=document.createElement('div');row.className='leaderboard-row';
   const rank=document.createElement('strong');rank.textContent='#'+(i+1);
   const title=document.createElement('span');title.textContent=entry.name;
   const grade=document.createElement('strong');grade.textContent=entry.score+'/100';
   const details=document.createElement('small');details.textContent='OFF '+entry.offense+' · DEF '+entry.defense;
   row.append(rank,title,details,grade);list.append(row)
  })
 }catch(e){$('leaderboardEntries').textContent='Leaderboard unavailable: '+e.message}
}
$('submitTeam').onclick=async()=>{
 const button=$('submitTeam');
 if(POS.some(p=>!lineup[p])){submitFeedback('Please fill all 22 positions before submitting. Use Auto-Build Best Team to test.','error');return}
 const name=$('teamName').value.trim();
 if(name.length<2){submitFeedback('Enter your name or team name (at least 2 characters).','error');$('teamName').focus();return}
 button.disabled=true;button.textContent='Submitting…';
 submitFeedback('Saving '+name+' to the community leaderboard…');
 try{
  const r=await fetch('/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,lineup})});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Submission failed (HTTP '+r.status+')');
  submitFeedback('✓ '+name+' submitted! Score: '+data.score+'/100 · Rank #'+data.rank,'success');
  await refreshBoard()
 }catch(e){submitFeedback('Submission failed: '+e.message,'error')}
 finally{button.disabled=false;button.textContent='Submit Lineup'}
};
$('refreshBoard').onclick=refreshBoard;
refreshBoard();
init();
})();