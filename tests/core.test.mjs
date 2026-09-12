import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, productPrice, money, categoryOf, selectProducts, validateDraft, makePayload, safeImage, escapeHTML, whatsappLink, MAX_DOCUMENT_BYTES } from '../dist/core.mjs';

test('Brazilian prices, thousands, decimals and the legacy apostrophe price', () => {
  for (const [input, expected] of [['R$250,00',25000],['R$99,99',9999],['R$89’99',8999],['1.250,50',125050],['89.90',8990],['1.250',125000],['250',25000],['0,00',0]]) assert.equal(parsePrice(input), expected, input);
  for (const input of ['', 'Sob Consulta', '-25', '99 reais', '12,345', '12.34.5', Infinity]) assert.equal(parsePrice(input), null);
  assert.equal(productPrice({price:'R$ 89,99',priceCents:10000}),10000);
  assert.match(money(8999), /89,99/);
});
test('Legacy product categories and accent insensitive multiword search', () => {
  const products = [{id:'1',title:'Bolsa Clássica',desc:'Cor pérola',price:'R$ 99,99'}, {id:'2',title:'Bolsa Maternidade Personalizada',price:'Sob consulta'}];
  assert.equal(categoryOf(products[0]),'bolsas');
  assert.equal(categoryOf(products[1]),'personalizados');
  assert.deepEqual(selectProducts(products,{search:'classica perola'}).map(p=>p.id),['1']);
  assert.deepEqual(selectProducts(products,{category:'personalizados'}).map(p=>p.id),['2']);
});
test('Unknown prices always sort after priced pieces, including descending', () => {
  const products=[{id:'a',price:'Sob consulta'},{id:'b',price:'R$ 20,00'},{id:'c',price:'R$ 10,00'}];
  assert.deepEqual(selectProducts(products,{sort:'price-high'}).map(p=>p.id),['b','c','a']);
  assert.deepEqual(selectProducts(products,{sort:'price-low'}).map(p=>p.id),['c','b','a']);
});
test('Markup and unsafe image schemes cannot enter generated product cards', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  for(const value of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','//bad.example/a.jpg','http://bad.example/a.jpg']) assert.equal(safeImage(value),'');
  assert.equal(safeImage('data:image/jpeg;base64,YWJj'), 'data:image/jpeg;base64,YWJj');
  assert.equal(safeImage('assets/bag-0.jpg'),'assets/bag-0.jpg');
});
test('Publishing requires a title and photos and guards the Firestore document size', () => {
  const draft={title:' Bolsa ',price:'89,99',description:'Feita à mão',category:'bolsas',photos:[{}]};
  const data=makePayload(draft,['data:image/jpeg;base64,YWJj']);
  assert.equal(data.title,'Bolsa');assert.equal(data.priceCents,8999);assert.equal(data.imgs.length,1);
  assert.ok(validateDraft({...draft,title:' '}));assert.ok(validateDraft({...draft,photos:[]}));
  assert.ok(validateDraft({...draft,photos:Array(7).fill({})}));
  assert.throws(()=>makePayload(draft,['data:image/jpeg;base64,'+'A'.repeat(MAX_DOCUMENT_BYTES)]),/grandes/);
  assert.throws(()=>makePayload(draft,[]),/todas as fotos/);
});
test('WhatsApp link retains the correct store, specific piece and escaped URL', () => {
  const url=new URL(whatsappLink({id:'abc',title:'Bolsa & Clássica'},'https://loja.example/#vitrine'));
  assert.equal(url.hostname,'wa.me');assert.equal(url.pathname,'/5511913028442');
  assert.match(url.searchParams.get('text'),/Bolsa & Clássica/);
  assert.match(url.searchParams.get('text'),/https:\/\/loja.example\/#peca\/abc/);
});
