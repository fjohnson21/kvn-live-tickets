import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot=new URL('../',import.meta.url);
async function startServer(){
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-shop-'));
  fs.copyFileSync(new URL('../data/store.json',import.meta.url),path.join(dataDir,'store.json'));
  const port=34000+Math.floor(Math.random()*1000);
  const child=spawn(process.execPath,['server.js'],{cwd:projectRoot,env:{...process.env,PORT:String(port),BASE_URL:`http://127.0.0.1:${port}`,DATA_DIR:dataDir,STRIPE_SECRET_KEY:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server start timed out')),5000);child.stdout.on('data',chunk=>{if(String(chunk).includes('running at')){clearTimeout(timer);resolve();}});child.once('exit',code=>reject(new Error(`server exited ${code}`)));});
  return {baseUrl:`http://127.0.0.1:${port}`,stop(){child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true});}};
}

test('public shop catalog and checkout validation are available',async t=>{
  const server=await startServer();t.after(()=>server.stop());
  const catalog=await fetch(`${server.baseUrl}/api/shop/catalog`);
  assert.equal(catalog.status,200);
  const body=await catalog.json();
  assert.equal(body.products[0].edition,'Numbered Collector’s Edition');
  const empty=await fetch(`${server.baseUrl}/api/shop/checkout`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cart:[],email:'buyer@example.com'})});
  assert.equal(empty.status,400);
  assert.match((await empty.json()).error,/empty/i);
});

test('live routes enforce Premier pricing and no apparel while rejecting sold-out bundles and shirts',async t=>{
 const server=await startServer();t.after(()=>server.stop());const post=(path,body)=>fetch(server.baseUrl+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const {event}=await (await fetch(server.baseUrl+'/api/events/kingdom-vibe-live-2026')).json();
 const premier=event.products.find(p=>p.id==='kv-kingdom-premier-2026'),old=event.products.find(p=>p.id==='kv-all-access-2026');assert.equal(premier.price,3999);assert.equal(old.available,0);assert.equal(old.salesClosed,true);
 const customer={name:'Test Buyer',email:'buyer@example.test',cellPhone:'9195550100',billingAddress:{line1:'1 Main St',city:'Sanford',state:'NC',postalCode:'27330',country:'US'},mailingSameAsBilling:true};
 const body=id=>({eventId:event.id,customer,cart:[{id,quantity:1,ticketSelections:[{apparelSelected:false,apparelSize:null}]}]});
 for(const [id,price] of [[premier.id,3999],['kv-general-admission-2026',1500]]){const r=await post('/api/create-checkout-session',body(id));assert.equal(r.status,503);assert.equal((await r.json()).preview.subtotal,price);}
 assert.equal((await post('/api/create-checkout-session',body(old.id))).status,409);
 const shirt=await post('/api/shop/checkout',{email:customer.email,cart:[{productId:'drop-001-collector-black',size:'M',quantity:1}]});assert.equal(shirt.status,409);assert.match((await shirt.json()).error,/sold out/i);
 const legacy=await (await fetch(server.baseUrl+'/event.js')).text();assert.match(legacy,/\['kv-kingdom-premier-2026','kv-all-access-2026','kv-general-admission-2026'\]/);
});
