import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../public/${path}`,import.meta.url),'utf8');

test('public customer pages load the approved Meta Pixel while staff pages do not',()=>{
  for(const page of ['index.html','event.html','success.html','submit.html']){
    assert.match(read(page),/<script src="\/meta-pixel\.js"><\/script>/,`${page} should load the public tracker`);
  }
  for(const page of ['dashboard.html','checkin.html','reset-password.html']){
    assert.doesNotMatch(read(page),/meta-pixel\.js/,`${page} must remain outside marketing tracking`);
  }
});

test('ticket purchase confirmation sends the paid total once',()=>{
  const success=read('success.html');
  assert.match(success,/kvnMeta\.purchaseOnce\(d\.order\.id,d\.order\.amountTotal/);
});

test('checkout records InitiateCheckout before handing off to Stripe',()=>{
  assert.match(read('event.js'),/kvnMeta\?\.track\('InitiateCheckout'/);
});
