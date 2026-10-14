let current=null;
let observer=null;
const players=new WeakMap();
let autoplayAllowed=true;

export function setVideoAutoplay(enabled){autoplayAllowed=!!enabled;if(!autoplayAllowed)stopActiveVideo();}
export function stopActiveVideo(){
  if(current){current.player?.remove();current.player=null;current.poster.hidden=false;current=null;}
}
export function resetVideoFeed(){
  observer?.disconnect();observer=null;stopActiveVideo();
}
function getObserver(){
  if(!('IntersectionObserver' in window))return null;
  if(observer)return observer;
  observer=new IntersectionObserver(entries=>{
    if(!autoplayAllowed)return;
    for(const entry of entries){
      const control=players.get(entry.target);
      if(!control)continue;
      if(entry.intersectionRatio>=.8&&entry.isIntersecting)control.start(true);
      else if(current===control&&entry.intersectionRatio<.3)stopActiveVideo();
    }
  },{threshold:[0,.3,.8]});
  return observer;
}
export function createVideoCard(post,api){
  const root=document.createElement('div');root.className='video-card';
  const image=document.createElement('img');
  image.src=post.videoPosterUrl;image.alt='Thumbnail for '+post.author.name+' video';
  image.loading='lazy';image.className='video-poster-image';
  const poster=document.createElement('button');poster.type='button';
  poster.className='video-poster';poster.setAttribute('aria-label','Play video by '+post.author.name);
  const triangle=document.createElement('span');triangle.className='video-play-symbol';triangle.textContent='▶';
  const duration=document.createElement('span');duration.className='video-duration';
  duration.textContent=post.videoDuration?Math.ceil(post.videoDuration)+'s':'Video';
  poster.append(image,triangle,duration);root.append(poster);
  const control={root,poster,player:null,starting:false,async start(auto=false){
    if(control.starting||control.player)return;
    control.starting=true;
    try{
      // Never preload a video URL: request a short-lived signed link only when playing.
      const response=await api('/videos/'+encodeURIComponent(post.videoId)+'/playback'+(auto?'?autoplay=1':''));
      if(!root.isConnected||(auto&&!autoplayAllowed))return;
      stopActiveVideo();
      const iframe=document.createElement('iframe');
      iframe.className='video-frame';iframe.title='KV Social video by '+post.author.name;
      iframe.allow='autoplay; fullscreen; picture-in-picture';
      iframe.referrerPolicy='strict-origin-when-cross-origin';
      iframe.allowFullscreen=true;
      iframe.src=response.url;
      root.append(iframe);poster.hidden=true;control.player=iframe;current=control;
    }catch{
      if(!auto){const error=document.createElement('p');error.className='review-meta';error.textContent='Video is unavailable. Try again shortly.';root.append(error);}
    }finally{control.starting=false;}
  }};
  players.set(root,control);
  poster.addEventListener('click',()=>control.start(false));
  getObserver()?.observe(root);
  return root;
}
