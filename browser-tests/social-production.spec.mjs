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
    await page.locator('#register-name').fill('Jordan Member');
    await page.locator('#register-email').fill('jordan@example.com');
    await page.locator('#register-password').fill('member-password-123');
    await page.locator('#invite-code').fill(inviteCode);
    await page.locator('#community-agreement').check();
    await page.getByRole('button',{name:/Create my account/}).click();
    await page.getByRole('heading',{name:'Your people. Your purpose.'}).waitFor();

    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'My profile'}).click();
    await page.getByRole('button',{name:'Edit profile'}).click();
    await page.locator('#field-name').fill('Jordan J.');
    await page.locator('#field-bio').fill('Faith, music, community.');
    await page.getByRole('button',{name:'Save profile'}).click();
    await page.getByText('Profile updated.').waitFor();

    await page.getByRole('button',{name:'Community feed'}).click();
    await page.getByRole('button',{name:'Share something'}).click();
    await page.locator('#accept-house-rules').check();
    await page.getByRole('button',{name:'I agree — let’s create'}).click();
    await page.getByLabel('Your message').fill('Grateful for this community and excited for KV Live.');
    await page.locator('#field-topic').selectOption('KV Live');
    const jpegBase64=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='#555';ctx.fillRect(0,0,80,80);return canvas.toDataURL('image/jpeg',0.9).split(',')[1];});
    await page.locator('#post-photo').setInputFiles({name:'sample.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpegBase64,'base64')});
    let postStatus=null,postBody='';
    page.on('response',async response=>{if(response.url().endsWith('/api/posts')&&response.request().method()==='POST'){postStatus=response.status();postBody=await response.text();}});
    await page.getByRole('button',{name:'Submit for review'}).click();
    await page.waitForTimeout(1500);
    const submitError=(await page.locator('dialog .error').textContent().catch(()=>''))||'';
    assert.equal(submitError,'',`KV Social photo submit error: ${submitError}; response: ${postStatus} ${postBody}`);
    await page.getByText('Submitted for human review.').waitFor();

    const ownerContext=await browser.newContext({viewport:{width:390,height:844}});
    const owner=await ownerContext.newPage();await owner.goto(base);
    await owner.locator('#login-email').fill(ownerEmail);
    await owner.locator('#login-password').fill(ownerPassword);
    await owner.getByRole('button',{name:/Enter KV Social/}).click();
    await owner.getByRole('button',{name:'Review desk'}).click();
    await owner.getByRole('button',{name:'Review post'}).first().click();
    await owner.locator('dialog img.post-photo').waitFor();
    await owner.getByLabel('Decision reason').fill('Approved for invited beta.');
    await owner.getByRole('button',{name:'Approve post'}).click();
    await owner.getByText('Decision recorded.').waitFor();

    await page.getByRole('button',{name:'Community feed'}).click();
    const approved=page.locator('article').filter({hasText:'Grateful for this community and excited for KV Live.'});await approved.waitFor();
    await approved.locator('img.post-photo').waitFor();
    assert.deepEqual(errors,[]);
    await ownerContext.close();await memberContext.close();
  }finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});
  }
});


test('KV Social email link requires a deliberate confirmation click on mobile',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kv-social-verify-ui-'));
  const messages=[];
  const server=createSocialApp({
    dataDir:dir,ownerEmail:'moderator@kv.test',ownerPassword:'moderator-password-123',
    inviteCode:'kv-social-beta-invite-2026',
    production:false,
    mailer:async message=>{messages.push(message);return {id:'mail-test'};}
  }).listen(0,'127.0.0.1');
  await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(base);
    await page.getByRole('button',{name:'Create account'}).click();
    await page.locator('#register-name').fill('Mobile Member');
    await page.locator('#register-email').fill('mobile-verify@example.com');
    await page.locator('#register-password').fill('member-password-123');
    await page.locator('#invite-code').fill('kv-social-beta-invite-2026');
    await page.locator('#community-agreement').check();
    await page.getByRole('button',{name:/Create my account/}).click();
    await page.getByText('Check your email to verify your KV Social account, then sign in.').waitFor();
    assert.equal(messages.length,1);
    await page.goto(messages[0].url);
    await page.getByRole('button',{name:'Confirm my email'}).waitFor();
    // The GET loads a page only; verification requires the human confirmation action.
    const before=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'mobile-verify@example.com',password:'member-password-123'})});
    assert.equal(before.status,403);
    await page.getByRole('button',{name:'Confirm my email'}).click();
    await page.getByText('Email verified. You can sign in now.').waitFor();
    await page.locator('#login-email').fill('mobile-verify@example.com');
    await page.locator('#login-password').fill('member-password-123');
    await page.getByRole('button',{name:/Enter KV Social/}).click();
    await page.getByRole('heading',{name:'Your people. Your purpose.'}).waitFor();
    await page.close();
  }finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
