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

    response=await runtime.request('/posts','POST',{text:'Grateful for this community and excited for KV Live.',topic:'KV Live',theme:'live'},member);
    assert.equal(response.status,201);
    const postId=response.data.post.id;
    assert.equal(response.data.post.status,'pending');

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
