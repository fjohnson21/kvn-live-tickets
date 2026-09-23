import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const keyLength = 64;

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, keyLength).toString('hex');
  return { algorithm: 'scrypt', salt, hash, updatedAt: new Date().toISOString() };
}

function verifyRecord(password, record) {
  if (!record || record.algorithm !== 'scrypt' || !record.salt || !record.hash) return false;
  const candidate = crypto.scryptSync(String(password), record.salt, keyLength).toString('hex');
  return safeEqual(candidate, record.hash);
}

export function createOwnerPasswordStore({ dataDir, fallbackPassword = '' }) {
  const file = path.join(dataDir, 'owner-auth.json');
  fs.mkdirSync(dataDir, { recursive: true });
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new Error('Owner credential file is unreadable or corrupt.', { cause: error });
    }
  };
  // One-time migration: persist the original environment credential immediately.
  // A follow-up release removes the environment fallback after production has
  // written this record, so a missing credential file will fail closed.
  if (!read() && fallbackPassword) {
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(passwordRecord(fallbackPassword)), { mode: 0o600 });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  }
  return {
    isConfigured() { return Boolean(read()); },
    verify(password) {
      const stored = read();
      return stored ? verifyRecord(password, stored) : false;
    },
    set(password) {
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(passwordRecord(password)), { mode: 0o600 });
      fs.renameSync(temporary, file);
      fs.chmodSync(file, 0o600);
    },
  };
}

export function createPasswordResetManager({ ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const tokens = new Map();
  const digest = token => crypto.createHash('sha256').update(String(token)).digest('hex');
  const prune = () => { for (const [key, value] of tokens) if (value.expiresAt <= now()) tokens.delete(key); };
  return {
    issue(email) {
      prune();
      tokens.clear();
      const token = crypto.randomBytes(32).toString('hex');
      tokens.set(digest(token), { email, expiresAt: now() + ttlMs });
      return token;
    },
    consume(token) {
      prune();
      const key = digest(token), record = tokens.get(key);
      if (!record) return null;
      tokens.clear();
      return record;
    },
  };
}
