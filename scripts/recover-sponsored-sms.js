import 'dotenv/config';
if(process.env.TXT180_RECOVERY_ID){
 try{
  const {readStore,writeStore}=await import('../store.js');
  const {createTxt180Client}=await import('../lib/sms-txt180.js');
  const {runSponsoredSmsRecovery}=await import('../lib/sponsored-sms-recovery.js');
  console.log('Comp claim SMS recovery result: '+JSON.stringify(await runSponsoredSmsRecovery({readStore,writeStore,client:createTxt180Client()})));
 }catch(e){console.error('Comp claim SMS recovery blocked: '+JSON.stringify({code:e.providerCode||null,message:e.providerCode?'Provider operation rejected.':e.outcome?'Provider outcome requires review.':e.message}));}
}
