import {reservesTicketInventory} from './checkout.js';
import {commerceClientIdentity} from './commerce-client-identity.js';
import {PROMO_VIP_PRICE} from './promo-vip.js';
import {refreshVerification,issueManualPass,checkClaimLaunch,allocateInvitations,beginClaim,confirmClaim,claimAccess,invitationInfo,sponsoredReport,VIP_PRODUCT} from './sponsored-passes.js';
import {allocateEarlyRelease,pendingEarlyReleaseUnits} from './checkout.js';
export function registerSponsoredRoutes(app,{auth,owner,readStore,writeStore,baseUrl,claimPageUrl,launchPolicy={},retryUpgrade,sendMail=defaultMail}) {
  const limits=new Map();
  const protect=(req,res,next)=>{
    res.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer'});
    if(req.headers.origin&&![new URL(baseUrl).origin,...(claimPageUrl?[new URL(claimPageUrl).origin]:[])].includes(req.headers.origin))return res.status(403).json({error:'Use the KV Live website.'});
    next();
  };
  const limited=(req,res,next)=>{
    const time=Date.now(),key=commerceClientIdentity(req);
    for(const [k,v] of limits)if(v.until<time)limits.delete(k);
    const item=limits.get(key)||{count:0,until:time+600000};item.count++;limits.set(key,item);
    if(item.count>100||limits.size>10000)return res.status(429).json({error:'Too many requests. Please try again later.'});next();
  };
  const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.statusCode||500).json({error:e.statusCode?e.message:'Unable to process this request. Please try again.'});}};
  const url=(kind,secret)=>`${claimPageUrl||`${baseUrl}/sponsored.html`}#${kind}=${encodeURIComponent(secret)}`;
  const view=(s,c)=>{
    const order=s.orders.find(o=>o.id===(c.upgradeOrderId||c.orderId)),e=s.events.find(e=>e.id===order.eventId),product=e.products.find(p=>p.id===VIP_PRODUCT);
    const price=product?PROMO_VIP_PRICE*(c.quantity||1):null;
    const reserved=s.orders.filter(o=>o.eventId===e.id&&reservesTicketInventory(o)).flatMap(o=>o.items||[]).filter(i=>i.productId===VIP_PRODUCT).reduce((n,i)=>n+Number(i.quantity||0),0);
    const pending=s.orders.find(o=>o.sponsoredClaimId===c.id&&o.orderType==='sponsored_upgrade'&&['pending','checkout_failed'].includes(o.status));
    return {quantity:c.quantity||1,checkout:pending?{status:pending.status,url:pending.stripeCheckoutUrl||'',expiresAt:pending.checkoutExpiresAt}:null,accessToken:c.accessToken,name:c.name,email:c.email,phone:c.phone,eventId:e.id,claimedAt:c.claimedAt,upgraded:Boolean(c.upgradeOrderId),orderStatus:order.paymentAttention?'payment_review':order.status,tickets:order.tickets.map(t=>({code:t.code,ticketName:t.ticketName,status:t.status||'active',checkedIn:t.checkedIn})),vip:{price:pending?.amountSubtotal??price,sizes:product?.includedApparel?.sizes||[],available:Boolean(product&&Number(product.inventory)-Number(product.sold)-reserved>=Number(c.quantity||1))},enrollmentUrl:'/disciples.html'};
  };
  app.use('/api/sponsored',protect);
  app.get('/api/sponsored/admin',auth,owner,wrap((req,res)=>{const s=readStore();res.json({...sponsoredReport(s),pendingVerifications:(s.sponsoredClaims||[]).filter(c=>!c.claimedAt&&!c.supersededAt&&!s.sponsoredClaims.some(other=>other.claimedAt&&(other.email===c.email||other.phone===c.phone))).map(c=>({id:c.id,name:c.name,email:c.email,phone:c.phone,quantity:c.quantity||1,createdAt:c.createdAt,expiresAt:c.expiresAt,verificationEmail:c.verificationEmail||{status:'unknown'},expired:Date.parse(c.expiresAt)<=Date.now()})),claims:sponsoredReport(s).claims.map(c=>({...c,passUrl:url('pass',s.sponsoredClaims.find(x=>x.id===c.id).accessToken)})),invitations:(s.sponsoredInvitations||[]).map(i=>({id:i.id,maxPasses:i.maxPasses||1,discipleId:i.discipleId,claimedAt:i.claimedAt,sentAt:i.sentAt,url:url('invite',i.token)})),disciples:(s.disciples||[]).filter(d=>d.status==='active').map(d=>({id:d.id,name:d.name,promoUrl:url('ref',d.code)}))});}));
  const verificationMessage=pending=>({to:pending.email,subject:'Verify your KAP sponsored KV Live pass',text:`Hello ${pending.name},\n\nVerify your email within 30 minutes to claim your requested complimentary general-admission pass(es) for KV Live on November 21, 2026, at Dennis A. Wicker Civic Center, Sanford, NC:\n${url('verify',pending.verificationToken)}\n\nSubject to availability. No apparel included. Joining the Kingdom Disciple program is optional.\n\nKingdom Vibe Network`});
  app.post('/api/sponsored/verification/resend',auth,owner,wrap(async(req,res)=>{
    const s=readStore(),pending=refreshVerification(s,req.body.claimId,{actorId:req.user.id});writeStore(s);
    let delivery;try{const result=await sendMail(verificationMessage(pending));delivery={status:'accepted',messageId:result?.id||'',attemptedAt:new Date().toISOString()};}
    catch(e){delivery={status:'failed',attemptedAt:new Date().toISOString(),error:String(e.message).slice(0,500)};}
    const latest=readStore(),c=latest.sponsoredClaims.find(c=>c.id===pending.claimId);
    // A newer resend may have rotated the token while this provider call was in flight.
    if(c?.expiresAt===s.sponsoredClaims.find(x=>x.id===pending.claimId).expiresAt&&c?.verificationHash===s.sponsoredClaims.find(x=>x.id===pending.claimId).verificationHash)c.verificationEmail=delivery;
    writeStore(latest);res.status(delivery.status==='accepted'?200:502).json({ok:delivery.status==='accepted',emailStatus:delivery.status,error:delivery.error});
  }));
  const issueEmails=new Map();
  app.post('/api/sponsored/issue',auth,owner,wrap(async(req,res)=>{
    const s=readStore(),existing=(s.sponsoredClaims||[]).some(c=>c.manualRequestId===req.body.requestId);
    const c=issueManualPass(s,req.body,{actorId:req.user.id});writeStore(s);
    const original=s.orders.find(o=>o.id===c.orderId);
    if(!existing&&!issueEmails.has(c.id)){
      const operation=(async()=>{
        let delivery;try{const result=await sendMail({to:c.email,subject:'Your KAP sponsored KV Live pass',text:`You're in, ${c.name}.\n\nKV Live • November 21, 2026 • Dennis A. Wicker Civic Center, Sanford, NC\n${c.quantity} general-admission pass(es) • No apparel • $0\n\nOpen your pass and QR code:\n${url('pass',c.accessToken)}\n\nKingdom Vibe Network`});delivery={status:'accepted',messageId:result?.id||'',attemptedAt:new Date().toISOString()};}catch(e){delivery={status:'failed',error:String(e.message).slice(0,500),attemptedAt:new Date().toISOString()};}
        const latest=readStore(),order=latest.orders.find(o=>o.id===c.orderId);order.confirmationEmail=delivery;writeStore(latest);
      })();issueEmails.set(c.id,operation);
    }
    if(issueEmails.has(c.id)){try{await issueEmails.get(c.id);}finally{issueEmails.delete(c.id);}}
    const latest=readStore(),order=latest.orders.find(o=>o.id===c.orderId);
    res.status(existing?200:201).json({ok:true,claimId:c.id,passUrl:url('pass',c.accessToken),tickets:order.tickets,emailStatus:order.confirmationEmail?.status||original.confirmationEmail?.status||'unknown'});
  }));
  app.post('/api/sponsored/allocate',auth,owner,wrap((req,res)=>{const s=readStore(),invites=allocateInvitations(s,req.body,{actorId:req.user.id});writeStore(s);res.status(201).json({invitations:invites.map(i=>({id:i.id,url:url('invite',i.token),discipleId:i.discipleId}))});}));
  app.post('/api/sponsored/mark-sent',auth,owner,wrap((req,res)=>{const s=readStore(),inv=(s.sponsoredInvitations||[]).find(i=>i.id===req.body.id);if(!inv)return res.status(404).json({error:'Invitation not found.'});inv.sentAt ||= new Date().toISOString();inv.sentBy=req.user.id;writeStore(s);res.json({ok:true});}));
  app.post('/api/sponsored/info',limited,wrap((req,res)=>{const s=readStore();checkClaimLaunch(s,req.body,launchPolicy);res.json(invitationInfo(s,req.body.invitationToken,req.body.discipleCode));}));
  app.post('/api/sponsored/request',limited,wrap(async(req,res)=>{
    const s=readStore(),pending=beginClaim(s,req.body,launchPolicy);s.sponsoredClaims.find(c=>c.id===pending.claimId).verificationEmail={status:'pending',attemptedAt:new Date().toISOString()};writeStore(s);
    try{const result=await sendMail({to:pending.email,subject:'Verify your KAP sponsored KV Live pass',text:`Hello ${pending.name},\n\nKAP has invited you to KV Live on November 21, 2026, at the Dennis A. Wicker Civic Center, Sanford, NC. Your requested complimentary general-admission passes include no apparel. Joining the Kingdom Disciple program is optional.\n\nYou are not done yet. Click below within 30 minutes to verify your email and automatically issue your pass(es), subject to availability:\n${url('verify',pending.verificationToken)}\n\nMaximum two passes per claim, subject to availability. This email and phone cannot be used for another complimentary claim for this event. If you did not request this email, ignore it.\n\nKingdom Vibe Network`});const latest=readStore(),c=latest.sponsoredClaims.find(c=>c.id===pending.claimId);if(c?.verificationHash===s.sponsoredClaims.find(x=>x.id===pending.claimId).verificationHash)c.verificationEmail={status:'accepted',messageId:result?.id||'',attemptedAt:new Date().toISOString()};writeStore(latest);}
    catch(e){const latest=readStore(),c=(latest.sponsoredClaims||[]).find(c=>c.id===pending.claimId);if(c?.verificationHash===s.sponsoredClaims.find(x=>x.id===pending.claimId).verificationHash)c.verificationEmail={status:'failed',error:String(e.message).slice(0,500),attemptedAt:new Date().toISOString()};writeStore(latest);throw Object.assign(new Error('Verification email could not be sent. Contact the event team to resend verification.'),{statusCode:502});}
    res.status(202).json({message:'Check your email to verify and claim your pass. Your pass is issued only after verification.'});
  }));
  const confirmations=new Map();
  app.post('/api/sponsored/confirm',limited,wrap(async(req,res)=>{
    const s=readStore(),c=confirmClaim(s,req.body.verificationToken,launchPolicy);writeStore(s);
    const order=s.orders.find(o=>o.id===c.orderId);
    if(order.confirmationEmail?.status!=='sent'){
      if(!confirmations.has(c.id)){
        const operation=(async()=>{let result;try{await sendMail({to:c.email,subject:'Your KAP sponsored KV Live pass',text:`You're in, ${c.name}.\n\nKV Live • November 21, 2026 • Dennis A. Wicker Civic Center, Sanford, NC\n${c.quantity||1} general-admission pass(es) • No apparel • $0\n\nOpen your pass and QR code, explore an optional VIP upgrade, or learn about the Kingdom Disciple program:\n${url('pass',c.accessToken)}\n\nKeep this private link for later access. No enrollment or purchase is required.\n\nKingdom Vibe Network`});result={status:'sent',sentAt:new Date().toISOString()};}catch{result={status:'failed'};}
          const latest=readStore(),current=latest.orders.find(o=>o.id===c.orderId);if(current){current.confirmationEmail=result;writeStore(latest);}return result;
        })();confirmations.set(c.id,operation);
      }
      try{await confirmations.get(c.id);}finally{confirmations.delete(c.id);}
    }
    const latest=readStore();res.json({...view(latest,c),emailStatus:latest.orders.find(o=>o.id===c.orderId)?.confirmationEmail?.status});
  }));
  app.post('/api/sponsored/retry-upgrade',limited,wrap(async(req,res)=>{if(!retryUpgrade)return res.status(503).json({error:'Checkout recovery unavailable.'});res.json(await retryUpgrade(req.body.accessToken));}));
  app.post('/api/sponsored/pass',limited,wrap((req,res)=>{const s=readStore();res.json(view(s,claimAccess(s,req.body.accessToken)));}));
}
async function defaultMail(message) {
  if(!process.env.RESEND_API_KEY)throw new Error('Email not configured');
  const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM||'Kingdom Vibe Network <info@tickets.kvnlive.com>',...message}),signal:AbortSignal.timeout(15000)});
  const data=await result.json().catch(()=>({}));
  if(!result.ok)throw new Error(`Email provider rejected message (${result.status}): ${data.message||'Unknown error'}`);
  return data;
}
