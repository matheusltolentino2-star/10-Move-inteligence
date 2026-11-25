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

        root.appendChild(U.guarded('geo.uf', function () {
          return el('div', { style: 'margin-bottom:16px' },
            workspace(ufSelecionada, cidadeSelecionada, rows));
        }));

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
     Um componente só para os dois níveis. A malha municipal chega depois do
     render, que é síncrono, então este estado guarda em que pé está o
     carregamento de cada UF — para a tela dizer "carregando" ou "falhou" em
     vez de piscar vazia. */
  const malha = { uf: null, estado: null, erro: null };

  function workspace(uf, cidade, rows) {
    const st = MI.store;
    const crumbs = [{
      rotulo: 'Brasil',
      aoClicar: uf ? function () { st.setFilter('_cidade', null); st.setFilter('_uf', null); } : null
    }];
    if (uf) {
      crumbs.push({
        rotulo: MI.UF_NOMES[uf] || uf,
        aoClicar: cidade ? function () { st.setFilter('_cidade', null); } : null
      });
    }
    if (cidade) crumbs.push({ rotulo: cidade, aoClicar: null });

    /* nível nacional, ou estado cuja malha ainda não chegou */
    if (!uf || !st.has('_cidade')) {
      return MI.geoMap.workspace({
        nivel: 'brasil', rows: rows, campo: '_uf', crumbs: crumbs,
        selecionado: uf,
        onSelect: function (sigla) { MI.app.toggleCatValue('_uf', sigla); }
      });
    }

    if (!MI.geo.temUf(uf)) {
      if (malha.uf !== uf) {
        malha.uf = uf; malha.estado = 'carregando'; malha.erro = null;
        MI.geo.carregarUf(uf)
          .then(function () { malha.estado = 'pronta'; MI.app.rerender(); })
          .catch(function (e) { malha.estado = 'erro'; malha.erro = e.message; MI.app.rerender(); });
      }
      return el('div', { class: 'geo' }, [
        el('div', { class: 'geo__barra' }, el('div', { class: 'geo__trilha' },
          crumbs.map(function (c, i) {
            return el('button', {
              class: 'geo__crumb' + (c.aoClicar ? '' : ' is-on'), type: 'button', onclick: c.aoClicar || null
            }, (i ? '› ' : '') + c.rotulo);
          }))),
        el('div', { class: 'geo__corpo' }, el('div', { class: 'geo__palco' },
          malha.estado === 'erro'
            ? U.note('crit', [el('strong', { text: 'A malha municipal não carregou. ' }), malha.erro || ''])
            : U.empty('Carregando os municípios de ' + (MI.UF_NOMES[uf] || uf) + '…')))
      ]);
    }

    /* nomes de cidade que não batem com nenhum município da UF: o balanço
       tem que aparecer, senão sumir do mapa vira sumir da análise */
    const idx = MI.geo.indiceMunicipios(uf);
    const naoLocalizados = MI.privacy.guardDist(S.dist(rows, '_cidade', {}))
      .filter(function (e) { return !e.suppressed && !e.isOther && !idx[MI.slug(e.label)]; });

    return MI.geoMap.workspace({
      nivel: 'uf', uf: uf, rows: rows, campo: '_cidade', crumbs: crumbs,
      selecionado: cidade,
      naoLocalizados: naoLocalizados,
      onSelect: function (nome) { MI.app.toggleCatValue('_cidade', nome); },
      rotuloAprofundar: st.has('_bairro') ? 'Ver bairros' : null,
      aoAprofundar: st.has('_bairro') ? function () { MI.app.go('geography'); } : null
    });
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
