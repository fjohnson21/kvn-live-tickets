import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifiedReferralCode(row,secret){
 if(!secret)return '';
 const match=String(row.message||'').trim().match(/(?:^|\n)KVN Referral proof: v1:([A-Z0-9]{1,40}):([a-f0-9]{64})$/);if(!match)return '';
 const expected=createHmac('sha256',secret).update(`referral\n${row.id}\n${match[1]}`).digest();return timingSafeEqual(expected,Buffer.from(match[2],'hex'))?match[1]:'';
}
