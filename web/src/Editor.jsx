import { useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadMedia } from './api.js';
import { ReelOverlay, reelBoxStyle, reelVideoStyle } from './previews.jsx';
import { useApp, vt } from './store.jsx';
import Render from './render.js';
import { artData, exportReel, getImg, getVideoFrame } from './art.js';
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
const REEL_USES = {
  r00: [],
  r01: ['title', 'category', 'description', 'credit'],
  r02: ['title', 'category', 'description', 'source', 'credit'],
  r03: ['title', 'category', 'chip', 'description', 'credit'],
  r04: ['title', 'category', 'chip', 'description', 'credit']
};
const STORY_USES = { s02: ['title', 'category', 'credit'], s03: ['title', 'category', 'description', 'credit'], s01: [], s04: ['title', 'category', 'description', 'credit'] };
// baixa em tamanho real, sem guias, exatamente o que está sendo editado
async function savePng(draw, name) {
  const c = document.createElement('canvas'); Render.setScale(2); try { await draw(c); } finally { Render.setScale(1); } // 2x = 2160 px, sem perder nitidez
  c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
}
const slug = t => (t || 'arte').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'arte';
const SaveBtn = ({ onClick }) => <button type="button" className="ghost savepng" onClick={onClick}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16" /></svg>Baixar imagem</button>;

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
      const big = document.createElement('canvas'), sm = document.createElement('canvas');
      sm.width = w * 2; sm.height = h * 2;
      const sctx = sm.getContext('2d');
      for (const t of list) {
        if (!alive) break;
        await draw(big, t.id);
        sctx.clearRect(0, 0, sm.width, sm.height);
        sctx.drawImage(big, 0, 0, sm.width, sm.height);
        if (alive) setUrls(u => ({ ...u, [t.id]: sm.toDataURL('image/jpeg', .78) }));
      }
      big.width = 0; big.height = 0; sm.width = 0; sm.height = 0;
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

function SlideRow({ s, i, n, types, set, remove, move }) {
  const car = types.filter(t => !t.id.startsWith('p:')), pst = types.filter(t => t.id.startsWith('p:'));
  return (
    <div className="sl">
      <header>
        <b>Slide {i + 2} de {n}</b>
        <span className="sp" />
        <button type="button" className="ghost" onClick={() => move(-1)} aria-label="Mover pra trás" disabled={!i}>&larr;</button>
        <button type="button" className="ghost" onClick={() => move(1)} aria-label="Mover pra frente" disabled={i >= n - 3}>&rarr;</button>
        <button type="button" className="danger" onClick={remove}>Remover</button>
      </header>
      <div className="slbody"><label className="sltype w2">Layout
        <select aria-label="Layout do slide" value={s.type} onChange={ev => set({ ...s, type: ev.target.value })}>
          <optgroup label="Layouts do carrossel">{car.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
          <optgroup label="Modelos de post">{pst.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
        </select>
      </label>
      {(SLIDE_FIELDS[s.type] || []).map(([k, label, multi]) => {
        const val = k === 'text' && s.items && !s.text ? s.items.join('\n') : (s[k] || '');
        const on = ev => { const v = ev.target.value; set({ ...s, [k]: v, ...(k === 'text' && s.type === 'resumo' ? { items: v.split('\n').filter(Boolean) } : {}) }); };
        return <label key={k} className={multi ? 'wf' : 'w2'}>{label}{multi ? <textarea rows={2} value={val} onChange={on} /> : <input value={val} onChange={on} />}</label>;
      })}</div>
    </div>
  );
}

// zoom mínimo = foto inteira dentro do quadro (sobra vira fundo borrado)
const fitZoom = (photo, w, h) => (photo ? Math.min(1, Math.min(w / photo.width, h / photo.height) / Math.max(w / photo.width, h / photo.height)) : 1);

function Crop({ f, set, photo, w, h, extra, pw = 340, cols = 2, fitLabel = 'Foto inteira' }) {
  if (!photo) return null;
  const min = fitZoom(photo, w, h), r = v => Math.round(v * 100) / 100;
  return (
    <div className={'crop' + (pw < 300 ? ' narrow' : '')} style={{ maxWidth: pw }}>
      <div className="rng2">
        <CropRng label="Zoom" value={Math.round(f.zoom * 100)} unit="%" min={Math.round(min * 100)} max={300} onChange={v => set({ ...f, zoom: v / 100 })} />
        <CropRng label="Horizontal" value={Math.round(f.x * 100)} unit="%" min={0} max={100} onChange={v => set({ ...f, x: v / 100 })} />
        <CropRng label="Vertical" value={Math.round(f.y * 100)} unit="%" min={0} max={100} onChange={v => set({ ...f, y: v / 100 })} />
      </div>
      <div className="crop-btns" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        <button className="ghost" onClick={() => set({ x: .5, y: .5, zoom: min })}>{fitLabel}</button>
        <button className="ghost" onClick={() => set({ x: .5, y: .5, zoom: 1 })}>Preencher</button>
        {extra}
      </div>
    </div>
  );
}

const SWATCHES = [['#006173', 'Verde petróleo'], ['#008995', 'Teal'], ['#00b0ac', 'Turquesa'], ['#5cbba4', 'Verde'], ['#fabd0d', 'Amarelo'], ['#735400', 'Âmbar'], ['#0f172a', 'Azul marinho'], ['#1d1d1b', 'Preto'], ['#ffffff', 'Branco']];
const cname = v => (String(v).toLowerCase() === '#000000' ? 'Preto' : (SWATCHES.find(([c]) => c === String(v).toLowerCase()) || [, String(v).toUpperCase()])[1]);
// linha padrão de ajuste: rótulo à esquerda, controle à direita (tudo alinhado)
const Row = ({ label, children }) => <div className="crow"><span className="clbl">{label}</span><div className="cctl">{children}</div></div>;
// cor compacta: mostra a cor atual; clicando abre a paleta. opts = escolhas extras tipo Auto / Sem barra
function ColorMenu({ value, onChange, opts = [], palette = SWATCHES }) {
  const [open, setOpen] = useState(false), ref = useRef(null);
  useEffect(() => { if (!open) return; const h = ev => { if (ref.current && !ref.current.contains(ev.target)) setOpen(false); }; document.addEventListener('pointerdown', h); return () => document.removeEventListener('pointerdown', h); }, [open]);
  const opt = opts.find(([v]) => v === value), hex = /^#/.test(value || '') ? value : null, pick = v => { onChange(v); setOpen(false); };
  return <div className="cmenu" ref={ref}>
    <button type="button" className="cbtn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <i className={'cdot' + (hex ? '' : ' none')} style={hex ? { background: hex } : undefined} />{opt ? opt[1] : cname(value)}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    {open && <div className="cpop" role="dialog">
      {opts.length > 0 && <div className="copts">{opts.map(([v, n]) => <button type="button" key={v} className={'chipbtn' + (value === v ? ' on' : '')} onClick={() => pick(v)}>{n}</button>)}</div>}
      <div className="cgrid">{palette.map(([c, n]) => <button type="button" key={c} title={n} aria-label={n} className={'sw' + (String(value).toLowerCase() === c ? ' on' : '')} style={{ background: c }} onClick={() => pick(c)} />)}
        <label className="ccustom" title="Outra cor"><input type="color" aria-label="Outra cor" value={hex || '#00b0ac'} onChange={ev => onChange(ev.target.value)} />+</label></div>
    </div>}</div>;
}
function Rng({ label, value, unit = '', min, max, step = 1, onChange }) {
  return <Row label={label}><input type="range" min={min} max={max} step={step} value={value} onChange={ev => onChange(+ev.target.value)} aria-label={label} /><b className="cval">{value}{unit}</b></Row>;
}
// slider do enquadramento (embaixo da prévia): rótulo e valor em cima, compacto
const CropRng = ({ label, value, unit = '', min, max, step = 1, onChange }) => <label className="rng"><span>{label}<b>{value}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={ev => onChange(+ev.target.value)} /></label>;
const TEXT_SW = [['#ffffff', 'Branco'], ['#1d1d1b', 'Preto'], ['#006173', 'Verde petróleo'], ['#0f172a', 'Azul marinho']];
const TextColor = ({ value, onChange }) => <Row label="Cor do texto"><ColorMenu value={value} onChange={onChange} opts={[['auto', 'Automática']]} palette={TEXT_SW} /></Row>;
const Head = ({ title, reset }) => <div className="lookhead"><b>{title}</b>{reset}</div>;
const Check = ({ label, on, set }) => <label className="chk"><input type="checkbox" checked={!!on} onChange={ev => set(ev.target.checked)} />{label}</label>;
// ---- cards de aparência: cada grupo de função num card; interruptor liga/desliga e as opções ficam no lugar (só apagam), sem pular o layout
const Card = ({ title, right, off, cls = '', children }) => <div className={'lookbox ' + cls}><div className="lookhead"><b>{title}</b>{right}</div><div className={'lbody' + (off ? ' off' : '')} aria-disabled={off || undefined}>{children}</div></div>;
const Switch = ({ on, set, label }) => <label className="swt" title={label}><input type="checkbox" role="switch" aria-label={label} checked={!!on} onChange={ev => set(ev.target.checked)} /><i aria-hidden="true" /></label>;
const SwitchRow = ({ label, on, set }) => <Row label={label}><Switch on={on} set={set} label={label} /></Row>;
const Pair = ({ children }) => <div className="lookpair">{children}</div>;
const resetBtn = (e, patch, k) => (e.look || {})[k] ? <button type="button" className="ghost mini" onClick={() => patch({ look: { ...(e.look || {}), [k]: undefined } })}>Voltar ao padrão</button> : null;
// k = 'post' | 'story' (fundo atrás do texto) ou 'bg' (fundo do story/reel). pre = linhas extras do card de texto (ex.: barra)
function LookCtl({ e, patch, k, tpl, pre, inline, video }) {
  const base = Render.LOOK[k], cur = { ...base, ...((e.look || {})[k]) }, set = p => patch({ look: { ...(e.look || {}), [k]: { ...cur, ...p } } });
  if (k === 'bg') return <>
    <Card title={video ? 'Fundo do reel' : 'Fundo do story'} right={resetBtn(e, patch, k)}>
      <Row label="Cor do fundo"><ColorMenu value={cur.color} onChange={color => set({ color })} /></Row>
      <TextColor value={cur.tc} onChange={tc => set({ tc })} />
      {pre}
      {tpl === 's03' && <SwitchRow label="Mostrar símbolo" on={cur.sym} set={sym => set({ sym })} />}
    </Card>
    {tpl === 's03' && <Card title="Foto do story" cls="full">
      <Rng label="Altura da foto" value={Math.round(cur.ph / 19.2)} unit="%" min={21} max={78} onChange={v => set({ ph: Math.round(v * 19.2) })} />
      <Rng label="Transição" value={cur.fade} unit="%" min={0} max={100} onChange={fade => set({ fade })} />
      <Rng label="Opacidade da foto" value={cur.op} unit="%" min={0} max={100} onChange={op => set({ op })} />
    </Card>}</>;
  const off = !cur.on;
  const bgCard = (
    <Card title="Fundo atrás do texto" right={<Switch on={cur.on} set={on => set({ on })} label="Fundo atrás do texto" />} off={off}>
      <Row label="Cor do fundo"><ColorMenu value={cur.color} onChange={color => set({ color })} /></Row>
      <Rng label="Opacidade" value={cur.opacity} unit="%" min={0} max={100} onChange={opacity => set({ opacity })} />
      <Rng label="Cantos" value={cur.r} unit=" px" min={0} max={60} onChange={r => set({ r })} />
    </Card>);
  const lineCard = (
    <Card title="Contorno do fundo" off={off}>
      <Rng label="Espessura" value={cur.bw} unit=" px" min={0} max={12} onChange={bw => set({ bw })} />
      <Row label="Cor do contorno"><ColorMenu value={cur.bc} onChange={bc => set({ bc })} /></Row>
      <Rng label="Opacidade" value={cur.bo} unit="%" min={0} max={100} onChange={bo => set({ bo })} />
    </Card>);
  const textCard = (full) => (
    <Card title={pre ? 'Texto e barra' : 'Texto'} cls={full ? 'full' : ''} right={resetBtn(e, patch, k)}>
      {pre}<TextColor value={cur.tc} onChange={tc => set({ tc })} />
    </Card>);
  if (inline) return <>{bgCard}{lineCard}{textCard(false)}</>;
  return <Pair>{bgCard}{lineCard}{textCard(true)}</Pair>;
}

// barra: same = opção "igual ao destaque"/"padrão"
const BarPick = ({ value, same, onChange, sameLabel = 'Igual ao destaque' }) =>
  <Row label="Cor da barra"><ColorMenu value={value || ''} onChange={onChange} opts={[...(same ? [['', sameLabel]] : []), ['none', 'Sem barra']]} /></Row>;
// combinações prontas (degradê + destaque) num menu que fica recolhido
function PresetMenu({ cur, set }) {
  const [open, setOpen] = useState(false), ref = useRef(null);
  useEffect(() => { if (!open) return; const h = ev => { if (ref.current && !ref.current.contains(ev.target)) setOpen(false); }; document.addEventListener('pointerdown', h); return () => document.removeEventListener('pointerdown', h); }, [open]);
  const name = (b, a) => cname(b) + ' e ' + cname(a), on = Render.UH_PRESETS.find(([, b, a]) => cur.bg === b && cur.acc === a);
  const dots = (b, a) => <><i className="cdot" style={{ background: b }} /><i className="cdot" style={{ background: a, marginLeft: -6 }} /></>;
  return <div className="cmenu" ref={ref}>
    <button type="button" className="cbtn" aria-expanded={open} onClick={() => setOpen(o => !o)}>{on ? <>{dots(on[1], on[2])}{name(on[1], on[2])}</> : 'Personalizada'}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    {open && <div className="cpop" role="listbox">{Render.UH_PRESETS.map(([n, b, a]) => <button type="button" key={n} role="option" aria-selected={cur.bg === b && cur.acc === a} className={'chipbtn plist' + (cur.bg === b && cur.acc === a ? ' on' : '')} onClick={() => { set({ bg: b, acc: a }); setOpen(false); }}>{dots(b, a)}{name(b, a)}</button>)}</div>}
  </div>;
}
// k = 'uh' (post 3: degradê + destaque) ou 'cut' (post 4: degradê + barra)
function UhCtl({ e, patch, k = 'uh' }) {
  const cur = { ...Render.LOOK[k], ...((e.look || {})[k]) }, set = p => patch({ look: { ...(e.look || {}), [k]: { ...cur, ...p } } }), uh = k === 'uh';
  if (!uh) return <Pair><Card title="Degradê e barra" cls="full" right={resetBtn(e, patch, k)}>
      <Row label="Cor do degradê"><ColorMenu value={cur.bg} onChange={c => set({ bg: c })} /></Row>
      <Rng label="Tamanho" value={cur.size} unit="%" min={0} max={100} onChange={size => set({ size })} />
      <BarPick value={cur.bar} onChange={v => set({ bar: v })} />
    </Card></Pair>;
  return <Pair>
    <Card title="Degradê" right={resetBtn(e, patch, k)}>
      <Row label="Combinação"><PresetMenu cur={cur} set={set} /></Row>
      <Row label="Cor do degradê"><ColorMenu value={cur.bg} onChange={c => set({ bg: c })} /></Row>
      <Rng label="Tamanho" value={cur.size} unit="%" min={0} max={100} onChange={size => set({ size })} />
    </Card>
    <Card title="Destaque">
      <Row label="Cor de destaque"><ColorMenu value={cur.acc} onChange={c => set({ acc: c })} /></Row>
      <Row label="Cor do selo"><ColorMenu value={cur.chip || ''} onChange={chip => set({ chip })} opts={[['', 'Igual ao destaque'], ['none', 'Sem selo']]} /></Row>
      <BarPick value={cur.bar} same onChange={v => set({ bar: v })} />
    </Card>
  </Pair>;
}

// post 2 e reel 2: vídeo/foto e divisória num card, categoria no outro
function NdCtl({ e, patch, video, hideHeight }) {
  const cur = { ...Render.LOOK.nd, ...((e.look || {}).nd) }, set = p => patch({ look: { ...(e.look || {}), nd: { ...cur, ...p } } });
  return <Pair>
    <Card title={video ? 'Vídeo' : 'Foto'} right={resetBtn(e, patch, 'nd')}>
      {!hideHeight && <Rng label={'Altura d' + (video ? 'o vídeo' : 'a foto')} value={Math.round(cur.ph / 13.5)} unit="%" min={30} max={75} onChange={v => set({ ph: Math.round(v * 13.5) })} />}
      {video && <SwitchRow label="Mostrar logo no topo" on={cur.topLogo !== false} set={topLogo => set({ topLogo })} />}
      <SwitchRow label="Mostrar símbolo" on={cur.sym} set={sym => set({ sym })} />
    </Card>
    <Card title="Categoria">
      <Row label="Cor da categoria"><ColorMenu value={cur.cat} onChange={cat => set({ cat })} /></Row>
      <SwitchRow label="Categoria com selo" on={cur.pill} set={pill => set({ pill })} />
    </Card>
  </Pair>;
}
// reel 3: fundo escuro/colorido com fade atrás do texto + card superior esquerdo customizável
function R3Ctl({ e, patch }) {
  const cur = { ...Render.LOOK.r3, ...((e.look || {}).r3) }, set = p => patch({ look: { ...(e.look || {}), r3: { ...cur, ...p } } });
  const R3_SW = [['#000000', 'Preto'], ...SWATCHES.filter(([c]) => c !== '#1d1d1b')];
  return <Pair>
    <Card title="Fundo com fade (texto)" right={resetBtn(e, patch, 'r3')}>
      <Row label="Cor do fade"><ColorMenu value={cur.bg} onChange={bg => set({ bg })} palette={R3_SW} /></Row>
      <Rng label="Opacidade" value={cur.opacity} unit="%" min={0} max={100} onChange={opacity => set({ opacity })} />
      <Rng label="Altura" value={cur.size} unit="%" min={20} max={65} onChange={size => set({ size })} />
      <TextColor value={cur.tc} onChange={tc => set({ tc })} />
    </Card>
    <Card title="Card superior">
      <Row label="Cor do card"><ColorMenu value={cur.chip} onChange={chip => set({ chip })} opts={[['none', 'Sem card']]} palette={R3_SW} /></Row>
    </Card>
  </Pair>;
}
// barra embaixo da categoria no post 1 (e capa do carrossel)
function PBarRow({ e, patch }) {
  const v = ((e.look || {}).pbar || {}).bar || '';
  return <BarPick value={v} same sameLabel="Automática" onChange={bar => patch({ look: { ...(e.look || {}), pbar: { bar } } })} />;
}
// selo do story (categoria / NOVA NOTÍCIA): mostrar ou não, cor do fundo e do texto
function TagCtl({ e, patch, label = 'Destaque da categoria' }) {
  const cur = { ...Render.LOOK.tag, ...((e.look || {}).tag) }, set = p => patch({ look: { ...(e.look || {}), tag: { ...cur, ...p } } });
  return <Card title={label} right={<Switch on={cur.on} set={on => set({ on })} label={label} />} off={!cur.on}>
    <Row label="Cor do destaque"><ColorMenu value={cur.bg} onChange={bg => set({ bg })} /></Row>
    <Row label="Cor do texto"><div className="seg2">{[['#0f172a', 'Preto'], ['#ffffff', 'Branco']].map(([c, n]) => <button type="button" key={c} className={'chipbtn' + ((cur.tc === '#ffffff') === (c === '#ffffff') ? ' on' : '')} onClick={() => set({ tc: c })}>{n}</button>)}</div></Row>
  </Card>;
}
// campo do story que segue o do post até ser editado
function StoryField({ label, k, from, e, patch, multi, cls }) {
  const own = e[k] != null, p = { value: own ? e[k] : (e[from] || ''), onChange: ev => patch({ [k]: ev.target.value }) };
  return <label className={cls}><span className="lblrow">{label}{own && <button type="button" className="ghost mini" onClick={() => patch({ [k]: null })}>Igual ao post</button>}</span>{multi ? <textarea rows={1} {...p} /> : <input {...p} />}</label>;
}
function Field({ label, k, e, patch, ph, multi, cls }) {
  const p = { value: e[k] || '', placeholder: ph, onChange: ev => patch({ [k]: ev.target.value }) };
  return <label className={cls}>{label}{multi ? <textarea rows={1} {...p} /> : <input {...p} />}</label>;
}

const cleanCat = s => { const v = String(s || '').trim(); return /^(uncategorized|sem categoria)$/i.test(v) ? '' : v; };

export default function Editor() {
  const { editorId, setEditorId, setPostId, byId, saveItem, purgeItem, replace, toast, cfg } = useApp();
  const [src] = useState(() => byId(editorId) || { id: editorId, title: '', origTitle: '', category: '' });
  const [e, setE] = useState(() => ({ ...JSON.parse(JSON.stringify(src)), category: cleanCat(src.category), storyCategory: src.storyCategory != null ? cleanCat(src.storyCategory) : null, ...(src.tpl && src.tpl.post === 'p05' ? { look: { ...(src.look || {}), uh: { bg: '#735400', acc: '#fabd0d', ...((src.look || {}).uh) } } } : {}), focal: src.focal || { x: .5, y: .5, zoom: 1 }, focalStory: src.focalStory || src.focal || { x: .5, y: .5, zoom: 1 }, tpl: { ...DEF_TPL, ...(src.tpl || {}), ...(src.tpl && src.tpl.post === 'p05' ? { post: 'p02' } : {}) }, slides: Render.slidesOf(src) }));
  const [photo, setPhoto] = useState(null), [cut, setCut] = useState(null), [imgs, setImgs] = useState({}), [over, setOver] = useState(false), [up, setUp] = useState(false), [dbusy, setDbusy] = useState(false);
  const [fbusy, setFbusy] = useState(false), [aiHint, setAiHint] = useState(''), [vbusy, setVbusy] = useState(false);
  const [cur, setCur] = useState(0), [vr, setVr] = useState(null), [vdim, setVdim] = useState(null), [vp, setVp] = useState(false), vref = useRef(null), vdrag = useRef(null);
  const kind = typeOf(e), car = kind === 'carrossel', video = kind === 'video';
  const patch = p => setE(x => ({ ...x, ...p }));
  const dirty = useRef(false), saved = useRef(false), first = useRef(true);
  const close = () => {
    if (dirty.current && !confirm('Sair sem salvar a arte?')) return;
    if (!saved.current && !dirty.current && !src.newsId && !src.title && !src.origTitle && !src.photoUrl && !src.videoUrl && !(src.slides || []).length) {
      purgeItem(src.id);
      vt(() => { setEditorId(null); setPostId(null); });
      return;
    }
    vt(() => setEditorId(null));
  };
  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    let ok = true;
    (e.photoUrl ? getImg(e.photoUrl) : e.videoUrl ? getVideoFrame(e.videoUrl) : Promise.resolve(null)).then(i => ok && setPhoto(i));
    return () => { ok = false; };
  }, [e.photoUrl, e.videoUrl]);
  useEffect(() => { let ok = true; getImg(e.cutoutUrl).then(i => ok && setCut(i)); return () => { ok = false; }; }, [e.cutoutUrl]);
  const photoSig = e.slides.map(s => s.photoUrl || '').join('|');
  useEffect(() => { let ok = true; (async () => { const m = {}; for (const s of e.slides) if (s.photoUrl) m[s.photoUrl] = await getImg(s.photoUrl); if (ok) setImgs(m); })(); return () => { ok = false; }; }, [photoSig]);
  useEffect(() => { const k = ev => { if (ev.key === 'Escape' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) close(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);

  useEffect(() => { if (first.current) { first.current = false; return; } dirty.current = true; }, [e]);
  useEffect(() => { const h = ev => { if (dirty.current) { ev.preventDefault(); ev.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, []);
  const base = useMemo(() => ({ ...artData(e), cutoutImg: cut, imgs }), [e, cut, imgs]);
  const textSig = JSON.stringify([e.title, e.storyTitle, e.storyCategory, e.category, e.chip, e.description, e.source, e.credit, e.bigTitle, e.dateline, e.legendas, e.look, e.slides, e.tpl, e.focal, e.focalStory, e.photoUrl, e.cutoutUrl, kind, !!photo, !!cut, Object.keys(imgs).length, cur]);
  const thumbSig = JSON.stringify([e.title, e.storyTitle, e.storyCategory, e.category, e.chip, e.description, e.source, e.credit, e.bigTitle, e.dateline, e.legendas, e.look, e.slides, e.focal, e.photoUrl, e.cutoutUrl, kind, !!photo, !!cut]);
  const n = car ? Render.count(base) : 1, at = Math.min(cur, n - 1);
  const FORDER = ['title', 'category', 'chip', 'description', 'bigTitle', 'cutout', 'source', 'credit', 'dateline', 'legendas']; // mesma ordem em todo o editor
  const midI = car ? at - 1 : -1, midS = midI >= 0 && midI < e.slides.length ? e.slides[midI] : null;
  const ptpl = !car || at === 0 ? e.tpl.post : midS && String(midS.type).startsWith('p:') ? midS.type.slice(2) : null;
  const rtpl = e.tpl.reel || 'r01';
  const postUses = [...new Set(['category', ...(POST_USES[e.tpl.post] || []), ...(ptpl ? POST_USES[ptpl] || [] : [])])].sort((a, b) => FORDER.indexOf(a) - FORDER.indexOf(b));
  const storyOnly = (STORY_USES[e.tpl.story] || []).filter(k => !['title', 'category'].includes(k) && !(video ? (REEL_USES[rtpl] || REEL_USES.r01) : postUses).includes(k));
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
    const isVid = /\.mp4$/i.test(file.name); // foto nova não pode ressuscitar um vídeo que você tirou
    patch({ photoUrl: saved.photoUrl, ...(isVid || slot === 'cutout' ? { videoUrl: saved.videoUrl, mediaType: saved.mediaType } : {}), focal: saved.focal, focalStory: saved.focal, cutoutUrl: saved.cutoutUrl });
  }
  async function addPhotos(files) {
    const added = [];
    for (const f of files) { const r = await sendFile(f, 'add'); if (r) added.push({ type: 'foto', photoUrl: r.addedUrl, text: '' }); }
    setE(x => ({ ...x, slides: [...x.slides, ...added] }));
  }
  // várias fotos = carrossel na hora: a 1a vira capa, o resto vira slide; MP4 vira sempre reel
  async function take(files, mode) {
    files = [...files]; if (!files.length) return;
    setUp(true); toast('Enviando…');
    try {
      const vid = files.find(f => /\.mp4$/i.test(f.name)), pics = files.filter(f => !/\.mp4$/i.test(f.name));
      if (vid) await replaceMain(vid);
      if (pics.length) {
        if (mode === 'add') await addPhotos(pics);
        else if (mode === 'cutout') await replaceMain(pics[0], 'cutout');
        else { await replaceMain(pics[0]); if (pics.length > 1) await addPhotos(pics.slice(1)); }
      }
      toast(files.length > 1 ? `${files.length} arquivos enviados.` : 'Enviado.');
    } catch (err) { toast(err.message, true); }
    setUp(false);
  }
  async function genDesc() {
    setDbusy(true);
    try { const r = await api(`/api/items/${e.id}/ai-desc`, { method: 'POST', body: { title: e.title, description: e.description } }); if (r.description) patch({ description: r.description }); else toast('A IA não devolveu descrição.', true); }
    catch (err) { toast(err.message, true); }
    setDbusy(false);
  }
  async function genFields() {
    let image = '';
    try {
      const srcEl = (vref.current && vref.current.readyState >= 2) ? vref.current : photo;
      const sw = srcEl && (srcEl.videoWidth || srcEl.width), sh = srcEl && (srcEl.videoHeight || srcEl.height);
      if (srcEl && sw && sh) {
        const c = document.createElement('canvas'), sc = Math.min(1, 540 / Math.max(sw, sh));
        c.width = Math.max(1, Math.round(sw * sc)); c.height = Math.max(1, Math.round(sh * sc));
        c.getContext('2d').drawImage(srcEl, 0, 0, c.width, c.height);
        image = c.toDataURL('image/jpeg', 0.8);
      }
    } catch {}
    if (!image && !aiHint.trim() && !(e.title || '').trim() && !(e.description || '').trim()) {
      toast('Suba um vídeo/foto ou digite um tema para a IA criar os dados.', true);
      return;
    }
    setFbusy(true);
    try {
      const r = await api(`/api/items/${e.id}/ai-fields`, { method: 'POST', body: { prompt: aiHint.trim(), title: e.title, description: e.description, image } });
      const next = {};
      if (r.title) next.title = r.title;
      if (r.category != null) next.category = cleanCat(r.category);
      if (r.description) next.description = r.description;
      patch(next);
      toast('Título, categoria e descrição gerados com IA.');
    } catch (err) { toast(err.message, true); }
    setFbusy(false);
  }
  async function saveVideo() {
    if (!e.videoUrl || vbusy) return;
    if (vref.current && !vref.current.paused) try { vref.current.pause(); } catch {}
    setVbusy(true); toast('Gravando vídeo em 4K na melhor qualidade… mantenha esta aba aberta.');
    try {
      const { blob, ext } = await exportReel({ ...e, tpl: e.tpl }, () => {}, 2);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug(e.title)}-reel-4k.${ext}`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Vídeo em 4K baixado.');
    } catch (err) { toast(err.message, true); }
    setVbusy(false);
  }
  async function save(leave) {
    try {
      await saveItem(byId(e.id) || src, { title: (e.title || '').trim(), category: cleanCat(e.category), mediaType: e.mediaType, videoUrl: e.videoUrl, slides: e.slides, photoUrl: e.photoUrl, cutoutUrl: e.cutoutUrl, focal: e.focal, focalStory: e.focalStory, tpl: e.tpl, description: (e.description || '').trim(), chip: (e.chip || '').trim(), legendas: e.legendas || '', dateline: e.dateline || '', source: (e.source || '').trim(), credit: (e.credit || '').trim(), bigTitle: (e.bigTitle || '').trim(), look: e.look || {}, storyTitle: e.storyTitle == null ? null : e.storyTitle.trim(), storyCategory: e.storyCategory == null ? null : cleanCat(e.storyCategory) });
      saved.current = true; dirty.current = false; toast('Arte salva.'); if (leave) close();
    } catch (err) { toast(err.message, true); }
  }
  const field = (k, label, ph, multi, cls) => <Field key={k} k={k} label={label} ph={ph} multi={multi} cls={cls} e={e} patch={patch} />;
  const FIELDS = {
    title: () => field('title', 'Título', '', 1, 'w4'),
    category: () => field('category', 'Categoria', '', 0, 'w2'),
    chip: c => field('chip', video && rtpl === 'r03' ? 'Texto do card superior' : 'Selo', video && rtpl === 'r03' ? 'opcional (usa a categoria se ficar vazio)' : 'ÚLTIMA HORA', 0, c),
    bigTitle: c => field('bigTitle', 'Título grande atrás do recorte', 'as 2 primeiras palavras do título', 0, c),
    description: () => <div key="description" className="descbox">{field('description', 'Descrição curta', 'sem descrição', 1)}<button type="button" className="ghost" onClick={genDesc} disabled={dbusy || !cfg.hasKey}>{dbusy ? 'Gerando…' : 'Gerar descrição com IA'}</button></div>,
    source: c => field('source', 'Fonte', 'sem fonte', 0, c),
    credit: c => field('credit', video ? 'Crédito do vídeo' : 'Crédito da foto', 'sem crédito', 0, c),
    dateline: c => field('dateline', 'Linha de data', 'cidade · data da notícia', 0, c),
    legendas: () => field('legendas', 'Legendas (uma por linha, aparecem em sequência)', 'uma frase por linha', 1),
    cutout: c => <label key="cutout" className={c}>Recorte PNG sem fundo<input type="file" accept=".png" disabled={up} onChange={ev => { take(ev.target.files, 'cutout'); ev.target.value = ''; }} /></label>
  };
  // mesma ordem em todo template: título e categoria, depois selo/fonte/crédito lado a lado, depois descrição
  const MID = ['chip', 'bigTitle', 'cutout', 'source', 'credit', 'dateline'];
  const renderFields = list => {
    const top = list.filter(k => k === 'title' || k === 'category'), mid = list.filter(k => MID.includes(k)), rest = list.filter(k => !top.includes(k) && !mid.includes(k));
    const c = mid.length === 2 || mid.length === 4 ? 'w3' : mid.length === 1 ? 'w6' : 'w2';
    return [...top.map(k => FIELDS[k]()), ...mid.map(k => FIELDS[k](c)), ...rest.map(k => FIELDS[k]())];
  };
  const slideIdx = at - 1; // slide do meio que está no preview (capa = -1)
  const midSlide = car && slideIdx >= 0 && slideIdx < e.slides.length;
  const sl = midSlide ? e.slides[slideIdx] : null, slPhoto = sl && sl.photoUrl ? imgs[sl.photoUrl] : null;
  const cf = slPhoto ? sl.focal || { x: .5, y: .5, zoom: 1 } : e.focal, cp = slPhoto || photo;
  const setCf = f => (slPhoto ? slideSet(slideIdx, { ...sl, focal: f }) : patch({ focal: f }));
  const thumbs = [e.photoUrl, ...e.slides.map(s => s.photoUrl)].filter(Boolean);
  const order = [{ u: e.photoUrl }, ...e.slides.map(s => ({ u: s.photoUrl, s }))];
  const [drag, setDrag] = useState(null), [place, setPlace] = useState(null);
  const shown = (() => { if (!e.photoUrl && !car) return []; const a = order.map((_, i) => i); if (drag !== null && place !== null) { a.splice(a.indexOf(drag), 1); a.splice(place, 0, drag); } return a; })();
  function moveItem(from, to) {
    if (from === to) return;
    const m = from === 0 ? { photoUrl: e.photoUrl } : e.slides[from - 1];
    if (to === 0 && !m.photoUrl) { toast('A capa precisa ter foto.', true); return; }
    setE(x => {
      const items = [{ cover: true, photoUrl: x.photoUrl, focal: x.focal }, ...x.slides];
      const [it] = items.splice(from, 1); items.splice(to, 0, it);
      const [c, ...rest] = items;
      const slides = rest.map(r => (r.cover ? { type: 'foto', photoUrl: r.photoUrl, focal: r.focal, text: '' } : r));
      return c.cover ? { ...x, slides } : { ...x, slides, photoUrl: c.photoUrl, focal: c.focal || { x: .5, y: .5, zoom: 1 }, focalStory: c.focal || { x: .5, y: .5, zoom: 1 } };
    });
    setCur(to);
  }

  return (
    <div className="page editor">
      <div className="pagebar glass">
        <button className="ghost" onClick={close}><Icon name="back" />Voltar</button>
        <h2>{e.title || src.origTitle || 'Novo post'}</h2>
        <button onClick={() => save(true)}>Salvar</button>
      </div>

      <section className={'drop' + (over ? ' over' : '')} onDragOver={ev => { ev.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={ev => { ev.preventDefault(); setOver(false); take(ev.dataTransfer.files); }}>
        <div className="mediarow">
          {shown.map((i, p) => { const o = order[i]; return (
            <div key={(o.u || 'x') + i} className={'mthumb' + (car && at === i ? ' sel' : '') + (drag === i ? ' dragging' : '')} draggable={order.length > 1}
              onClick={() => car && setCur(i)}
              onDragStart={ev => { ev.dataTransfer.setData('text/plain', 'ordem'); ev.dataTransfer.effectAllowed = 'move'; setDrag(i); setPlace(i); }}
              onDragEnd={() => { setDrag(null); setPlace(null); }}
              onDragOver={ev => { if (drag === null) return; ev.preventDefault(); ev.stopPropagation(); if (place !== p) setPlace(p); }}
              onDrop={ev => { if (drag === null) return; ev.preventDefault(); ev.stopPropagation(); moveItem(drag, place ?? p); setDrag(null); setPlace(null); }}>
              {o.u ? (o.u.startsWith('/images/') ? <img src={o.u + (o.u.includes('?') ? '&' : '?') + 'cv=1'} alt="" crossOrigin="anonymous" draggable={false} /> : <img src={o.u} alt="" draggable={false} />) : <em>{(o.s && (types.find(t => t.id === o.s.type) || {}).name) || (i === 0 ? 'Capa' : 'Texto')}</em>}
              {order.length > 1 && <b className="grip" aria-hidden="true">⋮⋮</b>}
              <span>{p === 0 ? 'Capa' : p + 1}</span>
              {i > 0 && drag === null && <button className="x" aria-label="Tirar slide" onClick={ev => { ev.stopPropagation(); setE(x => ({ ...x, slides: x.slides.filter((_, k) => k !== i - 1) })); setCur(c => Math.min(c, order.length - 2)); }}>×</button>}
            </div>); })}
          {car && <div className={'mthumb fin' + (at === n - 1 ? ' sel' : '')} onClick={() => setCur(n - 1)} title="O último slide é sempre o de chamada"><em>Final</em></div>}
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
        <div className="sechead"><h3>{video ? 'Reel' : car ? 'Carrossel' : 'Post'}</h3><button className="ghost" onClick={() => patch({ look: { ...(e.look || {}), post: undefined, nd: undefined, uh: undefined, r3: undefined, pbar: undefined, bg: undefined }, focal: { x: .5, y: .5, zoom: 1 } })}>{video ? 'Restaurar padrão do reel' : 'Restaurar padrão do post'}</button></div>
        <div className="edpv">
          {video ? (() => {
            const rbox = Render.reelBox(base), vphoto = vdim || (photo && { width: photo.videoWidth || photo.width || 1080, height: photo.videoHeight || photo.height || 1920 }) || { width: 1080, height: 1920 };
            const toggleVid = () => { const v = vref.current; if (!v) return; if (v.paused) { if (v.currentTime < 0.3) v.currentTime = 0; v.play().catch(() => {}); } else v.pause(); };
            const vDown = ev => { if (ev.target.closest('button')) return; vdrag.current = { x: ev.clientX, y: ev.clientY, moved: false }; ev.currentTarget.setPointerCapture(ev.pointerId); };
            const vMove = ev => {
              const d = vdrag.current; if (!d) return;
              const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
              if (!d.moved && Math.hypot(dx, dy) < 4) return;
              d.moved = true;
              const rect = ev.currentTarget.getBoundingClientRect(), f = e.focal || { x: .5, y: .5, zoom: 1 };
              const k = 1080 / rect.width, sc = Math.max(rbox.w / vphoto.width, rbox.h / vphoto.height) * (f.zoom || 1);
              const ox = vphoto.width * sc - rbox.w, oy = vphoto.height * sc - rbox.h;
              patch({ focal: { ...f, x: ox > 0 ? Math.min(1, Math.max(0, f.x - dx * k / ox)) : f.x, y: oy > 0 ? Math.min(1, Math.max(0, f.y - dy * k / oy)) : f.y } });
              d.x = ev.clientX; d.y = ev.clientY;
            };
            const vUp = () => { const d = vdrag.current; vdrag.current = null; if (d && !d.moved) toggleVid(); };
            return (
              <div className="pv">
                {e.videoUrl && <div className="rl-media reelpv" style={{ cursor: 'grab', touchAction: 'none' }} onPointerDown={vDown} onPointerMove={vMove} onPointerUp={vUp}>
                  <div style={reelBoxStyle(e)}>
                    <video ref={vref} style={reelVideoStyle(e, vr)} src={e.videoUrl} loop playsInline preload="auto" onPlay={() => setVp(true)} onPause={() => setVp(false)} onLoadedMetadata={ev => { const vw = ev.target.videoWidth || 1080, vh = ev.target.videoHeight || 1920; setVr(vw / vh); setVdim({ width: vw, height: vh }); }} onLoadedData={ev => { try { if (ev.currentTarget.currentTime === 0) ev.currentTarget.currentTime = 0.05; } catch {} }} />
                  </div>
                  <ReelOverlay it={{ ...e, tpl: e.tpl }} playing={vp} />
                  {!vp && <button type="button" className="reelplay" onClick={toggleVid} aria-label="Tocar"><Icon name="play" /></button>}
                </div>}
                {e.videoUrl && <Crop f={e.focal || { x: .5, y: .5, zoom: 1 }} set={f => patch({ focal: f })} photo={vphoto} w={rbox.w} h={rbox.h} pw={225} cols={2} fitLabel="Vídeo inteiro"
                  extra={<><button type="button" className="ghost" onClick={toggleVid}>{vp ? 'Pausar vídeo' : 'Dar play no vídeo'}</button>
                    <button type="button" className="ghost savepng" disabled={vbusy} onClick={saveVideo}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16" /></svg>{vbusy ? 'Gravando 4K…' : 'Baixar vídeo'}</button></>} />}
              </div>
            );
          })() : (<>
            <div className="pvwrap">
              <CanvasPv w={340} h={425} sig={textSig} photo={cp} focal={cf} onFocal={setCf}
                label="" draw={c => (car ? Render.slide(c, { ...base, guides: true }, photo, at) : Render.post(c, { ...base, guides: true }, photo))} />
              {car && <><button type="button" className="pvarrow l" disabled={!at} onClick={() => setCur(at - 1)} aria-label="Slide anterior">‹</button>
                <button type="button" className="pvarrow r" disabled={at >= n - 1} onClick={() => setCur(at + 1)} aria-label="Próximo slide">›</button></>}
            </div>
            {car && <div className="slidenav" aria-live="polite"><div className="pvdots">{Array.from({ length: n }, (_, k) => <button type="button" key={k} className={k === at ? 'on' : ''} onClick={() => setCur(k)} aria-label={'Ir pro slide ' + (k + 1)} />)}</div><span>{at === 0 ? 'Capa' : at === n - 1 ? 'Final' : 'Slide ' + (at + 1)} · {at + 1}/{n}</span></div>}
            <Crop f={cf} set={setCf} photo={cp} w={1080} h={1350}
              extra={<SaveBtn onClick={() => savePng(c => (car ? Render.slide(c, base, photo, at) : Render.post(c, base, photo)), slug(e.title) + (car ? '-slide-' + (at + 1) : '-post'))} />} />
          </>)}
        </div>
        <div className="edform">
          {!video && (!car || at === 0) && <TplRow list={Render.POSTS} kname="post" e={e} sig={thumbSig} w={84} h={105} onPick={id => setE(x => ({ ...x, tpl: { ...x.tpl, post: id } }))}
            draw={(c, id) => Render.post(c, dd({ post: id }, false), photo)} />}
          {!video && car && at > 0 && <TplRow list={Render.CAROUSELS} kname="carousel" e={e} sig={thumbSig} w={84} h={105} onPick={id => setE(x => ({ ...x, tpl: { ...x.tpl, carousel: id } }))}
            draw={(c, id) => Render.slide(c, { ...dd({ carousel: id }, false), slides: [{ type: id === 'A' ? 'contexto' : 'legenda', title: 'Título', label: 'Contexto', text: 'Texto do slide', photoUrl: '' }] }, photo, 1)} />}
          {video && <TplRow list={Render.REELS} kname="reel" e={e} sig={thumbSig} w={62} h={110} story onPick={id => setE(x => ({ ...x, tpl: { ...x.tpl, reel: id } }))}
            draw={(c, id) => Render.reelThumb(c, dd({ reel: id }, false), photo)} />}
          {!e.newsId && !src.newsId && (
            <div className="aifields w6">
              <input value={aiHint} onChange={ev => setAiHint(ev.target.value)} placeholder="Assunto ou dica rápida (opcional — a IA também lê o vídeo ou a foto)" onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); genFields(); } }} />
              <button type="button" className="aibtn" onClick={genFields} disabled={fbusy || !cfg.hasKey}>{fbusy ? 'Gerando com IA…' : 'Gerar dados com IA'}</button>
            </div>
          )}
          {renderFields(video ? (REEL_USES[rtpl] || REEL_USES.r01) : postUses)}
          {(video ? rtpl === 'r01' : ptpl === 'p01') && <LookCtl e={e} patch={patch} k="post" pre={<PBarRow e={e} patch={patch} />} />}
          {(video ? rtpl === 'r02' : ptpl === 'p04') && <NdCtl e={e} patch={patch} video={video} />}
          {video && rtpl === 'r03' && <R3Ctl e={e} patch={patch} />}
          {(video ? rtpl === 'r04' : ptpl === 'p02') && <UhCtl e={e} patch={patch} />}
          {!video && ptpl === 'p03' && <UhCtl e={e} patch={patch} k="cut" />}
          {midSlide && <SlideRow s={types.some(t => t.id === e.slides[slideIdx].type) ? e.slides[slideIdx] : { ...e.slides[slideIdx], type: types[0].id }} i={slideIdx} n={n} types={types} set={v => slideSet(slideIdx, v)}
            remove={() => { setE(x => ({ ...x, slides: x.slides.filter((_, k) => k !== slideIdx) })); setCur(at - 1); }}
            move={d => { const t = slideIdx + d; if (t < 0 || t >= e.slides.length) return; setE(x => { const a = [...x.slides]; [a[slideIdx], a[t]] = [a[t], a[slideIdx]]; return { ...x, slides: a }; }); setCur(at + d); }} />}
          {!video && <button className="ghost" onClick={() => { setE(x => ({ ...x, slides: [...x.slides, { type: types.find(t => t.id !== 'foto').id, text: '' }] })); setCur(e.slides.length + 1); }}>+ Slide de texto</button>}
        </div>
      </section>

      <section className="edsec">
        <div className="sechead"><h3>Story</h3><button className="ghost" onClick={() => patch({ look: { ...(e.look || {}), story: undefined, bg: undefined }, focalStory: { x: .5, y: .5, zoom: 1 } })}>Restaurar padrão do story</button></div>
        <div className="edpv">
          <CanvasPv w={225} h={400} sig={textSig} photo={photo} focal={e.focalStory} onFocal={f => patch({ focalStory: f })} label="" draw={c => Render.story(c, base, photo)} />
          <Crop f={e.focalStory} set={f => patch({ focalStory: f })} photo={photo} w={1080} h={1920} pw={225} cols={video ? 2 : 3}
            extra={<>{!video && <button className="ghost" onClick={() => patch({ focalStory: { ...e.focal } })}>Igual ao post</button>}<SaveBtn onClick={() => savePng(c => Render.story(c, base, photo), slug(e.title) + '-story')} /></>} />
        </div>
        <div className="edform">
          <TplRow list={Render.STORIES} kname="story" e={e} sig={thumbSig} w={62} h={110} story onPick={id => setE(x => ({ ...x, tpl: { ...x.tpl, story: id } }))}
            draw={(c, id) => Render.story(c, dd({ story: id }, false), photo)} />
          {e.tpl.story !== 's01' && <>
            <StoryField label="Título" k="storyTitle" from="title" multi cls="w4" e={e} patch={patch} />
            <StoryField label="Categoria" k="storyCategory" from="category" cls="w2" e={e} patch={patch} /></>}
          {renderFields(storyOnly)}
          <div className="lookpair">
            <TagCtl e={e} patch={patch} label={e.tpl.story === 's01' ? 'Selo NOVA NOTÍCIA' : 'Destaque da categoria'} />
            {e.tpl.story === 's02' ? <LookCtl e={e} patch={patch} k="story" inline /> : <LookCtl e={e} patch={patch} k="bg" tpl={e.tpl.story} />}
          </div>
        </div>
      </section>
      <div className="savebar"><button onClick={() => save(true)}>Salvar</button></div>
    </div>
  );
}
