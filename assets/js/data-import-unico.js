/* 10 Move Intelligence — uma planilha, tudo o que ela tiver
   -------------------------------------------------------------------------
   Antes, uma pasta de trabalho com três abas exigia três idas à tela de
   importação: clientes numa aba, transações noutra, cardápio numa terceira
   — e o cardápio só era lido se calhasse de ser a PRIMEIRA aba do arquivo,
   porque o importador de catálogo pegava sheets[0] sem perguntar.

   Aqui o arquivo é lido uma vez, cada aba é classificada pelo mesmo motor
   que já existe, e tudo é aplicado numa passada: cardápio, clientes,
   transações e as unidades que aparecerem nas vendas.

   A ORDEM NÃO É ARBITRÁRIA
   Cardápio primeiro, para as transações terem contra o que casar.
   Clientes antes de transações, para a ligação por identificador existir
   no momento do vínculo. Unidades por último, porque saem das transações.

   O palpite nunca é definitivo: a tela mostra o que foi reconhecido, com o
   porquê, e deixa trocar o tipo ou pular a aba antes de aplicar.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const U = {};

  const ACOES = {
    clientes: 'Vira a base de clientes',
    transacoes: 'Vira a base de transações',
    cardapio: 'Entra no catálogo de produtos',
    ignorar: 'Fica de fora'
  };
  U.ACOES = ACOES;

  /* Lê o arquivo uma vez e descreve cada aba. Abas que não parecem nada são
     marcadas para ignorar em vez de entrarem como palpite ruim. */
  U.analisar = function (file, onProgress) {
    return MI.importer.readFile(file, onProgress).then(function (src) {
      const abas = [];
      src.sheets.forEach(function (s) {
        let ex = null, erro = null;
        try { ex = MI.importer.extractSheet(src, s.name, {}); }
        catch (e) { erro = e.message || String(e); }
        if (!ex || !ex.rows.length) {
          abas.push({ nome: s.name, erro: erro || 'Sem linhas utilizáveis', tipo: 'ignorar', linhas: 0, colunas: 0 });
          return;
        }
        const classe = MI.classify.classificar(ex);
        abas.push({
          nome: s.name, ex: ex, classe: classe,
          tipo: classe.tipo || 'ignorar',
          linhas: ex.rows.length, colunas: ex.headers.length,
          contexto: ex.contexto, confianca: classe.confianca
        });
      });
      return { fileName: file.name, fileSize: file.size, src: src, abas: abas };
    });
  };

  /* Aplica o plano inteiro. Cada passo é protegido: uma aba que falhe não
     derruba as outras, e o relatório diz o que entrou e o que não. */
  U.aplicar = function (plano) {
    const rel = { feitos: [], falhas: [], unidades: 0, produtosNovos: 0 };
    const pega = function (tipo) {
      return plano.abas.filter(function (a) { return a.tipo === tipo && a.ex; })[0] || null;
    };

    /* 1. cardápio */
    const cat = pega('cardapio');
    if (cat) {
      try {
        const mapping = MI.catalog.inferirMapeamento(cat.ex.headers);
        const itens = MI.catalog.construirDeLinhas(cat.ex.rows, mapping, plano.fileName);
        if (!itens.length) throw new Error('Nenhum produto reconhecido na aba.');
        MI.catalog.setItems(itens, 'import', plano.fileName);
        rel.feitos.push({ aba: cat.nome, o: MI.fmt.int(itens.length) + ' produtos no catálogo' });
      } catch (e) {
        rel.falhas.push({ aba: cat.nome, erro: e.message || String(e) });
      }
    }

    /* 2. clientes */
    const cli = pega('clientes');
    if (cli) {
      try {
        const ds = MI.importer.buildDataset(cli.ex, {
          name: plano.fileName.replace(/\.[^.]+$/, '') + (plano.abas.length > 1 ? ' · ' + cli.nome : ''),
          fileName: plano.fileName, fileSize: plano.fileSize, sheetName: cli.nome
        });
        MI.store.setDataset(ds);
        rel.dataset = ds;
        rel.feitos.push({ aba: cli.nome, o: MI.fmt.int(ds.rows.length) + ' clientes' });
      } catch (e) {
        rel.falhas.push({ aba: cli.nome, erro: e.message || String(e) });
      }
    }

    /* 3. transações */
    const tx = pega('transacoes');
    if (tx) {
      try {
        const mapa = MI.tx.inferirMapeamento(tx.ex.headers);
        if (!mapa.produto && !mapa.sku) throw new Error('Sem coluna de produto nem de SKU.');
        const link = MI.tx.importarDeLinhas(tx.ex.rows, tx.ex.headers, mapa, plano.fileName,
          rel.dataset ? rel.dataset.columns : null);
        rel.link = link;
        rel.produtosNovos = (MI.tx.ultimaAbsorcao && MI.tx.ultimaAbsorcao.criados) || 0;
        rel.feitos.push({
          aba: tx.nome,
          o: MI.fmt.int(link.itens) + ' itens de pedido · ' + MI.fmt.pct(link.taxaProduto, 0) + ' casados com o catálogo'
        });
      } catch (e) {
        rel.falhas.push({ aba: tx.nome, erro: e.message || String(e) });
      }
    } else if (cli) {
      /* base de clientes nova sem transações novas: as antigas apontam para
         clientes que já não existem */
      if (MI.tx.has() && MI.tx.isDemo()) MI.tx.clear();
      else if (MI.tx.has()) MI.tx.relink();
    }

    return Promise.resolve(rel);
  };

  /* As unidades saem das transações e vão para o servidor, então este passo
     é assíncrono e separado do resto. */
  U.semearUnidades = function (rel) {
    if (!MI.unidades || !MI.unidades.podeEditar || !MI.unidades.podeEditar()) return Promise.resolve(rel);
    return MI.unidades.semear()
      .then(function (r) { rel.unidades = (r && r.criadas) || 0; return rel; })
      .catch(function () { return rel; });
  };

  /* Resumo do que o plano fará, para a tela não precisar recalcular. */
  U.resumo = function (plano) {
    const r = { clientes: 0, transacoes: 0, produtos: 0, ignoradas: 0, conflitos: [] };
    const vistos = {};
    plano.abas.forEach(function (a) {
      if (a.tipo === 'ignorar') { r.ignoradas++; return; }
      if (vistos[a.tipo]) r.conflitos.push(a.tipo);
      vistos[a.tipo] = true;
      if (a.tipo === 'clientes') r.clientes = a.linhas;
      if (a.tipo === 'transacoes') r.transacoes = a.linhas;
      if (a.tipo === 'cardapio') r.produtos = a.linhas;
    });
    return r;
  };

  MI.importUnico = U;

})(window.MI);
