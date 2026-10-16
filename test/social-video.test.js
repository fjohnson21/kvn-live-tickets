import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
const id='11111111-1111-4111-8111-111111111111';
const config={libraryId:'780138',cdnHost:'vz-3374d7e5-dd2.b-cdn.net',apiKey:'test-api-secret',tokenKey:'test-sign-secret',now:()=>1_800_000_000_000};
test('video provider fails closed without complete configuration',async()=>{
 const {createVideoProvider}=await import('../social-app/video.js');
 assert.equal(createVideoProvider({}),null);
 assert.equal(createVideoProvider({...config,tokenKey:''}),null);
});
test('provider creates scoped uploads and expiring playback without exposing secrets',async()=>{
 const {createVideoProvider}=await import('../social-app/video.js');
 const p=createVideoProvider({...config,fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://video.bunnycdn.com/library/780138/videos');
  assert.equal(opts.headers.AccessKey,config.apiKey);
  assert.equal(JSON.parse(opts.body).title,'KV Social upload');
  return Response.json({guid:id});
 }});
 const upload=await p.createUpload();
 assert.equal(upload.videoId,id);assert.equal(upload.expirationTime,1800000600);
 assert.equal(upload.signature,createHash('sha256').update('780138test-api-secret1800000600'+id).digest('hex'));
 const playback=new URL(p.playbackUrl(id));
 assert.equal(playback.searchParams.get('expires'),'1800000300');
 assert.equal(playback.searchParams.get('token'),createHash('sha256').update('test-sign-secret'+id+'1800000300').digest('hex'));
 const thumb=new URL(p.thumbnailUrl(id,'thumbnail.jpg'));
 assert.equal(thumb.searchParams.get('token'),'HS256-'+createHmac('sha256',config.tokenKey).update('/'+id+'/thumbnail.jpg1800000300').digest('base64url'));
 assert.ok(!JSON.stringify({upload,playback:String(playback),thumb:String(thumb)}).includes(config.apiKey));
 assert.throws(()=>p.playbackUrl('../escape'));assert.throws(()=>p.thumbnailUrl(id,'../../secret'));
});
test('provider handles failures and validates metadata instead of trusting client duration',async()=>{
 const {createVideoProvider}=await import('../social-app/video.js');
 const bad=createVideoProvider({...config,fetchImpl:async()=>new Response('private upstream detail',{status:401})});
 await assert.rejects(bad.createUpload(),/Video service is temporarily unavailable/);
 const good=createVideoProvider({...config,fetchImpl:async()=>Response.json({guid:id,videoLibraryId:780138,status:4,length:45,thumbnailFileName:'thumbnail.jpg'})});
 assert.deepEqual(await good.inspectVideo(id),{ready:true,failed:false,duration:45,originalHash:null,thumbnail:'thumbnail.jpg'});
 const malformed=createVideoProvider({...config,fetchImpl:async()=>Response.json({guid:'other',status:4,length:45})});
 await assert.rejects(malformed.inspectVideo(id));
});

import {createSocialApp} from '../social-app/app.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
async function runtime(t,{enabled=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'kv-video-'));let clock=1800000000000;
 const videos=new Map();
 const provider={cdnHost:'vz-3374d7e5-dd2.b-cdn.net',async createUpload(){const videoId=randomUUID();videos.set(videoId,{ready:true,failed:false,duration:45,thumbnail:'thumbnail.jpg',originalHash:'a'.repeat(64)});return{videoId,expirationTime:Math.floor(clock/1000)+600,signature:'scoped-signature',libraryId:'780138'};},async startUpload(grant,size){videos.get(grant.videoId).offset=0;return{...grant,size,uploadUrl:'https://video.bunnycdn.com/tusupload/test'};},async uploadStatus(v){return{offset:videos.get(v.id).offset,size:v.size};},async uploadChunk(v,offset,bytes){const video=videos.get(v.id);if(video.offset!==offset)throw Object.assign(Error('Offset mismatch'),{status:409});video.offset+=bytes.length;return video.offset;},async inspectVideo(id){return videos.get(id);},playbackUrl:id=>'https://player.mediadelivery.net/embed/780138/'+id+'?token=signed',thumbnailUrl:id=>'https://vz-3374d7e5-dd2.b-cdn.net/'+id+'/thumbnail.jpg?token=signed'};
 const app=createSocialApp({dataDir:dir,ownerEmail:'owner@kv.test',ownerPassword:'owner-password-123',inviteCode:'invite-code-2026',production:false,videoProvider:enabled?provider:null,now:()=>clock});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();server.close();rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,method='GET',body,session={}){
  const r=await fetch(base+'/api'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(session.cookie?{Cookie:session.cookie}:{}),...(session.csrf?{'X-CSRF-Token':session.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();if(r.headers.get('set-cookie'))session.cookie=r.headers.get('set-cookie').split(';')[0];if(data.csrf)session.csrf=data.csrf;
  return {status:r.status,data,headers:r.headers};
 }
 async function member(email){const s={};const r=await request('/register','POST',{name:'Video Member',email,password:'member-password-123',inviteCode:'invite-code-2026',communityAgreement:true},s);assert.equal(r.status,201);s.user=r.data.user;return s;}
 const a=await member('a@kv.test'),b=await member('b@kv.test'),owner={};await request('/login','POST',{email:'owner@kv.test',password:'owner-password-123'},owner);
 return{base,request,a,b,owner,videos,advance:ms=>clock+=ms};
}
const uploadBody={size:1024,type:'video/mp4'};
const postBody=videoId=>({text:'A video for our community '+videoId,topic:'Music',theme:'none',videoId});
test('video upload endpoints enforce auth, csrf, ownership and ready duration',async t=>{
 const r=await runtime(t);
 assert.equal((await r.request('/videos','POST',uploadBody)).status,401);
 assert.equal((await r.request('/videos','POST',uploadBody,{cookie:r.a.cookie})).status,403);
 let response=await r.request('/videos','POST',uploadBody,r.a);assert.equal(response.status,201);
 const id=response.data.videoId;
 assert.equal((await r.request('/videos/'+id,'GET',undefined,r.b)).status,404);
 assert.equal((await r.request('/posts','POST',postBody(id),r.b)).status,404);
 for(const duration of [29,61]){r.videos.get(id).duration=duration;assert.equal((await r.request('/posts','POST',postBody(id),r.a)).status,400);}
 r.videos.get(id).duration=30;r.videos.get(id).ready=false;
 assert.equal((await r.request('/posts','POST',postBody(id),r.a)).status,409);
 r.videos.get(id).ready=true;
 assert.equal((await r.request('/posts','POST',{...postBody(id),photoData:'photo'},r.a)).status,400);
 response=await r.request('/posts','POST',postBody(id),r.a);assert.equal(response.status,201);assert.equal(response.data.post.videoId,id);
 assert.equal((await r.request('/posts','POST',{...postBody(id),text:'Duplicate attachment'},r.a)).status,409);
 const next=await r.request('/videos','POST',uploadBody,r.a);r.videos.get(next.data.videoId).duration=60;
 assert.equal((await r.request('/posts','POST',postBody(next.data.videoId),r.a)).status,201);
});
test('video playback follows moderation, blocks and suspension, and approval waits for upload expiry',async t=>{
 const r=await runtime(t);const id=(await r.request('/videos','POST',uploadBody,r.a)).data.videoId;
 const p=(await r.request('/posts','POST',postBody(id),r.a)).data.post;
 const playback=()=>r.request('/videos/'+id+'/playback','GET',undefined,r.b);
 assert.equal((await playback()).status,404);
 assert.equal((await r.request('/videos/'+id+'/playback')).status,401);
 assert.equal((await r.request('/videos/'+id+'/playback','GET',undefined,r.owner)).status,409);
 const review=(action,version)=>r.request('/posts/'+p.id+'/review','POST',{action,reason:'Reviewed video content carefully.',version},r.owner);
 assert.equal((await review('approve',1)).status,409);r.advance(631000);
 r.videos.get(id).ready=false;assert.equal((await review('approve',1)).status,409);r.videos.get(id).ready=true;
 assert.equal((await review('approve',1)).status,409);
 assert.equal((await r.request('/videos/'+id+'/playback','GET',undefined,r.owner)).status,200);
 r.videos.get(id).originalHash='b'.repeat(64);
 assert.equal((await review('approve',1)).status,409);
 assert.equal((await r.request('/videos/'+id+'/playback','GET',undefined,r.owner)).status,200);
 assert.equal((await review('approve',1)).status,200);
 let response=await playback();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 await r.request('/blocks','POST',{authorId:r.a.user.id,blocked:true},r.b);assert.equal((await playback()).status,404);
 await r.request('/blocks','POST',{authorId:r.a.user.id,blocked:false},r.b);
 await r.request('/users/'+r.a.user.id+'/suspend','POST',{suspended:true,reason:'Reviewing account activity.'},r.owner);
 assert.equal((await playback()).status,404);assert.equal((await r.request('/videos','POST',uploadBody,r.a)).status,403);
 await r.request('/users/'+r.a.user.id+'/suspend','POST',{suspended:false,reason:'Account review completed.'},r.owner);
 assert.equal((await review('hide',2)).status,200);assert.equal((await playback()).status,404);
});
test('missing video configuration leaves text posts functional',async t=>{
 const r=await runtime(t,{enabled:false});assert.equal((await r.request('/videos','POST',uploadBody,r.a)).status,503);
 assert.equal((await r.request('/posts','POST',{text:'Text still works.',topic:'Music'},r.a)).status,201);
});

test('upload gateway binds bytes to declared size without exposing provider authority',async t=>{
 const r=await runtime(t),grant=(await r.request('/videos','POST',{size:4,type:'video/mp4'},r.a)).data;
 assert.equal(grant.signature,undefined);
 assert.equal(grant.uploadUrl,'/api/videos/'+grant.videoId+'/upload');
 const path=grant.uploadUrl.replace('/api','');
 const raw=async(session,offset,bytes)=>fetch(r.base+'/api'+path,{method:'PATCH',headers:{Origin:r.base,Cookie:session.cookie,'X-CSRF-Token':session.csrf,'Content-Type':'application/offset+octet-stream','Tus-Resumable':'1.0.0','Upload-Offset':String(offset)},body:bytes});
 assert.equal((await raw(r.b,0,'abcd')).status,404);
 assert.equal((await raw({...r.a,csrf:'bad'},0,'abcd')).status,403);
 assert.equal((await raw(r.a,0,'abcde')).status,413);
 const first=await raw(r.a,0,'ab');assert.equal(first.status,204);assert.equal(first.headers.get('upload-offset'),'2');
 assert.equal((await raw(r.a,0,'ab')).status,409);
 const head=await fetch(r.base+'/api'+path,{method:'HEAD',headers:{Cookie:r.a.cookie}});assert.equal(head.status,200);assert.equal(head.headers.get('upload-offset'),'2');assert.equal(head.headers.get('upload-length'),'4');
 assert.equal((await raw(r.a,2,'cd')).status,204);
 assert.equal((await raw(r.a,4,'e')).status,413);
 r.advance(601000);assert.equal((await raw(r.a,0,'a')).status,410);
});
test('provider TUS sessions fix upload length and reject untrusted upload hosts',async()=>{
 const {createVideoProvider}=await import('../social-app/video.js');
 const uploadUrl='https://video.bunnycdn.com/tusupload/opaque';let offset=0;
 const p=createVideoProvider({...config,fetchImpl:async(url,opts)=>{
  if(url.endsWith('/videos'))return Response.json({guid:id});
  if(opts.method==='POST'){assert.equal(opts.headers['Upload-Length'],'4');return new Response(null,{status:201,headers:{Location:uploadUrl}});}
  assert.equal(url,uploadUrl);assert.equal(opts.headers.VideoId,id);
  if(opts.method==='PATCH')offset+=opts.body.length;
  return new Response(null,{status:opts.method==='PATCH'?204:200,headers:{'Upload-Offset':String(offset),'Upload-Length':'4'}});
 }});
 const grant=await p.createUpload(),v=await p.startUpload(grant,4,'video/mp4');
 assert.equal((await p.uploadStatus(v)).size,4);assert.equal(await p.uploadChunk(v,0,Buffer.from('abcd')),4);
 await assert.rejects(p.uploadStatus({...v,uploadUrl:'https://evil.example/tusupload/opaque'}));
 const bad=createVideoProvider({...config,fetchImpl:async()=>new Response(null,{status:201,headers:{Location:'https://evil.example'}})});
 await assert.rejects(bad.startUpload(grant,4,'video/mp4'));
});
