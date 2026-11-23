/* 10 Move Intelligence — Privacidade e compartilhamento */
window.MI = window.MI || {};
MI.views = MI.views || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, P = MI.privacy;

  MI.views.governance = {
    title: 'Privacidade e compartilhamento',
    subtitle: 'O que a 10 Move pode ver, e com qual proteção',
    icon: 'shield',

    render: function (root) {
      const st = MI.store, rows = st.rows, ds = st.dataset;
      const tenMove = st.isTenMove();

      /* ---------- Status ---------- */
      root.appendChild(el('div', { class: 'grid' }, [
        U.kpi({
          span: 'c3', accent: true, label: 'Perspectiva ativa', icon: 'eye',
          value: tenMove ? '10 Move' : 'Smoov',
          hint: tenMove ? 'Somente indicadores aprovados' : 'Acesso completo à base carregada'
        }),
        U.kpi({
          span: 'c3', label: 'Indicadores aprovados', icon: 'check',
          value: P.approvedCount() + ' / ' + P.INDICATORS.length,
          hint: P.approvedCount() === 0 ? 'Nada liberado para a 10 Move ainda' : 'Visíveis na perspectiva 10 Move'
        }),
        U.kpi({
          span: 'c3', label: 'Limite de supressão (k)', icon: 'lock',
          value: String(P.k),
          hint: 'Grupos menores que ' + P.k + ' registros são suprimidos'
        }),
        U.kpi({
          span: 'c3', label: 'Exportação da base bruta', icon: 'shield',
          value: 'Bloqueada',
          hint: 'Nenhuma perspectiva exporta registros individuais'
        })
      ]));

      /* ---------- Separação de áreas ---------- */
      root.appendChild(U.section('Separação de áreas', 'Como a plataforma divide o que é privado e o que é compartilhado'));
      root.appendChild(el('div', { class: 'grid' }, [
        U.card({
          span: 'c6', title: 'Área privada da Smoov',
          sub: 'Representante autorizado da Smoov',
          body: el('ul', { style: 'margin:0;padding-left:18px;font-size:12.5px;color:var(--muted);line-height:1.7' }, [
            el('li', {}, 'Importa a planilha e vê a pré-visualização das linhas'),
            el('li', {}, 'Acessa todos os painéis sem supressão (com opção de pré-visualizar como a 10 Move veria)'),
            el('li', {}, 'Define o limite k e aprova, um por um, os indicadores que podem ser compartilhados'),
            el('li', {}, 'Gera relatórios completos do próprio recorte')
          ])
        }),
        U.card({
          span: 'c6', title: 'Área de resultados da 10 Move',
          sub: 'Equipe de inteligência comercial',
          body: el('ul', { style: 'margin:0;padding-left:18px;font-size:12.5px;color:var(--muted);line-height:1.7' }, [
            el('li', {}, 'Vê apenas os indicadores marcados como aprovados'),
            el('li', {}, 'Todos os números passam pela supressão de grupos pequenos'),
            el('li', {}, 'Não tem acesso à importação, à pré-visualização das linhas nem à exportação de microdados'),
            el('li', {}, 'Relatórios gerados nesta perspectiva contêm somente o que foi liberado')
          ])
        })
      ]));

      /* ---------- Controles (só Smoov) ---------- */
      if (!tenMove) {
        root.appendChild(U.section('Controles de proteção', 'Valem para todos os painéis imediatamente'));

        const kInput = el('input', {
          class: 'input', type: 'number', min: '2', max: '500', value: String(P.k), style: 'max-width:110px', id: 'gov-k'
        });
        const kApply = U.btn('Aplicar', {
          variant: 'accent', sm: true, onClick: function () {
            P.setK(+kInput.value);
            MI.toast('Limite de supressão definido em ' + P.k + ' registros.', 'ok');
            MI.app.rerender();
          }
        });

        root.appendChild(el('div', { class: 'grid' }, [
          U.card({
            span: 'c6', title: 'Limite de supressão (k)',
            sub: 'Nenhuma categoria, célula ou combinação com menos de k registros é exibida nos agregados compartilhados',
            body: [
              el('div', { style: 'display:flex;gap:9px;align-items:flex-end;flex-wrap:wrap' }, [
                el('div', { class: 'field' }, [el('label', { class: 'field__label', for: 'gov-k' }, 'Mínimo de registros por grupo'), kInput]),
                kApply,
                el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [5, 10, 30, 50, 100].map(function (v) {
                  return el('button', {
                    class: 'chip' + (P.k === v ? ' is-on' : ''), type: 'button',
                    onclick: function () { P.setK(v); MI.app.rerender(); }
                  }, String(v));
                }))
              ]),
              el('div', { style: 'margin-top:14px' }, U.note(P.k < 10 ? 'warn' : null, [
                P.k < 10
                  ? [el('strong', { text: 'k baixo. ' }), 'Com k = ' + P.k + ', grupos muito pequenos continuam visíveis. Para dados pessoais, valores entre 20 e 50 são mais defensáveis.']
                  : [el('strong', { text: 'Como o valor afeta a análise. ' }), 'k maior protege mais, mas apaga mais categorias — cidades e nichos pequenos desaparecem dos relatórios. O painel de risco abaixo mostra o efeito real na base atual.']
              ]))
            ]
          }),
          U.card({
            span: 'c6', title: 'Pré-visualizar como a 10 Move',
            sub: 'Aplica a supressão também na área privada, para você conferir o que será entregue',
            body: [
              el('div', { class: 'switch-row' }, [
                el('div', {}, [
                  el('div', { class: 'field__label', text: 'Aplicar supressão na visão Smoov' }),
                  el('div', { class: 'field__hint', text: 'Os números reais continuam disponíveis ao desligar.' })
                ]),
                el('label', { class: 'switch' }, [
                  el('input', {
                    type: 'checkbox', checked: P.previewMask, id: 'gov-mask',
                    onchange: function (e) { P.setPreviewMask(e.target.checked); MI.app.rerender(); }
                  }),
                  el('i', {})
                ])
              ]),
              el('div', { style: 'margin-top:14px' }, U.note(null, [
                el('strong', { text: 'Com a opção desligada, ' }),
                'as células que seriam suprimidas aparecem destacadas em amarelo nos cruzamentos, ' +
                'para você identificar onde o compartilhamento perderia informação.'
              ]))
            ]
          })
        ]));

        /* ---------- Aprovação de indicadores ---------- */
        const autenticado = MI.auth && MI.auth.autenticado();
        root.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note(autenticado ? 'ok' : 'warn', [
          el('strong', { text: autenticado ? 'Aprovações gravadas no servidor. ' : 'Aprovações apenas neste navegador. ' }),
          autenticado
            ? 'Cada decisão vai para a tabela approved_indicators do Supabase, protegida por RLS: só este perfil escreve, ' +
            'e a visão da 10 Move lê de lá. A ação fica registrada na trilha de auditoria do servidor, que ninguém apaga.'
            : 'Sem sessão autenticada, o que você aprovar aqui vale só para esta máquina e não chega à 10 Move. ' +
            'Para valer de verdade, a plataforma precisa estar publicada com login — veja Configurações e Acessos › Publicação.'
        ])));

        root.appendChild(U.section('Indicadores liberados para a 10 Move',
          'Por padrão nada é compartilhado. Aprove item por item.', [
          U.btn('Aprovar todos', { sm: true, onClick: function () { P.setAllApproved(true); MI.toast('Todos os indicadores aprovados.', 'ok'); MI.app.rerender(); } }),
          U.btn('Revogar todos', { sm: true, variant: 'danger', onClick: function () { P.setAllApproved(false); MI.toast('Todas as aprovações revogadas.', 'ok'); MI.app.rerender(); } })
        ]));

        const grupos = {};
        P.INDICATORS.forEach(function (i) { (grupos[i.view] = grupos[i.view] || []).push(i); });
        const nomeView = {
          overview: 'Visão geral', profile: 'Perfil dos clientes', geography: 'Inteligência geográfica',
          behavior: 'Comportamento', opportunities: 'Oportunidades Comerciais',
          catalog: 'Cardápio & Produtos', consumption: 'Inteligência de Consumo'
        };

        root.appendChild(el('div', { class: 'grid' }, Object.keys(grupos).map(function (v) {
          return U.card({
            span: 'c6', title: nomeView[v] || v,
            sub: grupos[v].filter(function (i) { return P.isApproved(i.id); }).length + ' de ' + grupos[v].length + ' aprovados',
            body: el('div', { style: 'display:grid;gap:11px' }, grupos[v].map(function (i) {
              return el('div', { class: 'switch-row' }, [
                el('div', { style: 'min-width:0' }, [
                  el('div', { class: 'field__label' }, [
                    i.label,
                    i.sensitive ? el('span', { class: 'badge badge--warn', text: 'sensível' }) : null
                  ]),
                  el('div', { class: 'field__hint', text: i.desc })
                ]),
                el('label', { class: 'switch' }, [
                  el('input', {
                    type: 'checkbox', checked: P.isApproved(i.id),
                    onchange: function (e) { P.setApproved(i.id, e.target.checked); MI.app.rerender(); }
                  }),
                  el('i', {})
                ])
              ]);
            }))
          });
        })));
      }

      /* ---------- Painel de risco ---------- */
      root.appendChild(U.section('Risco de reidentificação', 'Medição real de k-anonimato sobre a base carregada'));
      const risco = P.riskReport(ds.rows);
      if (!risco.length) {
        root.appendChild(el('div', { class: 'grid' }, U.card({
          span: 'c12',
          body: U.unavailable('Não há combinações de quase-identificadores mensuráveis nesta base',
            ['Estado / UF', 'Cidade', 'Gênero', 'Idade'])
        })));
      } else {
        const pior = risco[0];
        root.appendChild(el('div', { class: 'grid' }, [
          U.card({
            span: 'c12',
            title: 'Combinações de atributos que podem isolar indivíduos',
            sub: 'Cada linha é uma combinação possível. “Classes” são os grupos distintos formados por ela.',
            body: [
              U.table([
                { label: 'Combinação de atributos' },
                { label: 'Grupos distintos', num: true },
                { label: 'Menor grupo', num: true },
                { label: 'Grupos de 1', num: true },
                { label: 'Grupos < k', num: true },
                { label: '% de registros em risco', num: true },
                { label: 'Situação' }
              ], risco.map(function (r) {
                const badge = el('span', {
                  class: 'badge badge--' + (r.level === 'ok' ? 'ok' : r.level === 'alto' ? 'crit' : 'warn'),
                  text: r.level === 'ok' ? 'Dentro do limite' : r.level === 'alto' ? 'Risco alto' : r.level === 'medio' ? 'Registros isolados' : 'Atenção'
                });
                return {
                  cells: [
                    { v: r.label },
                    { v: MI.fmt.int(r.classes), num: true },
                    { v: MI.fmt.int(r.minK), num: true, risk: r.minK < P.k },
                    { v: MI.fmt.int(r.singletons), num: true, risk: r.singletons > 0 },
                    { v: MI.fmt.int(r.classesBelowK), num: true },
                    { v: MI.fmt.pct(r.shareBelowK, 2), num: true },
                    { v: badge }
                  ]
                };
              })),
              el('div', { style: 'margin-top:14px' }, U.note(pior.minK < P.k ? 'warn' : 'ok', [
                el('strong', { text: pior.minK < P.k ? 'A base não é k-anônima para todas as combinações. ' : 'Todas as combinações medidas respeitam o limite. ' }),
                pior.minK < P.k
                  ? 'A combinação “' + pior.label + '” forma ' + MI.fmt.int(pior.classesBelowK) +
                  ' grupos com menos de ' + P.k + ' registros, abrangendo ' + MI.fmt.pct(pior.shareBelowK, 2) +
                  ' da base' + (pior.singletons ? ' — incluindo ' + MI.fmt.int(pior.singletons) + ' registro(s) completamente isolado(s)' : '') +
                  '. A supressão de células resolve isso nos relatórios, mas um atacante que combine vários relatórios diferentes ' +
                  'ainda pode estreitar o cerco. Por isso a liberação deve ser por indicador, e não em bloco.'
                  : 'Mesmo assim, agregação não é anonimização garantida: a divulgação repetida de recortes diferentes ao longo do tempo ' +
                  'pode permitir inferências que nenhum relatório isolado permitiria.'
              ]))
            ]
          })
        ]));
      }

      /* ---------- O que esta versão NÃO garante ---------- */
      root.appendChild(U.section('O que esta versão não garante', 'Declaração honesta de limites técnicos'));
      root.appendChild(el('div', { class: 'grid' }, [
        U.card({
          span: 'c6', title: 'Implementado e funcionando',
          body: el('div', { class: 'findings' }, [
            item('ok', 'Processamento local', 'A planilha é lida e analisada no navegador, com FileReader e SheetJS. Nenhum registro é transmitido.'),
            item('ok', 'Supressão de grupos pequenos', 'Categorias e células abaixo de k são agrupadas em “Suprimido” nos agregados.'),
            item('ok', 'Medição de k-anonimato', 'Cálculo real de classes de equivalência sobre combinações de quase-identificadores.'),
            item('ok', 'Liberação por indicador', 'A visão 10 Move só exibe o que foi explicitamente aprovado.'),
            item('ok', 'Bloqueio de microdados', 'Nenhuma perspectiva exporta registros individuais; relatórios contêm apenas agregados.')
          ])
        }),
        U.card({
          span: 'c6', title: 'Exige backend para produção',
          body: el('div', { class: 'findings' }, [
            item('crit', 'Autenticação real', 'A troca de perspectiva é uma preferência de interface, não um controle de acesso. Qualquer pessoa com a página aberta pode alternar.'),
            item('crit', 'Autorização no servidor', 'As regras de visibilidade rodam no cliente e podem ser contornadas por quem inspecionar o código.'),
            item('crit', 'Isolamento por organização', 'Não há separação de dados por empresa, por usuário ou por sessão.'),
            item('crit', 'Auditoria confiável', 'A trilha de aprovações fica no armazenamento local do navegador e pode ser apagada ou editada pelo próprio usuário.'),
            item('warn', 'Revisão formal de privacidade', 'Compartilhamento de dados pessoais entre empresas exige base legal, contrato de tratamento e avaliação de impacto sob a LGPD.')
          ])
        })
      ]));

      /* ---------- Trilha ---------- */
      root.appendChild(U.section('Trilha de decisões', 'Registro local das aprovações e importações', [
        P.trail.length ? U.btn('Limpar trilha', { sm: true, variant: 'ghost', onClick: function () { P.clearTrail(); MI.app.rerender(); } }) : null
      ].filter(Boolean)));
      root.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12',
        sub: 'Armazenada apenas neste navegador — não substitui auditoria de servidor',
        body: P.trail.length
          ? U.table([{ label: 'Quando' }, { label: 'Ação' }, { label: 'Indicador / alvo' }], P.trail.slice(0, 40).map(function (t) {
            const d = new Date(t.t);
            return {
              cells: [
                { v: MI.fmt.date(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') },
                { v: t.acao },
                { v: t.alvo === '*' ? 'todos os indicadores' : ((P.INDICATOR_BY_ID[t.alvo] && P.INDICATOR_BY_ID[t.alvo].label) || t.alvo) }
              ]
            };
          }))
          : U.empty('Nenhuma decisão registrada ainda', 'Aprovar um indicador ou importar uma planilha cria uma entrada aqui.')
      })));
    }
  };

  function item(level, titulo, texto) {
    return el('article', { class: 'finding', style: 'border-left-color:var(--' + (level === 'ok' ? 'ok' : level === 'crit' ? 'crit' : 'warn') + ')' }, [
      el('div', { class: 'finding__top' }, [
        el('span', { class: 'badge badge--' + (level === 'ok' ? 'ok' : level === 'crit' ? 'crit' : 'warn') },
          level === 'ok' ? 'Funcionando' : level === 'crit' ? 'Não implementado' : 'Fora do software')
      ]),
      el('h4', { text: titulo }),
      el('p', { text: texto })
    ]);
  }

})(window.MI);
