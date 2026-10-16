import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
for(const width of [320,390])test(`SMS workspace remains usable and disabled at ${width}px`,async t=>{
 const f=await fixture();t.after(()=>f.close());const browser=await chromium.launch();t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),unexpected=[],errors=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==f.base||/\/api\/sms\/(release|test|reconcile)$/.test(u.pathname)){unexpected.push(u.pathname);return route.abort();}return route.continue();});
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);await page.goto(f.base+'/dashboard.html');await page.locator('#ownerEmail').fill('owner@example.test');await page.locator('#ownerPassword').fill('synthetic mobile password');await page.locator('#ownerLogin button[type=submit]').tap();await page.locator('#dashboard').waitFor({state:'visible'});
 await page.locator('#mobileMenuToggle').tap();await page.locator('[data-panel=sms]').tap();await page.locator('[data-sms-tab=compose]').tap();await page.locator('[name=text]').fill('Synthetic KVN text. Never send.');const save=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sms/drafts'&&r.request().method()==='POST');await page.locator('[data-save]').tap();const saved=await save;assert.equal(saved.status(),200,await saved.text());await page.getByText('Text draft saved.',{exact:true}).waitFor();await page.locator('[data-preview]').tap();await page.locator('[data-release]').waitFor();assert.equal(await page.locator('[data-release]').isDisabled(),true);
 for(const tab of ['audiences','drafts','history','connection']){await page.locator(`[data-sms-tab=${tab}]`).tap();const bounds=await page.locator('#smsRoot').evaluate(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(bounds.left>=0&&bounds.right<=width+1&&bounds.scroll<=bounds.client+1,JSON.stringify(bounds));}
 assert.match(await page.locator('#smsRoot').innerText(),/Needs setup/);await page.locator('#logout').tap();assert.equal(await page.locator('#smsRoot').innerText(),'');assert.equal((await context.request.get(f.base+'/api/sms/drafts')).status(),401);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
});
