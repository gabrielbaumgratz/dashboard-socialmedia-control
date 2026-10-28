import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { hiresSet } from '../art.js';
import { downloadSet } from '../PostView.jsx';
import { useApp, vt } from '../store.jsx';
import { Cover, PageHead, Seg, Status, TypeTag, Empty, Spin, usePref , DateTime , ViewToggle, askChoice } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { STYLE, cap1, fmtTags, parseTags, sortKey, suggestWhen, toLocalInput, typeOf } from '../util.js';

function QueueRow({ it }) {
  const { items, cfg, saveItem, trashItem, replace, toast, openPost, setEditorId } = useApp();
  const [caption, setCaption] = useState(it.caption || '');
  const [tags, setTags] = useState(fmtTags(it.hashtags));
  const [chosen, setChosen] = useState(it.chosen || 0);
  const [vars, setVars] = useState(it.variations || []);
  const [when, setWhen] = useState(toLocalInput(it.scheduledAt || suggestWhen(items, cfg)));
  const [busy, setBusy] = useState(false);
  const first = useRef(true), latest = useRef({});
  latest.current = { caption, tags, chosen, vars, when };

  // quando a IA gera de novo, o item muda por fora: recarrega os campos
  useEffect(() => { setCaption(it.caption || ''); setTags(fmtTags(it.hashtags)); setChosen(it.chosen || 0); setVars(it.variations || []); }, [it.variations, it.aiError]);

  const patch = () => {
    const l = latest.current;
    return { caption: l.caption, hashtags: parseTags(l.tags), chosen: l.chosen, variations: l.vars, scheduledAt: l.when ? new Date(l.when).toISOString() : null };
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => saveItem(it, patch()).catch(e => toast(e.message, true)), 600);
    return () => clearTimeout(t);
  }, [caption, tags, chosen, when]);

  const pick = i => { setChosen(i); setCaption(vars[i].text); };
  const edit = v => { setCaption(v); setVars(list => list.map((x, i) => (i === chosen ? { ...x, text: v } : x))); };
  const approve = async () => {
    if (!when) return toast('Escolha data e hora.', true);
    if (!caption.trim()) return toast('A legenda está vazia.', true);
    const was = it.status;
    try { await saveItem(it, { ...patch(), status: 'scheduled', isNew: false }); toast(was === 'scheduled' ? 'Horário salvo.' : 'Programado.'); }
    catch (e) { toast(e.message, true); }
  };
  const regen = async () => {
    setBusy(true);
    try { replace(await api(`/api/items/${it.id}/ai`, { method: 'POST' })); toast('3 legendas prontas.'); }
    catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const del = () => trashItem(it.id);
  const postNow = async () => {
    const dl = await askChoice('A legenda já vai pra área de transferência. Quer baixar as imagens também?', [['y', 'Baixar as imagens'], ['n', 'Não baixar']]);
    if (!dl) return;
    await navigator.clipboard.writeText(caption + (tags ? '\n\n' + tags : '')).catch(() => {});
    if (dl === 'y') downloadSet(await hiresSet(it), typeOf(it) === 'video');
    if (it.status !== 'scheduled') await saveItem(it, { ...patch(), status: 'scheduled', scheduledAt: it.scheduledAt || new Date().toISOString(), isNew: false }).catch(() => {}); // vai pra Programados até clicar em Já postei
    toast(dl === 'y' ? 'Legenda copiada e artes baixadas. Poste no Instagram e depois clique em "Já postei" na prévia.' : 'Legenda copiada. Poste no Instagram e depois clique em "Já postei" na prévia.');
  };
  const t = typeOf(it);
  return (
    <article className="qrow" data-id={it.id}>
      <div className="qart">
        <div className="thumbwrap"><button className="thumb" onClick={() => openPost(it.id)} aria-label="Ver como fica no Instagram">
          <Cover it={it} />
          {t === 'video' && <Icon name="play" className="playbadge" />}
        </button>
        <span className="thumbacts"><button type="button" onClick={() => setEditorId(it.id)} title="Editar arte" aria-label="Editar arte"><Icon name="edit" /></button><button type="button" className="del" onClick={() => trashItem(it.id)} title="Excluir" aria-label="Excluir"><Icon name="trash" /></button></span></div>
        {it.link && <a className="srclink" href={it.link} target="_blank" rel="noopener noreferrer">matéria original</a>}
      </div>
      <div className="qmain">
        <div className="inline"><Status st={it.status} />
          <span className="meta">{[it.newsDate ? new Date(it.newsDate).toLocaleDateString('pt-BR') : '', it.category, it.isNew ? 'nova do site' : ''].filter(Boolean).join('  |  ')}</span></div>
        <h3>{it.origTitle || it.title || 'Novo post'}</h3>
        {vars.length > 0 && (
          <div className="vars" role="radiogroup" aria-label="Opções de legenda">
            {vars.map((v, i) => (
              <button key={i} role="radio" aria-checked={i === chosen} className={'var' + (i === chosen ? ' on' : '')} onClick={() => pick(i)}>
                <b>{STYLE[v.style] || `Opção ${i + 1}`}</b><p>{v.text}</p>
              </button>
            ))}
          </div>
        )}
        {it.aiError && <div className="aierr">IA: {it.aiError}</div>}
        <label>Legenda<textarea value={caption} onChange={e => edit(e.target.value)} /></label>
        <label>Hashtags<input value={tags} onChange={e => setTags(e.target.value)} /></label>
      </div>
      <div className="qside">
        <DateTime value={when} onChange={setWhen} />
        <div className="row2"><button onClick={approve}>{it.status === 'scheduled' ? 'Salvar horário' : 'Programar'}</button><button className="ghost" onClick={postNow}>Postar agora</button></div>
        <button className="ghost" onClick={regen} disabled={busy}>{busy ? <><Spin /> Gerando…</> : vars.length ? 'Gerar legendas de novo' : 'Gerar legendas com IA'}</button>
        <button className="danger" onClick={del}>Excluir</button>
      </div>
    </article>
  );
}


function QueueCard({ it }) {
  const { openPost, setEditorId, trashItem } = useApp();
  const t = typeOf(it);
  return (
    <article className="qcard" data-id={it.id}>
      <div className="thumbwrap"><button className="thumb" onClick={() => openPost(it.id)} aria-label="Ver como fica no Instagram">
        <Cover it={it} />
        {t === 'video' && <Icon name="play" className="playbadge" />}
      </button>
      <span className="thumbacts"><button type="button" onClick={() => setEditorId(it.id)} title="Editar arte" aria-label="Editar arte"><Icon name="edit" /></button><button type="button" className="del" onClick={() => trashItem(it.id)} title="Excluir" aria-label="Excluir"><Icon name="trash" /></button></span></div>
      <div className="inline"><Status st={it.status} /></div>
      <h4>{it.origTitle || it.title || 'Novo post'}</h4>
      <span className="meta">{it.scheduledAt ? new Date(it.scheduledAt).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sem data ainda'}</span>
    </article>
  );
}

export default function Queue() {
  const [view, setView] = usePref('queue-view', 'grid');
  const { items, banner, setBanner, createItem } = useApp();
  const list = items.filter(i => i.status !== 'posted')
    .sort((x, y) => (x.scheduledAt ? 0 : 1) - (y.scheduledAt ? 0 : 1) || sortKey(x).localeCompare(sortKey(y)));
  let last = null;
  return (
    <>
      <PageHead title="Fila">
        <ViewToggle value={view} onChange={setView} />
        <button onClick={createItem}>+ Novo post</button>
      </PageHead>
      {banner > 0 && <div className="banner glass"><span>{banner} notícia(s) nova(s) chegaram na fila.</span><button className="ghost" onClick={() => setBanner(0)}>Ok</button></div>}
      {!list.length && <Empty>Nada na fila. Quando sair notícia nova no site, ela aparece aqui. Você também pode mandar uma pela aba "Notícias do site".</Empty>}
      {view === 'grid' ? <div className="qgrid">{list.map(it => <QueueCard key={it.id} it={it} />)}</div> :
      <div className="queue">
        {list.map(it => {
          const rl = it.scheduledAt ? cap1(new Date(it.scheduledAt).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })) : 'Sem data ainda';
          const head = rl !== last ? (last = rl, <h4 key={'h' + rl} className="qday">{rl}</h4>) : null;
          return <div key={it.id} className="qwrap">{head}<QueueRow it={it} /></div>;
        })}
      </div>}
    </>
  );
}
