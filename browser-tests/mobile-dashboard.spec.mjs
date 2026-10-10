import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';

async function login(page){
 await page.locator('#ownerEmail').fill('owner@example.test');
 await page.locator('#ownerPassword').fill('synthetic mobile password');
 await page.locator('#ownerLogin button[type=submit]').tap();
 await page.locator('#dashboard').waitFor({state:'visible'});
}
async function navigate(page,name){
 await page.locator('#mobileMenuToggle').tap();
 await page.locator(`#dashNav [data-panel="${name}"]`).tap();
 await page.locator('#panel-'+name).waitFor({state:'visible'});
 assert.equal(await page.locator('#mobileMenuToggle').getAttribute('aria-expanded'),'false');
}
async function fits(page,selector){
 const bounds=await page.locator(selector).evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,viewport:innerWidth}));
 assert.ok(bounds.scroll<=bounds.client+1,`${selector} overflows: ${JSON.stringify(bounds)}`);
 assert.ok(bounds.left>=0&&bounds.right<=bounds.viewport+1,`${selector} outside viewport`);
}
async function download(page,selector){
 const ready=page.waitForEvent('download');await page.locator(selector).tap();
 const file=await ready;assert.equal(await file.failure(),null);
 return fs.readFileSync(await file.path(),'utf8');
}

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
 test(`phone workflows at ${viewport.width}x${viewport.height}`,async t=>{
  const f=await fixture();t.after(()=>f.close());const browser=await chromium.launch();t.after(()=>browser.close());
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const unexpected=[],errors=[];
  // Keep the entire run local. Never allow email tests, send batches, syncs or provider traffic.
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==f.base||/\/api\/.*(?:\/send|\/test|\/sync|\/password-reset\/request)$/.test(url.pathname)){unexpected.push(url.pathname);return route.abort()}
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(f.base+'/dashboard.html');await page.locator('#loginGate').waitFor({state:'visible'});
  assert.equal(await page.locator('#mobileMenuToggle').isVisible(),false);
  assert.equal((await context.request.get(f.base+'/api/crm/records')).status(),401);
  await page.locator('#ownerEmail').fill('owner@example.test');await page.locator('#ownerPassword').fill('incorrect');await page.locator('#ownerLogin button[type=submit]').tap();await page.locator('#loginError').filter({hasText:'incorrect'}).waitFor();
  await page.locator('#forgotPassword').tap();await page.locator('#passwordResetRequest').waitFor({state:'visible'});await fits(page,'.login-card');await page.locator('#backToLogin').tap();
  await login(page);await fits(page,'html');await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});
  await navigate(page,'crm');await page.locator('.crm-record-link:visible').tap();await page.locator('#crm-edit').waitFor();await fits(page,'#crm-detail');
  await page.locator('#crm-edit [name=workflowStatus]').selectOption('Contacted');await page.locator('#crm-edit [name=note]').fill('Synthetic phone audit note');await page.locator('#crm-edit button[type=submit]').tap();await page.locator('#crm-detail-notice').filter({hasText:'Changes saved'}).waitFor();
  assert.equal(await page.locator('#crm-edit [name=workflowStatus]').inputValue(),'Contacted');await page.locator('#crm-close').tap();
  await navigate(page,'marketing');await page.locator('#mAdd').waitFor();
  for(const button of ['mAdd','mImport','mCompose','mLists']){
   await page.locator('#'+button).tap();await page.locator('#marketingDialog').waitFor({state:'visible'});await fits(page,'#marketingDialog');
   if(button==='mAdd'){
    const size=await page.locator('[name=list][value=long-list]').boundingBox();assert.ok(size.width>=24&&size.height>=24,'list checkbox remains tappable');
    await page.locator('#mcEmail').fill('added@example.test');await page.locator('#mcName').fill('Added on phone');await page.locator('[name=list][value=long-list]').check();await page.locator('#mContactForm button').tap();await page.locator('#marketingNotice').filter({hasText:'Contact saved'}).waitFor();
   }else if(button==='mCompose'){
    await page.locator('#mdSubject').fill('Draft created on phone');await page.locator('#mdBody').fill('Synthetic draft only.');await page.locator('[name=list][value=long-list]').check();await page.locator('#mComposeForm button').tap();await page.locator('#mPreviewFrame').waitFor();await fits(page,'#marketingDialog');await page.locator('#marketingClose').tap();
   }else await page.locator('#marketingClose').tap();
  }
  // Edit only the disposable contact. Production records are never loaded.
  await page.locator('#mSearch').fill('added@example.test');await page.locator('#mSearchGo').tap();const added=page.locator('#marketingRoot tbody tr').filter({hasText:'added@example.test'}).locator('[data-contact]');await added.waitFor();await added.tap();await page.locator('#mcName').fill('Updated on phone');await page.locator('#mContactForm button').tap();await page.locator('#marketingNotice').filter({hasText:'Contact saved'}).waitFor();
  const contacts=await download(page,'#mExport');assert.match(contacts,/Updated on phone/);
  await page.locator('#mImport').tap();await page.locator('#miFile').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('email,name\nimported@example.test,Imported on phone\ninvalid,Invalid\n')});await page.locator('#miClean').tap();await page.locator('#miResults').waitFor({state:'visible'});await fits(page,'#marketingDialog');
  assert.match(await download(page,'#miDownload'),/imported@example.test/);assert.match(await download(page,'#miRejected'),/invalid/);
  await page.locator('#marketingBack').tap();assert.equal(await page.locator('#miResults').isVisible(),false);await page.locator('#miRemove').tap();assert.match(await page.locator('#miFileStatus').innerText(),/No file/);await page.locator('#miCancel').tap();
  await page.locator('[data-preview=mobile-draft]').tap();await page.locator('#mPreviewFrame').waitFor();await fits(page,'#marketingDialog');assert.equal(await page.locator('#mpSend').isEnabled(),true);
  // Exercise the confirmation's cancel path; no campaign request may be made.
  const dialogReady=page.waitForEvent('dialog',{timeout:5000});
  const sendTap=page.locator('#mpSend').tap();
  const confirmation=await dialogReady;assert.equal(confirmation.type(),'confirm');assert.match(confirmation.message(),/Send this campaign/);
  await confirmation.dismiss();await sendTap;await page.locator('#marketingClose').tap();
  await page.locator('[data-history=mobile-draft]').tap();await page.getByText('No sends yet.',{exact:true}).waitFor();await page.locator('#marketingClose').tap();
  await navigate(page,'reports');await page.locator('#crm-results-reports .table-wrap').waitFor();await fits(page,'html');
  const table=page.locator('#crm-results-reports .table-wrap');if(viewport.width<700)assert.ok(await table.evaluate(e=>e.scrollWidth>e.clientWidth),'narrow report table scrolls inside its wrapper');
  await page.locator('#crm-results-reports [data-record]').last().tap();await page.locator('#crm-close').waitFor();await page.locator('#crm-close').tap();
  const csv=await download(page,'#crm-export-reports');assert.match(csv,/Mobile Test Contact/);assert.match(csv,/Contacted/);
  // Every menu entry can be reached, including the final entry below the fold.
  const names=await page.locator('#dashNav [data-panel]').evaluateAll(es=>es.map(e=>e.dataset.panel));
  for(const name of names){await navigate(page,name);await fits(page,'html')}
  await page.locator('#logout').tap();await page.locator('#loginGate').waitFor({state:'visible'});assert.equal(await page.locator('#mobileMenuToggle').isVisible(),false);assert.equal((await context.request.get(f.base+'/api/crm/records')).status(),401);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  const stored=JSON.parse(fs.readFileSync(f.dir+'/store.json'));assert.equal(stored.marketing.campaigns.length,2);for(const campaign of stored.marketing.campaigns){assert.equal(campaign.status,'draft');assert.equal(campaign.recipients.length,0)}
 });
}
