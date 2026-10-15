// Dashboard Reconstruções - servidor local, sem dependências (Node 18+)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const store = require('./storage.js');
const ig = require('./ig.js');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const PUBLIC = fs.existsSync(path.join(DIST, 'index.html')) ? DIST : path.join(ROOT, 'public'); // dist = site em React já compilado
const CLOUD = store.CLOUD;
const PASS = process.env.APP_PASSWORD || '';   // obrigatório na nuvem; vazio = sem senha (uso local)

// ================= config =================
const DEFAULTS = {
  port: 3000,
  wpUrl: 'https://reconstrucoes.digital',
  geminiKey: '',
  geminiModel: '', // vazio = usa o Flash (não o Lite) mais novo que a chave enxergar
  instagram: '@reconstrucoes.observatorio',
  location: 'Ubá, Minas Gerais',
  ctaText: 'Leia a matéria completa no link da bio.',
  fixedTags: 'Ubá ZonaDaMata',
  slots: '',               // horários preferidos, ex.: "11:30, 18:00"
  pollMinutes: 15,
  autoAi: true,
  sheetsUrl: '',
  metaPosts: 3,
  metaVideos: 2,
  igUserId: '',            // ID da conta profissional do Instagram
  igToken: '',             // token de longa duração (segredo, nunca volta pro navegador)
  igTokenAt: '',           // quando o token foi gerado/renovado
  bio: 'Observatório de cidades e impactos climáticos.\nJornalismo de dados, transparência e sustentabilidade.'
};
const PUBLIC_KEYS = ['wpUrl', 'geminiModel', 'instagram', 'location', 'ctaText', 'fixedTags', 'slots', 'pollMinutes', 'autoAi', 'sheetsUrl', 'metaPosts', 'metaVideos', 'bio', 'igUserId'];
let CFG = {}, cfgAt = 0;
async function refreshConfig(force) {
  if (!force && CLOUD && Date.now() - cfgAt < 5000) return;
  let file = {}; try { file = JSON.parse(await store.readText('config.json')) || {}; } catch {}
  CFG = { ...DEFAULTS, ...file };
  if (process.env.GEMINI_API_KEY) CFG.geminiKey = process.env.GEMINI_API_KEY;
  cfgAt = Date.now();
}
const loadConfig = () => CFG;
async function saveConfig(patch) {
  let file = {}; try { file = JSON.parse(await store.readText('config.json')) || {}; } catch {}
  await store.writeText('config.json', JSON.stringify({ ...file, ...patch }, null, 2));
  await refreshConfig(true);
}

// ================= banco (db.json no disco ou no Blob) =================
async function loadDb() {
  let db; try { db = JSON.parse(await store.readText('db.json')); } catch { db = null; }
  db ||= {}; db.items ||= []; db.seenNews ||= []; db.engine ||= {};
  return db;
}
const saveDb = db => store.writeText('db.json', JSON.stringify(db, null, 2));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function newItem(b = {}) {
  return {
    id: newId(), status: 'draft', createdAt: new Date().toISOString(), scheduledAt: null, postedAt: null,
    newsId: null, origTitle: '', title: '', category: '', link: '', newsText: '', newsDate: null,
    format: 'post', slides: [], variations: [], chosen: 0, caption: '', hashtags: [],
    photoUrl: '', focal: { x: 0.5, y: 0.5, zoom: 1 }, mediaType: 'image', videoUrl: '',
    images: [], postUrl: '', sheetSync: null, aiError: '',
    tpl: { post: 'p01', carousel: 'A', story: 's02' }, description: '', chip: '', source: '', credit: '', bigTitle: '', cutoutUrl: '', ...b
  };
}

// ================= helpers http =================
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.gs': 'text/plain; charset=utf-8'
};
function send(res, code, body, headers = {}) {
  const isObj = body && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Arquivo grande demais')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  if (req.body != null && !(req.body instanceof Readable)) { const b = req.body; return Buffer.isBuffer(b) ? JSON.parse(b.toString('utf8') || '{}') : typeof b === 'string' ? JSON.parse(b || '{}') : b; }
  const b = await readBody(req, 60 * 1024 * 1024); return b.length ? JSON.parse(b.toString('utf8')) : {}; }

// arquivos com suporte a Range (para o vídeo tocar e avançar no navegador)
function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Não encontrado');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      const start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) ? p : null;
}
function stripHtml(html = '') {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|div|blockquote)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#8211;|&#8212;/g, '-').replace(/&#8217;|&#039;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const oneLine = t => stripHtml(t).replace(/\s+/g, ' ');

// ================= WordPress =================
async function fetchNews({ page = 1, perPage = 12, after, before, search } = {}) {
  const cfg = loadConfig();
  const base = cfg.wpUrl.replace(/\/$/, '');
  const q = new URLSearchParams({ per_page: String(perPage), page: String(page), _embed: '1' });
  if (after) q.set('after', after);
  if (before) q.set('before', before);
  if (search) q.set('search', search);
  const r = await fetch(`${base}/wp-json/wp/v2/posts?${q}`, { headers: { 'User-Agent': 'ReconstrucoesDashboard/1.0' } });
  if (r.status === 400 && page > 1) return { items: [], totalPages: page - 1 };
  if (!r.ok) throw new Error(`WordPress respondeu ${r.status}`);
  const totalPages = +r.headers.get('x-wp-totalpages') || 1;
  const posts = await r.json();
  const items = [];
  for (const p of posts) {
    let m = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    if ((!m || !m.source_url) && p.featured_media) {
      try { m = await (await fetch(`${base}/wp-json/wp/v2/media/${p.featured_media}`)).json(); } catch {}
    }
    const sizes = (m && m.media_details && m.media_details.sizes) || {};
    const terms = (p._embedded && p._embedded['wp:term'] && p._embedded['wp:term'][0]) || [];
    items.push({
      id: p.id, title: oneLine(p.title && p.title.rendered), link: p.link, date: p.date,
      excerpt: oneLine(p.excerpt && p.excerpt.rendered), text: stripHtml(p.content && p.content.rendered),
      image: (m && m.source_url) || null,
      thumb: (sizes.medium_large || sizes.large || {}).source_url || (m && m.source_url) || null,
      category: terms[0] ? oneLine(terms[0].name) : ''
    });
  }
  return { items, totalPages };
}

// ================= Gemini =================
function buildPrompt(n, cfg) {
  return `Você é o editor de redes sociais do portal de notícias "Reconstruções" (reconstrucoes.digital), da região de Ubá, Zona da Mata mineira, que cobre reconstrução após desastres, obras, clima e sustentabilidade.
Com base SOMENTE na notícia abaixo, prepare o conteúdo para o Instagram em português do Brasil.
Regras gerais:
- Não invente fatos, números, nomes, prazos ou datas. Use apenas o que está no texto. Se a notícia não tiver números ou prazos, não crie.
- Sem emojis e sem travessão (—).
- "titulo": versão curta para a arte, no máximo 90 caracteres.
- "categoria": 1 ou 2 palavras (ex.: Obras, Clima, Meio ambiente, Economia).
- "descricao": resumo da notícia em uma frase, no máximo 140 caracteres, para aparecer na arte. Só fatos do texto, sem copiar o título.
- "hashtags": de 6 a 10 hashtags sobre o assunto, sem o símbolo #, sem espaços e sem acentos.
- "variacoes": exatamente 3 legendas CURTAS. Cada uma é uma chamada para a pessoa clicar no link da bio e ler a matéria no portal, não um resumo:
  * No máximo 2 frases e 220 caracteres.
  * Primeira frase: o fato principal com uma informação concreta do texto (o quê, onde ou um número), em tom de gancho.
  * Segunda frase (opcional): o que falta saber e só está na matéria (por exemplo o que muda, quando ou quem é afetado), sem responder.
  * Não conte a notícia, não liste detalhes, não copie trechos do texto.
  * SEM hashtags e SEM chamada para o link (isso é adicionado depois).
  1. estilo "factual": jornalística e direta.
  2. estilo "comunidade": fala com quem mora na região e é afetado.
  3. estilo "topicos": até 2 tópicos curtos, um por linha, começando com "- ".

TÍTULO ORIGINAL: ${n.title}
TEXTO DA NOTÍCIA:
${(n.text || n.excerpt || '').slice(0, 12000)}`;
}
const AI_SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    categoria: { type: 'string' },
    descricao: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    variacoes: {
      type: 'array',
      items: { type: 'object', properties: { estilo: { type: 'string', enum: ['factual', 'comunidade', 'topicos'] }, legenda: { type: 'string' } }, required: ['estilo', 'legenda'] }
    }
  },
  required: ['titulo', 'categoria', 'descricao', 'hashtags', 'variacoes']
};
function extractGeminiText(j) {
  if (Array.isArray(j.steps)) {
    for (const s of j.steps) {
      if (s.type === 'model_output' && Array.isArray(s.content)) {
        const t = s.content.find(c => c.type === 'text' && c.text);
        if (t) return t.text;
      }
    }
  }
  if (typeof j.output_text === 'string') return j.output_text;
  const c = j.candidates && j.candidates[0] && j.candidates[0].content;
  if (c && c.parts) return c.parts.map(p => p.text || '').join('');
  return null;
}
// modelo vazio (ou o antigo padrão 3.8 Flash) = o Flash comum mais novo que a chave enxerga (nunca o Lite)
let liteCache = null;
async function pickModel(cfg) {
  if (cfg.geminiModel && cfg.geminiModel !== 'gemini-3.8-flash') return cfg.geminiModel;
  if (liteCache) return liteCache;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(cfg.geminiKey));
  const names = ((await r.json()).models || []).map(m => m.name.replace(/^models\//, '')).filter(n => /^gemini-[\d.]+-flash$/.test(n));
  names.sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]));
  if (!names.length) throw new Error('Não achei um modelo Flash para essa chave. Escolha um modelo em Configurações.');
  return (liteCache = names[0]);
}
async function callGemini(news) {
  const cfg = loadConfig();
  if (!cfg.geminiKey) throw new Error('Falta a chave do Gemini (Configurações).');
  const model = process.env.GEMINI_URL ? (cfg.geminiModel || 'teste') : await pickModel(cfg);
  const r = await fetch(process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey },
    body: JSON.stringify({ model, input: buildPrompt(news, cfg), response_format: { type: 'text', mime_type: 'application/json', schema: AI_SCHEMA } })
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`Gemini respondeu ${r.status}: ${raw.slice(0, 400)}`);
  const txt = extractGeminiText(JSON.parse(raw));
  if (!txt) throw new Error('Não consegui ler a resposta do Gemini: ' + raw.slice(0, 300));
  const out = JSON.parse(txt.trim().replace(/^```json\s*|```$/g, ''));
  out.hashtags = (out.hashtags || []).map(h => String(h).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean);
  out.variacoes = (out.variacoes || []).slice(0, 3);
  return out;
}
// junta legenda + chamada padrão
function withCta(text, cfg) { return `${String(text || '').trim()}\n\n${cfg.ctaText}`.trim(); }
function mergeTags(aiTags, cfg) {
  const fixed = String(cfg.fixedTags || '').split(/[\s,#]+/).filter(Boolean);
  const all = [...fixed, ...(aiTags || [])];
  const seen = new Set();
  return all.filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
function applyAi(item, ai, cfg) {
  item.title = ai.titulo || item.title;
  item.category = ai.categoria || item.category;
  // formato (post ou carrossel) vem das imagens que a pessoa sobe, não da IA
  item.hashtags = mergeTags(ai.hashtags, cfg);
  item.variations = (ai.variacoes || []).map(v => ({ style: v.estilo, text: withCta(v.legenda, cfg) }));
  item.chosen = 0;
  item.caption = item.variations[0] ? item.variations[0].text : '';
  item.aiError = '';
  return item;
}

// ================= motor (checa o site e cria rascunhos) =================
// Estado fica no db (db.engine) porque na Vercel cada chamada roda numa instância nova.
const engine = { running: false };
async function runEngine() {
  if (engine.running) return;
  engine.running = true;
  await refreshConfig();
  const cfg = loadConfig();
  let created = [], err = '', seen = [], firstRun = false;
  try {
    const { items: news } = await fetchNews({ perPage: 10 });
    const db0 = await loadDb();
    firstRun = !db0.engine.baseline;
    for (const n of news.slice().reverse()) {
      if (db0.seenNews.includes(n.id)) continue;
      seen.push(n.id);
      if (firstRun || db0.items.some(i => i.newsId === n.id)) continue;
      const it = newItem({ newsId: n.id, origTitle: n.title, title: n.title, category: n.category, link: n.link, newsText: n.text || n.excerpt, newsDate: n.date, photoUrl: n.image || '', description: (n.excerpt || '').slice(0, 200), isNew: true });
      if (cfg.geminiKey && cfg.autoAi) {
        try { applyAi(it, await callGemini(n), cfg); } catch (e) { it.aiError = e.message; }
      }
      created.push(it);
    }
  } catch (e) { err = e.message; console.log('[motor] erro:', e.message); }
  // relê o banco antes de gravar: a IA demora e a pessoa pode ter editado enquanto isso
  try {
    const db = await loadDb();
    if (!err) { db.seenNews.push(...seen); db.seenNews = db.seenNews.slice(-500); db.engine.baseline = true; db.items.push(...created.filter(c => !db.items.some(i => i.newsId === c.newsId))); }
    db.engine.lastRun = new Date().toISOString(); db.engine.lastError = err; db.engine.lastNew = created.length;
    await saveDb(db);
  } catch (e) { console.log('[motor] erro ao gravar:', e.message); }
  if (created.length) console.log(`[motor] ${created.length} notícia(s) nova(s) na fila`);
  engine.running = false;
}
let engineTimer;
function scheduleEngine() {
  clearInterval(engineTimer);
  if (CLOUD) return; // na Vercel quem dispara é o cron + o dashboard aberto
  const min = Math.max(5, +loadConfig().pollMinutes || 15);
  engineTimer = setInterval(runEngine, min * 60 * 1000);
}

// ================= planilha (Google Apps Script) =================
async function syncSheet(item) {
  const cfg = loadConfig();
  if (!cfg.sheetsUrl) return { ok: false, skipped: true, msg: 'Planilha não configurada' };
  const body = {
    postedAt: item.postedAt, title: item.title || item.origTitle,
    type: item.mediaType === 'video' ? 'video' : item.format,
    postUrl: item.postUrl || '', newsUrl: item.link || '',
    metaPosts: +cfg.metaPosts || 3, metaVideos: +cfg.metaVideos || 2
  };
  try {
    const r = await fetch(cfg.sheetsUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    const t = await r.text();
    if (!r.ok) return { ok: false, msg: `Planilha respondeu ${r.status}` };
    return { ok: true, msg: t.slice(0, 200) };
  } catch (e) { return { ok: false, msg: e.message }; }
}

// ================= login =================
const sessionToken = () => crypto.createHmac('sha256', PASS).update('reconstrucoes-sessao').digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const needLogin = CLOUD || !!PASS;
function authed(req) {
  if (!needLogin) return true;
  if (!PASS) return false; // nuvem sem senha configurada: tudo bloqueado
  const m = /(?:^|;\s*)auth=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return !!m && same(m[1], sessionToken());
}

// ================= publicação no Instagram =================
const ART_KEYS = ['slides', 'focal', 'focalStory', 'tpl', 'title', 'bigTitle', 'chip', 'source', 'credit', 'description', 'photoUrl', 'videoUrl', 'cutoutUrl', 'customArt', 'mediaType', 'category', 'look'];
const baseUrl = req => (process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(/\/$/, '');
const pubKey = () => (PASS || 'local') + (process.env.CRON_SECRET || '') + 'pub';
const pubSig = (rel, exp) => crypto.createHmac('sha256', pubKey()).update(rel + '.' + exp).digest('hex').slice(0, 32);
function pubUrl(base, id, name) { // link temporário (12h) que a Meta usa pra baixar a arte; só vale pra esse arquivo
  const rel = `${id}/${name}`, exp = Date.now() + 12 * 3600e3;
  return `${base}/pub/${rel}?e=${exp}&s=${pubSig(rel, exp)}`;
}

// fecha o item como postado (apaga arquivos, sincroniza planilha). Usado pelo "Já postei" e pela publicação automática.
async function markPosted(id, postUrl) {
  const db0 = await loadDb(), it0 = findItem(db0, id);
  if (!it0) return null;
  await store.delFiles(it0.id);           // apaga tudo: a foto original continua no WordPress
  const done = { postedAt: new Date().toISOString(), status: 'posted', isNew: false, images: [], export: null, ig: null, publishError: '', publishTries: 0 };
  if (postUrl) done.postUrl = String(postUrl).trim();
  const cut = x => (x && x.startsWith('/images/') ? '' : x);
  const tmp = { ...it0, ...done };
  tmp.sheetSync = await syncSheet(tmp);
  const db = await loadDb(), it = findItem(db, id); // relê: a planilha demorou
  if (!it) return null;
  Object.assign(it, done, { sheetSync: tmp.sheetSync, videoUrl: '', cutoutUrl: '', photoUrl: cut(it.photoUrl), customArt: {} });
  (it.slides || []).forEach(sl => { if (sl && sl.photoUrl) sl.photoUrl = cut(sl.photoUrl); });
  await saveDb(db);
  return it;
}

// publica o que venceu (ou só o item `only`). Vídeo pode demorar: fica "waiting" e o próximo ciclo continua.
async function publishDue(base, only) {
  const cfg = loadConfig();
  if (!cfg.igToken || !cfg.igUserId) return [];
  const db = await loadDb(), now = Date.now();
  const due = db.items.filter(i => !i.deletedAt && i.status === 'scheduled' && (only ? i.id === only : Date.parse(i.scheduledAt) <= now) && (i.publishTries || 0) < 3 && now - (i.lockAt || 0) > 90e3);
  const out = [];
  for (const d of due) {
    const edit = async fn => { const db2 = await loadDb(), it = findItem(db2, d.id); if (it) { fn(it); await saveDb(db2); } };
    await edit(it => { it.lockAt = Date.now(); });
    try {
      const r = await ig.advance(d, cfg, f => pubUrl(base, d.id, f.name), () => edit(it => { it.ig = d.ig; }));
      if (r.waiting) { out.push({ id: d.id, waiting: true }); await edit(it => { it.lockAt = 0; }); continue; }
      await markPosted(d.id, r.permalink); out.push({ id: d.id, ok: true, url: r.permalink });
    } catch (e) {
      console.log('[instagram] erro:', d.id, e.message);
      await edit(it => { it.publishError = e.message; it.publishTries = (it.publishTries || 0) + 1; it.ig = d.ig; it.lockAt = 0; });
      out.push({ id: d.id, error: e.message });
    }
  }
  return out;
}
async function maybeRefreshToken() {
  const c = loadConfig();
  if (!c.igToken || !c.igTokenAt || Date.now() - Date.parse(c.igTokenAt) < 30 * 864e5) return; // vale 60 dias; renova com 30+
  await saveConfig({ igToken: await ig.refreshToken(c), igTokenAt: new Date().toISOString() });
}

// ================= rotas =====
const keepOriginals = f => f.startsWith('media');
const MEDIA_TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const findItem = (db, id) => db.items.find(i => i.id === id);
const safeName = n => /^[\w.-]+$/.test(n);

// grava o que o upload mudou no item (usado pelo upload local e pelo upload direto da nuvem)
function applyMedia(it, base, ext, slot) {
  const file = base + ext, urlPath = `/images/${it.id}/${file}?t=${Date.now()}`;
  if (slot === 'add') return { file, urlPath };
  if (slot === 'cutout') it.cutoutUrl = urlPath;
  else if (ext === '.mp4') { it.videoUrl = urlPath; it.mediaType = 'video'; }
  else { it.photoUrl = urlPath; it.focal = { x: 0.5, y: 0.5, zoom: 1 }; }
  return { file, urlPath };
}
const baseFor = (slot, ext) => (slot === 'cutout' ? 'media-cutout' : slot === 'add' ? 'media-add-' + Date.now().toString(36) : ext === '.mp4' ? 'media-video' : 'media-photo');

async function handleApi(req, res, url) {
  let mm0;
  const m = req.method, p = url.pathname;

  // --- rotas sem login ---
  if (p === '/api/session') return send(res, 200, { auth: authed(req), needLogin, cloud: CLOUD, configured: !CLOUD || !!PASS });
  if (p === '/api/login' && m === 'POST') {
    const b = await readJson(req);
    if (!PASS || !same(b.password || '', PASS)) { await new Promise(r => setTimeout(r, 800)); return send(res, 401, { error: PASS ? 'Senha errada' : 'Defina APP_PASSWORD na Vercel' }); }
    return send(res, 200, { ok: true }, { 'Set-Cookie': `auth=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${CLOUD ? '; Secure' : ''}` });
  }
  if (p === '/api/logout' && m === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': 'auth=; Path=/; HttpOnly; Max-Age=0' });
  if (p === '/api/cron') { // Vercel Cron manda o CRON_SECRET no Authorization
    if (!process.env.CRON_SECRET || !same(req.headers.authorization || '', 'Bearer ' + process.env.CRON_SECRET)) return send(res, 401, { error: 'não autorizado' });
    await runEngine();
    const published = await publishDue(baseUrl(req)).catch(e => ({ error: e.message }));
    await maybeRefreshToken().catch(e => console.log('[instagram] renovar token:', e.message));
    return send(res, 200, { ok: true, published });
  }
  if (p === '/api/blob-upload' && m === 'POST') { // upload direto navegador -> Blob (arquivos grandes)
    const body = await readJson(req);
    if (body.type !== 'blob.upload-completed' && !authed(req)) return send(res, 401, { error: 'faça login' });
    const { handleUploadPresigned } = await import('@vercel/blob/client'), { issueSignedToken } = await import('@vercel/blob');
    try {
      const out = await handleUploadPresigned({
        body, request: req,
        getSignedToken: async pathname => {
          if (!/^images\/[\w-]+\/[\w.-]+$/.test(pathname)) throw new Error('caminho inválido');
          const ct = Object.values(MEDIA_TYPES);
          return {
            token: await issueSignedToken({ pathname, operations: ['put'], allowedContentTypes: ct, maximumSizeInBytes: 500 * 1024 * 1024, validUntil: Date.now() + 3600e3 }),
            urlOptions: { allowedContentTypes: ct, maximumSizeInBytes: 500 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: true, validUntil: Date.now() + 600e3 }
          };
        },
        onUploadCompleted: async () => {}
      });
      return send(res, 200, out);
    } catch (e) { return send(res, 400, { error: e.message }); }
  }

  if (!authed(req)) return send(res, 401, { error: 'faça login' });
  await refreshConfig();


  if (p === '/api/config' && m === 'GET') {
    const c = loadConfig(), out = { hasKey: !!c.geminiKey, cloud: CLOUD, hasIg: !!(c.igToken && c.igUserId), igReady: !!(c.igToken && c.igUserId) && (CLOUD || !!process.env.SITE_URL) };
    for (const k of PUBLIC_KEYS) out[k] = c[k];
    return send(res, 200, out);
  }
  if (p === '/api/config' && m === 'POST') {
    const b = await readJson(req), patch = {};
    for (const k of ['geminiKey', ...PUBLIC_KEYS]) if (k in b && b[k] !== undefined && b[k] !== null) {
      if (k === 'geminiKey' && !String(b[k]).trim()) continue;
      patch[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
    }
    if (String(b.igToken || '').trim()) { patch.igToken = b.igToken.trim(); patch.igTokenAt = new Date().toISOString(); }
    if (b.clearKey) patch.geminiKey = '';
    if (b.clearIg) { patch.igToken = ''; patch.igTokenAt = ''; }
    await saveConfig(patch);
    if ('pollMinutes' in patch) scheduleEngine();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/engine' && m === 'GET') { const db = await loadDb(); return send(res, 200, { ...db.engine, running: engine.running, pollMinutes: loadConfig().pollMinutes }); }
  if (p === '/api/engine/run' && m === 'POST') { await runEngine(); const db = await loadDb(); return send(res, 200, { ...db.engine, pollMinutes: loadConfig().pollMinutes }); }

  if (p === '/api/news' && m === 'GET') {
    const g = k => url.searchParams.get(k) || undefined;
    try { return send(res, 200, await fetchNews({ page: +g('page') || 1, after: g('after'), before: g('before'), search: g('search') })); }
    catch (e) { return send(res, 502, { error: e.message }); }
  }
  if (p === '/api/img' && m === 'GET') {
    const target = url.searchParams.get('url') || '';
    let host; try { host = new URL(target).host; } catch { return send(res, 400, 'url inválida'); }
    if (host !== new URL(loadConfig().wpUrl).host) return send(res, 403, 'host não permitido');
    const r = await fetch(target);
    if (!r.ok) return send(res, 502, 'falha ao baixar imagem');
    res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=86400' });
    return res.end(Buffer.from(await r.arrayBuffer()));
  }

  if (p === '/api/items' && m === 'GET') {
    const db = await loadDb(), cut = Date.now() - 7 * 864e5, old = db.items.filter(i => i.deletedAt && Date.parse(i.deletedAt) < cut);
    if (old.length) { for (const i of old) await store.delFiles(i.id); db.items = db.items.filter(i => !old.includes(i)); await saveDb(db); }
    return send(res, 200, db.items);
  }
  mm0 = p.match(/^\/api\/items\/([\w-]+)\/restore$/);
  if (mm0 && m === 'POST') { const db = await loadDb(), it = findItem(db, mm0[1]); if (!it) return send(res, 404, { error: 'item não existe' }); delete it.deletedAt; await saveDb(db); return send(res, 200, it); }
  if (p === '/api/models' && m === 'GET') { // modelos que a chave do Gemini enxerga
    const k = loadConfig().geminiKey; if (!k) return send(res, 200, []);
    try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(k)); const j = await r.json();
      return send(res, 200, (j.models || []).filter(x => (x.supportedGenerationMethods || []).includes('generateContent')).map(x => x.name.replace(/^models\//, '')).filter(n => /gemini/.test(n) && !/embedding|tts|image|audio|live/.test(n)));
    } catch (e) { return send(res, 502, { error: e.message }); }
  }
  if (p === '/api/items' && m === 'POST') {
    const db = await loadDb(), item = newItem(await readJson(req));
    db.items.push(item); await saveDb(db);
    return send(res, 200, item);
  }
  let mm = p.match(/^\/api\/items\/([\w-]+)$/);
  if (mm) {
    const db = await loadDb(), idx = db.items.findIndex(i => i.id === mm[1]);
    if (idx < 0) return send(res, 404, { error: 'item não existe' });
    if (m === 'PUT') {
      const b = await readJson(req), old = db.items[idx];
      for (const k of ['id', 'export', 'ig', 'lockAt', 'publishTries', 'publishError']) delete b[k]; // campos do servidor
      const next = { ...old, ...b };
      if (b.resetPublish) { next.publishTries = 0; next.publishError = ''; delete next.ig; delete next.resetPublish; }
      // mudou algo que aparece na arte: a exportação antiga não vale mais
      if (old.export && ART_KEYS.some(k => JSON.stringify(old[k]) !== JSON.stringify(next[k]))) next.export = null;
      db.items[idx] = next; await saveDb(db); return send(res, 200, next);
    }
    if (m === 'DELETE') {
      if (url.searchParams.get('forever') || db.items[idx].deletedAt) { await store.delFiles(mm[1]); db.items.splice(idx, 1); }
      else db.items[idx].deletedAt = new Date().toISOString(); // vai pra lixeira (7 dias)
      await saveDb(db);
      for (let t = 0; t < 2; t++) { // confere se gravou de verdade (outra gravação ao mesmo tempo pode ter sobrescrito)
        const chk = findItem(await loadDb(), mm[1]);
        if (!chk || chk.deletedAt || url.searchParams.get('forever')) break;
        const d2 = await loadDb(), x = findItem(d2, mm[1]); if (x) { x.deletedAt = new Date().toISOString(); await saveDb(d2); }
      }
      return send(res, 200, { ok: true });
    }
  }
  mm = p.match(/^\/api\/items\/([\w-]+)\/ai$/);
  if (mm && m === 'POST') {
    const db0 = await loadDb(), it0 = findItem(db0, mm[1]);
    if (!it0) return send(res, 404, { error: 'item não existe' });
    let ai, err = '';
    try { ai = await callGemini({ title: it0.origTitle || it0.title, text: it0.newsText }); } catch (e) { err = e.message; }
    const db = await loadDb(), it = findItem(db, mm[1]); // relê: a IA demorou
    if (!it) return send(res, 404, { error: 'item não existe' });
    if (err) { it.aiError = err; await saveDb(db); return send(res, 502, { error: err }); }
    applyAi(it, ai, loadConfig()); await saveDb(db); return send(res, 200, it);
  }
  mm = p.match(/^\/api\/items\/([\w-]+)\/ai-desc$/);
  if (mm && m === 'POST') { // só devolve a descrição curta; o editor decide se aplica
    const it = findItem(await loadDb(), mm[1]);
    if (!it) return send(res, 404, { error: 'item não existe' });
    try { const ai = await callGemini({ title: it.origTitle || it.title, text: it.newsText || it.description }); return send(res, 200, { description: String(ai.descricao || '').trim().slice(0, 200) }); }
    catch (e) { return send(res, 502, { error: e.message }); }
  }
  mm = p.match(/^\/api\/items\/([\w-]+)\/media$/);
  if (mm && m === 'POST') {
    // local: corpo cru (arquivo), nome em ?name=. Na nuvem o arquivo vai direto pro Blob e o navegador chama /media-ref
    if (CLOUD) return send(res, 400, { error: 'Na nuvem o envio é direto pro Blob' });
    const db = await loadDb(), it = findItem(db, mm[1]);
    if (!it) return send(res, 404, { error: 'item não existe' });
    const name = String(url.searchParams.get('name') || 'arquivo').toLowerCase(), slot = url.searchParams.get('slot');
    const ext = (path.extname(name) || '').replace('.jpeg', '.jpg');
    if (!MEDIA_TYPES[ext]) return send(res, 400, { error: 'Formato não aceito (use JPG, PNG, SVG ou MP4)' });
    if (slot === 'add' && ext === '.mp4') return send(res, 400, { error: 'Aqui só entram fotos' });
    const buf = await readBody(req, 500 * 1024 * 1024), base = baseFor(slot, ext);
    if (slot !== 'add') await store.delFiles(it.id, f => !f.startsWith(base));
    const { file, urlPath } = applyMedia(it, base, ext, slot);
    await store.putFile(`${it.id}/${file}`, buf, MEDIA_TYPES[ext]);
    await saveDb(db);
    return send(res, 200, slot === 'add' ? { ...it, addedUrl: urlPath } : it);
  }
  mm = p.match(/^\/api\/items\/([\w-]+)\/media-ref$/);
  if (mm && m === 'POST') { // nuvem: o arquivo já está no Blob, só registra no item
    const db = await loadDb(), it = findItem(db, mm[1]);
    if (!it) return send(res, 404, { error: 'item não existe' });
    const b = await readJson(req), file = String(b.file || ''), slot = b.slot || '', ext = path.extname(file);
    if (!safeName(file) || !MEDIA_TYPES[ext]) return send(res, 400, { error: 'arquivo inválido' });
    const base = file.slice(0, -ext.length);
    if (slot !== 'add') await store.delFiles(it.id, f => !f.startsWith(base) || f === file);
    const { urlPath } = applyMedia(it, base, ext, slot);
    await saveDb(db);
    return send(res, 200, slot === 'add' ? { ...it, addedUrl: urlPath } : it);
  }
  mm = p.match(/^\/api\/items\/([\w-]+)\/posted$/);
  if (mm && m === 'POST') {
    const b = await readJson(req), it = await markPosted(mm[1], b.postUrl);
    return it ? send(res, 200, it) : send(res, 404, { error: 'item não existe' });
  }
  mm = p.match(/^\/api\/items\/([\w-]+)\/export$/);
  if (mm && m === 'POST') { // local: arte já renderizada no navegador (corpo cru). Na nuvem o arquivo vai direto pro Blob.
    if (CLOUD) return send(res, 400, { error: 'Na nuvem o envio é direto pro Blob' });
    const name = String(url.searchParams.get('name') || ''), ext = path.extname(name);
    if (!/^out-[\w-]+\.(jpg|mp4)$/.test(name)) return send(res, 400, { error: 'nome inválido' });
    await store.putFile(`${mm[1]}/${name}`, await readBody(req, 500 * 1024 * 1024), MEDIA_TYPES[ext]);
    return send(res, 200, { ok: true });
  }
  mm = p.match(/^\/api\/items\/([\w-]+)\/export-done$/);
  if (mm && m === 'POST') { // registra o conjunto exportado e apaga sobras de exportações antigas
    const b = await readJson(req), db = await loadDb(), it = findItem(db, mm[1]);
    if (!it) return send(res, 404, { error: 'item não existe' });
    const files = (b.files || []).map(String);
    if (!['post', 'carousel', 'reel'].includes(b.kind) || !files.length || !files.every(f => /^out-[\w-]+\.(jpg|mp4)$/.test(f))) return send(res, 400, { error: 'exportação inválida' });
    await store.delFiles(it.id, f => !f.startsWith('out-') || files.includes(f));
    it.export = { kind: b.kind, files: files.map(name => ({ name })), at: new Date().toISOString() };
    await saveDb(db); return send(res, 200, it);
  }
  if (p === '/api/publish/run' && m === 'POST') { // "Postar agora": publica este item já
    const b = await readJson(req);
    if (!loadConfig().igToken) return send(res, 400, { error: 'Instagram não configurado' });
    if (!CLOUD && !process.env.SITE_URL) return send(res, 400, { error: 'A Meta precisa baixar a arte de um endereço público: só funciona no site da Vercel.' });
    const out = await publishDue(baseUrl(req), String(b.id || ''));
    const db = await loadDb(); return send(res, 200, { result: out, item: findItem(db, String(b.id || '')) });
  }
  mm = p.match(/^\/api\/items\/([\w-]+)\/sheet$/);
  if (mm && m === 'POST') {
    const db0 = await loadDb(), it0 = findItem(db0, mm[1]);
    if (!it0) return send(res, 404, { error: 'item não existe' });
    const r = await syncSheet(it0);
    const db = await loadDb(), it = findItem(db, mm[1]); it.sheetSync = r; await saveDb(db);
    return send(res, 200, it);
  }
  return send(res, 404, { error: 'rota não existe' });
}

// arquivos enviados (fotos/vídeos): disco local ou Blob privado, sempre atrás do login
async function serveUpload(req, res, rel, signed) {
  if (!signed && !authed(req)) return send(res, 401, 'faça login');
  if (!CLOUD) { const f = store.localPath(rel); return f ? serveFile(req, res, f) : send(res, 403, 'negado'); }
  const r = await (await store.blob()).get('images/' + rel, { access: 'private' });
  if (!r || r.statusCode !== 200) return send(res, 404, 'Não encontrado');
  res.writeHead(200, { 'Content-Type': r.blob.contentType, ...(r.blob.size ? { 'Content-Length': r.blob.size } : {}), 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' });
  Readable.fromWeb(r.stream).pipe(res);
}

async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const up = /^\/(?:images|api\/files)\/(.+)$/.exec(url.pathname);
    if (up) return await serveUpload(req, res, decodeURIComponent(up[1]));
    const pb = /^\/(?:api\/)?pub\/(.+)$/.exec(url.pathname); // link assinado e temporário pra Meta baixar a arte
    if (pb) {
      const rel = decodeURIComponent(pb[1]), e = +url.searchParams.get('e');
      if (!PASS && CLOUD) return send(res, 403, 'negado');
      if (!e || e < Date.now() || !same(url.searchParams.get('s') || '', pubSig(rel, e)) || !/^[\w-]+\/out-[\w-]+\.(jpg|mp4)$/.test(rel)) return send(res, 403, 'link inválido ou vencido');
      return await serveUpload(req, res, rel, true);
    }
    if (url.pathname === '/apps-script.gs' || url.pathname === '/api/apps-script') return serveFile(req, res, path.join(ROOT, 'planilha', 'apps-script.gs'));
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const f = safeJoin(PUBLIC, rel);
    return f ? serveFile(req, res, f) : send(res, 403, 'negado');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
}
module.exports = { handle };

if (require.main === module) {
  refreshConfig(true).then(() => {
    const cfg = loadConfig(), url = `http://localhost:${cfg.port}`;
    const srv = http.createServer(handle);
    srv.on('error', e => {
      if (e.code === 'EADDRINUSE') console.log(`A porta ${cfg.port} já está em uso: o dashboard provavelmente já está aberto em outra janela. Feche a outra janela preta e rode de novo.`);
      else console.log('Erro ao iniciar:', e.message);
    });
    srv.listen(cfg.port, '127.0.0.1', () => {
      console.log(`Dashboard Reconstrucoes rodando em ${url}`);
      console.log('Deixe esta janela aberta enquanto usar. Feche para encerrar.');
      if (process.platform === 'win32' && !process.env.NO_OPEN) require('child_process').exec(`start "" ${url}`); // abre o navegador só depois de subir
      if (!process.env.NO_ENGINE) { setTimeout(runEngine, 3000); scheduleEngine(); }
    });
  });
}
