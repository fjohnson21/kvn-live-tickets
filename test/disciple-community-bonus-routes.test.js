import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('Community Bonus payout route requires legal approval',()=>{const s=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');assert.match(s,/COMMUNITY_BONUS_LEGAL_APPROVED/);assert.match(s,/disciple-community-bonuses\/:id\/mark-paid/);});
