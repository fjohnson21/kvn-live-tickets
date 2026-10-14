// Review signals, never an automatic verdict. All content requires human review.
export const topics=['Kingdom Culture','Testimonies','Prayer Requests','Music','KV Live'];
export const categories=['harassment','hate','threats','spam','derogatory','privacy','sexual','other'];
export function normalize(text){return text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();}
export function validateText(value,max=2000){
 if(typeof value!=='string')throw new Error('Text is required.');
 const text=normalize(value);
 if(!text||text.length>max)throw new Error(`Use between 1 and ${max} characters.`);
 if(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/.test(text))throw new Error('Use plain text without markup or hidden controls.');
 if(/(?:https?:|www\.|javascript:|data:|\b[a-z0-9-]+\.(?:com|net|org|io|co)\b)/i.test(text))throw new Error('Links are disabled in this pilot.');
 return text;
}
export function screenContent(value){
 const t=normalize(value).toLowerCase(); const signals=[];
 const rules={
  harassment:/\b(?:you (?:are|r) (?:worthless|pathetic|stupid)|nobody wants you|go kill yourself)\b/,
  hate:/\b(?:all|those)\b.{0,45}\b(?:christians|muslims|jews|black people|white people|gay people|immigrants)\b.{0,30}\b(?:vermin|subhuman|should die|inferior)\b/,
  threats:/\b(?:i(?:'ll| will| am going to)|we will)\s+(?:kill|hurt|shoot|attack)\b|\b(?:kill yourself|bomb threat)\b/,
  spam:/\b(?:buy now|free money|guaranteed income|click here|crypto giveaway)\b|(.)\1{12,}/,
  derogatory:/\b(?:idiot|moron|bitch|scum|retard)\b/,
  privacy:/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{1,5} .{1,35}\b(?:street|lane|road|avenue)\b/,
  sexual:/\b(?:send nudes?|nude photos|explicit sex|child porn)\b/
 };
 for(const [name,re] of Object.entries(rules))if(re.test(t))signals.push(name);
 if(t.split(/\s+/).length>8&&new Set(t.split(/\s+/)).size<4&&!signals.includes('spam'))signals.push('spam');
 return signals;
}
