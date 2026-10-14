import {createHash} from 'node:crypto';

// API keys and player signing keys are server-only. Never send either key to browsers.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const validVideoId=value=>typeof value==='string'&&uuid.test(value);

export function createBunnyVideoProvider({libraryId,apiKey,tokenKey,fetchImpl=fetch}={}){
  if(!libraryId||!apiKey||!tokenKey)return null;
  if(!/^\d{1,20}$/.test(String(libraryId)))throw new Error('Bunny Stream library ID is invalid.');
  const id=String(libraryId),base=`https://video.bunnycdn.com/library/${id}/videos`;
  async function request(method,path,body){
    const response=await fetchImpl(base+path,{
      method,headers:{AccessKey:apiKey,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15_000)
    });
    if(!response.ok)throw Object.assign(new Error('Video provider is unavailable. Try again shortly.'),{status:503});
    return response.json();
  }
  return {
    async start(title){
      const created=await request('POST','',{title:String(title).slice(0,120)});
      if(!validVideoId(created.guid))throw Object.assign(new Error('Video provider returned an invalid video ID.'),{status:503});
      const expires=Math.floor(Date.now()/1000)+3600;
      const signature=createHash('sha256').update(id+apiKey+expires+created.guid).digest('hex');
      return {videoId:created.guid,endpoint:'https://video.bunnycdn.com/tusupload',libraryId:id,signature,expires};
    },
    async status(videoId){
      if(!validVideoId(videoId))throw Object.assign(new Error('Invalid video ID.'),{status:400});
      const video=await request('GET','/'+videoId);
      return {ready:video.status===4,duration:Number(video.length)||0,width:Number(video.width)||0,height:Number(video.height)||0};
    },
    playback(videoId,{autoplay=false,expiresIn=600}={}){
      if(!validVideoId(videoId))throw Object.assign(new Error('Invalid video ID.'),{status:400});
      const expires=Math.floor(Date.now()/1000)+Math.max(60,Math.min(1800,expiresIn));
      const token=createHash('sha256').update(tokenKey+videoId+expires).digest('hex');
      const url=new URL(`https://player.mediadelivery.net/embed/${id}/${videoId}`);
      url.searchParams.set('token',token);url.searchParams.set('expires',String(expires));
      url.searchParams.set('autoplay',autoplay?'true':'false');
      url.searchParams.set('muted','true');url.searchParams.set('preload','false');
      return url.toString();
    }
  };
}
