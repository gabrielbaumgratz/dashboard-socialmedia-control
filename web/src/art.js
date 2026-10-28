// artes em canvas: cache de imagens e capas, usado pela fila, calendário, feed e visualizador
import Render from './render.js';
import { DEF_TPL, typeOf } from './util.js';

const photoCache = new Map(), frameCache = new Map(), coverCache = new Map();
const capCache = (m, max = 20) => { while (m.size > max) m.delete(m.keys().next().value); };
export const clearCovers = () => coverCache.clear();
// extrai um quadro leve (máx 720px) do vídeo para servir de foto nos thumbnails, capas e stories sem gastar dezenas de MB de RAM
export function getVideoFrame(url) {
  if (!url) return Promise.resolve(null);
  if (!frameCache.has(url)) {
    capCache(frameCache, 12);
    frameCache.set(url, new Promise(async resolve => {
      let src = url, blobUrl = null;
      if (url.startsWith('/images/')) {
        try {
          const res = await fetch(url, { credentials: 'include' });
          if (res.ok) {
            const b = await res.blob();
            blobUrl = URL.createObjectURL(b);
            src = blobUrl;
          }
        } catch {}
      }
      const v = document.createElement('video');
      if (!blobUrl) v.crossOrigin = 'anonymous';
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      const done = ok => {
        try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
        if (blobUrl) try { URL.revokeObjectURL(blobUrl); } catch {}
        resolve(ok);
      };
      const timer = setTimeout(() => done(null), 7000);
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.1, v.duration || 0.1); } catch { clearTimeout(timer); done(null); } };
      v.onseeked = () => {
        clearTimeout(timer);
        try {
          if (!v.videoWidth || !v.videoHeight) return done(null);
          const sc = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(v.videoWidth * sc));
          c.height = Math.max(1, Math.round(v.videoHeight * sc));
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          done(c);
        } catch { done(null); }
      };
      v.onerror = () => { clearTimeout(timer); frameCache.delete(url); done(null); };
      v.src = src;
    }));
  }
  return frameCache.get(url);
}
// no máximo 8 downloads ao mesmo tempo com fila rápida para carregar feed sem travar
let busy = 0; const wait = [];
const slot = async () => { if (busy >= 8) await new Promise(r => wait.push(r)); busy++; };
const free = () => { busy--; const n = wait.shift(); if (n) n(); };
export function getImg(url) {
  if (!url) return Promise.resolve(null);
  if (!photoCache.has(url)) {
    capCache(photoCache, 120);
    // foto recém enviada pode demorar um instante pra ficar disponível: tenta de novo e nunca guarda falha no cache
    const p = (async () => {
      for (let t = 0; t < 4; t++) {
        await slot();
        try { return await Render.loadImage(url); } catch { /* tenta de novo */ } finally { free(); }
        await new Promise(r => setTimeout(r, 400 * (t + 1)));
      }
      photoCache.delete(url); return null;
    })();
    photoCache.set(url, p);
  }
  return photoCache.get(url);
}
const cleanCat = s => { const v = String(s || '').trim(); return /^(uncategorized|sem categoria)$/i.test(v) ? '' : v; };
export function artData(it) {
  return {
    title: it.title || it.origTitle || 'Título da notícia', category: cleanCat(it.category), focal: it.focal, focalStory: it.focalStory || it.focal, format: typeOf(it) === 'carrossel' ? 'carrossel' : 'post',
    slides: it.slides || [], tpl: { ...DEF_TPL, ...(it.tpl || {}) }, description: it.description || '', chip: it.chip || '',
    source: it.source || '', credit: it.credit || '', bigTitle: it.bigTitle || '', look: it.look || {}, storyTitle: it.storyTitle || '', storyCategory: it.storyCategory != null ? cleanCat(it.storyCategory) : null, cutoutImg: null, imgs: {},
    legendas: it.legendas || '', dateline: it.dateline || [String(Render.BRAND.location || '').split(',')[0], it.newsDate ? new Date(it.newsDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : ''].filter(Boolean).join(' · ')
  };
}
// Carrega apenas a imagem necessária para a CAPA/Story (economiza dezenas de downloads no feed e evita fundo azul por sobrecarga)
export async function prepCover(it) {
  const d = artData(it);
  let phUrl = it.photoUrl;
  if (!phUrl && d.slides && d.slides.length) {
    const firstWithPhoto = d.slides.find(s => s && s.photoUrl);
    if (firstWithPhoto) phUrl = firstWithPhoto.photoUrl;
  }
  if (it.cutoutUrl) d.cutoutImg = await getImg(it.cutoutUrl);
  let ph = await getImg(phUrl);
  if (!ph && it.videoUrl) ph = await getVideoFrame(it.videoUrl);
  if (ph && phUrl) d.imgs[phUrl] = ph;
  d.missing = !!(phUrl && !ph);
  return [d, ph];
}
export async function prep(it) {
  const d = artData(it);
  if (it.cutoutUrl) d.cutoutImg = await getImg(it.cutoutUrl);
  for (const s of d.slides) if (s && s.photoUrl) d.imgs[s.photoUrl] = await getImg(s.photoUrl);
  let ph = await getImg(it.photoUrl);
  if (!ph && d.slides && d.slides.length) {
    const firstWithPhoto = d.slides.find(s => s && s.photoUrl);
    if (firstWithPhoto) ph = d.imgs[firstWithPhoto.photoUrl] || await getImg(firstWithPhoto.photoUrl);
  }
  if (!ph && it.videoUrl) ph = await getVideoFrame(it.videoUrl);
  d.missing = (it.photoUrl && !ph) || d.slides.some(s => s && s.photoUrl && !d.imgs[s.photoUrl]);
  return [d, ph];
}
// se faltou foto, nunca guarda o resultado vazio: tenta de novo e, se ainda faltar, tira do cache pra próxima tentativa
async function solid(cache, key, run) {
  for (let t = 0; t < 3; t++) { const r = await run(); if (!r.miss) return r.v; if (t < 2) await new Promise(x => setTimeout(x, 1500)); else cache && cache.delete(key); }
  return (await run()).v;
}
const coverKey = it => JSON.stringify([it.id, it.focalStory, it.mediaType, it.videoUrl, it.title, it.category, it.photoUrl, it.focal, it.tpl, it.slides, it.description, it.chip, it.credit, it.source, it.bigTitle, it.cutoutUrl, it.look, it.storyTitle, it.storyCategory]);
export function coverUrl(it) {
  const key = coverKey(it);
  if (!coverCache.has(key)) {
    capCache(coverCache, 60);
    coverCache.set(key, solid(coverCache, key, async () => {
      const c = document.createElement('canvas'), [d, ph] = await prepCover(it);
      if (typeOf(it) === 'video') await Render.reelThumb(c, d, ph); else await Render.cover(c, d, ph);
      const v = c.toDataURL('image/jpeg', 0.85);
      c.width = 0; c.height = 0;
      return { v, miss: d.missing };
    }));
  }
  return coverCache.get(key);
}
// exporta em 4K (2x) em PNG ou JPG
export async function exportSet(it, fmt = 'png', scale = 2) {
  const mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png', ext = fmt === 'jpg' ? 'jpg' : 'png';
  Render.setScale(scale);
  try {
    const set = await renderSet(it, mime);
    return [...set.slides.map((f, i) => ({ ...f, name: `post-${i + 1}.${ext}` })), { ...set.story, name: `story.${ext}` }];
  } finally { Render.setScale(1); }
}
// download padrão: PNG em 2x (2160 px), sem perda, no formato que o downloadSet espera
export async function hiresSet(it) { const f = await exportSet(it, 'png', 2); return { slides: f.slice(0, -1), story: f[f.length - 1] }; }
export async function renderSet(it, mime = 'image/jpeg') {
  for (let t = 0; t < 2; t++) { const r = await renderOnce(it, mime); if (!r.miss) return r.v; await new Promise(x => setTimeout(x, 1500)); }
  return (await renderOnce(it, mime)).v;
}
async function renderOnce(it, mime) {
  const [d, photo] = await prep(it), c = document.createElement('canvas'), url = () => c.toDataURL(mime, 0.95);
  const files = [];
  if (typeOf(it) === 'video') { await Render.reelThumb(c, d, photo); files.push({ name: 'reel-capa.jpg', dataUrl: url() }); }
  else if (typeOf(it) === 'carrossel') for (let i = 0; i < Render.count(d); i++) { await Render.slide(c, d, photo, i); files.push({ name: `post-${i + 1}.jpg`, dataUrl: url() }); }
  else { await Render.post(c, d, photo); files.push({ name: 'post-1.jpg', dataUrl: url() }); }
  const zone = await Render.story(c, d, photo);
  const storyData = url();
  c.width = 0; c.height = 0;
  return { v: { slides: files, story: { name: 'story.' + (mime === 'image/png' ? 'png' : 'jpg'), dataUrl: storyData }, zone }, miss: d.missing };
}

const storyCache = new Map();
export function storyUrl(it) {
  const key = 's' + coverKey(it);
  if (!storyCache.has(key)) {
    capCache(storyCache, 48);
    storyCache.set(key, solid(storyCache, key, async () => {
      const c = document.createElement('canvas'), [d, ph] = await prepCover(it);
      await Render.story(c, d, ph);
      const v = c.toDataURL('image/jpeg', 0.8);
      c.width = 0; c.height = 0;
      return { v, miss: d.missing };
    }));
  }
  return storyCache.get(key);
}

// reel pronto em 1080p/2K (1080x1920 @ 30fps) ultra-otimizado e rápido: pré-carrega o vídeo em Blob local (imune a CORS e oscilações de rede) e pré-renderiza overlay na GPU
export async function exportReel(it, onProgress = () => {}, scale = 1) {
  await Render.preload();
  const d = artData(it);
  let srcUrl = it.videoUrl, blobObj = null;
  if (srcUrl && !srcUrl.startsWith('blob:') && !srcUrl.startsWith('data:')) {
    try {
      const res = await fetch(srcUrl, { credentials: 'include' });
      if (res.ok) {
        const b = await res.blob();
        blobObj = URL.createObjectURL(b);
        srcUrl = blobObj;
      }
    } catch {
      if (srcUrl.startsWith('/images/')) {
        try {
          const res2 = await fetch(srcUrl + (srcUrl.includes('?') ? '&' : '?') + 'proxy=1', { credentials: 'include' });
          if (res2.ok) {
            const b = await res2.blob();
            blobObj = URL.createObjectURL(b);
            srcUrl = blobObj;
          }
        } catch {}
      }
    }
  }

  const v = document.createElement('video');
  if (!blobObj) v.crossOrigin = 'anonymous';
  v.src = srcUrl;
  v.playsInline = true;
  v.preload = 'auto';
  v.muted = false;

  await new Promise((ok, no) => {
    let done = false;
    v.onloadeddata = () => { if (!done) { done = true; ok(); } };
    v.oncanplay = () => { if (!done) { done = true; ok(); } };
    v.onerror = () => { if (!done) { done = true; no(new Error('Não consegui abrir o vídeo.')); } };
    setTimeout(() => { if (!done) { done = true; ok(); } }, 6000);
  });

  const mimes = [
    'video/mp4;codecs=avc1.640033,mp4a.40.2',
    'video/mp4;codecs=avc1.4d0033,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  const mime = mimes.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('Este navegador não grava vídeo. Use o Chrome ou o Edge.');

  const sc = scale || 1;
  const c = document.createElement('canvas');
  c.width = 1080 * sc; c.height = 1920 * sc;
  const stream = c.captureStream(30);

  let ac, dest;
  try {
    ac = new AudioContext();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    dest = ac.createMediaStreamDestination();
    ac.createMediaElementSource(v).connect(dest);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  } catch {}

  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
  rec.start(250);

  const ctx = c.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;

  // pré-renderiza o overlay final na GPU uma única vez (após 0.92s de vídeo, só copia da GPU em 0.1ms!)
  const staticOv = document.createElement('canvas');
  staticOv.width = c.width; staticOv.height = c.height;
  Render.reelSync(staticOv, d, 99, true);

  const animOv = document.createElement('canvas');
  animOv.width = c.width; animOv.height = c.height;

  const blurCv = document.createElement('canvas');
  blurCv.width = 45; blurCv.height = 80;
  const blurCtx = blurCv.getContext('2d', { alpha: false });

  const stopped = new Promise(r => (rec.onstop = r));
  const box = Render.reelBox(d), f = d.focal || { x: 0.5, y: 0.5, zoom: 1 };
  const bx = box.x * sc, by = box.y * sc, bw = box.w * sc, bh = box.h * sc, br = (box.r || 0) * sc;
  const vw = v.videoWidth || 1080, vh = v.videoHeight || 1920;
  const cov = Math.max(bw / vw, bh / vh), s = cov * (f.zoom || 1);
  const w = vw * s, h = vh * s;
  const px = w >= bw ? bx - (w - bw) * f.x : bx + (bw - w) / 2;
  const py = h >= bh ? by - (h - bh) * f.y : by + (bh - h) / 2;
  const needBlur = w < bw - 1 || h < bh - 1;
  const fullBox = box.x === 0 && box.y === 0 && box.w === 1080 && box.h === 1920 && !br;

  const drawFrame = () => {
    if (!fullBox || needBlur) { ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, c.width, c.height); }
    if (!fullBox) { ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, br); ctx.clip(); }
    if (needBlur) {
      blurCtx.drawImage(v, 0, 0, 45, 80);
      ctx.globalAlpha = 0.65;
      ctx.drawImage(blurCv, bx, by, bw, bh);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(v, px, py, w, h);
    if (!fullBox) ctx.restore();
    const t = v.currentTime;
    if (t < 0.92) {
      Render.reelSync(animOv, d, t, true);
      ctx.drawImage(animOv, 0, 0, c.width, c.height);
    } else {
      ctx.drawImage(staticOv, 0, 0);
    }
    onProgress(v.duration ? t / v.duration : 0);
  };

  let rafId = 0, vfcId = 0, active = true;
  if ('requestVideoFrameCallback' in v) {
    const onVfc = () => {
      if (!active || v.ended) return;
      drawFrame();
      vfcId = v.requestVideoFrameCallback(onVfc);
    };
    vfcId = v.requestVideoFrameCallback(onVfc);
  } else {
    const onRaf = () => {
      if (!active || v.ended) return;
      drawFrame();
      rafId = requestAnimationFrame(onRaf);
    };
    rafId = requestAnimationFrame(onRaf);
  }

  const ended = new Promise(r => {
    v.onended = r;
    const check = () => {
      if (v.ended || (v.duration && v.currentTime >= v.duration - 0.05)) r();
      else if (active) setTimeout(check, 250);
    };
    setTimeout(check, 1000);
  });

  try { if (v.currentTime > 0.01) v.currentTime = 0; } catch {}
  drawFrame();
  await v.play();
  await ended;
  active = false;
  if (rafId) cancelAnimationFrame(rafId);
  if (vfcId && 'cancelVideoFrameCallback' in v) try { v.cancelVideoFrameCallback(vfcId); } catch {}
  rec.stop();
  await stopped;
  if (ac) try { await ac.close(); } catch {}
  try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
  if (blobObj) try { URL.revokeObjectURL(blobObj); } catch {}
  c.width = 0; c.height = 0;
  staticOv.width = 0; staticOv.height = 0;
  animOv.width = 0; animOv.height = 0;
  blurCv.width = 0; blurCv.height = 0;
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
}
