import {collectShopFulfillment,transitionFulfillment} from './shop-fulfillment.js';
export const businessWriteOrigin=(q,s,n)=>['https://kvnlive.com','https://www.kvnlive.com'].includes(q.headers.origin)&&q.is('application/json')?n():s.status(403).json({error:'Use the signed-in KVN page with a JSON request.'});
export function registerShopFulfillmentRoutes(app,{auth,owner,readStore,writeStore}){
 app.get('/api/business/shop/fulfillment',auth,owner,(q,s)=>s.set('Cache-Control','no-store, private').json({items:collectShopFulfillment(readStore())}));
 app.post('/api/business/shop/fulfillment/actions',auth,owner,businessWriteOrigin,(q,s)=>{try{const d=readStore(),r=transitionFulfillment(d,{...q.body,actor:q.user.id});writeStore(d);s.set('Cache-Control','no-store, private').json(r.result);}catch(e){s.status(e.statusCode||503).json({error:e.statusCode?e.message:'Unable to save fulfillment.'});}});
}
