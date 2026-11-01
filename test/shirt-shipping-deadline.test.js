import test from 'node:test';
import assert from 'node:assert/strict';
import {shirtFulfillmentMethod} from '../lib/shirt-fulfillment.js';
import {publicShopCatalog} from '../lib/shop-catalog.js';
import {buildShopCheckoutSession} from '../lib/shop-checkout.js';
import {buildShopConfirmation} from '../lib/shop-email.js';
test('November 8 Eastern cutoff switches shipping to pickup without changing existing orders',()=>{
 assert.equal(shirtFulfillmentMethod('2026-11-09T04:59:59.999Z'),'shipping');
 assert.equal(shirtFulfillmentMethod('2026-11-09T05:00:00.000Z'),'will_call');
 assert.equal(publicShopCatalog({},new Date('2026-11-08T12:00:00Z')).fulfillmentMethod,'shipping');
 assert.equal(publicShopCatalog({},new Date('2026-11-09T05:00:00Z')).fulfillmentMethod,'will_call');
 const order={id:'test',fulfillmentMethod:'shipping',items:[],shippingAmount:0};
 assert.deepEqual(buildShopCheckoutSession(order).shipping_address_collection,{allowed_countries:['US']});
 assert.match(buildShopConfirmation({order}).text,/shipped to the address provided/);
 const pickup={...order,fulfillmentMethod:'will_call'};
 assert.equal(buildShopCheckoutSession(pickup).shipping_address_collection,undefined);
 assert.match(buildShopConfirmation({order:pickup}).text,/early at will call/);
 assert.equal(order.fulfillmentMethod,'shipping');
});
