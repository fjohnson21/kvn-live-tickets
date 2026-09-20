import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = new URL('../', import.meta.url);

async function startServer(extraEnv = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kvn-auth-'));
  fs.copyFileSync(new URL('../data/store.json', import.meta.url), path.join(dataDir, 'store.json'));
  const port = 32000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      BASE_URL: `http://127.0.0.1:${port}`,
      DATA_DIR: dataDir,
      OWNER_EMAIL: 'frank@kingdomalliancepartners.com',
      OWNER_PASSWORD: 'correct horse battery staple',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server start timed out')), 5000);
    child.once('exit', code => reject(new Error(`server exited with ${code}`)));
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('running at')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop() {
      child.kill('SIGTERM');
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

test('owner password creates an HTTP-only secure cookie session', async t => {
  const server = await startServer();
  t.after(() => server.stop());

  const rejected = await fetch(`${server.baseUrl}/api/auth/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'frank@kingdomalliancepartners.com', password: 'wrong' }),
  });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get('set-cookie'), null);

  const signedIn = await fetch(`${server.baseUrl}/api/auth/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'frank@kingdomalliancepartners.com', password: 'correct horse battery staple' }),
  });
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get('set-cookie');
  assert.match(cookie, /^__Host-kvn_session=[a-f0-9]+;/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Strict/i);

  const authenticated = await fetch(`${server.baseUrl}/api/dashboard`, {
    headers: { cookie: cookie.split(';')[0] },
  });
  assert.equal(authenticated.status, 200);
  assert.equal((await authenticated.json()).user.role, 'owner');

  const bearerOnly = await fetch(`${server.baseUrl}/api/dashboard`, {
    headers: { authorization: 'Bearer obsolete-token' },
  });
  assert.equal(bearerOnly.status, 401);
});

test('logout invalidates the owner session and clears its cookie', async t => {
  const server = await startServer();
  t.after(() => server.stop());
  const signedIn = await fetch(`${server.baseUrl}/api/auth/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'frank@kingdomalliancepartners.com', password: 'correct horse battery staple' }),
  });
  const cookie = signedIn.headers.get('set-cookie').split(';')[0];

  const signedOut = await fetch(`${server.baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(signedOut.status, 200);
  assert.match(signedOut.headers.get('set-cookie'), /Max-Age=0/i);

  const afterLogout = await fetch(`${server.baseUrl}/api/dashboard`, { headers: { cookie } });
  assert.equal(afterLogout.status, 401);
});

test('owner sign-in rate limits repeated invalid credentials', async t => {
  const server = await startServer();
  t.after(() => server.stop());
  const attempt = () => fetch(`${server.baseUrl}/api/auth/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'frank@kingdomalliancepartners.com', password: 'wrong' }),
  });
  for (let count = 0; count < 5; count += 1) assert.equal((await attempt()).status, 401);
  const blocked = await attempt();
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers.get('retry-after'), /^\d+$/);
});

test('control center presents owner sign-in and does not store bearer tokens', () => {
  const html = fs.readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8');
  const script = fs.readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8');
  assert.match(html, /id="ownerLogin"/);
  assert.match(html, /type="password"/);
  assert.match(script, /\/api\/auth\/owner/);
  assert.match(script, /\/api\/auth\/logout/);
  assert.doesNotMatch(script, /localStorage|Authorization|kvn_token/);
});
