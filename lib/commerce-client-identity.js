import {createHmac,timingSafeEqual} from 'node:crypto';
export function commerceClientIdentity(req,secret=process.env.COMMERCE_BRIDGE_SECRET){
 const fallback=req.ip||req.socket?.remoteAddress||'unknown';
 const client=req.headers['x-kv-client'],time=req.headers['x-kv-time'],signature=req.headers['x-kv-signature'];
 if(!secret||typeof client!=='string'||!/^[a-f0-9]{64}$/.test(client)||typeof time!=='string'||Math.abs(Date.now()-Number(time))>60000||!/^\d+$/.test(time)||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return fallback;
 const expected=createHmac('sha256',secret).update(`${time}\n${client}\n${req.originalUrl}`).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'))?'bridge:'+client:fallback;
}
