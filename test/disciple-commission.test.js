import test from 'node:test';
import assert from 'node:assert/strict';
function commission(baseCents, ratePercent=10){ return Math.round(baseCents*ratePercent/100); }
function payoutDate(iso){ const date=new Date(iso),y=date.getUTCFullYear(),m=date.getUTCMonth(); return new Date(Date.UTC(m===11?y+1:y,m===11?0:m+1,15)).toISOString().slice(0,10); }
test('$49 eligible sale earns $4.90 at 10%',()=>assert.equal(commission(4900),490));
test('no minimum payout: $4.90 remains payable',()=>assert.ok(commission(4900)>0));
test('discounted gross item base commissions only amount actually paid',()=>assert.equal(commission(3900),390));
test('monthly commissions pay on following month 15th',()=>assert.equal(payoutDate('2026-09-21T12:00:00Z'),'2026-10-15'));
test('December earnings roll payout into next year',()=>assert.equal(payoutDate('2026-12-20T12:00:00Z'),'2027-01-15'));
