import {createLuxrideNotifications} from './lib/luxride-notifications.js';
import {registerLuxrideBridge,forwardLuxrideEvent} from './lib/luxride-bridge.js';
import {shirtFulfillmentMethod} from './lib/shirt-fulfillment.js';
import { enrollMinistryAmbassador } from './lib/ministry-ambassador.js';
import {closePublicCompOffer,ticketCapacity} from './lib/admission-transition.js';
import {routeSurveyLeads} from './lib/survey-leads.js';
import {createTxt180Client} from './lib/sms-txt180.js';
import {createSmsContactsService} from './lib/sms-contacts.js';
import {registerSmsOptIn} from './lib/sms-opt-in.js';
import {createSmsCampaignService} from './lib/sms-campaigns.js';
import {registerSmsRoutes} from './lib/sms-routes.js';
import {createSmsDispatcher} from './lib/sms-dispatcher.js';
import {createTwilioClient} from './lib/sms-twilio.js';
import {registerSmsWebhooks} from './lib/sms-webhooks.js';
import {registerBusinessAssistantRoutes} from './lib/business-assistant-routes.js';
import {createBusinessActionService} from './lib/business-actions.js';
import {registerBusinessActionRoutes} from './lib/business-actions-routes.js';
import {registerBusinessFinanceRoutes} from './lib/business-finance-routes.js';
import {registerShopFulfillmentRoutes} from './lib/shop-fulfillment-routes.js';
import {registerBusinessRoutes} from './lib/business-routes.js';
import {csvCell} from './lib/report.js';
import {memberDashboard} from './lib/member-dashboard.js';
import {legacyPageDestination} from './lib/public-urls.js';
import {registerActivityRoutes} from './lib/activity-routes.js';
import {commerceClientIdentity} from './lib/commerce-client-identity.js';
import {registerMemberRoutes} from './lib/member-routes.js';
import {reservesTicketInventory} from './lib/checkout.js';
import {createCustomerCheckout} from './lib/customer-checkout-routes.js';
import {checkoutResponse} from './lib/embedded-checkout.js';
import {PROMO_VIP_OFFER,promoVipProduct,validatePromoVipRequest} from './lib/promo-vip.js';
import {recoverSponsoredCheckout} from './lib/sponsored-checkout.js';
import {registerSponsoredRoutes} from './lib/sponsored-routes.js';
import {validateUpgrade,completeUpgrade} from './lib/sponsored-passes.js';
import {createAgreementStore} from './lib/performance-agreements.js';
import {registerPerformanceAgreementRoutes} from './lib/performance-agreement-routes.js';
import { ensureMarketing, syncContacts } from './lib/marketing.js';
import { registerMarketingRoutes } from './lib/marketing-routes.js';
import { registerControllerRoutes } from './lib/controller-routes.js';
import { registerControllerMcp } from './lib/controller-mcp.js';
import { createEngagementStore, registerEngagementWebhook } from './lib/marketing-engagement.js';
import { prepareCrmStorage } from './lib/crm-backup.js';
import { registerCrmRoutes } from './lib/crm-routes.js';
import { syncCrmSources } from './lib/crm-sync.js';
import { buildDashboardMetrics } from './lib/dashboard-metrics.js';
import { bundleFulfillment, markBundleShipped, deliverFulfillmentMessage } from './lib/bundle-fulfillment.js';
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
import { createTicketConfirmationDispatcher, sendDiscipleApplicationNotice, sendDiscipleWelcome, sendOwnerPasswordReset, sendDonationReceipt } from './lib/email.js';
import { createOwnerPasswordStore, createPasswordResetManager } from './lib/owner-auth.js';
import { upsertDiscipleFromApplication, allocateDiscipleHandle, affiliatePublicUrl, changeDiscipleHandle } from './lib/disciple-sync.js';
import { receiveDiscipleApplication } from './lib/disciple-intake.js';
import { approveDiscipleApplication, resendDiscipleWelcome, reviewDiscipleApplication, setDiscipleActiveStatus } from './lib/disciple-operations.js';
import { buildSystemHealth } from './lib/system-health.js';
import { creditDiscipleSale, markDiscipleCommissionPaid, reverseDiscipleCommission } from './lib/disciple-financial-operations.js';
import { discipleApplicationsCsv, disciplesCsv, discipleCommissionsCsv, disciplePayoutsCsv } from './lib/disciple-exports.js';
import { flagOrderCommissionsForReversal } from './lib/disciple-reversals.js';
import { setLeaderStatus,assignTeamMember,endTeamAssignment } from './lib/disciple-teams.js';
import { createCommunityBonus,reverseCommunityBonusForCommission } from './lib/disciple-community-bonus.js';
import { awardLeaderBundle,inviteMemberBundle } from './lib/disciple-bundles.js';
import { publicShopCatalog } from './lib/shop-catalog.js';
import { reserveShopInventory } from './lib/shop-inventory.js';
import { buildShopCheckoutSession, normalizeShopCart, normalizeSponsoredShirtCart, ShopCheckoutError } from './lib/shop-checkout.js';
import { expireShopSession, finalizeShopSession, refundShopOrder } from './lib/shop-finalize.js';
import { deliverShopConfirmation } from './lib/shop-email.js';
import { shopMetrics, shopOrdersCsv } from './lib/shop-report.js';

const startupStore = readStore();
const eventUpdated=synchronizeKvnLive2026Event(startupStore);
const compOfferClosed=closePublicCompOffer(startupStore);
const surveyRouting=routeSurveyLeads(startupStore);
if(eventUpdated||compOfferClosed||surveyRouting.created||surveyRouting.updated)writeStore(startupStore);
console.log('Survey lead routing verified: '+JSON.stringify(surveyRouting));

const app = express();
app.set('trust proxy', true);
const port = process.env.PORT || 3000;
const baseUrl = 'https://kvnlive.com'; // Public destinations never inherit the engine host.
const affiliateBaseUrl = 'https://kvnlive.com/affiliate';
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

function recordStripeReversal(event){
  const object=event.data?.object||{},paymentIntentId=typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id;
  const d=readStore(),orderId=String(object.metadata?.order_id||'');
  const order=[...(d.orders||[]),...(d.shopOrders||[])].find(item=>item.id===orderId||(paymentIntentId&&item.stripePaymentIntentId===paymentIntentId));
  if(!order)return [];
  const reason=event.type==='charge.dispute.created'?'Stripe dispute opened.':'Stripe refund recorded.';
  const affected=flagOrderCommissionsForReversal(d,{orderId:order.id,reason,sourceEventId:event.id},{id});
  order.paymentAttention={type:event.type,eventId:event.id,recordedAt:new Date().toISOString()};
  writeStore(d);
  return affected;
}

const smsTwilioClient=createTwilioClient({env:process.env});
const smsTxt180Client=createTxt180Client({env:process.env});
const smsContacts=process.env.SMS_PROVIDER==='txt180'?createSmsContactsService({readStore,writeStore,client:smsTxt180Client,env:process.env}):null;
const smsDispatcher=createSmsDispatcher({readStore,writeStore,client:smsContacts?smsTxt180Client:smsTwilioClient,env:process.env,beforeDispatch:smsContacts?()=>smsContacts.syncOptouts():null});
smsDispatcher.start();
if(smsContacts)smsContacts.verifyConnection().then(()=>console.log('TXT180 customer API connection verified.')).catch(()=>console.error('TXT180 customer API connection check failed.'));
registerSmsOptIn(app,{env:process.env});
registerSmsWebhooks(app,{readStore,writeStore,client:smsTwilioClient,env:process.env});

const marketingEngagement = createEngagementStore({dataDir:runtimeDataDir});
registerEngagementWebhook(app,{store:marketingEngagement});

// Stripe webhook must receive the raw request body before JSON parsing.
const luxrideNotifications=createLuxrideNotifications({readStore,writeStore,txtClient:smsTxt180Client,twilioClient:smsTwilioClient});
registerLuxrideBridge(app,{express,stripe,notifications:luxrideNotifications});
app.post('/api/webhook', express.raw({type:'application/json'}), async (req,res)=>{
  try {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Webhook not configured');
    const sig=req.headers['stripe-signature'];
    const event=stripe.webhooks.constructEvent(req.body,sig,process.env.STRIPE_WEBHOOK_SECRET);
    if(await forwardLuxrideEvent(event))return res.json({received:true});
    if(event.type==='checkout.session.completed' && event.data.object.payment_status==='paid'){
      if(event.data.object.metadata?.order_type==='donation'){
        await finalizeDonationSession(event.data.object);
      } else if(event.data.object.metadata?.order_type==='apparel'){
        const d=readStore();await finalizeShopSession(d,event.data.object,{id,queueConfirmation:async order=>{writeStore(d);await deliverShopConfirmation({order,apiKey:process.env.RESEND_API_KEY,from:process.env.SHOP_EMAIL_FROM||'Kingdom Vibe Shop <shop@tickets.kvnlive.com>'});persistShopEmail(order);}});
      } else await finalizeSession(event.data.object);
    }
    if(event.type==='checkout.session.expired'){
      if(event.data.object.metadata?.order_type==='apparel'){const d=readStore();expireShopSession(d,event.data.object);writeStore(d);}
      else expireSession(event.data.object);
    }
    if(event.type==='charge.refunded'||event.type==='charge.dispute.created')recordStripeReversal(event);
    res.json({received:true});
  } catch(err) { console.error('Webhook error',err.message); res.status(400).send(`Webhook Error: ${err.message}`); }
});

app.use(['/api/marketing/import','/api/marketing/clean-csv'],auth,owner,express.json({limit:'24mb'}));
app.use(express.json({limit:'2mb'}));
registerMemberRoutes(app,{dataDir:runtimeDataDir,readStore,baseUrl});
const customerCheckout=createCustomerCheckout({readStore,writeStore,stripe,finalizers:{ticket:finalizeSession,donation:finalizeDonationSession,apparel:async session=>{const d=readStore();await finalizeShopSession(d,session,{id,queueConfirmation:async order=>{writeStore(d);await deliverShopConfirmation({order,apiKey:process.env.RESEND_API_KEY,from:process.env.SHOP_EMAIL_FROM||'Kingdom Vibe Shop <shop@tickets.kvnlive.com>'});persistShopEmail(order);}});}}});
customerCheckout.register(app);
app.use('/performance-agreement.html',(req,res,next)=>{res.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});next()});
app.use(['/sponsored.html','/sponsored-admin.html'],(req,res,next)=>{res.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://kvnlive.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});next();});
app.use((req,res,next)=>{if(req.method==='GET'&&String(req.hostname).endsWith('.onrender.com')&&!commerceClientIdentity(req).startsWith('bridge:')){const url=new URL(req.originalUrl,'https://kvnlive.com'),destination=legacyPageDestination(url.pathname,url.search);if(destination)return res.redirect(302,destination);}next();});
app.use(express.static('public'));
const uploadDir = process.env.UPLOAD_DIR || path.resolve('public/uploads');
requireDir(uploadDir);
app.use('/uploads', express.static(uploadDir));
app.get('/engine-preview',(req,res)=>res.sendFile(path.resolve('public/engine-preview.html')));
app.get('/links-preview',(req,res)=>res.sendFile(path.resolve('public/links-preview.html')));

app.get('/api/shop/catalog',(req,res)=>{
  res.set('Cache-Control','public, max-age=60').json(publicShopCatalog(readStore()));
});

async function finalizeDonationSession(session){
  const d=readStore();
  const donation=d.donations.find(item=>item.id===String(session.metadata?.donation_id||'')||item.stripeSessionId===session.id);
  if(!donation)return null;
  if(session.payment_status==='paid'&&donation.status!=='paid'){
    donation.status='paid';
    donation.paidAt=new Date().toISOString();
    donation.stripePaymentIntentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||'';
    donation.amountTotal=Number(session.amount_total||donation.amount||0);
    donation.updatedAt=donat…19669 tokens truncated…json({error:'No access.'});
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
  const orders=d.orders.filter(o=>o.eventId===e.id&&['paid','complimentary'].includes(o.status));
  res.type('text/csv').set('Content-Disposition',`attachment; filename="${e.slug}-complete-report.csv"`).send(eventReportCsv(e,orders));
});

app.post('/api/tickets/:code/transfer', auth, (req,res)=>{
  const d=readStore(); const code=String(req.params.code).toUpperCase(); for(const o of d.orders){ const t=o.tickets?.find(x=>x.code===code); if(!t) continue; const e=d.events.find(x=>x.id===o.eventId); if(!canManage(req.user,e)||!can(req.user,'attendees')) return res.status(403).json({error:'No access.'}); t.holderName=String(req.body.name||t.holderName); t.holderEmail=String(req.body.email||''); t.transferredAt=new Date().toISOString(); logAudit(d,req.user,'ticket.transfer','ticket',t.id,{code,email:t.holderEmail}); writeStore(d); return res.json({ticket:t}); } res.status(404).json({error:'Ticket not found.'});
});
app.post('/api/orders/:id/resend', auth, async (req,res)=>{ const d=readStore(); const o=d.orders.find(x=>x.id===req.params.id); if(!o) return res.status(404).json({error:'Order not found.'}); const e=d.events.find(x=>x.id===o.eventId); if(!canManage(req.user,e)||!can(req.user,'orders')) return res.status(403).json({error:'No access.'}); const confirmationEmail=await sendConfirmation(o,e,{force:true}); const latest=readStore();logAudit(latest,req.user,'order.resend','order',o.id,{emailStatus:confirmationEmail.status});writeStore(latest);persistEmailResults(o,['confirmationEmail','confirmationEmailAttempts']); res.status(confirmationEmail.status==='sent'?200:502).json({ok:confirmationEmail.status==='sent',confirmationEmail}); });

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

const httpServer=app.listen(port,()=>console.log(`KVN Live Tickets v4 running at ${baseUrl}`));
process.once('SIGTERM',()=>{
  smsDispatcher.stop();
  httpServer.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),1000).unref();
});
