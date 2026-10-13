// Owner-only kill switch for the Controller reporting API.
// This control does not establish or approve a remote ChatGPT/OAuth connection.
(() => {
  'use strict';
  const button = document.getElementById('controllerAccessToggle');
  const status = document.getElementById('controllerAccessStatus');
  const details = document.getElementById('controllerAccessDetails');
  if (!button || !status || !details) return;

  let request = null;
  let state = null;
  let epoch = 0;
  let busy = false;

  function render(message = '') {
    const enabled = state?.enabled === true;
    button.disabled = !request || !state || busy;
    button.setAttribute('aria-checked', String(enabled));
    button.classList.toggle('is-on', enabled);
    button.textContent = busy ? 'Saving…' : enabled ? 'ON' : 'OFF';
    status.textContent = message || (!state ? 'Status unavailable' :
      enabled ? 'ON — Controller reporting permitted for the signed-in owner.' :
        'OFF — Controller reporting API blocked.');
    details.textContent = state ?
      'Remote ChatGPT connection not yet configured. The switch does not affect tickets, payments, email campaigns or scheduled tasks.' :
      'Sign in as the platform owner to manage access.';
  }

  function clear() {
    ++epoch;
    request = null;
    state = null;
    busy = false;
    button.onclick = null;
    render();
  }

  async function refresh() {
    const current = epoch;
    try {
      const next = await request('/api/controller/v1/access');
      if (current !== epoch) return;
      state = next;
      render();
    } catch (error) {
      if (current !== epoch) return;
      state = null;
      render('Unable to check Controller status: ' + error.message);
    }
  }

  async function toggle() {
    if (!request || !state || busy) return;
    const nextEnabled = !state.enabled;
    if (nextEnabled && !window.confirm('Turn ON the owner-only Controller reporting API? This does not connect ChatGPT.')) return;
    busy = true;
    render();
    const current = epoch;
    try {
      const next = await request('/api/controller/v1/access', {
        method: 'PUT',
        body: JSON.stringify({ enabled: nextEnabled, expectedRevision: state.revision })
      });
      if (current !== epoch) return;
      state = next;
      render(nextEnabled ? 'Controller reporting switched ON.' : 'Controller reporting switched OFF.');
    } catch (error) {
      if (current !== epoch) return;
      render('Change not saved: ' + error.message);
      await refresh();
    } finally {
      if (current === epoch) { busy = false; render(); }
    }
  }

  window.KVNController = {
    init({ api, user }) {
      clear();
      if (user?.role !== 'owner') return;
      request = api;
      button.onclick = toggle;
      refresh();
    },
    clear
  };
  render();
})();
