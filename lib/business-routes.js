import {loadSocialSummary} from './business-social.js';
import {financeSummary} from './business-finance.js';
import {businessWorkspace} from './business-workspaces.js';
import {businessPeriods} from './business-periods.js';import {collectBusinessSales,queryBusinessSales} from './business-sales.js';import {csvCell} from './report.js';
export function registerBusinessRoutes(app,{auth,owner,readStore,now=()=>new Date()}){
 const protect=[auth,owner,(q,s,n)=>{s.set({'Cache-Control':'no-store, private','X-Robots-Tag':'noindex, nofollow'});n();}];
 const wrap=fn=>async(q,s)=>{try{await fn(q,s);}catch(e){s.status(e.statusCode||503).json({error:e.statusCode?e.message:'Business reporting is temporarily unavailable.'});}};
 const query=q=>{const p=businessPeriods(now());return queryBusinessSales(collectBusinessSales(readStore()),{from:q.query.from||p.mtd.from,to:q.query.to||p.mtd.to,business:q.query.business,eventId:q.query.eventId,currency:q.query.currency||'USD'});};
 app.get('/api/business/overview',...protect,wrap((q,s)=>{const ledger=collectBusinessSales(readStore()),periods=businessPeriods(now());s.json({generatedAt:now().toISOString(),timezone:'America/New_York',finance:financeSummary(readStore(),{}),periods:Object.fromEntries(Object.entries(periods).map(([key,p])=>[key,{...p,...queryBusinessSales(ledger,p)}])),coverage:{sources:ledger.sources,exceptions:ledger.exceptions}});}));
 app.get('/api/business/workspaces/:business',...protect,wrap(async(q,s)=>{const d=businessWorkspace(readStore(),{business:q.params.business,...businessPeriods(now()).mtd,...q.query});if(q.params.business==='social')Object.assign(d,await loadSocialSummary());s.json(d);}));
 app.get('/api/business/sales',...protect,wrap((q,s)=>s.json(query(q))));
 app.get('/api/business/sales.csv',...protect,wrap((q,s)=>{const d=query(q),keys=['id','source','sourceId','business','eventId','recordType','occurredAt','currency','amountCents'];s.type('text/csv').set('Content-Disposition','attachment; filename="kvn-business-sales.csv"').send([keys,...d.rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(csvCell).join(',')).join('\n'));}));
}
