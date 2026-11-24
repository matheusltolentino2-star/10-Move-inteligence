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

  function mediana(v) {
    if (!v || !v.length) return null;
    const s = v.slice().sort(function (a, b) { return a - b; });
    const m = Math.floor(s.length / 2);
    const x = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    return Math.round(x * 100) / 100;
  }

  /* ================= Persistência (IndexedDB) ================= */
  const DB_NAME = 'mi-10move', STORE = 'kv', DB_VER = 1;
  const TIMEOUT_MS = 5000;
  let dbp = null;
  let C_indisponivel = false;

  /* Toda operação de IndexedDB tem prazo. Sem isso, um navegador que não
     responde ao open() — modo privado no iOS, alguns WebViews de Android,
     armazenamento bloqueado por política — deixa a promessa pendente para
     sempre e a aplicação trava na tela de carregamento, sem erro nenhum. */
  function comPrazo(promessa, rotulo) {
    return new Promise(function (resolve) {
      let resolvido = false;
      const t = setTimeout(function () {
        if (resolvido) return;
        resolvido = true;
        C_indisponivel = true;
        console.warn('IndexedDB não respondeu em ' + TIMEOUT_MS + 'ms (' + rotulo + '). Seguindo sem armazenamento local.');
        resolve(undefined);
      }, TIMEOUT_MS);
      promessa.then(function (v) {
        if (resolvido) return;
        resolvido = true; clearTimeout(t); resolve(v);
      }, function () {
        if (resolvido) return;
        resolvido = true; clearTimeout(t); C_indisponivel = true; resolve(undefined);
      });
    });
  }

  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponível'));
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { return reject(e); }
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Falha ao abrir o IndexedDB')); };
      /* outra aba segurando a versão anterior: não dá para esperar indefinidamente */
      req.onblocked = function () { reject(new Error('IndexedDB bloqueado por outra aba')); };
    });
    return dbp;
  }

  function idbGet(key) {
    return comPrazo(db().then(function (d) {
      return new Promise(function (resolve, reject) {
        const t = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        t.onsuccess = function () { resolve(t.result); };
        t.onerror = function () { reject(t.error); };
      });
    }), 'leitura de ' + key);
  }

  function idbSet(key, value) {
    return comPrazo(db().then(function (d) {
      return new Promise(function (resolve, reject) {
        const t = d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
        t.onsuccess = function () { resolve(true); };
        t.onerror = function () { reject(t.error); };
      });
    }), 'gravação de ' + key).then(function (v) { return v === undefined ? false : true; });
  }
  MI.idb = {
    get: idbGet,
    set: idbSet,
    /* true quando o navegador não deixou usar armazenamento local: o catálogo
       funciona na sessão, mas não sobrevive ao recarregamento. */
    indisponivel: function () { return C_indisponivel; }
  };

  /* ================= Catálogo padrão ================= */
  /* O catálogo inicial é o cardápio OFICIAL da Smoov, transcrito da peça
     enviada pelo cliente em 23/11/2026 (data-catalog-smoov.js, que também
     documenta o que é literal, o que é derivado e o que ficou em branco).
     Não existe catálogo fictício: produto inventado dentro de um módulo de
     cardápio acaba sendo confundido com o cardápio real. */
  function catalogoPadrao() {
    return MI.catalogoSmoov ? MI.catalogoSmoov() : [];
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
    isOficial: function () { return C.source === 'oficial'; },

    load: function () {
      return idbGet('catalog').then(function (saved) {
        /* Navegadores que já usaram a versão anterior têm o catálogo fictício
           gravado. Ele é descartado em favor do cardápio oficial — catálogo
           inventado não pode sobreviver a uma atualização e ser confundido
           com o real. Catálogo importado pelo usuário é preservado. */
        if (saved && saved.source === 'demo') saved = null;
        if (saved && saved.items && saved.items.length) {
          C.items = saved.items;
          C.source = saved.source || 'import';
          C.fileName = saved.fileName || null;
          C.loadedAt = saved.loadedAt ? new Date(saved.loadedAt) : null;
        } else {
          C.items = catalogoPadrao();
          C.source = 'oficial';
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
      C.items = catalogoPadrao(); C.source = 'oficial'; C.fileName = null; C.loadedAt = new Date();
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

    /* Produtos vendidos que o cardápio não tem entram sozinhos.
       -----------------------------------------------------------------
       Quem sobe a planilha não vai cadastrar dezenas de sabores à mão para
       a análise funcionar, e um produto fora do cardápio não é erro de
       digitação: é algo que a loja vende e o cardápio não registrou.

       Aproveita o que o próprio item traz — nome, tamanho, código,
       categoria da transação e o preço efetivamente praticado. O resto
       nasce vazio, e o produto nasce marcado como NÃO CONFERIDO: a tela
       precisa poder dizer o que veio do cardápio oficial e o que foi
       deduzido das vendas.

       Quando o nome se parece com algo que já existe, a semelhança fica
       registrada no produto novo. É o caso de "Açaí c/ Whey" contra
       "Açaí com Whey": perto demais para ignorar, longe demais para o
       motor casar sozinho sem risco de errar. Em vez de decidir por conta
       própria, ele cria e avisa de quem desconfia. */
    absorver: function (itens) {
      const vazio = { criados: 0, novos: [], parecidos: 0 };
      if (!itens || !itens.length) return vazio;

      const candidatos = new Map();
      for (let i = 0; i < itens.length; i++) {
        const it = itens[i];
        if (it._prod) continue;                                  /* já casou */
        const nome = String(it._nome || '').trim();
        const sku = String(it._sku || '').trim();
        if (!nome && !sku) continue;                             /* sem nome e sem código não dá */
        const chave = MI.slug(nome || sku) + '|' + MI.slug(it._tamanho || '');
        let c = candidatos.get(chave);
        if (!c) {
          c = { nome: nome || sku, sku: sku, tamanho: it._tamanho || '', categoria: '', precos: [], vistos: 0 };
          candidatos.set(chave, c);
        }
        c.vistos++;
        if (!c.categoria && it._catBruta) c.categoria = String(it._catBruta).trim();
        if (!c.sku && sku) c.sku = sku;
        const unit = (it._valorUnit != null && isFinite(it._valorUnit) && it._valorUnit > 0)
          ? it._valorUnit
          : (it._valor != null && it._qtd ? it._valor / it._qtd : null);
        if (unit != null && isFinite(unit) && unit > 0) c.precos.push(unit);
      }
      if (!candidatos.size) return vazio;

      const existentes = {};
      C.items.forEach(function (p) { existentes[p.id] = true; });

      const novos = [];
      let parecidos = 0;
      candidatos.forEach(function (c) {
        const id = 'auto-' + MI.slug(c.nome) + (c.tamanho ? '-' + MI.slug(c.tamanho) : '');
        if (existentes[id]) return;
        const perto = C.maisParecido(c.nome);
        if (perto) parecidos++;
        novos.push({
          id: id,
          sku: c.sku,
          nome: c.nome,
          categoria: c.categoria || 'Não classificado',
          subcategoria: '',
          tamanho: c.tamanho,
          /* mediana, não média: um troco ou uma promoção isolada não deve
             virar o preço de tabela do produto */
          preco: mediana(c.precos),
          proteina: null,
          kcal: null,
          ingredientes: '',
          alergenicos: '',
          tags: '',
          descricao: '',
          imagem: null,
          disponivel: true,
          regiao: '',
          origem: 'auto',
          conferido: false,
          vistos: c.vistos,
          parecidoCom: perto ? perto.produto.nome + (perto.produto.tamanho ? ' · ' + perto.produto.tamanho : '') : null,
          parecencaScore: perto ? perto.score : null,
          fonte: 'Detectado nas transações importadas'
        });
      });

      if (!novos.length) return vazio;
      C.items = C.items.concat(novos);
      C.reindex(); C.save(); C.emit();
      return { criados: novos.length, novos: novos, parecidos: parecidos };
    },

    /* Melhor semelhança abaixo do corte do match(): serve para avisar, não
       para casar. */
    maisParecido: function (nome) {
      const toks = new Set(MI.slug(nome).split('_').filter(Boolean));
      if (!toks.size) return null;
      let melhor = null, melhorScore = 0;
      C.items.forEach(function (p) {
        if (p.origem === 'auto') return;
        const pt = MI.slug(p.nome).split('_').filter(Boolean);
        if (!pt.length) return;
        let inter = 0;
        pt.forEach(function (t) { if (toks.has(t)) inter++; });
        const score = (2 * inter) / (pt.length + toks.size);
        if (score > melhorScore) { melhorScore = score; melhor = p; }
      });
      return melhor && melhorScore >= 0.45 ? { produto: melhor, score: melhorScore } : null;
    },

    detectados: function () {
      return C.items.filter(function (p) { return p.origem === 'auto' && !p.conferido; });
    },

    confirmar: function (id) { return C.update(id, { conferido: true }); },

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
        { k: 'alergenicos', label: 'Alergênicos' }, { k: 'proteina', label: 'Proteína (g)' },
        { k: 'kcal', label: 'Calorias (kcal)' },
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
    { key: 'proteina', label: 'Proteína (g)', match: /proteina|proteína|protein|prot_?g|gramas_?prot/ },
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
        proteina: get('proteina') != null ? MI.parseNumber(get('proteina')) : null,
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
