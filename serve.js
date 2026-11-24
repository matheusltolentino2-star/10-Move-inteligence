/* Servidor estático mínimo para desenvolvimento local do 10 Move Intelligence.
   Não faz parte da aplicação: serve apenas os arquivos desta pasta.
   Uso: node serve.js [porta] */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || 4173);

/* Aplica localmente os MESMOS cabeçalhos do vercel.json — inclusive a CSP.
   Assim o que funciona aqui funciona publicado, e um bloqueio de CSP aparece
   no desenvolvimento em vez de só depois do deploy. */
function carregarHeadersDeProducao() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const regra = (cfg.headers || []).find(h => h.source === '/(.*)');
    if (!regra) return {};
    const out = {};
    regra.headers.forEach(h => {
      /* HSTS só faz sentido em HTTPS; local é HTTP */
      if (h.key.toLowerCase() === 'strict-transport-security') return;
      out[h.key] = h.value;
    });
    return out;
  } catch (e) {
    console.warn('vercel.json não lido, servindo sem cabeçalhos de produção:', e.message);
    return {};
  }
}
const HEADERS_PROD = carregarHeadersDeProducao();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/* O index.html é um fragmento pronto para publicação como Artifact (sem
   doctype nem <head>). Para o teste local, envolvemos no esqueleto que o
   publicador adicionaria, garantindo modo padrão em vez de quirks mode. */
const SKELETON_HEAD = '<!doctype html>\n<html lang="pt-BR">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  /* Sem [hidden]{display:none!important} de propósito. O publicador de
     Artifact injeta essa regra, e replicá-la aqui mascarou um bug que só
     aparecia na Vercel: a tela de carregamento nunca sumia, porque
     #boot{display:grid} vence o [hidden] padrão do navegador. O ambiente
     local deve ser o mais pobre dos dois, não o mais generoso. */
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
  'body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}</style>\n';
const SKELETON_MID = '</head>\n<body>\n';
const SKELETON_FOOT = '\n</body>\n</html>\n';

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const full = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!full.startsWith(ROOT)) { res.writeHead(403).end('Acesso negado'); return; }

  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado: ' + urlPath);
      return;
    }
    const ext = path.extname(full).toLowerCase();
    if (ext === '.html') {
      const html = buf.toString('utf8');
      /* separa o <title>/<meta>/<link> do corpo, como o publicador faz */
      const out = SKELETON_HEAD + SKELETON_MID + html + SKELETON_FOOT;
      res.writeHead(200, Object.assign({}, HEADERS_PROD, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }));
      res.end(out);
      return;
    }
    res.writeHead(200, Object.assign({}, HEADERS_PROD, {
      'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store'
    }));
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('10 Move Intelligence em http://localhost:' + PORT);
});
