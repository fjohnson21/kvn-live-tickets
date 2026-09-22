import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/dashboard.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/dashboard.js',import.meta.url),'utf8');

test('Command Center exposes an owner-only Apparel / Shop panel',()=>{
  assert.match(html,/data-panel="shop"/);
  assert.match(html,/Apparel \/ Shop/);
  assert.match(html,/id="shopOrders"/);
  assert.match(html,/id="shopInventory"/);
});

test('shop panel loads orders and exposes fulfillment actions',()=>{
  assert.match(js,/\/api\/shop\/orders/);
  for(const action of ['/resend','/ship','/refund','/size']) assert.match(js,new RegExp(action));
});
