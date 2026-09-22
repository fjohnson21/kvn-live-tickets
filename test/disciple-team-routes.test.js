import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('owner routes manage Leaders and direct teams',()=>{const s=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');assert.match(s,/\/api\/disciples\/:id\/leader-status/);assert.match(s,/\/api\/disciple-teams\/assign/);assert.match(s,/auth,owner/);});
