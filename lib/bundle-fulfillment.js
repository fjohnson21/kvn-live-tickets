const apparelTickets=order=>(order.tickets||[]).filter(t=>t.apparel||t.includedApparel);
export function bundleFulfillment(order) {
 const shirts=apparelTickets(order);
 const tee=!shirts.length?'not_required':order.bundleShipment?.shippedAt?'shipped':shirts.every(t=>(t.apparel||t.includedApparel).fulfilled)?'fulfilled':order.bundleWorkflowVersion===1?'awaiting_shipment':'legacy_not_tracked';
 const pass=order.confirmationEmail?.status==='sent'?'email_accepted':order.confirmationEmail?.status||'pending';
 return {tee,pass,complete:order.status==='paid'&&['not_required','shipped','fulfilled'].includes(tee)&&pass==='email_accepted'};
}
export function markBundleShipped(order,{carrier,trackingNumber},now=()=>new Date().toISOString()) {
 if(order.status!=='paid'||!apparelTickets(order).length)throw new Error('Only paid apparel bundles can be shipped.');
 carrier=String(carrier||'').trim();trackingNumber=String(trackingNumber||'').trim();
 if(!carrier||!trackingNumber||carrier.length>80||trackingNumber.length>150)throw new Error('Enter a carrier and valid tracking number.');
 if(order.bundleShipment?.shippedAt){
  if(order.bundleShipment.carrier!==carrier||order.bundleShipment.trackingNumber!==trackingNumber)throw new Error('This bundle already has shipment tracking.');
  return order.bundleShipment;
 }
 order.bundleShipment={carrier,trackingNumber,shippedAt:now()};
 for(const ticket of apparelTickets(order)){if(ticket.apparel)ticket.apparel.fulfilled=true;if(ticket.includedApparel)ticket.includedApparel.fulfilled=true;}
 return order.bundleShipment;
}
export function buildFulfillmentNotice(order,kind='staff') {
 const address=order.customer?.mailingAddress||{};
 const shirts=apparelTickets(order).map(t=>`${t.ticketName}: Size ${(t.apparel||t.includedApparel).size}`).join('\n');
 if(kind==='shipping')return {subject:'Your Kingdom Vibe tee has shipped',text:`Order ${order.id}\n\nYour tee is on its way.\nCarrier: ${order.bundleShipment?.carrier||''}\nTracking number: ${order.bundleShipment?.trackingNumber||''}\n\n${shirts}\n\nYour event pass is delivered separately in your order confirmation.\nKingdom Vibe Live`};
 return {subject:`Paid bundle ready for fulfillment — ${order.id}`,text:`Order: ${order.id}\nCustomer: ${order.buyerName}\nEmail: ${order.buyerEmail}\nReferral code: ${order.partnerCode||'None'}\n\n${shirts}\n\nShip to:\n${[address.line1,address.line2,address.city,address.state,address.postalCode,address.country].filter(Boolean).join('\n')}\n\nQueue tees for shipment beginning October 15, 2026. Record tracking in Orders & Attendees. Pass email status: ${order.confirmationEmail?.status||'pending'}.`};
}
export async function deliverFulfillmentMessage({order,kind='staff',to,apiKey,from='Kingdom Vibe Live <info@kvnlive.com>',fetchImpl=fetch}) {
 const key=kind==='shipping'?'shipmentEmail':'fulfillmentEmail';
 if(order[key]?.status==='sent')return order[key];
 if(!apiKey||!to)return order[key]={status:'not_configured',error:'Email provider or recipient is not configured.'};
 try{
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`bundle-${kind}-${order.id}`},body:JSON.stringify({from,to:[to],...buildFulfillmentNotice(order,kind)})});
  const data=await response.json().catch(()=>({}));
  return order[key]=response.ok?{status:'sent',messageId:data.id,sentAt:new Date().toISOString()}:{status:'failed',error:data.message||'Email provider rejected request.'};
 }catch(error){return order[key]={status:'failed',error:error.message};}
}
