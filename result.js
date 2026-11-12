
/************************************************************
 * result.js - ZENITH NEET CBT
 *
 * - Server is the only source of truth for examination results.
 * - Retrieves result using authenticated candidate token.
 * - Verifies returned Candidate ID.
 * - Does not trust localStorage result values.
 * - Logout clears only the current browser tab's session.
 ************************************************************/

'use strict';

(function () {

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

  function setValue(id, value, fallback = '-') {
    const element = document.getElementById(id);

    if (!element) return;

    element.textContent =
      value === null || value === undefined || value === ''
        ? fallback
        : String(value);
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

  function getCandidate() {
    return parse(
      sessionStorage.getItem('neet_candidate') || ''
    ) || {};
  }

  function setStatus(message, isError = false) {
    const element = document.getElementById('statusNote');

    if (!element) return;

    element.textContent = message;
    element.classList.toggle('error', isError);
  }

  function renderCandidate(candidate) {
    setValue('candName', candidate.name);
    setValue(
      'candId',
      candidate.candidateId || candidate.id
    );
    setValue('candEmail', candidate.email);
    setValue('candPhone', candidate.phone);
  }

  function renderResult(result, candidate) {
    const score = firstValue(
      result.score,
      result.marks,
      result.totalScore
    );

    const correct = firstValue(
      result.correct,
      result.correctCount
    );

    const wrong = firstValue(
      result.wrong,
      result.wrongCount
    );

    const unattempted = firstValue(
      result.unattempted,
      result.unanswered
    );

    const timeTaken = firstValue(
      result.timeTakenSec,
      result.timeTaken
    );

    setValue(
      'candName',
      firstValue(result.name, candidate.name)
    );

    setValue(
      'candId',
      firstValue(
        result.candidateId,
        candidate.candidateId,
        candidate.id
      )
    );

    setValue(
      'candEmail',
      firstValue(result.email, candidate.email)
    );

    setValue(
      'candPhone',
      firstValue(result.phone, candidate.phone)
    );

    setValue('score', score);
    setValue('correct', correct);
    setValue('wrong', wrong);
    setValue('unattempted', unattempted);

    setValue(
      'timeTaken',
      timeTaken === null ? '-' : formatTime(timeTaken)
    );

    setValue(
      'violations',
      firstValue(
        result.violations,
        result.violationCount
      ),
      '0'
    );

    if (score !== null) {
      setStatus(
        'Exam result loaded successfully.',
        false
      );
    } else {
      throw new Error(
        'The server did not return a valid submitted result.'
      );
    }
  }

  async function postAPI(payload) {
    const apiUrl = String(
      window.API_URL ||
      window.SCRIPT_URL ||
      ''
    ).trim();

    if (!apiUrl) {
      throw new Error(
        'API_URL is missing. Check config.js.'
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
        'Invalid response from the result server.'
      );
    }

    if (!response.ok || data.ok === false) {
      throw new Error(
        data.error ||
        data.message ||
        'Unable to retrieve examination result.'
      );
    }

    return data;
  }

  async function fetchCurrentResult(candidate) {
    if (!candidate.token) {
      throw new Error(
        'Candidate login session is missing.'
      );
    }

    if (!candidate.candidateId && !candidate.id) {
      throw new Error(
        'Candidate ID is missing from this session.'
      );
    }

    const data = await postAPI({
      action: 'getResult',

      token: candidate.token,

      candidateId:
        candidate.candidateId || candidate.id
    });

    const returnedId = String(
      data.candidateId || ''
    ).trim();

    const expectedId = String(
      candidate.candidateId || candidate.id || ''
    ).trim();

    if (!returnedId || returnedId !== expectedId) {
      throw new Error(
        'Candidate verification failed. Result was not displayed.'
      );
    }

    return data;
  }

  // Logout: revoke the current server login if it is still active.
  // A submitted token may already be closed by the backend.
  window.backToLogin = function () {
    const candidate = getCandidate();

    const apiUrl =
      window.API_URL ||
      window.SCRIPT_URL ||
      '';

    if (candidate.token && apiUrl) {
      fetch(apiUrl, {
        method: 'POST',

        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },

        body: JSON.stringify({
          action: 'cancelCandidateLogin',
          token: candidate.token,
          candidateId:
            candidate.candidateId || candidate.id
        }),

        cache: 'no-store'
      }).catch(function () {
        // Local logout continues even if the network is unavailable.
      });
    }

    // Clear only this browser tab's candidate session.
    sessionStorage.removeItem('neet_candidate');
    sessionStorage.removeItem('neet_qr_challenge');
    sessionStorage.removeItem('neet_device_session');
    sessionStorage.removeItem('neet_exam_access');

    location.replace(
      'login.html?v=' + Date.now()
    );
  };

  async function initializeResultPage() {
    const candidate = getCandidate();

    renderCandidate(candidate);

    if (!candidate.token) {
      setStatus(
        'Login session not found. Please log in again.',
        true
      );

      return;
    }

    setStatus(
      'Retrieving your verified examination result...',
      false
    );

    try {
      // Always retrieve the result from the backend.
      // Never display an editable localStorage score as authoritative.
      const result = await fetchCurrentResult(candidate);

      renderResult(result, candidate);

    } catch (error) {
      console.error(
        'Result retrieval failed:',
        error
      );

      setStatus(
        error && error.message
          ? error.message
          : 'Unable to load your examination result.',
        true
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initializeResultPage
    );
  } else {
    initializeResultPage();
  }

})();
