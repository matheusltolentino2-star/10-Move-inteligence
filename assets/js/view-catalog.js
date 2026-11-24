/* 10 Move Intelligence — Cardápio & Produtos */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, C = MI.catalog;

  /* ---------------- Modal reutilizável ---------------- */
  U.modal = function (o) {
    const box = el('div', { class: 'modal__box' }, [
      el('div', { class: 'modal__head' }, [
        el('h3', { text: o.title }),
        el('button', {
          class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': 'Fechar',
          html: MI.icon('close', 18), onclick: function () { fechar(); }
        })
      ]),
      el('div', { class: 'modal__body' }, o.body),
      o.actions ? el('div', { class: 'modal__foot' }, o.actions) : null
    ]);
    const back = el('div', { class: 'modal', onclick: function (e) { if (e.target === back) fechar(); } }, box);
    function fechar() { if (back.parentNode) back.parentNode.removeChild(back); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') fechar(); }
    document.addEventListener('keydown', esc);
    document.body.appendChild(back);
    return { close: fechar, box: box };
  };

  /* ---------------- Estado da visão ---------------- */
  const S = {
    aba: 'catalogo',
    modo: 'cartoes',
    busca: '',
    categoria: new Set(),
    subcategoria: new Set(),
    tag: new Set(),
    semAlergenico: new Set(),
    precoMin: null, precoMax: null,
    disponivel: null,
    ordem: 'categoria',
    /* importação */
    imp: null,     // {tipo, pendente, items, ignoradas, mapping, headers, rows}
    busy: false, msg: '', prog: 0
  };

  function filtros() {
    return {
      busca: S.busca, categoria: S.categoria, subcategoria: S.subcategoria,
      tag: S.tag, semAlergenico: S.semAlergenico,
      precoMin: S.precoMin, precoMax: S.precoMax, disponivel: S.disponivel
    };
  }

  function podeEditar() { return MI.store.perspective === 'smoov'; }

  /* ================= Cartão de produto ================= */
  function cartao(p) {
    const tags = String(p.tags || '').split(/[,;]/).map(function (t) { return t.trim(); }).filter(Boolean);
    const img = p.imagem
      ? el('img', { src: p.imagem, alt: p.nome, loading: 'lazy' })
      : el('div', { class: 'pcard__ph' }, [
        el('span', { html: MI.icon('grid', 22) }),
        el('span', { text: 'sem imagem' })
      ]);
    return el('article', { class: 'pcard' + (p.disponivel ? '' : ' pcard--off') }, [
      el('div', { class: 'pcard__img' + (p.imagem ? '' : ' pcard__img--vazia') }, [
        img,
        el('div', { class: 'pcard__tagline' }, [
          !p.disponivel ? el('span', { class: 'badge badge--crit', text: 'indisponível' }) : null,
          tags.slice(0, 1).map(function (t) { return el('span', { class: 'badge badge--ok', text: t }); })
        ])
      ]),
      el('div', { class: 'pcard__body' }, [
        el('div', { class: 'pcard__cat', text: p.categoria + (p.subcategoria ? ' · ' + p.subcategoria : '') }),
        el('div', { class: 'pcard__name', text: p.nome }),
        el('div', { class: 'pcard__meta' }, [
          [p.tamanho || null,
          p.proteina != null ? MI.fmt.dec(p.proteina, 0) + ' g de proteína' : null,
          p.kcal != null ? MI.fmt.int(p.kcal) + ' kcal' : null].filter(Boolean).join(' · '),
          p.ingredientes ? el('div', { style: 'margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title: p.ingredientes, text: p.ingredientes }) : null,
          p.alergenicos ? el('div', { style: 'margin-top:4px;color:var(--warn)', text: 'Contém: ' + p.alergenicos }) : null
        ])
      ]),
      el('div', { class: 'pcard__foot' }, [
        el('div', { class: 'pcard__price' }, [
          p.preco != null ? MI.fmt.money(p.preco) : el('small', { text: 'sem preço' }),
          p.sku ? el('small', { style: 'display:block;font-weight:500', text: p.sku }) : null
        ]),
        podeEditar() ? el('div', { class: 'pcard__acts' }, [
          el('button', {
            class: 'icon-btn', title: 'Editar', html: MI.icon('spark', 15),
            onclick: function () { editor(p); }
          }),
          el('button', {
            class: 'icon-btn icon-btn--danger', title: 'Remover', html: MI.icon('trash', 15),
            onclick: function () { confirmarRemocao(p); }
          })
        ]) : null
      ])
    ]);
  }

  /* ================= Editor de produto ================= */
  function campo(label, input, full) {
    return el('div', { class: 'field' + (full ? ' full' : '') }, [
      el('label', { class: 'field__label', text: label }), input
    ]);
  }

  function editor(produto) {
    const novo = !produto;
    const p = produto || {
      nome: '', categoria: '', subcategoria: '', descricao: '', preco: null, tamanho: '',
      ingredientes: '', alergenicos: '', kcal: null, sku: '', disponivel: true, regiao: '',
      tags: '', imagem: null
    };
    const inp = function (k, tipo, extra) {
      const v = p[k];
      return el('input', Object.assign({
        class: 'input', type: tipo || 'text',
        value: v == null ? '' : String(v)
      }, extra || {}));
    };
    const fNome = inp('nome');
    const fCat = inp('categoria');
    const fSub = inp('subcategoria');
    const fTam = inp('tamanho');
    const fPreco = inp('preco', 'number', { step: '0.01', min: '0' });
    const fKcal = inp('kcal', 'number', { step: '1', min: '0' });
    const fSku = inp('sku');
    const fRegiao = inp('regiao');
    const fTags = inp('tags');
    const fAlerg = inp('alergenicos');
    const fIng = el('textarea', { class: 'input', rows: '2' }, p.ingredientes || '');
    const fDesc = el('textarea', { class: 'input', rows: '2' }, p.descricao || '');
    const fDisp = el('input', { type: 'checkbox', checked: p.disponivel !== false });

    let imagemAtual = p.imagem || null;
    const prev = el('div', { class: 'imgpick__prev' },
      imagemAtual ? el('img', { src: imagemAtual, alt: '' }) : el('span', { html: MI.icon('grid', 18) }));
    const fileInput = el('input', {
      type: 'file', accept: 'image/*', style: 'display:none',
      onchange: function (e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        C.lerImagem(f).then(function (dataUri) {
          imagemAtual = dataUri;
          MI.clear(prev).appendChild(el('img', { src: dataUri, alt: '' }));
        }).catch(function (err) { MI.toast(err.message, 'error'); });
      }
    });

    const body = [
      el('div', { class: 'form-grid' }, [
        campo('Nome do produto', fNome, true),
        campo('Categoria', fCat),
        campo('Subcategoria', fSub),
        campo('Preço (R$)', fPreco),
        campo('Tamanho / variação', fTam),
        campo('SKU / código', fSku),
        campo('Calorias (kcal)', fKcal),
        campo('Alergênicos (separados por vírgula)', fAlerg, true),
        campo('Ingredientes', fIng, true),
        campo('Descrição', fDesc, true),
        campo('Características / tags', fTags),
        campo('Unidade / região', fRegiao),
        el('div', { class: 'field full' }, [
          el('label', { class: 'field__label', text: 'Imagem do produto' }),
          el('div', { class: 'imgpick' }, [
            prev,
            el('div', { style: 'display:grid;gap:6px' }, [
              U.btn('Escolher imagem', { sm: true, icon: 'upload', onClick: function () { fileInput.click(); } }),
              imagemAtual ? U.btn('Remover imagem', {
                sm: true, variant: 'ghost', onClick: function () {
                  imagemAtual = null; MI.clear(prev).appendChild(el('span', { html: MI.icon('grid', 18) }));
                }
              }) : null,
              el('span', { class: 'field__hint', text: 'Redimensionada para 420px e guardada neste navegador.' })
            ]),
            fileInput
          ])
        ]),
        el('div', { class: 'field full' }, [
          el('label', { class: 'switch-row' }, [
            el('div', {}, [
              el('div', { class: 'field__label', text: 'Produto disponível' }),
              el('div', { class: 'field__hint', text: 'Itens indisponíveis continuam no catálogo, marcados.' })
            ]),
            el('span', { class: 'switch' }, [fDisp, el('i', {})])
          ])
        ])
      ])
    ];

    const m = U.modal({
      title: novo ? 'Novo produto' : 'Editar produto',
      body: body,
      actions: [
        U.btn(novo ? 'Adicionar ao catálogo' : 'Salvar alterações', {
          variant: 'accent', icon: 'check',
          onClick: function () {
            const nome = fNome.value.trim();
            if (!nome) { MI.toast('O nome do produto é obrigatório.', 'error'); return; }
            const dados = {
              nome: nome,
              categoria: fCat.value.trim() || 'Sem categoria',
              subcategoria: fSub.value.trim(),
              descricao: fDesc.value.trim(),
              preco: fPreco.value === '' ? null : MI.parseNumber(fPreco.value),
              tamanho: fTam.value.trim(),
              ingredientes: fIng.value.trim(),
              alergenicos: fAlerg.value.trim(),
              kcal: fKcal.value === '' ? null : MI.parseNumber(fKcal.value),
              sku: fSku.value.trim(),
              disponivel: fDisp.checked,
              regiao: fRegiao.value.trim(),
              tags: fTags.value.trim(),
              imagem: imagemAtual
            };
            if (novo) { C.add(dados); MI.toast('Produto adicionado.', 'ok'); }
            else { C.update(p.id, dados); MI.toast('Produto atualizado.', 'ok'); }
            m.close();
            MI.tx.relink();
            MI.app.rerender();
          }
        }),
        U.btn('Cancelar', { variant: 'ghost', onClick: function () { m.close(); } })
      ]
    });
  }

  function confirmarRemocao(p) {
    const m = U.modal({
      title: 'Remover produto',
      body: U.note('warn', [
        el('strong', { text: 'Remover “' + p.nome + '” do catálogo? ' }),
        'As transações que apontavam para ele deixam de ter correspondência e passam a contar como “não encontrado”.'
      ]),
      actions: [
        U.btn('Remover', {
          variant: 'danger', icon: 'trash', onClick: function () {
            C.remove(p.id); MI.tx.relink(); m.close();
            MI.toast('Produto removido.', 'ok'); MI.app.rerender();
          }
        }),
        U.btn('Cancelar', { variant: 'ghost', onClick: function () { m.close(); } })
      ]
    });
  }

  /* ================= Importação ================= */
  function aceitarItems(items, origem, fileName) {
    if (!items.length) { MI.toast('Nenhum produto reconhecido no arquivo.', 'error'); return; }
    C.setItems(items, origem, fileName);
    MI.tx.relink();
    MI.privacy.log('importou catálogo', (fileName || origem) + ' · ' + items.length + ' produtos');
    S.imp = null; S.aba = 'catalogo';
    MI.toast(MI.fmt.int(items.length) + ' produtos carregados no catálogo.', 'ok');
    MI.app.rerender();
  }

  function tratarArquivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    S.busy = true; S.prog = 0.1; S.msg = 'Abrindo ' + file.name + '…';
    MI.app.rerender();

    if (ext === 'pdf') {
      C.lerPdf(file, function (p, m) { S.prog = p; S.msg = m; atualizarProgresso(); })
        .then(function (res) {
          const r = C.interpretarPdf(res.linhas);
          S.busy = false;
          S.imp = { tipo: 'pdf', fileName: file.name, items: r.produtos, ignoradas: r.ignoradas, paginas: res.numPages };
          MI.app.rerender();
        })
        .catch(function (err) { S.busy = false; MI.toast(err.message, 'error'); MI.app.rerender(); });
      return;
    }

    MI.importer.readFile(file, function (p, m) { S.prog = p; S.msg = m; atualizarProgresso(); })
      .then(function (res) {
        const ex = MI.importer.extractSheet(res, res.sheets[0].name);
        const mapping = C.inferirMapeamento(ex.headers);
        S.busy = false;
        S.imp = {
          tipo: 'planilha', fileName: file.name, headers: ex.headers, rows: ex.rows,
          mapping: mapping, items: C.construirDeLinhas(ex.rows, mapping, file.name)
        };
        MI.app.rerender();
      })
      .catch(function (err) { S.busy = false; MI.toast(err.message, 'error'); MI.app.rerender(); });
  }

  function atualizarProgresso() {
    const bar = MI.$('#cat-bar'), lbl = MI.$('#cat-msg');
    if (bar) bar.style.width = Math.round(S.prog * 100) + '%';
    if (lbl) lbl.textContent = S.msg;
  }

  /* ================= Abas ================= */
  function abas(host) {
    const itens = [
      { id: 'catalogo', label: 'Catálogo', icon: 'grid', n: C.items.length },
      { id: 'importar', label: 'Importar cardápio', icon: 'upload', smoov: true },
      { id: 'qualidade', label: 'Qualidade e cobertura', icon: 'check' }
    ].filter(function (t) { return !(t.smoov && !podeEditar()); });
    host.appendChild(el('div', { class: 'tabs' }, itens.map(function (t) {
      return el('button', {
        class: 'tab' + (S.aba === t.id ? ' is-on' : ''), type: 'button',
        onclick: function () { S.aba = t.id; MI.app.rerender(); }
      }, [
        el('span', { html: MI.icon(t.icon, 15) }), t.label,
        t.n != null ? el('span', { class: 'tab__n', text: MI.fmt.int(t.n) }) : null
      ]);
    })));
  }

  /* ================= Visão ================= */
  MI.views.catalog = {
    title: 'Cardápio & Produtos',
    subtitle: 'Catálogo da Smoov: cadastro, importação e consulta',
    icon: 'grid',

    render: function (root) {
      /* aviso de origem do catálogo */
      if (C.isOficial && C.isOficial()) {
        root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('ok', [
          el('strong', { text: 'Cardápio oficial da Smoov. ' }),
          C.items.length + ' itens transcritos do cardápio enviado em 23/11/2026 — nomes, categorias, ' +
          'preços por tamanho, ingredientes e gramas de proteína vêm da própria peça.'
        ])));
        root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('warn', [
          el('strong', { text: 'Três ressalvas sobre a transcrição. ' }),
          '1) Os selos por produto (sem lactose, sem glúten, sem açúcar, vegano) ficaram em branco: a legenda ' +
          'existe no rodapé da peça, mas na resolução recebida não dá para atribuir cada ícone ao produto certo, ' +
          'e errar um selo desses é risco alimentar. ' +
          '2) O campo de alergênicos foi deduzido da lista de ingredientes, não é a declaração oficial da Smoov. ' +
          '3) Nenhum item declara calorias, então esse campo está vazio — não foi estimado.'
        ])));
        if (MI.SMOOV_REGRAS) {
          root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note(null, [
            el('strong', { text: 'Regras de montagem declaradas no cardápio: ' }),
            MI.SMOOV_REGRAS.join(' ')
          ])));
        }
      } else if (C.isDemo()) {
        root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('warn', [
          el('strong', { text: 'Catálogo demonstrativo. ' }),
          'Os ' + C.items.length + ' produtos abaixo não são da Smoov.'
        ])));
      } else {
        root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('ok', [
          el('strong', { text: 'Catálogo carregado. ' }),
          C.items.length + ' produtos de ' + (C.fileName ? '“' + C.fileName + '”' : 'cadastro manual') +
          (C.loadedAt ? ' · ' + MI.fmt.date(C.loadedAt) : '') +
          '. Guardado neste navegador, sem envio para servidor.'
        ])));
      }

      if (MI.idb.indisponivel()) {
        root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('warn', [
          el('strong', { text: 'Este navegador não permitiu armazenamento local. ' }),
          'O catálogo funciona normalmente nesta sessão, mas alterações e importações ' +
          'não sobrevivem a um recarregamento da página. Costuma acontecer em janela anônima ' +
          'ou com cookies e dados de site bloqueados.'
        ])));
      }

      abas(root);

      if (S.aba === 'catalogo') return renderCatalogo(root);
      if (S.aba === 'importar') return renderImportar(root);
      return renderQualidade(root);
    }
  };

  /* ---------------- Aba: catálogo ---------------- */
  function renderCatalogo(root) {
    const lista = C.filtrar(filtros());
    const cats = C.categorias();
    const tags = C.tagsDisponiveis();
    const alerg = C.alergenicosDisponiveis();
    const faixa = C.faixaPreco();

    const busca = el('input', {
      class: 'input pbar__search', type: 'search', placeholder: 'Buscar por nome, ingrediente, SKU…',
      value: S.busca, id: 'cat-busca'
    });
    busca.addEventListener('input', function () {
      S.busca = busca.value;
      const alvo = MI.$('#cat-resultado');
      if (alvo) { MI.clear(alvo); desenharLista(alvo, C.filtrar(filtros())); }
      const cnt = MI.$('#cat-count');
      if (cnt) cnt.textContent = MI.fmt.int(C.filtrar(filtros()).length) + ' de ' + MI.fmt.int(C.items.length) + ' produtos';
    });

    const chip = function (label, ativo, onClick, n) {
      return el('button', {
        class: 'chip' + (ativo ? ' is-on' : ''), type: 'button', onclick: onClick
      }, [label, n != null ? el('small', { style: 'color:var(--faint)', text: ' ' + n }) : null]);
    };

    const barra = el('div', { class: 'pbar' }, [
      busca,
      el('div', { style: 'display:flex;gap:6px' }, [
        chip('Cartões', S.modo === 'cartoes', function () { S.modo = 'cartoes'; MI.app.rerender(); }),
        chip('Tabela', S.modo === 'tabela', function () { S.modo = 'tabela'; MI.app.rerender(); })
      ]),
      el('span', { id: 'cat-count', class: 'field__hint', style: 'margin-left:auto' },
        MI.fmt.int(lista.length) + ' de ' + MI.fmt.int(C.items.length) + ' produtos'),
      podeEditar() ? U.btn('Novo produto', { sm: true, variant: 'accent', icon: 'upload', onClick: function () { editor(null); } }) : null
    ]);
    root.appendChild(barra);

    /* filtros */
    const filtrosBox = el('div', { class: 'grid', style: 'margin-bottom:14px' }, U.card({
      span: 'c12', title: 'Filtros do catálogo',
      sub: 'Combine categoria, características, alergênicos, preço e disponibilidade',
      body: el('div', { style: 'display:grid;gap:12px' }, [
        el('div', {}, [
          el('div', { class: 'field__label', style: 'margin-bottom:6px', text: 'Categoria' }),
          el('div', { class: 'opts' }, cats.map(function (c) {
            const n = C.items.filter(function (p) { return p.categoria === c; }).length;
            return chip(c, S.categoria.has(c), function () {
              if (S.categoria.has(c)) S.categoria.delete(c); else S.categoria.add(c);
              S.subcategoria.clear();
              MI.app.rerender();
            }, n);
          }))
        ]),
        S.categoria.size ? el('div', {}, [
          el('div', { class: 'field__label', style: 'margin-bottom:6px', text: 'Subcategoria' }),
          el('div', { class: 'opts' }, MI.uniq([].concat.apply([], Array.from(S.categoria).map(function (c) { return C.subcategorias(c); })))
            .filter(Boolean).map(function (sc) {
              return chip(sc, S.subcategoria.has(sc), function () {
                if (S.subcategoria.has(sc)) S.subcategoria.delete(sc); else S.subcategoria.add(sc);
                MI.app.rerender();
              });
            }))
        ]) : null,
        tags.length ? el('div', {}, [
          el('div', { class: 'field__label', style: 'margin-bottom:6px', text: 'Características' }),
          el('div', { class: 'opts' }, tags.map(function (t) {
            return chip(t, S.tag.has(t), function () {
              if (S.tag.has(t)) S.tag.delete(t); else S.tag.add(t);
              MI.app.rerender();
            });
          }))
        ]) : null,
        alerg.length ? el('div', {}, [
          el('div', { class: 'field__label', style: 'margin-bottom:6px' }, [
            'Excluir produtos que contenham',
            el('small', { text: ' — útil para campanhas com restrição alimentar' })
          ]),
          el('div', { class: 'opts' }, alerg.map(function (a) {
            return chip(a, S.semAlergenico.has(a), function () {
              if (S.semAlergenico.has(a)) S.semAlergenico.delete(a); else S.semAlergenico.add(a);
              MI.app.rerender();
            });
          }))
        ]) : null,
        el('div', { style: 'display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end' }, [
          el('div', { class: 'field', style: 'max-width:300px;flex:1 1 220px' }, [
            el('label', { class: 'field__label', text: 'Faixa de preço (R$)' }),
            (function () {
              const lo = el('input', { class: 'input', type: 'number', step: '0.5', value: S.precoMin != null ? String(S.precoMin) : String(faixa[0]) });
              const hi = el('input', { class: 'input', type: 'number', step: '0.5', value: S.precoMax != null ? String(S.precoMax) : String(faixa[1]) });
              const upd = function () {
                const a = MI.parseNumber(lo.value), b = MI.parseNumber(hi.value);
                S.precoMin = (a == null || a <= faixa[0]) ? null : a;
                S.precoMax = (b == null || b >= faixa[1]) ? null : b;
                MI.app.rerender();
              };
              lo.addEventListener('change', upd); hi.addEventListener('change', upd);
              return el('div', { class: 'range-row' }, [lo, el('span', { text: 'até' }), hi]);
            })()
          ]),
          el('div', {}, [
            el('div', { class: 'field__label', style: 'margin-bottom:6px', text: 'Disponibilidade' }),
            el('div', { style: 'display:flex;gap:6px' }, [
              chip('Todos', S.disponivel === null, function () { S.disponivel = null; MI.app.rerender(); }),
              chip('Disponíveis', S.disponivel === true, function () { S.disponivel = true; MI.app.rerender(); }),
              chip('Indisponíveis', S.disponivel === false, function () { S.disponivel = false; MI.app.rerender(); })
            ])
          ]),
          (S.categoria.size || S.tag.size || S.semAlergenico.size || S.subcategoria.size || S.precoMin != null || S.precoMax != null || S.disponivel !== null)
            ? U.btn('Limpar filtros', {
              sm: true, variant: 'ghost', onClick: function () {
                S.categoria.clear(); S.subcategoria.clear(); S.tag.clear(); S.semAlergenico.clear();
                S.precoMin = null; S.precoMax = null; S.disponivel = null; MI.app.rerender();
              }
            }) : null
        ])
      ])
    }));
    root.appendChild(filtrosBox);

    const resultado = el('div', { id: 'cat-resultado' });
    desenharLista(resultado, lista);
    root.appendChild(resultado);
  }

  function desenharLista(host, lista) {
    if (!lista.length) {
      host.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', body: U.empty('Nenhum produto encontrado', 'Ajuste a busca ou os filtros do catálogo.')
      })));
      return;
    }
    if (S.modo === 'cartoes') {
      const ordenada = lista.slice().sort(function (a, b) {
        if (a.categoria === b.categoria) return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
        return String(a.categoria).localeCompare(String(b.categoria), 'pt-BR');
      });
      host.appendChild(el('div', { class: 'pgrid' }, ordenada.map(cartao)));
      return;
    }
    const headers = [
      { label: 'Produto' }, { label: 'Categoria' }, { label: 'Subcategoria' }, { label: 'Tamanho' },
      { label: 'Preço', num: true }, { label: 'Proteína (g)', num: true }, { label: 'SKU' },
      { label: 'Ingredientes' }, { label: 'Alergênicos (derivado)' }, { label: 'Disponível' }
    ];
    if (podeEditar()) headers.push({ label: '' });
    host.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      body: U.table(headers, lista.map(function (p) {
        const cells = [
          { v: p.nome }, { v: p.categoria }, { v: p.subcategoria || '—' }, { v: p.tamanho || '—' },
          { v: p.preco != null ? MI.fmt.money(p.preco) : '—', num: true },
          { v: p.proteina != null ? MI.fmt.dec(p.proteina, 0) : '—', num: true },
          { v: p.sku || '—' },
          { v: p.ingredientes || '—', title: p.ingredientes },
          { v: p.alergenicos || '—' },
          { v: el('span', { class: 'badge badge--' + (p.disponivel ? 'ok' : 'crit'), text: p.disponivel ? 'sim' : 'não' }) }
        ];
        if (podeEditar()) {
          cells.push({
            v: el('div', { style: 'display:flex;gap:4px' }, [
              el('button', { class: 'icon-btn', title: 'Editar', html: MI.icon('spark', 14), onclick: function () { editor(p); } }),
              el('button', { class: 'icon-btn icon-btn--danger', title: 'Remover', html: MI.icon('trash', 14), onclick: function () { confirmarRemocao(p); } })
            ])
          });
        }
        return { cells: cells };
      }))
    })));
  }

  /* ---------------- Aba: importar ---------------- */
  function renderImportar(root) {
    if (S.busy) {
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', title: 'Processando',
        body: [
          el('div', { class: 'boot__bar', style: 'background:var(--surface-3)' },
            el('i', { id: 'cat-bar', style: 'width:' + Math.round(S.prog * 100) + '%;background:var(--accent)' })),
          el('p', { id: 'cat-msg', class: 'field__hint', style: 'margin-top:10px', text: S.msg })
        ]
      })));
      return;
    }

    if (S.imp) return renderRevisao(root);

    const input = el('input', {
      type: 'file', accept: '.xlsx,.xlsm,.xls,.csv,.tsv,.pdf', style: 'display:none',
      onchange: function (e) { if (e.target.files && e.target.files[0]) tratarArquivo(e.target.files[0]); }
    });
    const drop = el('div', { class: 'drop' }, [
      el('div', { class: 'drop__icon', html: MI.icon('upload', 32) }),
      el('h3', { text: 'Arraste o cardápio aqui' }),
      el('p', { text: 'Planilha (.xlsx, .xls, .csv) ou PDF do cardápio. A plataforma detecta as colunas da planilha ou extrai os itens com preço do PDF, e mostra tudo para você conferir antes de aplicar.' }),
      U.btn('Selecionar arquivo', { variant: 'accent', icon: 'upload', onClick: function () { input.click(); } }),
      input
    ]);
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) tratarArquivo(f);
    });

    const urlInput = el('input', { class: 'input', type: 'url', placeholder: 'https://…' });
    const textArea = el('textarea', { class: 'input', rows: '7', placeholder: 'Cole aqui o texto do cardápio, uma linha por item.\nExemplo:\nSMOOTHIES\nVerde Leve 300ml  R$ 18,90' });

    root.appendChild(el('div', { class: 'grid' }, [
      U.card({ span: 'c7', title: 'Arquivo do cardápio', body: drop }),
      U.card({
        span: 'c5', title: 'Cadastro manual',
        sub: 'Para catálogos pequenos ou ajustes pontuais',
        body: [
          U.btn('Cadastrar produto', { variant: 'accent', icon: 'upload', onClick: function () { editor(null); } }),
          el('div', { style: 'margin-top:12px' }, U.note(null, [
            'Produtos cadastrados aqui entram no mesmo catálogo e ficam disponíveis para a correspondência com transações.'
          ])),
          !C.isDemo() ? el('div', { style: 'margin-top:12px' },
            U.btn('Voltar ao catálogo demonstrativo', {
              variant: 'ghost', icon: 'refresh', onClick: function () {
                C.reset(); MI.tx.relink(); MI.toast('Catálogo demonstrativo restaurado.', 'ok'); MI.app.rerender();
              }
            })) : null
        ]
      })
    ]));

    root.appendChild(U.section('Cardápio por URL ou texto', 'Quando o cardápio está publicado em uma página'));
    root.appendChild(el('div', { class: 'grid' }, [
      U.card({
        span: 'c6', title: 'URL oficial do cardápio',
        sub: 'Tentativa de leitura direta pelo navegador',
        body: [
          urlInput,
          el('div', { style: 'margin-top:10px' }, U.btn('Tentar ler a URL', {
            icon: 'eye', onClick: function () {
              const u = urlInput.value.trim();
              if (!u) { MI.toast('Informe a URL do cardápio.', 'error'); return; }
              S.busy = true; S.prog = 0.3; S.msg = 'Tentando ler ' + u + '…';
              MI.app.rerender();
              fetch(u, { mode: 'cors' })
                .then(function (r) {
                  if (!r.ok) throw new Error('A página respondeu ' + r.status + '.');
                  return r.text();
                })
                .then(function (html) {
                  const div = document.createElement('div');
                  div.innerHTML = String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
                  const texto = (div.textContent || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
                  const r = C.interpretarPdf(texto.map(function (t, i) { return { pagina: 1, texto: t }; }));
                  S.busy = false;
                  S.imp = { tipo: 'url', fileName: u, items: r.produtos, ignoradas: r.ignoradas };
                  MI.app.rerender();
                })
                .catch(function (err) {
                  S.busy = false;
                  MI.app.rerender();
                  MI.toast('Não foi possível ler a URL pelo navegador: ' + (err.message || err), 'error');
                });
            }
          })),
          el('div', { style: 'margin-top:12px' }, U.note('warn', [
            el('strong', { text: 'Limitação real do navegador. ' }),
            'Por segurança, o navegador só consegue ler páginas de outros domínios se o site autorizar explicitamente (CORS). ' +
            'A maioria dos sites de cardápio não autoriza, e a leitura falha. ' +
            'Nesse caso use o campo ao lado colando o texto, ou exporte o cardápio em PDF ou planilha. ' +
            'Leitura confiável de qualquer URL exige um serviço no servidor, que esta versão não possui.'
          ]))
        ]
      }),
      U.card({
        span: 'c6', title: 'Colar texto do cardápio',
        sub: 'Funciona sempre — copie da página ou do PDF e cole aqui',
        body: [
          textArea,
          el('div', { style: 'margin-top:10px' }, U.btn('Interpretar texto', {
            variant: 'accent', icon: 'spark', onClick: function () {
              const linhas = textArea.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
              if (!linhas.length) { MI.toast('Cole o texto do cardápio primeiro.', 'error'); return; }
              const r = C.interpretarPdf(linhas.map(function (t) { return { pagina: 1, texto: t }; }));
              if (!r.produtos.length) {
                MI.toast('Nenhum item com preço foi reconhecido. Cada linha precisa terminar com um preço, por exemplo “Verde Leve 300ml R$ 18,90”.', 'error');
                return;
              }
              S.imp = { tipo: 'texto', fileName: 'texto colado', items: r.produtos, ignoradas: r.ignoradas };
              MI.app.rerender();
            }
          })),
          el('div', { style: 'margin-top:12px' }, U.note(null, [
            el('strong', { text: 'Como é interpretado. ' }),
            'Linhas que terminam com um preço viram produtos; linhas curtas em caixa alta viram categorias. ' +
            'Nada é inventado: o que não tiver preço reconhecível fica de fora e aparece na lista de linhas ignoradas.'
          ]))
        ]
      })
    ]));
  }

  /* ---------------- Revisão da importação ---------------- */
  function renderRevisao(root) {
    const imp = S.imp;

    if (imp.tipo === 'planilha') {
      root.appendChild(U.section('Mapeamento das colunas', imp.fileName + ' · ' + MI.fmt.int(imp.rows.length) + ' linhas', [
        U.btn('Aplicar catálogo', {
          variant: 'accent', icon: 'check',
          onClick: function () { aceitarItems(imp.items, 'import', imp.fileName); }
        }),
        U.btn('Cancelar', { variant: 'ghost', onClick: function () { S.imp = null; MI.app.rerender(); } })
      ]));

      const linhas = C.CAMPOS.map(function (campo) {
        const sel = el('select', { class: 'input' }, [el('option', { value: '' }, '— não usar —')].concat(
          imp.headers.map(function (h) {
            return el('option', { value: h, selected: imp.mapping[campo.key] === h }, MI.prettyLabel(h));
          })
        ));
        sel.addEventListener('change', function () {
          Object.keys(imp.mapping).forEach(function (k) {
            if (k !== campo.key && imp.mapping[k] === sel.value) delete imp.mapping[k];
          });
          if (sel.value) imp.mapping[campo.key] = sel.value; else delete imp.mapping[campo.key];
          imp.items = C.construirDeLinhas(imp.rows, imp.mapping, imp.fileName);
          MI.app.rerender();
        });
        const col = imp.mapping[campo.key];
        const amostra = col ? imp.rows.slice(0, 3).map(function (r) { return r[col]; }).filter(function (v) { return v !== '' && v != null; }).join(' · ') : '';
        return el('div', { class: 'map-row' }, [
          el('div', { class: 'map-row__col' }, [
            el('b', { text: campo.label }),
            el('small', { text: campo.key === 'nome' ? 'obrigatório' : 'opcional' })
          ]),
          el('div', { class: 'map-row__col' }, [
            el('small', { title: amostra, text: amostra || '—' })
          ]),
          el('div', { class: 'map-row__col' }, sel)
        ]);
      });

      root.appendChild(el('div', { class: 'grid' }, [
        U.kpi({ span: 'c4', label: 'Produtos reconhecidos', value: MI.fmt.int(imp.items.length), icon: 'grid', accent: true, hint: imp.items.length < imp.rows.length ? MI.fmt.int(imp.rows.length - imp.items.length) + ' linhas sem nome de produto foram descartadas' : 'Todas as linhas tinham nome' }),
        U.kpi({ span: 'c4', label: 'Com preço', value: MI.fmt.pctOf(imp.items.filter(function (p) { return p.preco != null; }).length, imp.items.length || 1, 1), icon: 'spark' }),
        U.kpi({ span: 'c4', label: 'Categorias distintas', value: String(MI.uniq(imp.items.map(function (p) { return p.categoria; })).length), icon: 'grid' })
      ]));

      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', title: 'Qual coluna é cada campo',
        body: [
          el('div', { class: 'map-row', style: 'background:var(--surface-2);font-weight:600;color:var(--faint);font-size:11px;letter-spacing:.04em;text-transform:uppercase' }, [
            el('div', { text: 'Campo do produto' }), el('div', { text: 'Amostra' }), el('div', { text: 'Coluna da planilha' })
          ]),
          el('div', { style: 'border:1px solid var(--border);border-radius:var(--radius-sm);max-height:460px;overflow-y:auto' }, linhas)
        ]
      })));
    } else {
      /* PDF, URL ou texto */
      const origem = imp.tipo === 'pdf' ? 'PDF' : imp.tipo === 'url' ? 'página' : 'texto colado';
      root.appendChild(U.section('Itens extraídos do ' + origem, imp.fileName + (imp.paginas ? ' · ' + imp.paginas + ' páginas' : ''), [
        U.btn('Aplicar catálogo', {
          variant: 'accent', icon: 'check',
          onClick: function () { aceitarItems(imp.items, 'import', imp.fileName); }
        }),
        U.btn('Cancelar', { variant: 'ghost', onClick: function () { S.imp = null; MI.app.rerender(); } })
      ]));

      root.appendChild(el('div', { class: 'grid' }, [
        U.kpi({ span: 'c4', label: 'Itens com preço reconhecido', value: MI.fmt.int(imp.items.length), icon: 'grid', accent: true }),
        U.kpi({ span: 'c4', label: 'Categorias identificadas', value: String(MI.uniq(imp.items.map(function (p) { return p.categoria; })).length), icon: 'grid', hint: 'Linhas em caixa alta sem preço viraram categoria' }),
        U.kpi({ span: 'c4', label: 'Linhas ignoradas', value: MI.fmt.int(imp.ignoradas.length), icon: 'alert', hint: 'Sem preço identificável — listadas abaixo' })
      ]));

      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', title: 'Produtos que serão criados',
        sub: 'Revise antes de aplicar. Você pode editar qualquer item depois.',
        body: imp.items.length
          ? U.table(
            [{ label: 'Produto' }, { label: 'Categoria' }, { label: 'Tamanho' }, { label: 'Preço', num: true }, { label: 'Linha de origem' }],
            imp.items.slice(0, 120).map(function (p) {
              return {
                cells: [
                  { v: p.nome }, { v: p.categoria }, { v: p.tamanho || '—' },
                  { v: MI.fmt.money(p.preco), num: true },
                  { v: p.textoOrigem || '—', title: p.textoOrigem }
                ]
              };
            })
          )
          : U.empty('Nenhum item com preço foi reconhecido',
            'O extrator procura linhas que terminam com um preço. Se o cardápio usa colunas ou layout gráfico, exporte em planilha ou cole o texto manualmente.')
      })));

      if (imp.ignoradas.length) {
        root.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', title: 'Linhas ignoradas',
          sub: 'Nada aqui virou produto — mostramos para você conferir se algo importante ficou de fora',
          body: U.table(
            [{ label: 'Página' }, { label: 'Texto' }, { label: 'Motivo' }],
            imp.ignoradas.slice(0, 60).map(function (i) {
              return { cells: [{ v: i.pagina }, { v: i.texto }, { v: i.motivo }] };
            })
          ),
          foot: imp.ignoradas.length > 60 ? 'Exibindo 60 de ' + MI.fmt.int(imp.ignoradas.length) + ' linhas ignoradas.' : null
        })));
      }
    }
  }

  /* ---------------- Aba: qualidade ---------------- */
  function renderQualidade(root) {
    const comp = C.completude();
    const cats = MI.mapToSorted(MI.countBy(C.items, 'categoria'));
    const precos = C.items.map(function (p) { return p.preco; }).filter(function (v) { return v != null && !isNaN(v); });
    const indisponiveis = C.items.filter(function (p) { return !p.disponivel; });

    /* SKUs duplicados */
    const skuMap = new Map();
    C.items.forEach(function (p) {
      if (!p.sku) return;
      const k = MI.slug(p.sku);
      skuMap.set(k, (skuMap.get(k) || 0) + 1);
    });
    const dupSku = Array.from(skuMap.values()).filter(function (n) { return n > 1; }).length;
    const semSku = C.items.filter(function (p) { return !p.sku; }).length;

    root.appendChild(el('div', { class: 'grid' }, [
      U.kpi({ span: 'c3', accent: true, label: 'Produtos no catálogo', value: MI.fmt.int(C.items.length), icon: 'grid', hint: cats.length + ' categorias' }),
      U.kpi({ span: 'c3', label: 'Com preço', value: MI.fmt.pctOf(precos.length, C.items.length || 1, 1), icon: 'spark', hint: precos.length ? 'de ' + MI.fmt.money(Math.min.apply(null, precos)) + ' a ' + MI.fmt.money(Math.max.apply(null, precos)) : '' }),
      U.kpi({ span: 'c3', label: 'Disponíveis', value: MI.fmt.pctOf(C.items.length - indisponiveis.length, C.items.length || 1, 1), icon: 'check', hint: indisponiveis.length + ' marcados como indisponíveis' }),
      U.kpi({ span: 'c3', label: 'SKU utilizável', value: MI.fmt.pctOf(C.items.length - semSku, C.items.length || 1, 1), icon: 'database', hint: dupSku ? dupSku + ' SKU(s) repetido(s) — prejudica a correspondência' : 'Sem SKUs repetidos' })
    ]));

    root.appendChild(U.section('Completude dos campos', 'O que falta preencher para liberar análises mais finas'));
    root.appendChild(el('div', { class: 'grid' }, [
      U.card({
        span: 'c6', title: 'Preenchimento por campo',
        body: U.bars(comp.map(function (c) { return { label: c.campo, value: c.preenchidos }; }),
          { total: C.items.length, monochrome: true, max: C.items.length })
      }),
      U.card({
        span: 'c6', title: 'O que cada campo libera',
        body: el('div', { class: 'findings' }, [
          nota(comp, 'preco', 'Preço', 'Ticket médio por categoria, curva de preço e análise de receita por produto.'),
          nota(comp, 'categoria', 'Categoria', 'Toda a Inteligência de Consumo por categoria e os cruzamentos de segmentação.'),
          nota(comp, 'sku', 'SKU', 'Correspondência exata com as transações. Sem SKU, a ligação depende do nome do produto.'),
          nota(comp, 'alergenicos', 'Alergênicos', 'Filtros de restrição alimentar e seleção de produtos para campanhas específicas.'),
          nota(comp, 'kcal', 'Informação nutricional', 'Agrupamento por perfil nutricional. Só preencha com dado verificável do fabricante.'),
          nota(comp, 'imagem', 'Imagem', 'Catálogo visual e material de apoio para campanhas.')
        ])
      })
    ]));

    if (cats.length) {
      root.appendChild(U.section('Preço por categoria', 'Distribuição do catálogo carregado'));
      const porCat = cats.map(function (c) {
        const itens = C.items.filter(function (p) { return p.categoria === c.label && p.preco != null; });
        const v = itens.map(function (p) { return p.preco; }).sort(function (a, b) { return a - b; });
        return {
          label: c.label, n: c.value, comPreco: v.length,
          min: v.length ? v[0] : null, max: v.length ? v[v.length - 1] : null,
          media: v.length ? MI.sum(v) / v.length : null,
          mediana: v.length ? v[Math.floor(v.length / 2)] : null
        };
      });
      root.appendChild(el('div', { class: 'grid' }, [
        U.chartCard({
          title: 'Preço médio por categoria', span: 'c6', height: 'md',
          render: function (cv) {
            return MI.charts.bar(cv, porCat.filter(function (c) { return c.media != null; })
              .map(function (c) { return { label: c.label, value: c.media }; }),
              { horizontal: true, multicolor: true, valueFmt: MI.fmt.money });
          }
        }),
        U.card({
          span: 'c6', title: 'Tabela de preços por categoria',
          body: U.table(
            [{ label: 'Categoria' }, { label: 'Produtos', num: true }, { label: 'Mínimo', num: true }, { label: 'Mediana', num: true }, { label: 'Média', num: true }, { label: 'Máximo', num: true }],
            porCat.map(function (c) {
              return {
                cells: [
                  { v: c.label }, { v: MI.fmt.int(c.n), num: true },
                  { v: c.min != null ? MI.fmt.money(c.min) : '—', num: true },
                  { v: c.mediana != null ? MI.fmt.money(c.mediana) : '—', num: true },
                  { v: c.media != null ? MI.fmt.money(c.media) : '—', num: true },
                  { v: c.max != null ? MI.fmt.money(c.max) : '—', num: true }
                ]
              };
            })
          )
        })
      ]));
    }

    /* cobertura pelas transações */
    if (MI.tx.has()) {
      const l = MI.tx.link;
      root.appendChild(U.section('Cobertura pelas transações', 'Quanto do que foi vendido encontra correspondência no catálogo'));
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12',
        body: [
          U.statline([
            { k: 'Itens de pedido', v: MI.fmt.int(l.itens) },
            { k: 'Casados com o catálogo', v: MI.fmt.pct(l.taxaProduto, 1) },
            { k: 'Sem correspondência', v: MI.fmt.int(l.semCatalogo) },
            { k: 'Nomes distintos sem correspondência', v: MI.fmt.int(l.naoEncontradosTotal) }
          ]),
          l.naoEncontrados.length ? el('div', { style: 'margin-top:14px' }, [
            el('div', { class: 'field__label', style: 'margin-bottom:8px', text: 'Produtos vendidos que não existem no catálogo' }),
            U.table([{ label: 'Nome na transação' }, { label: 'Itens', num: true }],
              l.naoEncontrados.slice(0, 20).map(function (e) {
                return { cells: [{ v: e.label }, { v: MI.fmt.int(e.value), num: true }] };
              }))
          ]) : el('div', { style: 'margin-top:14px' }, U.note('ok', 'Todos os itens vendidos têm correspondência no catálogo.'))
        ]
      })));
    }
  }

  function nota(comp, chave, titulo, texto) {
    const c = comp.filter(function (x) { return x.chave === chave; })[0];
    const pct = c ? c.pct : 0;
    const nivel = pct >= 0.9 ? 'ok' : pct >= 0.4 ? 'warn' : 'crit';
    return el('article', { class: 'finding', style: 'border-left-color:var(--' + (nivel === 'ok' ? 'ok' : nivel === 'warn' ? 'warn' : 'crit') + ')' }, [
      el('div', { class: 'finding__top' }, [
        el('span', { class: 'badge badge--' + nivel, text: MI.fmt.pct(pct, 0) + ' preenchido' }),
        el('span', { class: 'finding__tema', text: titulo })
      ]),
      el('p', { text: texto })
    ]);
  }

})(window.MI);
