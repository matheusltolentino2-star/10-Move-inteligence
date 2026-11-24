/* 10 Move Intelligence — transações (pedidos e itens de pedido)
   -------------------------------------------------------------------------
   Estrutura flexível de correspondência entre clientes, pedidos, itens e
   produtos do catálogo. Quando não há identificador ou campo suficiente, a
   plataforma NÃO inventa associação: reporta o que falta e mantém as
   análises separadas.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const T = {
    items: [],            // itens de pedido normalizados
    source: null,         // 'demo' | 'import' | null
    fileName: null,
    headers: [],
    columns: [],
    mapping: {},          // campo -> coluna da planilha
    link: null,           // diagnóstico da ligação com clientes e catálogo
    listeners: [],

    on: function (cb) { T.listeners.push(cb); },
    emit: function () { T.listeners.forEach(function (cb) { cb(T); }); },
    has: function () { return T.items.length > 0; },
    isDemo: function () { return T.source === 'demo'; },

    clear: function () {
      T.items = []; T.source = null; T.fileName = null; T.link = null;
      T._cacheRows = null; T._cacheFiltered = null;
      T.emit();
    }
  };

  /* ================= Campos esperados ================= */
  T.CAMPOS = [
    { key: 'idPedido', label: 'Identificador do pedido', match: /id_?pedido|pedido_?id|num_?pedido|order_?id|^pedido$|^order$|cupom|comanda|nota/ },
    { key: 'idCliente', label: 'Identificador do cliente', match: /id_?cliente|cliente_?id|customer|user_?id|cod_?cliente|^cliente$|cpf/ },
    { key: 'sku', label: 'SKU / código do produto', match: /sku|cod_?prod|codigo_?produto|ean|id_?produto|referencia/ },
    { key: 'produto', label: 'Nome do produto', match: /produto|item|descricao_?item|nome_?produto|^descricao$|^item$/ },
    { key: 'tamanho', label: 'Tamanho / variação', match: /tamanho|volume|size|porcao|variacao/ },
    { key: 'categoria', label: 'Categoria (se houver na transação)', match: /categoria|grupo|secao|linha/ },
    { key: 'data', label: 'Data do pedido', match: /data|date|dt_|emissao|competencia/ },
    { key: 'hora', label: 'Hora do pedido', match: /hora|horario|hour|time/ },
    { key: 'quantidade', label: 'Quantidade', match: /qtd|quantidade|qty|quant|unidades/ },
    { key: 'valorUnitario', label: 'Valor unitário', match: /valor_?unit|preco_?unit|unit_?price|vlr_?unit|preco$/ },
    { key: 'valorTotal', label: 'Valor total do item', match: /valor_?total|total|vlr_?total|subtotal|valor$|receita/ },
    { key: 'canal', label: 'Canal de venda', match: /canal|channel|origem|plataforma|modalidade|delivery/ },
    { key: 'unidade', label: 'Unidade / loja', match: /unidade|loja|filial|praca|estabelecimento/ }
  ];

  T.inferirMapeamento = function (headers) {
    const usado = {}, out = {}, pares = [];
    headers.forEach(function (h) {
      const s = MI.slug(h);
      T.CAMPOS.forEach(function (c) {
        if (c.match.test(s)) pares.push({ header: h, campo: c.key, score: 100 - Math.abs(s.length - 10) });
      });
    });
    pares.sort(function (a, b) { return b.score - a.score; });
    pares.forEach(function (p) {
      if (usado[p.header] || out[p.campo]) return;
      usado[p.header] = true; out[p.campo] = p.header;
    });
    return out;
  };

  /* ================= Normalização ================= */
  function normalizar(rows, mapping) {
    const g = function (r, campo) {
      const h = mapping[campo];
      if (!h) return null;
      const v = r[h];
      return v === '' || v == null ? null : v;
    };
    const out = new Array(rows.length);
    let n = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const nome = g(r, 'produto');
      const sku = g(r, 'sku');
      if (!nome && !sku) continue;

      const d = g(r, 'data') ? MI.parseDate(g(r, 'data')) : null;
      let hora = null;
      const hRaw = g(r, 'hora');
      if (hRaw != null) {
        const s = String(hRaw).trim();
        const m = s.match(/^(\d{1,2})[:h]/);
        if (m) hora = +m[1];
        else if (/^\d{1,2}$/.test(s) && +s <= 23) hora = +s;
        else if (typeof hRaw === 'number' && hRaw > 0 && hRaw < 1) hora = Math.floor(hRaw * 24);
      }
      if (hora == null && d && /\d{1,2}:\d{2}/.test(String(g(r, 'data')))) hora = d.getHours();
      if (hora != null && (hora < 0 || hora > 23)) hora = null;

      const qtd = g(r, 'quantidade') != null ? MI.parseNumber(g(r, 'quantidade')) : 1;
      const vUnit = g(r, 'valorUnitario') != null ? MI.parseNumber(g(r, 'valorUnitario')) : null;
      let vTotal = g(r, 'valorTotal') != null ? MI.parseNumber(g(r, 'valorTotal')) : null;
      if (vTotal == null && vUnit != null && qtd != null) vTotal = vUnit * qtd;

      out[n++] = {
        _pedido: g(r, 'idPedido') != null ? String(g(r, 'idPedido')) : null,
        _cliente: g(r, 'idCliente') != null ? String(g(r, 'idCliente')) : null,
        _sku: sku != null ? String(sku) : null,
        _nome: nome != null ? String(nome).trim() : null,
        _tamanho: g(r, 'tamanho') != null ? String(g(r, 'tamanho')).trim() : null,
        _catBruta: g(r, 'categoria') != null ? String(g(r, 'categoria')).trim() : null,
        _data: d, _mes: d ? MI.monthKey(d) : null, _dow: d ? d.getDay() : null, _hora: hora,
        _qtd: qtd != null && qtd > 0 ? qtd : 1,
        _valorUnit: vUnit, _valor: vTotal,
        _canal: g(r, 'canal') != null ? String(g(r, 'canal')).trim() : null,
        _unidade: g(r, 'unidade') != null ? String(g(r, 'unidade')).trim() : null,
        /* preenchidos na ligação */
        _prod: null, _cat: null, _subcat: null, _metodo: null,
        _faixa: null, _genero: null, _uf: null, _cidade: null, _idade: null
      };
    }
    out.length = n;
    return out;
  }

  /* ================= Ligação com catálogo e clientes ================= */
  T.relink = function () {
    const items = T.items;
    const cat = MI.catalog;
    const ds = MI.store.dataset;
    const idKey = ds ? ds.roles.id : null;

    /* índice de clientes por identificador */
    const porCliente = new Map();
    if (idKey && ds) {
      for (let i = 0; i < ds.rows.length; i++) {
        const v = ds.rows[i][idKey];
        if (v == null || v === '') continue;
        if (!porCliente.has(String(v))) porCliente.set(String(v), ds.rows[i]);
      }
    }

    let casados = 0, semCatalogo = 0, semCliente = 0, comCliente = 0;
    const metodos = new Map();
    const naoEncontrados = new Map();
    const cacheMatch = new Map();

    for (let i = 0; i < items.length; i++) {
      const it = items[i];

      /* produto */
      const chave = (it._sku || '') + '|' + (it._nome || '') + '|' + (it._tamanho || '');
      let m = cacheMatch.get(chave);
      if (m === undefined) {
        m = cat.match(it._sku, it._nome, it._tamanho);
        cacheMatch.set(chave, m);
      }
      if (m) {
        it._prod = m.produto;
        it._cat = m.produto.categoria || null;
        it._subcat = m.produto.subcategoria || null;
        it._metodo = m.metodo;
        casados++;
        metodos.set(m.metodo, (metodos.get(m.metodo) || 0) + 1);
      } else {
        it._prod = null;
        /* categoria pode vir da própria transação, sem precisar do catálogo */
        it._cat = it._catBruta || null;
        it._subcat = null;
        it._metodo = null;
        semCatalogo++;
        const nome = it._nome || it._sku || '(sem nome)';
        naoEncontrados.set(nome, (naoEncontrados.get(nome) || 0) + 1);
      }

      /* cliente */
      const cli = it._cliente != null ? porCliente.get(it._cliente) : null;
      if (cli) {
        comCliente++;
        it._faixa = cli._faixa; it._genero = cli._genero;
        it._uf = cli._uf; it._cidade = cli._cidade; it._idade = cli._idade;
      } else {
        semCliente++;
        it._faixa = null; it._genero = null; it._uf = null; it._cidade = null; it._idade = null;
      }
    }

    const pedidos = new Set();
    let comHora = 0, comData = 0, comValor = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i]._pedido) pedidos.add(items[i]._pedido);
      if (items[i]._hora != null) comHora++;
      if (items[i]._data) comData++;
      if (items[i]._valor != null) comValor++;
    }

    T.link = {
      itens: items.length,
      pedidos: pedidos.size,
      produtosCasados: casados,
      taxaProduto: items.length ? casados / items.length : 0,
      semCatalogo: semCatalogo,
      metodos: Array.from(metodos, function (e) { return { metodo: e[0], n: e[1] }; }).sort(function (a, b) { return b.n - a.n; }),
      naoEncontrados: MI.mapToSorted(naoEncontrados, 30),
      naoEncontradosTotal: naoEncontrados.size,
      clientesLigados: comCliente,
      taxaCliente: items.length ? comCliente / items.length : 0,
      semCliente: semCliente,
      temIdCliente: !!(T.mapping.idCliente || T.source === 'demo'),
      temIdPedido: !!(T.mapping.idPedido || T.source === 'demo'),
      comHora: comHora, taxaHora: items.length ? comHora / items.length : 0,
      comData: comData, taxaData: items.length ? comData / items.length : 0,
      comValor: comValor, taxaValor: items.length ? comValor / items.length : 0,
      clientesDistintos: (function () {
        const s = new Set();
        for (let i = 0; i < items.length; i++) if (items[i]._cliente) s.add(items[i]._cliente);
        return s.size;
      })()
    };
    T._cacheRows = null; T._cacheFiltered = null;
    return T.link;
  };

  T.setItems = function (items, source, fileName, mapping, extras) {
    T.items = items;
    T.source = source;
    T.fileName = fileName || null;
    T.mapping = mapping || {};
    if (extras) { T.headers = extras.headers || []; T.columns = extras.columns || []; }
    T.relink();

    /* O que a loja vendeu e o cardápio não tem entra sozinho no catálogo, e
       o casamento é refeito. Transações demonstrativas ficam de fora: elas
       são fictícias e contaminariam o cardápio real com nomes inventados. */
    T.ultimaAbsorcao = null;
    if (T.autoCatalogar && source !== 'demo' && MI.catalog && MI.catalog.absorver) {
      try {
        const r = MI.catalog.absorver(T.items);
        if (r.criados) { T.ultimaAbsorcao = r; T.relink(); }
      } catch (e) {
        console.error('Falha ao catalogar produtos novos:', e);
      }
    }
    T.emit();
  };

  /* Ligado por padrão: sem isto, a análise por produto depende de alguém
     cadastrar à mão tudo o que o cardápio não tem. */
  T.autoCatalogar = MI.storage.get('autoCatalogar', true);
  T.setAutoCatalogar = function (v) {
    T.autoCatalogar = !!v;
    MI.storage.set('autoCatalogar', T.autoCatalogar);
  };

  /* ================= Recorte: respeita os filtros globais de clientes ================= */
  T.filtered = function () {
    const st = MI.store;
    if (!T.items.length) return [];
    if (!st.dataset || st.rows.length === st.dataset.rows.length) return T.items;
    if (T._cacheRows === st.rows) return T._cacheFiltered;

    const idKey = st.dataset.roles.id;
    if (!idKey || !T.link || !T.link.clientesLigados) {
      /* sem ligação não há como aplicar o filtro de clientes às transações */
      T._cacheRows = st.rows; T._cacheFiltered = T.items;
      return T.items;
    }
    const ids = new Set();
    for (let i = 0; i < st.rows.length; i++) {
      const v = st.rows[i][idKey];
      if (v != null && v !== '') ids.add(String(v));
    }
    const out = [];
    for (let i = 0; i < T.items.length; i++) {
      if (T.items[i]._cliente && ids.has(T.items[i]._cliente)) out.push(T.items[i]);
    }
    T._cacheRows = st.rows; T._cacheFiltered = out;
    return out;
  };

  /* Indica se o filtro de clientes realmente atinge as transações */
  T.filtroAplicavel = function () {
    return !!(T.link && T.link.clientesLigados > 0 && MI.store.dataset && MI.store.dataset.roles.id);
  };

  /* ================= Geração demonstrativa ================= */
  /* Constrói uma base transacional FICTÍCIA ligada à base de clientes
     demonstrativa e ao catálogo demonstrativo, para que as análises de
     consumo funcionem desde a primeira execução. */
  T.gerarDemo = function (nItens) {
    const ds = MI.store.dataset;
    const cat = MI.catalog;
    if (!ds || ds.source !== 'demo' || !cat.items.length) return null;
    const idKey = ds.roles.id;
    if (!idKey) return null;

    nItens = nItens || 120000;
    const rng = new MI.Rng(910233);
    const produtos = cat.items.filter(function (p) { return p.preco != null; });
    if (!produtos.length) return null;

    /* Afinidades por contexto, calibradas para as categorias reais do cardápio.
       São padrões PLAUSÍVEIS inventados para a base demonstrativa — servem para
       o motor de análise ter sinal a descobrir, não para descrever o consumo
       real da Smoov, que só a base de transações verdadeira dirá. */
    const pesoCategoria = function (cat, faixa, hora, dow, regiao) {
      let w = 1;
      if (cat === 'Fruit Smoovs') {
        w *= (hora >= 7 && hora <= 11) ? 1.9 : (hora >= 12 && hora <= 16) ? 1.5 : 0.8;
        if (regiao === 'Norte' || regiao === 'Nordeste') w *= 1.45;
        if (faixa === '45–54' || faixa === '55–64' || faixa === '65+') w *= 1.25;
      } else if (cat === 'Protein Smoovs') {
        w *= (hora >= 6 && hora <= 9) ? 2.2 : (hora >= 17 && hora <= 21) ? 2.0 : 0.85;
        if (faixa === '25–34' || faixa === '35–44') w *= 1.5;
        if (dow >= 1 && dow <= 5) w *= 1.2;
      } else if (cat === 'Healthy Shakes') {
        w *= (hora >= 14 && hora <= 20) ? 2.1 : 0.6;
        if (faixa === '16–24') w *= 1.8; else if (faixa === '25–34') w *= 1.3;
        if (dow === 0 || dow === 6) w *= 1.4;
      } else if (cat === 'Snacks') {
        w *= ((hora >= 8 && hora <= 10) || (hora >= 15 && hora <= 18)) ? 1.8 : 0.75;
      } else if (cat === 'Bebidas') {
        w *= 0.9;
        if (regiao === 'Nordeste' || regiao === 'Centro-Oeste') w *= 1.3;
      } else if (cat === 'Adicionais') {
        w *= 0.5;   // quase sempre entram como complemento, tratado abaixo
      }
      return w;
    };

    /* Clientes elegíveis: os que têm atividade registrada */
    const elegiveis = [];
    for (let i = 0; i < ds.rows.length; i++) {
      const r = ds.rows[i];
      if (r._status === 'Cancelado' && !rng.chance(0.15)) continue;
      if (r._recencia != null && r._recencia > 330 && !rng.chance(0.2)) continue;
      elegiveis.push(r);
    }
    if (!elegiveis.length) return null;

    const items = new Array(nItens);
    let n = 0, pedidoSeq = 0;
    const fim = ds.refDate ? ds.refDate.getTime() : Date.now();
    const DIA = 86400000;

    while (n < nItens) {
      const cli = elegiveis[Math.floor(rng.next() * elegiveis.length)];
      const faixa = cli._faixa, regiao = cli._regiao;

      /* data do pedido dentro dos últimos 12 meses e depois do cadastro */
      let diasAtras = Math.floor(Math.pow(rng.next(), 0.85) * 365);
      if (cli._recencia != null && diasAtras < cli._recencia - 5) diasAtras = cli._recencia + Math.floor(rng.next() * 30);
      if (diasAtras > 365) diasAtras = Math.floor(rng.next() * 365);
      const data = new Date(fim - diasAtras * DIA);
      const dow = data.getDay();

      /* hora: parte do hábito do cliente, parte ruído */
      let hora = cli._hora != null ? cli._hora : 12;
      if (rng.chance(0.35)) hora = (hora + rng.int(-3, 3) + 24) % 24;
      if (hora < 6) hora = 6 + rng.int(0, 4);

      pedidoSeq++;
      const idPedido = 'PED-' + String(400000 + pedidoSeq);
      const nItensPedido = rng.chance(0.52) ? 1 : rng.chance(0.72) ? 2 : 3;

      /* sorteio ponderado de produtos para este pedido */
      const escolhidos = [];
      for (let k = 0; k < nItensPedido && n < nItens; k++) {
        let total = 0;
        const pesos = produtos.map(function (p) {
          let w = pesoCategoria(p.categoria, faixa, hora, dow, regiao);
          if (!p.disponivel) w *= 0.15;
          /* itens já no carrinho puxam complementos */
          if (escolhidos.length) {
            const jaCat = escolhidos[0].categoria;
            const jaSub = escolhidos[0].subcategoria;
            /* complementos: é o que a análise de cesta deve reencontrar */
            if (p.categoria === 'Adicionais') w *= 3.2;
            if (jaCat === 'Protein Smoovs' && p.subcategoria === 'Proteína') w *= 3.8;
            if (jaCat === 'Protein Smoovs' && p.subcategoria === 'Suplementos') w *= 2.6;
            if (jaCat === 'Healthy Shakes' && p.subcategoria === 'Superfoods') w *= 2.8;
            if (jaCat === 'Fruit Smoovs' && p.categoria === 'Snacks') w *= 2.9;
            if (jaCat === 'Fruit Smoovs' && p.subcategoria === 'Proteína') w *= 2.2;
            if (jaCat === 'Snacks' && p.categoria === 'Bebidas') w *= 2.3;
            if (jaSub === 'Energia' && p.categoria === 'Snacks') w *= 2.4;
            if (p.categoria === jaCat) w *= 0.3;
          }
          total += w;
          return w;
        });
        let r = rng.next() * total, idx = 0;
        for (let j = 0; j < produtos.length; j++) { r -= pesos[j]; if (r <= 0) { idx = j; break; } }
        const prod = produtos[idx];
        escolhidos.push(prod);

        const qtd = rng.chance(0.88) ? 1 : rng.int(2, 3);
        const unit = Math.round(prod.preco * (0.96 + rng.next() * 0.1) * 100) / 100;
        items[n++] = {
          _pedido: idPedido,
          _cliente: String(cli[idKey]),
          _sku: prod.sku,
          _nome: prod.nome,
          _tamanho: prod.tamanho,
          _catBruta: prod.categoria,
          _data: data, _mes: MI.monthKey(data), _dow: dow, _hora: hora,
          _qtd: qtd, _valorUnit: unit, _valor: Math.round(unit * qtd * 100) / 100,
          _canal: rng.chance(0.58) ? 'Loja física' : rng.chance(0.6) ? 'Aplicativo' : 'Delivery parceiro',
          _unidade: null,
          _prod: null, _cat: null, _subcat: null, _metodo: null,
          _faixa: null, _genero: null, _uf: null, _cidade: null, _idade: null
        };
      }
    }
    items.length = n;

    T.setItems(items, 'demo', null, {
      idPedido: 'id_pedido', idCliente: 'id_cliente', sku: 'sku', produto: 'produto',
      data: 'data', hora: 'hora', quantidade: 'quantidade', valorTotal: 'valor_total'
    });
    return T.link;
  };

  /* ================= Importação ================= */
  T.importarDeLinhas = function (rows, headers, mapping, fileName, columns) {
    const items = normalizar(rows, mapping);
    if (!items.length) throw new Error('Nenhuma linha utilizável: é preciso ao menos uma coluna de produto ou SKU preenchida.');
    T.setItems(items, 'import', fileName, mapping, { headers: headers, columns: columns });
    return T.link;
  };

  /* ================= Diagnóstico: o que falta para cada análise ================= */
  T.requisitos = function () {
    const l = T.link;
    const ok = function (c) { return !!c; };
    return [
      { analise: 'Produtos e categorias mais vendidos', precisa: 'nome do produto ou SKU', atendido: ok(l && l.itens), detalhe: l ? MI.fmt.int(l.itens) + ' itens' : '—' },
      { analise: 'Ticket médio por categoria', precisa: 'valor do item + categoria', atendido: ok(l && l.taxaValor > 0.5 && l.taxaProduto > 0.3), detalhe: l ? MI.fmt.pct(l.taxaValor, 0) + ' com valor' : '—' },
      { analise: 'Demanda por horário', precisa: 'hora do pedido', atendido: ok(l && l.taxaHora > 0.3), detalhe: l ? MI.fmt.pct(l.taxaHora, 0) + ' com hora' : '—' },
      { analise: 'Sazonalidade e período', precisa: 'data do pedido', atendido: ok(l && l.taxaData > 0.3), detalhe: l ? MI.fmt.pct(l.taxaData, 0) + ' com data' : '—' },
      { analise: 'Preferência por faixa etária, gênero e região', precisa: 'identificador do cliente presente nas duas bases', atendido: ok(l && l.taxaCliente > 0.1), detalhe: l ? MI.fmt.pct(l.taxaCliente, 0) + ' ligados' : '—' },
      { analise: 'Produtos comprados juntos', precisa: 'identificador do pedido', atendido: ok(l && l.pedidos > 0), detalhe: l ? MI.fmt.int(l.pedidos) + ' pedidos' : '—' },
      { analise: 'Frequência e recorrência de compra', precisa: 'identificador do cliente + data', atendido: ok(l && l.clientesDistintos > 0 && l.taxaData > 0.3), detalhe: l ? MI.fmt.int(l.clientesDistintos) + ' clientes distintos' : '—' },
      { analise: 'Categoria do produto (sem depender do catálogo)', precisa: 'coluna de categoria na transação ou produto casado com o catálogo', atendido: ok(l && (l.taxaProduto > 0.3 || T.mapping.categoria)), detalhe: l ? MI.fmt.pct(l.taxaProduto, 0) + ' casados com o catálogo' : '—' }
    ];
  };

  MI.tx = T;

})(window.MI);
