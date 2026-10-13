import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignRunner } from '../lib/marketing-runner.js';

test('marketing background runner is exported', () => { assert.equal(typeof createCampaignRunner, 'function'); });
