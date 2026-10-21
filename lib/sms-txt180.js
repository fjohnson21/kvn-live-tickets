import {XMLParser,XMLValidator} from 'fast-xml-parser';
const endpoint='https://secure.txtpkg.com/api.php';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const node=(key,value)=>`<${key}>${escape(value)}</${key}>`;
const failure=(code=null,outcome='unknown')=>Object.assign(new Error(code?`TXT180 rejected the request (code ${code}).`:'TXT180 outcome is unknown. Review before retrying.'),{providerCode:code,outcome,statusCode:502});
export function createTxt180Client({env=process.env,fetchImpl=fetch}={}){
 const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:true});
 async function call(command,body=''){
  if(!env.TXT180_API_KEY||!/^\d+$/.test(env.TXT180_ACCOUNT_ID||'')||!/^\d{10}$/.test(env.TXT180_SHORT_CODE||'')||!env.TXT180_KEYWORD)throw Object.assign(new Error('TXT180 connection is not configured.'),{statusCode:503,outcome:'rejected'});
  let response,text;
  try{response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/xml'},body:'<sms>'+node('auth_key',env.TXT180_API_KEY)+node('command',command)+node('account_id',env.TXT180_ACCOUNT_ID)+node('short_code',env.TXT180_SHORT_CODE)+node('keyword',env.TXT180_KEYWORD)+body+'</sms>',signal:AbortSignal.timeout(15000)});text=await response.text();}catch{throw failure();}
  if(!response.ok||text.length>2000000||/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw failure();
  let result;try{result=parser.parse(text)?.sms;}catch{throw failure();}
  if(!result||typeof result!=='object')throw failure();
  if(result.error){const code=Number(result.error.code);throw failure(Number.isInteger(code)?code:null,'rejected');}
  return result;
 }
 const id=(value)=>{const s=String(value||'');if(!/^[1-9]\d*$/.test(s))throw failure();return s;};
 const ok=r=>{if(!Object.hasOwn(r,'ok'))throw failure();return r;};
 return {
  async addContact({phone,name='',groupId}){const r=await call('contact_add','<contact>'+node('name',name)+node('number',phone)+(groupId?node('group_id',groupId):'')+'</contact>');return {contactId:id(r.contact_id||r.contact_added?.['@_id'])};},
  async addGroup({name,extension}){const r=await call('group_add','<group>'+node('extension',extension)+node('name',name)+node('description',name)+node('default_message','')+'</group>');return {groupId:id(r.group_id)};},
  async assignGroup({contactId,groupId}){try{ok(await call('group_add_contact',node('contact_id',contactId)+node('group_id',groupId)));}catch(e){if(e.providerCode!==1025)throw e;}return {ok:true};},
  async sendMessage({to,body}){ok(await call('send_message',node('message',body)+'<contacts>'+node('contact_number',to)+'</contacts>'));return {status:'accepted',sid:null};},
  async listContacts(){const r=await call('contact_list');const rows=r.contacts?.contact;return (rows?Array.isArray(rows)?rows:[rows]:[]).map(c=>({contactId:String(c.contact_id),phone:String(c.number||''),name:String(c.name||'')}));},
  async optouts(){const all=[];for(let page=1;page<=100;page++){let r;try{r=await call('contact_optout_list',node('page',page));}catch(e){if(e.providerCode===1000&&page===1)return all;throw e;}const rows=r.optouts?.contact,items=rows?Array.isArray(rows)?rows:[rows]:[];for(const c of items){if(!/^[1-9]\d*$/.test(String(c.record_id||''))||!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(String(c.number||'')))throw failure();all.push({id:String(c.record_id),phone:String(c.number),at:String(c.timestamp||'')});}const total=Number(r.total_results);if(!Number.isFinite(total)||total<0)throw failure();if(all.length>=total)return all;if(!items.length)throw failure();}throw failure();},
 };
}
