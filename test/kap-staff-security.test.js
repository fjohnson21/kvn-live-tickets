import test from 'node:test';
import assert from 'node:assert/strict';
import {kapLogin, kapUser} from '../lib/kap-staff.mjs';

const token = 'a'.repeat(64);
const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status, headers});

test('shared login grants a token only after confirming the owner identity', async () => {
  for (const userId of ['owner', 'staff']) {
    const result = await kapLogin('synthetic@example.test', 'synthetic-password', async url =>
      url.endsWith('/login')
        ? reply({}, 200, {'set-cookie':`__Host-kap_session=${token}; Path=/; Secure; HttpOnly`})
        : reply({user:{userId,email:'synthetic@example.test'}}));
    assert.deepEqual(result, userId === 'owner' ? {status:200,token} : {status:503});
  }
});

test('shared sessions fail closed on revocation, malformed responses and provider failure', async () => {
  for (const request of [
    async () => reply({},401),
    async () => reply({user:{userId:'owner'}}),
    async () => {throw new Error('offline');},
  ]) assert.equal(await kapUser(token,request),null);
  assert.equal(await kapUser('invalid',async () => {throw new Error('must not request');}),null);
});
