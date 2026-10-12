import crypto from 'node:crypto';
export const SPONSORED_CAP = 500;
export const VIP_PRODUCT = 'kv-all-access-2026';
export const SPONSORED_INTERESTS = ['events','disciple','volunteer','business','ministry','sponsor','donate','attend'];
const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' '));
const campaign = 'kap-kv-live-2026';
const token = () => crypto.randomBytes(32).toString('hex');
const id = prefix => `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), {statusCode}); };
const now = deps => new Date((deps.now || Date.now)()).toISOString();
const emailKey = value => String(value || '').trim().toLowerCase();
function phoneKey(value) { const digits=String(value||'').replace(/\D/g,''); return digits.length===11&&digits[0]==='1'?digits.slice(1):digits; }
function ensure(s) { s.sponsoredInvitations ||= []; s.sponsoredClaims ||= []; s.orders ||= []; return s; }
function eventFor(s) { const e=(s.events||[]).find(e=>e.slug==='kingdom-vibe-live-2026'&&e.status==='published'); if(!e)fail('KV Live is not available.',409);return e; }
const capacity = inv => inv.claimedAt ? Number(inv.claimedQuantity||1) : Number(inv.maxPasses||1);
const publicUsed = s => (s.sponsoredClaims||[]).filter(c=>c.claimedAt&&!c.invitationId).reduce((n,c)=>n+Number(c.quantity||1),0);
const publicRemaining = s => Math.max(0,SPONSORED_CAP-(s.sponsoredInvitations||[]).reduce((n,i)=>n+capacity(i),0)-publicUsed(s));
function publicInvitation(s,code){ensure(s);const d=code?(s.disciples||[]).find(d=>d.status==='active'&&String(d.code).toLowerCase()===String(code).toLowerCase()):null;if(code&&!d)fail('Disciple referral not found.',404);return {id:null,maxPasses:2,discipleId:d?.id||''};}
function audit(s,action,actorId,entityId) { s.auditLogs ||= [];s.auditLogs.push({id:id('log'),action,userId:actorId||'guest',entityType:'sponsored_pass',entityId,createdAt:new Date().toISOString()}); }
export const hashTestToken = hash;
export function checkClaimLaunch(s,input={},deps={}) {
  if(!deps.launchAt||(deps.now||Date.now)()>=Date.parse(deps.launchAt))return false;
  if(!deps.testTokenHash||hash(input.testToken)!==deps.testTokenHash)fail('Public claiming opens today at 1 PM Eastern.',403);
  if((s.sponsoredClaims||[]).some(c=>c.liveLaunchTest&&c.claimedAt))fail('The live test has completed. Public claiming opens at 1 PM Eastern.',403);
  return true;
}
export function allocateInvitations(s,input,deps={}) {
  ensure(s);eventFor(s);
  const count=Number(input.count),maxPasses=Number(input.maxPasses??2),requestId=String(input.requestId||'');
  if(![1,2].includes(maxPasses))fail('Each invitation can allow one or two passes.');
  if(!Number.isInteger(count)||count<1||count>SPONSORED_CAP||!/^[\w-]{1,100}$/.test(requestId))fail('Use 1–500 invitations and a unique request ID.');
  const discipleId=String(input.discipleId||'');
  if(discipleId&&!(s.disciples||[]).some(d=>d.id===discipleId&&d.status==='active'))fail('Active Disciple not found.');
  const prior=s.sponsoredInvitations.filter(i=>i.requestId===requestId);
  if(prior.length){if(prior.length!==count||prior[0].discipleId!==discipleId||Number(prior[0].maxPasses||1)!==maxPasses)fail('Request ID already used with different allocation.',409);return prior;}
  if(s.sponsoredInvitations.reduce((n,i)=>n+capacity(i),0)+publicUsed(s)+count*maxPasses>SPONSORED_CAP)fail('The KAP campaign is limited to 500 allocated passes.',409);
  const created=Array.from({length:count},()=>({id:id('inv'),campaign,token:token(),maxPasses,discipleId,requestId,createdAt:now(deps),createdBy:deps.actorId||'',sentAt:null,claimedAt:null}));
  s.sponsoredInvitations.push(...created);audit(s,'sponsored.allocate',deps.actorId,requestId);return created;
}
function invitation(s,secret) { ensure(s);const inv=s.sponsoredInvitations.find(i=>i.token===secret);if(!inv)fail('Invitation not found.',404);return inv; }
export function invitationInfo(s,secret,discipleCode) { const inv=secret?invitation(s,secret):publicInvitation(s,discipleCode);const e=eventFor(s);const remaining=publicRemaining(s);return {cap:SPONSORED_CAP,public:!secret,remaining,maxPasses:secret?inv.maxPasses||1:Math.min(2,remaining),available:secret?!inv.claimedAt:remaining>0,sponsor:'KAP',event:{id:e.id,title:'KV Live',date:e.date,venue:e.venue,location:e.location},distributor:(s.disciples||[]).find(d=>d.id===inv.discipleId)?.name||'KAP'}; }
export function beginClaim(s,input,deps={}) {
  const liveLaunchTest=checkClaimLaunch(s,input,deps);
  const inv=input.invitationToken?invitation(s,input.invitationToken):publicInvitation(s,input.discipleCode);eventFor(s);
  if(inv.claimedAt)fail('This invitation has already been claimed.',409);
  const email=emailKey(input.email),phone=phoneKey(input.phone),name=String(input.name||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!/^\d{10}$/.test(phone)||!name||name.length>120)fail('Enter your name, valid email, and 10-digit US phone number.');
  const city=String(input.city||'').trim(),state=String(input.state||'').trim().toUpperCase(),zip=String(input.zip||'').trim();
  if(!city||city.length>100||!US_STATES.has(state)||!/^\d{5}(-\d{4})?$/.test(zip))fail('Enter your city, two-letter US state, and ZIP code.');
  if(input.interests!==undefined&&(!Array.isArray(input.interests)||input.interests.length>SPONSORED_INTERESTS.length||input.interests.some(v=>!SPONSORED_INTERESTS.includes(v))))fail('Choose interests from the available options.');
  const interests=[...new Set(input.interests||[])];
  if(!interests.length)fail('Complete the survey by choosing at least one option, including just enjoying KV Live for now.');
  const quantity=Number(input.quantity??1);if(![1,2].includes(quantity)||quantity>Number(inv.maxPasses||1))fail('Choose one or two passes within this invitation’s allocation.');
  if(!inv.id&&quantity>publicRemaining(s))fail('Not enough sponsored passes are available.',409);
  const timestamp=now(deps);
  const prior=s.sponsoredClaims.find(c=>c.invitationId===inv.id&&c.email===email&&!c.claimedAt&&Date.parse(c.expiresAt)>Date.parse(timestamp));
  if(prior)fail('A verification email is already pending. Please check your inbox; links expire after 30 minutes.',429);
  const verificationToken=token();
  // Pending requests are bounded and never consume an admission. Other recipients cannot invalidate a pending token.
  s.sponsoredClaims=s.sponsoredClaims.filter(c=>c.claimedAt||Date.parse(c.expiresAt)>Date.parse(timestamp));
  if((inv.id&&s.sponsoredClaims.filter(c=>c.invitationId===inv.id&&!c.claimedAt).length>=5)||s.sponsoredClaims.filter(c=>!c.claimedAt&&c.phone===phone).length>=5||s.sponsoredClaims.filter(c=>!c.claimedAt).length>=5000)fail('Please wait before requesting another verification email.',429);
  const c={id:id('claim'),campaign,liveLaunchTest,invitationId:inv.id,discipleId:inv.discipleId,name,email,phone,city,state,zip,interests,quantity,verificationHash:hash(verificationToken),accessToken:token(),surveyCompletedAt:timestamp,createdAt:timestamp,expiresAt:new Date(Date.parse(timestamp)+30*60*1000).toISOString(),claimedAt:null,orderId:null};
  s.sponsoredClaims.push(c);return {claimId:c.id,verificationToken,email,name};
}
export function confirmClaim(s,verificationToken,deps={}) {
  ensure(s);const c=s.sponsoredClaims.find(c=>c.verificationHash===hash(verificationToken));if(!c)fail('Verification link not found.',404);
  if(c.claimedAt)return c;
  if(c.liveLaunchTest&&(s.sponsoredClaims||[]).some(other=>other.id!==c.id&&other.liveLaunchTest&&other.claimedAt))fail('The live test has completed. Public claiming opens at 1 PM Eastern.',403);
  if(deps.launchAt&&(deps.now||Date.now)()<Date.parse(deps.launchAt)&&!c.liveLaunchTest)fail('Public claiming opens today at 1 PM Eastern.',403);
  const timestamp=now(deps);if(Date.parse(c.expiresAt)<=Date.parse(timestamp))fail('Verification link expired. Request a new one.',410);
  const inv=s.sponsoredInvitations.find(i=>i.id===c.invitationId);if(c.invitationId&&!inv)fail('Invitation not found.',404);if(inv?.claimedAt)fail('This invitation has already been claimed.',409);
  if(!c.invitationId&&Number(c.quantity||1)>publicRemaining(s))fail('Not enough sponsored passes are available.',409);
  if(s.sponsoredClaims.some(other=>other.claimedAt&&(other.email===c.email||other.phone===c.phone)))fail('A sponsored pass has already been claimed for this email or phone.',409);
  const e=eventFor(s),orderId=id('ord'),quantity=c.quantity||1;
  if(s.sponsoredClaims.filter(x=>x.claimedAt).reduce((n,x)=>n+Number(x.quantity||1),0)+quantity>SPONSORED_CAP)fail('All 500 sponsored passes have been claimed.',409);
  const tickets=Array.from({length:quantity},()=>({id:id('tkt'),code:`KVN-${crypto.randomBytes(16).toString('hex').toUpperCase()}`,productId:'kap-sponsored-ga-2026',ticketName:'KAP Sponsored General Admission — No Apparel',holderName:c.name,holderEmail:c.email,apparel:null,includedApparel:null,checkedIn:false,checkedInAt:null,status:'active'}));
  const ticket=tickets[0];
  s.orders.push({id:orderId,eventId:e.id,organizationId:e.organizationId,orderType:'sponsored_ga',sponsoredClaimId:c.id,discipleId:c.discipleId,commissionEligible:false,buyerName:c.name,buyerEmail:c.email,customer:{name:c.name,email:c.email,cellPhone:c.phone},items:[{productId:ticket.productId,name:ticket.ticketName,type:'ticket',quantity,unitAmount:0}],amountSubtotal:0,amountTotal:0,status:'complimentary',createdAt:timestamp,tickets});
  c.claimedAt=timestamp;c.orderId=orderId;if(inv){inv.claimedAt=timestamp;inv.claimedQuantity=quantity;}audit(s,'sponsored.claim',null,c.id);return c;
}
export function claimAccess(s,secret) { ensure(s);const c=s.sponsoredClaims.find(c=>c.claimedAt&&c.accessToken===secret);if(!c)fail('Pass access link not found.',404);return c; }
export function validateUpgrade(s,input) {
  const c=claimAccess(s,input.sponsoredClaimToken),order=s.orders.find(o=>o.id===c.orderId);
  if(c.upgradeOrderId)fail('This pass has already been upgraded.',409);
  if(order.tickets.some(t=>t.checkedIn))fail('This pass has already checked in. Contact the event team for an upgrade.',409);
  if(input.eventId!==order.eventId||emailKey(input.customer?.email)!==c.email)fail('Use the verified pass email for this event.');
  if(!Array.isArray(input.cart)||input.cart.length!==1||input.cart[0].id!==VIP_PRODUCT||Number(input.cart[0].quantity)!==Number(c.quantity||1)||input.discountCode)fail(`This claim requires ${c.quantity||1} VIP bundle(s) to upgrade all its passes at current pricing.`);
  if(s.orders.some(o=>o.sponsoredClaimId===c.id&&o.orderType==='sponsored_upgrade'&&(o.status==='paid'||['pending','checkout_failed'].includes(o.status))))fail('An upgrade checkout is already in progress. Complete it or wait for it to expire.',409);
  return c;
}
export function completeUpgrade(s,order) {
  if(!order.sponsoredClaimId)return;
  const c=(s.sponsoredClaims||[]).find(c=>c.id===order.sponsoredClaimId&&c.claimedAt);if(!c)fail('Sponsored claim missing.',409);
  if(c.upgradeOrderId&&c.upgradeOrderId!==order.id)fail('Another upgrade has already completed.',409);
  const original=s.orders.find(o=>o.id===c.orderId);if(!original)fail('Original sponsored order missing.',409);
  const checked=original.tickets.filter(t=>t.checkedIn);
  for(const ticket of original.tickets){ticket.status='replaced';ticket.replacedByOrderId=order.id;}
  // A payment finishing after GA check-in must not create a second usable admission.
  for(let index=0;index<checked.length;index++){const ticket=order.tickets[index];if(ticket){ticket.checkedIn=true;ticket.checkedInAt=checked[index].checkedInAt;}}
  c.upgradeOrderId=order.id;c.upgradedAt=order.paidAt||new Date().toISOString();
}
export function sponsoredReport(s) {
  const invites=s.sponsoredInvitations||[],claims=(s.sponsoredClaims||[]).filter(c=>c.claimedAt);
  const rows=claims.map(c=>{const application=(s.discipleApplications||[]).find(a=>emailKey(a.email)===c.email&&Date.parse(a.submittedAt)>=Date.parse(c.claimedAt));const member=(s.disciples||[]).find(d=>emailKey(d.email)===c.email&&d.status==='active'&&Date.parse(d.createdAt)>=Date.parse(c.claimedAt));const upgrade=s.orders.find(o=>o.id===c.upgradeOrderId)||s.orders.findLast(o=>o.sponsoredClaimId===c.id&&o.orderType==='sponsored_upgrade');return {id:c.id,quantity:c.quantity||1,name:c.name,email:c.email,phone:c.phone,city:c.city||'',state:c.state||'',zip:c.zip||'',interests:c.interests||[],discipleId:c.discipleId,claimedAt:c.claimedAt,applicationId:application?.id||'',converted:Boolean(member),upgradeOrderId:c.upgradeOrderId||'',upgradeStatus:upgrade?.paymentAttention?'payment_review':upgrade?.status||'',upgradeRevenue:upgrade?.status==='paid'&&!upgrade.paymentAttention?upgrade.amountTotal:0,commissionAmount:upgrade?.discipleCommissionAmount||0,commissionStatus:(s.discipleCommissions||[]).find(row=>row.orderId===upgrade?.id)?.status||''};});
  const stats=items=>({guestClaims:items.length,claimed:items.reduce((n,c)=>n+c.quantity,0),applications:items.filter(c=>c.applicationId).length,conversions:items.filter(c=>c.converted).length,upgrades:items.filter(c=>c.upgradeOrderId).reduce((n,c)=>n+c.quantity,0),paidUpgrades:items.filter(c=>c.upgradeStatus==='paid').reduce((n,c)=>n+c.quantity,0),upgradeRevenue:items.reduce((n,c)=>n+c.upgradeRevenue,0)});
  return {cap:SPONSORED_CAP,allocated:invites.reduce((n,i)=>n+capacity(i),0)+publicUsed(s),unallocated:publicRemaining(s),publicRemaining:publicRemaining(s),publicClaimed:publicUsed(s),invitationCount:invites.length,invitationsSent:invites.filter(i=>i.sentAt).length,remaining:SPONSORED_CAP-claims.reduce((n,c)=>n+Number(c.quantity||1),0),unclaimedAllocated:invites.filter(i=>!i.claimedAt).reduce((n,i)=>n+capacity(i),0),...stats(rows),claims:rows,byDisciple:[...new Set([...invites.map(i=>i.discipleId),...claims.map(c=>c.discipleId)])].map(discipleId=>({discipleId,name:(s.disciples||[]).find(d=>d.id===discipleId)?.name||'KAP',allocated:invites.filter(i=>i.discipleId===discipleId).reduce((n,i)=>n+capacity(i),0),...stats(rows.filter(c=>c.discipleId===discipleId))}))};
}
