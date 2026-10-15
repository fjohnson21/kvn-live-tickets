import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createMemberAuth} from '../lib/member-auth.js';
import {memberDashboard} from '../lib/member-dashboard.js';

const fixture=()=>({settings:{defaultDiscipleCommissionPercent:10},disciples:[{id:'a',email:'a@example.com',name:'Alice',handle:'alice',status:'active'},{id:'b',email:'b@example.com',name:'Bob',handle:'bob',status:'active'}]});
test('verified activation, persistent username login, single-use reset and session revocation',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-member-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=fixture();let clock=Date.now();const options={dataDir:dir,readStore:()=>store,now:()=>clock};let auth=createMemberAuth(options);
 assert.equal(auth.issueReset('unknown@example.com'),null);
 const reset=auth.issueReset('a@example.com');assert.ok(reset.token);
 assert.ok(!fs.readFileSync(path.join(dir,'member-auth.json'),'utf8').includes(reset.token));
 await auth.completeReset({token:reset.token,username:'alice.j',password:'a long private password 123'});
 await assert.rejects(auth.completeReset({token:reset.token,username:'attacker',password:'a long private password 456'}));
 await assert.rejects(auth.login('alice.j','wrong-password'));
 const login=await auth.login('ALICE.J','a long private password 123');assert.equal(auth.authenticate(login.token).disciple.id,'a');
 auth=createMemberAuth(options);assert.equal(auth.authenticate(login.token).disciple.id,'a');
 assert.ok(!JSON.stringify(auth.publicAccount(auth.authenticate(login.token))).includes('hash'));
 const second=auth.issueReset('a@example.com');await auth.completeReset({token:second.token,password:'a new private password 123'});assert.equal(auth.authenticate(login.token),null);
 const fresh=await auth.login('a@example.com','a new private password 123');store.disciples[0].status='inactive';assert.equal(auth.authenticate(fresh.token),null);store.disciples[0].status='active';clock+=13*60*60*1000;assert.equal(auth.authenticate(fresh.token),null);
});
test('expired and ambiguous-email activation fail closed',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-member-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let clock=Date.now();const store=fixture(),auth=createMemberAuth({dataDir:dir,readStore:()=>store,now:()=>clock});const reset=auth.issueReset('a@example.com');clock+=16*60*1000;await assert.rejects(auth.completeReset({token:reset.token,username:'alice',password:'a long private password 123'}));store.disciples[1].email='a@example.com';assert.equal(auth.issueReset('a@example.com'),null);
});
test('dashboard scopes all records and separates complimentary impact from earned money',()=>{
 const s=fixture();s.orders=[{id:'o1',discipleId:'a',status:'paid',amountTotal:5000,items:[{type:'ticket',quantity:2}],tickets:[{code:'PRIVATE',checkedIn:true},{checkedIn:false}],buyerEmail:'private@example.com'},{id:'o2',discipleId:'b',status:'paid',amountTotal:99999},{id:'free',discipleId:'a',status:'complimentary',orderType:'sponsored_ga',amountTotal:0,items:[{type:'ticket',quantity:2}]}];
 s.sponsoredClaims=[{id:'cl',discipleId:'a',quantity:2,claimedAt:'2026-10-15',accessToken:'SECRET'}];s.discipleCommissions=[{id:'c1',discipleId:'a',orderId:'o1',amount:500,eligibleBase:5000,status:'pending',sourceType:'event_order'},{id:'c2',discipleId:'a',orderId:'vendor1',amount:1000,eligibleBase:10000,status:'paid',sourceType:'vendor'},{id:'c3',discipleId:'b',amount:99999,status:'paid'}];s.disciplePayouts=[{id:'p1',discipleId:'a',amount:1000,status:'paid'},{id:'p2',discipleId:'b',amount:99999,status:'paid'}];
 const data=memberDashboard(s,'a');assert.equal(data.summary.paidTickets,2);assert.equal(data.summary.compTickets,2);assert.equal(data.summary.pendingCommission,500);assert.equal(data.summary.paidCommission,1000);assert.equal(data.earnings.length,2);assert.equal(data.payouts.length,1);assert.equal(data.activity.length,3);const json=JSON.stringify(data);for(const secret of ['PRIVATE','SECRET','private@example.com','99999'])assert.ok(!json.includes(secret));assert.throws(()=>memberDashboard(s,'missing'));
});
test('replaced sponsored tickets do not double-count check-ins and message text cannot grant CRM access',()=>{const s=fixture();s.orders=[{id:'ga',discipleId:'a',status:'complimentary',tickets:[{checkedIn:true,status:'replaced'}]},{id:'vip',discipleId:'a',status:'paid',tickets:[{checkedIn:true,status:'active'}]}];s.crmRecords=[{id:'secret',discipleId:'b',originalSubmission:{message:'KVN Disciple referral: ALICE'},submittedContact:{organization:'Private B'}},{id:'forged',originalSubmission:{message:'KVN Disciple referral: ALICE'}},{id:'own',discipleId:'a',submittedContact:{organization:'Own referral'}}];s.disciples[0].code='ALICE';const d=memberDashboard(s,'a');assert.equal(d.summary.checkedIn,1);assert.equal(d.activity.find(x=>x.id==='ga').checkedIn,0);assert.deepEqual(d.referrals.map(x=>x.id),['own']);});
test('signed source referrals belong only to their Disciple, explicit ownership overrides code',()=>{const s=fixture();s.disciples[0].code='ALICE';s.crmRecords=[{id:'signed',verifiedReferralCode:'ALICE'},{id:'overridden',discipleId:'b',verifiedReferralCode:'ALICE'}];assert.deepEqual(memberDashboard(s,'a').referrals.map(x=>x.id),['signed']);});
