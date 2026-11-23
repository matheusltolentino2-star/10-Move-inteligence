/* 10 Move Intelligence — Comportamento e horários */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, S = MI.stats;

  MI.views.behavior = {
    title: 'Comportamento e horários',
    subtitle: 'Dias, horários, frequência, recência e sazonalidade',
    icon: 'clock',

    render: function (root) {
      const st = MI.store, rows = st.rows;
      const notice = U.demoNotice();
      if (notice) root.appendChild(el('div', { style: 'margin-bottom:14px' }, notice));

      const temAlgo = ['_hora', '_dow', '_data', '_cad', '_freq', '_recencia', '_duracao'].some(function (k) { return st.has(k); });
      if (!temAlgo) {
        root.appendChild(U.card({
          span: 'c12', title: 'Sem dimensões comportamentais',
          body: U.unavailable('A base ativa não tem colunas de tempo, frequência ou recência',
            ['Data da última atividade', 'Horário', 'Dia da semana', 'Frequência', 'Dias desde a última atividade'])
        }));
        return;
      }
      if (!rows.length) {
        root.appendChild(U.card({ span: 'c12', body: U.empty('Nenhum registro no recorte atual') }));
        return;
      }

      /* ---------- Dia e hora ---------- */
      if (st.has('_hora') || st.has('_dow')) {
        root.appendChild(U.section('Quando a base se movimenta', 'Somente dias e horários presentes no arquivo'));
        const g = [];

        if (st.has('_dow') && st.has('_hora')) {
          g.push(U.guarded('comp.horarios', function () {
            const hm = S.dowHourHeatmap(rows);
            let pico = null;
            if (hm) {
              for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
                if (!pico || hm.grid[d][h] > pico.v) pico = { d: d, h: h, v: hm.grid[d][h] };
              }
            }
            return U.card({
              span: 'c12', title: 'Mapa de calor: dia da semana × horário',
              sub: pico ? 'Pico em ' + MI.DIAS_SEMANA[pico.d].toLowerCase() + ' às ' + MI.fmt.hour(pico.h) +
                ' (' + MI.fmt.int(pico.v) + ' registros, ' + MI.fmt.pctOf(pico.v, hm.total, 1) + ' do total)' : null,
              body: U.heatmap(hm)
            });
          }));
        }

        if (st.has('_hora')) {
          g.push(U.guarded('comp.horarios', function () {
            const d = S.dist(rows, '_hora', {});
            const byHour = [];
            for (let h = 0; h < 24; h++) {
              const e = d.filter(function (x) { return +x.label === h; })[0];
              byHour.push({ label: MI.fmt.hour(h), value: e ? e.value : 0 });
            }
            const total = MI.sum(byHour, function (e) { return e.value; });
            byHour.forEach(function (e) { e.pct = total ? e.value / total : 0; });
            const topIdx = byHour.reduce(function (a, e, i) { return e.value > byHour[a].value ? i : a; }, 0);
            const blocos = [
              { label: 'Madrugada (0–5h)', from: 0, to: 5 }, { label: 'Manhã (6–11h)', from: 6, to: 11 },
              { label: 'Tarde (12–17h)', from: 12, to: 17 }, { label: 'Noite (18–23h)', from: 18, to: 23 }
            ].map(function (b) {
              let v = 0;
              for (let h = b.from; h <= b.to; h++) v += byHour[h].value;
              return { label: b.label, value: v, pct: total ? v / total : 0 };
            });
            return U.chartCard({
              title: 'Distribuição por hora do dia', span: 'c7', height: 'md',
              sub: 'Horário de maior volume: ' + byHour[topIdx].label,
              render: function (cv) { return MI.charts.bar(cv, byHour, { highlight: topIdx, thickness: 22 }); },
              extra: el('div', { style: 'margin-top:14px' }, U.bars(blocos, { compact: true, total: total, monochrome: true }))
            });
          }));
        }

        if (st.has('_dow')) {
          g.push(U.guarded('comp.horarios', function () {
            const d = S.dist(rows, '_dow', {});
            const byDow = MI.DIAS_SEMANA.map(function (name, i) {
              const e = d.filter(function (x) { return +x.label === i; })[0];
              return { label: MI.DIAS_SEMANA_ABREV[i], full: name, value: e ? e.value : 0 };
            });
            const total = MI.sum(byDow, function (e) { return e.value; });
            byDow.forEach(function (e) { e.pct = total ? e.value / total : 0; });
            const uteis = MI.sum(byDow.slice(1, 6), function (e) { return e.value; });
            const fds = byDow[0].value + byDow[6].value;
            return U.chartCard({
              title: 'Distribuição por dia da semana', span: 'c5', height: 'md',
              sub: 'Dias úteis ' + MI.fmt.pctOf(uteis, total, 1) + ' · fim de semana ' + MI.fmt.pctOf(fds, total, 1),
              render: function (cv) { return MI.charts.bar(cv, byDow, { multicolor: false }); },
              foot: 'Média diária: ' + MI.fmt.int(uteis / 5) + ' em dia útil contra ' + MI.fmt.int(fds / 2) + ' no fim de semana'
            });
          }));
        }
        root.appendChild(el('div', { class: 'grid' }, g));
      }

      /* ---------- Frequência e recência ---------- */
      if (st.has('_freq') || st.has('_recencia') || st.has('_duracao')) {
        root.appendChild(U.section('Intensidade de uso', 'Frequência, recência e duração conforme as colunas detectadas'));
        const g = [];

        if (st.has('_freq')) {
          g.push(U.guarded('comp.frequencia', function () {
            const h = S.histogram(rows, '_freq', 18);
            const s = S.numStats(rows, '_freq');
            return U.chartCard({
              title: 'Distribuição da frequência', span: 'c6', height: 'md',
              sub: 'Média ' + MI.fmt.dec(s.mean, 1) + ' · mediana ' + MI.fmt.dec(s.median, 1) +
                ' · coeficiente de variação ' + MI.fmt.pct(s.cv, 0),
              render: function (cv) { return MI.charts.bar(cv, h, { rotate: 45 }); },
              extra: el('div', { style: 'margin-top:12px' }, U.statline([
                { k: 'P25', v: MI.fmt.dec(s.p25, 1) }, { k: 'Mediana', v: MI.fmt.dec(s.median, 1) },
                { k: 'P75', v: MI.fmt.dec(s.p75, 1) }, { k: 'P90', v: MI.fmt.dec(s.p90, 1) },
                { k: 'Máximo', v: MI.fmt.dec(s.max, 1) }
              ]))
            });
          }));
        }

        if (st.has('_recencia')) {
          g.push(U.guarded('comp.frequencia', function () {
            const faixas = [
              { label: '0–7 dias', min: 0, max: 7 }, { label: '8–30 dias', min: 8, max: 30 },
              { label: '31–60 dias', min: 31, max: 60 }, { label: '61–120 dias', min: 61, max: 120 },
              { label: '121–240 dias', min: 121, max: 240 }, { label: '241–365 dias', min: 241, max: 365 },
              { label: 'Mais de 1 ano', min: 366, max: Infinity }
            ];
            const counts = faixas.map(function (f) {
              let v = 0;
              for (let i = 0; i < rows.length; i++) {
                const r = rows[i]._recencia;
                if (r != null && r >= f.min && r <= f.max) v++;
              }
              return { label: f.label, value: v };
            });
            const total = MI.sum(counts, function (e) { return e.value; });
            counts.forEach(function (e) { e.pct = total ? e.value / total : 0; });
            const s = S.numStats(rows, '_recencia');
            return U.card({
              span: 'c6', title: 'Recência: tempo desde a última atividade',
              sub: 'Mediana de ' + MI.fmt.int(s.median) + ' dias · ' + MI.fmt.int(s.n) + ' registros com data válida',
              body: [
                U.bars(MI.privacy.guardDist(Object.assign(counts, { total: total })), {}),
                el('div', { style: 'margin-top:14px' }, U.note(null, [
                  el('strong', { text: 'Como ler. ' }),
                  'Recência é medida contra a data mais recente encontrada na base (' +
                  MI.fmt.date(st.dataset.refDate) + '), não contra a data de hoje. ' +
                  'Isso evita que o simples envelhecimento do arquivo distorça o indicador.'
                ]))
              ]
            });
          }));
        }

        if (st.has('_duracao')) {
          g.push(U.guarded('comp.frequencia', function () {
            const h = S.histogram(rows, '_duracao', 16);
            const s = S.numStats(rows, '_duracao');
            return U.chartCard({
              title: 'Duração média por registro', span: 'c6', height: 'md',
              sub: 'Média ' + MI.fmt.dec(s.mean, 1) + ' · mediana ' + MI.fmt.dec(s.median, 1),
              render: function (cv) { return MI.charts.bar(cv, h, { rotate: 45, color: MI.charts.theme().series[2] }); }
            });
          }));
        }

        if (st.has('_freq') && st.has('_recencia')) {
          g.push(U.guarded('comp.frequencia', function () {
            const pts = [];
            const step = Math.max(1, Math.floor(rows.length / 3000));
            for (let i = 0; i < rows.length; i += step) {
              const r = rows[i];
              if (r._recencia == null || r._freq == null) continue;
              pts.push({ x: r._recencia, y: r._freq });
            }
            const c = S.correlation(rows, '_recencia', '_freq');
            return U.chartCard({
              title: 'Recência × frequência', span: 'c6', height: 'md',
              sub: c ? 'Correlação de Pearson ' + MI.fmt.dec(c.r, 3) + ' sobre ' + MI.fmt.int(c.n) + ' registros'
                : 'Dados insuficientes para correlação',
              render: function (cv) {
                return MI.charts.scatter(cv, pts, { xLabel: 'Dias desde a última atividade', yLabel: 'Frequência' });
              },
              foot: 'Amostra de ' + MI.fmt.int(pts.length) + ' pontos para manter o gráfico legível. A correlação usa todos os registros.'
            });
          }));
        }
        root.appendChild(el('div', { class: 'grid' }, g));
      }

      /* ---------- Sazonalidade ---------- */
      if (st.has('_data') || st.has('_cad')) {
        root.appendChild(U.section('Sazonalidade', 'Séries mensais construídas a partir das colunas de data'));
        root.appendChild(el('div', { class: 'grid' }, U.guarded('comp.sazonalidade', function () {
          const mAtiv = st.has('_data') ? S.monthly(rows, '_mes', { tail: 36 }) : null;
          const mCad = st.has('_cad') ? S.monthly(rows, '_mesCad', { tail: 36 }) : null;
          const base = mCad || mAtiv;
          const series = [];
          const t = MI.charts.theme();
          if (mCad) series.push({ label: 'Cadastros no mês', values: mCad.map(function (m) { return m.value; }), color: t.series[0] });
          if (mAtiv) series.push({ label: 'Registros com última atividade no mês', values: alignTo(base, mAtiv), color: t.series[1] });

          const porMes = new Array(12).fill(0);
          const fonte = mAtiv || mCad;
          fonte.forEach(function (m) { porMes[(+m.key.split('-')[1]) - 1] += m.value; });
          const totalMes = MI.sum(porMes);
          const sazon = MI.MESES.map(function (nome, i) {
            return { label: MI.MESES_ABREV[i], value: porMes[i], pct: totalMes ? porMes[i] / totalMes : 0 };
          });
          const maxMes = sazon.reduce(function (a, e) { return e.value > a.value ? e : a; }, sazon[0]);
          const minMes = sazon.reduce(function (a, e) { return e.value < a.value ? e : a; }, sazon[0]);

          return U.card({
            span: 'c12', title: 'Evolução e sazonalidade mensal',
            sub: base.length + ' meses na base, de ' + MI.fmt.monthLabel(base[0].key) + ' a ' + MI.fmt.monthLabel(base[base.length - 1].key),
            body: [
              (function () {
                const cv = el('canvas');
                U.defer(function () {
                  MI.charts.line(cv, base.map(function (m) { return m.label; }), series, { maxTicks: 14 });
                });
                return el('div', { class: 'chart chart--lg' }, cv);
              })(),
              U.legend(series.map(function (s) { return { color: s.color, label: s.label }; })),
              el('div', { class: 'grid', style: 'margin-top:18px' }, [
                U.card({
                  span: 'c6', class: 'no-shadow', title: 'Volume acumulado por mês do ano',
                  sub: 'Soma de todos os anos presentes — mostra o padrão sazonal',
                  body: U.bars(sazon, { compact: true, total: totalMes, monochrome: true })
                }),
                U.card({
                  span: 'c6', title: 'Leitura da sazonalidade',
                  body: [
                    U.statline([
                      { k: 'Mês mais forte', v: MI.titleCase(maxMes.label) + ' · ' + MI.fmt.pct(maxMes.pct, 1) },
                      { k: 'Mês mais fraco', v: MI.titleCase(minMes.label) + ' · ' + MI.fmt.pct(minMes.pct, 1) },
                      { k: 'Amplitude', v: minMes.value ? MI.fmt.dec(maxMes.value / minMes.value, 2) + '×' : '—' }
                    ]),
                    el('div', { style: 'margin-top:14px' }, U.note(null, [
                      el('strong', { text: 'Cuidado na interpretação. ' }),
                      'A série de “última atividade” concentra registros nos meses recentes por construção: ' +
                      'quem está ativo tem a última atividade sempre próxima do fim da base. ' +
                      'Para sazonalidade de consumo, a leitura confiável é a série de cadastros ou um arquivo com uma linha por transação.'
                    ]))
                  ]
                })
              ])
            ]
          });
        })));
      }

      /* ---------- Leituras ---------- */
      const f = S.findings(rows).filter(function (x) { return ['Comportamento', 'Crescimento'].indexOf(x.tema) >= 0; });
      if (f.length) {
        root.appendChild(U.section('Leituras comportamentais', 'Fatos calculados sobre o recorte atual'));
        root.appendChild(el('div', { class: 'grid' }, U.card({ span: 'c12', body: U.findings(f) })));
      }
    }
  };

  /* Alinha a série B às chaves da série A (meses faltantes viram 0) */
  function alignTo(a, b) {
    const m = {};
    b.forEach(function (e) { m[e.key] = e.value; });
    return a.map(function (e) { return m[e.key] || 0; });
  }

})(window.MI);
