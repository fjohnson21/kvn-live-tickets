import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShopConfirmation,deliverShopConfirmation} from '../lib/shop-email.js';

const order={id:'sho_1',buyerName:'Paid Buyer',buyerEmail:'buyer@example.com',items:[{name:'Drop 001',size:'L',quantity:1,unitAmount:3900}],collectorNumbers:['001'],merchandiseSubtotal:3900,shippingAmount:500,taxAmount:314,amountTotal:4714,shippingAddress:{line1:'100 Main St',city:'Sanford',state:'NC',postal_code:'27330',country:'US'}};

test('confirmation contains merch details without ticket language',()=>{
  const message=buildShopConfirmation({order});
  assert.match(message.text,/Collector’s Edition 001/);
  assert.match(message.text,/Ships beginning October 15, 2026/);
  assert.match(message.text,/Shipping address:/);
  assert.match(message.text,/A portion of every purchase helps fund Kingdom Projects and supports our Acts 2:44 Foundation/);
  assert.doesNotMatch(message.text,/QR|check-in|ticket code/i);
});

test('delivery records one send and skips a duplicate',async()=>{
  let requests=0;const fetchImpl=async()=>{requests++;return {ok:true,json:async()=>({id:'email_shop_1'})};};
  const first=await deliverShopConfirmation({order,apiKey:'key',fetchImpl,now:()=> '2026-09-22T12:00:00Z'});
  const second=await deliverShopConfirmation({order,apiKey:'key',fetchImpl});
  assert.equal(first.status,'sent');assert.equal(second.status,'skipped');assert.equal(requests,1);
  assert.equal(order.confirmationEmailAttempts.length,1);
});
