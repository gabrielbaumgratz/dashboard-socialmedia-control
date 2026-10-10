// Publicação no Instagram pela API oficial (Instagram Login, host graph.instagram.com).
// Fluxo: cria o "container" da mídia -> espera o Instagram processar -> media_publish.
// A Meta baixa a mídia sozinha de uma URL pública, por isso o servidor gera links assinados temporários.
const V = 'v25.0', HOST = process.env.IG_HOST || `https://graph.instagram.com/${V}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(method, path, params, token) {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(method === 'GET' ? `${HOST}${path}?${q}` : HOST + path, method === 'GET' ? {} : { method, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    throw new Error(e.message ? `Instagram: ${e.message} (código ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : `Instagram respondeu ${r.status}`);
  }
  return j;
}

const tagsOf = (h = []) => h.map(t => '#' + String(t).replace(/^#/, '')).join(' ');
const captionOf = it => ((it.caption || '') + (it.hashtags && it.hashtags.length ? '\n\n' + tagsOf(it.hashtags) : '')).slice(0, 2200);

// Avança a publicação de um item. Guarda o progresso em it.ig (via persist) para o próximo ciclo continuar
// se o Instagram ainda estiver processando (vídeos demoram). Devolve { waiting } ou { mediaId, permalink }.
async function advance(it, cfg, urlFor, persist) {
  const t = cfg.igToken, u = cfg.igUserId, ex = it.export, st = (it.ig ||= {});
  if (!t || !u) throw new Error('Instagram não configurado (token e ID da conta em Configurações).');
  if (!ex || !ex.files || !ex.files.length) throw new Error('Arte ainda não exportada. Abra o post e clique em Programar de novo.');
  if (st.mediaId) return { mediaId: st.mediaId, permalink: st.permalink || '' }; // já foi publicado, só falta fechar o item
  const caption = captionOf(it), make = p => call('POST', `/${u}/media`, p, t);

  if (st.creationId && Date.now() - st.createdAt > 20 * 3600e3) { delete st.creationId; } // container expira em 24h
  if (!st.creationId) {
    if (ex.kind === 'reel') st.creationId = (await make({ media_type: 'REELS', video_url: urlFor(ex.files[0]), caption })).id;
    else if (ex.files.length > 1) {
      const kids = []; // carrossel: até 10 imagens
      for (const f of ex.files.slice(0, 10)) kids.push((await make({ image_url: urlFor(f), is_carousel_item: 'true' })).id);
      st.creationId = (await make({ media_type: 'CAROUSEL', children: kids.join(','), caption })).id;
    } else st.creationId = (await make({ image_url: urlFor(ex.files[0]), caption })).id;
    st.createdAt = Date.now(); await persist();
  }

  for (let i = 0; ; i++) { // a Meta recomenda checar a cada minuto; aqui ~40s por ciclo, o resto fica pro próximo
    const s = (await call('GET', `/${st.creationId}`, { fields: 'status_code' }, t)).status_code;
    if (s === 'FINISHED') break;
    if (s === 'ERROR' || s === 'EXPIRED') { delete st.creationId; await persist(); throw new Error(`O Instagram recusou a mídia (${s}). Confira formato e proporção.`); }
    if (i >= 7) return { waiting: true };
    await sleep(5000);
  }
  st.mediaId = (await call('POST', `/${u}/media_publish`, { creation_id: st.creationId }, t)).id;
  await persist(); // grava já: se algo falhar depois, nunca publica duas vezes
  try { st.permalink = (await call('GET', `/${st.mediaId}`, { fields: 'permalink' }, t)).permalink || ''; } catch {}
  return { mediaId: st.mediaId, permalink: st.permalink || '' };
}

// token de 60 dias: renova quando passar de 30 (precisa ter pelo menos 24h)
async function refreshToken(cfg) {
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(cfg.igToken)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error((j.error && j.error.message) || `Renovação respondeu ${r.status}`);
  return j.access_token;
}

module.exports = { advance, refreshToken, captionOf };
