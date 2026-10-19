import crypto from 'node:crypto';
import {ensureSms,smsError,smsHash,txt180Scope} from './sms-model.js';
import {normalizeSmsPhone,recordSmsConsent,smsPermission} from './sms-audiences.js';
export function createSmsContactsService({readStore,writeStore,client,env={},now=()=>new Date()}){
 const scope=txt180Scope(env);
 let busy=false,lastSync=0;
 const data=()=>{const s=ensureSms(readStore());s.sms.contacts??=[];s.sms.groups??=[];s.sms.contactOperations??=[];return s;};
 const at=()=>now().toISOString();
 async function syncOptouts({force=false}={}){if(!force&&Date.now()-lastSync<30000)return;lastSync=0;const rows=await client.optouts(),s=data();for(const r of rows){const phone=normalizeSmsPhone(r.phone),id='txt180-stop:'+scope+':'+r.id;if(!phone||s.sms.consentEvents.some(e=>e.id===id))continue;recordSmsConsent(s,{id,scopeId:'kvn',phone,purpose:'marketing',action:'withdraw',source:'txt180',evidence:'TXT180 opt-out '+r.id,disclosureVersion:'sms-1',occurredAt:at()});}s.sms.optoutsCheckedAt=at();writeStore(s);lastSync=Date.now();}
 async function operation(kind,args,key,perform,save){
  if(args.principal?.role!=='owner'||!args.principal.id)throw smsError('Owner access required.',403);
  if(!args.requestId||typeof args.requestId!=='string'||args.requestId.length>128)throw smsError('A request ID is required.');
  if(busy)throw smsError('Another contact action is in progress. Try again shortly.',409);
  busy=true;try{
   let s=data(),fingerprint=smsHash({...args,principal:args.principal.id}),old=s.sms.contactOperations.find(o=>o.requestId===args.requestId);
   if(old){if(old.fingerprint!==fingerprint)throw smsError('Request ID already used.',409);if(old.status==='complete')return old.result;throw smsError('This request needs review before retrying.',409);}
   if(s.sms.contactOperations.some(o=>o.kind===kind&&o.key===key&&['submitting','needs_review'].includes(o.status)))throw smsError('A previous request needs review in TXT180 before retrying.',409);
   const op={id:crypto.randomUUID(),requestId:args.requestId,kind,key,fingerprint,status:'submitting',actor:args.principal.id,at:at()};s.sms.contactOperations.push(op);s.sms.revision++;writeStore(s);
   let result;try{result=await perform();}catch(e){s=data();const current=s.sms.contactOperations.find(o=>o.id===op.id);current.status=e.outcome==='rejected'||e.statusCode&&e.statusCode<500?'failed':'needs_review';current.providerCode=e.providerCode||null;s.sms.revision++;writeStore(s);throw e;}
   s=data();const output=save(s,result);s.sms.revision++;output.revision=s.sms.revision;Object.assign(s.sms.contactOperations.find(o=>o.id===op.id),{status:'complete',result:output});s.sms.audit.push({kind,actor:args.principal.id,at:at(),targetId:output.contact?.id||output.group?.id});writeStore(s);return output;
  }finally{busy=false;}
 }
 return {
  syncOptouts,
  async verifyConnection(){await client.listContacts();return {connectionVerified:true,verifiedAt:at()};},
  list(){const s=data();return {contacts:s.sms.contacts.filter(c=>c.providerScope===scope).map(c=>({...c,permission:smsPermission(s,c.phone).eligible?'Approved':'Opted out / permission missing'})),groups:s.sms.groups.filter(g=>g.providerScope===scope),revision:s.sms.revision,optoutsCheckedAt:s.sms.optoutsCheckedAt||null,operations:s.sms.contactOperations.filter(o=>['needs_review','submitting'].includes(o.status)).map(o=>({kind:o.kind,at:o.at,status:o.status}))};},
  async addContact(args){const phone=normalizeSmsPhone(args.phone),name=String(args.name||'').trim(),evidence=String(args.evidence||'').trim();if(!phone||name.length>100||args.approved!==true||!evidence||evidence.length>500)throw smsError('Enter a valid phone, confirm permission and record its source.');return operation('contact_add',args,phone,async()=>{await syncOptouts({force:true});const s=data();if(smsPermission(s,phone).reason==='opted_out')throw smsError('This contact has opted out. Adding it cannot override that choice.',409);const group=args.groupId?s.sms.groups.find(g=>g.id===args.groupId&&g.providerScope===scope):null;if(args.groupId&&!group)throw smsError('Group not found.');const existing=s.sms.contacts.find(c=>c.phone===phone&&c.providerScope===scope);if(existing)throw smsError('Contact already exists. Use Assign to group.',409);return client.addContact({phone,name,groupId:group?.providerGroupId});},(s,r)=>{const contact={id:crypto.randomUUID(),phone,name,providerScope:scope,providerContactId:r.contactId,groupIds:args.groupId?[args.groupId]:[],status:'active',createdAt:at()};s.sms.contacts.push(contact);recordSmsConsent(s,{id:'owner-contact:'+contact.id,scopeId:'kvn',phone,purpose:'marketing',action:'grant',source:'owner_attestation',evidence,disclosureVersion:'owner-attestation-1',occurredAt:at(),actor:args.principal.id});return {contact,message:'Contact added to TXT180 and Command Center.'};});},
  async addGroup(args){const name=String(args.name||'').trim(),extension=String(args.extension||'').trim().toLowerCase();if(!name||name.length>80||!(/^[a-z0-9]{1,20}$/).test(extension))throw smsError('Enter a group name and a short code of 1–20 letters or digits.');return operation('group_add',args,extension,async()=>{if(data().sms.groups.some(g=>g.extension===extension&&g.providerScope===scope))throw smsError('This group code already exists.',409);return client.addGroup({name,extension});},(s,r)=>{const group={id:crypto.randomUUID(),name,extension,providerScope:scope,providerGroupId:r.groupId,createdAt:at()};s.sms.groups.push(group);return {group,message:'Group created in TXT180 and Command Center.'};});},
  assignGroup(args){return operation('group_assign',args,String(args.contactId)+':'+String(args.groupId),async()=>{const s=data(),c=s.sms.contacts.find(c=>c.id===args.contactId&&c.providerScope===scope),g=s.sms.groups.find(g=>g.id===args.groupId&&g.providerScope===scope);if(!c||!g)throw smsError('Choose a contact and a group.');return client.assignGroup({contactId:c.providerContactId,groupId:g.providerGroupId});},s=>{const c=s.sms.contacts.find(c=>c.id===args.contactId&&c.providerScope===scope);c.groupIds=[...new Set([...c.groupIds,args.groupId])];return {contact:c,message:'Contact assigned to group.'};});},
 };
}
