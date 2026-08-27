import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir,{recursive:true});
const file = path.join(dataDir, 'store.json');
const seedFile = path.join(__dirname, 'data', 'store.json');
if (!fs.existsSync(file) && fs.existsSync(seedFile)) fs.copyFileSync(seedFile,file);
export function readStore(){
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  d.staff ||= []; d.payouts ||= []; d.auditLogs ||= []; d.abandonedCarts ||= []; d.media ||= [];
  d.settings ||= {}; d.settings.platformFeePercent ??= 5; d.settings.taxRatePercent ??= 0;
  d.settings.feePlans ||= [{id:'standard',name:'Standard',percent:5,fixed:0},{id:'partner',name:'Kingdom Partner',percent:3.5,fixed:0},{id:'enterprise',name:'Enterprise',percent:2.5,fixed:25}];
  d.organizations.forEach(o=>{ o.feePlanId ||= 'standard'; o.payoutSchedule ||= 'weekly'; o.onboarding ||= {profile:true,branding:false,payouts:false,firstEvent:false}; });
  d.events.forEach(e=>{ e.taxRatePercent ??= d.settings.taxRatePercent; e.customSlug ||= e.slug; e.media ||= {}; });
  return d;
}
export function writeStore(data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); return data; }
export function id(prefix='id'){ return `${prefix}_${crypto.randomBytes(6).toString('hex')}`; }
export function slugify(v=''){ return v.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,80); }
export function ticketCode(){ return `KVN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }
