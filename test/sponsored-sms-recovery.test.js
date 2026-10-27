import test from 'node:test';
import assert from 'node:assert/strict';
import {runSponsoredSmsRecovery} from '../lib/sponsored-sms-recovery.js';
import {beginClaim,confirmClaim} from '../lib/sponsored-passes.js';
import {ensureSms} from '../lib/sms-model.js';
import {recordSmsConsent} from '../lib/sms-audiences.js';
const at=()=>Date.parse('2026-10-21T21:00:00Z');
const baseEnv={SMS_PROVIDER:'txt180',TXT180_API_KEY:'synthetic',TXT180_ACCOUNT_ID:'7520',TXT180_SHORT_CODE:'8882020121',TXT180_KEYWORD:'kingdom',TXT180_SMS_SENDING_ENABLED:'true',TXT180_RECOVERY_ID:'approved-recovery',TXT180_RECOVERY_SCOPE:'7520:kingdom:8882020121',TXT180_RECOVERY_MODE:'preview'};
function fixture(count=1){
 let s=ensureSms({events:[{id:'ev',slug:'kingdom-vibe-live-2026',status:'published',organizationId:'org',products:[]}],disciples:[{id:'amb',status:'active',code:'abc',name:'Ambassador'}],orders:[]});
 s.sms.contacts=[];s.sms.groups=[];const tokens=[];
 for(let i=0;i<count;i++){
 const phone='91955501'+String(i).padStart(2,'0');
 tokens.push(beginClaim(s,{name:'Guest '+i,email:`guest${i}@example.test`,phone,city:'Sanford',state:'NC',zip:'27330',interests:['attend'],quantity:2,discipleCode:'abc'},{now:()=>at()-72*3600000}));
 s.sms.contacts.push({id:'local'+i,phone:'+1'+phone,name:'Guest '+i,providerScope:'7520:kingdom:8882020121',providerContactId:String(300+i),status:'active',groupIds:[]});
 recordSmsConsent(s,{id:'consent'+i,scopeId:'kvn',phone,purpose:'marketing',action:'grant',source:'owner_attestation',evidence:'Owner confirmed phone consent',disclosureVersion:'owner-1',occurredAt:'2026-10-21T20:00:00Z'});
 }
 const calls=[],client={optouts:async()=>[],listContacts:async()=>s.sms.contacts.map(c=>({contactId:c.providerContactId,phone:c.phone})),addGroup:async()=>{calls.push('group');return {groupId:'123'};},assignGroup:async()=>{calls.push('assign');return {ok:true};},sendMessage:async arg=>{calls.push(arg);return {status:'accepted',sid:null};}};
 return {readStore:()=>structuredClone(s),writeStore:x=>{s=structuredClone(x);},state:()=>s,mutate:fn=>fn(s),client,calls,tokens,env:{...baseEnv},now:at};
}
const preview=f=>runSponsoredSmsRecovery(f);
async function send(f){f.env.TXT180_RECOVERY_MODE='send';f.env.TXT180_RECOVERY_EXPECTED_COUNT=String(f.state().sms.claimRecoveryRuns[0].recipients.length);return runSponsoredSmsRecovery(f);}
test('disabled job does not access data or provider',async()=>{assert.deepEqual(await runSponsoredSmsRecovery({env:{},readStore:()=>assert.fail()}),{status:'disabled'});});
test('preview selects unclaimed requests without rotating links or sending',async()=>{const f=fixture(),before=f.state().sponsoredClaims[0].verificationHash;const r=await preview(f);assert.equal(r.eligible,1);assert.equal(r.status,'preview');assert.equal(f.state().sponsoredClaims[0].verificationHash,before);assert.deepEqual(f.calls,[]);});
test('recovery creates group and sends a fresh branded private link preserving ambassador and quantity',async()=>{
 const f=fixture();await preview(f);const result=await send(f);assert.equal(result.accepted,1);assert.equal(f.state().orders.length,0);
 const message=f.calls.find(x=>typeof x==='object');assert.ok(message.body.length<=160);assert.match(message.body,/https:\/\/kvnlive.com\/promo#verify=[a-f0-9]{64}/);
 const token=message.body.match(/#verify=([a-f0-9]{64})/)[1];const s=f.state(),claim=confirmClaim(s,token,{now:at});assert.equal(claim.discipleId,'amb');assert.equal(claim.quantity,2);assert.equal(s.orders[0].discipleId,'amb');assert.equal(s.sms.attempts[0].status,'accepted');assert.equal(s.sms.groups[0].providerGroupId,'123');assert.equal(s.sms.contacts[0].groupIds.length,1);
 const before=f.calls.length;await send(f);assert.equal(f.calls.length,before);
});
test('claimed identity, superseded, test, unregistered, missing permission and opted-out requests are excluded',async()=>{
 const f=fixture(6);f.mutate(s=>{s.sponsoredClaims[0].claimedAt=new Date(at()).toISOString();s.sponsoredClaims[1].supersededAt='done';s.sponsoredClaims[2].liveLaunchTest=true;s.sms.contacts[3].status='inactive';s.sms.consentEvents=s.sms.consentEvents.filter(c=>c.id!=='consent4');});f.client.optouts=async()=>[{id:'stop',phone:'+19195550105'}];const r=await preview(f);assert.equal(r.eligible,0);assert.deepEqual(f.calls,[]);
});
test('same-identity duplicates send once and conflicting ambassador duplicates are held',async()=>{
 const f=fixture(2);f.mutate(s=>{s.sponsoredClaims.push({...s.sponsoredClaims[0],id:'duplicate',createdAt:'2026-10-20T00:00:00Z'});s.sponsoredClaims.push({...s.sponsoredClaims[1],id:'conflict',discipleId:''});});const r=await preview(f);assert.equal(r.eligible,1);assert.ok(r.exclusions.ambiguous_identity_or_referral>0);await send(f);assert.equal(f.calls.filter(x=>typeof x==='object').length,1);
});
test('claim completed after preview is not sent and new requests are not added',async()=>{
 const f=fixture();await preview(f);f.mutate(s=>{s.sponsoredClaims[0].claimedAt='done';});const r=await send(f);assert.equal(r.accepted,0);assert.equal(f.calls.filter(x=>typeof x==='object').length,0);
});
test('changed attribution after preview is held rather than silently reassigned',async()=>{const f=fixture();await preview(f);f.mutate(s=>{s.sponsoredClaims[0].discipleId='';});const r=await send(f);assert.equal(r.accepted,0);assert.equal(r.excluded,1);});
test('new provider optout after preview prevents sending',async()=>{const f=fixture();await preview(f);f.client.optouts=async()=>[{id:'later',phone:'+19195550100'}];const r=await send(f);assert.equal(r.accepted,0);assert.deepEqual(f.calls,[]);});
test('uncertain submission is recorded and never retried or followed by later sends',async()=>{const f=fixture(2);await preview(f);let n=0;f.client.sendMessage=async()=>{n++;throw Object.assign(Error('unknown'),{outcome:'unknown'});};let r=await send(f);assert.equal(r.status,'blocked');assert.equal(r.needsReview,1);await send(f);assert.equal(n,1);assert.equal(f.state().sms.attempts[0].status,'needs_review');});
test('interrupted run cannot resume sends automatically',async()=>{const f=fixture();await preview(f);f.mutate(s=>{s.sms.claimRecoveryRuns[0].status='running';});const r=await send(f);assert.equal(r.status,'blocked');assert.deepEqual(f.calls,[]);});
test('scope and expected count gates prevent provider writes',async()=>{const f=fixture();await preview(f);f.env.TXT180_RECOVERY_MODE='send';f.env.TXT180_RECOVERY_EXPECTED_COUNT='99';await assert.rejects(runSponsoredSmsRecovery(f));assert.deepEqual(f.calls,[]);f.env.TXT180_RECOVERY_SCOPE='wrong';await assert.rejects(runSponsoredSmsRecovery(f));});
test('provider lookup failure blocks before group creation or token rotation',async()=>{const f=fixture();await preview(f);const hash=f.state().sponsoredClaims[0].verificationHash;f.client.optouts=async()=>{throw Error('unavailable')};await assert.rejects(send(f));assert.equal(f.state().sponsoredClaims[0].verificationHash,hash);assert.deepEqual(f.calls,[]);});
