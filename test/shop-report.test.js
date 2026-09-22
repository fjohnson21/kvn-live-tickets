import test from 'node:test';
import assert from 'node:assert/strict';
import {shopMetrics,shopOrdersCsv} from '../lib/shop-report.js';

const order={id:'sho_1',status:'paid',fulfillmentStatus:'awaiting_fulfillment',buyerEmail:'buyer@example.com',items:[{size:'L',quantity:2}],collectorNumbers:['001','002'],merchandiseSubtotal:7800,shippingAmount:500,taxAmount:598,amountTotal:8898,discipleCode:'BRIANNAH',trackingNumber:''};

test('shop CSV exposes fulfillment and attribution fields',()=>{
  const csv=shopOrdersCsv([order]);
  assert.match(csv,/collector_numbers,fulfillment_status,tracking_number,disciple_code/);
  assert.match(csv,/001\|002/);
});

test('shop metrics separate revenue units and remaining stock',()=>{
  const metrics=shopMetrics({shopOrders:[order],shopProducts:[{sizeInventory:{L:10,XL:5}}]});
  assert.deepEqual(metrics,{grossRevenue:8898,merchandiseRevenue:7800,unitsSold:2,unitsRemaining:15,paidOrders:1});
});
