import {test} from 'node:test';import assert from 'node:assert/strict';
import {affiliatePublicUrl} from '../lib/disciple-sync.js';
import {buildTicketConfirmation} from '../lib/email.js';
test('disciple links cannot inherit the engine host',()=>assert.equal(affiliatePublicUrl('kiana','https://kvn-live-tickets.onrender.com/affiliate'),'https://kvnlive.com/affiliate/kiana'));
test('ticket confirmation QR always uses the branded gateway',()=>{const result=buildTicketConfirmation({order:{tickets:[{code:'ABC',ticketName:'General'}]},event:{products:[]},baseUrl:'https://kvn-live-tickets.onrender.com'});assert.ok(!JSON.stringify(result).includes('onrender.com'));assert.match(result.text,/https:\/\/kvnlive.com\/api\/commerce\/qr\?code=ABC/);});
