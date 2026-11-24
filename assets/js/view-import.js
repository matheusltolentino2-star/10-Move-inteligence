/* 10 Move Intelligence — importador de planilhas (clientes e transações)
   Exposto como MI.importUI.render(host, modo) e usado pela seção
   Configurações e Acessos › Fontes de dados. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui;

  const MODOS = {
    clientes: {
      titulo: 'Base de clientes',
      dica: ['cliente', 'customer', 'base', 'cadastro', 'consumidor', 'pessoa', 'contato'],
      descricao: 'Uma linha por cliente, com os atributos disponíveis (idade, gênero, cidade, datas, valores).'
    },
    transacoes: {
      titulo: 'Base de transações',
      dica: ['pedido', 'item', 'venda', 'transac', 'order', 'compra', 'cupom', 'consumo'],
      descricao: 'Uma linha por item de pedido, com produto, data e, se possível, identificador do cliente e do pedido.'
    }
  };

  /* estado por modo */
  const ST = {
    clientes: { pendente: null, aba: null, ex: null, ds: null, quality: null, busy: false, prog: 0, msg: '', semCabecalho: false, headerRow: null },
    transacoes: { pendente: null, aba: null, ex: null, mapping: null, busy: false, prog: 0, msg: '', semCabecalho: false, headerRow: null }
  };

  function reset(modo) {
    const s = ST[modo];
    s.pendente = null; s.aba = null; s.ex = null; s.ds = null; s.quality = null;
    s.mapping = null; s.busy = false; s.semCabecalho = false; s.headerRow = null;
  }

  function progresso(modo) {
    const bar = MI.$('#imp-bar-' + modo), lbl = MI.$('#imp-msg-' + modo);
    if (bar) bar.style.width = Math.round(ST[modo].prog * 100) + '%';
    if (lbl) lbl.textContent = ST[modo].msg;
  }

  /* ================= Carregamento ================= */
  function carregar(modo, file) {
    const s = ST[modo];
    s.busy = true; s.prog = 0.05; s.msg = 'Abrindo ' + file.name + '…';
    MI.app.rerender();

    MI.importer.readFile(file, function (p, m) { s.prog = p; s.msg = m; progresso(modo); })
      .then(function (res) {
        s.pendente = res;
        s.pontuacao = MI.importer.pontuarAbas(res, MODOS[modo].dica);
        s.aba = s.pontuacao.recomendada;
        s.headerRow = null; s.semCabecalho = false;
        return extrair(modo);
      })
      .catch(function (err) {
        s.busy = false;
        MI.toast(err.message || 'Falha ao importar o arquivo.', 'error');
        MI.app.rerender();
      });
  }

  function extrair(modo) {
    const s = ST[modo];
    return new Promise(function (resolve) {
      setTimeout(function () {
        try {
          s.ex = MI.importer.extractSheet(s.pendente, s.aba, {
            headerRow: s.headerRow, semCabecalho: s.semCabecalho
          });
          if (modo === 'clientes') {
            s.ds = MI.importer.buildDataset(s.ex, {
              name: s.pendente.fileName.replace(/\.[^.]+$/, '') +
                (s.pendente.sheets.length > 1 ? ' · ' + s.aba : ''),
              fileName: s.pendente.fileName, fileSize: s.pendente.fileSize, sheetName: s.aba
            });
            s.quality = MI.importer.quality(s.ds);
          } else {
            s.mapping = MI.tx.inferirMapeamento(s.ex.headers);
          }
          s.busy = false;
          MI.app.rerender();
          MI.toast(MI.fmt.int(s.ex.rows.length) + ' linhas e ' + s.ex.headers.length +
            ' colunas lidas da aba “' + s.aba + '”.', 'ok');
        } catch (e) {
          s.busy = false; s.ex = null; s.ds = null; s.quality = null;
          MI.toast(e.message || 'Falha ao ler a aba.', 'error');
          MI.app.rerender();
        }
        resolve();
      }, 30);
    });
  }

  /* ================= Aplicação ================= */
  function aplicarClientes() {
    const s = ST.clientes;
    if (!s.ds) return;
    const ds = s.ds;
    const eraDemo = MI.store.dataset && MI.store.dataset.source === 'demo';
    const txEraDemo = MI.tx.isDemo();
    reset('clientes');
    MI.store.setDataset(ds);
    /* transações demonstrativas apontam para clientes demonstrativos */
    if (txEraDemo) {
      MI.tx.clear();
      MI.toast('As transações demonstrativas foram descartadas: elas apontavam para a base de clientes fictícia.', 'info');
    } else if (MI.tx.has()) {
      MI.tx.relink();
    }
    MI.privacy.log('importou base de clientes', ds.fileName + ' · ' + MI.fmt.int(ds.rows.length) + ' linhas');
    MI.toast('Base “' + ds.name + '” ativa em todos os painéis.', 'ok');
    MI.app.go('overview');
  }

  function aplicarTransacoes() {
    const s = ST.transacoes;
    if (!s.ex) return;
    if (!s.mapping.produto && !s.mapping.sku) {
      MI.toast('Mapeie ao menos a coluna de nome do produto ou de SKU.', 'error');
      return;
    }
    try {
      const link = MI.tx.importarDeLinhas(s.ex.rows, s.ex.headers, s.mapping, s.pendente.fileName, s.ds ? s.ds.columns : null);
      MI.privacy.log('importou base de transações', s.pendente.fileName + ' · ' + MI.fmt.int(link.itens) + ' itens');
      reset('transacoes');
      MI.toast(MI.fmt.int(link.itens) + ' itens de pedido carregados · ' +
        MI.fmt.pct(link.taxaProduto, 0) + ' casados com o catálogo.', 'ok');
      MI.app.go('consumption');
    } catch (e) {
      MI.toast(e.message, 'error');
    }
  }

  /* ================= Blocos de interface ================= */
  function dropzone(modo) {
    const input = el('input', {
      type: 'file', accept: MI.importer.aceita, style: 'display:none',
      onchange: function (e) { if (e.target.files && e.target.files[0]) carregar(modo, e.target.files[0]); }
    });
    const d = el('div', { class: 'drop' }, [
      el('div', { class: 'drop__icon', html: MI.icon('upload', 32) }),
      el('h3', { text: 'Arraste a planilha de ' + (modo === 'clientes' ? 'clientes' : 'transações') }),
      el('p', { text: MODOS[modo].descricao + ' A plataforma escolhe a aba certa, acha a linha de cabeçalho, ignora linhas de contexto e mostra tudo para você conferir.' }),
      U.btn('Selecionar arquivo', { variant: 'accent', icon: 'upload', onClick: function () { input.click(); } }),
      input,
      el('p', { class: 'drop__formats', text: '.xlsx · .xlsm · .xls · .csv · .tsv — até cerca de 250 mil linhas' })
    ]);
    ['dragenter', 'dragover'].forEach(function (ev) {
      d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.remove('is-over'); });
    });
    d.addEventListener('drop', function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) carregar(modo, f);
    });
    return d;
  }

  /* Seletor de aba, com pontuação explicada */
  function seletorAbas(modo) {
    const s = ST[modo];
    if (!s.pendente || s.pendente.sheets.length < 2) return null;
    const abas = s.pontuacao.abas.slice().sort(function (a, b) { return b.score - a.score; });
    const descartadas = abas.filter(function (a) { return a.score < (abas[0].score * 0.02); }).length;
    return U.card({
      span: 'c12',
      title: 'Qual aba contém os dados',
      sub: 'O arquivo tem ' + s.pendente.sheets.length + ' abas. A plataforma classificou cada uma e escolheu a mais provável — troque se precisar.',
      body: [
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, abas.map(function (a) {
          const ativo = a.name === s.aba;
          return el('button', {
            class: 'chip' + (ativo ? ' is-on' : ''), type: 'button',
            disabled: a.linhasDados < 1,
            title: a.motivos.length ? a.motivos.join('; ') : 'Aba com dados tabulares',
            onclick: function () {
              s.aba = a.name; s.headerRow = null; s.semCabecalho = false;
              s.busy = true; MI.app.rerender(); extrair(modo);
            }
          }, [
            a.recomendada ? el('span', { html: MI.icon('check', 13) }) : null,
            a.name,
            el('small', { style: 'color:var(--faint)', text: ' ' + MI.fmt.compact(a.linhasDados) + '×' + a.cols })
          ]);
        })),
        descartadas ? el('div', { style: 'margin-top:12px' }, U.note(null, [
          el('strong', { text: descartadas + ' aba(s) tratada(s) como documentação, não como dados. ' }),
          'Abas chamadas “Leia-me”, “Dicionário”, “Índice” e semelhantes, ou com uma ou duas colunas, ' +
          'costumam explicar a planilha em vez de conter a base. Elas continuam selecionáveis acima.'
        ])) : null
      ]
    });
  }

  /* Controle da linha de cabeçalho e contexto ignorado */
  function blocoCabecalho(modo) {
    const s = ST[modo], ex = s.ex;
    if (!ex) return null;
    const conf = Math.round((ex.confianca || 0) * 100);

    const mover = function (delta) {
      const atual = ex.headerRow || 1;
      s.headerRow = Math.max(1, atual + delta);
      s.semCabecalho = false;
      s.busy = true; MI.app.rerender(); extrair(modo);
    };

    return U.card({
      span: 'c12',
      title: 'Leitura da planilha',
      sub: ex.semCabecalho
        ? 'Nomes de coluna genéricos — a primeira linha está sendo tratada como dado'
        : 'Cabeçalho identificado na linha ' + ex.headerRow + ' com ' + conf + '% de confiança',
      tools: [
        el('span', {
          class: 'badge badge--' + (ex.semCabecalho ? 'warn' : conf >= 70 ? 'ok' : conf >= 45 ? 'warn' : 'crit'),
          text: ex.semCabecalho ? 'sem cabeçalho' : conf + '% de confiança'
        })
      ],
      body: [
        el('div', { style: 'display:flex;gap:9px;flex-wrap:wrap;align-items:center' }, [
          el('span', { class: 'field__label', text: 'Cabeçalho na linha' }),
          U.btn('−', { sm: true, onClick: function () { mover(-1); }, disabled: ex.semCabecalho || (ex.headerRow || 1) <= 1 }),
          el('span', { class: 'badge', style: 'font-size:13px', text: ex.semCabecalho ? '—' : String(ex.headerRow) }),
          U.btn('+', { sm: true, onClick: function () { mover(1); }, disabled: ex.semCabecalho }),
          el('label', { class: 'opt', style: 'margin-left:8px' }, [
            el('input', {
              type: 'checkbox', checked: ex.semCabecalho,
              onchange: function (e) {
                s.semCabecalho = e.target.checked;
                s.headerRow = s.headerRow || 1;
                s.busy = true; MI.app.rerender(); extrair(modo);
              }
            }),
            'A planilha não tem linha de cabeçalho'
          ]),
          el('span', { class: 'field__hint', style: 'margin-left:auto' },
            MI.fmt.int(ex.rows.length) + ' linhas de dados · ' + ex.headers.length + ' colunas' +
            (ex.colunasRemovidas ? ' · ' + ex.colunasRemovidas + ' coluna(s) vazia(s) descartada(s)' : ''))
        ]),

        ex.suspeita ? el('div', { style: 'margin-top:12px' }, U.note('warn', [
          el('strong', { text: 'Confira o cabeçalho. ' }),
          'A linha escolhida não parece um cabeçalho típico — os rótulos têm cara de dado, não de nome de coluna. ' +
          'Use os botões acima para mover a linha, ou marque “a planilha não tem linha de cabeçalho”.'
        ])) : null,

        ex.contexto && ex.contexto.length ? el('div', { style: 'margin-top:14px' }, [
          el('div', { class: 'field__label', style: 'margin-bottom:7px' }, [
            MI.fmt.int(ex.contexto.length) + ' linha(s) de contexto acima do cabeçalho foram ignoradas',
            el('small', { text: ' — título, período, autor e afins não entram na base' })
          ]),
          U.table([{ label: 'Linha' }, { label: 'Conteúdo ignorado' }],
            ex.contexto.slice(0, 8).map(function (c) {
              return { cells: [{ v: 'L' + c.linha }, { v: c.texto }] };
            }))
        ]) : null,

        ex.rodape && ex.rodape.length ? el('div', { style: 'margin-top:12px' }, U.note(null, [
          el('strong', { text: MI.fmt.int(ex.rodape.length) + ' linha(s) de totais descartada(s). ' }),
          'Linhas que começam com “Total”, “Subtotal” ou “Soma” somariam duas vezes nos indicadores.'
        ])) : null,

        el('div', { style: 'margin-top:14px' }, [
          el('div', { class: 'field__label', style: 'margin-bottom:7px', text: 'Primeiras linhas como a plataforma entendeu' }),
          U.table(
            ex.headers.slice(0, 10).map(function (h) { return { label: MI.prettyLabel(h) }; }),
            ex.rows.slice(0, 5).map(function (r) {
              return { cells: ex.headers.slice(0, 10).map(function (h) { return { v: r[h] === '' ? '—' : r[h] }; }) };
            })
          ),
          ex.headers.length > 10 ? el('p', { class: 'field__hint', style: 'margin-top:7px', text: 'Exibindo 10 de ' + ex.headers.length + ' colunas.' }) : null
        ])
      ]
    });
  }

  /* ================= Render principal ================= */
  MI.importUI = {
    render: function (host, modo) {
      const s = ST[modo];

      if (MI.store.perspective !== 'smoov') {
        host.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', title: 'Importação restrita ao administrador da Smoov',
          body: el('div', { class: 'locked' }, [
            el('div', { html: MI.icon('lock', 26) }),
            el('h4', { text: 'Sem permissão neste perfil' }),
            el('p', { text: 'Somente o administrador da Smoov carrega bases. A equipe 10 Move acessa indicadores aprovados; o administrador técnico gerencia o sistema sem acesso aos registros individuais.' })
          ])
        })));
        return;
      }

      host.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('ok', [
        el('strong', { text: 'O arquivo não sai deste navegador. ' }),
        'Leitura em memória com FileReader e SheetJS, no seu computador. Nenhuma linha vai para servidor, ' +
        'para a 10 Move ou para qualquer serviço de inteligência artificial.'
      ])));

      /* ---- base ativa ---- */
      host.appendChild(baseAtiva(modo));

      if (s.busy) {
        host.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12', title: 'Processando',
          body: [
            el('div', { class: 'boot__bar', style: 'background:var(--surface-3)' },
              el('i', { id: 'imp-bar-' + modo, style: 'width:' + Math.round(s.prog * 100) + '%;background:var(--accent)' })),
            el('p', { id: 'imp-msg-' + modo, class: 'field__hint', style: 'margin-top:10px', text: s.msg })
          ]
        })));
        return;
      }

      if (!s.ex) {
        host.appendChild(el('div', { class: 'grid' }, U.card({ span: 'c12', body: dropzone(modo) })));
        return;
      }

      /* ---- revisão ---- */
      host.appendChild(U.section('Revisão antes de aplicar', s.pendente.fileName, [
        U.btn('Aplicar', {
          variant: 'accent', icon: 'check',
          onClick: modo === 'clientes' ? aplicarClientes : aplicarTransacoes
        }),
        U.btn('Cancelar', { variant: 'ghost', onClick: function () { reset(modo); MI.app.rerender(); } })
      ]));

      const blocos = [seletorAbas(modo), blocoCabecalho(modo)].filter(Boolean);
      host.appendChild(el('div', { class: 'grid' }, blocos));

      if (modo === 'clientes') revisaoClientes(host);
      else revisaoTransacoes(host);

      host.appendChild(el('div', { class: 'grid', style: 'margin-top:14px' }, U.card({
        span: 'c12',
        body: el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' }, [
          U.btn('Aplicar ' + MI.fmt.int(s.ex.rows.length) + ' linhas', {
            variant: 'accent', icon: 'check',
            onClick: modo === 'clientes' ? aplicarClientes : aplicarTransacoes
          }),
          U.btn('Cancelar', { variant: 'ghost', onClick: function () { reset(modo); MI.app.rerender(); } })
        ])
      })));
    }
  };

  /* ---------------- Publicação na plataforma ---------------- */
  function publicar(kind) {
    const barra = el('i', { style: 'width:4%;background:var(--accent);display:block;height:100%;border-radius:99px' });
    const texto = el('p', { class: 'field__hint', style: 'margin-top:10px', text: 'Preparando…' });
    const aviso = el('div', { style: 'margin-top:12px' });
    const m = U.modal({
      title: 'Publicando na plataforma',
      body: [
        U.note('warn', [
          el('strong', { text: 'A base sai deste navegador. ' }),
          'A partir daqui ela fica guardada no servidor e acessível a todos os membros da organização, ' +
          'inclusive à equipe da 10 Move. Cada carregamento fica registrado na trilha de auditoria.'
        ]),
        el('div', { style: 'margin-top:14px;height:4px;border-radius:99px;background:var(--surface-3);overflow:hidden' }, barra),
        texto, aviso
      ]
    });

    const andamento = function (p, t) {
      barra.style.width = Math.max(4, Math.round(p * 100)) + '%';
      texto.textContent = t || '';
    };

    const promessa = kind === 'clientes'
      ? MI.remote.publicarClientes(MI.store.dataset, andamento)
      : MI.remote.publicarTransacoes(andamento);

    promessa
      .then(function () {
        andamento(1, 'Concluído.');
        MI.clear(aviso).appendChild(U.note('ok', [
          el('strong', { text: 'Base publicada. ' }),
          'Quem entrar na plataforma passa a carregá-la automaticamente, sem reenviar o arquivo.'
        ]));
        MI.toast('Base publicada na plataforma.', 'ok');
        setTimeout(function () { m.close(); MI.app.rerender(); }, 1600);
      })
      .catch(function (e) {
        MI.clear(aviso).appendChild(U.note('crit', [
          el('strong', { text: 'Não foi publicada. ' }), e.message || String(e)
        ]));
      });
  }

  function botaoPublicar(kind, habilitado, motivo) {
    if (!MI.remote || !MI.remote.disponivel()) return null;
    if (!MI.remote.podePublicar()) return null;
    return U.btn('Publicar na plataforma', {
      sm: true, variant: 'accent', icon: 'upload',
      disabled: !habilitado, title: habilitado ? null : motivo,
      onClick: function () { publicar(kind); }
    });
  }

  /* ---------------- Base ativa ---------------- */
  function baseAtiva(modo) {
    if (modo === 'clientes') {
      const ds = MI.store.dataset;
      return el('div', { class: 'grid', style: 'margin-bottom:4px' }, U.card({
        span: 'c12',
        title: ds ? ds.name : 'Nenhuma base de clientes',
        sub: ds ? (ds.source === 'demo' ? 'Base demonstrativa fictícia gerada neste navegador'
          : ds.source === 'remote'
            ? 'Base publicada na plataforma' + (ds.remoto && ds.remoto.enviadoEm ? ' em ' + MI.fmt.date(new Date(ds.remoto.enviadoEm)) : '') +
            ' · carregada do servidor, sem reenvio'
            : 'Arquivo importado: ' + ds.fileName + (ds.sheetName ? ' · aba “' + ds.sheetName + '”' : '')) : null,
        tools: [
          botaoPublicar('clientes', !!(ds && ds.source === 'import'),
            ds && ds.source === 'remote' ? 'Esta base já veio da plataforma' : 'Importe uma planilha antes de publicar'),
          ds && ds.source === 'import' ? U.btn('Voltar à base demonstrativa', {
            sm: true, icon: 'refresh', onClick: function () { MI.app.loadDemo(); MI.toast('Base demonstrativa restaurada.', 'ok'); }
          }) : null
        ].filter(Boolean),
        body: ds ? U.statline([
          { k: 'Registros', v: MI.fmt.int(ds.rows.length) },
          { k: 'Colunas', v: String(ds.columns.length) },
          { k: 'Papéis mapeados', v: String(Object.keys(ds.roles).length) },
          { k: 'Data de referência', v: MI.fmt.date(ds.refDate) },
          { k: 'Origem', v: ds.source === 'demo' ? 'Sintética' : ds.source === 'remote' ? 'Plataforma' : 'Planilha importada' }
        ]) : U.empty('Nenhuma base ativa')
      }));
    }
    const T = MI.tx;
    return el('div', { class: 'grid', style: 'margin-bottom:4px' }, U.card({
      span: 'c12',
      title: T.has() ? (T.isDemo() ? 'Transações demonstrativas' : 'Transações importadas') : 'Nenhuma base de transações',
      sub: T.has() ? (T.fileName || 'geradas neste navegador') : 'A Inteligência de Consumo precisa de itens de pedido',
      tools: [
        botaoPublicar('transacoes', T.has() && !T.isDemo() && T.source !== 'remote',
          T.isDemo() ? 'As transações demonstrativas não são publicadas' : 'Importe uma base de transações antes de publicar'),
        T.has() ? U.btn('Remover transações', {
          sm: true, variant: 'ghost', icon: 'trash',
          onClick: function () { MI.tx.clear(); MI.toast('Transações removidas.', 'ok'); MI.app.rerender(); }
        }) : null
      ].filter(Boolean),
      body: T.has() ? U.statline([
        { k: 'Itens de pedido', v: MI.fmt.int(T.link.itens) },
        { k: 'Pedidos', v: MI.fmt.int(T.link.pedidos) },
        { k: 'Casados com o catálogo', v: MI.fmt.pct(T.link.taxaProduto, 1) },
        { k: 'Ligados a clientes', v: MI.fmt.pct(T.link.taxaCliente, 1) },
        { k: 'Origem', v: T.isDemo() ? 'Sintética' : T.source === 'remote' ? 'Plataforma' : 'Planilha importada' }
      ]) : U.empty('Sem transações carregadas', 'Importe o arquivo de pedidos ou gere uma base demonstrativa em Inteligência de Consumo.')
    }));
  }

  /* ---------------- Revisão: clientes ---------------- */
  function revisaoClientes(host) {
    const s = ST.clientes, ds = s.ds, q = s.quality;
    if (!ds) return;

    host.appendChild(el('div', { class: 'grid' }, [
      U.kpi({ span: 'c3', accent: true, label: 'Linhas de dados', value: MI.fmt.int(ds.rows.length), icon: 'database' }),
      U.kpi({ span: 'c3', label: 'Colunas', value: String(ds.columns.length), icon: 'grid', hint: q.colunasVazias ? q.colunasVazias + ' vazia(s)' : 'Nenhuma coluna vazia' }),
      U.kpi({ span: 'c3', label: 'Completude', value: MI.fmt.pct(q.completude, 1), icon: 'check' }),
      U.kpi({ span: 'c3', label: 'Qualidade estimada', value: String(q.score), unit: '/100', icon: 'spark', hint: q.issues.length ? q.issues.length + ' ponto(s) de atenção' : 'Sem inconsistências' })
    ]));

    const reconhecidos = Object.keys(ds.roles);
    host.appendChild(el('div', { class: 'grid' }, [
      U.card({
        span: 'c6', title: 'Dimensões reconhecidas', sub: reconhecidos.length + ' de ' + MI.ROLES.length + ' papéis analíticos',
        body: reconhecidos.length
          ? el('div', { style: 'display:flex;flex-wrap:wrap;gap:7px' }, reconhecidos.map(function (r) {
            return el('span', { class: 'badge badge--ok' }, [
              MI.ROLE_BY_KEY[r].label, el('small', { style: 'opacity:.75', text: ' ← ' + MI.prettyLabel(ds.roles[r]) })
            ]);
          }))
          : U.empty('Nenhum papel reconhecido', 'Indique manualmente no mapeamento abaixo.')
      }),
      U.card({
        span: 'c6', title: 'Dimensões não encontradas', sub: 'Painéis que ficarão indisponíveis',
        body: (function () {
          const faltam = MI.ROLES.filter(function (r) { return !ds.roles[r.key]; });
          if (!faltam.length) return U.note('ok', 'Todas as dimensões foram mapeadas.');
          return el('div', { style: 'display:flex;flex-wrap:wrap;gap:7px' }, faltam.map(function (r) {
            return el('span', { class: 'badge', text: r.label });
          }));
        })()
      })
    ]));

    if (q.issues.length) {
      host.appendChild(U.section('Inconsistências e pontos de atenção', 'Nada é corrigido sem você saber'));
      host.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12',
        body: el('div', { class: 'findings' }, q.issues.map(function (i) {
          return el('article', { class: 'finding', style: 'border-left-color:var(--' + (i.level === 'crit' ? 'crit' : i.level === 'warn' ? 'warn' : 'info') + ')' }, [
            el('div', { class: 'finding__top' }, [
              el('span', { class: 'badge badge--' + (i.level === 'crit' ? 'crit' : i.level === 'warn' ? 'warn' : 'info') },
                i.level === 'crit' ? 'Crítico' : i.level === 'warn' ? 'Atenção' : 'Informação'),
              i.col ? el('span', { class: 'finding__tema', text: MI.prettyLabel(i.col) }) : null
            ]),
            el('h4', { text: i.titulo }),
            el('p', { text: i.texto })
          ]);
        }))
      })));
    }

    host.appendChild(U.section('Mapeamento de colunas', 'Ajuste o que a plataforma entendeu de cada coluna'));
    host.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      body: [
        el('div', { class: 'map-row', style: 'background:var(--surface-2);font-weight:600;color:var(--faint);font-size:11px;letter-spacing:.04em;text-transform:uppercase' }, [
          el('div', { text: 'Coluna da planilha / amostra' }), el('div', { text: 'Tipo detectado' }), el('div', { text: 'Papel na análise' })
        ]),
        el('div', { style: 'border:1px solid var(--border);border-radius:var(--radius-sm);max-height:520px;overflow-y:auto' },
          ds.columns.map(function (c) { return linhaMapeamento(c, ds); }))
      ]
    })));
  }

  function linhaMapeamento(col, ds) {
    const usados = {};
    Object.keys(ds.roles).forEach(function (r) { usados[r] = ds.roles[r]; });
    const sel = el('select', { class: 'input' }, [el('option', { value: '' }, '— não usar —')].concat(
      MI.ROLES.map(function (r) {
        const compat = r.types.indexOf(col.type) >= 0;
        const ocupado = usados[r.key] && usados[r.key] !== col.key;
        return el('option', { value: r.key, selected: col.role === r.key },
          r.label + (compat ? '' : ' (tipo diferente)') + (ocupado ? ' — em uso por ' + MI.prettyLabel(usados[r.key]) : ''));
      })
    ));
    sel.addEventListener('change', function () {
      Object.keys(ds.roles).forEach(function (r) { if (ds.roles[r] === col.key) delete ds.roles[r]; });
      if (sel.value) ds.roles[sel.value] = col.key;
      ds.columns.forEach(function (c) {
        c.role = Object.keys(ds.roles).filter(function (r) { return ds.roles[r] === c.key; })[0] || null;
      });
      ST.clientes.quality = MI.importer.quality(ds);
      MI.app.rerender();
    });
    const amostra = col.topValues.length ? col.topValues.slice(0, 3).join(' · ') : '(vazia)';
    return el('div', { class: 'map-row' }, [
      el('div', { class: 'map-row__col' }, [
        el('b', { text: col.label, title: col.key }),
        el('small', { text: amostra, title: amostra })
      ]),
      el('div', { class: 'map-row__col' }, [
        el('span', { class: 'badge' + (col.filled === 0 ? ' badge--crit' : ''), text: MI.typeLabel(col.type) }),
        el('small', {
          text: MI.fmt.int(col.distinct) + (col.distinctApprox ? '+' : '') + ' valores · ' +
            (col.missingRate > 0.001 ? MI.fmt.pct(col.missingRate, 1) + ' vazios' : 'sem vazios')
        })
      ]),
      el('div', { class: 'map-row__col' }, sel)
    ]);
  }

  /* ---------------- Revisão: transações ---------------- */
  function revisaoTransacoes(host) {
    const s = ST.transacoes, ex = s.ex;
    const obrigatorioOk = !!(s.mapping.produto || s.mapping.sku);

    host.appendChild(el('div', { class: 'grid' }, [
      U.kpi({ span: 'c4', accent: true, label: 'Linhas de item', value: MI.fmt.int(ex.rows.length), icon: 'database' }),
      U.kpi({
        span: 'c4', label: 'Campos mapeados', value: String(Object.keys(s.mapping).length) + ' / ' + MI.tx.CAMPOS.length,
        icon: 'grid', hint: obrigatorioOk ? 'Produto ou SKU presente' : 'Falta o produto ou o SKU'
      }),
      U.kpi({
        span: 'c4', label: 'Produtos no catálogo', value: MI.fmt.int(MI.catalog.items.length),
        icon: 'grid', hint: MI.catalog.isDemo() ? 'Catálogo demonstrativo — a correspondência será baixa com dados reais' : 'Catálogo carregado'
      })
    ]));

    if (!obrigatorioOk) {
      host.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', body: U.note('crit', [
          el('strong', { text: 'Mapeie o produto. ' }),
          'Sem uma coluna com o nome do produto ou o SKU não há o que analisar. Os demais campos são opcionais e ' +
          'cada um libera um tipo de análise.'
        ])
      })));
    }

    host.appendChild(U.section('Mapeamento dos campos da transação', 'Cada campo libera uma análise diferente'));
    const linhas = MI.tx.CAMPOS.map(function (campo) {
      const sel = el('select', { class: 'input' }, [el('option', { value: '' }, '— não usar —')].concat(
        ex.headers.map(function (h) {
          return el('option', { value: h, selected: s.mapping[campo.key] === h }, MI.prettyLabel(h));
        })
      ));
      sel.addEventListener('change', function () {
        Object.keys(s.mapping).forEach(function (k) {
          if (k !== campo.key && s.mapping[k] === sel.value) delete s.mapping[k];
        });
        if (sel.value) s.mapping[campo.key] = sel.value; else delete s.mapping[campo.key];
        MI.app.rerender();
      });
      const col = s.mapping[campo.key];
      const amostra = col ? ex.rows.slice(0, 3).map(function (r) { return r[col]; }).filter(function (v) { return v !== '' && v != null; }).join(' · ') : '';
      return el('div', { class: 'map-row' }, [
        el('div', { class: 'map-row__col' }, [
          el('b', { text: campo.label }),
          el('small', { text: campo.key === 'produto' || campo.key === 'sku' ? 'ao menos um dos dois' : 'opcional' })
        ]),
        el('div', { class: 'map-row__col' }, [el('small', { title: amostra, text: amostra || '—' })]),
        el('div', { class: 'map-row__col' }, sel)
      ]);
    });

    host.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      body: [
        el('div', { class: 'map-row', style: 'background:var(--surface-2);font-weight:600;color:var(--faint);font-size:11px;letter-spacing:.04em;text-transform:uppercase' }, [
          el('div', { text: 'Campo da transação' }), el('div', { text: 'Amostra' }), el('div', { text: 'Coluna da planilha' })
        ]),
        el('div', { style: 'border:1px solid var(--border);border-radius:var(--radius-sm);max-height:520px;overflow-y:auto' }, linhas)
      ]
    })));

    host.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12', title: 'O que cada campo libera',
      body: U.table(
        [{ label: 'Campo' }, { label: 'Mapeado' }, { label: 'Libera' }],
        [
          ['produto', 'Nome do produto ou SKU', 'Produtos e categorias mais vendidos'],
          ['idPedido', 'Identificador do pedido', 'Cesta de compras e ticket por pedido'],
          ['idCliente', 'Identificador do cliente', 'Cruzamento com idade, gênero e região'],
          ['data', 'Data do pedido', 'Sazonalidade e recorrência'],
          ['hora', 'Hora do pedido', 'Demanda por horário'],
          ['valorTotal', 'Valor do item', 'Receita e ticket médio por categoria']
        ].map(function (r) {
          const temMapeado = r[0] === 'produto' ? obrigatorioOk : !!s.mapping[r[0]];
          return {
            cells: [
              { v: r[1] },
              { v: el('span', { class: 'badge badge--' + (temMapeado ? 'ok' : 'crit'), text: temMapeado ? 'sim' : 'não' }) },
              { v: r[2] }
            ]
          };
        })
      )
    })));
  }

  MI.importUI.reset = reset;

})(window.MI);
