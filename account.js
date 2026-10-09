(()=>{
'use strict';
const $=id=>document.getElementById(id),form=$('authForm'),button=$('login'),input=$('username'),status=$('accountStatus');
let busy=false;
function feedback(text,error=false){status.textContent=text;status.classList.toggle('error',error)}
async function api(path,data){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(path,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:controller.signal});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'The server could not complete your request. Please try again.');
  return result;
 }catch(error){if(error.name==='AbortError')throw Error('The server took too long. Please try again.');throw error}
 finally{clearTimeout(timeout)}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const username=input.value.trim().toLowerCase();
 if(!/^[a-z0-9_]{3,24}$/.test(username)){feedback('Use 3–24 letters, numbers or underscores.',true);input.focus();return}
 busy=true;button.disabled=true;button.textContent='Opening your team…';feedback('Checking your username…');
 try{
  await api('/api/auth/guest',{username});
  const result=await api('/api/my-team');
  feedback(result.team?'Welcome back! Opening your saved Dream Team…':'Welcome! Opening your new Dream Team Builder…');
  location.replace(result.team?'/my-team.html':'/builder.html');
 }catch(error){feedback(error.message,true);busy=false;button.disabled=false;button.textContent='Continue →'}
});
input.addEventListener('input',()=>{if(!busy)feedback('Enter a username to get started.')});
})();