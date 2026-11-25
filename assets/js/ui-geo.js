/* 10 Move Intelligence — base geográfica
   -------------------------------------------------------------------------
   Escala de cor, carregamento das malhas oficiais e índice de municípios.
   O desenho em si é do ui-geomap.js, sobre Leaflet.

   A geometria vive em GeoJSON lat/lng (assets/geo), não mais em caminhos SVG
   pré-projetados: projetar virou responsabilidade do mapa, que é o que
   permite basemap, zoom contínuo, raio em metros e seleção precisa.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const el = MI.el, G = {};

  function hexToRgb(h) {
    const m = String(h).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return [120, 140, 160];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  /* Escala sequencial para indicador quantitativo. */
  G.scale = function (t) {
    const th = MI.charts.theme();
    if (t <= 0) return th.border;
    if (t < 0.5) return mix(th.border, th.series[1], t / 0.5);
    return mix(th.series[1], th.series[0], (t - 0.5) / 0.5);
  };

  /* ---------------- Carregamento sob demanda ---------------- */
  const carregando = {};

  function versaoAssets() {
    try {
      const s = document.querySelector('script[src*="core.js?v="]');
      if (s) return (s.getAttribute('src').split('?v=')[1] || '').trim();
    } catch (e) { }
    return '';
  }

  function injetar(arquivo, pronto) {
    if (carregando[arquivo]) return carregando[arquivo];
    carregando[arquivo] = new Promise(function (resolve, reject) {
      const v = versaoAssets();
      const s = document.createElement('script');
      s.src = 'assets/geo/' + arquivo + '.js' + (v ? '?v=' + v : '');
      s.onload = function () {
        const r = pronto();
        if (r) resolve(r);
        else reject(new Error('A malha ' + arquivo + ' carregou vazia.'));
      };
      s.onerror = function () { reject(new Error('Não foi possível carregar a malha ' + arquivo + '.')); };
      document.head.appendChild(s);
    }).catch(function (e) { delete carregando[arquivo]; throw e; });
    return carregando[arquivo];
  }

  G.temBrasil = function () { return !!MI.GEO_BR; };
  G.carregarBrasil = function () {
    if (MI.GEO_BR) return Promise.resolve(MI.GEO_BR);
    return injetar('br-ufs', function () { return MI.GEO_BR; });
  };

  G.temUf = function (uf) { return !!(MI.GEO_MUN && MI.GEO_MUN[uf]); };
  G.carregarUf = function (uf) {
    if (G.temUf(uf)) return Promise.resolve(MI.GEO_MUN[uf]);
    return injetar('mun-' + uf, function () { return MI.GEO_MUN && MI.GEO_MUN[uf]; });
  };

  /* Nome de cidade da planilha → feição do município, dentro de uma UF.
     Correspondência exata sobre nome normalizado: nome parecido não é
     casado em silêncio, fica no balanço de não localizados. */
  G.indiceMunicipios = function (uf) {
    const M = MI.GEO_MUN && MI.GEO_MUN[uf];
    if (!M) return null;
    if (M._indice) return M._indice;
    const idx = {};
    M.features.forEach(function (f) { idx[MI.slug(f.properties.nome)] = f; });
    M._indice = idx;
    return idx;
  };

  G.municipioPorNome = function (uf, nome) {
    const idx = G.indiceMunicipios(uf);
    return idx ? (idx[MI.slug(nome)] || null) : null;
  };

  /* Barras por região (Norte, Nordeste, ...) */
  G.REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

  MI.geo = G;

})(window.MI);
