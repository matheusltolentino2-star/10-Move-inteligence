/* 10 Move Intelligence — gerenciamento das bases importadas
   -------------------------------------------------------------------------
   Componente único, usado na Inteligência de Consumo (só transações) e em
   Configurações › Fontes de dados (todos os tipos).

   A confirmação de exclusão mostra o tamanho do estrago antes de perguntar,
   e obriga a digitar o nome da base. Botão de "tem certeza?" sozinho vira
   reflexo depois da terceira vez; digitar o nome obriga a olhar qual base
   está selecionada — que é exatamente o erro que custa caro aqui.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui, B = function () { return MI.bases; };

  const UI = {};

  UI.render = function (host, opts) {
    opts = opts || {};
    const tipos = opts.tipos || ['clientes', 'transacoes'];
    const bases = B();

    if (!bases || !bases.disponivel()) {
      host.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', title: 'Bases importadas',
        body: U.unavailable('As bases publicadas ficam no servidor e exigem sessão ativa',
          ['Entrar na plataforma', 'Pertencer a uma organização'])
      })));
      return;
    }

    if (!bases.carregado) {
      bases.listar().then(function () { MI.app.rerender(); });
      host.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', body: U.empty('Carregando as bases publicadas…')
      })));
      return;
    }

    const lista = bases.itens.filter(function (d) { return tipos.indexOf(d.kind) >= 0; });
    const pode = bases.podeEditar();

    if (!lista.length) { vazio(host, opts, tipos); return; }

    host.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      title: opts.titulo || 'Bases importadas',
      sub: MI.fmt.int(lista.length) + (lista.length === 1 ? ' base publicada' : ' bases publicadas') +
        ' · a ativa é a que os painéis estão usando',
      tools: pode && opts.aoImportar ? [U.btn('Importar outra', { sm: true, icon: 'upload', onClick: opts.aoImportar })] : null,
      body: el('div', { class: 'bases' }, lista.map(function (d) { return linha(d, pode); }))
    })));
  };

  function vazio(host, opts, tipos) {
    const soTransacoes = tipos.length === 1 && tipos[0] === 'transacoes';
    host.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      body: el('div', { class: 'vazio-base' }, [
        el('div', { class: 'vazio-base__icone', html: MI.icon('database', 28) }),
        el('h4', { text: soTransacoes ? 'Nenhuma base de consumo importada' : 'Nenhuma base publicada' }),
        el('p', {
          text: soTransacoes
            ? 'A Inteligência de Consumo precisa de uma planilha com uma linha por item de pedido. Sem ela não há o que analisar, e gráfico vazio não informa nada.'
            : 'Publique uma base para que ela fique disponível a todos os membros da organização.'
        }),
        el('div', { class: 'vazio-base__formato' }, [
          el('strong', { text: 'Formato aceito: ' }),
          'XLSX ou CSV, uma linha por item de pedido. Colunas úteis: identificador do pedido, ' +
          'identificador do cliente, produto ou SKU, quantidade, valor, data, hora, canal e unidade. ' +
          'O que faltar apenas reduz as análises possíveis; nada é obrigatório além do produto.'
        ]),
        opts.aoImportar ? el('div', { style: 'margin-top:16px' }, U.btn('Importar base', {
          variant: 'accent', icon: 'upload', onClick: opts.aoImportar
        })) : null
      ].filter(Boolean))
    })));
  }

  function linha(d, pode) {
    const acoes = [];
    if (pode) {
      acoes.push(d.is_active
        ? U.btn('Desativar', {
          sm: true, variant: 'ghost',
          title: 'A base continua guardada e volta com um clique',
          onClick: function () { agir(B().desativar(d), 'Base desativada.'); }
        })
        : U.btn('Ativar', {
          sm: true, variant: 'accent', icon: 'check',
          title: 'Passa a ser a base que os painéis usam',
          onClick: function () { agir(B().ativar(d), 'Base ativada.'); }
        }));
      acoes.push(U.btn('Renomear', { sm: true, variant: 'ghost', onClick: function () { renomear(d); } }));
      acoes.push(U.btn('Excluir', { sm: true, variant: 'danger', icon: 'trash', onClick: function () { excluir(d); } }));
    }

    return el('article', { class: 'base' + (d.is_active ? ' is-ativa' : '') }, [
      el('div', { class: 'base__topo' }, [
        el('div', { class: 'base__id' }, [
          el('h4', { text: d.name }),
          el('span', { class: 'base__badge ' + (d.is_active ? 'is-ativa' : 'is-inativa'), text: d.is_active ? 'ativa' : 'inativa' }),
          el('span', { class: 'base__tipo', text: B().rotuloTipo(d.kind) })
        ]),
        acoes.length ? el('div', { class: 'base__acoes' }, acoes) : null
      ].filter(Boolean)),
      el('dl', { class: 'base__meta' }, [
        item('Arquivo', d.file_name || '—'),
        item('Registros', MI.fmt.int(d.row_count || 0)),
        item('Colunas', MI.fmt.int(d.colunas || 0)),
        item('Importada em', d.uploaded_at ? MI.fmt.date(new Date(d.uploaded_at)) : '—'),
        item('Responsável', d.uploaded_email || (d.uploaded_by === (MI.auth.user && MI.auth.user.id) ? (MI.auth.user.email || 'você') : 'não registrado')),
        item('Identificador', String(d.id).slice(0, 8))
      ])
    ]);
  }

  function item(k, v) {
    return el('div', { class: 'base__campo' }, [el('dt', { text: k }), el('dd', { text: String(v) })]);
  }

  /* A lista se redesenha por conta própria em vez de depender da recarga
     dos painéis: se a recarga falhar, a tela não pode continuar mostrando
     o estado anterior como se nada tivesse acontecido. */
  function agir(promessa, msgOk) {
    promessa
      .then(function () { return B().recarregarPaineis(); })
      .then(function () { MI.toast(msgOk, 'ok'); })
      .catch(function (e) { MI.toast(e.message || String(e), 'error'); })
      .then(function () { MI.app.rerender(); });
  }

  function renomear(d) {
    const campo = el('input', { class: 'input', value: d.name });
    const m = U.modal({
      title: 'Renomear base',
      body: el('div', { class: 'field' }, [el('label', { class: 'field__label' }, 'Nome'), campo]),
      actions: [
        U.btn('Salvar', {
          variant: 'accent', icon: 'check', onClick: function () {
            B().renomear(d, campo.value).then(function () {
              m.close(); MI.toast('Base renomeada.', 'ok'); MI.app.rerender();
            }).catch(function (e) { MI.toast(e.message, 'error'); });
          }
        }),
        U.btn('Cancelar', { variant: 'ghost', onClick: function () { m.close(); } })
      ]
    });
  }

  function excluir(d) {
    const dep = B().dependencias(d);
    const confirma = el('input', { class: 'input', placeholder: d.name, autocomplete: 'off' });
    const botao = U.btn('Excluir definitivamente', {
      variant: 'danger', icon: 'trash', disabled: true,
      onClick: function () {
        botao.disabled = true;
        B().excluir(d)
          .then(function (info) {
            m.close();
            return B().recarregarPaineis()
              .catch(function (e) { console.error('Recarga após exclusão:', e); })
              .then(function () {
                MI.toast('“' + d.name + '” excluída: ' + MI.fmt.int(info.removida_linhas || d.row_count || 0) +
                  ' registros e ' + MI.fmt.int(info.blocos || 0) + ' blocos removidos do servidor.', 'ok');
                MI.app.rerender();
              });
          })
          .catch(function (e) { botao.disabled = false; MI.toast(e.message || String(e), 'error'); });
      }
    });
    /* digitar o nome evita o clique automático de quem já viu a caixa três
       vezes, e obriga a conferir qual base está selecionada */
    confirma.addEventListener('input', function () {
      botao.disabled = MI.slug(confirma.value) !== MI.slug(d.name);
    });

    const m = U.modal({
      title: 'Excluir base',
      body: [
        U.note('crit', [
          el('strong', { text: 'Isto não tem volta. ' }),
          MI.fmt.int(d.row_count || 0) + ' registros e ' + MI.fmt.int(d.chunk_count || 0) +
          ' blocos saem do servidor. Para tirar a base do caminho sem perdê-la, use Desativar.'
        ]),
        el('div', { class: 'base__dep' }, [
          el('div', { class: 'field__label', text: 'O que depende desta base' }),
          el('ul', {}, dep.map(function (t) { return el('li', { text: t }); }))
        ]),
        el('div', { class: 'field', style: 'margin-top:14px' }, [
          el('label', { class: 'field__label' }, 'Digite “' + d.name + '” para confirmar'),
          confirma
        ])
      ],
      actions: [botao, U.btn('Cancelar', { variant: 'ghost', onClick: function () { m.close(); } })]
    });
  }

  MI.basesUI = UI;

})(window.MI);
