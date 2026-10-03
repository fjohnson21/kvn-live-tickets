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
  const storePath=path.join(dataDir,'store.json');const store=JSON.parse(fs.readFileSync(storePath));store.disciples=[{id:'a',handle:'example',handleAliases:['previous'],code:'EXAMPLECODE',status:'active',email:'private@example.com'},{id:'b',handle:'inactive',code:'INACTIVE',status:'inactive'}];fs.writeFileSync(storePath,JSON.stringify(store));
  const port=34000+Math.floor(Math.random()*1000);
  const child=spawn(process.execPath,['server.js'],{cwd:projectRoot,env:{...process.env,PORT:String(port),BASE_URL:`http://127.0.0.1:${port}`,DATA_DIR:dataDir,STRIPE_SECRET_KEY:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server start timed out')),5000);child.stdout.on('data',chunk=>{if(String(chunk).includes('running at')){clearTimeout(timer);resolve();}});child.once('exit',code=>reject(new Error(`server exited ${code}`)));});
  return {baseUrl:`http://127.0.0.1:${port}`,stop(){child.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true});}};
}

test('active affiliate handles and aliases resolve without exposing private fields',async t=>{
 const server=await startServer();t.after(()=>server.stop());
 const r=await fetch(`${server.baseUrl}/api/affiliates/example`);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{handle:'example',code:'EXAMPLECODE'});
 const old=await fetch(`${server.baseUrl}/api/affiliates/previous`);assert.equal(old.status,200);
 const inactive=await fetch(`${server.baseUrl}/api/affiliates/inactive`);assert.equal(inactive.status,404);
 const redirect=await fetch(`${server.baseUrl}/affiliate/previous`,{redirect:'manual'});
 assert.equal(redirect.headers.get('location'),'https://kvnlive.com/affiliate/example');
 const code=await fetch(`${server.baseUrl}/api/affiliates?code=EXAMPLECODE`);assert.equal(code.status,200);
});
