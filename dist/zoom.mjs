const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function fitDimensions(width, height, naturalWidth, naturalHeight) {
  if (![width, height, naturalWidth, naturalHeight].every(n => Number.isFinite(n) && n > 0)) return { width: 0, height: 0 };
  const fit = Math.min(width / naturalWidth, height / naturalHeight);
  return { width: naturalWidth * fit, height: naturalHeight * fit };
}
export function boundTransform(state, viewport, fitted) {
  const scale = clamp(Number.isFinite(state.scale) ? state.scale : 1, 1, 4);
  const maxX = Math.max(0, (fitted.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (fitted.height * scale - viewport.height) / 2);
  return { scale, x: clamp(Number.isFinite(state.x) ? state.x : 0, -maxX, maxX), y: clamp(Number.isFinite(state.y) ? state.y : 0, -maxY, maxY) };
}
export function zoomAround(state, nextScale, point) {
  const scale = clamp(nextScale, 1, 4), ratio = scale / state.scale;
  return { scale, x: point.x - (point.x - state.x) * ratio, y: point.y - (point.y - state.y) * ratio };
}

export function createZoomViewer() {
  const $ = id => document.getElementById(id);
  const dialog = $('zoom-dialog'), viewport = $('zoom-viewport'), img = $('zoom-image');
  let photos = [], index = 0, title = '', state = { scale: 1, x: 0, y: 0 }, onNavigate = () => {};
  const pointers = new Map();
  let gesture = null, moved = false, lastTap = null;
  const metrics = () => {
    const rect = viewport.getBoundingClientRect();
    return { rect, viewport: { width: rect.width, height: rect.height }, fitted: fitDimensions(rect.width, rect.height, img.naturalWidth, img.naturalHeight) };
  };
  function paint() {
    const m = metrics();
    state = boundTransform(state, m.viewport, m.fitted);
    img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    viewport.dataset.enlarged = String(state.scale > 1);
    $('zoom-reset').textContent = `${Math.round(state.scale * 100)}%`;
    $('zoom-out').disabled = state.scale <= 1;
    $('zoom-in').disabled = state.scale >= 4;
  }
  function reset() { state = { scale: 1, x: 0, y: 0 }; pointers.clear(); gesture = null; paint(); }
  function position(clientX, clientY) {
    const { rect } = metrics();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }
  function zoom(scale, point = { x: 0, y: 0 }) { state = zoomAround(state, scale, point); paint(); }
  function show(next) {
    if (!photos.length) return;
    index = (next + photos.length) % photos.length;
    img.src = photos[index]; img.alt = `${title}, foto ${index + 1} de ${photos.length}`;
    $('zoom-counter').textContent = `${index + 1} / ${photos.length}`;
    $('zoom-prev').disabled = $('zoom-next').disabled = photos.length < 2;
    lastTap = null; reset(); onNavigate(index);
  }
  function baseline() {
    const points = [...pointers.values()];
    if (points.length > 1) {
      const [a, b] = points;
      gesture = { kind: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, state: { ...state } };
    } else gesture = points.length ? { kind: 'pan', point: points[0], state: { ...state } } : null;
  }
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, position(event.clientX, event.clientY));
    if (pointers.size === 1) moved = false;
    else { moved = true; lastTap = null; }
    baseline();
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, position(event.clientX, event.clientY));
    const values = [...pointers.values()];
    if (gesture?.kind === 'pinch' && values.length >= 2) {
      const [a, b] = values, midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = zoomAround(gesture.state, gesture.state.scale * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance, gesture.midpoint);
      state = { ...next, x: next.x + midpoint.x - gesture.midpoint.x, y: next.y + midpoint.y - gesture.midpoint.y };
      moved = true; paint();
    } else if (gesture?.kind === 'pan' && values.length === 1) {
      const dx = values[0].x - gesture.point.x, dy = values[0].y - gesture.point.y;
      if (Math.hypot(dx, dy) > 8) moved = true;
      state = { ...state, x: gesture.state.x + dx, y: gesture.state.y + dy }; paint();
    }
  });
  function end(event) {
    if (!pointers.has(event.pointerId)) return;
    if (event.type === 'pointerup' && event.pointerType !== 'mouse' && pointers.size === 1 && !moved) {
      const point = position(event.clientX, event.clientY), now = performance.now();
      if (lastTap && now - lastTap.time < 320 && Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) < 35) {
        zoom(state.scale > 1 ? 1 : 2.5, point); lastTap = null;
      } else lastTap = { time: now, point };
    }
    pointers.delete(event.pointerId); baseline();
  }
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', event => { moved = true; lastTap = null; end(event); });
  viewport.addEventListener('lostpointercapture', event => { pointers.delete(event.pointerId); baseline(); });
  viewport.addEventListener('dblclick', event => { event.preventDefault(); zoom(state.scale > 1 ? 1 : 2.5, position(event.clientX, event.clientY)); });
  viewport.addEventListener('wheel', event => {
    event.preventDefault(); zoom(state.scale * Math.exp(-event.deltaY * .0025), position(event.clientX, event.clientY));
  }, { passive: false });
  $('zoom-in').addEventListener('click', () => zoom(state.scale + .5));
  $('zoom-out').addEventListener('click', () => zoom(state.scale - .5));
  $('zoom-reset').addEventListener('click', reset);
  $('zoom-prev').addEventListener('click', () => show(index - 1));
  $('zoom-next').addEventListener('click', () => show(index + 1));
  dialog.addEventListener('keydown', event => {
    if (['+', '=', '-', '0', 'Home', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    if (event.key === '+' || event.key === '=') zoom(state.scale + .5);
    if (event.key === '-') zoom(state.scale - .5);
    if (event.key === '0' || event.key === 'Home') reset();
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  img.addEventListener('load', paint);
  img.addEventListener('error', () => { $('zoom-counter').textContent = 'Foto indisponível'; });
  new ResizeObserver(() => { if (dialog.open) { pointers.clear(); gesture = null; paint(); } }).observe(viewport);
  dialog.addEventListener('close', () => { photos = []; img.removeAttribute('src'); pointers.clear(); gesture = null; lastTap = null; });
  return {
    open(images, photoIndex, productTitle, navigate) {
      if (!images.length) return;
      photos = images; title = productTitle; onNavigate = navigate;
      $('zoom-title').textContent = title;
      if (!dialog.open) dialog.showModal();
      show(photoIndex); viewport.focus();
    },
    close() { if (dialog.open) dialog.close(); }
  };
}
