/**
 * Dashboard Reconstruções -> Google Sheets
 * Cole este código em Extensões > Apps Script da planilha compartilhada,
 * publique como "App da Web" e cole a URL em Configurações > Planilha no dashboard.
 */
const VALOR_SEMANA = 157.50; // valor do acerto semanal (ajuste se mudar)

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pub = sheet_(ss, 'Publicações', ['Data', 'Semana (início)', 'Tipo', 'Título', 'Link do post', 'Link da matéria']);
  const when = d.postedAt ? new Date(d.postedAt) : new Date();
  const week = weekStart_(when);
  pub.appendRow([when, week, d.type === 'video' ? 'Vídeo' : 'Post', d.title || '', d.postUrl || '', d.newsUrl || '']);
  updateSummary_(ss, d.metaPosts || 3, d.metaVideos || 2);
  return ContentService.createTextOutput('ok');
}

function sheet_(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}

function weekStart_(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - day);
  return x;
}

function updateSummary_(ss, metaPosts, metaVideos) {
  const pub = ss.getSheetByName('Publicações');
  const rows = pub.getDataRange().getValues().slice(1);
  const weeks = {};
  rows.forEach(r => {
    const k = Utilities.formatDate(new Date(r[1]), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    weeks[k] = weeks[k] || { posts: 0, videos: 0 };
    if (r[2] === 'Vídeo') weeks[k].videos++; else weeks[k].posts++;
  });
  const sum = sheet_(ss, 'Resumo semanal', ['Semana (início)', 'Posts', 'Vídeos', 'Meta', 'Situação', 'Valor da semana']);
  sum.getRange(2, 1, Math.max(sum.getLastRow() - 1, 1), 6).clearContent();
  const out = Object.keys(weeks).sort().map(k => {
    const w = weeks[k];
    const ok = w.posts >= metaPosts && w.videos >= metaVideos;
    const faltam = Math.max(0, metaPosts - w.posts) + Math.max(0, metaVideos - w.videos);
    return [k, w.posts, w.videos, `${metaPosts} posts + ${metaVideos} vídeos`, ok ? 'Meta batida' : `Faltam ${faltam}`, VALOR_SEMANA];
  });
  if (out.length) sum.getRange(2, 1, out.length, 6).setValues(out);
}
