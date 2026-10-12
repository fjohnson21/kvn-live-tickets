import {allocateInvitations,beginClaim,confirmClaim,claimAccess,invitationInfo,sponsoredReport,VIP_PRODUCT} from './sponsored-passes.js';
import {allocateEarlyRelease,pendingEarlyReleaseUnits} from './checkout.js';
export function registerSponsoredRoutes(app,{auth,owner,readStore,writeStore,baseUrl,claimPageUrl,retryUpgrade,sendMail=defaultMail}) {
  const limits=new Map();
  const protect=(req,res,next)=>{
    res.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer'});
    if(req.headers.origin&&![new URL(baseUrl).origin,...(claimPageUrl?[new URL(claimPageUrl).origin]:[])].includes(req.headers.origin))return res.status(403).json({error:'Use the KV Live website.'});
    next();
  };
  const limited=(req,res,next)=>{
    const time=Date.now(),key=req.ip||req.socket.remoteAddress;
    for(const [k,v] of limits)if(v.until<time)limits.delete(k);
    const item=limits.get(key)||{count:0,until:time+600000};item.count++;limits.set(key,item);
    if(item.count>100||limits.size>10000)return res.status(429).json({error:'Too many requests. Please try again later.'});next();
  };
  const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.statusCode||500).json({error:e.statusCode?e.message:'Unable to process this request. Please try again.'});}};
  const url=(kind,secret)=>`${claimPageUrl||`${baseUrl}/sponsored.html`}#${kind}=${encodeURIComponent(secret)}`;
  const view=(s,c)=>{
    const order=s.orders.find(o=>o.id===(c.upgradeOrderId||c.orderId)),e=s.events.find(e=>e.id===order.eventId),product=e.products.find(p=>p.id===VIP_PRODUCT);
    const price=product?allocateEarlyRelease(product,c.quantity||1,pendingEarlyReleaseUnits(s.orders,e.id,product.id)).subtotal:null;
    const reserved=s.orders.filter(o=>o.eventId===e.id&&(o.orderType==='sponsored_upgrade'?['pending','checkout_failed'].includes(o.status):o.status==='pending'&&Date.parse(o.checkoutExpiresAt)>Date.now())).flatMap(o=>o.items||[]).filter(i=>i.productId===VIP_PRODUCT).reduce((n,i)=>n+Number(i.quantity||0),0);
    const pending=s.orders.find(o=>o.sponsoredClaimId===c.id&&o.orderType==='sponsored_upgrade'&&['pending','checkout_failed'].includes(o.status));
    return {quantity:c.quantity||1,checkout:pending?{status:pending.status,url:pending.stripeCheckoutUrl||'',expiresAt:pending.checkoutExpiresAt}:null,accessToken:c.accessToken,name:c.name,email:c.email,phone:c.phone,eventId:e.id,claimedAt:c.claimedAt,upgraded:Boolean(c.upgradeOrderId),orderStatus:order.paymentAttention?'payment_review':order.status,tickets:order.tickets.map(t=>({code:t.code,ticketName:t.ticketName,status:t.status||'active',checkedIn:t.checkedIn})),vip:{price,sizes:product?.includedApparel?.sizes||[],available:Boolean(product&&Number(product.inventory)-Number(product.sold)-reserved>=Number(c.quantity||1))},enrollmentUrl:'/disciples.html'};
  };
  app.use('/api/sponsored',protect);
  app.get('/api/sponsored/admin',auth,owner,wrap((req,res)=>{const s=readStore();res.json({...sponsoredReport(s),invitations:(s.sponsoredInvitations||[]).map(i=>({id:i.id,maxPasses:i.maxPasses||1,discipleId:i.discipleId,claimedAt:i.claimedAt,sentAt:i.sentAt,url:url('invite',i.token)})),disciples:(s.disciples||[]).filter(d=>d.status==='active').map(d=>({id:d.id,name:d.name,promoUrl:url('ref',d.code)}))});}));
  app.post('/api/sponsored/allocate',auth,owner,wrap((req,res)=>{const s=readStore(),invites=allocateInvitations(s,req.body,{actorId:req.user.id});writeStore(s);res.status(201).json({invitations:invites.map(i=>({id:i.id,url:url('invite',i.token),discipleId:i.discipleId}))});}));
  app.post('/api/sponsored/mark-sent',auth,owner,wrap((req,res)=>{const s=readStore(),inv=(s.sponsoredInvitations||[]).find(i=>i.id===req.body.id);if(!inv)return res.status(404).json({error:'Invitation not found.'});inv.sentAt ||= new Date().toISOString();inv.sentBy=req.user.id;writeStore(s);res.json({ok:true});}));
  app.post('/api/sponsored/info',limited,wrap((req,res)=>res.json(invitationInfo(readStore(),req.body.invitationToken,req.body.discipleCode))));
  app.post('/api/sponsored/request',limited,wrap(async(req,res)=>{
    const s=readStore(),pending=beginClaim(s,req.body);writeStore(s);
    try{await sendMail({to:pending.email,subject:'Verify your KAP sponsored KV Live pass',text:`Hello ${pending.name},\n\nKAP has invited you to KV Live on November 21, 2026, at the Dennis A. Wicker Civic Center, Sanford, NC. Your requested complimentary general-admission passes include no apparel. Joining the Kingdom Disciple program is optional.\n\nVerify your email and claim your pass within 30 minutes:\n${url('verify',pending.verificationToken)}\n\nMaximum two passes per claim, subject to availability. This email and phone cannot be used for another complimentary claim for this event. If you did not request this email, ignore it.\n\nKingdom Vibe Network`});}
    catch(e){const latest=readStore();latest.sponsoredClaims=(latest.sponsoredClaims||[]).filter(c=>c.id!==pending.claimId||c.claimedAt);writeStore(latest);throw Object.assign(new Error('Verification email could not be sent. Please try again.'),{statusCode:502});}
    res.status(202).json({message:'Check your email to verify and claim your pass. Your pass is issued only after verification.'});
  }));
  const confirmations=new Map();
  app.post('/api/sponsored/confirm',limited,wrap(async(req,res)=>{
    const s=readStore(),c=confirmClaim(s,req.body.verificationToken);writeStore(s);
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
  if(!result.ok)throw new Error('Email provider rejected message');
}
