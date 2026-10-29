// Aprovação da cliente: grava no mesmo Firebase do calendário (login anônimo + Firestore REST, sem SDK).
// aprovacoes/{id do post}: o que você mandou e, nos campos da cliente, o que ela respondeu.
import { api } from './api.js';
import { renderSet } from './art.js';
import { typeOf } from './util.js';

const PROJ = 'reconstrucoes-posts';
// a chave não fica no código: vem do servidor (config.json local ou FIREBASE_API_KEY na Vercel)
let KEY = '';
async function apiKey() {
  if (!KEY) KEY = (await api('/api/firebase-key')).key;
  if (!KEY) throw new Error('Falta a chave do Firebase: coloque firebaseKey no config.json (ou FIREBASE_API_KEY na Vercel).');
  return KEY;
}
const FS = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;

let tok = null;
async function token() {
  if (tok && tok.exp > Date.now()) return tok.id;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${await apiKey()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Não consegui entrar no Firebase: ' + (j.error?.message || r.status));
  tok = { id: j.idToken, exp: Date.now() + (+j.expiresIn - 120) * 1000 };
  return tok.id;
}
async function fs(path, method = 'GET', body) {
  const r = await fetch(FS + path, { method, headers: { Authorization: 'Bearer ' + await token(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Firebase: ' + (j.error?.message || r.status));
  return j;
}

const enc = v => Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v ?? '') };
const dec = f => f.arrayValue ? (f.arrayValue.values || []).map(dec) : f.integerValue !== undefined ? +f.integerValue : f.stringValue ?? '';
const fromDoc = d => d && Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)]));
const toFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
const mask = o => Object.keys(o).map(k => 'updateMask.fieldPaths=' + k).join('&');

// o Firestore aceita ~1 MB por documento: reencoda a arte mais leve se passar de 850 mil caracteres
async function shrink(dataUrl) {
  if (dataUrl.length < 850000) return dataUrl;
  const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = dataUrl; });
  for (let k = 1, q = 0.85; ; k *= 0.85, q = Math.max(0.6, q - 0.08)) {
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', q);
    if (out.length < 850000 || k < 0.3) return out;
  }
}

export const getApproval = async id => fromDoc(await fs('/aprovacoes/' + id));
export const removeApproval = async id => { const a = await getApproval(id); if (!a) return; await Promise.all([...(a.imagens || []), a.story].filter(Boolean).map(x => fs('/imagens/' + x, 'DELETE'))); await fs('/aprovacoes/' + id, 'DELETE'); };

// it: o post já com a legenda e hashtags atuais. Reenviar zera o pedido anterior, mas guarda a legenda que ela escreveu.
export async function sendApproval(it, onStep = () => {}) {
  const old = await getApproval(it.id);
  onStep('Renderizando a arte…');
  const set = await renderSet(it, 'image/jpeg');
  const versao = (old?.versao || 0) + 1, ids = [];
  onStep('Enviando para a cliente…');
  const put = async (name, f) => { const id = `${it.id}-v${versao}-${name}`; await fs('/imagens/' + id, 'PATCH', { fields: toFields({ data: await shrink(f.dataUrl) }) }); ids.push(id); return id; };
  const imagens = []; for (let i = 0; i < set.slides.length; i++) imagens.push(await put(String(i + 1), set.slides[i]));
  const story = await put('story', set.story);
  const dados = {
    titulo: it.title || it.origTitle || '', categoria: it.category || '', descricao: it.description || '',
    tipo: typeOf(it) === 'video' ? 'reel' : typeOf(it), imagens, story,
    legenda: it.caption || '', hashtags: (it.hashtags || []).map(t => '#' + t).join(' '),
    status: 'pendente', versao, enviadoEm: new Date().toISOString(), respondidoEm: '', respondidoPor: '', legendaCliente: '', comentario: '', sugTitulo: '', sugCategoria: '', sugDescricao: '',
  };
  await fs(`/aprovacoes/${it.id}?${mask(dados)}`, 'PATCH', { fields: toFields(dados) });
  if (old) await Promise.all([...(old.imagens || []), old.story].filter(Boolean).map(x => fs('/imagens/' + x, 'DELETE').catch(() => {})));
  return getApproval(it.id);
}
