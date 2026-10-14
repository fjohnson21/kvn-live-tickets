import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSocialApp} from '../social-app/app.js';

const ownerEmail='moderator@kv.test';
const ownerPassword='moderator-password-123';
const inviteCode='kv-social-beta-invite-2026';

async function start(dataDir){
  const app=createSocialApp({dataDir,ownerEmail,ownerPassword,inviteCode,production:false,sessionMs:60*60*1000});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(pathname,method='GET',body,session={})=>{
    const headers={Origin:base};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(session.cookie)headers.Cookie=session.cookie;
    if(session.csrf)headers['X-CSRF-Token']=session.csrf;
    const response=await fetch(base+'/api'+pathname,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    const setCookie=response.headers.get('set-cookie');
    if(setCookie)session.cookie=setCookie.split(';')[0];
    if(data.csrf)session.csrf=data.csrf;
    return {status:response.status,data};
  };
  return {server,base,request};
}
const stop=server=>new Promise(resolve=>server.close(resolve));

test('KV Social invited beta persists real accounts and moderated community activity',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kv-social-'));
  try{
    let runtime=await start(dir);
    const member={};
    let response=await runtime.request('/register','POST',{
      name:'Jordan Member',email:'Jordan@example.com',password:'member-password-123',inviteCode,communityAgreement:true
    },member);
    assert.equal(response.status,201);
    assert.equal(response.data.user.email,'jordan@example.com');
    assert.equal(response.data.user.role,'member');

    const duplicate={};
    response=await runtime.request('/register','POST',{
      name:'Jordan Again',email:'jordan@example.com',password:'another-password-123',inviteCode,communityAgreement:true
    },duplicate);
    assert.equal(response.status,409);

    const denied={};
    response=await runtime.request('/register','POST',{
      name:'No Invite',email:'noinvite@example.com',password:'another-password-123',inviteCode:'wrong-invite-code',communityAgreement:true
    },denied);
    assert.equal(response.status,403);

    response=await runtime.request('/profile','PATCH',{name:'Jordan J.',bio:'Faith, music, community.'},member);
    assert.equal(response.status,200);
    assert.equal(response.data.user.name,'Jordan J.');

    response=await runtime.request('/posts','POST',{text:'Grateful for this community and excited for KV Live.',topic:'KV Live',theme:'live',photoData:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAKAAoDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzqiiigD//2Q=='},member);
    assert.equal(response.status,201);
    const postId=response.data.post.id;
    assert.equal(response.data.post.status,'pending');
    assert.match(response.data.post.mediaUrl,/^\/api\/media\/[0-9a-f-]{36}$/i);

    response=await runtime.request('/feed','GET',undefined,member);
    assert.ok(!response.data.posts.some(post=>post.id===postId),'pending post must not be public');

    const owner={};
    response=await runtime.request('/login','POST',{email:ownerEmail,password:ownerPassword},owner);
    assert.equal(response.status,200);
    assert.equal(response.data.role,'owner');

    response=await runtime.request('/moderation','GET',undefined,owner);
    const pending=response.data.posts.find(post=>post.id===postId);
    assert.equal(pending.status,'pending');

    response=await runtime.request(`/posts/${postId}/review`,'POST',{action:'approve',reason:'Constructive community post approved.',version:pending.version},owner);
    assert.equal(response.status,200);
    assert.equal(response.data.post.status,'published');

    response=await runtime.request('/feed','GET',undefined,member);
    assert.ok(response.data.posts.some(post=>post.id===postId));

    response=await runtime.request(`/posts/${postId}/react`,'POST',{},member);
    assert.equal(response.status,200);
    assert.equal(response.data.post.reactions,1);
    response=await runtime.request(`/posts/${postId}/save`,'POST',{},member);
    assert.equal(response.status,200);
    assert.equal(response.data.post.saved,true);

    await stop(runtime.server);
    runtime=await start(dir);
    const returning={};
    response=await runtime.request('/login','POST',{email:'JORDAN@example.com',password:'member-password-123'},returning);
    assert.equal(response.status,200);
    response=await runtime.request('/feed','GET',undefined,returning);
    const persisted=response.data.posts.find(post=>post.id===postId);
    assert.ok(persisted,'approved post persisted across restart');
    assert.equal(persisted.reactions,1);
    assert.equal(persisted.saved,true);

    const state=JSON.parse(fs.readFileSync(path.join(dir,'kv-social.json'),'utf8'));
    const stored=state.users.find(user=>user.email==='jordan@example.com');
    assert.ok(stored.passwordHash.startsWith('scrypt$'));
    assert.ok(!('password' in stored));
    assert.equal(state.posts.find(post=>post.id===postId).status,'published');
    await stop(runtime.server);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('KV Social rejects unsafe cross-origin writes and protects moderation',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kv-social-security-'));
  const runtime=await start(dir);
  try{
    const member={};
    let response=await runtime.request('/register','POST',{
      name:'Beta Member',email:'beta@example.com',password:'member-password-123',inviteCode,communityAgreement:true
    },member);
    assert.equal(response.status,201);

    const direct=await fetch(runtime.base+'/api/posts',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example',Cookie:member.cookie,'X-CSRF-Token':member.csrf},body:JSON.stringify({text:'test',topic:'Kingdom Culture',theme:'none'})});
    assert.equal(direct.status,403);

    response=await runtime.request('/moderation','GET',undefined,member);
    assert.equal(response.status,403);

    response=await runtime.request('/posts','POST',{text:'I enjoyed the event but the sound was too loud.',topic:'Kingdom Culture',theme:'none'},member);
    assert.equal(response.status,201);
    assert.equal(response.data.post.status,'pending');
  }finally{
    await stop(runtime.server);fs.rmSync(dir,{recursive:true,force:true});
  }
});


test('KV Social verifies email and supports one-time password recovery',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kv-social-auth-'));
  const sent=[];
  const app=createSocialApp({
    dataDir:dir,ownerEmail,ownerPassword,inviteCode,production:false,
    mailer:async message=>{sent.push(message);return {id:'test-email'};}
  });
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(pathname,method='GET',body,session={})=>{
    const headers={Origin:base};if(body!==undefined)headers['Content-Type']='application/json';
    if(session.cookie)headers.Cookie=session.cookie;if(session.csrf)headers['X-CSRF-Token']=session.csrf;
    const response=await fetch(base+'/api'+pathname,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
    let data={};const type=response.headers.get('content-type')||'';if(type.includes('application/json'))data=await response.json();
    const setCookie=response.headers.get('set-cookie');if(setCookie)session.cookie=setCookie.split(';')[0];if(data.csrf)session.csrf=data.csrf;
    return {status:response.status,data,location:response.headers.get('location')};
  };
  try{
    const member={};
    let response=await request('/register','POST',{name:'Verified Member',email:'verify@example.com',password:'member-password-123',inviteCode,communityAgreement:true},member);
    assert.equal(response.status,201);assert.equal(response.data.verificationRequired,true);assert.equal(sent.length,1);
    response=await request('/login','POST',{email:'verify@example.com',password:'member-password-123'},member);
    assert.equal(response.status,403);

    const verifyToken=new URL(sent[0].url).searchParams.get('token');assert.ok(verifyToken);
    response=await request('/verify-email?token='+encodeURIComponent(verifyToken),'GET',undefined,member);
    assert.equal(response.status,302);assert.equal(response.location,'/?verified=1');

    response=await request('/login','POST',{email:'verify@example.com',password:'member-password-123'},member);
    assert.equal(response.status,200);assert.equal(response.data.user.emailVerified,true);

    response=await request('/password/forgot','POST',{email:'verify@example.com'});
    assert.equal(response.status,200);assert.equal(sent.length,2);
    const resetToken=new URL(sent[1].url).searchParams.get('reset');assert.ok(resetToken);

    response=await request('/password/reset','POST',{token:resetToken,password:'new-member-password-456'});
    assert.equal(response.status,200);
    response=await request('/password/reset','POST',{token:resetToken,password:'another-password-789'});
    assert.equal(response.status,400);

    response=await request('/feed','GET',undefined,member);
    assert.equal(response.status,401,'password reset revokes active sessions');

    const fresh={};response=await request('/login','POST',{email:'verify@example.com',password:'new-member-password-456'},fresh);
    assert.equal(response.status,200);
  }finally{
    await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});
  }
});
