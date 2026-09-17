import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('production server exposes no demo authentication endpoints', () => {
  const source = read('server.js');
  assert.doesNotMatch(source, /\/api\/auth\/demo(?:-staff)?/);
});

test('public control center exposes no demo role sign-in controls', () => {
  const html = read('public/dashboard.html');
  const script = read('public/dashboard.js');
  assert.doesNotMatch(html, /demoOwner|demoOrganizer|demoStaff|Test the platform as owner/i);
  assert.doesNotMatch(script, /\/api\/auth\/demo|demoOwner|demoOrganizer|demoStaff/);
});
