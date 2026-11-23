/* 10 Move Intelligence — gráficos (Chart.js) com tema herdado dos tokens CSS */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const C = {};
  const registry = [];

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  C.theme = function () {
    return {
      text: cssVar('--text', '#0c1a29'),
      muted: cssVar('--muted', '#566a82'),
      faint: cssVar('--faint', '#8b9bb0'),
      border: cssVar('--border', '#e1e8f1'),
      surface: cssVar('--surface', '#ffffff'),
      series: [
        cssVar('--c1', '#1b5c91'), cssVar('--c2', '#0fb6a1'), cssVar('--c3', '#6558c6'),
        cssVar('--c4', '#d98a1f'), cssVar('--c5', '#c5443e'), cssVar('--c6', '#3d9bd8'),
        cssVar('--c7', '#2fa36b'), cssVar('--c8', '#8d7b9c')
      ],
      suppressed: cssVar('--border-strong', '#cfd9e6')
    };
  };

  C.palette = function (n) {
    const s = C.theme().series, out = [];
    for (let i = 0; i < n; i++) out.push(s[i % s.length]);
    return out;
  };

  C.destroyAll = function () {
    while (registry.length) {
      const ch = registry.pop();
      try { ch.destroy(); } catch (e) { }
    }
  };

  function create(canvas, config) {
    if (!window.Chart) return null;
    const t = C.theme();
    Chart.defaults.font.family = cssVar('--font-body', 'Inter, sans-serif').replace(/'/g, '');
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = t.muted;
    config.options = config.options || {};
    config.options.responsive = true;
    config.options.maintainAspectRatio = false;
    config.options.animation = (C.noAnim || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      ? false : { duration: 420, easing: 'easeOutQuart' };
    if (C.noAnim) config.options.devicePixelRatio = 2;
    config.options.plugins = config.options.plugins || {};
    config.options.plugins.tooltip = Object.assign({
      backgroundColor: cssVar('--navy-900', '#072138'),
      titleFont: { weight: '700', size: 12 },
      bodyFont: { size: 12 },
      padding: 10, cornerRadius: 7, displayColors: true, boxPadding: 4,
      borderColor: 'rgba(255,255,255,.1)', borderWidth: 1
    }, config.options.plugins.tooltip || {});
    const ch = new Chart(canvas, config);
    registry.push(ch);
    return ch;
  }

  function gridCfg(t, showGrid) {
    return {
      grid: { color: t.border, drawBorder: false, display: showGrid !== false },
      border: { display: false },
      ticks: { color: t.muted, padding: 6 }
    };
  }

  /* ---------------- Rosca ---------------- */
  C.doughnut = function (canvas, entries, opts) {
    opts = opts || {};
    const t = C.theme();
    const colors = entries.map(function (e, i) { return e.suppressed ? t.suppressed : C.palette(entries.length)[i]; });
    const total = MI.sum(entries, function (e) { return e.value; });
    return create(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(function (e) { return e.label; }),
        datasets: [{
          data: entries.map(function (e) { return e.value; }),
          backgroundColor: colors, borderColor: t.surface, borderWidth: 2, hoverOffset: 6
        }]
      },
      options: {
        cutout: opts.cutout || '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                return ' ' + c.label + ': ' + MI.fmt.int(c.parsed) + ' (' + MI.fmt.pct(total ? c.parsed / total : 0, 1) + ')';
              }
            }
          }
        }
      }
    });
  };

  /* ---------------- Barras ---------------- */
  C.bar = function (canvas, entries, opts) {
    opts = opts || {};
    const t = C.theme();
    const horizontal = !!opts.horizontal;
    const base = opts.color || t.series[0];
    const colors = entries.map(function (e, i) {
      if (e.suppressed) return t.suppressed;
      if (opts.multicolor) return C.palette(entries.length)[i];
      if (opts.highlight != null && i === opts.highlight) return t.series[1];
      return base;
    });
    return create(canvas, {
      type: 'bar',
      data: {
        labels: entries.map(function (e) { return e.label; }),
        datasets: [{
          label: opts.label || 'Registros',
          data: entries.map(function (e) { return e.value; }),
          backgroundColor: colors, borderRadius: 4, borderSkipped: false,
          maxBarThickness: opts.thickness || 34
        }]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        /* Atenção: nunca definir ticks.callback como undefined — o Chart.js
           substitui o formatador padrão e o eixo passa a mostrar índices. */
        scales: {
          x: Object.assign(gridCfg(t, horizontal), {
            beginAtZero: horizontal || undefined,
            ticks: horizontal
              ? { color: t.muted, padding: 6, callback: function (v) { return MI.fmt.compact(v); } }
              : { color: t.muted, padding: 6, autoSkip: true, maxRotation: opts.rotate != null ? opts.rotate : 0 }
          }),
          y: Object.assign(gridCfg(t, !horizontal), {
            beginAtZero: true,
            ticks: horizontal
              ? { color: t.muted, padding: 6, autoSkip: false }
              : { color: t.muted, padding: 6, callback: function (v) { return MI.fmt.compact(v); } }
          })
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                const v = horizontal ? c.parsed.x : c.parsed.y;
                const e = entries[c.dataIndex];
                let s = ' ' + (opts.valueFmt ? opts.valueFmt(v) : MI.fmt.int(v));
                if (e && e.pct != null) s += ' (' + MI.fmt.pct(e.pct, 1) + ')';
                if (e && e.n != null && opts.showN) s += ' · n=' + MI.fmt.int(e.n);
                return s;
              }
            }
          }
        }
      }
    });
  };

  /* ---------------- Barras empilhadas (cruzamento) ---------------- */
  C.stacked = function (canvas, ct, opts) {
    opts = opts || {};
    const t = C.theme();
    const pal = C.palette(ct.colLabels.length);
    const pct = !!opts.percent;
    const datasets = ct.colLabels.map(function (cl, j) {
      return {
        label: cl,
        data: ct.rowLabels.map(function (_, i) {
          const v = ct.matrix[i][j];
          if (ct.mask && ct.mask[i][j] && ct.isMasked) return 0;
          return pct ? (ct.rowTotals[i] ? v / ct.rowTotals[i] * 100 : 0) : v;
        }),
        backgroundColor: pal[j], borderRadius: 3, borderSkipped: false, maxBarThickness: 40
      };
    });
    return create(canvas, {
      type: 'bar',
      data: { labels: ct.rowLabels, datasets: datasets },
      options: {
        scales: {
          x: Object.assign(gridCfg(t, false), { stacked: true }),
          y: Object.assign(gridCfg(t, true), {
            stacked: true, beginAtZero: true, max: pct ? 100 : undefined,
            ticks: { color: t.muted, padding: 6, callback: function (v) { return pct ? v + '%' : MI.fmt.compact(v); } }
          })
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                return ' ' + c.dataset.label + ': ' + (pct ? MI.fmt.dec(c.parsed.y, 1) + '%' : MI.fmt.int(c.parsed.y));
              }
            }
          }
        }
      }
    });
  };

  /* ---------------- Linha / área ---------------- */
  C.line = function (canvas, labels, series, opts) {
    opts = opts || {};
    const t = C.theme();
    const datasets = series.map(function (s, i) {
      const col = s.color || t.series[i % t.series.length];
      return {
        label: s.label, data: s.values, borderColor: col,
        backgroundColor: s.fill === false ? 'transparent' : hexAlpha(col, 0.14),
        fill: s.fill === false ? false : 'origin',
        tension: .32, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
        pointBackgroundColor: col, pointHoverBorderColor: t.surface, pointHoverBorderWidth: 2,
        yAxisID: s.axis || 'y', borderDash: s.dash || []
      };
    });
    const scales = {
      x: Object.assign(gridCfg(t, false), { ticks: { color: t.muted, padding: 6, maxRotation: 0, autoSkip: true, maxTicksLimit: opts.maxTicks || 12 } }),
      y: Object.assign(gridCfg(t, true), {
        beginAtZero: opts.beginAtZero !== false,
        ticks: { color: t.muted, padding: 6, callback: function (v) { return opts.yFmt ? opts.yFmt(v) : MI.fmt.compact(v); } }
      })
    };
    if (series.some(function (s) { return s.axis === 'y1'; })) {
      scales.y1 = {
        position: 'right', grid: { display: false }, border: { display: false },
        beginAtZero: true, ticks: { color: t.muted, padding: 6, callback: function (v) { return opts.y1Fmt ? opts.y1Fmt(v) : MI.fmt.compact(v); } }
      };
    }
    return create(canvas, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: scales,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                const s = series[c.datasetIndex];
                const f = s.fmt || (opts.yFmt || MI.fmt.int);
                return ' ' + c.dataset.label + ': ' + f(c.parsed.y);
              }
            }
          }
        }
      }
    });
  };

  /* ---------------- Sparkline ---------------- */
  C.spark = function (canvas, values, color) {
    const t = C.theme();
    const col = color || t.series[1];
    return create(canvas, {
      type: 'line',
      data: {
        labels: values.map(function (_, i) { return i; }),
        datasets: [{
          data: values, borderColor: col, backgroundColor: hexAlpha(col, .18),
          fill: 'origin', tension: .35, borderWidth: 1.8, pointRadius: 0
        }]
      },
      options: {
        scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
  };

  /* ---------------- Dispersão ---------------- */
  C.scatter = function (canvas, points, opts) {
    opts = opts || {};
    const t = C.theme();
    return create(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: opts.label || '', data: points,
          backgroundColor: hexAlpha(opts.color || t.series[1], .45),
          borderColor: 'transparent', pointRadius: opts.radius || 2.5, pointHoverRadius: 5
        }]
      },
      options: {
        scales: {
          x: Object.assign(gridCfg(t, true), { title: { display: !!opts.xLabel, text: opts.xLabel, color: t.faint } }),
          y: Object.assign(gridCfg(t, true), { title: { display: !!opts.yLabel, text: opts.yLabel, color: t.faint } })
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                return ' ' + (opts.xLabel || 'x') + ': ' + MI.fmt.dec(c.parsed.x, 1) +
                  ' · ' + (opts.yLabel || 'y') + ': ' + MI.fmt.dec(c.parsed.y, 1);
              }
            }
          }
        }
      }
    });
  };

  function hexAlpha(hex, a) {
    const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  C.hexAlpha = hexAlpha;

  /* Imagem do gráfico para o PDF */
  C.toImage = function (canvas) {
    try { return canvas.toDataURL('image/png', 1); } catch (e) { return null; }
  };

  MI.charts = C;

})(window.MI);
