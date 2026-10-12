import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,firefox,webkit} from 'playwright';
import QRCode from 'qrcode';
import {fixture} from './fixture.mjs';

const engines={chromium,firefox,webkit};
const selected=(process.env.CHECKIN_BROWSERS||'chromium,firefox,webkit').split(',');
function mutate(f,fn){const file=f.dir+'/store.json',store=JSON.parse(fs.readFileSync(file));fn(store);fs.writeFileSync(file,JSON.stringify(store));}
function ticket(f,code){return JSON.parse(fs.readFileSync(f.dir+'/store.json')).orders.find(o=>o.id==='scan-order').tickets.find(t=>t.code===code)}
async function setup(t,engine,width=390){
 const f=await fixture({checkin:true});t.after(()=>f.close());
 const browser=await engines[engine].launch({timeout:15000});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true});
 const errors=[],external=[];await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==f.base){external.push(r.request().url());return r.abort()}return r.continue()});
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
 const auth=await context.request.post(f.base+'/api/auth/owner',{data:{email:'owner@example.test',password:'synthetic mobile password'}});assert.equal(auth.status(),200);
 // Auth remains real: the session user is changed only in the disposable store to exercise staff permissions.
 mutate(f,s=>Object.assign(s.users[0],{role:'staff',organizationId:'scan-org',permissions:['checkin']}));
 t.after(()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[])});
 return {f,page,context};
}
async function camera(page,mode='fallback'){
 const qr=await QRCode.toDataURL('https://tickets.example.test/checkin.html?ticket=KVN-CAMERA01',{width:400,margin:4});
 await page.addInitScript(({qr,mode})=>{
  // Only camera hardware is synthetic. The shipped canvas decoder receives actual QR pixels.
  const source=new Image();source.src=qr;
  window.cameraTest={stops:0,opens:0,blank:false,mode};
  const state=window.cameraTest;
  const originalDraw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof HTMLVideoElement){if(state.blank){this.fillStyle='white';this.fillRect(0,0,this.canvas.width,this.canvas.height);return}return originalDraw.call(this,source,...args)}return originalDraw.call(this,image,...args)};
  Object.defineProperties(HTMLVideoElement.prototype,{videoWidth:{get:()=>400},videoHeight:{get:()=>400},readyState:{get:()=>4},srcObject:{get(){return this._stream||null},set(v){this._stream=v}}});
  HTMLMediaElement.prototype.play=async function(){await source.decode();if(state.mode==='play-error')throw Error('Playback failed')};
  HTMLMediaElement.prototype.pause=function(){};
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{
   state.opens++;
   if(state.mode==='denied')throw new DOMException('Permission denied','NotAllowedError');
   if(state.mode==='pending')await new Promise(r=>state.resolve=r);
   const track=new EventTarget();track.stop=()=>state.stops++;state.track=track;
   return {getTracks:()=>[track]};
  }}});
  delete window.BarcodeDetector;
  if(['native','unsupported','broken-native'].includes(mode))window.BarcodeDetector=class{
   static async getSupportedFormats(){return mode==='unsupported'?['code_128']:['qr_code']}
   async detect(){if(mode==='broken-native')throw Error('Decoder unavailable');return state.blank?[]:[{rawValue:'KVN-NATIVE03'}]}
  };
 },{qr,mode});
}
async function manual(page,code){await page.locator('#code').fill(code);await page.locator('#form button').click()}
async function result(page,text){await page.locator('#result').filter({hasText:text}).waitFor()}

for(const engine of selected){
 for(const width of [320,390])test(`${engine}: real fallback QR, staff admission, duplicate and safe phone result at ${width}px`,async t=>{
  const {f,page}=await setup(t,engine,width);await camera(page);await page.goto(f.base+'/checkin.html');
  let posts=0;page.on('request',r=>{if(r.url().endsWith('/api/checkin'))posts++});
  await page.locator('#startCamera').click();await result(page,'CHECKED IN');assert.equal(ticket(f,'KVN-CAMERA01').checkedIn,true);const first=ticket(f,'KVN-CAMERA01').checkedInAt;
  assert.equal(await page.locator('#result img').count(),0);assert.equal(await page.evaluate(()=>window.checkinXss),undefined);
  assert.ok(await page.locator('#result').textContent().then(s=>s.includes('<img')));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page must fit phone');
  await page.waitForTimeout(2200);assert.equal(posts,1,'stationary QR must not repeatedly submit');
  await page.evaluate(()=>cameraTest.blank=true);await page.waitForTimeout(1500);await page.evaluate(()=>cameraTest.blank=false);
  await result(page,'Already checked in');assert.equal(posts,2);assert.equal(ticket(f,'KVN-CAMERA01').checkedInAt,first);
  await page.waitForTimeout(500);assert.equal(posts,2,'stationary duplicate must also remain latched');
  await page.locator('#stopCamera').click();assert.equal(await page.evaluate(()=>cameraTest.stops),1);
  await manual(page,'KVN-CAMERA01');await result(page,'Already checked in');assert.equal(ticket(f,'KVN-CAMERA01').checkedInAt,first);
  await manual(page,' kvn-manual02 ');await result(page,'CHECKED IN');assert.equal(ticket(f,'KVN-MANUAL02').checkedIn,true);
  await manual(page,'UNKNOWN');await result(page,'Ticket not found');
  mutate(f,s=>s.users[0].permissions=[]);await manual(page,'KVN-NATIVE03');await result(page,'Check-in permission required');assert.equal(ticket(f,'KVN-NATIVE03').checkedIn,false);
  mutate(f,s=>Object.assign(s.users[0],{permissions:['checkin'],organizationId:'wrong-org'}));await manual(page,'KVN-NATIVE03');await result(page,'another organizer');assert.equal(ticket(f,'KVN-NATIVE03').checkedIn,false);
  await page.context().clearCookies();await manual(page,'KVN-NATIVE03');await result(page,'Sign in');assert.equal(ticket(f,'KVN-NATIVE03').checkedIn,false);
 });
 test(`${engine}: native selection, unsupported format and native failure fallback`,async t=>{
  const {f,page}=await setup(t,engine);
  for(const mode of ['native','unsupported','broken-native']){
   const p=await page.context().newPage();await camera(p,mode);await p.goto(f.base+'/checkin.html');
   await p.locator('#startCamera').click();await result(p,mode==='broken-native'?'Already checked in':'CHECKED IN');
   assert.equal(ticket(f,mode==='native'?'KVN-NATIVE03':'KVN-CAMERA01').checkedIn,true);
   await p.locator('#stopCamera').click();assert.equal(await p.evaluate(()=>cameraTest.stops),1);await p.close();
  }
 });
 test(`${engine}: camera denial, playback failure, pending Stop, pagehide and track ended`,async t=>{
  const {f,page}=await setup(t,engine);
  for(const mode of ['denied','play-error','pending','fallback']){
   const p=await page.context().newPage();await camera(p,mode);await p.goto(f.base+'/checkin.html');await p.evaluate(()=>cameraTest.blank=true);
   await p.locator('#startCamera').click();
   if(mode==='denied'){await p.locator('#cameraStatus').filter({hasText:/permission/i}).waitFor();await manual(p,'KVN-MANUAL02');await result(p,'CHECKED IN')}
   if(mode==='play-error'){await p.waitForFunction(()=>cameraTest.stops===1)}
   if(mode==='pending'){await p.waitForFunction(()=>!!cameraTest.resolve);await p.locator('#stopCamera').click();await p.evaluate(()=>cameraTest.resolve());await p.waitForFunction(()=>cameraTest.stops===1);assert.equal(await p.locator('#video').evaluate(v=>v.srcObject),null)}
   if(mode==='fallback'){
    await p.locator('#cameraStatus').filter({hasText:/Camera active/}).waitFor();
    await p.evaluate(()=>document.getElementById('startCamera').click());assert.equal(await p.evaluate(()=>cameraTest.opens),1);
    await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await p.evaluate(()=>cameraTest.stops),1);
    await p.locator('#startCamera').click();await p.locator('#cameraStatus').filter({hasText:/Camera active/}).waitFor();await p.evaluate(()=>cameraTest.track.dispatchEvent(new Event('ended')));await p.waitForFunction(()=>cameraTest.stops===2);
   }
   await p.close();
  }
 });
 test(`${engine}: network failure is explicit, stops scanning and permits manual retry`,async t=>{
  const {f,page}=await setup(t,engine);await camera(page);await page.goto(f.base+'/checkin.html');
  await page.route('**/api/checkin',r=>r.abort());await page.locator('#startCamera').click();await result(page,'Unable to confirm');assert.equal(ticket(f,'KVN-CAMERA01').checkedIn,false);assert.equal(await page.evaluate(()=>cameraTest.stops),1);
  await page.unroute('**/api/checkin');await manual(page,'KVN-CAMERA01');await result(page,'CHECKED IN');
 });
}
