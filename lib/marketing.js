import crypto from 'node:crypto';
export const defaults=[['leads','Leads'],['ticket-buyers','Ticket Buyers'],['apparel','Apparel Customers'],['disciples','Disciples'],['ministries','Ministry Partners'],['market','Kingdom Market'],['sponsors','Sponsors']];
export const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
export const normEmail=value=>String(value||'').trim().toLowerCase();
export const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export const uid=()=>crypto.randomUUID();
export const stamp=()=>new Date().toISOString();
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ensureMarketing(d){d.marketing??={};const m=d.marketing;m.contacts??=[];m.lists??=defaults.map(([id,name])=>({id,name}));m.campaigns??=[];m.settings??={senderName:'Kingdom Vibe Network',mailingAddress:''};return d}
export function upsertContact(d,input,{source='manual',sourceConsent=false,contactIndex}={}){
 const m=ensureMarketing(d).marketing,email=normEmail(input.email);if(!validEmail(email))throw fail('Enter a valid email address.');
 const listIds=input.listIds||[];if(!Array.isArray(listIds)||listIds.some(id=>!m.lists.some(l=>l.id===id)))throw fail('Choose valid lists.');
 const permission=input.permission;if(permission&&!['unknown','subscribed','unsubscribed','suppressed'].includes(permission))throw fail('Invalid mailing permission.');
 if(permission==='subscribed'&&!String(input.evidence||'').trim())throw fail('Record permission evidence before subscribing.');
 let c=contactIndex?contactIndex.get(email):m.contacts.find(c=>c.email===email);if(!c){c={id:uid(),email,name:'',listIds:[],sources:[],permission:'unknown',evidence:'',createdAt:stamp(),unsubscribeToken:crypto.randomBytes(24).toString('hex')};m.contacts.push(c);contactIndex?.set(email,c)}
 if(input.name!==undefined&&String(input.name).trim())c.name=String(input.name).trim().slice(0,200);
 c.listIds=[...new Set([...c.listIds,...listIds])];c.sources=[...new Set([...c.sources,source])];
 if(permission&&!['unsubscribed','suppressed'].includes(c.permission)&&(!sourceConsent||c.permission==='unknown'||['unsubscribed','suppressed'].includes(permission))){c.permission=permission;c.evidence=String(input.evidence||'').slice(0,1000);c.permissionUpdatedAt=stamp()}
 c.updatedAt=stamp();return c;
}
export function syncContacts(d){ensureMarketing(d);let processed=0;const add=(email,name,list,permission='unknown',evidence='',source=list)=>{if(!validEmail(normEmail(email)))return;upsertContact(d,{email,name,listIds:[list],permission,evidence},{source,sourceConsent:true});processed++};
 for(const r of d.crmRecords||[]){const c={...r.submittedContact,...r.correctedContact};const category=r.categoryOverride||r.category;const list=category==='Early Access'?'leads':category==='Ministry Partner'?'ministries':category==='Corporate Sponsor'?'sponsors':'market';const sameEmail=normEmail(c.email)===normEmail(r.submittedContact?.email);const consent=sameEmail?r.consent?.email:null;add(c.email,c.name,list,consent===true?'subscribed':consent===false?'unsubscribed':'unknown',consent===true?`Website email opt-in: ${r.sourceTable||'CRM'} / ${r.sourceId||r.id}`:consent===false?'Website email opt-out':'','website')}
 for(const o of d.orders||[])if(o.status==='paid')add(o.buyerEmail,o.buyerName,'ticket-buyers');
 for(const o of d.shopOrders||[])if(o.status==='paid')add(o.buyerEmail,o.buyerName,'apparel');
 for(const c of d.disciples||[])add(c.email,c.name,'disciples');return {processed,total:d.marketing.contacts.length};
}
export function eligibleContacts(d,listIds){return ensureMarketing(d).marketing.contacts.filter(c=>!c.archivedAt&&c.permission==='subscribed'&&c.listIds.some(id=>listIds.includes(id)))}
export function parseCsv(text){if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>12000000)throw fail('CSV must be under 12 MB.');text=text.replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(!quoted&&cell)throw fail('Invalid CSV quoting.');else quoted=!quoted}else if(ch===','&&!quoted){row.push(cell);cell=''}else if(ch==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=ch}if(quoted)throw fail('Unclosed CSV quote.');if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}rows=rows.filter(r=>r.some(x=>x.trim()));if(rows.length>20001)throw fail('Import up to 20,000 contacts at a time.');const heads=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase().replace(/^(e-mail|email address|e-mail address)$/,'email'));if(!heads.includes('email')||new Set(heads).size!==heads.length)throw fail('CSV needs a unique email column; optional name column.');return rows.map((r,i)=>{if(r.length!==heads.length)throw fail(`CSV row ${i+2} has the wrong number of columns.`);return Object.fromEntries(heads.map((h,j)=>[h,r[j]]))})}
export function csvText(heads,rows){const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';return '\uFEFF'+[heads,...rows].map(r=>r.map(cell).join(',')).join('\r\n')}
export function exportContacts(contacts,lists=[]){const labels=new Map(lists.map(l=>[l.id,l.name]));return csvText(['email','name','lists','permission','evidence'],contacts.map(c=>[c.email,c.name,c.listIds.map(id=>labels.get(id)||id).join(';'),c.permission,c.evidence]))}
export function cleanCsv(text){
 const input=parseCsv(text),byEmail=new Map(),rejected=[];let duplicates=0;
 const rank={unknown:0,subscribed:1,unsubscribed:2,suppressed:3};
 for(const [i,raw] of input.entries()){
  const r={...raw,email:normEmail(raw.email),name:String(raw.name||[raw['first name'],raw['last name']].filter(Boolean).join(' ')).trim()};
  if(!validEmail(r.email)){rejected.push({...raw,reason:'Invalid or missing email',row:i+2});continue}
  const previous=byEmail.get(r.email);
  if(previous){duplicates++;if(!previous.name)previous.name=r.name;previous.lists=[...new Set([previous.lists,r.lists].filter(Boolean).flatMap(x=>x.split(';').map(v=>v.trim()).filter(Boolean)))].join(';');if((rank[r.permission]||0)>(rank[previous.permission]||0)){previous.permission=r.permission;previous.evidence=r.evidence||''}}
  else byEmail.set(r.email,r);
 }
 const rows=[...byEmail.values()],heads=[...new Set(['email','name',...input.flatMap(r=>Object.keys(r))])];
 return {rows,duplicates,rejected,inputRows:input.length,csv:csvText(heads,rows.map(r=>heads.map(h=>r[h]))),rejectedCsv:csvText([...heads,'reason','row'],rejected.map(r=>[...heads,'reason','row'].map(h=>r[h])))};
}
export function importContacts(d,body){
 const m=ensureMarketing(d).marketing,rows=parseCsv(body.csv),listIds=body.listIds||[];
 if(!Array.isArray(listIds)||listIds.some(id=>!m.lists.some(l=>l.id===id)))throw fail('Choose valid lists.');
 const label=String(body.listName||'').trim();if(label.length>100)throw fail('List names must be under 100 characters.');
 const labels=new Map(m.lists.map(l=>[l.name.toLowerCase(),l]));
 const getList=name=>{name=name.trim();if(!name||name.length>100)throw fail('List names must be 1–100 characters.');let l=labels.get(name.toLowerCase());if(!l){l={id:uid(),name};m.lists.push(l);labels.set(name.toLowerCase(),l)}return l.id};
 const base=[...listIds,...(label?[getList(label)]:[])],contactIndex=new Map(m.contacts.map(c=>[c.email,c]));let added=0;
 for(const r of rows){
  const ids=[...new Set([...base,...(body.useCsvLists===true?String(r.lists||'').split(';').filter(x=>x.trim()).map(getList):[])])];
  if(!ids.length)throw fail('Choose a list or enter a new list label.');
  const previous=contactIndex.get(normEmail(r.email));if(!previous)added++;
  const blocked=['unsubscribed','suppressed'].includes(r.permission)?r.permission:undefined;
  const permission=blocked||(body.permission&&body.permission!=='unknown'?body.permission:undefined);
  upsertContact(d,{email:r.email,name:r.name,listIds:ids,permission,evidence:blocked?r.evidence:body.evidence},{source:'CSV import',contactIndex});
 }
 return {imported:rows.length,added,merged:rows.length-added,total:m.contacts.length};
}
export function validateDraft(input,m){const subject=String(input.subject||'').trim(),body=String(input.body||'').trim(),ctaUrl=String(input.ctaUrl||'').trim(),ctaLabel=String(input.ctaLabel||'').trim();if(!subject||subject.length>150||/[\r\n]/.test(subject)||!body||body.length>20000)throw fail('Enter a subject (1–150 characters) and message (1–20,000 characters).');if(ctaUrl){let url;try{url=new URL(ctaUrl)}catch{throw fail('Use a complete HTTPS button link.')}if(url.protocol!=='https:'||url.username||url.password)throw fail('Use a complete HTTPS button link.');if(!ctaLabel||ctaLabel.length>80)throw fail('Enter button text (1–80 characters).')}const listIds=input.listIds;if(!Array.isArray(listIds)||!listIds.length||listIds.some(id=>!m.lists.some(l=>l.id===id)))throw fail('Choose at least one valid audience list.');return {subject,body,ctaUrl,ctaLabel,listIds:[...new Set(listIds)]}}
export function campaignContent(c,contact,settings,baseUrl){const unsub=`${baseUrl}/email/unsubscribe/${encodeURIComponent(contact.unsubscribeToken)}`,footer=`${settings.senderName}\n${settings.mailingAddress}\nUnsubscribe: ${unsub}`;const text=`${c.body}${c.ctaUrl?'\n\n'+c.ctaLabel+': '+c.ctaUrl:''}\n\n${footer}`;return {subject:c.subject,text,html:`<!doctype html><html lang="en"><body style="margin:0;background:#f4f4f4;font:16px Arial;color:#111"><div style="max-width:600px;margin:24px auto;background:white;padding:32px"><h2>${escapeHtml(settings.senderName)}</h2><div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(c.body)}</div>${c.ctaUrl?`<p><a href="${escapeHtml(c.ctaUrl)}" style="display:inline-block;padding:16px;background:#c9232b;color:white">${escapeHtml(c.ctaLabel)}</a></p>`:''}<hr><p style="font-size:12px;white-space:pre-line">${escapeHtml(settings.senderName)}\n${escapeHtml(settings.mailingAddress)}</p><a href="${escapeHtml(unsub)}">Unsubscribe from marketing emails</a></div></body></html>`,headers:{'List-Unsubscribe':`<${unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}}
export function recoveryPreview(d,cartId,baseUrl){ensureMarketing(d);const c=(d.abandonedCarts||[]).find(x=>x.id===cartId);if(!c)throw fail('Cart not found.',404);const event=(d.events||[]).find(e=>e.id===c.eventId);if(c.status!=='open'||!event||event.status!=='published'||(event.date&&Date.parse(event.date)<Date.now()))throw fail('This cart or event is no longer available.',409);const email=normEmail(c.email);if(!validEmail(email))throw fail('This cart has no valid email.');if(!c.items?.length)throw fail('This cart is empty.');if(!Number.isFinite(Date.parse(c.updatedAt))||Date.now()-Date.parse(c.updatedAt)<3600000)throw fail('Wait one hour after the latest cart activity.',409);if((d.orders||[]).some(o=>o.eventId===c.eventId&&['paid','refunded'].includes(o.status)&&(o.cartId===c.id||normEmail(o.buyerEmail)===email)))throw fail('A completed purchase already exists for this customer.',409);const contact=d.marketing.contacts.find(x=>x.email===email);if(contact&&(contact.archivedAt||['unsubscribed','suppressed'].includes(contact.permission)))throw fail('This email is suppressed.',409);if(c.recoveryEmail)throw fail(`Recovery email already ${c.recoveryEmail.status}; review its history.`,409);const draft={subject:`Complete your ${event.title} purchase`.slice(0,150),body:`You started a purchase for ${event.title}. If you still plan to join us, return to the event page to select your passes and complete checkout.\n\nAvailability and current pricing apply. If you have already purchased, thank you—no action is needed.`,ctaLabel:'Return to checkout',ctaUrl:`${baseUrl}/event.html?slug=${encodeURIComponent(event.slug)}`};return {to:email,draft,cart:c,event,contact}}
