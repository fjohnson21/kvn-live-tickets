import {createHash,timingSafeEqual} from 'node:crypto';
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(String(a)).digest(),createHash('sha256').update(String(b)).digest());
export function registerSocialBusinessReporting(app,{read,secret=process.env.KV_SOCIAL_REPORT_SECRET}={}){
 app.get('/api/internal/business-summary',async(req,res)=>{
  res.set({'Cache-Control':'no-store, private','X-Robots-Tag':'noindex, nofollow'});
  if(!secret||secret.length<32||!equal(req.headers.authorization,'Bearer '+secret))return res.status(401).json({error:'Service reporting authentication required.'});
  try{const state=await read(),users=(state.users||[]).filter(u=>u.role==='member'),posts=(state.posts||[]).filter(p=>!p.sample);res.json({generatedAt:new Date().toISOString(),metrics:{membersTotal:users.length,membersVerified:users.filter(u=>u.emailVerified).length,membersEnabled:users.filter(u=>!u.suspended).length,postsPublished:posts.filter(p=>p.status==='published').length,postsPending:posts.filter(p=>p.status==='pending').length,openReports:(state.reports||[]).filter(r=>r.status==='open').length,pendingAppeals:(state.appeals||[]).filter(r=>r.status==='pending').length},coverage:{status:'Connected',detail:'Verified community aggregates. Seed posts and system users excluded. Views are not measured.'}});}catch{res.status(503).json({error:'Community reporting is temporarily unavailable.'});}
 });
}
