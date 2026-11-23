/* 10 Move Intelligence — Inteligência comercial
   Separa rigorosamente: FATO (calculado na base), HIPÓTESE (leitura que
   precisa de validação) e AÇÃO SUGERIDA (decisão proposta). */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, S = MI.stats;

  MI.views.opportunities = {
    title: 'Oportunidades Comerciais',
    subtitle: 'Segmentos de valor, praças, canais e oportunidades de marketing',
    icon: 'target',

    render: function (root) {
      const st = MI.store, rows = st.rows, base = st.dataset.rows;
      const notice = U.demoNotice();
      if (notice) root.appendChild(el('div', { style: 'margin-bottom:14px' }, notice));

      if (!rows.length) {
        root.appendChild(U.card({ span: 'c12', body: U.empty('Nenhum registro no recorte atual') }));
        return;
      }

      const fatos = [], hipoteses = [], acoes = [];

      /* ---------- Segmentos de valor (RFM) ---------- */
      const rfm = S.rfm(rows);
      if (rfm) {
        root.appendChild(U.section('Segmentos de valor', 'Classificação por recência e frequência (RFM simplificado)'));
        root.appendChild(el('div', { class: 'grid' }, U.guarded('neg.segmentos', function () {
          const headers = [
            { label: 'Segmento' }, { label: 'Leitura' }, { label: 'Registros', num: true },
            { label: '% da base', num: true }
          ];
          if (st.has('_valor')) headers.push({ label: 'Ticket médio', num: true });
          if (st.has('_receita')) headers.push({ label: 'Receita', num: true });
          if (st.has('_idade')) headers.push({ label: 'Idade média', num: true });

          const totalReceita = st.has('_receita') ? MI.sum(rfm, function (s) { return s.receita || 0; }) : 0;
          const tRows = rfm.map(function (s) {
            const cells = [
              { v: el('span', {}, [el('b', { text: s.label })]) },
              { v: s.desc },
              { v: MI.fmt.int(s.count) },
              { v: MI.fmt.pct(s.pct, 1) }
            ];
            if (st.has('_valor')) cells.push({ v: s.ticket != null ? MI.fmt.money(s.ticket) : '—', num: true });
            if (st.has('_receita')) cells.push({
              v: s.receita != null ? 'R$ ' + MI.fmt.compact(s.receita) +
                (totalReceita ? ' · ' + MI.fmt.pct(s.receita / totalReceita, 1) : '') : '—', num: true
            });
            if (st.has('_idade')) cells.push({ v: s.idade ? MI.fmt.dec(s.idade.mean, 1) : '—', num: true });
            return { cells: cells };
          });

          const pal = MI.charts.palette(rfm.length);
          const cv = el('canvas');
          U.defer(function () {
            MI.charts.doughnut(cv, rfm.map(function (s) { return { label: s.label, value: s.count, pct: s.pct }; }));
          });

          return U.card({
            span: 'c12', title: 'Composição por segmento de valor',
            sub: 'Cortes em tercis: recência até ' + MI.fmt.int(rfm.cuts.r33) + ' dias e frequência acima de ' +
              MI.fmt.dec(rfm.cuts.f66, 1) + ' definem o topo',
            body: [
              el('div', { class: 'grid' }, [
                el('div', { class: 'c4' }, [
                  el('div', { class: 'chart chart--md' }, cv),
                  U.legend(rfm.map(function (s, i) { return { color: pal[i], label: s.label, value: MI.fmt.pct(s.pct, 1) }; }))
                ]),
                el('div', { class: 'c8' }, U.table(headers, tRows))
              ])
            ]
          });
        })));

        /* Fatos e ações a partir do RFM */
        const risco = rfm.filter(function (s) { return s.label === 'Em risco'; })[0];
        const campeoes = rfm.filter(function (s) { return s.label === 'Campeões'; })[0];
        const hib = rfm.filter(function (s) { return s.label === 'Hibernando'; })[0];

        if (campeoes && campeoes.count) {
          fatos.push({
            kind: 'fato', tema: 'Segmentos',
            titulo: 'Campeões são ' + MI.fmt.pct(campeoes.pct, 1) + ' da base' +
              (campeoes.receita != null ? ' e ' + MI.fmt.pctOf(campeoes.receita, MI.sum(rfm, function (s) { return s.receita || 0; }), 1) + ' da receita' : ''),
            texto: MI.fmt.int(campeoes.count) + ' registros com recência baixa e frequência alta' +
              (campeoes.ticket != null ? ', ticket médio de ' + MI.fmt.money(campeoes.ticket) : '') + '.'
          });
        }
        if (risco && risco.count > 0) {
          fatos.push({
            kind: 'fato', tema: 'Retenção',
            titulo: MI.fmt.int(risco.count) + ' clientes de alta frequência pararam de usar',
            texto: 'O segmento “Em risco” reúne ' + MI.fmt.pct(risco.pct, 1) + ' da base: eram frequentes e estão há mais de ' +
              MI.fmt.int(rfm.cuts.r66) + ' dias sem atividade' +
              (risco.receita != null ? ', com R$ ' + MI.fmt.compact(risco.receita) + ' de receita histórica associada' : '') + '.'
          });
          acoes.push({
            kind: 'acao', tema: 'Retenção',
            titulo: 'Campanha de reativação dirigida ao segmento “Em risco”',
            texto: 'É o grupo com maior retorno esperado por contato: já demonstrou hábito de uso e a interrupção é recente o suficiente ' +
              'para a reativação ser plausível. Priorizar sobre aquisição nova, cujo custo por cliente é tipicamente maior. ' +
              'Medir com grupo de controle para separar efeito da campanha do retorno espontâneo.'
          });
        }
        if (hib && hib.pct > 0.2) {
          hipoteses.push({
            kind: 'hipotese', tema: 'Base',
            titulo: 'Parcela relevante da base pode estar inativa de forma definitiva',
            texto: MI.fmt.pct(hib.pct, 1) + ' dos registros estão em “Hibernando” (baixa recência e baixa frequência). ' +
              'Antes de investir em reativação ampla, vale testar em amostra: se a resposta for muito baixa, ' +
              'o melhor uso desse grupo é como base de look-alike para aquisição, não como alvo direto.'
          });
        }
      }

      /* ---------- Concentração de receita ---------- */
      if (st.has('_receita')) {
        const vals = [];
        for (let i = 0; i < rows.length; i++) {
          const v = rows[i]._receita;
          if (v != null && !isNaN(v)) vals.push(v);
        }
        if (vals.length > 50) {
          vals.sort(function (a, b) { return b - a; });
          const total = MI.sum(vals);
          const share = function (p) {
            const n = Math.max(1, Math.round(vals.length * p));
            return MI.sum(vals.slice(0, n)) / total;
          };
          const top10 = share(0.1), top20 = share(0.2), top50 = share(0.5);
          root.appendChild(U.section('Concentração de receita', 'Quanto do resultado vem dos maiores clientes'));
          root.appendChild(el('div', { class: 'grid' }, U.guarded('neg.ticket', function () {
            const pts = [];
            let acc = 0;
            const stepN = Math.max(1, Math.floor(vals.length / 200));
            for (let i = 0; i < vals.length; i++) {
              acc += vals[i];
              if (i % stepN === 0) pts.push({ x: ((i + 1) / vals.length) * 100, y: (acc / total) * 100 });
            }
            const cv = el('canvas');
            U.defer(function () {
              MI.charts.line(cv, pts.map(function (p) { return MI.fmt.int(p.x) + '%'; }),
                [
                  { label: 'Receita acumulada', values: pts.map(function (p) { return p.y; }), color: MI.charts.theme().series[1], fmt: function (v) { return MI.fmt.dec(v, 1) + '%'; } },
                  { label: 'Distribuição igualitária', values: pts.map(function (p) { return p.x; }), color: MI.charts.theme().faint, fill: false, dash: [4, 4], fmt: function (v) { return MI.fmt.dec(v, 1) + '%'; } }
                ],
                { yFmt: function (v) { return MI.fmt.int(v) + '%'; }, maxTicks: 11 });
            });
            return U.card({
              span: 'c12', title: 'Curva de Lorenz da receita',
              sub: 'Eixo horizontal: clientes ordenados do maior para o menor. A linha tracejada seria a distribuição perfeitamente igual.',
              body: [
                el('div', { class: 'chart chart--lg' }, cv),
                el('div', { style: 'margin-top:14px' }, U.statline([
                  { k: 'Top 10% dos clientes', v: MI.fmt.pct(top10, 1) + ' da receita' },
                  { k: 'Top 20%', v: MI.fmt.pct(top20, 1) },
                  { k: 'Top 50%', v: MI.fmt.pct(top50, 1) },
                  { k: 'Receita total no recorte', v: 'R$ ' + MI.fmt.compact(total) }
                ]))
              ]
            });
          })));

          fatos.push({
            kind: 'fato', tema: 'Receita',
            titulo: 'Os 20% maiores clientes geram ' + MI.fmt.pct(top20, 1) + ' da receita',
            texto: 'Top 10% = ' + MI.fmt.pct(top10, 1) + ' · top 50% = ' + MI.fmt.pct(top50, 1) +
              '. Receita total no recorte: R$ ' + MI.fmt.compact(total) + ' sobre ' + MI.fmt.int(vals.length) + ' registros com valor.'
          });
          if (top20 > 0.55) {
            acoes.push({
              kind: 'acao', tema: 'Receita',
              titulo: 'Tratar o topo da base como carteira, não como massa',
              texto: 'Com ' + MI.fmt.pct(top20, 1) + ' da receita em 20% dos clientes, a perda de poucos nomes tem impacto desproporcional. ' +
                'Vale um programa de relacionamento com acompanhamento individual de queda de uso nesse grupo, ' +
                'e um alerta operacional quando um cliente do topo ultrapassa o prazo típico entre atividades.'
            });
          }
        }
      }

      /* ---------- Desempenho por canal ---------- */
      if (st.has('_canal')) {
        root.appendChild(U.section('Canais de aquisição', 'Volume e qualidade dos clientes trazidos por cada canal'));
        root.appendChild(el('div', { class: 'grid' }, U.guarded('neg.canal', function () {
          const dist = MI.privacy.guardDist(S.dist(rows, '_canal', {}));
          const real = dist.filter(function (e) { return !e.suppressed; });
          const headers = [{ label: 'Canal' }, { label: 'Registros', num: true }, { label: '% da base', num: true }];
          if (st.has('_valor')) headers.push({ label: 'Ticket médio', num: true });
          if (st.has('_freq')) headers.push({ label: 'Frequência', num: true });
          if (st.has('_recencia')) headers.push({ label: 'Recência', num: true });
          if (st.has('_idade')) headers.push({ label: 'Idade', num: true });

          const baseVal = st.has('_valor') ? S.numStats(rows, '_valor') : null;
          const baseFreq = st.has('_freq') ? S.numStats(rows, '_freq') : null;

          const porCanal = MI.groupBy(rows, '_canal');
          const tRows = real.map(function (e) {
            const sub = porCanal.get(e.label) || [];
            const cells = [{ v: e.label }, { v: MI.fmt.int(e.value) }, { v: MI.fmt.pct(e.pct, 1) }];
            if (st.has('_valor')) {
              const s = S.numStats(sub, '_valor');
              const idx = s && baseVal && baseVal.mean ? (s.mean / baseVal.mean) * 100 : null;
              cells.push({ v: s ? MI.fmt.money(s.mean) + (idx ? ' (' + MI.fmt.int(idx) + ')' : '') : '—', num: true });
            }
            if (st.has('_freq')) {
              const s = S.numStats(sub, '_freq');
              const idx = s && baseFreq && baseFreq.mean ? (s.mean / baseFreq.mean) * 100 : null;
              cells.push({ v: s ? MI.fmt.dec(s.mean, 2) + (idx ? ' (' + MI.fmt.int(idx) + ')' : '') : '—', num: true });
            }
            if (st.has('_recencia')) {
              const s = S.numStats(sub, '_recencia');
              cells.push({ v: s ? MI.fmt.int(s.median) + ' d' : '—', num: true });
            }
            if (st.has('_idade')) {
              const s = S.numStats(sub, '_idade');
              cells.push({ v: s ? MI.fmt.dec(s.mean, 1) : '—', num: true });
            }
            return { cells: cells, _sub: sub, _label: e.label, _n: e.value, _pct: e.pct };
          });

          return U.card({
            span: 'c12', title: 'Tabela de canais',
            sub: 'Números entre parênteses são índices: 100 = igual à média do recorte',
            body: [
              U.table(headers, tRows),
              dist.suppressedGroups ? el('div', { style: 'margin-top:10px' }, U.note(null,
                dist.suppressedGroups + ' canal(is) com menos de ' + MI.privacy.k + ' registros foram omitidos da tabela.')) : null
            ]
          });
        })));

        /* Fato + ação sobre canais */
        const distC = S.dist(rows, '_canal', {}).filter(function (e) { return e.value >= MI.privacy.k; });
        if (distC.length >= 2 && (st.has('_freq') || st.has('_valor'))) {
          const metrica = st.has('_freq') ? '_freq' : '_valor';
          const nomeMetrica = st.has('_freq') ? 'frequência' : 'ticket médio';
          const baseStats = S.numStats(rows, metrica);
          const grupos = MI.groupBy(rows, '_canal');
          const perf = distC.map(function (e) {
            const sub = grupos.get(e.label) || [];
            const s = S.numStats(sub, metrica);
            return {
              label: e.label, n: e.value, pct: e.pct,
              mean: s ? s.mean : null,
              idx: s && baseStats.mean ? (s.mean / baseStats.mean) * 100 : null
            };
          }).filter(function (p) { return p.idx != null; });
          perf.sort(function (a, b) { return b.idx - a.idx; });

          if (perf.length) {
            const melhor = perf[0], pior = perf[perf.length - 1];
            fatos.push({
              kind: 'fato', tema: 'Aquisição',
              titulo: melhor.label + ' traz os clientes de maior ' + nomeMetrica + ' (índice ' + MI.fmt.int(melhor.idx) + ')',
              texto: melhor.label + ' responde por ' + MI.fmt.pct(melhor.pct, 1) + ' das aquisições e entrega ' + nomeMetrica +
                ' de ' + (metrica === '_valor' ? MI.fmt.money(melhor.mean) : MI.fmt.dec(melhor.mean, 2)) +
                '. No outro extremo, ' + pior.label + ' tem índice ' + MI.fmt.int(pior.idx) + ' com ' +
                MI.fmt.pct(pior.pct, 1) + ' das aquisições.'
            });
            const subdimensionado = perf.filter(function (p) { return p.idx >= 112 && p.pct < 0.12; })[0];
            if (subdimensionado) {
              acoes.push({
                kind: 'acao', tema: 'Aquisição',
                titulo: 'Testar aumento de investimento em ' + subdimensionado.label,
                texto: 'O canal entrega ' + nomeMetrica + ' ' + MI.fmt.int(subdimensionado.idx - 100) +
                  '% acima da média, mas representa apenas ' + MI.fmt.pct(subdimensionado.pct, 1) + ' das aquisições. ' +
                  'A base não contém custo de aquisição, então o retorno financeiro do aumento não pode ser calculado aqui: ' +
                  'o teste precisa cruzar estes índices com o CAC de cada canal.'
              });
            }
            const sobredimensionado = perf.filter(function (p) { return p.idx <= 90 && p.pct > 0.15; })[0];
            if (sobredimensionado) {
              hipoteses.push({
                kind: 'hipotese', tema: 'Aquisição',
                titulo: sobredimensionado.label + ' pode estar trazendo volume de baixa qualidade',
                texto: 'Com ' + MI.fmt.pct(sobredimensionado.pct, 1) + ' das aquisições e ' + nomeMetrica +
                  ' ' + MI.fmt.int(100 - sobredimensionado.idx) + '% abaixo da média, o canal sustenta volume mas não intensidade de uso. ' +
                  'Pode ser qualidade do público ou apenas maturidade menor da safra — distinguir exige cruzar com a data de cadastro.'
              });
            }
          }
        }
      }

      /* ---------- Planos ---------- */
      if (st.has('_plano')) {
        root.appendChild(U.section('Mix de planos', 'Participação e intensidade de uso por plano/produto'));
        root.appendChild(el('div', { class: 'grid' }, U.guarded('neg.plano', function () {
          const dist = MI.privacy.guardDist(S.dist(rows, '_plano', {}));
          const cards = [
            U.card({
              span: 'c5', title: 'Participação por plano',
              body: U.bars(dist, {})
            })
          ];
          if (st.has('_freq')) {
            const m = S.meanBy(rows, '_plano', '_freq', { minN: MI.privacy.k });
            cards.push(U.chartCard({
              title: 'Frequência média por plano', span: 'c7', height: 'md',
              sub: 'Planos com menos de ' + MI.privacy.k + ' registros são omitidos',
              render: function (cv) {
                return MI.charts.bar(cv, m, {
                  horizontal: true, multicolor: true, showN: true,
                  valueFmt: function (v) { return MI.fmt.dec(v, 2); }
                });
              }
            }));
          } else if (st.has('_valor')) {
            const m = S.meanBy(rows, '_plano', '_valor', { minN: MI.privacy.k });
            cards.push(U.chartCard({
              title: 'Ticket médio por plano', span: 'c7', height: 'md',
              render: function (cv) {
                return MI.charts.bar(cv, m, { horizontal: true, multicolor: true, valueFmt: MI.fmt.money });
              }
            }));
          }
          return cards;
        })));

        /* Oportunidade de migração de plano */
        if (st.has('_freq')) {
          const avulsoLike = S.dist(rows, '_plano', {}).filter(function (e) { return e.value >= MI.privacy.k; });
          const gruposPlano = MI.groupBy(rows, '_plano');
          const porPlano = avulsoLike.map(function (e) {
            const sub = gruposPlano.get(e.label) || [];
            const s = S.numStats(sub, '_freq');
            return { label: e.label, n: e.value, pct: e.pct, freq: s ? s.mean : null, p75: s ? s.p75 : null, sub: sub };
          }).filter(function (p) { return p.freq != null; });
          porPlano.sort(function (a, b) { return a.freq - b.freq; });
          const menor = porPlano[0], maior = porPlano[porPlano.length - 1];
          if (menor && maior && menor.label !== maior.label) {
            const candidatos = menor.sub.filter(function (r) { return r._freq != null && r._freq >= maior.freq; }).length;
            fatos.push({
              kind: 'fato', tema: 'Planos',
              titulo: 'Diferença de ' + MI.fmt.dec(maior.freq / (menor.freq || 1), 1) + '× na frequência entre ' + maior.label + ' e ' + menor.label,
              texto: maior.label + ' usa ' + MI.fmt.dec(maior.freq, 2) + ' vezes em média contra ' +
                MI.fmt.dec(menor.freq, 2) + ' de ' + menor.label + '. ' +
                MI.fmt.int(candidatos) + ' registros em ' + menor.label + ' já usam tanto quanto a média de ' + maior.label + '.'
            });
            if (candidatos >= MI.privacy.k) {
              acoes.push({
                kind: 'acao', tema: 'Planos',
                titulo: 'Oferta de migração para ' + MI.fmt.int(candidatos) + ' clientes de ' + menor.label,
                texto: 'Esse grupo já tem frequência compatível com ' + maior.label + ', então a migração tende a ser ' +
                  'percebida como vantagem e não como aumento de gasto. ' +
                  'O ganho financeiro depende da diferença de preço e margem entre os planos, que não está nesta base.'
              });
            }
          }
        }
      }

      /* ---------- Praças com potencial ---------- */
      if (st.has('_cidade') && (st.has('_valor') || st.has('_freq'))) {
        const metrica = st.has('_valor') ? '_valor' : '_freq';
        const nome = st.has('_valor') ? 'ticket médio' : 'frequência média';
        const fmtM = st.has('_valor') ? MI.fmt.money : function (v) { return MI.fmt.dec(v, 2); };
        const baseStats = S.numStats(rows, metrica);
        const cidades = S.dist(rows, '_cidade', {}).filter(function (e) { return e.value >= Math.max(MI.privacy.k, 30); });
        const gruposCidade = MI.groupBy(rows, '_cidade');
        const analise = cidades.map(function (e) {
          const sub = gruposCidade.get(e.label) || [];
          const s = S.numStats(sub, metrica);
          return {
            label: e.label, n: e.value, pct: e.pct,
            mean: s ? s.mean : null,
            idx: s && baseStats.mean ? (s.mean / baseStats.mean) * 100 : null
          };
        }).filter(function (p) { return p.idx != null; });

        if (analise.length >= 5) {
          const ordenadas = analise.slice().sort(function (a, b) { return b.idx - a.idx; });
          const medianaVolume = analise.slice().sort(function (a, b) { return a.n - b.n; })[Math.floor(analise.length / 2)].n;
          const potencial = ordenadas.filter(function (p) { return p.idx >= 105 && p.n < medianaVolume * 1.2; }).slice(0, 8);

          root.appendChild(U.section('Praças com potencial', 'Cidades onde a qualidade do cliente supera a média mas o volume ainda é pequeno'));
          root.appendChild(el('div', { class: 'grid' }, [
            U.guarded('geo.cidade', function () {
              return U.chartCard({
                title: 'Volume × ' + nome + ' por cidade', span: 'c7', height: 'lg',
                sub: 'Cada ponto é uma cidade com pelo menos ' + Math.max(MI.privacy.k, 30) + ' registros',
                render: function (cv) {
                  return MI.charts.scatter(cv, analise.map(function (p) { return { x: p.n, y: p.mean }; }),
                    { xLabel: 'Registros na cidade', yLabel: nome });
                },
                foot: 'O quadrante superior esquerdo — poucos registros, ' + nome + ' alto — é onde moram as praças subexploradas.'
              });
            }),
            U.card({
              span: 'c5', title: 'Candidatas a expansão',
              sub: potencial.length ? potencial.length + ' cidades acima da média com volume abaixo da mediana' : 'Nenhuma cidade se destaca nos dois critérios',
              body: potencial.length
                ? U.table(
                  [{ label: 'Cidade' }, { label: 'Reg.', num: true }, { label: nome, num: true }, { label: 'Índice', num: true }],
                  potencial.map(function (p) {
                    return {
                      cells: [
                        { v: p.label }, { v: MI.fmt.int(p.n) }, { v: fmtM(p.mean) },
                        {
                          v: el('span', { class: 'badge badge--ok', text: MI.fmt.int(p.idx) }), num: true
                        }
                      ]
                    };
                  })
                )
                : U.empty('Sem candidatas claras', 'Nas cidades com volume suficiente, a qualidade do cliente acompanha o volume.')
            })
          ]));

          if (potencial.length) {
            fatos.push({
              kind: 'fato', tema: 'Expansão',
              titulo: potencial.length + ' cidades combinam ' + nome + ' acima da média e volume baixo',
              texto: 'Lideradas por ' + potencial[0].label + ' (índice ' + MI.fmt.int(potencial[0].idx) + ' com ' +
                MI.fmt.int(potencial[0].n) + ' registros). Mediana de volume entre as cidades analisadas: ' +
                MI.fmt.int(medianaVolume) + ' registros.'
            });
            hipoteses.push({
              kind: 'hipotese', tema: 'Expansão',
              titulo: 'Essas praças podem estar com demanda acima da oferta',
              texto: 'Um ' + nome + ' alto com volume baixo é compatível com demanda não atendida, mas também com ' +
                'um público inicial naturalmente mais engajado (viés de early adopter). ' +
                'Separar as duas explicações exige dados de oferta local — cobertura, disponibilidade, capacidade — ausentes nesta base.'
            });
          }
        }
      }

      /* ---------- Público-alvo para comunicação ---------- */
      if (st.has('_faixa') && (st.has('_genero') || st.has('_uf'))) {
        const combos = [];
        const campo2 = st.has('_genero') ? '_genero' : '_uf';
        MI.groupBy2(rows, '_faixa', campo2).forEach(function (sub) {
          if (sub.length < MI.privacy.k) return;
          const o = { label: sub.a + ' · ' + sub.b, n: sub.length, pct: sub.length / rows.length };
          if (st.has('_valor')) { const s = S.numStats(sub, '_valor'); o.valor = s ? s.mean : null; }
          if (st.has('_freq')) { const s = S.numStats(sub, '_freq'); o.freq = s ? s.mean : null; }
          combos.push(o);
        });
        if (combos.length) {
          const chave = st.has('_valor') ? 'valor' : st.has('_freq') ? 'freq' : 'n';
          combos.sort(function (a, b) { return (b[chave] || 0) - (a[chave] || 0); });
          const top = combos.slice(0, 10);
          root.appendChild(U.section('Públicos para comunicação', 'Combinações demográficas com volume suficiente para campanha'));
          const headers = [{ label: 'Público' }, { label: 'Registros', num: true }, { label: '% da base', num: true }];
          if (st.has('_valor')) headers.push({ label: 'Ticket médio', num: true });
          if (st.has('_freq')) headers.push({ label: 'Frequência', num: true });
          root.appendChild(el('div', { class: 'grid' }, U.card({
            span: 'c12',
            sub: 'Ordenado por ' + (chave === 'valor' ? 'ticket médio' : chave === 'freq' ? 'frequência' : 'volume') +
              '. Combinações com menos de ' + MI.privacy.k + ' registros foram descartadas por privacidade.',
            title: 'Top 10 públicos',
            body: U.table(headers, top.map(function (c) {
              const cells = [{ v: c.label }, { v: MI.fmt.int(c.n) }, { v: MI.fmt.pct(c.pct, 2) }];
              if (st.has('_valor')) cells.push({ v: c.valor != null ? MI.fmt.money(c.valor) : '—', num: true });
              if (st.has('_freq')) cells.push({ v: c.freq != null ? MI.fmt.dec(c.freq, 2) : '—', num: true });
              return { cells: cells };
            }))
          })));
        }
      }

      /* ---------- Painel de leituras ---------- */
      S.findings(rows).forEach(function (f) {
        if (['Negócio', 'Aquisição', 'Crescimento'].indexOf(f.tema) >= 0) fatos.push(f);
      });

      hipoteses.push({
        kind: 'hipotese', tema: 'Limitação',
        titulo: 'O que esta base não permite afirmar',
        texto: 'Não há custo de aquisição, margem por plano, dados de concorrência nem população por praça. ' +
          'Portanto: retorno sobre investimento, participação de mercado e viabilidade econômica de expansão ' +
          'não podem ser calculados aqui — apenas priorizados em termos relativos.'
      });

      /* ---------- Oportunidades de marketing ---------- */
      oportunidadesMarketing(root, rows);

      root.appendChild(U.section('Leituras comerciais', 'Fato, hipótese e ação sempre separados e identificados'));
      root.appendChild(el('div', { class: 'grid' }, U.guarded('neg.oportunidades', function () {
        return [
          U.card({
            span: 'c12', title: 'Fatos observados na base',
            sub: 'Cada item é um número calculado sobre o recorte atual',
            body: U.findings(fatos.length ? fatos : [], { limit: 12 })
          }),
          U.card({
            span: 'c6', title: 'Hipóteses a validar',
            sub: 'Leituras plausíveis que esta base, sozinha, não comprova',
            body: U.findings(hipoteses)
          }),
          U.card({
            span: 'c6', title: 'Ações sugeridas',
            sub: 'Decisões propostas a partir dos fatos acima',
            body: U.findings(acoes.length ? acoes : [{
              kind: 'acao', tema: 'Dados',
              titulo: 'Enriquecer a base para liberar análises comerciais',
              texto: 'Com as colunas atuais não há métrica de valor ou frequência suficiente para propor ações. ' +
                'Incluir ticket, número de transações e data da última atividade libera segmentos de valor, ' +
                'concentração de receita e priorização de praças.'
            }])
          })
        ];
      })));
    }
  };

  /* ================= Oportunidades de marketing =================
     Cada oportunidade declara em que evidência se apoia e o que ainda
     precisa ser validado. Nenhuma inferência sensível é produzida. */
  function oportunidadesMarketing(root, rowsClientes) {
    const st = MI.store;
    const temTx = MI.tx.has();
    const items = temTx ? MI.tx.filtered() : [];
    const X = MI.txStats;
    const oportunidades = [];

    /* 1. Categoria com relevância regional acima da média */
    if (temTx && items.length > 300) {
      const comUf = items.filter(function (i) { return i._uf && i._cat; });
      if (comUf.length > 200) {
        const porUf = MI.groupBy(comUf, '_uf');
        const achados = [];
        porUf.forEach(function (sub, uf) {
          if (sub.length < Math.max(MI.privacy.k, 60)) return;
          const af = X.afinidade(sub, comUf, '_cat', { minQtd: 30 });
          if (af.length && af[0].index >= 120) achados.push({ uf: uf, n: sub.length, cat: af[0] });
        });
        achados.sort(function (a, b) { return b.cat.index - a.cat.index; });
        achados.slice(0, 3).forEach(function (a) {
          oportunidades.push({
            kind: 'hipotese', tema: 'Campanha regional',
            titulo: a.cat.label + ' tem relevância ' + MI.fmt.int(a.cat.index - 100) + '% acima da média em ' + (MI.UF_NOMES[a.uf] || a.uf),
            texto: 'Evidência: ' + MI.fmt.int(a.cat.segQtd) + ' unidades da categoria em ' + MI.fmt.int(a.n) +
              ' itens vendidos no estado — participação de ' + MI.fmt.pct(a.cat.segShare, 1) +
              ' contra ' + MI.fmt.pct(a.cat.baseShare, 1) + ' na base. ' +
              'Hipótese: a comunicação local pode liderar com essa categoria em vez do mix padrão. ' +
              'A validar: se a diferença vem da praça ou do perfil de quem compra ali.'
          });
        });
      }
    }

    /* 2. Janela de menor movimento */
    if (temTx) {
      const h = X.porHora(items);
      if (h) {
        const util = h.filter(function (e) { return e.hora >= 7 && e.hora <= 22; });
        const ordenado = util.slice().sort(function (a, b) { return a.value - b.value; });
        const fracos = ordenado.slice(0, 3);
        const forte = util.slice().sort(function (a, b) { return b.value - a.value; })[0];
        if (fracos.length && forte && forte.value > 0) {
          oportunidades.push({
            kind: 'acao', tema: 'Campanha por horário',
            titulo: 'Janela ociosa entre ' + fracos.map(function (e) { return e.label; }).join(', '),
            texto: 'Evidência: essas três horas somam ' + MI.fmt.pct(MI.sum(fracos, function (e) { return e.pct; }), 1) +
              ' do volume, contra ' + MI.fmt.pct(forte.pct, 1) + ' só no pico das ' + forte.label + '. ' +
              'Ação proposta: oferta válida apenas nessa janela, para deslocar demanda sem descontar o horário de pico. ' +
              'A validar com grupo de controle: parte do movimento migra do pico em vez de ser incremental.'
          });
        }
      }
      const dow = temTx ? X.porDimensao(items, '_dow', {}) : [];
      if (dow.length >= 5) {
        const comNome = dow.map(function (e) { return { label: MI.DIAS_SEMANA[+e.label] || e.label, qtd: e.qtd, dia: +e.label }; });
        comNome.sort(function (a, b) { return a.qtd - b.qtd; });
        oportunidades.push({
          kind: 'fato', tema: 'Dia da semana',
          titulo: comNome[0].label + ' é o dia de menor volume e ' + comNome[comNome.length - 1].label + ' o de maior',
          texto: 'Evidência: ' + MI.fmt.int(comNome[0].qtd) + ' contra ' + MI.fmt.int(comNome[comNome.length - 1].qtd) +
            ' unidades — diferença de ' + MI.fmt.dec(comNome[comNome.length - 1].qtd / Math.max(1, comNome[0].qtd), 1) + '×. ' +
            'Ações de atração costumam render mais no dia fraco, mas o custo por pedido também costuma ser maior.'
        });
      }
    }

    /* 3. Produtos com potencial de divulgação: ticket alto, giro baixo */
    if (temTx) {
      const top = X.topProdutos(items, null, 'qtd');
      const comValor = top.filter(function (p) { return p.ticket != null && p.qtd >= Math.max(MI.privacy.k, 30); });
      if (comValor.length >= 6) {
        const ticketMedio = MI.sum(comValor, function (p) { return p.valor; }) / MI.sum(comValor, function (p) { return p.qtd; });
        const medianaQtd = comValor.map(function (p) { return p.qtd; }).sort(function (a, b) { return a - b; })[Math.floor(comValor.length / 2)];
        const candidatos = comValor.filter(function (p) { return p.ticket >= ticketMedio * 1.15 && p.qtd < medianaQtd; })
          .sort(function (a, b) { return b.ticket - a.ticket; }).slice(0, 4);
        if (candidatos.length) {
          oportunidades.push({
            kind: 'hipotese', tema: 'Divulgação de produto',
            titulo: candidatos.length + ' produtos combinam ticket acima da média e giro abaixo da mediana',
            texto: 'Evidência: ' + candidatos.map(function (p) {
              return p.nome + ' (' + MI.fmt.money(p.ticket) + ', ' + MI.fmt.int(p.qtd) + ' un.)';
            }).join('; ') + '. Ticket médio da base: ' + MI.fmt.money(ticketMedio) + '. ' +
              'Hipótese: baixa exposição, não baixa aceitação. ' +
              'A validar: itens caros podem ter giro baixo por preço, e não por falta de divulgação — ' +
              'sem margem por produto não dá para saber qual explicação vale.'
          });
        }
      }
    }

    /* 4. Segmentos com alta frequência */
    const rfm = S.rfm(rowsClientes);
    if (rfm) {
      const campeoes = rfm.filter(function (s) { return s.label === 'Campeões'; })[0];
      const promissores = rfm.filter(function (s) { return s.label === 'Promissores'; })[0];
      if (campeoes && campeoes.count >= MI.privacy.k) {
        oportunidades.push({
          kind: 'fato', tema: 'Segmento',
          titulo: 'Campeões: ' + MI.fmt.int(campeoes.count) + ' clientes (' + MI.fmt.pct(campeoes.pct, 1) + ') de alta frequência e recência baixa',
          texto: 'Evidência: segmento classificado por tercis de recência e frequência' +
            (campeoes.ticket != null ? ', com ticket médio de ' + MI.fmt.money(campeoes.ticket) : '') + '. ' +
            'É a audiência natural para lançamentos e programa de indicação, porque já compra com frequência.'
        });
      }
      if (promissores && promissores.count >= MI.privacy.k) {
        oportunidades.push({
          kind: 'acao', tema: 'Segmento',
          titulo: 'Converter ' + MI.fmt.int(promissores.count) + ' clientes “Promissores” em recorrentes',
          texto: 'Evidência: compraram recentemente mas ainda têm frequência baixa — ' + MI.fmt.pct(promissores.pct, 1) + ' da base. ' +
            'Ação proposta: sequência de reengajamento no intervalo típico entre pedidos. ' +
            'A validar: parte desse grupo é formada por clientes novos que ainda não tiveram tempo de repetir.'
        });
      }
    }

    /* 5. Comparação entre perfis de consumo */
    if (temTx && MI.tx.link.taxaCliente > 0.05) {
      const comFaixa = items.filter(function (i) { return i._faixa && i._cat; });
      if (comFaixa.length > 300) {
        const grupos = MI.groupBy(comFaixa, '_faixa');
        const perfis = [];
        grupos.forEach(function (sub, g) {
          if (sub.length < Math.max(MI.privacy.k, 60)) return;
          const cats = X.porDimensao(sub, '_cat', { por: 'qtd', limit: 1, other: false });
          const valor = MI.sum(sub, function (i) { return i._valor || 0; });
          const qtd = MI.sum(sub, function (i) { return i._qtd || 1; });
          perfis.push({ grupo: g, n: sub.length, top: cats[0], ticket: qtd ? valor / qtd : null });
        });
        if (perfis.length >= 2) {
          perfis.sort(function (a, b) { return (b.ticket || 0) - (a.ticket || 0); });
          oportunidades.push({
            kind: 'fato', tema: 'Comparação de perfis',
            titulo: perfis[0].grupo + ' tem o maior ticket por unidade (' + MI.fmt.money(perfis[0].ticket) + ')',
            texto: perfis.slice(0, 5).map(function (p) {
              return p.grupo + ': ' + MI.fmt.money(p.ticket) + ', mais compra ' + (p.top ? p.top.label : '—');
            }).join(' · ') + '. Comparação entre grupos com pelo menos ' + Math.max(MI.privacy.k, 60) + ' itens.'
          });
        }
      }
    }

    if (!temTx) {
      oportunidades.push({
        kind: 'hipotese', tema: 'Dados',
        titulo: 'As oportunidades de campanha por produto dependem da base de transações',
        texto: 'Com a base de clientes é possível priorizar praças, canais e segmentos de valor. ' +
          'Para ligar oportunidade a produto — qual categoria promover, em qual horário, para qual público — ' +
          'é preciso carregar os itens de pedido em Configurações e Acessos › Fontes de dados.'
      });
    }

    root.appendChild(U.section('Oportunidades de Marketing',
      'Cada item declara a evidência que o sustenta e o que ainda precisa ser validado', [
      temTx ? el('span', { class: 'badge badge--info', text: MI.fmt.int(items.length) + ' itens de pedido no recorte' })
        : el('span', { class: 'badge badge--warn', text: 'sem base de transações' })
    ]));
    root.appendChild(el('div', { class: 'grid' }, U.guarded('opp.campanhas', function () {
      return U.card({
        span: 'c12',
        body: [
          U.findings(oportunidades),
          el('div', { style: 'margin-top:14px' }, U.note(null, [
            el('strong', { text: 'Limite deliberado. ' }),
            'A plataforma não produz inferências sobre características sensíveis nem conclui que um gênero, idade ou ' +
            'região “prefere” um produto. O que aparece aqui é consumo observado de grupos identificados nesta base, ' +
            'com o tamanho da amostra sempre declarado.'
          ]))
        ]
      });
    })));
  }

})(window.MI);
