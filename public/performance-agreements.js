(()=>{'use strict';let api,user,epoch=0,rows=[];const $=id=>document.getElementById(id),root='/api/performance-agreements',esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=v=>v?new Date(v).toLocaleString():'—';
 const delivery=a=>{const p=a.attempts?.at(-1);if(!p)return 'Not sent';const e=p.providerEvents||{};if(e.bounced)return 'Bounced';if(e.failed)return 'Provider failed';if(e.delivered)return 'Delivered (provider confirmed)';if(e.opened||e.clicked)return 'Engagement recorded; delivery not separately recorded';return {accepted:'Provider accepted',failed:'Request rejected',unknown:'Unknown — review provider'}[p.status]||'Unknown'};
 const opens=a=>a.attempts?.some(p=>p.providerEvents?.opened)?'Recorded':'No recorded open';
 const status=a=>a.acceptedAt?'Accepted':a.revokedAt?'Revoked':a.source==='external'||a.attempts?.length?'Outstanding':a.approved?'Approved draft':'Draft';
 const post=(url,body={})=>api(url,{method:'POST',body:JSON.stringify(body)});
 const message=text=>{if($('agreementNotice'))$('agreementNotice').textContent=text};
 const guard=fn=>async event=>{const e=epoch;try{await fn(event)}catch(error){if(e===epoch&&user?.role==='owner'){message(error.message);if($('agreementError'))$('agreementError').textContent=error.message}}};
 function close(){const d=$('agreementsDialog');if(d?.open)d.close();if(d)d.innerHTML=''}
 function modal(title,body){const d=$('agreementsDialog');d.innerHTML=`<div class="agreement-dialog"><div class="section-head"><h2>${esc(title)}</h2><button class="btn" id="agreementClose">Close</button></div><p id="agreementError" role="alert"></p>${body}</div>`;$('agreementClose').onclick=close;if(!d.open)d.showModal()}
 async function refresh(){const e=epoch,data=await api(root);if(e!==epoch||user?.role!=='owner')return;rows=data.agreements;const outstanding=rows.filter(a=>status(a)==='Outstanding').length;$('agreementsRoot').innerHTML=`<p id="agreementNotice" role="status"></p><div class="inline-actions"><a class="btn" href="/contractor-payment-preview.html" target="_blank" rel="noopener">Preview W-9 and direct deposit setup</a><button class="btn" id="agreementsRefresh">Refresh all status</button><button class="btn primary" id="agreementsNew" ${!data.sourceConfigured?'disabled':''}>New draft</button><button class="btn" id="vendorSetup">Vendor payments</button></div><p>${rows.filter(a=>a.acceptedAt).length} accepted · ${outstanding} outstanding · Last existing-site sync: ${esc(date(data.sync?.at))}</p>${data.sync?.healthy===false?'<p>Existing agreement refresh failed. New issuance is blocked until refresh succeeds.</p>':''}${!data.sourceConfigured?'<p>Existing signing-site connection needs configuration. New issuance is blocked.</p>':''}${!data.issuanceEnabled?'<p>New agreement delivery is disabled. Drafts can be prepared for review.</p>':''}<p class="muted">Email opens are provider observations, not proof of reading. Agreement views count page loads and may include automation. Existing links and signed terms remain on their original signing site.</p><div class="table-wrap"><table class="table"><thead><tr><th>Recipient</th><th>Delivery</th><th>Email opens</th><th>Agreement views</th><th>Acceptance</th></tr></thead><tbody>${rows.map(a=>`<tr><td><button class="btn" data-agreement="${esc(a.id)}">${esc(a.name)}</button><div>${esc(a.email)}</div><small>${a.source==='external'?'Existing signing site':esc(a.eventKey)}</small></td><td>${esc(delivery(a))}</td><td>${esc(opens(a))}</td><td>${a.views?Number(a.views.count):'Not tracked'}</td><td>${status(a)}${a.acceptedAt?'<br>'+esc(date(a.acceptedAt)):''}</td></tr>`).join('')||'<tr><td colspan="5">No agreements loaded. Refresh existing status first.</td></tr>'}</tbody></table></div>`;
 $('agreementsRefresh').onclick=guard(async()=>{const e=epoch;$('agreementsRefresh').disabled=true;message('Connecting to existing agreement records…');try{await post(root+'/sync');if(e!==epoch)return;const d=await api(root);for(const a of d.agreements.filter(a=>a.attempts.some(x=>x.messageId))){if(e!==epoch)return;await post(root+'/'+encodeURIComponent(a.id)+'/refresh');await new Promise(resolve=>setTimeout(resolve,600))}if(e===epoch){await refresh();message('Agreement and provider status refreshed. No emails sent.')}}finally{if(e===epoch&&$('agreementsRefresh'))$('agreementsRefresh').disabled=false}});
 $('vendorSetup').onclick=guard(vendorPayments);
 $('agreementsNew').onclick=()=>draftForm();$('agreementsRoot').querySelectorAll('[data-agreement]').forEach(b=>b.onclick=guard(()=>details(b.dataset.agreement)));
 }
 function draftForm(existing){modal(existing?'Revise unissued draft':'New performance agreement',`<form id="agreementDraft" class="form-stack">${existing?'':`<label>Event reference<input name="eventKey" required maxlength="100" placeholder="Example: KV-LIVE-20261121"></label><label>Recipient legal name<input name="name" required maxlength="150"></label><label>Recipient email<input name="email" type="email" required maxlength="254"></label>`}<label>Exact finalized agreement text<textarea name="text" required maxlength="50000" rows="15">${esc(existing?.versions.at(-1).text||'')}</textarea></label><p>No terms are generated automatically. Saving a draft does not send anything.</p><button class="btn primary">Save draft for review</button></form>`);$('agreementDraft').onsubmit=guard(async e=>{e.preventDefault();const snap=epoch,p=Object.fromEntries(new FormData(e.target));const a=await post(existing?root+'/'+existing.id+'/revise':root,p);if(snap!==epoch)return;await refresh();await details(a.id)})}
 async function depositReport(){
  const snap=epoch,endpoint=root+'/finance/';
  const settings=await post(endpoint+'report-settings');
  if(snap!==epoch||user?.role!=='owner')return;
  modal('Payment deposit report',`<div class="inline-actions"><button class="btn" id="depositToggle">${settings.enabled?'Deactivate':'Activate'} reports</button><button class="btn primary" id="depositRun" ${settings.enabled?'':'disabled'}>Pull submitted forms</button></div><div id="depositResults" aria-live="polite"></div>`);
  const panel=$('depositResults'),toggle=$('depositToggle'),run=$('depositRun');
  toggle.onclick=guard(async()=>{
   toggle.disabled=true;run.disabled=true;
   try{
    const next=await post(endpoint+'set-report-enabled',{enabled:!settings.enabled});
    if(!panel.isConnected)return;
    settings.enabled=next.enabled;panel.replaceChildren();
    toggle.textContent=settings.enabled?'Deactivate reports':'Activate reports';
   }finally{toggle.disabled=false;run.disabled=!settings.enabled}
  });
  run.onclick=guard(async()=>{
   run.disabled=true;toggle.disabled=true;
   try{
    const report=await post(endpoint+'deposit-report');
    if(!panel.isConnected)return;
    const events=[...new Set(report.rows.map(row=>row.eventKey))].sort();
    panel.innerHTML=`<label>Event<select id="depositEvent"><option value="">All events</option>${events.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label><div id="depositRows"></div>`;
    const select=$('depositEvent');
    function render(){
     const records=report.rows.filter(row=>!select.value||row.eventKey===select.value);
     const fields=[['name','Payee'],['email','Email'],['eventKey','Event'],['source','Payee type'],['amount','Recorded amount (USD)'],['submittedAt','Form received (UTC)']];
     $('depositRows').innerHTML=`<p>${records.length} submitted · Pulled ${esc(date(report.generatedAt))}</p><button class="btn" id="depositExport">Download CSV</button><div class="table-wrap"><table class="table"><thead><tr>${fields.map(([,label])=>`<th>${esc(label)}</th>`).join('')}<th>Payment packet</th></tr></thead><tbody>${records.map((row,index)=>`<tr>${fields.map(([key])=>`<td>${esc(row[key]??'—')}</td>`).join('')}<td>${row.available?`<button class="btn" data-packet="${index}">Open packet</button>`:'Unavailable'}</td></tr>`).join('')}</tbody></table></div>`;
     panel.querySelectorAll('[data-packet]').forEach(button=>button.onclick=guard(()=>paymentDetails(records[Number(button.dataset.packet)])));
     $('depositExport').onclick=()=>{
      const cell=value=>{
       let text=String(value??'');
       if(/^[\s\u0000-\u001f]*[=+@-]/.test(text))text="'"+text;
       return '"'+text.replaceAll('"','""')+'"';
      };
      const csv=[fields.map(([,label])=>label),...records.map(row=>fields.map(([key])=>row[key]))].map(row=>row.map(cell).join(',')).join('\r\n');
      const link=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      link.href=url;link.download='kv-live-deposit-submissions.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
     };
    }
    select.onchange=render;render();
   }finally{toggle.disabled=false;run.disabled=!settings.enabled}
  });
 }
 async function vendorPayments(){
  const current=epoch,endpoint=root+'/finance/',vendors=await post(endpoint+'vendors');
  if(current!==epoch)return;
  modal('Owner-approved vendor payments',vendors.map(v=>`<button class="btn" data-vendor="${esc(v.id)}">${esc(v.name)} · ${esc(v.eventKey)} · $${esc(v.amount)}</button>`).join('')+
   '<form id="vendorApproval" class="form-stack"><label>Vendor name<input name="name" required></label><label>Vendor email<input type="email" name="email" required></label><label>Event reference<input name="eventKey" required></label><label>Honorarium in USD<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Reason for approval<textarea name="reason" required></textarea></label><button class="btn primary">Approve vendor for payment setup</button></form>');
  $('agreementsDialog').querySelectorAll('[data-vendor]').forEach(b=>b.onclick=guard(()=>paymentDetails(vendors.find(v=>v.id===b.dataset.vendor))));
  $('vendorApproval').onsubmit=guard(async e=>{e.preventDefault();const vendor=await post(endpoint+'approve-vendor',Object.fromEntries(new FormData(e.target)));if(current===epoch)await paymentDetails(vendor)});
 }
 async function paymentDetails(a){
  const snap=epoch,endpoint='/api/performance-agreements/finance/';
  const request=(action,extra={})=>post(endpoint+action,{id:a.id,...extra});
  const state=await request('status');if(snap!==epoch)return;
  modal('Contractor payment setup',`<p>${esc(a.name)} · ${esc(a.email)}</p><p>${esc(state.status)} ${state.at?esc(date(state.at)):''}</p><div id="financeWork"></div>`);
  const panel=$('financeWork');
  if(!state.received){
   panel.innerHTML='<p>Create a private link for this payee. Creating another link expires the previous one. Share it directly with the payee.</p><button class="btn" id="makePaymentLink">Create private setup link</button>';
   $('makePaymentLink').onclick=guard(async()=>{const b=$('makePaymentLink');b.disabled=true;try{const result=await request('invite');if(snap!==epoch||!panel.isConnected)return;panel.innerHTML='<label>Copy private link<input id="paymentUrl" readonly></label>';$('paymentUrl').value=result.url;$('paymentUrl').select()}finally{b.disabled=false}});
   return;
  }
  panel.innerHTML='<button class="btn" id="financeCode">Email finance verification code</button><form id="financeVerify" hidden><label>Finance verification code<input name="code" required pattern="[0-9]{8}" autocomplete="one-time-code"></label><button class="btn">View payment packet</button></form>';
  $('financeCode').onclick=guard(async()=>{await request('finance-code');if(panel.isConnected)$('financeVerify').hidden=false});
  $('financeVerify').onsubmit=guard(async event=>{event.preventDefault();const result=await request('read',{code:event.target.elements.code.value});if(snap!==epoch||!panel.isConnected)return;
   panel.innerHTML=`<p>Use these instructions in the bank portal after reviewing the W-9 and authorization.</p><dl><dt>Account holder</dt><dd>${esc(result.holder)}</dd><dt>Account type</dt><dd>${esc(result.type)}</dd><dt>Routing number</dt><dd>${esc(result.routing)}</dd><dt>Account number</dt><dd>${esc(result.account)}</dd><dt>Authorized by</dt><dd>${esc(result.signature)} · ${esc(date(result.submittedAt))}</dd></dl><p>${esc(result.authorization)}</p><button class="btn" id="saveW9">Download submitted W-9 PDF</button>`;
   $('saveW9').onclick=()=>{const bytes=Uint8Array.from(atob(result.pdf),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const link=document.createElement('a');link.href=url;link.download='KV-W9-'+a.id+'.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
   setTimeout(()=>{if(panel.isConnected)close()},120000);
  });
 }
 async function details(id){const e=epoch,a=await api(root+'/'+encodeURIComponent(id));if(e!==epoch||user?.role!=='owner')return;const v=a.versions.at(-1),native=a.source==='native',unsigned=!a.acceptedAt&&!a.revokedAt;modal(a.name,`<p>${esc(a.email)} · ${esc(a.eventKey)} · ${esc(status(a))}</p><p>Version ${esc(v.number)} · Document SHA-256</p><code class="agreement-hash">${esc(v.hash)}</code><pre class="agreement-text">${esc(v.text)}</pre><p>Agreement views: ${a.views?Number(a.views.count):'Not tracked'} · First: ${esc(date(a.views?.firstAt))} · Last: ${esc(date(a.views?.lastAt))}${a.views?.trackingSince?' · Tracking began '+esc(date(a.views.trackingSince)):''}</p>${a.acceptance?`<p><strong>Accepted by ${esc(a.acceptance.fullName)} on ${esc(date(a.acceptance.acceptedAt))}</strong><br>Identity method: ${esc(a.acceptance.identityMethod)}</p>`:''}<h3>Verification email attempts</h3>${(a.verificationAttempts||[]).map(p=>`<p>${esc(date(p.at))} · ${esc(p.status)} · ${esc(p.messageId||'No provider message ID')}</p>`).join('')||'<p>None / not tracked by original site</p>'}<h3>Delivery attempts</h3>${a.attempts.map(p=>`<p>${esc(date(p.at))} · ${esc(p.status)}<br>${esc(p.messageId||'No provider message ID')}<br>${esc(Object.keys(p.providerEvents||{}).join(', ')||'No additional provider event recorded')}${p.error?'<br>'+esc(p.error):''}</p>`).join('')||'<p>None</p>'}<a class="btn" href="${root}/${encodeURIComponent(a.id)}/evidence">Download agreement evidence</a>${a.acceptedAt&&!a.revokedAt?'<button class="btn primary" id="paymentSetup">Contractor payment setup</button>':''}${native&&unsigned?`<div class="form-stack"><label class="check-row"><input type="checkbox" id="agreementConfirm"> I reviewed the exact agreement text, version and recipient above.</label>${!a.attempts.length?'<button class="btn" id="agreementRevise">Revise draft</button><button class="btn" id="agreementApprove">Approve this version</button>':''}${a.approved&&(!a.attempts.length||a.attempts.at(-1).status==='failed')?'<button class="btn primary" id="agreementSend">Issue agreement by email</button>':''}<button class="btn" id="agreementRevoke">Revoke unsigned agreement</button></div>`:''}${a.source==='external'?'<p>This agreement uses its original signing link. It cannot be resent or edited here.</p>':''}`);
 if($('paymentSetup'))$('paymentSetup').onclick=guard(()=>paymentDetails(a));
 const run=action=>guard(async()=>{if(!$('agreementConfirm').checked)throw Error('Confirm you reviewed the exact text and recipient.');if(action==='send'&&!confirm('Issue this exact agreement to '+a.email+' now?'))return;const snap=epoch;const b=$('agreement'+action[0].toUpperCase()+action.slice(1));if(b)b.disabled=true;try{await post(root+'/'+a.id+'/'+action,{hash:v.hash,confirm:true,retry:a.attempts.length>0});if(snap!==epoch)return;await refresh();await details(a.id)}finally{if(b?.isConnected)b.disabled=false}});
 if($('agreementRevise'))$('agreementRevise').onclick=()=>draftForm(a);for(const action of ['approve','send','revoke']){const b=$('agreement'+action[0].toUpperCase()+action.slice(1));if(b)b.onclick=run(action)}
 }
 window.KVNAgreements={openDepositReport:guard(depositReport),init(options){api=options.api;user=options.user;if(user?.role==='owner')refresh().catch(e=>message(e.message))},clear(){epoch++;user=null;rows=[];close();if($('agreementsRoot'))$('agreementsRoot').innerHTML=''}};
})();
