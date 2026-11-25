/* 10 Move Intelligence — Visão geral (dashboard executivo) */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, S = MI.stats;

  MI.views.overview = {
    title: 'Visão geral',
    subtitle: 'Leitura executiva da base ativa',
    icon: 'dashboard',

    render: function (root) {
      const st = MI.store, ds = st.dataset, rows = st.rows;
      const notice = U.demoNotice();
      if (notice) root.appendChild(el('div', { style: 'margin-bottom:14px' }, notice));

      if (!rows.length) {
        root.appendChild(U.card({
          span: 'c12', title: 'Nenhum registro no recorte atual',
          body: U.empty('Os filtros ativos não retornaram registros', 'Remova um ou mais filtros na barra acima para voltar a ver dados.')
        }));
        return;
      }

      /* ---------------- KPIs ---------------- */
      const kpis = [];
      const mensalAtiv = st.has('_data') ? S.monthly(rows, '_mes', { tail: 18 }) : null;
      const mensalCad = st.has('_cad') ? S.monthly(rows, '_mesCad', { tail: 18 }) : null;

      kpis.push(U.kpi({
        label: 'Registros no recorte', icon: 'database', accent: true, span: 'c3',
        value: MI.fmt.int(rows.length),
        hint: rows.length === ds.rows.length
          ? 'Base completa · ' + ds.columns.length + ' colunas'
          : MI.fmt.pctOf(rows.length, ds.rows.length, 1) + ' da base (' + MI.fmt.int(ds.rows.length) + ' registros)',
        spark: mensalCad ? mensalCad.map(function (m) { return m.value; }) : null,
        sparkColor: '#3ddba9'
      }));

      const idKey = st.role('id');
      if (idKey) {
        const uniq = S.uniqueCount(rows, idKey);
        const dup = rows.length - uniq;
        kpis.push(U.kpi({
          label: 'Clientes únicos', icon: 'users', span: 'c3',
          value: MI.fmt.int(uniq),
          hint: dup > 0
            ? MI.fmt.int(dup) + ' registro(s) com identificador repetido'
            : 'Um registro por identificador'
        }));
      }

      if (st.has('_idade')) {
        const s = S.numStats(rows, '_idade');
        kpis.push(U.kpi({
          label: 'Idade mediana', icon: 'users', span: 'c3',
          value: MI.fmt.dec(s.median, 0), unit: 'anos',
          hint: 'Média ' + MI.fmt.dec(s.mean, 1) + ' · metade entre ' + MI.fmt.int(s.p25) + ' e ' + MI.fmt.int(s.p75)
        }));
      }

      if (st.has('_uf')) {
        const d = MI.privacy.guardDist(S.dist(rows, '_uf', {}));
        const real = d.filter(function (e) { return !e.suppressed; });
        kpis.push(U.kpi({
          label: 'Cobertura geográfica', icon: 'map', span: 'c3',
          value: MI.fmt.int(real.length), unit: real.length === 1 ? 'UF' : 'UFs',
          hint: real.length ? 'Maior: ' + real[0].label + ' (' + MI.fmt.pct(real[0].pct, 1) + ')' : ''
        }));
      }

      if (st.has('_valor')) {
        const s = S.numStats(rows, '_valor');
        kpis.push(U.kpi({
          label: 'Ticket médio', icon: 'spark', span: 'c3',
          value: MI.fmt.money(s.mean),
          hint: 'Mediana ' + MI.fmt.money(s.median) + ' · P90 ' + MI.fmt.money(s.p90)
        }));
      }
      if (st.has('_receita')) {
        const s = S.numStats(rows, '_receita');
        kpis.push(U.kpi({
          label: 'Receita acumulada no recorte', icon: 'spark', span: 'c3',
          value: 'R$ ' + MI.fmt.compact(s.sum),
          hint: 'Média por registro ' + MI.fmt.money(s.mean)
        }));
      }
      if (st.has('_freq')) {
        const s = S.numStats(rows, '_freq');
        kpis.push(U.kpi({
          label: 'Frequência média', icon: 'clock', span: 'c3',
          value: MI.fmt.dec(s.mean, 1),
          hint: 'Mediana ' + MI.fmt.dec(s.median, 1) + ' · P90 ' + MI.fmt.dec(s.p90, 1)
        }));
      }
      if (st.has('_recencia')) {
        const s = S.numStats(rows, '_recencia');
        const ativos = rows.filter(function (r) { return r._recencia != null && r._recencia <= 45; }).length;
        kpis.push(U.kpi({
          label: 'Ativos em 45 dias', icon: 'check', span: 'c3',
          value: MI.fmt.pctOf(ativos, s.n, 1),
          hint: MI.fmt.int(ativos) + ' registros · recência mediana ' + MI.fmt.int(s.median) + ' dias'
        }));
      }

      const completude = (function () {
        let filled = 0, cells = 0;
        ds.columns.forEach(function (c) { filled += c.filled; cells += c.sampled; });
        return cells ? filled / cells : 1;
      })();
      kpis.push(U.kpi({
        label: 'Completude das colunas', icon: 'check', span: 'c3',
        value: MI.fmt.pct(completude, 1),
        hint: ds.columns.length + ' colunas detectadas · ' +
          ds.columns.filter(function (c) { return c.missingRate > 0.05; }).length + ' com mais de 5% de vazios'
      }));

      root.appendChild(U.guarded('base.volume', function () {
        return el('div', { class: 'grid' }, kpis.slice(0, 8));
      }));

      /* ---------------- Perfil ---------------- */
      root.appendChild(U.section('Quem está na base', 'Distribuições demográficas sobre o recorte filtrado'));
      const g1 = [];

      if (st.has('_faixa')) {
        g1.push(U.guarded('demo.idade', function () {
          const d = MI.privacy.guardDist(S.dist(rows, '_faixa', { order: MI.AGE_BANDS.map(function (b) { return b.label; }) }));
          return U.chartCard({
            title: 'Distribuição por faixa de idade', span: 'c6', height: 'md',
            sub: d.missing ? MI.fmt.int(d.missing) + ' registros sem idade' : 'Todos os registros com idade informada',
            render: function (cv) { return MI.charts.bar(cv, d, { color: MI.charts.theme().series[0] }); },
            foot: d.suppressedGroups ? d.suppressedGroups + ' faixa(s) suprimida(s) por terem menos de ' + MI.privacy.k + ' registros' : null
          });
        }));
      } else {
        g1.push(U.card({ span: 'c6', title: 'Distribuição por idade', body: U.unavailable('Indicador indisponível na base ativa', ['Idade', 'Data de nascimento']) }));
      }

      if (st.has('_genero')) {
        g1.push(U.guarded('demo.genero', function () {
          const d = MI.privacy.guardDist(S.dist(rows, '_genero', { limit: 6 }));
          const pal = MI.charts.palette(d.length);
          return U.chartCard({
            title: 'Distribuição por gênero', span: 'c3', height: 'md',
            sub: d.missing ? MI.fmt.pctOf(d.missing, rows.length, 1) + ' sem informação' : null,
            render: function (cv) { return MI.charts.doughnut(cv, d); },
            legend: d.map(function (e, i) {
              return { color: e.suppressed ? MI.charts.theme().suppressed : pal[i], label: e.label, value: MI.fmt.pct(e.pct, 1) };
            })
          });
        }));
      }

      if (st.has('_status')) {
        g1.push(U.card({
          span: 'c3', title: 'Status dos clientes', sub: 'Conforme a coluna mapeada como status',
          body: U.bars(MI.privacy.guardDist(S.dist(rows, '_status', { limit: 7 })), { compact: true })
        }));
      } else if (st.has('_plano')) {
        g1.push(U.card({
          span: 'c3', title: 'Mix de planos', sub: 'Participação por plano/produto',
          body: U.bars(MI.privacy.guardDist(S.dist(rows, '_plano', { limit: 7 })), { compact: true })
        }));
      }
      root.appendChild(el('div', { class: 'grid' }, g1));

      /* ---------------- Geografia ---------------- */
      if (st.has('_uf') || st.has('_cidade')) {
        root.appendChild(U.section('Onde estão', 'Concentração geográfica dos registros', [
          U.btn('Abrir inteligência geográfica', { sm: true, icon: 'map', onClick: function () { MI.app.go('geography'); } })
        ]));
        const g2 = [];
        if (st.has('_uf')) {
          g2.push(U.guarded('geo.uf', function () {
            const d = MI.privacy.guardDist(S.dist(rows, '_uf', {}));
            const cartograma = typeof MI.geo.cartogram === 'function';
            return U.card({
              span: 'c6', title: cartograma ? 'Cartograma por estado' : 'Registros por estado',
              sub: cartograma ? 'Grade esquemática do Brasil — intensidade conforme o volume de registros' : 'Distribuição no recorte atual',
              body: cartograma ? MI.geo.cartogram(d, {
                selected: st.filters._uf ? Array.from(st.filters._uf.values) : [],
                onSelect: function (uf) { MI.app.toggleCatValue('_uf', uf); }
              }) : U.bars(d, {compact:true})
            });
          }));
        }
        if (st.has('_cidade')) {
          g2.push(U.guarded('geo.cidade', function () {
            const d = MI.privacy.guardDist(S.dist(rows, '_cidade', { limit: 10, other: false }));
            return U.card({
              span: st.has('_uf') ? 'c6' : 'c12', title: 'Principais cidades', sub: 'Top 10 por volume de registros',
              body: U.rank(d.filter(function (e) { return !e.suppressed; }), { total: d.total }),
              foot: d.suppressedGroups ? d.suppressedGroups + ' cidade(s) com menos de ' + MI.privacy.k + ' registros foram suprimidas' : null
            });
          }));
        }
        root.appendChild(el('div', { class: 'grid' }, g2));
      }

      /* ---------------- Tempo e comportamento ---------------- */
      const temTempo = st.has('_hora') || st.has('_dow') || st.has('_data') || st.has('_cad');
      if (temTempo) {
        root.appendChild(U.section('Quando acontece', 'Distribuição temporal conforme as colunas de data e hora da base', [
          U.btn('Abrir comportamento', { sm: true, icon: 'clock', onClick: function () { MI.app.go('behavior'); } })
        ]));
        const g3 = [];
        if (st.has('_dow') && st.has('_hora')) {
          g3.push(U.guarded('comp.horarios', function () {
            return U.card({
              span: 'c8', title: 'Mapa de calor: dia da semana × horário',
              sub: 'Cada célula é o volume de registros naquele dia e hora',
              body: U.heatmap(S.dowHourHeatmap(rows))
            });
          }));
        }
        const serie = mensalAtiv || mensalCad;
        if (serie && serie.length > 2) {
          g3.push(U.guarded('comp.sazonalidade', function () {
            /* Uma série só: a de cadastros descreve crescimento sem o viés
               da "última atividade", que por construção empilha no mês final. */
            const base = mensalCad || mensalAtiv;
            const rotulo = mensalCad ? 'Novos cadastros por mês' : 'Registros por mês da última atividade';
            const cor = MI.charts.theme().series[mensalCad ? 0 : 1];
            return U.chartCard({
              title: 'Evolução mensal', span: g3.length ? 'c4' : 'c12', height: 'md',
              sub: rotulo + ' · últimos ' + base.length + ' meses da base',
              render: function (cv) {
                return MI.charts.line(cv, base.map(function (m) { return m.label; }),
                  [{ label: rotulo, values: base.map(function (m) { return m.value; }), color: cor }]);
              },
              foot: mensalCad && mensalAtiv
                ? 'A série de última atividade é analisada em Comportamento e horários, onde o viés de construção é explicado.'
                : null
            });
          }));
        }
        if (g3.length) root.appendChild(el('div', { class: 'grid' }, g3));
      }

      /* ---------------- Descobertas ---------------- */
      root.appendChild(U.section('Principais descobertas', 'Leituras calculadas sobre o recorte atual — todas são fatos observados na base', [
        U.btn('Ver oportunidades comerciais', { sm: true, icon: 'target', onClick: function () { MI.app.go('opportunities'); } })
      ]));
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', body: U.findings(S.findings(rows), { limit: 8 })
      })));
    }
  };

})(window.MI);
