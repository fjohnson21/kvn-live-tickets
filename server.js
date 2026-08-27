import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { readStore, writeStore, id, slugify, ticketCode } from './store.js';

const app = express();
const port = process.env.PORT || 3000;
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const sessions = new Map();
const requireDir=p=>fs.mkdirSync(p,{recursive:true}); const pathJoin=path.join; const fsWrite=fs.writeFileSync;

// Stripe webhook must receive the raw request body before JSON parsing.
app.post('/api/webhook', express.raw({type:'application/json'}), async (req,res)=>{
  try {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Webhook not configured');
    const sig=req.headers['stripe-signature'];
    const event=stripe.webhooks.constructEvent(req.body,sig,process.env.STRIPE_WEBHOOK_SECRET);
    if(event.type==='checkout.session.completed' && event.data.object.payment_status==='paid') await finalizeSession(event.data.object);
    res.json({received:true});
  } catch(err) { console.error('Webhook error',err.message); res.status(400).send(`Webhook Error: ${err.message}`); }
});

app.use(express.json({limit:'2mb'}));
app.use(express.static('public'));
const uploadDir = process.env.UPLOAD_DIR || path.resolve('public/uploads');
requireDir(uploadDir);
app.use('/uploads', express.static(uploadDir));

const safeUser = u => u ? ({id:u.id,name:u.name,email:u.email,role:u.role,organizationId:u.organizationId,permissions:u.permissions||[]}) : null;
function auth(req,res,next){ const token=(req.headers.authorization||'').replace('Bearer ','') || String(req.query.token||''); const uid=sessions.get(token); const user=readStore().users.find(u=>u.id===uid); if(!user) return res.status(401).json({error:'Sign in required.'}); req.user=user; next(); }
function owner(req,res,next){ if(req.user?.role!=='owner') return res.status(403).json({error:'Owner access required.'}); next(); }
function canManage(user,event){ return user.role==='owner' || ((user.role==='organizer'||user.role==='staff') && event.organizationId===user.organizationId); }
function publicEvent(e){ return {...e, products:e.products.map(p=>({...p,available:Math.max(0,p.inventory-p.sold)}))}; }

app.get('/api/platform', (req,res)=>{ const d=readStore(); res.json({settings:d.settings, organizations:d.organizations.filter(o=>o.status==='approved').map(o=>({id:o.id,name:o.name,slug:o.slug})), events:d.events.filter(e=>e.status==='published').map(publicEvent)}); });
app.get('/api/events/:slug', (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.slug===req.params.slug && x.status==='published'); if(!e) return res.status(404).json({error:'Event not found.'}); const org=d.organizations.find(o=>o.id===e.organizationId); res.json({event:publicEvent(e),organization:org&&{id:org.id,name:org.name,slug:org.slug}}); });

app.post('/api/auth/demo', (req,res)=>{ const d=readStore(); const role=req.body.role==='owner'?'owner':'organizer'; const user=d.users.find(u=>u.role===role); const token=crypto.randomBytes(18).toString('hex'); sessions.set(token,user.id); res.json({token,user:safeUser(user)}); });
app.get('/api/me', auth, (req,res)=>res.json({user:safeUser(req.user)}));

app.post('/api/organizations/apply', (req,res)=>{ const d=readStore(); const name=String(req.body.name||'').trim(), email=String(req.body.email||'').trim(); if(!name||!email) return res.status(400).json({error:'Organization name and email are required.'}); const org={id:id('org'),name,slug:slugify(name),status:'pending',stripeAccountId:'',createdAt:new Date().toISOString()}; const user={id:id('usr'),name:req.body.contactName||name,email,role:'organizer',organizationId:org.id}; d.organizations.push(org); d.users.push(user); writeStore(d); res.status(201).json({organization:org,message:'Application submitted for KVN review.'}); });

app.get('/api/dashboard', auth, (req,res)=>{ const d=readStore(); const events=req.user.role==='owner'?d.events:d.events.filter(e=>e.organizationId===req.user.organizationId); const orders=req.user.role==='owner'?d.orders:d.orders.filter(o=>events.some(e=>e.id===o.eventId)); const organizations=req.user.role==='owner'?d.organizations:d.organizations.filter(o=>o.id===req.user.organizationId); const gross=orders.reduce((n,o)=>n+(o.amountTotal||0),0); res.json({user:safeUser(req.user),events,orders,organizations,discounts:d.discounts.filter(x=>req.user.role==='owner'||events.some(e=>e.id===x.eventId)),settings:d.settings,staff:d.users.filter(u=>u.role==='staff'&&(req.user.role==='owner'||u.organizationId===req.user.organizationId)),payouts:d.payouts.filter(p=>req.user.role==='owner'||organizations.some(o=>o.id===p.organizationId)),metrics:{gross,orders:orders.length,tickets:orders.reduce((n,o)=>n+(o.tickets?.length||0),0),events:events.length}}); });

app.post('/api/events', auth, (req,res)=>{ const d=readStore(); const title=String(req.body.title||'Untitled Event').trim(); const orgId=req.user.role==='owner'?(req.body.organizationId||req.user.organizationId):req.user.organizationId; const event={id:id('evt'),organizationId:orgId,slug:`${slugify(title)}-${Math.random().toString(36).slice(2,6)}`,title,subtitle:req.body.subtitle||'',description:req.body.description||'',date:req.body.date||'',venue:req.body.venue||'',location:req.body.location||'',status:req.user.role==='owner'?'draft':'pending',featured:false,theme:{accent:'#e2252b',surface:'#111111',logoText:title.toUpperCase().slice(0,20)},products:[],layout:[{id:id('b'),type:'hero',title,body:req.body.subtitle||'Event experience'},{id:id('b'),type:'tickets',title:'Tickets',body:'Choose your experience.'}],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; d.events.push(event); writeStore(d); res.status(201).json({event}); });

app.put('/api/events/:id', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e) return res.status(404).json({error:'Event not found.'}); if(!canManage(req.user,e)) return res.status(403).json({error:'No access.'}); const allowed=['title','subtitle','description','date','venue','location','theme','products','layout']; for(const k of allowed) if(req.body[k]!==undefined) e[k]=req.body[k]; e.updatedAt=new Date().toISOString(); if(req.user.role!=='owner' && req.body.submitForReview) e.status='pending'; writeStore(d); res.json({event:e}); });

app.post('/api/events/:id/status', auth, owner, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e) return res.status(404).json({error:'Event not found.'}); const status=req.body.status; if(!['draft','pending','published','rejected','paused'].includes(status)) return res.status(400).json({error:'Invalid status.'}); e.status=status; e.updatedAt=new Date().toISOString(); writeStore(d); res.json({event:e}); });

app.post('/api/events/:id/products', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e||!canManage(req.user,e)) return res.status(404).json({error:'Event not found.'}); const p={id:id('prd'),type:req.body.type==='apparel'?'apparel':'ticket',name:req.body.name||'New Ticket',description:req.body.description||'',price:Math.max(0,Number(req.body.price)||0),inventory:Math.max(0,Number(req.body.inventory)||0),sold:0,badge:req.body.badge||'',options:req.body.options||undefined}; e.products.push(p); e.updatedAt=new Date().toISOString(); writeStore(d); res.status(201).json({product:p,event:e}); });

app.post('/api/discounts', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.body.eventId); if(!e||!canManage(req.user,e)) return res.status(403).json({error:'No access.'}); const disc={id:id('disc'),eventId:e.id,code:String(req.body.code||'').toUpperCase().replace(/\s/g,''),type:req.body.type==='fixed'?'fixed':'percent',value:Math.max(0,Number(req.body.value)||0),active:true,maxUses:Math.max(1,Number(req.body.maxUses)||100),uses:0}; if(!disc.code) return res.status(400).json({error:'Code required.'}); d.discounts.push(disc); writeStore(d); res.status(201).json({discount:disc}); });

app.post('/api/create-checkout-session', async (req,res)=>{
  try{
    const d=readStore(); const e=d.events.find(x=>x.id===req.body.eventId && x.status==='published'); if(!e) return res.status(404).json({error:'Event is not available for checkout.'});
    const cart=Array.isArray(req.body.cart)?req.body.cart:[]; if(!cart.length) return res.status(400).json({error:'Your cart is empty.'});
    let subtotal=0; const normalized=[]; const lineItems=[];
    for(const item of cart){ const p=e.products.find(x=>x.id===item.id); if(!p) continue; const q=Math.max(1,Math.min(Number(item.quantity)||1,20)); if(q>p.inventory-p.sold) return res.status(409).json({error:`Only ${p.inventory-p.sold} ${p.name} remaining.`}); let name=p.name; if(p.type==='apparel'){ const size=item.size; if(!p.options?.size?.includes(size)) return res.status(400).json({error:`Select a valid size for ${p.name}.`}); name+=` — ${size}`; } subtotal+=p.price*q; normalized.push({productId:p.id,name,type:p.type,size:item.size||null,quantity:q,unitAmount:p.price}); lineItems.push({quantity:q,price_data:{currency:'usd',unit_amount:p.price,product_data:{name,description:p.description}}}); }
    if(!normalized.length) return res.status(400).json({error:'No valid items.'});
    let discountAmount=0, discountCode=''; if(req.body.discountCode){ const disc=d.discounts.find(x=>x.eventId===e.id&&x.active&&x.code===String(req.body.discountCode).toUpperCase()&&x.uses<x.maxUses); if(disc){ discountCode=disc.code; discountAmount=disc.type==='percent'?Math.round(subtotal*Math.min(disc.value,100)/100):Math.min(subtotal,Math.round(disc.value)); } }
    const taxAmount=Math.round((subtotal-discountAmount)*(Number(e.taxRatePercent)||0)/100); if(taxAmount>0) lineItems.push({quantity:1,price_data:{currency:'usd',unit_amount:taxAmount,product_data:{name:'Taxes'}}});
    const orderId=id('ord');
    if(!stripe){ return res.status(503).json({error:'Stripe is not configured. Add STRIPE_SECRET_KEY to .env to accept live/test payments.',preview:{subtotal,discountAmount,total:subtotal-discountAmount,orderId}}); }
    if(discountAmount>0) lineItems.push({quantity:1,price_data:{currency:'usd',unit_amount:-discountAmount,product_data:{name:`Discount ${discountCode}`}}});
    // Stripe does not allow negative price_data. Apply an ad-hoc coupon instead.
    let discounts=[]; if(discountAmount>0){ lineItems.pop(); const coupon=await stripe.coupons.create({amount_off:discountAmount,currency:'usd',duration:'once',name:`${discountCode} discount`}); discounts=[{coupon:coupon.id}]; }
    const sessionConfig={mode:'payment',line_items:lineItems,discounts,success_url:`${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${baseUrl}/event.html?slug=${encodeURIComponent(e.slug)}&checkout=cancelled`,customer_email:req.body.customer?.email||undefined,billing_address_collection:'auto',phone_number_collection:{enabled:true},metadata:{order_id:orderId,event_id:e.id,discount_code:discountCode,buyer_name:req.body.customer?.name||''}};
    const org=d.organizations.find(o=>o.id===e.organizationId); const plan=d.settings.feePlans?.find(p=>p.id===org?.feePlanId); const feePct=Number(process.env.PLATFORM_FEE_PERCENT||plan?.percent||d.settings.platformFeePercent||5); if(org?.stripeAccountId){ sessionConfig.payment_intent_data={application_fee_amount:Math.round((subtotal-discountAmount+taxAmount)*feePct/100),transfer_data:{destination:org.stripeAccountId}}; }
    const session=await stripe.checkout.sessions.create(sessionConfig);
    d.orders.push({id:orderId,eventId:e.id,organizationId:e.organizationId,stripeSessionId:session.id,buyerName:req.body.customer?.name||'',buyerEmail:req.body.customer?.email||'',cartId:req.body.cartId||'',items:normalized,amountSubtotal:subtotal,discountAmount,taxAmount,amountTotal:subtotal-discountAmount+taxAmount,status:'pending',tickets:[],createdAt:new Date().toISOString()}); writeStore(d); res.json({url:session.url});
  }catch(err){ console.error(err); res.status(500).json({error:err.message||'Unable to start checkout.'}); }
});

async function sendConfirmation(order,event){
  if(!process.env.RESEND_API_KEY || !order.buyerEmail) return;
  const ticketHtml=(order.tickets||[]).map(t=>`<div style="padding:16px;border:1px solid #ddd;margin:12px 0"><strong>${t.ticketName}</strong><br>${t.code}<br><img width="160" height="160" alt="Ticket QR" src="${baseUrl}/api/tickets/${encodeURIComponent(t.code)}/qr.svg"></div>`).join('');
  try { await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM||'KVN Live Tickets <onboarding@resend.dev>',to:[order.buyerEmail],subject:`Your tickets: ${event.title}`,html:`<h1>You're in.</h1><p>Order ${order.id}</p>${ticketHtml}<p>${event.venue} • ${event.location}</p>`})}); } catch(err){ console.error('Email delivery error',err.message); }
}

async function finalizeSession(session){ const d=readStore(); const o=d.orders.find(x=>x.stripeSessionId===session.id); if(!o||o.status==='paid') return o; const e=d.events.find(x=>x.id===o.eventId); o.status='paid'; o.buyerEmail=session.customer_details?.email||o.buyerEmail; o.buyerName=session.customer_details?.name||o.buyerName; o.paidAt=new Date().toISOString(); for(const item of o.items){ const p=e.products.find(x=>x.id===item.productId); if(p) p.sold+=item.quantity; if(item.type==='ticket') for(let i=0;i<item.quantity;i++) o.tickets.push({id:id('tkt'),code:ticketCode(),productId:item.productId,ticketName:item.name,holderName:o.buyerName,checkedIn:false,checkedInAt:null}); } if(o.discountAmount){ const dc=d.discounts.find(x=>x.eventId===e.id&&x.code===session.metadata?.discount_code); if(dc)dc.uses++; } if(o.cartId){ const c=d.abandonedCarts.find(x=>x.id===o.cartId); if(c){ c.status='converted'; c.updatedAt=new Date().toISOString(); } } writeStore(d); await sendConfirmation(o,e); return o; }

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

app.post('/api/orders/:id/refund', auth, async (req,res)=>{ const d=readStore(); const o=d.orders.find(x=>x.id===req.params.id); if(!o) return res.status(404).json({error:'Order not found.'}); const e=d.events.find(x=>x.id===o.eventId); if(!canManage(req.user,e)) return res.status(403).json({error:'No access.'}); if(!stripe) return res.status(503).json({error:'Stripe is not configured.'}); const sess=await stripe.checkout.sessions.retrieve(o.stripeSessionId); if(!sess.payment_intent) return res.status(409).json({error:'No payment intent available.'}); await stripe.refunds.create({payment_intent:sess.payment_intent}); o.status='refunded';o.refundedAt=new Date().toISOString();writeStore(d);res.json({order:o}); });

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

app.post('/api/auth/demo-staff', (req,res)=>{
  const d=readStore(); let user=d.users.find(u=>u.role==='staff');
  if(!user){ user={id:'usr_demo_staff',name:'Door Team Demo',email:'staff@example.org',role:'staff',organizationId:'org_kvn',permissions:['checkin','attendees']}; d.users.push(user); writeStore(d); }
  const token=crypto.randomBytes(18).toString('hex'); sessions.set(token,user.id); res.json({token,user:safeUser(user)});
});

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
  const rows=[['Order','Buyer','Email','Ticket','Ticket Type','Checked In','Checked In At']]; d.orders.filter(o=>o.eventId===e.id&&o.status==='paid').forEach(o=>(o.tickets||[]).forEach(t=>rows.push([o.id,o.buyerName,o.buyerEmail,t.code,t.ticketName,t.checkedIn?'Yes':'No',t.checkedInAt||''])));
  res.type('text/csv').set('Content-Disposition',`attachment; filename="${e.slug}-attendees.csv"`).send(rows.map(r=>r.map(csvEscape).join(',')).join('\n'));
});

app.post('/api/tickets/:code/transfer', auth, (req,res)=>{
  const d=readStore(); const code=String(req.params.code).toUpperCase(); for(const o of d.orders){ const t=o.tickets?.find(x=>x.code===code); if(!t) continue; const e=d.events.find(x=>x.id===o.eventId); if(!canManage(req.user,e)||!can(req.user,'attendees')) return res.status(403).json({error:'No access.'}); t.holderName=String(req.body.name||t.holderName); t.holderEmail=String(req.body.email||''); t.transferredAt=new Date().toISOString(); logAudit(d,req.user,'ticket.transfer','ticket',t.id,{code,email:t.holderEmail}); writeStore(d); return res.json({ticket:t}); } res.status(404).json({error:'Ticket not found.'});
});
app.post('/api/orders/:id/resend', auth, async (req,res)=>{ const d=readStore(); const o=d.orders.find(x=>x.id===req.params.id); if(!o) return res.status(404).json({error:'Order not found.'}); const e=d.events.find(x=>x.id===o.eventId); if(!canManage(req.user,e)||!can(req.user,'orders')) return res.status(403).json({error:'No access.'}); await sendConfirmation(o,e); logAudit(d,req.user,'order.resend','order',o.id); writeStore(d); res.json({ok:true}); });

app.post('/api/events/:id/custom-slug', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id); if(!e||!canManage(req.user,e)) return res.status(403).json({error:'No access.'}); const slug=slugify(req.body.slug||''); if(slug.length<3) return res.status(400).json({error:'URL must be at least 3 characters.'}); if(d.events.some(x=>x.id!==e.id&&x.slug===slug)) return res.status(409).json({error:'That event URL is already taken.'}); const prior=e.slug; e.slug=slug;e.customSlug=slug;logAudit(d,req.user,'event.slug','event',e.id,{prior,slug});writeStore(d);res.json({event:e}); });

app.post('/api/organizations/:id/fee-plan', auth, owner, (req,res)=>{ const d=readStore(); const org=d.organizations.find(x=>x.id===req.params.id); const plan=d.settings.feePlans.find(x=>x.id===req.body.feePlanId); if(!org||!plan)return res.status(404).json({error:'Organization or fee plan not found.'}); org.feePlanId=plan.id;logAudit(d,req.user,'organization.fee_plan','organization',org.id,{plan:plan.id});writeStore(d);res.json({organization:org}); });
app.post('/api/events/:id/tax', auth, (req,res)=>{ const d=readStore(); const e=d.events.find(x=>x.id===req.params.id);if(!e||!canManage(req.user,e))return res.status(403).json({error:'No access.'});e.taxRatePercent=Math.max(0,Math.min(20,Number(req.body.rate)||0));logAudit(d,req.user,'event.tax','event',e.id,{rate:e.taxRatePercent});writeStore(d);res.json({event:e}); });
app.post('/api/organizations/:id/payout-schedule', auth, (req,res)=>{ const d=readStore();const org=d.organizations.find(x=>x.id===req.params.id);if(!org||!(req.user.role==='owner'||req.user.organizationId===org.id))return res.status(403).json({error:'No access.'});const schedule=['daily','weekly','monthly','manual'].includes(req.body.schedule)?req.body.schedule:'weekly';org.payoutSchedule=schedule;logAudit(d,req.user,'payout.schedule','organization',org.id,{schedule});writeStore(d);res.json({organization:org}); });
app.post('/api/organizations/:id/payout', auth, async (req,res)=>{ const d=readStore(); const org=d.organizations.find(x=>x.id===req.params.id); if(!org||!(req.user.role==='owner'||req.user.organizationId===org.id))return res.status(403).json({error:'No access.'}); const amount=Math.max(0,Math.round(Number(req.body.amount)||0)); const payout={id:id('pay'),organizationId:org.id,amount,status:'scheduled',scheduledFor:req.body.scheduledFor||new Date().toISOString(),createdAt:new Date().toISOString()}; d.payouts.push(payout);logAudit(d,req.user,'payout.schedule','payout',payout.id,{amount});writeStore(d);res.status(201).json({payout,note:'Recorded for payout processing. Stripe Connect settlement timing is managed by the connected account configuration.'}); });

app.post('/api/carts/track', (req,res)=>{ const d=readStore(); const eventId=String(req.body.eventId||''); if(!d.events.some(e=>e.id===eventId)) return res.status(404).json({error:'Event not found.'}); const cartId=String(req.body.cartId||id('cart')); let c=d.abandonedCarts.find(x=>x.id===cartId); if(!c){c={id:cartId,eventId,createdAt:new Date().toISOString()};d.abandonedCarts.push(c);} c.items=req.body.items||[];c.email=String(req.body.email||c.email||'');c.amount=Math.max(0,Number(req.body.amount)||0);c.status=req.body.status==='converted'?'converted':'open';c.updatedAt=new Date().toISOString();writeStore(d);res.json({cartId}); });

app.get('/api/analytics', auth, (req,res)=>{ const d=readStore(); const events=req.user.role==='owner'?d.events:d.events.filter(e=>e.organizationId===req.user.organizationId); const ids=new Set(events.map(e=>e.id)); const orders=d.orders.filter(o=>ids.has(o.eventId)); const byDay={};orders.filter(o=>o.status==='paid').forEach(o=>{const day=(o.paidAt||o.createdAt).slice(0,10);byDay[day]=(byDay[day]||0)+(o.amountTotal||0)});res.json({salesByDay:Object.entries(byDay).sort().slice(-30).map(([date,total])=>({date,total})),abandoned:d.abandonedCarts.filter(c=>ids.has(c.eventId)&&c.status==='open'),conversion:{orders:orders.filter(o=>o.status==='paid').length,carts:d.abandonedCarts.filter(c=>ids.has(c.eventId)).length}}); });

app.get('/api/audit', auth, (req,res)=>{ const d=readStore(); let logs=d.auditLogs;if(req.user.role!=='owner')logs=logs.filter(l=>{const ev=d.events.find(e=>e.id===l.entityId); const usr=d.users.find(u=>u.id===l.userId); return ev?.organizationId===req.user.organizationId||usr?.organizationId===req.user.organizationId;});res.json({logs:logs.slice(0,300)}); });

app.post('/api/organizations/:id/onboarding', auth, (req,res)=>{ const d=readStore(),org=d.organizations.find(x=>x.id===req.params.id);if(!org||!(req.user.role==='owner'||req.user.organizationId===org.id))return res.status(403).json({error:'No access.'});org.onboarding={...(org.onboarding||{}),...(req.body.onboarding||{})};writeStore(d);res.json({organization:org}); });

app.get('/api/tickets/:code/wallet', (req,res)=>{ const d=readStore(); const o=d.orders.find(o=>o.tickets?.some(t=>t.code===String(req.params.code).toUpperCase()));if(!o)return res.status(404).json({error:'Ticket not found.'});const t=o.tickets.find(t=>t.code===String(req.params.code).toUpperCase());const e=d.events.find(e=>e.id===o.eventId);res.json({ticket:t,event:{title:e.title,date:e.date,venue:e.venue,location:e.location},apple:{ready:Boolean(process.env.APPLE_PASS_CERT),note:'Set Apple Wallet signing certificate variables to issue signed .pkpass files.'},google:{ready:Boolean(process.env.GOOGLE_WALLET_ISSUER_ID),note:'Set Google Wallet issuer credentials to create Add to Google Wallet links.'}}); });

app.get('/api/super-admin', auth, owner, (req,res)=>{ const d=readStore(); const paid=d.orders.filter(o=>o.status==='paid'); const volume=paid.reduce((n,o)=>n+(o.amountTotal||0),0);res.json({organizations:d.organizations,events:d.events,staff:d.users.filter(u=>u.role==='staff'),payouts:d.payouts,auditLogs:d.auditLogs.slice(0,50),abandonedCarts:d.abandonedCarts.filter(c=>c.status==='open'),feePlans:d.settings.feePlans,metrics:{grossVolume:volume,paidOrders:paid.length,organizers:d.organizations.length,publishedEvents:d.events.filter(e=>e.status==='published').length,openCarts:d.abandonedCarts.filter(c=>c.status==='open').length}}); });

app.listen(port,()=>console.log(`KVN Live Tickets v3 running at ${baseUrl}`));
