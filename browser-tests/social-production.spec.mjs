import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {createSocialApp} from '../social-app/app.js';

test('KV Social invited beta works as a mobile real-account community',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kv-social-browser-'));
  const ownerEmail='moderator@kv.test',ownerPassword='moderator-password-123',inviteCode='kv-social-beta-invite-2026';
  const server=createSocialApp({dataDir:dir,ownerEmail,ownerPassword,inviteCode,production:false}).listen(0,'127.0.0.1');
  await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;let browser;
  try{
    browser=await chromium.launch({headless:true});
    const memberContext=await browser.newContext({viewport:{width:390,height:844}});
    const page=await memberContext.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.getByRole('button',{name:'Create account'}).click();
    await page.getByLabel('Display name').fill('Jordan Member');
    await page.getByLabel('Email').fill('jordan@example.com');
    await page.getByLabel('Password').fill('member-password-123');
    await page.getByLabel('Beta invitation code').fill(inviteCode);
    await page.getByLabel(/I agree to participate respectfully/).check();
    await page.getByRole('button',{name:/Create my account/}).click();
    await page.getByRole('heading',{name:'Your people. Your purpose.'}).waitFor();

    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'My profile'}).click();
    await page.getByRole('button',{name:'Edit profile'}).click();
    await page.getByLabel('Display name').fill('Jordan J.');
    await page.getByLabel('Bio').fill('Faith, music, community.');
    await page.getByRole('button',{name:'Save profile'}).click();
    await page.getByText('Profile updated.').waitFor();

    await page.getByRole('button',{name:'Community feed'}).click();
    await page.getByRole('button',{name:'Share something'}).click();
    await page.getByLabel('Your message').fill('Grateful for this community and excited for KV Live.');
    await page.getByLabel('Topic').selectOption('KV Live');
    await page.getByRole('button',{name:'Submit for review'}).click();
    await page.getByText('Submitted for human review.').waitFor();

    const ownerContext=await browser.newContext({viewport:{width:390,height:844}});
    const owner=await ownerContext.newPage();await owner.goto(base);
    await owner.getByLabel('Email').fill(ownerEmail);
    await owner.getByLabel('Password').fill(ownerPassword);
    await owner.getByRole('button',{name:/Enter KV Social/}).click();
    await owner.getByRole('button',{name:'Review desk'}).click();
    await owner.getByRole('button',{name:'Review post'}).filter({visible:true}).last().click().catch(async()=>owner.getByRole('button',{name:'Review post'}).first().click());
    await owner.getByLabel('Decision reason').fill('Approved for invited beta.');
    await owner.getByRole('button',{name:'Approve post'}).click();
    await owner.getByText('Decision recorded.').waitFor();

    await page.getByRole('button',{name:'Community feed'}).click();
    await page.getByText('Grateful for this community and excited for KV Live.',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    await ownerContext.close();await memberContext.close();
  }finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});
  }
});
