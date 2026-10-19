import crypto from 'node:crypto';
export const SMS_SCOPE='kvn';
export const smsError=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
export const smsHash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function ensureSms(store){store.sms??={schemaVersion:1,revision:0,scopeId:SMS_SCOPE,consentEvents:[],drafts:[],previews:[],campaigns:[],attempts:[],callbackEvents:[],audit:[],requests:[]};return store;}
const basic=new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const extension=new Set(Array.from('\f^{}\\[~]|€'));
export function smsEncoding(text,{sender}={}){
 if(typeof text!=='string'||!text.trim())throw smsError('Enter a message.');
 const characters=Array.from(text),gsm=characters.every(ch=>basic.has(ch)||extension.has(ch));
 const weights=characters.map(ch=>gsm?(extension.has(ch)?2:1):ch.length);
 const units=weights.reduce((sum,weight)=>sum+weight,0),single=gsm?160:70;
 const tollFree=/^\+1(?:800|833|844|855|866|877|888)\d{7}$/.test(sender||'');
 const capacity=gsm?(tollFree?152:153):(tollFree?66:67);
 let segments=1;
 if(units>single){let used=0;for(const weight of weights){if(used+weight>capacity){segments++;used=0;}used+=weight;}}
 if(segments>10)throw smsError('Messages must fit within 10 SMS segments.');
 return {encoding:gsm?'GSM-7':'UCS-2',units,segments};
}
export function smsConnectionStatus(env={}){if(env.SMS_PROVIDER==='txt180'){const checks=['TXT180_API_KEY','TXT180_ACCOUNT_ID','TXT180_SHORT_CODE','TXT180_KEYWORD'].map(key=>({key,ready:!!String(env[key]||'').trim()}));const configured=checks.every(c=>c.ready)&&/^\d+$/.test(env.TXT180_ACCOUNT_ID||'')&&/^\d{10}$/.test(env.TXT180_SHORT_CODE||'');return {provider:'txt180',configured,sendingEnabled:configured&&env.TXT180_SMS_SENDING_ENABLED==='true',checks,publicSender:configured?'+1'+env.TXT180_SHORT_CODE:null,accountId:env.TXT180_ACCOUNT_ID||null,keyword:env.TXT180_KEYWORD||null,senderVerified:configured,callbacksVerified:false};}const required=['TWILIO_ACCOUNT_SID','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_AUTH_TOKEN','TWILIO_MESSAGING_SERVICE_SID'];const checks=required.map(key=>({key,ready:Boolean(String(env[key]||'').trim())}));for(const key of ['TWILIO_SMS_SENDER_VERIFIED','TWILIO_SMS_CALLBACKS_VERIFIED'])checks.push({key,ready:env[key]==='true'});const configured=checks.slice(0,5).every(c=>c.ready),publicSender=/^\+1\d{10}$/.test(env.TWILIO_SMS_PUBLIC_NUMBER||'')?env.TWILIO_SMS_PUBLIC_NUMBER:null;return {configured,sendingEnabled:configured&&checks.every(c=>c.ready)&&!!publicSender&&env.TWILIO_SMS_SENDING_ENABLED==='true',checks,publicSender,senderVerified:env.TWILIO_SMS_SENDER_VERIFIED==='true',callbacksVerified:env.TWILIO_SMS_CALLBACKS_VERIFIED==='true'};}
export const smsSenderIdentity=env=>env.SMS_PROVIDER==='txt180'?{serviceSid:'txt180:'+env.TXT180_ACCOUNT_ID+':'+env.TXT180_KEYWORD,publicSender:'+1'+env.TXT180_SHORT_CODE}:{serviceSid:env.TWILIO_MESSAGING_SERVICE_SID,publicSender:env.TWILIO_SMS_PUBLIC_NUMBER};
export const smsSenderFingerprint=env=>env.SMS_PROVIDER==='txt180'?smsHash([env.SMS_PROVIDER,env.TXT180_API_KEY,env.TXT180_ACCOUNT_ID,env.TXT180_SHORT_CODE,env.TXT180_KEYWORD]):smsHash([env.TWILIO_ACCOUNT_SID,env.TWILIO_API_KEY_SID,env.TWILIO_API_KEY_SECRET,env.TWILIO_AUTH_TOKEN,env.TWILIO_MESSAGING_SERVICE_SID,env.TWILIO_SMS_PUBLIC_NUMBER,env.TWILIO_SMS_SENDER_VERIFIED,env.TWILIO_SMS_CALLBACKS_VERIFIED]);

export const txt180Scope=env=>[env.TXT180_ACCOUNT_ID,env.TXT180_KEYWORD,env.TXT180_SHORT_CODE].join(":");
