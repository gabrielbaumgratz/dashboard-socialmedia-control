import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from './api.js';
import { typeOf, mondayOf } from './util.js';
import Render from './render.js';
import { clearCovers } from './art.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// troca de tela com transição suave quando o navegador suporta
export function vt(fn) {
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(() => flushSync(fn));
  else fn();
}

export function AppProvider({ children }) {
  const [items, setItems] = useState([]);
  const [cfg, setCfg] = useState({});
  const [ready, setReady] = useState(false);
  const [tab, setTabRaw] = useState('news');
  const [postId, setPostId] = useState(null);
  const [postMode, setPostMode] = useState('');
  const [editorId, setEditorId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [banner, setBanner] = useState(0);
  const [engine, setEngine] = useState({});
  const itemsRef = useRef(items); itemsRef.current = items;
  const toastT = useRef();

  const toast = useCallback((msg, err, action) => {
    setToastMsg({ msg, err, action, k: Date.now() });
    clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), err ? 5000 : action ? 7000 : 2600);
  }, []);
  const setTab = useCallback(t => vt(() => { setTabRaw(t); setPostId(null); setEditorId(null); window.scrollTo(0, 0); }), []);

  const loadCfg = useCallback(async () => { const c = await api('/api/config'); setCfg(c); Render.setBrand({ handle: c.instagram || '@reconstrucoes.observatorio', location: c.location || '' }); return c; }, []);
  // ids apagados ficam anotados neste navegador por 10 min: se o servidor ainda devolver o item (leitura atrasada), ele continua escondido
  const tomb = () => { try { return JSON.parse(localStorage.getItem('deleted') || '{}'); } catch { return {}; } };
  const setTomb = (id, on) => { try { const t = tomb(); if (on) t[id] = Date.now(); else delete t[id]; localStorage.setItem('deleted', JSON.stringify(t)); } catch {} };
  const reload = useCallback(async () => {
    const list = await api('/api/items'), t = tomb(), now = Date.now();
    const out = list.map(x => (!x.deletedAt && t[x.id] && now - t[x.id] < 6e5 ? { ...x, deletedAt: new Date(t[x.id]).toISOString() } : x));
    setItems(out); return out;
  }, []);
  const refreshEngine = useCallback(async () => { try { setEngine(await api('/api/engine')); } catch {} }, []);

  const replace = useCallback(saved => setItems(list => (list.some(x => x.id === saved.id) ? list.map(x => (x.id === saved.id ? saved : x)) : [...list, saved])), []);
  const saveItem = useCallback(async (it, patch = {}) => {
    const next = { ...it, ...patch };
    next.format = typeOf(next) === 'carrossel' ? 'carrossel' : 'post';
    const saved = await api('/api/items/' + it.id, { method: 'PUT', body: next });
    replace(saved); return saved;
  }, [replace]);
  const openPost = useCallback((id, mode = '') => { setPostMode(mode); setPostId(id); }, []);
  // cria um post avulso (sem notícia do site) e já abre no editor pra subir foto/vídeo próprio e escolher o template
  const createItem = useCallback(async () => {
    try {
      const it = await api('/api/items', { method: 'POST', body: { title: '', origTitle: '' } });
      setItems(l => [...l, it]);
      vt(() => { setPostId(it.id); setEditorId(it.id); window.scrollTo(0, 0); });
      return it;
    } catch (e) { toast('Não consegui criar: ' + e.message, true); }
  }, [toast]);
  // excluir manda pra lixeira (fica 7 dias); da lixeira dá pra restaurar ou apagar de vez
  const removeItem = useCallback(async id => {
    const at = new Date().toISOString(); setTomb(id, true);
    setItems(l => l.map(x => (x.id === id ? { ...x, deletedAt: at } : x))); // some da tela na hora
    try { await api('/api/items/' + id, { method: 'DELETE' }); }
    catch (e) { setTomb(id, false); setItems(l => l.map(x => (x.id === id ? { ...x, deletedAt: undefined } : x))); throw e; }
  }, []);
  const purgeItem = useCallback(async id => { await api('/api/items/' + id + '?forever=1', { method: 'DELETE' }); setItems(l => l.filter(x => x.id !== id)); }, []);
  const restoreItem = useCallback(async id => { const s = await api('/api/items/' + id + '/restore', { method: 'POST' }); setTomb(id, false); setItems(l => l.map(x => (x.id === id ? s : x))); }, []);
  // excluir com um clique: vai pra lixeira (7 dias) e dá pra desfazer na hora
  const trashItem = useCallback(async id => {
    try { await removeItem(id); toast('Movido pra lixeira.', false, { label: 'Desfazer', fn: () => restoreItem(id).catch(e => toast(e.message, true)) }); }
    catch (e) { toast('Não consegui excluir: ' + e.message, true); }
  }, [removeItem, restoreItem, toast]);

  useEffect(() => {
    (async () => { await loadCfg(); await reload(); setReady(true); refreshEngine(); setTimeout(refreshEngine, 5000); })().catch(e => toast(e.message, true));
  }, []);
  // a cada minuto vê se o motor trouxe notícia nova
  useEffect(() => {
    const t = setInterval(async () => {
      let fresh; try { fresh = await api('/api/items'); } catch { return; }
      const have = new Set(itemsRef.current.map(i => i.id)), added = fresh.filter(i => !have.has(i.id));
      refreshEngine();
      if (added.length) { setItems(l => [...l, ...added]); setBanner(b => b + added.length); }
    }, 60000);
    return () => clearInterval(t);
  }, [refreshEngine]);

  // na Vercel não existe servidor ligado: o dashboard aberto pede a checagem do site (e o cron diário cobre o resto)
  useEffect(() => {
    if (!ready || !cfg.cloud) return;
    const run = () => api('/api/engine/run', { method: 'POST' }).then(refreshEngine).catch(() => {});
    run(); const t = setInterval(run, Math.max(5, +cfg.pollMinutes || 15) * 60000);
    return () => clearInterval(t);
  }, [ready, cfg.cloud, cfg.pollMinutes]);

  const live = useMemo(() => items.filter(i => !i.deletedAt), [items]), trash = useMemo(() => items.filter(i => i.deletedAt), [items]);
  const value = useMemo(() => ({
    items: live, trash, purgeItem, restoreItem, setItems, cfg, loadCfg, ready, tab, setTab, postId, setPostId, postMode, openPost, editorId, setEditorId, toast, toastMsg,
    banner, setBanner, engine, refreshEngine, reload, saveItem, createItem, removeItem, trashItem, replace, clearCovers,
    byId: id => items.find(i => i.id === id)
  }), [items, live, trash, cfg, ready, tab, postId, postMode, editorId, toastMsg, banner, engine]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function weekGoal(items, cfg) {
  const ws = mondayOf(new Date()), we = new Date(ws); we.setDate(ws.getDate() + 7);
  let posts = 0, videos = 0;
  for (const it of items) if (it.status === 'posted' && it.postedAt) {
    const d = new Date(it.postedAt);
    if (d >= ws && d < we) (typeOf(it) === 'video' ? videos++ : posts++);
  }
  const mp = +cfg.metaPosts || 0, mv = +cfg.metaVideos || 0;
  const pct = Math.min(100, Math.round(100 * (Math.min(posts, mp) + Math.min(videos, mv)) / Math.max(1, mp + mv)));
  return { posts, videos, mp, mv, pct };
}
