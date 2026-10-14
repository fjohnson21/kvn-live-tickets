import express from 'express';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createFileStore,createPostgresStore} from './store.js';
import {createSocialMailer} from './email.js';
import {categories,topics,validateText,screenContent} from './policy.js';
import {hashPassword,normalizeEmail,profileInitials,safeSecret,validateDisplayName,validatePassword,verifyPassword} from './auth.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const exact=(body,allowed)=>{
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(key=>!allowed.includes(key)))throw fail(400,'Unexpected fields.');
};
const cleanBio=value=>{
  const bio=String(value||'').trim().replace(/\r/g,'');
  if(bio.length>300||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(bio))throw fail(400,'Bio must be 300 characters or fewer.');
  return bio;
};
const cookies=header=>Object.fromEntries(String(header||'').split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const at=part.indexOf('=');return at<0?[part,'']:[part.slice(0,at),part.slice(at+1)];}));
const hashToken=value=>createHash('sha256').update(String(value)).digest('hex');

export function createSocialApp({
  dataDir,
  databaseUrl,
  ownerEmail,
  ownerPassword,
  inviteCode,
  resendApiKey,
  emailFrom,
  mailer,
  production=process.env.NODE_ENV==='production',
  sessionMs=7*24*60*60*1000,
  now=Date.now
}={}){
  if(!inviteCode||String(inviteCode).length<10)throw new Error('KV_SOCIAL_INVITE_CODE must be configured for the invited beta.');
  if(production&&!databaseUrl)throw new Error('DATABASE_URL is required for KV Social production.');
  const db=databaseUrl
    ? createPostgresStore({connectionString:databaseUrl,ownerEmail,ownerPassword})
    : createFileStore({dataDir,ownerEmail,ownerPassword});
  const ready=Promise.resolve(db.bootstrap());
  const sendAccountEmail=mailer||(resendApiKey?createSocialMailer({apiKey:resendApiKey,from:emailFrom}):null);
  const verificationEnabled=production||!!sendAccountEmail;

  const app=express(),sessions=new Map(),limits=new Map();
  const cookieName=production?'__Host-kv_social_session':'kv_social_session';
  app.disable('x-powered-by');
  app.set('trust proxy',true);

  function rate(key,max,windowMs=60_000){
    const current=now();
    for(const [k,value] of limits)if(value.until<=current)limits.delete(k);
    const value=limits.get(key)||{count:0,until:current+windowMs};
    if(limits.size>=10_000&&!limits.has(key))throw fail(503,'Community service is busy. Try again shortly.');
    value.count+=1;limits.set(key,value);
    if(value.count>max)throw fail(429,'Please slow down and try again.');
  }
  const read=()=>db.read();
  const write=state=>db.write(state);
  const getUser=(state,id)=>state.users.find(user=>user.id===id);
  const getPost=(state,id)=>{const post=state.posts.find(item=>item.id===id);if(!post)throw fail(404,'Post not found.');return post;};
  const publicUser=user=>({id:user.id,name:user.name,bio:user.bio||'',initials:user.initials||profileInitials(user.name),suspended:!!user.suspended,role:user.role==='system'?'system':user.role==='owner'?'owner':'member'});
  const sessionUser=user=>({...publicUser(user),email:user.email||'',emailVerified:user.emailVerified===true});
  const isBlocked=(state,userId,authorId)=>state.blocks.some(item=>item.userId===userId&&item.authorId===authorId);
  const visible=(state,post,userId)=>{
    const author=getUser(state,post.authorId);
    if(post.status!=='published'||author?.suspended||isBlocked(state,userId,post.authorId))return false;
    if(post.parentId){
      const parent=state.posts.find(item=>item.id===post.parentId);
      if(!parent||parent.status!=='published')return false;
      const parentAuthor=getUser(state,parent.authorId);
      if(parentAuthor?.suspended||isBlocked(state,userId,parent.authorId))return false;
    }
    return true;
  };
  const publicPost=(state,post,userId)=>({
    id:post.id,authorId:post.authorId,author:publicUser(getUser(state,post.authorId)||{id:'unknown',name:'Unknown',role:'system'}),
    text:post.text,topic:post.topic,artist:post.artist||'',theme:post.theme||'none',title:post.title||'',eyebrow:post.eyebrow||'',
    sample:!!post.sample,parentId:post.parentId||null,createdAt:post.createdAt,mediaUrl:post.mediaId?`/api/media/${post.mediaId}`:'',reactions:(post.reactions||[]).length,
    liked:(post.reactions||[]).includes(userId),saved:(post.saves||[]).includes(userId),version:post.version
  });
  const privatePost=(state,post)=>({...publicPost(state,post,''),status:post.status,signals:post.signals||[],reason:post.reason||'',version:post.version});
  const audit=(state,actor,action,targetId,reason)=>state.audit.push({id:randomUUID(),actor,action,targetId,reason,at:new Date(now()).toISOString()});
  const active=req=>{if(req.user.suspended)throw fail(403,'Posting is suspended. You may still appeal a moderation decision.');};
  const owner=req=>{if(req.user.role!=='owner')throw fail(403,'Moderator access required.');};

  function savePhoto(dataUrl,id,state){
    if(!dataUrl)return null;
    if(typeof dataUrl!=='string')throw fail(400,'Photo upload is invalid.');
    const match=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if(!match)throw fail(400,'Photos must be processed as JPEG images.');
    const bytes=Buffer.from(match[1],'base64');
    if(bytes.length<100||bytes.length>1_200_000)throw fail(400,'Photo must be between 100 bytes and 1.2 MB after processing.');
    if(bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)throw fail(400,'Photo file signature is invalid.');
    state.media=state.media||[];
    state.media=state.media.filter(item=>item.id!==id);
    state.media.push({id,contentType:'image/jpeg',base64:match[1],createdAt:new Date(now()).toISOString()});
    return id;
  }

  function issueToken(state,key,userId,ttlMs){
    const token=randomBytes(32).toString('hex'),createdAt=new Date(now()).toISOString(),expiresAt=new Date(now()+ttlMs).toISOString();
    state[key]=(state[key]||[]).filter(item=>item.userId!==userId&&new Date(item.expiresAt).getTime()>now()&&!item.usedAt);
    state[key].push({id:randomUUID(),userId,tokenHash:hashToken(token),createdAt,expiresAt,usedAt:null});
    return token;
  }
  const tokenRecord=(state,key,raw)=>state[key]?.find(item=>!item.usedAt&&item.tokenHash===hashToken(raw)&&new Date(item.expiresAt).getTime()>now());
  const requestOrigin=req=>`${req.protocol}://${req.get('host')}`;


  function createSession(res,user){
    for(const [token,session] of sessions)if(session.expires<=now())sessions.delete(token);
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
    sessions.set(token,{userId:user.id,csrf,expires:now()+sessionMs});
    res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',secure:production,path:'/',maxAge:sessionMs});
    return {csrf,user:sessionUser(user),role:user.role,demo:false,beta:true};
  }

  app.use((req,res,next)=>{
    res.set({
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer',
      'X-Frame-Options':'DENY',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
    });
    next();
  });
  app.use('/api',(req,res,next)=>{
    try{
      rate('ip:'+req.ip,240);
      if(!['GET','HEAD'].includes(req.method)){
        const expected=`${req.protocol}://${req.get('host')}`;
        if(req.get('origin')!==expected)throw fail(403,'Same-origin request required.');
        if(!req.is('application/json'))throw fail(415,'JSON required.');
      }
      next();
    }catch(error){next(error);}
  });
  app.use(express.json({limit:'2mb',strict:true}));

  app.post('/api/register',async(req,res,next)=>{
    try{
      await ready;
      rate('register:'+req.ip,8,60*60*1000);
      exact(req.body,['name','email','password','inviteCode','communityAgreement']);
      if(req.body.communityAgreement!==true)throw fail(400,'Accept the KV Social community agreement to continue.');
      if(!safeSecret(String(req.body.inviteCode||''),String(inviteCode)))throw fail(403,'This beta invitation code is not valid.');
      if(production&&!sendAccountEmail)throw fail(503,'Account email is temporarily unavailable.');
      const email=normalizeEmail(req.body.email),name=validateDisplayName(req.body.name),password=validatePassword(req.body.password);
      const state=await read();
      if(state.users.some(user=>user.email===email))throw fail(409,'An account already exists for this email.');
      const user={id:randomUUID(),role:'member',email,name,bio:'',initials:profileInitials(name),passwordHash:hashPassword(password),suspended:false,emailVerified:!verificationEnabled,createdAt:new Date(now()).toISOString(),agreementAcceptedAt:new Date(now()).toISOString()};
      state.users.push(user);audit(state,user.id,'register',user.id,'Invited beta account created');
      let verificationToken='';
      if(verificationEnabled)verificationToken=issueToken(state,'emailVerificationTokens',user.id,24*60*60*1000);
      await write(state);
      if(verificationEnabled){
        let delivered=true;
        try{await sendAccountEmail({to:user.email,name:user.name,kind:'verify',url:`${requestOrigin(req)}/api/verify-email?token=${encodeURIComponent(verificationToken)}`});}catch{delivered=false;}
        return res.status(delivered?201:202).json({verificationRequired:true,email:user.email,deliveryPending:!delivered});
      }
      res.status(201).json(createSession(res,user));
    }catch(error){next(error);}
  });

  app.post('/api/login',async(req,res,next)=>{
    try{
      await ready;
      rate('login:'+req.ip,12,15*60*1000);
      exact(req.body,['email','password']);
      const email=normalizeEmail(req.body.email),state=await read(),user=state.users.find(item=>item.email===email&&['member','owner'].includes(item.role));
      if(!user||!verifyPassword(req.body.password,user.passwordHash))throw fail(401,'Email or password is incorrect.');
      if(user.emailVerified!==true)throw fail(403,'Verify your email before signing in.');
      if(user.suspended&&user.role==='owner')throw fail(403,'Moderator account is unavailable.');
      res.json(createSession(res,user));
    }catch(error){next(error);}
  });

  app.post('/api/resend-verification',async(req,res,next)=>{
    try{
      await ready;rate('verify-resend:'+req.ip,4,60*60*1000);exact(req.body,['email']);
      const email=normalizeEmail(req.body.email),state=await read(),user=state.users.find(item=>item.email===email&&item.role==='member');
      if(user&&user.emailVerified!==true&&sendAccountEmail){
        const token=issueToken(state,'emailVerificationTokens',user.id,24*60*60*1000);await write(state);
        try{await sendAccountEmail({to:user.email,name:user.name,kind:'verify',url:`${requestOrigin(req)}/api/verify-email?token=${encodeURIComponent(token)}`});}catch{}
      }
      res.json({ok:true});
    }catch(error){next(error);}
  });

  app.get('/api/verify-email',async(req,res,next)=>{
    try{
      await ready;const raw=String(req.query.token||'');if(raw.length<32)return res.redirect('/?verified=invalid');
      const state=await read(),record=tokenRecord(state,'emailVerificationTokens',raw);
      if(!record)return res.redirect('/?verified=invalid');
      const user=getUser(state,record.userId);if(!user)return res.redirect('/?verified=invalid');
      record.usedAt=new Date(now()).toISOString();user.emailVerified=true;audit(state,user.id,'email-verified',user.id,'Member verified email');await write(state);
      res.redirect('/?verified=1');
    }catch(error){next(error);}
  });

  app.post('/api/password/forgot',async(req,res,next)=>{
    try{
      await ready;rate('password-forgot:'+req.ip,5,60*60*1000);exact(req.body,['email']);
      const email=normalizeEmail(req.body.email),state=await read(),user=state.users.find(item=>item.email===email&&['member','owner'].includes(item.role));
      if(user&&user.emailVerified===true&&sendAccountEmail){
        const token=issueToken(state,'passwordResetTokens',user.id,60*60*1000);await write(state);
        try{await sendAccountEmail({to:user.email,name:user.name,kind:'reset',url:`${requestOrigin(req)}/?reset=${encodeURIComponent(token)}`});}catch{}
      }
      res.json({ok:true});
    }catch(error){next(error);}
  });

  app.post('/api/password/reset',async(req,res,next)=>{
    try{
      await ready;rate('password-reset:'+req.ip,8,60*60*1000);exact(req.body,['token','password']);
      const raw=String(req.body.token||''),password=validatePassword(req.body.password),state=await read(),record=tokenRecord(state,'passwordResetTokens',raw);
      if(!record)throw fail(400,'This password reset link is invalid or expired.');
      const user=getUser(state,record.userId);if(!user)throw fail(400,'This password reset link is invalid or expired.');
      user.passwordHash=hashPassword(password);record.usedAt=new Date(now()).toISOString();audit(state,user.id,'password-reset',user.id,'Member reset password');await write(state);
      for(const [token,session] of sessions)if(session.userId===user.id)sessions.delete(token);
      res.json({ok:true});
    }catch(error){next(error);}
  });

  app.use('/api',async(req,res,next)=>{
    if(['/register','/login','/resend-verification','/password/forgot','/password/reset','/verify-email'].includes(req.path))return next();
    try{
      await ready;
      const token=cookies(req.headers.cookie)[cookieName],session=sessions.get(token);
      if(!session||session.expires<=now()){if(token)sessions.delete(token);throw fail(401,'Sign in to KV Social.');}
      const state=await read(),user=getUser(state,session.userId);
      if(!user)throw fail(401,'Account no longer exists.');
      req.session=session;req.token=token;req.user=user;
      if(!['GET','HEAD'].includes(req.method)){
        if(!safeSecret(req.get('x-csrf-token')||'',session.csrf))throw fail(403,'Session verification failed. Refresh and try again.');
        rate('write:'+user.id,120);
      }
      next();
    }catch(error){next(error);}
  });

  const route=(method,path,handler)=>app[method]('/api'+path,(req,res,next)=>Promise.resolve(handler(req,res)).catch(next));

  route('get','/session',(req,res)=>res.json({csrf:req.session.csrf,user:sessionUser(req.user),role:req.user.role,demo:false,beta:true}));
  route('post','/logout',async(req,res)=>{
    sessions.delete(req.token);res.clearCookie(cookieName,{path:'/',secure:production,sameSite:'strict'});res.json({ok:true});
  });
  route('patch','/profile',async(req,res)=>{
    exact(req.body,['name','bio']);const state=await read(),user=getUser(state,req.user.id);
    user.name=validateDisplayName(req.body.name);user.initials=profileInitials(user.name);user.bio=cleanBio(req.body.bio);
    audit(state,user.id,'profile-update',user.id,'Member updated profile');await write(state);res.json({user:sessionUser(user)});
  });
  route('get','/feed',async(req,res)=>{
    const state=await read();
    res.json({
      posts:state.posts.filter(post=>visible(state,post,req.user.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(post=>publicPost(state,post,req.user.id)),
      users:state.users.map(publicUser),
      blocked:state.blocks.filter(item=>item.userId===req.user.id).map(item=>item.authorId),
      topics
    });
  });
  route('get','/media/:id',async(req,res)=>{
    if(!/^[0-9a-f-]{36}$/i.test(req.params.id))throw fail(404,'Photo not found.');
    const state=await read(),post=state.posts.find(item=>item.mediaId===req.params.id);
    if(!post)throw fail(404,'Photo not found.');
    if(req.user.role!=='owner'&&post.authorId!==req.user.id&&!visible(state,post,req.user.id))throw fail(404,'Photo not found.');
    const media=state.media?.find(item=>item.id===req.params.id);if(!media)throw fail(404,'Photo not found.');
    res.type(media.contentType||'image/jpeg').send(Buffer.from(media.base64,'base64'));
  });
  route('get','/activity',async(req,res)=>{
    const state=await read();
    res.json({posts:state.posts.filter(post=>post.authorId===req.user.id).map(post=>privatePost(state,post)),appeals:state.appeals.filter(appeal=>appeal.authorId===req.user.id)});
  });
  route('post','/posts',async(req,res)=>{
    active(req);exact(req.body,['text','topic','theme','parentId','photoData']);rate('post:'+req.user.id,8);
    const text=validateText(req.body.text);if(!topics.includes(req.body.topic))throw fail(400,'Choose a topic.');
    if(req.body.theme&&!['none','sound','gather','live'].includes(req.body.theme))throw fail(400,'Choose a curated visual.');
    const state=await read();let parent=null;
    if(req.body.parentId){parent=getPost(state,req.body.parentId);if(parent.parentId||!visible(state,parent,req.user.id))throw fail(404,'Conversation unavailable.');}
    if(state.posts.some(post=>post.authorId===req.user.id&&post.text===text&&post.parentId===(req.body.parentId||null)))throw fail(409,'This message was already submitted.');
    if(state.posts.length>=20_000)throw fail(503,'Community post capacity reached for this beta.');
    const postId=randomUUID();
    const post={id:postId,authorId:req.user.id,text,topic:req.body.topic,theme:req.body.theme||'none',parentId:parent?.id||null,status:'pending',createdAt:new Date(now()).toISOString(),version:1,reactions:[],saves:[],signals:[],mediaId:savePhoto(req.body.photoData,postId,state)};
    try{post.signals=screenContent(text);}catch{post.signals=['screening-unavailable'];}
    state.posts.push(post);audit(state,req.user.id,'submit',post.id,'Awaiting human review');await write(state);res.status(201).json({post:privatePost(state,post)});
  });
  route('patch','/posts/:id',async(req,res)=>{
    active(req);exact(req.body,['text']);rate('post:'+req.user.id,8);const state=await read(),post=getPost(state,req.params.id);
    if(post.authorId!==req.user.id)throw fail(403,'Only the author may edit.');
    if(state.appeals.some(appeal=>appeal.postId===post.id&&appeal.status==='pending'))throw fail(409,'Wait for the open appeal before editing.');
    post.text=validateText(req.body.text);post.status='pending';post.reason='Revision awaiting review';post.version+=1;
    try{post.signals=screenContent(post.text);}catch{post.signals=['screening-unavailable'];}
    audit(state,req.user.id,'edit',post.id,'Revision requires review');await write(state);res.json({post:privatePost(state,post)});
  });
  for(const action of ['react','save'])route('post',`/posts/:id/${action}`,async(req,res)=>{
    active(req);exact(req.body,[]);const state=await read(),post=getPost(state,req.params.id);if(!visible(state,post,req.user.id))throw fail(404,'Post unavailable.');
    const key=action==='react'?'reactions':'saves';const values=post[key]||[];post[key]=values.includes(req.user.id)?values.filter(id=>id!==req.user.id):[...values,req.user.id];await write(state);res.json({post:publicPost(state,post,req.user.id)});
  });
  route('post','/posts/:id/report',async(req,res)=>{
    exact(req.body,['category','reason']);rate('report:'+req.user.id,5);const state=await read(),post=getPost(state,req.params.id);if(!visible(state,post,req.user.id))throw fail(404,'Post unavailable.');
    if(!categories.includes(req.body.category))throw fail(400,'Choose a report category.');const reason=validateText(req.body.reason,500);
    if(state.reports.some(report=>report.postId===post.id&&report.reporterId===req.user.id&&report.status==='open'))throw fail(409,'Your report is already awaiting review.');
    const report={id:randomUUID(),postId:post.id,reporterId:req.user.id,category:req.body.category,reason,status:'open',at:new Date(now()).toISOString()};
    state.reports.push(report);audit(state,req.user.id,'report',post.id,'Private report received');await write(state);res.status(201).json({ok:true});
  });
  route('post','/blocks',async(req,res)=>{
    exact(req.body,['authorId','blocked']);const state=await read();if(typeof req.body.blocked!=='boolean'||!getUser(state,req.body.authorId)||req.body.authorId===req.user.id)throw fail(400,'Choose another account.');
    state.blocks=state.blocks.filter(item=>!(item.userId===req.user.id&&item.authorId===req.body.authorId));
    if(req.body.blocked)state.blocks.push({userId:req.user.id,authorId:req.body.authorId,at:new Date(now()).toISOString()});
    await write(state);res.json({ok:true});
  });
  route('get','/moderation',async(req,res)=>{
    owner(req);const state=await read();
    res.json({posts:state.posts.map(post=>privatePost(state,post)),reports:state.reports,appeals:state.appeals,audit:state.audit,users:state.users.filter(user=>user.role!=='system').map(user=>({...publicUser(user),email:user.email||''}))});
  });
  route('post','/posts/:id/review',async(req,res)=>{
    owner(req);exact(req.body,['action','reason','version']);const reason=validateText(req.body.reason,500),state=await read(),post=getPost(state,req.params.id);
    if(post.version!==req.body.version)throw fail(409,'Content changed. Refresh before reviewing.');
    if(!['approve','hide','remove'].includes(req.body.action))throw fail(400,'Choose a review decision.');
    if(state.appeals.some(appeal=>appeal.postId===post.id&&appeal.status==='pending'))throw fail(409,'Resolve the open appeal first.');
    const status={approve:'published',hide:'hidden',remove:'removed'}[req.body.action],author=getUser(state,post.authorId);
    if(status==='published'&&(author?.suspended||post.authorId===req.user.id))throw fail(409,'Cannot approve suspended or own-authored content.');
    if(status==='published'&&post.parentId&&!visible(state,getPost(state,post.parentId),req.user.id))throw fail(409,'Parent conversation must be available.');
    post.status=status;post.reason=reason;post.version+=1;
    for(const report of state.reports)if(report.postId===post.id&&report.status==='open')Object.assign(report,{status:'resolved',resolution:reason,reviewerId:req.user.id,resolvedAt:new Date(now()).toISOString()});
    audit(state,req.user.id,req.body.action,post.id,reason);await write(state);res.json({post:privatePost(state,post)});
  });
  route('post','/posts/:id/appeal',async(req,res)=>{
    exact(req.body,['reason']);rate('appeal:'+req.user.id,3);const state=await read(),post=getPost(state,req.params.id);
    if(post.authorId!==req.user.id)throw fail(403,'Only the author can appeal.');
    if(!['removed','hidden'].includes(post.status))throw fail(409,'This post has no removal decision to appeal.');
    if(state.appeals.some(appeal=>appeal.postId===post.id&&appeal.decisionVersion===post.version))throw fail(409,'This decision already has an appeal.');
    const appeal={id:randomUUID(),postId:post.id,authorId:req.user.id,reason:validateText(req.body.reason,1000),decisionVersion:post.version,status:'pending',at:new Date(now()).toISOString()};
    state.appeals.push(appeal);audit(state,req.user.id,'appeal',post.id,'Author requested review');await write(state);res.status(201).json({appeal});
  });
  route('post','/appeals/:id/resolve',async(req,res)=>{
    owner(req);exact(req.body,['action','reason','version']);const state=await read(),appeal=state.appeals.find(item=>item.id===req.params.id);if(!appeal)throw fail(404,'Appeal not found.');
    const post=getPost(state,appeal.postId);if(appeal.status!=='pending'||post.version!==req.body.version||post.version!==appeal.decisionVersion)throw fail(409,'Appeal or post changed.');
    if(!['restore','uphold'].includes(req.body.action))throw fail(400,'Choose an appeal decision.');
    const reason=validateText(req.body.reason,500),author=getUser(state,post.authorId);
    if(req.body.action==='restore'&&(author?.suspended||post.authorId===req.user.id||(post.parentId&&!visible(state,getPost(state,post.parentId),req.user.id))))throw fail(409,'Resolve account or parent restrictions before restoring.');
    Object.assign(appeal,{status:'resolved',resolution:req.body.action,explanation:reason,reviewerId:req.user.id,resolvedAt:new Date(now()).toISOString()});
    if(req.body.action==='restore'){post.status='published';post.version+=1;}post.reason=reason;
    audit(state,req.user.id,'appeal-'+req.body.action,post.id,reason);await write(state);res.json({appeal});
  });
  route('post','/users/:id/suspend',async(req,res)=>{
    owner(req);exact(req.body,['suspended','reason']);const state=await read(),user=getUser(state,req.params.id);
    if(!user||user.role!=='member'||typeof req.body.suspended!=='boolean')throw fail(400,'Choose a member account and state.');
    const reason=validateText(req.body.reason,500);user.suspended=req.body.suspended;audit(state,req.user.id,req.body.suspended?'suspend':'reinstate',user.id,reason);await write(state);res.json({ok:true});
  });

  app.use('/api',(req,res)=>res.status(404).json({error:'Unknown KV Social endpoint.'}));
  app.use(express.static(fileURLToPath(new URL('./public/',import.meta.url)),{etag:true,maxAge:production?'5m':0}));
  app.use((err,req,res,next)=>{
    if(res.headersSent)return next(err);
    let status=err.status||400;if(err.type==='entity.too.large')status=413;if(status>=500&&status!==503)status=500;
    res.status(status).json({error:status===413?'Request is too large.':status===500?'KV Social request failed.':err.type==='entity.parse.failed'?'Invalid JSON.':err.message,...(err.code?{code:err.code}:{})});
  });
  return app;
}
