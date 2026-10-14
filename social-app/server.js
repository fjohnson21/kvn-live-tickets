import 'dotenv/config';
import {createSocialApp} from './app.js';

const port=Number(process.env.PORT||process.env.KV_SOCIAL_PORT||4311);
const app=createSocialApp({
  dataDir:process.env.KV_SOCIAL_DATA_DIR||process.env.DATA_DIR||'./data/social',
  ownerEmail:process.env.KV_SOCIAL_OWNER_EMAIL,
  ownerPassword:process.env.KV_SOCIAL_OWNER_PASSWORD,
  inviteCode:process.env.KV_SOCIAL_INVITE_CODE,
  production:process.env.NODE_ENV==='production'
});
app.listen(port,'0.0.0.0',()=>console.log(`KV Social listening on port ${port}`));
