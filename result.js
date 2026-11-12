
/************************************************************
 * result.js - ZENITH NEET CBT
 *
 * Features:
 * 1. Authenticated current result/history retrieval
 * 2. Candidate-scoped result history
 * 3. Historical result selection
 * 4. Subject/topic performance analysis
 * 5. Behavioural analysis
 *
 * Server remains the source of truth.
 * AnswerKey and answer JSON are never exposed to frontend.
 ************************************************************/

'use strict';

(function () {

  const state = {
    candidate: {},
    history: [],
    selectedWindowId: '',
    analysisRequest: 0
  };

  function parse(value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  function firstValue() {
    for (let i = 0; i < arguments.length; i++) {
      const value = arguments[i];

      if (
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        return value;
      }
    }

    return null;
  }

  function element(id) {
    return document.getElementById(id);
  }

  function setText(id, value, fallback = '-') {
    const el = element(id);
    if (!el) return;

    el.textContent =
      value === null || value === undefined || value === ''
        ? fallback
        : String(value);
  }

  function clear(id) {
    const el = element(id);
    if (el) el.replaceChildren();
  }

  function make(tag, className, text) {
    const el = document.createElement(tag);

    if (className) el.className = className;

    if (text !== undefined && text !== null) {
      el.textContent = String(text);
    }

    return el;
  }

  function formatTime(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return '-';
    }

    const seconds = Math.floor(number);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;

    if (hours) {
      return `${hours} hr ${minutes} min ${remaining} sec`;
    }

    if (minutes) {
      return `${minutes} min ${remaining} sec`;
    }

    return `${remaining} sec`;
  }

  function candidateSession() {
    return parse(
      sessionStorage.getItem('neet_candidate') || ''
    ) || {};
  }

  function status(id, message, isError = false) {
    const el = element(id);
    if (!el) return;

    el.textContent = message;
    el.classList.toggle('error', !!isError);
  }

  function getApiUrl() {
    return String(
      window.API_URL ||
      window.SCRIPT_URL ||
      ''
    ).trim();
  }

  async function postAPI(payload) {
    const apiUrl = getApiUrl();

    if (!apiUrl) {
      throw new Error(
        'API_URL is missing. Please check config.js.'
      );
    }

    const response = await fetch(apiUrl, {
      method: 'POST',

      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },

      body: JSON.stringify(payload),

      cache: 'no-store'
    });

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        'Invalid response received from the CBT server.'
      );
    }

    if (!response.ok || data.ok === false) {
      throw new Error(
        data.error ||
        data.message ||
        'The server request failed.'
      );
    }

    return data;
  }

  function requireCandidate() {
    const candidate = state.candidate;

    if (!candidate.token) {
      throw new Error(
        'Candidate session not found. Please log in again.'
      );
    }

    const candidateId =
      candidate.candidateId || candidate.id;

    if (!candidateId) {
      throw new Error(
        'Candidate ID is missing from the current session.'
      );
    }

    return {
      token: candidate.token,
      candidateId: candidateId
    };
  }

  function renderCandidateDetails() {
    const c = state.candidate;

    setText('candName', c.name);
    setText('candId', c.candidateId || c.id);
    setText('candEmail', c.email);
    setText('candPhone', c.phone);
  }

  function renderSummary(result) {
    result = result || {};

    setText(
      'candName',
      firstValue(result.name, state.candidate.name)
    );

    setText(
      'candId',
      firstValue(
        result.candidateId,
        state.candidate.candidateId,
        state.candidate.id
      )
    );

    setText(
      'candEmail',
      firstValue(result.email, state.candidate.email)
    );

    setText(
      'candPhone',
      firstValue(result.phone, state.candidate.phone)
    );

    setText(
      'score',
      firstValue(result.score, result.marks, result.totalScore)
    );

    setText(
      'correct',
      firstValue(result.correct, result.correctCount)
    );

    setText(
      'wrong',
      firstValue(result.wrong, result.wrongCount)
    );

    setText(
      'unattempted',
      firstValue(result.unattempted, result.unanswered)
    );

    const time = firstValue(
      result.timeTakenSec,
      result.timeTaken
    );

    setText(
      'timeTaken',
      time === null ? '-' : formatTime(time)
    );

    setText(
      'violations',
      firstValue(result.violations, result.violationCount),
      '0'
    );
  }

  async function fetchHistory() {
    const auth = requireCandidate();

    return await postAPI({
      action: 'getResultHistory',
      token: auth.token,
      candidateId: auth.candidateId,
      limit: 50,
      offset: 0
    });
  }

  async function fetchAnalysis(examWindowId) {
    const auth = requireCandidate();

    return await postAPI({
      action: 'getResultAnalysis',
      token: auth.token,
      candidateId: auth.candidateId,
      examWindowId: examWindowId
    });
  }

  function formatAccuracy(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) return '0%';

    return `${n.toFixed(1)}%`;
  }

  function renderHistory() {
    const list = element('historyList');
    const historyStatus = element('historyStatus');

    if (!list || !historyStatus) return;

    list.replaceChildren();

    if (!state.history.length) {
      historyStatus.textContent =
        'No previous submitted results were found for this candidate.';
      return;
    }

    historyStatus.textContent =
      `${state.history.length} result(s) found.`;

    state.history.forEach(function (record, index) {
      const row = make(
        'div',
        'history-item' +
          (
            record.examWindowId === state.selectedWindowId
              ? ' selected'
              : ''
          )
      );

      const date = make(
        'div',
        'history-date',
        record.submittedAt ||
          record.submittedAtISO ||
          `Examination ${index + 1}`
      );

      const score = make('div', 'history-metric');
      score.append(
        make('small', '', 'Score'),
        make('strong', '', record.score)
      );

      const correct = make('div', 'history-metric');
      correct.append(
        make('small', '', 'Correct'),
        make('strong', '', record.correct)
      );

      const wrong = make('div', 'history-metric');
      wrong.append(
        make('small', '', 'Wrong'),
        make('strong', '', record.wrong)
      );

      const button = make(
        'button',
        'history-select',
        'View Analysis'
      );

      button.type = 'button';

      if (!record.examWindowId) {
        button.disabled = true;
        button.textContent = 'Analysis unavailable';
        button.title =
          'This older result does not contain a valid exam window ID.';
      } else {
        button.addEventListener('click', function () {
          selectHistoryResult(record.examWindowId);
        });
      }

      row.append(date, score, correct, wrong, button);
      list.appendChild(row);
    });
  }

  function renderSubjectAnalysis(items) {
    const container = element('subjectAnalysis');

    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(items) || !items.length) {
      container.appendChild(
        make(
          'div',
          'empty-state',
          'No subject-wise analysis data is available.'
        )
      );
      return;
    }

    items.forEach(function (subject) {
      const block = make('div', 'analysis-row');

      const title = make('div', 'analysis-row-title');

      title.append(
        make('span', '', subject.subject || 'Unclassified'),
        make(
          'span',
          '',
          formatAccuracy(subject.accuracy)
        )
      );

      const details = make(
        'div',
        'analysis-details',
        `Total: ${subject.total || 0} | Attempted: ${subject.attempted || 0} | Correct: ${subject.correct || 0} | Wrong: ${subject.wrong || 0} | Unattempted: ${subject.unattempted || 0}`
      );

      const track = make('div', 'progress-track');
      const fill = make('div', 'progress-fill');

      const accuracy = Math.max(
        0,
        Math.min(100, Number(subject.accuracy) || 0)
      );

      fill.style.width = `${accuracy}%`;
      track.appendChild(fill);

      block.append(title, details, track);

      if (Array.isArray(subject.topics) && subject.topics.length) {
        subject.topics.forEach(function (topic) {
          const topicBlock = make(
            'div',
            'analysis-details'
          );

          topicBlock.style.paddingLeft = '12px';

          topicBlock.textContent =
            `• ${topic.topic}: ${topic.correct || 0} correct, ` +
            `${topic.wrong || 0} wrong, ` +
            `${topic.unattempted || 0} unattempted ` +
            `(${formatAccuracy(topic.accuracy)})`;

          block.appendChild(topicBlock);
        });
      }

      container.appendChild(block);
    });
  }

  function addBehaviourItem(container, label, value) {
    const row = make('div', 'behaviour-item');

    row.append(
      make('span', '', label),
      make('strong', '', value)
    );

    container.appendChild(row);
  }

  function renderBehaviourAnalysis(data) {
    const container = element('behaviourAnalysis');

    if (!container) return;

    container.replaceChildren();

    data = data || {};

    const unmarked = data.answeredUnmarked || {};
    const marked = data.answeredMarked || {};
    const reviewUnanswered = data.reviewUnanswered || {};
    const unanswered = data.unanswered || {};

    addBehaviourItem(
      container,
      'Answered without marking for review',
      `${unmarked.total || 0} (Correct ${unmarked.correct || 0}, Wrong ${unmarked.wrong || 0})`
    );

    addBehaviourItem(
      container,
      'Answered and marked for review',
      `${marked.total || 0} (Correct ${marked.correct || 0}, Wrong ${marked.wrong || 0})`
    );

    addBehaviourItem(
      container,
      'Marked for review but unanswered',
      reviewUnanswered.total || 0
    );

    addBehaviourItem(
      container,
      'Unanswered and not marked',
      unanswered.total || 0
    );
  }

  function renderMetadataCoverage(coverage) {
    const el = element('metadataNote');
    if (!el) return;

    coverage = coverage || {};

    const classified = Number(coverage.classified || 0);
    const total = Number(coverage.total || 0);
    const unclassified = Number(coverage.unclassified || 0);

    el.textContent =
      `Question classification: ${classified} of ${total} questions mapped to subjects. ` +
      `${unclassified} question(s) are currently Unclassified. ` +
      'Complete the QuestionMetadata sheet to improve subject and topic analysis. ' +
      'Behavioural categories describe answer and review-marker actions; they are not a measurement of confidence.';
  }

  async function selectHistoryResult(examWindowId) {
    if (!examWindowId) return;

    state.selectedWindowId = examWindowId;

    renderHistory();

    const requestNumber = ++state.analysisRequest;

    const content = element('analysisContent');

    if (content) content.hidden = true;

    setText(
      'analysisSubtitle',
      `Analysis for examination: ${examWindowId}`
    );

    status(
      'analysisStatus',
      'Loading performance analysis...',
      false
    );

    try {
      const data = await fetchAnalysis(examWindowId);

      // Ignore a late response if the user selected another result.
      if (requestNumber !== state.analysisRequest) return;

      if (!data || data.ok === false) {
        throw new Error(
          data && data.error
            ? data.error
            : 'Unable to load performance analysis.'
        );
      }

      renderSubjectAnalysis(data.subjectAnalysis);
      renderBehaviourAnalysis(data.behaviouralAnalysis);
      renderMetadataCoverage(data.metadataCoverage);

      if (content) content.hidden = false;

      status(
        'analysisStatus',
        'Performance analysis loaded successfully.',
        false
      );

      // Display the selected historical summary.
      const record = state.history.find(function (item) {
        return item.examWindowId === examWindowId;
      });

      if (record) {
        renderSummary(record);
      }

    } catch (error) {
      if (requestNumber !== state.analysisRequest) return;

      status(
        'analysisStatus',
        error.message || 'Unable to load analysis.',
        true
      );
    }
  }

  async function loadHistory() {
    status(
      'historyStatus',
      'Loading result history...',
      false
    );

    try {
      const data = await fetchHistory();

      state.history = Array.isArray(data.history)
        ? data.history
        : [];

      renderHistory();

      if (!state.history.length) {
        status(
          'historyStatus',
          'No submitted results found for this candidate.',
          false
        );
        return;
      }

      // First history entry is the newest result according to backend sorting.
      const newest = state.history.find(function (item) {
        return !!item.examWindowId;
      });

      if (newest) {
        await selectHistoryResult(newest.examWindowId);
      } else {
        status(
          'analysisStatus',
          'Detailed analysis is unavailable for these older results because they do not contain a valid exam window ID.',
          true
        );
      }

    } catch (error) {
      status(
        'historyStatus',
        error.message || 'Unable to retrieve result history.',
        true
      );
    }
  }

  // Logout only the current tab's candidate session.
  window.backToLogin = function () {
    const c = state.candidate;
    const apiUrl = getApiUrl();

    if (c.token && apiUrl) {
      fetch(apiUrl, {
        method: 'POST',

        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },

        body: JSON.stringify({
          action: 'cancelCandidateLogin',
          token: c.token,
          candidateId: c.candidateId || c.id
        }),

        cache: 'no-store'
      }).catch(function () {
        // Continue local logout if network request fails.
      });
    }

    sessionStorage.removeItem('neet_candidate');
    sessionStorage.removeItem('neet_qr_challenge');
    sessionStorage.removeItem('neet_device_session');
    sessionStorage.removeItem('neet_exam_access');

    location.replace(
      'login.html?v=' + Date.now()
    );
  };

  async function initialize() {
    state.candidate = candidateSession();

    renderCandidateDetails();

    if (!state.candidate.token) {
      status(
        'statusNote',
        'Login session not found. Please log in again.',
        true
      );

      status(
        'historyStatus',
        'Candidate login session is required.',
        true
      );

      return;
    }

    status(
      'statusNote',
      'Loading your examination history...',
      false
    );

    // History is the source for the current and previous result summaries.
    await loadHistory();

    if (state.history.length) {
      status(
        'statusNote',
        'Your examination results have been retrieved successfully.',
        false
      );
    } else {
      status(
        'statusNote',
        'No submitted result was found for this candidate.',
        true
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialize
    );
  } else {
    initialize();
  }

})();
