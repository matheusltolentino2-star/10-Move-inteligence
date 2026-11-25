/* 10 Move Intelligence — Inteligência de Consumo
   Relaciona clientes, pedidos, itens e produtos do catálogo.
   Quando a ligação não existe, a plataforma diz o que falta e não infere. */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, X = MI.txStats, T = MI.tx;

  const S = { metrica: 'qtd', dimPerfil: '_faixa', loja: '', periodo: 'mes', lote: null };
  const PERIODOS = {semana:'Semana',mes:'Mês',trimestre:'Trimestre',estacao:'Estação'};

  MI.views.consumption = {
    title: 'Inteligência de Consumo',
    subtitle: 'O que é comprado, por quem, quando e junto com o quê',
    icon: 'spark',

    render: function (root) {
      /* ---------- sem base transacional ---------- */
      if (!T.has()) return semTransacoes(root);

      const lote = MI.fullData?.active;
      const loteId = lote?.id || null;
      if (S.lote !== loteId) { S.lote = loteId; S.loja = ''; S.periodo = 'mes'; }
      const filtered = T.filtered();
      const items = S.loja ? filtered.filter(i=>i._unidade===S.loja) : filtered;
      const todos = T.items;
      const l = T.link;
      if (lote && MI.fullData.canImport()) {
        const select = el('select', {class:'input','aria-label':'Unidade das vendas'}, [
          el('option',{value:'',selected:!S.loja},'Todas as lojas'),
          ...lote.units.map(u=>el('option',{value:u.nome,selected:S.loja===u.nome},u.nome))
        ]);
        select.addEventListener('change',()=>{S.loja=select.value;MI.app.rerender();});
        root.appendChild(U.section('Vendas por unidade','Lote nacional simulado', [select]));
      }

      /* ---------- avisos de origem ---------- */
      if (T.isDemo()) {
        root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('warn', [
          el('strong', { text: 'Transações demonstrativas fictícias. ' }),
          MI.fmt.int(l.itens) + ' itens de pedido gerados neste navegador, ligados à base de clientes e ao catálogo demonstrativos. ' +
          'Não são vendas reais da Smoov. Importe a base de transações em “Configurações e Acessos › Fontes de dados”.'
        ])));
      }

      if (!items.length) {
        root.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', body: U.empty('Nenhuma transação no recorte atual',
            T.filtroAplicavel() ? 'Os filtros de clientes não deixaram nenhuma transação. Afrouxe um filtro.' : 'Não há itens para analisar.')
        })));
        return;
      }

      /* ---------- aviso de recorte ---------- */
      if (MI.store.activeFilterCount() > 0) {
        root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note(T.filtroAplicavel() ? 'info' : 'warn', [
          T.filtroAplicavel()
            ? [el('strong', { text: 'Recorte aplicado às transações. ' }),
              MI.fmt.int(items.length) + ' de ' + MI.fmt.int(todos.length) + ' itens pertencem aos clientes filtrados (' +
              MI.fmt.pctOf(items.length, todos.length, 1) + ').']
            : [el('strong', { text: 'Os filtros de clientes não atingem as transações. ' }),
              'Sem identificador de cliente ligando as duas bases, os números abaixo usam todas as transações, ' +
              'independentemente do recorte selecionado na barra superior.']
        ])));
      }

      /* ---------- diagnóstico da ligação ---------- */
      root.appendChild(diagnostico(l));

      /* ---------- KPIs ---------- */
      const ped = X.porPedido(items);
      const totalQtd = MI.sum(items, function (i) { return i._qtd || 1; });
      const totalValor = MI.sum(items, function (i) { return i._valor || 0; });
      const clientesNoRecorte = items === todos ? l.clientesDistintos : new Set(items.map(i=>i._cliente).filter(Boolean)).size;

      root.appendChild(U.guarded('cons.produtos', function () {
        return el('div', { class: 'grid' }, [
          U.kpi({ span: 'c3', accent: true, label: 'Itens vendidos', value: MI.fmt.compact(totalQtd), icon: 'database', hint: MI.fmt.int(items.length) + ' linhas de pedido' }),
          ped ? U.kpi({ span: 'c3', label: 'Pedidos', value: MI.fmt.compact(ped.pedidos), icon: 'report', hint: MI.fmt.dec(ped.itensPorPedido, 2) + ' itens por pedido' }) : null,
          totalValor ? U.kpi({ span: 'c3', label: 'Receita no recorte', value: 'R$ ' + MI.fmt.compact(totalValor), icon: 'spark', hint: 'Soma do valor dos itens' }) : null,
          ped && ped.ticketMedio ? U.kpi({ span: 'c3', label: 'Ticket médio por pedido', value: MI.fmt.money(ped.ticketMedio), icon: 'spark', hint: 'Mediana ' + MI.fmt.money(ped.ticketMediana) + ' · P90 ' + MI.fmt.money(ped.ticketP90) }) : null,
          U.kpi({ span: 'c3', label: 'Produtos distintos vendidos', value: MI.fmt.int(X.topProdutos(items).distintos), icon: 'grid', hint: MI.fmt.pct(l.taxaProduto, 1) + ' casados com o catálogo' }),
          clientesNoRecorte ? U.kpi({ span: 'c3', label: 'Clientes com compra', value: MI.fmt.compact(clientesNoRecorte), icon: 'users', hint: MI.store.dataset ? MI.fmt.pctOf(clientesNoRecorte, MI.store.dataset.rows.length, 1) + ' da base de clientes' : '' }) : null
        ].filter(Boolean));
      }));

      /* ---------- produtos e categorias ---------- */
      root.appendChild(U.section('Produtos e categorias mais comprados', 'Consumo observado nas transações', [
        seletorMetrica()
      ]));

      root.appendChild(el('div', { class: 'grid' }, [
        U.guarded('cons.produtos', function () {
          const top = X.topProdutos(items, 15, S.metrica);
          return U.card({
            span: 'c7', title: 'Top 15 produtos',
            sub: S.metrica === 'valor' ? 'Ordenado por receita' : 'Ordenado por quantidade vendida',
            body: U.table(
              [{ label: '#' }, { label: 'Produto' }, { label: 'Categoria' }, { label: 'Qtd', num: true },
              { label: 'Receita', num: true }, { label: 'Participação', num: true }, { label: 'Ticket', num: true }],
              top.map(function (p, i) {
                return {
                  cells: [
                    { v: String(i + 1) },
                    { v: el('span', {}, [p.label, p.casado ? null : el('span', { class: 'badge badge--warn', style: 'margin-left:6px', text: 'fora do catálogo' })]) },
                    { v: p.categoria },
                    { v: MI.fmt.int(p.qtd), num: true },
                    { v: p.valor ? 'R$ ' + MI.fmt.compact(p.valor) : '—', num: true },
                    { v: MI.fmt.pct(p.pct, 2), num: true },
                    { v: p.ticket != null ? MI.fmt.money(p.ticket) : '—', num: true }
                  ]
                };
              })
            )
          });
        }),
        U.guarded('cons.produtos', function () {
          const cats = X.porDimensao(items, '_cat', { por: S.metrica, limit: 9 });
          if (!cats.length) {
            return U.card({ span: 'c5', title: 'Distribuição por categoria', body: U.unavailable('Sem categoria nas transações nem correspondência com o catálogo', ['Categoria']) });
          }
          const pal = MI.charts.palette(cats.length);
          return U.chartCard({
            title: 'Distribuição por categoria', span: 'c5', height: 'lg',
            sub: S.metrica === 'valor' ? 'Participação na receita' : 'Participação na quantidade',
            render: function (cv) {
              return MI.charts.doughnut(cv, cats.map(function (c) { return { label: c.label, value: c.value, pct: c.pct }; }));
            },
            legend: cats.map(function (c, i) { return { color: pal[i], label: c.label, value: MI.fmt.pct(c.pct, 1) }; })
          });
        })
      ]));

      /* ---------- ticket por categoria ---------- */
      if (totalValor) {
        root.appendChild(el('div', { class: 'grid' }, U.guarded('cons.ticket', function () {
          const cats = X.porDimensao(items, '_cat', { por: 'valor' }).filter(function (c) { return !c.isOther && c.qtd >= 20; });
          if (!cats.length) return U.card({ span: 'c12', title: 'Ticket médio por categoria', body: U.unavailable('Sem categoria ou sem valor nas transações', ['Categoria', 'Valor do item']) });
          return U.card({
            span: 'c12', title: 'Ticket médio e receita por categoria',
            sub: 'Ticket é o valor médio por unidade vendida nesta categoria',
            body: [
              U.table(
                [{ label: 'Categoria' }, { label: 'Qtd vendida', num: true }, { label: '% da qtd', num: true },
                { label: 'Receita', num: true }, { label: '% da receita', num: true }, { label: 'Ticket médio', num: true }],
                cats.map(function (c) {
                  return {
                    cells: [
                      { v: c.label }, { v: MI.fmt.int(c.qtd), num: true }, { v: MI.fmt.pct(c.pctQtd, 1), num: true },
                      { v: 'R$ ' + MI.fmt.compact(c.valor), num: true }, { v: MI.fmt.pct(c.pctValor, 1), num: true },
                      { v: MI.fmt.money(c.ticket), num: true }
                    ]
                  };
                })
              ),
              (function () {
                const cv = el('canvas');
                U.defer(function () {
                  MI.charts.bar(cv, cats.map(function (c) { return { label: c.label, value: c.ticket, n: c.qtd }; }),
                    { horizontal: true, multicolor: true, valueFmt: MI.fmt.money, showN: true });
                });
                return el('div', { class: 'chart chart--md', style: 'margin-top:16px' }, cv);
              })()
            ]
          });
        })));
      }

      /* ---------- horários ---------- */
      if (l.taxaHora > 0.1) {
        root.appendChild(U.section('Demanda por horário', 'Quando cada categoria é vendida'));
        root.appendChild(el('div', { class: 'grid' }, [
          U.guarded('cons.horarios', function () {
            return U.card({
              span: 'c7', title: 'Mapa de calor: dia × hora (quantidade vendida)',
              sub: 'Baseado nas transações, não no horário declarado do cliente',
              body: U.heatmap(X.heatDowHora(items))
            });
          }),
          U.guarded('cons.horarios', function () {
            const h = X.porHora(items);
            if (!h) return U.card({ span: 'c5', title: 'Volume por hora', body: U.unavailable('Sem hora nas transações', ['Hora do pedido']) });
            const topIdx = h.reduce(function (a, e, i) { return e.value > h[a].value ? i : a; }, 0);
            return U.chartCard({
              title: 'Volume por hora do dia', span: 'c5', height: 'md',
              sub: 'Pico às ' + h[topIdx].label,
              render: function (cv) { return MI.charts.bar(cv, h, { highlight: topIdx, thickness: 20 }); }
            });
          })
        ]));

        root.appendChild(el('div', { class: 'grid' }, U.guarded('cons.horarios', function () {
          /* categoria × faixa horária */
          const comFaixa = items.filter(function (i) { return i._hora != null && i._cat; });
          if (comFaixa.length < 50) {
            return U.card({ span: 'c12', title: 'Categoria por faixa horária', body: U.unavailable('Itens insuficientes com hora e categoria', ['Hora do pedido', 'Categoria']) });
          }
          comFaixa.forEach(function (i) { i.__fh = X.faixaHora(i._hora); });
          const ct = X.cruzamento(comFaixa, '_cat', '__fh', {
            metrica: 'qtd', limitA: 10, ordemB: X.FAIXAS_HORA.map(function (f) { return f.label; })
          });
          const pal = MI.charts.palette(ct.colLabels.length);
          const cv = el('canvas');
          U.defer(function () { MI.charts.stacked(cv, Object.assign(ct, { isMasked: false }), { percent: true }); });
          return U.card({
            span: 'c12', title: 'Composição horária de cada categoria',
            sub: 'Percentual da quantidade vendida de cada categoria em cada faixa do dia',
            body: [
              el('div', { class: 'chart chart--lg' }, cv),
              U.legend(ct.colLabels.map(function (c, i) { return { color: pal[i], label: c }; })),
              el('div', { style: 'margin-top:16px' }, U.table(
                [{ label: 'Categoria' }].concat(ct.colLabels.map(function (c) { return { label: c, num: true }; })).concat([{ label: 'Total', num: true }]),
                ct.rowLabels.map(function (rl, i) {
                  const cells = [{ v: rl }];
                  ct.colLabels.forEach(function (_, j) {
                    cells.push({ v: ct.rowTotals[i] ? MI.fmt.pct(ct.matrix[i][j] / ct.rowTotals[i], 1) : '—', num: true });
                  });
                  cells.push({ v: MI.fmt.int(ct.rowTotals[i]), num: true });
                  return { cells: cells };
                })
              ))
            ]
          });
        })));
      }

      /* ---------- perfil demográfico ---------- */
      if (l.taxaCliente > 0.05) {
        const dims = [
          { id: '_faixa', label: 'Faixa de idade' },
          { id: '_genero', label: 'Gênero' },
          { id: '_uf', label: 'Estado' },
          { id: '_cidade', label: 'Cidade' }
        ].filter(function (d) {
          let n = 0;
          for (let i = 0; i < items.length && n < 30; i++) if (items[i][d.id]) n++;
          return n >= 30;
        });

        if (dims.length) {
          root.appendChild(U.section('Preferência por perfil de cliente',
            'Consumo observado cruzado com as características demográficas conhecidas', [
            (function () {
              const sel = el('select', { class: 'input', style: 'max-width:180px' },
                dims.map(function (d) { return el('option', { value: d.id, selected: S.dimPerfil === d.id }, d.label); }));
              sel.addEventListener('change', function () { S.dimPerfil = sel.value; MI.app.rerender(); });
              return sel;
            })()
          ]));
          if (!dims.some(function (d) { return d.id === S.dimPerfil; })) S.dimPerfil = dims[0].id;

          root.appendChild(el('div', { class: 'grid' }, U.guarded('cons.perfil', function () {
            const campo = S.dimPerfil;
            const comAmbos = items.filter(function (i) { return i[campo] && i._cat; });
            if (comAmbos.length < 50) {
              return U.card({ span: 'c12', title: 'Preferência por perfil', body: U.unavailable('Itens insuficientes com perfil e categoria', ['Identificador do cliente', 'Categoria']) });
            }
            const ct = X.cruzamento(comAmbos, campo, '_cat', { metrica: 'qtd', limitA: 10, limitB: 8 });

            /* índice de afinidade por grupo */
            const grupos = MI.groupBy(comAmbos, campo);
            const linhasAfin = [];
            ct.rowLabels.forEach(function (g) {
              const sub = grupos.get(g) || [];
              if (sub.length < Math.max(MI.privacy.k, 30)) return;
              const af = X.afinidade(sub, comAmbos, '_cat', { minQtd: 25 });
              if (af.length) {
                linhasAfin.push({
                  grupo: g, n: sub.length,
                  maior: af[0], menor: af[af.length - 1]
                });
              }
            });

            const pal = MI.charts.palette(ct.colLabels.length);
            const cv = el('canvas');
            U.defer(function () { MI.charts.stacked(cv, Object.assign(ct, { isMasked: false }), { percent: true }); });

            return U.card({
              span: 'c12',
              title: 'Mix de categorias por ' + (dims.filter(function (d) { return d.id === campo; })[0] || {}).label.toLowerCase(),
              sub: 'Percentual da quantidade comprada por cada grupo · grupos com menos de ' +
                Math.max(MI.privacy.k, 30) + ' itens são omitidos da leitura de afinidade',
              body: [
                el('div', { class: 'chart chart--lg' }, cv),
                U.legend(ct.colLabels.map(function (c, i) { return { color: pal[i], label: c }; })),
                linhasAfin.length ? el('div', { style: 'margin-top:16px' }, U.table(
                  [{ label: 'Grupo' }, { label: 'Itens', num: true }, { label: 'Categoria com maior afinidade' },
                  { label: 'Índice', num: true }, { label: 'Categoria com menor afinidade' }, { label: 'Índice', num: true }],
                  linhasAfin.map(function (r) {
                    return {
                      cells: [
                        { v: r.grupo }, { v: MI.fmt.int(r.n), num: true },
                        { v: r.maior.label },
                        { v: el('span', { class: 'badge badge--' + (r.maior.index >= 115 ? 'ok' : ''), text: MI.fmt.int(r.maior.index) }), num: true },
                        { v: r.menor.label },
                        { v: el('span', { class: 'badge badge--' + (r.menor.index <= 85 ? 'crit' : ''), text: MI.fmt.int(r.menor.index) }), num: true }
                      ]
                    };
                  })
                )) : null,
                el('div', { style: 'margin-top:14px' }, U.note(null, [
                  el('strong', { text: 'Como ler o índice. ' }),
                  '100 significa que o grupo compra essa categoria na mesma proporção que a base. ' +
                  'Acima de 115 indica concentração acima da média, abaixo de 85 indica o contrário. ' +
                  'Isso descreve o consumo observado deste grupo nesta base — não é uma afirmação sobre preferências de pessoas com essas características em geral.'
                ]))
              ]
            });
          })));
        }
      } else {
        root.appendChild(U.section('Preferência por perfil de cliente', 'Requer ligação entre transações e base de clientes'));
        root.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', title: 'Cruzamento demográfico indisponível',
          body: [
            U.unavailable('As transações não estão ligadas à base de clientes'),
            el('div', { style: 'margin-top:14px' }, U.note('warn', [
              el('strong', { text: 'O que falta. ' }),
              !l.temIdCliente
                ? 'A base de transações não tem coluna mapeada como identificador do cliente.'
                : 'O identificador existe nas duas bases, mas os valores não coincidem (' +
                MI.fmt.pct(l.taxaCliente, 1) + ' de correspondência). Verifique se as duas planilhas usam o mesmo código de cliente — ' +
                'prefixos, zeros à esquerda e formatação costumam ser a causa.',
              ' Sem essa ligação, as análises demográficas e de consumo permanecem separadas, e nenhuma associação é inventada.'
            ]))
          ]
        })));
      }

      /* ---------- geografia ---------- */
      const comUf = items.filter(function (i) { return i._uf && i._cat; });
      if (comUf.length >= 100) {
        root.appendChild(U.section('Diferenças entre localidades', 'Composição do consumo por estado'));
        root.appendChild(el('div', { class: 'grid' }, U.guarded('cons.geo', function () {
          const ct = X.cruzamento(comUf, '_uf', '_cat', { metrica: 'qtd', limitA: 10, limitB: 7 });
          const pal = MI.charts.palette(ct.colLabels.length);
          const cv = el('canvas');
          U.defer(function () { MI.charts.stacked(cv, Object.assign(ct, { isMasked: false }), { percent: true }); });
          return U.card({
            span: 'c12', title: 'Mix de categorias por estado',
            sub: MI.fmt.int(comUf.length) + ' itens com estado identificado',
            body: [
              el('div', { class: 'chart chart--lg' }, cv),
              U.legend(ct.colLabels.map(function (c, i) { return { color: pal[i], label: c }; }))
            ]
          });
        })));
      }

      /* ---------- sazonalidade ---------- */
      const mensal = X.porPeriodo(items, S.periodo);
      if (mensal && mensal.length > 2) {
        const selector = lote && MI.fullData.canImport() ? el('select',{class:'input','aria-label':'Período de consumo'},
          Object.entries(PERIODOS).map(([id,label])=>el('option',{value:id,selected:S.periodo===id},label))) : null;
        if (selector) selector.addEventListener('change',()=>{S.periodo=selector.value;MI.app.rerender();});
        root.appendChild(U.section('Evolução e sazonalidade', 'Volume e receita por ' + PERIODOS[S.periodo].toLowerCase(), selector ? [selector] : null));
        root.appendChild(el('div', { class: 'grid' }, U.guarded('cons.produtos', function () {
          const t = MI.charts.theme();
          const series = [{ label: 'Quantidade vendida', values: mensal.map(function (m) { return m.qtd; }), color: t.series[0] }];
          if (MI.sum(mensal, function (m) { return m.valor; })) {
            series.push({ label: 'Receita (R$)', values: mensal.map(function (m) { return m.valor; }), color: t.series[1], axis: 'y1' });
          }
          const cv = el('canvas');
          U.defer(function () {
            MI.charts.line(cv, mensal.map(function (m) { return m.label; }), series, {
              maxTicks: 13, y1Fmt: function (v) { return 'R$ ' + MI.fmt.compact(v); }
            });
          });
          return U.card({
            span: 'c12', title: S.periodo === 'mes' ? 'Série mensal de consumo' : 'Consumo por ' + PERIODOS[S.periodo].toLowerCase(),
            sub: mensal.length + ' períodos na série',
            body: [el('div', { class: 'chart chart--lg' }, cv), U.legend(series.map(function (s) { return { color: s.color, label: s.label }; }))]
          });
        })));
      }

      /* ---------- cesta ---------- */
      if (l.pedidos > 10) {
        root.appendChild(U.section('Produtos comprados juntos', 'Co-ocorrência no mesmo pedido'));
        root.appendChild(el('div', { class: 'grid' }, U.guarded('cons.cesta', function () {
          const pares = X.cesta(items, { nivel: 'produto', topN: 28, minPedidos: Math.max(20, MI.privacy.k) });
          if (!pares || !pares.length) {
            return U.card({
              span: 'c12', title: 'Combinações de produtos',
              body: U.empty('Nenhum par com volume suficiente',
                'São necessários pelo menos ' + Math.max(20, MI.privacy.k) + ' pedidos contendo o mesmo par de produtos. ' +
                (pares ? MI.fmt.int(pares.pedidosMultiItem) + ' pedidos têm mais de um item.' : ''))
            });
          }
          return U.card({
            span: 'c12', title: 'Pares de produtos com maior afinidade',
            sub: MI.fmt.int(pares.pedidosMultiItem) + ' de ' + MI.fmt.int(pares.pedidos) + ' pedidos têm mais de um item',
            body: [
              U.table(
                [{ label: 'Produto A' }, { label: 'Produto B' }, { label: 'Pedidos juntos', num: true },
                { label: 'Suporte', num: true }, { label: 'Se leva A, leva B', num: true }, { label: 'Lift', num: true }],
                pares.slice(0, 15).map(function (p) {
                  return {
                    cells: [
                      { v: p.a }, { v: p.b }, { v: MI.fmt.int(p.pedidos), num: true },
                      { v: MI.fmt.pct(p.suporte, 2), num: true },
                      { v: MI.fmt.pct(p.confiancaAB, 1), num: true },
                      { v: el('span', { class: 'badge badge--' + (p.lift >= 1.3 ? 'ok' : p.lift < 1 ? 'crit' : ''), text: MI.fmt.dec(p.lift, 2) }), num: true }
                    ]
                  };
                })
              ),
              el('div', { style: 'margin-top:14px' }, U.note(null, [
                el('strong', { text: 'Como ler. ' }),
                'Suporte é a fração de pedidos que contém o par. Lift acima de 1 significa que os dois aparecem juntos ' +
                'mais do que o acaso explicaria; abaixo de 1, menos. Lift alto com poucos pedidos é instável — por isso ' +
                'pares com menos de ' + Math.max(20, MI.privacy.k) + ' pedidos foram descartados.'
              ]))
            ]
          });
        })));
      }

      /* ---------- recorrência ---------- */
      const rec = X.recorrencia(items);
      if (rec) {
        root.appendChild(U.section('Frequência e recorrência de compra', 'Comportamento de repetição dos clientes'));
        root.appendChild(el('div', { class: 'grid' }, U.guarded('cons.recorrencia', function () {
          return [
            U.card({
              span: 'c6', title: 'Pedidos por cliente',
              sub: MI.fmt.int(rec.clientes) + ' clientes com ao menos uma compra',
              body: U.bars(MI.privacy.guardDist(Object.assign(rec.faixas, { total: rec.clientes })), {})
            }),
            U.card({
              span: 'c6', title: 'Indicadores de recorrência',
              body: [
                U.statline([
                  { k: 'Pedidos por cliente', v: MI.fmt.dec(rec.pedidosPorCliente, 2) },
                  { k: 'Taxa de recompra', v: MI.fmt.pct(rec.taxaRecompra, 1) },
                  { k: 'Intervalo mediano', v: rec.intervaloMediano != null ? MI.fmt.int(rec.intervaloMediano) + ' dias' : '—' },
                  { k: 'Valor médio por cliente', v: MI.fmt.money(rec.valorMedioPorCliente) }
                ]),
                el('div', { style: 'margin-top:14px' }, U.note(rec.taxaRecompra < 0.35 ? 'warn' : 'ok', [
                  el('strong', { text: rec.taxaRecompra < 0.35 ? 'Recompra baixa. ' : 'Recompra consistente. ' }),
                  MI.fmt.pct(rec.taxaRecompra, 1) + ' dos clientes com compra voltaram pelo menos uma segunda vez' +
                  (rec.intervaloMediano != null ? ', com intervalo mediano de ' + MI.fmt.int(rec.intervaloMediano) + ' dias entre pedidos' : '') + '. ' +
                  'Esse número depende da janela de tempo coberta pela base: janelas curtas subestimam a recompra.'
                ]))
              ]
            })
          ];
        })));
      }

      /* ---------- leituras ---------- */
      root.appendChild(U.section('Leituras de consumo', 'Consumo observado, característica demográfica, hipótese e recomendação — sempre separados'));
      root.appendChild(el('div', { class: 'grid' }, leituras(items, l, ped, rec)));

      /* A base que alimenta esta tela se gerencia aqui, não numa tela
         distante: quem percebe que importou a planilha errada está olhando
         justamente para os números errados. */
      if (MI.basesUI && MI.bases && MI.bases.disponivel()) {
        root.appendChild(U.section('Base de consumo', 'Ative, desative, renomeie ou exclua as bases publicadas'));
        MI.basesUI.render(root, {
          tipos: ['transacoes'],
          titulo: 'Bases de consumo',
          aoImportar: function () { MI.views.settings.abrirAba('dados', 'transacoes'); MI.app.go('settings'); }
        });
      }
    }
  };

  /* ================= Auxiliares ================= */
  function seletorMetrica() {
    return el('div', { style: 'display:flex;gap:6px' }, [
      el('button', {
        class: 'chip' + (S.metrica === 'qtd' ? ' is-on' : ''), type: 'button',
        onclick: function () { S.metrica = 'qtd'; MI.app.rerender(); }
      }, 'Por quantidade'),
      el('button', {
        class: 'chip' + (S.metrica === 'valor' ? ' is-on' : ''), type: 'button',
        onclick: function () { S.metrica = 'valor'; MI.app.rerender(); }
      }, 'Por receita')
    ]);
  }

  function diagnostico(l) {
    const req = MI.tx.requisitos();
    const okN = req.filter(function (r) { return r.atendido; }).length;
    return el('div', { class: 'grid', style: 'margin-bottom:4px' }, U.card({
      span: 'c12', title: 'Ligação entre as bases',
      sub: okN + ' de ' + req.length + ' análises têm os campos necessários',
      tools: [
        el('span', { class: 'badge badge--' + (l.taxaProduto > 0.8 ? 'ok' : l.taxaProduto > 0.4 ? 'warn' : 'crit'), text: MI.fmt.pct(l.taxaProduto, 1) + ' casado com o catálogo' }),
        el('span', { class: 'badge badge--' + (l.taxaCliente > 0.8 ? 'ok' : l.taxaCliente > 0.1 ? 'warn' : 'crit'), text: MI.fmt.pct(l.taxaCliente, 1) + ' ligado a clientes' })
      ],
      body: U.table(
        [{ label: 'Análise' }, { label: 'Campo necessário' }, { label: 'Situação' }, { label: 'Cobertura' }],
        req.map(function (r) {
          return {
            cells: [
              { v: r.analise }, { v: r.precisa },
              { v: el('span', { class: 'badge badge--' + (r.atendido ? 'ok' : 'crit'), text: r.atendido ? 'disponível' : 'indisponível' }) },
              { v: r.detalhe }
            ]
          };
        })
      ),
      foot: l.naoEncontradosTotal
        ? MI.fmt.int(l.naoEncontradosTotal) + ' nomes de produto vendidos não existem no catálogo — veja a lista em Cardápio & Produtos › Qualidade e cobertura.'
        : null
    }));
  }

  function leituras(items, l, ped, rec) {
    const fatos = [], demog = [], hip = [], acoes = [];
    const X2 = X;

    const cats = X2.porDimensao(items, '_cat', { por: 'qtd' }).filter(function (c) { return !c.isOther; });
    const top = X2.topProdutos(items, 5, 'qtd');

    if (top.length) {
      fatos.push({
        kind: 'fato', tema: 'Consumo observado',
        titulo: top[0].label + ' é o item mais vendido (' + MI.fmt.pct(top[0].pct, 1) + ' das unidades)',
        texto: 'Os cinco mais vendidos somam ' + MI.fmt.pct(MI.sum(top, function (p) { return p.pct; }), 1) +
          ' da quantidade: ' + top.map(function (p) { return p.nome; }).join(', ') + '.'
      });
    }
    if (cats.length >= 2) {
      fatos.push({
        kind: 'fato', tema: 'Consumo observado',
        titulo: cats[0].label + ' responde por ' + MI.fmt.pct(cats[0].pctQtd, 1) + ' das unidades vendidas',
        texto: cats.slice(0, 5).map(function (c) { return c.label + ' ' + MI.fmt.pct(c.pctQtd, 1); }).join(' · ') +
          (cats[0].ticket ? '. Ticket médio da categoria líder: ' + MI.fmt.money(cats[0].ticket) + '.' : '.')
      });
      const porReceita = X2.porDimensao(items, '_cat', { por: 'valor' }).filter(function (c) { return !c.isOther; });
      if (porReceita.length && porReceita[0].label !== cats[0].label) {
        fatos.push({
          kind: 'fato', tema: 'Receita',
          titulo: 'A categoria que mais vende não é a que mais fatura',
          texto: cats[0].label + ' lidera em quantidade (' + MI.fmt.pct(cats[0].pctQtd, 1) + ') enquanto ' +
            porReceita[0].label + ' lidera em receita (' + MI.fmt.pct(porReceita[0].pctValor, 1) + '). ' +
            'A diferença vem do ticket: ' + MI.fmt.money(cats[0].ticket) + ' contra ' + MI.fmt.money(porReceita[0].ticket) + '.'
        });
        acoes.push({
          kind: 'acao', tema: 'Mix',
          titulo: 'Avaliar se o item de maior giro está puxando o ticket para baixo',
          texto: 'Testar combos que acoplem ' + cats[0].label.toLowerCase() + ' a itens de ticket maior, ' +
            'em vez de descontar o item de maior giro. O efeito sobre a margem depende do custo por produto, que não está nesta base.'
        });
      }
    }

    const h = X2.porHora(items);
    if (h) {
      const ordenado = h.slice().sort(function (a, b) { return b.value - a.value; });
      const baixos = h.slice().sort(function (a, b) { return a.value - b.value; }).filter(function (e) { return e.hora >= 7 && e.hora <= 22; });
      fatos.push({
        kind: 'fato', tema: 'Horário',
        titulo: 'Pico de vendas às ' + ordenado[0].label + ' (' + MI.fmt.pct(ordenado[0].pct, 1) + ' das unidades)',
        texto: 'As três horas mais fortes (' + ordenado.slice(0, 3).map(function (e) { return e.label; }).join(', ') +
          ') concentram ' + MI.fmt.pct(MI.sum(ordenado.slice(0, 3), function (e) { return e.pct; }), 1) + ' do volume.'
      });
      if (baixos.length) {
        acoes.push({
          kind: 'acao', tema: 'Campanhas',
          titulo: 'Testar ação dirigida ao horário de menor movimento (' + baixos[0].label + ')',
          texto: 'Entre 7h e 22h, ' + baixos[0].label + ' é o horário de menor volume (' + MI.fmt.pct(baixos[0].pct, 1) +
            ' das unidades). Uma oferta restrita a essa janela desloca demanda sem canibalizar o pico. ' +
            'Medir com grupo de controle: parte da variação é sazonal, não causada pela campanha.'
        });
      }
    }

    if (l.taxaCliente > 0.05) {
      const comFaixa = items.filter(function (i) { return i._faixa && i._cat; });
      if (comFaixa.length > 200) {
        const grupos = MI.groupBy(comFaixa, '_faixa');
        const achados = [];
        grupos.forEach(function (sub, g) {
          if (sub.length < Math.max(MI.privacy.k, 50)) return;
          const af = X2.afinidade(sub, comFaixa, '_cat', { minQtd: 30 });
          if (af.length && af[0].index >= 118) achados.push({ grupo: g, cat: af[0] });
        });
        achados.sort(function (a, b) { return b.cat.index - a.cat.index; });
        if (achados.length) {
          demog.push({
            kind: 'fato', tema: 'Perfil × consumo',
            titulo: achados[0].grupo + ' concentra ' + achados[0].cat.label + ' acima da média (índice ' + MI.fmt.int(achados[0].cat.index) + ')',
            texto: achados.slice(0, 4).map(function (a) {
              return a.grupo + ' → ' + a.cat.label + ' (' + MI.fmt.int(a.cat.index) + ')';
            }).join(' · ') + '. Isso descreve o que esses clientes compraram nesta base, ' +
              'com ' + MI.fmt.pct(MI.tx.link.taxaCliente, 1) + ' dos itens ligados a um cliente identificado.'
          });
          hip.push({
            kind: 'hipotese', tema: 'Perfil × consumo',
            titulo: 'A diferença entre faixas pode ser efeito do horário, não da idade',
            texto: 'Faixas etárias diferentes compram em horários diferentes, e o horário por si só já muda a categoria vendida. ' +
              'Para separar os dois efeitos é preciso comparar faixas dentro do mesmo horário e da mesma praça. ' +
              'Enquanto isso não for feito, trate como consumo observado do grupo, não como preferência atribuível à idade.'
          });
        }
      }
    }

    const pares = l.pedidos > 10 ? X2.cesta(items, { nivel: 'produto', topN: 24, minPedidos: Math.max(20, MI.privacy.k) }) : null;
    if (pares && pares.length) {
      const p = pares[0];
      fatos.push({
        kind: 'fato', tema: 'Cesta',
        titulo: p.a + ' e ' + p.b + ' aparecem juntos ' + MI.fmt.dec(p.lift, 1) + '× mais que o acaso',
        texto: MI.fmt.int(p.pedidos) + ' pedidos contêm os dois (' + MI.fmt.pct(p.suporte, 2) +
          ' do total). Quem leva ' + p.a + ' leva ' + p.b + ' em ' + MI.fmt.pct(p.confiancaAB, 1) + ' das vezes.'
      });
      acoes.push({
        kind: 'acao', tema: 'Cesta',
        titulo: 'Oferecer ' + p.b + ' no momento em que ' + p.a + ' entra no pedido',
        texto: 'A afinidade já existe sem estímulo. Sugerir a combinação no ponto de venda ou no aplicativo tende a ' +
          'aumentar itens por pedido. O ganho só é mensurável com teste A/B — a base atual não permite estimar a elevação.'
      });
    }

    if (ped && ped.ticketMedio) {
      fatos.push({
        kind: 'fato', tema: 'Pedido',
        titulo: 'Ticket médio de ' + MI.fmt.money(ped.ticketMedio) + ' com ' + MI.fmt.dec(ped.itensPorPedido, 2) + ' itens por pedido',
        texto: 'Mediana ' + MI.fmt.money(ped.ticketMediana) + ' e P90 ' + MI.fmt.money(ped.ticketP90) +
          ' sobre ' + MI.fmt.int(ped.pedidos) + ' pedidos.'
      });
    }

    if (rec && rec.taxaRecompra < 0.4) {
      hip.push({
        kind: 'hipotese', tema: 'Retenção',
        titulo: 'A recompra pode estar limitada pela janela da base, e não pelo comportamento',
        texto: 'A taxa de ' + MI.fmt.pct(rec.taxaRecompra, 1) + ' conta apenas repetições dentro do período coberto pelas transações. ' +
          'Clientes que compram a cada vários meses aparecem como não recorrentes. ' +
          'Confirmar exige uma janela de pelo menos dois intervalos típicos de recompra.'
      });
    }

    hip.push({
      kind: 'hipotese', tema: 'Limitação',
      titulo: 'O que estes dados não permitem afirmar',
      texto: 'Não há custo por produto, margem, ruptura de estoque nem registro de produtos indisponíveis no momento da venda. ' +
        'Portanto: rentabilidade por item, demanda não atendida e elasticidade de preço não podem ser calculadas aqui. ' +
        /* Dizer que eles ficam "fora das análises por categoria" só é verdade
           quando a planilha não traz coluna de categoria: quando traz, a
           categoria vem dela e o item entra normalmente. */
        (l.taxaProduto < 0.95
          ? 'Além disso, ' + MI.fmt.pct(1 - l.taxaProduto, 1) + ' dos itens vendidos não tem correspondência no cardápio. ' +
          (MI.tx.mapping && MI.tx.mapping.categoria
            ? 'Eles continuam nas contagens e na categoria que veio da própria planilha, mas sem tamanho padronizado, preço de tabela nem ingredientes.'
            : 'Eles continuam nas contagens de volume e receita, mas sem categoria, tamanho padronizado, preço de tabela nem ingredientes.')
          : '')
    });

    return [
      U.card({
        span: 'c12', title: 'Consumo observado em transações',
        sub: 'Cada item é um número calculado sobre as transações do recorte',
        body: U.findings(fatos)
      }),
      demog.length ? U.card({
        span: 'c12', title: 'Cruzamento com características demográficas',
        sub: 'Consumo observado de grupos identificados — não é afirmação sobre pessoas fora desta base',
        body: U.findings(demog)
      }) : null,
      U.card({
        span: 'c6', title: 'Hipóteses a validar',
        sub: 'Leituras plausíveis que estes dados, sozinhos, não comprovam',
        body: U.findings(hip)
      }),
      U.card({
        span: 'c6', title: 'Recomendações ainda não validadas',
        sub: 'Decisões propostas — nenhuma foi testada',
        body: U.findings(acoes.length ? acoes : [{
          kind: 'acao', tema: 'Dados',
          titulo: 'Ampliar os campos da base transacional',
          texto: 'Com os campos atuais não há elementos suficientes para propor ações. ' +
            'Incluir identificador de pedido, hora e valor do item libera cesta de compras, demanda por horário e ticket por categoria.'
        }])
      })
    ].filter(Boolean);
  }

  /* ================= Estado sem transações ================= */
  function semTransacoes(root) {
    const podeGerar = MI.store.dataset && MI.store.dataset.source === 'demo' && MI.catalog.items.length;
    /* Antes do convite a importar: se existe base publicada e inativa, o
       caminho curto é reativá-la, não subir o arquivo de novo. */
    if (MI.basesUI && MI.bases && MI.bases.disponivel()) {
      MI.basesUI.render(root, {
        tipos: ['transacoes'],
        titulo: 'Bases de consumo',
        aoImportar: function () { MI.views.settings.abrirAba('dados', 'transacoes'); MI.app.go('settings'); }
      });
    }
    root.appendChild(el('div', { class: 'grid' }, [
      U.card({
        span: 'c7', title: 'Nenhuma base de transações carregada',
        body: [
          U.empty('A Inteligência de Consumo precisa de itens de pedido',
            'Esta seção relaciona clientes, pedidos e produtos do catálogo. A base de clientes sozinha descreve quem são os clientes, mas não o que eles compraram.'),
          el('div', { style: 'display:flex;gap:9px;flex-wrap:wrap;justify-content:center;margin-top:8px' }, [
            MI.store.perspective === 'smoov' ? U.btn('Importar transações', {
              variant: 'accent', icon: 'upload',
              onClick: function () { MI.views.settings.abrirAba('dados', 'transacoes'); MI.app.go('settings'); }
            }) : null,
            podeGerar ? U.btn('Gerar transações demonstrativas', {
              icon: 'refresh', onClick: function () {
                MI.toast('Gerando base transacional demonstrativa…', 'info');
                setTimeout(function () {
                  const r = MI.tx.gerarDemo();
                  if (r) { MI.toast(MI.fmt.int(r.itens) + ' itens de pedido gerados.', 'ok'); MI.app.rerender(); }
                  else MI.toast('Não foi possível gerar: a base de clientes precisa ser a demonstrativa e o catálogo precisa ter produtos.', 'error');
                }, 60);
              }
            }) : null
          ].filter(Boolean))
        ]
      }),
      U.card({
        span: 'c5', title: 'Formato esperado',
        sub: 'Uma linha por item de pedido',
        body: [
          U.table(
            [{ label: 'Campo' }, { label: 'Obrigatório' }],
            [
              ['Nome do produto ou SKU', 'sim'],
              ['Identificador do pedido', 'para cesta de compras'],
              ['Identificador do cliente', 'para cruzamento demográfico'],
              ['Data do pedido', 'para sazonalidade'],
              ['Hora do pedido', 'para demanda por horário'],
              ['Quantidade', 'não (assume 1)'],
              ['Valor do item', 'para receita e ticket']
            ].map(function (r) { return { cells: [{ v: r[0] }, { v: r[1] }] }; })
          ),
          el('div', { style: 'margin-top:12px' }, U.note(null, [
            'O identificador de cliente precisa ser o mesmo usado na planilha de clientes. ' +
            'Se os códigos não coincidirem, a plataforma avisa e mantém as análises separadas em vez de inventar a ligação.'
          ]))
        ]
      })
    ]));
  }

})(window.MI);
