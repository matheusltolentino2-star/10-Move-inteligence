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

        root.appendChild(U.section('Estados', 'Clique em um estado no cartograma para filtrar toda a plataforma'));
        root.appendChild(el('div', { class: 'grid' }, [
          U.guarded('geo.uf', function () {
            return U.card({
              span: 'c7', title: 'Cartograma do Brasil',
              sub: 'Grade esquemática: cada célula é um estado, a cor indica o volume relativo',
              body: MI.geo.cartogram(dUf, {
                selected: st.filters._uf ? Array.from(st.filters._uf.values) : [],
                onSelect: function (uf) { MI.app.toggleCatValue('_uf', uf); }
              }),
              foot: 'Representação esquemática para leitura rápida de concentração. Não é um mapa cartográfico e não usa coordenadas.'
            });
          }),
          U.guarded('geo.concentracao', function () {
            return U.card({
              span: 'c5', title: 'Concentração geográfica',
              sub: 'Quanto a base depende de poucas praças',
              body: [
                U.statline([
                  { k: 'Maior estado', v: real.length ? MI.fmt.pct(conc.top1, 1) : '—' },
                  { k: 'Top 5 estados', v: MI.fmt.pct(conc.top5, 1) },
                  { k: 'Top 10 estados', v: MI.fmt.pct(conc.top10, 1) },
                  { k: 'Estados p/ 80%', v: String(conc.n80) },
                  { k: 'HHI', v: MI.fmt.dec(conc.hhi, 3) }
                ]),
                el('div', { style: 'margin-top:14px' }, U.note(
                  conc.hhi > 0.18 ? 'warn' : null,
                  [
                    el('strong', { text: conc.hhi > 0.25 ? 'Concentração alta. ' : conc.hhi > 0.15 ? 'Concentração moderada. ' : 'Base distribuída. ' }),
                    'O índice Herfindahl-Hirschman de ' + MI.fmt.dec(conc.hhi, 3) + ' indica que ' +
                    (conc.hhi > 0.25 ? 'a operação depende fortemente de poucos estados.'
                      : conc.hhi > 0.15 ? 'há dependência relevante das maiores praças.'
                        : 'nenhum estado isolado domina a base.') +
                    ' ' + conc.n80 + ' de ' + conc.categories + ' estados cobrem 80% dos registros.'
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
                { v: dUf.suppressedGroups + ' estados', masked: true },
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
            titulo: d.length + ' estados com presença registrada',
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
            titulo: faltantes.length + ' estados sem registros no recorte',
            texto: 'Sem presença detectada em: ' + faltantes.join(', ') + '. ' +
              'Isso descreve a base atual; não indica, por si, ausência de mercado.'
          });
        }
        if (conc.hhi > 0.15) {
          leituras.push({
            kind: 'hipotese', tema: 'Expansão',
            titulo: 'Dependência das praças líderes merece atenção comercial',
            texto: 'Com HHI de ' + MI.fmt.dec(conc.hhi, 3) + ' e ' + MI.fmt.pct(conc.top5, 1) +
              ' nos cinco maiores estados, uma oscilação nas praças líderes afeta o resultado agregado. ' +
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
