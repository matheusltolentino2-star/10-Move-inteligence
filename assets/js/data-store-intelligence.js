/* Indicadores de residência e de compra da base ativa. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const D = {};
  let cacheDemanda, cacheVendas;
  const identificador = v => v == null || String(v).trim() === '' ? '' : String(v).trim();
  const presente = v => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v));
  const consumo = v => presente(v) ? Number(v) : null;
  const campoCliente = () => MI.store.dataset?.roles.id;

  function posicao(row) {
    const lat = row.latitude ?? row.lat, lng = row.longitude ?? row.lng ?? row.lon;
    return presente(lat) && presente(lng) && +lat >= -34 && +lat <= 6 && +lng >= -74 && +lng <= -32
      ? [+lat, +lng] : null;
  }

  function local(row) {
    const nomes = [row.distrito, row._bairro].filter(Boolean);
    return nomes.filter((nome, i) => !i || MI.slug(nome) !== MI.slug(nomes[0])).join(' · ') || row._cidade;
  }

  function zona(row, nivel) {
    if (nivel === 'brasil') {
      return row._uf ? { key:row._uf, label:MI.UF_NOMES?.[row._uf] || row._uf } : null;
    }
    if (nivel === 'uf') {
      return row._cidade ? { key:MI.slug(row._cidade), label:row._cidade } : null;
    }
    const label = local(row);
    const key = row.home_territory_id || (label && MI.slug([row._uf, row._cidade, label].filter(Boolean).join(' ')));
    return key ? { key, label } : null;
  }

  function clientes(rows, fn) {
    const campo = campoCliente(), vistos = new Set();
    for (const row of rows) {
      const id = campo ? identificador(row[campo]) : '';
      if (id) {
        if (vistos.has(id)) continue;
        vistos.add(id);
      }
      fn(row, id);
    }
  }

  D.visivel = count => count === 0 || count >= MI.privacy.k;
  D.valores = () => MI.privacy.podeVerLinhas() && !MI.privacy.masking();

  D.demanda = function (ctx, analysis) {
    if (!D.valores() || !analysis?.disponivel) return null;
    const data = MI.store.dataset;
    if (cacheDemanda?.data === data && cacheDemanda.rows === ctx.rows && cacheDemanda.analysis === analysis &&
        cacheDemanda.nivel === ctx.nivel) return cacheDemanda.result;

    const result = { total:0, dentro:0, fora:0, multipla:0, ausentes:0, zonas:[],
      identificados:!!campoCliente(), temConsumo:false, receitaFora:null, pedidosFora:null, ticketFora:null };
    const grupos = new Map(), classes = new Map();
    const centros = new Map((MI.fullData?.active?.geo || []).map(r => [r.territory_id, posicao(r)]));
    clientes(ctx.rows, (row, id) => {
      result.total++;
      if (!id) result.identificados = false;
      const p = posicao(row);
      if (!p) { result.ausentes++; return; }
      const cod = p.join(',');
      if (!classes.has(cod)) classes.set(cod, MI.storeCoverage.classe(analysis, p));
      const n = classes.get(cod);
      if (n) result.dentro++;
      else result.fora++;
      if (n > 1) result.multipla++;

      const ref = zona(row, ctx.nivel);
      let g;
      if (ref) {
        g = grupos.get(ref.key);
        if (!g) {
          g = { ...ref, ref:centros.get(ref.key) || null, clientes:0, dentro:0, fora:0, multipla:0,
            pedidos:null, receita:null, recorrentesFora:0, pedidosFora:null, receitaFora:null };
          grupos.set(ref.key, g);
        }
        g.clientes++;
        if (n) g.dentro++;
        else g.fora++;
        if (n > 1) g.multipla++;
      }
      const receita = consumo(row._receita), pedidos = consumo(row._freq);
      if (g) {
        if (receita != null) g.receita = (g.receita ?? 0) + receita;
        if (pedidos != null) g.pedidos = (g.pedidos ?? 0) + pedidos;
      }
      if (n) return;
      if (receita != null) {
        result.receitaFora = (result.receitaFora ?? 0) + receita;
        if (g) g.receitaFora = (g.receitaFora ?? 0) + receita;
      }
      if (pedidos != null) {
        result.pedidosFora = (result.pedidosFora ?? 0) + pedidos;
        if (g) g.pedidosFora = (g.pedidosFora ?? 0) + pedidos;
      }
      if (g && pedidos >= 2) g.recorrentesFora++;
    });
    result.temConsumo = result.receitaFora != null || result.pedidosFora != null;
    if (result.receitaFora != null && result.pedidosFora) result.ticketFora = result.receitaFora / result.pedidosFora;
    result.zonas = Array.from(grupos.values(), g => ({
      ...g, ticketFora:g.receitaFora != null && g.pedidosFora ? g.receitaFora / g.pedidosFora : null
    })).sort((a, b) => b.fora - a.fora || b.clientes - a.clientes);
    cacheDemanda = { data, rows:ctx.rows, analysis, nivel:ctx.nivel, result };
    return result;
  };

  D.residentes = function (ctx, unidade, raioM) {
    if (!D.valores()) return null;
    const C = MI.storeCoverage, centro = C.coordenadas(unidade);
    if (!centro || !C.elegivel(unidade)) return null;
    const raio = C.raio(unidade, raioM);
    let total = 0, comPosicao = 0, identificados = !!campoCliente();
    clientes(ctx.rows, (row, id) => {
      const p = posicao(row);
      if (!p) return;
      comPosicao++;
      if (!id) identificados = false;
      if (C.distancia(centro, p) <= raio) total++;
    });
    return comPosicao ? { total, identificados, comparaveis:comPosicao } : null;
  };

  D.regiao = function (ctx, analysis, key) {
    const ids = new Set();
    if (!D.valores() || !campoCliente() || !analysis?.disponivel) return ids;
    clientes(ctx.rows, (row, id) => {
      if (!id || zona(row, ctx.nivel)?.key !== key) return;
      const p = posicao(row);
      if (p && MI.storeCoverage.classe(analysis, p) === 0) ids.add(id);
    });
    return D.visivel(ids.size) ? ids : new Set();
  };

  function adicionar(mapa, label, qtd, cliente) {
    if (label == null || label === '') return;
    let v = mapa.get(label);
    if (!v) { v = { label, quantity:0, clientes:new Set() }; mapa.set(label, v); }
    v.quantity += qtd;
    if (cliente) v.clientes.add(cliente);
  }

  function principais(mapa) {
    return Array.from(mapa.values()).filter(v => v.clientes.size && D.visivel(v.clientes.size))
      .sort((a,b) => b.quantity - a.quantity).slice(0, 4).map(({label, quantity}) => ({label, quantity}));
  }

  D.vendas = function ({ unit, customers, cacheKey, demand } = {}) {
    if (!D.valores() || !MI.tx.has() || MI.tx.isDemo() || customers?.size === 0) return null;
    const itens = MI.tx.filtered(), data = MI.store.dataset, k = MI.privacy.k;
    const chaveCache = unit || cacheKey || customers;
    if (cacheVendas?.itens === itens && cacheVendas.data === data && cacheVendas.key === chaveCache &&
        cacheVendas.demand === demand && cacheVendas.k === k) return cacheVendas.result;

    const compradores = new Set(), ordens = new Set();
    const produtos = new Map(), horarios = new Map(), lojas = new Map();
    const chaveUnidade = unit && MI.unidades.chaveDe(unit.chave || unit.nome);
    let centavos = 0, comValor = false, units = 0, lines = 0;
    for (const item of itens) {
      if (unit && (item._unidadeId ? item._unidadeId !== unit.id : MI.unidades.chaveDe(item._unidade) !== chaveUnidade)) continue;
      const id = identificador(item._cliente);
      if (customers && !customers.has(id)) continue;
      lines++;
      if (id) compradores.add(id);
      const quantidade = item._qtd ?? 1;
      units += quantidade;
      if (presente(item._valor)) { centavos += Math.round(item._valor * 100); comValor = true; }
      adicionar(produtos, item._prod?.nome || item._nome || item._sku, quantidade, id);
      if (!item._pedido || ordens.has(item._pedido)) continue;
      ordens.add(item._pedido);
      adicionar(horarios, item._hora, 1, id);
      adicionar(lojas, item._unidade, 1, id);
    }
    if (!lines || (compradores.size > 0 && !D.visivel(compradores.size))) return null;
    const pedidos = ordens.size || null, receita = comValor ? centavos / 100 : null;
    const result = { compradores:compradores.size || null, pedidos, receita, units, lines,
      ticket:receita != null && pedidos ? receita / pedidos : null,
      frequencia:pedidos && compradores.size ? pedidos / compradores.size : null,
      produtos:principais(produtos), horarios:principais(horarios), lojas:principais(lojas) };
    cacheVendas = { itens, data, key:chaveCache, demand, k, result };
    return result;
  };

  MI.store.on('dataset', () => { cacheDemanda = cacheVendas = null; });
  MI.tx.on(() => { cacheVendas = null; });
  MI.storeIntelligence = D;
})(window.MI);
