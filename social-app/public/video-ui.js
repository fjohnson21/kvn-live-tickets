export function validateVideoSelection(file,duration){
 if(!file||!['video/mp4','video/quicktime','video/webm'].includes(file.type))throw Error('Choose an MP4, MOV or WebM video.');
 if(!file.size||file.size>100*1024*1024)throw Error('Choose a video up to 100 MB.');
 if(!Number.isFinite(duration)||duration<30||duration>60)throw Error('Videos must be 30–60 seconds long.');
}
export async function videoDuration(file){
 return new Promise((resolve,reject)=>{
  const video=document.createElement('video'),url=URL.createObjectURL(file);
  const done=(error)=>{clearTimeout(timer);const duration=video.duration;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);error?reject(error):resolve(duration);};
  const timer=setTimeout(()=>done(Error('Unable to read video duration. Try MP4.')),15000);
  video.onloadedmetadata=()=>done();video.onerror=()=>done(Error('Unable to read this video. Try MP4.'));video.preload='metadata';video.src=url;
 });
}
export async function uploadVideo(file,api,onProgress,signal){
 validateVideoSelection(file,await videoDuration(file));
 if(signal.aborted)throw Error('Upload cancelled.');
 const grant=await api('/videos','POST',{size:file.size,type:file.type});
 if(signal.aborted)throw Error('Upload cancelled.');
 await new Promise((resolve,reject)=>{
  const upload=new window.tus.Upload(file,{endpoint:grant.endpoint,chunkSize:5*1024*1024,retryDelays:[0,1000,3000,5000],storeFingerprintForResuming:false,
   headers:{AuthorizationSignature:grant.signature,AuthorizationExpire:String(grant.expirationTime),VideoId:grant.videoId,LibraryId:grant.libraryId},
   metadata:{filetype:file.type,title:'KV Social upload',thumbnailTime:'1000'},
   onProgress:(sent,total)=>onProgress(`Uploading video: ${Math.round(sent/total*100)}%`),
   onError:()=>{signal.removeEventListener('abort',cancel);reject(Error('Video upload interrupted. Try again on a stable connection.'));},
   onSuccess:()=>{signal.removeEventListener('abort',cancel);resolve();}});
  const cancel=()=>{upload.abort();reject(Error('Upload cancelled.'));};signal.addEventListener('abort',cancel,{once:true});upload.start();
 });
 for(let attempt=0;attempt<120;attempt++){
  if(signal.aborted)throw Error('Upload cancelled.');onProgress('Processing video and generating thumbnail…');
  const result=await api('/videos/'+grant.videoId);
  if(signal.aborted)throw Error('Upload cancelled.');
  if(result.failed)throw Error('Video processing failed. Choose another file.');
  if(result.ready){validateVideoSelection(file,result.duration);return grant.videoId;}
  await new Promise(resolve=>{const timer=setTimeout(done,3000);function done(){clearTimeout(timer);signal.removeEventListener('abort',done);resolve();}signal.addEventListener('abort',done,{once:true});});
 }
 throw Error('Video processing is taking longer than expected. Contact the beta team before uploading again.');
}
let saver;try{saver=localStorage.getItem('kv-social-data-saver')==='true'||!!navigator.connection?.saveData;}catch{saver=true;}
const cards=new Set();
export function dataSaverButton(){
 const b=document.createElement('button');b.type='button';b.className='chip';
 const label=()=>{b.textContent='Data Saver: '+(saver?'on':'off');b.setAttribute('aria-pressed',String(saver));};label();
 b.onclick=()=>{saver=!saver;try{localStorage.setItem('kv-social-data-saver',String(saver));}catch{}label();for(const c of cards)c.reset();};return b;
}
export function clearVideoCards(){for(const c of cards)c.dispose();cards.clear();}
export function videoCard(id,api,{autoplay=true}={}){
 const root=document.createElement('div');root.className='post-video';
 const img=document.createElement('img');img.alt='Video thumbnail';img.loading='lazy';img.referrerPolicy='origin';
 const play=document.createElement('button');play.type='button';play.className='video-play';play.textContent='Play video';
 const status=document.createElement('p');status.className='video-status';status.setAttribute('role','status');
 root.append(img,play,status);let frame,visible=false,pending=false,generation=0,disposed=false,thumbnailLoaded=false;
 function stop(){generation++;frame?.remove();frame=null;play.hidden=false;}
 async function load(start){
  if(pending||disposed||frame)return;pending=true;const current=generation;
  try{
   const data=await api(`/videos/${id}/playback`);if(disposed||current!==generation)return;
   img.src=data.thumbnail;thumbnailLoaded=true;status.textContent='';
   if(start&&visible&&!document.hidden){frame=document.createElement('iframe');frame.title='KV Social video';frame.allow='autoplay; fullscreen; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='origin';frame.src=data.url;root.append(frame);play.hidden=true;}
  }catch(e){if(!disposed)status.textContent=e.message;}finally{pending=false;}
 }
 play.onclick=()=>load(true);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting&&entries[0].intersectionRatio>=0.5;if(!visible)stop();else if(!saver){if(autoplay)load(true);else if(!thumbnailLoaded)load(false);}},{threshold:[0,0.5]});observer.observe(root);
 const visibility=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visibility);
 const entry={reset(){stop();if(!saver&&visible)load(autoplay);},dispose(){disposed=true;stop();observer.disconnect();document.removeEventListener('visibilitychange',visibility);cards.delete(entry);}};cards.add(entry);root.disposeVideo=()=>entry.dispose();
 return root;
}
