import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
for(const width of [320,390])test(`campaign engagement phone report at ${width}px`,async t=>{
 const f=await fixture({engagementReports:true});t.after(()=>f.close());const browser=await chromium.launch();t.after(()=>browser.close());const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
 const unexpected=[],errors=[];await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==f.base||/\/(send|test|sync)$/.test(url.pathname)){unexpected.push(url.pathname);return route.abort()}return route.continue()});
 const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));await page.goto(f.base+'/dashboard.html');await page.locator('#ownerEmail').fill('owner@example.test');await page.locator('#ownerPassword').fill('synthetic mobile password');await page.locator('#ownerLogin button[type=submit]').tap();await page.locator('#dashboard').waitFor({state:'visible'});
 await page.locator('#mobileMenuToggle').tap();await page.locator('[data-panel=marketing]').tap();await page.locator('[data-engagement=engagement-campaign]').tap();await page.locator('#meNext').waitFor();
 assert.match(await page.locator('#marketingDialog').innerText(),/Open rate \(estimate\): 100.0%/);assert.match(await page.locator('#marketingDialog').innerText(),/complained/);assert.equal(await page.locator('#marketingDialog tbody tr').count(),50);
 const bounds=await page.locator('#marketingDialog').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}));assert.ok(bounds.scroll<=bounds.client+1,JSON.stringify(bounds));assert.ok(bounds.left>=0&&bounds.right<=width+1);
 await page.locator('#meNext').tap();await page.getByText('55 matching recipients · Page 2 of 2.',{exact:false}).waitFor();assert.equal(await page.locator('#marketingDialog tbody tr').count(),5);
 await page.locator('#meEvent').selectOption('clicked');await page.locator('#meApply').tap();await page.getByText('1 matching recipients · Page 1 of 1.',{exact:false}).waitFor();await page.locator('#marketingDialog summary').tap();assert.equal((await page.locator('#marketingDialog').innerText()).includes('private-token'),false);
 await page.screenshot({path:f.dir+'/engagement-phone.png'});await page.locator('#marketingClose').tap();await page.locator('#logout').tap();assert.equal((await context.request.get(f.base+'/api/marketing/campaigns/engagement-campaign/engagement')).status(),401);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
});
