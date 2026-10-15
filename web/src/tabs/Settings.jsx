import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { PageHead } from '../ui.jsx';
import { clearCovers } from '../art.js';
import Render from '../render.js';

const KEYS = ['geminiModel', 'autoAi', 'pollMinutes', 'wpUrl', 'instagram', 'location', 'ctaText', 'fixedTags', 'slots', 'metaPosts', 'metaVideos', 'sheetsUrl', 'bio', 'igUserId'];
const Pill = ({ on, children }) => <span className={'pill ' + (on ? 'on' : 'off')}>{children}</span>;
function Section({ title, hint, pill, wide, children }) {
  return (
    <section className={'set' + (wide ? ' wide' : '')}>
      <div className="sethead"><div><h3>{title}</h3>{hint && <p className="hint">{hint}</p>}</div>{pill}</div>
      <div className="setbody">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { cfg, loadCfg, engine, refreshEngine, toast } = useApp();
  const [models, setModels] = useState([]);
  useEffect(() => { if (cfg.hasKey) api('/api/models').then(setModels).catch(() => {}); }, [cfg.hasKey]);
  const [key2, setKey2] = useState(''), [igTok, setIgTok] = useState(''), [form, setForm] = useState({}), [editKey, setEditKey] = useState(false), [key, setKey] = useState(''), [logoOk, setLogoOk] = useState(false);
  useEffect(() => { const f = {}; KEYS.forEach(k => { f[k] = cfg[k] ?? ''; }); setForm(f); }, [cfg]);
  useEffect(() => { refreshEngine(); Render.loadImage('/assets/logo-branco.png').then(() => setLogoOk(true)).catch(() => {}); }, []);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const post = async (body, msg) => {
    try { await api('/api/config', { method: 'POST', body }); await loadCfg(); clearCovers(); setEditKey(false); setKey(''); toast(msg); }
    catch (e) { toast(e.message, true); }
  };
  const save = () => { const b = { ...form }; ['pollMinutes', 'metaPosts', 'metaVideos'].forEach(k => { b[k] = +b[k]; }); post(b, 'Configurações salvas.'); };
  const showKey = cfg.hasKey && !editKey;
  return (
    <>
      <PageHead title="Configurações" />
      <div className="setlist">
        <Section title="Inteligência artificial" pill={<Pill on={cfg.hasKey}>{cfg.hasKey ? 'Conectado' : 'Sem chave'}</Pill>}>
          {showKey ? (
            <div className="keyview">
              <div className="keyrow"><span className="mask">••••••••••••</span><span className="hint">chave salva</span></div>
              <div className="row2"><button className="ghost" onClick={() => setEditKey(true)}>Trocar chave</button>
                <button className="danger" onClick={() => confirm('Remover a chave salva?') && post({ clearKey: true }, 'Chave removida.')}>Remover</button></div>
            </div>
          ) : (
            <div className="keyview">
              <label>Chave da API<input className="secret" type="text" name="gemini-key" spellCheck={false} autoCapitalize="off" autoComplete="off" data-lpignore="true" placeholder="cole a chave aqui" value={key} onChange={e => setKey(e.target.value)} /></label>
              <div className="row2"><button onClick={() => key.trim() ? post({ geminiKey: key.trim() }, 'Chave salva.') : toast('Cole a chave primeiro.', true)}>Salvar chave</button>
                {cfg.hasKey && <button className="ghost" onClick={() => { setEditKey(false); setKey(''); }}>Cancelar</button>}</div>
            </div>
          )}
          <div className="keyview">
            {cfg.hasKey2 ? <div className="keyrow"><span className="hint">Segunda chave salva (usada quando a cota da primeira acabar)</span>
                <button className="danger" onClick={() => post({ clearKey2: true }, 'Segunda chave removida.')}>Remover</button></div>
              : <><label>Segunda chave (opcional, reserva)<input className="secret" type="text" name="gemini-key-2" spellCheck={false} autoCapitalize="off" autoComplete="off" data-lpignore="true" placeholder="cole a outra chave aqui" value={key2} onChange={e => setKey2(e.target.value)} /></label>
                <div className="row2"><button className="ghost" onClick={() => key2.trim() ? post({ geminiKey2: key2.trim() }, 'Segunda chave salva.').then(() => setKey2('')) : toast('Cole a chave primeiro.', true)}>Salvar segunda chave</button></div></>}
          </div>
          <label>Modelo
            <select value={form.geminiModel === 'gemini-3.8-flash' ? '' : form.geminiModel || ''} onChange={set('geminiModel')}>
              <option value="">Automático (o Flash mais novo da sua chave)</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {!models.length && <span className="hint">{cfg.hasKey ? 'Não consegui listar os modelos agora. Recarregue a página.' : 'Salve a chave do Gemini aqui em cima pra listar os modelos da sua conta.'}</span>}</label>
          <label className="check"><input type="checkbox" checked={!!form.autoAi} onChange={set('autoAi')} /> Gerar legendas sozinho quando chegar notícia nova</label>
        </Section>

        <Section title="Postagem automática no Instagram" hint="Usa a API oficial da Meta. Precisa de conta profissional e do site na Vercel." pill={<Pill on={cfg.igReady}>{cfg.igReady ? 'Ligada' : cfg.hasIg ? 'Só na Vercel' : 'Desligada'}</Pill>}>
          <label>ID da conta do Instagram<input type="text" name="ig-user-id" inputMode="numeric" autoComplete="off" spellCheck={false} placeholder="só números" value={form.igUserId ?? ''} onChange={set('igUserId')} /></label>
          <label>Token de acesso {cfg.hasIg && <span className="hint">(salvo, cole outro só pra trocar)</span>}<input className="secret" type="text" name="ig-token" spellCheck={false} autoCapitalize="off" autoComplete="off" data-lpignore="true" placeholder="cole o token aqui" value={igTok} onChange={e => setIgTok(e.target.value)} /></label>
          <div className="row2"><button onClick={() => post({ igUserId: form.igUserId, ...(igTok.trim() ? { igToken: igTok.trim() } : {}) }, 'Instagram salvo.').then(() => setIgTok(''))}>Salvar Instagram</button>
            {cfg.hasIg && <button className="danger" onClick={() => confirm('Desligar a postagem automática?') && post({ clearIg: true }, 'Instagram desligado.')}>Desligar</button>}</div>
        </Section>

        <Section title="Motor em segundo plano" pill={<Pill on={engine.lastRun && !engine.lastError}>{engine.lastError ? 'Com erro' : engine.lastRun ? 'Ativo' : 'Iniciando'}</Pill>}>
          <label>Checar a cada (minutos, mínimo 5)<input type="number" min="5" value={form.pollMinutes ?? ''} onChange={set('pollMinutes')} /></label>
          <label>Endereço do site<input value={form.wpUrl || ''} onChange={set('wpUrl')} /></label>
        </Section>

        <Section title="Marca e legenda">
          <label>@ do Instagram<input value={form.instagram || ''} onChange={set('instagram')} /></label>
          <label>Localização no post<input value={form.location || ''} onChange={set('location')} /></label>
          <label>Bio no perfil do simulador<textarea rows={3} value={form.bio || ''} onChange={set('bio')} /></label>
          <label>Chamada padrão no fim da legenda<input value={form.ctaText || ''} onChange={set('ctaText')} /></label>
          <label>Hashtags fixas da região (separe por espaço)<input value={form.fixedTags || ''} onChange={set('fixedTags')} /></label>
        </Section>

        <Section title="Horários e metas">
          <label>Horários preferidos (ex.: 11:30, 18:00)<input placeholder="11:30, 18:00" value={form.slots || ''} onChange={set('slots')} /></label>
          <div className="row2">
            <label>Meta de posts / semana<input type="number" min="0" value={form.metaPosts ?? ''} onChange={set('metaPosts')} /></label>
            <label>Meta de reels / semana<input type="number" min="0" value={form.metaVideos ?? ''} onChange={set('metaVideos')} /></label>
          </div>
        </Section>

        <Section wide title="Planilha da cliente (Google Sheets)" hint='Cada post vira uma linha na aba Posts (rascunho, programado, postado), com filtro por dia, semana e mês, e a aba Painel soma tudo.' pill={<Pill on={!!cfg.sheetsUrl}>{cfg.sheetsUrl ? 'Ligada' : 'Desligada'}</Pill>}>
          <ol className="steps">
            <li>Abra a planilha compartilhada, vá em <b>Extensões &gt; Apps Script</b>.</li>
            <li>Apague o que tiver lá e cole o código de <a href="/apps-script.gs" target="_blank">apps-script.gs</a> (também está na pasta <code>planilha</code>).</li>
            <li>Clique em <b>Implantar &gt; Nova implantação &gt; App da Web</b>, executar como você, acesso "Qualquer pessoa", e autorize.</li>
            <li>Copie a URL do App da Web e cole aqui embaixo.</li>
          </ol>
          <label>URL do App da Web<input placeholder="https://script.google.com/macros/s/.../exec" value={form.sheetsUrl || ''} onChange={set('sheetsUrl')} /></label>
        </Section>
      </div>
      <div className="center"><button onClick={save}>Salvar configurações</button></div>
    </>
  );
}
