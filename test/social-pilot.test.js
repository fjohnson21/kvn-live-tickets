import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createSocialApp} from '../social-pilot/app.js';
import {screenContent} from '../social-pilot/policy.js';

const keys={memberKey:'member-demo-key-32-characters-long',ownerKey:'owner-demo-key-32-characters-long'};
async function fixture(options={}) {
 const app=createSocialApp({...keys,...options}); const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(path,method='GET',body,auth={},headers={}){
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:base,...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,headers:response.headers,data:await response.json()};
 }
 async function login(role='member'){const r=await request('/session','POST',{key:keys[role+'Key']});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf};}
 return {request,login,close:()=>new Promise(r=>server.close(r))};
}
async function using(fn,options){const f=await fixture(options);try{await fn(f)}finally{await f.close()}}

test('requires separate strong keys and refuses production',()=>{
 assert.throws(()=>createSocialApp({}),/keys/i);
 assert.throws(()=>createSocialApp({...keys,production:true}),/production/i);
 assert.throws(()=>createSocialApp({...keys,ownerKey:keys.memberKey}),/distinct/i);
});
test('screening signals prioritize actual abuse, not negative opinions',()=>{
 for(const [text,category] of [['You are worthless','harassment'],['I will kill you','threats'],['All Christians are vermin','hate'],['buy now buy now buy now','spam'],['That idiot is disgusting','derogatory'],['Call me at 919-555-0199','privacy'],['send nude photos','sexual']])assert.ok(screenContent(text).includes(category),text);
 assert.deepEqual(screenContent('I disagree with the message and found the sound too loud.'),[]);
 assert.ok(screenContent('I will k\u200bill you').includes('threats'));
});
test('auth, role forgery, CSRF, origin, logout and private API boundaries',()=>using(async({request,login})=>{
 assert.equal((await request('/feed')).status,401);
 assert.equal((await request('/session','POST',{key:keys.memberKey,role:'owner'})).status,400);
 const member=await login(); const r=await request('/moderation','GET',undefined,member);assert.equal(r.status,403);
 assert.equal((await request('/posts','POST',{text:'A hopeful day',topic:'Community'}, {...member,csrf:'wrong'})).status,403);
 assert.equal((await request('/posts','POST',{text:'A hopeful day',topic:'Community'},member,{Origin:'https://evil.test'})).status,403);
 assert.equal((await request('/posts','POST',{text:'A hopeful day',topic:'Community',authorId:'owner',status:'published'},member)).status,400);
 assert.equal((await request('/feed','GET',undefined,member)).headers.get('cache-control'),'no-store');
 await request('/logout','POST',{},member);assert.equal((await request('/feed','GET',undefined,member)).status,401);
}));
test('validates payloads, plain text, links and unpublished submission, duplicate guard',()=>using(async({request,login})=>{
 const a=await login();
 for(const text of ['', ' '.repeat(5), 'x'.repeat(2001), '<img src=x onerror=alert(1)>','visit https://spam.test'])assert.equal((await request('/posts','POST',{text,topic:'Community'},a)).status,400,text.slice(0,30));
 assert.equal((await request('/posts','POST',{text:'hello',topic:'invented'},a)).status,400);
 const body={text:'I disagree with the sound mix. Could it be quieter?',topic:'Community'};
 const r=await request('/posts','POST',body,a);assert.equal(r.status,201);assert.equal(r.data.post.status,'pending');assert.deepEqual(r.data.post.signals,[]);
 assert.equal((await request('/posts','POST',body,a)).status,409);
 const feed=await request('/feed','GET',undefined,a);assert.ok(!feed.data.posts.some(p=>p.id===r.data.post.id));
}));
test('review, reports, removal, own appeal and reasoned resolution preserve audit and privacy',()=>using(async({request,login})=>{
 const a=await login(),o=await login('owner');
 const p=(await request('/posts','POST',{text:'A song that brought our community together.',topic:'Music'},a)).data.post;
 assert.equal((await request(`/posts/${p.id}/review`,'POST',{action:'approve',reason:''},o)).status,400);
 assert.equal((await request(`/posts/${p.id}/review`,'POST',{action:'approve',reason:'Constructive community post',version:p.version},a)).status,403);
 assert.equal((await request(`/posts/${p.id}/review`,'POST',{action:'approve',reason:'Constructive community post',version:p.version},o)).status,200);
 assert.equal((await request(`/posts/${p.id}/review`,'POST',{action:'remove',reason:'stale',version:p.version},o)).status,409);
 assert.equal((await request(`/posts/${p.id}/report`,'POST',{category:'spam',reason:'Please review context'},a)).status,201);
 const feed=(await request('/feed','GET',undefined,a)).data;const pub=feed.posts.find(x=>x.id===p.id);assert.ok(pub);assert.equal(pub.signals,undefined);assert.equal(pub.reports,undefined);
 await request(`/posts/${p.id}/review`,'POST',{action:'remove',reason:'Repeated promotional content',version:2},o);
 assert.equal((await request(`/posts/${p.id}/appeal`,'POST',{reason:'I am not the author'},o)).status,403);
 assert.equal((await request(`/posts/${p.id}/appeal`,'POST',{reason:'This is a personal story, not advertising.'},a)).status,201);
 assert.equal((await request(`/posts/${p.id}/appeal`,'POST',{reason:'Duplicate appeal'},a)).status,409);
 const m=(await request('/moderation','GET',undefined,o)).data;
 assert.ok(m.reports.length);assert.ok(m.audit.length>=4);
 const appeal=m.appeals[0];assert.equal((await request(`/appeals/${appeal.id}/resolve`,'POST',{action:'restore',reason:'Context supports a genuine story',version:3},o)).status,200);
 assert.ok((await request('/feed','GET',undefined,a)).data.posts.find(x=>x.id===p.id));
}));
test('comments, editing, blocking and suspension cannot leak or republish hidden content',()=>using(async({request,login})=>{
 const a=await login(),o=await login('owner');const feed=(await request('/feed','GET',undefined,a)).data;
 const seed=feed.posts[0];const comment=(await request('/posts','POST',{text:'Love this community story.',topic:'Community',parentId:seed.id},a)).data.post;
 assert.ok(!(await request('/feed','GET',undefined,a)).data.posts.some(p=>p.id===comment.id));
 await request(`/posts/${comment.id}/review`,'POST',{action:'approve',reason:'Positive comment',version:1},o);
 assert.equal((await request(`/posts/${comment.id}`,'PATCH',{text:'An updated opinion'},a)).data.post.status,'pending');
 await request(`/users/member/suspend`,'POST',{suspended:true,reason:'Repeated test violations'},o);
 assert.equal((await request('/posts','POST',{text:'Cannot post now',topic:'Community'},a)).status,403);
 assert.equal((await request(`/posts/${comment.id}/review`,'POST',{action:'approve',reason:'Attempt',version:3},o)).status,409);
 await request('/blocks','POST',{authorId:seed.authorId,blocked:true},a);
 assert.ok(!(await request('/feed','GET',undefined,a)).data.posts.some(p=>p.authorId===seed.authorId));
}));
test('rate limiting survives repeated sessions for the same member',()=>using(async({request,login})=>{
 const a=await login();for(let i=0;i<5;i++)assert.equal((await request('/posts','POST',{text:'Community message '+i,topic:'Community'},a)).status,201);
 const b=await login();assert.equal((await request('/posts','POST',{text:'Extra message',topic:'Community'},b)).status,429);
}));
test('session expiration and malformed JSON produce safe responses',()=>using(async({request,login})=>{
 const a=await login();await new Promise(r=>setTimeout(r,25));assert.equal((await request('/feed','GET',undefined,a)).status,401);
}, {sessionMs:10}));

test('hidden parent hides comments, guessed private IDs cannot be reported or reacted to',()=>using(async({request,login})=>{
 const a=await login(),o=await login('owner');const seed=(await request('/feed','GET',undefined,a)).data.posts[0];
 const p=(await request('/posts','POST',{text:'Thoughtful response to the sample.',topic:'Community',parentId:seed.id},a)).data.post;
 await request(`/posts/${p.id}/review`,'POST',{action:'approve',reason:'Reviewed context',version:1},o);
 await request(`/posts/${seed.id}/review`,'POST',{action:'hide',reason:'Hide parent for demo',version:1},o);
 assert.ok(!(await request('/feed','GET',undefined,a)).data.posts.some(x=>x.id===p.id));
 assert.equal((await request(`/posts/${p.id}/react`,'POST',{},a)).status,404);
 assert.equal((await request(`/posts/${p.id}/report`,'POST',{category:'other',reason:'Private'},a)).status,404);
 assert.equal((await request(`/posts/${p.id}`,'PATCH',{text:'Not my comment'},o)).status,403);
}));
test('upheld appeal cannot be reopened and pending appeals prevent conflicting reviews',()=>using(async({request,login})=>{
 const a=await login(),o=await login('owner');const p=(await request('/posts','POST',{text:'A message to review',topic:'Community'},a)).data.post;
 await request(`/posts/${p.id}/review`,'POST',{action:'remove',reason:'Demo removal',version:1},o);
 const appeal=(await request(`/posts/${p.id}/appeal`,'POST',{reason:'Please reconsider'},a)).data.appeal;
 assert.equal((await request(`/posts/${p.id}`,'PATCH',{text:'Edited during appeal'},a)).status,409);
 assert.equal((await request(`/posts/${p.id}/review`,'POST',{action:'approve',reason:'Conflicting review',version:2},o)).status,409);
 await request(`/appeals/${appeal.id}/resolve`,'POST',{action:'uphold',reason:'Context confirms original removal',version:2},o);
 assert.equal((await request(`/posts/${p.id}/appeal`,'POST',{reason:'Reopen same decision'},a)).status,409);
 assert.equal((await request(`/appeals/${appeal.id}/resolve`,'POST',{action:'restore',reason:'Replay',version:2},o)).status,409);
}));
test('owner cannot approve their own post and member cannot suspend another account',()=>using(async({request,login})=>{
 const a=await login(),o=await login('owner');const p=(await request('/posts','POST',{text:'Owner authored sample',topic:'Purpose'},o)).data.post;
 assert.equal((await request(`/posts/${p.id}/review`,'POST',{action:'approve',reason:'Self approval',version:1},o)).status,409);
 assert.equal((await request('/users/editorial/suspend','POST',{suspended:true,reason:'Attempt'},a)).status,403);
 assert.equal((await request('/users/owner/suspend','POST',{suspended:true,reason:'Attempt'},o)).status,400);
}));
test('curated themes only; no uploaded files, links or caller-assigned identities',()=>using(async({request,login})=>{
 const a=await login();
 for(const body of [{text:'Photo',topic:'Community',image:'data:image/png;base64,abc'},{text:'Photo',topic:'Community',theme:'https://tracker.test/image'},{text:{body:'bad'},topic:'Music'}])assert.equal((await request('/posts','POST',body,a)).status,400);
 assert.equal((await request('/posts','POST',{text:'x'.repeat(20000),topic:'Music'},a)).status,413);
}));
test('reactions and saves toggle without duplicate counts',()=>using(async({request,login})=>{
 const a=await login();const p=(await request('/feed','GET',undefined,a)).data.posts[0];
 assert.equal((await request(`/posts/${p.id}/react`,'POST',{},a)).data.post.reactions,1);
 assert.equal((await request(`/posts/${p.id}/react`,'POST',{},a)).data.post.reactions,0);
 assert.equal((await request(`/posts/${p.id}/save`,'POST',{},a)).data.post.saved,true);
 assert.equal((await request(`/posts/${p.id}/save`,'POST',{},a)).data.post.saved,false);
}));
test('invalid review actions cannot corrupt status via inherited object properties',()=>using(async({request,login})=>{
 const a=await login(),o=await login('owner');const p=(await request('/feed','GET',undefined,a)).data.posts[0];
 for(const action of ['toString','constructor','__proto__',{},['approve']])assert.equal((await request(`/posts/${p.id}/review`,'POST',{action,reason:'Invalid decision',version:1},o)).status,400);
 assert.ok((await request('/feed','GET',undefined,a)).data.posts.some(x=>x.id===p.id));
}));
test('full post capacity still permits removal, suspension and appeal resolution',async()=>{
 let clock=Date.now();await using(async({request,login})=>{
  const a=await login(),o=await login('owner');let first;
  for(let i=0;i<496;i++){clock+=61000;const r=await request('/posts','POST',{text:'Synthetic capacity case '+i,topic:'Community'},a);assert.equal(r.status,201);first??=r.data.post;}
  clock+=61000;assert.equal((await request('/posts','POST',{text:'Over capacity',topic:'Community'},a)).status,503);
  assert.equal((await request(`/posts/${first.id}/review`,'POST',{action:'remove',reason:'Moderation remains available',version:1},o)).status,200);
  assert.equal((await request('/users/member/suspend','POST',{suspended:true,reason:'Stop further abuse'},o)).status,200);
  const appeal=await request(`/posts/${first.id}/appeal`,'POST',{reason:'Please reconsider'},a);assert.equal(appeal.status,201);
  assert.equal((await request(`/appeals/${appeal.data.appeal.id}/resolve`,'POST',{action:'uphold',reason:'Reviewed under capacity pressure',version:2},o)).status,200);
 },{now:()=>clock,sessionMs:1e9});
});
