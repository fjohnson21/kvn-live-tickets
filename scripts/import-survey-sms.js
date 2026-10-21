import 'dotenv/config';
// Disabled unless the operator supplies this specific, owner-approved job ID.
// Running in npm prestart ensures no concurrent HTTP store writers exist.
if(process.env.TXT180_SURVEY_IMPORT_ID){
 try{
  const {readStore,writeStore}=await import('../store.js');
  const {routeSurveyLeads}=await import('../lib/survey-leads.js');
  const {createTxt180Client}=await import('../lib/sms-txt180.js');
  const {runSurveySmsImport}=await import('../lib/sms-survey-import.js');
  if(process.env.TXT180_SURVEY_IMPORT_SCOPE!==[process.env.TXT180_ACCOUNT_ID,process.env.TXT180_KEYWORD,process.env.TXT180_SHORT_CODE].join(':'))throw Error('Survey import account scope mismatch.');
  const store=readStore();routeSurveyLeads(store);writeStore(store);
  const result=await runSurveySmsImport({readStore,writeStore,client:createTxt180Client()});
  console.log('TXT180 survey import result: '+JSON.stringify(result));
 }catch(e){
  // Keep ticketing available; failed imports are reported, never represented as success.
  console.error('TXT180 survey import blocked: '+JSON.stringify({code:e.providerCode||null,message:e.providerCode?'Provider rejected operation.':e.outcome==='unknown'?'Provider outcome needs review.':e.message}));
 }
}
