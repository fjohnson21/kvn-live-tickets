export function canonicalDiscipleHandle(value='') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'').slice(0,40);
}

export function canonicalDiscipleCode(value='') {
  return String(value).toUpperCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,'').slice(0,24);
}

export function allocateDiscipleHandle(store, value, existing=null) {
  const base=canonicalDiscipleHandle(value);
  if(!base) return '';
  const used=new Set((store.disciples||[]).filter(x=>x!==existing).map(x=>String(x.handle||'').toLowerCase()));
  if(!used.has(base)) return base;
  for(let n=2;n<10000;n++){
    const suffix=String(n),candidate=(base.slice(0,Math.max(1,40-suffix.length))+suffix).slice(0,40);
    if(!used.has(candidate)) return candidate;
  }
  throw Object.assign(new Error('Unable to allocate a unique Disciple affiliate handle.'),{statusCode:409});
}

export function affiliatePath(handle='') {
  return '/affiliate/'+encodeURIComponent(String(handle||''));
}

export function affiliatePublicUrl(handle='', base='https://www.kvnlive.com/affiliate') {
  return String(base||'https://www.kvnlive.com/affiliate').replace(/\/$/,'')+'/'+encodeURIComponent(String(handle||''));
}

export function upsertDiscipleFromApplication(store, payload, { id, now=()=>new Date().toISOString() } = {}) {
  const reference=String(payload.applicationReference||'').trim();
  if(!reference) throw Object.assign(new Error('applicationReference is required.'),{statusCode:400});
  const name=String(payload.name||payload.legalName||[payload.legalFirstName,payload.legalLastName].filter(Boolean).join(' ')).trim();
  const email=String(payload.email||'').trim().toLowerCase();
  if(!name || !email) throw Object.assign(new Error('name and email are required.'),{statusCode:400});

  const existing=(store.disciples||[]).find(x=>x.sourceApplicationReference===reference);
  const requestedHandle=existing?.handle||allocateDiscipleHandle(store,payload.handle||payload.preferredName||name,existing);
  const requestedCode=canonicalDiscipleCode(payload.code||payload.preferredName||name);
  if(!requestedHandle || !requestedCode) throw Object.assign(new Error('Unable to generate Disciple identity from application.'),{statusCode:400});

  const codeTaken=(store.disciples||[]).find(x=>x!==existing&&String(x.code||'').toUpperCase()===requestedCode);
  if(codeTaken) throw Object.assign(new Error('Disciple code is already in use.'),{statusCode:409});

  const stamp=now();
  const fields={
    name,
    email,
    handle:requestedHandle,
    code:requestedCode,
    status:'active',
    organizationId:String(payload.organizationId||''),
    defaultCommissionPercent:Math.max(0,Math.min(100,Number(payload.defaultCommissionPercent??store.settings?.defaultDiscipleCommissionPercent??10))),
    payoutMethod:'manual',
    payoutNotes:String(payload.payoutNotes||''),
    sourceApplicationReference:reference,
    sourceApplicationStatus:String(payload.applicationStatus||'approved'),
    sourceApplicationSubmittedAt:String(payload.submittedAt||''),
    sourceAgreementVersion:String(payload.agreementVersion||''),
    sourceAgreementAcceptedAt:String(payload.agreementAcceptedAt||''),
    sourceApplicationSyncedAt:stamp,
    eventRates:existing?.eventRates||[]
  };

  if(existing){
    Object.assign(existing,fields);
    existing.updatedAt=stamp;
    return {disciple:existing,created:false};
  }

  if(typeof id!=='function') throw new Error('id generator is required.');
  const disciple={id:id('dsc'),...fields,createdAt:stamp};
  store.disciples ||= [];
  store.disciples.push(disciple);
  return {disciple,created:true};
}
