import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureShopCollections, DROP_001_PRODUCT } from '../lib/shop-catalog.js';
import { reserveShopInventory } from '../lib/shop-inventory.js';
import { finalizeShopSession, refundShopOrder } from '../lib/shop-finalize.js';

const PRODUCT=DROP_001_PRODUCT.id;
const clock=()=>new Date('2026-09-22T12:00:00.000Z');

function fixture({size='L',quantity=1,subtotal=3900,disciple=true}={}){
  const store=ensureShopCollections({disciples:disciple?[{id:'dsc_1',code:'BRIANNAH',status:'active',defaultCommissionPercent:10}]:[],discipleCommissions:[]});
  store.shopProducts[0].sizeInventory[size]=quantity;
  const order={id:'sho_1',orderType:'apparel',status:'pending',buyerEmail:'buyer@example.com',items:[{productId:PRODUCT,name:'Drop 001',size,quantity,unitAmount:subtotal/quantity}],merchandiseSubtotal:subtotal,shippingAmount:500,discipleId:disciple?'dsc_1':'',discipleCode:disciple?'BRIANNAH':'',createdAt:clock().toISOString()};
  const reservation=reserveShopInventory(store,{orderId:order.id,lines:order.items},clock);order.reservationId=reservation.id;store.shopOrders.push(order);
  const session={id:'cs_shop_1',payment_status:'paid',amount_total:subtotal+500+329,total_details:{amount_tax:329},customer_details:{email:'paid@example.com',name:'Paid Buyer',phone:'+19195551212',address:{line1:'100 Main St',city:'Sanford',state:'NC',postal_code:'27330',country:'US'}},metadata:{order_type:'apparel',order_id:order.id,reservation_id:reservation.id}};
  return {store,order,session};
}

test('duplicate webhook finalizes one time',async()=>{
  const {store,session}=fixture({quantity:2,subtotal:7800});let sends=0;
  const deps={clock,id:prefix=>`${prefix}_1`,queueConfirmation:async()=>{sends++;}};
  const first=await finalizeShopSession(store,session,deps);
  const second=await finalizeShopSession(store,session,deps);
  assert.deepEqual(second.collectorNumbers,first.collectorNumbers);
  assert.equal(store.discipleCommissions.filter(item=>item.orderId===first.id).length,1);
  assert.equal(sends,1);
  assert.deepEqual(first.collectorNumbers,['001','002']);
});

test('reward excludes shipping and tax',async()=>{
  const {store,session}=fixture({size:'2XL',subtotal:4200});
  const order=await finalizeShopSession(store,session,{clock,id:prefix=>`${prefix}_1`,queueConfirmation:async()=>{}});
  const reward=store.discipleCommissions.find(item=>item.orderId===order.id);
  assert.equal(reward.eligibleBase,4200);
  assert.equal(reward.amount,420);
  assert.equal(reward.sourceType,'apparel');
  assert.equal(order.taxAmount,329);
  assert.equal(order.fulfillmentStatus,'awaiting_fulfillment');
});

test('refund restores inventory and marks reward for reversal',async()=>{
  const {store,session}=fixture();
  const order=await finalizeShopSession(store,session,{clock,id:prefix=>`${prefix}_1`,queueConfirmation:async()=>{}});
  refundShopOrder(store,order.id,{clock});
  assert.equal(order.status,'refunded');
  assert.equal(store.shopProducts[0].sizeInventory.L,1);
  assert.equal(store.discipleCommissions[0].status,'reversal_required');
  assert.equal(store.collectorAssignments[0].status,'refunded');
});
