import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { ExpandableSearch, PageHead, Seg, Status, TypeTag } from '../ui.jsx';
import { dayKey, itemDate } from '../util.js';

function PostLinkCell({ it }) {
  const { saveItem, toast } = useApp();
  const [v, setV] = useState('');
  if (it.postUrl) return <a href={it.postUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Abrir post</a>;
  if (it.status !== 'posted') return '-';
  return <input aria-label="Link do post no Instagram" placeholder="colar link e Enter…" value={v} onClick={e => e.stopPropagation()} onChange={e => setV(e.target.value)}
    onKeyDown={async e => { if (e.key === 'Enter' && v.trim()) { await saveItem(it, { postUrl: v.trim() }); toast('Link salvo.'); } }} />;
}
function SheetCell({ it }) {
  const { replace, toast } = useApp();
  const s = it.sheetSync;
  if (s && s.ok) return 'Enviado';
  if (s && !s.skipped) return <button className="ghost" title={s.msg || ''} onClick={async e => {
    e.stopPropagation(); const r = await api(`/api/items/${it.id}/sheet`, { method: 'POST' }); replace(r);
    toast(r.sheetSync.ok ? 'Enviado para a planilha.' : 'Planilha: ' + r.sheetSync.msg, !r.sheetSync.ok);
  }}>Erro, reenviar</button>;
  return it.status === 'posted' ? 'Desligada' : '-';
}

export default function History() {
  const { items, trash, openPost, restoreItem, purgeItem, trashItem, toast } = useApp();
  const [st, setSt] = useState('all'), [mo, setMo] = useState(''), [q, setQ] = useState('');
  const rows = items.filter(it => (st === 'all' || it.status === st)
    && (!mo || dayKey(new Date(itemDate(it) || it.createdAt)).startsWith(mo))
    && (!q.trim() || ((it.title || '') + ' ' + (it.origTitle || '')).toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => String(itemDate(b) || b.createdAt).localeCompare(String(itemDate(a) || a.createdAt)));
  const left = d => Math.max(0, 7 - Math.floor((Date.now() - Date.parse(d)) / 864e5));
  if (st === 'trash') return (
    <>
      <PageHead title="Histórico">
        <Seg value={st} onChange={setSt} options={[['all', 'Todos'], ['posted', 'Postados'], ['scheduled', 'Programados'], ['draft', 'Rascunhos'], ['trash', `Lixeira${trash.length ? ' (' + trash.length + ')' : ''}`]]} />
      </PageHead>
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Título</th><th>Excluído em</th><th>Some em</th><th></th></tr></thead>
        <tbody>
          {!trash.length && <tr><td colSpan="4" className="hint">Lixeira vazia.</td></tr>}
          {trash.map(it => (
            <tr key={it.id}>
              <td data-l="Título" className="t">{it.title || it.origTitle || 'Novo post'}</td>
              <td>{new Date(it.deletedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>{left(it.deletedAt)} dia(s)</td>
              <td className="acts"><button className="ghost" onClick={async () => { await restoreItem(it.id); toast('Restaurado.'); }}>Restaurar</button>
                <button className="danger" onClick={async () => { if (confirm('Apagar de vez? Não dá pra desfazer.')) { await purgeItem(it.id); toast('Apagado.'); } }}>Apagar de vez</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
  return (
    <>
      <PageHead title="Histórico">
        <Seg value={st} onChange={setSt} options={[['all', 'Todos'], ['posted', 'Postados'], ['scheduled', 'Programados'], ['draft', 'Rascunhos'], ['trash', `Lixeira${trash.length ? ' (' + trash.length + ')' : ''}`]]} />
        <input type="month" className="mini glass" value={mo} onChange={e => setMo(e.target.value)} aria-label="Filtrar por mês" />
        <ExpandableSearch value={q} onChange={setQ} placeholder="Buscar título" />
      </PageHead>
      <div className="tablewrap">
        <table className="table">
          <thead><tr><th>Status</th><th>Data e hora</th><th>Tipo</th><th>Título</th><th>Post nas redes</th><th>Matéria</th><th>Planilha</th><th></th></tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan="8" className="hint">Nada nesse filtro.</td></tr>}
            {rows.map(it => {
              const iso = itemDate(it);
              return (
                <tr key={it.id} onClick={() => openPost(it.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openPost(it.id))} tabIndex={0} role="button">
                  <td data-l="Status"><Status st={it.status} /></td>
                  <td data-l="Data">{iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                  <td data-l="Tipo"><TypeTag it={it} /></td>
                  <td data-l="Título" className="t">{it.title || it.origTitle || 'Novo post'}</td>
                  <td data-l="Post"><PostLinkCell it={it} /></td>
                  <td data-l="Matéria">{it.link ? <a href={it.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Matéria</a> : '-'}</td>
                  <td data-l="Planilha"><SheetCell it={it} /></td>
                  <td data-l=""><button className="danger mini" title="Mandar pra lixeira" onClick={e => { e.stopPropagation(); trashItem(it.id); }}>Excluir</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">{rows.length} {rows.length === 1 ? 'item' : 'itens'}</p>
    </>
  );
}
