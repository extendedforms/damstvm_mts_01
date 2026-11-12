/* Candidate-scoped examination selection. The server registry is authoritative. */
'use strict';
(function(){
  const $=id=>document.getElementById(id);
  function readCandidate(){try{return JSON.parse(sessionStorage.getItem('neet_candidate')||'null');}catch(_){return null;}}
  const candidate=readCandidate();
  if(!candidate||!candidate.token||!candidate.deviceSessionId){location.replace('login.html');return;}
  $('candidate').textContent='Name: '+(candidate.name||'')+'  |  Candidate ID: '+candidate.candidateId;
  let exams=[];
  function say(message,bad){$('notice').textContent=message;$('notice').classList.toggle('error',!!bad);}
  async function api(payload){
    const response=await fetch(window.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store'});
    const raw=await response.text();let data;
    try{data=JSON.parse(raw);}catch(_){throw new Error('Invalid response from examination server.');}
    if(!response.ok||data.ok===false)throw new Error(data.error||data.message||'Request failed');
    return data;
  }
  function fmt(iso){const d=new Date(iso);return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(d)+' IST';}
  function render(){
    const list=$('examList');list.innerHTML='';
    if(!exams.length){say('No examinations are currently configured. Contact the administrator.',true);return;}
    exams.forEach(exam=>{
      const card=document.createElement('article');card.className='exam';
      const title=document.createElement('h2');title.textContent=exam.examName;card.appendChild(title);
      const status=document.createElement('div');status.className='status '+exam.status;status.textContent=exam.status;card.appendChild(status);
      const meta=document.createElement('div');meta.className='meta';
      meta.textContent='Access window: '+fmt(exam.startISO)+' to '+fmt(exam.endISO)+'\nDuration: '+exam.durationMin+' minutes\nQuestions: '+exam.questionCount+'\nAnswerKey gaps: '+(exam.missingAnswerCount||0)+'\nImages pending: '+(exam.missingImageCount||0);
      card.appendChild(meta);
      const button=document.createElement('button');button.type='button';button.textContent=(exam.missingAnswerCount||0)>0?'AnswerKey incomplete':((exam.missingImageCount||0)>0?'Images required before start':(exam.status==='upcoming'?'Select examination':'Continue to centre authorization'));
      button.disabled=!exam.selectable||exam.questionCount<1;
      button.addEventListener('click',()=>select(exam,button));card.appendChild(button);
      list.appendChild(card);
    });
    say('Select the correct examination. The question bank and answer key are isolated for each exam.',false);
  }
  async function select(exam,button){
    button.disabled=true;say('Preparing secure QR authorization…',false);
    try{
      candidate.examId=exam.examId;
      candidate.examWindowId=exam.examWindowId;
      candidate.examName=exam.examName;
      candidate.examStartISO=exam.startISO;
      candidate.examEndISO=exam.endISO;
      candidate.examDurationMin=exam.durationMin;
      sessionStorage.setItem('neet_candidate',JSON.stringify(candidate));
      const qr=await api({
        action:'createQrChallenge',
        token:candidate.token,
        candidateId:candidate.candidateId,
        examWindowId:exam.examWindowId,
        deviceSessionId:candidate.deviceSessionId,
        deviceType:candidate.deviceType||'unknown',
        browserInfo:candidate.browserInfo||navigator.userAgent
      });
      if(!qr.challenge)throw new Error('Server did not return a QR challenge.');
      sessionStorage.setItem('neet_qr_challenge',JSON.stringify(qr));
      location.replace('qr-wait.html?v=20261112_exams_v1');
    }catch(error){say(error.message||'Unable to select examination.',true);button.disabled=false;}
  }
  async function load(){
    try{
      const data=await api({action:'getAvailableExams',token:candidate.token,candidateId:candidate.candidateId});
      exams=(data.exams||[]);
      render();
    }catch(error){say(error.message||'Unable to load examinations.',true);}
  }
  $('logoutBtn').addEventListener('click',async()=>{
    try{await api({action:'cancelCandidateLogin',token:candidate.token,candidateId:candidate.candidateId});}catch(_){}
    sessionStorage.removeItem('neet_candidate');sessionStorage.removeItem('neet_qr_challenge');location.replace('login.html');
  });
  load();
})();
