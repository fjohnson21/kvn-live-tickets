import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const html=fs.readFileSync('public/checkin.html','utf8');
const script=fs.readFileSync('public/checkin.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,10));
function setup(t){
 const dom=new JSDOM(html,{url:'https://checkin.example.test',runScripts:'outside-only',pretendToBeVisual:true});
 t.after(()=>dom.window.close());const w=dom.window;
 w.HTMLMediaElement.prototype.play=async()=>{};w.HTMLMediaElement.prototype.pause=()=>{};
 w.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code']}async detect(){return []}};
 w.fetch=async()=>({ok:true,status:200,json:async()=>({ticket:{ticketName:'General',code:'KVN-TEST'},event:{title:'Test'},buyerName:'Guest'})});
 w.eval(script);return w;
}
function submit(w){w.document.getElementById('code').value='KVN-TEST';w.document.getElementById('form').dispatchEvent(new w.Event('submit',{cancelable:true}));}
test('check-in success renders every server field as text',async t=>{
 const w=setup(t),payload='<img src=x onerror="window.pwned=1">';
 w.fetch=async()=>({ok:true,status:200,json:async()=>({ticket:{ticketName:payload,code:'KVN-TEST'},buyerName:payload,event:{title:payload}})});
 submit(w);await tick();const result=w.document.getElementById('result');assert.equal(result.querySelectorAll('img').length,0);assert.match(result.textContent,/CHECKED IN/);assert.ok(result.textContent.includes(payload));
});
test('duplicate and permission errors render untrusted fields as text',async t=>{
 const w=setup(t),payload='<svg onload="window.pwned=1">';
 for(const status of [409,403]){
  w.fetch=async()=>({ok:false,status,json:async()=>({error:payload,ticket:{code:payload}})});submit(w);await tick();
  assert.equal(w.document.getElementById('result').querySelectorAll('svg').length,0);assert.ok(w.document.getElementById('result').textContent.includes(payload));
 }
});
test('Stop releases a stream that arrives after permission was requested',async t=>{
 const w=setup(t);let resolve,stopped=0;
 w.navigator.mediaDevices={getUserMedia:()=>new Promise(r=>resolve=r)};
 w.document.getElementById('startCamera').click();await tick();w.document.getElementById('stopCamera').click();
 resolve({getTracks:()=>[{stop:()=>stopped++}]});await tick();assert.equal(stopped,1);assert.equal(w.document.getElementById('video').srcObject,null);
});
test('failed video playback releases camera tracks',async t=>{
 const w=setup(t);let stopped=0;w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})};
 w.HTMLMediaElement.prototype.play=async()=>{throw Error('Playback failed')};w.document.getElementById('startCamera').click();await tick();assert.equal(stopped,1);
});
test('pagehide shuts down the camera',async t=>{
 const w=setup(t);let stopped=0;w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})};
 w.document.getElementById('startCamera').click();await tick();w.dispatchEvent(new w.Event('pagehide'));assert.equal(stopped,1);
});
test('manual admission overlapping native detection does not swallow the camera ticket',async t=>{
 const w=setup(t);let detect,respond;const sent=[];
 w.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code']}detect(){return new Promise(r=>detect=r)}};
 w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
 w.fetch=async(url,opt)=>{sent.push(JSON.parse(opt.body).code);return new Promise(r=>respond=()=>r({ok:true,status:200,json:async()=>({ticket:{code:sent.at(-1),ticketName:'Test'},event:{title:'Test'}})}))};
 w.document.getElementById('startCamera').click();await tick();submit(w);
 detect([{rawValue:'KVN-CAMERA'}]);await tick();respond();await tick();
 await new Promise(r=>setTimeout(r,180));detect([{rawValue:'KVN-CAMERA'}]);await tick();
 assert.deepEqual(sent,['KVN-TEST','KVN-CAMERA']);respond();await tick();w.document.getElementById('stopCamera').click();
});
test('JSON server failure retains scanned code for manual retry',async t=>{
 const w=setup(t);w.BarcodeDetector=class{async detect(){return [{rawValue:'KVN-SERVER'}]}};
 w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
 w.fetch=async()=>({ok:false,status:503,json:async()=>({error:'Temporarily unavailable'})});
 w.document.getElementById('startCamera').click();await tick();assert.equal(w.document.getElementById('code').value,'KVN-SERVER');assert.equal(w.document.getElementById('video').srcObject,null);
});
test('visibility change shuts down the camera',async t=>{
 const w=setup(t);let stopped=0;w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})};
 w.document.getElementById('startCamera').click();await tick();Object.defineProperty(w.document,'hidden',{value:true});w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(stopped,1);
});
test('Stop during pending playback cannot revive old scan after restart',async t=>{
 const w=setup(t);let resolve,stopped=0,plays=0;
 w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})};
 w.HTMLMediaElement.prototype.play=()=>++plays===1?new Promise(r=>resolve=r):Promise.resolve();
 w.document.getElementById('startCamera').click();await tick();w.document.getElementById('stopCamera').click();w.document.getElementById('startCamera').click();await tick();resolve();await tick();assert.equal(stopped,1);assert.match(w.document.getElementById('cameraStatus').textContent,/Camera active/);w.document.getElementById('stopCamera').click();assert.equal(stopped,2);
});
test('request timeout reports ambiguous admission and preserves manual retry',async t=>{
 const w=setup(t);let timeout;
 const original=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>ms===15000?(timeout=fn,0):original(fn,ms,...args);
 w.fetch=(url,opt)=>new Promise((resolve,reject)=>opt.signal.addEventListener('abort',()=>reject(new Error('Aborted'))));
 submit(w);timeout();await tick();assert.match(w.document.getElementById('result').textContent,/Unable to confirm/);assert.equal(w.document.getElementById('code').value,'KVN-TEST');assert.equal(w.document.querySelector('#form button').disabled,false);
});
test('a stale native detection failure cannot change stopped camera status',async t=>{
 const w=setup(t);let reject;
 w.BarcodeDetector=class{detect(){return new Promise((resolve,r)=>reject=r)}};
 w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
 w.document.getElementById('startCamera').click();await tick();w.document.getElementById('stopCamera').click();reject(Error('stale detector'));await tick();assert.equal(w.document.getElementById('cameraStatus').textContent,'Camera stopped.');
});

test('failed camera check-in accepts the same QR after the removal cooldown',async t=>{
 const w=setup(t);let visible=true,attempts=0,now=10000;
 w.Date.now=()=>now;
 w.BarcodeDetector=class{async detect(){return visible?[{rawValue:'KVN-TEST'}]:[]}};
 w.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
 w.fetch=async()=>++attempts===1?{ok:false,status:404,json:async()=>({error:'Ticket not found'})}:{ok:true,status:200,json:async()=>({ticket:{code:'KVN-TEST',ticketName:'Synthetic'},event:{title:'Test'}})};
 w.document.getElementById('startCamera').click();await tick();
 assert.match(w.document.getElementById('result').textContent,/Ticket not found/);
 await new Promise(r=>setTimeout(r,350));assert.equal(attempts,1);
 visible=false;now+=1300;await new Promise(r=>setTimeout(r,180));visible=true;
 await new Promise(r=>setTimeout(r,180));assert.equal(attempts,2);assert.match(w.document.getElementById('result').textContent,/CHECKED IN/);
});
for(const kind of ['network','invalid-json','null','wrong-ticket'])test(`${kind} cannot confirm admission and allows manual retry`,async t=>{
 const w=setup(t);
 w.fetch=async()=>{if(kind==='network')throw Error('offline');return {ok:true,status:200,json:async()=>{if(kind==='invalid-json')throw Error('invalid JSON');return kind==='null'?null:{ticket:{code:'WRONG'},event:{title:'Test'}}}}};
 submit(w);await tick();assert.doesNotMatch(w.document.getElementById('result').textContent,/CHECKED IN/);assert.equal(w.document.querySelector('#form button').disabled,false);
 w.fetch=async()=>({ok:true,status:200,json:async()=>({ticket:{code:'KVN-TEST',ticketName:'Synthetic'},event:{title:'Test'}})});
 submit(w);await tick();assert.match(w.document.getElementById('result').textContent,/CHECKED IN/);
});
test('expired session with a non-JSON response shows a sign-in action',async t=>{
 const w=setup(t);w.fetch=async()=>({ok:false,status:401,json:async()=>{throw Error('HTML login response')}});
 submit(w);await tick();assert.equal(w.document.querySelector('#result a')?.getAttribute('href'),'/dashboard.html');assert.doesNotMatch(w.document.getElementById('result').textContent,/CHECKED IN/);
});
