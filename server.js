import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { readStore, writeStore, id, slugify, ticketCode } from './store.js';
import { applyApparelConfig } from './lib/apparel.js';
import { normalizeCustomer, validateCustomer } from './lib/customer.js';
import { applyEarlyReleasePricing, checkoutExpiration, normalizeTicketCartItem, orderItemSubtotal, pendingEarlyReleaseUnits } from './lib/checkout.js';
import { finalizeOrderItems } from './lib/finalize.js';
import { eventReportCsv } from './lib/report.js';
import { synchronizeKvnLive2026Event } from './lib/kvn-live-2026.js';
import { createTicketConfirmationDispatcher, sendDiscipleWelcome, sendOwnerPasswordReset } from './lib/email.js';
import { createOwnerPasswordStore, createPasswordResetManager } from './lib/owner-auth.js';
import { upsertDiscipleFromApplication } from './lib/disciple-sync.js';
import { receiveDiscipleApplication } from './lib/disciple-intake.js';
import { setLeaderStatus,assignTeamMember,endTeamAssignment } from './lib/disciple-teams.js';
import { createCommunityBonus,reverseCommunityBonusForCommission } from './lib/disciple-community-bonus.js';
import { awardLeaderBundle,inviteMemberBundle } from './lib/disciple-bundles.js';
import { publicShopCatalog } from './lib/shop-catalog.js';
import { reserveShopInventory } from './lib/shop-inventory.js';
import { buildShopCheckoutSession, normalizeShopCart, ShopCheckoutError } from './lib/shop-checkout.js';
import { expireShopSession, finalizeShopSession, refundShopOrder } from './lib/shop-finalize.js';
import { deliverShopConfirmation } from './lib/shop-email.js';
import { shopMetrics, shopOrdersCsv } from './lib/shop-report.js';

const startupStore = readStore();
if (synchronizeKvnLive2026Event(startupStore)) writeStore(startupStore);

const app = express();
app.set('trust proxy', true);
const port = process.env.PORT || 3000;
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const sessions = new Map();
const loginAttempts = new Map();
const resetAttempts = new Map();
const sessionCookieName = '__Host-kvn_session';
const sessionTtlMs = 12 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const loginAttemptLimit = 5;
const resetWindowMs = 60 * 60 * 1000;
const resetAttemptLimit = 3;
const runtimeDataDir = process.env.DATA_DIR || path.resolve('data');
const ownerPasswords = createOwnerPasswordStore({ dataDir: runtimeDataDir });
const passwordResets = createPasswordResetManager();
const dispatchTicketConfirmation = createTicketConfirmationDispatcher();
const requireDir=p=>fs.mkdirSync(p,{recursive:true}); const pathJoin=path.join; const fsWrite=fs.writeFileSync;

// Stripe webhook must receive the raw request body before JSON parsing.
app.post('/api/webhook', express.raw({type:'application/json'}), async (req,res)=>{
  try {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Webhook not configured');
    const sig=req.headers['stripe-signature'];
    const event=stripe.webhooks.constructEvent(req.body,sig,process.env.STRIPE_WEBHOOK_SECRET);
    if(event.type==='checkout.session.completed' && event.data.object.payment_status==='paid'){
      if(event.data.object.metadata?.order_type==='apparel'){
        const d=readStore();await finalizeShopSession(d,event.data.object,{id,queueConfirmation:order=>deliverShopConfirmation({order,apiKey:process.env.RESEND_API_KEY,from:process.env.SHOP_EMAIL_FROM||'Kingdom Vibe Shop <shop@kvnlive.com>'})});writeStore(d);
      } else await finalizeSession(event.data.object);
    }
    if(event.type==='checkout.session.expired'){
      if(event.data.object.metadata?.order_type==='apparel'){const d=readStore();expireShopSession(d,event.data.object);writeStore(d);}
      else expireSession(event.data.object);
    }
    res.json({received:true});
  } catch(err) { console.error('Webhook error',err.message); res.status(400).send(`Webhook Error: ${err.message}`); }
});

app.use(express.json({limit:'2mb'}));
app.use(express.static('public'));
const uploadDir = process.env.UPLOAD_DIR || path.resolve('public/uploads');
requireDir(uploadDir);
app.use('/uploads', express.static(uploadDir));

app.get('/api/shop/catalog',(req,res)=>{
  res.set('Cache-Control','public, max-age=60').json(publicShopCatalog(readStore()));
});

app.post('/api/shop/checkout',async(req,res)=>{
  try{
    const email=String(req.body.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Enter a valid email address.'});
    const d=readStore(),normalized=normalizeShopCart(d,req.body.cart);
    if(!stripe) return res.status(503).json({error:'Apparel checkout is not configured.'});
    const discipleCode=String(req.body.discipleCode||'').trim().toUpperCase();
    const disciple=d.disciples.find(item=>item.code===discipleCode&&item.status==='active');
    const orderId=id('sho');
    const reservation=reserveShopInventory(d,{orderId,lines:normalized.lines});
    const order={id:orderId,orderType:'apparel',status:'pending',buyerEmail:email,items:normalized.lines,
      merchandiseSubtotal:normalized.totals.merchandiseSubtotal,shippingAmount:normalized.totals.shippingAmount,
      amountSubtotal:normalized.totals.merchandiseSubtotal,reservationId:reservation.id,checkoutExpiresAt:reservation.expiresAt,
      discipleId:disciple?.id||'',discipleCode:disciple?.code||'',stripeSessionId:'',createdAt:new Date().toISOString()};
    d.shopOrders.push(order);writeStore(d);
    try{
      const config=buildShopCheckoutSession(order,process.env.SHOP_ORIGIN||'https://www.kvnlive.com');
      config.expires_at=Math.floor(new Date(reservation.expiresAt).getTime()/1000);
      const session=await stripe.checkout.sessions.create(config);
      const latest=readStore(),pending=latest.shopOrders.find(item=>item.id===orderId);
      if(pending){pending.stripeSessionId=session.id;pending.checkoutExpiresAt=session.expires_at?new Date(session.expires_at*1000).toISOString():pending.checkoutExpiresAt;writeStore(latest);}
      res.status(201).json({url:session.url,orderId});
    }catch(error){
      const latest=readStore(),pending=latest.shopOrders.find(item=>item.id===orderId),held=latest.shopReservations.find(item=>item.id===reservation.id);
      if(pending){pending.status='checkout_failed';pending.checkoutError=String(error.message||error);pending.updatedAt=new Date().toISOString();}
      if(held&&held.status==='pending'){held.status='released';held.releasedAt=new Date().toISOString();}
      writeStore(latest);
      if(/tax/i.test(String(error.message||''))) return res.status(503).json({error:'Apparel checkout tax configuration requires attention.'});
      throw error;
    }
  }catch(error){
    if(error instanceof ShopCheckoutError||error?.statusCode) return res.status(error.statusCode||400).json({error:error.message});
    console.error('Shop checkout error',error);res.status(500).json({error:'Unable to start apparel checkout.'});
  }
});

app.get('/api/shop/orders/:id/receipt',(req,res)=>{
  const order=readStore().shopOrders.find(item=>item.id===req.params.id&&item.stripeSessionId===String(req.query.session_id||''));
  if(!order||order.status!=='paid')return res.status(404).json({error:'Paid shop order not found.'});
  res.set('Cache-Control','no-store').json({order:{id:order.id,status:order.status,fulfillmentStatus:order.fulfillmentStatus,items:order.items,collectorNumbers:order.collectorNumbers,merchandiseSubtotal:order.merchandiseSubtotal,shippingAmount:order.shippingAmount,taxAmount:order.taxAmount,amountTotal:order.amountTotal,shipsBeginning:'2026-10-15'}});
});

const safeUser = u => u ? ({id:u.id,name:u.name,email:u.email,role:u.role,organizationId:u.organizationId,permissions:u.permissions||[]}) : null;
function cookieValue(req,name){ const prefix=`${name}=`; return String(req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(prefix))?.slice(prefix.length)||''; }
function sameSecret(left,right){ const a=crypto.createHash('sha256').update(String(left)).digest(),b=crypto.createHash('sha256').update(String(right)).digest(); return crypto.timingSafeEqual(a,b); }
function clientAddress(req){ return String(req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || ''; }
function sessionCookie(token,maxAge=Math.floor(sessionTtlMs/1000)){ return `${sessionCookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }
function pruneSessions(){ const now=Date.now(); for(const [token,session] of sessions)if(session.expiresAt<=now)sessions.delete(token); while(sessions.size>1000)sessions.delete(sessions.keys().next().value); }
function auth(req,res,next){ res.set('Cache-Control','no-store'); const token=cookieValue(req,sessionCookieName),session=sessions.get(token); if(!session||session.expiresAt<=Date.now()){if(token)sessions.delete(token);return res.status(401).json({error:'Sign in required.'});} const user=readStore().users.find(u=>u.id===session.userId); if(!user) return res.status(401).json({error:'Sign in required.'}); req.user=user; req.sessionToken=token; next(); }
function owner(req,res,next){ if(req.user?.role!=='owner') return res.status(403).json({error:'Owner access required.'}); next(); }
function canManage(user,event){ return user.role==='owner' || ((user.role==='organizer'||user.role==='staff') && event.organizationId===user.organizationId); }
function publicEvent(e,orders=[]){ return {...e, products:e.products.map(p=>{const reserved=pendingEarlyReleaseUnits(orders,e.id,p.id);const remaining=p.earlyRelease?.enabled?Math.max(0,Number(p.earlyRelease.unitLimit||0)-Number(p.sold||0)-reserved):0;return {...p,available:Math.max(0,p.inventory-p.sold),earlyRelease:p.earlyRelease?.enabled?{...p.earlyRelease,remaining}:p.earlyRelease};})}; }
function discipleRate(disciple,eventId){
  const override=(disciple.eventRates||[]).find(x=>x.eventId===eventId);
  return Math.max(0,Math.min(100,Number(override?.percent ?? disciple.defaultCommissionPercent ?? readStore().settings.defaultDiscipleCommissionPercent ?? 0)));
}
function eligibleCommissionBase(order){ return Math.max(0,(order.amountSubtotal||0)-(order.discountAmount||0)); }
function clamp(n,min,max){ return Math.max(min,Math.min(max,Number(n)||0)); }
function ticketUnits(items=[]){ return items.filter(i=>i.type==='ticket').reduce((n,i)=>n+i.quantity,0); }
function groupDiscountFor(product,qty){
  const g=product.group||{}; if(!g.enabled) return 0;
  const tiers=(g.tiers||[]).filter(t=>qty>=Number(t.minQty||0)).sort((a,b)=>Number(b.minQty)-Number(a.minQty));
  const rule=tiers[0]||((qty>=Number(g.minQty||1)&&qty<=Number(g.maxQty||9999))?g:null); if(!rule) return 0;
  const value=Number(rule.discountValue||0); return rule.discountType==='fixed'?Math.min(product.price,value):Math.round(product.price*clamp(value,0,100)/100);
}
function feeBreakdown(event,items,discountAmount,taxAmount){
  const f=event.feeSettings||{}; const strategy=['buyer','organizer','custom'].includes(f.strategy)?f.strategy:'buyer';
  const ticketSubtotal=items.filter(i=>i.type==='ticket').reduce((n,i)=>n+orderItemSubtotal(i),0);
  const ticketCount=ticketUnits(items); const kvn=Math.round(ticketSubtotal*Number(f.kvnPercent??2.95)/100)+ticketCount*Number(f.kvnFixedPerTicket??195);
  const base=Math.max(0,items.reduce((n,i)=>n+orderItemSubtotal(i),0)-discountAmount+taxAmount);
  let buyerKvn=strategy==='buyer'?kvn:strategy==='custom'&&f.buyerPaysKvn?kvn:0;
  let merchant=0, buyerMerchant=0; const mp=Number(f.merchantPercent??2.9)/100, mf=Number(f.merchantFixed??30);
  if(strategy==='buyer'||(strategy==='custom'&&f.buyerPaysMerchant)){
    const target=base+buyerKvn; merchant=f.merchantGrossUp!==false?Math.max(0,Math.ceil((target+mf)/(1-mp)-target)):Math.round(target*mp)+mf; buyerMerchant=merchant;
  } else merchant=Math.round((base+buyerKvn)*mp)+mf;
  return {strategy,kvnFee:kvn,merchantFee:merchant,buyerKvnFee:buyerKvn,buyerMerchantFee:buyerMerchant,organizerKvnFee:kvn-buyerKvn,organizerMerchantFee:merchant-buyerMerchant};
}
async function processDiscipleCommission(d,order,event,session){
  if(!order.discipleId || order.discipleCommissionId) return;
  const disciple=d.disciples.find(x=>x.id===order.discipleId && x.status==='active'); if(!disciple) return;
  const rate=discipleRate(disciple,event.id), base=eligibleCommissionBase(order), amount=Math.round(base*rate/100);
  if(amount<=0) return;
  const now=new Date();
  const commission={id:id('com'),discipleId:disciple.id,eventId:event.id,orderId:order.id,ratePercent:rate,eligibleBase:base,amount,status:'pending',sourceType:'event_order',earnedAt:now.toISOString(),payoutDate:nextMonthlyPayoutDate(now),paidAt:'',paymentReference:'',createdAt:now.toISOString()};
  d.discipleCommissions.push(commission); order.discipleCommissionId=commission.id; order.discipleCommissionAmount=amount;
  createCommunityBonus(d,{commission,order},{id});
}
function nextMonthlyPayoutDate(date=new Date()){
  const y=date.getUTCFullYear(),m=date.getUTCMonth();
  return new Date(Date.UTC(m===11?y+1:y,m===11?0:m+1,15)).toISOString().slice(0,10);
}

app.get('/api/platform', (req,res)=>{ const d=readStore(); res.json({settings:d.settings, organizations:d.organizations.filter(o=>o.status==='approved').map(o=>({id:o.id,name:o.name,slug:o.slug})), events:d.events.filter(e=>e.status==='published').map(e=>publicEvent(e,d.orders))}); });
app.get('/api/events/:slug', (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.slug===req.params.slug && x.status==='published'); if(!e) return res.status(404).json({error:'Event not found.'}); const org=d.organizations.find(o=>o.id===e.organizationId); res.json({event:publicEvent(e,d.orders),organization:org&&{id:org.id,name:org.name,slug:org.slug}}); });

app.post('/api/auth/owner', (req,res)=>{
  res.set('Cache-Control','no-store');
  const configuredEmail=String(process.env.OWNER_EMAIL||'').trim().toLowerCase();
  if(!configuredEmail||!ownerPasswords.isConfigured()) return res.status(503).json({error:'Owner sign-in is not configured.'});
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  const attemptKey=`${clientAddress(req)}:${email}`,now=Date.now(); let attempts=loginAttempts.get(attemptKey);
  if(attempts&&attempts.resetAt<=now){loginAttempts.delete(attemptKey);attempts=null;}
  if(attempts?.count>=loginAttemptLimit){res.set('Retry-After',String(Math.ceil((attempts.resetAt-now)/1000)));return res.status(429).json({error:'Too many sign-in attempts. Try again later.'});}
  if(!sameSecret(email,configuredEmail)||!ownerPasswords.verify(password)){const next=attempts||{count:0,resetAt:now+loginWindowMs};next.count+=1;loginAttempts.set(attemptKey,next);return res.status(401).json({error:'Email or password is incorrect.'});}
  loginAttempts.delete(attemptKey);
  const user=readStore().users.find(candidate=>candidate.role==='owner');
  if(!user) return res.status(503).json({error:'Owner account is not configured.'});
  pruneSessions();
  const token=crypto.randomBytes(32).toString('hex');
  sessions.set(token,{userId:user.id,expiresAt:Date.now()+sessionTtlMs});
  res.setHeader('Set-Cookie',sessionCookie(token));
  res.json({user:safeUser(user)});
});
app.post('/api/auth/password-reset/request', async (req,res)=>{
  res.set('Cache-Control','no-store');
  const message='If that email matches the owner account, a secure reset link has been sent.';
  if(!process.env.RESEND_API_KEY) return res.status(503).json({error:'Password reset email is temporarily unavailable.'});
  const key=clientAddress(req),now=Date.now();let attempts=resetAttempts.get(key);
  if(attempts&&attempts.resetAt<=now){resetAttempts.delete(key);attempts=null;}
  if(attempts?.count>=resetAttemptLimit){res.set('Retry-After',String(Math.ceil((attempts.resetAt-now)/1000)));return res.status(429).json({message:'Please wait before requesting another reset link.'});}
  const next=attempts||{count:0,resetAt:now+resetWindowMs};next.count+=1;resetAttempts.set(key,next);
  const email=String(req.body.email||'').trim().toLowerCase(),configuredEmail=String(process.env.OWNER_EMAIL||'').trim().toLowerCase();
  res.status(202).json({message});
  if(configuredEmail&&sameSecret(email,configuredEmail)){
    setImmediate(async()=>{
      const token=passwordResets.issue(configuredEmail),resetUrl=`${baseUrl.replace(/\/$/,'')}/reset-password.html?token=${encodeURIComponent(token)}`;
      const result=await sendOwnerPasswordReset({email:configuredEmail,resetUrl,apiKey:process.env.RESEND_API_KEY,from:process.env.PASSWORD_RESET_EMAIL_FROM||process.env.EMAIL_FROM||'KVN Control Center <info@kvnlive.com>',endpoint:process.env.RESEND_API_URL||'https://api.resend.com/emails'});
      if(result.status!=='sent') console.error('Password reset email error',result.error);
    });
  }
});
app.post('/api/auth/password-reset/complete', (req,res)=>{
  res.set('Cache-Control','no-store');
  const token=String(req.body.token||''),newPassword=String(req.body.newPassword||'');
  if(newPassword.length<12||newPassword.length>128) return res.status(400).json({error:'Use a password between 12 and 128 characters.'});
  const reset=passwordResets.consume(token);
  if(!reset) return res.status(400).json({error:'This reset link is invalid or has expired.'});
  ownerPasswords.set(newPassword);
  sessions.clear();
  loginAttempts.clear();
  resetAttempts.clear();
  res.json({ok:true,message:'Your password has been updated. Sign in with your new password.'});
});
app.post('/api/auth/logout', (req,res)=>{ const token=cookieValue(req,sessionCookieName); if(token)sessions.delete(token); res.setHeader('Set-Cookie',sessionCookie('',0)); res.json({ok:true}); });
app.get('/api/me', auth, (req,res)=>res.json({user:safeUser(req.user)}));

app.post('/api/organizations/apply', (req,res)=>{ const d=readStore(); const name=String(req.body.name||'').trim(), email=String(req.body.email||'').trim(); if(!name||!email) return res.status(400).json({error:'Organization name and email are required.'}); const org={id:id('org'),name,slug:slugify(name),status:'pending',stripeAccountId:'',profile:{contactName:String(req.body.contactName||''),businessEmail:email,phone:String(req.body.phone||''),website:String(req.body.website||''),social:req.body.social||{},address:req.body.address||{},organizationType:String(req.body.organizationType||''),description:String(req.body.description||''),publicContact:Boolean(req.body.publicContact)},createdAt:new Date().toISOString()}; const user={id:id('usr'),name:req.body.contactName||name,email,role:'organizer',organizationId:org.id}; d.organizations.push(org); d.users.push(user); writeStore(d); res.status(201).json({organization:org,message:'Application submitted for KVN review.'}); });
app.put('/api/organizations/:id/profile', auth, (req,res)=>{ const d=readStore(),org=d.organizations.find(x=>x.id===req.params.id); if(!org||!(req.user.role==='owner'||req.user.organizationId===org.id)) return res.status(403).json({error:'No access.'}); const b=req.body||{}; if(b.name) {org.name=String(b.name);org.slug=org.slug||slugify(org.name);} org.profile={...(org.profile||{}),contactName:String(b.contactName??org.profile?.contactName??''),businessEmail:String(b.businessEmail??org.profile?.businessEmail??''),phone:String(b.phone??org.profile?.phone??''),website:String(b.website??org.profile?.website??''),organizationType:String(b.organizationType??org.profile?.organizationType??''),description:String(b.description??org.profile?.description??''),publicContact:Boolean(b.publicContact),social:{...(org.profile?.social||{}),...(b.social||{})},address:{...(org.profile?.address||{}),...(b.address||{})}}; org.onboarding={...(org.onboarding||{}),profile:true}; writeStore(d);res.json({organization:org}); });

app.get('/api/dashboard', auth, (req,res)=>{ const d=readStore(); const events=req.user.role==='owner'?d.events:d.events.filter(e=>e.organizationId===req.user.organizationId); const orders=req.user.role==='owner'?d.orders:d.orders.filter(o=>events.some(e=>e.id===o.eventId)); const organizations=req.user.role==='owner'?d.organizations:d.organizations.filter(o=>o.id===req.user.organizationId); const gross=orders.reduce((n,o)=>n+(o.amountTotal||0),0); res.json({user:safeUser(req.user),events,orders,organizations,discounts:d.discounts.filter(x=>req.user.role==='owner'||events.some(e=>e.id===x.eventId)),settings:d.settings,staff:d.users.filter(u=>u.role==='staff'&&(req.user.role==='owner'||u.organizationId===req.user.organizationId)),payouts:d.payouts.filter(p=>req.user.role==='owner'||organizations.some(o=>o.id===p.organizationId)),disciples:d.disciples.filter(x=>req.user.role==='owner'||x.organizationId===req.user.organizationId),discipleCommissions:d.discipleCommissions.filter(c=>req.user.role==='owner'||events.some(e=>e.id===c.eventId)),disciplePayouts:d.disciplePayouts.filter(p=>req.user.role==='owner'||d.disciples.some(x=>x.id===p.discipleId&&x.organizationId===req.user.organizationId)),discipleApplications:req.user.role==='owner'?d.discipleApplications:[],discipleTeams:req.user.role==='owner'?d.discipleTeams:[],discipleCommunityBonuses:req.user.role==='owner'?d.discipleCommunityBonuses:[],discipleBundleActions:req.user.role==='owner'?d.discipleBundleActions:[],communityBonusLegalApproved:process.env.COMMUNITY_BONUS_LEGAL_APPROVED==='true',metrics:{gross,orders:orders.length,tickets:orders.reduce((n,o)=>n+(o.tickets?.length||0),0),events:events.length}}); });

app.get('/api/shop/orders',auth,owner,(req,res)=>{const d=readStore();const status=String(req.query.status||'');const orders=status?d.shopOrders.filter(item=>item.status===status||item.fulfillmentStatus===status):d.shopOrders;res.json({orders,products:d.shopProducts,metrics:shopMetrics(d)});});
app.get('/api/shop/orders.csv',auth,owner,(req,res)=>{const d=readStore();res.type('text/csv').set('Content-Disposition','attachment; filename="kvn-shop-orders.csv"').send(shopOrdersCsv(d.shopOrders));});
app.post('/api/shop/orders/:id/resend',auth,owner,async(req,res)=>{const d=readStore(),order=d.shopOrders.find(item=>item.id===req.params.id);if(!order)return res.status(404).json({error:'Shop order not found.'});const confirmationEmail=await deliverShopConfirmation({order,apiKey:process.env.RESEND_API_KEY,from:process.env.SHOP_EMAIL_FROM||'Kingdom Vibe Shop <shop@kvnlive.com>',force:true});d.shopAudit.push({id:id('sha'),orderId:order.id,action:'confirmation_resend',userId:req.user.id,createdAt:new Date().toISOString()});writeStore(d);res.status(confirmationEmail.status==='sent'?200:502).json({confirmationEmail});});
app.post('/api/shop/orders/:id/ship',auth,owner,(req,res)=>{const d=readStore(),order=d.shopOrders.find(item=>item.id===req.params.id);if(!order)return res.status(404).json({error:'Shop order not found.'});const carrier=String(req.body.carrier||'').trim(),trackingNumber=String(req.body.trackingNumber||'').trim();if(!carrier||!trackingNumber)return res.status(400).json({error:'Carrier and tracking number are required.'});order.fulfillmentStatus='shipped';order.carrier=carrier;order.trackingNumber=trackingNumber;order.shippedAt=new Date().toISOString();d.shopAudit.push({id:id('sha'),orderId:order.id,action:'shipped',userId:req.user.id,meta:{carrier,trackingNumber},createdAt:order.shippedAt});writeStore(d);res.json({order});});
app.patch('/api/shop/orders/:id/size',auth,owner,(req,res)=>{const d=readStore(),order=d.shopOrders.find(item=>item.id===req.params.id);if(!order)return res.status(404).json({error:'Shop order not found.'});if(order.fulfillmentStatus!=='awaiting_fulfillment')return res.status(409).json({error:'Only unfulfilled orders can change size.'});const index=Number(req.body.itemIndex),size=String(req.body.size||''),line=order.items[index],product=d.shopProducts.find(item=>item.id===line?.productId);if(!line||!product?.sizes.includes(size))return res.status(400).json({error:'Choose a valid order item and size.'});if(Number(product.sizeInventory[size]||0)<line.quantity)return res.status(409).json({error:`Only ${Number(product.sizeInventory[size]||0)} ${size} remaining.`});product.sizeInventory[size]-=line.quantity;product.sizeInventory[line.size]+=line.quantity;const prior=line.size;line.size=size;line.unitAmount=product.unitAmountBySize[size];order.merchandiseSubtotal=order.items.reduce((n,item)=>n+item.unitAmount*item.quantity,0);d.shopAudit.push({id:id('sha'),orderId:order.id,action:'size_changed',userId:req.user.id,meta:{prior,size,index},createdAt:new Date().toISOString()});writeStore(d);res.json({order});});
app.post('/api/shop/orders/:id/refund',auth,owner,async(req,res)=>{const d=readStore(),order=d.shopOrders.find(item=>item.id===req.params.id);if(!order)return res.status(404).json({error:'Shop order not found.'});if(!stripe)return res.status(503).json({error:'Stripe is not configured.'});const session=await stripe.checkout.sessions.retrieve(order.stripeSessionId);if(!session.payment_intent)return res.status(409).json({error:'No payment intent available.'});await stripe.refunds.create({payment_intent:session.payment_intent});refundShopOrder(d,order.id);d.shopAudit.push({id:id('sha'),orderId:order.id,action:'refunded',userId:req.user.id,createdAt:new Date().toISOString()});writeStore(d);res.json({order});});

app.post('/api/events', auth, (req,res)=>{ const d=readStore(); const title=String(req.body.title||'Untitled Event').trim(); const orgId=req.user.role==='owner'?(req.body.organizationId||req.user.organizationId):req.user.organizationId; const event={id:id('evt'),organizationId:orgId,slug:`${slugify(title)}-${Math.random().toString(36).slice(2,6)}`,title,subtitle:req.body.subtitle||'',description:req.body.description||'',date:req.body.date||'',venue:req.body.venue||'',location:req.body.location||'',status:req.user.role==='owner'?'draft':'pending',featured:false,feeSettings:{strategy:'buyer',kvnPercent:2.95,kvnFixedPerTicket:195,merchantPercent:2.9,merchantFixed:30,merchantGrossUp:true,refundKvnFees:false,refundMerchantFees:false},theme:{accent:'#e2252b',surface:'#111111',logoText:title.toUpperCase().slice(0,20)},products:[],layout:[{id:id('b'),type:'hero',title,body:req.body.subtitle||'Event experience'},{id:id('b'),type:'tickets',title:'Tickets',body:'Choose your experience.'}],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; d.events.push(event); writeStore(d); res.status(201).json({event}); });

app.put('/api/events/:id', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e) return res.status(404).json({error:'Event not found.'}); if(!canManage(req.user,e)) return res.status(403).json({error:'No access.'}); const allowed=['title','subtitle','description','date','venue','location','theme','products','layout','feeSettings','media']; for(const k of allowed) if(req.body[k]!==undefined) e[k]=req.body[k]; e.updatedAt=new Date().toISOString(); if(req.user.role!=='owner' && req.body.submitForReview) e.status='pending'; writeStore(d); res.json({event:e}); });

app.post('/api/events/:id/status', auth, owner, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e) return res.status(404).json({error:'Event not found.'}); const status=req.body.status; if(!['draft','pending','published','rejected','paused'].includes(status)) return res.status(400).json({error:'Invalid status.'}); e.status=status; e.updatedAt=new Date().toISOString(); writeStore(d); res.json({event:e}); });

app.post('/api/events/:id/products', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e||!canManage(req.user,e)) return res.status(404).json({error:'Event not found.'}); const type=req.body.type==='apparel'?'apparel':'ticket'; const sizes=Array.isArray(req.body.options?.size)?req.body.options.size:[]; const p={id:id('prd'),type,name:req.body.name||'New Ticket',description:req.body.description||'',price:Math.max(0,Number(req.body.price)||0),inventory:Math.max(0,Number(req.body.inventory)||0),sold:0,badge:req.body.badge||'',options:type==='apparel'?{size:sizes}:undefined,minPerOrder:Math.max(1,Number(req.body.minPerOrder)||1),maxPerOrder:Math.max(1,Number(req.body.maxPerOrder)||20),quantityStep:Math.max(1,Number(req.body.quantityStep)||1),group:{enabled:Boolean(req.body.group?.enabled),minQty:Math.max(1,Number(req.body.group?.minQty)||1),maxQty:Math.max(1,Number(req.body.group?.maxQty)||999),discountType:req.body.group?.discountType==='fixed'?'fixed':'percent',discountValue:Math.max(0,Number(req.body.group?.discountValue)||0),tiers:Array.isArray(req.body.group?.tiers)?req.body.group.tiers:[]}}; try{if(type==='ticket')applyApparelConfig(p,req.body.includedApparel);}catch(err){return res.status(400).json({error:err.message});} e.products.push(p); e.updatedAt=new Date().toISOString(); writeStore(d); res.status(201).json({product:p,event:e}); });
app.put('/api/events/:id/products/:productId', auth, (req,res)=>{ const d=readStore(),e=d.events.find(x=>x.id===req.params.id); if(!e||!canManage(req.user,e)) return res.status(403).json({error:'No access.'}); const p=e.products.find(x=>x.id===req.params.productId); if(!p)return res.status(404).json({error:'Product not found.'}); for(const k of ['name','description','price','inventory','badge','minPerOrder','maxPerOrder','quantityStep']) if(req.body[k]!==undefined)p[k]=req.body[k]; if(req.body.options)p.options=req.body.options;if(req.body.group)p.group={...(p.group||{}),...req.body.group};try{if(p.type==='ticket'&&req.body.includedApparel)applyApparelConfig(p,req.body.includedApparel);}catch(err){return res.status(400).json({error:err.message});}writeStore(d);res.json({product:p,event:e}); });


function validSyncSecret(req){
  const expected=String(process.env.DISCIPLE_SYNC_SECRET||'');
  const supplied=String(req.get('x-kvn-disciple-sync-secret')||'');
  if(!expected||!supplied)return false;
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function validDiscipleIntakeSecret(req){
  const expected=String(process.env.DISCIPLE_INTAKE_SECRET||'');
  const supplied=String(req.get('x-kvn-disciple-intake-secret')||'');
  return Boolean(expected&&supplied&&sameSecret(expected,supplied));
}

app.post('/api/integrations/disciples/applications',(req,res)=>{
  if(!validDiscipleIntakeSecret(req))return res.status(401).json({error:'Invalid integration secret.'});
  const idempotencyKey=String(req.get('idempotency-key')||'').trim();
  if(idempotencyKey.length<8||idempotencyKey.length>120)return res.status(400).json({error:'A valid idempotency key is required.'});
  try{
    const d=readStore();
    const result=receiveDiscipleApplication(d,req.body,{idempotencyKey,sourceSystem:'kvnlive-site',ip:req.ip,userAgent:req.get('user-agent')||''},{id});
    writeStore(d);
    res.status(result.created?201:200).json({ok:true,applicationReference:result.application.applicationReference,created:result.created});
  }catch(error){res.status(/too large/i.test(error.message)?413:400).json({error:error.message});}
});

app.post('/api/disciples/apply', (req,res)=>{
  const d=readStore(),b=req.body||{}; const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase();
  if(!name||!email)return res.status(400).json({error:'Name and email are required.'});
  if(!b.attested)return res.status(400).json({error:'Agreement attestation is required.'});
  const now=new Date().toISOString();
  const existing=d.discipleApplications.find(x=>x.email===email&&['submitted','resubmitted'].includes(x.status));
  if(existing?.agreementVersion==='2.2')return res.status(409).json({error:'An application for this email is already pending.',applicationReference:existing.applicationReference});
  if(existing){existing.status='superseded';existing.supersededAt=now;existing.updatedAt=now;}
  const reference='KVN-D-'+now.slice(0,10).replaceAll('-','')+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();
  const application={id:id('dapp'),applicationReference:reference,status:'submitted',name,email,phone:String(b.phone||''),city:String(b.city||''),state:String(b.state||''),shirtSize:String(b.shirtSize||''),market:String(b.market||''),instagram:String(b.instagram||''),facebook:String(b.facebook||''),tiktok:String(b.tiktok||''),audienceSize:String(b.audienceSize||''),motivation:String(b.motivation||''),promotionPlan:String(b.promotionPlan||''),preferredName:String(b.preferredName||''),weeklyPostCommitment:Boolean(b.weeklyPostCommitment),agreementVersion:'2.2',agreementAcceptedAt:now,typedLegalName:String(b.typedLegalName||name),submittedAt:now,updatedAt:now};
  d.discipleApplications.unshift(application);writeStore(d);
  res.status(201).json({ok:true,applicationReference:reference,status:'submitted',message:'Your Kingdom Vibe Disciple application has been received.'});
});
app.get('/api/disciple-applications',auth,owner,(req,res)=>{const d=readStore();res.json({applications:d.discipleApplications});});
app.post('/api/disciple-applications/:id/status',auth,owner,async(req,res)=>{
  const d=readStore(),a=d.discipleApplications.find(x=>x.id===req.params.id||x.applicationReference===req.params.id);
  if(!a)return res.status(404).json({error:'Application not found.'});
  const status=String(req.body.status||''); if(!['approved','rejected','needs_info'].includes(status))return res.status(400).json({error:'Invalid application status.'});
  if(status!=='approved'){a.status=status;a.updatedAt=new Date().toISOString();writeStore(d);return res.json({application:a});}
  if(!['submitted','resubmitted','needs_info'].includes(a.status))return res.status(409).json({error:'Application is not approval-eligible.'});
  if(a.agreementVersion!=='2.2')return res.status(409).json({error:'Applicant must accept the current Kingdom Disciple Agreement v2.2 before approval.'});
  const result=upsertDiscipleFromApplication(d,{...a,applicationStatus:'approved',defaultCommissionPercent:10},{id});
  const disciple=result.disciple; disciple.defaultCommissionPercent=10; const trackingUrl='https://disciple.kvnlive.com/'+encodeURIComponent(disciple.handle);
  disciple.welcomeEmail=await sendDiscipleWelcome({disciple,link:trackingUrl,apiKey:process.env.RESEND_API_KEY,from:process.env.DISCIPLE_FROM_EMAIL||'Kingdom Vibe Network <info@kvnlive.com>'});
  a.status='approved';a.approvedAt=new Date().toISOString();a.approvedDiscipleId=disciple.id;a.updatedAt=a.approvedAt;
  d.auditLogs.unshift({id:id('log'),userId:req.user.id,userName:req.user.name,action:'disciple.approve',entityType:'disciple_application',entityId:a.id,meta:{applicationReference:a.applicationReference,discipleId:disciple.id},createdAt:a.approvedAt});
  writeStore(d);res.json({ok:true,application:a,disciple,trackingUrl,welcomeEmail:disciple.welcomeEmail});
});
app.post('/api/integrations/disciples/approve', async (req,res)=>{
  try{
    if(!validSyncSecret(req))return res.status(401).json({error:'Invalid integration secret.'});
    const d=readStore();
    const result=upsertDiscipleFromApplication(d,req.body,{id});
    const disciple=result.disciple;
    const trackingUrl='https://disciple.kvnlive.com/'+encodeURIComponent(disciple.handle);
    if(result.created||req.body.resendWelcome===true){
      disciple.welcomeEmail=await sendDiscipleWelcome({
        disciple,
        link:trackingUrl,
        apiKey:process.env.RESEND_API_KEY,
        from:process.env.DISCIPLE_FROM_EMAIL||'Kingdom Vibe Network <info@kvnlive.com>'
      });
    }
    writeStore(d);
    res.status(result.created?201:200).json({ok:true,created:result.created,disciple,trackingUrl,welcomeEmail:disciple.welcomeEmail||null});
  }catch(err){
    res.status(err.statusCode||500).json({error:err.message||'Unable to sync approved Disciple application.'});
  }
});

app.post('/api/disciples', auth, async (req,res)=>{
  const d=readStore(); const orgId=req.user.role==='owner'?(req.body.organizationId||req.user.organizationId):req.user.organizationId;
  const code=String(req.body.code||req.body.name||'DISCIPLE').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,24);
  if(!code) return res.status(400).json({error:'Disciple code required.'});
  if(d.disciples.some(x=>x.code===code)) return res.status(409).json({error:'That Disciple code already exists.'});
  const handle=slugify(req.body.handle||req.body.name||code).replace(/-/g,'').slice(0,40);
  if(!handle) return res.status(400).json({error:'Disciple handle required.'});
  if(d.disciples.some(x=>String(x.handle||'').toLowerCase()===handle.toLowerCase())) return res.status(409).json({error:'That Disciple link is already taken.'});
  const disciple={id:id('dsc'),name:String(req.body.name||'Disciple'),email:String(req.body.email||''),code,handle,status:'active',organizationId:orgId,defaultCommissionPercent:Math.max(0,Math.min(100,Number(req.body.defaultCommissionPercent ?? d.settings.defaultDiscipleCommissionPercent ?? 10))),eventRates:[],payoutMethod:String(req.body.payoutMethod||'manual'),payoutNotes:String(req.body.payoutNotes||''),createdAt:new Date().toISOString()};
  d.disciples.push(disciple); writeStore(d);
  const trackingUrl='https://disciple.kvnlive.com/'+encodeURIComponent(handle);
  const welcomeEmail=await sendDiscipleWelcome({disciple,link:trackingUrl,apiKey:process.env.RESEND_API_KEY,from:process.env.DISCIPLE_FROM_EMAIL||'Kingdom Vibe Network <info@kvnlive.com>'});
  disciple.welcomeEmail=welcomeEmail; writeStore(d);
  res.status(201).json({disciple,trackingUrl,welcomeEmail});
});
app.put('/api/disciples/:id', auth, (req,res)=>{
  const d=readStore(),x=d.disciples.find(v=>v.id===req.params.id); if(!x||!(req.user.role==='owner'||x.organizationId===req.user.organizationId)) return res.status(404).json({error:'Disciple not found.'});
  for(const k of ['name','email','status','payoutMethod','payoutNotes']) if(req.body[k]!==undefined)x[k]=req.body[k]; if(req.body.defaultCommissionPercent!==undefined)x.defaultCommissionPercent=Math.max(0,Math.min(100,Number(req.body.defaultCommissionPercent)||0)); writeStore(d);res.json({disciple:x});
});
app.post('/api/disciples/:id/event-rate', auth, (req,res)=>{
  const d=readStore(),x=d.disciples.find(v=>v.id===req.params.id),e=d.events.find(v=>v.id===req.body.eventId); if(!x||!e||!(req.user.role==='owner'||(x.organizationId===req.user.organizationId&&e.organizationId===req.user.organizationId))) return res.status(403).json({error:'No access.'});
  const percent=Math.max(0,Math.min(100,Number(req.body.percent)||0)); x.eventRates ||= []; const prior=x.eventRates.find(v=>v.eventId===e.id); if(prior)prior.percent=percent;else x.eventRates.push({eventId:e.id,percent}); writeStore(d);res.json({disciple:x});
});
app.get('/api/disciples/:code/resolve',(req,res)=>{ const d=readStore(),x=d.disciples.find(v=>v.code===String(req.params.code||'').toUpperCase()&&v.status==='active'); if(!x)return res.status(404).json({error:'Disciple not found.'}); res.json({disciple:{id:x.id,name:x.name,code:x.code,handle:x.handle||''}}); });
function discipleRedirect(req,res,handle){
  const d=readStore(),x=d.disciples.find(v=>String(v.handle||'').toLowerCase()===String(handle||'').toLowerCase()&&v.status==='active');
  if(!x)return res.status(404).send('Disciple link not found.');
  const event=d.events.find(e=>e.status==='published'&&String(e.slug||'').includes('kingdom-vibe-live'))||d.events.find(e=>e.status==='published');
  if(!event)return res.redirect(302,'https://kvnlive.com/?disciple='+encodeURIComponent(x.code));
  return res.redirect(302,'/event.html?slug='+encodeURIComponent(event.slug)+'&disciple='+encodeURIComponent(x.code));
}
app.get('/disciple/:handle',(req,res)=>discipleRedirect(req,res,req.params.handle));
app.get('/:handle',(req,res,next)=>{ const host=String(req.headers.host||'').split(':')[0].toLowerCase(); if(host!=='disciple.kvnlive.com')return next(); return discipleRedirect(req,res,req.params.handle); });
app.post('/api/disciple-commissions/:id/mark-paid', auth, owner, (req,res)=>{
  const d=readStore(),c=d.discipleCommissions.find(x=>x.id===req.params.id); if(!c)return res.status(404).json({error:'Commission not found.'});
  if(c.status==='reversed')return res.status(409).json({error:'Reversed commission cannot be paid.'});
  c.status='paid'; c.paidAt=new Date().toISOString(); c.paymentReference=String(req.body.paymentReference||'manual');
  d.disciplePayouts.push({id:id('dsp'),discipleId:c.discipleId,commissionId:c.id,amount:c.amount,status:'paid',paymentReference:c.paymentReference,createdAt:c.paidAt});
  writeStore(d); res.json({commission:c});
});

app.post('/api/disciple-community-bonuses/:id/mark-paid',auth,owner,(req,res)=>{
  if(process.env.COMMUNITY_BONUS_LEGAL_APPROVED!=='true')return res.status(409).json({error:'Licensed-counsel approval is required before Community Bonus payouts.'});
  const d=readStore(),bonus=d.discipleCommunityBonuses.find(x=>x.id===req.params.id);if(!bonus)return res.status(404).json({error:'Community Bonus not found.'});
  if(bonus.status==='reversed')return res.status(409).json({error:'Reversed Community Bonus cannot be paid.'});
  bonus.status='paid';bonus.paidAt=new Date().toISOString();bonus.paymentReference=String(req.body.paymentReference||'manual');writeStore(d);res.json({bonus});
});

app.post('/api/disciples/:id/leader-status',auth,owner,(req,res)=>{try{const d=readStore(),disciple=setLeaderStatus(d,{discipleId:req.params.id,active:req.body.active,reason:req.body.reason,actorId:req.user.id},{id});writeStore(d);res.json({disciple});}catch(error){res.status(error.statusCode||400).json({error:error.message});}});
app.post('/api/disciple-teams/assign',auth,owner,(req,res)=>{try{const d=readStore(),assignment=assignTeamMember(d,{leaderId:req.body.leaderId,memberId:req.body.memberId,source:req.body.source,reason:req.body.reason,actorId:req.user.id},{id});writeStore(d);res.status(201).json({assignment});}catch(error){res.status(error.statusCode||400).json({error:error.message});}});
app.post('/api/disciple-teams/:assignmentId/end',auth,owner,(req,res)=>{try{const d=readStore(),assignment=endTeamAssignment(d,{assignmentId:req.params.assignmentId,reason:req.body.reason,actorId:req.user.id},{id});writeStore(d);res.json({assignment});}catch(error){res.status(error.statusCode||400).json({error:error.message});}});
app.post('/api/disciples/:id/bundles/complimentary',auth,owner,(req,res)=>{try{const d=readStore(),action=awardLeaderBundle(d,{...req.body,discipleId:req.params.id,actorId:req.user.id},{id});writeStore(d);res.status(201).json({action});}catch(error){res.status(error.statusCode||400).json({error:error.message});}});
app.post('/api/disciples/:id/bundles/invite',auth,owner,(req,res)=>{try{const d=readStore(),action=inviteMemberBundle(d,{...req.body,discipleId:req.params.id,actorId:req.user.id},{id});writeStore(d);res.status(201).json({action});}catch(error){res.status(error.statusCode||400).json({error:error.message});}});
app.post('/api/disciple-commissions/:id/reverse', auth, owner, (req,res)=>{
  const d=readStore(),c=d.discipleCommissions.find(x=>x.id===req.params.id); if(!c)return res.status(404).json({error:'Commission not found.'});
  if(c.status==='paid')return res.status(409).json({error:'Paid commission requires a manual adjustment.'});
  c.status='reversed'; c.reversedAt=new Date().toISOString(); c.reversalReason=String(req.body.reason||'refund_or_chargeback');
  reverseCommunityBonusForCommission(d,c.id);
  writeStore(d); res.json({commission:c});
});

app.post('/api/disciples/:id/credit-sale', auth, owner, (req,res)=>{
  const d=readStore(),disciple=d.disciples.find(x=>x.id===req.params.id&&x.status==='active'); if(!disciple)return res.status(404).json({error:'Active Disciple not found.'});
  const amountPaid=Math.max(0,Math.round(Number(req.body.amountPaid)||0)); if(amountPaid<=0)return res.status(400).json({error:'amountPaid must be supplied in cents.'});
  const rate=Math.max(0,Math.min(100,Number(req.body.ratePercent??disciple.defaultCommissionPercent??d.settings.defaultDiscipleCommissionPercent??10)));
  const amount=Math.round(amountPaid*rate/100),now=new Date();
  const commission={id:id('com'),discipleId:disciple.id,eventId:'',orderId:String(req.body.reference||id('ext')),ratePercent:rate,eligibleBase:amountPaid,amount,status:'pending',sourceType:String(req.body.sourceType||'kingdom_market'),sourceLabel:String(req.body.sourceLabel||'Kingdom Market'),earnedAt:now.toISOString(),payoutDate:nextMonthlyPayoutDate(now),paidAt:'',paymentReference:'',createdAt:now.toISOString()};
  d.discipleCommissions.push(commission);createCommunityBonus(d,{commission,order:{id:commission.orderId,buyerEmail:String(req.body.buyerEmail||''),amountTotal:amountPaid,commissionEligible:true}},{id});writeStore(d); res.status(201).json({commission});
});
app.post('/api/discounts', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.body.eventId); if(!e||!canManage(req.user,e)) return res.status(403).json({error:'No access.'}); const disc={id:id('disc'),eventId:e.id,code:String(req.body.code||'').toUpperCase().replace(/\s/g,''),type:req.body.type==='fixed'?'fixed':'percent',value:Math.max(0,Number(req.body.value)||0),active:true,maxUses:Math.max(1,Number(req.body.maxUses)||100),uses:0}; if(!disc.code) return res.status(400).json({error:'Code required.'}); d.discounts.push(disc); writeStore(d); res.status(201).json({discount:disc}); });

app.post('/api/create-checkout-session', async (req,res)=>{
  try{
    const d=readStore(); const e=d.events.find(x=>x.id===req.body.eventId && x.status==='published'); if(!e) return res.status(404).json({error:'Event is not available for checkout.'});
    const customer=normalizeCustomer(req.body.customer),customerErrors=validateCustomer(customer);if(customerErrors.length)return res.status(400).json({error:customerErrors[0]});
    const cart=Array.isArray(req.body.cart)?req.body.cart:[]; if(!cart.length) return res.status(400).json({error:'Your cart is empty.'});
    let subtotal=0, groupDiscountAmount=0, earlyReleaseDiscountAmount=0; const normalized=[]; const lineItems=[];
    for(const item of cart){
      const p=e.products.find(x=>x.id===item.id); if(!p) continue;
      if(p.type==='ticket'){
        let result;try{result=normalizeTicketCartItem(p,item);if(p.earlyRelease?.enabled)result=applyEarlyReleasePricing(result,p,pendingEarlyReleaseUnits(d.orders,e.id,p.id));}catch(err){if(err.statusCode)return res.status(err.statusCode).json({error:err.message});throw err;}
        subtotal+=result.item.ticketSubtotal+result.apparelSubtotal;groupDiscountAmount+=result.item.groupDiscountPerUnit*result.item.quantity;normalized.push(result.item);
        earlyReleaseDiscountAmount+=Number(result.item.earlyReleaseDiscountAmount||0);
        for(const ticketLine of result.ticketLineItems||[result.ticketLineItem])lineItems.push({quantity:ticketLine.quantity,price_data:{currency:'usd',unit_amount:ticketLine.unitAmount,product_data:{name:ticketLine.name,description:ticketLine.description}}});
        for(const apparel of result.apparelLineItems){normalized.push({productId:null,name:apparel.name,type:'apparel-addon',quantity:apparel.quantity,unitAmount:apparel.unitAmount,regularUnitAmount:apparel.unitAmount,groupDiscountPerUnit:0});lineItems.push({quantity:apparel.quantity,price_data:{currency:'usd',unit_amount:apparel.unitAmount,product_data:{name:apparel.name,description:`Optional add-on for ${p.name}`}}});}
        continue;
      }
      const min=Math.max(1,Number(p.minPerOrder)||1),max=Math.max(min,Number(p.maxPerOrder)||20),step=Math.max(1,Number(p.quantityStep)||1); const q=Math.max(min,Math.min(Number(item.quantity)||min,max));
      if((q-min)%step!==0)return res.status(400).json({error:`${p.name} must be selected in increments of ${step}.`}); if(q>p.inventory-p.sold)return res.status(409).json({error:`Only ${p.inventory-p.sold} ${p.name} remaining.`});
      if(p.group?.enabled&&(q<Number(p.group.minQty||1)||q>Number(p.group.maxQty||9999)))return res.status(400).json({error:`${p.name} group quantity must be between ${p.group.minQty} and ${p.group.maxQty}.`});
      const unitGroupDiscount=groupDiscountFor(p,q), effectiveUnit=Math.max(0,p.price-unitGroupDiscount); groupDiscountAmount+=unitGroupDiscount*q;
      let name=p.name, size=item.size||null;
      if(p.type==='apparel'){ if(!p.options?.size?.includes(size))return res.status(400).json({error:`Select a valid size for ${p.name}.`});name+=` — ${size}`; }
      subtotal+=effectiveUnit*q; normalized.push({productId:p.id,name:p.name,type:p.type,size,quantity:q,unitAmount:effectiveUnit,regularUnitAmount:p.price,groupDiscountPerUnit:unitGroupDiscount}); lineItems.push({quantity:q,price_data:{currency:'usd',unit_amount:effectiveUnit,product_data:{name,description:p.description}}});
    }
    if(!normalized.length)return res.status(400).json({error:'No valid items.'});
    let promoDiscountAmount=0,discountCode='';if(req.body.discountCode){const disc=d.discounts.find(x=>x.eventId===e.id&&x.active&&x.code===String(req.body.discountCode).toUpperCase()&&x.uses<x.maxUses);if(disc){discountCode=disc.code;promoDiscountAmount=disc.type==='percent'?Math.round(subtotal*Math.min(disc.value,100)/100):Math.min(subtotal,Math.round(disc.value));}}
    const taxAmount=Math.round((subtotal-promoDiscountAmount)*(Number(e.taxRatePercent)||0)/100); const fees=feeBreakdown(e,normalized,promoDiscountAmount,taxAmount);
    if(taxAmount>0)lineItems.push({quantity:1,price_data:{currency:'usd',unit_amount:taxAmount,product_data:{name:'Taxes'}}}); if(fees.buyerKvnFee>0)lineItems.push({quantity:1,price_data:{currency:'usd',unit_amount:fees.buyerKvnFee,product_data:{name:'KVN Live Tickets Service Fee'}}}); if(fees.buyerMerchantFee>0)lineItems.push({quantity:1,price_data:{currency:'usd',unit_amount:fees.buyerMerchantFee,product_data:{name:'Merchant / Payment Processing Fee'}}});
    const discipleCode=String(req.body.discipleCode||'').toUpperCase(),disciple=d.disciples.find(x=>x.code===discipleCode&&x.status==='active'),orderId=id('ord'); const total=subtotal-promoDiscountAmount+taxAmount+fees.buyerKvnFee+fees.buyerMerchantFee;
    if(!stripe)return res.status(503).json({error:'Stripe is not configured. Add STRIPE_SECRET_KEY to accept payments.',preview:{subtotal,groupDiscountAmount,earlyReleaseDiscountAmount,promoDiscountAmount,taxAmount,fees,total,orderId}});
    const expiration=checkoutExpiration(),checkoutExpiresAt=expiration.iso,expiresAt=expiration.unix;
    const sessionConfig={mode:'payment',line_items:lineItems,discounts:[],expires_at:expiresAt,success_url:`${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${baseUrl}/event.html?slug=${encodeURIComponent(e.slug)}&checkout=cancelled`,customer_email:customer.email,billing_address_collection:'required',phone_number_collection:{enabled:true},metadata:{order_id:orderId,event_id:e.id,discount_code:discountCode,buyer_name:customer.name,disciple_code:disciple?.code||''}};
    const org=d.organizations.find(o=>o.id===e.organizationId),discipleSplit=false; if(org?.stripeAccountId){sessionConfig.payment_intent_data={application_fee_amount:Math.max(0,fees.kvnFee),transfer_data:{destination:org.stripeAccountId}};}
    d.orders.push({id:orderId,eventId:e.id,organizationId:e.organizationId,stripeSessionId:'',buyerName:customer.name,buyerEmail:customer.email,customer,cartId:req.body.cartId||'',items:normalized,amountSubtotal:subtotal,groupDiscountAmount,earlyReleaseDiscountAmount,promoDiscountAmount,discountAmount:promoDiscountAmount,taxAmount,feeBreakdown:fees,amountTotal:total,status:'pending',checkoutExpiresAt,tickets:[],discipleId:disciple?.id||'',discipleCode:disciple?.code||'',discipleSplitMode:discipleSplit,createdAt:new Date().toISOString()});writeStore(d);
    try{
      if(promoDiscountAmount>0){const coupon=await stripe.coupons.create({amount_off:promoDiscountAmount,currency:'usd',duration:'once',name:`${discountCode} discount`});if(coupon)sessionConfig.discounts=[{coupon:coupon.id}];}
      const session=await stripe.checkout.sessions.create(sessionConfig),latest=readStore(),pending=latest.orders.find(x=>x.id===orderId);if(pending){pending.stripeSessionId=session.id;pending.checkoutExpiresAt=session.expires_at?new Date(session.expires_at*1000).toISOString():checkoutExpiresAt;writeStore(latest);}res.json({url:session.url});
    }catch(err){const latest=readStore(),pending=latest.orders.find(x=>x.id===orderId);if(pending&&pending.status==='pending'){pending.status='checkout_failed';pending.checkoutError=String(err.message||err);pending.updatedAt=new Date().toISOString();writeStore(latest);}throw err;}
  }catch(err){console.error(err);res.status(500).json({error:err.message||'Unable to start checkout.'});}
});

async function sendConfirmation(order,event,{force=false}={}){
  const result=await dispatchTicketConfirmation({order,event,apiKey:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM||'KVN Live Tickets <passes@tickets.kvnlive.com>',baseUrl,force});
  if(result.status==='failed'||result.status==='not_configured') console.error('Confirmation email error',order.id,result.error);
  else if(result.status==='sent') console.log('Confirmation email accepted',order.id,result.messageId);
  return result;
}

async function finalizeSession(session){
  const d=readStore();
  const o=d.orders.find(x=>x.stripeSessionId===session.id);
  if(!o) return o;
  const e=d.events.find(x=>x.id===o.eventId);
  if(o.status==='paid'){
    if(o.confirmationEmail?.status!=='sent'){
      await sendConfirmation(o,e);
      writeStore(d);
    }
    return o;
  }
  o.status='paid';
  o.buyerEmail=session.customer_details?.email||o.buyerEmail;
  o.buyerName=session.customer_details?.name||o.buyerName;
  o.paidAt=new Date().toISOString();
  finalizeOrderItems(o,e,{id,ticketCode});
  if(o.discountAmount){ const dc=d.discounts.find(x=>x.eventId===e.id&&x.code===session.metadata?.discount_code); if(dc)dc.uses++; }
  if(o.cartId){ const c=d.abandonedCarts.find(x=>x.id===o.cartId); if(c){ c.status='converted'; c.updatedAt=new Date().toISOString(); } }
  await processDiscipleCommission(d,o,e,session);
  if(o.discipleSplitMode){ const org=d.organizations.find(x=>x.id===o.organizationId); if(stripe&&org?.stripeAccountId&&session?.payment_intent&&!o.organizerTransferId){ try{ const pi=await stripe.paymentIntents.retrieve(session.payment_intent); const sourceCharge=typeof pi.latest_charge==='string'?pi.latest_charge:pi.latest_charge?.id; const platformFee=Math.round((o.amountTotal||0)*Number(o.platformFeePercent||d.settings.platformFeePercent||5)/100); const organizerAmount=Math.max(0,(o.amountTotal||0)-platformFee-(o.discipleCommissionAmount||0)); if(organizerAmount>0){ const tr=await stripe.transfers.create({amount:organizerAmount,currency:'usd',destination:org.stripeAccountId,...(sourceCharge?{source_transaction:sourceCharge}:{}),metadata:{order_id:o.id,organization_id:org.id,kind:'organizer_net'}}); o.organizerTransferId=tr.id; o.organizerTransferAmount=organizerAmount; } }catch(err){o.organizerTransferNote=`Organizer transfer pending: ${err.message}`;} }
  }
  writeStore(d);
  await sendConfirmation(o,e);
  writeStore(d);
  return o;
}

function expireSession(session){
  const d=readStore(),o=d.orders.find(x=>x.stripeSessionId===session.id);
  if(!o||o.status!=='pending')return o;
  o.status='expired';o.expiredAt=new Date().toISOString();writeStore(d);return o;
}

app.get('/api/tickets/:code/qr.svg', async (req,res)=>{
  const d=readStore(); const code=String(req.params.code||'').toUpperCase();
  const found=d.orders.some(o=>o.tickets?.some(t=>t.code===code));
  if(!found) return res.status(404).send('Ticket not found');
  const payload=`${baseUrl}/checkin.html?ticket=${encodeURIComponent(code)}`;
  const svg=await QRCode.toString(payload,{type:'svg',margin:1,width:320,errorCorrectionLevel:'M'});
  res.type('image/svg+xml').send(svg);
});

app.get('/api/checkout-session', async (req,res)=>{ try{ if(!stripe) return res.status(503).json({error:'Stripe not configured.'}); const session=await stripe.checkout.sessions.retrieve(req.query.session_id); let order;if(session.payment_status==='paid') order=await finalizeSession(session); else order=readStore().orders.find(x=>x.stripeSessionId===session.id); res.json({session:{id:session.id,payment_status:session.payment_status,amount_total:session.amount_total,customer_email:session.customer_details?.email},order}); }catch(e){ res.status(400).json({error:'Unable to load order.'}); } });

app.post('/api/checkin', auth, (req,res)=>{ if(!can(req.user,'checkin')) return res.status(403).json({error:'Check-in permission required.'}); const d=readStore(); const code=String(req.body.code||'').trim().toUpperCase(); for(const o of d.orders){ const t=o.tickets?.find(x=>x.code===code); if(t){ const e=d.events.find(x=>x.id===o.eventId); if(!canManage(req.user,e)) return res.status(403).json({error:'Ticket belongs to another organizer.'}); if(t.checkedIn) return res.status(409).json({error:'Already checked in.',ticket:t,event:e}); t.checkedIn=true;t.checkedInAt=new Date().toISOString();writeStore(d);return res.json({ok:true,ticket:t,event:e,buyerName:o.buyerName}); } } res.status(404).json({error:'Ticket not found.'}); });

app.post('/api/orders/:id/refund', auth, async (req,res)=>{ const d=readStore(),o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Order not found.'});const e=d.events.find(x=>x.id===o.eventId);if(!canManage(req.user,e))return res.status(403).json({error:'No access.'});if(!stripe)return res.status(503).json({error:'Stripe is not configured.'});const sess=await stripe.checkout.sessions.retrieve(o.stripeSessionId);if(!sess.payment_intent)return res.status(409).json({error:'No payment intent available.'});const f=e.feeSettings||{},fb=o.feeBreakdown||{};const refundable=Math.max(0,(o.amountTotal||0)-(f.refundKvnFees?0:(fb.buyerKvnFee||0))-(f.refundMerchantFees?0:(fb.buyerMerchantFee||0)));await stripe.refunds.create({payment_intent:sess.payment_intent,amount:refundable});o.status='refunded';o.refundAmount=refundable;o.refundedAt=new Date().toISOString();o.refundPolicyApplied={kvnFeesRefunded:Boolean(f.refundKvnFees),merchantFeesRefunded:Boolean(f.refundMerchantFees)};const com=d.discipleCommissions.find(c=>c.orderId===o.id);if(com){com.status='reversal_required';com.reversalNote='Order refunded. Reverse/offset this commission according to Stripe transfer state.';}writeStore(d);res.json({order:o}); });

app.post('/api/organizations/:id/approve', auth, owner, (req,res)=>{ const d=readStore(); const org=d.organizations.find(o=>o.id===req.params.id); if(!org)return res.status(404).json({error:'Organization not found.'});org.status='approved';writeStore(d);res.json({organization:org}); });

app.post('/api/organizations/:id/connect', auth, async (req,res)=>{ const d=readStore(); const org=d.organizations.find(o=>o.id===req.params.id); if(!org||!(req.user.role==='owner'||req.user.organizationId===org.id))return res.status(403).json({error:'No access.'}); if(!stripe)return res.status(503).json({error:'Stripe is not configured.'}); if(!org.stripeAccountId){ const account=await stripe.accounts.create({type:'express',country:'US',email:req.user.email,capabilities:{card_payments:{requested:true},transfers:{requested:true}}});org.stripeAccountId=account.id;writeStore(d); } const link=await stripe.accountLinks.create({account:org.stripeAccountId,refresh_url:`${baseUrl}/dashboard.html?connect=refresh`,return_url:`${baseUrl}/dashboard.html?connect=complete`,type:'account_onboarding'});res.json({url:link.url}); });


// ---------------- KVN LIVE TICKETS v3 PRODUCTION FEATURES ----------------
function logAudit(d, user, action, entityType, entityId, meta={}){
  d.auditLogs.unshift({id:id('log'),userId:user?.id||'system',userName:user?.name||'System',action,entityType,entityId,meta,createdAt:new Date().toISOString()});
  d.auditLogs=d.auditLogs.slice(0,2000);
}
function can(user, permission){
  if(user?.role==='owner') return true;
  if(user?.role==='organizer') return true;
  if(user?.role==='staff') return (user.permissions||[]).includes(permission);
  return false;
}
function csvEscape(v=''){ const s=String(v??''); return `"${s.replaceAll('"','""')}"`; }

app.post('/api/events/:id/media', auth, (req,res)=>{
  const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e||!canManage(req.user,e)) return res.status(403).json({error:'No access.'});
  const dataUrl=String(req.body.dataUrl||''); const kind=String(req.body.kind||'hero').replace(/[^a-z0-9_-]/gi,'');
  const m=dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/); if(!m) return res.status(400).json({error:'Upload PNG, JPG, or WEBP.'});
  const buf=Buffer.from(m[2],'base64'); if(buf.length>4*1024*1024) return res.status(413).json({error:'Image must be under 4 MB.'});
  const ext=m[1]==='jpeg'?'jpg':m[1]; const fileName=`${e.id}-${kind}-${Date.now()}.${ext}`; const out=pathJoin(uploadDir,fileName); fsWrite(out,buf);
  e.media ||= {}; e.media[kind]=`/uploads/${fileName}`; logAudit(d,req.user,'media.upload','event',e.id,{kind}); writeStore(d); res.json({url:e.media[kind],event:e});
});

app.post('/api/staff', auth, (req,res)=>{
  if(req.user.role!=='owner'&&req.user.role!=='organizer') return res.status(403).json({error:'No access.'});
  const d=readStore(); const orgId=req.user.role==='owner'?(req.body.organizationId||req.user.organizationId):req.user.organizationId;
  const permissions=Array.isArray(req.body.permissions)?req.body.permissions.filter(x=>['checkin','attendees','orders','events','refunds'].includes(x)):['checkin'];
  const user={id:id('usr'),name:String(req.body.name||'Staff Member'),email:String(req.body.email||''),role:'staff',organizationId:orgId,permissions}; d.users.push(user); logAudit(d,req.user,'staff.create','user',user.id,{permissions}); writeStore(d); res.status(201).json({user:safeUser(user),permissions});
});
app.delete('/api/staff/:id', auth, (req,res)=>{ const d=readStore(); const u=d.users.find(x=>x.id===req.params.id&&x.role==='staff'); if(!u||!(req.user.role==='owner'||u.organizationId===req.user.organizationId)) return res.status(404).json({error:'Staff not found.'}); d.users=d.users.filter(x=>x.id!==u.id); logAudit(d,req.user,'staff.remove','user',u.id); writeStore(d); res.json({ok:true}); });

app.get('/api/events/:id/attendees.csv', auth, (req,res)=>{
  const d=readStore(), e=d.events.find(x=>x.id===req.params.id); if(!e||!canManage(req.user,e)||!can(req.user,'attendees')) return res.status(403).json({error:'No access.'});
  const orders=d.orders.filter(o=>o.eventId===e.id&&o.status==='paid');
  res.type('text/csv').set('Content-Disposition',`attachment; filename="${e.slug}-complete-report.csv"`).send(eventReportCsv(e,orders));
});

app.post('/api/tickets/:code/transfer', auth, (req,res)=>{
  const d=readStore(); const code=String(req.params.code).toUpperCase(); for(const o of d.orders){ const t=o.tickets?.find(x=>x.code===code); if(!t) continue; const e=d.events.find(x=>x.id===o.eventId); if(!canManage(req.user,e)||!can(req.user,'attendees')) return res.status(403).json({error:'No access.'}); t.holderName=String(req.body.name||t.holderName); t.holderEmail=String(req.body.email||''); t.transferredAt=new Date().toISOString(); logAudit(d,req.user,'ticket.transfer','ticket',t.id,{code,email:t.holderEmail}); writeStore(d); return res.json({ticket:t}); } res.status(404).json({error:'Ticket not found.'});
});
app.post('/api/orders/:id/resend', auth, async (req,res)=>{ const d=readStore(); const o=d.orders.find(x=>x.id===req.params.id); if(!o) return res.status(404).json({error:'Order not found.'}); const e=d.events.find(x=>x.id===o.eventId); if(!canManage(req.user,e)||!can(req.user,'orders')) return res.status(403).json({error:'No access.'}); const confirmationEmail=await sendConfirmation(o,e,{force:true}); logAudit(d,req.user,'order.resend','order',o.id,{emailStatus:confirmationEmail.status}); writeStore(d); res.status(confirmationEmail.status==='sent'?200:502).json({ok:confirmationEmail.status==='sent',confirmationEmail}); });

app.post('/api/events/:id/custom-slug', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e||!canManage(req.user,e)) return res.status(403).json({error:'No access.'}); const slug=slugify(req.body.slug||''); if(slug.length<3) return res.status(400).json({error:'URL must be at least 3 characters.'}); if(d.events.some(x=>x.id!==e.id&&x.slug===slug)) return res.status(409).json({error:'That event URL is already taken.'}); const prior=e.slug; e.slug=slug;e.customSlug=slug;logAudit(d,req.user,'event.slug','event',e.id,{prior,slug});writeStore(d);res.json({event:e}); });

app.post('/api/organizations/:id/fee-plan', auth, owner, (req,res)=>{ const d=readStore(); const org=d.organizations.find(x=>x.id===req.params.id); const plan=d.settings.feePlans.find(x=>x.id===req.body.feePlanId); if(!org||!plan)return res.status(404).json({error:'Organization or fee plan not found.'}); org.feePlanId=plan.id;logAudit(d,req.user,'organization.fee_plan','organization',org.id,{plan:plan.id});writeStore(d);res.json({organization:org}); });
app.put('/api/events/:id/fees', auth, (req,res)=>{ const d=readStore(),e=d.events.find(x=>x.id===req.params.id);if(!e||!canManage(req.user,e))return res.status(403).json({error:'No access.'});const b=req.body||{};e.feeSettings={...(e.feeSettings||{}),strategy:['buyer','organizer','custom'].includes(b.strategy)?b.strategy:(e.feeSettings?.strategy||'buyer'),kvnPercent:clamp(b.kvnPercent??e.feeSettings?.kvnPercent??2.95,0,100),kvnFixedPerTicket:Math.max(0,Number(b.kvnFixedPerTicket??e.feeSettings?.kvnFixedPerTicket??195)),merchantPercent:clamp(b.merchantPercent??e.feeSettings?.merchantPercent??2.9,0,100),merchantFixed:Math.max(0,Number(b.merchantFixed??e.feeSettings?.merchantFixed??30)),merchantGrossUp:b.merchantGrossUp!==false,buyerPaysKvn:Boolean(b.buyerPaysKvn),buyerPaysMerchant:Boolean(b.buyerPaysMerchant),refundKvnFees:Boolean(b.refundKvnFees),refundMerchantFees:Boolean(b.refundMerchantFees)};writeStore(d);res.json({event:e}); });

app.post('/api/events/:id/tax', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id);if(!e||!canManage(req.user,e))return res.status(403).json({error:'No access.'});e.taxRatePercent=Math.max(0,Math.min(20,Number(req.body.rate)||0));logAudit(d,req.user,'event.tax','event',e.id,{rate:e.taxRatePercent});writeStore(d);res.json({event:e}); });
app.post('/api/organizations/:id/payout-schedule', auth, (req,res)=>{ const d=readStore();const org=d.organizations.find(x=>x.id===req.params.id);if(!org||!(req.user.role==='owner'||req.user.organizationId===org.id))return res.status(403).json({error:'No access.'});const schedule=['daily','weekly','monthly','manual'].includes(req.body.schedule)?req.body.schedule:'weekly';org.payoutSchedule=schedule;logAudit(d,req.user,'payout.schedule','organization',org.id,{schedule});writeStore(d);res.json({organization:org}); });
app.post('/api/organizations/:id/payout', auth, async (req,res)=>{ const d=readStore(); const org=d.organizations.find(x=>x.id===req.params.id); if(!org||!(req.user.role==='owner'||req.user.organizationId===org.id))return res.status(403).json({error:'No access.'}); const amount=Math.max(0,Math.round(Number(req.body.amount)||0)); const payout={id:id('pay'),organizationId:org.id,amount,status:'scheduled',scheduledFor:req.body.scheduledFor||new Date().toISOString(),createdAt:new Date().toISOString()}; d.payouts.push(payout);logAudit(d,req.user,'payout.schedule','payout',payout.id,{amount});writeStore(d);res.status(201).json({payout,note:'Recorded for payout processing. Stripe Connect settlement timing is managed by the connected account configuration.'}); });

app.post('/api/carts/track', (req,res)=>{ const d=readStore(); const eventId=String(req.body.eventId||''); if(!d.events.some(e=>e.id===eventId)) return res.status(404).json({error:'Event not found.'}); const cartId=String(req.body.cartId||id('cart')); let c=d.abandonedCarts.find(x=>x.id===cartId); if(!c){c={id:cartId,eventId,createdAt:new Date().toISOString()};d.abandonedCarts.push(c);} c.items=req.body.items||[];c.email=String(req.body.email||c.email||'');c.amount=Math.max(0,Number(req.body.amount)||0);c.status=req.body.status==='converted'?'converted':'open';c.updatedAt=new Date().toISOString();writeStore(d);res.json({cartId}); });

app.get('/api/analytics', auth, (req,res)=>{ const d=readStore(); const events=req.user.role==='owner'?d.events:d.events.filter(e=>e.organizationId===req.user.organizationId); const ids=new Set(events.map(e=>e.id)); const orders=d.orders.filter(o=>ids.has(o.eventId)); const byDay={};orders.filter(o=>o.status==='paid').forEach(o=>{const day=(o.paidAt||o.createdAt).slice(0,10);byDay[day]=(byDay[day]||0)+(o.amountTotal||0)});res.json({salesByDay:Object.entries(byDay).sort().slice(-30).map(([date,total])=>({date,total})),abandoned:d.abandonedCarts.filter(c=>ids.has(c.eventId)&&c.status==='open'),conversion:{orders:orders.filter(o=>o.status==='paid').length,carts:d.abandonedCarts.filter(c=>ids.has(c.eventId)).length}}); });

app.get('/api/audit', auth, (req,res)=>{ const d=readStore(); let logs=d.auditLogs;if(req.user.role!=='owner')logs=logs.filter(l=>{const ev=d.events.find(e=>e.id===l.entityId); const usr=d.users.find(u=>u.id===l.userId); return ev?.organizationId===req.user.organizationId||usr?.organizationId===req.user.organizationId;});res.json({logs:logs.slice(0,300)}); });

app.post('/api/organizations/:id/onboarding', auth, (req,res)=>{ const d=readStore(),org=d.organizations.find(x=>x.id===req.params.id);if(!org||!(req.user.role==='owner'||req.user.organizationId===org.id))return res.status(403).json({error:'No access.'});org.onboarding={...(org.onboarding||{}),...(req.body.onboarding||{})};writeStore(d);res.json({organization:org}); });

app.get('/api/tickets/:code/wallet', (req,res)=>{ const d=readStore(); const o=d.orders.find(o=>o.tickets?.some(t=>t.code===String(req.params.code).toUpperCase()));if(!o)return res.status(404).json({error:'Ticket not found.'});const t=o.tickets.find(t=>t.code===String(req.params.code).toUpperCase());const e=d.events.find(e=>e.id===o.eventId);res.json({ticket:t,event:{title:e.title,date:e.date,venue:e.venue,location:e.location},apple:{ready:Boolean(process.env.APPLE_PASS_CERT),note:'Set Apple Wallet signing certificate variables to issue signed .pkpass files.'},google:{ready:Boolean(process.env.GOOGLE_WALLET_ISSUER_ID),note:'Set Google Wallet issuer credentials to create Add to Google Wallet links.'}}); });

app.get('/api/super-admin', auth, owner, (req,res)=>{ const d=readStore(); const paid=d.orders.filter(o=>o.status==='paid'); const volume=paid.reduce((n,o)=>n+(o.amountTotal||0),0);res.json({organizations:d.organizations,events:d.events,staff:d.users.filter(u=>u.role==='staff'),payouts:d.payouts,auditLogs:d.auditLogs.slice(0,50),abandonedCarts:d.abandonedCarts.filter(c=>c.status==='open'),feePlans:d.settings.feePlans,metrics:{grossVolume:volume,paidOrders:paid.length,organizers:d.organizations.length,publishedEvents:d.events.filter(e=>e.status==='published').length,openCarts:d.abandonedCarts.filter(c=>c.status==='open').length}}); });

app.listen(port,()=>console.log(`KVN Live Tickets v4 running at ${baseUrl}`));
