import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {recordSmsConsent} from '../lib/sms-audiences.js';
import {createSmsCampaignService} from '../lib/sms-campaigns.js';
import {createSmsDispatcher} from '../lib/sms-dispatcher.js';
import {registerSmsRoutes} from '../lib/sms-routes.js';
import {registerSmsWebhooks} from '../lib/sms-webhooks.js';

test('owner draft to signed delivery and STOP reports one deduplicated attempt without touching email',async()=>{
 const env={TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'synthetic-key',TWILIO_AUTH_TOKEN:'synthetic-token',TWILIO_MESSAGING_SERVICE_SID:'MG'+'c'.repeat(32),TWILIO_SMS_PUBLIC_NUMBER:'+19195551212',TWILIO_SMS_SENDING_ENABLED:'true',TWILIO_SMS_SENDER_VERIFIED:'true',TWILIO_SMS_CALLBACKS_VERIFIED:'true'};
 let state={orders:[{id:'paid',status:'paid',buyerPhone:'9195551313'},{id:'paid-again',status:'paid',buyerPhone:'+19195551313'},{id:'unknown',status:'paid',buyerPhone:'9195551414'}],marketing:{campaigns:[{id:'email-preserved',status:'draft'}]}},sends=0;
 const email=structuredClone(state.marketing),phone='+19195551313',sid='SM'+'d'.repeat(32),time=Date.parse('2026-10-16T18:00:00Z');
 recordSmsConsent(state,{id:'grant',scopeId:'kvn',phone,purpose:'marketing',action:'grant',source:'fixture',evidence:'affirmative SMS signup',disclosureVersion:'sms-1',occurredAt:'2026-10-01T00:00:00Z'});
 const deps={env,readStore:()=>structuredClone(state),writeStore:s=>{state=s},now:()=>time,client:{sendMessage:async()=>{sends++;return {sid,status:'queued'};},readMessage:async()=>{throw Error('No real provider calls');}}};
 const campaignService=createSmsCampaignService(deps),dispatcher=createSmsDispatcher(deps),app=express();
 registerSmsWebhooks(app,{...deps,now:()=>new Date(time).toISOString()});app.use(express.json());
 registerSmsRoutes(app,{...deps,now:()=>new Date(time),campaignService,dispatcher,auth:(q,s,n)=>q.get('x-owner')?(q.user={id:'fixture-owner',role:'owner'},n()):s.sendStatus(401),owner:(q,s,n)=>n()});
 const server=app.listen(0),base='http://localhost:'+server.address().port;
 const post=async(path,body)=>{const r=await fetch(base+'/api/sms/'+path,{method:'POST',headers:{'x-owner':'true',origin:'https://kvnlive.com','content-type':'application/json'},body:JSON.stringify({...body,expectedRevision:state.sms.revision,requestId:crypto.randomUUID()})});assert.equal(r.status,200,await r.clone().text());return r.json();};
 const webhook=async(path,fields)=>{const signature=crypto.createHmac('sha1',env.TWILIO_AUTH_TOKEN).update('https://kvnlive.com'+path+Object.keys(fields).sort().map(k=>k+fields[k]).join('')).digest('base64');const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature},body:new URLSearchParams(fields)});assert.equal(r.status,200,await r.text());};
 try{
  await post('drafts',{text:'KVN: Details at https://kvnlive.com',segmentIds:['ticket-buyers']});assert.equal(sends,0);
  const p=await post('preview',{text:state.sms.drafts[0].text,segmentIds:['ticket-buyers']});assert.equal(p.eligible.length,1);assert.equal(p.excluded.length,1);
  const released=await post('release',{token:p.token,recipientCount:1});assert.equal(sends,0);await dispatcher.tick();assert.equal(sends,1);
  const attempt=state.sms.attempts[0];await webhook('/api/sms/twilio/status?attempt='+attempt.id,{AccountSid:env.TWILIO_ACCOUNT_SID,MessagingServiceSid:env.TWILIO_MESSAGING_SERVICE_SID,MessageSid:sid,MessageStatus:'delivered'});
  const query='?campaignId='+released.campaignId+'&status=delivered',headers={'x-owner':'true'},report=await(await fetch(base+'/api/sms/campaigns'+query,{headers})).json(),csv=await(await fetch(base+'/api/sms/campaigns.csv'+query,{headers})).text();assert.equal(report.totals.delivered,1);assert.equal(report.totals.total,1);assert.match(csv,new RegExp(sid));assert.equal(csv.split('\r\n').length,2);
  await webhook('/api/sms/twilio/inbound',{AccountSid:env.TWILIO_ACCOUNT_SID,MessagingServiceSid:env.TWILIO_MESSAGING_SERVICE_SID,MessageSid:'SM'+'e'.repeat(32),From:phone,To:env.TWILIO_SMS_PUBLIC_NUMBER,OptOutType:'STOP'});
  const next=await post('preview',{text:'Next KVN update',segmentIds:['ticket-buyers']});assert.equal(next.eligible.length,0);await dispatcher.tick();assert.equal(sends,1);assert.deepEqual(state.marketing,email);
 }finally{dispatcher.stop();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
