/* One delegated listener gives immediate press feedback to current and future buttons. */
(function () {
  'use strict';
  var timers = new WeakMap();
  var selector = 'button, [role="button"], .answer-key-link, .history-select';

  document.addEventListener('click', function (event) {
    var control = event.target && event.target.closest
      ? event.target.closest(selector)
      : null;
    if (!control || control.getAttribute('aria-disabled') === 'true') return;
    if (control.tagName === 'BUTTON' && control.disabled) return;

    control.classList.remove('feedback');
    // Restart the short feedback animation for rapid consecutive taps.
    void control.offsetWidth;
    control.classList.add('feedback');

    var previous = timers.get(control);
    if (previous) window.clearTimeout(previous);
    timers.set(control, window.setTimeout(function () {
      control.classList.remove('feedback');
      timers.delete(control);
    }, 210));
  }, true);
})();
