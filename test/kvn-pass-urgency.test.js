import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {selectOfferProduct} from '../public/links-sales.js';
import {availabilityLabel, earlyReleasePriceSummary, sizeOptionLabel} from '../public/catalog-view.js';
import {selectionQuantityState} from '../public/quantity-model.js';

async function render(t, available) {
  const dom = new JSDOM(fs.readFileSync('public/event.html', 'utf8'), {
    runScripts: 'outside-only', url: 'https://kvnlive.com/event.html?slug=kingdom-vibe-live-2026&disciple=TEST'
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  Object.assign(w, {selectOfferProduct, availabilityLabel, earlyReleasePriceSummary, sizeOptionLabel, selectionQuantityState});
  const products = [
    {id: 'kv-all-access-2026', name: 'Kingdom VIP', price: 3900, includedApparel: {mode: 'included', name: 'Drop 001', sizes: ['M']}},
    {id: 'kv-general-admission-2026', name: 'General Admission', price: 1500}
  ].map(p => ({...p, type: 'ticket', available, maxPerOrder: 20, minPerOrder: 1}));
  const event = {id: 'fixture', slug: 'kingdom-vibe-live-2026', title: 'KV Live', products};
  const before = JSON.stringify(event);
  w.fetch = async url => {
    assert.match(url, /^\/api\/events\//, 'render must not create checkout or write inventory');
    return {ok: true, json: async () => ({event, organization: {name: 'KVN'}})};
  };
  const source = fs.readFileSync('public/event.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/init\(\);\s*$/, 'window.ready = init();');
  w.eval(source);
  await w.ready;
  assert.equal(JSON.stringify(event), before, 'render preserves product availability and prices');
  assert.equal(w.localStorage.getItem('kvn_disciple_code'), 'TEST');
  return w.document;
}

for (const available of [1, 7, 100, '7', 0, '0', -1, undefined]) {
  test(`KVN ticket cards hide counts and preserve purchase controls for availability ${available}`, async t => {
    const doc = await render(t, available);
    const soldOut = Number(available || 0) <= 0;
    for (const id of ['kv-all-access-2026', 'kv-general-admission-2026']) {
      const card = doc.getElementById(`offer-${id}`);
      assert.equal(card.querySelector('strong').textContent, soldOut ? 'Sold out.' : 'Limited passes remaining — Secure your pass today.');
      assert.doesNotMatch(card.textContent, /\d+\s+(?:passes?\s+)?remaining|100-pass release/i);
      assert.equal(doc.getElementById(`qty-${id}`).disabled, soldOut);
      assert.equal(doc.getElementById(`select-${id}`).disabled, soldOut);
      assert.equal(card.querySelector('summary').textContent, soldOut ? 'Sold out' : `Choose ${id === 'kv-all-access-2026' ? 'Kingdom VIP' : 'General Admission'}`);
    }
    assert.match(doc.getElementById('offer-kv-all-access-2026').textContent, /Free T-shirt.*first 10 rows/);
    assert.match(doc.getElementById('offer-kv-all-access-2026').textContent, /Rows 1–10/);
    assert.match(doc.getElementById('offer-kv-general-admission-2026').textContent, /The full day.*2:30 PM/s);
    assert.equal(doc.querySelector('#offer-kv-general-admission-2026 .product-price').textContent, '$15.00');
    assert.match(doc.getElementById('offer-shirt').textContent, /November 8 at 11:59 p.m. ET.*early at will call/s);
    assert.equal(doc.querySelector('#offer-shirt a').href, 'https://kvnlive.com/shop');
  });
}
