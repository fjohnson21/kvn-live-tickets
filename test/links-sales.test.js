import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOfferProduct } from '../public/links-sales.js';
import { bundleFulfillment, markBundleShipped, buildFulfillmentNotice, deliverFulfillmentMessage } from '../lib/bundle-fulfillment.js';
import { buildTicketConfirmation } from '../lib/email.js';
import { EVENT_REPORT_HEADERS, eventReportRows } from '../lib/report.js';

test('offer deep links select only an existing available KVN ticket tier',()=>{
 const event={slug:'kingdom-vibe-live-2026',products:[{id:'kv-all-access-2026',type:'ticket',available:5},{id:'kv-kingdom-pass-2026',type:'ticket',available:0}]};
 assert.equal(selectOfferProduct(event,'full-access')?.id,'kv-all-access-2026');assert.equal(selectOfferProduct(event,'kingdom-pass'),null);assert.equal(selectOfferProduct(event,'unknown'),null);assert.equal(selectOfferProduct({...event,slug:'other'},'full-access'),null);
});
const order=()=>({id:'test-1',bundleWorkflowVersion:1,status:'paid',partnerCode:'CHANEL',buyerEmail:'test@example.com',buyerName:'Test',tickets:[{code:'TEST',ticketName:'Full Access',apparel:{size:'L',fulfilled:false}}],items:[],customer:{mailingAddress:{line1:'1 Test St',city:'Test',state:'NC',postalCode:'00000',country:'US'}},confirmationEmail:{status:'sent'}});
test('shipment requires paid apparel and tracking; preserves separate pass state',()=>{
 const o=order();assert.deepEqual(bundleFulfillment(o),{tee:'awaiting_shipment',pass:'email_accepted',complete:false});
 assert.throws(()=>markBundleShipped({...o,status:'pending'},{carrier:'UPS',trackingNumber:'123'}),/paid/);
 assert.throws(()=>markBundleShipped(o,{carrier:'',trackingNumber:''}),/tracking/);
 markBundleShipped(o,{carrier:'UPS',trackingNumber:'123'});assert.equal(bundleFulfillment(o).complete,true);assert.equal(o.tickets[0].apparel.fulfilled,true);
 assert.equal(bundleFulfillment({...o,confirmationEmail:{status:'failed'}}).complete,false);
});
test('legacy referral data stays off confirmations and reports; fulfillment remains',()=>{
 const o=order(),event={id:'e',title:'Event',products:[]};const email=buildTicketConfirmation({order:o,event,baseUrl:'https://example.com'});
 assert.doesNotMatch(email.text,/CHANEL/);assert.doesNotMatch(email.html,/CHANEL/);
 const row=eventReportRows(event,[o])[0];assert.equal(EVENT_REPORT_HEADERS.includes('Partner Code'),false);assert.equal(o.partnerCode,'CHANEL');assert.equal(row[EVENT_REPORT_HEADERS.indexOf('Tee Status')],'awaiting_shipment');
});
test('staff notice includes sizes and address without legacy referral; shipping notice includes tracking',async()=>{
 const o=order();const notice=buildFulfillmentNotice(o);assert.doesNotMatch(notice.text,/CHANEL/);assert.match(notice.text,/1 Test St/);assert.match(notice.text,/Size L/);
 let sends=0;const options={order:o,kind:'staff',to:'owner@example.com',apiKey:'test',fetchImpl:async()=>{sends++;return {ok:true,json:async()=>({id:'sent'})}}};
 assert.equal((await deliverFulfillmentMessage(options)).status,'sent');await deliverFulfillmentMessage(options);assert.equal(sends,1);
 markBundleShipped(o,{carrier:'UPS',trackingNumber:'123'});assert.match(buildFulfillmentNotice(o,'shipping').text,/123/);
});

test('historical fulfillment is read without re-queuing existing orders',()=>{const old=order();delete old.bundleWorkflowVersion;assert.equal(bundleFulfillment(old).tee,'legacy_not_tracked');old.tickets[0].apparel.fulfilled=true;assert.equal(bundleFulfillment(old).tee,'fulfilled');});
