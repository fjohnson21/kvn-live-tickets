import {createGuest,findGuest,publicGuest,addAttendee,guestPass,canManageGuest,eventFor} from './special-guests.js';
import {commerceClientIdentity} from './commerce-client-identity.js';
import {specialGuestShortlist} from './special-guest-shortlist.js';
export function registerSpecialGuestRoutes(app,{auth,owner,readStore,writeStore}){
 const prefix='/api/special-guests',rates=new Map();
 app.use(prefix,(req,res,next)=>{res.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!=='https://kvnlive.com')return res.status(403).json({error:'Please use the KVN page.'});const key=commerceClientIdentity(req),now=Date.now();let r=rates.get(key);if(!r||r.until<now){r={n:0,until:now+60000};rates.set(key,r);}if(rates.size>10000){for(const [k,v]of rates)if(v.until<now)rates.delete(k);if(rates.size>10000)return res.status(429).json({error:'Please try again shortly.'});}if(++r.n>90)return res.status(429).json({error:'Please wait a minute and try again.'});next();});
 const wrap=fn=>(req,res)=>{try{fn(req,res);}catch(e){res.status(e.statusCode||500).json({error:e.statusCode?e.message:'Unable to save. Please try again.'});}};
 const allowed=(req,res,next)=>req.user.role==='owner'||req.user.role==='staff'&&req.user.permissions?.includes('guestlists')?next():res.status(403).json({error:'Guest-list access required.'});
 app.get(prefix,auth,allowed,wrap((req,res)=>{const s=readStore();res.json({guests:(s.specialGuests||[]).filter(g=>canManageGuest(req.user,g)),owner:req.user.role==='owner',reps:s.users.filter(u=>u.organizationId===eventFor(s).organizationId&&(u.role==='owner'||u.role==='staff'&&u.permissions?.includes('guestlists'))).map(u=>({id:u.id,name:u.name}))});}));
 app.post(prefix,auth,owner,wrap((req,res)=>{const s=readStore(),g=createGuest(s,req.body,req.user);writeStore(s);res.status(201).json(g);}));
 app.post(prefix+'/import-shortlist',auth,owner,wrap((req,res)=>{const s=readStore();let added=0;for(const lead of specialGuestShortlist)if(!(s.specialGuests||[]).some(g=>g.handle.toLowerCase()===lead.handle.toLowerCase())){createGuest(s,lead,req.user);added++;}writeStore(s);res.json({added});}));
 app.patch(prefix+'/:id',auth,allowed,wrap((req,res)=>{const s=readStore(),g=(s.specialGuests||[]).find(g=>g.id===req.params.id);if(!g||!canManageGuest(req.user,g))return res.status(404).json({error:'Contact not found.'});
 // Validate all fields before changing the record.
 if(req.body.assignedRepId!==undefined){if(req.user.role!=='owner')return res.status(403).json({error:'Owner assignment required.'});const rep=s.users.find(u=>u.id===req.body.assignedRepId);if(req.body.assignedRepId&&(!rep||rep.organizationId!==g.organizationId||!(rep.role==='owner'||rep.role==='staff'&&rep.permissions?.includes('guestlists'))))return res.status(400).json({error:'Choose an authorized guest-list rep.'});}
 if(req.body.status!==undefined&&(!['new','contacted','follow-up','declined'].includes(req.body.status)||g.confirmedAt))return res.status(400).json({error:'Confirmed status is managed by registration.'});
 if(req.body.assignedRepId!==undefined)g.assignedRepId=req.body.assignedRepId;if(req.body.status!==undefined)g.status=req.body.status;for(const k of ['email','phone','notes'])if(req.body[k]!==undefined)g[k]=String(req.body[k]).trim().slice(0,k==='notes'?3000:254);g.updatedAt=new Date().toISOString();g.updatedBy=req.user.id;writeStore(s);res.json(g);
 }));
 app.post(prefix+'/info',wrap((req,res)=>{const kind=req.body.kind==='audience'?'audience':'manage',g=findGuest(readStore(),req.body.token,kind);res.json(publicGuest(g,kind));}));
 app.post(prefix+'/register',wrap((req,res)=>{const s=readStore(),audience=req.body.access==='audience',g=findGuest(s,req.body.token,audience?'audience':'manage'),a=addAttendee(s,g,req.body,audience?'ga':req.body.kind);writeStore(s);res.status(201).json({passToken:a.passToken});}));
 app.post(prefix+'/pass',wrap((req,res)=>res.json(guestPass(readStore(),req.body.token))));
}
