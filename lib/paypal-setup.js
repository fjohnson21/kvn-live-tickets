import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {generateKeyPair,randomBytes,privateDecrypt,constants,createCipheriv,createDecipheriv} from 'node:crypto';
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
export function createPayPalSecretVault({dataDir,env=process.env,validate,now=()=>Date.now()}){
 const file=path.join(dataDir,'paypal-secret.enc'),challenges=new Map();let pair;
 const key=()=>{const value=Buffer.from(env.PAYPAL_SETUP_MASTER_KEY||'','base64');if(value.length!==32)fail('Encrypted setup is unavailable.',503);return value;};
 const aad=()=>Buffer.from('kvn-paypal-v1:'+env.PAYPAL_ENVIRONMENT+':'+env.PAYPAL_CLIENT_ID);
 const status=()=>({configured:Boolean(env.PAYPAL_CLIENT_SECRET),environment:env.PAYPAL_ENVIRONMENT||'not configured'});
 function load(){if(!fs.existsSync(file))return;const stored=JSON.parse(fs.readFileSync(file,'utf8'));if(stored.version!==1)fail('Invalid encrypted configuration.',503);const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(stored.iv,'base64'));decipher.setAAD(aad());decipher.setAuthTag(Buffer.from(stored.tag,'base64'));env.PAYPAL_CLIENT_SECRET=Buffer.concat([decipher.update(Buffer.from(stored.ciphertext,'base64')),decipher.final()]).toString('utf8');}
 async function challenge(session){key();if(!env.PAYPAL_CLIENT_ID||!['live','sandbox'].includes(env.PAYPAL_ENVIRONMENT))fail('PayPal account setup is unavailable.',503);for(const [id,c] of challenges)if(c.expiresAt<now())challenges.delete(id);if(challenges.size>100)fail('Please try again shortly.',429);pair??=promisify(generateKeyPair)('rsa',{modulusLength:4096});const keys=await pair,nonce=randomBytes(24).toString('hex');challenges.set(session,{nonce,expiresAt:now()+5*60*1000});return {publicKey:keys.publicKey.export({format:'jwk'}),nonce,...status()};}
 async function save(session,ciphertext){
  const challenge=challenges.get(session);challenges.delete(session);
  if(!challenge||challenge.expiresAt<now())fail('Setup session expired. Refresh and try again.');
  if(typeof ciphertext!=='string'||! /^[A-Za-z0-9+/=]{680,688}$/.test(ciphertext))fail('Invalid encrypted submission.');
  let payload;try{const keys=await pair;payload=JSON.parse(privateDecrypt({key:keys.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(ciphertext,'base64')).toString('utf8'));}catch{fail('Invalid encrypted submission.');}
  if(payload.nonce!==challenge.nonce||typeof payload.secret!=='string'||! /^[A-Za-z0-9_-]{10,256}$/.test(payload.secret))fail('Invalid encrypted submission.');
  let accepted=false;try{accepted=await validate(payload.secret);}catch{fail('Could not verify the PayPal connection. Please try again.',503);}
  if(!accepted)fail('PayPal did not accept this Secret with the configured Live Client ID. Check that both belong to the same app.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(aad());const encrypted=Buffer.concat([cipher.update(payload.secret,'utf8'),cipher.final()]);
  fs.mkdirSync(dataDir,{recursive:true});const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}),{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  env.PAYPAL_CLIENT_SECRET=payload.secret;payload.secret='';return status();
 }
 return {load,challenge,save,status};
}
export function registerPayPalSetup(app,{auth,owner,dataDir,env=process.env,fetchImpl=fetch}){
 const vault=createPayPalSecretVault({dataDir,env,validate:async secret=>{
  const base=env.PAYPAL_ENVIRONMENT==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
  const response=await fetchImpl(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.PAYPAL_CLIENT_ID+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(10000)});
  return response.ok&&Boolean((await response.json()).access_token);
 }});
 try{vault.load();}catch{delete env.PAYPAL_CLIENT_SECRET;console.error('PayPal encrypted configuration could not be loaded; PayPal checkout remains unavailable.');}
 const secure=(req,res,next)=>{res.set({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'});next();};
 const wrap=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(error){res.status(error.statusCode||503).json({error:error.statusCode?error.message:'Encrypted setup is unavailable. Please try again.'});}};
 app.get('/api/paypal-setup/key',secure,auth,owner,wrap(req=>vault.challenge(req.sessionToken)));
 app.get('/api/paypal-setup/status',secure,auth,owner,wrap(()=>vault.status()));
 app.post('/api/paypal-setup/secret',secure,auth,owner,(req,res,next)=>{if(!['https://kvnlive.com','https://www.kvnlive.com'].includes(req.get('origin'))||req.get('sec-fetch-site')==='cross-site'||!req.is('application/json'))return res.status(403).json({error:'Use the signed-in KV Live setup page.'});if(!req.body||Object.keys(req.body).some(k=>k!=='ciphertext'))return res.status(400).json({error:'Only encrypted submissions are accepted.'});next();},wrap(req=>vault.save(req.sessionToken,req.body.ciphertext)));
 return vault;
}
