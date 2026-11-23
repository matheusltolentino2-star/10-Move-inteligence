/* 10 Move Intelligence — Perfil de clientes */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, S = MI.stats;

  const state = { a: null, b: null, percent: false };

  MI.views.profile = {
    title: 'Perfil de clientes',
    subtitle: 'Demografia, atributos e cruzamentos',
    icon: 'users',

    render: function (root) {
      const st = MI.store, rows = st.rows;
      const notice = U.demoNotice();
      if (notice) root.appendChild(el('div', { style: 'margin-bottom:14px' }, notice));

      if (!rows.length) {
        root.appendChild(U.card({ span: 'c12', body: U.empty('Nenhum registro no recorte atual') }));
        return;
      }

      /* ---------- Idade ---------- */
      root.appendChild(U.section('Idade', 'Curva por ano e agrupamento em faixas'));
      const gi = [];
      if (st.has('_idade')) {
        gi.push(U.guarded('demo.idade', function () {
          const curve = S.ageCurve(rows);
          const s = S.numStats(rows, '_idade');
          const peak = curve.slice().sort(function (a, b) { return b.value - a.value; })[0];
          return U.chartCard({
            title: 'Curva de idade (ano a ano)', span: 'c8', height: 'lg',
            sub: 'Pico em ' + peak.idade + ' anos (' + MI.fmt.int(peak.value) + ' registros) · ' +
              MI.fmt.int(s.missing) + ' sem idade',
            render: function (cv) {
              return MI.charts.line(cv, curve.map(function (c) { return c.label; }),
                [{ label: 'Registros', values: curve.map(function (c) { return c.value; }), color: MI.charts.theme().series[0] }],
                { maxTicks: 14 });
            },
            extra: el('div', { style: 'margin-top:12px' }, U.statline([
              { k: 'Mínimo', v: MI.fmt.int(s.min) }, { k: 'P25', v: MI.fmt.int(s.p25) },
              { k: 'Mediana', v: MI.fmt.dec(s.median, 1) }, { k: 'Média', v: MI.fmt.dec(s.mean, 1) },
              { k: 'P75', v: MI.fmt.int(s.p75) }, { k: 'P90', v: MI.fmt.int(s.p90) },
              { k: 'Máximo', v: MI.fmt.int(s.max) }, { k: 'Desvio padrão', v: MI.fmt.dec(s.sd, 1) }
            ]))
          });
        }));
        gi.push(U.card({
          span: 'c4', title: 'Faixas de idade', sub: 'Participação de cada faixa no recorte',
          body: U.bars(MI.privacy.guardDist(S.dist(rows, '_faixa', { order: MI.AGE_BANDS.map(function (b) { return b.label; }) })), {})
        }));
      } else {
        gi.push(U.card({ span: 'c12', title: 'Idade', body: U.unavailable('Nenhuma coluna de idade na base ativa', ['Idade', 'Data de nascimento']) }));
      }
      root.appendChild(el('div', { class: 'grid' }, gi));

      /* ---------- Atributos categóricos ---------- */
      const dims = [
        { id: '_genero', title: 'Gênero', ind: 'demo.genero' },
        { id: '_plano', title: 'Plano / produto', ind: 'neg.plano' },
        { id: '_canal', title: 'Canal de aquisição', ind: 'neg.canal' },
        { id: '_status', title: 'Status', ind: 'base.volume' },
        { id: '_dispositivo', title: 'Dispositivo', ind: 'base.volume' },
        { id: '_regiao', title: 'Região', ind: 'geo.uf' }
      ].filter(function (d) { return st.has(d.id); });

      if (st.dataset.extraDims.length) {
        st.dataset.extraDims.slice(0, 4).forEach(function (c) {
          dims.push({ id: c.key, title: c.label, ind: 'base.volume', raw: true });
        });
      }

      if (dims.length) {
        root.appendChild(U.section('Atributos da base', 'Toda dimensão categórica detectada no arquivo'));
        root.appendChild(el('div', { class: 'grid' }, dims.map(function (d) {
          return U.guarded(d.ind, function () {
            const dist = MI.privacy.guardDist(S.dist(rows, d.id, { limit: 8 }));
            return U.card({
              span: 'c4', title: d.title,
              sub: dist.missing ? MI.fmt.pctOf(dist.missing, rows.length, 1) + ' sem valor' : dist.length + ' categorias',
              body: U.bars(dist, { compact: true })
            });
          });
        })));
      }

      /* ---------- Cruzamento interativo ---------- */
      const crossDims = [
        { id: '_faixa', label: 'Faixa de idade' }, { id: '_genero', label: 'Gênero' },
        { id: '_uf', label: 'Estado' }, { id: '_regiao', label: 'Região' },
        { id: '_plano', label: 'Plano' }, { id: '_canal', label: 'Canal' },
        { id: '_status', label: 'Status' }, { id: '_dispositivo', label: 'Dispositivo' },
        { id: '_cidade', label: 'Cidade' }
      ].filter(function (d) { return st.has(d.id); })
        .concat(st.dataset.extraDims.map(function (c) { return { id: c.key, label: c.label }; }));

      if (crossDims.length >= 2) {
        root.appendChild(U.section('Cruzamento de características', 'Combine duas dimensões para encontrar segmentos distintos'));
        if (!state.a || !crossDims.some(function (d) { return d.id === state.a; })) state.a = crossDims[0].id;
        if (!state.b || !crossDims.some(function (d) { return d.id === state.b; }) || state.b === state.a) {
          state.b = (crossDims.filter(function (d) { return d.id !== state.a; })[0] || crossDims[0]).id;
        }

        const mkSel = function (which) {
          const sel = el('select', { class: 'input', style: 'max-width:180px' },
            crossDims.map(function (d) {
              return el('option', { value: d.id, selected: state[which] === d.id }, d.label);
            }));
          sel.addEventListener('change', function () { state[which] = sel.value; MI.app.rerender(); });
          return sel;
        };

        root.appendChild(el('div', { class: 'grid' }, U.guarded('demo.cruzamento', function () {
          const ct = MI.privacy.guardCrosstab(S.crosstab(rows, state.a, state.b, { limitA: 12, limitB: 8 }));
          const chi = S.chiSquare(ct);
          const labelA = (crossDims.filter(function (d) { return d.id === state.a; })[0] || {}).label;
          const labelB = (crossDims.filter(function (d) { return d.id === state.b; })[0] || {}).label;
          const pal = MI.charts.palette(ct.colLabels.length);

          const pctToggle = el('label', { class: 'opt' }, [
            el('input', {
              type: 'checkbox', checked: state.percent,
              onchange: function (e) { state.percent = e.target.checked; MI.app.rerender(); }
            }), 'Em %'
          ]);

          const cv = el('canvas');
          U.defer(function () { MI.charts.stacked(cv, ct, { percent: state.percent }); });

          return U.card({
            span: 'c12',
            title: labelA + ' × ' + labelB,
            sub: ct.isMasked && ct.maskedCells
              ? ct.maskedCells + ' célula(s) suprimida(s) por terem menos de ' + ct.k + ' registros'
              : (!ct.isMasked && ct.atRiskCells ? ct.atRiskCells + ' célula(s) abaixo de ' + ct.k + ' registros — destacadas em amarelo' : 'Nenhuma célula abaixo do limite de ' + ct.k),
            tools: [mkSel('a'), el('span', { style: 'color:var(--faint)' }, '×'), mkSel('b'), pctToggle],
            body: [
              el('div', { class: 'chart chart--lg' }, cv),
              U.legend(ct.colLabels.map(function (c, i) { return { color: pal[i], label: c }; })),
              el('div', { style: 'margin-top:16px' }, U.crosstab(ct, { rowLabel: labelA, percent: state.percent })),
              chi && chi.cramerV != null ? el('div', { style: 'margin-top:12px' }, U.note(
                chi.cramerV > 0.15 ? 'info' : null,
                [
                  el('strong', { text: 'Associação entre as duas dimensões: V de Cramér ' + MI.fmt.dec(chi.cramerV, 3) + '. ' }),
                  chi.cramerV > 0.25 ? 'Associação forte — os grupos se comportam de forma bem distinta.'
                    : chi.cramerV > 0.1 ? 'Associação moderada — há diferença perceptível entre os grupos.'
                      : 'Associação fraca — as duas dimensões são praticamente independentes nesta base.',
                  chi.minExpected < 5 ? ' Atenção: há células com frequência esperada abaixo de 5, o que torna o teste menos confiável.' : ''
                ]
              )) : null
            ]
          });
        })));
      }

      /* ---------- Estatística descritiva das métricas ---------- */
      const measures = st.dataset.measures;
      if (measures.length) {
        root.appendChild(U.section('Métricas numéricas', 'Estatística descritiva de todas as colunas numéricas detectadas'));
        const headers = [
          { label: 'Coluna' }, { label: 'Preenchidos', num: true }, { label: 'Média', num: true },
          { label: 'Mediana', num: true }, { label: 'Desvio', num: true }, { label: 'Mín', num: true },
          { label: 'P25', num: true }, { label: 'P75', num: true }, { label: 'P90', num: true }, { label: 'Máx', num: true }
        ];
        const tRows = measures.map(function (c) {
          const s = S.numStats(rows, c.key);
          if (!s) return null;
          const f = function (v) { return MI.fmt.dec(v, Math.abs(v) < 10 ? 2 : 1); };
          return {
            cells: [
              { v: c.label }, { v: MI.fmt.int(s.n) }, { v: f(s.mean) }, { v: f(s.median) },
              { v: f(s.sd) }, { v: f(s.min) }, { v: f(s.p25) }, { v: f(s.p75) }, { v: f(s.p90) }, { v: f(s.max) }
            ]
          };
        }).filter(Boolean);
        root.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', body: U.table(headers, tRows)
        })));
      }
    }
  };

})(window.MI);
