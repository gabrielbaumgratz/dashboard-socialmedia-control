import { useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadMedia } from './api.js';
import { Seg } from './ui.jsx';
import { ReelOverlay } from './previews.jsx';
import { useApp, vt } from './store.jsx';
import Render from './render.js';
import { artData, getImg } from './art.js';
import { DEF_TPL, typeOf } from './util.js';
import { Icon } from './icons.jsx';

const SLIDE_FIELDS = {
  foto: [['text', 'Legenda na foto (opcional)', 1]],
  contexto: [['label', 'Rótulo'], ['title', 'Título'], ['text', 'Texto', 1]],
  dado: [['number', 'Número grande'], ['text', 'Texto', 1], ['source', 'Fonte']],
  resumo: [['title', 'Título'], ['text', 'Itens (um por linha)', 1]],
  legenda: [['label', 'Rótulo'], ['text', 'Legenda', 1]],
  destaque: [['text', 'Frase em destaque', 1]]
};
// quais campos cada template realmente usa (o que não aparece aqui não vai na arte)
const POST_USES = { p01: ['title', 'category', 'credit'], p02: ['title', 'chip', 'description', 'credit'], p03: ['title', 'category', 'bigTitle', 'cutout', 'credit'], p04: ['title', 'category', 'description', 'source', 'credit'], p05: ['title', 'chip', 'description', 'credit'] };
const CAR_USES = ['title', 'category'];
const REEL_USES = { r00: [], r01: ['title', 'category'], r02: ['title', 'dateline', 'legendas'] };
const STORY_USES = { s02: ['title', 'category', 'credit'], s03: ['title', 'category', 'description', 'credit'], s01: [], s04: ['title', 'category', 'description', 'credit'] };
// baixa em tamanho real, sem guias, exatamente o que está sendo editado
async function savePng(draw, name) {
  const c = document.createElement('canvas'); await draw(c);
  c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
}
const slug = t => (t || 'arte').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'arte';
const SaveBtn = ({ onClick }) => <button type="button" className="ghost savepng" onClick={onClick}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16" /></svg>Baixar imagem</button>;
const KIND = { post: 'Post único', carrossel: 'Carrossel', video: 'Reel' };

function useDebounced(v, ms) { const [x, setX] = useState(v); useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]); return x; }

// desenha numa fila: um desenho por vez, só o último pedido vale
function useCanvasJob() {
  const chain = useRef(Promise.resolve()), latest = useRef(0);
  return job => { const my = ++latest.current; chain.current = chain.current.then(() => (my === latest.current ? job() : null)).catch(() => {}); };
}

function CanvasPv({ label, w, h, sig, draw, photo, focal, onFocal }) {
  const ref = useRef(null), run = useCanvasJob();
  useEffect(() => { const id = requestAnimationFrame(() => run(() => draw(ref.current))); return () => cancelAnimationFrame(id); }, [sig]);
  const st = useRef({ d: null, focal, onFocal, photo }); st.current.focal = focal; st.current.onFocal = onFocal; st.current.photo = photo;
  const down = e => { if (!st.current.photo || !onFocal) return; st.current.d = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = e => {
    const s = st.current, c = ref.current; if (!s.d || !s.photo) return;
    const f = s.focal, k = c.width / c.getBoundingClientRect().width, sc = Math.max(c.width / s.photo.width, c.height / s.photo.height) * f.zoom;
    const ox = s.photo.width * sc - c.width, oy = s.photo.height * sc - c.height;
    s.onFocal({ ...f, x: ox > 0 ? Math.min(1, Math.max(0, f.x - (e.clientX - s.d.x) * k / ox)) : f.x, y: oy > 0 ? Math.min(1, Math.max(0, f.y - (e.clientY - s.d.y) * k / oy)) : f.y });
    s.d = { x: e.clientX, y: e.clientY };
  };
  return (
    <div className="pv"><canvas ref={ref} className={onFocal ? 'main' : ''} style={{ width: w, height: h }} onPointerDown={down} onPointerMove={move} onPointerUp={() => { st.current.d = null; }} /><span>{label}</span></div>
  );
}

function TplRow({ list, kname, e, sig, draw, w, h, story, onPick }) {
  const [urls, setUrls] = useState({}), deb = useDebounced(sig, 350), run = useCanvasJob();
  useEffect(() => {
    let alive = true;
    run(async () => {
      for (const t of list) {
        if (!alive) return;
        const big = document.createElement('canvas'); await draw(big, t.id);
        const sm = document.createElement('canvas'); sm.width = w * 2; sm.height = h * 2; sm.getContext('2d').drawImage(big, 0, 0, sm.width, sm.height);
        if (alive) setUrls(u => ({ ...u, [t.id]: sm.toDataURL('image/jpeg', .8) }));
      }
    });
    return () => { alive = false; };
  }, [deb]);
  return (
    <div className="tplrow" role="radiogroup">
      {list.map(t => (
        <button key={t.id} role="radio" aria-checked={e.tpl[kname] === t.id} className={'tpl' + (story ? ' story' : '') + (e.tpl[kname] === t.id ? ' on' : '')} title={t.name} onClick={() => onPick(t.id)}>
          {urls[t.id] ? <img src={urls[t.id]} alt="" /> : <span className="skel" style={{ aspectRatio: `${w}/${h}` }} />}<span>{t.name}</span>
        </button>
      ))}
    </div>
  );
}

function SlideRow({ s, i, types, set, remove, up }) {
  return (
    <div className="sl">
      <header>
        <b>Slide {i + 2}</b>
        <select aria-label="Tipo do slide" value={s.type} onChange={ev => set({ ...s, type: ev.target.value })}>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <button className="ghost" onClick={up} aria-label="Subir" disabled={!i}>&uarr;</button>
        <button className="danger" onClick={remove}>Remover</button>
      </header>
      {s.type === 'foto' && s.photoUrl && <img className="slthumb" src={s.photoUrl} alt="" />}
      {(SLIDE_FIELDS[s.type] || []).map(([k, label, multi]) => {
        const val = k === 'text' && s.items && !s.text ? s.items.join('\n') : (s[k] || '');
        const on = ev => { const v = ev.target.value; set({ ...s, [k]: v, ...(k === 'text' && s.type === 'resumo' ? { items: v.split('\n').filter(Boolean) } : {}) }); };
        return <label key={k}>{label}{multi ? <textarea rows={3} value={val} onChange={on} /> : <input value={val} onChange={on} />}</label>;
      })}
    </div>
  );
}

// zoom mínimo = foto inteira dentro do quadro (sobra vira fundo borrado)
const fitZoom = (photo, w, h) => (photo ? Math.min(1, Math.min(w / photo.width, h / photo.height) / Math.max(w / photo.width, h / photo.height)) : 1);

function Crop({ f, set, photo, w, h, extra }) {
  if (!photo) return null;
  const min = fitZoom(photo, w, h), r = v => Math.round(v * 100) / 100;
  return (
    <div className="crop">
      <div className="rng2">
        <Rng label="Zoom" value={Math.round(f.zoom * 100)} unit="%" min={Math.round(min * 100)} max={300} onChange={v => set({ ...f, zoom: v / 100 })} />
        <Rng label="Horizontal" value={Math.round(f.x * 100)} unit="%" min={0} max={100} onChange={v => set({ ...f, x: v / 100 })} />
        <Rng label="Vertical" value={Math.round(f.y * 100)} unit="%" min={0} max={100} onChange={v => set({ ...f, y: v / 100 })} />
      </div>
      <div className="crop-btns">
        <button className="ghost" onClick={() => set({ x: .5, y: .5, zoom: min })}>Foto inteira</button>
        <button className="ghost" onClick={() => set({ x: .5, y: .5, zoom: 1 })}>Padrão (preencher)</button>
        {extra}
      </div>
    </div>
  );
}

const SWATCHES = [['#006173', 'Verde petróleo'], ['#008995', 'Teal'], ['#00b0ac', 'Turquesa'], ['#5cbba4', 'Verde'], ['#0f172a', 'Azul marinho'], ['#1d1d1b', 'Preto'], ['#735400', 'Âmbar'], ['#ffffff', 'Branco']];
function ColorPick({ value, onChange }) {
  return <div className="swatches">{SWATCHES.map(([c, n]) => <button type="button" key={c} title={n} aria-label={n} className={'sw' + (value.toLowerCase() === c ? ' on' : '')} style={{ background: c }} onClick={() => onChange(c)} />)}
    <input type="color" aria-label="Outra cor" value={value} onChange={ev => onChange(ev.target.value)} /></div>;
}
function Rng({ label, value, unit = '', min, max, step = 1, onChange }) {
  return <label className="rng"><span>{label}<b>{value}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={ev => onChange(+ev.target.value)} /></label>;
}
function TextColor({ value, onChange }) {
  return <div className="txtcolor"><span>Cor do texto</span>
    <button type="button" className={'chipbtn' + (value === 'auto' ? ' on' : '')} onClick={() => onChange('auto')}>Auto</button>
    {[['#ffffff', 'Branco'], ['#1d1d1b', 'Preto'], ['#006173', 'Verde petróleo'], ['#0f172a', 'Azul marinho']].map(([c, n]) => <button type="button" key={c} title={n} aria-label={n} className={'sw' + (value === c ? ' on' : '')} style={{ background: c }} onClick={() => onChange(c)} />)}
    <input type="color" aria-label="Outra cor de texto" value={value === 'auto' ? '#ffffff' : value} onChange={ev => onChange(ev.target.value)} /></div>;
}
// controles de aparência: k = 'post' | 'story' (painel atrás do texto) ou 'bg' (fundo do story: cor, altura da foto, degradê)
function LookCtl({ e, patch, k, tpl }) {
  const base = Render.LOOK[k], cur = { ...base, ...((e.look || {})[k]) }, set = p => patch({ look: { ...(e.look || {}), [k]: { ...cur, ...p } } });
  const reset = (e.look || {})[k] && <button type="button" className="ghost mini" onClick={() => patch({ look: { ...(e.look || {}), [k]: undefined } })}>Voltar ao padrão</button>;
  if (k === 'bg') return (
    <div className="lookbox"><div className="lookhead"><b>Fundo do story</b>{reset}</div>
      <ColorPick value={cur.color} onChange={color => set({ color })} />
      <div className="rng2">
        {tpl === 's03' && <Rng label="Altura da foto" value={Math.round(cur.ph / 19.2)} unit="%" min={21} max={78} onChange={v => set({ ph: Math.round(v * 19.2) })} />}
        {tpl !== 's04' && <Rng label="Degradê" value={cur.fade} unit="%" min={0} max={100} onChange={fade => set({ fade })} />}
        {tpl === 's03' && <Rng label="Opacidade do fundo" value={cur.op} unit="%" min={0} max={100} onChange={op => set({ op })} />}
      </div>
      <TextColor value={cur.tc} onChange={tc => set({ tc })} />
      {tpl === 's03' && <div className="txtcolor tagrow"><label className="chk"><input type="checkbox" checked={!!cur.sym} onChange={ev => set({ sym: ev.target.checked })} />Símbolo no fim da foto</label></div>}</div>);
  return (
    <div className="lookbox"><div className="lookhead"><label className="chk"><input type="checkbox" checked={cur.on} onChange={ev => set({ on: ev.target.checked })} />Fundo atrás do texto</label>{reset}</div>
      {cur.on && <>
        <ColorPick value={cur.color} onChange={color => set({ color })} />
        <div className="rng2">
          <Rng label="Opacidade" value={cur.opacity} unit="%" min={10} max={100} onChange={opacity => set({ opacity })} />
          <Rng label="Arredondar borda" value={cur.r} unit=" px" min={0} max={60} onChange={r => set({ r })} />
          <Rng label="Contorno" value={cur.bw} unit=" px" min={0} max={12} onChange={bw => set({ bw })} />
          {cur.bw > 0 && <Rng label="Opacidade do contorno" value={cur.bo} unit="%" min={10} max={100} onChange={bo => set({ bo })} />}
        </div>
        {cur.bw > 0 && <ColorPick value={cur.bc} onChange={bc => set({ bc })} />}
        <TextColor value={cur.tc} onChange={tc => set({ tc })} /></>}</div>);
}

// cores do template Última hora: combinações da marca ou cores livres
const BAR_SW = [['#5cbba4', 'Verde'], ['#00b0ac', 'Turquesa'], ['#fabd0d', 'Amarelo'], ['#006173', 'Verde petróleo'], ['#ffffff', 'Branco']];
// barra: same = opção "igual ao destaque" (só no última hora)
function BarPick({ value, same, onChange, sameLabel = 'Igual ao destaque' }) {
  const v = value || '', hex = /^#/.test(v) ? v : '#5cbba4';
  return <div className="txtcolor"><span>Barra</span>
    {same && <button type="button" className={'chipbtn' + (!v ? ' on' : '')} onClick={() => onChange('')}>{sameLabel}</button>}
    <button type="button" className={'chipbtn' + (v === 'none' ? ' on' : '')} onClick={() => onChange('none')}>Sem barra</button>
    {BAR_SW.map(([c, n]) => <button type="button" key={c} title={n} aria-label={n} className={'sw' + (v.toLowerCase() === c ? ' on' : '')} style={{ background: c }} onClick={() => onChange(c)} />)}
    <input type="color" aria-label="Outra cor da barra" value={hex} onChange={ev => onChange(ev.target.value)} /></div>;
}
// k = 'uh' (última hora: fundo + destaque + barra) ou 'cut' (recorte PNG: degradê + barra)
function UhCtl({ e, patch, k = 'uh' }) {
  const cur = { ...Render.LOOK[k], ...((e.look || {})[k]) }, set = p => patch({ look: { ...(e.look || {}), [k]: { ...cur, ...p } } }), uh = k === 'uh';
  return (
    <div className="lookbox"><div className="lookhead"><b>{uh ? 'Cores' : 'Degradê e barra'}</b>{(e.look || {})[k] && <button type="button" className="ghost mini" onClick={() => patch({ look: { ...(e.look || {}), [k]: undefined } })}>Voltar ao padrão</button>}</div>
      {uh && <div className="presets">{Render.UH_PRESETS.map(([n, b, a]) => <button type="button" key={n} className={'preset' + (cur.bg === b && cur.acc === a ? ' on' : '')} onClick={() => set({ bg: b, acc: a })}><i style={{ background: b }} /><i style={{ background: a }} />{n}</button>)}</div>}
      <div className="txtcolor"><span>Degradê</span><ColorPick value={cur.bg} onChange={c => set({ bg: c })} /></div>
      <Rng label="Tamanho do degradê" value={cur.fade} unit="%" min={30} max={200} step={5} onChange={v => set({ fade: v })} />
      {uh && <div className="txtcolor"><span>Destaque</span>{BAR_SW.map(([c, n]) => <button type="button" key={c} title={n} aria-label={n} className={'sw' + (cur.acc.toLowerCase() === c ? ' on' : '')} style={{ background: c }} onClick={() => set({ acc: c })} />)}<input type="color" aria-label="Outra cor de destaque" value={cur.acc} onChange={ev => set({ acc: ev.target.value })} /></div>}
      <BarPick value={cur.bar} same={uh} onChange={v => set({ bar: v })} /></div>);
}

// tracinho embaixo da categoria no post (p01 e capa do carrossel)
function PBarCtl({ e, patch }) {
  const v = ((e.look || {}).pbar || {}).bar || '';
  return <div className="lookbox"><BarPick value={v} same sameLabel="Padrão" onChange={bar => patch({ look: { ...(e.look || {}), pbar: { bar } } })} /></div>;
}
// selo do story (categoria / NOVA NOTÍCIA): mostrar ou não, e a cor
function TagCtl({ e, patch, label = 'Destaque' }) {
  const cur = { ...Render.LOOK.tag, ...((e.look || {}).tag) }, set = p => patch({ look: { ...(e.look || {}), tag: { ...cur, ...p } } });
  return <div className="txtcolor tagrow"><label className="chk"><input type="checkbox" checked={cur.on} onChange={ev => set({ on: ev.target.checked })} />{label}</label>
    {cur.on && <>{[...BAR_SW, ['#0f172a', 'Azul marinho']].map(([c, n]) => <button type="button" key={c} title={n} aria-label={n} className={'sw' + (cur.bg.toLowerCase() === c ? ' on' : '')} style={{ background: c }} onClick={() => set({ bg: c })} />)}
      <input type="color" aria-label="Outra cor do destaque" value={cur.bg} onChange={ev => set({ bg: ev.target.value })} />
      <span className="tgtxt"><span>Texto</span>
      {[['#0f172a', 'Preto'], ['#ffffff', 'Branco']].map(([c, n]) => <button type="button" key={c} className={'chipbtn' + ((cur.tc === '#ffffff') === (c === '#ffffff') ? ' on' : '')} onClick={() => set({ tc: c })}>{n}</button>)}</span></>}</div>;
}
// campo do story que segue o do post até ser editado
function StoryField({ label, k, from, e, patch, multi }) {
  const own = e[k] != null, p = { value: own ? e[k] : (e[from] || ''), onChange: ev => patch({ [k]: ev.target.value }) };
  return <label><span className="lblrow">{label}{own && <button type="button" className="ghost mini" onClick={() => patch({ [k]: null })}>Igual ao post</button>}</span>{multi ? <textarea rows={1} {...p} /> : <input {...p} />}</label>;
}
function Field({ label, k, e, patch, ph, multi }) {
  const p = { value: e[k] || '', placeholder: ph, onChange: ev => patch({ [k]: ev.target.value }) };
  return <label>{label}{multi ? <textarea rows={1} {...p} /> : <input {...p} />}</label>;
}

export default function Editor() {
  const { editorId, setEditorId, byId, saveItem, replace, toast, cfg } = useApp();
  const [src] = useState(() => byId(editorId));
  const [e, setE] = useState(() => ({ ...JSON.parse(JSON.stringify(src)), ...(src.tpl && src.tpl.post === 'p05' ? { look: { ...(src.look || {}), uh: { bg: '#735400', acc: '#fabd0d', ...((src.look || {}).uh) } } } : {}), focal: src.focal || { x: .5, y: .5, zoom: 1 }, focalStory: src.focalStory || src.focal || { x: .5, y: .5, zoom: 1 }, tpl: { ...DEF_TPL, ...(src.tpl || {}), ...(src.tpl && src.tpl.post === 'p05' ? { post: 'p02' } : {}) }, slides: Render.slidesOf(src) }));
  const [photo, setPhoto] = useState(null), [cut, setCut] = useState(null), [imgs, setImgs] = useState({}), [over, setOver] = useState(false), [up, setUp] = useState(false), [dbusy, setDbusy] = useState(false);
  const [cur, setCur] = useState(0), [vr, setVr] = useState(null), [vp, setVp] = useState(false), vref = useRef(null);
  const kind = typeOf(e), car = kind === 'carrossel', video = kind === 'video';
  const patch = p => setE(x => ({ ...x, ...p }));
  const dirty = useRef(false), first = useRef(true);
  const close = () => { if (dirty.current && !confirm('Sair sem salvar a arte?')) return; vt(() => setEditorId(null)); };
  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => { let ok = true; getImg(e.photoUrl).then(i => ok && setPhoto(i)); return () => { ok = false; }; }, [e.photoUrl]);
  useEffect(() => { let ok = true; getImg(e.cutoutUrl).then(i => ok && setCut(i)); return () => { ok = false; }; }, [e.cutoutUrl]);
  const photoSig = e.slides.map(s => s.photoUrl || '').join('|');
  useEffect(() => { let ok = true; (async () => { const m = {}; for (const s of e.slides) if (s.photoUrl) m[s.photoUrl] = await getImg(s.photoUrl); if (ok) setImgs(m); })(); return () => { ok = false; }; }, [photoSig]);
  useEffect(() => { const k = ev => { if (ev.key === 'Escape' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) close(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);

  useEffect(() => { if (first.current) { first.current = false; return; } dirty.current = true; }, [e]);
  useEffect(() => { const h = ev => { if (dirty.current) { ev.preventDefault(); ev.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, []);
  const base = useMemo(() => ({ ...artData(e), cutoutImg: cut, imgs }), [e, cut, imgs]);
  const textSig = JSON.stringify([e.title, e.storyTitle, e.storyCategory, e.category, e.chip, e.description, e.source, e.credit, e.bigTitle, e.look, e.slides, e.tpl, e.focal, e.focalStory, e.photoUrl, e.cutoutUrl, kind, !!photo, !!cut, Object.keys(imgs).length, cur]);
  const thumbSig = JSON.stringify([e.title, e.storyTitle, e.storyCategory, e.category, e.chip, e.description, e.source, e.credit, e.bigTitle, e.look, e.slides, e.focal, e.photoUrl, e.cutoutUrl, kind, !!photo, !!cut]);
  const n = car ? Render.count(base) : 1, at = Math.min(cur, n - 1);
  const postUses = car ? CAR_USES : POST_USES[e.tpl.post] || [];
  const storyOnly = (STORY_USES[e.tpl.story] || []).filter(k => !['title', 'category'].includes(k) && !(video ? REEL_USES[e.tpl.reel || 'r01'] : postUses).includes(k));
  const types = Render.SLIDE_TYPES[e.tpl.carousel] || Render.SLIDE_TYPES.A;
  const frame = car ? 'carousel' : 'post';
  const dd = (tplPatch, guides) => ({ ...base, tpl: { ...base.tpl, ...tplPatch }, guides });
  const slideSet = (i, s) => setE(x => ({ ...x, slides: x.slides.map((y, k) => (k === i ? s : y)) }));

  async function sendFile(file, slot) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'svg', 'mp4'].includes(ext)) { toast('Formato não aceito. Use JPG, PNG, SVG ou MP4.', true); return null; }
    let last = -1;
    return uploadMedia(e.id, file, slot, cfg.cloud, p => { const r = Math.floor(p / 5) * 5; if (r !== last) { last = r; toast(`Enviando ${file.name.slice(0, 24)}… ${r}%`); } });
  }
  async function replaceMain(file, slot) {
    const saved = await sendFile(file, slot); if (!saved) return;
    replace(saved);
    patch({ photoUrl: saved.photoUrl, videoUrl: saved.videoUrl, mediaType: saved.mediaType, focal: saved.focal, focalStory: saved.focal, cutoutUrl: saved.cutoutUrl });
  }
  async function addPhotos(files) {
    const added = [];
    for (const f of files) { const r = await sendFile(f, 'add'); if (r) added.push({ type: 'foto', photoUrl: r.addedUrl, text: '' }); }
    setE(x => ({ ...x, slides: [...x.slides, ...added] }));
  }
  // várias fotos = carrossel na hora: a 1a vira capa, o resto vira slide
  async function take(files, mode) {
    files = [...files]; if (!files.length) return;
    setUp(true); toast('Enviando…');
    try {
      if (mode === 'add') await addPhotos(files);
      else if (mode === 'cutout') await replaceMain(files[0], 'cutout');
      else { await replaceMain(files[0]); if (files.length > 1) await addPhotos(files.slice(1)); }
      toast(files.length > 1 ? `${files.length} arquivos enviados.` : 'Enviado.');
    } catch (err) { toast(err.message, true); }
    setUp(false);
  }
  async function genDesc() {
    setDbusy(true);
    try { const r = await api(`/api/items/${e.id}/ai-desc`, { method: 'POST' }); if (r.description) patch({ description: r.description }); else toast('A IA não devolveu descrição.', true); }
    catch (err) { toast(err.message, true); }
    setDbusy(false);
  }
  async function save(leave) {
    try {
      await saveItem(byId(e.id), { title: e.title.trim(), category: e.category.trim(), mediaType: e.mediaType, videoUrl: e.videoUrl, slides: e.slides, focal: e.focal, focalStory: e.focalStory, tpl: e.tpl, description: e.description.trim(), chip: e.chip.trim(), legendas: e.legendas || '', dateline: e.dateline || '', source: e.source.trim(), credit: e.credit.trim(), bigTitle: e.bigTitle.trim(), look: e.look || {}, storyTitle: e.storyTitle == null ? null : e.storyTitle.trim(), storyCategory: e.storyCategory == null ? null : e.storyCategory.trim() });
      dirty.current = false; toast('Arte salva.'); if (leave) close();
    } catch (err) { toast(err.message, true); }
  }
  const field = (k, label, ph, multi) => <Field key={k} k={k} label={label} ph={ph} multi={multi} e={e} patch={patch} />;
  const FIELDS = {
    title: () => field('title', 'Título', '', 1),
    category: () => field('category', 'Categoria', ''),
    chip: () => field('chip', 'Selo', 'ÚLTIMA HORA'),
    bigTitle: () => field('bigTitle', 'Título grande atrás do recorte', 'as 2 primeiras palavras do título'),
    description: () => <div key="description" className="descbox">{field('description', 'Descrição curta', 'sem descrição', 1)}<button type="button" className="ghost" onClick={genDesc} disabled={dbusy || !cfg.hasKey}>{dbusy ? 'Gerando…' : 'Gerar descrição com IA'}</button></div>,
    source: () => field('source', 'Fonte', 'sem fonte'),
    credit: () => field('credit', 'Crédito da foto', 'sem crédito'),
    dateline: () => field('dateline', 'Linha de data', 'cidade · data da notícia'),
    legendas: () => field('legendas', 'Legendas (uma por linha, aparecem em sequência)', 'uma frase por linha', 1),
    cutout: () => <label key="cutout">Recorte PNG sem fundo<input type="file" accept=".png" disabled={up} onChange={ev => { take(ev.target.files, 'cutout'); ev.target.value = ''; }} /></label>
  };
  const slideIdx = at - 1; // slide do meio que está no preview (capa = -1)
  const midSlide = car && slideIdx >= 0 && slideIdx < e.slides.length;
  const sl = midSlide ? e.slides[slideIdx] : null, slPhoto = sl && sl.photoUrl ? imgs[sl.photoUrl] : null;
  const cf = slPhoto ? sl.focal || { x: .5, y: .5, zoom: 1 } : e.focal, cp = slPhoto || photo;
  const setCf = f => (slPhoto ? slideSet(slideIdx, { ...sl, focal: f }) : patch({ focal: f }));
  const thumbs = [e.photoUrl, ...e.slides.map(s => s.photoUrl)].filter(Boolean);

  return (
    <div className="page editor">
      <div className="pagebar glass">
        <button className="ghost" onClick={close}><Icon name="back" />Voltar</button>
        <h2>{e.title || src.origTitle}</h2>
        <span className="kindtag">{car ? `Carrossel · ${n}` : KIND[kind]}</span>
        <button onClick={() => save(true)}>Salvar</button>
      </div>

      <section className={'drop' + (over ? ' over' : '')} onDragOver={ev => { ev.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={ev => { ev.preventDefault(); setOver(false); take(ev.dataTransfer.files); }}>
        <div className="mediarow">
          {thumbs.map((u, i) => (
            <div key={u + i} className="mthumb"><img src={u} alt="" />{i === 0 ? <span>Capa</span> : <button className="x" aria-label="Tirar foto" onClick={() => setE(x => ({ ...x, slides: x.slides.filter(s => s.photoUrl !== u) }))}>×</button>}</div>
          ))}
          {video && <div className="mthumb vid"><Icon name="reels" /><button className="x" aria-label="Tirar vídeo" onClick={() => patch({ mediaType: 'image', videoUrl: '' })}>×</button></div>}
          <label className="mthumb add">+<input type="file" multiple accept=".jpg,.jpeg,.png,.svg,.mp4" disabled={up} onChange={ev => { take(ev.target.files, thumbs.length ? 'add' : ''); ev.target.value = ''; }} /></label>
        </div>
        <div className="dropmsg">
          <b>{up ? 'Enviando…' : 'Solte fotos ou um vídeo aqui'}</b>
          <span className="hint">Várias fotos viram carrossel. MP4 vira reel.</span>
          <label className="btn ghost">Trocar tudo<input type="file" multiple accept=".jpg,.jpeg,.png,.svg,.mp4" hidden disabled={up} onChange={ev => { setE(x => ({ ...x, slides: x.slides.filter(s => !s.photoUrl) })); take(ev.target.files); ev.target.value = ''; }} /></label>
        </div>
      </section>

      <section className="edsec">
        <div className="sechead"><h3>{video ? 'Reel' : car ? 'Carrossel' : 'Post'}</h3>{!video && <button className="ghost" onClick={() => patch({ look: { ...(e.look || {}), post: undefined }, focal: { x: .5, y: .5, zoom: 1 } })}>Restaurar padrão do post</button>}</div>
        <div className="edpv">
          {video ? (
            <div className="pv">{e.videoUrl && <div className="rl-media reelpv">
                <video ref={vref} src={e.videoUrl + '#t=0.1'} controls onPlay={() => setVp(true)} onPause={() => setVp(false)} onLoadedMetadata={ev => setVr(ev.target.videoWidth / ev.target.videoHeight)} />
                <ReelOverlay it={{ ...e, tpl: e.tpl }} video={vref} playing={vp} /></div>}
              {vr && Math.abs(vr - 9 / 16) > 0.03 && <p className="warn">Vídeo em {vr.toFixed(2)}:1. O Reels usa 9:16.</p>}</div>
          ) : (<>
            <CanvasPv w={340} h={425} sig={textSig} photo={cp} focal={cf} onFocal={setCf}
              label="" draw={c => (car ? Render.slide(c, { ...base, guides: true }, photo, at) : Render.post(c, { ...base, guides: true }, photo))} />
            {car && <div className="slidenav"><button className="ghost" disabled={!at} onClick={() => setCur(at - 1)} aria-label="Anterior">‹</button><span>{at === 0 ? 'Capa' : at === n - 1 ? 'Último slide' : 'Slide ' + (at + 1)} · {at + 1}/{n}</span><button className="ghost" disabled={at >= n - 1} onClick={() => setCur(at + 1)} aria-label="Próximo">›</button></div>}
            <Crop f={cf} set={setCf} photo={cp} w={1080} h={1350} />
            <SaveBtn onClick={() => savePng(c => (car ? Render.slide(c, base, photo, at) : Render.post(c, base, photo)), slug(e.title) + (car ? '-slide-' + (at + 1) : '-post'))} />
          </>)}
        </div>
        <div className="edform">
          {!video && <TplRow list={car ? Render.CAROUSELS : Render.POSTS} kname={frame} e={e} sig={thumbSig} w={84} h={105} onPick={id => setE(x => ({ ...x, tpl: { ...x.tpl, [frame]: id } }))}
            draw={(c, id) => car ? Render.slide(c, dd({ carousel: id }, false), photo, 0) : Render.post(c, dd({ post: id }, false), photo)} />}
          {video && <Seg value={e.tpl.reel || 'r01'} onChange={id => setE(x => ({ ...x, tpl: { ...x.tpl, reel: id } }))} options={Render.REELS.map(r => [r.id, r.name])} />}
          {(video ? REEL_USES[e.tpl.reel || 'r01'] : postUses).map(k => FIELDS[k]())}
          {!video && (car || e.tpl.post === 'p01') && <><LookCtl e={e} patch={patch} k="post" /><PBarCtl e={e} patch={patch} /></>}
          {!video && !car && e.tpl.post === 'p02' && <UhCtl e={e} patch={patch} />}
          {!video && !car && e.tpl.post === 'p03' && <UhCtl e={e} patch={patch} k="cut" />}
          {midSlide && <SlideRow s={types.some(t => t.id === e.slides[slideIdx].type) ? e.slides[slideIdx] : { ...e.slides[slideIdx], type: types[0].id }} i={slideIdx} types={types} set={v => slideSet(slideIdx, v)}
            remove={() => { setE(x => ({ ...x, slides: x.slides.filter((_, k) => k !== slideIdx) })); setCur(at - 1); }}
            up={() => { setE(x => { const a = [...x.slides]; [a[slideIdx - 1], a[slideIdx]] = [a[slideIdx], a[slideIdx - 1]]; return { ...x, slides: a }; }); setCur(at - 1); }} />}
          {!video && <button className="ghost" onClick={() => { setE(x => ({ ...x, slides: [...x.slides, { type: types.find(t => t.id !== 'foto').id, text: '' }] })); setCur(e.slides.length + 1); }}>+ Slide de texto</button>}
        </div>
      </section>

      <section className="edsec">
        <div className="sechead"><h3>{video ? 'Capa do reel e story' : 'Story'}</h3><button className="ghost" onClick={() => patch({ look: { ...(e.look || {}), story: undefined, bg: undefined }, focalStory: { x: .5, y: .5, zoom: 1 } })}>Restaurar padrão do story</button></div>
        <div className="edpv">
          <CanvasPv w={225} h={400} sig={textSig} photo={photo} focal={e.focalStory} onFocal={f => patch({ focalStory: f })} label="" draw={c => Render.story(c, base, photo)} />
          <SaveBtn onClick={() => savePng(c => Render.story(c, base, photo), slug(e.title) + '-story')} />
          <Crop f={e.focalStory} set={f => patch({ focalStory: f })} photo={photo} w={1080} h={1920}
            extra={!video && <button className="ghost" onClick={() => patch({ focalStory: { ...e.focal } })}>Igual ao post</button>} />
        </div>
        <div className="edform">
          <TplRow list={Render.STORIES} kname="story" e={e} sig={thumbSig} w={62} h={110} story onPick={id => setE(x => ({ ...x, tpl: { ...x.tpl, story: id } }))}
            draw={(c, id) => Render.story(c, dd({ story: id }, false), photo)} />
          {e.tpl.story !== 's01' && <>
            <StoryField label="Título" k="storyTitle" from="title" multi e={e} patch={patch} />
            <div className="catgroup"><StoryField label="Categoria" k="storyCategory" from="category" e={e} patch={patch} /><TagCtl e={e} patch={patch} label="Destaque da categoria" /></div></>}
          {e.tpl.story === 's01' && <div className="lookbox"><TagCtl e={e} patch={patch} label="Selo NOVA NOTÍCIA" /></div>}
          {storyOnly.map(k => FIELDS[k]())}
          {e.tpl.story === 's02' && <LookCtl e={e} patch={patch} k="story" />}
          {['s01', 's03', 's04'].includes(e.tpl.story) && <LookCtl e={e} patch={patch} k="bg" tpl={e.tpl.story} />}
        </div>
      </section>
    </div>
  );
}
