import {createHash,createHmac} from 'node:crypto';
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const unavailable=()=>Object.assign(new Error('Video service is temporarily unavailable.'),{status:503});
export function createVideoProvider({libraryId,cdnHost,apiKey,tokenKey,fetchImpl=fetch,now=Date.now}={}){
 if(!/^\d+$/.test(String(libraryId||''))||!/^[-a-z0-9]+\.b-cdn\.net$/.test(cdnHost||'')||!apiKey||!tokenKey)return null;
 const checkId=id=>{if(!validId(id))throw unavailable();return id;};
 const expiry=seconds=>Math.floor(now()/1000)+seconds;
 async function request(path,method='GET',body){
  try{
   const r=await fetchImpl(`https://video.bunnycdn.com/library/${libraryId}/videos${path}`,{method,headers:{AccessKey:apiKey,'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!r.ok)throw unavailable();return await r.json();
  }catch{throw unavailable();}
 }
 const tusUrl=value=>{
  const u=new URL(value);if(u.origin!=='https://video.bunnycdn.com'||!u.pathname.startsWith('/tusupload')||u.username||u.password||u.hash)throw unavailable();return u.href;
 };
 async function tus(grant,method,headers={},body){
  try{
   const response=await fetchImpl(tusUrl(grant.uploadUrl||grant.endpoint),{method,redirect:'error',signal:AbortSignal.timeout(45000),headers:{'Tus-Resumable':'1.0.0',AuthorizationSignature:grant.signature,AuthorizationExpire:String(grant.expirationTime),LibraryId:String(libraryId),VideoId:checkId(grant.videoId),...headers},...(body?{body}:{})});
   if(response.status===409)throw Object.assign(new Error('Upload offset changed. Resume the upload.'),{status:409});
   if(!response.ok)throw unavailable();return response;
  }catch(error){if(error.status===409)throw error;throw unavailable();}
 }
 const integerHeader=(r,name)=>{const value=r.headers.get(name);if(!/^\d+$/.test(value||''))throw unavailable();const n=Number(value);if(!Number.isSafeInteger(n))throw unavailable();return n;};
 return {
  cdnHost,
  async startUpload(grant,size,type){
   if(!Number.isSafeInteger(size)||size<1||size>100*1024*1024)throw unavailable();
   const r=await tus(grant,'POST',{'Upload-Length':String(size),'Upload-Metadata':'filetype '+Buffer.from(type).toString('base64')+',title '+Buffer.from('KV Social upload').toString('base64')+',thumbnailTime '+Buffer.from('1000').toString('base64')});
   if(r.status!==201)throw unavailable();
   return {...grant,size,uploadUrl:tusUrl(new URL(r.headers.get('Location'),grant.endpoint).href)};
  },
  async uploadStatus(grant){
   const r=await tus(grant,'HEAD'),size=integerHeader(r,'Upload-Length'),offset=integerHeader(r,'Upload-Offset');
   if(size!==grant.size||offset>size)throw unavailable();return {size,offset};
  },
  async uploadChunk(grant,offset,body){
   if(offset<0||offset+body.length>grant.size)throw unavailable();
   const r=await tus(grant,'PATCH',{'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)},body),next=integerHeader(r,'Upload-Offset');
   if(next!==offset+body.length)throw unavailable();return next;
  },
  async createUpload(){
   const v=await request('','POST',{title:'KV Social upload'}),videoId=checkId(v.guid),expirationTime=expiry(600);
   return {videoId,libraryId:String(libraryId),expirationTime,endpoint:'https://video.bunnycdn.com/tusupload',signature:createHash('sha256').update(`${libraryId}${apiKey}${expirationTime}${videoId}`).digest('hex')};
  },
  async inspectVideo(id){
   const v=await request('/'+checkId(id));
   if(v.guid!==id||Number(v.videoLibraryId)!==Number(libraryId))throw unavailable();
   return {ready:v.status===4,failed:[5,6,8].includes(v.status),duration:Number(v.length),originalHash:/^[a-f0-9]{64}$/i.test(v.originalHash||'')?v.originalHash.toLowerCase():null,thumbnail:/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(v.thumbnailFileName||'')?v.thumbnailFileName:'thumbnail.jpg'};
  },
  playbackUrl(id){
   checkId(id);const expires=expiry(300),token=createHash('sha256').update(`${tokenKey}${id}${expires}`).digest('hex');
   return `https://player.mediadelivery.net/embed/${libraryId}/${id}?token=${token}&expires=${expires}&autoplay=true&muted=true&loop=false&preload=false&responsive=true`;
  },
  thumbnailUrl(id,name='thumbnail.jpg'){
   checkId(id);if(!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(name))throw unavailable();
   const path=`/${id}/${name}`,expires=expiry(300),token='HS256-'+createHmac('sha256',tokenKey).update(path+expires).digest('base64url');
   return `https://${cdnHost}${path}?token=${token}&expires=${expires}`;
  }
 };
}
