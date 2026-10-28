// artes em canvas: cache de imagens e capas, usado pela fila, calendário, feed e visualizador
import Render from './render.js';
import { DEF_TPL, typeOf } from './util.js';

const photoCache = new Map(), frameCache = new Map(), coverCache = new Map();
export const clearCovers = () => coverCache.clear();
// extrai um quadro do vídeo para servir de foto nos thumbnails, capas e stories quando o post só tem MP4
export function getVideoFrame(url) {
  if (!url) return Promise.resolve(null);
  if (!frameCache.has(url)) {
    frameCache.set(url, new Promise(resolve => {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto';
      const done = ok => { try { v.removeAttribute('src'); v.load(); } catch {} resolve(ok); };
      const timer = setTimeout(() => done(null), 6000);
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.1, v.duration || 0.1); } catch { clearTimeout(timer); done(null); } };
      v.onseeked = () => {
        clearTimeout(timer);
        try {
          if (!v.videoWidth || !v.videoHeight) return done(null);
          const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          done(c);
        } catch { done(null); }
      };
      v.onerror = () => { clearTimeout(timer); frameCache.delete(url); done(null); };
      v.src = url;
    }));
  }
  return frameCache.get(url);
}
// no máximo 4 downloads ao mesmo tempo: o feed pede dezenas de fotos de uma vez e o excesso estourava o tempo e virava capa azul
let busy = 0; const wait = [];
const slot = async () => { if (busy >= 4) await new Promise(r => wait.push(r)); busy++; };
const free = () => { busy--; const n = wait.shift(); if (n) n(); };
export function getImg(url) {
  if (!url) return Promise.resolve(null);
  if (!photoCache.has(url)) {
    // foto recém enviada pode demorar um instante pra ficar disponível: tenta de novo e nunca guarda falha no cache
    const p = (async () => {
      for (let t = 0; t < 5; t++) {
        await slot();
        try { return await Render.loadImage(url); } catch { /* tenta de novo */ } finally { free(); }
        await new Promise(r => setTimeout(r, 500 * (t + 1)));
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
export async function prep(it) {
  const d = artData(it);
  if (it.cutoutUrl) d.cutoutImg = await getImg(it.cutoutUrl);
  for (const s of d.slides) if (s && s.photoUrl) d.imgs[s.photoUrl] = await getImg(s.photoUrl);
  let ph = await getImg(it.photoUrl);
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
    coverCache.set(key, solid(coverCache, key, async () => {
      const c = document.createElement('canvas'), [d, ph] = await prep(it);
      if (typeOf(it) === 'video') await Render.reelThumb(c, d, ph); else await Render.cover(c, d, ph); // reel: capa vertical 9:16 do próprio reel
      return { v: c.toDataURL('image/jpeg', 0.85), miss: d.missing };
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
  return { v: { slides: files, story: { name: 'story.' + (mime === 'image/png' ? 'png' : 'jpg'), dataUrl: url() }, zone }, miss: d.missing };
}

const storyCache = new Map();
export function storyUrl(it) {
  const key = 's' + coverKey(it);
  if (!storyCache.has(key)) {
    storyCache.set(key, solid(storyCache, key, async () => {
      const c = document.createElement('canvas'), [d, ph] = await prep(it);
      await Render.story(c, d, ph);
      return { v: c.toDataURL('image/jpeg', 0.8), miss: d.missing };
    }));
  }
  return storyCache.get(key);
}

// reel pronto em 4K (2160x3840): vídeo + texto animado do template, gravado na maior qualidade possível (MP4 High Profile 40 Mbps, com fallback automático p/ 1080p 25 Mbps se o dispositivo não suportar 4K)
export async function exportReel(it, onProgress = () => {}, scale = 2) {
  const d = artData(it), v = document.createElement('video');
  v.crossOrigin = 'anonymous'; // o vídeo pode vir do R2: sem isso o canvas fica bloqueado
  v.src = it.videoUrl; v.playsInline = true; v.preload = 'auto';
  await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('Não consegui abrir o vídeo.')); });
  const mimes = [
    'video/mp4;codecs=avc1.640034,mp4a.40.2',
    'video/mp4;codecs=avc1.640033,mp4a.40.2',
    'video/mp4;codecs=avc1.4d0034,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm'
  ];
  const mime = mimes.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('Este navegador não grava vídeo. Use o Chrome ou o Edge.');
  const c = document.createElement('canvas');
  let sc = scale || 2;
  c.width = 1080 * sc; c.height = 1920 * sc;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  let stream = c.captureStream(60);
  let ac, dest;
  try { ac = new AudioContext(); dest = ac.createMediaStreamDestination(); ac.createMediaElementSource(v).connect(dest); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); } catch {}
  let rec;
  const chunks = [];
  try {
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 40e6 });
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.start(250);
  } catch {
    sc = 1; c.width = 1080; c.height = 1920;
    stream = c.captureStream(60);
    if (dest) dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 25e6 });
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.start(250);
  }
  const stopped = new Promise(r => (rec.onstop = r));
  const box = Render.reelBox(d), f = d.focal || { x: 0.5, y: 0.5, zoom: 1 };
  const frame = async () => {
    const bx = box.x * sc, by = box.y * sc, bw = box.w * sc, bh = box.h * sc, br = (box.r || 0) * sc;
    const cov = Math.max(bw / v.videoWidth, bh / v.videoHeight), s = cov * (f.zoom || 1);
    const w = v.videoWidth * s, h = v.videoHeight * s;
    const px = w >= bw ? bx - (w - bw) * f.x : bx + (bw - w) / 2;
    const py = h >= bh ? by - (h - bh) * f.y : by + (bh - h) / 2;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, br); ctx.clip();
    if (w < bw - 1 || h < bh - 1) {
      try { ctx.filter = `blur(${40 * sc}px) brightness(.7)`; } catch {}
      ctx.drawImage(v, bx - bw * .1 - (v.videoWidth * cov - bw) * .5, by - bh * .1 - (v.videoHeight * cov - bh) * .5, v.videoWidth * cov + bw * .2, v.videoHeight * cov + bh * .2);
      ctx.filter = 'none';
    }
    ctx.drawImage(v, px, py, w, h);
    ctx.restore();
    await Render.reel(c, d, v.currentTime, false);
    onProgress(v.duration ? v.currentTime / v.duration : 0);
    if (!v.ended) requestAnimationFrame(frame);
  };
  const ended = new Promise(r => (v.onended = r));
  await v.play(); frame(); await ended; rec.stop(); await stopped; if (ac) ac.close();
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
}
