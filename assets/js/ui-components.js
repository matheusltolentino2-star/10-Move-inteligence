/* 10 Move Intelligence — componentes de interface reutilizáveis */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const el = MI.el, U = {};
  const pending = [];

  /* Gráficos só podem ser criados depois que o nó está no documento. */
  U.defer = function (fn) { pending.push(fn); };
  U.flush = function () {
    while (pending.length) {
      const fn = pending.shift();
      try { fn(); } catch (e) { console.error('Falha ao desenhar gráfico:', e); }
    }
  };

  /* ---------------- Cartão ---------------- */
  U.card = function (o) {
    const head = (o.title || o.tools) ? el('div', { class: 'card__head' }, [
      el('div', {}, [
        el('h3', { class: 'card__title', text: o.title || '' }),
        o.sub ? el('p', { class: 'card__sub', text: o.sub }) : null
      ]),
      o.tools ? el('div', { class: 'card__tools' }, o.tools) : null
    ]) : null;
    return el('section', { class: 'card ' + (o.span || 'c6') + (o.class ? ' ' + o.class : '') }, [
      head,
      el('div', { class: 'card__body' }, o.body),
      o.foot ? el('div', { class: 'card__foot' }, o.foot) : null
    ]);
  };

  /* ---------------- KPI ---------------- */
  U.kpi = function (o) {
    const body = [
      el('div', { class: 'kpi__label' }, [o.icon ? el('span', { html: MI.icon(o.icon, 14) }) : null, o.label]),
      el('div', { class: 'kpi__value' }, [o.value, o.unit ? el('small', { text: ' ' + o.unit }) : null]),
      o.hint ? el('div', { class: 'kpi__hint', text: o.hint }) : null
    ];
    if (o.spark && o.spark.length > 2) {
      const cv = el('canvas');
      body.push(el('div', { class: 'kpi__spark' }, cv));
      U.defer(function () { MI.charts.spark(cv, o.spark, o.sparkColor); });
    }
    return el('section', { class: 'card kpi ' + (o.span || 'c3') + (o.accent ? ' kpi--accent' : '') }, body);
  };

  /* ---------------- Cartão com gráfico ---------------- */
  U.chartCard = function (o) {
    const cv = el('canvas', { id: o.id || null });
    const wrap = el('div', { class: 'chart chart--' + (o.height || 'md') }, cv);
    U.defer(function () {
      const ch = o.render(cv);
      if (ch && o.id) U.charts[o.id] = ch;
    });
    return U.card({
      title: o.title, sub: o.sub, span: o.span, tools: o.tools,
      body: [wrap, o.legend ? U.legend(o.legend) : null, o.extra],
      foot: o.foot
    });
  };
  U.charts = {};

  U.legend = function (items) {
    return el('div', { class: 'legend' }, items.map(function (it) {
      return el('span', { class: 'legend__i' }, [
        el('span', { class: 'legend__sw', style: 'background:' + it.color }),
        it.label + (it.value != null ? ' · ' + it.value : '')
      ]);
    }));
  };

  /* ---------------- Lista de barras ---------------- */
  U.bars = function (entries, o) {
    o = o || {};
    if (!entries || !entries.length) return U.empty('Sem dados para exibir', 'Nenhum registro atende aos filtros atuais.');
    const max = o.max != null ? o.max : Math.max.apply(null, entries.map(function (e) { return e.value; }));
    const total = o.total != null ? o.total : (entries.total || MI.sum(entries, function (e) { return e.value; }));
    return el('div', { class: 'bars' + (o.compact ? ' bars--compact' : '') }, entries.map(function (e, i) {
      const w = max ? Math.max(1.5, (e.value / max) * 100) : 0;
      const color = e.suppressed ? null : (o.color || MI.charts.palette(entries.length)[o.monochrome ? 0 : i]);
      return el('div', { class: 'bar' + (e.suppressed ? ' is-suppressed' : '') }, [
        el('span', { class: 'bar__label', title: String(e.label) }, String(e.label)),
        el('span', { class: 'bar__track' }, el('span', {
          class: 'bar__fill', style: 'width:' + w + '%' + (color ? ';background:' + color : '')
        })),
        el('span', { class: 'bar__val' }, [
          el('b', { text: o.fmt ? o.fmt(e.value) : MI.fmt.int(e.value) }),
          total ? ' · ' + MI.fmt.pct(e.value / total, 1) : ''
        ])
      ]);
    }));
  };

  /* ---------------- Ranking ---------------- */
  U.rank = function (entries, o) {
    o = o || {};
    if (!entries || !entries.length) return U.empty('Sem dados para o ranking');
    const total = o.total != null ? o.total : MI.sum(entries, function (e) { return e.value; });
    return el('div', { class: 'rank' }, entries.map(function (e, i) {
      return el('div', { class: 'rank__row' }, [
        el('span', { class: 'rank__pos', text: String(i + 1) }),
        el('span', { class: 'rank__name', title: String(e.label) }, [
          String(e.label),
          e.sub ? el('small', { text: ' · ' + e.sub }) : null
        ]),
        el('span', { class: 'rank__val', text: o.fmt ? o.fmt(e.value) : MI.fmt.int(e.value) }),
        el('span', { class: 'rank__pct', text: total ? MI.fmt.pct(e.value / total, 1) : '' })
      ]);
    }));
  };

  /* ---------------- Tabela genérica ---------------- */
  U.table = function (headers, rows, o) {
    o = o || {};
    return el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
      el('thead', {}, el('tr', {}, headers.map(function (h) {
        return el('th', { class: h.num ? 'n' : null, text: h.label != null ? h.label : h });
      }))),
      el('tbody', {}, rows.map(function (r) {
        return el('tr', { class: r.isTotal ? 'tot' : null }, (r.cells || r).map(function (c, i) {
          const cell = (c && typeof c === 'object' && !(c instanceof Node)) ? c : { v: c };
          return el('td', {
            class: [(headers[i] && headers[i].num) || cell.num ? 'n' : '', cell.masked ? 'is-masked' : '', cell.risk ? 'is-risk' : ''].filter(Boolean).join(' ') || null,
            title: cell.title || null
          }, cell.v instanceof Node ? cell.v : String(cell.v == null ? '—' : cell.v));
        }));
      }))
    ]));
  };

  /* ---------------- Tabela cruzada ---------------- */
  U.crosstab = function (ct, o) {
    o = o || {};
    const headers = [{ label: o.rowLabel || '' }].concat(ct.colLabels.map(function (c) { return { label: c, num: true }; }));
    headers.push({ label: 'Total', num: true });
    const rows = ct.rowLabels.map(function (rl, i) {
      const cells = [{ v: rl }];
      ct.colLabels.forEach(function (_, j) {
        const v = ct.matrix[i][j];
        const masked = ct.mask && ct.mask[i][j] && ct.isMasked;
        const risk = ct.mask && ct.mask[i][j] && !ct.isMasked;
        if (masked) cells.push({ v: '< ' + ct.k, masked: true, num: true, title: 'Célula suprimida: menos de ' + ct.k + ' registros' });
        else cells.push({
          v: o.percent && ct.rowTotals[i] ? MI.fmt.pct(v / ct.rowTotals[i], 1) : MI.fmt.int(v),
          num: true, risk: risk,
          title: risk ? 'Grupo pequeno (' + v + ' registros) — seria suprimido no compartilhamento' : null
        });
      });
      cells.push({ v: MI.fmt.int(ct.rowTotals[i]), num: true });
      return { cells: cells };
    });
    const totalCells = [{ v: 'Total' }].concat(ct.colTotals.map(function (t) { return { v: MI.fmt.int(t), num: true }; }));
    totalCells.push({ v: MI.fmt.int(ct.total), num: true });
    rows.push({ isTotal: true, cells: totalCells });
    return U.table(headers, rows);
  };

  /* ---------------- Mapa de calor dia × hora ---------------- */
  U.heatmap = function (hm) {
    if (!hm) return U.unavailable('Mapa de calor indisponível', ['Dia da semana', 'Horário']);
    const t = MI.charts.theme();
    const rows = [];
    for (let d = 0; d < 7; d++) {
      const cells = [el('span', { class: 'heat__dow', text: MI.DIAS_SEMANA_ABREV[d] })];
      for (let h = 0; h < 24; h++) {
        const v = hm.grid[d][h];
        const ratio = hm.max ? v / hm.max : 0;
        const bg = ratio === 0 ? 'var(--surface-3)' : MI.charts.hexAlpha(ratio > 0.55 ? t.series[0] : t.series[1], 0.18 + ratio * 0.82);
        cells.push(el('div', {
          class: 'heat__cell', style: 'background:' + bg,
          title: MI.DIAS_SEMANA[d] + ', ' + MI.fmt.hour(h) + ' — ' + MI.fmt.int(v) + ' registros (' + MI.fmt.pctOf(v, hm.total, 1) + ')'
        }));
      }
      rows.push(el('div', { class: 'heat__row' }, cells));
    }
    const hourLabels = [el('span', {})];
    for (let h = 0; h < 24; h++) hourLabels.push(el('span', { class: 'heat__hour', text: h % 3 === 0 ? String(h) : '' }));
    return el('div', {}, [
      el('div', { style: 'overflow-x:auto' }, el('div', {}, [
        el('div', { class: 'heat' }, rows),
        el('div', { class: 'heat__hours' }, hourLabels)
      ])),
      el('div', { class: 'heat__scale' }, [
        'menor', el('span', { class: 'heat__ramp' }), 'maior',
        el('span', { style: 'margin-left:auto', text: 'Pico: ' + MI.fmt.int(hm.max) + ' registros em uma célula' })
      ])
    ]);
  };

  /* ---------------- Descobertas ---------------- */
  U.findings = function (list, o) {
    o = o || {};
    if (!list || !list.length) return U.empty('Nenhuma descoberta automática', 'A base ativa não tem colunas suficientes para gerar leituras estatísticas.');
    return el('div', { class: 'findings' }, list.slice(0, o.limit || 99).map(function (f) {
      const badge = f.kind === 'fato' ? el('span', { class: 'badge badge--fato', text: 'Fato observado' })
        : f.kind === 'acao' ? el('span', { class: 'badge badge--ok', text: 'Ação sugerida' })
          : el('span', { class: 'badge badge--hipotese', text: 'Hipótese' });
      return el('article', { class: 'finding' + (f.kind === 'hipotese' ? ' finding--hipotese' : f.kind === 'acao' ? ' finding--acao' : '') }, [
        el('div', { class: 'finding__top' }, [badge, el('span', { class: 'finding__tema', text: f.tema || '' })]),
        el('h4', { text: f.titulo }),
        el('p', { text: f.texto })
      ]);
    }));
  };

  /* ---------------- Estados ---------------- */
  U.empty = function (title, text) {
    return el('div', { class: 'empty' }, [
      el('div', { html: MI.icon('info', 26) }),
      el('h4', { text: title }),
      text ? el('p', { text: text }) : null
    ]);
  };

  U.unavailable = function (title, missingRoles) {
    return el('div', { class: 'unavailable' }, [
      el('div', { text: title }),
      missingRoles && missingRoles.length
        ? el('div', { style: 'margin-top:6px' }, [
          'Requer ' + (missingRoles.length > 1 ? 'as colunas' : 'a coluna') + ' ',
          el('b', { text: missingRoles.join(', ') }),
          '. Nenhuma coluna da base ativa foi mapeada assim — ajuste em ',
          el('b', { text: 'Importação de dados › Mapeamento' }), '.'
        ])
        : null
    ]);
  };

  U.locked = function (indicatorId) {
    const ind = MI.privacy.INDICATOR_BY_ID[indicatorId];
    return el('div', { class: 'locked' }, [
      el('div', { html: MI.icon('lock', 26) }),
      el('h4', { text: 'Indicador não liberado' }),
      el('p', { text: '“' + (ind ? ind.label : indicatorId) + '” ainda não foi aprovado pela Smoov para compartilhamento com a 10 Move.' })
    ]);
  };

  /* Envolve um construtor com a regra de visibilidade do indicador. */
  U.guarded = function (indicatorId, builder) {
    if (MI.privacy.canSee(indicatorId)) return builder();
    const ind = MI.privacy.INDICATOR_BY_ID[indicatorId];
    return U.card({
      span: (ind && ind.span) || 'c6',
      title: ind ? ind.label : 'Indicador restrito',
      sub: 'Visão 10 Move',
      body: U.locked(indicatorId)
    });
  };

  U.note = function (kind, parts) {
    return el('div', { class: 'note' + (kind ? ' note--' + kind : '') }, [
      el('span', { html: MI.icon(kind === 'warn' || kind === 'crit' ? 'alert' : kind === 'ok' ? 'check' : 'info', 17) }),
      el('div', {}, parts)
    ]);
  };

  U.statline = function (stats) {
    return el('div', { class: 'statline' }, stats.filter(Boolean).map(function (s) {
      return el('div', { class: 'stat' }, [
        el('div', { class: 'stat__k', text: s.k }),
        el('div', { class: 'stat__v', text: s.v })
      ]);
    }));
  };

  U.section = function (title, sub, actions) {
    return el('div', { class: 'section-title' }, [
      el('h2', { text: title }),
      sub ? el('p', { text: sub }) : null,
      actions ? el('div', { style: 'margin-left:auto;display:flex;gap:8px;flex-wrap:wrap' }, actions) : null
    ]);
  };

  U.btn = function (label, opts) {
    opts = opts || {};
    return el('button', {
      class: 'btn' + (opts.variant ? ' btn--' + opts.variant : '') + (opts.sm ? ' btn--sm' : ''),
      type: 'button', onclick: opts.onClick, disabled: opts.disabled, title: opts.title || null
    }, [opts.icon ? el('span', { html: MI.icon(opts.icon, opts.sm ? 14 : 16) }) : null, label]);
  };

  U.grid = function (children) { return el('div', { class: 'grid' }, children); };

  /* Aviso padrão sobre a origem dos números */
  U.demoNotice = function () {
    const ds = MI.store.dataset;
    if (!ds || ds.source !== 'demo') return null;
    return U.note('warn', [
      el('strong', { text: 'Números demonstrativos. ' }),
      'A base ativa é fictícia, gerada neste navegador para a plataforma funcionar antes da importação. ' +
      'Não representa dados reais da Smoov. Importe um arquivo em “Importação de dados” para analisar a base verdadeira.'
    ]);
  };

  MI.ui = U;

})(window.MI);
