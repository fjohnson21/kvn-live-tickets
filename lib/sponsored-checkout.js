import {claimAccess} from './sponsored-passes.js';
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
export async function recoverSponsoredCheckout({readStore,writeStore,stripe,finalizeSession},accessToken) {
  if(!stripe)fail('Secure checkout is temporarily unavailable.',503);
  const snapshot=readStore(),claim=claimAccess(snapshot,accessToken);
  const order=snapshot.orders.find(o=>o.sponsoredClaimId===claim.id&&o.orderType==='sponsored_upgrade'&&['pending','checkout_failed'].includes(o.status));
  if(!order)fail('No pending upgrade found. Refresh your pass.');
  let session;
  if(order.stripeSessionId)session=await stripe.checkout.sessions.retrieve(order.stripeSessionId);
  else {
    if(!order.checkoutSessionConfig||Date.now()-Date.parse(order.createdAt)>23*3600000)fail('This checkout needs owner review before another payment attempt. Your complimentary pass remains valid.');
    // The exact original configuration and key can recover an uncertain creation response without a new charge/session.
    session=await stripe.checkout.sessions.create(order.checkoutSessionConfig,{idempotencyKey:`sponsored-upgrade:${order.id}`});
  }
  const latest=readStore(),current=latest.orders.find(o=>o.id===order.id);
  if(!current)fail('Upgrade order needs owner review.');
  if(['pending','checkout_failed'].includes(current.status)){
    current.stripeSessionId=session.id;current.stripeCheckoutUrl=session.url||'';
    current.status=session.status==='expired'?'expired':'pending';
    if(session.expires_at)current.checkoutExpiresAt=new Date(session.expires_at*1000).toISOString();writeStore(latest);
  }
  if(session.payment_status==='paid'&&finalizeSession){await finalizeSession(session);return {refresh:true};}
  if(session.status==='expired')return {refresh:true};
  if(!session.url)return {refresh:true};
  return {url:session.url};
}
