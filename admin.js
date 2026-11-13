/*
 * DAMS CBT admin console.
 * Every admin API call is authenticated by the server-side admin token.
 * Drive permission actions are exam-window scoped and re-validated server-side.
 */
'use strict';
(function(){
const $=id=>document.getElementById(id);
let adminToken=localStorage.getItem('centre_admin_token')||'';
let answerCandidates=[];

async function api(action,extra={}){
  const r=await fetch(window.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...extra}),cache:'no-store'});
  const t=await r.text();let d;try{d=JSON.parse(t);}catch(_){throw new Error('Invalid server response');}
  if(!r.ok||d.ok===false)throw new Error(d.error||'Request failed');return d;
}
function message(id,t,error=false){$(id).textContent=t;$(id).classList.toggle('error',!!error);}
function currentExamWindowId(){return $('answerExamSelect').value||'';}
function showDashboard(){ $('loginPanel').style.display='none';$('dashboard').style.display='block';refreshAll();}

async function login(){
  $('loginBtn').disabled=true;
  try{
    const d=await api('adminLogin',{username:$('adminUser').value.trim(),password:$('adminPass').value});
    adminToken=d.adminToken;localStorage.setItem('centre_admin_token',adminToken);
    message('loginMsg','Admin authenticated. Server session expiry: 8 hours.');showDashboard();
  }catch(e){message('loginMsg',e.message,true);}finally{$('loginBtn').disabled=false;}
}

async function refreshPending(){
  const d=await api('adminGetPendingCandidates',{adminToken});
  $('pendingBody').innerHTML='';
  (d.pending||[]).forEach(x=>{
    const tr=document.createElement('tr');
    [x.name+' ('+x.candidateId+')',x.email,x.examName+'\n'+x.examWindowId,x.deviceType+'\n'+x.browserInfo,x.createdAtISO,x.expiresAtISO].forEach(v=>{
      const td=document.createElement('td');td.textContent=v||'-';tr.appendChild(td);
    });
    const actionTd=document.createElement('td');
    const approveBtn=document.createElement('button');approveBtn.className='success';approveBtn.textContent='Approve';
    approveBtn.addEventListener('click',async()=>{
      if(!confirm('Approve '+x.name+' ('+x.candidateId+') for '+x.examName+' only?'))return;
      approveBtn.disabled=true;rejectBtn.disabled=true;
      try{await api('adminApproveExamRequest',{adminToken,requestId:x.requestId});message('actionMsg','Approved '+x.candidateId+' for '+x.examName+'.');await refreshAll();}
      catch(e){message('actionMsg',e.message,true);approveBtn.disabled=false;rejectBtn.disabled=false;}
    });
    const rejectBtn=document.createElement('button');rejectBtn.className='danger';rejectBtn.textContent='Reject';
    rejectBtn.addEventListener('click',async()=>{
      if(!confirm('Reject '+x.candidateId+' for '+x.examName+'?'))return;
      approveBtn.disabled=true;rejectBtn.disabled=true;
      try{await api('adminRejectExamRequest',{adminToken,requestId:x.requestId});message('actionMsg','Rejected '+x.candidateId+' request for '+x.examName+'.');await refreshPending();}
      catch(e){message('actionMsg',e.message,true);approveBtn.disabled=false;rejectBtn.disabled=false;}
    });
    actionTd.appendChild(approveBtn);actionTd.appendChild(document.createTextNode(' '));actionTd.appendChild(rejectBtn);tr.appendChild(actionTd);
    $('pendingBody').appendChild(tr);
  });
  if(!d.pending||!d.pending.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=7;td.textContent='No pending exam approval requests.';tr.appendChild(td);$('pendingBody').appendChild(tr);}
}
async function refreshSessions(){
  const d=await api('adminListAccess',{adminToken});$('sessionsBody').innerHTML='';
  (d.sessions||[]).forEach(x=>{
    const tr=document.createElement('tr');
    [x.name+' ('+x.candidateId+')',x.centreId,x.authorizedAtISO,x.lastSeenISO].forEach(v=>{const td=document.createElement('td');td.textContent=v||'-';tr.appendChild(td);});
    const td=document.createElement('td');const b=document.createElement('button');b.className='danger';b.textContent='Revoke';
    b.addEventListener('click',async()=>{if(!confirm('Revoke centre authorization for '+x.candidateId+'?'))return;try{await api('adminRevokeAccess',{adminToken,accessId:x.accessId,reason:'Revoked from admin dashboard'});await refreshAll();message('actionMsg','Authorization revoked.');}catch(e){message('actionMsg',e.message,true);}});
    td.appendChild(b);tr.appendChild(td);$('sessionsBody').appendChild(tr);
  });
  if(!d.sessions||!d.sessions.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=5;td.textContent='No active authorizations.';tr.appendChild(td);$('sessionsBody').appendChild(tr);}
}
async function refreshAudit(){
  const d=await api('adminGetAudit',{adminToken});$('auditBody').innerHTML='';
  (d.events||[]).forEach(x=>{const tr=document.createElement('tr');[x.timestampISO,x.candidateId,x.eventType,x.adminId,x.details].forEach(v=>{const td=document.createElement('td');td.textContent=v||'-';tr.appendChild(td);});$('auditBody').appendChild(tr);});
}
async function refreshAll(){try{await Promise.all([refreshPending(),refreshSessions(),refreshAudit(),refreshAnswerKeyExams()]);}catch(e){message('actionMsg',e.message,true);}}

// ---------------- Answer Key Drive permissions ----------------
async function refreshAnswerKeyExams(keepSelection=true){
  const previous=currentExamWindowId();
  const d=await api('adminGetAnswerKeyExams',{adminToken});
  const sel=$('answerExamSelect');sel.innerHTML='';
  (d.exams||[]).forEach(x=>{const o=document.createElement('option');o.value=x.examWindowId;o.textContent=x.examName+' — '+(x.closed?'Closed':'Not closed')+' — '+x.eligibleCount+' eligible';o.dataset.fileId=x.driveFileId||'';o.dataset.fileName=x.fileName||'';sel.appendChild(o);});
  if(keepSelection&&previous&&Array.from(sel.options).some(o=>o.value===previous))sel.value=previous;
  await refreshAnswerKeyCandidates();
}
async function refreshAnswerKeyCandidates(){
  const examWindowId=currentExamWindowId();$('answerKeyCandidatesBody').innerHTML='';answerCandidates=[];
  $('selectAllAnswerCandidates').checked=false;
  if(!examWindowId){message('answerKeyInfo','No exam windows are configured.',true);return;}
  try{
    const d=await api('adminGetAnswerKeyCandidates',{adminToken,examWindowId});
    const option=$('answerExamSelect').selectedOptions[0];
    $('answerKeyFileId').value=d.driveFileId||window.DEFAULT_ANSWER_KEY_DRIVE_URL||'';
    let info='Exam: '+(d.examName||examWindowId)+'\nOfficial end: '+(d.endISO||'not configured')+'\n';
    info+=d.closed?'Status: CLOSED — eligible submitted candidates can receive access.':'Status: NOT CLOSED — Drive grants are disabled until the official end time.';
    info+='\nAnswer Key PDF: '+(d.fileConfigured?(d.fileName+' (configured)'):'Not configured. Enter a private PDF Drive file ID/URL and save it.');
    message('answerKeyInfo',info);
    answerCandidates=d.candidates||[];
    answerCandidates.forEach(c=>{
      const tr=document.createElement('tr');
      const tdCheck=document.createElement('td');const cb=document.createElement('input');cb.type='checkbox';cb.className='answer-candidate-check check';cb.value=c.candidateId;cb.disabled=!d.closed||!d.fileConfigured||['GRANTED','EXTERNAL'].includes(c.grantStatus);tdCheck.appendChild(cb);tr.appendChild(tdCheck);
      [c.name+' ('+c.candidateId+')',c.email,String(c.score),c.submittedAtISO].forEach(v=>{const td=document.createElement('td');td.textContent=v||'-';tr.appendChild(td);});
      const statusTd=document.createElement('td');statusTd.textContent=c.grantStatus||'NOT_GRANTED';statusTd.className='status '+(c.grantStatus||'NOT_GRANTED');tr.appendChild(statusTd);
      const actionTd=document.createElement('td');
      if(c.grantStatus==='GRANTED'){
        const b=document.createElement('button');b.className='danger';b.textContent='Revoke';b.addEventListener('click',()=>revokeAnswerKey(c.candidateId));actionTd.appendChild(b);
      }else if(c.grantStatus==='EXTERNAL'){
        actionTd.textContent='Manage in Drive';
      }else{
        const b=document.createElement('button');b.textContent='Grant';b.disabled=!d.closed||!d.fileConfigured||c.grantStatus==='OLD_FILE';b.addEventListener('click',()=>grantAnswerKey(c.candidateId));actionTd.appendChild(b);
      }
      tr.appendChild(actionTd);$('answerKeyCandidatesBody').appendChild(tr);
    });
    if(!answerCandidates.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=7;td.textContent=d.closed?'No eligible submitted candidates with a valid registered email.':'No candidates are listed until this exam window closes.';tr.appendChild(td);$('answerKeyCandidatesBody').appendChild(tr);}
    if(option&&option.dataset.fileId&&!d.driveFileId)$('answerKeyFileId').value=option.dataset.fileId;
  }catch(e){message('answerKeyInfo',e.message,true);}
}
async function saveAnswerKeyFile(){
  const examWindowId=currentExamWindowId();const driveFileId=$('answerKeyFileId').value.trim();
  if(!examWindowId||!driveFileId){message('answerKeyActionMsg','Select an exam and enter its private PDF Drive file ID/URL.',true);return;}
  $('saveAnswerKeyFileBtn').disabled=true;
  try{const d=await api('adminSetAnswerKeyFile',{adminToken,examWindowId,driveFileId});message('answerKeyActionMsg','Configured Answer Key PDF: '+d.fileName);await refreshAnswerKeyExams();}
  catch(e){message('answerKeyActionMsg',e.message,true);}finally{$('saveAnswerKeyFileBtn').disabled=false;}
}
async function grantAnswerKey(candidateId){
  const examWindowId=currentExamWindowId();if(!examWindowId)return;
  try{const d=await api('adminGrantAnswerKeyAccess',{adminToken,examWindowId,candidateId});message('answerKeyActionMsg','Candidate '+candidateId+': '+d.result.status+'. Google Drive viewer notification is enabled.');await refreshAnswerKeyCandidates();}
  catch(e){message('answerKeyActionMsg',e.message,true);}
}
async function grantSelectedAnswerKeys(){
  const examWindowId=currentExamWindowId();
  const ids=Array.from(document.querySelectorAll('.answer-candidate-check:checked')).map(x=>x.value);
  if(!examWindowId||!ids.length){message('answerKeyActionMsg','Select at least one eligible candidate.',true);return;}
  if(!confirm('Grant Google Drive viewer permission to '+ids.length+' selected candidate(s) for this exam only?'))return;
  $('bulkGrantAnswerKeyBtn').disabled=true;let total={granted:0,alreadyGranted:0,failed:0};
  try{
    for(let i=0;i<ids.length;i+=25){
      const batch=ids.slice(i,i+25);
      const d=await api('adminBulkGrantAnswerKeyAccess',{adminToken,examWindowId,candidateIds:batch});
      total.granted+=Number(d.summary.granted||0);total.alreadyGranted+=Number(d.summary.alreadyGranted||0);total.failed+=Number(d.summary.failed||0);
      message('answerKeyActionMsg','Processing '+Math.min(i+batch.length,ids.length)+' / '+ids.length+'… Granted: '+total.granted+'; already shared: '+total.alreadyGranted+'; failed: '+total.failed+'.');
    }
    message('answerKeyActionMsg','Bulk grant complete. Granted: '+total.granted+'; already shared: '+total.alreadyGranted+'; failed: '+total.failed+'.');
    await refreshAnswerKeyCandidates();
  }catch(e){message('answerKeyActionMsg','Bulk grant stopped: '+e.message,true);}
  finally{$('bulkGrantAnswerKeyBtn').disabled=false;}
}
async function revokeAnswerKey(candidateId){
  const examWindowId=currentExamWindowId();if(!confirm('Revoke this candidate’s managed Google Drive Answer Key permission for this exam?'))return;
  try{await api('adminRevokeAnswerKeyAccess',{adminToken,examWindowId,candidateId});message('answerKeyActionMsg','Drive permission revoked for '+candidateId+'.');await refreshAnswerKeyCandidates();}
  catch(e){message('answerKeyActionMsg',e.message,true);}
}

$('loginBtn').addEventListener('click',login);
$('refreshBtn').addEventListener('click',refreshAll);
$('answerExamSelect').addEventListener('change',refreshAnswerKeyCandidates);$('refreshAnswerKeyBtn').addEventListener('click',refreshAnswerKeyCandidates);
$('saveAnswerKeyFileBtn').addEventListener('click',saveAnswerKeyFile);$('bulkGrantAnswerKeyBtn').addEventListener('click',grantSelectedAnswerKeys);
$('selectAllAnswerCandidates').addEventListener('change',e=>document.querySelectorAll('.answer-candidate-check:not(:disabled)').forEach(x=>x.checked=e.target.checked));
$('logoutAdmin').addEventListener('click',()=>{localStorage.removeItem('centre_admin_token');location.reload();});
if(adminToken){api('adminGetPendingCandidates',{adminToken}).then(()=>showDashboard()).catch(()=>{localStorage.removeItem('centre_admin_token');adminToken='';});}
})();
