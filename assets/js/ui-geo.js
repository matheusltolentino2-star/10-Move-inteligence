/* 10 Move Intelligence — visualização geográfica
   -------------------------------------------------------------------------
   Mapa coroplético do Brasil com a geometria real das 27 unidades da
   federação (ver data-geo-brasil.js, malha oficial do IBGE em projeção
   equivalente). Substituiu uma grade esquemática que não era um mapa: as
   formas eram inventadas e as posições, aproximadas.

   Os rótulos das unidades pequenas demais para caber um dentro — DF, SE,
   AL, RJ, ES, RN, PB — saem para uma faixa à direita, com linha de chamada,
   empilhados na ordem norte-sul para que as linhas não se cruzem.
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
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Escala sequencial: claro -> turquesa -> azul profundo */
  G.scale = function (t) {
    const th = MI.charts.theme();
    if (t <= 0) return th.border;
    if (t < 0.5) return mix(th.border, th.series[1], t / 0.5);
    return mix(th.series[1], th.series[0], (t - 0.5) / 0.5);
  };

  /* Abaixo desta área (em unidades do desenho) o rótulo não cabe dentro
     da unidade federativa e vai para a faixa lateral. */
  const AREA_MINIMA = 5000;
  const FAIXA = 190;      /* largura da faixa de rótulos à direita */
  const ESPACO = 46;      /* altura mínima entre dois rótulos externos */

  /* dist: lista [{label:'SP', value:n, pct}] — valores JÁ sujeitos à supressão */
  G.mapa = function (dist, opts) {
    opts = opts || {};
    const M = MI.BR_MAPA;
    if (!M) return el('p', { class: 'field__hint', text: 'A geometria do mapa não carregou.' });

    const byUf = {};
    let max = 0, total = 0;
    dist.forEach(function (e) {
      if (e.suppressed || e.isOther) return;
      byUf[e.label] = e;
      total += e.value;
      if (e.value > max) max = e.value;
    });

    const ufs = Object.keys(M.caminhos);

    /* Rótulos externos empilhados de norte a sul, cada um o mais perto
       possível da sua latitude real sem encostar no de cima. */
    const fora = ufs.filter(function (uf) { return M.areas[uf] < AREA_MINIMA; })
      .sort(function (a, b) { return M.centros[a][1] - M.centros[b][1]; });
    const alvoY = {};
    let ultimo = -Infinity;
    fora.forEach(function (uf) {
      const y = Math.max(M.centros[uf][1], ultimo + ESPACO);
      alvoY[uf] = y; ultimo = y;
    });

    let formas = '', chamadas = '', rotulos = '';
    ufs.forEach(function (uf) {
      const e = byUf[uf];
      const v = e ? e.value : 0;
      const t = max ? v / max : 0;
      const cor = v ? G.scale(0.12 + t * 0.88) : 'var(--surface-3)';
      const sel = opts.selected && opts.selected.indexOf(uf) >= 0;
      const legenda = MI.UF_NOMES[uf] + ' — ' +
        (v ? MI.fmt.int(v) + ' (' + MI.fmt.pctOf(v, total, 1) + ')' : 'sem registros');

      formas += '<path d="' + M.caminhos[uf] + '" fill="' + cor + '"' +
        ' class="mapa-br__uf' + (sel ? ' is-sel' : '') + (v ? '' : ' is-vazio') + '"' +
        ' data-uf="' + uf + '" aria-label="' + esc(legenda) + '"' +
        (v && opts.onSelect ? ' role="button" tabindex="0"' : '') + '></path>';

      const c = M.centros[uf];
      if (M.areas[uf] >= AREA_MINIMA) {
        rotulos += '<text x="' + c[0] + '" y="' + (c[1] + 9) + '" class="mapa-br__rot"' +
          ' fill="' + (t > 0.45 ? '#fff' : 'var(--text)') + '">' + uf + '</text>';
      } else {
        const y = alvoY[uf];
        chamadas += '<path d="M' + c[0] + ' ' + c[1] + 'L' + (M.largura + 26) + ' ' + y + '" class="mapa-br__linha"></path>' +
          '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="4" class="mapa-br__ponto"></circle>';
        rotulos += '<text x="' + (M.largura + 34) + '" y="' + (y + 9) + '" class="mapa-br__rot mapa-br__rot--fora">' + uf + '</text>';
      }
    });

    const caixa = el('div', { class: 'mapa-br' });
    caixa.innerHTML =
      '<svg class="mapa-br__svg" viewBox="0 0 ' + (M.largura + FAIXA) + ' ' + M.altura + '"' +
      ' preserveAspectRatio="xMidYMid meet" role="img"' +
      ' aria-label="Mapa do Brasil por unidade da federação">' +
      formas + chamadas + rotulos + '</svg>';

    /* Dica flutuante: o rótulo nativo do SVG demora a aparecer e some ao
       mover o cursor, o que atrapalha justamente quem está comparando
       estados vizinhos. */
    const dica = el('span', { class: 'mapa-br__tip', hidden: true });
    caixa.appendChild(dica);

    const alvos = caixa.querySelectorAll('[data-uf]');
    for (let i = 0; i < alvos.length; i++) {
      const p = alvos[i];
      const uf = p.getAttribute('data-uf');
      const temValor = !!(byUf[uf] && byUf[uf].value);
      p.addEventListener('mouseenter', function () {
        dica.textContent = p.getAttribute('aria-label');
        dica.hidden = false;
      });
      p.addEventListener('mousemove', function (ev) {
        const r = caixa.getBoundingClientRect();
        dica.style.left = Math.max(4, Math.min(r.width - 8, ev.clientX - r.left)) + 'px';
        dica.style.top = (ev.clientY - r.top - 12) + 'px';
      });
      p.addEventListener('mouseleave', function () { dica.hidden = true; });
      if (temValor && opts.onSelect) {
        p.addEventListener('click', function () { opts.onSelect(uf); });
        p.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.onSelect(uf); }
        });
      }
    }

    const ramp = 'linear-gradient(90deg,' + [0, .25, .5, .75, 1].map(function (t) {
      return G.scale(0.12 + t * 0.88);
    }).join(',') + ')';

    return el('div', {}, [
      caixa,
      el('div', { class: 'carto__legend' }, [
        el('span', { text: '0' }),
        el('span', { class: 'carto__ramp', style: 'background:' + ramp }),
        el('span', { text: MI.fmt.int(max) }),
        el('span', {
          style: 'margin-left:10px;color:var(--faint)',
          text: opts.onSelect ? 'clique em uma unidade para filtrar' : ''
        })
      ])
    ]);
  };

  /* Nome antigo, mantido para não quebrar chamadas existentes. */
  G.cartogram = G.mapa;

  /* Barras por região (Norte, Nordeste, ...) */
  G.REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

  MI.geo = G;

})(window.MI);
