(()=>{'use strict';
const $=id=>document.getElementById(id);
const status=$('entryStatus'),label=$('accountLabel'),link=$('accountLink'),profile=$('profileLink'),logout=$('logoutButton');
async function refresh(){
 try{
  const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('Session unavailable');
  const data=await response.json();
  const username=data.user?.username;
  if(username){
   label.textContent='@'+username+' · Logged in';
   link.href='/profile.html';
   link.classList.add('signed-in');
   profile.hidden=false;logout.hidden=false;
   status.textContent='Welcome back, '+username+'! Choose a game mode.';
  }else{
   label.textContent='Log in / Sign up';link.href='/account.html';
   link.classList.remove('signed-in');profile.hidden=true;logout.hidden=true;
   status.textContent='Choose a game mode. Friendly Snake Draft requires no saved team.';
  }
 }catch{
  label.textContent='Log in / Sign up';link.href='/account.html';
  profile.hidden=true;logout.hidden=true;
  status.textContent='Choose a game mode. Sign in to access your saved Dream Team.';
 }
}
logout.addEventListener('click',async()=>{
 logout.disabled=true;
 try{
  const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  if(!response.ok)throw Error('Log out failed');
  await refresh();
 }catch{status.textContent='Could not log out. Please try again.'}
 finally{logout.disabled=false}
});
refresh();
window.addEventListener('pageshow',event=>{if(event.persisted)refresh()});
})();