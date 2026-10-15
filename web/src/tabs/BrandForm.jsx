import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { clearCovers } from '../art.js';

const KEYS = ['instagram', 'location', 'bio', 'ctaText', 'fixedTags'];
// marca e legenda: @, localização, bio, chamada do fim da legenda e hashtags fixas (abre pela engrenagem do Feed)
export default function BrandForm({ onClose }) {
  const { cfg, loadCfg, toast } = useApp();
  const [f, setF] = useState({});
  useEffect(() => { const x = {}; KEYS.forEach(k => { x[k] = cfg[k] ?? ''; }); setF(x); }, [cfg]);
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const save = async () => {
    try { await api('/api/config', { method: 'POST', body: f }); await loadCfg(); clearCovers(); toast('Marca e legenda salvas.'); onClose && onClose(); }
    catch (e) { toast(e.message, true); }
  };
  return (
    <section className="brandform glass">
      <div className="lookhead"><h3>Marca e legenda</h3>{onClose && <button className="ghost mini" onClick={onClose}>Fechar</button>}</div>
      <div className="row2">
        <label>@ do Instagram<input value={f.instagram || ''} onChange={set('instagram')} /></label>
        <label>Localização no post<input value={f.location || ''} onChange={set('location')} /></label>
      </div>
      <label>Bio no perfil do simulador<textarea rows={3} value={f.bio || ''} onChange={set('bio')} /></label>
      <label>Chamada padrão no fim da legenda<input value={f.ctaText || ''} onChange={set('ctaText')} /></label>
      <label>Hashtags fixas da região (separe por espaço)<input value={f.fixedTags || ''} onChange={set('fixedTags')} /></label>
      <div className="row2"><button onClick={save}>Salvar</button></div>
    </section>
  );
}
