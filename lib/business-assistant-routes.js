import {businessWriteOrigin} from './shop-fulfillment-routes.js';
export function registerBusinessAssistantRoutes(app,{auth,owner}){
 app.get('/api/business/chat/status',auth,owner,(q,s)=>s.set('Cache-Control','no-store, private').json({available:false,reason:'OpenAI connection setup is deferred. Dashboards and normal business actions remain available.',actionControlsReady:true,chatgptConnection:'Requires owner OAuth setup and verification.'}));
 app.post('/api/business/chat',auth,owner,businessWriteOrigin,(q,s)=>s.set('Cache-Control','no-store, private').status(503).json({error:'OpenAI chat is not connected. No command was executed. Use the business workspace controls.'}));
}
