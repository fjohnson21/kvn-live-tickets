const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const amount=v=>Number.isSafeInteger(v)&&v>=0;
export function collectBusinessSales(store={}){
 const transactions=[],exceptions=[],seen=new Map();
 for(const [source,business] of [['orders','tix'],['shopOrders','shop']])for(const o of store[source]||[]){
  if(!['paid','shipped','refunded'].includes(o.status))continue;
  const issue=reason=>exceptions.push({source,sourceId:o.id,reason});
  if(!amount(o.amountTotal)){issue('invalid_amount');continue;}
  if(!validDate(o.paidAt)){issue('paid_timestamp_missing');continue;}
  const aliases=[o.stripePaymentIntentId,o.stripeSessionId].filter(Boolean).map(v=>'payment:'+v);if(!aliases.length)aliases.push(source+':'+o.id);
  const paymentId=o.stripePaymentIntentId||o.stripeSessionId||null;
  const row={id:source+':'+o.id,source,sourceId:o.id,paymentId,business,eventId:o.eventId||null,kind:o.orderType==='sponsored_upgrade'?'upgrade':'sale',paidAt:o.paidAt,amountCents:o.amountTotal,currency:String(o.currency||'USD').toUpperCase(),name:o.buyerName||o.customer?.name||'',refunds:[],paymentAttention:Boolean(o.paymentAttention)};
  if(o.status==='refunded'||o.refundedAt){if(validDate(o.refundedAt)&&amount(o.refundAmount)){row.refunds.push({id:'refund:'+row.id,occurredAt:o.refundedAt,amountCents:o.refundAmount});}else issue('refund_details_missing');}
  if(o.paymentAttention)issue('payment_review');const matches=[...new Set(aliases.map(k=>seen.get(k)).filter(Boolean))];const canonical=matches[0]||row;if(matches.length){issue('duplicate_payment');for(const other of [...matches.slice(1),row]){for(const refund of other.refunds)if(!canonical.refunds.some(r=>r.occurredAt===refund.occurredAt&&r.amountCents===refund.amountCents))canonical.refunds.push(refund);if(other!==row){transactions.splice(transactions.indexOf(other),1);for(const [key,value] of seen)if(value===other)seen.set(key,canonical);}}}else transactions.push(row);for(const key of aliases)seen.set(key,canonical);
 }
 return {transactions,exceptions,sources:[{source:'KV Tix',status:'Connected'},{source:'Shop',status:'Connected'},{source:'Kingdom Market payments',status:'Not connected'},{source:'Ministry Partner payments',status:'Not connected'}]};
}
export function queryBusinessSales(ledger,{from,to,business,eventId,currency='USD'}={}){
 const start=Date.parse(from),end=Date.parse(to);if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw Object.assign(Error('Choose valid start and end timestamps.'),{statusCode:400});
 currency=String(currency).toUpperCase();const inside=v=>Date.parse(v)>=start&&Date.parse(v)<end;const scoped=ledger.transactions.filter(t=>(!business||t.business===business)&&(!eventId||t.eventId===eventId));
 const rows=[];let grossSalesCents=0,refundCents=0;const byBusiness={};
 for(const t of scoped.filter(t=>t.currency===currency)){if(inside(t.paidAt)){grossSalesCents+=t.amountCents;byBusiness[t.business]=(byBusiness[t.business]||0)+t.amountCents;rows.push({...t,recordType:'sale',occurredAt:t.paidAt});}for(const r of t.refunds)if(inside(r.occurredAt)){refundCents+=r.amountCents;rows.push({...t,id:r.id,recordType:'refund',occurredAt:r.occurredAt,amountCents:-r.amountCents});}}
 return {from,to,currency,grossSalesCents,refundCents,netCollectedCents:grossSalesCents-refundCents,rows:rows.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)),byBusiness,currencies:[...new Set(scoped.map(t=>t.currency))],coverage:{sources:ledger.sources,exceptions:ledger.exceptions,complete:ledger.exceptions.length===0&&ledger.sources.every(s=>s.status==='Connected')}};
}
