import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt);
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const normalize=value=>String(value||'').trim().toLowerCase();
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
const dummy={salt:'00000000000000000000000000000000',hash:'0'.repeat(128)};
let hashing=false;
async function derive(password,salt){
 if(hashing)fail('Sign-in is busy. Please try again in a moment.',429);
 hashing=true;
 try{return await scrypt(String(password),salt,64,{N:131072,r:8,p:1,maxmem:160*1024*1024});}finally{hashing=false;}
}
async function verify(password,record){const hash=await derive(password,record.salt);return crypto.timingSafeEqual(hash,Buffer.from(record.hash,'hex'));}
function checkPassword(password){if(typeof password!=='string'||password.length<15||password.length>128)fail('Use a password between 15 and 128 characters.');}
export function createMemberAuth({dataDir,readStore,now=()=>Date.now()}){
 const file=path.join(dataDir,'member-auth.json');fs.mkdirSync(dataDir,{recursive:true});
 function read(){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {accounts:[],sessions:[],resets:[],attempts:{}};throw e;}}
 function write(data){data.sessions=data.sessions.filter(x=>x.expiresAt>now());data.resets=data.resets.filter(x=>x.expiresAt>now());for(const [key,value] of Object.entries(data.attempts))if(value.until<=now())delete data.attempts[key];const tmp=`${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;try{fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
 function memberByEmail(email){const rows=(readStore().disciples||[]).filter(d=>normalize(d.email)===normalize(email));return rows.length===1&&rows[0].status==='active'?rows[0]:null;}
 function accountMember(account){const d=account&&memberByEmail(account.email);return d&&d.id===account.discipleId?d:null;}
 function throttle(key,limit=8,windowMs=15*60*1000){const data=read(),k=digest(key);for(const [entry,value] of Object.entries(data.attempts))if(value.until<=now())delete data.attempts[entry];if(Object.keys(data.attempts).length>=10000&&!data.attempts[k])fail('Sign-in is busy. Please try again later.',429);const prior=data.attempts[k];if(prior?.until>now()&&prior.count>=limit)fail('Too many attempts. Please try again later.',429);data.attempts[k]={count:prior?.until>now()?prior.count+1:1,until:prior?.until>now()?prior.until:now()+windowMs};write(data);}
 function clearThrottle(key){const data=read();delete data.attempts[digest(key)];write(data);}
 function issueReset(email){const member=memberByEmail(email);if(!member)return null;const data=read(),token=crypto.randomBytes(32).toString('hex');data.resets=data.resets.filter(x=>x.discipleId!==member.id);data.resets.push({hash:digest(token),discipleId:member.id,email:normalize(email),expiresAt:now()+15*60*1000});write(data);return {token,email:normalize(email)};}
 async function completeReset({token,username,password}){
  checkPassword(password);if(!/^[a-f0-9]{64}$/.test(token||''))fail('This setup link is invalid or expired.');
  const snapshot=read(),reset=snapshot.resets.find(x=>x.hash===digest(token)&&x.expiresAt>now()),member=reset&&memberByEmail(reset.email);if(!member||member.id!==reset.discipleId)fail('This setup link is invalid or expired.');
  const existing=snapshot.accounts.find(x=>x.discipleId===member.id),name=existing?.username||normalize(username);
  if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(name)||['admin','owner','support','system'].includes(name))fail('Choose a username of 3–40 letters, numbers, dots, dashes or underscores.');
  if(snapshot.accounts.some(x=>x.username===name&&x.discipleId!==member.id))fail('That username is unavailable.');
  const salt=crypto.randomBytes(16).toString('hex'),hash=(await derive(password,salt)).toString('hex');
  // Re-read after hashing to avoid overwriting concurrent logins or consuming a replaced token.
  const data=read();if(!data.resets.some(x=>x.hash===digest(token)&&x.expiresAt>now())||memberByEmail(reset.email)?.id!==member.id)fail('This setup link is invalid or expired.');
  if(data.accounts.some(x=>x.username===name&&x.discipleId!==member.id))fail('That username is unavailable.');
  let account=data.accounts.find(x=>x.discipleId===member.id);if(!account){account={id:crypto.randomUUID(),discipleId:member.id,createdAt:new Date(now()).toISOString()};data.accounts.push(account);}
  Object.assign(account,{username:name,email:reset.email,password:{algorithm:'scrypt',N:131072,r:8,p:1,salt,hash},version:(account.version||0)+1,updatedAt:new Date(now()).toISOString()});
  data.resets=data.resets.filter(x=>x.discipleId!==member.id);data.sessions=data.sessions.filter(x=>x.accountId!==account.id);write(data);return {username:name};
 }
 async function login(identifier,password){
  const key=normalize(identifier);if(!key||key.length>254||typeof password!=='string'||password.length>128)fail('Username or password is incorrect.',401);
  throttle(`login:${key}`);const data=read(),account=data.accounts.find(x=>x.username===key||x.email===key);const ok=await verify(password,account?.password||dummy);
  if(!ok||!accountMember(account))fail('Username or password is incorrect.',401);
  const latest=read(),current=latest.accounts.find(x=>x.id===account.id);if(current?.version!==account.version||!accountMember(current))fail('Please sign in again.',401);
  const token=crypto.randomBytes(32).toString('hex');latest.sessions=latest.sessions.filter(x=>x.accountId!==account.id||x.expiresAt>now()).filter(x=>x.accountId!==account.id||latest.sessions.filter(s=>s.accountId===account.id).slice(-4).includes(x));latest.sessions.push({hash:digest(token),accountId:account.id,version:account.version,expiresAt:now()+12*60*60*1000});current.lastLoginAt=new Date(now()).toISOString();write(latest);clearThrottle(`login:${key}`);return {token};
 }
 function authenticate(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;const data=read(),session=data.sessions.find(x=>x.hash===digest(token)&&x.expiresAt>now()),account=session&&data.accounts.find(x=>x.id===session.accountId&&x.version===session.version),disciple=accountMember(account);return disciple?{account,disciple}:null;}
 function logout(token){const data=read();data.sessions=data.sessions.filter(x=>x.hash!==digest(token));write(data);}
 async function changePassword(token,currentPassword,password){checkPassword(password);const identity=authenticate(token);if(!identity)fail('Sign in required.',401);throttle(`change:${identity.account.id}`,5);if(typeof currentPassword!=='string'||currentPassword.length>128||!await verify(currentPassword,identity.account.password))fail('Current password is incorrect.',400);const salt=crypto.randomBytes(16).toString('hex'),hash=(await derive(password,salt)).toString('hex');const data=read(),account=data.accounts.find(x=>x.id===identity.account.id);if(!authenticate(token)||account.version!==identity.account.version)fail('Sign in required.',401);account.password={algorithm:'scrypt',N:131072,r:8,p:1,salt,hash};account.version++;account.updatedAt=new Date(now()).toISOString();data.sessions=data.sessions.filter(x=>x.accountId!==account.id);data.resets=data.resets.filter(x=>x.discipleId!==account.discipleId);write(data);}
 function publicAccount(identity){return {username:identity.account.username,email:identity.account.email,name:identity.disciple.name,lastLoginAt:identity.account.lastLoginAt||null};}
 return {issueReset,completeReset,login,authenticate,logout,changePassword,publicAccount,throttle};
}
