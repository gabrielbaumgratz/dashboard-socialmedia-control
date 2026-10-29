import { useCallback, useEffect, useRef, useState } from 'react';
import { getApproval, removeApproval, sendApproval } from './approval.js';
import { useApp } from './store.jsx';
import { Spin } from './ui.jsx';

const ST = { pendente: ['Aguardando a cliente', 'var(--mut)'], aprovado: ['Aprovado pela cliente', 'var(--ok)'], mudancas: ['Cliente pediu mudanças', 'var(--danger)'] };

// bloco da prévia: manda a arte para o calendário da cliente e mostra o que ela respondeu
export default function Approval({ it, live, setCaption }) {
  const { saveItem, toast } = useApp();
  const [ap, setAp] = useState(undefined), [busy, setBusy] = useState(false), [sending, setSending] = useState(false), ctl = useRef({}), parou = useRef(false);
  const [err, setErr] = useState('');
  const load = useCallback(() => getApproval(it.id).then(a => { if (parou.current) return; setErr(''); setAp(a); }).catch(e => { setErr(e.message); setAp(cur => cur === undefined ? null : cur); }), [it.id]);
  useEffect(() => { setAp(undefined); load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const send = async () => {
    setBusy(true);
    ctl.current = {}; setSending(true);
    try { setAp(await sendApproval(live, s => toast(s), ctl.current)); toast('Enviado. Ela já vê no calendário.'); }
    catch (e) { toast(e.message, true); }
    setSending(false); setBusy(false);
  };
  const remove = async () => {
    if (!confirm('Cancelar o pedido de aprovação? Ele some do calendário da cliente.')) return;
    setBusy(true);
    try { await removeApproval(it.id); setAp(null); toast('Pedido de aprovação cancelado.'); }
    catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const apply = (patch, msg) => saveItem(it, patch).then(() => { toast(msg); load(); }).catch(e => toast(e.message, true));
  const copy = t => navigator.clipboard.writeText(t).then(() => toast('Copiado.'), () => toast('Não deu para copiar.', true));

  const sugs = ap ? [['Título', ap.sugTitulo, ap.titulo, { title: ap.sugTitulo }], ['Categoria', ap.sugCategoria, ap.categoria, { category: ap.sugCategoria }], ['Descrição', ap.sugDescricao, ap.descricao, { description: ap.sugDescricao }]]
    .filter(([, v, atual]) => v && v !== atual) : [];
  const leg = ap && ap.legendaCliente && ap.legendaCliente !== live.caption ? ap.legendaCliente : '';
  const [label, cor] = ap ? ST[ap.status] || ST.pendente : [];

  return (
    <div className="capbox apbox">
      <div className="caphead"><b>Aprovação da cliente</b>
        {ap && <span className="apst" style={{ color: cor }}>● {label}</span>}</div>
      {ap === undefined && <div className="meta"><Spin /> Verificando… <button className="ghost" onClick={() => { parou.current = true; setAp(null); }}>Cancelar</button></div>}
      {err && <div className="aierr">Não consegui verificar: {err} <button className="ghost" onClick={load}>Tentar de novo</button></div>}
      {ap && ap.respondidoPor && <div className="meta">Resposta de {ap.respondidoPor.split('@')[0]} em {new Date(ap.respondidoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
      {ap && ap.comentario && <p className="apcom">“{ap.comentario}”</p>}
      {sugs.map(([nome, v, , patch]) => (
        <div className="apsug" key={nome}><div><small>{nome} sugerido</small><p>{v}</p></div><button className="ghost" onClick={() => apply(patch, nome + ' atualizado.')}>Aplicar</button></div>
      ))}
      {leg && (
        <div className="apsug"><div><small>Legenda que ela escreveu</small><p>{leg}</p></div>
          <div className="apbtns"><button className="ghost" onClick={() => { setCaption(leg); toast('Legenda dela aplicada.'); }}>Usar</button><button className="ghost" onClick={() => copy(leg)}>Copiar</button></div></div>
      )}
      <button onClick={send} disabled={busy || ap === undefined}>{busy ? <><Spin /> Enviando…</> : ap ? 'Reenviar para aprovação' : 'Enviar para aprovação'}</button>
      {sending && <button className="ghost" onClick={() => { ctl.current.cancelado = true; toast('Cancelando o envio…'); }}>Cancelar envio</button>}
      {(ap || err) && <button className="danger" onClick={remove} disabled={busy}>Cancelar pedido de aprovação</button>}
    </div>
  );
}
