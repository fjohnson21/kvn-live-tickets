import {createHmac,createHash} from 'node:crypto';
import {CRM_SOURCES,ensureCrmCollections,normalizeSourceRow,upsertCrmRecords} from './crm-records.js';
export function crmSourceStates(store,configured,now=new Date()){
 return CRM_SOURCES.map(source=>{const s=store.crmSyncState?.[source]||{};return {source,...s,status:!configured?'Not connected':s.lastError?'Unavailable':!s.lastSuccessAt?'Not connected':now.getTime()-Date.parse(s.lastSuccessAt)>15*60000?'Stale':'Connected'}});
}
async function boundedJson(response){if(!response.ok)throw new Error(`Source request failed (${response.status})`);if(Number(response.headers.get('content-length'))>1048576)throw new Error('Source response too large');const reader=response.body.getReader();let size=0,chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw new Error('Source response too large');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
async function scanSource(options,source){
 const {sourceUrl,secret,fetchImpl=fetch,now=()=>new Date()}=options;
 async function page(after=''){
  const url=new URL('/api/integrations/crm',sourceUrl);url.searchParams.set('source',source);url.searchParams.set('limit','100');if(after)url.searchParams.set('after',after);
  const time=String(Math.floor(now().getTime()/1000)),signature=createHmac('sha256',secret).update(`${time}\nGET\n${url.pathname}${url.search}`).digest('hex');
  const result=await boundedJson(await fetchImpl(url.toString(),{headers:{'x-kvn-crm-time':time,'x-kvn-crm-signature':signature},signal:AbortSignal.timeout(10000),redirect:'error'}));
  if(result.schemaVersion!==1||result.source!==source||!Array.isArray(result.rows)||result.rows.length>100||!Number.isSafeInteger(result.sourceCount)||result.sourceCount<0)throw new Error('Invalid source response');return result;
 }
 for(let attempt=0;attempt<2;attempt++){
  let after='',records=[],count=null;const seen=new Set();
  while(true){const p=await page(after);count??=p.sourceCount;if(count!==p.sourceCount)break;
   for(const row of p.rows){if(seen.has(row.id)||row.id<=after)throw new Error('Repeated or invalid source record');seen.add(row.id);records.push(normalizeSourceRow(source,row))}
   if(p.nextAfter===null){const verify=await page();if(records.length===count&&verify.sourceCount===count)return records;break}
   if(typeof p.nextAfter!=='string'||p.nextAfter<=after||p.nextAfter!==p.rows.at(-1)?.id||!p.rows.length)throw new Error('Invalid source cursor');after=p.nextAfter;
   if(records.length>100000)throw new Error('Source exceeds supported record limit');
  }
 }throw new Error('Source changed during sync; retry required');
}
const flights=new WeakMap();
export function syncCrmSources(options){
 const identity=options.writeStore;if(flights.has(identity))return flights.get(identity);
 const run=(async()=>{
  if(!options.sourceUrl||!options.secret)return {configured:false};
  const now=options.now||(()=>new Date()),results={};
  for(const source of CRM_SOURCES){const lastAttemptAt=now().toISOString();try{
   const records=await scanSource(options,source);const store=ensureCrmCollections(options.readStore());const result=upsertCrmRecords(store,records,{now:now()});store.crmSyncState[source]={lastAttemptAt,lastSuccessAt:now().toISOString(),lastError:null,sourceCount:records.length,importedCount:records.length};options.writeStore(store);results[source]=result;options.onSourceComplete?.({source,count:records.length,idDigest:createHash('sha256').update(records.map(r=>r.sourceId).sort().join('\n')).digest('hex')});
  }catch(error){const store=ensureCrmCollections(options.readStore());store.crmSyncState[source]={...store.crmSyncState[source],lastAttemptAt,lastError:String(error.message).slice(0,200)};options.writeStore(store);results[source]={error:store.crmSyncState[source].lastError}}}
  return {configured:true,results};
 })();flights.set(identity,run);run.finally(()=>flights.delete(identity));return run;
}
