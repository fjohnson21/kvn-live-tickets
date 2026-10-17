import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialApp} from '../social-app/app.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
test('house rules require explicit current acceptance before posting and persist across login',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'kv-rules-'));
 const server=createSocialApp({dataDir:dir,ownerEmail:'owner@kv.test',ownerPassword:'owner-password-123',inviteCode:'invite-code-2026',production:false}).listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();server.close();rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 async function req(path,body,token=csrf){const r=await fetch(base+'/api'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':token},body:JSON.stringify(body)});const data=await r.json();if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;return{status:r.status,data};}
 const credentials={email:'owner@kv.test',password:'owner-password-123'};
 await req('/login',credentials);
 const post={text:'My story is still unfolding. Please pray for me.',topic:'Testimonies',theme:'none'};
 assert.equal((await req('/posts',post)).status,403);
 assert.equal((await req('/house-rules/accept',{version:'2026-10-16',accepted:true},'wrong')).status,403);
 assert.equal((await req('/house-rules/accept',{version:'old',accepted:true})).status,400);
 assert.equal((await req('/house-rules/accept',{version:'2026-10-16',accepted:false})).status,400);
 const accepted=await req('/house-rules/accept',{version:'2026-10-16',accepted:true});assert.equal(accepted.status,200);assert.equal(accepted.data.user.houseRulesVersion,'2026-10-16');assert.ok(accepted.data.user.houseRulesAcceptedAt);
 assert.equal((await req('/posts',post)).status,201);
 await req('/logout',{});const login=await req('/login',credentials);assert.equal(login.data.user.houseRulesVersion,'2026-10-16');assert.equal(login.data.user.houseRulesAcceptedAt,accepted.data.user.houseRulesAcceptedAt);
});
