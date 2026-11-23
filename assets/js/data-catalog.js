/* 10 Move Intelligence — catálogo de produtos
   -------------------------------------------------------------------------
   Guarda o cardápio no navegador (IndexedDB), com importação de planilha,
   PDF e cadastro manual. Nada é enviado para servidor.
   O catálogo demonstrativo é FICTÍCIO e está marcado como tal em toda a
   interface — nenhum nome, preço ou informação nutricional foi atribuído
   à Smoov sem origem verificável.
   ------------------------------------------------------------------------- */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  /* ================= Persistência (IndexedDB) ================= */
  const DB_NAME = 'mi-10move', STORE = 'kv', DB_VER = 1;
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponível'));
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }
  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        const t = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        t.onsuccess = function () { resolve(t.result); };
        t.onerror = function () { reject(t.error); };
      });
    }).catch(function () { return undefined; });
  }
  function idbSet(key, value) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        const t = d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
        t.onsuccess = function () { resolve(true); };
        t.onerror = function () { reject(t.error); };
      });
    }).catch(function () { return false; });
  }
  MI.idb = { get: idbGet, set: idbSet };

  /* ================= Catálogo demonstrativo (FICTÍCIO) ================= */
  /* Produtos inventados para demonstração da plataforma. Não representam o
     cardápio real da Smoov. Preços em BRL, valores nutricionais por porção. */
  const DEMO = [
    // [nome, categoria, subcategoria, tamanho, preco, kcal, ingredientes, alergenicos, tags]
    ['Verde Leve', 'Smoothies', 'Funcionais', '300 ml', 18.90, 142, 'couve, maçã verde, gengibre, limão, água de coco', '', 'detox,vegano,sem lactose'],
    ['Verde Leve', 'Smoothies', 'Funcionais', '500 ml', 24.90, 236, 'couve, maçã verde, gengibre, limão, água de coco', '', 'detox,vegano,sem lactose'],
    ['Tropical Manhã', 'Smoothies', 'Frutas', '300 ml', 17.90, 186, 'manga, maracujá, banana, iogurte natural', 'leite', 'proteico'],
    ['Tropical Manhã', 'Smoothies', 'Frutas', '500 ml', 23.90, 310, 'manga, maracujá, banana, iogurte natural', 'leite', 'proteico'],
    ['Vermelho Vivo', 'Smoothies', 'Frutas', '300 ml', 18.50, 164, 'morango, framboesa, beterraba, água de coco', '', 'vegano,antioxidante'],
    ['Vermelho Vivo', 'Smoothies', 'Frutas', '500 ml', 24.50, 272, 'morango, framboesa, beterraba, água de coco', '', 'vegano,antioxidante'],
    ['Proteína Cacau', 'Smoothies', 'Proteicos', '400 ml', 26.90, 348, 'banana, cacau, pasta de amendoim, whey, leite', 'leite, amendoim', 'proteico,pós-treino'],
    ['Proteína Baunilha', 'Smoothies', 'Proteicos', '400 ml', 26.90, 322, 'banana, baunilha, aveia, whey, leite', 'leite, glúten', 'proteico,pós-treino'],
    ['Proteína Vegana', 'Smoothies', 'Proteicos', '400 ml', 29.90, 296, 'banana, proteína de ervilha, pasta de castanha, bebida de amêndoas', 'castanhas', 'proteico,vegano'],

    ['Açaí Tradicional', 'Açaí', 'Tigelas', '300 ml', 21.90, 412, 'açaí, banana, granola', 'glúten', ''],
    ['Açaí Tradicional', 'Açaí', 'Tigelas', '500 ml', 28.90, 668, 'açaí, banana, granola', 'glúten', ''],
    ['Açaí Zero Açúcar', 'Açaí', 'Tigelas', '300 ml', 23.90, 298, 'açaí sem açúcar, morango, castanha', 'castanhas', 'zero açúcar'],
    ['Açaí Proteico', 'Açaí', 'Tigelas', '400 ml', 31.90, 486, 'açaí, whey, pasta de amendoim, banana', 'leite, amendoim', 'proteico'],
    ['Açaí no Copo', 'Açaí', 'Copos', '400 ml', 19.90, 388, 'açaí, banana', '', 'vegano'],

    ['Laranja Natural', 'Sucos', 'Naturais', '400 ml', 13.90, 176, 'laranja', '', 'vegano,sem açúcar'],
    ['Laranja com Acerola', 'Sucos', 'Naturais', '400 ml', 15.90, 168, 'laranja, acerola', '', 'vegano,vitamina C'],
    ['Abacaxi com Hortelã', 'Sucos', 'Naturais', '400 ml', 14.90, 142, 'abacaxi, hortelã', '', 'vegano'],
    ['Melancia Gelada', 'Sucos', 'Naturais', '400 ml', 13.50, 118, 'melancia', '', 'vegano'],
    ['Limonada Suíça', 'Sucos', 'Refrescos', '400 ml', 14.50, 186, 'limão, leite condensado', 'leite', ''],
    ['Água de Coco', 'Sucos', 'Naturais', '300 ml', 11.90, 58, 'água de coco', '', 'vegano,isotônico'],

    ['Café Coado', 'Cafés', 'Quentes', '200 ml', 7.90, 4, 'café arábica', '', 'vegano'],
    ['Cappuccino', 'Cafés', 'Quentes', '240 ml', 13.90, 162, 'café, leite, cacau', 'leite', ''],
    ['Latte Gelado', 'Cafés', 'Gelados', '300 ml', 15.90, 148, 'café, leite, gelo', 'leite', ''],
    ['Latte Vegano', 'Cafés', 'Gelados', '300 ml', 17.90, 126, 'café, bebida de aveia', 'glúten', 'vegano'],
    ['Espresso Duplo', 'Cafés', 'Quentes', '60 ml', 9.90, 6, 'café arábica', '', 'vegano'],

    ['Pão de Queijo', 'Snacks', 'Salgados', 'unidade', 6.50, 128, 'polvilho, queijo, ovo', 'leite, ovo', ''],
    ['Tapioca de Queijo', 'Snacks', 'Salgados', 'unidade', 14.90, 236, 'tapioca, queijo', 'leite', 'sem glúten'],
    ['Tapioca de Frango', 'Snacks', 'Salgados', 'unidade', 18.90, 312, 'tapioca, frango, requeijão', 'leite', 'sem glúten'],
    ['Sanduíche Natural', 'Snacks', 'Salgados', 'unidade', 19.90, 348, 'pão integral, frango, cenoura, iogurte', 'glúten, leite', ''],
    ['Wrap Vegetariano', 'Snacks', 'Salgados', 'unidade', 22.90, 386, 'tortilha, grão-de-bico, legumes', 'glúten', 'vegetariano'],
    ['Barra de Castanhas', 'Snacks', 'Doces', 'unidade', 9.90, 182, 'castanhas, tâmara, cacau', 'castanhas', 'vegano,sem glúten'],
    ['Cookie Integral', 'Snacks', 'Doces', 'unidade', 8.90, 164, 'aveia, cacau, açúcar mascavo', 'glúten', 'vegetariano'],
    ['Granola Pote', 'Snacks', 'Doces', '120 g', 12.90, 442, 'aveia, mel, castanhas', 'glúten, castanhas', ''],

    ['Combo Café da Manhã', 'Combos', 'Manhã', 'combo', 29.90, 466, 'suco de laranja, pão de queijo, café coado', 'leite, ovo', ''],
    ['Combo Pós-Treino', 'Combos', 'Treino', 'combo', 39.90, 538, 'smoothie proteico, barra de castanhas', 'leite, amendoim, castanhas', 'proteico'],
    ['Combo Tarde Leve', 'Combos', 'Tarde', 'combo', 34.90, 420, 'açaí no copo, água de coco', '', 'vegano'],
    ['Combo Dupla', 'Combos', 'Compartilhar', 'combo', 54.90, 892, 'dois smoothies, dois pães de queijo', 'leite, ovo', ''],

    ['Dose de Whey', 'Adicionais', 'Suplementos', 'dose', 8.90, 120, 'whey protein', 'leite', 'proteico'],
    ['Dose de Colágeno', 'Adicionais', 'Suplementos', 'dose', 9.90, 36, 'colágeno hidrolisado', '', ''],
    ['Dose de Pasta de Amendoim', 'Adicionais', 'Complementos', 'dose', 5.90, 94, 'pasta de amendoim', 'amendoim', 'vegano'],
    ['Granola Extra', 'Adicionais', 'Complementos', 'dose', 4.90, 88, 'granola', 'glúten', ''],
    ['Leite Vegetal', 'Adicionais', 'Complementos', 'dose', 4.50, 32, 'bebida de amêndoas', 'castanhas', 'vegano']
  ];

  const REGIOES_DEMO = ['Todas as unidades'];

  function demoCatalog() {
    const rng = new MI.Rng(77001);
    return DEMO.map(function (p, i) {
      const disponivel = rng.chance(0.92);
      return {
        id: 'demo-' + i,
        sku: 'SMV-' + String(1000 + i),
        nome: p[0],
        categoria: p[1],
        subcategoria: p[2],
        tamanho: p[3],
        preco: p[4],
        kcal: p[5],
        ingredientes: p[6],
        alergenicos: p[7],
        tags: p[8],
        descricao: '',
        imagem: null,
        disponivel: disponivel,
        regiao: REGIOES_DEMO[0],
        origem: 'demo'
      };
    });
  }

  /* ================= Store do catálogo ================= */
  const C = {
    items: [],
    source: 'demo',          // 'demo' | 'import' | 'manual'
    fileName: null,
    loadedAt: null,
    listeners: [],

    on: function (cb) { C.listeners.push(cb); },
    emit: function () { C.listeners.forEach(function (cb) { cb(C); }); },

    isDemo: function () { return C.source === 'demo'; },

    load: function () {
      return idbGet('catalog').then(function (saved) {
        if (saved && saved.items && saved.items.length) {
          C.items = saved.items;
          C.source = saved.source || 'import';
          C.fileName = saved.fileName || null;
          C.loadedAt = saved.loadedAt ? new Date(saved.loadedAt) : null;
        } else {
          C.items = demoCatalog();
          C.source = 'demo';
          C.loadedAt = new Date();
        }
        C.reindex();
        return C;
      });
    },

    save: function () {
      return idbSet('catalog', {
        items: C.items, source: C.source, fileName: C.fileName,
        loadedAt: (C.loadedAt || new Date()).toISOString()
      });
    },

    reset: function () {
      C.items = demoCatalog(); C.source = 'demo'; C.fileName = null; C.loadedAt = new Date();
      C.reindex(); C.save(); C.emit();
    },

    setItems: function (items, source, fileName) {
      C.items = items;
      C.source = source || 'import';
      C.fileName = fileName || null;
      C.loadedAt = new Date();
      C.reindex(); C.save(); C.emit();
    },

    add: function (item) {
      item.id = item.id || 'man-' + Date.now() + '-' + Math.round(Math.random() * 1e6);
      item.origem = item.origem || 'manual';
      C.items.push(item);
      if (C.source === 'demo') C.source = 'manual';
      C.reindex(); C.save(); C.emit();
      return item;
    },
    update: function (id, patch) {
      const it = C.items.filter(function (x) { return x.id === id; })[0];
      if (!it) return null;
      Object.keys(patch).forEach(function (k) { it[k] = patch[k]; });
      C.reindex(); C.save(); C.emit();
      return it;
    },
    remove: function (id) {
      C.items = C.items.filter(function (x) { return x.id !== id; });
      C.reindex(); C.save(); C.emit();
    },

    /* ---------- Índices para correspondência com transações ---------- */
    bySku: {},
    byNome: {},
    byNomeTamanho: {},
    reindex: function () {
      C.bySku = {}; C.byNome = {}; C.byNomeTamanho = {};
      C.items.forEach(function (p) {
        if (p.sku) C.bySku[MI.slug(p.sku)] = p;
        const n = MI.slug(p.nome);
        if (n) {
          if (!C.byNome[n]) C.byNome[n] = [];
          C.byNome[n].push(p);
          C.byNomeTamanho[n + '|' + MI.slug(p.tamanho || '')] = p;
        }
      });
    },

    /* Correspondência honesta: SKU exato → nome+tamanho → nome → tokens.
       Devolve null quando não há confiança suficiente. */
    match: function (sku, nome, tamanho) {
      if (sku) {
        const bySku = C.bySku[MI.slug(sku)];
        if (bySku) return { produto: bySku, metodo: 'sku', confianca: 1 };
      }
      if (!nome) return null;
      const n = MI.slug(nome);
      if (tamanho) {
        const exato = C.byNomeTamanho[n + '|' + MI.slug(tamanho)];
        if (exato) return { produto: exato, metodo: 'nome+tamanho', confianca: 1 };
      }
      const lista = C.byNome[n];
      if (lista && lista.length) return { produto: lista[0], metodo: 'nome', confianca: lista.length === 1 ? 0.95 : 0.7 };

      /* similaridade por tokens — só aceita acima de 0,72 */
      const toks = new Set(n.split('_').filter(Boolean));
      if (!toks.size) return null;
      let melhor = null, melhorScore = 0;
      C.items.forEach(function (p) {
        const pt = MI.slug(p.nome).split('_').filter(Boolean);
        if (!pt.length) return;
        let inter = 0;
        pt.forEach(function (t) { if (toks.has(t)) inter++; });
        const score = (2 * inter) / (pt.length + toks.size);
        if (score > melhorScore) { melhorScore = score; melhor = p; }
      });
      if (melhor && melhorScore >= 0.72) return { produto: melhor, metodo: 'aproximado', confianca: melhorScore };
      return null;
    },

    /* ---------- Consultas ---------- */
    categorias: function () {
      return MI.mapToSorted(MI.countBy(C.items, 'categoria')).map(function (e) { return e.label; });
    },
    subcategorias: function (cat) {
      const src = cat ? C.items.filter(function (p) { return p.categoria === cat; }) : C.items;
      return MI.mapToSorted(MI.countBy(src, 'subcategoria')).map(function (e) { return e.label; });
    },
    tagsDisponiveis: function () {
      const m = new Map();
      C.items.forEach(function (p) {
        String(p.tags || '').split(/[,;]/).forEach(function (t) {
          const s = t.trim();
          if (s) m.set(s, (m.get(s) || 0) + 1);
        });
      });
      return MI.mapToSorted(m).map(function (e) { return e.label; });
    },
    alergenicosDisponiveis: function () {
      const m = new Map();
      C.items.forEach(function (p) {
        String(p.alergenicos || '').split(/[,;]/).forEach(function (t) {
          const s = t.trim();
          if (s) m.set(s, (m.get(s) || 0) + 1);
        });
      });
      return MI.mapToSorted(m).map(function (e) { return e.label; });
    },
    faixaPreco: function () {
      const v = C.items.map(function (p) { return p.preco; }).filter(function (x) { return x != null && !isNaN(x); });
      if (!v.length) return [0, 0];
      return [Math.floor(Math.min.apply(null, v)), Math.ceil(Math.max.apply(null, v))];
    },

    filtrar: function (f) {
      f = f || {};
      const busca = f.busca ? MI.slug(f.busca) : null;
      return C.items.filter(function (p) {
        if (f.categoria && f.categoria.size && !f.categoria.has(p.categoria)) return false;
        if (f.subcategoria && f.subcategoria.size && !f.subcategoria.has(p.subcategoria)) return false;
        if (f.tag && f.tag.size) {
          const tags = String(p.tags || '').split(/[,;]/).map(function (t) { return t.trim(); });
          let ok = false;
          f.tag.forEach(function (t) { if (tags.indexOf(t) >= 0) ok = true; });
          if (!ok) return false;
        }
        if (f.semAlergenico && f.semAlergenico.size) {
          const al = MI.slug(p.alergenicos || '');
          let bate = false;
          f.semAlergenico.forEach(function (a) { if (al.indexOf(MI.slug(a)) >= 0) bate = true; });
          if (bate) return false;
        }
        if (f.precoMin != null && (p.preco == null || p.preco < f.precoMin)) return false;
        if (f.precoMax != null && (p.preco == null || p.preco > f.precoMax)) return false;
        if (f.disponivel === true && !p.disponivel) return false;
        if (f.disponivel === false && p.disponivel) return false;
        if (busca) {
          const alvo = MI.slug([p.nome, p.categoria, p.subcategoria, p.descricao, p.ingredientes, p.sku, p.tags].join(' '));
          if (alvo.indexOf(busca) < 0) return false;
        }
        return true;
      });
    },

    /* Completude dos campos — mostra o que falta no catálogo */
    completude: function () {
      const campos = [
        { k: 'nome', label: 'Nome' }, { k: 'categoria', label: 'Categoria' },
        { k: 'subcategoria', label: 'Subcategoria' }, { k: 'preco', label: 'Preço' },
        { k: 'tamanho', label: 'Tamanho / variação' }, { k: 'sku', label: 'SKU' },
        { k: 'descricao', label: 'Descrição' }, { k: 'ingredientes', label: 'Ingredientes' },
        { k: 'alergenicos', label: 'Alergênicos' }, { k: 'kcal', label: 'Informação nutricional' },
        { k: 'imagem', label: 'Imagem' }, { k: 'regiao', label: 'Unidade / região' }
      ];
      const n = C.items.length || 1;
      return campos.map(function (c) {
        const preenchidos = C.items.filter(function (p) {
          const v = p[c.k];
          return v != null && v !== '' && !(typeof v === 'number' && isNaN(v));
        }).length;
        return { campo: c.label, chave: c.k, preenchidos: preenchidos, pct: preenchidos / n };
      });
    }
  };

  /* ================= Importação de catálogo ================= */
  /* Mapeamento dedicado: nomes de coluna típicos de cardápio. */
  const CAMPOS = [
    { key: 'nome', label: 'Nome do produto', match: /^(nome|produto|item|descricao_?produto|title|name)$|nome_?(produto|item)|produto/ },
    { key: 'categoria', label: 'Categoria', match: /categoria|category|grupo|secao|seção|linha/ },
    { key: 'subcategoria', label: 'Subcategoria', match: /subcategoria|subgrupo|subcategory|tipo/ },
    { key: 'descricao', label: 'Descrição', match: /descricao|descrição|description|detalhe|obs/ },
    { key: 'preco', label: 'Preço', match: /preco|preço|valor|price|vlr|r\$/ },
    { key: 'tamanho', label: 'Tamanho / variação', match: /tamanho|volume|size|porcao|porção|ml$|gramatura|variacao|variação/ },
    { key: 'ingredientes', label: 'Ingredientes', match: /ingrediente|composicao|composição|recheio/ },
    { key: 'alergenicos', label: 'Alergênicos', match: /alerg|contem|contém|restricao|restrição/ },
    { key: 'kcal', label: 'Calorias (kcal)', match: /kcal|caloria|energia|valor_?energetico/ },
    { key: 'sku', label: 'SKU / código', match: /sku|codigo|código|cod_?prod|ean|referencia|referência|id_?produto/ },
    { key: 'disponivel', label: 'Disponibilidade', match: /dispon|ativo|status|em_?estoque|situacao|situação/ },
    { key: 'regiao', label: 'Unidade / região', match: /unidade|regiao|região|loja|filial|praca|praça|cidade/ },
    { key: 'tags', label: 'Características / tags', match: /tag|caracteristica|característica|atributo|dieta|classificacao|classificação/ },
    { key: 'imagem', label: 'Imagem (URL)', match: /imagem|image|foto|url_?img|picture/ }
  ];
  C.CAMPOS = CAMPOS;

  C.inferirMapeamento = function (headers) {
    const usado = {}, out = {};
    const pares = [];
    headers.forEach(function (h) {
      const s = MI.slug(h);
      CAMPOS.forEach(function (c) {
        if (c.match.test(s)) pares.push({ header: h, campo: c.key, score: 100 - Math.abs(s.length - 8) });
      });
    });
    pares.sort(function (a, b) { return b.score - a.score; });
    pares.forEach(function (p) {
      if (usado[p.header] || out[p.campo]) return;
      usado[p.header] = true; out[p.campo] = p.header;
    });
    return out;
  };

  C.construirDeLinhas = function (rows, mapeamento, fileName) {
    const items = [];
    rows.forEach(function (r, i) {
      const get = function (campo) {
        const h = mapeamento[campo];
        if (!h) return null;
        const v = r[h];
        return v === '' || v == null ? null : v;
      };
      const nome = get('nome');
      if (!nome) return;
      const precoRaw = get('preco');
      const dispRaw = get('disponivel');
      let disponivel = true;
      if (dispRaw != null) {
        const s = MI.slug(dispRaw);
        disponivel = !/^(0|nao|não|false|inativo|indisponivel|indisponível|esgotado|off|n)$/.test(s);
      }
      items.push({
        id: 'imp-' + i,
        nome: String(nome).trim(),
        categoria: get('categoria') ? String(get('categoria')).trim() : 'Sem categoria',
        subcategoria: get('subcategoria') ? String(get('subcategoria')).trim() : '',
        descricao: get('descricao') ? String(get('descricao')).trim() : '',
        preco: precoRaw != null ? MI.parseNumber(precoRaw) : null,
        tamanho: get('tamanho') ? String(get('tamanho')).trim() : '',
        ingredientes: get('ingredientes') ? String(get('ingredientes')).trim() : '',
        alergenicos: get('alergenicos') ? String(get('alergenicos')).trim() : '',
        kcal: get('kcal') != null ? MI.parseNumber(get('kcal')) : null,
        sku: get('sku') ? String(get('sku')).trim() : '',
        disponivel: disponivel,
        regiao: get('regiao') ? String(get('regiao')).trim() : '',
        tags: get('tags') ? String(get('tags')).trim() : '',
        imagem: null,
        imagemUrl: get('imagem') ? String(get('imagem')).trim() : null,
        origem: 'import'
      });
    });
    return items;
  };

  /* ---------- Extração de PDF ----------
     Lê o texto do PDF com pdf.js e procura linhas no formato
     "Nome do produto .... R$ 00,00". Não adivinha: o que não casar com um
     preço fica de fora e é reportado. */
  C.lerPdf = function (file, onProgress) {
    return new Promise(function (resolve, reject) {
      if (!window.pdfjsLib) return reject(new Error('A biblioteca de leitura de PDF não carregou. Verifique a conexão e recarregue a página.'));
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Não foi possível ler o PDF.')); };
      reader.onload = function () {
        pdfjsLib.getDocument({ data: new Uint8Array(reader.result) }).promise.then(function (pdf) {
          const paginas = [];
          let chain = Promise.resolve();
          for (let p = 1; p <= pdf.numPages; p++) {
            (function (num) {
              chain = chain.then(function () {
                if (onProgress) onProgress(0.3 + 0.6 * (num / pdf.numPages), 'Lendo página ' + num + ' de ' + pdf.numPages + '…');
                return pdf.getPage(num).then(function (page) {
                  return page.getTextContent().then(function (tc) {
                    /* reagrupa por linha usando a coordenada vertical */
                    const linhas = new Map();
                    tc.items.forEach(function (it) {
                      if (!it.str || !it.str.trim()) return;
                      const y = Math.round(it.transform[5]);
                      const chave = y;
                      if (!linhas.has(chave)) linhas.set(chave, []);
                      linhas.get(chave).push({ x: it.transform[4], s: it.str });
                    });
                    const ordenadas = Array.from(linhas.keys()).sort(function (a, b) { return b - a; });
                    ordenadas.forEach(function (y) {
                      const partes = linhas.get(y).sort(function (a, b) { return a.x - b.x; });
                      paginas.push({ pagina: num, texto: partes.map(function (p) { return p.s; }).join(' ').replace(/\s+/g, ' ').trim() });
                    });
                  });
                });
              });
            })(p);
          }
          chain.then(function () { resolve({ linhas: paginas, numPages: pdf.numPages }); }).catch(reject);
        }).catch(function (e) { reject(new Error('Falha ao abrir o PDF: ' + (e.message || e))); });
      };
      reader.readAsArrayBuffer(file);
    });
  };

  /* Interpreta as linhas extraídas do PDF em produtos. */
  C.interpretarPdf = function (linhas) {
    const RE_PRECO = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*$/;
    const RE_PRECO_MEIO = /(?:R\$\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/;
    const RE_TAMANHO = /(\d{2,4}\s?(?:ml|ML|g|G|gr)|\bP\b|\bM\b|\bG\b|pequeno|m[eé]dio|grande|unidade)/;
    const produtos = [];
    const ignoradas = [];
    let categoriaAtual = 'Sem categoria';

    linhas.forEach(function (l) {
      const t = (l.texto || '').trim();
      if (!t || t.length < 2) return;

      /* Cabeçalho de categoria: linha curta, sem preço, em caixa alta ou título */
      const temPreco = RE_PRECO.test(t) || RE_PRECO_MEIO.test(t);
      if (!temPreco) {
        if (t.length <= 46 && /^[^0-9]+$/.test(t) && t === t.toUpperCase() && t.replace(/[^A-ZÀ-Ú]/g, '').length >= 3) {
          categoriaAtual = MI.titleCase(t);
        } else if (t.length <= 40 && /^[A-ZÀ-Ú][^.!?]{2,}$/.test(t) && !/\d/.test(t)) {
          categoriaAtual = t;
        } else {
          ignoradas.push({ pagina: l.pagina, texto: t, motivo: 'sem preço identificável' });
        }
        return;
      }

      let m = t.match(RE_PRECO);
      let preco = null, nomeBruto = t;
      if (m) {
        preco = MI.parseNumber(m[1]);
        nomeBruto = t.slice(0, m.index);
      } else {
        m = t.match(RE_PRECO_MEIO);
        preco = MI.parseNumber(m[1]);
        nomeBruto = t.slice(0, m.index);
      }
      nomeBruto = nomeBruto.replace(/[.·•\-–—_\s]+$/, '').replace(/^[.·•\-–—_\s]+/, '').trim();
      if (!nomeBruto || nomeBruto.length < 2 || preco == null || preco <= 0) {
        ignoradas.push({ pagina: l.pagina, texto: t, motivo: 'nome ou preço inválido' });
        return;
      }

      const tam = nomeBruto.match(RE_TAMANHO);
      produtos.push({
        id: 'pdf-' + produtos.length,
        nome: MI.titleCase(nomeBruto.replace(RE_TAMANHO, '').replace(/\s{2,}/g, ' ').trim()) || nomeBruto,
        categoria: categoriaAtual,
        subcategoria: '',
        descricao: '',
        preco: preco,
        tamanho: tam ? tam[1].trim() : '',
        ingredientes: '', alergenicos: '', kcal: null, sku: '',
        disponivel: true, regiao: '', tags: '', imagem: null,
        origem: 'pdf', paginaOrigem: l.pagina, textoOrigem: t
      });
    });

    return { produtos: produtos, ignoradas: ignoradas };
  };

  /* ---------- Imagens ---------- */
  /* Redimensiona para no máximo 420px e grava como JPEG — mantém o
     IndexedDB em tamanho razoável mesmo com dezenas de fotos. */
  C.lerImagem = function (file, maxLado) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('O arquivo não é uma imagem.'));
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Falha ao ler a imagem.')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('Formato de imagem não suportado.')); };
        img.onload = function () {
          const max = maxLado || 420;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            const r = Math.min(max / w, max / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          try { resolve(cv.toDataURL('image/jpeg', 0.82)); }
          catch (e) { reject(new Error('Não foi possível converter a imagem.')); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  MI.catalog = C;

})(window.MI);
