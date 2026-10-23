import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureShopCollections,publicShopCatalog,DROP_001_PRODUCT} from '../lib/shop-catalog.js';
import {normalizeShopCart} from '../lib/shop-checkout.js';
import {reserveShopInventory,commitShopReservation} from '../lib/shop-inventory.js';
const id=DROP_001_PRODUCT.id;
test('all current sizes cost 29.99 even for existing stored catalog; historical orders unchanged',()=>{
 const store=ensureShopCollections({});store.shopProducts[0].unitAmountBySize={S:3900,M:3900,L:3900,XL:3900,'2XL':4200,'3XL':4200,'4XL':4200};store.shopOrders=[{items:[{unitAmount:4200}]}];
 assert.ok(publicShopCatalog(store).products[0].variants.every(v=>v.unitAmount===2999));
 const result=normalizeShopCart(store,[{productId:id,size:'M',quantity:2},{productId:id,size:'4XL',quantity:1}]);
 assert.equal(result.totals.merchandiseSubtotal,8997);assert.equal(result.totals.shippingAmount,500);assert.equal(store.shopOrders[0].items[0].unitAmount,4200);
});
test('catalog excludes active holds, retains expired stock and checkout aggregates repeated sizes',()=>{
 const store=ensureShopCollections({});store.shopProducts[0].sizeInventory.M=3;
 const now=new Date('2026-10-23T12:00:00Z');
 const hold=reserveShopInventory(store,{orderId:'held',lines:[{productId:id,size:'M',quantity:2}]},()=>now);
 assert.equal(publicShopCatalog(store,now).products[0].variants.find(v=>v.size==='M').remaining,1);
 assert.throws(()=>reserveShopInventory(store,{orderId:'over',lines:[{productId:id,size:'M',quantity:1},{productId:id,size:'M',quantity:1}]},()=>now),/Only 1/);
 assert.equal(publicShopCatalog(store,new Date('2026-10-23T13:00:00Z')).products[0].variants.find(v=>v.size==='M').remaining,3);
 commitShopReservation(store,hold.id,'held',()=>now);assert.equal(store.shopProducts[0].sizeInventory.M,1);
});
test('large per-shirt selections aggregate by size before Stripe line items',()=>{
 const result=normalizeShopCart(ensureShopCollections({}),Array.from({length:150},(_,i)=>({productId:id,size:i%2?'M':'L',quantity:1})));
 assert.equal(result.lines.length,2);assert.equal(result.lines[0].quantity,75);assert.equal(result.totals.merchandiseSubtotal,449850);
});
