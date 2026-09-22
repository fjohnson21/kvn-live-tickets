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
