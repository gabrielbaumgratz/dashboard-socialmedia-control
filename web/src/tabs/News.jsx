import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp, vt } from '../store.jsx';
import { ExpandableSearch, PageHead, Spin, Status, usePref, ViewToggle } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { STATUS, cap1, isoLocal } from '../util.js';

function rangeOf(p, month, year) {
  const now = new Date(), som = new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === '7d') return { after: isoLocal(new Date(now - 7 * 864e5)) };
  if (p === 'month') return { after: isoLocal(som) };
  if (p === 'lastmonth') return { after: isoLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)), before: isoLocal(som) };
  if (p === 'year') return { after: isoLocal(new Date(now.getFullYear(), 0, 1)) };
  if (p === 'pickmonth' && month) { const [y, m] = month.split('-').map(Number); return { after: isoLocal(new Date(y, m - 1, 1)), before: isoLocal(new Date(y, m, 1)) }; }
  if (p === 'pickyear' && year) { const y = +year; return { after: isoLocal(new Date(y, 0, 1)), before: isoLocal(new Date(y + 1, 0, 1)) }; }
  return {};
}
const img = u => '/api/img?url=' + encodeURIComponent(u);

function Reader({ n, onBack, onSend, label }) {
  const paras = String(n.text || n.excerpt || '(sem texto)').split(/\n{2,}/);
  return (
    <article className="reader">
      <button className="ghost glass back" onClick={onBack}><Icon name="back" />Notícias</button>
      <div className="rd-main">
        <div className="meta">{new Date(n.date).toLocaleDateString('pt-BR', { dateStyle: 'long' })}{n.category ? '  |  ' + n.category : ''}  |  <a href={n.link} target="_blank" rel="noopener noreferrer">ver no portal</a></div>
        <h1>{n.title}</h1>
        <button className="rd-send" onClick={onSend}>{label}</button>
        {n.thumb && <img className="rd-img" src={img(n.thumb || n.image)} alt="" />}
        <div className="rd-text">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
      </div>
    </article>
  );
}

export default function News() {
  const { items, cfg, setItems, setTab, openPost, createItem, toast, engine, refreshEngine, reload, setBanner } = useApp();
  const [view, setView] = usePref('news-view', 'grid'), [checking, setChecking] = useState(false);
  const [period, setPeriod] = useState('all'), [month, setMonth] = useState(''), [year, setYear] = useState(''), [search, setSearch] = useState('');
  const [applied, setApplied] = useState({}), [list, setList] = useState([]), [page, setPage] = useState(1), [pages, setPages] = useState(1);
  const [msg, setMsg] = useState('Buscando notícias no site…'), [loading, setLoading] = useState(false), [reading, setReading] = useState(null);
  const seq = useRef(0);

  async function load(reset, f = applied, pg = 1) {
    const my = ++seq.current; setLoading(true); setMsg('Buscando notícias no site…');
    const q = new URLSearchParams({ page: pg });
    for (const k of ['after', 'before', 'search']) if (f[k]) q.set(k, f[k]);
    try {
      const r = await api('/api/news?' + q);
      if (my !== seq.current) return;
      setPages(r.totalPages); setPage(pg);
      setList(l => (reset ? r.items : [...l, ...r.items]));
      setMsg(r.items.length || !reset ? '' : 'Nenhuma notícia nesse filtro.');
    } catch (e) { if (my === seq.current) setMsg('Não consegui buscar as notícias: ' + e.message); }
    if (my === seq.current) setLoading(false);
  }
  useEffect(() => { load(true); }, []);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } const id = setTimeout(apply, 350); return () => clearTimeout(id); }, [period, month, year, search]);
  const apply = () => { const f = { ...rangeOf(period, month, year), search: search.trim() }; setApplied(f); load(true, f, 1); };
  
  const sending = useRef(new Set());
  async function send(n) {
    let it = items.find(i => i.newsId === n.id);
    if (it) { openPost(it.id); return; }
    if (sending.current.has(n.id)) return; // segundo clique enquanto cria não cria outro
    sending.current.add(n.id);
    try {
      it = await api('/api/items', { method: 'POST', body: { newsId: n.id, origTitle: n.title, title: n.title, category: n.category || '', link: n.link, newsText: n.text || n.excerpt || '', newsDate: n.date, photoUrl: n.image || '', credit: n.credit || '', description: '' } });
      setItems(l => [...l, it]); setReading(null); openPost(it.id); // abre direto a página do post: arte, legendas e Programar
      if (cfg.hasKey) {
        try { const s = await api(`/api/items/${it.id}/ai`, { method: 'POST' }); setItems(l => l.map(x => (x.id === s.id ? s : x))); toast('3 legendas prontas.'); }
        catch (e) { toast(e.message, true); }
      } else toast('Post criado. Coloque a chave do Gemini em Configurações para gerar as legendas.');
    } catch (e) { toast(e.message, true); }
    finally { sending.current.delete(n.id); }
  }
  const labelFor = n => { const it = items.find(i => i.newsId === n.id); return it ? (it.status === 'posted' ? 'Já postada' : 'Abrir post') : 'Criar post'; };
  // atualiza a lista e já roda o motor (cria rascunho do que for novo)
  const refresh = async () => {
    setChecking(true);
    try { const e = await api('/api/engine/run', { method: 'POST' }); await reload(); refreshEngine(); if (e.lastNew) setBanner(b => b + e.lastNew); toast(e.lastError ? 'Erro: ' + e.lastError : e.lastNew ? `${e.lastNew} nova(s) foram pra fila` : 'Nada novo no site.', !!e.lastError); }
    catch (e) { toast(e.message, true); }
    await load(true, applied, 1); setChecking(false);
  };
  const t = engine.lastRun ? new Date(engine.lastRun) : null;
  const when = t ? `Checado às ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '';
  const open = n => vt(() => setReading(n));

  if (reading) return <Reader n={reading} onBack={() => vt(() => setReading(null))} onSend={() => send(reading)} label={labelFor(reading)} />;

  let last = '';
  return (
    <>
      <PageHead title="Notícias do site" hint={when}>
        <ViewToggle value={view} onChange={setView} />
        <button className="ghost glass" onClick={refresh} disabled={checking}>{checking ? <><Spin /> Atualizando…</> : 'Atualizar'}</button>
        <button onClick={createItem}>+ Novo post</button>
      </PageHead>
      <div className="filters">
        <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Período">
          <option value="all">Tudo</option><option value="7d">Últimos 7 dias</option><option value="month">Este mês</option>
          <option value="lastmonth">Mês passado</option><option value="year">Este ano</option><option value="pickmonth">Escolher mês</option><option value="pickyear">Escolher ano</option>
        </select>
        {period === 'pickmonth' && <input type="month" value={month} onChange={e => setMonth(e.target.value)} aria-label="Mês" />}
        {period === 'pickyear' && <input type="number" min="2000" max="2100" value={year} onChange={e => setYear(e.target.value)} aria-label="Ano" />}
        <div className="grow" />
        <ExpandableSearch value={search} onChange={setSearch} placeholder="Buscar no título ou no texto" width={300} />
      </div>
      {view === 'grid' ? (
        <div className="ngrid">
          {list.map(n => {
            const it = items.find(i => i.newsId === n.id);
            return (
              <article key={n.id} className="ncard glass">
                <button className="ncover" onClick={() => open(n)} style={n.thumb ? { backgroundImage: `url("${img(n.thumb)}")` } : undefined} aria-label={'Ler: ' + n.title}>
                  {it && <Status st={it.status} />}
                </button>
                <div className="nbody">
                  <div className="meta">{[new Date(n.date).toLocaleDateString('pt-BR'), n.category].filter(Boolean).join('  |  ')}</div>
                  <h4><button className="linklike" onClick={() => open(n)}>{n.title}</button></h4>
                  <button className={it ? 'ghost' : ''} onClick={() => send(n)}>{labelFor(n)}</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
      <div className="newslist">
        {list.map(n => {
          const d = new Date(n.date), lab = cap1(d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
          const head = lab !== last ? (last = lab, <h4 key={'m' + lab} className="month">{lab}</h4>) : null;
          const it = items.find(i => i.newsId === n.id);
          return (
            <div key={n.id} className="nwrap">{head}
              <div className="news">
                <button className="nthumb" onClick={() => open(n)} style={n.thumb ? { backgroundImage: `url("${img(n.thumb)}")` } : undefined} aria-label="Ler matéria" />
                <div className="body">
                  <div className="meta">{[d.toLocaleDateString('pt-BR'), n.category, it ? STATUS[it.status] : ''].filter(Boolean).join('  |  ')}</div>
                  <h4><button className="linklike" onClick={() => open(n)}>{n.title}</button></h4>
                  <div className="snip">{n.excerpt || (n.text || '').slice(0, 220)}</div>
                  <div className="acts"><button className={it ? 'ghost' : ''} onClick={() => send(n)}>{labelFor(n)}</button></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>)}
      <div className="hint">{msg}</div>
      <div className="center">{page < pages && !loading && <button className="ghost glass" onClick={() => load(false, applied, page + 1)}>Carregar mais</button>}{loading && list.length > 0 && <Spin />}</div>
    </>
  );
}
