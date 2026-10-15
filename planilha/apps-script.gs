/**
 * Dashboard Reconstruções -> planilha "Reconstruções | Controle de posts"
 * A planilha já vem montada (abas Painel e Posts). Este código só recebe os posts do dashboard.
 * 1) Na planilha: Extensões > Apps Script, apague tudo e cole este arquivo. Salve.
 * 2) Implantar > Nova implantação > tipo "App da Web" > Executar como "Eu" > Acesso "Qualquer pessoa" > Implantar. Autorize.
 * 3) Copie a URL do App da Web e cole no dashboard em Configurações > Planilha.
 * Cada post vira 1 linha na aba Posts e a mesma linha é atualizada quando o status muda.
 */
// colunas da aba Posts: A ID | B Data | C Hora | D Dia | E Semana | F Mês | G Ano | H Tipo | I Status | J Título | K Categoria | L Link do post | M Link da matéria
const STATUS = { draft: 'Rascunho', scheduled: 'Programado', posted: 'Postado', deleted: 'Excluído' };

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Posts'), tz = ss.getSpreadsheetTimeZone();
  const iso = d.postedAt || d.scheduledAt || d.createdAt, when = iso ? new Date(iso) : new Date();
  const id = String(d.id || ('x' + Date.now()));
  const tipo = d.type === 'video' ? 'Vídeo' : d.type === 'carrossel' ? 'Carrossel' : 'Post';
  const lastId = Math.max(sh.getRange('A:A').getValues().filter(r => r[0] !== '').length, 1); // linhas com ID (inclui o cabeçalho)
  const ids = sh.getRange(1, 1, lastId, 1).getValues().map(r => String(r[0]));
  let row = ids.indexOf(id) + 1;
  if (row < 2) row = lastId + 1;
  sh.getRange(row, 1, 1, 3).setValues([[id, new Date(when.getFullYear(), when.getMonth(), when.getDate()), Utilities.formatDate(when, tz, 'HH:mm')]]);
  sh.getRange(row, 8, 1, 6).setValues([[tipo, STATUS[d.status] || 'Rascunho', d.title || '', d.category || '', d.postUrl || '', d.newsUrl || '']]);
  if (!sh.getRange(row, 4).getFormula()) { // linha nova além das que já vieram prontas: põe as fórmulas de dia, semana, mês e ano
    sh.getRange(row, 4, 1, 4).setFormulas([[`=IF(B${row}="","",CHOOSE(WEEKDAY(B${row},2),"segunda","terça","quarta","quinta","sexta","sábado","domingo"))`,
      `=IF(B${row}="","",B${row}-WEEKDAY(B${row},3))`, `=IF(B${row}="","",DATE(YEAR(B${row}),MONTH(B${row}),1))`, `=IF(B${row}="","",YEAR(B${row}))`]]);
    sh.getRange(row, 2).setNumberFormat('dd/mm/yyyy'); sh.getRange(row, 5).setNumberFormat('dd/mm/yyyy'); sh.getRange(row, 6).setNumberFormat('mm/yyyy');
  }
  return ContentService.createTextOutput('ok');
}
