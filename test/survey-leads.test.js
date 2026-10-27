import test from 'node:test';
import assert from 'node:assert/strict';
import {queryCrm,parseCrmFilters} from '../lib/crm-query.js';
import {crmReportCsv} from '../lib/crm-export.js';
import {businessWorkspace} from '../lib/business-workspaces.js';
const claim=(extra={})=>({id:'claim1',name:'Example Person',email:'Person@example.test',phone:'9195550123',city:'Sanford',state:'NC',zip:'27330',interests:['business','ministry','disciple','volunteer','sponsor','donate','events','attend'],surveyCompletedAt:'2026-10-01T12:00:00Z',createdAt:'2026-10-01T12:00:00Z',expiresAt:'2026-10-03T12:00:00Z',accessToken:'SECRET',verificationHash:'SECRET',...extra});
async function route(s){const m=await import('../lib/survey-leads.js');return m.routeSurveyLeads(s);}
test('survey backfill routes all interests through one durable contact and safe CSV',async()=>{
 const s={sponsoredClaims:[claim(),claim({id:'repeat',email:'person@example.test'})]};await route(s);assert.equal(s.crmRecords.length,1);
 for(const category of ['Vendor','Ministry Partner','Disciple Prospect','Volunteer','Corporate Sponsor','Donor Prospect','Event Audience']){
 const r=queryCrm(s,parseCrmFilters({range:'all',category,sourceTable:'sponsored_survey'}));assert.equal(r.total,1,category);
 const csv=crmReportCsv({...r,generatedAt:'now'});assert.match(csv,/Sanford/);assert.match(csv,/Expired/);assert.doesNotMatch(csv,/SECRET/);
 }
 assert.deepEqual(s.crmRecords[0].consent,{email:null,text:null,terms:null});
 const before=JSON.stringify(s);await route(s);assert.equal(JSON.stringify(s),before);
});
test('survey refresh preserves workflow, original answers, and leads after claim pruning',async()=>{
 const s={sponsoredClaims:[claim()]};await route(s);s.crmRecords[0].workflowStatus='Contacted';s.crmRecords[0].correctedContact={name:'Corrected'};
 s.sponsoredClaims[0].claimedAt='2026-10-02T12:00:00Z';await route(s);assert.equal(s.crmRecords[0].ticketStatus,'Verified');assert.equal(s.crmRecords[0].workflowStatus,'Contacted');assert.equal(s.crmRecords[0].correctedContact.name,'Corrected');
 s.sponsoredClaims=[];await route(s);assert.equal(s.crmRecords.length,1);assert.equal(s.crmRecords[0].surveySubmissions.length,1);
});
test('survey prospects appear in business destinations without enrolling or recording revenue',async()=>{
 const s={sponsoredClaims:[claim()],events:[{id:'live',slug:'kingdom-vibe-live-2026'}]};await route(s);
 for(const business of ['market','ministry','disciples','live','marketing','finance']){const d=businessWorkspace(s,{business});assert.ok(d.surveyLeads?.length,business);assert.ok(d.links.some(l=>l.sourceTable==='sponsored_survey'),business);}
 assert.equal(s.disciples,undefined);assert.equal(s.donations,undefined);
});
test('manual passes and launch tests do not become survey prospects',async()=>{
 const s={sponsoredClaims:[claim({liveLaunchTest:true}),claim({id:'manual',surveyCompletedAt:null,interests:[]})]};await route(s);assert.equal(s.crmRecords.length,0);
});
test('survey interests do not silently enter legacy email or SMS campaign audiences',async()=>{
 const {syncContacts}=await import('../lib/marketing.js');const {collectSmsAudience}=await import('../lib/sms-audiences.js');
 const s={sponsoredClaims:[claim({interests:['attend']})]};await route(s);syncContacts(s);assert.equal(s.marketing.contacts.length,0);
 s.crmRecords[0].category='Vendor';assert.equal(collectSmsAudience(s,{segmentIds:['market']}).excluded.length,0);
});
