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
export async function uploadMedia(itemId, file, slot, cloud, onProgress) {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase().replace('jpeg', 'jpg');
  if (!cloud) return api(`/api/items/${itemId}/media?name=${encodeURIComponent(file.name)}${slot ? '&slot=' + slot : ''}`, { method: 'POST', raw: file });
  const base = slot === 'cutout' ? 'media-cutout' : slot === 'add' ? 'media-add-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) : ext === '.mp4' ? 'media-video' : 'media-photo';
  await cloudPut(`images/${itemId}/${base}${ext}`, file, onProgress);
  return api(`/api/items/${itemId}/media-ref`, { method: 'POST', body: { file: base + ext, slot } });
}

// nuvem: pede um link assinado e sobe direto pro armazenamento (R2), com progresso. Blob antigo como reserva.
export async function cloudPut(pathname, file, onProgress) {
  const r = await api('/api/upload-url', { method: 'POST', body: { path: pathname } });
  if (r.legacy) {
    const { uploadPresigned: upload } = await import('@vercel/blob/client');
    return upload(pathname, file, { access: 'private', handleUploadUrl: '/api/blob-upload', contentType: file.type || undefined, multipart: file.size > 50e6, onUploadProgress: onProgress && (p => onProgress(p.percentage)) });
  }
  await new Promise((ok, no) => {
    const x = new XMLHttpRequest(); x.open('PUT', r.url);
    if (file.type) x.setRequestHeader('Content-Type', file.type);
    if (onProgress) x.upload.onprogress = e => e.lengthComputable && onProgress(Math.round(e.loaded / e.total * 100));
    x.onload = () => (x.status < 300 ? ok() : no(new Error(`Falha ao enviar (${x.status}).`)));
    x.onerror = () => no(new Error('Falha de rede ao enviar o arquivo.'));
    x.send(file);
  });
}
