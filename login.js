/* ZENITH CBT — candidate login. Approval is requested only after exam selection. */
'use strict';
const msgEl=document.getElementById('msg');
const loginBtn=document.getElementById('loginBtn')||document.querySelector('.form > button');
const DEVICE_STORAGE_PREFIX='zenith_cbt_device_session_v2_';
const LEGACY_DEVICE_STORAGE_KEY='zenith_cbt_device_session_v1';
let loginInProgress=false;
function setMsg(message,ok=false){if(msgEl){msgEl.textContent=String(message||'');msgEl.style.color=ok?'#176b35':'#b42318';}}
function togglePassword(){
  const field=document.getElementById('pwd');
  const button=document.getElementById('passwordToggle');
  if(!field)return;
  const show=field.type==='password';
  field.type=show?'text':'password';
  if(button){button.classList.toggle('is-toggled',show);button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Hide password':'Show password');}
}
function validDeviceId(value){return /^[A-Za-z0-9_-]{16,100}$/.test(String(value||''));}
function createDeviceSessionId(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID().replace(/-/g,'');
  if(!window.crypto||!crypto.getRandomValues)throw new Error('Secure device session creation is unavailable in this browser. Update your browser and try again.');
  const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);
  return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
function candidateDeviceStorageKey(candidateId){
  return DEVICE_STORAGE_PREFIX+encodeURIComponent(String(candidateId||'').trim());
}
function readStoredCandidateSession(){
  try{return JSON.parse(sessionStorage.getItem('neet_candidate')||'null');}catch(_){return null;}
}
function migrateCurrentTabDeviceId(){
  // Preserve the old browser-wide ID for the candidate already logged in on
  // this tab before another candidate starts using the shared centre tablet.
  const oldSession=readStoredCandidateSession();
  if(!oldSession||!oldSession.candidateId||!validDeviceId(oldSession.deviceSessionId))return;
  const key=candidateDeviceStorageKey(oldSession.candidateId);
  if(!localStorage.getItem(key))localStorage.setItem(key,String(oldSession.deviceSessionId));
}
function getCandidateDeviceSession(candidateId){
  try{
    migrateCurrentTabDeviceId();
    const key=candidateDeviceStorageKey(candidateId);
    let id=localStorage.getItem(key)||'';
    if(!validDeviceId(id)){
      const activeSession=readStoredCandidateSession();
      if(activeSession&&String(activeSession.candidateId||'').trim()===String(candidateId).trim()&&validDeviceId(activeSession.deviceSessionId)){
        id=String(activeSession.deviceSessionId);
      }
    }
    if(validDeviceId(id)){
      localStorage.setItem(key,id);
      if(localStorage.getItem(key)!==id)throw new Error('Browser storage could not retain this candidate session.');
      return {id,legacy:false};
    }

    // One-time compatibility path: try the former browser-wide identifier.
    // The server decides whether it belongs to this candidate. If it belongs
    // to someone else, login retries with a newly generated candidate-scoped ID.
    const legacy=localStorage.getItem(LEGACY_DEVICE_STORAGE_KEY)||'';
    if(validDeviceId(legacy))return {id:legacy,legacy:true};

    id=createDeviceSessionId();
    localStorage.setItem(key,id);
    if(localStorage.getItem(key)!==id)throw new Error('Browser storage could not retain this candidate session.');
    return {id,legacy:false};
  }catch(error){
    if(error&&/Browser storage/.test(error.message||''))throw error;
    throw new Error('This browser cannot save its secure device identifier. Enable site storage for this website and try again.');
  }
}
async function postLoginApi(payload){
  const url=String(window.API_URL||window.SCRIPT_URL||'').trim();
  if(!url)throw new Error('API_URL is missing. Check config.js.');
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store',redirect:'follow'});
  const raw=await response.text();let data;
  try{data=JSON.parse(raw);}catch(_){throw new Error('Invalid response from login server.');}
  if(!response.ok||!data||data.ok===false){const e=new Error(data&&(data.error||data.message)||'Request failed');e.code=data&&data.code||'';throw e;}
  return data;
}
function setLoginBusy(busy){
  if(!loginBtn)return;
  loginBtn.disabled=!!busy;
  loginBtn.classList.toggle('is-loading',!!busy);
  loginBtn.setAttribute('aria-busy',String(!!busy));
  loginBtn.textContent=busy?'Verifying candidate…':'LOGIN';
}
async function login(){
  if(loginInProgress)return;
  const fullName=String(document.getElementById('fullName')?.value||'').trim();
  const phone=String(document.getElementById('phone')?.value||'').trim();
  const email=String(document.getElementById('email')?.value||'').trim();
  const candidateId=String(document.getElementById('cid')?.value||'').trim();
  const password=String(document.getElementById('pwd')?.value||'').trim();
  if(!fullName||!phone||!email||!candidateId||!password){setMsg('Please fill in all fields.');return;}
  loginInProgress=true;setLoginBusy(true);setMsg('Verifying candidate details…',true);
  try{
    const deviceType=/iPhone|iPad|iPod/i.test(navigator.userAgent)?'iOS':/Android/i.test(navigator.userAgent)?'Android':/Mobi/i.test(navigator.userAgent)?'Mobile':'Desktop';
    const browserInfo=String(navigator.userAgent||'').slice(0,250);
    const stored=getCandidateDeviceSession(candidateId);
    let deviceSessionId=stored.id;
    const payload={action:'login',name:fullName,phone,email,candidateId,password,deviceSessionId,deviceType,browserInfo};
    let data;
    try{
      data=await postLoginApi(payload);
    }catch(firstError){
      if(!stored.legacy||firstError.code!=='DEVICE_SESSION_OWNED_BY_OTHER_CANDIDATE')throw firstError;
      // The old global key belonged to another candidate on this shared tablet.
      // Retry with a unique ID scoped to the candidate; no existing session is revoked.
      deviceSessionId=createDeviceSessionId();
      localStorage.setItem(candidateDeviceStorageKey(candidateId),deviceSessionId);
      if(localStorage.getItem(candidateDeviceStorageKey(candidateId))!==deviceSessionId)throw new Error('Browser storage could not retain this candidate session.');
      payload.deviceSessionId=deviceSessionId;
      data=await postLoginApi(payload);
    }
    if(!data.token)throw new Error('Login did not return a valid session.');
    const verifiedId=String(data.candidateId||candidateId).trim();
    if(verifiedId!==candidateId)throw new Error('Candidate ID returned by server does not match.');
    // Persist successful legacy IDs under this candidate's own key.
    localStorage.setItem(candidateDeviceStorageKey(candidateId),deviceSessionId);
    const session={token:String(data.token),candidateId:verifiedId,name:String(data.name||fullName),phone:String(data.phone||phone),email:String(data.email||email),deviceSessionId,deviceType,browserInfo};
    if (!window.ZenithTabSession || typeof window.ZenithTabSession.ensure !== 'function') throw new Error('Tab security helper is missing. Refresh the page.');
    await window.ZenithTabSession.ensure(session);
    sessionStorage.setItem('neet_candidate',JSON.stringify(session));
    sessionStorage.removeItem('neet_qr_challenge');
    sessionStorage.removeItem('neet_exam_approval_request');
    setMsg(data.resumed?'Original browser session restored. Continue your examination.':'Login successful. Choose the examination you want to attend.',true);
    location.replace('exam-selector.html?v=20261114_candidate_scoped_device_v2');
  }catch(error){
    setMsg(error&&error.message?error.message:'Login failed. Please try again.');
    loginInProgress=false;setLoginBusy(false);
  }
}
window.login=login;window.togglePassword=togglePassword;
