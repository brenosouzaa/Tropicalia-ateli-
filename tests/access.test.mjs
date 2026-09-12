import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedAdminSession } from '../dist/access-policy.mjs';

test('Only the explicitly authorized ateliê administrator receives panel access', () => {
  const user = { uid: 'test-admin', isAnonymous: false };
  const claims = { tropicaliaAdmin: true, firebase: { sign_in_provider: 'password' }, auth_time: 100000 };
  assert.equal(allowedAdminSession(user, claims, 100010), true);
  for (const token of [null, {}, { ...claims, tropicaliaAdmin: false }, { ...claims, tropicaliaAdmin: 'true' }, { ...claims, admin: true, tropicaliaAdmin: undefined }]) {
    assert.equal(allowedAdminSession(user, token, 100010), false);
  }
  assert.equal(allowedAdminSession(null, claims, 100010), false);
  assert.equal(allowedAdminSession({ ...user, isAnonymous: true }, claims, 100010), false);
  assert.equal(allowedAdminSession(user, { ...claims, firebase: { sign_in_provider: 'anonymous' } }, 100010), false);
  assert.equal(allowedAdminSession(user, claims, 128801), false);
  assert.equal(allowedAdminSession(user, { ...claims, auth_time: 100100 }, 100010), false);
});
