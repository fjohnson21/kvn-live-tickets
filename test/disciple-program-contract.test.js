import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCIPLE_AGREEMENT_TEXT, DISCIPLE_AGREEMENT_VERSION } from '../lib/disciple-agreement.js';

test('public Disciple agreement states the approved commission program', () => {
  assert.equal(DISCIPLE_AGREEMENT_VERSION,'2.2');
  assert.match(DISCIPLE_AGREEMENT_TEXT,/10%/i);
  assert.match(DISCIPLE_AGREEMENT_TEXT,/KVN Live tickets/i);
  assert.match(DISCIPLE_AGREEMENT_TEXT,/Kingdom Vibe merchandise\/apparel/i);
  assert.match(DISCIPLE_AGREEMENT_TEXT,/Kingdom Market/i);
  assert.match(DISCIPLE_AGREEMENT_TEXT,/30 days/i);
  assert.match(DISCIPLE_AGREEMENT_TEXT,/monthly on the 15th/i);
  assert.match(DISCIPLE_AGREEMENT_TEXT,/no minimum payout/i);
  assert.match(DISCIPLE_AGREEMENT_TEXT,/taxes, processing or service fees, shipping, donations/i);
});

test('approval path creates Disciples at the approved 10% default', () => {
  assert.match(DISCIPLE_AGREEMENT_TEXT,/approved Kingdom Disciple earns 10%/i);
});

test('store default remains 10% for new Disciple records', () => {
  assert.match(DISCIPLE_AGREEMENT_TEXT,/10% of eligible gross item sales/i);
});
