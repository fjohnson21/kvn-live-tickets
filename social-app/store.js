import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hashPassword,normalizeEmail,profileInitials,validateDisplayName} from './auth.js';

const now=()=>new Date().toISOString();
const systemUsers=[
  {id:'editorial',role:'system',name:'KV Editorial',bio:'Official Kingdom Vibe Network editorial account.',initials:'KV',suspended:false},
  {id:'community',role:'system',name:'KV Community',bio:'Kingdom Vibe community conversation prompts.',initials:'KV',suspended:false}
];
const seedPosts=[
  {id:'sample-1',authorId:'editorial',topic:'Music',artist:'Imani Raeford',theme:'sound',text:'A voice. A moment. A fresh fire. Our artist spotlight celebrates Imani Raeford. What song helps you reconnect with your purpose?',title:'A sound that\nstays with you.',eyebrow:'ARTIST SPOTLIGHT',createdAt:'2026-10-11T14:30:00.000Z'},
  {id:'sample-2',authorId:'community',topic:'Community',theme:'gather',text:'A room full of people you have never met can still feel like family. What makes a worship experience feel like home to you?',title:'Come as you are.\nLeave connected.',eyebrow:'COMMUNITY NOTES',createdAt:'2026-10-11T14:10:00.000Z'},
  {id:'sample-3',authorId:'editorial',topic:'KV Live',artist:'Jalisa Faye',theme:'live',text:'The voices. The community. The purpose. KV Live brings Jalisa Faye, Yael Hilton, Imani Raeford and the KVN community together on November 21.',title:'Faith in the room.\nPurpose in the sound.',eyebrow:'KV LIVE / NOVEMBER 21',createdAt:'2026-10-11T13:50:00.000Z'}
];

function baseState(){
  return {
    version:1,
    users:systemUsers.map(user=>({...user,createdAt:now()})),
    posts:seedPosts.map(post=>({...post,status:'published',sample:true,parentId:null,version:1,signals:[],reason:'KV editorial seed',reactions:[],saves:[]})),
    reports:[],appeals:[],audit:[],blocks:[]
  };
}

function normalizeState(value){
  const state=value&&typeof value==='object'?value:baseState();
  for(const key of ['users','posts','reports','appeals','audit','blocks'])if(!Array.isArray(state[key]))state[key]=[];
  state.version=1;
  for(const user of systemUsers)if(!state.users.some(item=>item.id===user.id))state.users.push({...user,createdAt:now()});
  for(const post of seedPosts)if(!state.posts.some(item=>item.id===post.id))state.posts.push({...post,status:'published',sample:true,parentId:null,version:1,signals:[],reason:'KV editorial seed',reactions:[],saves:[]});
  return state;
}

export function createFileStore({dataDir,ownerEmail,ownerPassword}={}){
  if(!dataDir)throw new Error('KV Social requires a dedicated data directory.');
  fs.mkdirSync(dataDir,{recursive:true});
  const file=path.join(dataDir,'kv-social.json');
  function read(){
    if(!fs.existsSync(file)){const state=baseState();write(state);return state;}
    return normalizeState(JSON.parse(fs.readFileSync(file,'utf8')));
  }
  function write(state){
    const temp=`${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp,JSON.stringify(normalizeState(state),null,2),{encoding:'utf8',mode:0o600});
    fs.renameSync(temp,file);
  }
  function bootstrap(){
    const state=read();
    const email=normalizeEmail(ownerEmail||'');
    if(!ownerPassword||String(ownerPassword).length<12)throw new Error('KV_SOCIAL_OWNER_PASSWORD must be at least 12 characters.');
    let owner=state.users.find(user=>user.role==='owner');
    if(!owner){
      owner={id:randomUUID(),role:'owner',email,name:'KV Community Moderator',bio:'Kingdom Vibe Network community moderation.',initials:'KV',passwordHash:hashPassword(ownerPassword),suspended:false,createdAt:now()};
      state.users.push(owner);write(state);
    }else if(owner.email!==email){
      owner.email=email;write(state);
    }
    return {id:owner.id,email:owner.email};
  }
  return {file,read,write,bootstrap};
}
