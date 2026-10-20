import {createSocialApp} from './app.js';
// No dotenv and no production imports. Keys must be dedicated to this disposable demo.
const app=createSocialApp({memberKey:process.env.KV_SOCIAL_MEMBER_KEY,ownerKey:process.env.KV_SOCIAL_OWNER_KEY});
const port=Number(process.env.KV_SOCIAL_PORT||4311);
app.listen(port,'127.0.0.1',()=>console.log(`KV Social private demo at http://127.0.0.1:${port}. Synthetic memory-only data; restart resets all changes.`));
