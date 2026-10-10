export async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.raw ? { 'Content-Type': 'application/octet-stream' } : (opts.body ? { 'Content-Type': 'application/json' } : undefined),
    body: opts.raw || (opts.body ? JSON.stringify(opts.body) : undefined)
  });
  let j = null; try { j = await r.json(); } catch {}
  if (r.status === 401 && !path.startsWith('/api/login') && !path.startsWith('/api/session')) { location.reload(); throw new Error('Sessão expirada'); }
  if (!r.ok) throw new Error((j && j.error) || ('Erro ' + r.status));
  return j;
}

// Na nuvem (Vercel) a função aceita no máximo 4,5 MB, então a foto/vídeo vai direto do navegador pro Blob
// e depois só avisamos o servidor. Local: corpo cru como sempre.
export async function uploadMedia(itemId, file, slot, cloud) {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase().replace('jpeg', 'jpg');
  if (!cloud) return api(`/api/items/${itemId}/media?name=${encodeURIComponent(file.name)}${slot ? '&slot=' + slot : ''}`, { method: 'POST', raw: file });
  const base = slot === 'cutout' ? 'media-cutout' : slot === 'add' ? 'media-add-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) : ext === '.mp4' ? 'media-video' : 'media-photo';
  const { upload } = await import('@vercel/blob/client');
  await upload(`images/${itemId}/${base}${ext}`, file, { access: 'private', handleUploadUrl: '/api/blob-upload', multipart: file.size > 50e6 });
  return api(`/api/items/${itemId}/media-ref`, { method: 'POST', body: { file: base + ext, slot } });
}
