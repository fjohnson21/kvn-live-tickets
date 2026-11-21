import test from 'node:test';
import assert from 'node:assert/strict';
import {createPayPalPartnership} from '../lib/paypal-partnership.js';
import {givingLedger} from '../lib/giving.js';

function fixture(gifts, get) {
  let store = {donations:gifts, orders:[{id:'reserved-seat',amount:2500}]};
  const calls = [];
  const service = createPayPalPartnership({
    readStore:() => structuredClone(store), writeStore:next => {store = next;},
    client:{get:async id => {calls.push(id); return get(id);}}
  });
  return {service,calls,store:() => store};
}
const gift = {id:'don-1',paymentProvider:'paypal',paypalOrderId:'ORDER',amount:10000,status:'pending'};
const order = (state = 'COMPLETED') => ({
  id:'ORDER',status:'COMPLETED',purchase_units:[{custom_id:'don-1',payments:{captures:[
    {id:'TXN',status:state,create_time:'2026-11-18T17:00:00Z',amount:{value:'100.00',currency_code:'USD'}}
  ]}}]
});

test('backfills a missed capture once using GET and its original date, including concurrent refreshes',async () => {
  const x = fixture([gift],() => order());
  await Promise.all([x.service.reconcileBatch(),x.service.reconcileBatch()]);
  await x.service.reconcileBatch();
  assert.deepEqual(x.calls,['ORDER']);
  assert.equal(x.store().donations[0].paypalCaptureId,'TXN');
  assert.equal(x.store().donations[0].paidAt,'2026-11-18T17:00:00.000Z');
  assert.equal(givingLedger(x.store().donations).confirmedCents,10000);
  assert.deepEqual(x.store().orders,[{id:'reserved-seat',amount:2500}]);
});
test('uncaptured approvals, refunded gifts, duplicate captures, mismatches and outages cannot add confirmed revenue',async () => {
  const mismatch=order(); mismatch.purchase_units[0].custom_id='other-gift';
  for (const [get,extra,status,result] of [
    [()=>({id:'ORDER',status:'APPROVED'}),[], 'pending','awaiting_capture'],
    [()=>order('PARTIALLY_REFUNDED'),[],'payment_review','review'],
    [()=>mismatch,[],'payment_review','mismatch'],
    [()=>order(),[{id:'another',status:'pending',paypalCaptureId:'TXN'}],'payment_review','mismatch'],
    [()=>{throw new Error('timeout');},[],'pending','provider_unavailable']
  ]) {
    const x=fixture([gift,...extra],get);await x.service.reconcileBatch();
    const ledger=givingLedger(x.store().donations);
    assert.equal(ledger.confirmedCents,0);
    assert.equal(ledger.gifts.find(g=>g.id===gift.id).status,status);
    assert.equal(x.store().donations[0].paypalVerification.result,result);
  }
});
test('giving report includes legacy Stripe, excludes tests, and returns only display fields',() => {
  const x=givingLedger([
    {id:'stripe',status:'paid',amount:20000,stripeSessionId:'SESSION'},
    {...gift,paypalReturnKey:'secret',checkoutFingerprint:'secret',paypalApprovalUrl:'secret'},
    {...gift,id:'setup',paypalSetupTest:true,status:'paid'},
    {...gift,id:'missing',paypalOrderId:'',createdAt:'2026-01-01T00:00:00Z'}
  ]);
  assert.equal(x.confirmedCents,20000);assert.equal(x.paidCount,1);
  assert.equal(x.pendingCount,1);assert.equal(x.reviewCount,1);assert.equal(x.gifts.length,3);
  assert.equal(x.gifts.find(g=>g.id==='stripe').provider,'stripe');
  assert.ok(!JSON.stringify(x).includes('secret'));
});
