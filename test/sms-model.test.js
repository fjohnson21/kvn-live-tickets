import test from 'node:test';import assert from 'node:assert/strict';import {ensureSms,smsEncoding,smsConnectionStatus} from '../lib/sms-model.js';
test('SMS initialization preserves business records and is idempotent',()=>{const s={orders:[{id:'paid'}]};ensureSms(s);s.sms.drafts.push({id:'draft'});ensureSms(s);assert.equal(s.orders[0].id,'paid');assert.equal(s.sms.drafts.length,1);});
test('encoding estimates GSM extensions and Unicode multipart boundaries',()=>{for(const [text,encoding,units,segments] of [['a'.repeat(160),'GSM-7',160,1],['a'.repeat(161),'GSM-7',161,2],['^'.repeat(81),'GSM-7',162,2],['漢'.repeat(70),'UCS-2',70,1],['漢'.repeat(71),'UCS-2',71,2],['😀'.repeat(36),'UCS-2',72,2]])assert.deepEqual(smsEncoding(text),{encoding,units,segments});assert.throws(()=>smsEncoding(' '),/message/i);assert.throws(()=>smsEncoding('a'.repeat(1531)),/10/);});
test('missing configuration stays disabled and never discloses secrets',()=>{const d=smsConnectionStatus({TWILIO_AUTH_TOKEN:'private-token',TWILIO_SMS_SENDING_ENABLED:'true'});assert.equal(d.configured,false);assert.equal(d.sendingEnabled,false);assert.ok(!JSON.stringify(d).includes('private-token'));});
test('multipart packing preserves two-unit characters and sender-specific capacities',()=>{
 assert.equal(smsEncoding('^'.repeat(153)).segments,3);
 assert.equal(smsEncoding('😀'.repeat(67)).segments,3);
 assert.equal(smsEncoding('a'.repeat(305),{sender:'+18005551212'}).segments,3);
 assert.equal(smsEncoding('漢'.repeat(133),{sender:'+18005551212'}).segments,3);
 assert.throws(()=>smsEncoding('^'.repeat(765)),/10/);
 assert.throws(()=>smsEncoding('😀'.repeat(335)),/10/);
});
