import { useCallback, useEffect, useState } from 'react';
import { getApproval, sendApproval } from './approval.js';
import { useApp } from './store.jsx';
import { Spin } from './ui.jsx';

const ST = { pendente: ['Aguardando a cliente', 'var(--mut)'], aprovado: ['Aprovado pela cliente', 'var(--ok)'], mudancas: ['Cliente pediu mudanças', 'var(--danger)'] };

// bloco da prévia: manda a arte para o calendário da cliente e mostra o que ela respondeu
export default function Approval({ it, live, setCaption }) {
  const { saveItem, toast } = useApp();
  const [ap, setAp] = useState(undefined), [busy, setBusy] = useState(false);
  const load = useCallback(() => getApproval(it.id).then(setAp).catch(() => {}), [it.id]);
  useEffect(() => { setAp(undefined); load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const send = async () => {
    setBusy(true);
    try { setAp(await sendApproval(live, s => toast(s))); toast('Enviado. Ela já vê no calendário.'); }
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
      {ap === undefined && <div className="meta"><Spin /> Verificando…</div>}
      {ap && ap.comentario && <p className="apcom">“{ap.comentario}”</p>}
      {sugs.map(([nome, v, , patch]) => (
        <div className="apsug" key={nome}><div><small>{nome} sugerido</small><p>{v}</p></div><button className="ghost" onClick={() => apply(patch, nome + ' atualizado.')}>Aplicar</button></div>
      ))}
      {leg && (
        <div className="apsug"><div><small>Legenda que ela escreveu</small><p>{leg}</p></div>
          <div className="apbtns"><button className="ghost" onClick={() => { setCaption(leg); toast('Legenda dela aplicada.'); }}>Usar</button><button className="ghost" onClick={() => copy(leg)}>Copiar</button></div></div>
      )}
      <button onClick={send} disabled={busy || ap === undefined}>{busy ? <><Spin /> Enviando…</> : ap ? 'Reenviar para aprovação' : 'Enviar para aprovação'}</button>
    </div>
  );
}
