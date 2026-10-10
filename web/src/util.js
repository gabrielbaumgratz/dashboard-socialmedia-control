export const pad = n => String(n).padStart(2, '0');
export const STATUS = { draft: 'Rascunho', scheduled: 'Programado', posted: 'Postado' };
export const STYLE = { factual: 'Factual', comunidade: 'Alerta comunitário', topicos: 'Tópicos' };
export const TYPE = { post: 'Post', carrossel: 'Carrossel', video: 'Reel' };
export const DEF_TPL = { post: 'p01', carousel: 'A', story: 's02', reel: 'r01' };

export function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
export function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function toLocalInput(iso) { if (!iso) return ''; const d = new Date(iso); return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export const isoLocal = d => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
export const cap1 = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// o formato sai das imagens: vídeo enviado = reel; fotos extras ou slides = carrossel; senão post único
export function typeOf(it) {
  if (it.mediaType === 'video' || it.format === 'video') return 'video';
  return (it.slides && it.slides.length) ? 'carrossel' : 'post';
}
export const slideCount = it => (typeOf(it) === 'carrossel' ? it.slides.length + 2 : 1);

export const fmtTags = arr => (arr || []).map(t => '#' + t).join(' ');
export const parseTags = s => String(s || '').split(/[\s,]+/).map(t => t.replace(/^#/, '')).filter(Boolean);
export function fullCaption(it) { const t = fmtTags(it.hashtags); return (it.caption || '') + (t ? '\n\n' + t : ''); }
export const itemDate = it => (it.status === 'posted' ? it.postedAt : it.scheduledAt);
export const sortKey = it => String(itemDate(it) || it.newsDate || it.createdAt || '');

export function slotsList(cfg) {
  return String((cfg && cfg.slots) || '').split(/[,;\s]+/).filter(x => /^\d{1,2}:\d{2}$/.test(x)).map(x => x.padStart(5, '0'));
}
export function suggestWhen(items, cfg) {
  const taken = new Set(items.filter(i => i.status !== 'draft' && itemDate(i)).map(i => dayKey(new Date(itemDate(i)))));
  const d = new Date(); d.setDate(d.getDate() + 1);
  for (let k = 0; k < 30 && taken.has(dayKey(d)); k++) d.setDate(d.getDate() + 1);
  const [h, m] = (slotsList(cfg)[0] || '12:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
export function fmtWhen(it) {
  const iso = itemDate(it);
  if (!iso) return 'Rascunho, sem data';
  const d = new Date(iso);
  if (it.status === 'posted') {
    const diff = (Date.now() - d) / 1000;
    if (diff < 3600) return `Há ${Math.max(1, Math.round(diff / 60))} minutos`;
    if (diff < 86400) return `Há ${Math.round(diff / 3600)} horas`;
    if (diff < 7 * 86400) return `Há ${Math.round(diff / 86400)} dias`;
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  }
  return `Agendado para ${d.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${d.toLocaleDateString('pt-BR')} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function shortWhen(it) {
  const iso = itemDate(it); if (!iso) return 'rascunho';
  const d = new Date(iso), s = (Date.now() - d) / 1000;
  if (s < 0) return 'agendado';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min';
  if (s < 86400) return Math.round(s / 3600) + ' h';
  if (s < 7 * 86400) return Math.round(s / 86400) + ' d';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}
export const handleOf = cfg => String((cfg && cfg.instagram) || '').replace(/^@/, '');
