// Templates do Figma "Reconstruções | Templates Social" desenhados em canvas.
// Medidas, cores e fontes tiradas direto dos frames (posts 1080x1350, stories 1080x1920).
const Render = (() => {
  const C = { tealM: '#008995', turq: '#00b0ac', verde: '#5cbba4', tealE: '#006173', preto: '#1d1d1b', navy: '#0f172a', cinza: '#f1f5f9', branco: '#ffffff' };
  const F = 'Nunito, system-ui, sans-serif';
  const BRAND = { handle: '@reconstrucoes.observatorio', site: 'reconstrucoes.digital' };

  const POSTS = [
    { id: 'p01', name: 'Post 1' },
    { id: 'p04', name: 'Post 2' },
    { id: 'p02', name: 'Post 3' },
    { id: 'p03', name: 'Post 4' }
  ];
  const CAROUSELS = [
    { id: 'A', name: 'Carrossel A (texto e dados)' },
    { id: 'B', name: 'Carrossel B (fotos)' }
  ];
  const STORIES = [
    { id: 's02', name: 'Story 1' },
    { id: 's03', name: 'Story 2' },
    { id: 's01', name: 'Story 3' },
    { id: 's04', name: 'Story 4' }
  ];
  // qualquer modelo de post também vale como slide ('p:p02' = Última hora etc.)
  const POST_SLIDES = POSTS.map(p => ({ id: 'p:' + p.id, name: p.name }));
  const SLIDE_TYPES = {
    A: [{ id: 'foto', name: 'Só a foto' }, { id: 'contexto', name: 'Título e texto' }, { id: 'dado', name: 'Número grande' }, { id: 'resumo', name: 'Lista de itens' }, ...POST_SLIDES],
    B: [{ id: 'foto', name: 'Só a foto' }, { id: 'legenda', name: 'Foto + legenda' }, { id: 'destaque', name: 'Foto + destaque' }, ...POST_SLIDES]
  };

  // ---------- recursos ----------
  const imgs = {};
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image(); img.crossOrigin = 'anonymous'; // fotos do R2 (outro domínio) sem travar o canvas
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não consegui carregar a imagem'));
      // endereço só do canvas: se o navegador reaproveitar a foto de um <img> comum (sem CORS) do R2, o canvas não consegue ler e a foto some
      img.src = /^https?:/i.test(url) ? '/api/img?url=' + encodeURIComponent(url) : url + (url.startsWith('/images/') ? (url.includes('?') ? '&' : '?') + 'cv=1' : '');
    });
  }
  async function asset(name) {
    if (!(name in imgs)) imgs[name] = loadImage(`/assets/${name}.png`).catch(() => null);
    return imgs[name];
  }
  async function ensureFonts() {
    try { await Promise.all(['400', '600', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px Nunito`))); } catch {}
  }

  // ---------- desenho básico ----------
  let S = 1; // escala de saída: 1 = 1080px, 2 = 4K (2160px de largura)
  function setup(canvas, w, h) { canvas.width = w * S; canvas.height = h * S; const ctx = canvas.getContext('2d'); ctx.setTransform(S, 0, 0, S, 0, 0); ctx.textBaseline = 'top'; return ctx; }
  function font(ctx, weight, size, spacing = 0) {
    ctx.font = `${weight} ${size}px ${F}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
  }
  function placeholderPhoto(ctx, x, y, w, h) {
    // mesmo degradê do retângulo "FOTO" do Figma
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, C.navy); g.addColorStop(0.714, C.tealM); g.addColorStop(1, C.tealM);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  function photo(ctx, img, x, y, w, h, focal) {
    const iw = img && (img.videoWidth || img.width), ih = img && (img.videoHeight || img.height);
    if (!img || !iw || !ih) return placeholderPhoto(ctx, x, y, w, h);
    const f = focal || { x: 0.5, y: 0.5, zoom: 1 };
    const cov = Math.max(w / iw, h / ih);
    const s = cov * (f.zoom || 1);
    const dw = iw * s, dh = ih * s;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (dw < w - 1 || dh < h - 1) { // foto menor que o quadro: fundo com a própria foto borrada
      try { ctx.filter = 'blur(40px) brightness(.7)'; } catch (e) {}
      ctx.drawImage(img, x - w * .1 - (iw * cov - w) * .5, y - h * .1 - (ih * cov - h) * .5, iw * cov * 1.0 + w * .2, ih * cov * 1.0 + h * .2);
      ctx.filter = 'none';
    }
    const px = dw >= w ? x - (dw - w) * f.x : x + (w - dw) / 2, py = dh >= h ? y - (dh - h) * f.y : y + (h - dh) / 2;
    ctx.drawImage(img, px, py, dw, dh);
    ctx.restore();
  }
  function vgrad(ctx, y, h, c0, c1, w = 1080) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.fillRect(0, y, w, h);
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      let cur = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = cur ? cur + ' ' + word : word;
        if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = word; }
      }
      out.push(cur);
    }
    return out.filter((l, i, a) => l || (i && i < a.length - 1));
  }
  // linhas equilibradas (sem "viúva"): procura a menor largura que mantém o mesmo número de linhas,
  // assim as linhas ficam parecidas entre si sem esticar espaços como no justificado
  function balance(ctx, text, maxW, n) {
    let lo = maxW * 0.45, hi = maxW, best = wrap(ctx, text, maxW);
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2, t = wrap(ctx, text, mid);
      if (t.length <= n && t.every(ln => ctx.measureText(ln).width <= mid + 0.5)) { best = t; hi = mid; } else lo = mid;
    }
    return best;
  }
  // mede um bloco de texto; se passar de maxLines, diminui a fonte (mínimo 70% do tamanho do template)
  function block(ctx, text, weight, size, lh, maxW, maxLines = 99, spacing = 0) {
    let s = size, l = lh, lines;
    for (; s >= size * 0.7; s -= 2, l = lh * s / size) {
      font(ctx, weight, s, spacing); lines = wrap(ctx, text, maxW);
      if (lines.length <= maxLines) break;
    }
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    else if (lines.length > 1) lines = balance(ctx, text, maxW, lines.length);
    return { weight, size: s, lh: l, lines, spacing, h: lines.length * l };
  }
  function draw(ctx, b, x, y, color, align = 'left', w = 0) {
    font(ctx, b.weight, b.size, b.spacing); ctx.fillStyle = color; ctx.textAlign = align;
    const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    // compensa a diferença entre altura de linha e tamanho da fonte (texto centrado na linha, como no Figma)
    const off = (b.lh - b.size * 1.364) / 2;
    b.lines.forEach((ln, i) => ctx.fillText(ln, ax, y + i * b.lh + off));
    ctx.textAlign = 'left';
    return y + b.h;
  }
  const lineH = size => size * 1.364; // "leading normal" da Nunito
  // selo com o texto centrado de verdade (mede a caixa real das letras, não a altura da linha)
  function chip(ctx, text, x, y, size, opts = {}) {
    const sp = opts.sp ?? 1; font(ctx, opts.weight || 900, size, sp); ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text), tw = m.width + ('letterSpacing' in ctx ? 0 : sp * text.length);
    const asc = ctx.measureText('H').actualBoundingBoxAscent || size * 0.72, desc = 0; // centra pela altura das maiúsculas (acento não empurra o texto)
    const padX = opts.pad ?? Math.round(size * 0.75);
    const w = Math.ceil(tw - sp) + padX * 2, h = opts.h ?? lineH(size) + 24; // altura fixa: o layout dos templates conta com ela
    const ax = opts.right ? x - w : opts.center ? x - w / 2 : x;
    ctx.fillStyle = opts.bg || C.turq; rrect(ctx, ax, y, w, h, opts.r ?? Math.round(size * 0.33)); ctx.fill();
    ctx.fillStyle = opts.color || C.navy;
    ctx.fillText(text, ax + padX, y + (h + asc - desc) / 2); ctx.textBaseline = 'top';
    return { w, h };
  }
  async function logo(ctx, dark, x, y, w) {
    const img = await asset(dark ? 'logo-escuro' : 'logo-branco');
    if (img) return ctx.drawImage(img, x, y, w, w * img.height / img.width);
    font(ctx, 900, w * 0.19); ctx.fillStyle = dark ? C.preto : C.branco; ctx.fillText('Reconstruções', x, y + w * 0.1);
  }
  // Símbolo da marca (grade 3x3 de triângulos), em vetor para ficar nítido em qualquer tamanho
  function symbol(ctx, x, y, size, alpha = 1) {
    const u = size / 3, P = (a, b) => [x + a * u, y + b * u];
    const tri = (pts, color) => { ctx.beginPath(); pts.forEach(([a, b], i) => i ? ctx.lineTo(...P(a, b)) : ctx.moveTo(...P(a, b))); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); };
    ctx.save(); ctx.globalAlpha = alpha;
    tri([[0, 1], [1, 0], [1, 1]], C.verde);
    tri([[1, 0], [2, 0], [2, 1]], C.verde); tri([[1, 0], [2, 1], [1, 1]], C.turq);
    tri([[2, 0], [3, 0], [2, 1]], C.turq); tri([[3, 0], [3, 1], [2, 1]], C.tealM);
    tri([[2, 1], [3, 1], [3, 2]], C.tealE); tri([[2, 1], [3, 2], [2, 2]], C.tealM);
    tri([[2, 2], [3, 2], [2, 3]], C.tealE);
    ctx.restore();
  }
  function credit(ctx, text, bottomY, x = 1050) {
    if (!text) return;
    ctx.save(); ctx.translate(x, bottomY); ctx.rotate(-Math.PI / 2);
    font(ctx, 600, 22); ctx.fillStyle = C.branco; ctx.textBaseline = 'bottom';
    ctx.fillText('FOTO: ' + text, 0, 0);
    ctx.restore(); ctx.textBaseline = 'top';
  }
  function counter(ctx, i, n, dark) { font(ctx, 700, 30); ctx.fillStyle = dark ? C.preto : C.branco; ctx.textAlign = 'right'; ctx.fillText(`${i}/${n}`, 1008, 71.5); ctx.textAlign = 'left'; }
  function footer(ctx, dark, last) {
    font(ctx, 600, 28); ctx.fillStyle = dark ? C.preto : C.branco;
    ctx.fillText(BRAND.handle, 72, 1222 + 9);
    if (!last) chip(ctx, 'ARRASTE →', 1008, 1219, 28, { right: true });
  }
  const up = s => String(s || '').toUpperCase();
  const cleanCat = s => { const v = String(s || '').trim(); return /^(uncategorized|sem categoria)$/i.test(v) ? '' : v; };
  const catOf = d => cleanCat(d.category); // categoria em branco = sem texto (fica só o tracinho)
  const G = 18; // respiro padrão entre blocos de texto nos posts (o story usa 22, como o Foto em cima + painel)
  // aparência editável: painel atrás do texto (post e story) e cor/degradê do fundo dos stories
  const LOOK = { post: { on: false, color: '#0f172a', opacity: 70, bw: 0, bc: '#ffffff', bo: 60, r: 28, tc: 'auto' }, story: { on: false, color: '#0f172a', opacity: 70, bw: 0, bc: '#ffffff', bo: 60, r: 28, tc: 'auto' }, bg: { color: C.tealE, fade: 100, ph: 760, tc: 'auto', op: 100, sym: false }, uh: { bg: C.tealE, acc: C.turq, size: 48, bar: '', chip: '' }, tag: { on: true, bg: C.turq, tc: C.navy }, pbar: { bar: '' }, nd: { ph: 680, sym: true, cat: C.tealM, pill: false }, cut: { bg: C.navy, size: 52, bar: C.verde } }; // uh.bar: '' = igual ao destaque, 'none' = sem barra
  const UH_PRESETS = [['Verde petróleo', C.tealE, C.turq], ['Amarelo', '#735400', '#fabd0d'], ['Azul marinho', C.navy, C.turq], ['Teal', C.tealM, C.verde], ['Preto', C.preto, '#fabd0d']];
  const look = d => ({ post: { ...LOOK.post, ...((d.look || {}).post) }, story: { ...LOOK.story, ...((d.look || {}).story) }, bg: { ...LOOK.bg, ...((d.look || {}).bg) }, uh: { ...LOOK.uh, ...(d.tpl && d.tpl.post === 'p05' ? { bg: '#735400', acc: '#fabd0d' } : {}), ...((d.look || {}).uh) }, cut: { ...LOOK.cut, ...((d.look || {}).cut) }, tag: { ...LOOK.tag, ...((d.look || {}).tag) }, pbar: { ...LOOK.pbar, ...((d.look || {}).pbar) }, nd: { ...LOOK.nd, ...((d.look || {}).nd) } });
  // selo do story: mesmo desenho do selo original (cantos 10), só mais baixo; cor e visibilidade editáveis
  const SCH = lineH(28) + 16;
  const stag = (ctx, d, text, x, y, o = {}) => { const { bg, tc } = look(d).tag; return chip(ctx, text, x, y, 28, { bg, color: tc === C.branco ? C.branco : C.navy, h: SCH, pad: 21, r: 10, ...o }); };
  const SCG = 26; // respiro extra entre o selo e o título no story
  const rgba = (hex, a) => { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const lum = hex => { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(n >> 16) + .7152 * f((n >> 8) & 255) + .0722 * f(n & 255); };
  // cor do texto: a escolhida, ou automática (escura quando o fundo atrás do texto é claro)
  const ink = (p, bgColor, solid) => p.tc && p.tc !== 'auto' ? p.tc : (solid && lum(bgColor) > 0.5 ? C.preto : C.branco);
  const panelInk = p => ink(p, p.color, p.on && p.opacity >= 45);
  const darkInk = c => lum(c) < 0.2; // texto escuro: troca acentos claros por versões escuras
  function panel(ctx, p, y, h) { if (!p.on) return; ctx.fillStyle = rgba(p.color, p.opacity / 100); rrect(ctx, 36, y, 1008, h, p.r); ctx.fill();
    if (p.bw > 0) { ctx.strokeStyle = rgba(p.bc, p.bo / 100); ctx.lineWidth = p.bw; rrect(ctx, 36 + p.bw / 2, y + p.bw / 2, 1008 - p.bw, h - p.bw, Math.max(0, p.r - p.bw / 2)); ctx.stroke(); } }

  // ---------- posts ----------
  async function post(canvas, d, img) {
    await ensureFonts();
    const ctx = setup(canvas, 1080, 1350), t = d.tpl.post || 'p01';
    if (t === 'p02' || t === 'p05') {
      const uh = look(d).uh, bgc = uh.bg, acc = uh.acc; // cores escolhidas (p05 antigo = amarelo)
      ctx.fillStyle = bgc; ctx.fillRect(0, 0, 1080, 1350);
      photo(ctx, img, 0, 0, 1080, 1350, d.focal); // foto ocupa tudo, cor só embaixo do texto
      const gh = 1350 * uh.size / 100; // tamanho do degradê, 0 a 100% da altura
      ctx.save(); ctx.globalAlpha = 0.92; vgrad(ctx, 1350 - gh, gh, rgba(bgc, 0), bgc); ctx.restore();
      await logo(ctx, false, 72, 72, 298.7);
      if (uh.bar !== 'none') { ctx.fillStyle = uh.bar || acc; ctx.fillRect(0, 1334, 1080, 16); }
      const ti = block(ctx, d.title, 900, 66, 72, 936, 4), de = d.description ? block(ctx, d.description, 400, 30, 39, 936, 3) : null;
      const noChip = uh.chip === 'none', chipH = noChip ? -G : lineH(36) + 24, hh = lineH(30); // sem selo: não deixa espaço
      let y = 1350 - 96 - hh - G - (de ? de.h + G : 0) - ti.h - G - chipH;
      const cc = uh.chip || acc; if (!noChip) chip(ctx, up(d.chip || 'Última hora'), 72, y, 36, { bg: cc, color: lum(cc) > 0.35 ? C.navy : C.branco }); y += chipH + G;
      y = draw(ctx, ti, 72, y, C.branco) + G;
      if (de) y = draw(ctx, de, 72, y, C.branco) + G;
      font(ctx, 600, 30); ctx.fillStyle = C.branco; ctx.fillText(BRAND.handle, 72, y);
      credit(ctx, d.credit, 790);
    } else if (t === 'p03') {
      ctx.fillStyle = C.navy; ctx.fillRect(0, 0, 1080, 1350);
      photo(ctx, img, 0, 0, 1080, 1350, d.focal);
      ctx.fillStyle = 'rgba(0,97,115,0.6)'; ctx.fillRect(0, 0, 1080, 1350); // película de cor
      // título grande atrás do recorte (2 linhas de 190px)
      const words = up(d.bigTitle || String(d.title || '').split(/\s+/).slice(0, 2).join(' ')).split(/\s+/).filter(Boolean);
      const big = [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')].filter(Boolean);
      let bs = 190; font(ctx, 900, bs); while (bs > 90 && Math.max(...big.map(w => ctx.measureText(w).width)) > 936) { bs -= 6; font(ctx, 900, bs); }
      ctx.fillStyle = C.branco; big.forEach((w, i) => ctx.fillText(w, 72, 225 + i * bs * 0.895 + (bs * 0.895 - bs * 1.364) / 2));
      if (d.cutoutImg) { // recorte PNG sem fundo, encaixado na caixa do Figma (230,300 620x900), apoiado embaixo
        const c = d.cutoutImg, k = Math.min(620 / c.width, 900 / c.height), w = c.width * k, h = c.height * k;
        ctx.drawImage(c, 230 + (620 - w) / 2, 300 + 900 - h, w, h);
      } // sem recorte: fica só a foto, sem caixa nem aviso
      const cu = look(d).cut, gh = 1350 * cu.size / 100, barH = cu.bar === 'none' ? 0 : 8 + G;
      vgrad(ctx, 1350 - gh, gh, rgba(cu.bg, 0), rgba(cu.bg, 0.92));
      await logo(ctx, false, 72, 72, 298.7);
      const ti = block(ctx, d.title, 800, 46, 52, 936, 2), hh = lineH(30) + G;
      const cat = catOf(d);
      let y = 1350 - 96 - hh - ti.h - barH - (cat ? G + lineH(36) : 0);
      if (cat) { font(ctx, 700, 36, 2); ctx.fillStyle = C.verde; ctx.fillText(up(cat), 72, y, 936); y += lineH(36) + G; }
      if (barH) { ctx.fillStyle = cu.bar; rrect(ctx, 72, y, 300, 8, 4); ctx.fill(); y += barH; }
      y = draw(ctx, ti, 72, y, C.branco) + G;
      font(ctx, 600, 30); ctx.fillStyle = C.branco; ctx.fillText(BRAND.handle, 72, y);
      credit(ctx, d.credit, 1249);
    } else if (t === 'p04') {
      ctx.fillStyle = C.branco; ctx.fillRect(0, 0, 1080, 1350);
      const nd = look(d).nd, ph = nd.ph; // altura da foto editável, o resto é o fundo branco
      photo(ctx, img, 0, 0, 1080, ph, d.focal);
      if (nd.sym) symbol(ctx, 880, ph - 52, 105.6);
      let y = ph + 48;
      if (catOf(d) && nd.pill) { chip(ctx, up(catOf(d)), 72, ph + 40, 32, { bg: nd.cat, color: lum(nd.cat) > 0.35 ? C.navy : C.branco, sp: 2 }); y = ph + 40 + lineH(32) + 24 + 44; }
      else if (catOf(d)) { font(ctx, 700, 32, 2); ctx.fillStyle = nd.cat; ctx.fillText(up(catOf(d)), 72, y, 936); y += lineH(32) + 20; }
      y = draw(ctx, block(ctx, d.title, 900, 56, 62, 936, 4), 72, y, C.preto) + G;
      if (d.description) y = draw(ctx, block(ctx, d.description, 400, 30, 39, 936, 3), 72, y, C.preto) + G;
      if (d.source) { font(ctx, 400, 26); ctx.fillStyle = 'rgba(29,29,27,.6)'; ctx.fillText('Fonte: ' + d.source, 72, y); }
      await logo(ctx, true, 72, 1228, 186.7);
      font(ctx, 700, 28); ctx.fillStyle = C.tealM; ctx.textAlign = 'right'; ctx.fillText(BRAND.site, 1008, 1234); ctx.textAlign = 'left';
      credit(ctx, d.credit, 640);
    } else {
      await coverA(ctx, d, img, 64, 70, 96, true);
    }
  }
  // capa com foto inteira (Post 01, A1 e B1)
  async function coverA(ctx, d, img, size, lh, pb, withHandle) {
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, 1080, 1350);
    photo(ctx, img, 0, 0, 1080, 1350, d.focal);
    vgrad(ctx, 450, 900, 'rgba(15,23,42,0)', 'rgba(15,23,42,0.92)');
    vgrad(ctx, 0, 300, 'rgba(15,23,42,0.55)', 'rgba(15,23,42,0)');
    await logo(ctx, false, 72, 72, 298.7);
    const ti = block(ctx, d.title, 900, size, lh, 936, withHandle ? 4 : 5), hh = withHandle ? lineH(30) + G : 0;
    const cat = catOf(d), catH = cat ? lineH(40) + G : 0, pbar = look(d).pbar.bar, barH = pbar === 'none' ? 0 : 8 + G;
    let y = 1350 - pb - hh - ti.h - barH - catH;
    const lp = look(d).post, tc = panelInk(lp), dk = darkInk(tc);
    panel(ctx, lp, y - 36, catH + barH + ti.h + (withHandle ? G + lineH(30) : 0) + 72);
    ctx.fillStyle = dk ? C.tealE : C.verde;
    if (cat) { font(ctx, 700, 40, 2); ctx.fillText(up(cat), 72, y, 936); y += catH; }
    if (barH) { if (pbar) ctx.fillStyle = pbar; rrect(ctx, 72, y, 300, 8, 4); ctx.fill(); y += barH; }
    y = draw(ctx, ti, 72, y, tc) + G;
    if (withHandle) { font(ctx, 600, 30); ctx.fillStyle = tc; ctx.fillText(BRAND.handle, 72, y); credit(ctx, d.credit, 1278); }
  }

  // ---------- carrossel ----------
  function normSlide(s) { return typeof s === 'string' ? { type: '', text: s } : (s || {}); }
  function slidesOf(d) { return (d.slides || []).map(normSlide); }
  function count(d) { return slidesOf(d).length + 2; }
  async function slide(canvas, d, img, idx) {
    await ensureFonts();
    const ctx = setup(canvas, 1080, 1350), set = d.tpl.carousel || 'A', list = slidesOf(d), n = list.length + 2;
    if (idx === 0) return post(canvas, d, img); // capa usa o modelo de post escolhido
    if (idx === n - 1) return cta(ctx, set, n);
    const s = list[idx - 1], types = SLIDE_TYPES[set].map(x => x.id);
    let type = types.includes(s.type) ? s.type : types[0];
    if (type.startsWith('p:')) {
      const simg = (s.photoUrl && d.imgs && d.imgs[s.photoUrl]) || img;
      return post(canvas, { ...d, tpl: { ...d.tpl, post: type.slice(2) }, focal: s.photoUrl ? (s.focal || { x: .5, y: .5, zoom: 1 }) : d.focal }, simg);
    }
    if (type === 'contexto') {
      ctx.fillStyle = C.tealE; ctx.fillRect(0, 0, 1080, 1350);
      const bgi = s.photoUrl && d.imgs && d.imgs[s.photoUrl]; // se o slide tem foto, ela vira o fundo
      if (bgi) { photo(ctx, bgi, 0, 0, 1080, 1350, s.focal || { x: .5, y: .5, zoom: 1 }); ctx.fillStyle = 'rgba(0,97,115,.68)'; ctx.fillRect(0, 0, 1080, 1350); } else symbol(ctx, 500, 640, 660, 0.08);
      await logo(ctx, false, 72, 72, 248.9); counter(ctx, idx + 1, n);
      let y = 240;
      font(ctx, 700, 36, 2); ctx.fillStyle = C.verde; ctx.fillText(up(s.label || 'Contexto'), 72, y); y += lineH(36) + 28;
      if (s.title) y = draw(ctx, block(ctx, s.title, 900, 68, 80, 936, 3), 72, y, C.branco) + 28;
      draw(ctx, block(ctx, s.text, 400, 36, 54, 936, s.title ? 9 : 13), 72, y, C.branco);
      footer(ctx, false);
    } else if (type === 'dado') {
      ctx.fillStyle = C.cinza; ctx.fillRect(0, 0, 1080, 1350);
      await logo(ctx, true, 72, 72, 248.9); counter(ctx, idx + 1, n, true);
      let y = 260;
      y = draw(ctx, block(ctx, s.number || '00%', 900, 280, 290, 936, 1), 72, y, C.tealM) + 12;
      y = draw(ctx, block(ctx, s.text, 700, 46, 58, 936, 6), 72, y, C.preto) + 12;
      if (s.source) { font(ctx, 400, 28); ctx.fillStyle = 'rgba(29,29,27,.6)'; ctx.fillText('Fonte: ' + s.source, 72, y); }
      footer(ctx, true);
    } else if (type === 'resumo') {
      ctx.fillStyle = C.branco; ctx.fillRect(0, 0, 1080, 1350);
      await logo(ctx, true, 72, 72, 248.9); counter(ctx, idx + 1, n, true);
      let y = 240;
      font(ctx, 900, 72); ctx.fillStyle = C.tealE; ctx.fillText(s.title || 'Resumo', 72, y); y += lineH(72) + 36;
      const items = (s.items && s.items.length ? s.items : String(s.text || '').split('\n')).filter(Boolean).slice(0, 4);
      items.forEach((it, i) => {
        const b = block(ctx, it, 700, 38, 50, 824, 3), h = Math.max(84, b.h);
        ctx.fillStyle = C.turq; ctx.beginPath(); ctx.arc(72 + 42, y + h / 2, 42, 0, Math.PI * 2); ctx.fill();
        font(ctx, 900, 44); ctx.fillStyle = C.navy; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), 114, y + h / 2 - lineH(44) / 2); ctx.textAlign = 'left';
        draw(ctx, b, 72 + 112, y + (h - b.h) / 2, C.preto);
        y += h + 36;
      });
      footer(ctx, true);
    } else {
      ctx.fillStyle = C.navy; ctx.fillRect(0, 0, 1080, 1350);
      const simg = (s.photoUrl && d.imgs && d.imgs[s.photoUrl]) || img;
      photo(ctx, simg, 0, 0, 1080, 1350, s.photoUrl ? (s.focal || { x: .5, y: .5, zoom: 1 }) : (s.focal || d.focal));
      await logo(ctx, false, 72, 72, 248.9); counter(ctx, idx + 1, n);
      if (type === 'foto' && String(s.text || '').trim()) type = 'legenda';
      if (type === 'foto') vgrad(ctx, 1000, 350, 'rgba(15,23,42,0)', 'rgba(15,23,42,0.55)');
      else if (type === 'legenda') {
        vgrad(ctx, 850, 500, 'rgba(15,23,42,0)', 'rgba(15,23,42,0.6)');
        const lab = up(s.label || catOf(d) || 'Notícia'), b = block(ctx, s.text, 700, 40, 54, 848, 5);
        const h = 44 + lineH(30) + 14 + b.h + 44, y = 1350 - 190 - h;
        ctx.fillStyle = C.navy; rrect(ctx, 72, y, 936, h, 8); ctx.fill();
        font(ctx, 700, 30, 2); ctx.fillStyle = C.verde; ctx.fillText(lab, 116, y + 44);
        draw(ctx, b, 116, y + 44 + lineH(30) + 14, C.branco);
      } else {
        vgrad(ctx, 550, 800, 'rgba(15,23,42,0)', 'rgba(15,23,42,0.92)');
        const b = block(ctx, s.text, 900, 54, 66, 896, 5), y = 1350 - 190 - b.h;
        ctx.fillStyle = C.verde; rrect(ctx, 72, y, 12, b.h, 6); ctx.fill();
        draw(ctx, b, 112, y, C.branco);
      }
      footer(ctx, false);
    }
  }
  function cta(ctx, set, n) {
    const centered = set === 'A';
    ctx.fillStyle = centered ? C.navy : C.tealE; ctx.fillRect(0, 0, 1080, 1350);
    counter(ctx, n, n);
    const sym = 228.8, chipH = lineH(32) + 24, total = sym + 28 + lineH(72) + 28 + lineH(36) + 28 + chipH;
    let y = 72 + (1350 - 72 - 96 - total) / 2;
    symbol(ctx, centered ? 540 - sym / 2 : 72, y, sym); y += sym + 28;
    const al = centered ? 'center' : 'left';
    font(ctx, 900, 72); ctx.fillStyle = C.branco; ctx.textAlign = al; ctx.fillText('Siga o Reconstruções', centered ? 540 : 72, y); y += lineH(72) + 28;
    font(ctx, 400, 36); ctx.fillText('Notícias de cidades e de sustentabilidade', centered ? 540 : 72, y); y += lineH(36) + 28;
    ctx.textAlign = 'left';
    chip(ctx, BRAND.handle, centered ? 540 : 72, y, 32, { center: centered });
  }

  // ---------- stories (retorna a área do adesivo de link) ----------
  async function story(canvas, d, img, opts = {}) {
    await ensureFonts();
    const d0 = d; d = { ...d, title: d.storyTitle || d.title, category: d.storyCategory ?? d.category }; // story pode ter título e categoria próprios
    const ctx = setup(canvas, 1080, 1920), t = d.tpl.story || 's02';
    const scat = look(d).tag.on ? catOf(d) : '';
    let zone;
    if (t === 's01') {
      const bg = look(d).bg;
      ctx.fillStyle = bg.color; ctx.fillRect(0, 0, 1080, 1920);
      symbol(ctx, 420, 1000, 792, 0.2);
      vgrad(ctx, 1020, 900, 'rgba(15,23,42,0)', `rgba(15,23,42,${0.55 * bg.fade / 100})`);
      const tc = ink(bg, bg.color, true), dk = darkInk(tc);
      await logo(ctx, dk, 72, 262, 248.9);
      if (look(d).tag.on) stag(ctx, d, 'NOVA NOTÍCIA', 980, 262.5 + (lineH(30) + 24 - SCH) / 2, { right: true });
      // card com o próprio post do feed dentro
      const pc = document.createElement('canvas'); await post(pc, d0, img);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
      rrect(ctx, 140, 380, 800, 1000, 36); ctx.fillStyle = C.navy; ctx.fill(); ctx.restore();
      ctx.save(); rrect(ctx, 140, 380, 800, 1000, 36); ctx.clip(); ctx.drawImage(pc, 140, 380, 800, 1000); ctx.restore();
      font(ctx, 700, 32); ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.fillText(BRAND.site, 540, 1400); ctx.textAlign = 'left';
      zone = { x: 140, y: 1470, w: 800, h: 110 };
    } else if (t === 's03') {
      const bg = look(d).bg, fh = 20 + 240 * bg.fade / 100; // degradê da foto pro painel: mais baixo = foto aparece mais
      const GS = 18, M = 108, TW = 1080 - 2 * M; // margem lateral maior: texto mais pro meio
      const ti = block(ctx, d.title, 900, 62, 66, TW, 4), de = d.description ? block(ctx, d.description, 400, 32, 40, TW, 3) : null, chipH = scat ? SCH + SCG : -GS;
      const need = 70 + chipH + GS + ti.h + GS + (de ? de.h + GS : 0) + 110 + 80; // altura que o texto e o adesivo precisam embaixo
      const ph = Math.round(Math.max(400, Math.min(bg.ph, 1920 - need))); // onde a foto termina e o painel começa
      const a = bg.op / 100; // opacidade do fundo: abaixo de 100 a foto aparece por trás do painel inteiro
      ctx.fillStyle = bg.color; ctx.fillRect(0, 0, 1080, 1920);
      if (a < 1) photo(ctx, img, 0, 0, 1080, 1920, (d.focalStory || d.focal));
      photo(ctx, img, 0, 0, 1080, ph, (d.focalStory || d.focal));
      ctx.fillStyle = rgba(bg.color, a); ctx.fillRect(0, ph, 1080, 1920 - ph);
      vgrad(ctx, ph - fh, fh, rgba(bg.color, 0), rgba(bg.color, a));
      vgrad(ctx, 0, 360, 'rgba(15,23,42,0.5)', 'rgba(15,23,42,0)');
      await logo(ctx, false, M, 262, 248.9);
      if (bg.sym) symbol(ctx, 1080 - M - 105.6, ph - 52, 105.6); // símbolo no fim da foto: opcional
      credit(ctx, d.credit, ph - 40);
      let y = ph + 70;
      if (scat) { stag(ctx, d, up(scat), M, y); y += SCH + SCG + GS; }
      const tc = ink(bg, bg.color, bg.op >= 45);
      y = draw(ctx, ti, M, y, tc) + GS;
      if (de) y = draw(ctx, de, M, y, tc) + GS;
      zone = { x: M, y, w: TW, h: 110 };
    } else if (t === 's04') { // foto num card arredondado sobre a cor da marca
      const bg = look(d).bg, tc = ink(bg, bg.color, true), dk = darkInk(tc);
      ctx.fillStyle = bg.color; ctx.fillRect(0, 0, 1080, 1920);
      symbol(ctx, 560, 1240, 700, dk ? 0.12 : 0.2);
      await logo(ctx, dk, 72, 262, 248.9);
      const ti = block(ctx, d.title, 900, 62, 72, 936, 4), de = d.description ? block(ctx, d.description, 400, 32, 44, 936, 3) : null, chipH = scat ? SCH + SCG : -22;
      const textH = chipH + 22 + ti.h + (de ? 22 + de.h : 0), cardH = Math.max(560, Math.min(860, 1920 - 400 - textH - 48 - 110 - 300));
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20; rrect(ctx, 72, 400, 936, cardH, 40); ctx.fillStyle = C.navy; ctx.fill(); ctx.restore();
      ctx.save(); rrect(ctx, 72, 400, 936, cardH, 40); ctx.clip(); photo(ctx, img, 72, 400, 936, cardH, (d.focalStory || d.focal)); ctx.restore();
      credit(ctx, d.credit, 400 + cardH - 36, 990);
      let y = 400 + cardH + 48;
      if (scat) stag(ctx, d, up(scat), 72, y);
      y += chipH + 22;
      y = draw(ctx, ti, 72, y, tc);
      if (de) y = draw(ctx, de, 72, y + 22, tc);
      zone = { x: 72, y: y + 36, w: 936, h: 110 };
    } else {
      ctx.fillStyle = C.navy; ctx.fillRect(0, 0, 1080, 1920);
      photo(ctx, img, 0, 0, 1080, 1920, (d.focalStory || d.focal));
      vgrad(ctx, 820, 1100, 'rgba(15,23,42,0)', 'rgba(15,23,42,0.95)');
      vgrad(ctx, 0, 420, 'rgba(15,23,42,0.55)', 'rgba(15,23,42,0)');
      await logo(ctx, false, 72, 262, 248.9);
      const ti = block(ctx, d.title, 900, 62, 72, 908, 5), chipH = scat ? SCH + SCG : -22;
      let y = 1920 - 480 - 120 - 22 - ti.h - 22 - chipH;
      const ls = look(d).story;
      panel(ctx, ls, y - 36, chipH + 22 + ti.h + 72);
      credit(ctx, d.credit, y - 36 - 30);
      if (scat) stag(ctx, d, up(scat), 72, y);
      y += chipH + 22;
      y = draw(ctx, ti, 72, y, panelInk(ls)) + 22;
      zone = { x: 72, y, w: 760, h: 120 };
    }
    if (opts.guides) {
      ctx.save(); ctx.setLineDash([16, 12]); ctx.lineWidth = 4; ctx.strokeStyle = C.branco;
      rrect(ctx, zone.x, zone.y, zone.w, zone.h, 20); ctx.stroke(); ctx.restore();
      font(ctx, 700, 32); ctx.fillStyle = C.branco; ctx.textAlign = 'center'; ctx.fillText('Adesivo de link aqui', zone.x + zone.w / 2, zone.y + zone.h / 2 - lineH(32) / 2); ctx.textAlign = 'left';
    }
    return zone;
  }

  // ---------- reels (4 modelos: Reel 1 e Reel 4 baseados no Post 1; Reel 2 e Reel 3 baseados no Post 2) ----------
  const REELS = [
    { id: 'r01', name: 'Reel 1' },
    { id: 'r02', name: 'Reel 2' },
    { id: 'r03', name: 'Reel 3' },
    { id: 'r04', name: 'Reel 4' }
  ];
  const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); // easeOutCubic
  const seg = (t, a, b) => ease((t - a) / (b - a));
  function reelBox(d) {
    const id = (d && d.tpl && d.tpl.reel) || 'r01', nd = look(d || {}).nd;
    if (id === 'r02') {
      const vh = Math.max(540, Math.min(1260, Math.round((nd.ph / 1350) * 1920)));
      return { x: 0, y: 0, w: 1080, h: vh, r: 0 };
    }
    if (id === 'r03') {
      const vh = Math.max(660, Math.min(1320, Math.round((nd.ph / 1350) * 1920)));
      return { x: 0, y: 1920 - vh, w: 1080, h: vh, r: 0 };
    }
    return { x: 0, y: 0, w: 1080, h: 1920, r: 0 };
  }
  async function reel(canvas, d, t = 99, clear = false) {
    await ensureFonts();
    const [lgDark, lgLight] = await Promise.all([asset('logo-escuro'), asset('logo-branco')]);
    const drawLogo = (ctx, dark, x, y, w) => {
      const img = dark ? lgDark : lgLight;
      if (img) return ctx.drawImage(img, x, y, w, w * img.height / img.width);
      font(ctx, 900, w * 0.19); ctx.fillStyle = dark ? C.preto : C.branco; ctx.fillText('Reconstruções', x, y + w * 0.1);
    };
    const ctx = canvas.getContext('2d'), id = (d.tpl && d.tpl.reel) || 'r01', box = reelBox(d);
    ctx.save(); ctx.setTransform(canvas.width / 1080, 0, 0, canvas.height / 1920, 0, 0); ctx.textBaseline = 'top';
    if (clear) ctx.clearRect(0, 0, 1080, 1920);
    if (id === 'r00') { ctx.restore(); return; }
    const catA = seg(t, 0.05, 0.45), barA = seg(t, 0.12, 0.65), tiA = seg(t, 0.18, 0.75), deA = seg(t, 0.32, 0.90);
    if (id === 'r01') {
      // Reel 1 (Baseado no Post 1): Vídeo em tela cheia + degradê, logo, categoria, barra abrindo, título e descrição com fade
      vgrad(ctx, 0, 420, 'rgba(15,23,42,0.55)', 'rgba(15,23,42,0)');
      vgrad(ctx, 760, 1160, 'rgba(15,23,42,0)', 'rgba(15,23,42,0.92)');
      drawLogo(ctx, false, 72, 140, 298.7);
      const lp = look(d).post, tc = panelInk(lp), dk = darkInk(tc), pbar = look(d).pbar.bar;
      const cat = catOf(d), catH = cat ? lineH(40) + G : 0, barH = pbar === 'none' ? 0 : 8 + G;
      const ti = block(ctx, d.title, 900, 64, 70, 936, 4), de = d.description ? block(ctx, d.description, 400, 32, 42, 936, 3) : null;
      const hh = lineH(30) + G, totalH = catH + barH + ti.h + (de ? G + de.h : 0) + hh;
      let y = 1920 - 140 - totalH;
      ctx.globalAlpha = seg(t, 0.05, 0.55); panel(ctx, lp, y - 36, totalH + 72);
      if (cat) { ctx.globalAlpha = catA; ctx.fillStyle = dk ? C.tealE : C.verde; font(ctx, 700, 40, 2); ctx.fillText(up(cat), 72, y + (1 - catA) * 14, 936); y += catH; }
      if (barH) { ctx.globalAlpha = barA; ctx.fillStyle = pbar || (dk ? C.tealE : C.verde); if (barA > 0.01) { rrect(ctx, 72, y, 300 * barA, 8, 4); ctx.fill(); } y += barH; }
      ctx.globalAlpha = tiA; y = draw(ctx, ti, 72, y + (1 - tiA) * 22, tc) - (1 - tiA) * 22 + G;
      if (de) { ctx.globalAlpha = deA; y = draw(ctx, de, 72, y + (1 - deA) * 16, tc) - (1 - deA) * 16 + G; }
      ctx.globalAlpha = 1; font(ctx, 600, 30); ctx.fillStyle = tc; ctx.fillText(BRAND.handle, 72, y);
      credit(ctx, d.credit, 1920 - 140 - totalH - 36 - 30);
    } else if (id === 'r02') {
      // Reel 2 (Baseado no Post 2): Vídeo no topo + painel branco de jornal embaixo, linha e textos entrando com fade
      const nd = look(d).nd, vh = box.h;
      ctx.fillStyle = C.branco; ctx.fillRect(0, vh, 1080, 1920 - vh);
      if (nd.sym) symbol(ctx, 880, vh - 52, 105.6);
      credit(ctx, d.credit, vh - 40);
      let y = vh + 48;
      ctx.globalAlpha = catA;
      if (catOf(d) && nd.pill) { chip(ctx, up(catOf(d)), 72, vh + 40 + (1 - catA) * 14, 32, { bg: nd.cat, color: lum(nd.cat) > 0.35 ? C.navy : C.branco, sp: 2 }); y = vh + 40 + lineH(32) + 24 + 44; }
      else if (catOf(d)) { font(ctx, 700, 32, 2); ctx.fillStyle = nd.cat; ctx.fillText(up(catOf(d)), 72, y + (1 - catA) * 14, 936); y += lineH(32) + 20; }
      ctx.globalAlpha = tiA; y = draw(ctx, block(ctx, d.title, 900, 56, 62, 936, 4), 72, y + (1 - tiA) * 22, C.preto) - (1 - tiA) * 22 + G;
      ctx.globalAlpha = deA;
      if (d.description) y = draw(ctx, block(ctx, d.description, 400, 32, 42, 936, 4), 72, y + (1 - deA) * 16, C.preto) - (1 - deA) * 16 + G;
      if (d.source) { font(ctx, 400, 26); ctx.fillStyle = 'rgba(29,29,27,.6)'; ctx.fillText('Fonte: ' + d.source, 72, y + (1 - deA) * 16); }
      ctx.globalAlpha = 1;
      drawLogo(ctx, true, 72, 1760, 186.7);
      font(ctx, 700, 28); ctx.fillStyle = C.tealM; ctx.textAlign = 'right'; ctx.fillText(BRAND.site, 1008, 1766); ctx.textAlign = 'left';
    } else if (id === 'r03') {
      // Reel 3 (Estilo Jornal G1/Folha/Estadão): Cabeçalho editorial branco de jornal no topo + vídeo preenchendo a parte de baixo
      const nd = look(d).nd, topH = box.y;
      ctx.fillStyle = C.branco; ctx.fillRect(0, 0, 1080, topH);
      drawLogo(ctx, true, 72, 88, 195);
      font(ctx, 700, 26); ctx.fillStyle = C.tealM; ctx.textAlign = 'right'; ctx.fillText(BRAND.site, 1008, 100); ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(15,23,42,0.12)'; ctx.fillRect(72, 154, 936, 2);
      if (barA > 0.01) { ctx.fillStyle = nd.cat; ctx.fillRect(72, 153, Math.round(240 * barA), 4); }
      let y = 180;
      const cat = catOf(d);
      ctx.globalAlpha = catA;
      if (cat && nd.pill) { chip(ctx, up(cat), 72, y + (1 - catA) * 12, 28, { bg: nd.cat, color: lum(nd.cat) > 0.35 ? C.navy : C.branco, sp: 2, h: lineH(28) + 16 }); y += lineH(28) + 16 + 18; }
      else if (cat) { font(ctx, 800, 28, 2); ctx.fillStyle = nd.cat; ctx.fillText(up(cat), 72, y + (1 - catA) * 12, 936); y += lineH(28) + 14; }
      const tSize = topH < 680 ? 46 : 54, tLh = topH < 680 ? 52 : 60;
      const ti = block(ctx, d.title, 900, tSize, tLh, 936, topH < 640 ? 3 : 4);
      ctx.globalAlpha = tiA; y = draw(ctx, ti, 72, y + (1 - tiA) * 20, C.preto) - (1 - tiA) * 20 + 14;
      ctx.globalAlpha = deA;
      if (d.description && y + 36 < topH - 28) {
        const de = block(ctx, d.description, 400, 29, 37, 936, y + 90 < topH - 36 ? 3 : 2);
        y = draw(ctx, de, 72, y + (1 - deA) * 14, 'rgba(29,29,27,0.85)') - (1 - deA) * 14 + 12;
      }
      if (d.source && y + 24 < topH - 14) { font(ctx, 400, 24); ctx.fillStyle = 'rgba(29,29,27,.6)'; ctx.fillText('Fonte: ' + d.source, 72, y + (1 - deA) * 12); }
      ctx.globalAlpha = 1;
      if (barA > 0.01) { ctx.fillStyle = nd.cat; ctx.fillRect(0, topH - 6, Math.round(1080 * barA), 6); }
      if (nd.sym) symbol(ctx, 880, topH - 52, 105.6);
      vgrad(ctx, 1680, 240, 'rgba(15,23,42,0)', 'rgba(15,23,42,0.78)');
      font(ctx, 600, 28); ctx.fillStyle = C.branco; ctx.fillText(BRAND.handle, 72, 1824);
      credit(ctx, d.credit, 1820);
    } else {
      // Reel 4 (Estilo Telejornal / Plantão baseado no Post 3): Vídeo em tela cheia + degradê colorido + barra lateral e selo de destaque
      const uh = look(d).uh, bgc = uh.bg, acc = uh.acc;
      vgrad(ctx, 0, 380, 'rgba(15,23,42,0.55)', 'rgba(15,23,42,0)');
      const gh = Math.round(1920 * Math.max(35, uh.size) / 100);
      ctx.save(); ctx.globalAlpha = 0.94; vgrad(ctx, 1920 - gh, gh, rgba(bgc, 0), bgc); ctx.restore();
      drawLogo(ctx, false, 72, 130, 280);
      if (uh.bar !== 'none') { ctx.fillStyle = uh.bar || acc; ctx.fillRect(0, 1904, 1080, 16); }
      const hasSideBar = uh.bar !== 'none', tx = hasSideBar ? 104 : 72, tw = 1008 - tx;
      const ti = block(ctx, d.title, 900, 62, 68, tw, 4), de = d.description ? block(ctx, d.description, 400, 31, 40, tw, 3) : null;
      const noChip = uh.chip === 'none', chipTxt = up(d.chip || catOf(d) || 'Última hora');
      const chipH = noChip ? -G : lineH(34) + 22, hh = lineH(30), bodyH = ti.h + (de ? G + de.h : 0);
      let y = 1920 - 116 - hh - G - bodyH - G - chipH;
      const cc = uh.chip || acc;
      if (!noChip) { ctx.globalAlpha = catA; chip(ctx, chipTxt, 72, y + (1 - catA) * 14, 34, { bg: cc, color: lum(cc) > 0.35 ? C.navy : C.branco }); }
      y += chipH + G;
      if (hasSideBar && barA > 0.01) { ctx.globalAlpha = barA; ctx.fillStyle = uh.bar || acc; rrect(ctx, 72, y, 10, Math.max(12, bodyH * barA), 5); ctx.fill(); }
      ctx.globalAlpha = tiA; y = draw(ctx, ti, tx, y + (1 - tiA) * 22, C.branco) - (1 - tiA) * 22 + G;
      if (de) { ctx.globalAlpha = deA; y = draw(ctx, de, tx, y + (1 - deA) * 16, 'rgba(255,255,255,0.92)') - (1 - deA) * 16 + G; }
      ctx.globalAlpha = 1;
      font(ctx, 600, 30); ctx.fillStyle = C.branco; ctx.fillText(BRAND.handle, 72, y);
      font(ctx, 700, 28); ctx.fillStyle = acc; ctx.textAlign = 'right'; ctx.fillText(BRAND.site, 1008, y + 2); ctx.textAlign = 'left';
      credit(ctx, d.credit, 1920 - 116 - hh - G - bodyH - G - (noChip ? 0 : chipH + G) - 30);
    }
    ctx.restore();
  }
  async function reelThumb(canvas, d, img) {
    await ensureFonts();
    const ctx = setup(canvas, 1080, 1920), box = reelBox(d);
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, 1080, 1920);
    ctx.save(); rrect(ctx, box.x, box.y, box.w, box.h, box.r || 0); ctx.clip();
    photo(ctx, img, box.x, box.y, box.w, box.h, d.focal);
    ctx.restore();
    await reel(canvas, d, 99, false);
  }

  return {
    REELS, reel, reelBox, reelThumb,
    POSTS, CAROUSELS, STORIES, SLIDE_TYPES, BRAND, loadImage, ensureFonts, count, slidesOf,
    setBrand(b) { Object.assign(BRAND, b); },
    setScale(s) { S = s || 1; },
    // capa: a primeira imagem do post (post único ou capa do carrossel)
    cover: (canvas, d, img) => d.format === 'carrossel' ? slide(canvas, d, img, 0) : post(canvas, d, img),
    post, slide, story, symbol, LOOK, UH_PRESETS,
    // só a foto enquadrada (usada pra mandar pro editor livre)
    crop(canvas, img, w, h, focal) { const ctx = setup(canvas, w, h); photo(ctx, img, 0, 0, w, h, focal); }
  };
})();

export default Render;