/* 10 Move Intelligence — Segmentação
   Compara o recorte filtrado (segmento) contra a base inteira. */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, S = MI.stats;

  function savedSegments() { return MI.storage.get('segments', []); }
  function saveSegments(list) { MI.storage.set('segments', list); }

  /* Serializa os filtros ativos para poder salvar e reaplicar */
  function serializeFilters(filters) {
    const out = {};
    Object.keys(filters).forEach(function (id) {
      const f = filters[id];
      if (f.kind === 'cat') out[id] = { kind: 'cat', values: Array.from(f.values), raw: f.raw || null };
      else if (f.kind === 'range') out[id] = { kind: 'range', min: f.min, max: f.max, raw: f.raw || null };
      else if (f.kind === 'daterange') out[id] = { kind: 'daterange', from: f.from ? f.from.toISOString() : null, to: f.to ? f.to.toISOString() : null, raw: f.raw || null };
    });
    return out;
  }
  function deserializeFilters(obj) {
    const out = {};
    Object.keys(obj || {}).forEach(function (id) {
      const f = obj[id];
      if (f.kind === 'cat') out[id] = { kind: 'cat', values: new Set(f.values), raw: f.raw || undefined };
      else if (f.kind === 'range') out[id] = { kind: 'range', min: f.min, max: f.max, raw: f.raw || undefined };
      else if (f.kind === 'daterange') out[id] = { kind: 'daterange', from: f.from ? new Date(f.from) : null, to: f.to ? new Date(f.to) : null, raw: f.raw || undefined };
    });
    return out;
  }

  MI.views.segmentation = {
    title: 'Segmentação',
    subtitle: 'Construa e compare recortes da base',
    icon: 'filter',

    render: function (root) {
      const st = MI.store, ds = st.dataset;
      const seg = st.rows, base = ds.rows;
      const notice = U.demoNotice();
      if (notice) root.appendChild(el('div', { style: 'margin-bottom:14px' }, notice));

      const isFiltered = st.activeFilterCount() > 0;

      /* ---------- Construtor ---------- */
      root.appendChild(U.section('Segmento atual', isFiltered
        ? 'Comparado contra a base inteira'
        : 'Nenhum filtro ativo — aplique filtros para criar um segmento'));

      const chips = MI.app.filterChips();
      root.appendChild(el('div', { class: 'grid' }, [
        U.card({
          span: 'c8', title: isFiltered ? 'Definição do segmento' : 'Como criar um segmento',
          tools: [
            U.btn('Adicionar filtro', { sm: true, icon: 'filter', variant: 'accent', onClick: function () { MI.app.openFilters(); } }),
            isFiltered ? U.btn('Limpar', { sm: true, variant: 'ghost', onClick: function () { st.clearFilters(); } }) : null
          ].filter(Boolean),
          body: isFiltered
            ? [
              el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, chips),
              el('div', { style: 'margin-top:16px' }, U.statline([
                { k: 'Registros no segmento', v: MI.fmt.int(seg.length) },
                { k: 'Participação na base', v: MI.fmt.pctOf(seg.length, base.length, 2) },
                { k: 'Base total', v: MI.fmt.int(base.length) },
                { k: 'Filtros ativos', v: String(st.activeFilterCount()) }
              ]))
            ]
            : U.empty('Nenhum filtro aplicado',
              'Use “Adicionar filtro” para combinar idade, gênero, cidade, estado, período, plano, canal e qualquer outra dimensão detectada na base. Os gráficos de toda a plataforma seguem o recorte.')
        }),
        U.card({
          span: 'c4', title: 'Segmentos salvos', sub: 'Guardados neste navegador',
          tools: [isFiltered ? U.btn('Salvar atual', {
            sm: true, icon: 'check', onClick: function () {
              const nome = prompt('Nome do segmento:', sugerirNome(st.filters));
              if (nome == null) return;
              const name = String(nome).trim();
              if (!name) return;
              const list = savedSegments();
              list.unshift({ nome: name, filtros: serializeFilters(st.filters), n: seg.length, criado: new Date().toISOString() });
              saveSegments(list.slice(0, 30));
              MI.toast('Segmento “' + name + '” salvo.', 'ok');
              MI.app.rerender();
            }
          }) : null].filter(Boolean),
          body: (function () {
            const list = savedSegments();
            if (!list.length) return U.empty('Nenhum segmento salvo', 'Aplique filtros e use “Salvar atual” para reutilizar o recorte depois.');
            return el('div', { class: 'rank' }, list.map(function (s, i) {
              return el('div', { class: 'rank__row', style: 'grid-template-columns:1fr auto auto' }, [
                el('button', {
                  class: 'rank__name', style: 'border:0;background:transparent;text-align:left;cursor:pointer;color:inherit;font:inherit',
                  title: 'Aplicar este segmento',
                  onclick: function () {
                    st.filters = deserializeFilters(s.filtros);
                    st.applyFilters(); st.emit('filters', st.filters);
                    MI.toast('Segmento “' + s.nome + '” aplicado.', 'ok');
                  }
                }, [s.nome, el('small', { text: ' · ' + MI.fmt.int(s.n) + ' reg.' })]),
                el('span', {}),
                el('button', {
                  class: 'chip__x', title: 'Remover', html: MI.icon('trash', 15),
                  onclick: function () {
                    const l = savedSegments(); l.splice(i, 1); saveSegments(l); MI.app.rerender();
                  }
                })
              ]);
            }));
          })()
        })
      ]));

      if (!seg.length) {
        root.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', body: U.empty('O segmento atual não tem registros', 'Afrouxe algum filtro para voltar a ter dados comparáveis.')
        })));
        return;
      }

      /* ---------- Comparação de métricas ---------- */
      const metricas = [
        { id: '_idade', label: 'Idade média', fmt: function (v) { return MI.fmt.dec(v, 1) + ' anos'; } },
        { id: '_valor', label: 'Ticket médio', fmt: MI.fmt.money },
        { id: '_freq', label: 'Frequência média', fmt: function (v) { return MI.fmt.dec(v, 2); } },
        { id: '_recencia', label: 'Recência média', fmt: function (v) { return MI.fmt.dec(v, 0) + ' dias'; } },
        { id: '_receita', label: 'Receita média', fmt: MI.fmt.money },
        { id: '_satisfacao', label: 'Satisfação média', fmt: function (v) { return MI.fmt.dec(v, 2); } },
        { id: '_duracao', label: 'Duração média', fmt: function (v) { return MI.fmt.dec(v, 1); } }
      ].filter(function (m) { return st.has(m.id); });

      if (isFiltered && metricas.length) {
        root.appendChild(U.section('Segmento × base', 'Diferença das médias entre o recorte e a base inteira'));
        const headers = [
          { label: 'Métrica' }, { label: 'Segmento', num: true }, { label: 'Base', num: true },
          { label: 'Diferença', num: true }, { label: 'Índice', num: true }
        ];
        const tRows = metricas.map(function (m) {
          const a = S.numStats(seg, m.id), b = S.numStats(base, m.id);
          if (!a || !b) return null;
          const diff = a.mean - b.mean;
          const idx = b.mean ? (a.mean / b.mean) * 100 : null;
          const badge = idx == null ? null : el('span', {
            class: 'badge ' + (idx >= 110 ? 'badge--ok' : idx <= 90 ? 'badge--crit' : ''),
            text: MI.fmt.int(idx)
          });
          return {
            cells: [
              { v: m.label }, { v: m.fmt(a.mean) }, { v: m.fmt(b.mean) },
              { v: (diff >= 0 ? '+' : '') + m.fmt(diff), num: true },
              { v: badge || '—', num: true }
            ]
          };
        }).filter(Boolean);
        root.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', body: [
            U.table(headers, tRows),
            el('div', { style: 'margin-top:12px' }, U.note(null, [
              el('strong', { text: 'Índice. ' }),
              '100 significa idêntico à base. 130 significa 30% acima da média da base; 70 significa 30% abaixo.'
            ]))
          ]
        })));
      }

      /* ---------- Índices de afinidade ---------- */
      const dims = [
        { id: '_faixa', label: 'Faixa de idade' }, { id: '_genero', label: 'Gênero' },
        { id: '_uf', label: 'Estado' }, { id: '_regiao', label: 'Região' }, { id: '_cidade', label: 'Cidade' },
        { id: '_plano', label: 'Plano' }, { id: '_canal', label: 'Canal' },
        { id: '_status', label: 'Status' }, { id: '_dispositivo', label: 'Dispositivo' }
      ].filter(function (d) { return st.has(d.id); });

      if (isFiltered && dims.length) {
        root.appendChild(U.section('Afinidade do segmento', 'Onde este recorte é mais e menos concentrado que a base', [
          el('span', { class: 'badge badge--info', text: 'Índice 100 = igual à base' })
        ]));
        root.appendChild(el('div', { class: 'grid' }, dims.map(function (d) {
          const aff = S.affinity(seg, base, d.id, { minCount: Math.max(10, Math.round(MI.privacy.k / 2)) });
          if (!aff.length) return null;
          const top = aff.slice(0, 5);
          const bottom = aff.slice(-3).reverse().filter(function (e) { return top.indexOf(e) < 0; });
          const maxIdx = Math.max.apply(null, aff.map(function (e) { return e.index; }));
          const mkRows = function (list) {
            return list.map(function (e) {
              return el('div', { class: 'bar' }, [
                el('span', { class: 'bar__label', title: e.label }, e.label),
                el('span', { class: 'bar__track' }, el('span', {
                  class: 'bar__fill',
                  style: 'width:' + Math.max(2, (e.index / Math.max(140, maxIdx)) * 100) + '%;background:' +
                    (e.index >= 115 ? 'var(--ok)' : e.index <= 85 ? 'var(--crit)' : 'var(--c1)')
                })),
                el('span', { class: 'bar__val' }, [
                  el('b', { text: MI.fmt.int(e.index) }),
                  ' · ' + MI.fmt.pct(e.segShare, 1) + ' vs ' + MI.fmt.pct(e.baseShare, 1)
                ])
              ]);
            });
          };
          return U.card({
            span: 'c6', title: 'Afinidade por ' + d.label.toLowerCase(),
            sub: aff.length + ' categorias com volume suficiente no segmento',
            body: [
              el('div', { class: 'bars' }, mkRows(top)),
              bottom.length ? el('div', { style: 'margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)' }, [
                el('div', { class: 'field__hint', style: 'margin-bottom:8px' }, 'Menor afinidade'),
                el('div', { class: 'bars' }, mkRows(bottom))
              ]) : null
            ]
          });
        }).filter(Boolean)));
      }

      /* ---------- Distribuições do segmento ---------- */
      root.appendChild(U.section(isFiltered ? 'Composição do segmento' : 'Composição da base',
        'Distribuições calculadas apenas sobre os ' + MI.fmt.int(seg.length) + ' registros do recorte'));
      root.appendChild(el('div', { class: 'grid' }, dims.map(function (d) {
        const dist = MI.privacy.guardDist(S.dist(seg, d.id, { limit: 8 }));
        if (!dist.length) return null;
        return U.card({
          span: 'c4', title: d.label,
          sub: dist.missing ? MI.fmt.pctOf(dist.missing, seg.length, 1) + ' sem valor' : null,
          body: U.bars(dist, { compact: true })
        });
      }).filter(Boolean)));

      /* ---------- Comparação entre dois segmentos salvos ---------- */
      compararSegmentos(root, metricas);
    }
  };

  /* ================= Comparação A × B ================= */
  const cmp = { a: null, b: null };

  function aplicarFiltrosEm(rows, serial) {
    const f = deserializeFilters(serial);
    const ids = Object.keys(f);
    if (!ids.length) return rows;
    return rows.filter(function (r) {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i], flt = f[id], campo = flt.raw || id;
        if (flt.kind === 'cat') {
          if (id === '_dow') {
            const nums = new Set(Array.from(flt.values, function (v) { return typeof v === 'number' ? v : MI.DIAS_SEMANA.indexOf(v); }));
            if (!nums.has(r._dow)) return false;
          } else if (!flt.values.has(r[campo])) return false;
        } else if (flt.kind === 'range') {
          const v = r[campo];
          if (v == null || v < flt.min || v > flt.max) return false;
        } else if (flt.kind === 'daterange') {
          const v = r[campo];
          if (!v) return false;
          if (flt.from && v < flt.from) return false;
          if (flt.to && v.getTime() > flt.to.getTime() + 86399999) return false;
        }
      }
      return true;
    });
  }

  function compararSegmentos(root, metricas) {
    const lista = savedSegments();
    const st = MI.store, base = st.dataset.rows;

    root.appendChild(U.section('Comparar dois segmentos', 'Coloque dois recortes lado a lado e veja a diferença percentual'));

    if (lista.length < 2) {
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12',
        body: U.empty('Salve pelo menos dois segmentos para comparar',
          'Aplique filtros, use “Salvar atual” e repita com outro recorte. A comparação mostra indicadores, composição e diferença percentual entre os dois.')
      })));
      return;
    }

    if (!cmp.a || !lista.some(function (s) { return s.nome === cmp.a; })) cmp.a = lista[0].nome;
    if (!cmp.b || !lista.some(function (s) { return s.nome === cmp.b; }) || cmp.b === cmp.a) {
      cmp.b = (lista.filter(function (s) { return s.nome !== cmp.a; })[0] || lista[0]).nome;
    }

    const sel = function (qual) {
      const s = el('select', { class: 'input', style: 'max-width:220px' },
        lista.map(function (x) { return el('option', { value: x.nome, selected: cmp[qual] === x.nome }, x.nome); }));
      s.addEventListener('change', function () { cmp[qual] = s.value; MI.app.rerender(); });
      return s;
    };

    const segA = lista.filter(function (s) { return s.nome === cmp.a; })[0];
    const segB = lista.filter(function (s) { return s.nome === cmp.b; })[0];
    const rowsA = aplicarFiltrosEm(base, segA.filtros);
    const rowsB = aplicarFiltrosEm(base, segB.filtros);

    const delta = function (a, b) {
      if (a == null || b == null || !b) return { txt: '—', cls: 'delta--flat' };
      const d = (a - b) / Math.abs(b);
      return {
        txt: (d >= 0 ? '+' : '') + MI.fmt.pct(d, 1),
        cls: Math.abs(d) < 0.03 ? 'delta--flat' : d > 0 ? 'delta--up' : 'delta--down'
      };
    };

    /* linhas de métrica */
    const linhas = [{
      label: 'Registros', a: rowsA.length, b: rowsB.length,
      fmt: MI.fmt.int
    }];
    metricas.forEach(function (m) {
      const sa = S.numStats(rowsA, m.id), sb = S.numStats(rowsB, m.id);
      if (!sa && !sb) return;
      linhas.push({ label: m.label, a: sa ? sa.mean : null, b: sb ? sb.mean : null, fmt: m.fmt });
    });

    /* mix de categorias quando há transações ligadas */
    let mixA = null, mixB = null;
    if (MI.tx.has() && MI.tx.filtroAplicavel()) {
      const idKey = st.dataset.roles.id;
      const setA = new Set(), setB = new Set();
      rowsA.forEach(function (r) { if (r[idKey] != null) setA.add(String(r[idKey])); });
      rowsB.forEach(function (r) { if (r[idKey] != null) setB.add(String(r[idKey])); });
      const itensA = MI.tx.items.filter(function (i) { return i._cliente && setA.has(i._cliente); });
      const itensB = MI.tx.items.filter(function (i) { return i._cliente && setB.has(i._cliente); });
      if (itensA.length > 30 && itensB.length > 30) {
        mixA = MI.txStats.porDimensao(itensA, '_cat', { por: 'qtd', limit: 7 });
        mixB = MI.txStats.porDimensao(itensB, '_cat', { por: 'qtd', limit: 7 });
      }
    }

    const coluna = function (nome, rows, classe) {
      return el('div', { class: 'cmp__col ' + classe }, [
        el('h4', { text: nome }),
        el('p', { text: MI.fmt.int(rows.length) + ' registros · ' + MI.fmt.pctOf(rows.length, base.length, 2) + ' da base' })
      ]);
    };

    root.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12', title: 'Segmento A × Segmento B',
      tools: [sel('a'), el('span', { style: 'color:var(--faint)' }, '×'), sel('b')],
      body: [
        el('div', { class: 'cmp' }, [
          coluna(segA.nome, rowsA, 'cmp__a'),
          coluna(segB.nome, rowsB, 'cmp__b')
        ]),
        el('div', { style: 'margin-top:16px' }, U.table(
          [{ label: 'Indicador' }, { label: segA.nome, num: true }, { label: segB.nome, num: true }, { label: 'A vs B', num: true }],
          linhas.map(function (l) {
            const d = delta(l.a, l.b);
            return {
              cells: [
                { v: l.label },
                { v: l.a != null ? l.fmt(l.a) : '—', num: true },
                { v: l.b != null ? l.fmt(l.b) : '—', num: true },
                { v: el('span', { class: 'delta ' + d.cls, text: d.txt }), num: true }
              ]
            };
          })
        )),
        (rowsA.length < MI.privacy.k || rowsB.length < MI.privacy.k)
          ? el('div', { style: 'margin-top:12px' }, U.note('warn', [
            el('strong', { text: 'Segmento pequeno. ' }),
            'Um dos recortes tem menos de ' + MI.privacy.k + ' registros. Diferenças calculadas sobre grupos ' +
            'desse tamanho são instáveis e não devem ser compartilhadas.'
          ])) : null,
        mixA && mixB ? el('div', { style: 'margin-top:18px' }, [
          el('div', { class: 'field__label', style: 'margin-bottom:8px', text: 'Mix de categorias consumidas' }),
          U.table(
            [{ label: 'Categoria' }, { label: segA.nome, num: true }, { label: segB.nome, num: true }, { label: 'Diferença', num: true }],
            MI.uniq(mixA.map(function (e) { return e.label; }).concat(mixB.map(function (e) { return e.label; })))
              .map(function (cat) {
                const a = mixA.filter(function (e) { return e.label === cat; })[0];
                const b = mixB.filter(function (e) { return e.label === cat; })[0];
                const pa = a ? a.pctQtd : 0, pb = b ? b.pctQtd : 0;
                const dif = pa - pb;
                return {
                  cells: [
                    { v: cat },
                    { v: MI.fmt.pct(pa, 1), num: true },
                    { v: MI.fmt.pct(pb, 1), num: true },
                    {
                      v: el('span', {
                        class: 'delta ' + (Math.abs(dif) < 0.01 ? 'delta--flat' : dif > 0 ? 'delta--up' : 'delta--down'),
                        text: (dif >= 0 ? '+' : '') + MI.fmt.pct(dif, 1)
                      }), num: true
                    }
                  ]
                };
              })
          )
        ]) : (MI.tx.has() ? el('div', { style: 'margin-top:14px' }, U.note(null,
          'O mix de categorias por segmento exige transações ligadas por identificador de cliente a pelo menos 30 itens em cada recorte.')) : null)
      ]
    })));
  }

  function sugerirNome(filters) {
    const parts = [];
    Object.keys(filters).forEach(function (id) {
      const f = filters[id];
      const d = MI.DERIVED_BY_ID[id];
      const label = d ? d.label : id.replace('col:', '');
      if (f.kind === 'cat') {
        const vals = Array.from(f.values);
        parts.push(vals.length <= 2 ? vals.join('/') : label + ' (' + vals.length + ')');
      } else if (f.kind === 'range') parts.push(label + ' ' + MI.fmt.int(f.min) + '–' + MI.fmt.int(f.max));
      else parts.push(label);
    });
    return parts.slice(0, 3).join(' · ') || 'Segmento';
  }

})(window.MI);
