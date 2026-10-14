// Entrada única da Vercel. O vercel.json manda toda rota (/api/*, /images/*, /pub/*) pra cá com o caminho original em ?__p=
// (o catch-all [...slug] não pegava rotas com mais de um segmento, tipo /api/items/ID, e dava 404 da própria Vercel).
const { handle } = require('../server.js');
module.exports = (req, res) => {
  const u = new URL(req.url, 'http://localhost'), p = u.searchParams.get('__p');
  if (p !== null) { u.searchParams.delete('__p'); const q = u.searchParams.toString(); req.url = '/' + p + (q ? '?' + q : ''); }
  return handle(req, res);
};
