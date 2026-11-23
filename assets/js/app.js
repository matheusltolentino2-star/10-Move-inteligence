/* 10 Move Intelligence — casca da aplicação, navegação e filtros globais */
window.MI = window.MI || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, st = MI.store;

  const NAV = [
    {
      group: 'Clientes', items: [
        { id: 'overview', label: 'Visão geral', icon: 'dashboard' },
        { id: 'profile', label: 'Perfil dos clientes', icon: 'users' },
        { id: 'geography', label: 'Inteligência geográfica', icon: 'map' },
        { id: 'behavior', label: 'Comportamento', icon: 'clock' },
        { id: 'segmentation', label: 'Segmentação', icon: 'filter' }
      ]
    },
    {
      group: 'Produtos e consumo', items: [
        { id: 'catalog', label: 'Cardápio & Produtos', icon: 'grid' },
        { id: 'consumption', label: 'Inteligência de Consumo', icon: 'spark' },
        { id: 'opportunities', label: 'Oportunidades Comerciais', icon: 'target' }
      ]
    },
    {
      group: 'Entrega e governança', items: [
        { id: 'reports', label: 'Relatórios', icon: 'report' },
        { id: 'settings', label: 'Configurações e Acessos', icon: 'shield' }
      ]
    }
  ];
  const VALID = {};
  NAV.forEach(function (g) { g.items.forEach(function (i) { VALID[i.id] = i; }); });

  const app = {
    current: 'overview',
    panelOpen: false,

    /* ---------------- Inicialização ---------------- */
    boot: function () {
      const msg = MI.$('#boot-msg'), bar = MI.$('#boot-bar');
      const step = function (p, t) {
        if (bar) bar.style.width = Math.round(p * 100) + '%';
        if (msg) msg.textContent = t;
      };

      step(0.15, 'Preparando a plataforma…');
      setTimeout(function () {
        step(0.35, 'Gerando base demonstrativa de 80 mil clientes…');
        setTimeout(function () {
          let ds;
          try {
            ds = app.buildDemo();
          } catch (e) {
            step(1, 'Falha ao gerar a base demonstrativa.');
            console.error(e);
            MI.$('#boot-msg').textContent = 'Falha ao gerar a base demonstrativa: ' + (e.message || e);
            return;
          }
          step(0.6, 'Detectando colunas e tipos de dado…');
          setTimeout(function () {
            st.setDataset(ds);
            step(0.72, 'Carregando o catálogo de produtos…');
            MI.catalog.load().then(function () {
              step(0.82, 'Gerando base transacional demonstrativa…');
              setTimeout(function () {
                try { MI.tx.gerarDemo(120000); } catch (e) { console.error('Falha ao gerar transações demo:', e); }
                step(0.94, 'Montando painéis…');
                setTimeout(function () {
                  MI.$('#boot').hidden = true;
                  MI.$('#app').hidden = false;
                  app.mount();
                  step(1, '');
                }, 50);
              }, 40);
            });
          }, 40);
        }, 40);
      }, 60);
    },

    buildDemo: function () {
      const gen = MI.gerarBaseDemo(80000, 20261123);
      const schema = MI.inferSchema(gen.headers, gen.rows);
      return {
        name: 'Base demonstrativa Smoov (sintética)',
        source: 'demo',
        fileName: null,
        rows: gen.rows,
        headers: gen.headers,
        columns: schema.columns,
        roles: schema.roles,
        createdAt: new Date()
      };
    },

    loadDemo: function () {
      st.setDataset(app.buildDemo());
      app.rerender();
    },

    /* ---------------- Montagem ---------------- */
    mount: function () {
      app.renderNav();
      app.bindShell();

      /* Autenticação real: ativa só quando existir config.js com as chaves.
         Sem ela o módulo não faz nada e a aplicação segue local. */
      if (MI.auth) {
        MI.auth.init().then(function (a) {
          if (a.enabled) { app.renderNav(); app.renderView(); }
        });
      }

      st.on('filters', function () { app.renderFilterBar(); app.renderView(); app.renderNav(); });
      st.on('dataset', function () { app.renderFilterBar(); app.renderNav(); app.closePanel(); });
      st.on('perspective', function () { app.renderNav(); app.renderView(); });
      st.on('privacy', function () { app.renderView(); });
      st.on('approvals', function () { app.renderNav(); });

      /* troca de tema do sistema redesenha os gráficos com as novas cores */
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { app.renderView(); });
      } catch (e) { }

      const hash = (location.hash || '').replace('#', '');
      app.current = VALID[hash] ? hash : 'overview';

      window.addEventListener('hashchange', function () {
        const h = (location.hash || '').replace('#', '');
        if (VALID[h] && h !== app.current) { app.current = h; app.renderNav(); app.renderView(); }
      });

      app.renderFilterBar();
      app.renderView();
    },

    bindShell: function () {
      MI.$('#burger').addEventListener('click', function () {
        MI.$('#sidebar').classList.toggle('is-open');
        MI.$('#backdrop').classList.toggle('is-open');
      });
      MI.$('#backdrop').addEventListener('click', function () {
        MI.$('#sidebar').classList.remove('is-open');
        app.closePanel();
      });
      MI.$('#btn-filters').addEventListener('click', function () { app.openFilters(); });
      MI.$('#panel-close').addEventListener('click', function () { app.closePanel(); });
      MI.$('#panel-clear').addEventListener('click', function () {
        st.clearFilters();
        app.buildPanel();
        MI.toast('Filtros removidos.', 'ok');
      });
      MI.$('#panel-done').addEventListener('click', function () { app.closePanel(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { app.closePanel(); MI.$('#sidebar').classList.remove('is-open'); }
      });
      MI.$$('.persp__btn').forEach(function (b) {
        b.addEventListener('click', function () {
          if (MI.auth && MI.auth.perfilTravado()) {
            MI.toast('Com autenticação ativa, o perfil vem do servidor e não pode ser trocado aqui.', 'info');
            return;
          }
          st.setPerspective(b.dataset.persp);
          const msg = {
            smoov: 'Perfil Administrador Smoov: área privada, acesso completo.',
            tenmove: 'Perfil Equipe 10 Move: somente indicadores aprovados.',
            tech: 'Perfil Administrador técnico: sem registros individuais, supressão sempre ativa.'
          };
          MI.toast(msg[st.perspective] || '', 'info');
        });
      });
    },

    /* ---------------- Navegação ---------------- */
    go: function (id) {
      if (!VALID[id]) return;
      app.current = id;
      try { location.hash = id; } catch (e) { }
      MI.$('#sidebar').classList.remove('is-open');
      MI.$('#backdrop').classList.remove('is-open');
      app.renderNav();
      app.renderView();
      window.scrollTo({ top: 0, behavior: 'auto' });
    },

    rerender: function () { app.renderNav(); app.renderFilterBar(); app.renderView(); },

    renderNav: function () {
      const host = MI.clear(MI.$('#nav'));
      const nFilters = st.activeFilterCount();
      NAV.forEach(function (g) {
        const items = g.items.filter(function (i) { return !(i.smoovOnly && st.isTenMove()); });
        if (!items.length) return;
        host.appendChild(el('div', { class: 'nav__group', text: g.group }));
        items.forEach(function (i) {
          host.appendChild(el('button', {
            class: 'nav__item' + (app.current === i.id ? ' is-active' : ''), type: 'button',
            onclick: function () { app.go(i.id); }
          }, [
            el('span', { html: MI.icon(i.icon, 18) }),
            el('span', { text: i.label }),
            i.id === 'segmentation' && nFilters ? el('span', { class: 'nav__badge', text: String(nFilters) }) : null,
            i.id === 'catalog' ? el('span', { class: 'nav__badge', text: MI.fmt.int(MI.catalog.items.length) }) : null,
            i.id === 'consumption' && MI.tx.has() ? el('span', { class: 'nav__badge', text: MI.fmt.compact(MI.tx.link.itens) }) : null,
            i.id === 'settings' && !st.isTenMove() ? el('span', { class: 'nav__badge', text: MI.privacy.approvedCount() + '/' + MI.privacy.INDICATORS.length }) : null
          ]));
        });
      });

      MI.$$('.persp__btn').forEach(function (b) {
        b.classList.toggle('is-on', b.dataset.persp === st.perspective);
      });
      MI.$('#persp-note').textContent = st.isTenMove()
        ? MI.privacy.approvedCount() + ' de ' + MI.privacy.INDICATORS.length + ' indicadores liberados pela Smoov.'
        : st.isTech()
          ? 'Sem acesso a registros individuais. Supressão sempre ativa.'
          : 'Acesso completo à base carregada neste navegador.';

      const ds = st.dataset;
      MI.$('#ds-name').textContent = ds ? ds.name : '—';
      MI.$('#ds-meta').textContent = ds ? MI.fmt.int(ds.rows.length) + ' registros · ' + ds.columns.length + ' colunas' : '';
      MI.$('#sidebar-demo').textContent = ds && ds.source === 'demo'
        ? 'Dados demonstrativos sintéticos. Importe a planilha da Smoov para analisar a base real.'
        : 'Base importada. Processamento local, nenhum envio externo.';
    },

    renderView: function () {
      const v = MI.views[app.current];
      const host = MI.$('#view');
      MI.charts.destroyAll();
      MI.clear(host);
      MI.$('#title').textContent = v ? v.title : '';
      MI.$('#subtitle').textContent = v ? v.subtitle : '';
      document.title = (v ? v.title + ' · ' : '') + '10 Move Intelligence';
      if (!v) { host.appendChild(U.empty('Seção não encontrada')); return; }

      /* Em bases grandes o cálculo leva alguns instantes: mostra um esqueleto
         antes de travar a thread, para a navegação não parecer congelada. */
      if (st.rows.length > 20000) {
        host.appendChild(el('div', { class: 'grid', id: 'view-skeleton' }, [
          el('div', { class: 'card c3 skeleton', style: 'height:104px;border:0' }),
          el('div', { class: 'card c3 skeleton', style: 'height:104px;border:0' }),
          el('div', { class: 'card c3 skeleton', style: 'height:104px;border:0' }),
          el('div', { class: 'card c3 skeleton', style: 'height:104px;border:0' }),
          el('div', { class: 'card c8 skeleton', style: 'height:280px;border:0' }),
          el('div', { class: 'card c4 skeleton', style: 'height:280px;border:0' })
        ]));
        const token = ++app._renderToken;
        setTimeout(function () {
          if (token !== app._renderToken) return;
          MI.clear(host);
          app._paint(v, host);
        }, 16);
        return;
      }
      app._paint(v, host);
    },

    _renderToken: 0,

    _paint: function (v, host) {
      /* Com autenticação configurada, nenhuma seção abre sem sessão válida. */
      if (MI.auth && MI.auth.enabled && !MI.auth.autenticado()) {
        if (MI.auth.erro) {
          host.appendChild(el('div', { class: 'grid', style: 'margin-bottom:14px' }, U.card({
            span: 'c12', body: U.note('crit', [
              el('strong', { text: 'Falha na autenticação. ' }), MI.auth.erro
            ])
          })));
        }
        MI.auth.renderGate(host);
        U.flush();
        return;
      }
      try {
        v.render(host);
        U.flush();
      } catch (e) {
        console.error(e);
        host.appendChild(U.card({
          span: 'c12', title: 'Erro ao montar esta seção',
          body: [
            U.note('crit', [el('strong', { text: 'Algo falhou ao calcular os indicadores desta seção. ' }), String(e.message || e)]),
            el('div', { style: 'margin-top:12px' }, U.btn('Voltar para a visão geral', { variant: 'primary', onClick: function () { app.go('overview'); } }))
          ]
        }));
      }
    },

    /* ---------------- Barra de filtros ---------------- */
    renderFilterBar: function () {
      const host = MI.clear(MI.$('#filterbar'));
      const chips = app.filterChips();
      host.appendChild(el('span', { class: 'filterbar__label', text: 'Recorte' }));
      if (!chips.length) {
        host.appendChild(el('button', {
          class: 'chip chip--ghost', type: 'button', onclick: function () { app.openFilters(); }
        }, [el('span', { html: MI.icon('filter', 14) }), 'Base completa — adicionar filtro']));
      } else {
        chips.forEach(function (c) { host.appendChild(c); });
        host.appendChild(el('button', {
          class: 'chip chip--ghost', type: 'button', onclick: function () { app.openFilters(); }
        }, [el('span', { html: MI.icon('filter', 14) }), 'Mais filtros']));
        host.appendChild(el('button', {
          class: 'chip chip--ghost', type: 'button', onclick: function () { st.clearFilters(); MI.toast('Filtros removidos.', 'ok'); }
        }, 'Limpar tudo'));
      }
      host.appendChild(el('span', { class: 'filterbar__count' }, [
        el('strong', { text: MI.fmt.int(st.rows.length) }),
        ' de ' + MI.fmt.int(st.dataset ? st.dataset.rows.length : 0) + ' registros',
        st.dataset && st.rows.length !== st.dataset.rows.length
          ? ' · ' + MI.fmt.pctOf(st.rows.length, st.dataset.rows.length, 1) : ''
      ]));
    },

    filterChips: function () {
      const fields = {};
      st.filterFields().forEach(function (f) { fields[f.id] = f; });
      return Object.keys(st.filters).map(function (id) {
        const f = st.filters[id];
        const meta = fields[id] || { label: id.replace('col:', '') };
        let txt = meta.label + ': ';
        if (f.kind === 'cat') {
          const vals = Array.from(f.values);
          txt += vals.length <= 3 ? vals.join(', ') : vals.length + ' selecionados';
        } else if (f.kind === 'range') {
          txt += (meta.money ? MI.fmt.money(f.min) : MI.fmt.dec(f.min, 0)) + ' a ' +
            (meta.money ? MI.fmt.money(f.max) : MI.fmt.dec(f.max, 0));
        } else if (f.kind === 'daterange') {
          txt += (f.from ? MI.fmt.date(f.from) : '…') + ' a ' + (f.to ? MI.fmt.date(f.to) : '…');
        }
        return el('span', { class: 'chip is-on' }, [
          el('button', {
            style: 'border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:0',
            title: 'Editar este filtro', onclick: function () { app.openFilters(id); }
          }, txt),
          el('button', {
            class: 'chip__x', title: 'Remover filtro', html: MI.icon('close', 13),
            onclick: function () { st.setFilter(id, null); }
          })
        ]);
      });
    },

    filterSummary: function () {
      const n = st.activeFilterCount();
      if (!n) return 'base completa, sem filtros';
      const fields = {};
      st.filterFields().forEach(function (f) { fields[f.id] = f; });
      return Object.keys(st.filters).map(function (id) {
        const f = st.filters[id], meta = fields[id] || { label: id };
        if (f.kind === 'cat') {
          const vals = Array.from(f.values);
          return meta.label + ' = ' + (vals.length <= 4 ? vals.join('/') : vals.length + ' valores');
        }
        if (f.kind === 'range') return meta.label + ' entre ' + MI.fmt.dec(f.min, 0) + ' e ' + MI.fmt.dec(f.max, 0);
        if (f.kind === 'daterange') return meta.label + ' de ' + (f.from ? MI.fmt.date(f.from) : '…') + ' a ' + (f.to ? MI.fmt.date(f.to) : '…');
        return meta.label;
      }).join('; ');
    },

    toggleCatValue: function (fieldId, value) {
      const cur = st.filters[fieldId];
      const set = cur && cur.kind === 'cat' ? new Set(cur.values) : new Set();
      if (set.has(value)) set.delete(value); else set.add(value);
      st.setFilter(fieldId, set.size ? { kind: 'cat', values: set } : null);
    },

    /* ---------------- Painel de filtros ---------------- */
    openFilters: function (focusId) {
      app.panelOpen = true;
      MI.$('#panel').classList.add('is-open');
      MI.$('#backdrop').classList.add('is-open');
      app.buildPanel(focusId);
    },
    closePanel: function () {
      app.panelOpen = false;
      MI.$('#panel').classList.remove('is-open');
      MI.$('#backdrop').classList.remove('is-open');
      MI.$('#sidebar').classList.remove('is-open');
    },

    buildPanel: function (focusId) {
      const host = MI.clear(MI.$('#panel-body'));
      const fields = st.filterFields();
      if (!fields.length) {
        host.appendChild(U.empty('Nenhuma dimensão filtrável', 'A base ativa não tem colunas reconhecidas como dimensão ou medida.'));
        return;
      }

      host.appendChild(U.note(null, [
        el('strong', { text: 'Os filtros valem para toda a plataforma. ' }),
        'Gráficos, tabelas, mapas e relatórios usam o mesmo recorte.'
      ]));

      let debounce = null;
      const apply = function (id, filter) {
        if (filter) st.filters[id] = filter; else delete st.filters[id];
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          st.applyFilters();
          st.emit('filters', st.filters);
        }, 220);
      };

      fields.forEach(function (f) {
        const current = st.filters[f.id];
        const box = el('div', { class: 'field' });
        box.appendChild(el('label', { class: 'field__label' }, [
          f.label,
          current ? el('span', { class: 'badge badge--ok', text: 'ativo' }) : null
        ]));

        if (f.kind === 'cat') {
          const counts = MI.countBy(st.dataset.rows, f.raw || f.id);
          const selected = current && current.kind === 'cat' ? new Set(current.values) : new Set();
          const opts = el('div', { class: 'opts' });
          const render = function (filtro) {
            MI.clear(opts);
            const lista = f.options.filter(function (o) {
              return !filtro || MI.slug(o).indexOf(MI.slug(filtro)) >= 0;
            }).slice(0, 120);
            lista.forEach(function (o) {
              const n = f.id === '_dow' ? countDow(st.dataset.rows, o) : (counts.get(o) || 0);
              const lab = el('label', { class: 'opt' }, [
                el('input', {
                  type: 'checkbox', checked: selected.has(o),
                  onchange: function (e) {
                    if (e.target.checked) selected.add(o); else selected.delete(o);
                    apply(f.id, selected.size ? { kind: 'cat', values: new Set(selected), raw: f.raw } : null);
                    lab.classList.toggle('is-on', e.target.checked);
                  }
                }),
                o, el('small', { text: MI.fmt.compact(n) })
              ]);
              opts.appendChild(lab);
            });
            if (!lista.length) opts.appendChild(el('span', { class: 'field__hint', text: 'Nenhuma opção corresponde à busca.' }));
          };
          if (f.searchable || f.options.length > 20) {
            const search = el('input', { class: 'input', type: 'search', placeholder: 'Buscar em ' + f.options.length + ' opções…' });
            search.addEventListener('input', function () { render(search.value); });
            box.appendChild(search);
          }
          render('');
          box.appendChild(opts);
          if (f.options.length > 120) box.appendChild(el('span', { class: 'field__hint', text: 'Exibindo as 120 opções mais frequentes. Use a busca para encontrar as demais.' }));

        } else if (f.kind === 'range') {
          const lo = el('input', { class: 'input', type: 'number', value: String(current ? current.min : f.min), min: String(f.min), max: String(f.max), step: f.integer ? '1' : 'any' });
          const hi = el('input', { class: 'input', type: 'number', value: String(current ? current.max : f.max), min: String(f.min), max: String(f.max), step: f.integer ? '1' : 'any' });
          const upd = function () {
            const a = MI.parseNumber(lo.value), b = MI.parseNumber(hi.value);
            if (a == null || b == null) return;
            const min = Math.min(a, b), max = Math.max(a, b);
            apply(f.id, (min <= f.min && max >= f.max) ? null : { kind: 'range', min: min, max: max, raw: f.raw });
          };
          lo.addEventListener('change', upd); hi.addEventListener('change', upd);
          box.appendChild(el('div', { class: 'range-row' }, [lo, el('span', { text: 'até' }), hi]));
          box.appendChild(el('span', { class: 'field__hint', text: 'Faixa na base: ' + MI.fmt.dec(f.min, 0) + ' a ' + MI.fmt.dec(f.max, 0) }));

        } else if (f.kind === 'daterange') {
          const lo = el('input', { class: 'input', type: 'date', value: MI.fmt.dateIso(current && current.from ? current.from : f.min) });
          const hi = el('input', { class: 'input', type: 'date', value: MI.fmt.dateIso(current && current.to ? current.to : f.max) });
          const upd = function () {
            const a = lo.value ? MI.parseDate(lo.value) : null, b = hi.value ? MI.parseDate(hi.value) : null;
            const igualBase = (!a || (f.min && a <= f.min)) && (!b || (f.max && b >= f.max));
            apply(f.id, igualBase ? null : { kind: 'daterange', from: a, to: b, raw: f.raw });
          };
          lo.addEventListener('change', upd); hi.addEventListener('change', upd);
          box.appendChild(el('div', { class: 'range-row' }, [lo, el('span', { text: 'até' }), hi]));
          box.appendChild(el('span', { class: 'field__hint', text: 'Período na base: ' + MI.fmt.date(f.min) + ' a ' + MI.fmt.date(f.max) }));
        }

        host.appendChild(box);
        if (focusId === f.id) setTimeout(function () { box.scrollIntoView({ block: 'center' }); }, 60);
      });
    }
  };

  function countDow(rows, nome) {
    const i = MI.DIAS_SEMANA.indexOf(nome);
    let n = 0;
    for (let k = 0; k < rows.length; k++) if (rows[k]._dow === i) n++;
    return n;
  }

  MI.app = app;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', app.boot);
  else app.boot();

})(window.MI);
