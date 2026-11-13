/*
 * DAMS CBT admin console.
 * Every admin API call is authenticated by the server-side admin token.
 * Drive permission actions are exam-window scoped and re-validated server-side.
 *
 * Important Answer Key rule:
 * The PDF field displays ONLY the file configured by the backend for the
 * currently selected examWindowId. No global/default PDF URL is ever used.
 */
'use strict';
(function(){
const $=id=>document.getElementById(id);
let adminToken=localStorage.getItem('centre_admin_token')||'';
let answerCandidates=[];
let pendingRefreshTimer=null;
let pendingRefreshBusy=false;
let examCloseTimer=null;
let dashboardActive=false;
let rankRows=[];
let answerKeyLoadSequence=0;

async function api(action,extra={}){
  if(!window.API_URL)throw new Error('API_URL is missing from config.js.');
  const r=await fetch(window.API_URL,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action,...extra}),
    cache:'no-store'
  });
  const t=await r.text();
  let d;
  try{d=JSON.parse(t);}catch(_){throw new Error('Invalid server response');}
  if(!r.ok||d.ok===false)throw new Error(d.error||d.message||'Request failed');
  return d;
}

function message(id,t,error=false){
  const el=$(id);
  if(!el)return;
  el.textContent=String(t??'');
  el.classList.toggle('error',!!error);
}

function currentExamWindowId(){
  return $('answerExamSelect')?.value||'';
}

function setButtonBusy(button,busy,label){
  if(!button)return;
  if(busy){
    if(!button.dataset.originalText)button.dataset.originalText=button.textContent;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    if(label)button.textContent=label;
  }else{
    button.disabled=false;
    button.removeAttribute('aria-busy');
    if(button.dataset.originalText){
      button.textContent=button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

/*
 * Show dashboard and start pending-request polling immediately.
 * Do not wait for the other dashboard sections to finish loading.
 */
function showDashboard(){
  $('loginPanel').style.display='none';
  $('dashboard').style.display='block';
  dashboardActive=true;
  startPendingAutoRefresh();
  startExamCloseWatcher();
  refreshAll();
}

function stopPendingAutoRefresh(){
  if(pendingRefreshTimer)clearInterval(pendingRefreshTimer);
  pendingRefreshTimer=null;
}

function startPendingAutoRefresh(){
  stopPendingAutoRefresh();
  if(!dashboardActive)return;

  pendingRefreshTimer=setInterval(()=>{
    if(document.visibilityState==='visible'){
      refreshPending().catch(e=>message('actionMsg',e.message,true));
    }
  },2500);

  refreshPending().catch(e=>message('actionMsg',e.message,true));
}

function stopExamCloseWatcher(){
  if(examCloseTimer)clearInterval(examCloseTimer);
  examCloseTimer=null;
}

function startExamCloseWatcher(){
  stopExamCloseWatcher();
  examCloseTimer=setInterval(()=>{
    if(!dashboardActive||document.visibilityState!=='visible')return;
    const newlyClosed=Array.from($('rankExamSelect').options).filter(option=>{
      const endMs=Date.parse(option.dataset.endISO||'');
      return option.disabled&&Number.isFinite(endMs)&&endMs>0&&endMs<=Date.now();
    }).sort((a,b)=>Date.parse(a.dataset.endISO)-Date.parse(b.dataset.endISO));

    if(!newlyClosed.length)return;
    $('rankExamSelect').value=newlyClosed[newlyClosed.length-1].value;
    refreshAnswerKeyExams().catch(e=>message('rankInfo',e.message,true));
  },15000);
}

async function login(){
  const button=$('loginBtn');
  setButtonBusy(button,true,'Signing in…');
  try{
    const d=await api('adminLogin',{
      username:$('adminUser').value.trim(),
      password:$('adminPass').value
    });
    if(!d.adminToken)throw new Error('The server did not return an admin session token.');
    adminToken=d.adminToken;
    localStorage.setItem('centre_admin_token',adminToken);
    message('loginMsg','Admin authenticated. Server session expiry: 8 hours.');
    showDashboard();
  }catch(e){
    message('loginMsg',e.message,true);
  }finally{
    setButtonBusy(button,false);
  }
}

async function refreshPending(){
  if(pendingRefreshBusy||!dashboardActive)return;
  pendingRefreshBusy=true;
  try{
    const d=await api('adminGetPendingCandidates',{adminToken});
    $('pendingBody').innerHTML='';

    (d.pending||[]).forEach(x=>{
      const tr=document.createElement('tr');
      [
        x.name+' ('+x.candidateId+')',
        x.email,
        x.examName+'\n'+x.examWindowId,
        x.deviceType+'\n'+x.browserInfo,
        x.createdAtISO,
        x.expiresAtISO
      ].forEach(v=>{
        const td=document.createElement('td');
        td.textContent=v||'-';
        tr.appendChild(td);
      });

      const actionTd=document.createElement('td');
      const approveBtn=document.createElement('button');
      approveBtn.className='success';
      approveBtn.textContent='Approve';
      const rejectBtn=document.createElement('button');
      rejectBtn.className='danger';
      rejectBtn.textContent='Reject';

      approveBtn.addEventListener('click',async()=>{
        if(!confirm('Approve '+x.name+' ('+x.candidateId+') for '+x.examName+' only?'))return;
        approveBtn.disabled=true;
        rejectBtn.disabled=true;
        approveBtn.textContent='Approving…';
        approveBtn.setAttribute('aria-busy','true');
        try{
          await api('adminApproveExamRequest',{adminToken,requestId:x.requestId});
          message('actionMsg','Approved '+x.candidateId+' for '+x.examName+'. Candidate will receive approval automatically.');
          await refreshPending();
        }catch(e){
          message('actionMsg',e.message,true);
          approveBtn.disabled=false;
          rejectBtn.disabled=false;
          approveBtn.textContent='Approve';
          rejectBtn.textContent='Reject';
          approveBtn.removeAttribute('aria-busy');
        }
      });

      rejectBtn.addEventListener('click',async()=>{
        if(!confirm('Reject '+x.candidateId+' for '+x.examName+'?'))return;
        approveBtn.disabled=true;
        rejectBtn.disabled=true;
        rejectBtn.textContent='Rejecting…';
        rejectBtn.setAttribute('aria-busy','true');
        try{
          await api('adminRejectExamRequest',{adminToken,requestId:x.requestId});
          message('actionMsg','Rejected '+x.candidateId+' request for '+x.examName+'.');
          await refreshPending();
        }catch(e){
          message('actionMsg',e.message,true);
          approveBtn.disabled=false;
          rejectBtn.disabled=false;
          rejectBtn.textContent='Reject';
          rejectBtn.removeAttribute('aria-busy');
        }
      });

      actionTd.appendChild(approveBtn);
      actionTd.appendChild(document.createTextNode(' '));
      actionTd.appendChild(rejectBtn);
      tr.appendChild(actionTd);
      $('pendingBody').appendChild(tr);
    });

    if(!d.pending||!d.pending.length){
      const tr=document.createElement('tr');
      const td=document.createElement('td');
      td.colSpan=7;
      td.textContent='No pending exam approval requests.';
      tr.appendChild(td);
      $('pendingBody').appendChild(tr);
    }
  }finally{
    pendingRefreshBusy=false;
  }
}

async function refreshSessions(){
  const d=await api('adminListAccess',{adminToken});
  $('sessionsBody').innerHTML='';
  (d.sessions||[]).forEach(x=>{
    const tr=document.createElement('tr');
    [x.name+' ('+x.candidateId+')',x.centreId,x.authorizedAtISO,x.lastSeenISO].forEach(v=>{
      const td=document.createElement('td');
      td.textContent=v||'-';
      tr.appendChild(td);
    });
    const td=document.createElement('td');
    const b=document.createElement('button');
    b.className='danger';
    b.textContent='Revoke';
    b.addEventListener('click',async()=>{
      if(!confirm('Revoke centre authorization for '+x.candidateId+'?'))return;
      setButtonBusy(b,true,'Revoking…');
      try{
        await api('adminRevokeAccess',{
          adminToken,accessId:x.accessId,reason:'Revoked from admin dashboard'
        });
        await refreshAll();
        message('actionMsg','Authorization revoked.');
      }catch(e){
        message('actionMsg',e.message,true);
        setButtonBusy(b,false);
      }
    });
    td.appendChild(b);
    tr.appendChild(td);
    $('sessionsBody').appendChild(tr);
  });
  if(!d.sessions||!d.sessions.length){
    const tr=document.createElement('tr');
    const td=document.createElement('td');
    td.colSpan=5;
    td.textContent='No active authorizations.';
    tr.appendChild(td);
    $('sessionsBody').appendChild(tr);
  }
}

async function refreshAudit(){
  const d=await api('adminGetAudit',{adminToken});
  $('auditBody').innerHTML='';
  (d.events||[]).forEach(x=>{
    const tr=document.createElement('tr');
    [x.timestampISO,x.candidateId,x.eventType,x.adminId,x.details].forEach(v=>{
      const td=document.createElement('td');
      td.textContent=v||'-';
      tr.appendChild(td);
    });
    $('auditBody').appendChild(tr);
  });
}

async function refreshAll(){
  try{
    await Promise.all([refreshSessions(),refreshAudit(),refreshAnswerKeyExams()]);
  }catch(e){
    message('actionMsg',e.message,true);
  }
}

function formatRankTime(seconds){
  const n=Number(seconds);
  if(!Number.isFinite(n)||n<0)return '-';
  const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=Math.floor(n%60);
  return h?h+'h '+m+'m '+s+'s':(m?m+'m '+s+'s':s+'s');
}

function formatRankDate(value){
  if(!value)return '-';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
}

function signedNumber(value,suffix=''){
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';
  const n=Number(value);
  return (n>0?'+':'')+n+suffix;
}

function renderRankRows(){
  const body=$('rankBody');
  if(!body)return;
  body.innerHTML='';
  const query=String($('rankSearchInput').value||'').trim().toLowerCase();
  const rows=rankRows.filter(x=>
    !query||
    String(x.candidateId||'').toLowerCase().includes(query)||
    String(x.name||'').toLowerCase().includes(query)
  );
  if(!rows.length){
    const tr=document.createElement('tr');
    const td=document.createElement('td');
    td.colSpan=14;
    td.textContent=rankRows.length?'No candidate matches this search.':'No submitted results are available for this exam.';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }
  rows.forEach(x=>{
    const tr=document.createElement('tr');
    const rank=document.createElement('td');
    rank.textContent=x.rank;
    rank.className='rank-highlight';
    tr.appendChild(rank);
    const candidate=document.createElement('td');
    candidate.textContent=(x.name||'Candidate')+' ('+x.candidateId+')';
    tr.appendChild(candidate);
    const values=[
      String(x.score),String(x.correct),String(x.wrong),String(x.unattempted),
      Number(x.accuracy||0).toFixed(1)+'%',formatRankTime(x.timeTakenSec),
      x.previousScore===null||x.previousScore===undefined?'—':String(x.previousScore),
      signedNumber(x.scoreChange),
      x.scoreChangePercent===null||x.scoreChangePercent===undefined?'—':signedNumber(x.scoreChangePercent,'%'),
      x.previousRank===null||x.previousRank===undefined?'—':String(x.previousRank),
      signedNumber(x.rankChange),formatRankDate(x.submittedAtISO)
    ];
    values.forEach((value,index)=>{
      const td=document.createElement('td');
      td.textContent=value;
      if(index===7&&x.scoreChange!==null&&x.scoreChange!==undefined)
        td.className='rank-change '+(x.scoreChange>0?'up':x.scoreChange<0?'down':'same');
      if(index===8&&x.scoreChangePercent!==null&&x.scoreChangePercent!==undefined)
        td.className='rank-change '+(x.scoreChangePercent>0?'up':x.scoreChangePercent<0?'down':'same');
      if(index===10&&x.rankChange!==null&&x.rankChange!==undefined)
        td.className='rank-change '+(x.rankChange>0?'up':x.rankChange<0?'down':'same');
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function downloadRankCsv(){
  if(!rankRows.length){message('rankInfo','There is no rank list to export.',true);return;}
  const headers=[
    'Rank','Candidate ID','Candidate Name','Score','Correct','Wrong','Unattempted',
    'Accuracy %','Time Taken (sec)','Previous Exam Score','Score Change',
    'Score Change %','Previous Rank','Rank Change','Submitted At'
  ];
  const values=rankRows.map(x=>[
    x.rank,x.candidateId,x.name,x.score,x.correct,x.wrong,x.unattempted,x.accuracy,
    x.timeTakenSec,x.previousScore,x.scoreChange,x.scoreChangePercent,
    x.previousRank,x.rankChange,x.submittedAtISO
  ]);
  const quote=value=>'"'+String(value===null||value===undefined?'':value).replace(/"/g,'""')+'"';
  const csv='\uFEFF'+[headers,...values].map(row=>row.map(quote).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  const exam=String($('rankExamSelect').selectedOptions[0]?.textContent||'Exam').replace(/[^A-Za-z0-9_-]+/g,'_');
  anchor.href=url;
  anchor.download='DAMS_CBT_Rank_'+exam+'.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  message('rankInfo','CSV exported with all '+rankRows.length+' ranked candidates.');
}

async function refreshExamRankList(){
  const examWindowId=$('rankExamSelect').value||'';
  rankRows=[];
  $('rankBody').innerHTML='';
  $('downloadRankCsvBtn').disabled=true;
  if(!examWindowId){
    message('rankInfo','Select a closed exam window to prepare its overall rank list.',true);
    renderRankRows();
    return;
  }
  const button=$('rankRefreshBtn');
  const old=button.textContent;
  button.disabled=true;
  button.textContent='Preparing…';
  button.setAttribute('aria-busy','true');
  message('rankInfo','Preparing the overall rank list from submitted results…');
  try{
    const d=await api('adminGetExamRankList',{adminToken,examWindowId});
    // Ignore a late response if the admin selected a different exam meanwhile.
    if($('rankExamSelect').value!==examWindowId)return;
    rankRows=d.rankings||[];
    $('downloadRankCsvBtn').disabled=!rankRows.length;
    let info='Exam: '+d.examName+'\nSubmitted candidates ranked: '+d.totalSubmitted;
    if(d.previousExamName)
      info+='\nProgress comparison: '+d.previousExamName+' → '+d.examName+'. Candidates without a submission in the previous exam show “—”.';
    else
      info+='\nNo earlier configured exam window is available for comparison.';
    info+='\nTie-break: '+d.tieBreakRule+'\nPositive score/rank change = improvement; negative = decline.';
    message('rankInfo',info);
    renderRankRows();
  }catch(e){
    if($('rankExamSelect').value!==examWindowId)return;
    $('downloadRankCsvBtn').disabled=true;
    message('rankInfo',e.message,true);
    const tr=document.createElement('tr');
    const td=document.createElement('td');
    td.colSpan=14;
    td.textContent='Rank list is not available.';
    tr.appendChild(td);
    $('rankBody').appendChild(tr);
  }finally{
    button.disabled=false;
    button.textContent=old;
    button.removeAttribute('aria-busy');
  }
}

// ---------------- Answer Key Drive permissions ----------------

async function refreshAnswerKeyExams(keepSelection=true){
  const previous=currentExamWindowId();
  const previousRank=$('rankExamSelect').value||'';
  const d=await api('adminGetAnswerKeyExams',{adminToken});
  if(!dashboardActive)return;
  const exams=d.exams||[];
  const sel=$('answerExamSelect');
  sel.innerHTML='';

  exams.forEach(x=>{
    const o=document.createElement('option');
    o.value=x.examWindowId;
    o.textContent=x.examName+' — '+(x.closed?'Closed':'Not closed')+' — '+x.eligibleCount+' eligible';
    o.dataset.fileId=x.driveFileId||'';
    o.dataset.fileName=x.fileName||'';
    sel.appendChild(o);
  });
  if(keepSelection&&previous&&Array.from(sel.options).some(o=>o.value===previous))
    sel.value=previous;
  else if(sel.options.length)
    sel.selectedIndex=0;

  const rankSel=$('rankExamSelect');
  rankSel.innerHTML='';
  exams.forEach(x=>{
    const o=document.createElement('option');
    o.value=x.examWindowId;
    o.textContent=x.examName+' — '+(x.closed?'Closed':'Available after exam end');
    o.dataset.endISO=x.endISO||'';
    o.disabled=!x.closed;
    rankSel.appendChild(o);
  });
  if(previousRank&&Array.from(rankSel.options).some(o=>o.value===previousRank&&!o.disabled))
    rankSel.value=previousRank;
  else{
    const closed=exams.filter(x=>x.closed).sort((a,b)=>Date.parse(a.endISO||0)-Date.parse(b.endISO||0));
    rankSel.value=closed.length?closed[closed.length-1].examWindowId:'';
  }

  if(!exams.length){
    const a=document.createElement('option');
    a.value='';a.textContent='No exam windows configured';sel.appendChild(a);
    const r=document.createElement('option');
    r.value='';r.textContent='No exam windows configured';rankSel.appendChild(r);
  }

  await Promise.all([
    refreshAnswerKeyCandidates(),
    rankSel.value?refreshExamRankList():Promise.resolve()
  ]);
  if(!rankSel.value){
    rankRows=[];
    $('downloadRankCsvBtn').disabled=true;
    renderRankRows();
    message('rankInfo','No exam has closed yet. The overall rank list will appear after the official end time.');
  }
}

async function refreshAnswerKeyCandidates(){
  const examWindowId=currentExamWindowId();
  const thisLoad=++answerKeyLoadSequence;

  $('answerKeyCandidatesBody').innerHTML='';
  answerCandidates=[];
  $('selectAllAnswerCandidates').checked=false;

  // Clear immediately. Never leave the previous exam's PDF visible while the
  // new exam's configuration is being fetched.
  $('answerKeyFileId').value='';

  if(!examWindowId){
    message('answerKeyInfo','No exam windows are configured.',true);
    return;
  }

  message('answerKeyInfo','Loading Answer Key configuration for the selected exam…');

  try{
    const d=await api('adminGetAnswerKeyCandidates',{adminToken,examWindowId});

    // A slower response from the previously selected exam must not overwrite
    // the currently selected exam's PDF URL or candidate list.
    if(thisLoad!==answerKeyLoadSequence||currentExamWindowId()!==examWindowId)return;

    // CRITICAL: only use the PDF returned for this exact examWindowId.
    // Do not fall back to DEFAULT_ANSWER_KEY_DRIVE_URL or option.dataset.fileId.
    $('answerKeyFileId').value=d.driveFileId||'';

    let info='Exam: '+(d.examName||examWindowId)+
      '\nOfficial end: '+(d.endISO||'not configured')+'\n';
    info+=d.closed
      ?'Status: CLOSED — eligible submitted candidates can receive access.'
      :'Status: NOT CLOSED — Drive grants are disabled until the official end time.';
    info+='\nAnswer Key PDF: '+
      (d.fileConfigured
        ?(d.fileName||'PDF configured')+' (configured)'
        :'Not configured for this exam. Enter its private PDF Drive file ID/URL and save it.');
    message('answerKeyInfo',info);

    answerCandidates=d.candidates||[];
    answerCandidates.forEach(c=>{
      const tr=document.createElement('tr');
      const tdCheck=document.createElement('td');
      const cb=document.createElement('input');
      cb.type='checkbox';
      cb.className='answer-candidate-check check';
      cb.value=c.candidateId;
      cb.disabled=!d.closed||!d.fileConfigured||['GRANTED','EXTERNAL'].includes(c.grantStatus);
      tdCheck.appendChild(cb);
      tr.appendChild(tdCheck);

      [c.name+' ('+c.candidateId+')',c.email,String(c.score),c.submittedAtISO].forEach(v=>{
        const td=document.createElement('td');
        td.textContent=v||'-';
        tr.appendChild(td);
      });

      const statusTd=document.createElement('td');
      statusTd.textContent=c.grantStatus||'NOT_GRANTED';
      statusTd.className='status '+(c.grantStatus||'NOT_GRANTED');
      tr.appendChild(statusTd);

      const actionTd=document.createElement('td');
      if(c.grantStatus==='GRANTED'){
        const b=document.createElement('button');
        b.className='danger';
        b.textContent='Revoke';
        b.addEventListener('click',async()=>{
          setButtonBusy(b,true,'Revoking…');
          await revokeAnswerKey(c.candidateId);
          if(b.isConnected)setButtonBusy(b,false);
        });
        actionTd.appendChild(b);
      }else if(c.grantStatus==='EXTERNAL'){
        actionTd.textContent='Manage in Drive';
      }else{
        const b=document.createElement('button');
        b.textContent='Grant';
        b.disabled=!d.closed||!d.fileConfigured||c.grantStatus==='OLD_FILE';
        b.addEventListener('click',async()=>{
          setButtonBusy(b,true,'Granting…');
          await grantAnswerKey(c.candidateId);
          if(b.isConnected)setButtonBusy(b,false);
        });
        actionTd.appendChild(b);
      }
      tr.appendChild(actionTd);
      $('answerKeyCandidatesBody').appendChild(tr);
    });

    if(!answerCandidates.length){
      const tr=document.createElement('tr');
      const td=document.createElement('td');
      td.colSpan=7;
      td.textContent=d.closed
        ?'No eligible submitted candidates with a valid registered email.'
        :'No candidates are listed until this exam window closes.';
      tr.appendChild(td);
      $('answerKeyCandidatesBody').appendChild(tr);
    }
  }catch(e){
    if(thisLoad===answerKeyLoadSequence&&currentExamWindowId()===examWindowId)
      message('answerKeyInfo',e.message,true);
  }
}

async function saveAnswerKeyFile(){
  const examWindowId=currentExamWindowId();
  const driveFileId=$('answerKeyFileId').value.trim();
  if(!examWindowId||!driveFileId){
    message('answerKeyActionMsg','Select an exam and enter its own private PDF Drive file ID/URL.',true);
    return;
  }
  const button=$('saveAnswerKeyFileBtn');
  setButtonBusy(button,true,'Saving PDF…');
  try{
    const d=await api('adminSetAnswerKeyFile',{adminToken,examWindowId,driveFileId});
    message('answerKeyActionMsg','Configured Answer Key PDF for this exam: '+(d.fileName||'Saved successfully')+'.');
    await refreshAnswerKeyExams(true);
  }catch(e){
    message('answerKeyActionMsg',e.message,true);
  }finally{
    setButtonBusy(button,false);
  }
}

async function grantAnswerKey(candidateId){
  const examWindowId=currentExamWindowId();
  if(!examWindowId)return;
  try{
    const d=await api('adminGrantAnswerKeyAccess',{adminToken,examWindowId,candidateId});
    message('answerKeyActionMsg','Candidate '+candidateId+': '+d.result.status+'. Google Drive viewer notification is enabled.');
    await refreshAnswerKeyCandidates();
  }catch(e){
    message('answerKeyActionMsg',e.message,true);
  }
}

async function grantSelectedAnswerKeys(){
  const examWindowId=currentExamWindowId();
  const ids=Array.from(document.querySelectorAll('.answer-candidate-check:checked')).map(x=>x.value);
  if(!examWindowId||!ids.length){
    message('answerKeyActionMsg','Select at least one eligible candidate.',true);
    return;
  }
  if(!confirm('Grant Google Drive viewer permission to '+ids.length+' selected candidate(s) for this exam only?'))return;

  const button=$('bulkGrantAnswerKeyBtn');
  setButtonBusy(button,true,'Granting…');
  let total={granted:0,alreadyGranted:0,failed:0};
  try{
    for(let i=0;i<ids.length;i+=25){
      const batch=ids.slice(i,i+25);
      const d=await api('adminBulkGrantAnswerKeyAccess',{adminToken,examWindowId,candidateIds:batch});
      total.granted+=Number(d.summary?.granted||0);
      total.alreadyGranted+=Number(d.summary?.alreadyGranted||0);
      total.failed+=Number(d.summary?.failed||0);
      message(
        'answerKeyActionMsg',
        'Processing '+Math.min(i+batch.length,ids.length)+' / '+ids.length+
        '… Granted: '+total.granted+
        '; already shared: '+total.alreadyGranted+
        '; failed: '+total.failed+'.'
      );
    }
    message(
      'answerKeyActionMsg',
      'Bulk grant complete. Granted: '+total.granted+
      '; already shared: '+total.alreadyGranted+
      '; failed: '+total.failed+'.'
    );
    await refreshAnswerKeyCandidates();
  }catch(e){
    message('answerKeyActionMsg','Bulk grant stopped: '+e.message,true);
  }finally{
    setButtonBusy(button,false);
  }
}

async function revokeAnswerKey(candidateId){
  const examWindowId=currentExamWindowId();
  if(!examWindowId)return;
  if(!confirm('Revoke this candidate’s managed Google Drive Answer Key permission for this exam?'))return;
  try{
    await api('adminRevokeAnswerKeyAccess',{adminToken,examWindowId,candidateId});
    message('answerKeyActionMsg','Drive permission revoked for '+candidateId+'.');
    await refreshAnswerKeyCandidates();
  }catch(e){
    message('answerKeyActionMsg',e.message,true);
  }
}

// ---------------- Event listeners ----------------

$('loginBtn').addEventListener('click',login);

$('refreshBtn').addEventListener('click',async()=>{
  const b=$('refreshBtn');
  const old=b.textContent;
  b.disabled=true;b.setAttribute('aria-busy','true');b.textContent='Refreshing…';
  try{await Promise.all([refreshAll(),refreshPending()]);}
  finally{b.disabled=false;b.removeAttribute('aria-busy');b.textContent=old;}
});

$('answerExamSelect').addEventListener('change',()=>{
  // Immediately clear the previous exam's file before fetching the new exam.
  $('answerKeyFileId').value='';
  refreshAnswerKeyCandidates();
});
$('rankExamSelect').addEventListener('change',refreshExamRankList);
$('rankRefreshBtn').addEventListener('click',refreshExamRankList);
$('downloadRankCsvBtn').addEventListener('click',downloadRankCsv);
$('rankSearchInput').addEventListener('input',renderRankRows);
$('refreshAnswerKeyBtn').addEventListener('click',refreshAnswerKeyCandidates);
$('saveAnswerKeyFileBtn').addEventListener('click',saveAnswerKeyFile);
$('bulkGrantAnswerKeyBtn').addEventListener('click',grantSelectedAnswerKeys);

$('selectAllAnswerCandidates').addEventListener('change',e=>{
  document.querySelectorAll('.answer-candidate-check:not(:disabled)').forEach(x=>x.checked=e.target.checked);
});

$('logoutAdmin').addEventListener('click',()=>{
  dashboardActive=false;
  stopPendingAutoRefresh();
  stopExamCloseWatcher();
  localStorage.removeItem('centre_admin_token');
  location.reload();
});

// Every button receives a visible press animation, including dynamically
// generated Approve / Reject / Grant / Revoke controls.
document.addEventListener('click',e=>{
  const button=e.target&&e.target.closest?e.target.closest('button'):null;
  if(!button||button.disabled)return;
  button.classList.remove('feedback');
  void button.offsetWidth;
  button.classList.add('feedback');
  window.setTimeout(()=>button.classList.remove('feedback'),220);
},true);

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&dashboardActive){
    refreshPending().catch(e=>message('actionMsg',e.message,true));
  }
});

window.addEventListener('pagehide',()=>{
  stopPendingAutoRefresh();
  stopExamCloseWatcher();
});

// Restore an existing admin session, if the server accepts its token.
if(adminToken){
  api('adminGetPendingCandidates',{adminToken})
    .then(()=>showDashboard())
    .catch(()=>{
      localStorage.removeItem('centre_admin_token');
      adminToken='';
    });
}
})();
