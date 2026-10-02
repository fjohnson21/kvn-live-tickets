import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('all built-in KVN sender addresses use the verified tickets.kvnlive.com domain', () => {
  const files = ['lib/email.js','lib/shop-email.js','lib/bundle-fulfillment.js','server.js'];
  const combined = files.map(read).join('\n');
  const addresses = [...combined.matchAll(/<([^<>\\s]+@[^<>\\s]+)>/g)].map(m => m[1]);
  const kvnSenders = addresses.filter(email => /@(?:tickets\\.)?kvnlive\\.com$/i.test(email));
  assert.ok(kvnSenders.length > 0, 'Expected KVN sender addresses to be present.');
  for (const email of kvnSenders) assert.match(email, /@tickets\\.kvnlive\\.com$/i, 'Unverified sender default found: '+email);
});

function inlineHandlers(source) {
  return [...source.matchAll(/onclick=[\"'`]([A-Za-z_$][\\w$]*)\\s*\\(/g)].map(m => m[1]);
}
function defined(source, name) {
  const escaped = name.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&');
  return new RegExp('(?:window\\\\.'+escaped+'\\\\s*=|function\\\\s+'+escaped+'\\\\s*\\\\(|(?:const|let|var)\\\\s+'+escaped+'\\\\s*=)').test(source);
}

test('inline dashboard and public button handlers resolve to defined functions', () => {
  const files = ['public/dashboard.js','public/disciples.js','public/event.js','public/app.js','public/checkin.js','public/links-sales.js'];
  const failures = [];
  for (const file of files) {
    const source = read(file);
    const handlers = [...new Set(inlineHandlers(source))];
    for (const handler of handlers) if (!defined(source, handler)) failures.push(file+': '+handler);
  }
  assert.deepEqual(failures, [], 'Undefined inline button handlers:\\n'+failures.join('\\n'));
});

test('critical transactional email workflows have explicit failure-state handling', () => {
  const email = read('lib/email.js');
  const shop = read('lib/shop-email.js');
  const bundle = read('lib/bundle-fulfillment.js');
  assert.match(email, /Resend rejected welcome email/);
  assert.match(email, /Resend rejected the confirmation email/);
  assert.match(email, /Password reset email failed/);
  assert.match(shop, /Resend rejected shop email/);
  assert.match(bundle, /status:'failed'/);
});
