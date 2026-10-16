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
 return {
  cdnHost,
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
