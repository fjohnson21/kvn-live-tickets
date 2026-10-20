import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createSocialApp} from '../social-pilot/app.js';
const memberKey='member-browser-demo-key-32-characters',ownerKey='owner-browser-demo-key-32-characters';
test('KV Social phone feed, submission, review, reporting and appeal workflow',async()=>{
 const server=createSocialApp({memberKey,ownerKey}).listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByLabel('Demo access key').fill(memberKey);await page.getByRole('button',{name:'Enter private pilot'}).click();
  await page.getByRole('heading',{name:'Your people. Your purpose.'}).waitFor();
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);}
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Share something',exact:true}).click();await page.getByLabel('Your message').fill('I enjoyed the music but the sound was too loud. Could we improve it?');
  await page.getByRole('button',{name:'Submit for review'}).click();await page.getByText('Submitted for human review.').waitFor();
  await page.getByRole('button',{name:'My activity',exact:true}).click();await page.getByText('I enjoyed the music but the sound was too loud. Could we improve it?',{exact:true}).waitFor();
  const oc=await browser.newContext({viewport:{width:320,height:740}}),op=await oc.newPage();await op.goto(base);await op.getByLabel('Demo access key').fill(ownerKey);await op.getByRole('button',{name:'Enter private pilot'}).click();
  await op.getByRole('button',{name:'Review desk',exact:true}).click();await op.getByRole('button',{name:'Review post'}).first().click();
  await op.getByLabel('Decision reason').fill('Respectful criticism is permitted.');await op.getByRole('button',{name:'Approve post',exact:true}).click();await op.getByText('Decision recorded.').waitFor();
  await page.getByRole('button',{name:'Community feed',exact:true}).click();const card=page.locator('article').filter({hasText:'I enjoyed the music but the sound was too loud.'});await card.waitFor();
  await card.getByRole('button',{name:'Appreciate'}).click();await card.getByRole('button',{name:'Appreciated'}).waitFor();
  await card.getByRole('button',{name:'Report post'}).click();await page.getByLabel('What should we review?').fill('Please double-check the context.');await page.getByRole('button',{name:'Send private report'}).click();await page.getByText('Report sent privately to the review desk.').waitFor();
  await op.getByRole('button',{name:'Review desk',exact:true}).click();await op.getByRole('button',{name:'Reports',exact:true}).click();await op.getByRole('button',{name:'Review post'}).first().click();await op.getByLabel('Decision reason').fill('Synthetic removal to exercise the appeal path.');await op.getByRole('button',{name:'Remove post',exact:true}).click();await op.getByText('Decision recorded.').waitFor();
  await page.getByRole('button',{name:'My activity',exact:true}).click();await page.getByRole('button',{name:'Appeal decision'}).click();await page.getByLabel('Why should we reconsider?').fill('This is constructive feedback about sound.');await page.getByRole('button',{name:'Submit appeal',exact:true}).click();await page.getByText('Appeal received. A human reviewer will reconsider.').waitFor();
  await op.getByRole('button',{name:'Review desk',exact:true}).click();await op.getByRole('button',{name:'Appeals',exact:true}).click();await op.getByRole('button',{name:'Review appeal'}).click();await op.getByLabel('Decision reason').fill('Restored: respectful criticism is allowed.');await op.getByRole('button',{name:'Restore post',exact:true}).click();await op.getByText('Appeal decision recorded.').waitFor();
  assert.ok(await op.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Community feed',exact:true}).click();
  await page.getByRole('button',{name:'Share something',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
  assert.deepEqual(errors,[]);await oc.close();await context.close();
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
