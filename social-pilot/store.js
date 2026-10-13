export function createStore(){
 const users=new Map([
  ['member',{id:'member',name:'Jordan · Demo member',bio:'Music, faith, and community. Synthetic pilot profile.',initials:'JD',suspended:false}],
  ['owner',{id:'owner',name:'KV Community · Demo moderator',bio:'Keeping space for meaningful conversation.',initials:'KV',suspended:false}],
  ['editorial',{id:'editorial',name:'KV Editorial · Sample',bio:'Illustrative editorial content. Not an artist account.',initials:'KV',suspended:false}],
  ['community',{id:'community',name:'Community voice · Sample',bio:'Fictional demonstration profile. No real member data.',initials:'CV',suspended:false}]
 ]);
 const seeds=[
  {id:'sample-1',authorId:'editorial',topic:'Music',artist:'Imani Raeford',theme:'sound',text:'A voice. A moment. A fresh fire. Our sample artist spotlight celebrates Imani Raeford. What song helps you reconnect with your purpose?',title:'A sound that\nstays with you.',eyebrow:'ARTIST SPOTLIGHT / SAMPLE'},
  {id:'sample-2',authorId:'community',topic:'Community',theme:'gather',text:'Imagine this: a room full of people you have never met, singing like family. What makes a worship experience feel like home to you?',title:'Come as you are.\nLeave connected.',eyebrow:'COMMUNITY NOTES / SAMPLE'},
  {id:'sample-3',authorId:'editorial',topic:'KV Live',artist:'Jalisa Faye',theme:'live',text:'The voices. The community. The purpose. This sample KV Live conversation features Jalisa Faye, Yael Hilton and Imani Raeford. Who are you looking forward to hearing?',title:'Faith in the room.\nPurpose in the sound.',eyebrow:'KV LIVE / NOVEMBER 21'},
  {id:'sample-4',authorId:'community',topic:'Purpose',theme:'none',text:'A small act of encouragement can change someone’s whole week. Share a moment when your community showed up for you.'}
 ];
 const posts=new Map(seeds.map((p,i)=>[p.id,{...p,status:'published',sample:true,parentId:null,version:1,createdAt:new Date(Date.UTC(2026,9,11,14,30-i*20)).toISOString(),signals:[],reason:'Approved synthetic sample',reactions:new Set(),saves:new Set()}]));
 return {users,posts,reports:[],appeals:[],audit:[],blocks:new Map(),sessions:new Map()};
}
