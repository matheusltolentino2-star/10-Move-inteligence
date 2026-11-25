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
      if (!rows.length) {
        root.appendChild(U.card({ span: 'c12', body: U.empty('Nenhum registro no recorte atual') }));
        return;
      }

      /* ---------- Estados ---------- */
      if (st.has('_uf')) {
        const dUf = MI.privacy.guardDist(S.dist(rows, '_uf', {}));
        const conc = S.concentration(rows, '_uf');
        const real = dUf.filter(function (e) { return !e.suppressed; });

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

        root.appendChild(trilha(ufSelecionada, cidadeSelecionada));

        if (ufSelecionada && st.has('_cidade')) {
          renderMunicipios(root, ufSelecionada, cidadeSelecionada, rows);
        }

        root.appendChild(U.section('Unidades da federação', 'Clique em uma unidade no mapa para filtrar toda a plataforma'));
        root.appendChild(el('div', { class: 'grid' }, [
          U.guarded('geo.uf', function () {
            return U.card({
              span: 'c7', title: 'Mapa do Brasil',
              sub: 'A cor indica o volume de registros em cada unidade da federação',
              body: MI.geo.mapa(dUf, {
                selected: st.filters._uf ? Array.from(st.filters._uf.values) : [],
                onSelect: function (uf) { MI.app.toggleCatValue('_uf', uf); }
              }),
              foot: 'Malha oficial do IBGE em projeção cônica equivalente: a área desenhada é proporcional à área real. São 26 estados mais o Distrito Federal.'
            });
          }),
          U.guarded('geo.concentracao', function () {
            return U.card({
              span: 'c5', title: 'Concentração geográfica',
              sub: 'Quanto a base depende de poucas praças',
              body: [
                U.statline([
                  { k: 'Maior UF', v: real.length ? MI.fmt.pct(conc.top1, 1) : '—' },
                  { k: 'Top 5 UFs', v: MI.fmt.pct(conc.top5, 1) },
                  { k: 'Top 10 UFs', v: MI.fmt.pct(conc.top10, 1) },
                  { k: 'UFs p/ 80%', v: String(conc.n80) },
                  { k: 'HHI', v: MI.fmt.dec(conc.hhi, 3) }
                ]),
                el('div', { style: 'margin-top:14px' }, U.note(
                  conc.hhi > 0.18 ? 'warn' : null,
                  [
                    el('strong', { text: conc.hhi > 0.25 ? 'Concentração alta. ' : conc.hhi > 0.15 ? 'Concentração moderada. ' : 'Base distribuída. ' }),
                    'O índice Herfindahl-Hirschman de ' + MI.fmt.dec(conc.hhi, 3) + ' indica que ' +
                    (conc.hhi > 0.25 ? 'a operação depende fortemente de poucas unidades da federação.'
                      : conc.hhi > 0.15 ? 'há dependência relevante das maiores praças.'
                        : 'nenhuma unidade isolada domina a base.') +
                    ' ' + conc.n80 + ' de ' + conc.categories + ' unidades da federação cobrem 80% dos registros.'
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

  /* ================= Drill-down territorial =================
     A malha municipal chega depois do render, que é síncrono. Este estado
     guarda em que pé está o carregamento de cada UF para a tela poder dizer
     "carregando", "falhou" ou desenhar — em vez de piscar vazia. */
  const malha = { uf: null, estado: null, erro: null };

  function trilha(uf, cidade) {
    const st = MI.store;
    const itens = [];
    const crumb = function (texto, ativo, aoClicar) {
      return el('button', {
        class: 'trilha__item' + (ativo ? ' is-on' : ''), type: 'button',
        onclick: ativo ? null : aoClicar
      }, texto);
    };
    itens.push(crumb('Brasil', !uf, function () {
      st.setFilter('_cidade', null);
      st.setFilter('_uf', null);
    }));
    if (uf) {
      itens.push(el('span', { class: 'trilha__sep', text: '›' }));
      itens.push(crumb(MI.UF_NOMES[uf] || uf, !cidade, function () { st.setFilter('_cidade', null); }));
    }
    if (cidade) {
      itens.push(el('span', { class: 'trilha__sep', text: '›' }));
      itens.push(crumb(cidade, true, null));
    }
    return el('div', { class: 'trilha' }, itens);
  }

  function renderMunicipios(root, uf, cidade, rows) {
    /* carregamento sob demanda: uma UF por vez, nunca o Brasil inteiro */
    if (!MI.geo.temUf(uf)) {
      if (malha.uf !== uf) {
        malha.uf = uf; malha.estado = 'carregando'; malha.erro = null;
        MI.geo.carregarUf(uf)
          .then(function () { malha.estado = 'pronta'; MI.app.rerender(); })
          .catch(function (e) { malha.estado = 'erro'; malha.erro = e.message; MI.app.rerender(); });
      }
      root.appendChild(U.section('Municípios de ' + (MI.UF_NOMES[uf] || uf), 'Malha oficial do IBGE, carregada sob demanda'));
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12',
        body: malha.estado === 'erro'
          ? U.note('crit', [el('strong', { text: 'A malha municipal não carregou. ' }), malha.erro || ''])
          : U.empty('Carregando os municípios de ' + (MI.UF_NOMES[uf] || uf) + '…')
      })));
      return;
    }

    const dCid = MI.privacy.guardDist(S.dist(rows, '_cidade', {}));
    const r = MI.geo.mapaUf(uf, dCid, {
      selected: cidade ? [cidade] : [],
      onSelect: function (nome) { MI.app.toggleCatValue('_cidade', nome); }
    });
    if (!r || !r.node) return;

    root.appendChild(U.section('Municípios de ' + (MI.UF_NOMES[uf] || uf),
      'Clique em um município para aprofundar o recorte em toda a plataforma'));
    root.appendChild(el('div', { class: 'grid' }, [
      U.guarded('geo.uf', function () {
        return U.card({
          span: 'c7', title: 'Mapa de ' + (MI.UF_NOMES[uf] || uf),
          sub: MI.fmt.int(r.comRegistros) + ' de ' + MI.fmt.int(r.municipios) + ' municípios têm registros no recorte',
          body: r.node,
          foot: 'Malha oficial do IBGE em projeção cônica equivalente. Os nomes das cidades da planilha são ' +
            'casados com os municípios por nome normalizado e correspondência exata — nome parecido não é ' +
            'casado em silêncio.'
        });
      }),
      U.card({
        span: 'c5', title: 'O que entrou no mapa',
        sub: 'Toda linha que não vira posição no mapa precisa aparecer em algum lugar',
        body: [
          /* O denominador é o recorte inteiro, não só o que sobrou da
             supressão: dizer "100% de cobertura" escondendo os grupos
             suprimidos seria contar o que falta como se não existisse. */
          U.statline([
            { k: 'Registros no mapa', v: MI.fmt.int(r.localizados) },
            { k: 'Cobertura do recorte', v: rows.length ? MI.fmt.pct(r.localizados / rows.length, 1) : '—' },
            { k: 'Suprimidos por k', v: MI.fmt.int(dCid.suppressedCount || 0) },
            { k: 'Sem cidade preenchida', v: MI.fmt.int(dCid.missing || 0) },
            { k: 'Nomes não localizados', v: MI.fmt.int(r.naoLocalizados.length) }
          ]),
          r.naoLocalizados.length
            ? el('div', { style: 'margin-top:14px' }, [
              U.note('warn', [
                el('strong', { text: 'Cidades que não batem com nenhum município de ' + uf + '. ' }),
                'Podem ser grafias diferentes, cidade de outro estado no campo errado, ou distrito em vez de município. ' +
                'Elas continuam nos números da plataforma; só não aparecem no mapa.'
              ]),
              el('div', { style: 'margin-top:10px' }, U.table(
                [{ label: 'Nome na planilha' }, { label: 'Registros', num: true }],
                r.naoLocalizados.slice(0, 12).map(function (e) {
                  return { cells: [{ v: e.label }, { v: MI.fmt.int(e.value), num: true }] };
                })))
            ])
            : el('div', { style: 'margin-top:14px' }, U.note('ok', 'Todos os nomes de cidade do recorte foram localizados na malha do IBGE.'))
        ]
      })
    ]));
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
