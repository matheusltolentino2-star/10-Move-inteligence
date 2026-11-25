/* 10 Move Intelligence — Inteligência geográfica */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, S = MI.stats;

  MI.views.geography = {
    title: 'Inteligência geográfica',
    subtitle: 'Concentração e ranking por localização',
    icon: 'map',

    render: function (root) {
      const st = MI.store, rows = st.rows;
      const notice = U.demoNotice();
      if (notice) root.appendChild(el('div', { style: 'margin-bottom:14px' }, notice));

      if (!st.has('_uf') && !st.has('_cidade') && !st.has('_bairro')) {
        root.appendChild(U.card({
          span: 'c12', title: 'Sem dimensão geográfica',
          body: U.unavailable('A base ativa não tem coluna de localização reconhecida', ['Estado / UF', 'Cidade', 'Bairro / região'])
        }));
        return;
      }
      /* Recorte vazio NÃO devolve uma tela vazia: o mapa continua de pé.
         Selecionar uma cidade sem clientes é navegação legítima, e quem fez
         isso precisa da trilha para voltar. Só as análises abaixo é que
         ficam sem o que mostrar. */
      const recorteVazio = !rows.length;

      /* ---------- Estados ---------- */
      if (st.has('_uf')) {
        const dUf = MI.privacy.guardDist(S.dist(rows, '_uf', {}));

        /* O mapa é a interface de investigação: a profundidade territorial
           sai do próprio filtro da plataforma, não de um estado paralelo.
           Assim, descer para um estado no mapa é a mesma coisa que filtrar
           por aquele estado, e todos os módulos acompanham sem precisar de
           uma segunda camada de análise só para o mapa. */
        const ufSelecionada = (function () {
          const f = st.filters._uf;
          if (!f || !f.values || f.values.size !== 1) return null;
          return Array.from(f.values)[0];
        })();
        const cidadeSelecionada = (function () {
          const f = st.filters._cidade;
          if (!f || !f.values || f.values.size !== 1) return null;
          return Array.from(f.values)[0];
        })();

        const hospedeiro = el('div', { style: 'margin-bottom:16px' });
        root.appendChild(U.guarded('geo.uf', function () { return hospedeiro; }));
        workspace(hospedeiro, ufSelecionada, cidadeSelecionada, rows);

        /* daqui para baixo são as análises, que de fato não têm o que
           mostrar sem registros no recorte */
        if (recorteVazio) {
          root.appendChild(el('div', { class: 'grid' }, U.card({
            span: 'c12',
            body: U.empty('Nenhum registro neste recorte',
              'O território continua navegável acima. Use a trilha para voltar a um nível com dados.')
          })));
          return;
        }

        const detalhesLote = MI.fullData?.geographicDetail();
        if (detalhesLote) root.appendChild(el('div', { class: 'grid' }, detalhesLote));

        /* A concentração acompanha o nível do mapa. Dentro de um estado,
           medir dependência "entre UFs" devolve sempre HHI 1,000 e uma
           unidade — número correto e inútil. O que importa ali é a
           dependência entre os municípios daquele estado. */
        const porMunicipio = !!(ufSelecionada && st.has('_cidade'));
        const campoConc = porMunicipio ? '_cidade' : '_uf';
        const termo = porMunicipio ? 'municípios' : 'unidades da federação';
        const termoCurto = porMunicipio ? 'municípios' : 'UFs';
        const conc = S.concentration(rows, campoConc);
        const real = MI.privacy.guardDist(S.dist(rows, campoConc, {})).filter(function (e) { return !e.suppressed; });

        root.appendChild(U.section('Concentração', 'Quanto o recorte depende de poucas praças'));
        root.appendChild(el('div', { class: 'grid' }, [
          U.guarded('geo.concentracao', function () {
            return U.card({
              span: 'c12', title: 'Concentração geográfica',
              sub: 'Quanto a base depende de poucas praças',
              body: [
                U.statline([
                  { k: porMunicipio ? 'Maior município' : 'Maior UF', v: real.length ? MI.fmt.pct(conc.top1, 1) : '—' },
                  { k: 'Top 5 ' + termoCurto, v: MI.fmt.pct(conc.top5, 1) },
                  { k: 'Top 10 ' + termoCurto, v: MI.fmt.pct(conc.top10, 1) },
                  { k: (porMunicipio ? 'Municípios' : 'UFs') + ' p/ 80%', v: String(conc.n80) },
                  { k: 'HHI', v: MI.fmt.dec(conc.hhi, 3) }
                ]),
                el('div', { style: 'margin-top:14px' }, U.note(
                  conc.hhi > 0.18 ? 'warn' : null,
                  [
                    el('strong', { text: conc.hhi > 0.25 ? 'Concentração alta. ' : conc.hhi > 0.15 ? 'Concentração moderada. ' : 'Base distribuída. ' }),
                    'O índice Herfindahl-Hirschman de ' + MI.fmt.dec(conc.hhi, 3) + ' indica que ' +
                    (conc.hhi > 0.25 ? 'o recorte depende fortemente de poucos ' + termo + '.'
                      : conc.hhi > 0.15 ? 'há dependência relevante das maiores praças.'
                        : 'nenhuma praça isolada domina o recorte.') +
                    ' ' + conc.n80 + ' de ' + conc.categories + ' ' + termo + ' cobrem 80% dos registros.'
                  ]
                )),
                el('div', { style: 'margin-top:14px' }, U.bars(MI.privacy.guardDist(S.dist(rows, '_regiao', { order: MI.geo.REGIOES })), { compact: true }))
              ]
            });
          })
        ]));

        /* Tabela completa de UFs */
        root.appendChild(el('div', { class: 'grid' }, U.guarded('geo.uf', function () {
          let acc = 0;
          const tRows = real.map(function (e) {
            acc += e.value;
            return {
              cells: [
                { v: e.label }, { v: MI.UF_NOMES[e.label] || '—' }, { v: MI.UF_REGIAO[e.label] || '—' },
                { v: MI.fmt.int(e.value) }, { v: MI.fmt.pct(e.pct, 2) }, { v: MI.fmt.pct(acc / dUf.total, 1) }
              ]
            };
          });
          if (dUf.suppressedGroups) {
            tRows.push({
              cells: [
                { v: '—', masked: true }, { v: 'Suprimido (< ' + MI.privacy.k + ' registros)', masked: true },
                { v: dUf.suppressedGroups + ' unidades', masked: true },
                { v: MI.fmt.int(dUf.suppressedCount), masked: true }, { v: '—', masked: true }, { v: '100,0%', masked: true }
              ]
            });
          }
          return U.card({
            span: 'c12', title: 'Tabela por estado', sub: 'Volume, participação e participação acumulada',
            body: U.table([
              { label: 'UF' }, { label: 'Estado' }, { label: 'Região' },
              { label: 'Registros', num: true }, { label: 'Participação', num: true }, { label: 'Acumulado', num: true }
            ], tRows)
          });
        })));
      }

      /* ---------- Cidades ---------- */
      if (st.has('_cidade')) {
        root.appendChild(U.section('Cidades', 'Ranking e dispersão das praças atendidas'));
        const dCid = MI.privacy.guardDist(S.dist(rows, '_cidade', {}));
        const concC = S.concentration(rows, '_cidade');
        const realC = dCid.filter(function (e) { return !e.suppressed; });

        root.appendChild(el('div', { class: 'grid' }, [
          U.guarded('geo.cidade', function () {
            const ufDaCidade = mapaCidadeUf(rows);
            return U.card({
              span: 'c6', title: 'Top 20 cidades', sub: MI.fmt.int(concC.categories) + ' cidades distintas na base',
              body: U.rank(realC.slice(0, 20).map(function (e) {
                return { label: e.label, value: e.value, sub: ufDaCidade[e.label] || null };
              }), { total: dCid.total }),
              foot: dCid.suppressedGroups
                ? dCid.suppressedGroups + ' cidade(s) suprimida(s) — somam ' + MI.fmt.int(dCid.suppressedCount) + ' registros abaixo do limite de ' + MI.privacy.k
                : 'Nenhuma cidade abaixo do limite de ' + MI.privacy.k + ' registros'
            });
          }),
          U.guarded('geo.concentracao', function () {
            const curve = concC.curve.slice(0, 40);
            return U.chartCard({
              title: 'Curva de concentração (Pareto)', span: 'c6', height: 'lg',
              sub: concC.n80 + ' cidades concentram 80% dos registros',
              render: function (cv) {
                return MI.charts.line(cv, curve.map(function (c, i) { return String(i + 1); }),
                  [{ label: 'Participação acumulada', values: curve.map(function (c) { return c.cum * 100; }), color: MI.charts.theme().series[1], fmt: function (v) { return MI.fmt.dec(v, 1) + '%'; } }],
                  { yFmt: function (v) { return MI.fmt.int(v) + '%'; }, maxTicks: 10 });
              },
              foot: 'Eixo horizontal: cidades ordenadas da maior para a menor. Top 5 = ' +
                MI.fmt.pct(concC.top5, 1) + ' · Top 10 = ' + MI.fmt.pct(concC.top10, 1)
            });
          })
        ]));
      }

      /* ---------- Bairros ---------- */
      if (st.has('_bairro')) {
        const dB = MI.privacy.guardDist(S.dist(rows, '_bairro', { limit: 15, other: false }));
        root.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', title: 'Bairros / regiões', sub: 'Granularidade mais fina — maior risco de reidentificação',
          body: [
            U.bars(dB.filter(function (e) { return !e.suppressed; }), { compact: true, total: dB.total }),
            el('div', { style: 'margin-top:14px' }, U.note('warn', [
              el('strong', { text: 'Atenção de privacidade. ' }),
              'Bairro combinado com idade e gênero pode isolar indivíduos. Esta dimensão não deve ser compartilhada sem agregação adicional — ' +
              'verifique o painel de risco em “Privacidade e compartilhamento”.'
            ]))
          ]
        })));
      }

      /* ---------- Leituras geográficas ---------- */
      const leituras = [];
      if (st.has('_uf')) {
        const d = MI.privacy.guardDist(S.dist(rows, '_uf', {})).filter(function (e) { return !e.suppressed; });
        const conc = S.concentration(rows, '_uf');
        if (d.length) {
          leituras.push({
            kind: 'fato', tema: 'Cobertura',
            titulo: d.length + ' unidades da federação com presença registrada',
            texto: 'Entre eles, ' + d[0].label + ' lidera com ' + MI.fmt.int(d[0].value) + ' registros (' +
              MI.fmt.pct(d[0].pct, 1) + '). O menor estado com volume acima do limite de privacidade é ' +
              d[d.length - 1].label + ', com ' + MI.fmt.int(d[d.length - 1].value) + '.'
          });
        }
        const faltantes = Object.keys(MI.UF_NOMES).filter(function (uf) {
          return !d.some(function (e) { return e.label === uf; });
        });
        if (faltantes.length) {
          leituras.push({
            kind: 'fato', tema: 'Cobertura',
            titulo: faltantes.length + ' unidades da federação sem registros no recorte',
            texto: 'Sem presença detectada em: ' + faltantes.join(', ') + '. ' +
              'Isso descreve a base atual; não indica, por si, ausência de mercado.'
          });
        }
        if (conc.hhi > 0.15) {
          leituras.push({
            kind: 'hipotese', tema: 'Expansão',
            titulo: 'Dependência das praças líderes merece atenção comercial',
            texto: 'Com HHI de ' + MI.fmt.dec(conc.hhi, 3) + ' e ' + MI.fmt.pct(conc.top5, 1) +
              ' nas cinco maiores unidades da federação, uma oscilação nas praças líderes afeta o resultado agregado. ' +
              'Avaliar esta hipótese exige dados de mercado externos (população, concorrência, custo de operação) que não estão nesta base.'
          });
        }
      }
      if (st.has('_cidade') && st.has('_uf')) {
        const topC = MI.privacy.guardDist(S.dist(rows, '_cidade', { limit: 5, other: false })).filter(function (e) { return !e.suppressed; });
        const share = MI.sum(topC, function (e) { return e.pct; });
        leituras.push({
          kind: 'fato', tema: 'Concentração',
          titulo: 'As 5 maiores cidades somam ' + MI.fmt.pct(share, 1) + ' da base',
          texto: topC.map(function (e) { return e.label + ' ' + MI.fmt.pct(e.pct, 1); }).join(' · ') + '.'
        });
      }
      leituras.push({
        kind: 'hipotese', tema: 'Limitação',
        titulo: 'Penetração de mercado não pode ser calculada com esta base',
        texto: 'Participação de mercado e penetração por cidade exigem população ou base de concorrência, ' +
          'que não existem no arquivo. Os números acima medem a distribuição interna da base, não a fatia de mercado.'
      });

      root.appendChild(U.section('Leituras geográficas', 'Fatos observados e hipóteses, sempre identificados'));
      root.appendChild(el('div', { class: 'grid' }, U.card({ span: 'c12', body: U.findings(leituras) })));
    }
  };
  /* ================= Workspace territorial =================
     O mapa é um objeto vivo: a view devolve sempre o mesmo nó e só manda
     dados novos. Recriar a cada render perderia o zoom e recarregaria
     tiles à toa.

     O nível sai dos próprios filtros da plataforma — descer para um estado
     no mapa é idêntico a filtrar por ele, então todos os módulos
     acompanham sem uma segunda camada de análise só para o mapa. */
  const geoEstado = { carregando: null, erro: null };

  function nivelAtual(uf, cidade) {
    if (uf && cidade) return 'municipio';
    if (uf) return 'uf';
    return 'brasil';
  }

  function workspace(root, uf, cidade, rows) {
    const st = MI.store;
    const nivel = nivelAtual(uf, cidade);

    /* a geometria necessária para este nível já está carregada? */
    const precisaUf = nivel !== 'brasil';
    const faltaBrasil = !MI.geo.temBrasil();
    const faltaUf = precisaUf && !MI.geo.temUf(uf);
    if (faltaBrasil || faltaUf) {
      const chave = faltaBrasil ? 'BR' : uf;
      if (geoEstado.carregando !== chave) {
        geoEstado.carregando = chave; geoEstado.erro = null;
        (faltaBrasil ? MI.geo.carregarBrasil() : MI.geo.carregarUf(uf))
          .then(function () { geoEstado.carregando = null; MI.app.rerender(); })
          .catch(function (e) { geoEstado.erro = e.message; MI.app.rerender(); });
      }
      root.appendChild(el('div', { class: 'geo geo--carregando' },
        geoEstado.erro
          ? U.note('crit', [el('strong', { text: 'A malha não carregou. ' }), geoEstado.erro])
          : U.empty('Carregando a geometria' + (faltaBrasil ? ' do Brasil' : ' de ' + (MI.UF_NOMES[uf] || uf)) + '…')));
      return;
    }

    const crumbs = [{
      rotulo: 'Brasil',
      aoClicar: uf ? function () { st.setFilter('_cidade', null); st.setFilter('_uf', null); } : null
    }];
    if (uf) crumbs.push({
      rotulo: MI.UF_NOMES[uf] || uf,
      aoClicar: cidade ? function () { st.setFilter('_cidade', null); } : null
    });
    if (cidade) crumbs.push({ rotulo: cidade, aoClicar: null });

    let feicoes, campo, chave, selecionado, enquadrarEm, titulo;
    if (nivel === 'brasil') {
      feicoes = MI.GEO_BR;
      campo = '_uf';
      chave = function (f) { return f.properties.uf; };
      selecionado = null;
      /* o enquadramento nacional sai da própria geometria, então acompanha
         o tamanho do contêiner em vez de depender de um zoom fixo */
      enquadrarEm = [[-33.9, -74.0], [5.3, -34.0]];
      titulo = 'Brasil';
    } else {
      const M = MI.GEO_MUN[uf];
      campo = '_cidade';
      chave = function (f) { return f.properties.nome; };
      if (nivel === 'uf') {
        feicoes = M;
        selecionado = null;
        enquadrarEm = ufCaixa(uf);
        titulo = MI.UF_NOMES[uf] || uf;
      } else {
        const f = MI.geo.municipioPorNome(uf, cidade);
        feicoes = f ? { type: 'FeatureCollection', features: [f] } : { type: 'FeatureCollection', features: [] };
        selecionado = cidade;
        enquadrarEm = f ? f.properties.caixa : ufCaixa(uf);
        titulo = cidade;
      }
    }

    const ctx = {
      nivel: nivel, uf: uf, municipio: cidade, rows: rows, campo: campo,
      feicoes: feicoes, chave: chave, selecionado: selecionado,
      crumbs: crumbs, enquadrarEm: enquadrarEm, tituloPainel: titulo,
      aoSelecionar: function (valor) {
        if (nivel === 'brasil') MI.app.toggleCatValue('_uf', valor);
        else if (nivel === 'uf') MI.app.toggleCatValue('_cidade', valor);
      },
      aoSelecionarUnidade: function (u) { geoEstado.unidade = u; MI.app.rerender(); },
      painel: function (host, c) { painelTerritorial(host, c, uf, cidade, rows); }
    };

    root.appendChild(MI.geoMap.obter());
    MI.geoMap.iniciar(ctx).catch(function (e) {
      MI.toast('Mapa: ' + (e.message || e), 'error');
    });
  }

  function ufCaixa(uf) {
    const f = MI.GEO_BR && MI.GEO_BR.features.filter(function (x) { return x.properties.uf === uf; })[0];
    return f ? f.properties.caixa : null;
  }

  /* Painel contextual: sem seleção mostra o território; com unidade
     selecionada mostra a unidade, sem tirar o mapa da frente. */
  function painelTerritorial(host, ctx, uf, cidade, rows) {
    const u = geoEstado.unidade;
    if (u && MI.unidades.items.includes(u)) {
      host.appendChild(el('div', { class: 'geo__painel-sec', text: 'Unidade' }));
      host.appendChild(U.statline([
        { k: 'Formato', v: MI.unidades.rotuloFormato(u.formato) },
        { k: 'Posição', v: MI.unidades.rotuloPrecisao(u.precisao) },
        u.municipio ? { k: 'Município', v: u.municipio + (u.uf ? ' · ' + u.uf : '') } : null,
        u.precisao === 'exata' ? { k: 'Raio', v: MI.fmt.int(u.raio_m) + ' m' } : null
      ].filter(Boolean)));
      if (u.endereco) host.appendChild(el('p', { class: 'geo__painel-txt', text: u.endereco }));
      const nomeUnidade = MI.slug(u.nome);
      const vendas = MI.tx.has() ? MI.tx.filtered().filter(function (i) {
        return u.is_synthetic ? i._unidade === u.nome : i._unidade && MI.slug(i._unidade) === nomeUnidade;
      }) : [];
      if (vendas.length) {
        const receita = MI.sum(vendas, function (i) { return i._valor || 0; });
        const pedidos = new Set(vendas.map(function (i) { return i._pedido; })).size;
        host.appendChild(el('div', { class: 'geo__painel-sec', text: 'Comercial' }));
        host.appendChild(U.statline([
          { k: 'Itens vendidos', v: MI.fmt.int(MI.sum(vendas, function (i) { return i._qtd || 1; })) },
          { k: 'Pedidos', v: MI.fmt.int(pedidos) },
          { k: 'Receita', v: MI.fmt.money(receita) },
          { k: 'Ticket por pedido', v: pedidos ? MI.fmt.money(receita / pedidos) : '—' }
        ]));
      } else {
        host.appendChild(el('p', { class: 'geo__painel-txt', text: 'Nenhuma venda associada a esta unidade no recorte atual.' }));
      }
      host.appendChild(el('div', { style: 'padding:10px 12px' }, U.btn('Voltar ao território', {
        sm: true, variant: 'ghost', onClick: function () { geoEstado.unidade = null; MI.app.rerender(); }
      })));
      return;
    }

    /* visão do território */
    const ag = ctx.ag;
    const comDado = [];
    ctx.feicoes.features.forEach(function (f) { if (f._ag && !f._ag.suprimido) comDado.push(f); });
    comDado.sort(function (a, b) { return b._v - a._v; });

    host.appendChild(U.statline([
      { k: 'Registros', v: MI.fmt.int(rows.length) },
      { k: ctx.nivel === 'brasil' ? 'UFs com registro' : 'Municípios com registro', v: MI.fmt.int(comDado.length) },
      ag.gruposSuprimidos ? { k: 'Suprimidos', v: MI.fmt.int(ag.suprimidos) } : null,
      ctx.nUnidades ? { k: 'Unidades', v: MI.fmt.int(ctx.nUnidades) } : null
    ].filter(Boolean)));

    if (ctx.nivel === 'municipio') {
      if (MI.store.has('_bairro')) {
        const d = MI.privacy.guardDist(S.dist(rows, '_bairro', { limit: 14 }));
        host.appendChild(el('div', { class: 'geo__painel-sec', text: 'Bairros' }));
        host.appendChild(el('div', { class: 'geo__lista' }, d.map(function (e) {
          return el('button', {
            class: 'geo__item' + (e.suppressed ? ' is-inerte' : ''), type: 'button',
            onclick: e.suppressed ? null : function () { MI.app.toggleCatValue('_bairro', e.label); }
          }, [
            el('span', { class: 'geo__item-nome', text: e.label }),
            el('span', { class: 'geo__item-v', text: MI.fmt.int(e.value) })
          ]);
        })));
      } else {
        host.appendChild(el('p', { class: 'geo__painel-txt', text: 'A base não traz bairro, então a granularidade termina no município.' }));
      }
      return;
    }

    host.appendChild(el('div', { class: 'geo__painel-sec', text: 'Ranking por ' + ctx.metrica.rotulo.toLowerCase() }));
    host.appendChild(el('div', { class: 'geo__lista' }, comDado.slice(0, 30).map(function (f, i) {
      const prop = ctx.max ? f._v / ctx.max : 0;
      return el('button', {
        class: 'geo__item', type: 'button',
        onclick: function () {
          MI.geoMap.enquadrar(f.properties.caixa);
          ctx.aoSelecionar(ctx.chave(f), f);
        }
      }, [
        el('span', { class: 'geo__item-pos', text: String(i + 1) }),
        el('span', { class: 'geo__item-nome', text: f.properties.nome }),
        el('span', { class: 'geo__item-v', text: ctx.metrica.fmt(f._v) }),
        el('i', { class: 'geo__item-barra', style: 'width:' + Math.round(prop * 100) + '%' })
      ]);
    })));

    /* nomes que não encontram geometria: sumir do mapa não pode virar sumir
       da análise */
    if (ctx.nivel === 'uf') {
      const idx = MI.geo.indiceMunicipios(uf);
      const fora = MI.privacy.guardDist(S.dist(rows, '_cidade', {}))
        .filter(function (e) { return !e.suppressed && !e.isOther && !idx[MI.slug(e.label)]; });
      if (fora.length) {
        host.appendChild(el('div', { class: 'geo__painel-sec', text: 'Fora do mapa' }));
        host.appendChild(el('p', { class: 'geo__painel-txt', text: MI.fmt.int(fora.length) + ' nomes de cidade não batem com a malha do IBGE. Continuam nos números; só não têm posição.' }));
        host.appendChild(el('div', { class: 'geo__lista' }, fora.slice(0, 10).map(function (e) {
          return el('div', { class: 'geo__item is-inerte' }, [
            el('span', { class: 'geo__item-nome', text: e.label }),
            el('span', { class: 'geo__item-v', text: MI.fmt.int(e.value) })
          ]);
        })));
      }
    }
  }

  /* UF predominante de cada cidade, em uma passagem só (há homônimos entre estados) */
  function mapaCidadeUf(rows) {
    const contagem = new Map();
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i]._cidade, uf = rows[i]._uf;
      if (!c || !uf) continue;
      let m = contagem.get(c);
      if (!m) { m = new Map(); contagem.set(c, m); }
      m.set(uf, (m.get(uf) || 0) + 1);
    }
    const out = {};
    contagem.forEach(function (m, cidade) {
      let melhor = null, max = -1;
      m.forEach(function (n, uf) { if (n > max) { max = n; melhor = uf; } });
      out[cidade] = melhor;
    });
    return out;
  }

})(window.MI);
