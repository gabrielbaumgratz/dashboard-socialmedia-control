/**
 * Dashboard Reconstruções -> planilha "Reconstruções | Controle de posts"
 * A planilha já vem montada (abas Painel e Posts). Este código só recebe os posts do dashboard.
 * Cada post vira 1 linha na aba Posts e a mesma linha é atualizada quando o status muda.
 */
// colunas da aba Posts: A ID | B Data | C Hora | D Dia | E Semana | F Mês | G Ano | H Tipo | I Status | J Título | K Categoria | L Link do post | M Link da matéria
const TZ = 'America/Sao_Paulo';
const STATUS = { draft: 'Rascunho', scheduled: 'Programado', posted: 'Postado', deleted: 'Excluído' };

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Posts');
  if (ss.getSpreadsheetTimeZone() !== TZ) ss.setSpreadsheetTimeZone(TZ); // TODAY() e semana no horário de Brasília
  const iso = d.postedAt || d.scheduledAt || d.createdAt, when = iso ? new Date(iso) : new Date();
  const id = String(d.id || ('x' + Date.now()));
  const base = d.type === 'video' ? 'Vídeo' : d.type === 'carrossel' ? 'Carrossel' : 'Post';
  const tipo = d.what === 'story' ? 'Story' : d.what === 'both' ? base + ' + Story' : base;
  const lastId = Math.max(sh.getRange('A:A').getValues().filter(r => r[0] !== '').length, 1); // linhas com ID (inclui o cabeçalho)
  const ids = sh.getRange(1, 1, lastId, 1).getValues().map(r => String(r[0]));
  let row = ids.indexOf(id) + 1;
  // rascunho e excluído não entram na planilha: se já tinha linha, ela sai
  if (d.status === 'draft' || d.status === 'deleted') { if (row >= 2) sh.deleteRow(row); return ContentService.createTextOutput('ok'); }
  if (row < 2) row = lastId + 1;
  const [y, mo, da] = Utilities.formatDate(when, TZ, 'yyyy-M-d').split('-');
  sh.getRange(row, 1).setValue(id);
  sh.getRange(row, 2).setValue(Utilities.parseDate(`${y}-${mo}-${da}`, TZ, 'yyyy-M-d')); // meia-noite em Brasília: data sem hora
  sh.getRange(row, 3).setValue(Utilities.formatDate(when, TZ, 'HH:mm'));
  sh.getRange(row, 8, 1, 6).setValues([[tipo, STATUS[d.status] || 'Rascunho', d.title || '', d.category || '', d.postUrl || '', d.newsUrl || '']]);
  if (!sh.getRange(row, 4).getFormula()) sh.getRange(row - 1, 4, 1, 4).copyTo(sh.getRange(row, 4, 1, 4)); // linha nova além das prontas: copia as fórmulas de dia, semana, mês e ano
  sh.getRange(row, 2).setNumberFormat('dd/mm/yyyy');
  borda(sh.getRange(row, 1, 1, 13));
  return ContentService.createTextOutput('ok');
}

// bordas finas em volta de cada célula, pra separar as áreas
function borda(r) { r.setBorder(true, true, true, true, true, true, '#c7d2dc', SpreadsheetApp.BorderStyle.SOLID); }

// tira as linhas de rascunho/excluído e põe bordas na aba Posts (a montar() chama essa)
function arrumar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Posts');
  const n = sh.getLastRow();
  if (n >= 2) {
    const st = sh.getRange(2, 9, n - 1, 1).getValues();
    for (let i = st.length - 1; i >= 0; i--) if (st[i][0] === 'Rascunho' || st[i][0] === 'Excluído') sh.deleteRow(i + 2);
  }
  const last = Math.max(sh.getLastRow(), 1);
  borda(sh.getRange(1, 1, last, 13));
}

// ===== PAINEL + CALENDÁRIO =====
// rode UMA vez pelo editor: selecione "montar" e clique em Executar. Pode rodar de novo quando quiser (refaz tudo, os dados da aba Posts ficam intactos)
const AZUL = '#0f2742', TURQ = '#14b8a6', CINZA = '#eef2f6';
const MESES_INICIO = new Date(2026, 9, 1), MESES_QTD = 15; // out/2026 até dez/2027

// escreve fórmula; se o idioma da planilha não aceitar vírgula, tenta com ponto e vírgula
function fx(rg, formula) {
  rg.setFormula(formula); SpreadsheetApp.flush();
  if (String(rg.getCell(1, 1).getDisplayValue()).indexOf('#ERR') === 0) { rg.setFormula(formula.replace(/,/g, ';')); SpreadsheetApp.flush(); }
}
function aba(ss, nome) { let s = ss.getSheetByName(nome); if (s) { s.clear(); s.clearConditionalFormatRules(); s.getDataRange().clearDataValidations(); } else s = ss.insertSheet(nome); s.setHiddenGridlines(true); return s; }
function titulo(s, txt, ate) { s.getRange(1, 1).setValue(txt).setFontSize(18).setFontWeight('bold').setFontColor(AZUL); s.setRowHeight(1, 36); }
function cab(rg) { rg.setBackground(AZUL).setFontColor('#fff').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle'); }
function listaMeses(s, col) { // lista auxiliar de meses (coluna escondida) pro menu de escolha
  const v = []; for (let i = 0; i < MESES_QTD; i++) v.push([new Date(2026, 9 + i, 1)]);
  s.getRange(1, col, MESES_QTD, 1).setValues(v).setNumberFormat('mmmm yyyy'); s.hideColumns(col);
  return s.getRange(1, col, MESES_QTD, 1);
}
const POSTS = (c) => `Posts!$${c}$2:$${c}`;

function montar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSpreadsheetTimeZone() !== TZ) ss.setSpreadsheetTimeZone(TZ);
  const posts = ss.getSheetByName('Posts');
  // aba Posts: menus nas colunas Tipo e Status, data com validação, e limpa o que sobrou de rascunho/excluído
  const n = posts.getMaxRows() - 1;
  posts.getRange(2, 8, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Post', 'Story', 'Post + Story', 'Carrossel', 'Vídeo'], true).setAllowInvalid(true).build());
  posts.getRange(2, 9, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Programado', 'Postado'], true).setAllowInvalid(true).build());
  posts.getRange(2, 2, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Data no formato dd/mm/aaaa').build());
  arrumar();
  montarPainel(ss); montarMes(ss); montarSemana(ss); montarQuadro(ss);
  ss.setActiveSheet(ss.getSheetByName('Painel'));
}

function montarPainel(ss) {
  const s = aba(ss, 'Painel'); titulo(s, 'Painel de posts');
  s.getRange(2, 1).setValue('Conta só o que está como Postado. Story conta como story, não como post. Tudo se atualiza sozinho a partir da aba Posts.').setFontColor('#64748b');
  // totais
  const tot = [['Posts no feed', `COUNTIFS(${POSTS('I')},"Postado",${POSTS('H')},"<>Story")`], ['Stories', `COUNTIFS(${POSTS('I')},"Postado",${POSTS('H')},"*Story*")`], ['Programados', `COUNTIFS(${POSTS('I')},"Programado")`]];
  tot.forEach((t, i) => { s.getRange(4, 1 + i * 2).setValue(t[0]).setFontColor('#64748b'); fx(s.getRange(5, 1 + i * 2), '=' + t[1]); s.getRange(5, 1 + i * 2).setFontSize(22).setFontWeight('bold').setFontColor(AZUL).setHorizontalAlignment('left'); });
  // mês a mês, separado por ano
  s.getRange(7, 1).setValue('Mês a mês').setFontSize(13).setFontWeight('bold').setFontColor(AZUL);
  const H = ['Mês', 'Posts no feed', 'Stories', 'Programados', 'Total postado'];
  s.getRange(8, 1, 1, 5).setValues([H]); cab(s.getRange(8, 1, 1, 5));
  let r = 9, ano = 0, anoRow = 0, linhas = [];
  const fechaAno = () => { if (!anoRow) return; [2, 3, 4, 5].forEach(c => { const L = String.fromCharCode(64 + c); fx(s.getRange(anoRow, c), `=SUM(${L}${anoRow + 1}:${L}${r - 1})`); }); };
  for (let i = 0; i < MESES_QTD; i++) {
    const d = new Date(2026, 9 + i, 1);
    if (d.getFullYear() !== ano) {
      fechaAno(); ano = d.getFullYear(); anoRow = r;
      s.getRange(r, 1).setValue('Total ' + ano); s.getRange(r, 1, 1, 5).setBackground(TURQ).setFontColor('#fff').setFontWeight('bold'); r++;
    }
    s.getRange(r, 1).setValue(d).setNumberFormat('mmmm yyyy').setHorizontalAlignment('left');
    const de = `$A${r}`, ate = `EDATE($A${r},1)`, per = `${POSTS('B')},">="&${de},${POSTS('B')},"<"&${ate}`;
    fx(s.getRange(r, 2), `=COUNTIFS(${per},${POSTS('I')},"Postado",${POSTS('H')},"<>Story")`);
    fx(s.getRange(r, 3), `=COUNTIFS(${per},${POSTS('I')},"Postado",${POSTS('H')},"*Story*")`);
    fx(s.getRange(r, 4), `=COUNTIFS(${per},${POSTS('I')},"Programado")`);
    fx(s.getRange(r, 5), `=B${r}+C${r}`);
    r++;
  }
  fechaAno(); const fim = r - 1;
  s.getRange(9, 2, fim - 8, 4).setHorizontalAlignment('center');
  borda(s.getRange(8, 1, fim - 7, 5));
  // semanas (8 semanas a partir da segunda desta semana)
  const c0 = 7; s.getRange(7, c0).setValue('Semana a semana').setFontSize(13).setFontWeight('bold').setFontColor(AZUL);
  s.getRange(8, c0, 1, 4).setValues([['Semana (segunda)', 'Posts no feed', 'Stories', 'Programados']]); cab(s.getRange(8, c0, 1, 4));
  for (let i = 0; i < 12; i++) {
    const rr = 9 + i, cell = `$G${rr}`;
    fx(s.getRange(rr, c0), `=TODAY()-WEEKDAY(TODAY(),2)+1+${(i - 4) * 7}`); s.getRange(rr, c0).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('left');
    const per = `${POSTS('B')},">="&${cell},${POSTS('B')},"<"&(${cell}+7)`;
    fx(s.getRange(rr, c0 + 1), `=COUNTIFS(${per},${POSTS('I')},"Postado",${POSTS('H')},"<>Story")`);
    fx(s.getRange(rr, c0 + 2), `=COUNTIFS(${per},${POSTS('I')},"Postado",${POSTS('H')},"*Story*")`);
    fx(s.getRange(rr, c0 + 3), `=COUNTIFS(${per},${POSTS('I')},"Programado")`);
  }
  s.getRange(9, c0 + 1, 12, 3).setHorizontalAlignment('center'); borda(s.getRange(8, c0, 13, 4));
  s.setColumnWidth(1, 150); [2, 3, 4, 5].forEach(c => s.setColumnWidth(c, 105)); s.setColumnWidth(6, 40); s.setColumnWidth(7, 130); [8, 9, 10].forEach(c => s.setColumnWidth(c, 105));
  s.setFrozenRows(0);
}

function montarMes(ss) {
  const s = aba(ss, 'Calendário Mês'); titulo(s, 'Calendário do mês');
  s.getRange(2, 1).setValue('Escolha o mês:').setFontWeight('bold');
  const hoje = new Date(), ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const sel = s.getRange(2, 2, 1, 2).merge().setValue(ini < MESES_INICIO ? MESES_INICIO : ini).setNumberFormat('mmmm yyyy').setBackground('#fff7d6').setFontWeight('bold').setHorizontalAlignment('center');
  sel.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(listaMeses(s, 20), true).setAllowInvalid(false).build());
  s.getRange(3, 1).setValue('Para criar ou mudar um post, edite na aba Posts (data, tipo, status). Aqui aparece sozinho.').setFontColor('#64748b');
  ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].forEach((d, i) => s.getRange(5, 1 + i).setValue(d));
  cab(s.getRange(5, 1, 1, 7));
  for (let w = 0; w < 6; w++) for (let c = 0; c < 7; c++) {
    const rn = 6 + w * 2, rt = rn + 1;
    fx(s.getRange(rn, 1 + c), `=$B$2-WEEKDAY($B$2,2)+1+${w * 7 + c}`);
    const X = s.getRange(rn, 1 + c).getA1Notation();
    fx(s.getRange(rt, 1 + c), `=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(TEXT(${POSTS('C')},"hh:mm")&" "&${POSTS('H')}&" "&LEFT(${POSTS('J')},32),${POSTS('B')}=${X})),"")`);
  }
  for (let w = 0; w < 6; w++) {
    const rn = 6 + w * 2;
    s.getRange(rn, 1, 1, 7).setNumberFormat('d').setHorizontalAlignment('right').setFontWeight('bold').setBackground(CINZA).setFontColor(AZUL);
    s.getRange(rn + 1, 1, 1, 7).setWrap(true).setVerticalAlignment('top').setFontSize(9);
    s.setRowHeight(rn, 22); s.setRowHeight(rn + 1, 92);
  }
  borda(s.getRange(6, 1, 12, 7));
  const reg = s.getRange(6, 1, 12, 7);
  s.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER(A6),MOD(ROW()-6,2)=0,MONTH(A6)<>MONTH($B$2))').setFontColor('#b6c0cc').setRanges([reg]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(ISNUMBER(A6),MOD(ROW()-6,2)=0,A6=TODAY())').setBackground(TURQ).setFontColor('#fff').setRanges([reg]).build(),
  ]);
  for (let c = 1; c <= 7; c++) s.setColumnWidth(c, 150);
}

function montarSemana(ss) {
  const s = aba(ss, 'Calendário Semana'); titulo(s, 'Calendário da semana');
  s.getRange(2, 1).setValue('Digite qualquer data da semana:').setFontWeight('bold');
  s.getRange(2, 3).setValue(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).setNumberFormat('dd/mm/yyyy').setBackground('#fff7d6').setFontWeight('bold').setHorizontalAlignment('center')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  s.getRange(3, 1).setValue('Para criar ou mudar um post, edite na aba Posts. Aqui aparece sozinho.').setFontColor('#64748b');
  ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].forEach((d, i) => s.getRange(5, 1 + i).setValue(d)); cab(s.getRange(5, 1, 1, 7));
  for (let c = 0; c < 7; c++) {
    fx(s.getRange(6, 1 + c), `=INT($C$2)-WEEKDAY($C$2,2)+1+${c}`);
    const X = s.getRange(6, 1 + c).getA1Notation();
    fx(s.getRange(7, 1 + c), `=IFERROR(TEXTJOIN(CHAR(10)&CHAR(10),TRUE,FILTER(TEXT(${POSTS('C')},"hh:mm")&" "&${POSTS('H')}&" ("&${POSTS('I')}&")"&CHAR(10)&${POSTS('J')}&CHAR(10)&${POSTS('K')},${POSTS('B')}=${X})),"")`);
  }
  s.getRange(6, 1, 1, 7).setNumberFormat('dd/mm').setHorizontalAlignment('center').setFontWeight('bold').setBackground(CINZA).setFontColor(AZUL);
  s.getRange(7, 1, 1, 7).setWrap(true).setVerticalAlignment('top').setFontSize(10); s.setRowHeight(7, 380);
  s.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=A6=TODAY()').setBackground(TURQ).setFontColor('#fff').setRanges([s.getRange(6, 1, 1, 7)]).build()]);
  borda(s.getRange(6, 1, 2, 7));
  for (let c = 1; c <= 7; c++) s.setColumnWidth(c, 190);
}

function montarQuadro(ss) {
  const s = aba(ss, 'Quadro'); titulo(s, 'Quadro');
  s.getRange(2, 1).setValue('Programados em ordem de data, Postados do mais recente pro mais antigo. Edite na aba Posts.').setFontColor('#64748b');
  const col = (c0, nome, st, asc) => {
    s.getRange(4, c0, 1, 2).merge().setValue(nome); cab(s.getRange(4, c0, 1, 2));
    s.getRange(5, c0, 1, 2).setValues([['Data', 'Post']]).setFontWeight('bold').setBackground(CINZA);
    const cond = `${POSTS('I')}="${st}"`;
    fx(s.getRange(6, c0), `=IFERROR(SORT(FILTER(${POSTS('B')},${cond}),1,${asc}),"")`);
    fx(s.getRange(6, c0 + 1), `=IFERROR(SORT(FILTER(${POSTS('H')}&" · "&${POSTS('J')},${cond}),FILTER(${POSTS('B')},${cond}),${asc}),"")`);
    s.getRange(6, c0, 200, 1).setNumberFormat('dd/mm/yyyy').setVerticalAlignment('top');
    s.getRange(6, c0 + 1, 200, 1).setWrap(true).setVerticalAlignment('top');
    s.setColumnWidth(c0, 95); s.setColumnWidth(c0 + 1, 330);
  };
  col(1, 'Programados', 'Programado', 'TRUE'); s.setColumnWidth(3, 30); col(4, 'Postados', 'Postado', 'FALSE');
  s.setFrozenRows(5);
}

// refaz só os calendários (mais rápido que a montar)
function refazCalendarios() { const ss = SpreadsheetApp.getActiveSpreadsheet(); montarMes(ss); montarSemana(ss); }
