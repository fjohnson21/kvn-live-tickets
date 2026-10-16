import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
test('SMS dispatcher lets the server terminate on SIGTERM',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-sms-shutdown-')),child=spawn(process.execPath,[path.resolve('server.js')],{cwd:dir,env:{PATH:process.env.PATH,DATA_DIR:dir,UPLOAD_DIR:path.join(dir,'uploads'),PORT:'0',BASE_URL:'http://localhost',OWNER_EMAIL:'owner@example.test'},stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timed out')),10000);child.stdout.on('data',d=>{if(String(d).includes('running at')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('early exit'));});});
 const stopped=new Promise(resolve=>child.once('exit',()=>resolve(true)));child.kill('SIGTERM');const timer={};const exited=await Promise.race([stopped,new Promise(resolve=>{timer.id=setTimeout(()=>resolve(false),2000);})]);clearTimeout(timer.id);assert.equal(exited,true,'SIGTERM must stop the HTTP server and exit');
 }finally{if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exited;}fs.rmSync(dir,{recursive:true,force:true});}
});
