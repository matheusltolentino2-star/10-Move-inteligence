/* 10 Move Intelligence — tela da importação unificada
   -------------------------------------------------------------------------
   Um arquivo, uma revisão, um botão. A revisão existe porque classificação
   automática é palpite: a tela mostra o que reconheceu e por quê, e deixa
   corrigir antes de aplicar.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';
  const el = MI.el, U = MI.ui;
  const S = { busy: false, prog: 0, msg: '', plano: null, relatorio: null };
  const V = {};

  V.reset = function () { S.plano = null; S.relatorio = null; S.busy = false; };

  async function ler(file) {
    S.busy = true; S.prog = 0.05; S.msg = 'Abrindo ' + file.name + '…';
    MI.app.rerender();
    try {
      if (await MI.fullWorkbook.isFullBatch(file)) {
        S.busy = false;
        MI.fullData.openFromPicker(file);
        return;
      }
      const plano = await MI.importUnico.analisar(file, function (p, m) {
        S.prog = p; S.msg = m;
        const b = MI.$('#uni-bar'), l = MI.$('#uni-msg');
        if (b) b.style.width = Math.round(p * 100) + '%';
        if (l) l.textContent = m;
      });
      S.busy = false; S.plano = plano; S.relatorio = null;
      MI.toast(plano.abas.length + (plano.abas.length === 1 ? ' aba lida.' : ' abas lidas.'), 'ok');
    } catch (e) {
      S.busy = false;
      MI.toast(e.message || 'Falha ao ler o arquivo.', 'error');
    }
    MI.app.rerender();
  }

  function aplicar() {
    const plano = S.plano;
    if (!plano) return;
    S.busy = true; S.msg = 'Aplicando…'; MI.app.rerender();
    MI.importUnico.aplicar(plano)
      .then(function (rel) { return MI.importUnico.semearUnidades(rel); })
      .then(function (rel) {
        S.busy = false; S.relatorio = rel;
        MI.privacy.log('importou planilha unificada', plano.fileName + ' · ' +
          rel.feitos.map(function (f) { return f.aba; }).join(', '));
        MI.toast(rel.feitos.length + ' abas aplicadas.', rel.falhas.length ? 'warn' : 'ok');
        MI.app.rerender();
      })
      .catch(function (e) {
        S.busy = false;
        MI.toast(e.message || String(e), 'error');
        MI.app.rerender();
      });
  }

  function zona() {
    const inp = el('input', { type: 'file', accept: '.xlsx,.xls,.csv,.tsv', style: 'display:none', id: 'uni-file' });
    inp.addEventListener('change', function () { if (inp.files && inp.files[0]) ler(inp.files[0]); });
    const alvo = el('div', { class: 'drop' }, [
      el('div', { html: MI.icon('upload', 26) }),
      el('h4', { text: 'Solte a planilha da Smoov aqui' }),
      el('p', {
        text: 'Uma pasta de trabalho só, com quantas abas tiver. A aplicação reconhece cada aba — ' +
          'clientes, pedidos, cardápio — e aplica tudo de uma vez.'
      }),
      U.btn('Escolher arquivo', { variant: 'accent', icon: 'upload', onClick: function () { inp.click(); } }),
      inp
    ]);
    alvo.addEventListener('dragover', function (e) { e.preventDefault(); alvo.classList.add('is-over'); });
    alvo.addEventListener('dragleave', function () { alvo.classList.remove('is-over'); });
    alvo.addEventListener('drop', function (e) {
      e.preventDefault(); alvo.classList.remove('is-over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) ler(f);
    });
    return alvo;
  }

  function linhaAba(a) {
    const opcoes = ['clientes', 'transacoes', 'cardapio', 'ignorar'];
    const sel = el('select', { class: 'input input--sm' }, opcoes.map(function (o) {
      return el('option', {
        value: o, selected: a.tipo === o ? '' : null,
        text: o === 'ignorar' ? 'Ignorar' : MI.classify.nomeTipo(o)
      });
    }));
    sel.disabled = !a.ex;
    sel.addEventListener('change', function () { a.tipo = sel.value; MI.app.rerender(); });

    const motivos = a.classe && a.classe.motivos && a.classe.motivos.length
      ? a.classe.motivos.slice(0, 3).join('; ')
      : (a.erro || 'nada reconhecível');

    return {
      cells: [
        { v: a.nome },
        { v: a.erro ? '—' : MI.fmt.int(a.linhas), num: true },
        { v: a.erro ? '—' : MI.fmt.int(a.colunas), num: true },
        {
          v: a.classe && a.classe.tipo
            ? MI.classify.nomeTipo(a.classe.tipo) + ' · ' + MI.fmt.pct(a.confianca, 0)
            : '—',
          risk: !a.classe || !a.classe.tipo
        },
        { v: motivos, title: motivos },
        { v: sel }
      ]
    };
  }

  V.render = function (host) {
    if (MI.store.perspective !== 'smoov') {
      host.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12', title: 'Importação restrita ao administrador da Smoov',
        body: U.unavailable('Sem permissão neste perfil', ['Perfil Administrador Smoov'])
      })));
      return;
    }

    host.appendChild(el('div', { style: 'margin-bottom:14px' }, U.note(null, [
      el('strong', { text: 'Um arquivo resolve. ' }),
      'A planilha é lida uma vez e cada aba é reconhecida sozinha. Cardápio entra antes, para as ' +
      'vendas terem contra o que casar; clientes antes das transações, para a ligação existir na hora ' +
      'do vínculo; e as unidades saem das próprias vendas no fim.'
    ])));

    if (S.busy) {
      host.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12',
        body: [
          el('p', { class: 'field__hint', id: 'uni-msg', text: S.msg }),
          el('div', { class: 'prog' }, el('i', { id: 'uni-bar', style: 'width:' + Math.round(S.prog * 100) + '%' }))
        ]
      })));
      return;
    }

    /* relatório do que entrou */
    if (S.relatorio) {
      const r = S.relatorio;
      host.appendChild(U.section('Importação concluída', S.plano.fileName));
      host.appendChild(el('div', { class: 'grid' }, U.card({
        span: 'c12',
        body: [
          r.feitos.length ? U.note('ok', [
            el('strong', { text: 'Aplicado: ' }),
            r.feitos.map(function (f) { return f.aba + ' → ' + f.o; }).join(' · ')
          ]) : null,
          r.produtosNovos ? el('div', { style: 'margin-top:10px' }, U.note(null,
            MI.fmt.int(r.produtosNovos) + ' produtos vendidos que não estavam no cardápio entraram sozinhos. ' +
            'Confira em Cardápio & Produtos › Qualidade e cobertura.')) : null,
          r.unidades ? el('div', { style: 'margin-top:10px' }, U.note(null,
            MI.fmt.int(r.unidades) + ' unidades entraram no cadastro a partir das vendas.')) : null,
          r.falhas.length ? el('div', { style: 'margin-top:10px' }, U.note('crit', [
            el('strong', { text: 'Não entraram: ' }),
            r.falhas.map(function (f) { return f.aba + ' (' + f.erro + ')'; }).join(' · ')
          ])) : null,
          el('div', { style: 'margin-top:14px;display:flex;gap:8px;flex-wrap:wrap' }, [
            U.btn('Ver a Visão geral', { variant: 'accent', icon: 'dashboard', onClick: function () { V.reset(); MI.app.go('overview'); } }),
            U.btn('Importar outra planilha', { variant: 'ghost', onClick: function () { V.reset(); MI.app.rerender(); } })
          ])
        ].filter(Boolean)
      })));
      return;
    }

    if (!S.plano) {
      host.appendChild(el('div', { class: 'grid' }, U.card({ span: 'c12', body: zona() })));
      return;
    }

    /* revisão */
    const plano = S.plano;
    const res = MI.importUnico.resumo(plano);
    const nada = !res.clientes && !res.transacoes && !res.produtos;

    host.appendChild(U.section('O que foi reconhecido', plano.fileName, [
      U.btn('Aplicar tudo', {
        variant: 'accent', icon: 'check', disabled: nada,
        title: nada ? 'Nenhuma aba está marcada para entrar' : null,
        onClick: aplicar
      }),
      U.btn('Cancelar', { variant: 'ghost', onClick: function () { V.reset(); MI.app.rerender(); } })
    ]));

    host.appendChild(el('div', { class: 'grid' }, U.card({
      span: 'c12',
      body: [
        U.table(
          [{ label: 'Aba' }, { label: 'Linhas', num: true }, { label: 'Colunas', num: true },
          { label: 'Reconhecido como' }, { label: 'Pelo que foi encontrado' }, { label: 'O que fazer' }],
          plano.abas.map(linhaAba)
        ),
        res.conflitos.length ? el('div', { style: 'margin-top:12px' }, U.note('warn', [
          el('strong', { text: 'Duas abas disputam o mesmo papel. ' }),
          'Só a primeira de cada tipo é aplicada. Marque as outras como Ignorar, ou troque o tipo.'
        ])) : null,
        el('div', { style: 'margin-top:12px' }, U.statline([
          { k: 'Clientes', v: res.clientes ? MI.fmt.int(res.clientes) : '—' },
          { k: 'Itens de pedido', v: res.transacoes ? MI.fmt.int(res.transacoes) : '—' },
          { k: 'Produtos', v: res.produtos ? MI.fmt.int(res.produtos) : '—' },
          { k: 'Abas ignoradas', v: MI.fmt.int(res.ignoradas) }
        ])),
        el('div', { style: 'margin-top:12px' }, U.note(nada ? 'warn' : null, nada
          ? 'Nenhuma aba foi marcada para entrar. Escolha o tipo de pelo menos uma.'
          : 'Aplicar substitui a base ativa de cada tipo que estiver marcado. O que não estiver na planilha fica como está.'))
      ].filter(Boolean)
    })));
  };

  MI.importUnicoUI = V;

})(window.MI);
