// Ao programar/postar: renderiza a arte no navegador e manda pro servidor (JPEG ou MP4), que a Meta vai baixar na hora.
import { api } from './api.js';
import { exportReel, renderSet } from './art.js';
import { typeOf } from './util.js';

async function send(id, name, blob, cloud) {
  if (!cloud) return api(`/api/items/${id}/export?name=${name}`, { method: 'POST', raw: blob });
  const { uploadPresigned: upload } = await import('@vercel/blob/client');
  await upload(`images/${id}/${name}`, blob, { access: 'private', handleUploadUrl: '/api/blob-upload', contentType: blob.type, multipart: blob.size > 50e6 });
}

export async function prepareExport(it, cloud, onStep = () => {}) {
  let kind, names;
  if (typeOf(it) === 'video') {
    onStep('Gravando o reel…');
    const { blob, ext } = await exportReel(it);
    if (ext !== 'mp4') throw new Error('Seu navegador gravou o reel em WebM e o Instagram só aceita MP4. Use o Chrome ou Edge atualizado.');
    names = ['out-reel.mp4']; kind = 'reel';
    onStep('Enviando o vídeo…'); await send(it.id, names[0], blob, cloud);
  } else {
    onStep('Renderizando a arte…');
    const set = await renderSet(it, 'image/jpeg');
    kind = set.slides.length > 1 ? 'carousel' : 'post';
    names = set.slides.map((_, i) => `out-${i + 1}.jpg`);
    onStep('Enviando a arte…');
    for (let i = 0; i < names.length; i++) await send(it.id, names[i], await (await fetch(set.slides[i].dataUrl)).blob(), cloud);
  }
  return api(`/api/items/${it.id}/export-done`, { method: 'POST', body: { kind, files: names } });
}
