import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {hashPassword,normalizeEmail} from './auth.js';

const {Pool}=pg;
const now=()=>new Date().toISOString();
const systemUsers=[
  {id:'editorial',role:'system',name:'KV Editorial',bio:'Official Kingdom Vibe Network editorial account.',initials:'KV',suspended:false,emailVerified:true},
  {id:'community',role:'system',name:'KV Community',bio:'Kingdom Vibe community conversation prompts.',initials:'KV',suspended:false,emailVerified:true}
];
const seedPosts=[
  {id:'sample-1',authorId:'editorial',topic:'Music',artist:'Imani Raeford',theme:'sound',text:'A voice. A moment. A fresh fire. Our artist spotlight celebrates Imani Raeford. What song helps you reconnect with your purpose?',title:'A sound that\nstays with you.',eyebrow:'ARTIST SPOTLIGHT',createdAt:'2026-10-11T14:30:00.000Z'},
  {id:'sample-2',authorId:'community',topic:'Kingdom Culture',theme:'gather',text:'A room full of people you have never met can still feel like family. What makes a worship experience feel like home to you?',title:'Come as you are.\nLeave connected.',eyebrow:'COMMUNITY NOTES',createdAt:'2026-10-11T14:10:00.000Z'},
  {id:'sample-3',authorId:'editorial',topic:'KV Live',artist:'Jalisa Faye',theme:'live',text:'The voices. The community. The purpose. KV Live brings Jalisa Faye, Yael Hilton, Imani Raeford and the KVN community together on November 21.',title:'Faith in the room.\nPurpose in the sound.',eyebrow:'KV LIVE / NOVEMBER 21',createdAt:'2026-10-11T13:50:00.000Z'}
];
const listKeys=['users','posts','reports','appeals','audit','blocks','media','emailVerificationTokens','passwordResetTokens'];

export function createInitialState(){
  return {
    version:2,
    users:systemUsers.map(user=>({...user,createdAt:now()})),
    posts:seedPosts.map(post=>({...post,status:'published',sample:true,parentId:null,version:1,signals:[],reason:'KV editorial seed',reactions:[],saves:[]})),
    reports:[],appeals:[],audit:[],blocks:[],media:[],emailVerificationTokens:[],passwordResetTokens:[]
  };
}

export function normalizeState(value){
  const state=value&&typeof value==='object'?value:createInitialState();
  for(const key of listKeys)if(!Array.isArray(state[key]))state[key]=[];
  state.version=2;
  for(const user of systemUsers)if(!state.users.some(item=>item.id===user.id))state.users.push({...user,createdAt:now()});
  for(const post of seedPosts)if(!state.posts.some(item=>item.id===post.id))state.posts.push({...post,status:'published',sample:true,parentId:null,version:1,signals:[],reason:'KV editorial seed',reactions:[],saves:[]});
  for(const user of state.users)if(user.role==='owner'&&user.emailVerified===undefined)user.emailVerified=true;
  return state;
}

function ensureOwner(state,{ownerEmail,ownerPassword}){
  const email=normalizeEmail(ownerEmail||'');
  if(!ownerPassword||String(ownerPassword).length<12)throw new Error('KV_SOCIAL_OWNER_PASSWORD must be at least 12 characters.');
  let changed=false,owner=state.users.find(user=>user.role==='owner');
  if(!owner){
    owner={id:randomUUID(),role:'owner',email,name:'KV Community Moderator',bio:'Kingdom Vibe Network community moderation.',initials:'KV',passwordHash:hashPassword(ownerPassword),suspended:false,emailVerified:true,createdAt:now()};
    state.users.push(owner);changed=true;
  }else{
    if(owner.email!==email){owner.email=email;changed=true;}
    if(owner.emailVerified!==true){owner.emailVerified=true;changed=true;}
  }
  return {owner,changed};
}

export function createFileStore({dataDir,ownerEmail,ownerPassword}={}){
  if(!dataDir)throw new Error('KV Social requires a dedicated data directory.');
  fs.mkdirSync(dataDir,{recursive:true});
  const file=path.join(dataDir,'kv-social.json');
  function read(){
    if(!fs.existsSync(file)){const state=createInitialState();write(state);return state;}
    return normalizeState(JSON.parse(fs.readFileSync(file,'utf8')));
  }
  function write(state){
    const temp=`${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp,JSON.stringify(normalizeState(state),null,2),{encoding:'utf8',mode:0o600});
    fs.renameSync(temp,file);
  }
  function bootstrap(){
    const state=read(),{owner,changed}=ensureOwner(state,{ownerEmail,ownerPassword});
    if(changed)write(state);
    return {id:owner.id,email:owner.email};
  }
  return {kind:'file',file,read,write,bootstrap,close:async()=>{}};
}

export function createPostgresStore({connectionString,ownerEmail,ownerPassword}={}){
  if(!connectionString)throw new Error('DATABASE_URL is required for KV Social Postgres.');
  const local=/localhost|127\.0\.0\.1/.test(connectionString);
  const pool=new Pool({connectionString,ssl:local?false:{rejectUnauthorized:false},max:5,idleTimeoutMillis:30_000});
  async function bootstrap(){
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kv_social_state (
        id text PRIMARY KEY,
        state jsonb NOT NULL,
        revision bigint NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const inserted=createInitialState();
    await pool.query('INSERT INTO kv_social_state (id,state) VALUES ($1,$2::jsonb) ON CONFLICT (id) DO NOTHING',['primary',JSON.stringify(inserted)]);
    const state=await read(),{owner,changed}=ensureOwner(state,{ownerEmail,ownerPassword});
    if(changed)await write(state);
    return {id:owner.id,email:owner.email};
  }
  async function read(){
    const result=await pool.query('SELECT state, revision FROM kv_social_state WHERE id=$1',['primary']);
    if(!result.rowCount)throw new Error('KV Social database state is missing.');
    const state=normalizeState(result.rows[0].state);
    Object.defineProperty(state,'__revision',{value:Number(result.rows[0].revision),writable:true,enumerable:false,configurable:true});
    return state;
  }
  async function write(state){
    const expected=Number(state.__revision||0);
    if(!expected)throw Object.assign(new Error('KV Social state revision is missing.'),{status:409});
    const result=await pool.query(
      'UPDATE kv_social_state SET state=$1::jsonb, revision=revision+1, updated_at=now() WHERE id=$2 AND revision=$3 RETURNING revision',
      [JSON.stringify(normalizeState(state)),'primary',expected]
    );
    if(!result.rowCount)throw Object.assign(new Error('KV Social changed while this request was being processed. Please retry.'),{status:409});
    Object.defineProperty(state,'__revision',{value:Number(result.rows[0].revision),writable:true,enumerable:false,configurable:true});
  }
  return {kind:'postgres',read,write,bootstrap,close:()=>pool.end()};
}
