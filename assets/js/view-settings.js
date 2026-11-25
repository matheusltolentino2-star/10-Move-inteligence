/* 10 Move Intelligence — Configurações e Acessos
   Reúne fontes de dados, perfis de acesso e governança de privacidade. */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui;

  const S = { aba: 'dados', fonte: 'clientes' };

  const PERFIS = [
    {
      id: 'smoov', nome: 'Administrador Smoov', curto: 'Smoov',
      desc: 'Representante autorizado da Smoov, responsável pelos dados.',
      pode: [
        'Importar a base de clientes e a base de transações',
        'Ver a pré-visualização das linhas e os registros individuais',
        'Administrar o catálogo de produtos',
        'Definir o limite de supressão (k)',
        'Aprovar, um a um, os indicadores compartilhados com a 10 Move',
        'Gerar relatórios completos do próprio recorte'
      ],
      naoPode: ['Nada é restrito neste perfil dentro da aplicação']
    },
    {
      id: 'tenmove', nome: 'Equipe 10 Move', curto: '10 Move',
      desc: 'Equipe de inteligência comercial da 10 Move.',
      pode: [
        'Ver os indicadores que a Smoov aprovou',
        'Navegar pelos dashboards e aplicar filtros',
        'Consultar o catálogo de produtos',
        'Gerar relatórios apenas com o que foi liberado'
      ],
      naoPode: [
        'Importar bases ou ver linhas individuais',
        'Ver indicadores não aprovados',
        'Editar o catálogo ou alterar o limite de supressão',
        'Exportar microdados'
      ]
    },
    {
      id: 'tech', nome: 'Administrador técnico', curto: 'Técnico',
      desc: 'Responsável pela operação do sistema, sem papel comercial.',
      pode: [
        'Ver a estrutura das bases, tipos de coluna e qualidade dos dados',
        'Acompanhar o diagnóstico de ligação entre clientes, pedidos e catálogo',
        'Ver os dashboards com supressão de grupos pequenos sempre ativa',
        'Consultar o painel de risco de reidentificação'
      ],
      naoPode: [
        'Ver registros individuais ou a pré-visualização da planilha',
        'Importar bases ou exportar microdados',
        'Aprovar indicadores para compartilhamento',
        'Editar o catálogo'
      ]
    }
  ];
  MI.PERFIS = PERFIS;

  MI.views.settings = {
    title: 'Configurações e Acessos',
    subtitle: 'Fontes de dados, perfis de acesso e governança',
    icon: 'shield',

    abrirAba: function (id, fonte) {
      S.aba = id;
      if (fonte) S.fonte = fonte;
    },

    render: function (root) {
      const abas = [
        { id: 'dados', label: 'Fontes de dados', icon: 'database' },
        { id: 'acessos', label: 'Perfis de acesso', icon: 'users' },
        { id: 'privacidade', label: 'Privacidade e compartilhamento', icon: 'shield' },
        { id: 'publicacao', label: 'Publicação', icon: 'upload' }
      ];
      root.appendChild(el('div', { class: 'tabs' }, abas.map(function (t) {
        return el('button', {
          class: 'tab' + (S.aba === t.id ? ' is-on' : ''), type: 'button',
          onclick: function () { S.aba = t.id; MI.app.rerender(); }
        }, [el('span', { html: MI.icon(t.icon, 15) }), t.label]);
      })));

      if (S.aba === 'dados') return renderDados(root);
      if (S.aba === 'acessos') return renderAcessos(root);
      if (S.aba === 'publicacao') return renderPublicacao(root);
      return MI.views.governance.render(root);
    }
  };

  /* ================= Fontes de dados ================= */
  function renderDados(root) {
    const sub = [
      { id: 'lote', label: 'Lote completo', icon: 'upload' },
      { id: 'clientes', label: 'Base de clientes', icon: 'users' },
      { id: 'transacoes', label: 'Base de transações', icon: 'spark' },
      { id: 'catalogo', label: 'Catálogo de produtos', icon: 'grid' },
      { id: 'unidades', label: 'Unidades', icon: 'map' },
      { id: 'bases', label: 'Bases publicadas', icon: 'database' }
    ];
    root.appendChild(el('div', { style: 'display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px' }, sub.map(function (t) {
      return el('button', {
        class: 'chip' + (S.fonte === t.id ? ' is-on' : ''), type: 'button',
        onclick: function () { S.fonte = t.id; MI.app.rerender(); }
      }, [el('span', { html: MI.icon(t.icon, 14) }), t.label]);
    })));

    /* Gerenciar o que já está publicado vale mesmo com o lote ligado:
       é justamente onde se desfaz uma importação que deu errado. */
    if (S.fonte === 'bases') {
      MI.basesUI.render(root, { tipos: ['clientes', 'transacoes'], titulo: 'Bases publicadas na plataforma' });
      return;
    }
    if (S.fonte === 'lote') return MI.fullData.render(root);
    if (MI.fullData?.active) {
      root.appendChild(U.note('info', 'Para alterar fontes individuais, desative o lote completo nesta sessão.'));
      return;
    }
    if (S.fonte === 'unidades') { renderUnidades(root); return; }

    if (S.fonte === 'catalogo') {
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', title: 'Catálogo de produtos',
        sub: MI.catalog.items.length + ' produtos · ' + (MI.catalog.isDemo() ? 'catálogo demonstrativo fictício' : 'catálogo carregado'),
        body: [
          U.note(null, 'A importação e a administração do cardápio ficam na seção dedicada, com pré-visualização em cartões, filtros e editor.'),
          el('div', { style: 'margin-top:12px' }, U.btn('Abrir Cardápio & Produtos', {
            variant: 'accent', icon: 'grid', onClick: function () { MI.app.go('catalog'); }
          }))
        ]
      })));
      return;
    }
    MI.importUI.render(root, S.fonte);
  }

  /* ================= Unidades =================
     O cadastro existe para receber o que o dado não traz: endereço,
     coordenada, formato e maturidade. O nome e o município já vêm das
     transações, então a tela abre com as unidades preenchidas e pede só o
     que falta. */
  function renderUnidades(root) {
    const Un = MI.unidades;
    if (!Un || !Un.disponivel()) {
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', title: 'Unidades',
        body: U.unavailable('O cadastro de unidades fica no servidor e exige sessão ativa',
          ['Entrar na plataforma', 'Pertencer a uma organização'])
      })));
      return;
    }

    const bal = Un.balanco();
    const cob = Un.cobertura();
    const pode = Un.podeEditar();

    root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note(bal.exatas ? null : 'warn', [
      el('strong', { text: 'A posição de cada unidade vale o que a precisão dela diz. ' }),
      'Unidade “aproximada pelo município” é desenhada no centro do município, não na porta da loja — ' +
      'serve para ver presença, não para medir cobertura. O raio de 3 km só aparece no mapa para quem tem ' +
      'coordenada informada' + (bal.exatas ? '.' : ', e nenhuma tem ainda.')
    ])));

    root.appendChild(U.section('Situação do cadastro', bal.total
      ? MI.fmt.int(bal.total) + ' unidades'
      : 'Nenhuma unidade ainda'));
    root.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      body: [
        U.statline([
          { k: 'Unidades', v: MI.fmt.int(bal.total) },
          { k: 'Com coordenada', v: MI.fmt.int(bal.exatas) },
          { k: 'Pelo município', v: MI.fmt.int(bal.porMunicipio) },
          { k: 'Sem posição', v: MI.fmt.int(bal.sem) },
          { k: 'Próprias', v: MI.fmt.int(bal.proprias) },
          { k: 'Franquias', v: MI.fmt.int(bal.franquias) }
        ]),
        cob ? el('div', { style: 'margin-top:14px' }, U.note(null, [
          el('strong', { text: MI.fmt.pct(cob.taxaUnidade, 1) + ' dos itens vendidos informam a unidade. ' }),
          cob.desconhecidas.length
            ? MI.fmt.int(cob.desconhecidas.length) + ' nomes de unidade ainda não estão no cadastro.'
            : 'Todas as unidades citadas nas vendas estão cadastradas.'
        ])) : null,
        pode ? el('div', { style: 'margin-top:14px;display:flex;gap:8px;flex-wrap:wrap' }, [
          U.btn('Cadastrar unidade', { sm: true, variant: 'accent', icon: 'check', onClick: function () { editorUnidade(null); } }),
          MI.tx.has() && !MI.tx.isDemo() ? U.btn('Buscar nas transações', {
            sm: true, icon: 'refresh',
            title: 'Cria as unidades citadas nas vendas que ainda não existem',
            onClick: function () {
              Un.semear().then(function (r) {
                MI.toast(r.criadas ? MI.fmt.int(r.criadas) + ' unidades cadastradas.' : 'Nenhuma unidade nova encontrada.', 'ok');
                MI.app.rerender();
              });
            }
          }) : null
        ].filter(Boolean)) : null
      ].filter(Boolean)
    })));

    if (!bal.total) {
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12',
        body: U.empty('Nenhuma unidade cadastrada',
          MI.tx.has() && !MI.tx.isDemo()
            ? 'Use “Buscar nas transações” para criar a partir dos nomes que já aparecem nas vendas.'
            : 'Importe uma base de transações com a coluna de unidade, ou cadastre à mão.')
      })));
      return;
    }

    root.appendChild(U.section('Unidades cadastradas', 'Complete endereço, coordenada e formato'));
    root.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      body: U.table(
        [{ label: 'Unidade' }, { label: 'Formato' }, { label: 'Município' },
        { label: 'Posição' }, { label: 'Raio', num: true }, { label: '' }],
        Un.items.map(function (u) {
          return {
            cells: [
              { v: u.nome },
              { v: Un.rotuloFormato(u.formato) },
              { v: u.municipio ? u.municipio + (u.uf ? ' · ' + u.uf : '') : '—' },
              { v: Un.rotuloPrecisao(u.precisao), risk: u.precisao === 'ausente' },
              { v: u.precisao === 'exata' ? MI.fmt.int(u.raio_m) + ' m' : '—', num: true },
              {
                v: pode
                  ? el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' }, [
                    el('button', {
                      class: 'icon-btn', title: 'Editar', html: MI.icon('spark', 14),
                      onclick: function () { editorUnidade(u); }
                    }),
                    el('button', {
                      class: 'icon-btn icon-btn--danger', title: 'Remover', html: MI.icon('trash', 14),
                      onclick: function () {
                        Un.remover(u.id).then(function () { MI.toast('Unidade removida.', 'ok'); MI.app.rerender(); })
                          .catch(function (e) { MI.toast(e.message, 'error'); });
                      }
                    })
                  ])
                  : '—'
              }
            ]
          };
        })
      )
    })));
  }

  function editorUnidade(u) {
    const Un = MI.unidades;
    const novo = !u;
    u = u || {};
    const campo = function (label, input) {
      return el('div', { class: 'field' }, [el('label', { class: 'field__label' }, label), input]);
    };
    const fNome = el('input', { class: 'input', value: u.nome || '' });
    const fFormato = el('select', { class: 'input' }, Object.keys(Un.FORMATOS).map(function (k) {
      return el('option', { value: k, text: Un.FORMATOS[k], selected: (u.formato || 'nao_informado') === k ? '' : null });
    }));
    const fUf = el('input', { class: 'input', value: u.uf || '', maxlength: '2', placeholder: 'SP' });
    const fMun = el('input', { class: 'input', value: u.municipio || '', placeholder: 'São Paulo' });
    const fEnd = el('input', { class: 'input', value: u.endereco || '', placeholder: 'Rua, número, bairro' });
    const fLat = el('input', { class: 'input', value: u.lat == null ? '' : u.lat, placeholder: '-23.5705' });
    const fLng = el('input', { class: 'input', value: u.lng == null ? '' : u.lng, placeholder: '-46.6880' });
    const fRaio = el('input', { class: 'input', type: 'number', value: u.raio_m || 3000, min: '100', max: '50000' });
    const fArea = el('input', { class: 'input', type: 'number', value: u.area_m2 == null ? '' : u.area_m2, placeholder: 'm²' });
    const fAbertura = el('input', { class: 'input', type: 'date', value: u.aberta_em || '' });

    const m = U.modal({
      title: novo ? 'Cadastrar unidade' : u.nome,
      body: [
        el('div', { style: 'display:grid;grid-template-columns:repeat(2,1fr);gap:12px' }, [
          campo('Nome', fNome),
          campo('Formato', fFormato),
          campo('UF', fUf),
          campo('Município', fMun),
          campo('Endereço', fEnd),
          campo('Inaugurada em', fAbertura),
          campo('Latitude', fLat),
          campo('Longitude', fLng),
          campo('Raio operacional (m)', fRaio),
          campo('Área (m²)', fArea)
        ]),
        el('div', { style: 'margin-top:14px' }, U.note(null, [
          el('strong', { text: 'A precisão é deduzida do que você preencher. ' }),
          'Com latitude e longitude a unidade fica exata e ganha raio no mapa. Só com município, ela entra como ' +
          'aproximada e aparece no centro do município. Sem nenhum dos dois, fica fora do mapa.'
        ]))
      ],
      actions: [
        U.btn(novo ? 'Cadastrar' : 'Salvar', {
          variant: 'accent', icon: 'check',
          onClick: function () {
            const dados = {
              nome: fNome.value.trim(),
              formato: fFormato.value,
              uf: fUf.value.trim().toUpperCase() || null,
              municipio: fMun.value.trim() || null,
              endereco: fEnd.value.trim() || null,
              lat: fLat.value.trim(),
              lng: fLng.value.trim(),
              raio_m: fRaio.value,
              area_m2: fArea.value === '' ? null : Number(fArea.value),
              aberta_em: fAbertura.value || null
            };
            if (!dados.nome) { MI.toast('O nome da unidade é obrigatório.', 'error'); return; }
            const p = novo ? Un.adicionar(dados) : Un.salvar(u.id, dados);
            p.then(function () {
              m.close();
              MI.toast(novo ? 'Unidade cadastrada.' : 'Unidade atualizada.', 'ok');
              MI.app.rerender();
            }).catch(function (e) { MI.toast(e.message || String(e), 'error'); });
          }
        }),
        U.btn('Cancelar', { variant: 'ghost', onClick: function () { m.close(); } })
      ]
    });
  }

  /* ================= Perfis de acesso ================= */
  function renderAcessos(root) {
    const atual = MI.store.perspective;

    root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('crit', [
      el('strong', { text: 'Isto não é autenticação. ' }),
      'Nesta versão a troca de perfil é uma preferência de interface, guardada neste navegador. ' +
      'Qualquer pessoa com a página aberta pode alternar entre os três perfis. ' +
      'Para uso real com dados da Smoov é obrigatório ter login de verdade e autorização verificada no servidor — ' +
      'o que está preparado e descrito na aba Publicação.'
    ])));

    root.appendChild(U.section('Perfis previstos', 'O que cada um pode fazer na aplicação'));
    root.appendChild(el('div', { class: 'grid' }, PERFIS.map(function (p) {
      const ativo = atual === p.id;
      return U.card({
        span: 'c4',
        title: p.nome,
        sub: p.desc,
        tools: [ativo ? el('span', { class: 'badge badge--ok', text: 'perfil ativo' }) : null].filter(Boolean),
        body: [
          el('div', { class: 'field__label', style: 'margin-bottom:6px', text: 'Pode' }),
          el('ul', { style: 'margin:0 0 14px;padding-left:18px;font-size:12.5px;color:var(--muted);line-height:1.65' },
            p.pode.map(function (x) { return el('li', { text: x }); })),
          el('div', { class: 'field__label', style: 'margin-bottom:6px', text: 'Não pode' }),
          el('ul', { style: 'margin:0;padding-left:18px;font-size:12.5px;color:var(--muted);line-height:1.65' },
            p.naoPode.map(function (x) { return el('li', { text: x }); }))
        ],
        foot: ativo ? 'Você está navegando com este perfil.' : null
      });
    })));

    root.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12', title: 'Trocar de perfil',
      sub: 'Para conferir como cada público enxerga a plataforma',
      body: el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, PERFIS.map(function (p) {
        return U.btn(p.nome, {
          variant: atual === p.id ? 'accent' : null,
          onClick: function () { MI.store.setPerspective(p.id); MI.app.rerender(); }
        });
      }))
    })));

    /* matriz de permissões efetivamente aplicada no código */
    root.appendChild(U.section('Matriz de permissões aplicada', 'Estas regras estão implementadas e valem agora'));
    const regras = [
      ['Importar base de clientes e transações', ['sim', 'não', 'não']],
      ['Ver pré-visualização das linhas da planilha', ['sim', 'não', 'não']],
      ['Editar o catálogo de produtos', ['sim', 'não', 'não']],
      ['Ver indicadores não aprovados', ['sim', 'não', 'sim']],
      ['Supressão de grupos pequenos sempre ativa', ['opcional', 'sim', 'sim']],
      ['Definir o limite k e aprovar indicadores', ['sim', 'não', 'não']],
      ['Exportar microdados', ['não', 'não', 'não']],
      ['Exportar indicadores agregados', ['sim', 'sim', 'sim']]
    ];
    root.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      body: U.table(
        [{ label: 'Ação' }].concat(PERFIS.map(function (p) { return { label: p.nome }; })),
        regras.map(function (r) {
          return {
            cells: [{ v: r[0] }].concat(r[1].map(function (v) {
              return { v: el('span', { class: 'badge badge--' + (v === 'sim' ? 'ok' : v === 'não' ? 'crit' : 'warn'), text: v }) };
            }))
          };
        })
      )
    })));
  }

  /* ================= Publicação ================= */
  /* Esta aba descrevia um estado que já passou (nada publicado, nenhum
     servidor). Mantê-la assim transformaria a tela mais institucional da
     aplicação em informação falsa, então ela descreve o que está no ar. */
  function renderPublicacao(root) {
    root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note('ok', [
      el('strong', { text: 'No ar em 10-move-intelligence.vercel.app. ' }),
      'Arquivos estáticos servidos pela Vercel, login e banco no Supabase. Os planos gratuitos dos dois ' +
      'serviços atendem este volume e nada foi contratado.'
    ])));

    root.appendChild(U.section('O que está funcionando', 'Verificado na URL pública, não só no repositório'));
    root.appendChild(el('div', { class: 'grid' }, [
      U.card({
        span: 'c6', title: 'Em produção',
        body: el('div', { class: 'findings' }, [
          item('ok', 'URL HTTPS pública', 'Deploy a partir do repositório no GitHub: cada envio de código atualiza a aplicação, sem etapa de build.'),
          item('ok', 'Cabeçalhos de segurança ativos', 'CSP, HSTS, X-Frame-Options e Referrer-Policy aplicados pela Vercel, conferidos em produção sem nenhuma violação de CSP.'),
          item('ok', 'Login real', 'Supabase Auth. Sem sessão válida nada é gerado nem exibido — nem a base demonstrativa.'),
          item('ok', 'Papéis e isolamento por organização', 'Row Level Security nega por padrão e filtra por organização. Só o administrador da Smoov publica ou remove bases.'),
          item('ok', 'Base compartilhada', 'Quem publica sobe o arquivo uma vez; os outros membros carregam a mesma base do servidor, sem reenviar nada.'),
          item('ok', 'Trilha de auditoria no servidor', 'Tabela que só aceita inserções. Cada carregamento da base compartilhada fica registrado com usuário, base e horário.')
        ])
      }),
      U.card({
        span: 'c6', title: 'Depende de uma decisão sua',
        body: el('div', { class: 'findings' }, [
          item('crit', 'Base legal e contrato de tratamento', 'Desde 24/11/2026 a base completa é compartilhada entre a Smoov e a 10 Move. Usar dados reais de clientes exige base legal, contrato de tratamento e avaliação de impacto sob a LGPD. É decisão das empresas, não do software.'),
          item('warn', 'Sair da conta e expiração de sessão', 'Não existe botão de sair: a sessão continua válida neste navegador até o token expirar. Em computador compartilhado, isso importa.'),
          item('warn', 'Proteção contra senhas vazadas', 'O Supabase pode recusar senhas que apareceram em vazamentos conhecidos. A opção está desligada e vale ativá-la antes de criar as contas definitivas.'),
          item('warn', 'Repositório público', 'O código fica visível no GitHub. Não há segredo nele — a chave publicável do Supabase é pública por natureza e a proteção real é o RLS —, mas tornar o repositório privado é um clique.')
        ])
      })
    ]));
  }

  function item(nivel, titulo, texto) {
    return el('article', { class: 'finding', style: 'border-left-color:var(--' + (nivel === 'ok' ? 'ok' : nivel === 'crit' ? 'crit' : 'warn') + ')' }, [
      el('div', { class: 'finding__top' }, [
        el('span', { class: 'badge badge--' + nivel, text: nivel === 'ok' ? 'pronto' : nivel === 'crit' ? 'requer autorização' : 'requer ação' })
      ]),
      el('h4', { text: titulo }),
      el('p', { text: texto })
    ]);
  }

})(window.MI);
