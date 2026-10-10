import { useEffect, useMemo, useRef, useState } from 'react';
import { uploadMedia } from './api.js';
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
const STORY_USES = { s02: ['title', 'category'], s03: ['title', 'category', 'description'], s01: [] };
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
      <label>Zoom<input type="range" min={r(min)} max="3" step="0.01" value={f.zoom} onChange={ev => set({ ...f, zoom: +ev.target.value })} /></label>
      <label>Horizontal<input type="range" min="0" max="1" step="0.01" value={f.x} onChange={ev => set({ ...f, x: +ev.target.value })} /></label>
      <label>Vertical<input type="range" min="0" max="1" step="0.01" value={f.y} onChange={ev => set({ ...f, y: +ev.target.value })} /></label>
      <div className="crop-btns">
        <button className="ghost" onClick={() => set({ x: .5, y: .5, zoom: min })}>Foto inteira</button>
        <button className="ghost" onClick={() => set({ x: .5, y: .5, zoom: 1 })}>Preencher</button>
        {extra}
      </div>
    </div>
  );
}

function Field({ label, k, e, patch, ph, multi }) {
  const p = { value: e[k] || '', placeholder: ph, onChange: ev => patch({ [k]: ev.target.value }) };
  return <label>{label}{multi ? <textarea rows={1} {...p} /> : <input {...p} />}</label>;
}

export default function Editor() {
  const { editorId, setEditorId, byId, saveItem, replace, toast, cfg } = useApp();
  const [src] = useState(() => byId(editorId));
  const [e, setE] = useState(() => ({ ...JSON.parse(JSON.stringify(src)), focal: src.focal || { x: .5, y: .5, zoom: 1 }, focalStory: src.focalStory || src.focal || { x: .5, y: .5, zoom: 1 }, tpl: { ...DEF_TPL, ...(src.tpl || {}) }, slides: Render.slidesOf(src) }));
  const [photo, setPhoto] = useState(null), [cut, setCut] = useState(null), [imgs, setImgs] = useState({}), [over, setOver] = useState(false), [up, setUp] = useState(false);
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
  const textSig = JSON.stringify([e.title, e.category, e.chip, e.description, e.source, e.credit, e.bigTitle, e.slides, e.tpl, e.focal, e.focalStory, e.photoUrl, e.cutoutUrl, kind, !!photo, !!cut, Object.keys(imgs).length, cur]);
  const thumbSig = JSON.stringify([e.title, e.category, e.chip, e.description, e.source, e.credit, e.bigTitle, e.slides, e.focal, e.photoUrl, e.cutoutUrl, kind, !!photo, !!cut]);
  const n = car ? Render.count(base) : 1, at = Math.min(cur, n - 1);
  const postUses = car ? CAR_USES : POST_USES[e.tpl.post] || [];
  const storyOnly = (STORY_USES[e.tpl.story] || []).filter(k => !postUses.includes(k));
  const types = Render.SLIDE_TYPES[e.tpl.carousel] || Render.SLIDE_TYPES.A;
  const frame = car ? 'carousel' : 'post';
  const dd = (tplPatch, guides) => ({ ...base, tpl: { ...base.tpl, ...tplPatch }, guides });
  const slideSet = (i, s) => setE(x => ({ ...x, slides: x.slides.map((y, k) => (k === i ? s : y)) }));

  async function sendFile(file, slot) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'svg', 'mp4'].includes(ext)) { toast('Formato não aceito. Use JPG, PNG, SVG ou MP4.', true); return null; }
    return uploadMedia(e.id, file, slot, cfg.cloud);
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
  async function save(leave) {
    try {
      await saveItem(byId(e.id), { title: e.title.trim(), category: e.category.trim(), mediaType: e.mediaType, videoUrl: e.videoUrl, slides: e.slides, focal: e.focal, focalStory: e.focalStory, tpl: e.tpl, description: e.description.trim(), chip: e.chip.trim(), legendas: e.legendas || '', dateline: e.dateline || '', source: e.source.trim(), credit: e.credit.trim(), bigTitle: e.bigTitle.trim() });
      dirty.current = false; toast('Arte salva.'); if (leave) close();
    } catch (err) { toast(err.message, true); }
  }
  const field = (k, label, ph, multi) => <Field key={k} k={k} label={label} ph={ph} multi={multi} e={e} patch={patch} />;
  const FIELDS = {
    title: () => field('title', 'Título', '', 1),
    category: () => field('category', 'Categoria', 'Notícia'),
    chip: () => field('chip', 'Selo', 'ÚLTIMA HORA'),
    bigTitle: () => field('bigTitle', 'Título grande atrás do recorte', 'as 2 primeiras palavras do título'),
    description: () => field('description', 'Descrição curta', 'sem descrição', 1),
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
        <div className="sechead"><h3>{video ? 'Reel' : car ? 'Carrossel' : 'Post'}</h3></div>
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
          </>)}
        </div>
        <div className="edform">
          {!video && <TplRow list={car ? Render.CAROUSELS : Render.POSTS} kname={frame} e={e} sig={thumbSig} w={84} h={105} onPick={id => setE(x => ({ ...x, tpl: { ...x.tpl, [frame]: id } }))}
            draw={(c, id) => car ? Render.slide(c, dd({ carousel: id }, false), photo, 0) : Render.post(c, dd({ post: id }, false), photo)} />}
          {video && <Seg value={e.tpl.reel || 'r01'} onChange={id => setE(x => ({ ...x, tpl: { ...x.tpl, reel: id } }))} options={Render.REELS.map(r => [r.id, r.name])} />}
          {(video ? REEL_USES[e.tpl.reel || 'r01'] : postUses).map(k => FIELDS[k]())}
          {midSlide && <SlideRow s={types.some(t => t.id === e.slides[slideIdx].type) ? e.slides[slideIdx] : { ...e.slides[slideIdx], type: types[0].id }} i={slideIdx} types={types} set={v => slideSet(slideIdx, v)}
            remove={() => { setE(x => ({ ...x, slides: x.slides.filter((_, k) => k !== slideIdx) })); setCur(at - 1); }}
            up={() => { setE(x => { const a = [...x.slides]; [a[slideIdx - 1], a[slideIdx]] = [a[slideIdx], a[slideIdx - 1]]; return { ...x, slides: a }; }); setCur(at - 1); }} />}
          {!video && <button className="ghost" onClick={() => { setE(x => ({ ...x, slides: [...x.slides, { type: types.find(t => t.id !== 'foto').id, text: '' }] })); setCur(e.slides.length + 1); }}>+ Slide de texto</button>}
        </div>
      </section>

      <section className="edsec">
        <div className="sechead"><h3>{video ? 'Capa do reel e story' : 'Story'}</h3></div>
        <div className="edpv">
          <CanvasPv w={225} h={400} sig={textSig} photo={photo} focal={e.focalStory} onFocal={f => patch({ focalStory: f })} label="" draw={c => Render.story(c, { ...base, guides: true }, photo, { guides: true })} />
          <Crop f={e.focalStory} set={f => patch({ focalStory: f })} photo={photo} w={1080} h={1920}
            extra={!video && <button className="ghost" onClick={() => patch({ focalStory: { ...e.focal } })}>Igual ao post</button>} />
        </div>
        <div className="edform">
          <TplRow list={Render.STORIES} kname="story" e={e} sig={thumbSig} w={62} h={110} story onPick={id => setE(x => ({ ...x, tpl: { ...x.tpl, story: id } }))}
            draw={(c, id) => Render.story(c, dd({ story: id }, false), photo)} />
          {storyOnly.map(k => FIELDS[k]())}
        </div>
      </section>
    </div>
  );
}
