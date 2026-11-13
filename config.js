// ==============================
// config.js - ZENITH CBT
// Student-facing display configuration.
// The Apps Script Script Properties and ExamWindows registry are authoritative.
// ==============================

// Google Apps Script Web App URL
window.API_URL = "https://script.google.com/macros/s/AKfycbztFZAnAoNHgnPlf2o0Da8baWYsYO_f8UlcfQSpDDL2pYI0WDvnGFGwIvTjhU1HUVqs/exec";
window.SCRIPT_URL = window.API_URL;

// ==============================
// EXAM DISPLAY SETTINGS
// ==============================
window.EXAM_DURATION_MIN = 60;
window.EXAM_DURATION_SECONDS = 60 * 60;
window.MARKS_CORRECT = 4;
window.MARKS_WRONG = -1;

// Display-only legacy schedule hints. The backend ExamWindows registry is authoritative.
window.EXAM_TZ = "Asia/Kolkata";
window.EXAM_START_IST = "2026-10-27T10:00:00+05:30";
window.EXAM_END_IST   = "2026-11-27T13:30:00+05:30";
window.EXAM_START_MS = Date.parse(window.EXAM_START_IST);
window.EXAM_END_MS   = Date.parse(window.EXAM_END_IST);

window.formatIST = function formatIST(dateOrMs = Date.now()) {
  const d = typeof dateOrMs === "number" ? new Date(dateOrMs) : dateOrMs;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: window.EXAM_TZ, year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
  }).format(d);
};
window.isWithinExamWindow = function isWithinExamWindow(nowMs = Date.now()) {
  return Number.isFinite(window.EXAM_START_MS) && Number.isFinite(window.EXAM_END_MS) &&
    nowMs >= window.EXAM_START_MS && nowMs <= window.EXAM_END_MS;
};
window.getExamStatus = function getExamStatus(nowMs = Date.now()) {
  if (!Number.isFinite(window.EXAM_START_MS) || !Number.isFinite(window.EXAM_END_MS)) return "invalid_schedule";
  if (nowMs < window.EXAM_START_MS) return "not_started";
  if (nowMs > window.EXAM_END_MS) return "closed";
  return "open";
};
window.DEFAULT_ANSWER_KEY_DRIVE_URL = "https://drive.google.com/file/d/1gPugHh40M-aexsVCKzceOXkwtpKSpMqR/view?usp=sharing";
window.CACHE_VERSION = "20261113_direct_approval_v2";
