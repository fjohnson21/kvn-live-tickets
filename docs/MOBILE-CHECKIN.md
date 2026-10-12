# Mobile QR check-in

## Scope

The served scanner is `public/checkin.html` / `public/checkin.js`; the legacy
root-level copies are not served by Express. Existing `/api/checkin` cookie
authentication, staff permission and organizer checks, ticket mutation, and
409 duplicate response are unchanged. No data migration is required.

The scanner uses native `BarcodeDetector` when QR support is reported (or
tries its constructor if format introspection is unavailable). If absent,
unsupported, initialization fails, or detection throws, it uses the bundled
jsQR 1.4.0 decoder. The fallback draws frames to a private canvas capped at
960 pixels on its longest edge and checks at most once every 160ms after
processing completes. It supports plain ticket codes and existing QR URLs
with a `ticket` query parameter. Images are processed locally, never uploaded.
Manual entry and the existing URL-based check-in flow are preserved.

All attendee, event, ticket and error fields use DOM text nodes. Result and
camera messages are live regions; long text wraps within narrow screens.

Only one admission request runs at a time. A stationary QR stays latched
until another code is seen or no QR has been seen for 1.2 seconds. Moving a
previously admitted ticket back into view can submit it again; the server's
409 response remains the authority. Manual entry can always recheck a code.

Stop, hidden tab, pagehide, failed playback, ended camera tracks and terminal
scanner errors release camera tracks. Stopping during the permission prompt
also releases any stream that arrives later. Repeat Start presses cannot
open parallel streams. Permission and device errors preserve manual entry.

A lost connection, invalid response or 15-second request timeout stops the
camera and asks the operator to retry manually. The server might have admitted
the guest before the connection failed; do not promise failure or automatically
retry. A subsequent duplicate response confirms prior admission. Stop only
stops camera capture; it cannot undo an already submitted admission.

## Automated verification

```
npm install
npx playwright install --with-deps chromium firefox webkit
npm test
npm run check
npm run test:mobile
```

`browser-tests/checkin.spec.mjs` defaults to Chromium, Firefox and WebKit.
For a local engine subset only, set `CHECKIN_BROWSERS=chromium` (or a
comma-separated list). CI installs all three and runs the full browser suite.
Do not skip a missing engine and describe it as a pass.

The browser fixture starts a separate local HTTPS server with a temporary, synthetic
store and explicitly allowlisted environment; no `.env`, payment keys, email
keys or sync secrets are inherited. Outbound browser requests are blocked.
An ephemeral self-signed certificate (generated with OpenSSL) preserves real
Secure-cookie behavior across engines; test contexts trust only this disposable
TLS setup through Playwright's ignoreHTTPSErrors option. Synthetic owners authenticate through the real endpoint, then their temporary
user records become staff to test check-in and organizer permissions. Test
mutations happen only under the fixture's temporary directory. Never substitute
a production URL, copy production data, or use real attendee tickets.

Browser tests inject synthetic camera hardware and real QR image pixels into
the canvas path. The bundled decoder is real; no fallback decoder is mocked.
Native detector adapters test selection and errors, not native optical decoding.
Coverage includes 320/390px layouts, authenticated admission, server duplicates,
manual entry, untrusted attendee text, 401/403 and organizer denial, missing
native QR support, native failure, permission denial, playback failure, Stop
while permission is pending, repeated Start, pagehide, track end and connection
failure/retry. Unit regressions independently cover safe success/error rendering
and cleanup races.

## Required physical-device rehearsal before November 21

Automated desktop engines and synthetic camera frames do **not** certify real
phone cameras, mobile Safari, focus, low light, or event Wi-Fi.

Use an isolated HTTPS staging deployment with synthetic tickets, not production
attendance records. Sign in with the intended staff accounts and their actual
check-in permissions. Record device model, OS, browser version, date and outcome.

- iPhone Safari and Android Chrome; include any other browser staff plan to use.
- Rear camera selection and permission allow/deny/retry; camera busy elsewhere.
- Printed QR and another phone's QR screen; portrait/landscape, glare, distance,
  reduced brightness and venue lighting. Confirm code and attendee match.
- Admit one synthetic guest; keep QR in frame; remove and scan again for the
  duplicate response. Scan two different guests quickly; try manual entry.
- Stop, background/tab switch, screen lock, navigate away/back, and restart.
  Confirm the device camera indicator turns off and no stale capture resumes.
- Poor/no Wi-Fi and recovery; verify ambiguous results against synthetic
  attendance before admitting again. This feature does not add offline admission.
- Two staffed devices scanning the same synthetic ticket: one admission and
  a duplicate response. The existing backend/storage concurrency model is
  unchanged by this frontend improvement.

Keep manual entry and a staffed escalation path ready. Review/merge the PR and
verify the deployed assets before recording this checklist as event-ready.
