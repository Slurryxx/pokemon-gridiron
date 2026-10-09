(()=>{'use strict';
const $=id=>document.getElementById(id),status=$('entryStatus'),login=$('loginLink'),menu=$('profileMenu'),toggle=$('profileToggle'),dropdown=$('profileDropdown'),logout=$('logoutButton'),label=$('accountLabel'),avatar=$('profileAvatar');
function closeMenu(){dropdown.hidden=true;toggle.setAttribute('aria-expanded','false')}
function showUser(username){const signedIn=Boolean(username);login.hidden=signedIn;menu.hidden=!signedIn;closeMenu();if(signedIn){label.textContent='@'+username;avatar.textContent=username[0].toUpperCase();status.textContent='Welcome back, '+username+'! Choose a game mode.'}else{status.textContent='Choose a game mode. Friendly Snake Draft requires no saved team.'}}
async function refresh(){try{const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('Session unavailable');const data=await response.json();showUser(data.user?.username||null)}catch{showUser(null);status.textContent='Account status unavailable. You can still play Friendly Draft.'}}
toggle.addEventListener('click',()=>{const opening=dropdown.hidden;dropdown.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening))});
document.addEventListener('click',event=>{if(!menu.contains(event.target))closeMenu()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();toggle.focus()}});
logout.addEventListener('click',async()=>{logout.disabled=true;try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});if(!response.ok)throw Error('Could not log out');await refresh()}catch{status.textContent='Could not log out. Please try again.'}finally{logout.disabled=false}});
refresh();window.addEventListener('pageshow',event=>{if(event.persisted)refresh()});
})();