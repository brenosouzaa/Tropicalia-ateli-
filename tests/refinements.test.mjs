import test from 'node:test';
import assert from 'node:assert/strict';
import { makeContacts, contactsOf, whatsappLink, normalizeInstagram, normalizeWhatsapp, validateProductWrite, validateLayoutWrite, makePayload, sanitizeProduct, categoryOf } from '../dist/core.mjs';
import { fitDimensions, boundTransform, zoomAround } from '../dist/zoom.mjs';

test('Portrait, landscape and square photographs keep their original proportions', () => {
  assert.deepEqual(fitDimensions(400, 400, 1200, 1800), { width: 266.66666666666663, height: 400 });
  assert.deepEqual(fitDimensions(400, 500, 2000, 1000), { width: 400, height: 200 });
  assert.deepEqual(fitDimensions(400, 500, 900, 900), { width: 400, height: 400 });
  assert.deepEqual(fitDimensions(0, 500, 900, 900), { width: 0, height: 0 });
});
test('Zoom keeps the selected detail in position and prevents panning beyond photo edges', () => {
  const enlarged = zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 60, y: -40 });
  assert.deepEqual(enlarged, { scale: 2, x: -60, y: 40 });
  const bounds = boundTransform({ scale: 7, x: 9000, y: -9000 }, { width: 400, height: 500 }, { width: 400, height: 200 });
  assert.deepEqual(bounds, { scale: 4, x: 600, y: -150 });
  const fit = boundTransform({ scale: .5, x: 900, y: -900 }, { width: 400, height: 500 }, { width: 400, height: 200 });
  assert.equal(fit.scale, 1); assert.equal(Math.abs(fit.x), 0); assert.equal(Math.abs(fit.y), 0);
});
test('Store contact changes propagate to the product-specific WhatsApp address', () => {
  const settings = makeContacts({ whatsapp: '(21) 98888-7777', instagram: 'https://www.instagram.com/novo.atelie/' });
  assert.deepEqual(settings, { whatsapp: '5521988887777', instagram: 'novo.atelie' });
  const link = new URL(whatsappLink({ id: 'bag1', title: 'Bolsa' }, 'https://tropicalia-atelie.vercel.app/#vitrine', settings.whatsapp));
  assert.equal(link.pathname, '/5521988887777'); assert.match(link.searchParams.get('text'), /#peca\/bag1/);
  assert.equal(normalizeWhatsapp('+351 912 345 678'), '351912345678');
  assert.equal(normalizeWhatsapp('5511913028442'), '5511913028442');
});
test('Contact configuration rejects script URLs, foreign hosts, credentials and paths', () => {
  for (const value of ['https://instagram.com.evil.test/name', 'javascript:alert(1)', 'https://u:p@instagram.com/name', 'https://instagram.com/name?url=other', 'https://instagram.com/p/photo', '@profile/else', '@profile..name', '__proto__/']) assert.equal(normalizeInstagram(value), '', value);
  for (const value of ['javascript:12345678', '+000000000', '123', '5511&text=evil']) assert.equal(normalizeWhatsapp(value), '', value);
  assert.throws(() => makeContacts({ whatsapp: 'bad', instagram: '@nome' }));
  assert.deepEqual(contactsOf({ whatsapp: 'javascript:foo', instagram: 'bad/path' }), contactsOf({}));
});
test('Write validation rejects injected fields, malformed metadata and oversized photos', () => {
  const payload = makePayload({ title: 'Bolsa', price: '12,00', description: '', photos: [{}], category: 'bolsas' }, ['data:image/jpeg;base64,YWJj']);
  assert.equal(validateProductWrite(payload), payload);
  assert.throws(() => validateProductWrite({ ...payload, admin: true }));
  assert.throws(() => validateProductWrite({ ...payload, category: '__proto__' }));
  assert.throws(() => validateProductWrite({ ...payload, priceCents: -1 }));
  assert.throws(() => validateProductWrite({ ...payload, imgs: ['javascript:alert(1)'] }));
  assert.throws(() => validateLayoutWrite({ admin: true }));
  assert.throws(() => validateLayoutWrite({ bannerTitleColor: 'red; background:url(evil)' }));
  assert.throws(() => validateLayoutWrite({ whatsapp: '5511988887777' }));
  assert.deepEqual(validateLayoutWrite({ whatsapp: '5511988887777', instagram: 'atelie' }), { whatsapp: '5511988887777', instagram: 'atelie' });
});
test('Malformed catalogue entries cannot crash the detail screen or inject prototype keys', () => {
  assert.equal(sanitizeProduct({ id: '../../other', title: 'Bolsa' }), null);
  assert.equal(sanitizeProduct(null), null);
  const data = sanitizeProduct({ id: 'bag1', title: { trim: 'bad' }, category: '__proto__', imgs: ['javascript:evil'], availability: 'constructor' });
  assert.equal(data.title, 'Peça do ateliê'); assert.equal(data.category, 'outros'); assert.equal(data.availability, ''); assert.deepEqual(data.imgs, []);
  assert.equal(categoryOf({ title: 'Bolsa', category: 'constructor' }), 'bolsas');
});
