'use strict';
const el=id=>document.getElementById(id);
const token=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
let session;
async function post(action,body){
 const r=await fetch('/api/contractor-intake/'+action,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed.');return d;
}
function bind(id,fn){const element=el(id);element.addEventListener(element.tagName==='FORM'?'submit':'click',async event=>{event.preventDefault();const button=element.tagName==='FORM'?element.querySelector('button'):element;button.disabled=true;el('notice').textContent='';try{await fn(element)}catch(e){el('notice').textContent=e.message}finally{button.disabled=false}})}
if(!/^[a-f0-9]{64}$/.test(token)){el('login').hidden=true;el('notice').textContent='Open the individual payment setup link provided by KV Production.'}
bind('send',async()=>{await post('code',{token});el('verify').hidden=false;el('notice').textContent='Check your agreement email for the eight-digit code.'});
bind('verify',async form=>{const d=await post('verify',{token,code:form.elements.code.value});session=d.session;form.reset();el('person').textContent=d.name+' · '+d.event;el('authorization').textContent=d.authorization;el('login').hidden=true;el('setup').hidden=false});
el('taxStatus').onchange=()=>{el('foreign').hidden=el('taxStatus').value!=='review';el('deposit').hidden=el('taxStatus').value!=='us'};
function finish(message){el('deposit').reset();session=null;el('setup').hidden=true;el('notice').textContent=message}
bind('refer',async()=>{await post('review',{session});finish('Tax review requested. Finance can follow up using your agreement email.')});
bind('deposit',async form=>{const f=form.elements,file=f.pdf.files[0];if(file.size>1310720)throw Error('Choose a W-9 PDF up to 1.25 MiB.');if(f.account.value!==f.confirmAccount.value)throw Error('The account numbers must match.');const pdf=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Unable to read the PDF.'));reader.readAsDataURL(file)});
 await post('submit',{session,pdf,usPerson:true,completedW9:f.w9.checked,holder:f.holder.value,type:f.type.value,routing:f.routing.value,account:f.account.value,confirmAccount:f.confirmAccount.value,signature:f.signature.value,consent:f.consent.checked});finish('Received for finance review. Your W-9 and deposit authorization have been recorded. Payment is processed separately by Kingdom Vibe, Inc.')});
