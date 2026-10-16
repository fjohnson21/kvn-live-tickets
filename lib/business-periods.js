const zone='America/New_York';
const parts=d=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
function midnight(y,m,d){const target=Date.UTC(y,m-1,d);let stamp=target;for(let i=0;i<4;i++){const p=parts(new Date(stamp));stamp+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);}return new Date(stamp).toISOString();}
export function businessPeriods(now=new Date()){
 if(!Number.isFinite(now.getTime()))throw Error('Invalid reporting time.');const p=parts(now),day=new Date(Date.UTC(+p.year,+p.month-1,+p.day-1));const start=midnight(+p.year,+p.month,+p.day),end=now.toISOString();return {yesterday:{label:'Yesterday',from:midnight(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate()),to:start},today:{label:'Today so far',from:start,to:end},mtd:{label:'Month to date',from:midnight(+p.year,+p.month,1),to:end}};
}
