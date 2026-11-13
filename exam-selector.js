/* Exam selector and direct admin approval polling. No QR or camera flow. */
'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const read=k=>{try{return JSON.parse(sessionStorage.getItem(k)||'null');}catch(_){return null;}};
  let candidate=read('neet_candidate');
  let exams=[];let selected=null;let requestId='';let pollTimer=null;let busy=false;
  let pollStartedAt=0;let pollCount=0;
  const cacheKey='neet_exam_approval_request';
  const INSTRUCTIONS_URL='instructions.html?v=20261114_fast_ui_v1';
  const DEFAULT_REQUEST_TEXT='Request Admin Approval';
  function say(id,text,error=false){const el=$(id);if(!el)return;el.textContent=text;el.classList.toggle('error',!!error);}
  function persist(){sessionStorage.setItem('neet_candidate',JSON.stringify(candidate));}
  function setButtonBusy(button,busy,label,defaultLabel){
    if(!button)return;
    button.disabled=!!busy;
    button.classList.toggle('is-loading',!!busy);
    button.setAttribute('aria-busy',String(!!busy));
    button.textContent=busy?label:defaultLabel;
  }
  async function api(action,extra={}){
    if(!candidate||!candidate.token)throw new Error('Candidate login session is missing. Please log in again.');
    const url=String(window.API_URL||window.SCRIPT_URL||'').trim();
    if(!url)throw new Error('API_URL is missing. Check config.js.');
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token:candidate.token,candidateId:candidate.candidateId,deviceSessionId:candidate.deviceSessionId,deviceType:candidate.deviceType||'unknown',browserInfo:candidate.browserInfo||navigator.userAgent,...extra}),cache:'no-store',redirect:'follow'});
    const t=await r.text();let d;try{d=JSON.parse(t);}catch(_){throw new Error('Invalid response from examination server.');}
    if(!r.ok||!d||d.ok===false)throw new Error(d.error||d.message||'Request failed');return d;
  }
  function formatTime(v){const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(d):'Not set';}
  function renderExams(){
    const box=$('examList');box.textContent='';
    if(!exams.length){box.textContent='No examination windows are currently configured.';return;}
    exams.forEach(x=>{
      const isSelected=!!(selected&&selected.examWindowId===x.examWindowId);
      const card=document.createElement('article');card.className='exam-card'+(isSelected?' selected':'');
      const tag=document.createElement('span');tag.className='tag '+(x.status||'');tag.textContent=(x.status||'unknown').toUpperCase();card.appendChild(tag);
      const title=document.createElement('h3');title.textContent=x.examName||x.examId||'Examination';card.appendChild(title);
      const meta=document.createElement('div');meta.className='meta';meta.textContent='Start: '+formatTime(x.startISO)+'\nEnd: '+formatTime(x.endISO)+'\nDuration: '+Number(x.durationMin||0)+' minutes\nQuestions: '+Number(x.questionCount||0);card.appendChild(meta);
      const btn=document.createElement('button');btn.type='button';btn.className='btn '+(isSelected?'':'secondary');btn.textContent=isSelected?'Selected ✓':'Select this exam';btn.disabled=!x.selectable||isSelected;btn.setAttribute('aria-pressed',String(isSelected));btn.addEventListener('click',()=>selectExam(x));card.appendChild(btn);
      if(!x.selectable){const note=document.createElement('p');note.className='muted';note.textContent=x.status==='closed'?'This examination window has closed. Use Previous Results to view a submitted result.':(x.missingAnswerCount?'Answer Key setup is incomplete.':x.missingImageCount?'Required question images are missing.':'This exam cannot currently be selected.');card.appendChild(note);}
      box.appendChild(card);
    });
  }
  function selectExam(x){
    stopPolling();requestId='';selected=x;candidate.examWindowId=x.examWindowId;
    candidate.selectedExam={examId:x.examId,examWindowId:x.examWindowId,examName:x.examName,startISO:x.startISO,endISO:x.endISO,durationMin:x.durationMin};persist();
    sessionStorage.removeItem(cacheKey);renderExams();
    $('selectedExamText').textContent='Selected: '+x.examName+' ('+x.examWindowId+'). Admin approval will apply only to this exam.';
    $('requestApprovalBtn').disabled=false;$('requestApprovalBtn').textContent=DEFAULT_REQUEST_TEXT;$('requestApprovalBtn').classList.remove('is-loading');
    say('approvalStatus','');say('selectorStatus','Selected '+x.examName+'. Request approval when you are ready.');
  }
  async function loadExams(){
    say('selectorStatus','Loading examination windows from the server…');$('requestApprovalBtn').disabled=true;
    try{
      const d=await api('getAvailableExams');exams=Array.isArray(d.exams)?d.exams:[];
      const wanted=candidate.examWindowId||'';selected=exams.find(x=>x.examWindowId===wanted&&x.selectable)||null;
      if(selected){candidate.selectedExam={examId:selected.examId,examWindowId:selected.examWindowId,examName:selected.examName,startISO:selected.startISO,endISO:selected.endISO,durationMin:selected.durationMin};persist();$('selectedExamText').textContent='Selected: '+selected.examName+' ('+selected.examWindowId+').';$('requestApprovalBtn').disabled=!!requestId;$('requestApprovalBtn').textContent=requestId?'Waiting for approval…':DEFAULT_REQUEST_TEXT;}
      else{$('selectedExamText').textContent='Select an examination above to continue.';candidate.examWindowId='';candidate.selectedExam=null;persist();}
      renderExams();say('selectorStatus',exams.length+' exam window(s) retrieved. Choose the exam you intend to attend.');
    }catch(e){say('selectorStatus',e.message,true);throw e;}
  }
  function stopPolling(){if(pollTimer)clearTimeout(pollTimer);pollTimer=null;}
  function scheduleNextPoll(){
    if(!requestId||!selected)return;
    const elapsed=Date.now()-pollStartedAt;
    const delay=elapsed<60000?2000:elapsed<180000?3500:5000;
    pollTimer=setTimeout(pollApproval,delay);
  }
  async function pollApproval(){
    if(busy||!requestId||!selected)return;
    busy=true;
    try{
      const d=await api('pollExamApproval',{requestId,examWindowId:selected.examWindowId});pollCount++;
      if(d.approved&&d.accessToken){
        candidate.accessToken=d.accessToken;candidate.accessId=d.accessId;candidate.centreId=d.centreId;candidate.examWindowId=d.examWindowId;candidate.authorizedAtISO=d.authorizedAtISO;
        candidate.selectedExam={examId:selected.examId,examWindowId:selected.examWindowId,examName:selected.examName,startISO:selected.startISO,endISO:selected.endISO,durationMin:selected.durationMin};
        persist();sessionStorage.removeItem(cacheKey);stopPolling();say('approvalStatus','Approved for '+selected.examName+'. Opening examination instructions…');location.replace(INSTRUCTIONS_URL);return;
      }
      if(['rejected','expired','superseded','cancelled'].includes(d.requestStatus)){
        stopPolling();sessionStorage.removeItem(cacheKey);requestId='';say('approvalStatus',d.message||('Request status: '+d.requestStatus+'. You may request again or contact the administrator.'),true);$('requestApprovalBtn').disabled=false;$('requestApprovalBtn').textContent=DEFAULT_REQUEST_TEXT;return;
      }
      say('approvalStatus',d.message||'Waiting for administrator approval for '+selected.examName+'.');
    }catch(e){say('approvalStatus',e.message,true);}
    finally{busy=false;}
    scheduleNextPoll();
  }
  async function requestApproval(){
    if(busy)return;
    if(!selected||!selected.selectable){say('approvalStatus','Select an available examination first.',true);return;}
    setButtonBusy($('requestApprovalBtn'),true,'Sending request…',DEFAULT_REQUEST_TEXT);stopPolling();busy=true;requestId='';
    let shouldPoll=false;let redirected=false;
    try{
      if(candidate.accessToken&&candidate.examWindowId===selected.examWindowId){
        try{const access=await api('checkExamAccess',{examWindowId:selected.examWindowId,accessToken:candidate.accessToken});if(access.authorized){redirected=true;location.replace(INSTRUCTIONS_URL);return;}}
        catch(_){candidate.accessToken='';candidate.accessId='';persist();}
      }
      const d=await api('requestExamApproval',{examWindowId:selected.examWindowId});
      requestId=d.requestId;sessionStorage.setItem(cacheKey,JSON.stringify({requestId,examWindowId:selected.examWindowId}));
      say('approvalStatus',d.message||'Approval request submitted. Waiting for administrator.');
      if(d.requestStatus==='approved'&&d.accessToken){candidate.accessToken=d.accessToken;candidate.accessId=d.accessId;candidate.centreId=d.centreId;candidate.examWindowId=selected.examWindowId;persist();sessionStorage.removeItem(cacheKey);redirected=true;location.replace(INSTRUCTIONS_URL);return;}
      pollStartedAt=Date.now();pollCount=0;shouldPoll=true;
    }catch(e){say('approvalStatus',e.message,true);requestId='';}
    finally{busy=false;if(!redirected){$('requestApprovalBtn').classList.remove('is-loading');$('requestApprovalBtn').removeAttribute('aria-busy');$('requestApprovalBtn').disabled=shouldPoll;$('requestApprovalBtn').textContent=shouldPoll?'Waiting for approval…':DEFAULT_REQUEST_TEXT;}}
    if(shouldPoll)pollApproval();
  }
  async function logout(){
    if(busy)return;
    const button=$('logoutBtn');setButtonBusy(button,true,'Logging out…','Logout');stopPolling();
    try{await api('cancelCandidateLogin');}catch(_){}
    sessionStorage.removeItem('neet_candidate');sessionStorage.removeItem(cacheKey);location.replace('login.html?v='+Date.now());
  }
  async function refreshExams(){
    const button=$('refreshExamsBtn');if(button.disabled)return;
    setButtonBusy(button,true,'Refreshing…','Refresh Examinations');stopPolling();
    try{await loadExams();if(requestId&&selected){say('approvalStatus','Restoring your pending administrator approval check…');pollApproval();}}
    catch(e){/* loadExams already displays the error */}
    finally{button.classList.remove('is-loading');button.removeAttribute('aria-busy');button.disabled=false;button.textContent='Refresh Examinations';}
  }
  async function resumePending(){
    const saved=read(cacheKey);if(!saved||!saved.requestId||!saved.examWindowId)return;
    const ex=exams.find(x=>x.examWindowId===saved.examWindowId);if(!ex)return;
    selected=ex;requestId=saved.requestId;candidate.examWindowId=ex.examWindowId;
    candidate.selectedExam={examId:ex.examId,examWindowId:ex.examWindowId,examName:ex.examName,startISO:ex.startISO,endISO:ex.endISO,durationMin:ex.durationMin};persist();renderExams();
    $('selectedExamText').textContent='Selected: '+ex.examName+' ('+ex.examWindowId+'). Admin approval applies only to this exam.';
    $('requestApprovalBtn').disabled=true;$('requestApprovalBtn').textContent='Waiting for approval…';say('approvalStatus','Restoring your pending admin approval request…');
    pollStartedAt=Date.now();pollCount=0;pollApproval();
  }
  if(!candidate||!candidate.token||!candidate.deviceSessionId){location.replace('login.html');return;}
  $('candidateLine').textContent='Candidate: '+(candidate.name||'')+' | ID: '+candidate.candidateId+' | Email: '+(candidate.email||'');
  $('requestApprovalBtn').addEventListener('click',requestApproval);
  $('refreshExamsBtn').addEventListener('click',refreshExams);
  $('logoutBtn').addEventListener('click',logout);
  window.addEventListener('focus',()=>{if(requestId&&!busy){stopPolling();pollApproval();}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&requestId&&!busy){stopPolling();pollApproval();}});
  loadExams().then(resumePending).catch(()=>{});
  window.addEventListener('pagehide',stopPolling);
})();
