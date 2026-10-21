import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import { STATUS, TYPE, typeOf, cap1 } from './util.js';
import { useCover } from './previews.jsx';
import { Icon } from './icons.jsx';

export const Status = ({ st }) => <span className={'st ' + st}>{STATUS[st]}</span>;
export const TypeTag = ({ it }) => { const t = typeOf(it); return <span className={'ty ' + t}>{TYPE[t]}{t === 'carrossel' ? ` · ${it.slides.length + 2}` : ''}</span>; };

// alternar visualização: só ícone (grade ou lista), igual em todas as abas
export function ViewToggle({ value, onChange, alt = 'list' }) {
  return <Seg value={value} onChange={onChange} className="iconseg" options={[['grid', <LayoutGrid key="g" size={17} aria-label="Grade" />, 'Grade'], [alt, <List key="l" size={17} aria-label="Lista" />, 'Lista']]} />;
}

export function Seg({ value, options, onChange, className = '' }) {
  return (
    <div className={'seg glass ' + className} role="tablist">
      {options.map(([v, label, title]) => (
        <button key={v} role="tab" aria-selected={value === v} title={title} aria-label={title} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {value === v && <motion.i layoutId={'seg-' + options.map(o => o[0]).join('')} className="seg-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, hint, children }) {
  return (
    <header className="pagehead">
      <div><h2>{title}</h2>{hint && <p className="hint">{hint}</p>}</div>
      <div className="inline">{children}</div>
    </header>
  );
}

export function Cover({ it, className = '' }) {
  const u = useCover(it);
  return u ? <img className={'cover ' + className} src={u} alt="" /> : <span className="cover skel" />;
}

// busca que abre no ícone (porte do expandable-search-bar do 21st.dev, mesma lógica e mola)
export function ExpandableSearch({ value, onChange, placeholder = 'Buscar…', width = 280, direction = 'left' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null), input = useRef(null);
  useEffect(() => {
    const down = e => { if (!box.current?.contains(e.target) && open && value === '') setOpen(false); };
    const key = e => { if (e.key === 'Escape' && open) { setOpen(false); onChange(''); } };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, value]);
  useEffect(() => { if (open) { const id = setTimeout(() => input.current?.focus(), 120); return () => clearTimeout(id); } else if (value) onChange(''); }, [open]);
  const spring = { type: 'spring', stiffness: 260, damping: 26 };
  return (
    // a caixa cresce de verdade (empurra o resto em vez de ficar por cima) e abre ao passar o mouse
    <motion.div ref={box} className="xsearch" style={{ height: 40 }} animate={{ width: open ? width : 40 }} initial={false} transition={spring}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!value && document.activeElement !== input.current) setOpen(false); }}
      onBlur={e => { if (!value && !box.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" className="xs-toggle" aria-label={open ? 'Fechar busca' : 'Abrir busca'} onClick={() => setOpen(s => !s)}>
        {open ? <X size={16} /> : <Search size={16} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.form key="f" className={'xs-form ' + direction} onSubmit={e => e.preventDefault()} role="search"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .12 } }} style={{ width: '100%' }}>
            <span className="xs-ico"><Search size={16} /></span>
            <input ref={input} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" />
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function Empty({ children }) { return <div className="empty">{children}</div>; }
export const Spin = () => <span className="spin" aria-hidden="true" />;
export { cap1, Icon };

// estado que sobrevive a troca de aba e a recarregar a página (Date vira ISO)
export function usePref(key, init) {
  const [v, set] = useState(() => {
    try { const s = localStorage.getItem('pref:' + key); if (s != null) { const j = JSON.parse(s); return init instanceof Date ? new Date(j) : j; } } catch (e) {}
    return typeof init === 'function' ? init() : init;
  });
  useEffect(() => { try { localStorage.setItem('pref:' + key, JSON.stringify(v)); } catch (e) {} }, [key, v]);
  return [v, set];
}

// data e hora separadas: dá pra digitar ou usar o calendário/relógio do navegador
export function DateTime({ value, onChange, label = 'Quando postar' }) {
  const [d, t] = (value || '').split('T');
  const set = (nd, nt) => onChange(nd ? `${nd}T${nt || '12:00'}` : '');
  return (
    <fieldset className="dt"><legend>{label}</legend>
      <label>Dia<input type="date" value={d || ''} onChange={e => set(e.target.value, t)} /></label>
      <label>Hora<input type="time" value={(t || '').slice(0, 5)} onChange={e => set(d || new Date().toISOString().slice(0, 10), e.target.value)} /></label>
    </fieldset>
  );
}

// pergunta rápida em qualquer lugar: await askChoice('Título', [['id','Texto'], ...]) devolve o id, ou null se cancelar
let openChoice = null;
export const askChoice = (title, opts) => new Promise(res => (openChoice ? openChoice({ title, opts, res }) : res(null)));
export function ChoiceHost() {
  const [q, setQ] = useState(null);
  useEffect(() => { openChoice = setQ; return () => { openChoice = null; }; }, []);
  const done = v => { if (q) q.res(v); setQ(null); };
  useEffect(() => { if (!q) return; const esc = e => e.key === 'Escape' && done(null); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [q]);
  if (!q) return null;
  return <div className="choice-bg" onClick={() => done(null)}>
    <div className="choice glass" role="dialog" aria-label={q.title} onClick={e => e.stopPropagation()}>
      <p>{q.title}</p>
      <div className={'row' + Math.min(q.opts.length, 3)}>{q.opts.map(([id, n], i) => <button key={id} className={i === q.opts.length - 1 ? '' : 'ghost'} onClick={() => done(id)}>{n}</button>)}</div>
      <button className="ghost mini" onClick={() => done(null)}>Cancelar</button>
    </div></div>;
}
