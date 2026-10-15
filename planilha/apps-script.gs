/**
 * Dashboard Reconstruções <-> Google Sheets
 * 1) Extensões > Apps Script, apague tudo e cole este arquivo.
 * 2) Rode a função "configurar" uma vez (autorize quando pedir). Ela monta as abas Posts, Painel e Resumo semanal.
 * 3) Implantar > Nova implantação > App da Web > Executar como "Eu" > Acesso "Qualquer pessoa". Copie a URL.
 * 4) No dashboard: Configurações > Planilha, cole a URL e salve.
 * A aba "Posts" recebe 1 linha por post e atualiza a mesma linha quando o status muda (Rascunho, Programado, Postado, Excluído).
 */
const VALOR_SEMANA = 157.50; // valor do acerto semanal (ajuste se mudar)
const HEAD = ['ID', 'Data', 'Hora', 'Dia da semana', 'Semana (início)', 'Mês', 'Tipo', 'Status', 'Título', 'Categoria', 'Link do post', 'Link da matéria'];
const STATUS = { draft: 'Rascunho', scheduled: 'Programado', posted: 'Postado', deleted: 'Excluído' };

function onOpen() { SpreadsheetApp.getUi().createMenu('Dashboard').addItem('Montar/Refazer abas', 'configurar').addToUi(); }

function doPost(e) {
  const d = JSON.parse(e.postData.contents), ss = SpreadsheetApp.getActiveSpreadsheet(), sh = posts_(ss);
  const when = d.postedAt || d.scheduledAt ? new Date(d.postedAt || d.scheduledAt) : null;
  const id = d.id || ('x' + Date.now());
  const tipo = d.type === 'video' ? 'Vídeo' : d.type === 'carrossel' ? 'Carrossel' : 'Post';
  const vals = [id, when ? dateOnly_(when) : '', when ? Utilities.formatDate(when, ss.getSpreadsheetTimeZone(), 'HH:mm') : '', '', '', '',
    tipo, STATUS[d.status] || (d.postedAt ? 'Postado' : 'Rascunho'), d.title || '', d.category || '', d.postUrl || '', d.newsUrl || ''];
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(r => String(r[0]));
  let row = ids.indexOf(String(id)) + 2;
  if (row < 2) { row = sh.getLastRow() + 1; }
  sh.getRange(row, 1, 1, HEAD.length).setValues([vals]);
  formulas_(sh, row);
  updateSummary_(ss, d.metaPosts || 3, d.metaVideos || 2);
  return ContentService.createTextOutput('ok');
}

function dateOnly_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function formulas_(sh, row) { // dia, semana e mês saem da data: se você mudar a data na mão, recalcula sozinho
  sh.getRange(row, 4).setFormula(`=IF(B${row}="","",TEXT(B${row},"dddd"))`);
  sh.getRange(row, 5).setFormula(`=IF(B${row}="","",B${row}-WEEKDAY(B${row},3))`);
  sh.getRange(row, 6).setFormula(`=IF(B${row}="","",TEXT(B${row},"yyyy-mm"))`);
}
function posts_(ss) {
  let sh = ss.getSheetByName('Posts');
  if (!sh) { sh = ss.insertSheet('Posts', 0); sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]); }
  return sh;
}

function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = posts_(ss), tz = ss.getSpreadsheetTimeZone();
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#006173').setFontColor('#ffffff');
  sh.setFrozenRows(1); sh.setFrozenColumns(2);
  sh.getRange('B2:B').setNumberFormat('dd/mm/yyyy'); sh.getRange('E2:E').setNumberFormat('dd/mm/yyyy');
  [[1, 90], [2, 95], [3, 60], [4, 120], [5, 120], [6, 80], [7, 90], [8, 100], [9, 420], [10, 120], [11, 220], [12, 220]].forEach(([c, w]) => sh.setColumnWidth(c, w));
  sh.hideColumns(1); // o ID é só pro dashboard achar a linha
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), HEAD.length).createFilter();
  sh.getRange('H2:H').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Rascunho', 'Programado', 'Postado', 'Excluído'], true).build());
  sh.setConditionalFormatRules([
    ['Postado', '#d9f2e6'], ['Programado', '#d6e8fb'], ['Rascunho', '#fdf0c8'], ['Excluído', '#f1d6d6']
  ].map(([t, c]) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t).setBackground(c).setRanges([sh.getRange('H2:H')]).build()));
  const last = sh.getLastRow(); for (let r = 2; r <= last; r++) formulas_(sh, r);

  // ----- Painel -----
  let p = ss.getSheetByName('Painel'); if (p) ss.deleteSheet(p);
  p = ss.insertSheet('Painel', 1); p.setHiddenGridlines(true);
  p.getRange('A1').setValue('Painel de posts').setFontSize(20).setFontWeight('bold').setFontColor('#006173');
  p.getRange('A2').setValue('Atualiza sozinho. Para filtrar por semana, mês ou dia, use os filtros do cabeçalho da aba Posts.').setFontColor('#666666');
  const cards = [['Postados', '=COUNTIF(Posts!H:H,"Postado")'], ['Programados', '=COUNTIF(Posts!H:H,"Programado")'], ['Rascunhos', '=COUNTIF(Posts!H:H,"Rascunho")'],
    ['Postados nesta semana', '=COUNTIFS(Posts!H:H,"Postado",Posts!E:E,TODAY()-WEEKDAY(TODAY(),3))'], ['Postados neste mês', '=COUNTIFS(Posts!H:H,"Postado",Posts!F:F,TEXT(TODAY(),"yyyy-mm"))'], ['Postados hoje', '=COUNTIFS(Posts!H:H,"Postado",Posts!B:B,TODAY())']];
  cards.forEach(([t, f], i) => {
    p.getRange(4, 1 + i * 2).setValue(t).setFontColor('#666666').setFontSize(10);
    p.getRange(5, 1 + i * 2).setFormula(f).setFontSize(26).setFontWeight('bold').setFontColor('#006173');
    p.getRange(4, 1 + i * 2, 2, 2).setBackground('#eef6f7').setBorder(true, true, true, true, false, false, '#ffffff', SpreadsheetApp.BorderStyle.SOLID_THICK);
  });
  const q = (cell, title, query) => { p.getRange(cell).offset(-1, 0).setValue(title).setFontWeight('bold'); p.getRange(cell).setFormula(`=IFERROR(QUERY(Posts!A:L,"${query}",1),"sem dados ainda")`); };
  q('A9', 'Posts por semana (postados)', "select E, count(A) where H='Postado' and E is not null group by E order by E desc label E 'Semana (início)', count(A) 'Posts'");
  q('D9', 'Posts por mês (postados)', "select F, count(A) where H='Postado' and F is not null group by F order by F desc label F 'Mês', count(A) 'Posts'");
  q('G9', 'Posts por dia da semana (postados)', "select D, count(A) where H='Postado' and D is not null group by D label D 'Dia', count(A) 'Posts'");
  q('J9', 'Por tipo (postados)', "select G, count(A) where H='Postado' group by G label G 'Tipo', count(A) 'Posts'");
  p.getRange('A9:A').setNumberFormat('dd/mm/yyyy');
  p.setColumnWidths(1, 12, 110);
  p.getCharts().forEach(c => p.removeChart(c));
  p.insertChart(p.newChart().setChartType(Charts.ChartType.COLUMN).addRange(p.getRange('A10:B30')).setPosition(24, 1, 0, 0).setOption('title', 'Posts por semana').setOption('legend', { position: 'none' }).setOption('colors', ['#00b0ac']).build());
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('Pronto. Abas Posts e Painel montadas. Agora implante como App da Web e cole a URL no dashboard.');
}

function weekStart_(d) { const x = dateOnly_(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

// aba "Resumo semanal" com a meta e o valor, calculada em cima da aba Posts
function updateSummary_(ss, metaPosts, metaVideos) {
  const sh = ss.getSheetByName('Posts'), tz = ss.getSpreadsheetTimeZone();
  if (!sh || sh.getLastRow() < 2) return;
  const weeks = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues().forEach(r => {
    if (r[7] !== 'Postado' || !r[1]) return;
    const k = Utilities.formatDate(weekStart_(new Date(r[1])), tz, 'yyyy-MM-dd');
    weeks[k] = weeks[k] || { posts: 0, videos: 0 };
    if (r[6] === 'Vídeo') weeks[k].videos++; else weeks[k].posts++;
  });
  let sum = ss.getSheetByName('Resumo semanal');
  if (!sum) { sum = ss.insertSheet('Resumo semanal'); sum.appendRow(['Semana (início)', 'Posts', 'Vídeos', 'Meta', 'Situação', 'Valor da semana']); sum.setFrozenRows(1); }
  sum.getRange(2, 1, Math.max(sum.getLastRow() - 1, 1), 6).clearContent();
  const out = Object.keys(weeks).sort().map(k => {
    const w = weeks[k], ok = w.posts >= metaPosts && w.videos >= metaVideos, faltam = Math.max(0, metaPosts - w.posts) + Math.max(0, metaVideos - w.videos);
    return [k, w.posts, w.videos, `${metaPosts} posts + ${metaVideos} vídeos`, ok ? 'Meta batida' : `Faltam ${faltam}`, VALOR_SEMANA];
  });
  if (out.length) sum.getRange(2, 1, out.length, 6).setValues(out);
}
