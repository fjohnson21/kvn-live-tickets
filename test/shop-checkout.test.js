import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureShopCollections, DROP_001_PRODUCT } from '../lib/shop-catalog.js';
import { buildShopCheckoutSession, normalizeShopCart } from '../lib/shop-checkout.js';

const PRODUCT=DROP_001_PRODUCT.id;

test('prices mixed sizes and charges shipping once',()=>{
  const result=normalizeShopCart(ensureShopCollections({}),[
    {productId:PRODUCT,size:'L',quantity:2},
    {productId:PRODUCT,size:'3XL',quantity:1}
  ]);
  assert.deepEqual(result.totals,{merchandiseSubtotal:12000,shippingAmount:500});
  assert.equal(result.lines.length,2);
});

test('rejects browser totals, invalid sizes and fractional quantities',()=>{
  const store=ensureShopCollections({});
  assert.throws(()=>normalizeShopCart(store,[{productId:PRODUCT,size:'L',quantity:1,unitAmount:1}]),/price/i);
  assert.throws(()=>normalizeShopCart(store,[{productId:PRODUCT,size:'5XL',quantity:1}]),/size/i);
  assert.throws(()=>normalizeShopCart(store,[{productId:PRODUCT,size:'L',quantity:1.5}]),/quantity/i);
});

test('Stripe session requires shipping address and automatic tax',()=>{
  const order={id:'sho_1',buyerEmail:'buyer@example.com',reservationId:'shr_1',items:[{productId:PRODUCT,name:'Drop 001',size:'L',quantity:1,unitAmount:3900}],shippingAmount:500};
  const config=buildShopCheckoutSession(order,'https://www.kvnlive.com');
  assert.deepEqual(config.shipping_address_collection,{allowed_countries:['US']});
  assert.deepEqual(config.automatic_tax,{enabled:true});
  assert.match(config.success_url,/\/shop\/success/);
  assert.match(config.success_url,/order_id=sho_1/);
  assert.match(config.cancel_url,/\/shop\?checkout=cancelled/);
  assert.equal(config.metadata.order_type,'apparel');
  assert.equal(config.metadata.order_id,'sho_1');
});
