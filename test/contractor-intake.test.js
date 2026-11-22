import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {registerContractorIntake,unseal} from '../lib/contractor-intake.js';

test('signed payee intake, encrypted storage, one-time finance access',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kv-bank-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const accepted={id:'a',acceptance:{email:'test@example.invalid',hash:'signed-version'},email:'test@example.invalid',name:'Example',eventKey:'Test'};
 const data={agreements:[accepted,{id:'unsigned',email:'unsigned@example.invalid'}]};
 const store={read:()=>data,mutate:fn=>fn(data)},handlers=new Map(),mail=[];
 const k=crypto.randomBytes(32),env={KV_CONTRACTOR_VAULT_KEY_V1:k.toString('base64'),OWNER_EMAIL:'finance@example.invalid',RESEND_API_KEY:'test'};
 const auth=()=>{},owner=()=>{};registerContractorIntake({get:()=>{},post:(p,...handlersForPath)=>handlers.set(p,handlersForPath)},{store,dir,auth,owner,env,send:async m=>{mail.push(m);return {status:'accepted'}}});
 async function call(action,body,admin=false,sessionToken='owner-session'){
 const handlersForPath=handlers.get((admin?'/api/performance-agreements/finance/':'/api/contractor-intake/')+action);
 if(admin)assert.deepEqual(handlersForPath.slice(0,-1),[auth,owner]);
 const response={statusCode:200,set(){},status(n){this.statusCode=n;return this},json(v){this.value=v}};
 await handlersForPath.at(-1)({body,user:{id:'owner'},sessionToken,headers:{origin:'https://kvn-live-tickets.onrender.com'},is:()=>true},response);return response;
 }
 const admin=(action,id='a',extra={})=>call(action,{id,...extra},true);
 assert.equal((await admin('invite','unsigned')).statusCode,409);
 const vendorInput={name:'Vendor',email:'vendor@example.invalid',eventKey:'Test',amount:'500',reason:'Hosting confirmed by email'};
 const vendor=(await call('approve-vendor',vendorInput,true)).value;
 assert.ok(vendor.id);assert.equal(data.agreements.length,2);
 assert.equal((await call('approve-vendor',vendorInput,true)).statusCode,409);
 const vendorToken=(await admin('invite',vendor.id)).value.url.split('#')[1];
 assert.equal((await call('code',{token:vendorToken})).statusCode,200);
 assert.equal(mail.pop().to,vendorInput.email);
 const invite=async()=>(await admin('invite')).value.url.split('#')[1],old=await invite(),token=await invite();
 assert.equal((await call('code',{token:old})).statusCode,403);
 await call('code',{token});assert.equal(mail.at(-1).to,accepted.email);const code=mail.at(-1).text.match(/\b\d{8}\b/)[0];
 assert.equal((await call('verify',{token,code:'00000000'})).statusCode,403);
 const session=(await call('verify',{token,code})).value.session;assert.ok(session);
 assert.equal((await call('verify',{token,code})).statusCode,403);
 const payload={session,usPerson:true,completedW9:true,consent:true,pdf:Buffer.from('%PDF-1.4\nTest only\n%%EOF').toString('base64'),holder:'Sample Payee',signature:'Sample Payee',account:'000000123456',confirmAccount:'000000123456',routing:'021000021',type:'Checking'};
 assert.equal((await call('submit',{...payload,routing:'123456789'})).statusCode,400);
 assert.equal((await call('submit',payload)).statusCode,200);assert.equal((await call('submit',payload)).statusCode,403);
 const ciphertext=fs.readFileSync(path.join(dir,'contractor-vault-v1',accepted.intake.record+'.json'),'utf8');
 for(const sensitive of [payload.account,payload.routing,payload.pdf,payload.holder])assert.ok(!(JSON.stringify(data)+ciphertext).includes(sensitive));
 assert.throws(()=>unseal(JSON.parse(ciphertext),k,'another-agreement'));
 assert.equal((await admin('status')).value.received,true);assert.equal((await admin('invite')).statusCode,409);
 await admin('finance-code');assert.equal(mail.at(-1).to,env.OWNER_EMAIL);const financeCode=mail.at(-1).text.match(/\b\d{8}\b/)[0];
 assert.equal((await call('read',{id:'a',code:financeCode},true,'other-session')).statusCode,403);
 assert.equal((await admin('read','a',{code:financeCode})).value.account,payload.account);
 assert.equal((await admin('read','a',{code:financeCode})).statusCode,403);
});
