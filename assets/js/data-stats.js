/* 10 Move Intelligence — camada estatística
   Todas as agregações usadas pelos dashboards. Nada aqui inventa dados:
   quando um campo não existe na base, a função devolve null. */
window.MI = window.MI || {};

(function (MI) {
  'use strict';

  const S = {};

  /* ---------------- Distribuição categórica ---------------- */
  S.dist = function (rows, field, opts) {
    opts = opts || {};
    const m = MI.countBy(rows, field);
    let arr = MI.mapToSorted(m);
    if (opts.order) {
      const idx = {};
      opts.order.forEach(function (l, i) { idx[l] = i; });
      arr.sort(function (a, b) {
        const ia = idx[a.label] == null ? 999 : idx[a.label];
        const ib = idx[b.label] == null ? 999 : idx[b.label];
        return ia - ib;
      });
    }
    const total = MI.sum(arr, function (e) { return e.value; });
    if (opts.limit && arr.length > opts.limit) {
      const head = arr.slice(0, opts.limit);
      const restVal = MI.sum(arr.slice(opts.limit), function (e) { return e.value; });
      if (restVal > 0 && opts.other !== false) head.push({ label: 'Outros', value: restVal, isOther: true });
      arr = head;
    }
    arr.forEach(function (e) { e.pct = total ? e.value / total : 0; });
    arr.total = total;
    arr.missing = rows.length - total;
    return arr;
  };

  /* ---------------- Estatística descritiva ---------------- */
  S.numStats = function (rows, field) {
    const v = [];
    for (let i = 0; i < rows.length; i++) {
      const x = rows[i][field];
      if (x != null && !isNaN(x)) v.push(x);
    }
    if (!v.length) return null;
    v.sort(function (a, b) { return a - b; });
    const n = v.length;
    const sum = MI.sum(v);
    const mean = sum / n;
    let varsum = 0;
    for (let i = 0; i < n; i++) varsum += (v[i] - mean) * (v[i] - mean);
    const q = function (p) {
      const idx = (n - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
      return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (idx - lo);
    };
    return {
      n: n, missing: rows.length - n, sum: sum, mean: mean,
      sd: Math.sqrt(varsum / Math.max(1, n - 1)),
      min: v[0], max: v[n - 1],
      p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9),
      cv: mean ? Math.sqrt(varsum / Math.max(1, n - 1)) / mean : null
    };
  };

  /* ---------------- Histograma ---------------- */
  S.histogram = function (rows, field, binCount) {
    const st = S.numStats(rows, field);
    if (!st) return null;
    const bins = binCount || 20;
    const lo = st.min, hi = st.max;
    const width = (hi - lo) / bins || 1;
    const out = [];
    for (let i = 0; i < bins; i++) out.push({ from: lo + i * width, to: lo + (i + 1) * width, value: 0 });
    for (let i = 0; i < rows.length; i++) {
      const x = rows[i][field];
      if (x == null || isNaN(x)) continue;
      let b = Math.floor((x - lo) / width);
      if (b >= bins) b = bins - 1;
      if (b < 0) b = 0;
      out[b].value++;
    }
    out.forEach(function (b) {
      b.label = Math.round(b.from) === Math.round(b.to) ? String(Math.round(b.from))
        : MI.fmt.int(Math.round(b.from)) + '–' + MI.fmt.int(Math.round(b.to));
    });
    return out;
  };

  /* ---------------- Idade por ano (curva fina) ---------------- */
  S.ageCurve = function (rows) {
    const m = new Map();
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i]._idade;
      if (a == null) continue;
      const k = Math.round(a);
      m.set(k, (m.get(k) || 0) + 1);
    }
    const keys = Array.from(m.keys()).sort(function (a, b) { return a - b; });
    if (!keys.length) return null;
    const out = [];
    for (let a = keys[0]; a <= keys[keys.length - 1]; a++) out.push({ label: String(a), value: m.get(a) || 0, idade: a });
    return out;
  };

  /* ---------------- Tabela cruzada ---------------- */
  S.crosstab = function (rows, fieldA, fieldB, opts) {
    opts = opts || {};
    const limA = opts.limitA || 12, limB = opts.limitB || 10;
    const topA = S.dist(rows, fieldA, { limit: limA, other: false }).map(function (e) { return e.label; });
    const topB = S.dist(rows, fieldB, { limit: limB, other: false }).map(function (e) { return e.label; });
    const ia = {}, ib = {};
    topA.forEach(function (l, i) { ia[l] = i; });
    topB.forEach(function (l, i) { ib[l] = i; });
    const matrix = topA.map(function () { return new Array(topB.length).fill(0); });
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
      const a = ia[rows[i][fieldA]], b = ib[rows[i][fieldB]];
      if (a == null || b == null) continue;
      matrix[a][b]++; total++;
    }
    const rowTotals = matrix.map(function (r) { return MI.sum(r); });
    const colTotals = topB.map(function (_, j) { return MI.sum(matrix, function (r) { return r[j]; }); });
    return { rowLabels: topA, colLabels: topB, matrix: matrix, rowTotals: rowTotals, colTotals: colTotals, total: total };
  };

  /* Qui-quadrado de independência — mede se o cruzamento é informativo */
  S.chiSquare = function (ct) {
    if (!ct || !ct.total) return null;
    let chi = 0, cells = 0, minExp = Infinity;
    for (let i = 0; i < ct.matrix.length; i++) {
      for (let j = 0; j < ct.matrix[i].length; j++) {
        const exp = (ct.rowTotals[i] * ct.colTotals[j]) / ct.total;
        if (exp <= 0) continue;
        if (exp < minExp) minExp = exp;
        chi += Math.pow(ct.matrix[i][j] - exp, 2) / exp;
        cells++;
      }
    }
    const df = (ct.matrix.length - 1) * (ct.colLabels.length - 1);
    const cramerV = df > 0 ? Math.sqrt(chi / (ct.total * Math.min(ct.matrix.length - 1, ct.colLabels.length - 1))) : null;
    return { chi: chi, df: df, cells: cells, minExpected: minExp, cramerV: cramerV };
  };

  /* ---------------- Mapa de calor dia × hora ---------------- */
  S.dowHourHeatmap = function (rows) {
    const grid = [];
    for (let d = 0; d < 7; d++) grid.push(new Array(24).fill(0));
    let total = 0, max = 0;
    for (let i = 0; i < rows.length; i++) {
      const d = rows[i]._dow, h = rows[i]._hora;
      if (d == null || h == null) continue;
      grid[d][h]++; total++;
      if (grid[d][h] > max) max = grid[d][h];
    }
    if (!total) return null;
    return { grid: grid, total: total, max: max };
  };

  /* ---------------- Série temporal mensal ---------------- */
  S.monthly = function (rows, monthField, opts) {
    opts = opts || {};
    const m = new Map();
    for (let i = 0; i < rows.length; i++) {
      const k = rows[i][monthField];
      if (!k) continue;
      let e = m.get(k);
      if (!e) { e = { count: 0, sum: 0, sumN: 0 }; m.set(k, e); }
      e.count++;
      if (opts.sumField) {
        const v = rows[i][opts.sumField];
        if (v != null && !isNaN(v)) { e.sum += v; e.sumN++; }
      }
    }
    if (!m.size) return null;
    const keys = Array.from(m.keys()).sort();
    /* preenche meses faltantes para a linha não mentir sobre continuidade */
    const out = [];
    const first = keys[0].split('-'), last = keys[keys.length - 1].split('-');
    let y = +first[0], mo = +first[1];
    const endY = +last[0], endMo = +last[1];
    let guard = 0;
    while ((y < endY || (y === endY && mo <= endMo)) && guard++ < 400) {
      const k = y + '-' + String(mo).padStart(2, '0');
      const e = m.get(k);
      out.push({
        key: k, label: MI.fmt.monthLabel(k),
        value: e ? e.count : 0,
        sum: e ? e.sum : 0,
        mean: e && e.sumN ? e.sum / e.sumN : null
      });
      mo++; if (mo > 12) { mo = 1; y++; }
    }
    if (opts.tail && out.length > opts.tail) return out.slice(-opts.tail);
    return out;
  };

  /* ---------------- Clientes únicos ---------------- */
  S.uniqueCount = function (rows, idKey) {
    if (!idKey) return null;
    const s = new Set();
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][idKey];
      if (v == null || v === '') continue;
      s.add(v);
    }
    return s.size;
  };

  /* ---------------- Correlação de Pearson ---------------- */
  S.correlation = function (rows, f1, f2) {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < rows.length; i++) {
      const x = rows[i][f1], y = rows[i][f2];
      if (x == null || y == null || isNaN(x) || isNaN(y)) continue;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    if (n < 30) return null;
    const num = n * sxy - sx * sy;
    const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    if (!den) return null;
    return { r: num / den, n: n };
  };

  /* ---------------- Média de uma métrica por categoria ---------------- */
  S.meanBy = function (rows, catField, numField, opts) {
    opts = opts || {};
    const m = new Map();
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i][catField], v = rows[i][numField];
      if (c == null || c === '' || v == null || isNaN(v)) continue;
      let e = m.get(c);
      if (!e) { e = { sum: 0, n: 0 }; m.set(c, e); }
      e.sum += v; e.n++;
    }
    let arr = Array.from(m, function (e) { return { label: e[0], value: e[1].sum / e[1].n, n: e[1].n, sum: e[1].sum }; });
    if (opts.minN) arr = arr.filter(function (e) { return e.n >= opts.minN; });
    arr.sort(function (a, b) { return opts.asc ? a.value - b.value : b.value - a.value; });
    if (opts.order) {
      const idx = {}; opts.order.forEach(function (l, i) { idx[l] = i; });
      arr.sort(function (a, b) { return (idx[a.label] == null ? 999 : idx[a.label]) - (idx[b.label] == null ? 999 : idx[b.label]); });
    }
    return opts.limit ? arr.slice(0, opts.limit) : arr;
  };

  /* ---------------- Índice de afinidade (segmento vs. base) ----------------
     100 = igual à base. 140 = 40% mais concentrado no segmento. */
  S.affinity = function (segRows, baseRows, field, opts) {
    opts = opts || {};
    const seg = MI.countBy(segRows, field), base = MI.countBy(baseRows, field);
    const segTotal = MI.sum(Array.from(seg.values()));
    const baseTotal = MI.sum(Array.from(base.values()));
    if (!segTotal || !baseTotal) return [];
    const out = [];
    base.forEach(function (bc, label) {
      const sc = seg.get(label) || 0;
      if (sc < (opts.minCount || 20)) return;
      const segShare = sc / segTotal, baseShare = bc / baseTotal;
      if (!baseShare) return;
      out.push({
        label: label, index: (segShare / baseShare) * 100,
        segCount: sc, baseCount: bc, segShare: segShare, baseShare: baseShare
      });
    });
    out.sort(function (a, b) { return b.index - a.index; });
    return out;
  };

  /* ---------------- Segmentação RFM simplificada ----------------
     Só roda se existirem recência e frequência; valor é opcional. */
  S.rfm = function (rows) {
    const st = MI.store;
    if (!st.has('_recencia') || !st.has('_freq')) return null;
    const rec = [], fre = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]._recencia != null) rec.push(rows[i]._recencia);
      if (rows[i]._freq != null) fre.push(rows[i]._freq);
    }
    if (rec.length < 50 || fre.length < 50) return null;
    rec.sort(function (a, b) { return a - b; });
    fre.sort(function (a, b) { return a - b; });
    const qr = function (arr, p) { return arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]; };
    const r33 = qr(rec, 0.33), r66 = qr(rec, 0.66);
    const f33 = qr(fre, 0.33), f66 = qr(fre, 0.66);

    const buckets = {
      'Campeões': { desc: 'Ativos recentes e de alta frequência', rows: [] },
      'Fiéis': { desc: 'Frequência alta, recência intermediária', rows: [] },
      'Promissores': { desc: 'Recentes, frequência ainda baixa', rows: [] },
      'Em risco': { desc: 'Eram frequentes, sumiram', rows: [] },
      'Hibernando': { desc: 'Baixa recência e baixa frequência', rows: [] },
      'Ocasionais': { desc: 'Uso intermediário em ambos os eixos', rows: [] }
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]._recencia, f = rows[i]._freq;
      if (r == null || f == null) continue;
      const rScore = r <= r33 ? 3 : r <= r66 ? 2 : 1;      // menor recência = melhor
      const fScore = f >= f66 ? 3 : f >= f33 ? 2 : 1;
      let name;
      if (rScore === 3 && fScore === 3) name = 'Campeões';
      else if (fScore === 3 && rScore === 2) name = 'Fiéis';
      else if (rScore === 3 && fScore <= 2) name = 'Promissores';
      else if (rScore === 1 && fScore >= 2) name = 'Em risco';
      else if (rScore === 1 && fScore === 1) name = 'Hibernando';
      else name = 'Ocasionais';
      buckets[name].rows.push(rows[i]);
    }
    const total = MI.sum(Object.keys(buckets), function (k) { return buckets[k].rows.length; });
    const out = Object.keys(buckets).map(function (k) {
      const b = buckets[k];
      const valor = st.has('_valor') ? S.numStats(b.rows, '_valor') : null;
      const receita = st.has('_receita') ? S.numStats(b.rows, '_receita') : null;
      return {
        label: k, desc: b.desc, count: b.rows.length,
        pct: total ? b.rows.length / total : 0,
        ticket: valor ? valor.mean : null,
        receita: receita ? receita.sum : null,
        idade: S.numStats(b.rows, '_idade'),
        rows: b.rows
      };
    });
    out.sort(function (a, b) { return b.count - a.count; });
    out.cuts = { r33: r33, r66: r66, f33: f33, f66: f66 };
    out.total = total;
    return out;
  };

  /* ---------------- Concentração (curva de Pareto / HHI) ---------------- */
  S.concentration = function (rows, field) {
    const d = S.dist(rows, field, {});
    if (!d.length || !d.total) return null;
    let acc = 0, n80 = 0;
    const curve = d.map(function (e, i) {
      acc += e.value;
      const share = acc / d.total;
      if (n80 === 0 && share >= 0.8) n80 = i + 1;
      return { label: e.label, value: e.value, cum: share };
    });
    let hhi = 0;
    d.forEach(function (e) { const s = e.value / d.total; hhi += s * s; });
    return {
      curve: curve, categories: d.length, n80: n80 || d.length,
      hhi: hhi, top1: d[0] ? d[0].value / d.total : 0,
      top5: MI.sum(d.slice(0, 5), function (e) { return e.value; }) / d.total,
      top10: MI.sum(d.slice(0, 10), function (e) { return e.value; }) / d.total
    };
  };

  /* ---------------- Descobertas automáticas ----------------
     Cada item é um FATO calculado sobre a base ativa (nunca hipótese). */
  S.findings = function (rows) {
    const st = MI.store, f = [];
    const n = rows.length;
    if (!n) return f;

    if (st.has('_idade')) {
      const s = S.numStats(rows, '_idade');
      const faixa = S.dist(rows, '_faixa', { order: MI.AGE_BANDS.map(function (b) { return b.label; }) });
      const topFaixa = faixa.slice().sort(function (a, b) { return b.value - a.value; })[0];
      f.push({
        kind: 'fato', tema: 'Demografia',
        titulo: 'Idade mediana de ' + MI.fmt.dec(s.median, 1) + ' anos',
        texto: 'A faixa ' + topFaixa.label + ' concentra ' + MI.fmt.pct(topFaixa.pct, 1) +
          ' da base (' + MI.fmt.int(topFaixa.value) + ' registros). Metade da base está entre ' +
          MI.fmt.int(s.p25) + ' e ' + MI.fmt.int(s.p75) + ' anos.'
      });
    }
    if (st.has('_genero')) {
      const g = S.dist(rows, '_genero', { limit: 6 });
      if (g.length >= 2) {
        const diff = Math.abs(g[0].pct - g[1].pct);
        f.push({
          kind: 'fato', tema: 'Demografia',
          titulo: g[0].label + ' é ' + MI.fmt.pct(g[0].pct, 1) + ' da base',
          texto: diff < 0.06
            ? 'A distribuição por gênero é praticamente equilibrada (diferença de ' + MI.fmt.pct(diff, 1) + ' entre os dois maiores grupos).'
            : 'Diferença de ' + MI.fmt.pct(diff, 1) + ' em relação a ' + g[1].label + ' (' + MI.fmt.pct(g[1].pct, 1) + ').'
        });
      }
    }
    if (st.has('_uf')) {
      const c = S.concentration(rows, '_uf');
      const d = S.dist(rows, '_uf', { limit: 5, other: false });
      if (c && d.length) {
        f.push({
          kind: 'fato', tema: 'Geografia',
          titulo: d[0].label + ' responde por ' + MI.fmt.pct(d[0].pct, 1) + ' dos registros',
          texto: 'Os 5 maiores estados somam ' + MI.fmt.pct(c.top5, 1) + ' da base, distribuída em ' +
            c.categories + ' estados. ' + c.n80 + ' estados bastam para cobrir 80% dos registros.'
        });
      }
    }
    if (st.has('_cidade')) {
      const d = S.dist(rows, '_cidade', { limit: 3, other: false });
      if (d.length) {
        f.push({
          kind: 'fato', tema: 'Geografia',
          titulo: 'Maior cidade: ' + d[0].label + ' (' + MI.fmt.pct(d[0].pct, 1) + ')',
          texto: 'As três principais cidades (' + d.map(function (e) { return e.label; }).join(', ') +
            ') concentram ' + MI.fmt.pct(MI.sum(d, function (e) { return e.pct; }), 1) + ' da base.'
        });
      }
    }
    if (st.has('_hora')) {
      const hs = S.dist(rows, '_hora', {});
      const arr = hs.slice().sort(function (a, b) { return b.value - a.value; });
      if (arr.length) {
        let manha = 0, tarde = 0, noite = 0, madrugada = 0;
        hs.forEach(function (e) {
          const h = +e.label;
          if (h >= 6 && h < 12) manha += e.value;
          else if (h >= 12 && h < 18) tarde += e.value;
          else if (h >= 18 && h < 24) noite += e.value;
          else madrugada += e.value;
        });
        const tot = manha + tarde + noite + madrugada;
        f.push({
          kind: 'fato', tema: 'Comportamento',
          titulo: 'Pico de uso às ' + MI.fmt.hour(arr[0].label),
          texto: 'Manhã ' + MI.fmt.pctOf(manha, tot, 0) + ' · tarde ' + MI.fmt.pctOf(tarde, tot, 0) +
            ' · noite ' + MI.fmt.pctOf(noite, tot, 0) + ' · madrugada ' + MI.fmt.pctOf(madrugada, tot, 0) + '.'
        });
      }
    }
    if (st.has('_dow')) {
      const d = S.dist(rows, '_dow', {});
      let semana = 0, fim = 0;
      d.forEach(function (e) { if (+e.label === 0 || +e.label === 6) fim += e.value; else semana += e.value; });
      const tot = semana + fim;
      if (tot) {
        const fimDiario = fim / 2, semanaDiario = semana / 5;
        f.push({
          kind: 'fato', tema: 'Comportamento',
          titulo: fimDiario > semanaDiario ? 'Concentração no fim de semana' : 'Concentração em dias úteis',
          texto: 'Dias úteis somam ' + MI.fmt.pctOf(semana, tot, 0) + ' do volume; o fim de semana, ' +
            MI.fmt.pctOf(fim, tot, 0) + '. Por dia, a média é ' + MI.fmt.int(semanaDiario) +
            ' em dia útil contra ' + MI.fmt.int(fimDiario) + ' no fim de semana.'
        });
      }
    }
    if (st.has('_status')) {
      const d = S.dist(rows, '_status', { limit: 8 });
      if (d.length) {
        f.push({
          kind: 'fato', tema: 'Base',
          titulo: 'Status predominante: ' + d[0].label + ' (' + MI.fmt.pct(d[0].pct, 1) + ')',
          texto: d.map(function (e) { return e.label + ' ' + MI.fmt.pct(e.pct, 0); }).join(' · ') + '.'
        });
      }
    }
    if (st.has('_valor')) {
      const s = S.numStats(rows, '_valor');
      f.push({
        kind: 'fato', tema: 'Negócio',
        titulo: 'Ticket médio de ' + MI.fmt.money(s.mean),
        texto: 'Mediana ' + MI.fmt.money(s.median) + '. Os 10% maiores estão acima de ' +
          MI.fmt.money(s.p90) + ' e os 10% menores abaixo de ' + MI.fmt.money(s.p10) +
          ' (coeficiente de variação ' + MI.fmt.pct(s.cv, 0) + ').'
      });
    }
    if (st.has('_recencia') && st.has('_freq')) {
      const c = S.correlation(rows, '_recencia', '_freq');
      if (c && Math.abs(c.r) > 0.12) {
        f.push({
          kind: 'fato', tema: 'Comportamento',
          titulo: 'Frequência e recência têm correlação de ' + MI.fmt.dec(c.r, 2),
          texto: (c.r < 0 ? 'Quanto maior a frequência, menor o tempo desde a última atividade. '
            : 'Quanto maior a frequência, maior o tempo desde a última atividade. ') +
            'Correlação de Pearson sobre ' + MI.fmt.int(c.n) + ' registros.'
        });
      }
    }
    if (st.has('_canal')) {
      const d = S.dist(rows, '_canal', { limit: 4, other: false });
      if (d.length) {
        f.push({
          kind: 'fato', tema: 'Aquisição',
          titulo: 'Principal canal: ' + d[0].label + ' (' + MI.fmt.pct(d[0].pct, 1) + ')',
          texto: 'Os quatro maiores canais respondem por ' +
            MI.fmt.pct(MI.sum(d, function (e) { return e.pct; }), 1) + ' das aquisições registradas.'
        });
      }
    }
    if (st.has('_cad')) {
      const m = S.monthly(rows, '_mesCad', { tail: 13 });
      if (m && m.length >= 7) {
        const ult6 = MI.sum(m.slice(-6), function (e) { return e.value; });
        const ant6 = MI.sum(m.slice(-12, -6), function (e) { return e.value; });
        if (ant6 > 0) {
          const var6 = (ult6 - ant6) / ant6;
          f.push({
            kind: 'fato', tema: 'Crescimento',
            titulo: 'Cadastros ' + (var6 >= 0 ? 'cresceram ' : 'caíram ') + MI.fmt.pct(Math.abs(var6), 1) + ' em 6 meses',
            texto: MI.fmt.int(ult6) + ' cadastros nos últimos 6 meses contra ' + MI.fmt.int(ant6) +
              ' nos 6 meses anteriores da base.'
          });
        }
      }
    }
    return f;
  };

  MI.stats = S;

})(window.MI);
