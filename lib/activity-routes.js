import {collectActivity,queryActivity} from './activity-records.js';
import {crmSourceStates} from './crm-sync.js';
import {csvCell} from './report.js';
export function registerActivityRoutes(app,{auth,owner,readStore,sync,configured=false,now=()=>new Date()}){
 const run=csv=>async(req,res)=>{res.set({'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'});try{
  if(sync)Promise.resolve().then(()=>sync()).catch(()=>{});const time=now(),to=req.query.to||time.toISOString(),from=req.query.from||new Date(Date.parse(to)-48*3600000).toISOString();
  const store=readStore(),result=queryActivity(collectActivity(store,crmSourceStates(store,configured,time),time),{from,to,categories:req.query.category?[String(req.query.category)]:[]},time);
  if(csv){const keys=['id','source','sourceId','category','occurredAt','status','name','email','phone','organization','location','interests','units','amountCents','discipleId'];return res.type('text/csv').set('Content-Disposition','attachment; filename="kvn-activity.csv"').send([keys,...result.rows.map(r=>keys.map(k=>Array.isArray(r[k])?r[k].join('; '):r[k]??''))].map(row=>row.map(csvCell).join(',')).join('\n'));}
  const page=Number(req.query.page||1),size=50;if(!Number.isSafeInteger(page)||page<1)throw Object.assign(Error('Invalid page.'),{statusCode:400});
  res.json({...result,total:result.rows.length,page,pageSize:size,rows:result.rows.slice((page-1)*size,page*size)});
 }catch(error){res.status(error.statusCode||503).json({error:error.statusCode?error.message:'Activity report is temporarily unavailable.'});}};
 app.get('/api/activity',auth,owner,run(false));app.get('/api/activity/export.csv',auth,owner,run(true));
}
