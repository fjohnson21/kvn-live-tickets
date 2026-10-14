import {inspectVideo,uploadVideo} from './video.js';
import {createVideoCard,resetVideoFeed,setVideoAutoplay} from './video-player.js';
const $=s=>document.querySelector(s);
const state={session:null,feed:null,view:'feed',filter:'All',reviewTab:'Pending',renderId:0,videoEnabled:false,autoplay:localStorage.getItem('kvSocialDataSaver')!=='1'};
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const button=(text,cls,fn,label)=>{const b=node('button',cls,text);b.type='button';if(label)b.setAttribute('aria-label',label);b.addEventListener('click',fn);return b};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5000);}
async function api(path,method='GET',data){
 const response=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json',...(state.session?{'X-CSRF-Token':state.session.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 const result=await response.json();if(!response.ok){if(response.status===401&&path!=='/session'){state.session=null;$('#shell').hidden=true;$('#login').hidden=false;$('#signout').hidden=true;$('#modal').close();}throw Error(result.error||'Please try again.');}return result;
}
function showModal(title){const root=$('#modal-body');root.replaceChildren(node('h2','',title));if(!$('#modal').open)$('#modal').showModal();return root;}
$('#close-modal').onclick=()=>$('#modal').close();
function field(form,label,name,type='textarea',options=[]){const id='field-'+name;const l=node('label','',label);l.htmlFor=id;let e;
 if(type==='select'){e=node('select');for(const [value,label]of options){const o=node('option','',label);o.value=value;e.append(o)}}else e=node(type==='textarea'?'textarea':'input');
 e.id=id;e.name=name;e.required=true;if(type==='textarea')e.maxLength=2000;form.append(l,e);return e;
}
function submitForm(root,text,handler){const form=node('form');const error=node('p','error');error.setAttribute('role','alert');const submit=node('button','primary',text);submit.type='submit';const actions=node('div','form-actions');actions.append(submit);form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{await handler(new FormData(form));}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}});root.append(form);return {form,finish(){form.append(error,actions);},actions};}
async function act(fn){try{await fn()}catch(e){toast(e.message)}}
async function preparePhoto(file){
 if(!file||!file.size)return '';
 if(!String(file.type||'').startsWith('image/'))throw Error('Choose a photo file.');
 if(file.size>10*1024*1024)throw Error('Choose a photo smaller than 10 MB.');
 const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Unable to read this photo.'));reader.readAsDataURL(file);});
 const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Unable to read this photo.'));img.src=source;});
 const max=1280,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
 if(!blob||blob.size>1_200_000)throw Error('This photo is still too large after processing. Try a smaller image.');
 return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Unable to prepare this photo.'));reader.readAsDataURL(blob);});
}
function finish(message){$('#modal').close();toast(message);return render();}
async function loginReady(s){state.session=s;state.view='feed';state.filter='All';state.reviewTab='Pending';$('#login').hidden=true;$('#shell').hidden=false;$('#signout').hidden=false;$('#owner-nav').hidden=s.role!=='owner';$('#my-avatar').textContent=s.user.initials;setVideoAutoplay(state.autoplay);try{const features=await api('/videos/capabilities');state.videoEnabled=!!features.enabled;}catch{state.videoEnabled=false;}return render();}
function authView(register=false){$('#login-form').hidden=register;$('#register-form').hidden=!register;$('#show-login').classList.toggle('active',!register);$('#show-register').classList.toggle('active',register);$('#login-error').textContent='';$('#register-error').textContent='';}
$('#show-login').onclick=()=>authView(false);$('#show-register').onclick=()=>authView(true);
function forgotPasswordModal(){const root=showModal('Reset your password');root.append(node('p','muted','Enter your KV Social email. If the account exists, we’ll send a secure reset link.'));const f=submitForm(root,'Send reset link',async d=>{await api('/password/forgot','POST',{email:d.get('email')});$('#modal').close();toast('If that email is registered, a reset link is on the way.');});const email=field(f.form,'Email','email','input');email.type='email';email.autocomplete='email';email.value=$('#login-email').value||'';f.finish();}
function resetPasswordModal(token){const root=showModal('Choose a new password');root.append(node('p','muted','Use at least 12 characters. This reset link works once.'));const f=submitForm(root,'Update password',async d=>{await api('/password/reset','POST',{token,password:d.get('password')});history.replaceState({},'',location.pathname);$('#modal').close();$('#auth-notice').hidden=false;$('#auth-notice').textContent='Password updated. Sign in with your new password.';});const password=field(f.form,'New password','password','input');password.type='password';password.autocomplete='new-password';password.minLength=12;password.maxLength=200;f.finish();}
$('#forgot-password').onclick=forgotPasswordModal;
$('#resend-verification').onclick=()=>act(async()=>{const email=$('#login-email').value;if(!email)throw Error('Enter your email first.');await api('/resend-verification','POST',{email});$('#auth-notice').hidden=false;$('#auth-notice').textContent='If this account is awaiting verification, a new email is on the way.';});
$('#login-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('#login-error').textContent='';try{const s=await api('/login','POST',{email:$('#login-email').value,password:$('#login-password').value});$('#login-password').value='';await loginReady(s);}catch(err){$('#login-error').textContent=err.message;}finally{b.disabled=false;}};
$('#register-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('#register-error').textContent='';try{const s=await api('/register','POST',{name:$('#register-name').value,email:$('#register-email').value,password:$('#register-password').value,inviteCode:$('#invite-code').value,communityAgreement:$('#community-agreement').checked});$('#register-password').value='';$('#invite-code').value='';if(s.verificationRequired){$('#login-email').value=s.email||$('#register-email').value;authView(false);$('#auth-notice').hidden=false;$('#auth-notice').textContent=s.deliveryPending?'Your account was created, but the verification email is delayed. Use Resend verification.':'Check your email to verify your KV Social account, then sign in.';}else await loginReady(s);}catch(err){$('#register-error').textContent=err.message;}finally{b.disabled=false;}};
$('#signout').onclick=()=>act(async()=>{await api('/logout','POST',{});resetVideoFeed();state.renderId++;state.session=null;state.feed=null;$('#shell').hidden=true;$('#login').hidden=false;$('#signout').hidden=true;$('#content').replaceChildren();});
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{state.view=b.dataset.view;state.filter='All';act(render);};
$('#compose').onclick=()=>compose();
function compose(parent=null,edit=null){
 const root=showModal(edit?'Edit your message':parent?'Join the conversation':'Share something meaningful');root.append(node('p','muted','Your message remains private until a human reviewer approves it. Respectful disagreement is welcome.'));
 let photoInput=null,videoInput=null,progress=null;
 const f=submitForm(root,edit?'Save for review':'Submit for review',async data=>{
  const file=videoInput?.files?.[0],photo=photoInput?.files?.[0];
  if(file&&photo)throw Error('Choose a video or a photo, not both.');
  let videoId='';
  if(file){
    if(!state.videoEnabled)throw Error('Video uploads are not enabled yet.');
    const inspected=await inspectVideo(file);
    const grant=await api('/videos/start','POST',{name:file.name.slice(0,120),bytes:file.size,mime:file.type});
    progress.textContent='Uploading video…';
    await uploadVideo(file,grant,n=>progress.textContent='Uploading video… '+n+'%');
    progress.textContent='Processing your video and thumbnail…';
    let result=null;
    for(let attempt=0;attempt<45;attempt++){
      try{result=await api('/videos/'+encodeURIComponent(grant.videoId)+'/complete','POST',{poster:inspected.poster});break;}
      catch(error){if(!error.message.includes('still processing'))throw error;await new Promise(resolve=>setTimeout(resolve,2000));}
    }
    if(!result)throw Error('Video is still processing. Try again after the upload finishes.');
    videoId=result.videoId;
  }
  const photoData=photo?await preparePhoto(photo):'';
  const body={text:data.get('text'),topic:data.get('topic')||parent?.topic||'Kingdom Culture',theme:data.get('theme')||'none',...(parent?{parentId:parent.id}:{}),...(photoData?{photoData}:{}),...(videoId?{videoId}:{})};
  await api(edit?`/posts/${edit.id}`:'/posts',edit?'PATCH':'POST',edit?{text:body.text}:body);await finish('Submitted for human review.');
 });const text=field(f.form,'Your message','text');text.value=edit?.text||'';text.placeholder='A testimony. A prayer request. A song. A little encouragement.';
 const count=node('p','count',`${text.value.length} / 2,000`);text.oninput=()=>count.textContent=`${text.value.length} / 2,000`;f.form.append(count);
 if(!parent&&!edit){
  field(f.form,'Feed','topic','select',['Kingdom Culture','Testimonies','Prayer Requests','Music','KV Live'].map(x=>[x,x]));
  field(f.form,'Visual style','theme','select',[['none','Text only'],['sound','Sound — monochrome'],['gather','Together — warm neutral'],['live','KV Live — deep red']]);
  const label=node('label','','Photo (optional)');label.htmlFor='post-photo';photoInput=node('input');photoInput.id='post-photo';photoInput.type='file';photoInput.accept='image/*';photoInput.setAttribute('aria-describedby','photo-note');f.form.append(label,photoInput,node('p','review-meta','Photos are resized on your phone and remain private until a moderator approves the post.'));f.form.lastChild.id='photo-note';
  const vl=node('label','','Short video · up to 60 seconds (optional)');vl.htmlFor='post-video';
  videoInput=node('input');videoInput.id='post-video';videoInput.type='file';videoInput.accept='video/mp4,video/quicktime,video/webm';videoInput.disabled=!state.videoEnabled;
  progress=node('p','review-meta',state.videoEnabled?'Video stays private until a human reviewer approves the post. Choose either a photo or video.':'Video uploads are being prepared for the private beta. Photos and text are available.');
  progress.setAttribute('role','status');f.form.append(vl,videoInput,progress);
 }
 f.finish();text.focus();
}
function guidelines(){const r=showModal('A community with purpose.');
 const rules=[['Make room for disagreement.','You can critique a performance, opinion or event respectfully. Negative sentiment alone is not a violation.'],['Protect people.','No targeted harassment, hateful attacks, threats, derogatory abuse, sexual exploitation, doxxing, impersonation or spam.'],['Pause before publishing.','Every beta post, comment and edit is reviewed. Automated signals help prioritize review; they do not decide guilt.'],['Speak up safely.','Report a concern privately or block an account. Reports do not automatically remove content. Authors receive reasons and may appeal a removal.'],['Protect your privacy.','Do not post private addresses, phone numbers, financial information or another person’s personal details.'],['Know the limits.','KV Social is an invited beta, not an emergency service. Posts and comments require human review before publication.']];
 for(const [h,p]of rules){r.append(node('h3','',h),node('p','',p));}
}
$('#guidelines').onclick=guidelines;
function profile(user){const r=showModal(user.name);r.append(node('span','avatar',user.initials),node('p','',user.bio));if(user.id!==state.session.user.id){const blocked=state.feed.blocked.includes(user.id);r.append(button(blocked?'Unblock account':'Block account','secondary',()=>act(async()=>{await api('/blocks','POST',{authorId:user.id,blocked:!blocked});await finish(blocked?'Account unblocked.':'Account blocked from your feed.');})));}}
function heading(title,subtitle){$('#view-heading').append(node('h1','section-heading',title),node('p','section-lead',subtitle));}
async function render(){
 if(!state.session)return;resetVideoFeed();const renderId=++state.renderId;$('#content').setAttribute('aria-busy','true');
 try{
  const feed=await api('/feed');if(renderId!==state.renderId||!state.session)return;state.feed=feed;const feedView=['feed','saved'].includes(state.view);$('#intro').hidden=state.view!=='feed';$('#compose').hidden=!feedView;$('#filters').replaceChildren();$('#view-heading').replaceChildren();$('#content').replaceChildren();
  for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b.dataset.view===state.view);
  renderArtists();
  if(feedView){if(state.view==='saved')heading('Saved moments.','The stories you want to come back to. Saved to your KV Social account.');
   const dataToggle=button(state.autoplay?'Video autoplay: On':'Data Saver: On','chip',()=>{state.autoplay=!state.autoplay;localStorage.setItem('kvSocialDataSaver',state.autoplay?'0':'1');setVideoAutoplay(state.autoplay);act(render);});dataToggle.setAttribute('aria-pressed',String(!state.autoplay));$('#filters').append(dataToggle);
   for(const topic of ['All',...state.feed.topics]){const b=button(topic,'chip'+(state.filter===topic?' selected':''),()=>{state.filter=topic;act(render)});b.setAttribute('aria-pressed',String(state.filter===topic));$('#filters').append(b);}
   const posts=state.feed.posts.filter(p=>!p.parentId&&(state.view!=='saved'||p.saved)&&(state.filter==='All'||p.topic===state.filter||p.artist===state.filter||p.text.includes(state.filter)));
   if(!posts.length)$('#content').append(node('div','empty','No moments here yet. Explore the community feed or share something meaningful.'));
   for(const p of posts)$('#content').append(postCard(p));
  }else if(state.view==='activity')await activity(renderId);else if(state.view==='profile')await myProfile(renderId);else await moderation(renderId);
 }finally{if(renderId===state.renderId)$('#content').setAttribute('aria-busy','false');}
}
function artistModal(name){const root=showModal(name);root.append(node('p','','Featured worship leader · KV Editorial spotlight'),node('p','','This is a KV-curated artist spotlight, not an artist-owned account. Artist-owned profiles can be verified in a later release.'),button('View artist posts','primary',()=>{state.view='feed';state.filter=name;$('#modal').close();act(render)}),button('Start a music conversation','secondary',()=>compose()));}
function renderArtists(){const r=$('#artist-list'),mobile=$('#mobile-artists');r.replaceChildren();mobile.replaceChildren();mobile.hidden=state.view!=='feed';for(const name of ['Imani Raeford','Jalisa Faye','Yael Hilton']){const b=button('','artist',()=>artistModal(name));b.append(node('span','avatar light',name.split(' ').map(n=>n[0]).join('')));const text=node('div');text.append(node('strong','',name),node('small','','Worship · Artist spotlight'));b.append(text,node('span','','↗'));r.append(b);mobile.append(button(name+' ↗','chip',()=>artistModal(name),'Discover '+name));}}
function postCard(p){const card=node('article','post');const head=node('div','post-head');const avatar=button(p.author.initials,'avatar',()=>profile(p.author),'View profile for '+p.author.name);const by=node('div','post-byline');by.append(button(p.author.name,'author-button',()=>profile(p.author)),node('div','post-meta',p.sample?'KV Editorial · Official network post':new Date(p.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' · Community'));head.append(avatar,by,node('span','tag',p.topic));card.append(head);
 if(p.hasVideo){card.append(createVideoCard(p,api));}else if(p.mediaUrl){const img=node('img','post-photo');img.src=p.mediaUrl;img.alt='Photo shared with this KV Social post';img.loading='lazy';card.append(img);}else if(p.theme!=='none'){const art=node('div','art '+p.theme);art.append(node('span','art-kicker',p.eyebrow||'A MOMENT FOR THE COMMUNITY'),node('div','art-title',p.title||'Faith. Purpose.\nCommunity. Impact.'),node('span','art-footer',p.artist||'KINGDOM VIBE NETWORK'));card.append(art);}
 card.append(node('p','post-text',p.text));const tools=node('div','post-tools');
 const reaction=button('','tool'+(p.liked?' on':''),()=>act(async()=>{await api(`/posts/${p.id}/react`,'POST',{});await render()}),p.liked?'Appreciated':'Appreciate');reaction.setAttribute('aria-pressed',String(p.liked));reaction.append(node('span','symbol',p.liked?'♥':'♡'),node('span','',p.reactions?String(p.reactions):'Appreciate'));
 const comments=state.feed.posts.filter(c=>c.parentId===p.id);const conversation=button('','tool',()=>conversationModal(p),'View conversation');conversation.append(node('span','symbol','◯'),node('span','',comments.length?String(comments.length):'Respond'));
 const share=button('↗','tool',()=>act(async()=>{await navigator.clipboard.writeText('KV Social: '+p.text);toast('Post text copied.')}),'Copy post text');
 const save=button(p.saved?'▰':'▱','tool save'+(p.saved?' on':''),()=>act(async()=>{await api(`/posts/${p.id}/save`,'POST',{});await render()}),p.saved?'Unsave post':'Save post');save.setAttribute('aria-pressed',String(p.saved));tools.append(reaction,conversation,share,save);card.append(tools);
 const bottom=node('div','post-bottom');bottom.append(node('span','sample-label',p.sample?'KV EDITORIAL':'HUMAN-REVIEWED · KV SOCIAL BETA'),button('Report','text-btn',()=>reportModal(p),'Report post'));card.append(bottom);return card;}
function conversationModal(p){const r=showModal('Keep the conversation going.');r.append(node('p','',p.text));const comments=state.feed.posts.filter(c=>c.parentId===p.id);if(!comments.length)r.append(node('p','muted','Be the first to share a thoughtful response. Comments are reviewed before appearing.'));for(const c of comments){const e=node('div','comment');e.append(node('strong','small',c.author.name),node('p','',c.text),button('Report comment','text-btn',()=>reportModal(c)));r.append(e);}r.append(button('Write a response','primary',()=>compose(p)));}
function reportModal(p){const r=showModal('Help keep this space welcoming.');r.append(node('p','','Your report is private to moderators. Constructive criticism is allowed. Reporting alone does not remove a post.'));const f=submitForm(r,'Send private report',async data=>{await api(`/posts/${p.id}/report`,'POST',{category:data.get('category'),reason:data.get('reason')});await finish('Report sent privately to the review desk.');});field(f.form,'Concern','category','select',['harassment','hate','threats','spam','derogatory','privacy','sexual','other'].map(s=>[s,s[0].toUpperCase()+s.slice(1)]));field(f.form,'What should we review?','reason').maxLength=500;f.finish();}
async function activity(renderId){heading('Your voice matters.','Follow your submissions, read decisions, and ask for another look.');const data=await api('/activity');if(renderId!==state.renderId||!state.session)return;if(!data.posts.length)$('#content').append(node('div','empty','Your story starts here. Share something meaningful.'));
 for(const p of data.posts.slice().reverse()){const c=node('article','review-card');c.append(node('span','status '+p.status,p.status),node('p','',p.text),node('p','review-meta',p.reason||'Waiting for human review. No public publication.'));const actions=node('div','form-actions');actions.append(button('Edit message','secondary',()=>compose(null,p)));
 const appeal=data.appeals.findLast(a=>a.postId===p.id);if(appeal)c.append(node('p','review-note',appeal.status==='pending'?'Appeal pending human review.':`Appeal ${appeal.resolution}: ${appeal.explanation}`));
 if(['hidden','removed'].includes(p.status)&&!data.appeals.some(a=>a.postId===p.id&&a.decisionVersion===p.version))actions.append(button('Appeal decision','secondary',()=>appealModal(p)));c.append(actions);$('#content').append(c);}
 const blocked=state.feed.users.filter(u=>state.feed.blocked.includes(u.id));if(blocked.length){$('#content').append(node('h2','','Blocked accounts'));for(const u of blocked)$('#content').append(button('Unblock '+u.name,'secondary',()=>act(async()=>{await api('/blocks','POST',{authorId:u.id,blocked:false});await render()})));}
}

async function myProfile(renderId){heading('My profile.','How you show up in the KV Social community.');if(renderId!==state.renderId||!state.session)return;const u=state.session.user,c=node('section','profile-card');c.append(node('span','avatar',u.initials),node('h2','',u.name),node('p','muted',u.email),node('p','',u.bio||'Add a short bio so the community can know you.'));const edit=button('Edit profile','primary',()=>{const r=showModal('Edit your profile');const f=submitForm(r,'Save profile',async d=>{const result=await api('/profile','PATCH',{name:d.get('name'),bio:d.get('bio')});state.session.user=result.user;$('#my-avatar').textContent=result.user.initials;await finish('Profile updated.');});const name=field(f.form,'Display name','name','input');name.value=u.name;name.maxLength=80;const bio=field(f.form,'Bio','bio');bio.required=false;bio.maxLength=300;bio.value=u.bio||'';f.finish();});c.append(edit);$('#content').append(c);}
function appealModal(p){const r=showModal('Ask for another look.');r.append(node('p','review-note',p.reason));const f=submitForm(r,'Submit appeal',async d=>{await api(`/posts/${p.id}/appeal`,'POST',{reason:d.get('reason')});await finish('Appeal received. A human reviewer will reconsider.');});field(f.form,'Why should we reconsider?','reason').maxLength=1000;f.finish();}
async function moderation(renderId){heading('The review desk.','Context before conclusions. Protect people and make room for respectful criticism.');const data=await api('/moderation');if(renderId!==state.renderId||!state.session)return;const stats=node('div','stats');for(const [label,n]of [['Pending',data.posts.filter(p=>p.status==='pending').length],['Open reports',data.reports.filter(r=>r.status==='open').length],['Open appeals',data.appeals.filter(a=>a.status==='pending').length]]){const e=node('div','stat');e.append(node('strong','',String(n)),node('span','',label));stats.append(e);}$('#content').append(stats);
 for(const tab of ['Pending','Reports','Appeals','All content','Accounts','Audit'])$('#filters').append(button(tab,'chip'+(state.reviewTab===tab?' selected':''),()=>{state.reviewTab=tab;act(render)}));
 if(state.reviewTab==='Audit'){for(const a of data.audit.slice().reverse())$('#content').append(node('div','audit-row',`${new Date(a.at).toLocaleString()} · ${a.actor} · ${a.action}\n${a.reason}`));return;}
 if(state.reviewTab==='Accounts'){for(const u of data.users.filter(u=>u.role==='member')){const c=node('article','review-card');c.append(node('h3','',u.name),node('p','',u.suspended?'Posting suspended':'Active member'),button(u.suspended?'Reinstate account':'Suspend account','secondary',()=>suspendModal(u)));$('#content').append(c);}return;}
 if(state.reviewTab==='Appeals'){const appeals=data.appeals.filter(a=>a.status==='pending');if(!appeals.length)$('#content').append(node('div','empty','No open appeals.'));for(const a of appeals){const p=data.posts.find(p=>p.id===a.postId);const c=node('article','review-card');c.append(node('span','status','Appeal pending'),node('p','',p.text),node('p','review-note',a.reason),button('Review appeal','secondary',()=>reviewModal(p,data,a)));$('#content').append(c);}return;}
 const posts=data.posts.filter(p=>state.reviewTab==='Pending'?p.status==='pending':state.reviewTab==='Reports'?data.reports.some(r=>r.postId===p.id&&r.status==='open'):true);
 if(!posts.length)$('#content').append(node('div','empty','All clear in this queue.'));
 for(const p of posts){const c=node('article','review-card');c.append(node('span','status '+p.status,p.status),node('p','review-meta',p.author.name+(p.parentId?' · Comment':'')),node('p','',p.text),node('p','review-note',p.signals.length?'Review signals: '+p.signals.join(', '):'No automated signals. Human context review is still required.'),button('Review post','secondary',()=>reviewModal(p,data)));$('#content').append(c);}
}
function reviewModal(p,data,appeal=null){const r=showModal(appeal?'Reconsider this decision.':'Review with context.');if(p.hasVideo){r.append(createVideoCard(p,api));}if(p.mediaUrl){const img=node('img','post-photo');img.src=p.mediaUrl;img.alt='Photo submitted with this post';r.append(img);}r.append(node('p','',p.text),node('p','review-meta',`Author: ${p.author.name} · Version ${p.version}`));if(p.parentId){const parent=data.posts.find(x=>x.id===p.parentId);r.append(node('p','review-note','Parent conversation: '+(parent?.text||'Unavailable')));}
 if(appeal)r.append(node('p','review-note','Author’s appeal: '+appeal.reason));else{r.append(node('p','review-note','Signals are not proof. Respectful criticism, disagreement, and negative reviews may remain.'));for(const report of data.reports.filter(x=>x.postId===p.id&&x.status==='open'))r.append(node('p','review-note',`Private report · ${report.category}: ${report.reason}`));}
 const form=node('form');const reason=field(form,'Decision reason','reason');reason.maxLength=500;reason.placeholder='Explain the policy and context. The author will see this reason.';const error=node('p','error');error.setAttribute('role','alert');const actions=node('div','form-actions');
 for(const [action,label]of (appeal?[['restore','Restore post'],['uphold','Uphold removal']]:[['approve','Approve post'],['hide','Hide post'],['remove','Remove post']]))actions.append(button(label,action==='approve'||action==='restore'?'primary':'secondary',async()=>{
  if(!form.reportValidity())return;for(const b of actions.children)b.disabled=true;error.textContent='';try{await api(appeal?`/appeals/${appeal.id}/resolve`:`/posts/${p.id}/review`,'POST',{action,reason:reason.value,version:p.version});await finish(appeal?'Appeal decision recorded.':'Decision recorded.');}catch(e){error.textContent=e.message;}finally{for(const b of actions.children)b.disabled=false;}
 }));form.onsubmit=e=>e.preventDefault();form.append(error,actions);r.append(form);
}
function suspendModal(u){const r=showModal(u.suspended?'Reinstate this account?':'Suspend posting?');r.append(node('p','',u.name),node('p','','Suspension hides this account’s published content and prevents new posts. The member can still read decisions and appeal. Reinstatement makes previously published content visible again.'));const f=submitForm(r,u.suspended?'Reinstate account':'Suspend account',async d=>{await api(`/users/${u.id}/suspend`,'POST',{suspended:!u.suspended,reason:d.get('reason')});await finish('Account decision recorded.');});field(f.form,'Decision reason','reason').maxLength=500;f.finish();}
function verifyEmailModal(token){
 const root=showModal('Confirm your email');
 root.append(node('p','muted','Confirm that you want to verify this email address and activate your KV Social account. No account change occurs until you press the button.'));
 const action=button('Confirm my email','primary',()=>act(async()=>{
  action.disabled=true;
  try{
   await api('/verify-email','POST',{token});
   $('#modal').close();
   $('#auth-notice').hidden=false;
   $('#auth-notice').textContent='Email verified. You can sign in now.';
  }catch(error){
   root.append(node('p','error',error.message));
  }finally{action.disabled=false;}
 }));
 root.append(action);
}
const authParams=new URLSearchParams(location.search);
const verifyToken=authParams.get('verify'),resetToken=authParams.get('reset');
if(verifyToken||resetToken)history.replaceState({},'',location.pathname);
if(verifyToken){
 authView(false);
 setTimeout(()=>verifyEmailModal(verifyToken),0);
}else if(resetToken){
 setTimeout(()=>resetPasswordModal(resetToken),0);
}
api('/session').then(loginReady).catch(()=>{});
