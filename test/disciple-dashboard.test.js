import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('Command Center exposes Leader, team, bonus and bundle controls',()=>{const js=fs.readFileSync(new URL('../public/dashboard.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../public/dashboard.html',import.meta.url),'utf8'),server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');for(const phrase of ['Kingdom Leader','Assign Team','Community Bonus','Complimentary Bundle','Optional Bundle'])assert.match(js,new RegExp(phrase));assert.match(html,/Disciples/);for(const field of ['discipleTeams','discipleCommunityBonuses','discipleBundleActions','communityBonusLegalApproved'])assert.match(server,new RegExp(field));});

test('server exposes owner-only Disciple lifecycle operations',()=>{
  const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(source,/approveDiscipleApplication/);
  assert.match(source,/resendDiscipleWelcome/);
  assert.match(source,/setDiscipleActiveStatus/);
  assert.match(source,/\/api\/disciples\/:id\/welcome\/resend/);
  assert.match(source,/\/api\/disciples\/:id\/status/);
  assert.match(source,/\/api\/disciples\/:id\/audit/);
  assert.match(source,/app\.post\('\/api\/disciples', auth, owner,/);
  assert.match(source,/app\.put\('\/api\/disciples\/:id', auth, owner,/);
  assert.match(source,/app\.post\('\/api\/disciples\/:id\/event-rate', auth, owner,/);
});

test('legacy public application endpoint cannot manufacture current agreement evidence',()=>{
  const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/disciples.html',import.meta.url),'utf8');
  assert.match(source,/app\.post\('\/api\/disciples\/apply'.*410/s);
  assert.doesNotMatch(html,/v2\.1|name="attested"/);
  assert.match(html,/https:\/\/kvnlive\.com\/disciples/);
});

test('Command Center exposes configuration health and every Disciple operating control',()=>{
  const js=fs.readFileSync(new URL('../public/dashboard.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/dashboard.html',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(server,/buildSystemHealth/);
  assert.match(server,/\/api\/system-health/);
  for(const id of ['discipleHealth','dEmailAttention','discipleApplications','disciplesTable'])assert.match(html,new RegExp(`id="${id}"`));
  for(const phrase of ['Export Applications','Export Disciples','Export Commissions','Export Payouts'])assert.match(html,new RegExp(phrase));
  for(const fn of ['discipleStatus','copyDiscipleLink','testDiscipleLink','resendWelcome','editDisciple','toggleDiscipleActive','toggleKingdomLeader','assignKingdomTeam','triggerLeaderBundle','inviteDiscipleBundle','creditDiscipleSale'])assert.match(js,new RegExp(`(?:window\\.)?${fn}`));
  for(const label of ['Approve','Need Info','Reject','Copy Link','Test Link','Resend Welcome','Edit','Deactivate','Reactivate','Kingdom Leader','Assign Team','Complimentary Bundle','Optional Bundle','Credit Sale'])assert.match(js,new RegExp(label));
});

test('dashboard stylesheet is readable CSS and styles the live operation states',()=>{
  const bytes=fs.readFileSync(new URL('../public/styles.css',import.meta.url));
  const css=bytes.toString('utf8');
  assert.equal(Buffer.from(css,'utf8').equals(bytes),true,'stylesheet must be valid UTF-8');
  assert.doesNotMatch(css,/\uFFFD/,'stylesheet must not contain replacement characters');
  for(const selector of ['.operation-notice','.health-grid','.health-card','.health-card.ready','.health-card.failed','.action-grid','.compact-input','.attention-text'])assert.match(css,new RegExp(selector.replace('.','\\.')));
});

test('Command Center exposes working commission, payout, and export operations',()=>{
  const js=fs.readFileSync(new URL('../public/dashboard.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/dashboard.html',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  for(const id of ['dPendingCommission','dPaidCommission','discipleCommissionsTable','disciplePayoutsTable'])assert.match(html,new RegExp(`id="${id}"`));
  for(const fn of ['markDiscipleCommissionPaid','reverseDiscipleCommission'])assert.match(server,new RegExp(fn));
  for(const route of ['applications.csv','disciples.csv','commissions.csv','payouts.csv'])assert.match(server,new RegExp(route.replace('.','\\.')));
  for(const fn of ['payDiscipleCommission','reverseDiscipleCommissionAction'])assert.match(js,new RegExp(`window\\.${fn}`));
  for(const label of ['Record Paid','Reverse','Payment reference','Reversal reason'])assert.match(js,new RegExp(label));
});

test('refund routes use stable Stripe idempotency keys and reload before persistence',()=>{
  const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(source,/shop-refund:\$\{order\.id\}/);
  assert.match(source,/event-refund:\$\{o\.id\}/);
  assert.match(source,/const latest=readStore\(\)/);
});
