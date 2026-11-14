/* ZENITH NEET CBT — Result page frontend
 * Replace the existing result.js with this file.
 * Uses the existing result.html element IDs and Code.gs action contracts.
 * The server remains authoritative; no AnswerKey is sent to the browser.
 */
(function () {
  'use strict';

  var API = window.API_URL || window.SCRIPT_URL || '';
  var state = {
    candidate: null,
    history: [],
    selectedWindowId: '',
    requestId: 0,
    rankRequestId: 0
  };

  function parseJson(value) {
    try { return value ? JSON.parse(value) : null; }
    catch (_) { return null; }
  }

  function firstValue() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
        return arguments[i];
      }
    }
    return null;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value, fallback) {
    var el = byId(id);
    if (!el) return;
    el.textContent = value === null || value === undefined || value === ''
      ? (fallback === undefined ? '-' : fallback)
      : String(value);
  }

  function setStatus(id, message, isError) {
    var el = byId(id);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', !!isError);
  }

  function candidateFromSession() {
    return parseJson(sessionStorage.getItem('neet_candidate') || '') || {};
  }

  function fmtTime(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '-';
    n = Math.floor(n);
    var h = Math.floor(n / 3600);
    var m = Math.floor((n % 3600) / 60);
    var s = n % 60;
    if (h) return h + ' hr ' + m + ' min ' + s + ' sec';
    if (m) return m + ' min ' + s + ' sec';
    return s + ' sec';
  }

  function fmtNumber(value, digits) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return digits === undefined ? String(n) : n.toFixed(digits);
  }

  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value);
  }

  async function api(action, payload) {
    if (!API) throw new Error('API_URL / SCRIPT_URL is missing in config.js.');
    if (!state.candidate || !state.candidate.token) {
      throw new Error('Candidate login session is missing. Please log in again.');
    }

    var body = Object.assign({}, payload || {}, {
      action: action,
      token: state.candidate.token,
      candidateId: state.candidate.candidateId || state.candidate.id || ''
    });

    var response = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'follow'
    });

    var raw = await response.text();
    var data;
    try { data = JSON.parse(raw); }
    catch (_) { throw new Error('The server returned an invalid response. Check the Apps Script deployment.'); }

    if (!response.ok || !data || data.ok === false) {
      throw new Error(data && (data.error || data.message)
        ? (data.error || data.message)
        : 'Unable to complete ' + action + '.');
    }
    return data;
  }

  function renderResult(result) {
    var r = result || {};
    var c = state.candidate || {};
    setText('candName', firstValue(r.name, c.name));
    setText('candId', firstValue(r.candidateId, c.candidateId, c.id));
    setText('candEmail', firstValue(r.email, c.email));
    setText('candPhone', firstValue(r.phone, c.phone));
    setText('score', firstValue(r.score, r.marks, r.totalScore));
    setText('correct', firstValue(r.correct, r.correctCount));
    setText('wrong', firstValue(r.wrong, r.wrongCount));
    setText('unattempted', firstValue(r.unattempted, r.unanswered));
    setText('timeTaken', fmtTime(firstValue(r.timeTakenSec, r.timeTaken)));
    setText('violations', firstValue(r.violations, r.violationCount), '0');
  }

  function metric(label, value) {
    var wrapper = document.createElement('div');
    wrapper.className = 'history-metric';
    var small = document.createElement('small');
    small.textContent = label;
    var strong = document.createElement('strong');
    strong.textContent = value === undefined || value === null ? '-' : String(value);
    wrapper.appendChild(small);
    wrapper.appendChild(strong);
    return wrapper;
  }


  function formatSignedScore(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n + ' points';
  }

  function renderHistory(history) {
    var list = byId('historyList');
    if (!list) return;
    list.textContent = '';

    if (!Array.isArray(history) || !history.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No previous submitted examination results were found for this candidate.';
      list.appendChild(empty);
      setStatus('historyStatus', 'No result history available.', false);
      return;
    }

    history.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'history-item' +
        (item.examWindowId && item.examWindowId === state.selectedWindowId ? ' selected' : '');

      var date = document.createElement('div');
      date.className = 'history-date';
      date.textContent = (item.examName ? item.examName + ' — ' : '') +
        (item.submittedAt || item.submittedAtISO || 'Submitted examination');
      row.appendChild(date);

      row.appendChild(metric('Score', fmtNumber(item.score)));
      row.appendChild(metric('Correct / Wrong', fmtNumber(item.correct) + ' / ' + fmtNumber(item.wrong)));
      row.appendChild(metric('Unattempted', fmtNumber(item.unattempted)));
      row.appendChild(metric('Rank / Submitted', item.rankAvailable && item.rank !== null
        ? (fmtNumber(item.rank) + ' / ' + fmtNumber(item.totalSubmitted))
        : 'Available after official exam end'));
      var hasPrevious = item.scoreChange !== null && item.scoreChange !== undefined;
      var progressLabel = item.previousExamName ? 'Vs ' + item.previousExamName : 'Previous exam change';
      var changeText = hasPrevious ? formatSignedScore(item.scoreChange) :
        (item.previousExamName ? 'No submission in previous exam' : 'First configured exam');
      if (hasPrevious && item.scoreChangePercent !== null && item.scoreChangePercent !== undefined) {
        changeText += ' (' + (Number(item.scoreChangePercent) > 0 ? '+' : '') + Number(item.scoreChangePercent).toFixed(1) + '%)';
      }
      var progressMetric = metric(progressLabel, changeText);
      if (hasPrevious && Number(item.scoreChange) > 0) progressMetric.classList.add('progress-up');
      if (hasPrevious && Number(item.scoreChange) < 0) progressMetric.classList.add('progress-down');
      row.appendChild(progressMetric);

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-select';
      button.textContent = 'View Result';
      button.disabled = !item.examWindowId;
      button.title = item.examWindowId ? 'View this examination result and analysis' :
        'This older record has no verifiable exam window ID.';
      button.addEventListener('click', async function () {
        if (!item.examWindowId || button.disabled) return;
        button.disabled = true;
        button.textContent = 'Loading…';
        button.setAttribute('aria-busy','true');
        try { await selectHistoryResult(item); }
        finally { button.disabled = false; button.textContent = 'View Result'; button.removeAttribute('aria-busy'); }
      });
      row.appendChild(button);
      list.appendChild(row);
    });

    setStatus('historyStatus', 'Showing ' + history.length + ' of ' +
      (state.historyTotal || history.length) + ' submitted result(s).', false);
  }

  async function loadHistory() {
    setStatus('historyStatus', 'Loading result history…', false);
    try {
      var data = await api('getResultHistory', { limit: 100, offset: 0 });
      state.history = Array.isArray(data.history) ? data.history : [];
      state.historyTotal = Number(data.totalCount || state.history.length);
      renderHistory(state.history);
    } catch (error) {
      setStatus('historyStatus', error.message || 'Unable to load result history.', true);
      var list = byId('historyList');
      if (list) list.textContent = '';
    }
  }

  function appendAnalysisRow(container, title, detail, percentage) {
    var row = document.createElement('div');
    row.className = 'analysis-row';

    var heading = document.createElement('div');
    heading.className = 'analysis-row-title';
    var name = document.createElement('span');
    name.textContent = title;
    var pct = document.createElement('strong');
    pct.textContent = percentage === null || percentage === undefined ? '' : percentage + '%';
    heading.appendChild(name);
    heading.appendChild(pct);
    row.appendChild(heading);

    var details = document.createElement('div');
    details.className = 'analysis-details';
    details.textContent = detail;
    row.appendChild(details);

    if (percentage !== null && percentage !== undefined && Number.isFinite(Number(percentage))) {
      var track = document.createElement('div');
      track.className = 'progress-track';
      var fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.style.width = Math.max(0, Math.min(100, Number(percentage))) + '%';
      track.appendChild(fill);
      row.appendChild(track);
    }
    container.appendChild(row);
  }

  function renderSubjectAnalysis(subjects) {
    var container = byId('subjectAnalysis');
    if (!container) return;
    container.textContent = '';

    if (!Array.isArray(subjects) || !subjects.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Subject analysis is unavailable. Check that QuestionMetadata contains questionId and subject values for this exam.';
      container.appendChild(empty);
      return;
    }

    subjects.forEach(function (subject) {
      var detail = 'Correct: ' + Number(subject.correct || 0) +
        ' · Wrong: ' + Number(subject.wrong || 0) +
        ' · Unattempted: ' + Number(subject.unattempted || 0) +
        ' · Attempted: ' + Number(subject.attempted || 0) + '/' + Number(subject.total || 0);
      appendAnalysisRow(container, escapeText(subject.subject || 'Unclassified'),
        detail, Number(subject.accuracy || 0));

      if (Array.isArray(subject.topics) && subject.topics.length) {
        subject.topics.forEach(function (topic) {
          var topicDetail = 'Correct: ' + Number(topic.correct || 0) +
            ' · Wrong: ' + Number(topic.wrong || 0) +
            ' · Unattempted: ' + Number(topic.unattempted || 0) +
            ' · Attempted: ' + Number(topic.attempted || 0) + '/' + Number(topic.total || 0);
          appendAnalysisRow(container, '↳ ' + escapeText(topic.topic || 'Topic'),
            topicDetail, Number(topic.accuracy || 0));
        });
      }
    });
  }

  function behaviourItem(label, value) {
    var item = document.createElement('div');
    item.className = 'behaviour-item';
    var name = document.createElement('span');
    name.textContent = label;
    var strong = document.createElement('strong');
    strong.textContent = String(value);
    item.appendChild(name);
    item.appendChild(strong);
    return item;
  }

  function renderBehaviour(behaviour) {
    var container = byId('behaviourAnalysis');
    if (!container) return;
    container.textContent = '';
    var b = behaviour || {};
    var list = document.createElement('div');
    list.className = 'behaviour-list';

    var au = b.answeredUnmarked || {};
    var am = b.answeredMarked || {};
    var ru = b.reviewUnanswered || {};
    var un = b.unanswered || {};

    list.appendChild(behaviourItem('Answered — not marked for review',
      Number(au.total || 0) + ' (Correct ' + Number(au.correct || 0) +
      ', Wrong ' + Number(au.wrong || 0) + ')'));
    list.appendChild(behaviourItem('Answered — marked for review',
      Number(am.total || 0) + ' (Correct ' + Number(am.correct || 0) +
      ', Wrong ' + Number(am.wrong || 0) + ')'));
    list.appendChild(behaviourItem('Unanswered — marked for review', Number(ru.total || 0)));
    list.appendChild(behaviourItem('Unanswered — not marked for review', Number(un.total || 0)));
    container.appendChild(list);
  }

  function renderAnalysis(data) {
    var content = byId('analysisContent');
    var status = byId('analysisStatus');
    if (status) status.hidden = true;
    if (content) content.hidden = false;

    renderSubjectAnalysis(data.subjectAnalysis);
    renderBehaviour(data.behaviouralAnalysis);

    var coverage = data.metadataCoverage || {};
    var note = 'Question metadata coverage: ' + Number(coverage.classified || 0) +
      ' classified / ' + Number(coverage.total || 0) + ' questions; ' +
      Number(coverage.unclassified || 0) + ' unclassified.';
    if (data.interpretation) note += ' ' + data.interpretation;
    setText('metadataNote', note);
  }

  function clearAnswerKey(message) {
    var link=byId('answerKeyLink');
    if(link){link.hidden=true;link.removeAttribute('href');}
    var status=byId('answerKeyStatus');
    if(status)status.textContent=message||'Select a submitted result to check Answer Key access.';
  }

  async function loadAnswerKeyLink(windowId) {
    clearAnswerKey('Checking Answer Key release and Drive permission…');
    if(!windowId){clearAnswerKey('No verified exam window is available for this result.');return;}
    try {
      var data=await api('getReleasedAnswerKeyLink',{examWindowId:windowId});
      if(!data.driveUrl)throw new Error('The server did not return an Answer Key link.');
      var link=byId('answerKeyLink');
      if(link){link.href=data.driveUrl;link.hidden=false;link.textContent='Open '+(data.fileName||'Answer Key')+' in Google Drive';}
      var status=byId('answerKeyStatus');
      if(status)status.textContent='Answer Key released for this submitted examination. Open it using the Google account registered with your candidate profile ('+(data.email||'registered email')+').';
    } catch(error) {
      clearAnswerKey(error.message||'Answer Key is not currently available.');
    }
  }

  function clearCandidateRankList(message) {
    state.rankRequestId++;
    var wrap = byId('candidateRankWrap');
    var body = byId('candidateRankBody');
    if (wrap) wrap.hidden = true;
    if (body) body.textContent = '';
    setStatus('candidateRankStatus', message || 'Select a submitted examination to check its rank list.', false);
  }

  function formatRankDuration(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '-';
    n = Math.floor(n);
    var h = Math.floor(n / 3600);
    var m = Math.floor((n % 3600) / 60);
    var s = n % 60;
    return h ? h + 'h ' + m + 'm ' + s + 's' : (m ? m + 'm ' + s + 's' : s + 's');
  }

  async function loadCandidateRankList(windowId) {
    var requestId = ++state.rankRequestId;
    var wrap = byId('candidateRankWrap');
    var body = byId('candidateRankBody');
    if (wrap) wrap.hidden = true;
    if (body) body.textContent = '';
    if (!windowId) {
      setStatus('candidateRankStatus', 'No verified exam window is available for this result.', false);
      return;
    }
    setStatus('candidateRankStatus', 'Checking rank-list eligibility…', false);
    try {
      var data = await api('getCandidateExamRankList', { examWindowId: windowId });
      if (requestId !== state.rankRequestId) return;
      var rankings = Array.isArray(data.rankings) ? data.rankings : [];
      if (!rankings.length) throw new Error('No submitted candidates are present in this rank list.');
      rankings.forEach(function (item) {
        var tr = document.createElement('tr');
        if (item.isCurrentCandidate) tr.className = 'current-candidate';
        [item.rank, item.name || 'Candidate', item.candidateId, item.score,
          item.correct, item.wrong, item.unattempted, formatRankDuration(item.timeTakenSec)]
          .forEach(function (value) {
            var td = document.createElement('td');
            td.textContent = value === undefined || value === null ? '-' : String(value);
            tr.appendChild(td);
          });
        body.appendChild(tr);
      });
      if (wrap) wrap.hidden = false;
      setStatus('candidateRankStatus', data.examName + ' · ' + data.totalSubmitted +
        ' submitted candidate(s). Tie-break: ' + (data.tieBreakRule || 'higher score, lower time, earlier submission.') +
        ' Your row is highlighted.', false);
    } catch (error) {
      if (requestId !== state.rankRequestId) return;
      setStatus('candidateRankStatus', error.message || 'The rank list is not available.', true);
      if (wrap) wrap.hidden = true;
    }
  }

  function clearAnalysis(message) {
    var content = byId('analysisContent');
    var status = byId('analysisStatus');
    if (content) content.hidden = true;
    if (status) {
      status.hidden = false;
      status.textContent = message || 'Select a result to load performance analysis.';
      status.classList.remove('error');
    }
  }

  async function loadAnalysis(windowId, examName) {
    var requestId = ++state.requestId;
    state.selectedWindowId = windowId;
    renderHistory(state.history);

    var subtitle = byId('analysisSubtitle');
    if (subtitle) subtitle.textContent = 'Analysis for ' + (examName || windowId) + '.';
    var content = byId('analysisContent');
    var status = byId('analysisStatus');
    if (content) content.hidden = true;
    if (status) {
      status.hidden = false;
      status.textContent = 'Loading performance analysis…';
      status.classList.remove('error');
    }

    try {
      var data = await api('getResultAnalysis', { examWindowId: windowId });
      if (requestId !== state.requestId) return;
      renderAnalysis(data);
    } catch (error) {
      if (requestId !== state.requestId) return;
      if (status) {
        status.hidden = false;
        status.textContent = error.message || 'Unable to load performance analysis.';
        status.classList.add('error');
      }
      if (content) content.hidden = true;
    }
  }

  async function selectHistoryResult(item) {
    if (!item || !item.examWindowId) return;
    state.selectedWindowId = item.examWindowId;

    // getResultHistory returns score/correct/wrong/unattempted/time/violations
    // for this authenticated candidate. Render that summary immediately;
    // then fetch the heavier analysis and Answer Key state in parallel.
    renderResult(item);
    setStatus('statusNote', 'Result summary loaded. Updating analysis and Answer Key access…', false);
    await Promise.all([
      loadAnalysis(item.examWindowId, item.examName || item.submittedAt),
      loadAnswerKeyLink(item.examWindowId),
      loadCandidateRankList(item.examWindowId)
    ]);
    setStatus('statusNote', 'Selected examination result loaded successfully.', false);
  }

  async function loadCurrentResult() {
    var c = state.candidate;
    var stored = parseJson(localStorage.getItem(resultStorageKey(c)) || '');
    if (stored && firstValue(stored.score, stored.marks, stored.totalScore) !== null) {
      renderResult(stored);
    }

    setStatus('statusNote', 'Retrieving your latest result…', false);
    try {
      // If login/session state includes an examWindowId, request that exact
      // window. Otherwise Code.gs resolves the server's default exam window.
      var payload = {};
      if (c.examWindowId) payload.examWindowId = c.examWindowId;
      var result = await api('getResult', payload);
      renderResult(result);
      if (result.examWindowId) { state.selectedWindowId = result.examWindowId; await Promise.all([loadAnswerKeyLink(result.examWindowId),loadCandidateRankList(result.examWindowId)]); }
      setStatus('statusNote', 'Exam result loaded successfully.', false);
    } catch (error) {
      if (!stored || firstValue(stored.score, stored.marks, stored.totalScore) === null) {
        clearAnswerKey('No submitted result is selected.');
      clearCandidateRankList('No submitted result is selected.');
        renderResult({});
        setStatus('statusNote', error.message || 'No result found for the current exam window.', true);
      } else {
        setStatus('statusNote', 'Showing the locally saved result. Server refresh failed: ' +
          (error.message || 'Unknown error'), true);
      }
    }
  }

  function resultStorageKey(candidate) {
    var c = candidate || {};
    var windowId = String(c.examWindowId ||
      ((Number.isFinite(window.EXAM_START_MS) ? window.EXAM_START_MS : 0) + '_' +
       (Number.isFinite(window.EXAM_END_MS) ? window.EXAM_END_MS : 0)));
    return 'neet_result_' + encodeURIComponent(String(c.candidateId || c.id || '')) +
      '_' + encodeURIComponent(windowId);
  }

  window.backToLogin = function () {
    var c = state.candidate || candidateFromSession();
    if (c.token && API) {
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'cancelCandidateLogin',
          token: c.token,
          candidateId: c.candidateId || c.id || ''
        }),
        cache: 'no-store'
      }).catch(function () {});
    }
    sessionStorage.removeItem('neet_candidate');
    sessionStorage.removeItem('neet_qr_challenge');
    sessionStorage.removeItem('neet_exam_approval_request');
    location.replace('login.html?v=' + Date.now());
  };

  document.addEventListener('DOMContentLoaded', async function () {
    state.candidate = candidateFromSession();

    if (!state.candidate.token) {
      setStatus('statusNote', 'Candidate session not found. Please log in again.', true);
      setStatus('historyStatus', 'Login required to view result history.', true);
      clearAnalysis('Login required to view performance analysis.');
      return;
    }

    clearAnalysis('Select a result to load performance analysis.');
    // Load history first. Selecting its newest verified row retrieves the
    // full result once; this avoids the former duplicate getResult + Answer Key
    // requests on every page load.
    await loadHistory();
    var newest = state.history.find(function (item) { return !!item.examWindowId; });
    if (newest) {
      await selectHistoryResult(newest);
    } else {
      await loadCurrentResult();
    }
  });
})();
