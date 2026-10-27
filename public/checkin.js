(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const video = byId('video'), form = byId('form'), code = byId('code');
  const result = byId('result'), cameraStatus = byId('cameraStatus');
  const startCamera = byId('startCamera'), stopCamera = byId('stopCamera');
  const submit = form.querySelector('button');
  const canvas = document.createElement('canvas');
  let context, stream = null, session = 0, timer = null, active = false, starting = false;
  let checking = false, lastCode = '', lastSeenAt = 0;

  function text(tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = String(value ?? '');
    if (className) element.className = className;
    return element;
  }

  function showResult(ok, data) {
    result.className = `ticket-result ${ok ? 'ok' : 'bad'}`;
    result.replaceChildren();
    if (ok) {
      result.append(text('span', 'CHECKED IN', 'kicker'), text('h2', data.ticket.ticketName),
        text('p', `${data.buyerName || data.ticket.holderName || 'Attendee'} • ${data.event?.title || ''}`),
        text('strong', data.ticket.code));
    } else {
      result.append(text('h2', data.error || 'Unable to confirm check-in.'));
      if (data.ticket) result.append(text('p', data.ticket.code));
    }
  }

  // Every source shares the same in-flight lock. Never retry an ambiguous admission automatically.
  async function check(value) {
    const clean = String(value || '').trim().toUpperCase();
    if (!clean || checking) return;
    checking = true;
    submit.disabled = true;
    showResult(false, {error: 'Checking ticket…'});
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/checkin', {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({code: clean})
      });
      const data = await response.json().catch(error => {
        if (response.status === 401 || response.status === 403) return {error: 'Sign in with check-in permission before continuing.'};
        throw error;
      });
      if (response.ok && data?.ticket?.code !== clean) throw new Error('Invalid admission response');
      showResult(response.ok, data);
      if (response.ok) code.value = '';
      if (response.status === 401 || response.status === 403) {
        stop('Camera stopped — sign in with check-in permission before continuing.');
        if (response.status === 401) {
          const link = text('a', 'Sign in to the Command Center');
          link.href = '/dashboard.html';
          result.append(link);
        }
      } else if (response.status >= 500) {
        code.value = clean;
        stop('Camera stopped — check the connection and retry manually.');
      }
    } catch {
      stop('Camera stopped — check the connection and retry manually.');
      showResult(false, {error: 'Unable to confirm check-in. The ticket may have been admitted. Check the connection, then retry this code manually; a duplicate response means it was already checked in.'});
      code.value = clean;
    } finally {
      clearTimeout(timeout);
      checking = false;
      submit.disabled = false;
    }
  }

  function release(media) { media?.getTracks().forEach(track => track.stop()); }
  function stop(message = 'Camera stopped.') {
    session++;
    active = starting = false;
    clearTimeout(timer);
    timer = null;
    release(stream);
    stream = null;
    video.pause();
    video.srcObject = null;
    startCamera.disabled = false;
    cameraStatus.textContent = message;
  }

  async function nativeDetector() {
    if (typeof window.BarcodeDetector !== 'function') return null;
    try {
      if (typeof window.BarcodeDetector.getSupportedFormats === 'function' &&
          !(await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) return null;
      return new window.BarcodeDetector({formats: ['qr_code']});
    } catch { return null; }
  }

  function fallbackDecode() {
    if (typeof window.jsQR !== 'function') throw new Error('QR decoder unavailable. Reload the page or use manual entry.');
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return '';
    // Bound CPU/memory on phones while retaining enough detail for ticket QR codes.
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context ||= canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(video, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    return window.jsQR(frame.data, width, height, {inversionAttempts: 'attemptBoth'})?.data || '';
  }

  function ticketCode(raw) {
    try { return (new URL(raw).searchParams.get('ticket') || raw).trim().toUpperCase(); }
    catch { return String(raw || '').trim().toUpperCase(); }
  }

  async function scanLoop(id, detector) {
    if (!active || id !== session) return;
    try {
      let raw = '';
      if (!checking) {
        if (detector) {
          try { raw = (await detector.detect(video))[0]?.rawValue || ''; }
          catch {
            if (!active || id !== session) return;
            detector = null;
            cameraStatus.textContent = 'Camera active — compatibility QR scanner. Point it at the QR code.';
            raw = fallbackDecode();
          }
        } else raw = fallbackDecode();
        if (!active || id !== session) return;
        const found = ticketCode(raw), now = Date.now();
        // Keep a stationary QR latched, including rejected tickets. Clear after it leaves the frame.
        if (checking) {
          // A manual request may have begun while native detection was pending.
          // Leave this QR unlatched so the next frame can submit it.
        } else if (found) {
          lastSeenAt = now;
          if (found !== lastCode) { lastCode = found; await check(found); }
        } else if (now - lastSeenAt > 1200) lastCode = '';
      }
    } catch {
      if (id === session) stop('Camera scanning failed. Restart the camera or use manual entry.');
    }
    if (active && id === session) timer = setTimeout(() => scanLoop(id, detector), 160);
  }

  startCamera.addEventListener('click', async () => {
    if (active || starting) return;
    const id = ++session;
    starting = true;
    startCamera.disabled = true;
    cameraStatus.textContent = 'Requesting camera access…';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable. Open this page over HTTPS in your browser, or use manual entry.');
      const detector = await nativeDetector();
      if (id !== session) return;
      if (!detector && typeof window.jsQR !== 'function') throw new Error('QR decoder unavailable. Reload the page or use manual entry.');
      const media = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}, audio: false});
      if (id !== session) { release(media); return; }
      stream = media;
      for (const track of media.getTracks()) track.addEventListener?.('ended', () => {
        if (id === session) stop('Camera disconnected. Restart the camera or use manual entry.');
      }, {once: true});
      video.srcObject = media;
      await video.play();
      if (id !== session) return;
      starting = false;
      active = true;
      lastCode = '';
      lastSeenAt = 0;
      cameraStatus.textContent = `Camera active — ${detector ? 'point it at the QR code.' : 'compatibility QR scanner. Point it at the QR code.'}`;
      scanLoop(id, detector);
    } catch (error) {
      if (id !== session) return;
      const message = error.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access in browser settings, then try again. Manual entry is still available.' :
        error.name === 'NotFoundError' ? 'No camera found. Use manual entry.' :
        error.name === 'NotReadableError' ? 'Camera is busy or unavailable. Close other camera apps, then try again, or use manual entry.' :
        error.message || 'Unable to start camera. Use manual entry.';
      stop(message);
    }
  });
  stopCamera.addEventListener('click', () => stop());
  window.addEventListener('pagehide', () => stop());
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  form.addEventListener('submit', event => { event.preventDefault(); check(code.value); });
  const supplied = new URLSearchParams(location.search).get('ticket');
  if (supplied) { code.value = supplied; check(supplied); }
})();
