// Onde ficam banco, config e arquivos. Local: pasta data/. Na Vercel: Blob privado.
const fs = require('fs');
const path = require('path');

const CLOUD = !!process.env.VERCEL;
const crypto = require('crypto');
const R2 = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET;
const ROOT = __dirname, DATA = path.join(ROOT, 'data'), IMAGES = path.join(DATA, 'images');

// ---------- local (disco) ----------
const local = {
  async readText(name) { try { return fs.readFileSync(name === 'config.json' ? path.join(ROOT, name) : path.join(DATA, name), 'utf8'); } catch { return null; } },
  async writeText(name, text) {
    const f = name === 'config.json' ? path.join(ROOT, name) : path.join(DATA, name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f);
  },
  async putFile(rel, buf) { const f = path.join(IMAGES, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); },
  async delFiles(id, keep) { // keep(nome) true = não apaga
    const dir = path.join(IMAGES, id);
    if (!dir.startsWith(IMAGES + path.sep) || !fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) if (!keep || !keep(f)) fs.rmSync(path.join(dir, f), { force: true });
    if (!fs.readdirSync(dir).length) fs.rmSync(dir, { recursive: true, force: true });
  },
  localPath(rel) { const p = path.normalize(path.join(IMAGES, rel)); return p.startsWith(IMAGES + path.sep) ? p : null; }
};

// ---------- nuvem (Vercel Blob privado) ----------
let B; const blob = async () => (B ||= await import('@vercel/blob'));
const cloud = {
  async readText(name) {
    const { get } = await blob();
    const r = await get(name, { access: 'private', useCache: false });
    return r && r.statusCode === 200 ? await new Response(r.stream).text() : null;
  },
  async writeText(name, text) {
    const { put } = await blob();
    await put(name, text, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  },
  async putFile(rel, buf, contentType) {
    const { put } = await blob();
    await put('images/' + rel, buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType });
  },
  async delFiles(id, keep) {
    const { list, del } = await blob();
    const { blobs } = await list({ prefix: `images/${id}/` });
    const urls = blobs.filter(b => !keep || !keep(b.pathname.split('/').pop())).map(b => b.url);
    if (urls.length) await del(urls);
  },
  async open(rel) { const { get } = await blob(); return get('images/' + rel, { access: 'private' }); }
};

// ---------- nuvem (Cloudflare R2, API do S3) ----------
// Assinatura SigV4 por URL (presign): serve pro servidor e pro navegador subir/baixar direto, sem biblioteca extra.
const enc = v => encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const hmac = (k, v) => crypto.createHmac('sha256', k).update(v).digest();
function presignS3({ method, host, path, query = {}, expires = 600, key, secret, region, now = new Date() }) {
  const amz = now.toISOString().replace(/[-:]|\.\d{3}/g, ''), day = amz.slice(0, 8), scope = `${day}/${region}/s3/aws4_request`;
  const q = { ...query, 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${key}/${scope}`, 'X-Amz-Date': amz, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' };
  const cq = Object.keys(q).sort().map(k => `${enc(k)}=${enc(q[k])}`).join('&');
  const cpath = path.split('/').map(enc).join('/');
  const creq = [method, cpath, cq, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', amz, scope, crypto.createHash('sha256').update(creq).digest('hex')].join('\n');
  const sk = hmac(hmac(hmac(hmac('AWS4' + secret, day), region), 's3'), 'aws4_request');
  return `https://${host}${cpath}?${cq}&X-Amz-Signature=${crypto.createHmac('sha256', sk).update(sts).digest('hex')}`;
}
const r2url = (method, objKey, expires = 600, query) => presignS3({ method, query, expires, host: `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, path: `/${process.env.R2_BUCKET}${objKey ? '/' + objKey : ''}`, key: process.env.R2_ACCESS_KEY_ID, secret: process.env.R2_SECRET_ACCESS_KEY, region: 'auto' });
const r2 = {
  async readText(name) {
    const r = await fetch(r2url('GET', name, 60), { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`R2 respondeu ${r.status} ao ler ${name}`); // erro de verdade: nunca tratar como banco vazio
    return r.text();
  },
  async writeText(name, text) {
    const r = await fetch(r2url('PUT', name, 60), { method: 'PUT', body: text, headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(`R2 respondeu ${r.status} ao gravar ${name}`);
  },
  async putFile(rel, buf, contentType) {
    const r = await fetch(r2url('PUT', 'images/' + rel, 300), { method: 'PUT', body: buf, headers: { 'Content-Type': contentType || 'application/octet-stream' } });
    if (!r.ok) throw new Error(`R2 respondeu ${r.status} ao gravar o arquivo`);
  },
  async delFiles(id, keep) {
    const r = await fetch(r2url('GET', '', 60, { 'list-type': '2', prefix: `images/${id}/` }));
    if (!r.ok) return;
    const keys = [...(await r.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1].replace(/&amp;/g, '&'));
    for (const k of keys) if (!keep || !keep(k.split('/').pop())) await fetch(r2url('DELETE', k, 60), { method: 'DELETE' });
  },
  // link direto e temporário pro arquivo (navegador e Meta baixam do R2, sem passar pela Vercel)
  fileUrl: (rel, expires = 3600) => r2url('GET', 'images/' + rel, expires),
  uploadUrl: rel => r2url('PUT', 'images/' + rel, 3600)
};

module.exports = { CLOUD, R2: !!R2, ...(CLOUD ? (R2 ? r2 : cloud) : local), localPath: local.localPath, blob, presignS3 };
