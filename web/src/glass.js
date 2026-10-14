// Liquid Glass (estilo iOS 26): refração de lente nas bordas + brilho especular + física de mola.
// Como funciona: para cada tamanho de elemento gera um mapa de deslocamento (canvas) de um retângulo
// arredondado com perfil de lente convexa; um filtro SVG usa esse mapa no backdrop-filter, então o que
// está ATRÁS do vidro dobra nas bordas. Só Chromium aplica url() no backdrop-filter; nos outros fica o blur.
const NS = 'http://www.w3.org/2000/svg';
const ok = typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#x)') && /Chrome|Edg/.test(navigator.userAgent);
const made = new Map();
let defs;

function svgDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  defs = document.createElementNS(NS, 'defs'); svg.appendChild(defs); document.body.appendChild(svg);
  return defs;
}

// mapa R/G = direção do deslocamento (128 = parado). Perto da borda puxa os pixels para dentro (lente).
function dispMap(w, h, r) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const bezel = Math.max(6, Math.min(22, Math.min(w, h) * 0.32));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5 - w / 2, py = y + 0.5 - h / 2;
    const qx = Math.abs(px) - (w / 2 - r), qy = Math.abs(py) - (h / 2 - r);
    // distância até a borda (positivo = dentro), SDF de retângulo arredondado
    const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    const depth = -out;
    let nx = 0, ny = 0, mag = 0;
    if (depth > 0 && depth < bezel) {
      const t = 1 - depth / bezel; mag = t * t * (3 - 2 * t); // curva suave tipo lente convexa
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; nx = qx / l; ny = qy / l; }
      else if (qx > qy) nx = 1; else ny = 1;
      nx *= Math.sign(px) || 1; ny *= Math.sign(py) || 1;
    }
    const i = (y * w + x) * 4;
    d[i] = 128 - nx * mag * 127; d[i + 1] = 128 - ny * mag * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function filterFor(w, h, r) {
  const key = `lg-${w}-${h}-${r}`;
  if (made.has(key)) return key;
  const f = document.createElementNS(NS, 'filter');
  f.id = key;
  for (const [k, v] of Object.entries({ x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
  const im = document.createElementNS(NS, 'feImage');
  im.setAttribute('href', dispMap(w, h, r)); im.setAttribute('x', 0); im.setAttribute('y', 0);
  im.setAttribute('width', w); im.setAttribute('height', h); im.setAttribute('result', 'map');
  const dm = document.createElementNS(NS, 'feDisplacementMap');
  dm.setAttribute('in', 'SourceGraphic'); dm.setAttribute('in2', 'map');
  dm.setAttribute('scale', Math.round(Math.min(48, Math.max(14, Math.min(w, h) * 0.55))));
  dm.setAttribute('xChannelSelector', 'R'); dm.setAttribute('yChannelSelector', 'G');
  f.append(im, dm); svgDefs().appendChild(f); made.set(key, true);
  return key;
}

function apply(el) {
  const b = el.getBoundingClientRect(), w = Math.round(b.width), h = Math.round(b.height);
  if (w < 8 || h < 8 || w > 1600 || h > 1200) return;
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12, h / 2, w / 2);
  const id = filterFor(w, h, Math.round(r));
  el.style.setProperty('--lg-filter', `url(#${id})`);
}

const SEL = 'button:not(.linklike), .btn, .glass, .glass-dark, .seg, .chip';

export function initGlass() {
  document.documentElement.classList.toggle('lg-on', ok);
  const ro = new ResizeObserver(es => es.forEach(e => apply(e.target)));
  const seen = new WeakSet();
  const scan = root => root.querySelectorAll && root.querySelectorAll(SEL).forEach(el => { if (!seen.has(el)) { seen.add(el); ro.observe(el); } });
  if (ok) { scan(document); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && (n.matches?.(SEL) && !seen.has(n) && (seen.add(n), ro.observe(n)), scan(n))))).observe(document.body, { childList: true, subtree: true }); }

}
