// Onde ficam banco, config e arquivos. Local: pasta data/. Na Vercel: Blob privado.
const fs = require('fs');
const path = require('path');

const CLOUD = !!process.env.VERCEL;
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

module.exports = { CLOUD, ...(CLOUD ? cloud : local), localPath: local.localPath, blob };
