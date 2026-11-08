export function validateTripUpdate(p,origins){
 const t=p?.tripUpdate;if(!t||![0,1].includes(t.leg)||!['on_way','arrived','complete','reminder_24h','reminder_2h','five_minutes'].includes(t.state)||!p.journey?.legs?.[t.leg]||!Number.isSafeInteger(t.at)||!/^[-a-f0-9]{36}-[01]-(on_way|arrived|complete|reminder_24h|reminder_2h|five_minutes)$/.test(p.id))throw Error('Invalid driver update');
 if(!p.id.endsWith(`-${t.leg}-${t.state}`))throw Error('Driver update identity mismatch');
 if(['on_way','five_minutes'].includes(t.state)&&(!Number.isSafeInteger(t.eta)||t.eta<=t.at||t.eta-t.at>240*60000))throw Error('Invalid arrival estimate');
 const u=new URL(p.accountUrl);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/account'||u.search||u.hash||!origins.split(',').map(x=>x.trim()).includes(u.origin))throw Error('Invalid account link');
}
export function tripCopy(p){const t=p.tripUpdate,leg=t.leg?'Return ride':'First ride',time=t.eta?new Date(t.eta).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}):'',prefix=p.pilot?'TEST ONLY — no ride purchased. ':'';
 const label=t.state==='reminder_24h'?'Your ride is within 24 hours':t.state==='reminder_2h'?'Your ride is within 2 hours':t.state==='five_minutes'?'Your driver is approximately five minutes away':t.state==='on_way'?'Your driver is on the way':t.state==='arrived'?'Your driver has arrived at pickup':'Your trip is complete';
 const text=`${prefix}${leg}: ${label}.${t.state==='on_way'?` Initial estimated arrival: ${time} Eastern, based on the travel time entered at departure. Traffic and stops can change this estimate. Live location is available in your account when your driver enables sharing.`:''}\nPickup: ${p.journey.legs[t.leg].date} ${p.journey.legs[t.leg].time} Eastern. ${t.state==='five_minutes'?'Approximate arrival based on the latest available estimate; traffic and stops may change it.':''}\nView your ride updates: ${p.accountUrl}`;
 return {label,text,sms:`${prefix}${leg}: ${label}.${t.state==='on_way'?` Estimated arrival around ${time} ET (departure estimate; may change).`:''} ${p.accountUrl}`};
}
