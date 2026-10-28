import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from './api.js';
import { useApp, vt } from './store.jsx';
import { IgPost, ReelPhone, StoryPhone, useSet, WhenNote } from './previews.jsx';
import { DateTime, Seg, Spin, Status, askChoice } from './ui.jsx';
import { Icon } from './icons.jsx';
import { exportReel, exportSet, hiresSet } from './art.js';
import { prepareExport } from './publish.js';
import { STYLE, fmtTags, fullCaption, parseTags, suggestWhen, toLocalInput, typeOf } from './util.js';

// baixa as artes já renderizadas (sem salvar nada no servidor)
export function downloadSet(set, video) {
  const files = video ? [set.story] : [...set.slides, set.story];
  files.forEach((f, i) => setTimeout(() => { const a = document.createElement('a'); a.href = f.dataUrl; a.download = f.name || `arte-${i + 1}.png`; a.click(); }, i * 250));
}

export default function PostView() {
  const { postId, postMode, setPostId, byId, items, cfg, saveItem, replace, trashItem, toast, setEditorId } = useApp();
  const it = byId(postId);
  const video = it && typeOf(it) === 'video', posted = it && it.status === 'posted';
  const [mode, setMode] = useState('feed'), [guides, setGuides] = useState(false);
  const [when, setWhen] = useState(''), [url, setUrl] = useState(''), [busy, setBusy] = useState(false);
  const [fmt, setFmt] = useState('png'), [exp, setExp] = useState(false);
  const [caption, setCaption] = useState(''), [tags, setTags] = useState(''), [ready, setReady] = useState(false);
  const set = useSet(it || {}, !!it);
  const close = () => vt(() => setPostId(null));
  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    if (!it) return;
    setMode(postMode || (video ? 'reel' : 'feed'));
    setWhen(toLocalInput(it.scheduledAt || (posted ? it.postedAt : suggestWhen(items, cfg))));
    setUrl(it.postUrl || ''); setCaption(it.caption || ''); setTags(fmtTags(it.hashtags)); setReady(false);
    setTimeout(() => setReady(true), 0);
  }, [postId, it && it.variations]);
  useEffect(() => { const k = e => { if (e.key === 'Escape' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) close(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
  // legenda e hashtags salvam sozinhas
  const latest = useRef(it); latest.current = it;
  useEffect(() => {
    if (!ready || !it) return;
    const t = setTimeout(() => saveItem(latest.current, { caption, hashtags: parseTags(tags) }).catch(e => toast(e.message, true)), 600);
    return () => clearTimeout(t);
  }, [caption, tags]);
  if (!it) return null;

  const modes = video ? [['reel', 'Reel'], ['story', 'Story']] : [['feed', typeOf(it) === 'carrossel' ? 'Carrossel' : 'Post'], ['story', 'Story']];
  const vars = it.variations || [];
  const live = { ...it, caption, hashtags: parseTags(tags) };
  const ig = !!cfg.igReady;
  const prep = async () => replace(await prepareExport(live, cfg.cloud, s => toast(s)));
  const schedule = async () => {
    if (!when) return toast('Escolha data e hora.', true);
    setBusy(true);
    try {
      if (ig) await prep(); // a arte final é gerada agora; na hora marcada o servidor só publica
      await saveItem(it, { caption, hashtags: parseTags(tags), status: 'scheduled', scheduledAt: new Date(when).toISOString(), isNew: false, resetPublish: true });
      toast(ig ? 'Programado. Posta sozinho no horário.' : it.status === 'scheduled' ? 'Horário salvo.' : 'Programado.');
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const postNow = async () => {
    if (ig) {
      if (!confirm(`Publicar agora no Instagram (${cfg.instagram || 'sua conta'})?`)) return;
      setBusy(true);
      try {
        await prep();
        await saveItem(it, { caption, hashtags: parseTags(tags), status: 'scheduled', scheduledAt: new Date().toISOString(), isNew: false, resetPublish: true });
        toast('Publicando…');
        const r = await api('/api/publish/run', { method: 'POST', body: { id: it.id } }); if (r.item) replace(r.item);
        const x = (r.result || [])[0] || {};
        toast(x.ok ? 'Publicado no Instagram.' : x.waiting ? 'O Instagram está processando o vídeo. Sai sozinho em alguns minutos.' : x.error || 'Não consegui publicar.', !!x.error);
      } catch (e) { toast(e.message, true); }
      setBusy(false); return;
    }
    if (!set) return;
    const dl = await askChoice(video ? 'A legenda já vai pra área de transferência. Quer baixar o vídeo em 4K e o story também?' : 'A legenda já vai pra área de transferência. Quer baixar as imagens também?', [['y', video ? 'Baixar vídeo 4K e story' : 'Baixar as imagens'], ['n', 'Não baixar']]); // sem API: pergunta se baixa as artes junto
    if (!dl) return;
    await copyPost(dl === 'y');
  };
  const copyPost = async dl => {
    await navigator.clipboard.writeText(fullCaption(live)).catch(() => {});
    if (dl) {
      downloadSet(await hiresSet(live), video);
      if (video && it.videoUrl) await doReel();
    }
    if (it.status !== 'scheduled') await saveItem(it, { caption, hashtags: parseTags(tags), status: 'scheduled', scheduledAt: it.scheduledAt || new Date().toISOString(), isNew: false }).catch(() => {});
    toast(dl ? 'Legenda copiada e arquivos em 4K baixados. Poste no Instagram e depois clique em "Já postei".' : 'Legenda copiada. Poste no Instagram e depois clique em "Já postei".');
  };
  const markPosted = async () => {
    const what = await askChoice('O que você postou? Os arquivos enviados serão apagados.', [['feed', 'Post'], ['story', 'Story'], ['both', 'Ambos']]);
    if (!what) return;
    try {
      const s = await api(`/api/items/${it.id}/posted`, { method: 'POST', body: { postUrl: url.trim(), what } }); replace(s);
      const bad = s.sheetSync && !s.sheetSync.ok && !s.sheetSync.skipped;
      toast(bad ? 'Postado, mas a planilha deu erro: ' + s.sheetSync.msg : 'Marcado como postado.', bad);
    } catch (e) { toast(e.message, true); }
  };
  const regen = async () => {
    setBusy(true);
    try { replace(await api(`/api/items/${it.id}/ai`, { method: 'POST' })); toast('Legendas novas.'); } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const doReel = async () => {
    setExp(true); toast('Baixando vídeo...');
    try { const { blob, ext } = await exportReel(live, () => {}, 1); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `reel.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Vídeo baixado.'); }
    catch (e) { toast(e.message, true); }
    setExp(false);
  };
  const doExport = async () => {
    setExp(true);
    try { const files = await exportSet(live, fmt, 2); downloadSet({ slides: files.slice(0, -1), story: files[files.length - 1] }, video); toast(`Exportado em 4K (${fmt.toUpperCase()}).`); }
    catch (e) { toast(e.message, true); }
    setExp(false);
  };
  const discard = async () => { await trashItem(it.id); close(); };

  return (
    <div className="page post">
      <div className="pagebar glass">
        <button className="ghost" onClick={close}><Icon name="back" />Voltar</button>
        <h2>{it.title || it.origTitle || 'Novo post'}</h2>
        <Status st={it.status} />
      </div>
      <div className="pvgrid">
        <div className="pvstage">
          <Seg value={mode} onChange={setMode} options={modes} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} className="pvbody" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: .18 }}>
              {mode === 'feed' && <div className="igwrap"><IgPost it={live} cfg={cfg} set={set} /></div>}
              {mode === 'story' && <div className="storywrap">
                <StoryPhone src={set && set.story.dataUrl} zone={set && set.zone} it={it} cfg={cfg} guides={guides} />
                <label className="check"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} /> áreas seguras</label></div>}
              {mode === 'reel' && <div className="storywrap">
                <ReelPhone it={live} cfg={cfg} cover={set && set.slides[0] && set.slides[0].dataUrl} guides={guides} />
                <label className="check"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} /> interface do Instagram</label></div>}
            </motion.div>
          </AnimatePresence>
          <div className="under"><WhenNote it={it} />{it.link && <a href={it.link} target="_blank" rel="noopener noreferrer">matéria original</a>}</div>
        </div>

        <aside className="pvside">
          {!posted && <button onClick={() => vt(() => setEditorId(it.id))}><Icon name="edit" />Editar arte</button>}

          <div className="capbox">
            <div className="caphead"><b>Legenda</b>
              {!posted && <button className={'aibtn' + (vars.length ? ' ghost' : '')} onClick={regen} disabled={busy}>{busy ? <Spin /> : null}{busy ? 'Gerando…' : vars.length ? 'Gerar legendas de novo' : 'Gerar legendas com IA'}</button>}</div>
            {vars.length > 0 && !posted && <Seg value={String(it.chosen || 0)} onChange={i => { saveItem(it, { chosen: +i, caption: vars[+i].text }); setCaption(vars[+i].text); }}
              options={vars.map((v, i) => [String(i), STYLE[v.style] || `Opção ${i + 1}`])} />}
            <textarea value={caption} readOnly={posted} onChange={e => setCaption(e.target.value)} />
            <input value={tags} readOnly={posted} onChange={e => setTags(e.target.value)} aria-label="Hashtags" placeholder="#hashtags" />
            {it.aiError && <div className="aierr">IA: {it.aiError}</div>}
          </div>

          {!posted && <>
            <DateTime value={when} onChange={setWhen} />
            <div className="row2"><button onClick={schedule} disabled={busy}>{busy ? <Spin /> : null}{it.status === 'scheduled' ? 'Salvar horário' : 'Programar'}</button><button className="ghost" onClick={postNow} disabled={!set || busy}>Postar agora</button></div>
            {ig && it.publishError && <div className="aierr">Instagram: {it.publishError}{(it.publishTries || 0) >= 3 ? ' (parou de tentar; clique em Salvar horário pra tentar de novo)' : ''}</div>}
            {ig && it.status === 'scheduled' && !it.export && <div className="aierr">Arte desatualizada. Clique em Salvar horário pra exportar de novo.</div>}
            <div className="donebox">
              <input placeholder="Link do post no Instagram (opcional)" value={url} onChange={e => setUrl(e.target.value)} />
              <button className="ok" onClick={markPosted}>Já postei</button>
            </div>
            <div className="exportbox">
              {video && it.videoUrl && <button className="ghost" onClick={doReel} disabled={exp}>{exp ? <><Spin /> Baixando…</> : 'Baixar vídeo'}</button>}
              <button className="ghost" onClick={doExport} disabled={exp}>{exp ? <><Spin /> Exportando…</> : video ? 'Capa 4K' : 'Baixar 4K'}</button>
              <select value={fmt} onChange={e => setFmt(e.target.value)} aria-label="Formato"><option value="png">PNG</option><option value="jpg">JPG</option></select>
            </div>
            <button className="danger" onClick={discard}>Excluir</button>
          </>}
          {posted && <>
            <button className="ghost" onClick={async () => { await navigator.clipboard.writeText(fullCaption(it)); toast('Legenda copiada.'); }}>Copiar legenda</button>
            {it.postUrl && <a className="btn ghost" href={it.postUrl} target="_blank" rel="noopener noreferrer">Ver no Instagram</a>}
            <button className="danger" onClick={discard}>Excluir</button>
            {it.sheetSync && !it.sheetSync.ok && !it.sheetSync.skipped && <div className="aierr">Planilha: {it.sheetSync.msg}</div>}
          </>}
        </aside>
      </div>
    </div>
  );
}
