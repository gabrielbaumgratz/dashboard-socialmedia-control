import { useEffect, useState } from 'react';
import { useApp } from '../store.jsx';
import { Cover, PageHead, Seg, Status , ViewToggle } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { IgPost, useSet } from '../previews.jsx';
import { storyUrl } from '../art.js';
import { handleOf, itemDate, typeOf } from '../util.js';
import Render from '../render.js';
import BrandForm from './BrandForm.jsx';

function StoryThumb({ it, className = '' }) {
  const [u, setU] = useState(null);
  useEffect(() => { let ok = true; storyUrl(it).then(x => ok && setU(x)); return () => { ok = false; }; }, [it.id, it.title, it.photoUrl, it.focal, JSON.stringify(it.tpl)]);
  return u ? <img className={'cover ' + className} src={u} alt="" /> : <span className={'cover skel ' + className} />;
}

function LineItem({ it }) {
  const { cfg, trashItem } = useApp();
  const set = useSet(it);
  return <div className="igwrap"><IgPost it={it} cfg={cfg} set={set} onDelete={() => trashItem(it.id)} /></div>;
}

export default function Feed() {
  const { items, cfg, openPost, createItem, trashItem } = useApp();
  const [brand, setBrand] = useState(false);
  const [mode, setMode] = useState('grid'), [sub, setSub] = useState('posts'), [drafts, setDrafts] = useState(false);
  const [avatar, setAvatar] = useState(null);
  useEffect(() => { // foto de perfil igual à real: símbolo da marca em círculo branco
    const c = document.createElement('canvas'); c.width = c.height = 300;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300); Render.symbol(x, 62, 70, 176);
    setAvatar(c.toDataURL('image/png'));
  }, []);
  const list = items.filter(i => i.status !== 'draft' || drafts).sort((a, b) => String(itemDate(b) || b.createdAt).localeCompare(String(itemDate(a) || a.createdAt)));
  const posts = list.filter(i => typeOf(i) !== 'video'), reels = list.filter(i => typeOf(i) === 'video');
  const site = String(cfg.wpUrl || '').replace(/^https?:\/\//, '');
  const shown = sub === 'posts' ? posts : sub === 'reels' ? reels : list;
  return (
    <>
      <PageHead title="Feed" hint="Prévia de como o perfil vai ficar">
        <label className="check"><input type="checkbox" checked={drafts} onChange={e => setDrafts(e.target.checked)} /> incluir rascunhos</label>
        <ViewToggle value={mode} onChange={setMode} alt="line" />
        <button className="ghost iconbtn" aria-label="Marca e legenda" title="Marca e legenda" onClick={() => setBrand(b => !b)}><Icon name="gear" /></button>
        <button onClick={createItem}>+ Novo post</button>
      </PageHead>
      {brand && <BrandForm onClose={() => setBrand(false)} />}
      {mode === 'grid' ? (
        <div className="igprofile">
          <div className="igp-head">
            <div className="igp-av">{avatar ? <img src={avatar} alt="" /> : <span>R</span>}</div>
            <div className="igp-info">
              <div className="igp-row"><b>{handleOf(cfg)}</b><button type="button" className="igp-btn" onClick={() => setBrand(true)}>Editar perfil</button><span className="igp-btn">Ver arquivo</span></div>
              <div className="igp-row stats"><span><b>{list.length}</b> publicações</span></div>
              <div className="igp-bio"><b>Reconstruções</b><div className="mutline">Empresa de mídia/notícias</div><div className="bio">{cfg.bio}</div><a href={cfg.wpUrl} target="_blank" rel="noopener noreferrer">{site}</a></div>
            </div>
          </div>
          {list.length > 0 && (
            <div className="igp-stories" aria-label="Stories">
              {list.slice(0, 8).map(it => (
                <button key={it.id} className="hl" onClick={() => openPost(it.id, 'story')}>
                  <span className="ring"><StoryThumb it={it} /></span><small>{(it.category || 'Story').slice(0, 12)}</small>
                </button>
              ))}
            </div>
          )}
          <div className="igp-tabs">
            {[['posts', 'grid', 'Publicações'], ['reels', 'reels', 'Reels'], ['stories', 'story', 'Stories']].map(([id, ic, n]) => (
              <button key={id} className={sub === id ? 'on' : ''} onClick={() => setSub(id)}><Icon name={ic} />{n}</button>
            ))}
          </div>
          <div className={'iggrid' + (sub === 'stories' ? ' stories' : '')}>
            {!shown.length && <p className="hint pad">{sub === 'reels' ? 'Nenhum reel ainda. Suba um vídeo em "Editar arte".' : 'Nada programado ou postado ainda.'}</p>}
            {shown.map(it => {
              const t = typeOf(it);
              return (
                <button key={it.id} className="tile" onClick={() => openPost(it.id, sub === 'stories' ? 'story' : t === 'video' ? 'reel' : '')}>
                  {sub === 'stories' ? <StoryThumb it={it} /> : <Cover it={it} />}
                  {sub !== 'stories' && t === 'video' && <Icon name="reels" className="tico" />}
                  {sub !== 'stories' && t === 'carrossel' && <Icon name="carousel" className="tico" />}
                  {it.status !== 'posted' && <span className="tag"><Status st={it.status} /></span>}
                  <span className="tdel" role="button" tabIndex={0} title="Excluir" aria-label="Excluir" onClick={e => { e.stopPropagation(); trashItem(it.id); }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); trashItem(it.id); } }}><Icon name="trash" /></span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="feedline">
          {!list.length && <p className="hint">Nada programado ou postado ainda.</p>}
          {list.slice(0, 15).map(it => <LineItem key={it.id} it={it} />)}
        </div>
      )}
    </>
  );
}
