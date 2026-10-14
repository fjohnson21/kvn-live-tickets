import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

export function normalizeEmail(value=''){
  const email=String(value).trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Object.assign(new Error('Enter a valid email address.'),{status:400});
  return email;
}

export function validatePassword(value=''){
  const password=String(value);
  if(password.length<12||password.length>200)throw Object.assign(new Error('Use a password with at least 12 characters.'),{status:400});
  return password;
}

export function validateDisplayName(value=''){
  const name=String(value).trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>80)throw Object.assign(new Error('Enter a display name between 2 and 80 characters.'),{status:400});
  if(/[<>\u0000-\u001f]/.test(name))throw Object.assign(new Error('Display name contains unsupported characters.'),{status:400});
  return name;
}

export function profileInitials(name=''){
  return String(name).split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'KV';
}

export function hashPassword(password){
  const salt=randomBytes(16).toString('hex');
  const digest=scryptSync(validatePassword(password),salt,64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password,encoded=''){
  try{
    const [kind,salt,expected]=String(encoded).split('$');
    if(kind!=='scrypt'||!salt||!expected)return false;
    const actual=scryptSync(String(password),salt,64);
    const target=Buffer.from(expected,'hex');
    return actual.length===target.length&&timingSafeEqual(actual,target);
  }catch{return false;}
}

export function safeSecret(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
