export async function verifiedRide(stripe,id,sessionId){
 const s=await stripe.checkout.sessions.retrieve(sessionId,{expand:['payment_intent.latest_charge']});
 if(s.metadata?.product!=='luxride'||s.metadata?.luxride_order!==id||s.payment_status!=='paid'||s.currency!=='usd')throw Error('Verified LuxRide booking required');
 const pi=s.payment_intent,charge=pi?.latest_charge;
 if(!pi?.id||!charge?.id||charge.disputed)throw Error('Payment requires individual review');
 return {s,pi,charge};
}
export async function checkCancellation(stripe,b){const {charge}=await verifiedRide(stripe,b.id,b.session);if(charge.amount_refunded>0)throw Error('Payment already refunded');const refunds=await stripe.refunds.list({charge:charge.id,limit:100});if(refunds.data.some(r=>!['failed','canceled'].includes(r.status)))throw Error('Refund already requested');return {ok:true};}
export async function refundRide(stripe,b,now=Date.now()){
 if(!Number.isSafeInteger(b.amount)||b.amount<=0||!Number.isSafeInteger(b.created)||b.created>now+60000)throw Error('Invalid refund');
 const {s,pi,charge}=await verifiedRide(stripe,b.id,b.session);
 if(b.amount>s.amount_total)throw Error('Refund exceeds payment');
 const matches=r=>r.metadata?.product==='luxride'&&r.metadata?.luxride_order===b.id&&r.metadata?.operation==='cancel:'+b.id&&r.amount===b.amount;
 let refund;
 if(b.refundId){refund=await stripe.refunds.retrieve(b.refundId);if(!matches(refund))throw Error('Refund identity mismatch');}
 else{
  // Persistent metadata lets us recover a lost response after Stripe's idempotency retention window.
  const list=await stripe.refunds.list({payment_intent:pi.id,limit:100});refund=list.data.find(matches);
  if(!refund){if(list.has_more||list.data.some(r=>!['failed','canceled'].includes(r.status))||charge.amount_refunded>0||now-b.created>23*3600000)throw Error('Refund requires individual review');
   refund=await stripe.refunds.create({payment_intent:pi.id,amount:b.amount,metadata:{product:'luxride',luxride_order:b.id,operation:'cancel:'+b.id}},{idempotencyKey:'luxride-cancel-'+b.id});
  }
 }
 return {refund:{id:refund.id,status:refund.status,amount:refund.amount}};
}
export async function sendAccountCode(b,env=process.env,fetchImpl=fetch){
 if(!/^[a-f0-9-]{36}$/.test(b.id)||(!b.welcome&&!/^\d{6}$/.test(b.code))||typeof b.email!=='string'||b.email.length>200||!/^\S+@\S+\.\S+$/.test(b.email)||!env.RESEND_API_KEY)throw Error('Invalid sign-in request');
 const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':(b.welcome?'luxride-welcome-':'luxride-login-')+b.id},body:JSON.stringify({from:env.LUXRIDE_EMAIL_FROM||'LuxRide Airport Transit <luxride@tickets.kvnlive.com>',to:[b.email],reply_to:env.LUXRIDE_OWNER_EMAIL,subject:b.welcome?'Welcome to your LuxRide account':'Your LuxRide sign-in code',text:b.welcome?`LuxRide Airport Transit\n\nYour account is ready. View trip progress, saved addresses, bookings and ride credit.\n\nSign in: ${new URL(env.LUXRIDE_CALLBACK_ORIGIN).origin}/account\nUse this email address and request a six-digit code. No password needed.\n\nReply to this email for help.\nA venture of Kingdom Alliance Partners Inc.` :`LuxRide Airport Transit\n\nYour sign-in code is ${b.code}. It expires in 10 minutes. Do not share this code.\n\nIf you did not request this, ignore this email.\n\nA venture of Kingdom Alliance Partners Inc.`,tags:[{name:'initiative',value:'LUXRIDE'}]})});if(!response.ok)throw Error('Sign-in email unavailable');return {sent:true};
}
