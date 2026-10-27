import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
for(const width of [320,390])test(`survey routing, segment list and export work at ${width}px`,async t=>{
 const f=await fixture({surveyLeads:true});t.after(()=>f.close());const browser=await chromium.launch();t.after(()=>browser.close());const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(5000);
 await page.goto(f.base+'/dashboard.html');await page.locator('#ownerEmail').fill('owner@example.test');await page.locator('#ownerPassword').fill('synthetic mobile password');await page.locator('#ownerLogin button[type=submit]').tap();await page.locator('#dashboard').waitFor({state:'visible'});await page.locator('#mobileMenuToggle').tap();await page.locator('#dashNav [data-panel=crm]').tap();await page.locator('#panel-crm [data-survey-list="Disciple Prospect"]').tap();await page.locator('#crm-results-crm').getByText('Survey Test Contact',{exact:true}).waitFor();
 const href=await page.locator('#crm-export-crm').getAttribute('href');assert.ok(href.includes('sourceTable=sponsored_survey'));assert.ok(href.includes('category=Disciple+Prospect'));
 const response=await context.request.get(f.base+href);assert.equal(response.status(),200);assert.match(response.headers()['content-disposition'],/survey-disciple-prospect/);const csv=await response.text();assert.match(csv,/Survey Test Contact/);assert.doesNotMatch(csv,/never-expose|Mobile Test Contact/);
 const bounds=await page.locator('#panel-crm').evaluate(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(bounds.left>=0&&bounds.right<=width+1&&bounds.scroll<=bounds.client+1,JSON.stringify(bounds));await page.locator('#crm-results-crm [data-record]').first().tap();await page.locator('#crm-edit').waitFor();assert.equal(await page.locator('#crm-edit [name=partnerStage]').count(),0);assert.match(await page.locator('#crm-detail').innerText(),/across all its lead lists/);
});
