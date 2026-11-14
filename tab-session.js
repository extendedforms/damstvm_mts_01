/* ZENITH CBT — per-tab session identity.
 * The ID is stored in sessionStorage (same-tab refresh survives; new tabs differ).
 * BroadcastChannel detects duplicated tabs that copied sessionStorage.
 */
(function (window) {
  'use strict';
  const KEY = 'zenith_cbt_tab_session_v1';
  const CHANNEL = 'zenith_cbt_tab_identity_v1';
  const VALID = /^[A-Za-z0-9_-]{16,100}$/;

  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    if (!window.crypto || !crypto.getRandomValues) throw new Error('Secure tab identity is unavailable in this browser.');
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  }

  async function ensure(candidate) {
    const c = candidate || {};
    let id = String(sessionStorage.getItem(KEY) || c.tabSessionId || '').trim();
    if (!VALID.test(id)) id = randomId();
    sessionStorage.setItem(KEY, id);
    c.tabSessionId = id;

    if (typeof window.BroadcastChannel === 'function') {
      const instanceId = randomId();
      const channel = new BroadcastChannel(CHANNEL);
      let duplicate = false;
      channel.addEventListener('message', function (event) {
        const data = event && event.data || {};
        if (!data || data.tabSessionId !== id || data.instanceId === instanceId) return;
        if (data.type === 'HELLO') {
          channel.postMessage({ type: 'ACK', tabSessionId: id, instanceId: instanceId });
        } else if (data.type === 'ACK') {
          duplicate = true;
        }
      });
      channel.postMessage({ type: 'HELLO', tabSessionId: id, instanceId: instanceId });
      await new Promise(resolve => window.setTimeout(resolve, 350));
      if (duplicate) {
        id = randomId();
        sessionStorage.setItem(KEY, id);
        c.tabSessionId = id;
        channel.postMessage({ type: 'HELLO', tabSessionId: id, instanceId: instanceId });
      }
      if (window.__zenithTabIdentityChannel) window.__zenithTabIdentityChannel.close();
      window.__zenithTabIdentityChannel = channel;
    }
    return id;
  }

  window.ZenithTabSession = { ensure: ensure, isValid: value => VALID.test(String(value || '')) };
})(window);
