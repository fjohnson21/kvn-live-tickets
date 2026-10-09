# Phone browser regression checks

Run from the repository root:

```sh
npm install
npx playwright install --with-deps chromium
npm run test:mobile
```

The suite starts the real server with a disposable synthetic store, synthetic owner
credentials, a separate upload directory and no inherited provider secrets or
CRM sync configuration. It never reads production data. Browser requests to
external origins, campaign send/test routes, source sync and reset-email delivery
are blocked and fail the test if attempted. All contacts use example.test.

Chromium runs with touch/mobile emulation at 320×568, 390×844, 430×932 and
844×390 CSS pixels. Coverage includes invalid and valid authentication, session
reload, reset-form navigation (no email sent), all menu entries, CRM record
view/edit, contact create/edit, long imported list names, CSV cleanup/back/remove,
cleaned/rejected/list/report downloads, campaign draft creation/preview/history and cancelling
the send confirmation, report table overflow containment, and logout/API denial.

A long Eventbrite-style filename used as a list label is intentional: without the
mobile wrapping fix it forces contact/import/composer forms to 723px of scroll
width inside a 298px dialog at 320px viewport width. Assertions check the dialog's
scroll width, not only page overflow, because dialogs can conceal this defect.

This is real Chromium rendering and touch emulation, **not physical iPhone Safari**.
WebKit was not runnable in the audit environment due to missing system libraries.
Before declaring iPhone support verified, check on physical Safari:

- Keyboard opening, date/select pickers, form zoom, and focused-field visibility.
- Portrait/landscape rotation, browser toolbar changes and safe-area insets.
- Menu and dialog scrolling, including reaching Close after long forms.
- Files app CSV selection, downloaded-file naming/opening, and share-sheet behavior.
- VoiceOver focus, labels and navigation.
- Session behavior after backgrounding. Do not launch a campaign for this check.

No production deployment or authenticated production Safari session is implied by
these tests. Campaign execution while backgrounded is not covered.
