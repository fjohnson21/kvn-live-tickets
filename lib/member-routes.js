import {createMemberAuth} from './member-auth.js';
import {memberDashboard} from './member-dashboard.js';
import {commerceClientIdentity} from './commerce-client-identity.js';
import {csvCell} from './report.js';
const cookieName='__Host-kvn_member';
const cookie=(token,age=43200)=>`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const tokenOf=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
export function registerMemberRoutes(app,{dataDir,readStore,baseUrl,sendMail=sendMemberReset,mailConfigured=Boolean(process.env.RESEND_API_KEY)}){
 const auth=createMemberAuth({dataDir,readStore}),origins=new Set(['https://kvnlive.com','https://www.kvnlive.com',new URL(baseUrl).origin]);
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(e.statusCode===429)res.set('Retry-After','60');res.status(e.statusCode||503).json({error:e.statusCode?e.message:'Your dashboard is temporarily unavailable. Please try again.'});}};
 app.use('/api/member',(req,res,next)=>{
  res.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'});
  if(req.method!=='GET'&&(req.headers['x-kvn-member']!=='1'||!origins.has(req.headers.origin)))return res.status(403).json({error:'Please use the KVN member sign-in page.'});
  next();
 });
 const limited=(req,kind)=>{
  // Do not trust unverified forwarded-IP headers. Signed Site identities use the existing bridge secret.
  const client=commerceClientIdentity({headers:req.headers,originalUrl:req.originalUrl,socket:req.socket});
  auth.throttle(`${kind}:client:${client}`,kind==='reset'?10:60,15*60*1000);
 };
 const signedIn=(req,res,next)=>{const identity=auth.authenticate(tokenOf(req));if(!identity)return res.status(401).json({error:'Sign in required.'});req.member=identity;next();};
 app.post('/api/member/login',wrap(async(req,res)=>{limited(req,'login');const session=await auth.login(req.body.identifier,req.body.password);res.set('Set-Cookie',cookie(session.token)).json({ok:true});}));
 app.post('/api/member/request-reset',wrap(async(req,res)=>{
  limited(req,'reset');const email=String(req.body.email||'').trim().toLowerCase();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Enter your approved Disciple email address.'});
  auth.throttle(`reset:email:${email}`,3,60*60*1000);
  if(!mailConfigured)return res.status(503).json({error:'Account setup email is temporarily unavailable. Please contact info@kvnlive.com.'});
  const reset=auth.issueReset(email);res.status(202).json({message:'If this email belongs to an approved Disciple, a setup or reset link will arrive shortly. Check your spam folder too.'});
  if(reset)setImmediate(async()=>{try{await sendMail({email:reset.email,url:`https://kvnlive.com/member#token=${reset.token}`});}catch{console.error('Member setup email delivery failed.');}});
 }));
 app.post('/api/member/complete-reset',wrap(async(req,res)=>{limited(req,'setup');res.json({ok:true,...await auth.completeReset(req.body)});}));
 app.post('/api/member/logout',wrap((req,res)=>{auth.logout(tokenOf(req));res.set('Set-Cookie',cookie('',0)).json({ok:true});}));
 app.get('/api/member/dashboard',signedIn,wrap((req,res)=>res.json({...memberDashboard(readStore(),req.member.disciple.id),account:auth.publicAccount(req.member)})));
 app.post('/api/member/password',signedIn,wrap(async(req,res)=>{limited(req,'password');await auth.changePassword(tokenOf(req),req.body.currentPassword,req.body.password);res.set('Set-Cookie',cookie('',0)).json({ok:true});}));
 app.get('/api/member/earnings.csv',signedIn,wrap((req,res)=>{const data=memberDashboard(readStore(),req.member.disciple.id);const keys=['id','orderId','category','sourceLabel','eligibleBase','ratePercent','amount','status','earnedAt','payoutDate','paidAt'];res.type('text/csv').set('Content-Disposition','attachment; filename="kvn-my-earnings.csv"').send([keys,...data.earnings.map(c=>keys.map(k=>c[k]??''))].map(row=>row.map(csvCell).join(',')).join('\n'));}));
 return auth;
}
async function sendMemberReset({email,url}){
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.DISCIPLE_FROM_EMAIL||'Kingdom Vibe Network <info@tickets.kvnlive.com>',to:[email],subject:'Set up or reset your KVN Disciple login',text:`Your personal KVN account gives you access to your Disciple activity and earnings.\n\nOpen this secure link to choose your username and password or reset your password:\n${url}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.\n\nKVN Disciple Support`}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Member email delivery failed.');
}
