import { commitShopReservation, restoreShopInventory } from './shop-inventory.js';
import { flagOrderCommissionsForReversal } from './disciple-reversals.js';

const instant=clock=>(typeof clock==='function'?clock():new Date());
function payoutDate(now){const year=now.getUTCFullYear(),month=now.getUTCMonth();return new Date(Date.UTC(month===11?year+1:year,month===11?0:month+1,15)).toISOString();}

export async function finalizeShopSession(store,session,{clock=()=>new Date(),id=prefix=>`${prefix}_${Date.now()}`,queueConfirmation=async()=>{}}={}){
  const order=store.shopOrders?.find(item=>item.id===session?.metadata?.order_id||item.stripeSessionId===session?.id);
  if(!order) return undefined;
  if(order.status==='paid') return order;
  if(session.payment_status!=='paid') return order;
  const assignments=commitShopReservation(store,order.reservationId,order.id,clock);
  order.status='paid';order.fulfillmentStatus='awaiting_fulfillment';order.stripeSessionId=session.id;
  order.stripePaymentIntentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||'';
  order.buyerEmail=session.customer_details?.email||order.buyerEmail;
  order.buyerName=session.customer_details?.name||order.buyerName||'';
  order.buyerPhone=session.customer_details?.phone||'';
  order.shippingAddress=session.collected_information?.shipping_details?.address||session.shipping_details?.address||session.customer_details?.address||null;
  order.taxAmount=Number(session.total_details?.amount_tax||0);order.amountTotal=Number(session.amount_total||0);
  order.collectorNumbers=assignments.map(item=>item.displayNumber);order.paidAt=instant(clock).toISOString();
  const disciple=store.disciples?.find(item=>item.id===order.discipleId&&item.status==='active');
  if(disciple&&!store.discipleCommissions.some(item=>item.orderId===order.id&&item.sourceType==='apparel')){
    const eligibleBase=Math.max(0,Number(order.merchandiseSubtotal||0)-Number(order.merchandiseDiscountAmount||0));
    const ratePercent=Math.max(0,Math.min(100,Number(disciple.defaultCommissionPercent??store.settings?.defaultDiscipleCommissionPercent??10)));
    store.discipleCommissions.push({id:id('com'),discipleId:disciple.id,eventId:'',orderId:order.id,ratePercent,eligibleBase,
      amount:Math.round(eligibleBase*ratePercent/100),status:'pending',sourceType:'apparel',sourceLabel:'Kingdom Vibe Apparel',
      earnedAt:order.paidAt,payoutDate:payoutDate(instant(clock)),paidAt:'',paymentReference:'',createdAt:order.paidAt});
  }
  if(!order.confirmationQueuedAt){order.confirmationQueuedAt=instant(clock).toISOString();await queueConfirmation(order);}
  return order;
}

export function expireShopSession(store,session,{clock=()=>new Date()}={}){
  const order=store.shopOrders?.find(item=>item.id===session?.metadata?.order_id||item.stripeSessionId===session?.id);
  if(!order||order.status!=='pending')return order;
  order.status='expired';order.expiredAt=instant(clock).toISOString();
  const reservation=store.shopReservations?.find(item=>item.id===order.reservationId);
  if(reservation?.status==='pending'){reservation.status='expired';reservation.expiredAt=order.expiredAt;}
  return order;
}

export function refundShopOrder(store,orderId,{clock=()=>new Date(),id=prefix=>`${prefix}_${Date.now()}`}={}){
  const order=store.shopOrders?.find(item=>item.id===orderId);
  if(!order) throw Object.assign(new Error('Shop order not found.'),{statusCode:404});
  if(order.status==='refunded')return order;
  restoreShopInventory(store,order,clock);order.status='refunded';order.fulfillmentStatus='refunded';order.refundedAt=instant(clock).toISOString();
  flagOrderCommissionsForReversal(store,{orderId:order.id,reason:'Apparel order refunded. Reverse or recover this reward.'},{id,now:()=>order.refundedAt});
  return order;
}
