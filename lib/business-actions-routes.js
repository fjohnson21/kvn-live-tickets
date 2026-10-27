import {businessWriteOrigin} from './shop-fulfillment-routes.js';
export function registerBusinessActionRoutes(app,{auth,owner,service}){
 const principal=q=>({id:q.user.id,role:'owner',scopes:['kvn:read','kvn:edit','kvn:send']});
 app.get('/api/business/actions',auth,owner,(q,s)=>s.set('Cache-Control','no-store, private').json({actions:service.list(principal(q))}));
 for(const [path,method]of [['prepare','prepare'],['execute','execute']])app.post('/api/business/actions/'+path,auth,owner,businessWriteOrigin,async(q,s)=>{try{s.set('Cache-Control','no-store, private').json(await service[method]({...q.body,principal:principal(q)}));}catch(e){s.status(e.statusCode||503).json({error:e.statusCode?e.message:'Business action is temporarily unavailable.'});}});
}
