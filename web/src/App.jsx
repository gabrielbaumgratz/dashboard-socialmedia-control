import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp, weekGoal } from './store.jsx';
import { Icon } from './icons.jsx';
import Render from './render.js';
import News from './tabs/News.jsx';
import Calendar from './tabs/Calendar.jsx';
import Queue from './tabs/Queue.jsx';
import History from './tabs/History.jsx';
import Feed from './tabs/Feed.jsx';
import Settings from './tabs/Settings.jsx';
import PostView from './PostView.jsx';
import Editor from './Editor.jsx';

const NAV = [['news', 'news', 'Notícias do site'], ['week', 'cal', 'Calendário'], ['queue', 'inbox', 'Fila'], ['history', 'clock', 'Histórico'], ['feed', 'grid', 'Feed']];
const TABS = { news: News, week: Calendar, queue: Queue, history: History, feed: Feed, settings: Settings };

function Sidebar({ hide }) {
  const { tab, setTab, items, cfg } = useApp();
  const [dark, setDark] = useState(document.documentElement.dataset.theme !== 'light');
  const [logo, setLogo] = useState(false);
  useEffect(() => { Render.loadImage('/assets/logo-branco.png').then(() => setLogo(true)).catch(() => {}); }, []);
  const g = weekGoal(items, cfg), q = items.filter(i => i.status === 'draft').length;
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; try { localStorage.setItem('theme', next); } catch {}
    setDark(!dark);
  };
  return (
    <aside className={'side glass-dark'}>
      <div className="brandrow"><div className="brand">{logo ? <img src="/assets/logo-branco.png" alt="Reconstruções" /> : 'Reconstruções'}</div>
        <button className="sidetoggle" onClick={hide} aria-label="Esconder a barra lateral" title="Esconder a barra lateral"><Icon name="sidebar" /></button></div>
      <nav>
        {NAV.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            {tab === id && <motion.i layoutId="navpill" className="navpill" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <Icon name={icon} /><span>{label}</span>
            {id === 'queue' && q > 0 && <b className="badge">{q}</b>}
          </button>
        ))}
      </nav>
      <div className="sidefoot">
        <div className="goal" title="Meta da semana (segunda a domingo)">
          Meta da semana
          <div className="goalrow"><b>{g.posts}/{g.mp}</b> posts <b>{g.videos}/{g.mv}</b> reels</div>
          <div className="bar2"><i style={{ width: g.pct + '%' }} /></div>
        </div>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Icon name="gear" /><span>Configurações</span></button>
        <button onClick={flip}><Icon name={dark ? 'sun' : 'moon'} /><span>{dark ? 'Modo claro' : 'Modo escuro'}</span></button>
      </div>
    </aside>
  );
}

export default function App() {
  const { tab, ready, postId, editorId, toastMsg } = useApp();
  const [noside, setNoside] = useState(() => { try { return localStorage.getItem('noside') === '1'; } catch { return false; } });
  const side = v => { setNoside(v); try { localStorage.setItem('noside', v ? '1' : '0'); } catch {} };
  const [seen, setSeen] = useState({ news: true });
  useEffect(() => setSeen(s => (s[tab] ? s : { ...s, [tab]: true })), [tab]);
  return (
    <div className={'app' + (noside ? ' noside' : '')}>
      <div className="bg" aria-hidden="true"><i /><i /><i /></div>
      <Sidebar hide={() => side(true)} />
      {noside && <button className="sideopen glass-dark" onClick={() => side(false)} aria-label="Mostrar a barra lateral" title="Mostrar a barra lateral"><Icon name="sidebar" /></button>}
      <main>
        {!ready && <p className="hint">Carregando…</p>}
        {ready && Object.entries(TABS).map(([id, C]) => seen[id] && (
          <section key={id} className={'tab' + (tab === id ? ' active' : '')} hidden={tab !== id || !!(postId || editorId)}><C /></section>
        ))}
        {ready && editorId && <Editor key={'ed' + editorId} />}
        {ready && !editorId && postId && <PostView key={'pv' + postId} />}
      </main>
      <AnimatePresence>{toastMsg && (
        <motion.div key={toastMsg.k} className={'toast glass' + (toastMsg.err ? ' err' : '')} role="status"
          initial={{ opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}>{toastMsg.msg}{toastMsg.action && <button className="ghost tact" onClick={toastMsg.action.fn}>{toastMsg.action.label}</button>}</motion.div>
      )}</AnimatePresence>
    </div>
  );
}
