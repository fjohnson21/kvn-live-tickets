// Browser-to-provider video upload. No KVN server ever receives the raw video bytes.
// Bunny upload grants are short-lived and issued to the authenticated author only.
const tusHeaders=grant=>({
  AuthorizationSignature:grant.signature,
  AuthorizationExpire:String(grant.expires),
  LibraryId:String(grant.libraryId),
  VideoId:grant.videoId,
  'Tus-Resumable':'1.0.0'
});
const encodeMeta=value=>btoa(String.fromCharCode(...new TextEncoder().encode(value)));

export async function inspectVideo(file){
  if(!file||file.size<10_000||file.size>100_000_000)throw Error('Choose a video between 10 KB and 100 MB.');
  if(!['video/mp4','video/quicktime','video/webm'].includes(file.type))throw Error('Choose an MP4, MOV or WebM video.');
  const url=URL.createObjectURL(file),video=document.createElement('video');
  video.muted=true;video.playsInline=true;video.preload='auto';video.src=url;
  try{
    await new Promise((resolve,reject)=>{
      video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Unable to read the video. Try MP4.'));
    });
    if(!Number.isFinite(video.duration)||video.duration<1||video.duration>60)throw Error('KV Social videos must be 60 seconds or shorter.');
    const seek=Math.min(1,Math.max(.1,video.duration/3));
    if(video.seekable.length&&seek>0){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Unable to generate a thumbnail.')),5000);
        video.onseeked=()=>{clearTimeout(timer);resolve();};
        video.currentTime=seek;
      });
    }
    const width=Math.max(1,Math.min(480,video.videoWidth));
    const height=Math.max(1,Math.round(width*video.videoHeight/video.videoWidth));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(video,0,0,width,height);
    let poster=canvas.toDataURL('image/jpeg',.62);
    if(poster.length>140_000)poster=canvas.toDataURL('image/jpeg',.3);
    if(poster.length>140_000)throw Error('Could not prepare a lightweight video thumbnail.');
    return {poster,duration:video.duration};
  }finally{
    video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
  }
}

export async function uploadVideo(file,grant,onProgress=()=>{}){
  if(!grant||grant.endpoint!=='https://video.bunnycdn.com/tusupload')throw Error('Video upload endpoint is invalid.');
  const headers=tusHeaders(grant);
  const created=await fetch(grant.endpoint,{
    method:'POST',
    headers:{...headers,'Upload-Length':String(file.size),
      'Upload-Metadata':'filename '+encodeMeta(file.name)+',filetype '+encodeMeta(file.type)},
  });
  if(!created.ok)throw Error('Unable to start video upload. Try again.');
  const location=created.headers.get('Location');
  const target=new URL(location||'',grant.endpoint);
  if(target.protocol!=='https:'||target.hostname!=='video.bunnycdn.com')throw Error('Video upload destination is invalid.');
  let offset=Number(created.headers.get('Upload-Offset')||0);
  const size=5*1024*1024;
  while(offset<file.size){
    const end=Math.min(file.size,offset+size);
    let response;
    for(let attempt=0;attempt<3;attempt++){
      try{
        response=await fetch(target.href,{
          method:'PATCH',headers:{...headers,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)},
          body:file.slice(offset,end)
        });
      }catch{response=null;}
      if(response?.ok)break;
      if(attempt===2)throw Error('Video upload interrupted. Try again on a stable connection.');
      const check=await fetch(target.href,{method:'HEAD',headers});
      if(!check.ok)throw Error('Unable to resume video upload.');
      offset=Number(check.headers.get('Upload-Offset')||offset);
    }
    const next=Number(response.headers.get('Upload-Offset')||end);
    if(!Number.isInteger(next)||next<=offset||next>file.size)throw Error('Video upload did not advance.');
    offset=next;
    onProgress(Math.round(100*offset/file.size));
  }
  return {ok:true};
}
