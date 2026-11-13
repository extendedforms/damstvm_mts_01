/* ZENITH CBT — login only. Approval is requested only after the candidate selects an exam. */
'use strict';
const msgEl=document.getElementById('msg');
const loginBtn=document.querySelector('.form > button');
function setMsg(message,ok=false){if(msgEl){msgEl.textContent=String(message||'');msgEl.style.color=ok?'#176b35':'#b42318';}}
function togglePassword(){const f=document.getElementById('pwd');if(f)f.type=f.type==='password'?'text':'password';}
function createDeviceSessionId(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID().replace(/-/g,'');const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
async function postLoginApi(payload){const url=String(window.API_URL||window.SCRIPT_URL||'').trim();if(!url)throw new Error('API_URL is missing. Check config.js.');const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store'});const t=await r.text();let d;try{d=JSON.parse(t);}catch(_){throw new Error('Invalid response from login server.');}if(!r.ok||d.ok===false)throw new Error(d.error||d.message||'Request failed');return d;}
async function login(){
  const fullName=String(document.getElementById('fullName')?.value||'').trim();
  const phone=String(document.getElementById('phone')?.value||'').trim();
  const email=String(document.getElementById('email')?.value||'').trim();
  const candidateId=String(document.getElementById('cid')?.value||'').trim();
  const password=String(document.getElementById('pwd')?.value||'').trim();
  if(!fullName||!phone||!email||!candidateId||!password){setMsg('Please fill in all fields.');return;}
  if(loginBtn)loginBtn.disabled=true;setMsg('Verifying candidate details…',true);
  try{
    const data=await postLoginApi({action:'login',name:fullName,phone,email,candidateId,password});
    if(!data.token)throw new Error('Login did not return a valid session.');
    const verifiedId=String(data.candidateId||candidateId).trim();
    if(verifiedId!==candidateId)throw new Error('Candidate ID returned by server does not match.');
    const session={token:String(data.token),candidateId:verifiedId,name:String(data.name||fullName),phone:String(data.phone||phone),email:String(data.email||email),deviceSessionId:createDeviceSessionId(),deviceType:/iPhone|iPad|iPod/i.test(navigator.userAgent)?'iOS':/Android/i.test(navigator.userAgent)?'Android':/Mobi/i.test(navigator.userAgent)?'Mobile':'Desktop',browserInfo:String(navigator.userAgent||'').slice(0,250)};
    sessionStorage.setItem('neet_candidate',JSON.stringify(session));
    sessionStorage.removeItem('neet_qr_challenge');
    sessionStorage.removeItem('neet_exam_approval_request');
    setMsg('Login successful. Choose the examination you want to attend.',true);
    location.replace('exam-selector.html?v=20261113_direct_approval_v2');
  }catch(e){setMsg(e&&e.message?e.message:'Login failed. Please try again.');if(loginBtn)loginBtn.disabled=false;}
}
window.login=login;window.togglePassword=togglePassword;
