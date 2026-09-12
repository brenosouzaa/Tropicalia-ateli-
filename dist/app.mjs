import { CATEGORIES, AVAILABILITY, escapeHTML as e, money, productPrice, categoryOf, imagesOf, safeImage, selectProducts, validateDraft, makePayload, whatsappLink, contactsOf, makeContacts, contactLink, normalizeInstagram, normalizeWhatsapp, sanitizeProduct } from './core.mjs';
import { createZoomViewer } from './zoom.mjs';
import { addPhotoFiles, disposePhotos, preparePhotos, compressPhoto } from './images.mjs';

const $ = id => document.getElementById(id);
const paths = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8M8 14h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  minus: '<path d="M5 12h14"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M7 10.5h7M10.5 7v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-6-6L3 21"/>',
  'image-plus': '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8M16 5h6M19 2v6"/><circle cx="8" cy="8" r="1.5"/><path d="m21 16-6-6L3 21"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m5 5 5 4-5 4M9 12h12"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="m15 4 5 5M4 16l12-12a3 3 0 0 1 4 4L8 20l-5 1 1-5ZM13 21h8"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.image}</svg>`;
function icons(root = document) { root.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); }); }
icons();
$('year').textContent = new Date().getFullYear();

let products = [], currentUser = null, api, apiPromise, unsubscribeProducts, liveReady = false;
let snapshotDate = '', activeFilter = 'all', selectedDetail = null, detailIndex = 0;
let draft = emptyDraft(), draftStep = 0, activePhoto = 0, dirty = false, busy = false;
let bannerData = {}, bannerPhoto = null, bannerDirty = false, bannerBusy = false, initialRouteHandled = false;
let toastTimer, syncTimer, idleTimer, lastActivity = 0, sessionGeneration = 0;
let contactsDirty = false, contactsBusy = false;
const zoomViewer = createZoomViewer();
const privateDialogs = new Set(['admin-dialog', 'composer-dialog', 'banner-dialog', 'contacts-dialog']);
function emptyDraft() { return { id: null, editing: false, title: '', price: '', description: '', category: 'bolsas', availability: '', photos: [] }; }
function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 4500);
}
function errorText(error) {
  const code = error?.code || '';
  if (/permission-denied|unauthorized/.test(code)) return 'Sua conta não tem permissão para salvar. Confira as permissões do ateliê.';
  if (/auth\/(invalid-credential|wrong-password|user-not-found|invalid-email)/.test(code)) return 'Confira seu e-mail e senha e tente novamente.';
  if (/too-many-requests/.test(code)) return 'Foram muitas tentativas. Aguarde um pouco e tente novamente.';
  if (/network|unavailable|deadline/.test(code)) return 'Não conseguimos concluir a conexão. Suas alterações continuam aqui; tente novamente.';
  if (/auth\//.test(code)) return 'Não foi possível entrar. Confira o e-mail, a senha e a conexão.';
  return error?.message && !/^Firebase/.test(error.message) ? error.message : 'Não foi possível concluir. Tente novamente em instantes.';
}
function fieldError(id, message) { $(id).textContent = message; $(id).hidden = !message; }
function openDialog(id) {
  if (privateDialogs.has(id) && !currentUser) { openDialog('login-dialog'); return; }
  if (!$(id).open) $(id).showModal();
}
function closeDialog(id) { if ($(id).open) $(id).close(); }
function clearPrivateState() {
  sessionGeneration++; clearTimeout(idleTimer);
  for (const id of privateDialogs) closeDialog(id);
  closeDialog('confirm-dialog');
  $('owner-bar').hidden = true; $('admin-list').replaceChildren();
  $('login-password').value = ''; $('composer-form').reset(); $('contacts-form').reset(); $('banner-form').reset();
  disposePhotos(draft.photos); draft = emptyDraft(); dirty = false;
  if (bannerPhoto) disposePhotos([bannerPhoto]); bannerPhoto = null; bannerDirty = false; contactsDirty = false;
  $('photo-thumbnails').replaceChildren(); $('preview-image').removeAttribute('src');
}
async function endIdleSession() {
  if (!currentUser || Date.now() - lastActivity < 30 * 60 * 1000) return;
  currentUser = null; clearPrivateState(); renderProducts();
  try { await api?.logout(); } catch { /* The interface is already locked. */ }
  toast('Sua sessão foi encerrada por inatividade. Entre novamente para continuar.');
}
function recordActivity() {
  if (!currentUser) return;
  if (Date.now() - lastActivity > 30 * 60 * 1000 && lastActivity) { void endIdleSession(); return; }
  lastActivity = Date.now(); clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void endIdleSession(), 30 * 60 * 1000 + 100);
}
['pointerdown', 'keydown', 'input', 'scroll'].forEach(name => document.addEventListener(name, event => {
  if (event.isTrusted && currentUser && Date.now() - lastActivity > 1000) recordActivity();
}, { passive: true, capture: true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) void endIdleSession(); });
document.addEventListener('click', event => {
  const close = event.target.closest('[data-close]');
  if (close) {
    if (close.dataset.close === 'banner-dialog') void closeBanner();
    else if (close.dataset.close === 'contacts-dialog') void closeContacts();
    else closeDialog(close.dataset.close);
  }
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return;
    if (dialog.id === 'composer-dialog') void closeComposer();
    else if (dialog.id === 'banner-dialog') void closeBanner();
    else if (dialog.id === 'contacts-dialog') void closeContacts();
    else if (dialog.id !== 'confirm-dialog') dialog.close();
  });
});

function renderProducts() {
  const list = selectProducts(products, { search: $('search').value, category: activeFilter, sort: $('sort').value });
  $('result-count').textContent = `${list.length} ${list.length === 1 ? 'peça' : 'peças'} para conhecer`;
  $('empty-state').hidden = list.length > 0;
  $('product-grid').setAttribute('aria-busy', 'false');
  $('product-grid').innerHTML = list.map(p => {
    const photos = imagesOf(p), category = categoryOf(p);
    const badge = p.availability === 'unavailable' ? 'Indisponível' : p.availability === 'ready' ? 'Pronta entrega' : category === 'personalizados' || p.availability === 'order' ? 'Sob encomenda' : '';
    return `<article class="product-card"><a class="product-image-link" href="#peca/${encodeURIComponent(p.id)}" aria-label="Ver detalhes de ${e(p.title)}">${photos[0] ? `<img src="${e(photos[0])}" alt="${e(p.title)}" width="800" height="1000" loading="lazy" decoding="async">` : `<span class="missing-photo">Foto indisponível</span>`}${photos[1] ? `<img class="alternate" src="${e(photos[1])}" alt="" width="800" height="1000" loading="lazy" decoding="async">` : ''}${badge ? `<span class="product-badge ${p.availability === 'unavailable' ? 'unavailable' : ''}">${badge}</span>` : ''}<span class="card-discover">${icon('arrow')}</span></a><div class="product-info"><span class="product-category">${e(CATEGORIES[category])}</span><h3 class="product-title"><a href="#peca/${encodeURIComponent(p.id)}">${e(p.title)}</a></h3><span class="product-price">${e(money(productPrice(p)))}</span>${currentUser ? `<div class="product-admin-actions"><button data-edit="${e(p.id)}">${icon('edit')} Editar</button></div>` : ''}</div></article>`;
  }).join('');
  if ($('admin-dialog').open) renderAdmin();
}
function syncWarning(message) {
  clearTimeout(syncTimer);
  $('sync-notice').replaceChildren(document.createTextNode(message + ' '));
  const retry = document.createElement('button'); retry.textContent = 'Tentar novamente'; retry.addEventListener('click', () => void connectLive()); $('sync-notice').append(retry); $('sync-notice').hidden = false;
}
async function getApi() {
  if (api) return api;
  if (!apiPromise) apiPromise = import('./firebase.mjs').then(module => {
    api = module;
    api.observeAuth(user => {
      const previous = currentUser; currentUser = user;
      $('owner-bar').hidden = !user;
      if (!user) clearPrivateState();
      else if (!previous || previous.uid !== user.uid) { sessionGeneration++; lastActivity = 0; recordActivity(); }
      renderProducts();
      if ($('composer-dialog').open) renderComposer();

    });
    return api;
  }).catch(() => { apiPromise = null; throw new Error('A conexão do ateliê não carregou. Verifique sua internet e tente novamente.'); });
  return apiPromise;
}
async function connectLive() {
  clearTimeout(syncTimer);
  $('sync-notice').hidden = true;
  syncTimer = setTimeout(() => syncWarning(snapshotDate ? `A atualização está demorando. Exibindo a vitrine de ${snapshotDate}. Confirme a disponibilidade pelo WhatsApp.` : 'A atualização da vitrine está demorando.'), 15000);
  try {
    const backend = await getApi();
    unsubscribeProducts?.();
    unsubscribeProducts = backend.subscribeProducts(records => {
      products = records.map(sanitizeProduct).filter(Boolean); liveReady = true; clearTimeout(syncTimer); $('sync-notice').hidden = true; renderProducts();
      if (selectedDetail) {
        const latest = products.find(p => p.id === selectedDetail.id);
        if (!latest) { closeDialog('detail-dialog'); toast('Esta peça saiu da vitrine.'); }
        else if (JSON.stringify(latest) !== JSON.stringify(selectedDetail)) {
          const previousIndex = detailIndex; showDetail(latest); updateGallery(previousIndex);
        }
      }
      handleInitialRoute();
      if (!selectedDetail && location.hash.startsWith('#peca/')) route();
    }, () => syncWarning(snapshotDate ? `Não foi possível atualizar. Exibindo a vitrine de ${snapshotDate}. Confirme a disponibilidade pelo WhatsApp.` : 'Não foi possível carregar a vitrine agora.'));
    if (!connectLive.layoutStarted) {
      connectLive.layoutStarted = true;
      backend.subscribeLayout(data => { bannerData = data; renderBanner(); renderContacts(); }, () => { connectLive.layoutStarted = false; });
    }
  } catch (error) { syncWarning(errorText(error)); }
}
async function initializeCatalogue() {
  try {
    const response = await fetch('./catalogue.json');
    if (!response.ok) throw new Error('snapshot');
    const snapshot = await response.json();
    if (!liveReady) { products = (Array.isArray(snapshot.products) ? snapshot.products : []).map(sanitizeProduct).filter(Boolean); snapshotDate = snapshot.capturedAt.split('-').reverse().join('/'); renderProducts(); handleInitialRoute(); }
  } catch { if (!liveReady) { $('product-grid').replaceChildren(); $('product-grid').setAttribute('aria-busy', 'false'); $('result-count').textContent = 'Aguarde um instante…'; } }
}
void initializeCatalogue();
void connectLive();
window.addEventListener('online', () => void connectLive());
window.addEventListener('offline', () => syncWarning('Você está sem conexão. Confirme a disponibilidade quando a internet voltar.'));
$('search').addEventListener('input', renderProducts);
$('sort').addEventListener('change', renderProducts);
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  renderProducts();
}));
$('reset-search').addEventListener('click', () => { $('search').value = ''; document.querySelector('[data-filter="all"]').click(); });
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); }
});

function handleInitialRoute() { if (!initialRouteHandled) { initialRouteHandled = true; route(); } }
function route() {
  const match = location.hash.match(/^#peca\/(.+)$/);
  if (match) {
    let id; try { id = decodeURIComponent(match[1]); } catch { return; }
    const p = products.find(item => item.id === id);
    if (p) showDetail(p);
    else if (liveReady) toast('Esta peça não está mais na vitrine.');
  } else {
    closeDialog('detail-dialog');
    if (location.hash === '#atelie') void openAdmin();
  }
}
window.addEventListener('hashchange', route);
function showDetail(product) {
  zoomViewer.close();
  selectedDetail = product; detailIndex = 0;
  const photos = imagesOf(product), category = categoryOf(product);
  const title = String(product.title || 'Peça do ateliê').trim();
  const status = AVAILABILITY[product.availability] || 'Consultar disponibilidade';
  $('detail-content').innerHTML = `<div class="detail-toolbar"><button class="detail-back" data-close="detail-dialog">${icon('chevron-left')} Voltar à vitrine</button><span>TROPICALIA ATELIÊ</span><button class="icon-button" data-close="detail-dialog" aria-label="Fechar detalhes">${icon('x')}</button></div>
    <div class="detail-layout"><div class="detail-photos"><div class="main-image-frame" id="detail-image-frame">
    ${photos.length ? `<button class="detail-image-button" data-zoom aria-label="Ampliar foto de ${e(title)}"><img id="detail-main-image" src="${e(photos[0])}" alt="${e(title)}, foto 1 de ${photos.length}" draggable="false"></button><button class="zoom-affordance" data-zoom>${icon('zoom')} Ampliar foto</button>` : '<span class="missing-photo">Foto indisponível</span>'}
    ${photos.length > 1 ? `<button class="icon-button gallery-arrow prev" data-gallery="-1" aria-label="Foto anterior">${icon('chevron-left')}</button><button class="icon-button gallery-arrow next" data-gallery="1" aria-label="Próxima foto">${icon('chevron-right')}</button>` : ''}</div>
    ${photos.length ? `<div class="gallery-caption"><span>Explore cada detalhe</span><span id="detail-photo-counter" aria-live="polite">1 / ${photos.length}</span></div>` : ''}
    <div class="detail-thumbs" aria-label="Fotos da peça">${photos.map((src, i) => `<button class="detail-thumb ${i === 0 ? 'active' : ''}" data-thumb="${i}" aria-label="Ver foto ${i + 1}" aria-pressed="${i === 0}"><img src="${e(src)}" alt="" loading="lazy"></button>`).join('')}</div></div>
    <div class="detail-info"><span class="eyebrow">${e(CATEGORIES[category])}</span><h2 id="detail-title">${e(title)}</h2>
    <div class="detail-price-row"><div class="detail-price">${e(money(productPrice(product)))}</div><span class="detail-status ${product.availability === 'unavailable' ? 'unavailable' : ''}">${e(status)}</span></div>
    <h3 class="detail-copy-label">Sobre esta peça</h3><p class="detail-description">${e(product.desc || 'Quer conhecer os materiais, as medidas ou as cores? O ateliê conta os detalhes para você.')}</p>
    <div class="detail-conversation"><p>${product.availability === 'unavailable' ? 'Esta peça está indisponível no momento. Converse com o ateliê sobre a possibilidade de uma nova encomenda.' : 'Gostou? Fale com o ateliê para combinar cores, detalhes e prazos.'}</p><a id="detail-whatsapp" class="button button-dark" href="${e(whatsappLink(product, location.href, contactsOf(bannerData).whatsapp))}" target="_blank" rel="noopener noreferrer">${icon('message')} ${product.availability === 'unavailable' ? 'Consultar uma encomenda' : 'Conversar sobre esta peça'} ${icon('arrow')}</a><small>Atendimento direto pelo WhatsApp.</small></div>
    <div class="detail-meta">${icon('star')} TROPICALIA ATELIÊ · Feito à mão</div></div></div>`;
  openDialog('detail-dialog');
  document.title = `${title} · TROPICALIA ATELIÊ`;
}
function updateGallery(index) {
  const photos = imagesOf(selectedDetail);
  if (!photos.length) return;
  detailIndex = (index + photos.length) % photos.length;
  const mainImage = $('detail-main-image'); if (!mainImage) return;
  mainImage.src = photos[detailIndex];
  mainImage.alt = `${String(selectedDetail.title || 'Peça do ateliê')}, foto ${detailIndex + 1} de ${photos.length}`;
  const counter = $('detail-photo-counter'); if (counter) counter.textContent = `${detailIndex + 1} / ${photos.length}`;
  $('detail-dialog').querySelectorAll('[data-thumb]').forEach(button => { const active = Number(button.dataset.thumb) === detailIndex; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}
$('detail-dialog').addEventListener('click', event => {
  const direction = event.target.closest('[data-gallery]'), thumbnail = event.target.closest('[data-thumb]');
  if (direction) updateGallery(detailIndex + Number(direction.dataset.gallery));
  if (thumbnail) updateGallery(Number(thumbnail.dataset.thumb));
  if (event.target.closest('[data-zoom]') && !suppressPhotoClick && selectedDetail) zoomViewer.open(imagesOf(selectedDetail), detailIndex, String(selectedDetail.title || 'Peça do ateliê'), updateGallery);
});
$('detail-dialog').addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); updateGallery(detailIndex + (event.key === 'ArrowRight' ? 1 : -1)); }
});
let swipeStart = null, suppressPhotoClick = false;
$('detail-dialog').addEventListener('touchstart', event => { if (event.touches.length === 1 && event.target.closest('.detail-image-button')) { suppressPhotoClick = false; swipeStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }; } }, { passive: true });
$('detail-dialog').addEventListener('touchend', event => {
  if (!swipeStart) return;
  const dx = event.changedTouches[0].clientX - swipeStart.x, dy = event.changedTouches[0].clientY - swipeStart.y;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { suppressPhotoClick = true; updateGallery(detailIndex + (dx < 0 ? 1 : -1)); setTimeout(() => { suppressPhotoClick = false; }, 450); }
  swipeStart = null;
}, { passive: true });
$('detail-dialog').addEventListener('close', () => {
  zoomViewer.close(); selectedDetail = null; document.title = 'TROPICALIA ATELIÊ · Peças com personalidade';
  if (location.hash.startsWith('#peca/')) history.replaceState(null, '', '#vitrine');
});

async function openAdmin() {
  if (currentUser) { renderAdmin(); openDialog('admin-dialog'); }
  else { fieldError('login-error', ''); openDialog('login-dialog'); }
}
$('open-admin').addEventListener('click', () => void openAdmin());
$('manage-products').addEventListener('click', () => void openAdmin());
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('login-submit'); button.disabled = true; button.textContent = 'Entrando…'; fieldError('login-error', '');
  try {
    const backend = await getApi(); const result = await backend.login($('login-email').value, $('login-password').value); currentUser = result.user; lastActivity = 0; recordActivity(); $('owner-bar').hidden = false; $('login-password').value = ''; renderProducts();
    closeDialog('login-dialog');
    renderAdmin(); openDialog('admin-dialog');
    toast('Bem-vindo ao seu ateliê.');
  } catch (error) { fieldError('login-error', errorText(error)); }
  finally { $('login-password').value = ''; button.disabled = false; button.innerHTML = `Entrar no ateliê ${icon('arrow')}`; }
});
$('toggle-password').addEventListener('click', () => { const input = $('login-password'); input.type = input.type === 'password' ? 'text' : 'password'; $('toggle-password').setAttribute('aria-label', input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha'); });
$('login-dialog').addEventListener('close', () => { $('login-password').value = ''; $('login-password').type = 'password'; $('toggle-password').setAttribute('aria-label', 'Mostrar senha'); });
$('logout').addEventListener('click', async () => {
  try { await (await getApi()).logout(); closeDialog('admin-dialog'); toast('Você saiu da conta.'); } catch (error) { toast(errorText(error), true); }
});
function renderAdmin() {
  if (!currentUser) { $('admin-list').replaceChildren(); return; }
  $('admin-count').textContent = `${products.length} ${products.length === 1 ? 'peça' : 'peças'}`;
  $('admin-list').innerHTML = selectProducts(products).map(p => `<article class="admin-row">${imagesOf(p)[0] ? `<img src="${e(imagesOf(p)[0])}" alt="${e(p.title)}" loading="lazy">` : ''}<div class="admin-row-info"><h3>${e(p.title)}</h3><p>${e(money(productPrice(p)))} · ${e(CATEGORIES[categoryOf(p)])}</p></div><div class="admin-row-actions"><button class="button button-outline" data-edit="${e(p.id)}" aria-label="Editar ${e(p.title)}">${icon('edit')} Editar</button><button class="icon-button danger" data-delete="${e(p.id)}" aria-label="Excluir ${e(p.title)}">${icon('trash')}</button></div></article>`).join('') || '<p class="field-help">Sua vitrine está esperando a primeira peça. Que tal começar por uma foto?</p>';
}
document.addEventListener('click', event => {
  const edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-delete]');
  if (edit && currentUser) void startComposer(products.find(p => p.id === edit.dataset.edit));
  if (remove && currentUser) void removeProduct(remove.dataset.delete);
});
function confirmAction(title, text, accept = 'Confirmar') {
  return new Promise(resolve => {
    $('confirm-title').textContent = title; $('confirm-text').textContent = text; $('confirm-accept').textContent = accept;
    let result = false;
    const done = () => { $('confirm-accept').removeEventListener('click', yes); $('confirm-cancel').removeEventListener('click', no); resolve(result); };
    const yes = () => { result = true; closeDialog('confirm-dialog'); };
    const no = () => closeDialog('confirm-dialog');
    $('confirm-accept').addEventListener('click', yes); $('confirm-cancel').addEventListener('click', no); $('confirm-dialog').addEventListener('close', done, { once: true }); openDialog('confirm-dialog'); $('confirm-cancel').focus();
  });
}
async function removeProduct(id) {
  const p = products.find(item => item.id === id); if (!p || !currentUser) return;
  if (!await confirmAction('Excluir esta peça?', `“${p.title.trim()}” será removida da vitrine. Essa ação não pode ser desfeita.`, 'Excluir peça')) return;
  try { await (await getApi()).deleteProduct(id); products = products.filter(item => item.id !== id); renderProducts(); renderAdmin(); toast('Peça removida da vitrine.'); }
  catch (error) { toast(errorText(error), true); }
}

$('admin-add').addEventListener('click', () => void startComposer());
$('quick-publish').addEventListener('click', () => void startComposer());
async function startComposer(product) {
  if (!currentUser) { void openAdmin(); return; }
  if (busy) return;
  const generation = sessionGeneration;
  if (product) {
    try { product = await (await getApi()).readProduct(product.id); }
    catch (error) { toast(errorText(error), true); return; }
  }
  if (!currentUser || generation !== sessionGeneration) return;
  disposePhotos(draft.photos); draft = emptyDraft();
  if (product) {
    const cents = productPrice(product);
    draft = { id: product.id, editing: true, title: String(product.title || '').trim(), price: cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','), description: product.desc || '', category: categoryOf(product), availability: product.availability || '', photos: imagesOf(product).map(src => ({ key: crypto.randomUUID(), src, local: false })) };
  }
  dirty = false; draftStep = product ? 1 : 0; activePhoto = 0;
  $('product-title').value = draft.title; $('product-price').value = draft.price; $('product-description').value = draft.description; $('product-category').value = draft.category; $('product-availability').value = draft.availability;
  $('product-files').value = ''; fieldError('composer-error', '');
  closeDialog('admin-dialog'); renderComposer(); openDialog('composer-dialog');
}
async function closeComposer() {
  if (busy) { toast('Aguarde a preparação ou o envio das fotos.'); return; }
  if (dirty && !await confirmAction('Sair sem publicar?', 'As alterações desta peça ainda não foram salvas.', 'Descartar alterações')) return;
  disposePhotos(draft.photos); draft = emptyDraft(); dirty = false; closeDialog('composer-dialog');
}
$('composer-close').addEventListener('click', () => void closeComposer());
$('composer-dialog').addEventListener('cancel', event => { event.preventDefault(); void closeComposer(); });
$('composer-back').addEventListener('click', () => {
  if (busy) return;
  if (draftStep > 0) { draftStep--; fieldError('composer-error', ''); renderComposer(); }
  else void closeComposer();
});
function collectFields() {
  Object.assign(draft, { title: $('product-title').value, price: $('product-price').value, description: $('product-description').value, category: $('product-category').value, availability: $('product-availability').value });
}
['product-title', 'product-price', 'product-description', 'product-category', 'product-availability'].forEach(id => $(id).addEventListener('input', () => { collectFields(); dirty = true; fieldError('composer-error', ''); updatePreview(); }));
$('product-price').addEventListener('blur', () => {
  const value = productPrice({ price: $('product-price').value });
  if (value !== null) $('product-price').value = (value / 100).toFixed(2).replace('.', ',');
  collectFields(); updatePreview();
});
function updatePreview() {
  const photo = draft.photos[Math.min(activePhoto, draft.photos.length - 1)];
  $('preview-placeholder').hidden = !!photo; $('preview-image').hidden = !photo;
  if (photo) $('preview-image').src = photo.src; else $('preview-image').removeAttribute('src');
  $('preview-title').textContent = draft.title.trim() || 'O nome da sua peça';
  $('preview-price').textContent = money(productPrice({ price: draft.price }));
  $('preview-category').textContent = CATEGORIES[draft.category] || 'Bolsas';
  $('preview-photo-label').hidden = draft.photos.length < 2;
  $('preview-photo-label').textContent = `${activePhoto + 1} / ${draft.photos.length}`;
}
function renderComposer() {
  if (!currentUser) return;
  $('composer-dialog').dataset.step = String(draftStep); $('composer-dialog').dataset.hasPhotos = String(draft.photos.length > 0);
  $('composer-eyebrow').textContent = draft.editing ? 'EDITAR PEÇA' : 'NOVA PEÇA';
  $('composer-title').textContent = ['Comece pela foto.', 'Conte sobre a sua peça.', 'Um último olhar.'][draftStep];

  ['step-photos', 'step-details', 'step-review'].forEach((id, i) => { $(id).hidden = i !== draftStep; });
  document.querySelectorAll('[data-step-label]').forEach(node => { node.classList.toggle('active', Number(node.dataset.stepLabel) <= draftStep); node.setAttribute('aria-current', Number(node.dataset.stepLabel) === draftStep ? 'step' : 'false'); });
  $('photo-drop').hidden = draft.photos.length > 0; $('photo-editor').hidden = !draft.photos.length;
  $('photo-count').textContent = `${draft.photos.length} de 6 fotos`;
  $('photo-thumbnails').innerHTML = draft.photos.map((photo, i) => `<button type="button" class="photo-thumb ${activePhoto === i ? 'active' : ''}" data-photo="${i}" aria-label="Visualizar foto ${i + 1}${i === 0 ? ', capa' : ''}" aria-pressed="${activePhoto === i}"><img src="${e(photo.src)}" alt="Foto ${i + 1}">${i === 0 ? '<span>Capa</span>' : ''}</button>`).join('');
  $('set-cover').disabled = activePhoto === 0 || busy;
  $('composer-progress-text').textContent = ['Primeiro, as fotos.', 'Só o nome é obrigatório.', 'Tudo certo para publicar?'][draftStep];
  $('composer-next').innerHTML = draftStep === 2 ? `${draft.editing ? 'Salvar alterações' : 'Publicar na vitrine'} ${icon('check')}` : `Continuar ${icon('arrow')}`;
  $('composer-next').disabled = busy;
  if (draftStep === 2) {
    activePhoto = 0;
    $('review-summary').innerHTML = [['Peça', draft.title], ['Valor', money(productPrice({ price: draft.price }))], ['Categoria', CATEGORIES[draft.category]], ['Fotos', `${draft.photos.length} ${draft.photos.length === 1 ? 'foto' : 'fotos'}`]].map(([key, value]) => `<div><dt>${e(key)}</dt><dd>${e(value)}</dd></div>`).join('');
  }
  updatePreview();
}
async function acceptPhotos(files) {
  if (busy || !currentUser) return;
  const generation = sessionGeneration;
  busy = true; $('composer-next').disabled = true; $('composer-progress-text').textContent = 'Preparando suas fotos…'; fieldError('composer-error', '');
  try { const added = await addPhotoFiles(files, draft.photos.length); if (!currentUser || generation !== sessionGeneration) { disposePhotos(added); return; } draft.photos.push(...added); dirty = dirty || added.length > 0; if (added.length) activePhoto = draft.photos.length - added.length; }
  catch (error) { fieldError('composer-error', errorText(error)); }
  finally { busy = false; $('product-files').value = ''; renderComposer(); }
}
$('product-files').addEventListener('change', event => void acceptPhotos(event.target.files));
['dragenter', 'dragover'].forEach(name => $('photo-drop').addEventListener(name, event => { event.preventDefault(); $('photo-drop').classList.add('drag-over'); }));
['dragleave', 'drop'].forEach(name => $('photo-drop').addEventListener(name, event => { event.preventDefault(); $('photo-drop').classList.remove('drag-over'); if (name === 'drop') void acceptPhotos(event.dataTransfer.files); }));
$('photo-thumbnails').addEventListener('click', event => { if (busy) return; const target = event.target.closest('[data-photo]'); if (target) { activePhoto = Number(target.dataset.photo); renderComposer(); } });
$('set-cover').addEventListener('click', () => { if (busy || !draft.photos.length) return; const [cover] = draft.photos.splice(activePhoto, 1); draft.photos.unshift(cover); activePhoto = 0; dirty = true; renderComposer(); });
$('remove-photo').addEventListener('click', () => { if (busy || !draft.photos.length) return; disposePhotos(draft.photos.splice(activePhoto, 1)); activePhoto = Math.max(0, activePhoto - 1); dirty = true; renderComposer(); });
$('review-edit').addEventListener('click', () => { if (!busy) { draftStep = 1; renderComposer(); } });
$('composer-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !currentUser) return; collectFields(); fieldError('composer-error', '');
  if (draftStep === 0) {
    if (!draft.photos.length) return fieldError('composer-error', 'Escolha pelo menos uma foto para continuar.');
    draftStep = 1; renderComposer(); $('product-title').focus(); return;
  }
  const validation = validateDraft(draft);
  if (validation) { fieldError('composer-error', validation); return; }
  if (draftStep === 1) { draftStep = 2; renderComposer(); $('composer-dialog').scrollTop = 0; return; }
  if (!currentUser) return;
  const generation = sessionGeneration;
  const publishingDraft = { ...draft, photos: [...draft.photos] };
  busy = true; $('composer-next').disabled = true; $('composer-back').disabled = true; $('upload-progress').hidden = false; $('upload-progress').value = 0; $('composer-next').textContent = 'Preparando fotos…';
  try {
    const backend = await getApi();
    publishingDraft.id ||= backend.newProductId(); draft.id = publishingDraft.id;
    const images = await preparePhotos(publishingDraft.photos, value => { $('upload-progress').value = value; $('composer-progress-text').textContent = `Preparando fotos · ${value}%`; });
    if (!currentUser || generation !== sessionGeneration) throw new Error('Sua sessão terminou. Entre novamente para publicar.');
    const payload = makePayload(publishingDraft, images);
    $('composer-next').textContent = 'Publicando…'; $('composer-progress-text').textContent = 'Enviando para a sua vitrine…';
    await backend.saveProduct(publishingDraft.id, payload, publishingDraft.editing);
    if (!currentUser || generation !== sessionGeneration) return;
    $('upload-progress').value = 100;
    const previous = products.find(p => p.id === draft.id);
    products = [{ ...previous, ...payload, id: draft.id, date: previous?.date || new Date().toISOString() }, ...products.filter(p => p.id !== draft.id)];
    const wasEditing = draft.editing; dirty = false; disposePhotos(draft.photos); draft = emptyDraft(); closeDialog('composer-dialog'); renderProducts();
    toast(wasEditing ? 'Alterações salvas. Sua vitrine está atualizada.' : 'Sua peça já está na vitrine!');
  } catch (error) { fieldError('composer-error', errorText(error)); }
  finally { busy = false; $('composer-back').disabled = false; $('upload-progress').hidden = true; if ($('composer-dialog').open) renderComposer(); }
});

function renderBanner() {
  if (typeof bannerData.bannerTitle === 'string' && bannerData.bannerTitle.trim()) $('hero-title').textContent = bannerData.bannerTitle;
  if (typeof bannerData.bannerSubtitle === 'string' && bannerData.bannerSubtitle.trim()) $('hero-subtitle').textContent = bannerData.bannerSubtitle;
  // The old empty decorative banner is retained in the database; the redesigned
  // cover uses the actual product photograph until the owner saves a new cover.
  if (bannerData.coverVersion === 2 && safeImage(bannerData.banner)) {
    $('hero-image').src = safeImage(bannerData.banner); $('hero-image').alt = 'Capa do TROPICALIA ATELIÊ'; $('hero-piece').hidden = true;
  }
  if (/^#[\da-f]{6}$/i.test(bannerData.bannerTitleColor || '')) $('hero-title').style.color = bannerData.bannerTitleColor;
  if (/^#[\da-f]{6}$/i.test(bannerData.bannerSubtitleColor || '')) $('hero-subtitle').style.color = bannerData.bannerSubtitleColor;
}
function renderContacts() {
  const contacts = contactsOf(bannerData);
  document.querySelectorAll('[data-contact="instagram"]').forEach(link => { link.href = `https://www.instagram.com/${contacts.instagram}/`; });
  document.querySelectorAll('[data-contact="whatsapp"]').forEach(link => { link.href = contactLink(contacts.whatsapp, link.dataset.message || ''); });
  if (selectedDetail && $('detail-whatsapp')) $('detail-whatsapp').href = whatsappLink(selectedDetail, location.href, contacts.whatsapp);
}
function updateContactPreview() {
  const phone = normalizeWhatsapp($('contact-whatsapp').value), profile = normalizeInstagram($('contact-instagram').value);
  const wa = $('contact-whatsapp-preview'), ig = $('contact-instagram-preview');
  if (phone) wa.href = contactLink(phone); else wa.removeAttribute('href');
  if (profile) ig.href = `https://www.instagram.com/${profile}/`; else ig.removeAttribute('href');
  wa.querySelector('span:nth-child(2)').textContent = phone ? `+${phone}` : 'Confira o número';
  ig.querySelector('span:nth-child(2)').textContent = profile ? `@${profile}` : 'Confira o perfil';
}
$('edit-contacts').addEventListener('click', () => {
  if (!currentUser || contactsBusy) return;
  const contacts = contactsOf(bannerData);
  $('contact-whatsapp').value = `+${contacts.whatsapp}`;
  $('contact-instagram').value = `@${contacts.instagram}`;
  contactsDirty = false; fieldError('contacts-error', ''); updateContactPreview();
  closeDialog('admin-dialog'); openDialog('contacts-dialog');
});
['contact-whatsapp', 'contact-instagram'].forEach(id => $(id).addEventListener('input', () => {
  contactsDirty = true; fieldError('contacts-error', ''); updateContactPreview();
}));
async function closeContacts() {
  if (contactsBusy) return;
  if (contactsDirty && !await confirmAction('Sair sem salvar os contatos?', 'As alterações nos contatos ainda não foram salvas.', 'Descartar alterações')) return;
  contactsDirty = false; closeDialog('contacts-dialog');
}
$('contacts-dialog').addEventListener('cancel', event => { event.preventDefault(); void closeContacts(); });
$('contacts-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!currentUser || contactsBusy) return;
  contactsBusy = true; $('save-contacts').disabled = true; $('save-contacts').textContent = 'Salvando contatos…'; fieldError('contacts-error', '');
  const generation = sessionGeneration;
  try {
    const data = makeContacts({ whatsapp: $('contact-whatsapp').value, instagram: $('contact-instagram').value });
    await (await getApi()).saveLayout(data);
    if (!currentUser || generation !== sessionGeneration) return;
    bannerData = { ...bannerData, ...data }; renderContacts(); contactsDirty = false; closeDialog('contacts-dialog');
    toast('Contatos atualizados em toda a vitrine.');
  } catch (error) { if (currentUser) fieldError('contacts-error', errorText(error)); }
  finally { contactsBusy = false; $('save-contacts').disabled = false; $('save-contacts').innerHTML = `Salvar contatos ${icon('check')}`; }
});
renderContacts();
$('edit-banner').addEventListener('click', () => {
  if (!currentUser) return;
  if (bannerPhoto) disposePhotos([bannerPhoto]); bannerPhoto = null; bannerDirty = false;
  $('banner-preview').src = $('hero-image').src;
  $('banner-heading').value = bannerData.bannerTitle || '';
  $('banner-subheading').value = bannerData.bannerSubtitle || '';
  $('banner-heading-color').value = bannerData.bannerTitleColor || '#fffdf7';
  $('banner-subheading-color').value = bannerData.bannerSubtitleColor || '#e0e8df';
  fieldError('banner-error', ''); $('banner-file').value = ''; closeDialog('admin-dialog'); openDialog('banner-dialog');
});
['banner-heading', 'banner-subheading', 'banner-heading-color', 'banner-subheading-color'].forEach(id => $(id).addEventListener('input', () => { bannerDirty = true; }));
$('banner-file').addEventListener('change', async event => {
  if (bannerBusy || !currentUser) return;
  bannerBusy = true; $('save-banner').disabled = true;
  try { const [photo] = await addPhotoFiles(event.target.files, 0); if (!photo) return; if (bannerPhoto) disposePhotos([bannerPhoto]); bannerPhoto = photo; $('banner-preview').src = photo.src; bannerDirty = true; fieldError('banner-error', ''); }
  catch (error) { fieldError('banner-error', errorText(error)); }
  finally { bannerBusy = false; $('save-banner').disabled = false; $('banner-file').value = ''; }
});
async function closeBanner() {
  if (bannerBusy) return;
  if (bannerDirty && !await confirmAction('Sair sem salvar a capa?', 'As alterações desta capa ainda não foram salvas.', 'Descartar alterações')) return;
  if (bannerPhoto) disposePhotos([bannerPhoto]); bannerPhoto = null; bannerDirty = false; closeDialog('banner-dialog');
}
$('banner-dialog').addEventListener('cancel', event => { event.preventDefault(); void closeBanner(); });
$('banner-form').addEventListener('submit', async event => {
  event.preventDefault(); if (bannerBusy || !currentUser) return;
  bannerBusy = true; $('save-banner').disabled = true; $('save-banner').textContent = 'Salvando sua capa…'; fieldError('banner-error', '');
  try {
    const data = { bannerTitle: $('banner-heading').value.trim() || 'Feito à mão. Feito para você.', bannerSubtitle: $('banner-subheading').value.trim() || 'Bolsas, acessórios e peças personalizadas para acompanhar a sua história.', bannerTitleColor: $('banner-heading-color').value, bannerSubtitleColor: $('banner-subheading-color').value };
    if (bannerPhoto) { data.banner = await compressPhoto(bannerPhoto, 700000, 1600); data.coverVersion = 2; }
    await (await getApi()).saveLayout(data); bannerData = { ...bannerData, ...data }; renderBanner(); bannerDirty = false; closeDialog('banner-dialog'); if (bannerPhoto) disposePhotos([bannerPhoto]); bannerPhoto = null; toast('Sua nova capa já está na vitrine.');
  } catch (error) { fieldError('banner-error', errorText(error)); }
  finally { bannerBusy = false; $('save-banner').disabled = false; $('save-banner').innerHTML = `Salvar capa ${icon('check')}`; }
});
window.addEventListener('beforeunload', event => { if (dirty || busy || bannerDirty || bannerBusy || contactsDirty || contactsBusy) { event.preventDefault(); event.returnValue = ''; } });
