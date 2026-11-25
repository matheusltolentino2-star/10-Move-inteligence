/* 10 Move Intelligence — estatística de consumo sobre itens de pedido */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const X = {};

  /* Agrega por uma dimensão do item: contagem de itens, quantidade e receita */
  X.porDimensao = function (items, campo, opts) {
    opts = opts || {};
    const m = new Map();
    let totItens = 0, totQtd = 0, totValor = 0;
    for (let i = 0; i < items.length; i++) {
      const v = items[i][campo];
      if (v == null || v === '') continue;
      let e = m.get(v);
      if (!e) { e = { label: v, itens: 0, qtd: 0, valor: 0, clientes: null }; m.set(v, e); }
      e.itens++; totItens++;
      e.qtd += items[i]._qtd || 1; totQtd += items[i]._qtd || 1;
      if (items[i]._valor != null) { e.valor += items[i]._valor; totValor += items[i]._valor; }
    }
    let arr = Array.from(m.values());
    const chave = opts.por === 'valor' ? 'valor' : opts.por === 'itens' ? 'itens' : 'qtd';
    arr.sort(function (a, b) { return b[chave] - a[chave]; });
    arr.forEach(function (e) {
      e.value = e[chave];
      e.pctQtd = totQtd ? e.qtd / totQtd : 0;
      e.pctValor = totValor ? e.valor / totValor : 0;
      e.pct = opts.por === 'valor' ? e.pctValor : e.pctQtd;
      e.ticket = e.qtd ? e.valor / e.qtd : null;
    });
    if (opts.limit && arr.length > opts.limit) {
      const head = arr.slice(0, opts.limit);
      const resto = arr.slice(opts.limit);
      if (opts.other !== false && resto.length) {
        head.push({
          label: 'Outros', isOther: true,
          itens: MI.sum(resto, function (e) { return e.itens; }),
          qtd: MI.sum(resto, function (e) { return e.qtd; }),
          valor: MI.sum(resto, function (e) { return e.valor; }),
          value: MI.sum(resto, function (e) { return e[chave]; }),
          pct: MI.sum(resto, function (e) { return e.pct; })
        });
      }
      arr = head;
    }
    arr.totalItens = totItens; arr.totalQtd = totQtd; arr.totalValor = totValor;
    arr.total = chave === 'valor' ? totValor : chave === 'itens' ? totItens : totQtd;
    return arr;
  };

  /* Produtos mais vendidos (usa o nome casado com o catálogo quando existe) */
  X.topProdutos = function (items, limite, por) {
    const m = new Map();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const nome = it._prod ? it._prod.nome : it._nome;
      if (!nome) continue;
      const chave = nome + (it._prod && it._prod.tamanho ? ' · ' + it._prod.tamanho : (it._tamanho ? ' · ' + it._tamanho : ''));
      let e = m.get(chave);
      if (!e) {
        e = {
          label: chave, nome: nome, categoria: it._cat || '—',
          itens: 0, qtd: 0, valor: 0, prod: it._prod || null, casado: !!it._prod
        };
        m.set(chave, e);
      }
      e.itens++; e.qtd += it._qtd || 1;
      if (it._valor != null) e.valor += it._valor;
    }
    const arr = Array.from(m.values());
    const chave = por === 'valor' ? 'valor' : 'qtd';
    arr.sort(function (a, b) { return b[chave] - a[chave]; });
    const totQtd = MI.sum(arr, function (e) { return e.qtd; });
    const totValor = MI.sum(arr, function (e) { return e.valor; });
    arr.forEach(function (e) {
      e.value = e[chave];
      e.pct = chave === 'valor' ? (totValor ? e.valor / totValor : 0) : (totQtd ? e.qtd / totQtd : 0);
      e.ticket = e.qtd ? e.valor / e.qtd : null;
    });
    arr.totalQtd = totQtd; arr.totalValor = totValor; arr.distintos = m.size;
    return limite ? arr.slice(0, limite) : arr;
  };

  /* Matriz categoria × faixa horária */
  X.FAIXAS_HORA = [
    { label: 'Madrugada', de: 0, ate: 5 }, { label: 'Manhã', de: 6, ate: 11 },
    { label: 'Almoço', de: 12, ate: 14 }, { label: 'Tarde', de: 15, ate: 18 },
    { label: 'Noite', de: 19, ate: 23 }
  ];
  X.faixaHora = function (h) {
    if (h == null) return null;
    for (let i = 0; i < X.FAIXAS_HORA.length; i++) {
      if (h >= X.FAIXAS_HORA[i].de && h <= X.FAIXAS_HORA[i].ate) return X.FAIXAS_HORA[i].label;
    }
    return null;
  };

  /* Tabela cruzada genérica sobre itens, com métrica configurável */
  X.cruzamento = function (items, campoA, campoB, opts) {
    opts = opts || {};
    const metrica = opts.metrica || 'qtd';   // 'qtd' | 'valor' | 'itens'
    const dA = X.porDimensao(items, campoA, { limit: opts.limitA || 10, other: false });
    const dB = opts.ordemB
      ? opts.ordemB.map(function (l) { return { label: l }; })
      : X.porDimensao(items, campoB, { limit: opts.limitB || 8, other: false });
    const ia = {}, ib = {};
    dA.forEach(function (e, i) { ia[e.label] = i; });
    dB.forEach(function (e, i) { ib[e.label] = i; });
    const matrix = dA.map(function () { return new Array(dB.length).fill(0); });
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      const a = ia[items[i][campoA]];
      const b = ib[opts.valorB ? opts.valorB(items[i]) : items[i][campoB]];
      if (a == null || b == null) continue;
      const v = metrica === 'valor' ? (items[i]._valor || 0) : metrica === 'itens' ? 1 : (items[i]._qtd || 1);
      matrix[a][b] += v; total += v;
    }
    const rowTotals = matrix.map(function (r) { return MI.sum(r); });
    const colTotals = dB.map(function (_, j) { return MI.sum(matrix, function (r) { return r[j]; }); });
    return {
      rowLabels: dA.map(function (e) { return e.label; }),
      colLabels: dB.map(function (e) { return e.label; }),
      matrix: matrix, rowTotals: rowTotals, colTotals: colTotals, total: total, metrica: metrica
    };
  };

  /* Índice de afinidade: participação da categoria dentro do segmento
     comparada à participação na base inteira. 100 = igual. */
  X.afinidade = function (itensSegmento, itensBase, campo, opts) {
    opts = opts || {};
    const seg = X.porDimensao(itensSegmento, campo, {});
    const base = X.porDimensao(itensBase, campo, {});
    const bMap = new Map(base.map(e => [e.label, e]));
    return indicesAfinidade(seg, seg.totalQtd, bMap, base.totalQtd, opts.minQtd || 30);
  };

  function indicesAfinidade(segmento, totalSegmento, base, totalBase, minQtd) {
    const out = [];
    segmento.forEach(function (e) {
      const b = base.get(e.label);
      if (!b) return;
      if (e.qtd < minQtd) return;
      const segShare = totalSegmento ? e.qtd / totalSegmento : 0;
      const baseShare = totalBase ? b.qtd / totalBase : 0;
      if (!baseShare) return;
      out.push({
        label: e.label, index: (segShare / baseShare) * 100,
        segQtd: e.qtd, baseQtd: b.qtd, segShare: segShare, baseShare: baseShare,
        ticket: e.qtd ? e.valor / e.qtd : null
      });
    });
    out.sort(function (a, b) { return b.index - a.index; });
    return out;
  }

  X.afinidadePorGrupo = function (items, por, campo, minItens, minQtd) {
    const grupos = new Map();
    const base = new Map(X.porDimensao(items, campo).map(e => [e.label, e]));
    const totalBase = MI.sum(Array.from(base.values()), e => e.qtd);
    for (const item of items) {
      const chave = item[por], label = item[campo], qtd = item._qtd || 1;
      let grupo = grupos.get(chave);
      if (!grupo) {
        grupo = {itens:0, qtd:0, categorias:new Map()};
        grupos.set(chave, grupo);
      }
      grupo.itens++;
      grupo.qtd += qtd;
      let categoria = grupo.categorias.get(label);
      if (!categoria) {
        categoria = {label, qtd:0, valor:0};
        grupo.categorias.set(label, categoria);
      }
      categoria.qtd += qtd;
      categoria.valor += item._valor ?? 0;
    }
    const resultado = new Map();
    for (const [chave, grupo] of grupos) {
      if (grupo.itens < minItens) continue;
      const categorias = Array.from(grupo.categorias.values()).sort((a,b)=>b.qtd-a.qtd);
      resultado.set(chave, {itens:grupo.itens, afinidade:indicesAfinidade(categorias, grupo.qtd, base, totalBase, minQtd)});
    }
    return resultado;
  };

  /* Agregação por pedido: ticket e número de itens */
  X.resumoPedidosDoLote = function (items, totalPedidos) {
    const vistos = new Uint8Array(totalPedidos + 1);
    const porPedido = new Float64Array(totalPedidos + 1);
    let pedidos = 0;
    for (const item of items) {
      const indice = item._pedidoIndice;
      if (!vistos[indice]) {
        vistos[indice] = 1;
        pedidos++;
      }
      porPedido[indice] += item._valor ?? 0;
    }
    if (!pedidos) return null;
    const valores = new Float64Array(pedidos);
    let positivos = 0, receita = 0;
    for (const valor of porPedido) {
      receita += valor;
      if (valor > 0) valores[positivos++] = valor;
    }
    const tickets = valores.subarray(0, positivos).sort();
    const quantil = p => positivos ? tickets[Math.min(positivos - 1, Math.floor(positivos * p))] : null;
    return {
      pedidos, itensPorPedido: items.length / pedidos, receita,
      ticketMedio: positivos ? MI.sum(tickets) / positivos : null,
      ticketMediana: quantil(0.5), ticketP90: quantil(0.9)
    };
  };

  X.porPedido = function (items) {
    const m = new Map();
    for (let i = 0; i < items.length; i++) {
      const p = items[i]._pedido;
      if (!p) continue;
      let e = m.get(p);
      if (!e) { e = { itens: 0, qtd: 0, valor: 0, cliente: items[i]._cliente, data: items[i]._data, hora: items[i]._hora }; m.set(p, e); }
      e.itens++; e.qtd += items[i]._qtd || 1;
      if (items[i]._valor != null) e.valor += items[i]._valor;
    }
    if (!m.size) return null;
    const arr = Array.from(m.values());
    const valores = arr.map(function (e) { return e.valor; }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
    const q = function (p) { return valores.length ? valores[Math.min(valores.length - 1, Math.floor(valores.length * p))] : null; };
    return {
      pedidos: arr.length,
      itensPorPedido: MI.sum(arr, function (e) { return e.itens; }) / arr.length,
      ticketMedio: valores.length ? MI.sum(valores) / valores.length : null,
      ticketMediana: q(0.5), ticketP90: q(0.9),
      receita: MI.sum(arr, function (e) { return e.valor; }),
      lista: arr
    };
  };

  /* Recorrência: pedidos por cliente e taxa de recompra */
  X.recorrencia = function (items, totalPedidosDoLote) {
    const pedidosDoLote = totalPedidosDoLote ? new Uint8Array(totalPedidosDoLote + 1) : null;
    const porCliente = new Map();
    for (let i = 0; i < items.length; i++) {
      const c = items[i]._cliente;
      if (!c) continue;
      let e = porCliente.get(c);
      if (!e) {
        e = { pedidos: pedidosDoLote ? 0 : new Set(), valor: 0, primeira: null, ultima: null };
        porCliente.set(c, e);
      }
      if (pedidosDoLote) {
        const indice = items[i]._pedidoIndice;
        if (!pedidosDoLote[indice]) {
          pedidosDoLote[indice] = 1;
          e.pedidos++;
        }
      } else if (items[i]._pedido) {
        e.pedidos.add(items[i]._pedido);
      }
      if (items[i]._valor != null) e.valor += items[i]._valor;
      const d = items[i]._data;
      if (d) {
        if (!e.primeira || d < e.primeira) e.primeira = d;
        if (!e.ultima || d > e.ultima) e.ultima = d;
      }
    }
    if (!porCliente.size) return null;
    const faixas = [
      { label: '1 pedido', min: 1, max: 1 }, { label: '2 pedidos', min: 2, max: 2 },
      { label: '3 a 5', min: 3, max: 5 }, { label: '6 a 10', min: 6, max: 10 },
      { label: '11 a 20', min: 11, max: 20 }, { label: 'Mais de 20', min: 21, max: Infinity }
    ].map(function (f) { return { label: f.label, value: 0, min: f.min, max: f.max }; });

    let totalPedidos = 0, recompradores = 0, intervalos = [];
    porCliente.forEach(function (e) {
      const n = (pedidosDoLote ? e.pedidos : e.pedidos.size) || 1;
      totalPedidos += n;
      if (n > 1) {
        recompradores++;
        if (e.primeira && e.ultima) {
          const dias = (e.ultima - e.primeira) / 86400000;
          if (dias > 0) intervalos.push(dias / (n - 1));
        }
      }
      for (let i = 0; i < faixas.length; i++) {
        if (n >= faixas[i].min && n <= faixas[i].max) { faixas[i].value++; break; }
      }
    });
    const total = porCliente.size;
    faixas.forEach(function (f) { f.pct = total ? f.value / total : 0; });
    intervalos.sort(function (a, b) { return a - b; });
    return {
      clientes: total,
      pedidosPorCliente: totalPedidos / total,
      taxaRecompra: recompradores / total,
      faixas: faixas,
      intervaloMediano: intervalos.length ? intervalos[Math.floor(intervalos.length / 2)] : null,
      valorMedioPorCliente: MI.sum(Array.from(porCliente.values()), function (e) { return e.valor; }) / total
    };
  };

  /* Produtos comprados juntos: co-ocorrência no mesmo pedido.
     suporte = pedidos com o par / pedidos; lift = suporte / (pA * pB). */
  function cestasDoLote(items, totalPedidos, chave) {
    const primeiras = new Uint32Array(totalPedidos + 1);
    const seguintes = new Uint32Array(items.length + 1);
    const ordem = new Uint32Array(totalPedidos);
    let pedidos = 0;
    for (let i = items.length; i > 0; i--) {
      const item = items[i - 1], pedido = item._pedidoIndice;
      seguintes[i] = primeiras[pedido];
      primeiras[pedido] = i;
    }
    // As primeiras ocorrências preservam a ordem de desempate do leitor comum.
    for (let i = 0; i < items.length; i++) {
      const pedido = items[i]._pedidoIndice;
      if (primeiras[pedido] === i + 1) ordem[pedidos++] = pedido;
    }
    return function (visitar) {
      const produtos = new Set();
      for (let n = 0; n < pedidos; n++) {
        const pedido = ordem[n];
        for (let i = primeiras[pedido]; i; i = seguintes[i]) {
          const produto = chave(items[i - 1]);
          if (produto) produtos.add(produto);
        }
        if (produtos.size) visitar(produtos);
        produtos.clear();
      }
    };
  }

  X.cesta = function (items, opts) {
    opts = opts || {};
    const chave = opts.nivel === 'categoria' ? item => item._cat : item => item._prod ? item._prod.nome : item._nome;
    let visitarCestas;
    if (opts.totalPedidosDoLote) {
      visitarCestas = cestasDoLote(items, opts.totalPedidosDoLote, chave);
    } else {
      const porPedido = new Map();
      for (const item of items) {
        const pedido = item._pedido, produto = chave(item);
        if (!pedido || !produto) continue;
        let cesta = porPedido.get(pedido);
        if (!cesta) { cesta = new Set(); porPedido.set(pedido, cesta); }
        cesta.add(produto);
      }
      visitarCestas = visitar => porPedido.forEach(visitar);
    }

    const contagem = new Map();
    let nPedidos = 0;
    visitarCestas(function (s) {
      nPedidos++;
      for (const k of s) contagem.set(k, (contagem.get(k) || 0) + 1);
    });
    if (!nPedidos) return null;
    /* limita aos mais frequentes para o número de pares ficar tratável */
    const topo = MI.mapToSorted(contagem, opts.topN || 30).map(function (e) { return e.label; });
    const noTopo = new Set(topo);

    const pares = new Map();
    let pedidosMulti = 0;
    visitarCestas(function (s) {
      if (s.size < 2) return;
      const arr = Array.from(s).filter(function (k) { return noTopo.has(k); }).sort();
      if (arr.length < 2) return;
      pedidosMulti++;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const k = arr[i] + '\u0001' + arr[j];
          pares.set(k, (pares.get(k) || 0) + 1);
        }
      }
    });

    const out = [];
    pares.forEach(function (n, k) {
      if (n < (opts.minPedidos || 30)) return;
      const p = k.split('\u0001');
      const sA = contagem.get(p[0]) / nPedidos, sB = contagem.get(p[1]) / nPedidos;
      const sAB = n / nPedidos;
      out.push({
        a: p[0], b: p[1], pedidos: n, suporte: sAB,
        confiancaAB: contagem.get(p[0]) ? n / contagem.get(p[0]) : 0,
        confiancaBA: contagem.get(p[1]) ? n / contagem.get(p[1]) : 0,
        lift: (sA * sB) ? sAB / (sA * sB) : 0
      });
    });
    out.sort(function (a, b) { return b.lift - a.lift; });
    out.pedidos = nPedidos;
    out.pedidosMultiItem = pedidosMulti;
    return out;
  };

  /* Série mensal de itens e receita */
  X.mensal = function (items) {
    const m = new Map();
    for (let i = 0; i < items.length; i++) {
      const k = items[i]._mes;
      if (!k) continue;
      let e = m.get(k);
      if (!e) { e = { qtd: 0, valor: 0, itens: 0 }; m.set(k, e); }
      e.itens++; e.qtd += items[i]._qtd || 1;
      if (items[i]._valor != null) e.valor += items[i]._valor;
    }
    if (!m.size) return null;
    const keys = Array.from(m.keys()).sort();
    const out = [];
    const p0 = keys[0].split('-'), p1 = keys[keys.length - 1].split('-');
    let y = +p0[0], mo = +p0[1];
    let guard = 0;
    while ((y < +p1[0] || (y === +p1[0] && mo <= +p1[1])) && guard++ < 400) {
      const k = y + '-' + String(mo).padStart(2, '0');
      const e = m.get(k);
      out.push({ key: k, label: MI.fmt.monthLabel(k), qtd: e ? e.qtd : 0, valor: e ? e.valor : 0, itens: e ? e.itens : 0 });
      mo++; if (mo > 12) { mo = 1; y++; }
    }
    return out;
  };

  X.porPeriodo = function (items, period) {
    if (period === 'mes') return X.mensal(items);
    const dates = new Map(), totals = new Map();
    items.forEach(function (item) {
      const d = item._data;
      if (!d) return;
      let entry = dates.get(d);
      if (!entry) {
        const y = d.getFullYear(), m = d.getMonth();
        let key, label;
        if (period === 'semana') {
          const monday = new Date(y, m, d.getDate() - (d.getDay() + 6) % 7);
          key = MI.fmt.dateIso(monday);
          label = monday.toLocaleDateString('pt-BR');
        } else if (period === 'trimestre') {
          const quarter = Math.floor(m / 3) + 1;
          key = y + '-0' + quarter;
          label = 'T' + quarter + ' ' + y;
        } else {
          const index = m < 2 || m === 11 ? 3 : Math.floor((m - 2) / 3);
          const year = m < 2 ? y - 1 : y;
          key = year + '-0' + index;
          label = ['Outono','Inverno','Primavera','Verão'][index] + ' ' + year + (index === 3 ? '/' + (year + 1) : '');
        }
        entry = totals.get(key) || { key, label, qtd:0, valor:0, itens:0 };
        dates.set(d, entry); totals.set(key, entry);
      }
      entry.itens++;
      entry.qtd += item._qtd || 1;
      entry.valor += item._valor || 0;
    });
    return Array.from(totals.values()).sort((a,b)=>a.key.localeCompare(b.key));
  };

  /* Distribuição por hora (0..23) */
  X.porHora = function (items) {
    const h = new Array(24).fill(0), v = new Array(24).fill(0);
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      const x = items[i]._hora;
      if (x == null) continue;
      h[x] += items[i]._qtd || 1;
      if (items[i]._valor != null) v[x] += items[i]._valor;
      total += items[i]._qtd || 1;
    }
    if (!total) return null;
    return h.map(function (q, i) {
      return { label: MI.fmt.hour(i), hora: i, value: q, qtd: q, valor: v[i], pct: q / total };
    });
  };

  /* Mapa de calor dia × hora com base em quantidade vendida */
  X.heatDowHora = function (items) {
    const grid = [];
    for (let d = 0; d < 7; d++) grid.push(new Array(24).fill(0));
    let total = 0, max = 0;
    for (let i = 0; i < items.length; i++) {
      const d = items[i]._dow, h = items[i]._hora;
      if (d == null || h == null) continue;
      const q = items[i]._qtd || 1;
      grid[d][h] += q; total += q;
      if (grid[d][h] > max) max = grid[d][h];
    }
    if (!total) return null;
    return { grid: grid, total: total, max: max };
  };

  MI.txStats = X;

})(window.MI);
