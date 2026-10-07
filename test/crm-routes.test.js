import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {createOwnerPasswordStore} from '../lib/owner-auth.js';
test('owner CRM API enforces access, audit, conflicts and report parity',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-route-')),port=42000+Math.floor(Math.random()*2000),base=`http://127.0.0.1:${port}`;
 const store=JSON.parse(fs.readFileSync(new URL('../data/store.json',import.meta.url)));store.crmRecords=Array.from({length:61},(_,i)=>({id:'crm-'+i,sourceTable:'partner_leads',sourceId:String(i),sourceSystem:'kvnlive',category:'Vendor',submittedContact:{name:i===0?'=FORMULA':'Alice',email:'a@example.test'},correctedContact:{},consent:{email:null},receivedAt:'2026-10-07T12:00:00Z',workflowStatus:'New',partnerStage:'Inquiry',followUpDate:null,revision:1}));fs.writeFileSync(path.join(dir,'store.json'),JSON.stringify(store));createOwnerPasswordStore({dataDir:dir,bootstrapPassword:'test owner password'});
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,DATA_DIR:dir,PORT:String(port),BASE_URL:base,OWNER_EMAIL:'owner@example.test',CRM_SOURCE_URL:'',CRM_SYNC_SECRET:''},stdio:['ignore','pipe','pipe']});t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true})});await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('start timeout')),5000);child.stdout.on('data',x=>{if(String(x).includes('running at')){clearTimeout(timeout);resolve()}});child.on('exit',()=>reject(new Error('server exited')))});
 assert.equal((await fetch(base+'/api/crm/records')).status,401);
 const login=await fetch(base+'/api/auth/owner',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'test owner password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const request=(url,opt={})=>fetch(base+url,{...opt,headers:{cookie,'content-type':'application/json',origin:base,...opt.headers}});
 const records=await(await request('/api/crm/records?range=all')).json();assert.equal(records.total,61);assert.equal(records.rows.length,25);
 const patch=(data,headers={})=>request('/api/crm/records/crm-0',{method:'PATCH',headers,body:JSON.stringify(data)});
 assert.equal((await patch({revision:1,note:'private note'},{origin:'https://evil.example'})).status,403);
 assert.equal((await patch({revision:1,workflowStatus:'bad'})).status,400);
 assert.equal((await patch({revision:1,workflowStatus:'Contacted',note:'private note',followUpDate:'2026-10-08'})).status,200);
 assert.equal((await patch({revision:1,note:'old edit'})).status,409);
 const detail=await(await request('/api/crm/records/crm-0')).json();assert.equal(detail.record.workflowStatus,'Contacted');assert.equal(detail.activities[0].note,'private note');assert.equal(detail.record.revision,2);
 assert.equal((await patch({revision:2,archived:true})).status,200);assert.equal((await(await request('/api/crm/records?range=all')).json()).total,60);assert.equal((await patch({revision:3,archived:false})).status,200);
 assert.equal((await request('/api/crm/records/missing')).status,404);
 const report=await(await request('/api/crm/reports?range=all')).json();assert.equal(report.rows.length,61);
 const csv=await(await request('/api/crm/reports.csv?range=all')).text();assert.equal(csv.trim().split('\r\n').length,62);assert.ok(csv.includes("'=FORMULA"));
 const disk=JSON.parse(fs.readFileSync(path.join(dir,'store.json')));assert.ok(disk.auditLogs.some(x=>x.action==='crm.export'));assert.ok(!JSON.stringify(disk.auditLogs).includes('private note'));
 // Change only the isolated fixture's owner role, retaining the session, to exercise the server owner guard.
 const owner=disk.users.find(x=>x.role==='owner');owner.role='organizer';fs.writeFileSync(path.join(dir,'store.json'),JSON.stringify(disk));assert.equal((await request('/api/crm/records')).status,403);assert.equal((await request('/api/crm/reports.csv')).status,403);
});
