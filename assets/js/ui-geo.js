/* 10 Move Intelligence — visualização geográfica
   Cartograma esquemático: cada estado é uma célula em uma grade que aproxima
   a forma do Brasil. É uma representação de leitura rápida, não cartografia. */
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

  /* Escala sequencial: claro -> turquesa -> azul profundo */
  G.scale = function (t) {
    const th = MI.charts.theme();
    if (t <= 0) return th.border;
    if (t < 0.5) return mix(th.border, th.series[1], t / 0.5);
    return mix(th.series[1], th.series[0], (t - 0.5) / 0.5);
  };

  /* dist: lista [{label:'SP', value:n, pct}] — valores JÁ sujeitos à supressão */
  G.cartogram = function (dist, opts) {
    opts = opts || {};
    const byUf = {};
    let max = 0, total = 0;
    dist.forEach(function (e) {
      if (e.suppressed || e.isOther) return;
      byUf[e.label] = e;
      total += e.value;
      if (e.value > max) max = e.value;
    });

    const rows = [];
    for (let r = 1; r <= MI.UF_GRID_ROWS; r++) {
      const cells = [];
      for (let c = 1; c <= MI.UF_GRID_COLS; c++) {
        const uf = Object.keys(MI.UF_GRID).filter(function (k) {
          return MI.UF_GRID[k][0] === c && MI.UF_GRID[k][1] === r;
        })[0];
        if (!uf) { cells.push(el('div', { class: 'carto__cell is-empty' })); continue; }
        const e = byUf[uf];
        const v = e ? e.value : 0;
        const t = max ? v / max : 0;
        const bg = v ? G.scale(0.12 + t * 0.88) : 'var(--surface-3)';
        const fg = t > 0.42 ? '#fff' : 'var(--muted)';
        const sel = opts.selected && opts.selected.indexOf(uf) >= 0;
        const cell = el('div', {
          class: 'carto__cell' + (sel ? ' is-sel' : ''),
          dataset: { has: v ? '1' : '0', uf: uf },
          style: 'background:' + bg + ';color:' + fg,
          role: v ? 'button' : null,
          tabindex: v ? '0' : null,
          onclick: v && opts.onSelect ? function () { opts.onSelect(uf); } : null,
          onkeydown: v && opts.onSelect ? function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.onSelect(uf); }
          } : null
        }, [
          uf,
          el('span', {
            class: 'carto__tip',
            text: MI.UF_NOMES[uf] + ' — ' + (v ? MI.fmt.int(v) + ' (' + MI.fmt.pctOf(v, total, 1) + ')' : 'sem registros')
          })
        ]);
        cells.push(cell);
      }
      rows.push(el('div', { class: 'carto__row' }, cells));
    }

    const ramp = 'linear-gradient(90deg,' + [0, .25, .5, .75, 1].map(function (t) { return G.scale(0.12 + t * 0.88); }).join(',') + ')';
    return el('div', {}, [
      el('div', { class: 'carto' }, rows),
      el('div', { class: 'carto__legend' }, [
        el('span', { text: '0' }),
        el('span', { class: 'carto__ramp', style: 'background:' + ramp }),
        el('span', { text: MI.fmt.int(max) }),
        el('span', { style: 'margin-left:10px;color:var(--faint)', text: opts.onSelect ? 'clique em um estado para filtrar' : '' })
      ])
    ]);
  };

  /* Barras por região (Norte, Nordeste, ...) */
  G.REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

  MI.geo = G;

})(window.MI);
