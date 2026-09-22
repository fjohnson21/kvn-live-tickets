import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiscipleApplication } from '../lib/disciple-application.js';
import { DISCIPLE_AGREEMENT_TEXT, DISCIPLE_AGREEMENT_VERSION, agreementHash } from '../lib/disciple-agreement.js';

const payload={legalFirstName:' Briannah ',legalLastName:' Cooper ',preferredName:'Briannah',email:'BRIANNAH@EXAMPLE.COM',mobile:'(919) 555-1212',address1:'1 Main St',city:'Sanford',state:'nc',postalCode:'27330',country:'United States',shirtSize:'XL',market:'RDU',affiliation:'Church',instagram:'@briannah',facebook:'',tiktok:'',youtube:'',otherSocial:'',audienceSize:1200,motivation:'Serve the movement',promotionPlan:'Weekly posts',referralSource:'Leader',additionalNotes:'Ready',weeklyPostCommitment:true,agreementAccepted:true,electronicRecordsConsent:true,recordsAccessConfirmed:true,typedLegalName:'Briannah Cooper',agreementVersion:'2.2',agreementHash:agreementHash(DISCIPLE_AGREEMENT_TEXT)};
const evidence={idempotencyKey:'idem-12345678',sourceSystem:'kvnlive-site',ip:'203.0.113.5',userAgent:'test-agent',acceptedAt:'2026-09-21T20:00:00.000Z'};

test('normalizes the complete v2.2 application and evidence',()=>{
  const record=normalizeDiscipleApplication(payload,evidence);
  assert.equal(record.email,'briannah@example.com');
  assert.equal(record.mobile,'+19195551212');
  assert.equal(record.state,'NC');
  assert.equal(record.instagram,'https://instagram.com/briannah');
  assert.equal(record.sourceSystem,'kvnlive-site');
  assert.equal(record.agreementVersion,'2.2');
});

test('rejects typed-name mismatch, absent commitments, old agreement and executable markup',()=>{
  assert.throws(()=>normalizeDiscipleApplication({...payload,typedLegalName:'Someone Else'},evidence),/legal name/i);
  assert.throws(()=>normalizeDiscipleApplication({...payload,agreementAccepted:false},evidence),/commitments/i);
  assert.throws(()=>normalizeDiscipleApplication({...payload,agreementVersion:'2.1'},evidence),/2\.2/);
  assert.throws(()=>normalizeDiscipleApplication({...payload,motivation:'<script>alert(1)</script>'},evidence),/markup/i);
});

test('Agreement v2.2 defines the approved sales and Leader terms',()=>{
  assert.equal(DISCIPLE_AGREEMENT_VERSION,'2.2');
  for(const phrase of [/10%/,/2% Community Bonus/,/30 days/,/15th/,/no minimum payout/i,/KVN Live tickets/i,/Kingdom Vibe merchandise/i,/Kingdom Market/i,/no purchase is required/i,/no compensation.*recruit/i,/licensed counsel/i]) assert.match(DISCIPLE_AGREEMENT_TEXT,phrase);
});
