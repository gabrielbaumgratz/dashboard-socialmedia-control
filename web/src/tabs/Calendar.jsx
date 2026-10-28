import { createContext, useContext, useEffect, useState } from 'react';
import { hiresSet } from '../art.js';
import { downloadSet } from '../PostView.jsx';
import { fullCaption } from '../util.js';
import { api } from '../api.js';
import { useApp, vt } from '../store.jsx';
import { Cover, ExpandableSearch, PageHead, Seg, usePref, askChoice } from '../ui.jsx';
import { STATUS, TYPE, cap1, dayKey, itemDate, mondayOf, pad, slotsList, suggestWhen, typeOf } from '../util.js';

const drag = it => e => e.dataTransfer.setData('text/plain', it.id);
const MenuCtx = createContext(() => {});
// clique direito ou botão ⋯ no card
const useMenu = it => { const open = useContext(MenuCtx); const fn = e => { e.preventDefault(); e.stopPropagation(); open(it, e.clientX, e.clientY); }; return { onContextMenu: fn, dots: <button className="dots" aria-label="Opções" onClick={fn}>⋯</button> }; };

function Menu({ m, close }) {
  const { openPost, setEditorId, removeItem, toast, saveItem } = useApp();
  useEffect(() => { const k = () => close(); const esc = e => e.key === 'Escape' && close(); window.addEventListener('keydown', esc); window.addEventListener('click', k); window.addEventListener('scroll', k, true); return () => { window.removeEventListener('keydown', esc); window.removeEventListener('click', k); window.removeEventListener('scroll', k, true); }; }, []);
  const it = m.it, posted = it.status === 'posted';
  const postNow = async () => {
    const dl = await askChoice('A legenda já vai pra área de transferência. Quer baixar as imagens também?', [['y', 'Baixar as imagens'], ['n', 'Não baixar']]);
    if (!dl) return;
    await navigator.clipboard.writeText(fullCaption(it)).catch(() => {});
    if (dl === 'y') downloadSet(await hiresSet(it), typeOf(it) === 'video');
    if (it.status !== 'scheduled') await saveItem(it, { status: 'scheduled', scheduledAt: it.scheduledAt || new Date().toISOString(), isNew: false }).catch(() => {});
    toast(dl === 'y' ? 'Legenda copiada e artes baixadas. Poste no Instagram e depois clique em "Já postei" na prévia.' : 'Legenda copiada. Poste no Instagram e depois clique em "Já postei" na prévia.');
  };
  const del = async () => { if (confirm('Mandar este post pra lixeira? Ele fica lá 7 dias.')) { await removeItem(it.id); toast('Foi pra lixeira (7 dias).'); } };
  return (
    <div className="ctxmenu glass" role="menu" style={{ left: Math.min(m.x, innerWidth - 200), top: Math.min(m.y, innerHeight - 190) }} onClick={e => e.stopPropagation()}>
      <button onClick={() => { close(); openPost(it.id); }}>Abrir</button>
      {!posted && <button onClick={() => { close(); setEditorId(it.id); }}>Editar arte</button>}
      {!posted && <button onClick={() => { close(); postNow(); }}>Postar agora</button>}
      <button className="del" onClick={() => { close(); del(); }}>Excluir</button>
    </div>
  );
}
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function WCard({ it, compact }) {
  const { openPost } = useApp();
  const iso = itemDate(it), d = iso ? new Date(iso) : null;
  const title = it.title || it.origTitle || 'Novo post', mn = useMenu(it);
  return (
    <div className={'wcard ' + it.status + (compact ? ' compact' : '')} title={`${title} (${STATUS[it.status]})`}
      draggable={it.status !== 'posted'} onDragStart={drag(it)} onClick={() => openPost(it.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openPost(it.id))} tabIndex={0} role="button" onContextMenu={mn.onContextMenu}>{mn.dots}
      <small>{compact ? (d ? hhmm(d) : '') : `${d ? hhmm(d) + ', ' : ''}${TYPE[typeOf(it)]}${it.status === 'draft' ? ', revisar' : ''}`}</small>
      <span>{title}</span>
    </div>
  );
}

function useDrop(onDrop) {
  const [over, setOver] = useState(false);
  return [over, {
    onDragOver: e => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: e => { e.preventDefault(); e.stopPropagation(); setOver(false); onDrop(e.dataTransfer.getData('text/plain')); }
  }];
}

function Slot({ day, time, onDropTo }) {
  const [over, h] = useDrop(id => onDropTo(id, day, time));
  return <div className={'slot' + (over ? ' over' : '')} {...h}>{time}</div>;
}

function DayCol({ d, children, onDropTo, today }) {
  const [over, h] = useDrop(id => onDropTo(id, d));
  return (
    <div className={'wday' + (today ? ' today' : '') + (over ? ' over' : '')} {...h}>
      <div className="dh">{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}<span>{pad(d.getDate())}/{pad(d.getMonth() + 1)}</span></div>
      {children}
    </div>
  );
}

function MonthCell({ d, out, today, children, onDropTo }) {
  const [over, h] = useDrop(id => onDropTo(id, d));
  return <div className={'mday' + (out ? ' out' : '') + (today ? ' today' : '') + (over ? ' over' : '')} {...h}><span className="n">{d.getDate()}</span>{children}</div>;
}

function KCard({ it }) {
  const { openPost } = useApp();
  const iso = itemDate(it), mn = useMenu(it);
  return (
    <div className="kcard" draggable onDragStart={drag(it)} onClick={() => openPost(it.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openPost(it.id))} tabIndex={0} role="button" onContextMenu={mn.onContextMenu}>{mn.dots}
      <div className="kt"><Cover it={it} /></div>
      <div><b>{it.title || it.origTitle || 'Novo post'}</b>
        <small>{TYPE[typeOf(it)]}{iso ? ', ' + new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ', sem data'}</small></div>
    </div>
  );
}

function KCol({ st, name, list, onMove }) {
  const [over, h] = useDrop(id => onMove(id, st));
  return (
    <div className={'kcol' + (over ? ' over' : '')} {...h}>
      <header><i className={'dot ' + st} />{name}<span className="n">{list.length}</span></header>
      {list.map(it => <KCard key={it.id} it={it} />)}
      {!list.length && <p className="hint center">Nada aqui.</p>}
    </div>
  );
}

export default function Calendar() {
  const { items, cfg, saveItem, replace, byId, createItem, toast } = useApp();
  const [view, setView] = usePref('cal-view', 'week');
  const [wf, setWf] = useState({ draft: true, scheduled: true, posted: true });
  const [menu, setMenu] = useState(null);
  const [kType, setKType] = usePref('kan-type', 'all'), [kQ, setKQ] = useState(''), [kCat, setKCat] = usePref('kan-cat', '');
  const [weekStart, setWeekStart] = usePref('cal-week', mondayOf(new Date()));
  const [month, setMonth] = usePref('cal-month', (() => { const d = new Date(); d.setDate(1); return d; })());
  const slots = slotsList(cfg), todayK = dayKey(new Date());
  const shown = it => wf[it.status];

  async function dropTo(id, day, time) {
    const it = byId(id); if (!it || it.status === 'posted') return;
    const old = it.scheduledAt ? new Date(it.scheduledAt) : null;
    const [h, m] = time ? time.split(':').map(Number) : (old ? [old.getHours(), old.getMinutes()] : (slots[0] || '12:00').split(':').map(Number));
    const nd = new Date(day); nd.setHours(h, m, 0, 0);
    try { await saveItem(it, { scheduledAt: nd.toISOString() }); } catch (e) { toast(e.message, true); }
  }
  async function moveStatus(id, st) {
    const it = byId(id); if (!it || it.status === st) return;
    if (it.status === 'posted') return toast('Post já publicado não volta de status.', true);
    try {
      if (st === 'posted') {
        const what = await askChoice('O que você postou? Os arquivos gerados serão apagados.', [['feed', 'Post'], ['story', 'Story'], ['both', 'Ambos']]);
        if (!what) return;
        replace(await api(`/api/items/${id}/posted`, { method: 'POST', body: { what } }));
      } else await saveItem(it, { status: st, scheduledAt: st === 'scheduled' ? (it.scheduledAt || suggestWhen(items, cfg)) : it.scheduledAt });
    } catch (err) { toast(err.message, true); }
  }
  const step = n => vt(() => { if (view === 'month') setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1)); else setWeekStart(w => { const x = new Date(w); x.setDate(x.getDate() + 7 * n); return x; }); });
  const today = () => vt(() => { setWeekStart(mondayOf(new Date())); const d = new Date(); d.setDate(1); setMonth(d); });

  const we = new Date(weekStart); we.setDate(weekStart.getDate() + 6);
  const label = view === 'kan' ? 'Quadro' : view === 'month' ? cap1(month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
    : `Semana de ${weekStart.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} a ${we.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <MenuCtx.Provider value={(it, x, y) => setMenu({ it, x, y })}>
    {menu && <Menu m={menu} close={() => setMenu(null)} />}
    <>
      <PageHead title={label}>
        <Seg value={view} onChange={v => vt(() => setView(v))} options={[['month', 'Mês'], ['week', 'Semana'], ['kan', 'Quadro']]} />
        {view !== 'kan' && <span className="inline">
          <button className="ghost glass" onClick={() => step(-1)} aria-label="Anterior">&larr;</button>
          <button className="ghost glass" onClick={today}>Hoje</button>
          <button className="ghost glass" onClick={() => step(1)} aria-label="Próximo">&rarr;</button>
        </span>}
        <button onClick={createItem}>+ Novo post</button>
      </PageHead>
      <div className="legend">
        {[['draft', 'Rascunho'], ['scheduled', 'Programado'], ['posted', 'Postado']].map(([st, n]) => (
          <button key={st} className={'chip glass' + (wf[st] ? ' on' : '')} aria-pressed={wf[st]} onClick={() => setWf(f => ({ ...f, [st]: !f[st] }))}><i className={'dot ' + st} />{n}</button>
        ))}
      </div>

      {view === 'kan' && <div className="kanfilter">
        <Seg value={kType} onChange={setKType} options={[['all', 'Todos'], ['post', 'Post'], ['carrossel', 'Carrossel'], ['video', 'Reel']]} />
        <select value={kCat} onChange={e => setKCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {[...new Set(items.map(i => i.category).filter(Boolean))].sort().map(c => <option key={c}>{c}</option>)}
        </select>
        <div className="grow" />
        <ExpandableSearch value={kQ} onChange={setKQ} placeholder="Buscar título" />
      </div>}
      {view === 'kan' && (() => {
        const q = kQ.trim().toLowerCase();
        const pass = i => (kType === 'all' || typeOf(i) === kType) && (!kCat || i.category === kCat) && (!q || ((i.title || '') + ' ' + (i.origTitle || '')).toLowerCase().includes(q));
        const cols = [['draft', 'Rascunho'], ['scheduled', 'Programado'], ['posted', 'Postado']].filter(([st]) => wf[st]);
        return <div className="kanban" style={{ gridTemplateColumns: `repeat(${Math.max(cols.length, 1)}, minmax(0,1fr))` }}>
          {cols.map(([st, name]) => {
            let list = items.filter(i => i.status === st && pass(i)).sort((x, y) => String(itemDate(x) || x.createdAt).localeCompare(String(itemDate(y) || y.createdAt)));
            if (st === 'posted') list = list.reverse().slice(0, 30); // shortcut: só os 30 últimos postados, o Histórico mostra todos
            return <KCol key={st} st={st} name={name} list={list} onMove={moveStatus} />;
          })}
        </div>;
      })()}

      {view === 'month' && (() => {
        const start = mondayOf(month), by = {};
        for (const it of items) { const iso = itemDate(it); if (iso && shown(it)) (by[dayKey(new Date(iso))] ||= []).push(it); }
        const cells = [];
        for (let i = 0; i < 42; i++) {
          const d = new Date(start); d.setDate(start.getDate() + i);
          if (i === 35 && d.getMonth() !== month.getMonth()) break;
          cells.push(<MonthCell key={i} d={d} out={d.getMonth() !== month.getMonth()} today={dayKey(d) === todayK} onDropTo={dropTo}>
            {(by[dayKey(d)] || []).sort((x, y) => itemDate(x).localeCompare(itemDate(y))).map(it => <WCard key={it.id} it={it} compact />)}
          </MonthCell>);
        }
        return <><div className="monthgrid">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => <div key={d} className="dow">{d}</div>)}{cells}</div></>;
      })()}

      {view === 'week' && <>
        <div className="unsched"><b>Sem data:</b>
          {wf.draft && items.filter(i => i.status === 'draft' && !i.scheduledAt).map(i => <WCard key={i.id} it={i} />)}
          {!(wf.draft && items.some(i => i.status === 'draft' && !i.scheduledAt)) && <span className="hint">nada</span>}
        </div>
        <div className="weekgrid">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
            const k = dayKey(d);
            const mine = items.filter(it => shown(it) && itemDate(it) && dayKey(new Date(itemDate(it))) === k);
            const entries = [...mine.map(it => ({ t: new Date(itemDate(it)), it })), ...slots.map(s => { const x = new Date(d); const [h, m] = s.split(':'); x.setHours(+h, +m); return { t: x, slot: s }; })]
              .sort((a, b) => a.t - b.t || (a.slot ? -1 : 1));
            return <DayCol key={k} d={d} today={k === todayK} onDropTo={dropTo}>
              {entries.map(e => e.slot ? <Slot key={'s' + e.slot} day={d} time={e.slot} onDropTo={dropTo} /> : <WCard key={e.it.id} it={e.it} />)}
            </DayCol>;
          })}
        </div>
      </>}
    </>
    </MenuCtx.Provider>
  );
}
