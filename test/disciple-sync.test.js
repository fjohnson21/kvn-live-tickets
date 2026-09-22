import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDiscipleHandle, upsertDiscipleFromApplication } from '../lib/disciple-sync.js';

const makeStore=()=>({settings:{defaultDiscipleCommissionPercent:10},disciples:[]});

test('canonical handle produces briannahcooper',()=>{
  assert.equal(canonicalDiscipleHandle('Briannah Cooper'),'briannahcooper');
});

test('application sync creates exactly one Disciple and is idempotent by application reference',()=>{
  const store=makeStore(); let seq=0; const id=()=>`dsc_${++seq}`;
  const payload={applicationReference:'KVN-D-20260907-D95ABD81',name:'Briannah Cooper',email:'briannah@example.com',agreementVersion:'1.0',applicationStatus:'approved'};
  const first=upsertDiscipleFromApplication(store,payload,{id,now:()=> '2026-09-21T18:20:00.000Z'});
  const second=upsertDiscipleFromApplication(store,{...payload,email:'updated@example.com'},{id,now:()=> '2026-09-21T18:21:00.000Z'});
  assert.equal(first.created,true);
  assert.equal(second.created,false);
  assert.equal(store.disciples.length,1);
  assert.equal(store.disciples[0].handle,'briannahcooper');
  assert.equal(store.disciples[0].email,'updated@example.com');
  assert.equal(store.disciples[0].defaultCommissionPercent,10);
});

test('application reference is required',()=>{
  assert.throws(()=>upsertDiscipleFromApplication(makeStore(),{name:'Briannah Cooper',email:'x@example.com'},{id:()=> 'x'}),/applicationReference/);
});

test('application sync defaults a new Disciple to 10% when no rate is supplied',()=>{
  const store={settings:{},disciples:[]};
  const {disciple}=upsertDiscipleFromApplication(store,{
    applicationReference:'KVN-D-DEFAULT',
    name:'Briannah Cooper',
    email:'briannah@example.com'
  },{id:()=> 'dsc_default',now:()=> '2026-09-21T19:00:00.000Z'});
  assert.equal(disciple.defaultCommissionPercent,10);
});

test('application sync accepts complete legal-name fields from v2.2 intake',()=>{
  const store=makeStore();
  const {disciple}=upsertDiscipleFromApplication(store,{applicationReference:'KVN-D-2',legalFirstName:'Briannah',legalLastName:'Cooper',preferredName:'Briannah',email:'b@example.com',agreementVersion:'2.2'},{id:()=> 'dsc_2'});
  assert.equal(disciple.name,'Briannah Cooper');
  assert.equal(disciple.sourceAgreementVersion,'2.2');
});
