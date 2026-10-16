import test from 'node:test';
import assert from 'node:assert/strict';
test('video selection validates size, format and exact duration bounds',async()=>{
 const {validateVideoSelection}=await import('../social-app/public/video-ui.js');
 for(const duration of [29,61,NaN,Infinity])assert.throws(()=>validateVideoSelection({size:100,type:'video/mp4'},duration),/30–60/);
 for(const duration of [30,60])assert.doesNotThrow(()=>validateVideoSelection({size:100,type:'video/mp4'},duration));
 assert.throws(()=>validateVideoSelection({size:101*1024*1024,type:'video/mp4'},30),/100 MB/);
 assert.throws(()=>validateVideoSelection({size:100,type:'text/html'},30),/MP4/);
});

test('cancellation during processing status cannot return a publishable video',async t=>{
 const {uploadVideo}=await import('../social-app/public/video-ui.js');
 const controller=new AbortController();
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={createElement:()=>({duration:45,removeAttribute(){},load(){},set src(value){queueMicrotask(()=>this.onloadedmetadata());}})};
 globalThis.window={tus:{Upload:class{constructor(file,options){this.options=options;}start(){this.options.onSuccess();}abort(){}}}};
 t.after(()=>{globalThis.document=oldDocument;globalThis.window=oldWindow;});
 const file=new Blob(['video'],{type:'video/mp4'});
 const api=async(path,method)=>{if(method==='POST')return{videoId:'test-id'};controller.abort();return{ready:true,duration:45};};
 await assert.rejects(uploadVideo(file,api,()=>{},controller.signal),/cancelled/);
});
