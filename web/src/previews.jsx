import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { artData, coverUrl, renderSet } from './art.js';
import Render from './render.js';
import { fullCaption, handleOf, shortWhen, fmtWhen, typeOf } from './util.js';

export function useCover(it) {
  const [u, setU] = useState(null);
  const key = JSON.stringify([it.id, it.focalStory, it.mediaType, it.title, it.category, it.photoUrl, it.focal, it.tpl, it.slides, it.description, it.chip, it.credit, it.source, it.bigTitle, it.cutoutUrl]);
  useEffect(() => { let ok = true; setU(null); coverUrl(it).then(x => ok && setU(x)); return () => { ok = false; }; }, [key]);
  return u;
}
export function useSet(it, enabled = true) {
  const [s, setS] = useState(null);
  const key = JSON.stringify([it.id, it.focalStory, it.mediaType, it.title, it.category, it.photoUrl, it.focal, it.tpl, it.slides, it.description, it.chip, it.credit, it.source, it.bigTitle, it.cutoutUrl]);
  useEffect(() => {
    if (!enabled) return; let ok = true; setS(null);
    renderSet(it).then(x => ok && setS(x));
    return () => { ok = false; };
  }, [key, enabled]);
  return s;
}

export function Caption({ text, limit }) {
  const [open, setOpen] = useState(false);
  const full = text || '(sem legenda)';
  let short = full.split('\n').slice(0, 2).join('\n').replace(/\n+$/, '');
  if (short.length > limit) short = short.slice(0, limit).replace(/\s+\S*$/, '');
  const cut = !open && short.length < full.trim().length;
  const parts = String(cut ? short : full).split(/(#[\p{L}\p{N}_]+)/u).filter(Boolean);
  return (
    <span className="txt">
      {parts.map((p, i) => (p.startsWith('#') ? <span key={i} className="htag">{p}</span> : p))}
      {cut && <> <button className="more" onClick={() => setOpen(true)}>… mais</button></>}
    </span>
  );
}

// ---------- post do feed (post único ou carrossel) ----------
export function IgPost({ it, cfg, set }) {
  const handle = handleOf(cfg);
  const [idx, setIdx] = useState(0), [liked, setLiked] = useState(false), [saved, setSaved] = useState(false), [pop, setPop] = useState(0);
  useEffect(() => setIdx(0), [it.id]);
  const slides = set ? set.slides : [], n = slides.length;
  const video = typeOf(it) === 'video';
  return (
    <article className="ig">
      <header>
        <span className="av"><span>R</span></span>
        <div className="who"><b>{handle}</b> <span className="time">• {shortWhen(it)}</span><small>{cfg.location || ''}</small></div>
        <button className="ico" title="Mais opções"><Icon name="dots" /></button>
      </header>
      <div className="media" onDoubleClick={() => { setLiked(true); setPop(p => p + 1); }}>
        {video && it.videoUrl ? <video src={it.videoUrl} controls loop playsInline preload="metadata" /> :
          n ? <img src={slides[idx].dataUrl} alt="" /> : <div className="skel" />}
        {pop > 0 && <div key={pop} className="bigheart go"><Icon name="heart-f" /></div>}
        {n > 1 && <span className="count">{idx + 1}/{n}</span>}
        {n > 1 && idx > 0 && <button className="nav prev" onClick={() => setIdx(idx - 1)} aria-label="Anterior">&lsaquo;</button>}
        {n > 1 && idx < n - 1 && <button className="nav next" onClick={() => setIdx(idx + 1)} aria-label="Próxima">&rsaquo;</button>}
      </div>
      <div className="acts">
        <button className={'ico like' + (liked ? ' liked' : '')} onClick={() => setLiked(!liked)} title="Curtir"><Icon name={liked ? 'heart-f' : 'heart'} /></button>
        <button className="ico" title="Comentar"><Icon name="comment" /></button>
        <button className="ico" title="Compartilhar"><Icon name="share" /></button>
        {n > 1 && <span className="dots">{slides.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}</span>}
        <span className="sp" />
        <button className="ico" onClick={() => setSaved(!saved)} title="Salvar"><Icon name={saved ? 'save-f' : 'save'} /></button>
      </div>
      <div className="likes">{liked ? '1 curtida' : 'Seja o primeiro a curtir'}</div>
      <div className="cap"><b>{handle}</b> <Caption text={fullCaption(it)} limit={125} /></div>
      <div className="comments">Ver comentários</div>
      <div className="addc">Adicione um comentário…</div>
    </article>
  );
}

// ---------- story: moldura de celular com a interface do Instagram ----------
export function StoryPhone({ src, zone, it, cfg, guides }) {
  const screen = useRef(null), stk = useRef(null);
  const [pos, setPos] = useState({ l: 50, t: 76.5 }), [drag, setDrag] = useState(null);
  useEffect(() => { setPos(zone ? { l: (zone.x + zone.w / 2) / 10.8, t: (zone.y + zone.h / 2) / 19.2 } : { l: 50, t: 76.5 }); }, [zone, it.id]);
  const down = e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); };
  const move = e => {
    if (!drag) return;
    const r = screen.current.getBoundingClientRect();
    setPos({ l: Math.min(92, Math.max(8, (e.clientX - r.left) / r.width * 100)), t: Math.min(88, Math.max(10, (e.clientY - r.top) / r.height * 100)) });
  };
  const handle = handleOf(cfg), site = String(cfg.wpUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return (
    <div className="phone">
      <div className="phone-screen story">
        <div className="sbar"><b>9:41</b><span className="sb-icons"><i /><i /><i /></span></div>
        <div className="st-media" ref={screen}>
        {src ? <img src={src} alt="" draggable="false" /> : <div className="skel" />}
        <div className="st-top">
          <div className="st-bars"><i className="on" /><i /><i /></div>
          <div className="st-head">
            <span className="av"><span>R</span></span>
            <b>{handle}</b><span className="mut">agora</span>
            <span className="sp" />
            <Icon name="dots" /><Icon name="x" />
          </div>
        </div>
        <div ref={stk} className="sticker" style={{ left: pos.l + '%', top: pos.t + '%' }} onPointerDown={down} onPointerMove={move} onPointerUp={() => setDrag(null)}>
          <Icon name="link" /><span>{(site || 'reconstrucoes.digital').toUpperCase()}</span>
        </div>
        {guides && <>
          <div className="safe top"><span>perfil e barra, evite texto</span></div>
          <div className="safe bottom"><span>resposta, evite texto</span></div>
        </>}
        </div>
        <div className="st-bottom">
          <div className="reply">Enviar mensagem</div>
          <Icon name="heart" /><Icon name="share" />
        </div>
      </div>
      <span className="island" />
    </div>
  );
}

// ---------- reel ----------
// texto animado do template de reel por cima do vídeo (parado = estado final)
export function ReelOverlay({ it, video, playing }) {
  const c = useRef(null);
  useEffect(() => {
    let id, alive = true; const d = artData(it);
    const loop = async () => {
      const v = video.current, cv = c.current; if (!alive || !cv) return;
      cv.width = 540; cv.height = 960; cv.getContext('2d').clearRect(0, 0, 540, 960);
      await Render.reel(cv, d, v && playing ? v.currentTime : 99, (v && v.duration) || 15);
      if (playing) id = requestAnimationFrame(loop);
    };
    loop(); return () => { alive = false; cancelAnimationFrame(id); };
  }, [playing, it.title, it.category, it.legendas, it.dateline, it.tpl && it.tpl.reel]);
  return <canvas ref={c} className="rl-overlay" aria-hidden="true" />;
}

export function ReelPhone({ it, cfg, cover }) {
  const handle = handleOf(cfg), v = useRef(null);
  const [playing, setPlaying] = useState(false), [liked, setLiked] = useState(false);
  const toggle = () => { if (!v.current) return; if (v.current.paused) { v.current.play(); setPlaying(true); } else { v.current.pause(); setPlaying(false); } };
  return (
    <div className="phone reel">
      <div className="phone-screen">
        <div className="rl-media">
          {it.videoUrl ? <video ref={v} src={it.videoUrl + '#t=0.1'} loop playsInline preload="metadata" onClick={toggle} /> :
            cover ? <img src={cover} alt="" draggable="false" /> : <div className="skel" />}
          {it.videoUrl && <ReelOverlay it={it} video={v} playing={playing} />}
        </div>
        {!playing && it.videoUrl && <button className="reelplay" onClick={toggle} aria-label="Tocar"><Icon name="play" /></button>}
        <div className="rl-top"><b>Reels</b><span className="sp" /><Icon name="story" /></div>
        <div className="rl-rail">
          <button onClick={() => setLiked(!liked)} className={liked ? 'liked' : ''}><Icon name={liked ? 'heart-f' : 'heart'} /><small>{liked ? 1 : 0}</small></button>
          <button><Icon name="comment" /><small>0</small></button>
          <button><Icon name="share" /><small>0</small></button>
          <button><Icon name="dots" /></button>
          <span className="audio"><Icon name="music" /></span>
        </div>
        <div className="rl-bottom">
          <div className="rl-who"><span className="av"><span>R</span></span><b>{handle}</b><span className="follow">Seguir</span></div>
          <p><Caption text={fullCaption(it)} limit={70} /></p>
          <div className="rl-audio"><Icon name="music" /><span>Áudio original · {handle}</span></div>
        </div>
      </div>
      <span className="island" />
    </div>
  );
}

export const WhenNote = ({ it }) => <span className="cutnote">{fmtWhen(it)}</span>;
