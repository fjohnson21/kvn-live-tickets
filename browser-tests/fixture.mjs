import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer as createHttpsServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {createOwnerPasswordStore} from '../lib/owner-auth.js';
import {createEngagementStore} from '../lib/marketing-engagement.js';
import {ensureMarketing,upsertContact} from '../lib/marketing.js';

// A disposable, synthetic database only. Never copy the production store or .env.
export async function fixture({engagementReports=false,checkin=false,surveyLeads=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-mobile-'));
 const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
 let base=`http://localhost:${port}`;
 fs.symlinkSync(path.resolve('public'),path.join(dir,'public'),'dir');
 const store={users:[{id:'mobile-owner',name:'Mobile Test Owner',email:'owner@example.test',role:'owner'}],organizations:[],events:[],orders:[],settings:{},crmRecords:[{id:'mobile-crm',sourceTable:'partner_leads',sourceId:'synthetic',sourceSystem:'kvnlive',category:'Vendor',submittedContact:{name:'Mobile Test Contact',email:'mobile@example.test',organization:'Synthetic Mobile Vendor'},correctedContact:{},consent:{email:null},receivedAt:new Date().toISOString(),workflowStatus:'New',partnerStage:'Inquiry',followUpDate:null,revision:1}]};
 if(checkin){
  const hostile='<img src=x onerror="window.checkinXss=1">';
  store.events.push({id:'scan-event',slug:'synthetic-checkin',organizationId:'scan-org',title:hostile,products:[]});
  store.orders.push({id:'scan-order',eventId:'scan-event',status:'paid',buyerName:hostile,tickets:['KVN-CAMERA01','KVN-MANUAL02','KVN-NATIVE03'].map(code=>({code,ticketName:'Synthetic '+hostile,holderName:hostile,checkedIn:false}))});
 }
 if(surveyLeads)store.sponsoredClaims=[{id:'synthetic-survey',name:'Survey Test Contact',email:'survey@example.test',phone:'9195550123',interests:['business','ministry','disciple'],createdAt:new Date().toISOString(),surveyCompletedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),accessToken:'never-expose'}];
 ensureMarketing(store);store.marketing.lists.push({id:'long-list',name:'LEGACY_FEST_TOUR_JEKALYN_CARR_Attendees_2103658948893_20261008_000928_065'});upsertContact(store,{email:'mobile@example.test',name:'Mobile Test Contact',listIds:['market'],permission:'unknown'});
 store.marketing.campaigns.push({id:'mobile-draft',revision:1,status:'draft',subject:'Synthetic mobile preview',body:'Test only. Never send.',listIds:['market'],recipients:[],createdAt:new Date().toISOString()});
 if(engagementReports){
  store.marketing.campaigns.push({id:'engagement-campaign',status:'complete',subject:'Synthetic engagement report',listIds:[],recipients:Array.from({length:55},(_,i)=>({id:'eng-'+i,email:`eng${i}@example.test`,status:'accepted',messageId:'message-'+i}))});
  const engagement=createEngagementStore({dataDir:dir});
  for(const type of ['delivered','opened','clicked','complained'])engagement.record(type,{type:'email.'+type,created_at:new Date().toISOString(),data:{email_id:'message-0',click:{link:'https://example.test/private-token?secret=do-not-display'}}});
 }
 fs.writeFileSync(path.join(dir,'store.json'),JSON.stringify(store));createOwnerPasswordStore({dataDir:dir,bootstrapPassword:'synthetic mobile password'});
 // Deliberately do not inherit provider keys, sync configuration or dotenv files.
 const child=spawn(process.execPath,[path.resolve('server.js')],{cwd:dir,env:{PATH:process.env.PATH,DATA_DIR:dir,UPLOAD_DIR:path.join(dir,'uploads'),PORT:String(port),BASE_URL:base,OWNER_EMAIL:'owner@example.test'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',d=>errors+=d);
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out: '+errors)),10000);child.stdout.on('data',d=>{if(String(d).includes('running at')){clearTimeout(timer);resolve()}});child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))})})}catch(e){child.kill();fs.rmSync(dir,{recursive:true,force:true});throw e}
 // WebKit does not send the production Secure cookie over plain HTTP localhost.
 // Use temporary local TLS for check-in tests; never relax production cookie flags.
 let secure;
 if(checkin){
  const key=path.join(dir,'test-key.pem'),cert=path.join(dir,'test-cert.pem');
  const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-subj','/CN=localhost','-days','1','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
  if(generated.status!==0){child.kill();fs.rmSync(dir,{recursive:true,force:true});throw Error('Unable to create temporary test TLS certificate')}
  secure=createHttpsServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
   const upstream=httpRequest({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-proto':'https'}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});
   upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
  });
  secure.listen(0);await once(secure,'listening');base=`https://localhost:${secure.address().port}`;
 }
 return {base,dir,async close(){if(secure){secure.closeAllConnections();await new Promise(r=>secure.close(r))}const exit=once(child,'exit');child.kill();await exit;fs.rmSync(dir,{recursive:true,force:true})}};
}
