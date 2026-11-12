// ==============================
// config.js - ZENITH CBT
// Student-facing display configuration.
// The Apps Script Script Properties are authoritative.
// ==============================

// Google Apps Script Web App URL
window.API_URL = "https://script.google.com/macros/s/AKfycbwWqrXYBHFoZJCohBix9FXKP4BMkZym-r4arYbybFiXLAf78aBQmQSMFSEAp5okNLJs/exec";

window.SCRIPT_URL = window.API_URL;

// ==============================
// EXAM DISPLAY SETTINGS
// ==============================

// Each candidate receives 60 minutes from their server-recorded start.
// Apps Script enforces this; this frontend value is display-only.
window.EXAM_DURATION_MIN = 60;
window.EXAM_DURATION_SECONDS = 60 * 60;

// Display hints only. Apps Script performs the actual scoring.
window.MARKS_CORRECT = 4;
window.MARKS_WRONG = -1;

// ==============================
// EXAM ACCESS WINDOW - IST
// Candidates may START at any time within this window.
// Each attempt lasts up to 60 minutes, but cannot extend
// beyond the server-configured window end.
// ==============================

window.EXAM_TZ = "Asia/Kolkata";

window.EXAM_START_IST = "2026-10-27T10:00:00+05:30";
window.EXAM_END_IST   = "2026-11-27T13:30:00+05:30";

window.EXAM_START_MS = Date.parse(window.EXAM_START_IST);
window.EXAM_END_MS   = Date.parse(window.EXAM_END_IST);

// ==============================
// IST FORMATTER
// ==============================

window.formatIST = function formatIST(dateOrMs = Date.now()) {
  const d = typeof dateOrMs === "number" ? new Date(dateOrMs) : dateOrMs;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: window.EXAM_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(d);
};

// ==============================
// DISPLAY-ONLY WINDOW CHECK
// The backend remains authoritative.
// ==============================

window.isWithinExamWindow = function isWithinExamWindow(nowMs = Date.now()) {
  return Number.isFinite(window.EXAM_START_MS) &&
         Number.isFinite(window.EXAM_END_MS) &&
         nowMs >= window.EXAM_START_MS &&
         nowMs <= window.EXAM_END_MS;
};

window.getExamStatus = function getExamStatus(nowMs = Date.now()) {
  if (!Number.isFinite(window.EXAM_START_MS) ||
      !Number.isFinite(window.EXAM_END_MS)) {
    return "invalid_schedule";
  }
  if (nowMs < window.EXAM_START_MS) return "not_started";
  if (nowMs > window.EXAM_END_MS) return "closed";
  return "open";
};

// Change this value whenever frontend files are updated.
window.CACHE_VERSION = "20261112_exams_v1";
