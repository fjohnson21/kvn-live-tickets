import test from 'node:test';import assert from 'node:assert/strict';
import * as records from '../lib/crm-records.js';
import {parseCrmFilters,queryCrm} from '../lib/crm-query.js';
import {crmReportCsv} from '../lib/crm-export.js';
const now=new Date('2026-11-13T15:00:00Z');
const record=(id,email,sourceTable,category,date='2026-11-01T12:00:00Z')=>({id,submittedContact:{name:'Test Contact',email,phone:'9195550100'},sourceTable,category,receivedAt:date,workflowStatus:'New',partnerStage:null,consent:{email:null},revision:1});
const fixture=()=>({crmRecords:[record('a',' SAME@example.test ','early_access_leads','Early Access'),{...record('b','same@example.test','partner_leads','Vendor'),consent:{email:false},partnerStage:'Inquiry'},record('c','other@example.test','early_access_leads','Early Access'),record('d','','partner_leads','Vendor'),record('e','','partner_leads','Vendor')],orders:[{id:'keep',status:'complimentary',tickets:[{code:'KEEP'}]}]});
test('canonical contact linking preserves submissions, consent and tickets; only exact emails combine',()=>{
 const store=fixture(),before=structuredClone(store);assert.equal(typeof records.reconcileCrmContacts,'function');
 assert.equal(records.reconcileCrmContacts(store),true);assert.equal(store.crmContacts.length,4);
 assert.equal(store.crmRecords[0].contactId,store.crmRecords[1].contactId);
 assert.notEqual(store.crmRecords[0].contactId,store.crmRecords[2].contactId);
 assert.notEqual(store.crmRecords[3].contactId,store.crmRecords[4].contactId);
 assert.deepEqual(store.orders,before.orders);
 for(let i=0;i<5;i++){const {contactId,...rest}=store.crmRecords[i];assert.deepEqual(rest,before.crmRecords[i]);}
 assert.equal(records.reconcileCrmContacts(store),false);
 store.crmRecords[1].correctedContact={email:'corrected@example.test'};records.reconcileCrmContacts(store);
 assert.equal(store.crmContacts.length,5);assert.notEqual(store.crmRecords[0].contactId,store.crmRecords[1].contactId);
});
test('contact view groups before pagination, retains role/source histories, and respects filters',()=>{
 const store=fixture();const f=parseCrmFilters({range:'all',view:'contacts'},now);const result=queryCrm(store,f);
 assert.equal(result.total,4);assert.equal(result.recordTotal,5);assert.equal(result.summary.byStage.Inquiry,1);
 const combined=result.rows.find(r=>r.id==='a');assert.deepEqual(combined.linkedRecords.map(r=>r.id),['a','b']);
 assert.deepEqual(combined.contactCategories,['Early Access','Vendor']);
 const filtered=queryCrm(store,parseCrmFilters({range:'all',view:'contacts',category:'Vendor'},now));assert.equal(filtered.total,3);assert.equal(filtered.recordTotal,3);
 const sourceView=queryCrm(store,parseCrmFilters({range:'all',view:'records'},now));assert.equal(sourceView.total,5);
 const csv=crmReportCsv({...result,generatedAt:now.toISOString()});assert.ok(csv.includes('Contact ID'));assert.ok(csv.includes('early_access_leads; partner_leads'));assert.ok(csv.includes('a; b'));
 assert.ok(csv.includes('Source consent history'));
});

test('shared phones flag review without merging and differing names on shared email are visible',()=>{
 const store=fixture();store.crmRecords[1].submittedContact.name='Different Name';
 const links=records.crmContactLinks(store,store.crmRecords[0]);
 assert.deepEqual(links.linkedRecords.map(r=>r.id),['a','b']);assert.equal(links.identityReview,true);
 assert.deepEqual(links.possibleDuplicates.map(r=>r.id),['c','d','e']);
 store.crmRecords[0].submittedContact.phone='';assert.deepEqual(records.crmContactLinks(store,store.crmRecords[0]).possibleDuplicates,[]);
});
