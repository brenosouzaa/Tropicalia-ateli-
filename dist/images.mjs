import { MAX_PHOTOS, safeImage } from './core.mjs';
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => { img.src = ''; reject(new Error('A foto demorou para abrir. Escolha a imagem novamente.')); }, 25000);
    img.onload = () => { clearTimeout(timeout); img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error('Esta foto está vazia. Escolha outra.')); };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('Não conseguimos abrir esta imagem. No iPhone, exporte como JPEG ou escolha outra foto da galeria.')); };
    img.src = source;
  });
}
export async function addPhotoFiles(files, currentCount) {
  const list = Array.from(files);
  if (!list.length) return [];
  if (list.length + currentCount > MAX_PHOTOS) throw new Error(`Você pode usar até ${MAX_PHOTOS} fotos. Selecione no máximo ${MAX_PHOTOS - currentCount} agora.`);
  const created = [];
  try {
    for (const file of list) {
      if (!/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name) && !/^image\/(jpeg|png|webp|gif|heic|heif|avif)$/i.test(file.type)) throw new Error('Escolha um arquivo de foto: JPG, PNG ou outra imagem da galeria.');
      if (!file.size || file.size > 35 * 1024 * 1024) throw new Error('Escolha uma foto com até 35 MB.');
      // Check the bytes as well as the filename: do not accept a renamed SVG/HTML file.
      const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
      const ascii = new TextDecoder('latin1').decode(header);
      const raster = (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)
        || (header[0] === 0x89 && ascii.slice(1, 4) === 'PNG') || /^GIF8[79]a/.test(ascii)
        || (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')
        || (ascii.slice(4, 8) === 'ftyp' && /avif|avis|heic|heix|hevc|hevx|mif1|msf1/.test(ascii.slice(8)));
      if (!raster) throw new Error('Este arquivo não parece uma foto válida. Escolha uma imagem da galeria.');
      const src = URL.createObjectURL(file);
      try {
        const image = await loadImage(src);
        if (image.naturalWidth * image.naturalHeight > 60000000) throw new Error('A resolução desta foto é muito grande. Escolha uma versão com até 60 megapixels.');
      } catch (error) { URL.revokeObjectURL(src); throw error; }
      created.push({ key: crypto.randomUUID(), src, file, local: true });
    }
    return created;
  } catch (error) { disposePhotos(created); throw error; }
}
export function disposePhotos(photos) { for (const photo of photos) if (photo.local) URL.revokeObjectURL(photo.src); }
export async function compressPhoto(photo, budget = 126000, maxDimension = 1400) {
  if (!photo.local && safeImage(photo.src) && photo.src.length <= budget) return photo.src;
  const img = await loadImage(photo.src);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Seu navegador não conseguiu preparar a foto. Tente novamente.');
  for (const dimension of [...new Set([maxDimension, 1400, 1150, 960, 800, 640, 480].filter(n => n <= maxDimension))]) {
    const scale = Math.min(1, dimension / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [.86, .75, .64, .52, .42]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= budget) { canvas.width = canvas.height = 0; return data; }
    }
  }
  canvas.width = canvas.height = 0;
  throw new Error('Esta foto ficou muito grande. Tente escolher uma versão mais leve.');
}
export async function preparePhotos(photos, progress = () => {}) {
  const images = [];
  const budget = Math.floor(790000 / photos.length);
  for (let i = 0; i < photos.length; i++) {
    images.push(await compressPhoto(photos[i], budget, photos.length <= 2 ? 2200 : 1800));
    progress(Math.round((i + 1) / photos.length * 80));
  }
  return images;
}
