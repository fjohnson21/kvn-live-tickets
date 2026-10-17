import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSocialApp} from '../social-app/app.js';
test('branded emails, authenticated proxy client isolation, and owner login retain security',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'social-brand-')),emails=[];
 const secret='test-only-proxy-secret-32-characters-long';
 const app=createSocialApp({dataDir,ownerEmail:'owner@example.test',ownerPassword:'Owner-password-123',inviteCode:'test-invite-code-2026',production:false,publicBaseUrl:'https://kvnlive.com/social',proxySecret:secret,mailer:async m=>emails.push(m)});
 await app.locals.ready;const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,extra={})=>fetch(base+'/api'+path,{method:'POST',headers:{origin:base,'content-type':'application/json',...extra},body:JSON.stringify(body)});
 try{
  let r=await post('/password/forgot',{email:'owner@example.test'});assert.equal(r.status,200);assert.match(emails[0].url,/^https:\/\/kvnlive\.com\/social\/\?reset=/);
  r=await post('/login',{email:'owner@example.test',password:'Owner-password-123'},{'x-kv-social-proxy':'wrong','x-kv-social-client':'a'.repeat(64)});assert.equal(r.status,403);
  const headers={'x-kv-social-proxy':secret,'x-kv-social-client':'a'.repeat(64)};
  for(let i=0;i<12;i++)assert.equal((await post('/login',{email:'none@example.test',password:'wrong-password-123'},headers)).status,401);
  assert.equal((await post('/login',{email:'none@example.test',password:'wrong-password-123'},headers)).status,429);
  r=await post('/login',{email:'owner@example.test',password:'Owner-password-123'},{...headers,'x-kv-social-client':'b'.repeat(64)});assert.equal(r.status,200);const s=await r.json();assert.equal(s.role,'owner');assert.match(r.headers.get('set-cookie'),/HttpOnly/);
  const cookie=r.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/api/moderation',{headers:{cookie}})).status,200);
  assert.equal((await post('/logout',{}, {cookie})).status,403);
  assert.equal((await post('/logout',{}, {cookie,'x-csrf-token':s.csrf})).status,200);
 }finally{await new Promise(r=>server.close(r));rmSync(dataDir,{recursive:true,force:true});}
});
