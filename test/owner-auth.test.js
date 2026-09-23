import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOwnerPasswordStore, createPasswordResetManager } from '../lib/owner-auth.js';

test('reset password persists across store instances and supersedes the environment fallback', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kvn-owner-auth-'));
  try {
    const first = createOwnerPasswordStore({ dataDir, fallbackPassword: 'original environment password' });
    assert.equal(first.verify('original environment password'), true);
    first.set('replacement password value');
    const restarted = createOwnerPasswordStore({ dataDir, fallbackPassword: 'original environment password' });
    assert.equal(restarted.verify('replacement password value'), true);
    assert.equal(restarted.verify('original environment password'), false);
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('corrupt persisted owner credentials fail closed instead of restoring the environment password', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kvn-owner-auth-'));
  try {
    fs.writeFileSync(path.join(dataDir, 'owner-auth.json'), '{not-json');
    assert.throws(
      () => createOwnerPasswordStore({ dataDir, fallbackPassword: 'original environment password' }),
      /credential/i,
    );
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('issuing a newer reset invalidates older links and successful use invalidates every link', () => {
  let time = 1000;
  const resets = createPasswordResetManager({ ttlMs: 100, now: () => time });
  const first = resets.issue('owner@example.com');
  const second = resets.issue('owner@example.com');
  assert.equal(resets.consume(first), null);
  assert.equal(resets.consume(second).email, 'owner@example.com');
  assert.equal(resets.consume(second), null);
  const expiring = resets.issue('owner@example.com');
  time += 101;
  assert.equal(resets.consume(expiring), null);
});
