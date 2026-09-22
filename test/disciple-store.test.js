import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDiscipleProgramCollections } from '../store.js';

test('adds Kingdom Disciple collections without changing existing records', () => {
  const order={id:'ord_existing'};
  const store={orders:[order],settings:{defaultDiscipleCommissionPercent:10}};
  ensureDiscipleProgramCollections(store);
  assert.equal(store.orders[0],order);
  assert.deepEqual(store.discipleTeams,[]);
  assert.deepEqual(store.discipleCommunityBonuses,[]);
  assert.deepEqual(store.discipleBundleActions,[]);
  assert.equal(store.settings.communityBonusPercent,2);
});
