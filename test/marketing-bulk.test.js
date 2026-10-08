import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../lib/marketing.js';
test('CSV accepts 20,000 contacts and rejects 20,001',()=>{
 const csv='email,name\n'+Array.from({length:20000},(_,i)=>`person${i}@example.com,Person ${i}`).join('\n');
 assert.equal(m.parseCsv(csv).length,20000);
 assert.throws(()=>m.parseCsv(csv+'\nover@example.com,Over'),/20,000/);
});
test('cleanup normalizes addresses, merges duplicates and keeps blocked status and list labels',()=>{
 assert.equal(typeof m.cleanCsv,'function');
 const result=m.cleanCsv('Email Address,Name,lists,permission\n A@EXAMPLE.COM ,Alice,Churches,unknown\na@example.com,,Awards,suppressed\nbad,Bad,Business,unknown');
 assert.equal(result.rows.length,1);assert.equal(result.duplicates,1);assert.equal(result.rejected.length,1);
 assert.equal(result.rows[0].email,'a@example.com');assert.equal(result.rows[0].permission,'suppressed');assert.equal(result.rows[0].lists,'Churches;Awards');
 assert.equal(m.parseCsv(result.csv)[0].name,'Alice');
});
test('exports retain human-readable list labels',()=>{
 const csv=m.exportContacts([{email:'a@example.com',name:'Alice',listIds:['x'],permission:'unknown'}],[{id:'x',name:'Church Outreach'}]);
 assert.equal(m.parseCsv(csv)[0].lists,'Church Outreach');
});
test('bulk import preserves separate memberships, existing permission and blocked rows',()=>{
 const d=m.ensureMarketing({});m.upsertContact(d,{email:'a@example.com',permission:'subscribed',evidence:'Signup',listIds:['leads']});
 m.importContacts(d,{csv:'email,name,lists,permission\na@example.com,A,Churches,unknown\nb@example.com,B,Awards,suppressed',useCsvLists:true});
 assert.equal(d.marketing.contacts[0].permission,'subscribed');assert.equal(d.marketing.contacts[0].listIds.length,2);
 assert.equal(d.marketing.contacts[1].permission,'suppressed');assert.equal(d.marketing.lists.find(l=>l.id===d.marketing.contacts[1].listIds[0]).name,'Awards');
 const csv='email,name\n'+Array.from({length:20000},(_,i)=>`person${i}@example.com,Person ${i}`).join('\n');
 assert.equal(m.importContacts(d,{csv,listName:'20k source'}).added,20000);
 assert.equal(m.importContacts(d,{csv,listName:'20k source'}).added,0);
 assert.equal(d.marketing.lists.filter(l=>l.name==='20k source').length,1);
});
