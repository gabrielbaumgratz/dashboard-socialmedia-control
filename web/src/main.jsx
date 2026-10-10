import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { AppProvider } from './store.jsx';
import App from './App.jsx';
import './styles.css';
import { initGlass } from './glass.js';
initGlass();

function Login({ configured, onOk }) {
  const [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/api/login', { method: 'POST', body: { password: pw } }); onOk(); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <><div className="bg" aria-hidden="true"><i /><i /><i /></div>
    <form className="login glass" onSubmit={go}>
      <img src="/assets/logo-branco.png" alt="Reconstruções" />
      <h2>Entrar</h2>
      {!configured && <p className="warn">Falta definir a variável APP_PASSWORD na Vercel.</p>}
      <label>Senha<input className="secret" type="text" name="dash-pass" autoComplete="off" autoFocus value={pw} onChange={e => setPw(e.target.value)} /></label>
      <p className="warn" aria-live="polite" hidden={!err}>{err}</p>
      <button disabled={busy || !pw}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form></>
  );
}

function Gate() {
  const [s, setS] = useState(null);
  const check = () => api('/api/session').then(setS).catch(() => setS({ auth: false, configured: true }));
  useEffect(() => { check(); }, []);
  if (!s) return null;
  return s.auth ? <AppProvider><App /></AppProvider> : <Login configured={s.configured} onOk={check} />;
}

createRoot(document.getElementById('root')).render(<Gate />);

// Chrome preenchia o e-mail nos campos; força autocomplete desligado em tudo
const off = r => r.querySelectorAll?.('input:not([autocomplete]),textarea:not([autocomplete])').forEach(el => el.setAttribute('autocomplete', 'off'));
off(document);
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && (n.matches?.('input,textarea') ? n.setAttribute('autocomplete', 'off') : off(n)))))
  .observe(document.body, { childList: true, subtree: true });
