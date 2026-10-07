import {contactOf,categoryOf} from './crm-records.js';
function cell(value){let s=String(value??'');if(/^[\s]*[=+\-@]|^[\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
const consent=v=>v==null?'Not captured':v?'Yes':'No';
export function crmReportCsv(report){
 const headers=['Record ID','Name','Organization','Email','Phone','Category','Source','Received at (UTC)','CRM status','Partner stage','Follow-up date (Eastern)','Requested package','Submitted amount','Email consent','Text consent','Terms accepted','Generated at','Timezone','Filters','Source freshness'];
 const metadata=[report.generatedAt,'America/New_York',JSON.stringify(report.filters),JSON.stringify(report.sources||[])];
 const rows=report.rows.map(r=>{const c=contactOf(r);return [r.id,c.name,c.organization,c.email,c.phone,categoryOf(r),r.sourceTable,r.receivedAt,r.workflowStatus,r.partnerStage,r.followUpDate,r.requestedPackage,r.submittedAmount,consent(r.consent?.email),consent(r.consent?.text),consent(r.consent?.terms),...metadata]});
 return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
