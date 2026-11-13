/* Exam selector and direct admin approval polling. No QR or camera flow. */
'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const read=k=>{try{return JSON.parse(sessionStorage.getItem(k)||'null');}catch(_){return null;}};
  let candidate=read('neet_candidate');
  let exams=[];let selected=null;let requestId='';let pollTimer=null;let busy=false;
  const cacheKey='neet_exam_approval_request';
  function say(id,text,error=false){const el=$(id);el.textContent=text;el.classList.toggle('error',!!error);}
  function persist(){sessionStorage.setItem('neet_candidate',JSON.stringify(candidate));}
  async function api(action,extra={}){
    if(!candidate||!candidate.token)throw new Error('Candidate login session is missing. Please log in again.');
    const r=await fetch(window.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token:candidate.token,candidateId:candidate.candidateId,deviceSessionId:candidate.deviceSessionId,deviceType:candidate.deviceType||'unknown',browserInfo:candidate.browserInfo||navigator.userAgent,...extra}),cache:'no-store'});
    const t=await r.text();let d;try{d=JSON.parse(t);}catch(_){throw new Error('Invalid response from examination server.');}
    if(!r.ok||!d||d.ok===false)throw new Error(d.error||d.message||'Request failed');return d;
  }
  function formatTime(v){const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(d):'Not set';}
  function renderExams(){const box=$('examList');box.innerHTML='';if(!exams.length){box.textContent='No examination windows are currently configured.';return;}
    exams.forEach(x=>{
      const card=document.createElement('article');card.className='exam-card'+(selected&&selected.examWindowId===x.examWindowId?' selected':'');
      const tag=document.createElement('span');tag.className='tag '+(x.status||'');tag.textContent=(x.status||'unknown').toUpperCase();card.appendChild(tag);
      const title=document.createElement('h3');title.textContent=x.examName||x.examId||'Examination';card.appendChild(title);
      const meta=document.createElement('div');meta.className='meta';meta.textContent='Start: '+formatTime(x.startISO)+'\nEnd: '+formatTime(x.endISO)+'\nDuration: '+Number(x.durationMin||0)+' minutes\nQuestions: '+Number(x.questionCount||0);card.appendChild(meta);
      const btn=document.createElement('button');btn.className='btn '+(selected&&selected.examWindowId===x.examWindowId?'':'secondary');btn.textContent=selected&&selected.examWindowId===x.examWindowId?'Selected':'Select this exam';btn.disabled=!x.selectable;btn.addEventListener('click',()=>selectExam(x));card.appendChild(btn);
      if(!x.selectable){const note=document.createElement('p');note.className='muted';note.textContent=x.status==='closed'?'This examination window has closed. Use Previous Results to view a submitted result.':(x.missingAnswerCount?'Answer Key setup is incomplete.':x.missingImageCount?'Required question images are missing.':'This exam cannot currently be selected.');card.appendChild(note);}
      box.appendChild(card);
    });
  }
  function selectExam(x){selected=x;candidate.examWindowId=x.examWindowId;candidate.selectedExam={examId:x.examId,examWindowId:x.examWindowId,examName:x.examName,startISO:x.startISO,endISO:x.endISO,durationMin:x.durationMin};persist();renderExams();$('selectedExamText').textContent='Selected: '+x.examName+' ('+x.examWindowId+'). Admin approval will apply only to this exam.';$('requestApprovalBtn').disabled=false;say('selectorStatus','Selected '+x.examName+'. Request approval when you are ready.',false);}
  async function loadExams(){say('selectorStatus','Loading examination windows from the server…');$('requestApprovalBtn').disabled=true;try{const d=await api('getAvailableExams');exams=Array.isArray(d.exams)?d.exams:[];const wanted=candidate.examWindowId||'';selected=exams.find(x=>x.examWindowId===wanted&&x.selectable)||null;if(selected){candidate.selectedExam={examId:selected.examId,examWindowId:selected.examWindowId,examName:selected.examName,startISO:selected.startISO,endISO:selected.endISO,durationMin:selected.durationMin};persist();$('selectedExamText').textContent='Selected: '+selected.examName+' ('+selected.examWindowId+').';$('requestApprovalBtn').disabled=false;}else{$('selectedExamText').textContent='Select an examination above to continue.';candidate.examWindowId='';candidate.selectedExam=null;persist();}renderExams();say('selectorStatus',exams.length+' exam window(s) retrieved. Choose the exam you intend to attend.');}catch(e){say('selectorStatus',e.message,true);}}
  function stopPolling(){if(pollTimer)clearInterval(pollTimer);pollTimer=null;}
  async function pollApproval(){if(busy||!requestId||!selected)return;busy=true;try{const d=await api('pollExamApproval',{requestId,examWindowId:selected.examWindowId});
      if(d.approved&&d.accessToken){candidate.accessToken=d.accessToken;candidate.accessId=d.accessId;candidate.centreId=d.centreId;candidate.examWindowId=d.examWindowId;candidate.authorizedAtISO=d.authorizedAtISO;candidate.selectedExam={examId:selected.examId,examWindowId:selected.examWindowId,examName:selected.examName,startISO:selected.startISO,endISO:selected.endISO,durationMin:selected.durationMin};persist();sessionStorage.removeItem(cacheKey);stopPolling();say('approvalStatus','Approved for '+selected.examName+'. Opening examination instructions…');location.replace('instructions.html?v=20261113_direct_approval_v2');return;}
      if(['rejected','expired','superseded','cancelled'].includes(d.requestStatus)){stopPolling();sessionStorage.removeItem(cacheKey);say('approvalStatus',d.message||('Request status: '+d.requestStatus+'. You may request again or contact the administrator.'),true);return;}
      say('approvalStatus',d.message||'Waiting for administrator approval for '+selected.examName+'.');
    }catch(e){say('approvalStatus',e.message,true);}finally{busy=false;}}
  async function requestApproval(){if(!selected||!selected.selectable){say('approvalStatus','Select an available examination first.',true);return;}$('requestApprovalBtn').disabled=true;stopPolling();busy=true;
    try{
      if(candidate.accessToken&&candidate.examWindowId===selected.examWindowId){try{const access=await api('checkExamAccess',{examWindowId:selected.examWindowId,accessToken:candidate.accessToken});if(access.authorized){location.replace('instructions.html?v=20261113_direct_approval_v2');return;}}catch(_){candidate.accessToken='';candidate.accessId='';}}
      const d=await api('requestExamApproval',{examWindowId:selected.examWindowId});requestId=d.requestId;sessionStorage.setItem(cacheKey,JSON.stringify({requestId,examWindowId:selected.examWindowId}));say('approvalStatus',d.message||'Approval request submitted. Waiting for administrator.');
      if(d.requestStatus==='approved'&&d.accessToken){candidate.accessToken=d.accessToken;candidate.accessId=d.accessId;candidate.centreId=d.centreId;persist();location.replace('instructions.html?v=20261113_direct_approval_v2');return;}
      pollTimer=setInterval(pollApproval,3000);pollApproval();
    }catch(e){say('approvalStatus',e.message,true);$('requestApprovalBtn').disabled=false;}finally{busy=false;}}
  async function logout(){stopPolling();try{await api('cancelCandidateLogin');}catch(_){}sessionStorage.removeItem('neet_candidate');sessionStorage.removeItem(cacheKey);location.replace('login.html?v='+Date.now());}
  async function resumePending(){const saved=read(cacheKey);if(!saved||!saved.requestId||!saved.examWindowId)return;const ex=exams.find(x=>x.examWindowId===saved.examWindowId);if(!ex)return;selectExam(ex);requestId=saved.requestId;say('approvalStatus','Restoring your pending admin approval request…');pollTimer=setInterval(pollApproval,3000);pollApproval();}
  if(!candidate||!candidate.token||!candidate.deviceSessionId){location.replace('login.html');return;}
  $('candidateLine').textContent='Candidate: '+(candidate.name||'')+' | ID: '+candidate.candidateId+' | Email: '+(candidate.email||'');
  $('requestApprovalBtn').addEventListener('click',requestApproval);$('refreshExamsBtn').addEventListener('click',async()=>{stopPolling();await loadExams();});$('logoutBtn').addEventListener('click',logout);
  loadExams().then(resumePending);
  window.addEventListener('pagehide',stopPolling);
})();
