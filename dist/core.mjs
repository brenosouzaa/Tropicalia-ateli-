export const CATEGORIES = { bolsas: 'Bolsas', personalizados: 'Personalizados', acessorios: 'Acessórios', outros: 'Outras peças' };
export const AVAILABILITY = { ready: 'Pronta entrega', order: 'Sob encomenda', unavailable: 'Indisponível no momento' };
export const MAX_PHOTOS = 6;
export const MAX_DOCUMENT_BYTES = 880000;
export const DEFAULT_CONTACTS = Object.freeze({ whatsapp: '5511913028442', instagram: 'tropicalia_atelie' });
const owns = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const normalizeText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  let text = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/[\s\u00a0]/g, '').replace(/[’']/g, ',');
  if (!text || !/^[\d.,]+$/.test(text)) return null;
  if (text.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) return null;
    text = text.replaceAll('.', '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replaceAll('.', '');
  else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 9999999 ? Math.round(number * 100) : null;
}
export const money = cents => cents === null || cents === undefined ? 'Sob consulta' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const productPrice = p => Number.isSafeInteger(p.priceCents) && p.priceCents >= 0 && p.priceCents <= 999999900 ? p.priceCents : parsePrice(p.price);
export function categoryOf(p) {
  if (owns(CATEGORIES, p.category)) return p.category;
  const value = normalizeText(`${p.title} ${p.desc}`);
  if (/personaliz|maternidade/.test(value)) return 'personalizados';
  if (/bolsa|bag|cantil/.test(value)) return 'bolsas';
  return 'outros';
}
export function safeImage(value) {
  if (typeof value !== 'string') return '';
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value)) return value;
  if (/^assets\/[a-z\d_.-]+\.(jpg|jpeg|png|webp)$/i.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export const imagesOf = p => (Array.isArray(p?.imgs) ? p.imgs : [p?.img]).slice(0, MAX_PHOTOS).map(safeImage).filter(Boolean);
export function sanitizeProduct(p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^[a-z\d_-]{1,128}$/i.test(p.id)) return null;
  return { id: p.id, title: typeof p.title === 'string' ? p.title.slice(0, 100).trim() || 'Peça do ateliê' : 'Peça do ateliê', desc: typeof p.desc === 'string' ? p.desc.slice(0, 2500) : '', priceCents: productPrice(p), imgs: imagesOf(p), category: categoryOf(p), availability: owns(AVAILABILITY, p.availability) ? p.availability : '', date: p.date, updatedAt: p.updatedAt };
}
export function productDate(p) {
  const d = p.date;
  if (typeof d?.toMillis === 'function') return d.toMillis();
  if (typeof d?.seconds === 'number') return d.seconds * 1000;
  return Number(new Date(d || 0)) || 0;
}
export function selectProducts(products, { search = '', category = 'all', sort = 'recent' } = {}) {
  const tokens = normalizeText(search).split(/\s+/).filter(Boolean);
  return products.filter(p => {
    const haystack = normalizeText(`${p.title} ${p.desc} ${CATEGORIES[categoryOf(p)]}`);
    return (category === 'all' || categoryOf(p) === category) && tokens.every(token => haystack.includes(token));
  }).sort((a, b) => {
    if (sort === 'name') return String(a.title).localeCompare(String(b.title), 'pt-BR');
    if (sort.startsWith('price')) {
      const ap = productPrice(a), bp = productPrice(b);
      if (ap === null && bp === null) return productDate(b) - productDate(a);
      if (ap === null) return 1;
      if (bp === null) return -1;
      return sort === 'price-low' ? ap - bp : bp - ap;
    }
    return productDate(b) - productDate(a);
  });
}
export function validateDraft(draft) {
  if (!draft.photos?.length) return 'Escolha pelo menos uma foto para a peça.';
  if (draft.photos.length > MAX_PHOTOS) return `Escolha até ${MAX_PHOTOS} fotos por peça.`;
  if (!String(draft.title || '').trim()) return 'Dê um nome para a sua peça.';
  if (String(draft.title).length > 100) return 'Use até 100 caracteres no nome.';
  if (String(draft.description || '').length > 2500) return 'Use até 2.500 caracteres na descrição.';
  if (String(draft.price || '').trim() && parsePrice(draft.price) === null) return 'Confira o preço. Use, por exemplo, 89,90.';
  return '';
}
export function makePayload(draft, images) {
  const validation = validateDraft(draft);
  if (validation) throw new Error(validation);
  if (images.length !== draft.photos.length || images.some(image => !safeImage(image))) throw new Error('Não foi possível preparar todas as fotos. Selecione-as novamente.');
  const cents = parsePrice(draft.price);
  const data = { title: draft.title.trim(), price: money(cents), priceCents: cents, desc: String(draft.description || '').trim(), imgs: images, category: owns(CATEGORIES, draft.category) ? draft.category : 'outros', availability: owns(AVAILABILITY, draft.availability) ? draft.availability : '' };
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_DOCUMENT_BYTES) throw new Error('As fotos ainda estão grandes. Remova uma foto e tente novamente.');
  return data;
}
export function validateProductWrite(data) {
  const allowed = ['title', 'price', 'priceCents', 'desc', 'imgs', 'category', 'availability'];
  if (!data || Object.keys(data).some(key => !allowed.includes(key))) throw new Error('Os dados da peça não são válidos.');
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 100 || typeof data.desc !== 'string' || data.desc.length > 2500) throw new Error('Confira o nome e a descrição da peça.');
  if (!owns(CATEGORIES, data.category) || (data.availability !== '' && !owns(AVAILABILITY, data.availability))) throw new Error('Confira a categoria e a disponibilidade.');
  if (data.priceCents !== null && (!Number.isSafeInteger(data.priceCents) || data.priceCents < 0 || data.priceCents > 999999900)) throw new Error('Confira o preço da peça.');
  if (typeof data.price !== 'string' || data.price.length > 32 || !Array.isArray(data.imgs) || data.imgs.length < 1 || data.imgs.length > MAX_PHOTOS || data.imgs.some(image => !safeImage(image))) throw new Error('Confira as fotos e o preço da peça.');
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_DOCUMENT_BYTES) throw new Error('As fotos ainda estão grandes. Remova uma foto e tente novamente.');
  return data;
}
export function validateLayoutWrite(data) {
  const allowed = ['bannerTitle', 'bannerSubtitle', 'bannerTitleColor', 'bannerSubtitleColor', 'banner', 'coverVersion', 'whatsapp', 'instagram'];
  if (!data || !Object.keys(data).length || Object.keys(data).some(key => !allowed.includes(key))) throw new Error('As configurações não são válidas.');
  for (const [key, max] of [['bannerTitle', 70], ['bannerSubtitle', 180]]) {
    if (key in data && (typeof data[key] !== 'string' || data[key].length > max)) throw new Error('Confira os textos da capa.');
  }
  for (const key of ['bannerTitleColor', 'bannerSubtitleColor']) if (key in data && !/^#[\da-f]{6}$/i.test(data[key])) throw new Error('Confira as cores da capa.');
  if ('banner' in data && (!safeImage(data.banner) || data.banner.length > 700000)) throw new Error('Confira a foto da capa.');
  if ('coverVersion' in data && data.coverVersion !== 2) throw new Error('A versão da capa não é válida.');
  if ('whatsapp' in data || 'instagram' in data) {
    const contacts = makeContacts(data);
    if (contacts.whatsapp !== data.whatsapp || contacts.instagram !== data.instagram) throw new Error('Confira o formato dos contatos.');
  }
  return data;
}
export function normalizeWhatsapp(value) {
  const text = String(value ?? '').trim();
  if (!/^[+\d\s().-]+$/.test(text)) return '';
  let digits = text.replace(/\D/g, '');
  if (!text.startsWith('+') && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}
export function normalizeInstagram(value) {
  let text = String(value ?? '').trim();
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.search || url.hash) return '';
      text = url.pathname.replace(/^\/|\/$/g, '');
    } catch { return ''; }
  }
  text = text.replace(/^@/, '');
  return /^[a-z\d_](?:[a-z\d_.]{0,28}[a-z\d_])?$/i.test(text) && !text.includes('..') ? text : '';
}
export function contactsOf(data = {}) {
  return { whatsapp: normalizeWhatsapp(data.whatsapp) || DEFAULT_CONTACTS.whatsapp, instagram: normalizeInstagram(data.instagram) || DEFAULT_CONTACTS.instagram };
}
export function makeContacts(value) {
  const whatsapp = normalizeWhatsapp(value.whatsapp), instagram = normalizeInstagram(value.instagram);
  if (!whatsapp) throw new Error('Confira o WhatsApp. Informe o DDD e o número; para outro país, comece com + e o código do país.');
  if (!instagram) throw new Error('Confira o Instagram. Use @nomedoperfil ou o link completo do perfil.');
  return { whatsapp, instagram };
}
export function contactLink(phone = DEFAULT_CONTACTS.whatsapp, message = '') {
  const number = normalizeWhatsapp(phone);
  if (!number) throw new Error('Número de WhatsApp inválido.');
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
export function whatsappLink(product, origin, phone = DEFAULT_CONTACTS.whatsapp) {
  const title = String(product.title || 'esta peça').trim();
  const base = origin && /^https?:\/\//.test(origin) ? `${origin.split('#')[0].split('?')[0]}#peca/${encodeURIComponent(product.id)}` : '';
  return contactLink(phone, `Olá, Tropicalia Ateliê! Gostei da peça ${title}. Quero saber mais sobre as cores e a disponibilidade.${base ? `\n${base}` : ''}`);
}
