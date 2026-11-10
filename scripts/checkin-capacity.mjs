// Isolated only: no target URL or production credentials are accepted.
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {fixture} from '../browser-tests/fixture.mjs';
const f=await fixture({checkin:true});
const agent=new https.Agent({rejectUnauthorized:false,keepAlive:true,maxSockets:32});
const origin=new URL(f.base);assert.equal(origin.hostname,'localhost');
const file=f.dir+'/store.json';
const read=()=>JSON.parse(fs.readFileSync(file));
const mutate=fn=>{const s=read();fn(s);fs.writeFileSync(file,JSON.stringify(s));};
function request(route,data,cookie=''){
 assert.ok(['/api/auth/owner','/api/checkin','/api/me'].includes(route));
 const start=performance.now();
 return new Promise(resolve=>{const req=https.request(new URL(route,f.base),{agent,method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>{let json;try{json=JSON.parse(body)}catch{}resolve({status:res.statusCode,json,cookie:res.headers['set-cookie']?.[0]?.split(';')[0],ms:performance.now()-start})});});req.setTimeout(15000,()=>req.destroy(Error('timeout')));req.on('error',e=>resolve({status:0,error:e.message,ms:performance.now()-start}));req.end(JSON.stringify(data));});
}
const results=[];
function summarize(name,rows,start,extra={}){const times=rows.map(x=>x.ms).sort((a,b)=>a-b);const p=q=>+times[Math.max(0,Math.ceil(q*times.length)-1)].toFixed(2);const seconds=(performance.now()-start)/1000;const r={name,requests:rows.length,seconds:+seconds.toFixed(3),requestsPerSecond:+(rows.length/seconds).toFixed(2),statuses:rows.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{}),p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99),maxMs:p(1),...extra};results.push(r);console.log(JSON.stringify(r));}
function seed(count,padding=0){mutate(s=>{s.orders=Array.from({length:count},(_,i)=>({id:'synthetic-'+i,eventId:'scan-event',status:'paid',buyerName:'Synthetic Guest',buyerEmail:`guest${i}@example.test`,tickets:[{code:'LOAD-'+i,checkedIn:false}]}));s.capacityPadding='x'.repeat(padding);});}
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
try{
 const cookies=[];for(let i=0;i<16;i++){const a=await request('/api/auth/owner',{email:'owner@example.test',password:'synthetic mobile password'});assert.equal(a.status,200);assert.ok(a.cookie);cookies.push(a.cookie)}
 assert.equal(new Set(cookies).size,16);
 mutate(s=>Object.assign(s.users[0],{role:'staff',organizationId:'scan-org',permissions:['checkin']}));
 async function admit(i){const r=await request('/api/checkin',{code:'LOAD-'+i},cookies[i%16]);if(r.status===200){assert.equal(r.json?.ok,true);assert.equal(r.json?.ticket?.code,'LOAD-'+i)}return r}
 async function paced(name,rate,duration){seed(1600);const rows=[],pending=[],start=performance.now();let lag=0;const n=Math.floor(rate*duration);for(let i=0;i<n;i++){const target=start+i*1000/rate;await sleep(target-performance.now());lag=Math.max(lag,performance.now()-target);pending.push(admit(i).then(r=>rows.push(r)))}await Promise.all(pending);await sleep(start+duration*1000-performance.now());summarize(name,rows,start,{offeredPerMinute:rate*60,maxDispatchLagMs:+lag.toFixed(2)});assert.equal(rows.filter(r=>r.status===200).length,n);assert.equal(read().orders.filter(o=>o.tickets[0].checkedIn).length,n)}
 await paced('90-minute arrival rate, 60-second sample',1600/5400,60);
 await paced('60-minute arrival rate, 60-second sample',1600/3600,60);
 await paced('240-per-minute burst, 30 seconds',4,30);
 for(const [concurrency,padding] of [[4,0],[16,0],[4,10*1024*1024]]){seed(1600,padding);const bytes=fs.statSync(file).size;let next=0;const rows=[],start=performance.now();await Promise.all(Array.from({length:concurrency},(_,lane)=>(async()=>{while(next<1600){const i=next++;const r=await request('/api/checkin',{code:'LOAD-'+i},cookies[lane]);assert.equal(r.json?.ticket?.code,'LOAD-'+i);rows.push(r)}})()));summarize(`1600 admissions, ${concurrency} lanes, ${padding?'10 MiB padding':'base store'}`,rows,start,{concurrency,initialStoreBytes:bytes});assert.equal(rows.filter(r=>r.status===200).length,1600);assert.equal(read().orders.filter(o=>o.tickets[0].checkedIn).length,1600)}
 seed(100);const rows=[],start=performance.now();for(let i=0;i<100;i++){const batch=await Promise.all(cookies.map(c=>request('/api/checkin',{code:'LOAD-'+i},c)));assert.equal(batch.filter(r=>r.status===200).length,1);assert.equal(batch.filter(r=>r.status===409).length,15);rows.push(...batch)}summarize('100 same-ticket races, 16 sessions each',rows,start);assert.equal(read().orders.filter(o=>o.tickets[0].checkedIn).length,100);
 seed(10);mutate(s=>{s.orders[0].status='refunded';s.orders[1].tickets[0].status='replaced';s.orders[2].paymentAttention=true;s.orders[3].eventId='other-event';s.events.push({id:'other-event',organizationId:'other-org',products:[]})});
 const checks=[];for(const [code,cookie,status] of [['LOAD-0',cookies[0],409],['LOAD-1',cookies[0],409],['LOAD-2',cookies[0],409],['LOAD-3',cookies[0],403],['UNKNOWN',cookies[0],404],['LOAD-4','',401]]){const r=await request('/api/checkin',{code},cookie);assert.equal(r.status,status);checks.push({code,status:r.status})}
 mutate(s=>s.users[0].permissions=[]);assert.equal((await request('/api/checkin',{code:'LOAD-4'},cookies[0])).status,403);assert.equal(read().orders.filter(o=>o.tickets[0].checkedIn).length,0);
 const report={date:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,platform:os.platform(),cpu:os.cpus()[0].model,cpuCount:os.cpus().length,memoryBytes:os.totalmem(),sessionCount:16,staffIdentities:1,results,protectionChecks:checks,permissionDenial:403,passed:true};fs.writeFileSync('capacity-results/checkin-capacity.json',JSON.stringify(report,null,2)+'\n');
}finally{agent.destroy();await f.close()}
