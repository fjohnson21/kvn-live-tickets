import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('public Disciple agreement states the approved commission program', () => {
  const html=fs.readFileSync(new URL('../public/disciples.html',import.meta.url),'utf8');
  assert.match(html,/Disciple Agreement & Attestation — v2\.1/);
  assert.match(html,/ten percent \(10%\)/i);
  assert.match(html,/KVN Live tickets/i);
  assert.match(html,/Kingdom Vibe merchandise\/apparel/i);
  assert.match(html,/Kingdom Market/i);
  assert.match(html,/30-day attribution window/i);
  assert.match(html,/monthly on the 15th/i);
  assert.match(html,/no minimum payout/i);
  assert.match(html,/taxes, processing\/service fees, shipping, donations, refunds and chargebacks/i);
});

test('approval path creates Disciples at the approved 10% default', () => {
  const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(server,/existing\?\.agreementVersion==='2\.1'/);
  assert.match(server,/existing\.status='superseded'/);
  assert.match(server,/defaultCommissionPercent:10/);
  assert.match(server,/disciple\.defaultCommissionPercent=10/);
});

test('store default remains 10% for new Disciple records', () => {
  const store=fs.readFileSync(new URL('../store.js',import.meta.url),'utf8');
  assert.match(store,/defaultDiscipleCommissionPercent \?\?= 10/);
});
