import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

// This suite is deliberately limited to a demo emulator project. It never touches production.
const projectId = 'demo-tropicalia';
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'produtos', 'existing'), { title: 'Peça antiga', price: 'R$ 10,00', desc: '', imgs: ['data:image/jpeg;base64,YWJj'], date: Timestamp.fromMillis(1000) });
    await setDoc(doc(context.firestore(), 'config', 'layout'), { bannerTitle: 'Ateliê' });
    await setDoc(doc(context.firestore(), 'private', 'secret'), { value: 'emulator-only' });
  });
});
after(async () => { await env?.cleanup(); });
const dbFor = (claims = {}) => env.authenticatedContext('test-owner', { auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'password' }, ...claims }).firestore();
const payload = () => ({ title: 'Bolsa de teste', desc: '', price: 'R$ 99,90', priceCents: 9990, category: 'bolsas', availability: 'ready', imgs: ['data:image/jpeg;base64,YWJj'], date: serverTimestamp(), updatedAt: serverTimestamp() });

test('Visitors can read catalogue and contacts but cannot create, edit, delete or grant access', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'produtos', 'existing')));
  await assertSucceeds(getDoc(doc(db, 'config', 'layout')));
  await assertFails(setDoc(doc(db, 'produtos', 'visitor'), payload()));
  await assertFails(updateDoc(doc(db, 'produtos', 'existing'), { title: 'Changed' }));
  await assertFails(deleteDoc(doc(db, 'produtos', 'existing')));
  await assertFails(setDoc(doc(db, 'config', 'layout'), { whatsapp: '5511988887777', instagram: 'attacker', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'admins', 'visitor'), { tropicaliaAdmin: true }));
  await assertFails(getDoc(doc(db, 'private', 'secret')));
});
test('An ordinary signed-in account has no administrative writes', async () => {
  for (const claims of [{}, { admin: true }, { tropicaliaAdmin: 'true' }, { tropicaliaAdmin: true, firebase: { sign_in_provider: 'anonymous' } }, { tropicaliaAdmin: true, auth_time: Math.floor(Date.now() / 1000) - 28810 }]) {
    await assertFails(setDoc(doc(dbFor(claims), 'produtos', 'ordinary-user'), payload()));
  }
});
test('Authorized admin can publish, edit legacy records, change contacts and delete', async () => {
  const db = dbFor({ tropicaliaAdmin: true });
  const ref = doc(db, 'produtos', 'admin-piece');
  await assertSucceeds(setDoc(ref, payload()));
  await assertSucceeds(updateDoc(ref, { title: 'Nova descrição', updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'produtos', 'existing'), { ...payload(), date: Timestamp.fromMillis(1000) }, { merge: true }));
  await assertSucceeds(updateDoc(doc(db, 'config', 'layout'), { whatsapp: '5511988887777', instagram: 'novo.atelie', updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(ref));
});
test('Even an admin cannot inject fields, unsafe images or invalid contact settings', async () => {
  const db = dbFor({ tropicaliaAdmin: true });
  for (const change of [{ extraRole: 'admin' }, { priceCents: -1 }, { imgs: ['javascript:alert(1)'] }, { imgs: [] }, { title: '' }, { category: '__proto__' }, { updatedAt: Timestamp.fromMillis(0) }]) {
    await assertFails(setDoc(doc(db, 'produtos', 'invalid'), { ...payload(), ...change }));
  }
  await assertFails(updateDoc(doc(db, 'config', 'layout'), { whatsapp: 'not-a-number', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'config', 'layout'), { instagram: 'https://evil.test', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db, 'config', 'layout')));
});
